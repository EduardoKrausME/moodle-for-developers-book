{% raw %}

# 6 MODERN INTERFACES AND THE OUTPUT API

A Moodle page can be functionally correct and still be badly built. It queries the right data, respects capabilities, saves without errors, and produces the expected result, but mixes HTML with PHP, scatters JavaScript throughout the file, duplicates strings, creates buttons manually, ignores the theme, and becomes almost impossible to reuse when a second similar screen appears. It is the kind of code that passes the first test and starts charging interest as soon as the plugin grows.

The Output API exists precisely to prevent the interface from becoming a collection of `echo` statements, HTML concatenation, and visual decisions mixed with business rules. Moodle separates data preparation from the way those data are presented, while templates, output classes, JavaScript, visual components, and the theme system work together so the same functionality remains maintainable when the layout changes, the theme is replaced, or part of the interface starts being updated without reloading the entire page.

In this chapter we will build that separation gradually. First we will understand the role of `$OUTPUT` and Mustache templates, then organize data in output classes, move into Moodle's modern JavaScript, and finish by connecting all of this to accessibility, CSS, themes, and dynamic components. The goal is not to memorize APIs, but to be able to look at a PHP page full of HTML and know exactly what needs to leave that file and where each responsibility should go.

## 6.1 Moodle Output API

The Output API is the layer that organizes Moodle interface generation. It sits between the data prepared by PHP code and the HTML that will ultimately be delivered to the browser, so when a plugin uses this API well it stops treating the page as a file that prints things and starts treating it as a composition of objects, templates, and presentation components.

That may sound like a vocabulary change, but in practice it changes maintenance considerably. Imagine an administration page that lists external integrations, shows status, last synchronization, and action buttons. A quick implementation can query the database and, inside the same `foreach`, build `<tr>`, `<td>`, `<a>`, and CSS classes. It works, but now the query knows about the HTML table, the rule that calculates the status knows the badge color, and the PHP code needs to know exactly how the button will be drawn. When someone asks for the same list inside a modal or on another page, duplication starts.

With the Output API, the query and the business rule produce data, an output class transforms those data into a structure suitable for presentation, and a template decides the HTML. JavaScript can complement the interaction without having to reimplement rendering from scratch, and a theme can still override templates when that makes sense. This separation is not architectural decoration; it is a way to reduce coupling between things that change for different reasons.

Current Moodle documentation still treats the Output API as the central point for renderers, renderables, templates, and theme integration, and in recent versions this layer has also gained new paths for integration with modern frontend technology, including React in Moodle 5.2, but the basic idea remains the same: data should not know unnecessary presentation details.

## 6.2 The `$OUTPUT` global

After Moodle bootstrap, `$OUTPUT` appears on practically every page that needs to generate an interface. It is a renderer connected to the page context and active theme, so it should not be understood as a simple object containing utility functions for printing HTML.

When you execute `echo $OUTPUT->header();`, for example, you are not merely asking for a static header. Moodle considers the page layout, theme, navigation, blocks, metadata, JavaScript requirements, and several other elements configured in `$PAGE`. The same applies to `footer()`, `heading()`, notifications, pix icons, and template rendering.

A minimal page usually looks something like this.

```php
require_once(__DIR__ . '/../../config.php');

require_login();

$url = new moodle_url('/local/catalogsync/index.php');
$PAGE->set_url($url);
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('pluginname', 'local_catalogsync'));
$PAGE->set_heading(get_string('pluginname', 'local_catalogsync'));

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('pluginname', 'local_catalogsync'));

echo $OUTPUT->footer();
```

The problem begins when someone concludes that, because `$OUTPUT` is available, every interface concern should become a direct call to it. `$OUTPUT` does not replace templates, should not receive business logic, and is not a reason to create a custom renderer for every page. It is one piece of the output layer and, on most modern screens, ends up being used for the page's general structure and for rendering templates or output objects.

## 6.3 `render_from_template()`

`render_from_template()` is one of the most useful functions when we want to stop writing HTML in PHP without creating more architecture than necessary. You provide the Frankenstyle name of the template and a simple data context, and Moodle returns the rendered HTML.

```php
$data = [
    'name' => $course->fullname,
    'status' => get_string('statusactive', 'local_catalogsync'),
];

echo $OUTPUT->render_from_template('local_catalogsync/course_status', $data);
```

The corresponding template lives in `templates/course_status.mustache`.

```mustache
<div class="local-catalogsync-course-status">
    <strong>{{name}}</strong>
    <span>{{status}}</span>
</div>
```

The benefit is not merely making PHP prettier. The HTML can now be read without navigating concatenations, the template can be overridden by a theme, the same context can be rendered elsewhere, and JavaScript can use the same template infrastructure when necessary.

There is a temptation to use `render_from_template()` for everything directly from the PHP page, and on small screens that may be perfectly acceptable. When context preparation starts to grow, however, with visibility rules, formatting, URLs, collections, and derived states, it is time to move that preparation to `classes/output/` instead of turning `index.php` into a factory for giant arrays.

## 6.4 Mustache in Moodle

Mustache is an intentionally simple template system. It was not designed to run queries, execute business rules, or become a parallel programming language inside HTML, and that limitation is an advantage because it forces the template to work mainly with presentation.

In Moodle, Mustache templates can be rendered on the server by PHP and also in the browser by JavaScript, which makes it easier to keep a single visual representation when part of the interface must be created or updated dynamically. The theme system can also override component templates, so choosing Mustache improves customization without requiring the plugin to know which theme is active.

If you are used to more powerful template engines, it may feel strange not to have a large number of expressions inside the template. The more useful question is different. If the template needs to calculate a complex rule to discover whether a button should appear, why was that calculation not done earlier? Normally the context should arrive prepared, with values such as `canedit`, `showwarning`, or `items`, leaving the template only to decide what to render based on those data.

## 6.5 `templates/*.mustache`

Plugin templates live in the `templates/` directory, and the name used in `render_from_template()` combines the component and file. If we have `local_catalogsync/templates/course_status.mustache`, the identifier will be `local_catalogsync/course_status`.

This convention matters because Moodle needs to locate the template, apply possible theme overrides, and allow the frontend to refer to the same resource. Do not invent a `views/` folder with manually included PHP just because another framework works that way. Within Moodle, `templates/` already participates in the official infrastructure and provides more integration.

It is perfectly possible to organize templates with descriptive names and subdirectories when the supported version and component conventions allow it, but do not turn the directory into a deep tree without need. A useful rule of thumb is that the name should reveal the visual component or part of the page it represents, such as `sync_status`, `item_card`, `report_table`, or `settings_warning`.

It is also worth remembering that a template is not a PHP page. It should not bootstrap Moodle, check login, query the database, or call capabilities. All of that happens earlier. When Mustache receives the data, the access decision should already have been resolved.

## 6.6 Context passed to Mustache

The word context appears in two places in Moodle and it is easy to create confusion. A permission context, such as `context_course` or `context_module`, controls authorization. A Mustache context is simply the set of data that will be used to render the template.

```php
$data = [
    'title' => format_string($course->fullname),
    'canedit' => has_capability('local/catalogsync:manage', $context),
    'items' => $items,
];
```

This array is the rendering context. It should be made up of simple values, arrays, and objects suitable for serialization. If you send a structure that is too complex, full of domain objects and internal dependencies, the template starts depending on details it should not know.

The `templatable` interface reinforces this idea by requiring `export_for_template()`, whose role is to transform the class's internal state into something appropriate for presentation. That creates a clear boundary: on one side you may have rich objects and business rules, and on the other the template receives only what it actually needs.

## 6.7 Variables

Mustache variables use `{{name}}`. If the context contains `['name' => 'PHP Course']`, `{{name}}` will be replaced by the corresponding value with proper HTML escaping.

```mustache
<h3>{{name}}</h3>
```

When the variable does not exist or is empty, Mustache behaves silently, which is convenient for presentation but can hide data-preparation errors during development. If a required field does not appear, do not immediately assume the template is wrong; first inspect the exported context.

Avoid generic names such as `value`, `data1`, or `flag`. Templates live for a long time and are often reviewed by someone without the PHP class open next to them, so `canmanage`, `formatteddate`, and `detailurl` explain much more than `x`, `date`, and `url`.

Also prefer sending already formatted data when the formatting rule belongs on the server. A date can arrive as `formattedtime` instead of forcing the template to know how to convert a timestamp, and a URL should arrive prepared as an appropriate string or structure expected by the output layer, rather than being assembled by concatenation inside the HTML.

## 6.8 Sections

Sections use `{{#name}} ... {{/name}}` and serve both for true conditions and for iterating over collections. That covers a large share of presentation needs without introducing traditional `if` or `foreach` statements inside the template.

```mustache
{{#canmanage}}
    <a href="{{editurl}}" class="btn btn-secondary">
        {{#str}} edit, core {{/str}}
    </a>
{{/canmanage}}
```

For lists, the same mechanism is applied to each item.

```mustache
{{#items}}
    <div class="local-catalogsync-item">
        <span>{{name}}</span>
        <span>{{status}}</span>
    </div>
{{/items}}
```

The important point is not to start transporting business logic into those conditions. `{{#canmanage}}` is good because authorization has already been calculated. Creating several combinations of flags to reconstruct a complex rule inside the template usually indicates that data preparation is still incomplete.

## 6.9 Inverted sections

Inverted sections use `{{^name}} ... {{/name}}` and render when the value is false, empty, or the collection has no items. They are especially useful for empty states.

```mustache
{{^items}}
    <div class="alert alert-info">
        {{#str}} noitems, local_catalogsync {{/str}}
    </div>
{{/items}}
```

This avoids making PHP choose between two templates merely to show the absence of data. Even so, if the empty state has completely different behavior, it may be clearer to prepare a property such as `isempty` or even use separate components, especially as the layout grows.

## 6.10 Partials

Partials let you reuse another template inside the current one. The syntax is `{{> component/template }}`.

```mustache
{{#items}}
    {{> local_catalogsync/item_card }}
{{/items}}
```

This technique is useful when the same visual piece appears in different lists or when a main template starts getting too large. A card, status row, or action block can become a partial and receive the context from the point where it was included.

The same caution applies as with functions that are too small. Splitting every `<span>` into a separate template does not improve architecture; it only scatters the reading. Extract a partial when it represents an identifiable visual component or when there is real reuse.

Moodle also provides core partials for common components, and using those elements is usually better than recreating complex markup yourself.

## 6.11 Moodle helpers

Moodle adds helpers to Mustache to solve recurring tasks without putting PHP inside the template. Among the best-known are helpers for strings, pix icons, quoting, and blocks used to initialize frontend behavior.

Helpers are useful because they preserve the separation between the template and core implementation. Instead of manually writing an image URL or resolving language in PHP just for a simple label, you use the mechanism Moodle already knows how to process both on the server and in other rendering contexts.

Do not confuse a helper with an excuse to hide logic. If you start wishing for a custom helper to calculate a business rule, you are probably trying to force the template to take on a responsibility that belongs to PHP or the JavaScript component.

## 6.12 Language strings in templates

The `str` helper lets you fetch strings directly in the template.

```mustache
<button type="button" class="btn btn-primary">
    {{#str}} savechanges, core {{/str}}
</button>
```

For plugin strings, provide the component.

```mustache
{{#str}} syncnow, local_catalogsync {{/str}}
```

This avoids preparing dozens of PHP properties merely for static labels. If the text depends on data, the helper also supports parameters, but when composition starts becoming complex it can be more readable to call `get_string()` while preparing the context.

The main rule remains the same as elsewhere in Moodle: interface text should not be written directly in the template if it needs to be translatable. Writing `<button>Sync now</button>` works on your English installation and is already wrong for distribution, language testing, and maintenance.

## 6.13 Pix helper

The `pix` helper generates images and icons using Moodle's infrastructure, respecting the theme and resource location.

```mustache
{{#pix}} i/settings, core, {{#str}} settings, core {{/str}} {{/pix}}
```

Instead of pointing to `/pix/icon.svg` manually, let Moodle resolve the resource. This is especially important because themes can override images and because physical paths vary according to component, cache, and installation structure.

For interface icons, first check whether Moodle already provides a suitable icon. Creating a parallel set of SVGs for common actions such as edit, delete, or settings usually creates visual inconsistency without any real benefit.

## 6.14 URLs

URLs should be built in PHP with `moodle_url` when they depend on traditional routes and known parameters, or with the corresponding modern APIs when the feature uses the Routing Engine. The template receives the finished result instead of concatenating paths and query strings.

```mustache
$data['editurl'] = (new moodle_url('/local/catalogsync/edit.php', [
    'id' => $item->id,
]))->out(false);
<a href="{{editurl}}">{{#str}} edit, core {{/str}}</a>
```

Concatenating something such as `/local/catalogsync/edit.php?id={{id}}` looks harmless, but it spreads route knowledge into the template, makes changes harder, and encourages the same practice in more complex URLs. The presentation layer should receive the URL it must use, not decide how to build it.

For action links that modify state, the URL does not solve authorization or CSRF. The endpoint remains responsible for validating login, capability, resource ownership, and `sesskey` when necessary. Hiding a button in the interface is not a security control.

## 6.15 Automatic escaping

One advantage of using `{{variable}}` is that Mustache performs HTML escaping. If the value contains `<script>` or any markup, the content is treated as text rather than interpreted as HTML.

This behavior substantially reduces the chance of Stored XSS when presenting data coming from users, the database, or an external integration, but it does not replace every security rule. The data still need to be handled according to their nature, and rich text must pass through the appropriate APIs, such as `format_text()`, considering context, format, and embedded files.

The dangerous mistake appears when someone notices that formatted text is being escaped and decides to replace every variable with triple braces. From that point on you have removed an important protection and assumed responsibility for ensuring that the HTML is safe.

## 6.16 `{{{ }}}` and the risks of unescaped content

Triple braces tell Mustache that the content is already ready to be inserted as HTML. This is necessary in some cases, for example when PHP has already executed `format_text()` and returned HTML sanitized according to Moodle's rules.

```php
$data['description'] = format_text(
    $record->description,
    $record->descriptionformat,
    ['context' => $context],
);
```

```mustache
<div class="description">
    {{{description}}}
</div>
```

The problem is using `{{{description}}}` directly on a raw value from the database because "I need to preserve the HTML." If that field contains user-controlled content and has not gone through the appropriate API, you have just opened a door to XSS.

A healthy practice is for every property intended for triple braces to have a name that makes it clear it has already been processed, such as `formatteddescription` or `html`, and for that transformation to happen in `export_for_template()` or in a known presentation service. This does not make the code magically secure, but it makes the intention auditable.


## 6.17 `classes/output/`

The `classes/output/` directory organizes classes intended for presentation. It commonly contains renderables, templatable objects, view models, and, when truly necessary, the component renderer.

That location is not merely aesthetic. Moodle's autoloading understands the plugin namespace and allows the class `local_catalogsync\output\report_page` to live in `classes/output/report_page.php`, making it clear to anyone reading the project that the class belongs to the output layer.

Do not put every class used by a page inside `output`. If a class queries the database, runs synchronization, and launches a task, it probably belongs to another layer. `output` should prepare what will be shown, and that may involve small presentation decisions, but it should not become a new `locallib.php` where everything is mixed together.

## 6.18 `renderable`

`renderable` is a marker interface. It indicates that an object can be rendered by the output infrastructure but does not require methods of its own.

```php
namespace local_catalogsync\output;

use renderable;

final class status_badge implements renderable {
    public function __construct(
        public readonly string $status,
    ) {
    }
}
```

By itself, this interface says little about how the data will reach the template, so it usually appears together with `templatable` or with a renderer implementation that knows how to transform the object into HTML.

In new code, think of a renderable as an object that represents something visible, not as a generic service. `report_page`, `sync_summary`, and `item_card` make sense, while `utils` implementing `renderable` probably reveals that the class design is still confused.

## 6.19 `templatable`

`templatable` defines that the class knows how to export its data to a template through `export_for_template(renderer_base $output)`. It is one of the cleanest ways to separate internal state from presentation format.

```php
namespace local_catalogsync\output;

use renderable;
use renderer_base;
use templatable;

final class sync_summary implements renderable, templatable {
    public function __construct(
        private readonly int $total,
        private readonly int $pending,
        private readonly int $failed,
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'total' => $this->total,
            'pending' => $this->pending,
            'failed' => $this->failed,
            'hasfailures' => $this->failed > 0,
        ];
    }
}
```

Notice that `hasfailures` is a useful presentation decision. The template does not need to compare numbers or discover the rule; it receives the ready state and decides whether to show or hide the warning.

## 6.20 `named_templatable`

`named_templatable` extends the idea of `templatable` by allowing the class itself to state which template should be used. This is useful when the class name and template name do not follow the expected convention or when we want to make that relationship explicit.

The class implements `get_template_name()` and returns something like `local_catalogsync/sync_summary`. Moodle can then render the object without requiring you to create a renderer method merely to forward data to the template.

That possibility is one reason automatically creating `renderer.php` for every modern plugin is usually wasteful. If the renderer's only job would be to call `export_for_template()` and then `render_from_template()`, the infrastructure can already do that.

## 6.21 `export_for_template()`

`export_for_template()` is the boundary between the object and the template, and it is worth treating it carefully. It should return a simple, predictable structure suitable for serialization, composed of scalars, arrays, `stdClass` objects, and values compatible with the infrastructure.

This method is a good place to prepare URLs, presentation flags, formatted strings, and collections that have already been transformed. It is not a good place to execute an expensive query every time someone renders the object, nor to trigger side effects such as saving a record or sending a notification.

A class can receive dependencies or data in the constructor and use them to build its output, but try to prevent `export_for_template()` from becoming a second domain-service layer. If the report requires several queries and aggregations, a service can prepare the data and the output class can merely organize them for the screen.

In current versions there is another important detail. Moodle 5.1 documentation started emphasizing that the format returned by `export_for_template()` should not be used as a stable Web Service contract, because it belongs to the template and may change together with the interface. For stable external data, the platform introduced specific paths such as `externable` and appropriate exporters. Screen interfaces and public APIs are different contracts, and mixing them saves code today only to create bad dependencies tomorrow.

## 6.22 Separate data preparation from presentation

This separation is probably the most important decision in the entire chapter. The interface needs to receive data that are prepared enough that it does not reproduce business logic, but it also should not carry unnecessary domain details merely because the original class already has them.

Imagine a synchronization list with the states `pending`, `running`, `failed`, and `done`. The page needs to show a translated label, perhaps an icon, a retry button in some states, and a details link. If the template receives only the raw `status` value, it starts deciding which text to use and when to show each action. If PHP builds the entire HTML, we return to the original problem. The healthy solution is to prepare properties such as `statuslabel`, `canretry`, `detailurl`, and, if necessary, an approved semantic class for presentation.

The practical question is always the same: who should know this rule? If the rule exists because the business works in a certain way, it belongs to the domain or service. If it exists only to decide how to represent something that has already been calculated, it can live in the output layer. The template should be the final stage, not the place where the rule begins.

## 6.23 Why I would avoid creating `renderer.php` in a new plugin

If I were starting a Moodle plugin today and someone asked whether they should create a `renderer.php`, my initial answer would be no. Not because the renderer API has disappeared, not because `plugin_renderer_base` has been removed, and certainly not because core no longer uses renderers, but because that file is no longer the default solution to the problem we usually have in a new plugin. On most current screens, creating a renderer class merely to receive an object, call `export_for_template()`, and forward the result to `render_from_template()` adds a layer that makes no decision at all, and a layer that makes no decision usually exists only because we inherited an old recipe without asking whether the original reason still applies.

This distinction matters because there is a big difference between saying that renderers are deprecated and saying that creating a renderer by default is outdated architecture. The first statement would be technically wrong. Moodle still has `renderer_base`, `plugin_renderer_base`, `core_renderer`, `get_renderer()`, `render()`, and many renderers in core, and the current documentation still shows situations where a renderer makes sense. The second statement, however, is exactly the point relevant to this book. The historical pattern of starting any interface layer by creating `renderer.php` lost much of its reason to exist after Moodle gained Mustache, `render_from_template()`, `templatable`, `named_templatable`, and theme template overrides.

That is why I prefer a very simple rule for new code. Do not create `renderer.php` until you can explain, in one objective sentence, what behavior it adds that cannot be handled directly by a template, an output class, or the normal rendering infrastructure. If the answer is "because every plugin has a renderer," "because the tutorial told me to," or "because I need to call `render_from_template()`," there is no architectural reason, only tradition.

### 6.23.1 Before renderers, HTML was scattered throughout Moodle

To understand why `renderer.php` looks so important when you read old documentation, we need to go back to Moodle 1.9. At that time, HTML output was scattered across general functions in `weblib.php` and component-specific code inside `lib.php`, `locallib.php`, `view.php`, and other files. It was normal to find PHP making business decisions, querying data, and building markup in the same flow, along with global functions such as `print_header()`, `print_box()`, and many others directly printing parts of the page.

The problem was not merely aesthetic. When HTML is born scattered across global functions and domain files, the theme has little ability to replace the structure produced by the component, and developers also lack a clear boundary between data preparation and presentation. Changing the appearance of a control could require knowing the component's internal PHP code, while a functional change risked touching HTML concatenations unrelated to the rule being modified.

It was in that scenario that renderer architecture appeared as a major improvement. Historical Moodle 2.0 documentation explicitly records that, in Moodle 1.9, general output functions lived in `weblib.php` while modules kept rendering in `lib.php`, `locallib.php`, `view.php`, and other places, and one of the goals of the new rendering system was to provide an API that was stable, easy to use, and easy for themes to customize. When viewed through the eyes of 2010, a renderer is not architectural excess; it is precisely an attempt to remove HTML from even worse places.

### 6.23.2 Moodle 2.0 and the creation of the Output API

Moodle 2.0 brought a major change with the Output API, the global `$OUTPUT`, and renderer classes. Instead of calling old `print_*` functions that directly printed the response, code began asking a renderer to produce the visual representation and return the corresponding string. Because the renderer could vary by theme, the same call could produce different output without modifying the original component.

The official migration to the 2.0 API made this very clear. An old call such as `print_box()` became `$OUTPUT->box()`, while components with their own output could obtain a renderer through the page and delegate HTML generation to it. At that time this separation was a real evolution because it removed output from historical functions and created an explicit place where a theme could override presentation behavior.

```php
// Style that became common starting with Moodle 2.0.
$renderer = $PAGE->get_renderer('mod_example');
echo $renderer->render_item($item);
```

The renderer also allowed different targets, such as HTML, CLI, or other forms of output, and theme factories could replace the concrete implementation used to render a component. In a Moodle that did not yet have Mustache as the standard template system, putting output methods into replaceable classes was a coherent solution to a problem that needed solving.

### 6.23.3 Why `renderer.php` made sense at the time

There is a bad tendency to look at old architecture as though it had always been a mistake. It was not. `renderer.php` made sense because Moodle needed to centralize HTML somewhere, allow themes to control output, and create a bridge between business code and presentation. Without a template engine integrated on both server and browser, the renderer was the point where markup could be organized and overridden.

The documentation of the time itself encouraged each component to have its renderer and for methods to be responsible for specific widgets or controls. The goal was to reduce the amount of HTML lost inside `view.php` and helper functions. If you maintained Moodle 2.0, 2.1, or 2.2, following this pattern was entirely reasonable and, in many cases, was the modern way to work at the time.

The problem starts when we take a solution created for a 2010 platform and treat it as a structural obligation in 2026. The fact that a decision was correct when it appeared does not mean it should remain the first choice after the platform adds better mechanisms for the same responsibility.

### 6.23.4 The old renderer still mixed PHP and HTML

Even with the separation provided by the Output API, the classic renderer was still PHP producing HTML. The implementation could use `html_writer`, concatenate fragments, call smaller methods, and organize output better, but the visual structure still lived inside PHP methods. For anyone who needed to change markup, review HTML semantics, or work only on the theme, this still created a stronger dependency on the component code.

```php
class mod_example_renderer extends plugin_renderer_base {
    public function render_item($item): string {
        $output = html_writer::start_div('item');
        $output .= html_writer::tag('strong', s($item->name));
        $output .= html_writer::end_div();
        return $output;
    }
}
```

This example is much better than scattering concatenations through `view.php`, but we still need to open PHP to understand the interface structure. As components became richer, those renderers grew, and some ended up as enormous classes with dozens of methods, conditionals, and small pieces of markup, solving the original dispersion but creating another kind of concentration.

### 6.23.5 Do not confuse `$OUTPUT` with `renderer.php`

There is a distinction here worth repeating because it prevents the wrong conclusion. I am arguing that you almost never need to create a new `renderer.php` in your plugin, not that you should abandon `$OUTPUT` or the Output API. `$OUTPUT` itself is a Moodle renderer and remains the gateway to `header()`, `footer()`, `notification()`, `render_from_template()`, `render()`, and several shared core elements.

I am also not saying that `renderer_base` no longer exists or that `export_for_template()` cannot receive a renderer. These pieces remain part of the current contract because Moodle's output infrastructure was built on them. What changed is that your plugin does not necessarily need to add another subclass merely to participate in that infrastructure.

## 6.24 The turning point was Moodle 2.9 with Mustache

The change that really weakened the need for a custom renderer happened in Moodle 2.9. That release included MDL-49152, described in the official release notes as support for implementing renderers using Mustache templates in PHP and JavaScript. This was not simply a syntax change for writing HTML in another way, because the template became a separate artifact, could be rendered both on the server and in the browser, and could be overridden by themes.

From that point on, much of the historical reason to create a PHP renderer began to disappear. If the goal was to separate markup from rules, the template did that better because the HTML finally lived in an HTML file with placeholders. If the goal was theme customization, the theme could override the template. If the goal was to reuse the same representation in an AJAX response, JavaScript could render the same Mustache as well. The intermediary class stopped being the only possible boundary between data and output.

### 6.24.1 Mustache truly separated markup from PHP

With Mustache, PHP prepares data and the `.mustache` file describes the structure. That may look like a small difference when a component has half a dozen lines, but it completely changes maintenance when a screen grows. A developer can review preparation logic without crossing a forest of tags, while someone working on themes or accessibility can inspect the HTML without mentally reconstructing a sequence of `html_writer` calls.

This separation also makes it more obvious when a responsibility is in the wrong place. If the template starts needing to calculate rules, the PHP preparation is insufficient. If `export_for_template()` starts returning entire chunks of HTML to be placed in triple braces, we are probably returning markup to the place from which we just removed it. The benefit is not merely having another file; it is making the boundary between presentation data and visual structure visible.

### 6.24.2 The theme could override the template directly

One of the strongest historical arguments for a renderer was allowing a theme to replace the way a component produced HTML. With templates, most purely visual customizations can happen by replacing the Mustache itself, without creating a PHP subclass and without duplicating an entire method merely to change a `div`, a class, or the arrangement of elements.

That greatly reduces the need for inheritance-based overrides. If the difference is markup, use the layer designed for markup. Creating a renderer class in the theme to change HTML that could already be overridden by a template is carrying the previous solution into the new architecture and also increases coupling to method signatures and the component's PHP implementation.

### 6.24.3 The same template can be used on the server and in the browser

Another gain that the classic PHP renderer did not solve by itself is client-side rendering. With the template system, the same visual definition can be used by PHP and JavaScript, so a list initially loaded by the server and an item later inserted by AJAX can share the same markup. That reduces the unpleasant situation where PHP has one HTML structure and JavaScript maintains a second, almost identical version assembled from strings.

When an architecture can use the same template on both sides, creating a PHP renderer that only forwards data to that template becomes even less interesting. The reusable artifact is the template, not the class that passes data through.

### 6.24.4 `render_from_template()` eliminated the most common reason for an empty renderer

The `render_from_template()` API allows a template to be rendered directly from `$OUTPUT` or any `renderer_base`. On simple pages, this already solves most cases without any additional class.

```php
$data = [
    'total' => $total,
    'failed' => $failed,
    'hasfailures' => $failed > 0,
];

echo $OUTPUT->render_from_template(
    'local_catalogsync/sync_summary',
    $data,
);
```

If that is all the work the screen needs, creating `renderer.php` to hide those three lines does not improve architecture. You do not remove complexity; you merely move the call to another file, add a class, and force maintainers to navigate through another layer only to discover that it does nothing except return `render_from_template()`.

### 6.24.5 `templatable` made data preparation explicit

When preparing the context deserves its own class, `templatable` solves the other part of the problem. The object knows how to export a simple presentation structure and the template remains responsible for markup. That is much more expressive than placing dozens of `render_*` methods in a central class merely because they all produce HTML.

Instead of one renderer that knows every widget in the plugin, you get small output objects close to what they represent. A `sync_summary` prepares the synchronization summary, a `report_page` prepares the report page, and an `item_card` prepares its corresponding card. Each class can be tested independently and the plugin does not need a God class named `renderer` accumulating every output format.

### 6.24.6 `named_templatable` further reduces the need for a renderer

`named_templatable` covers almost the entire use case for an intermediary renderer. The class itself states which template should be used through `get_template_name()`, while `export_for_template()` provides the data. When you pass the object to `$OUTPUT->render()`, the infrastructure knows which template to render without requiring a manually written `render_something()` method.

```php
namespace local_catalogsync\output;

use core\output\named_templatable;
use renderer_base;

final class sync_summary implements named_templatable {
    public function __construct(
        private readonly int $total,
        private readonly int $failed,
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'total' => $this->total,
            'failed' => $this->failed,
            'hasfailures' => $this->failed > 0,
        ];
    }

    public function get_template_name(renderer_base $renderer): string {
        return 'local_catalogsync/sync_summary';
    }
}
$view = new \local_catalogsync\output\sync_summary($total, $failed);
echo $OUTPUT->render($view);
```

Notice what does not exist in this design. There is no `get_renderer()`, no plugin `renderer.php`, no class extending `plugin_renderer_base`, and no method whose body consists of only two predictable lines. The class representing the output declares the template and exports the data, while Moodle continues to use all the renderer infrastructure it needs internally.

### 6.24.7 The documentation itself says the renderer can be omitted in the simple case

This is not a stylistic invention of this book. Moodle's Templates documentation explains that, in the simplest case where the renderable and templatable object corresponds to the expected template, there is no need to add renderer code explicitly because `$OUTPUT->render()` can infer the template, call `export_for_template()`, and then `render_from_template()`. Current `named_templatable` documentation preserves precisely the ability for the object to declare the template name when automatic convention is not enough.

That matters because it dismantles the idea that `renderer.php` is a mandatory stage of the Output API. It is an available extension point, not a toll every plugin has to pay to use Mustache correctly.

## 6.25 Treating `renderer.php` as an automatic default is outdated architecture


After understanding the history, I would put the recommendation very directly. In a new plugin, do not create `renderer.php` by reflex. Start without it. Use `$OUTPUT` for page structure, `render_from_template()` when the screen is simple, and classes in `classes/output/` when presentation data deserves its own organization. If a concrete problem appears and that problem genuinely requires a renderer, then create the class knowing exactly why.

The opposite path usually produces ceremonial code. The developer creates `renderer.php`, mentally records that "Moodle uses renderers," writes `render_report()`, `render_card()`, `render_summary()`, and `render_table()`, but every method does the same thing: receives an object, calls `export_for_template()`, and forwards it to a Mustache template. There is no useful polymorphism, no output strategy, no shared behavior, and no presentation decision that needs to be overridden in PHP. There is only a layer with an important-sounding name.

### 6.25.1 The two-line renderer anti-pattern

```php
final class renderer extends plugin_renderer_base {
    public function render_sync_summary(sync_summary $summary): string {
        $data = $summary->export_for_template($this);
        return $this->render_from_template(
            'local_catalogsync/sync_summary',
            $data,
        );
    }
}
```

This method encapsulates no decision, converts no external contract, chooses no strategy, applies no fallback, and solves no template limitation. It merely reproduces a sequence the infrastructure already knows. Architecturally, it is the equivalent of creating a function `sum($a, $b)` that simply returns `$a + $b` and then claiming the system is better organized because there is now an abstraction.

In code review I would treat this renderer as an immediate candidate for removal. The fewer intermediary files without real responsibility there are, the faster someone can understand the page flow, and that matters much more in maintenance than following a structure inherited from old examples.

### 6.25.2 An empty renderer is not separation of concerns

A phrase that appears often in these discussions is, "I created the renderer to separate presentation from the rules." The intention is correct, but the conclusion is not necessarily so. Today the template separates markup. An output class can prepare the context. Adding another class in the middle does not increase separation if it has no responsibility of its own.

In fact, in some projects it makes the code harder to read because it creates an artificial chain: PHP page -> output object -> renderer -> template. When the renderer merely forwards the call, the ideal chain is PHP page -> output object -> template, with Moodle's infrastructure internally doing whatever is necessary to render it.

### 6.25.3 Do not create a renderer just to use Mustache

Mustache does not require you to create `renderer.php`. This may be the most important correction for anyone who learned Moodle from old tutorials. You can render a template directly with `$OUTPUT->render_from_template()`, and you can use templatable objects with `$OUTPUT->render()`. `renderer.php` is an additional possibility, not a requirement that enables the template system.

If someone says that "to use templates correctly you need a renderer," ask them to show what behavior that class adds. In most modern examples the answer ends up being none, and the code itself becomes clearer when that layer is removed.

### 6.25.4 Do not create a renderer to hide `render_from_template()`

Hiding a clear call behind another method is worthwhile only when the new method provides a better abstraction. `render_from_template()` already says exactly what is happening, receives the template name and context, and there is no gain in replacing it with `render_summary()` if that method simply repeats the call.

A good abstraction reduces the knowledge required or centralizes a rule that might otherwise diverge. An empty abstraction merely replaces a known platform name with a local name the maintainer must discover. In plugins that live for years and pass through different teams, that distinction costs a lot.

### 6.25.5 Do not create a renderer to centralize all plugin output

Another inheritance from the old model is the idea that all plugin output must pass through a single renderer class. That produces huge files and couples visual components that have nothing to do with one another. If a plugin has a dashboard, synchronization table, conflict modal, status card, and administration page, there is no automatic benefit in making one class know all those representations.

Small classes inside `classes/output/` keep each presentation structure close to the data it prepares, while separate templates keep the HTML equally modular. Centralization is useful only when there is genuinely shared behavior, and even then it is worth asking whether that behavior belongs to a specific base class, an output helper, or a more explicit reusable component.

### 6.25.6 "But Moodle core still uses `renderer.php`"

Yes, and that contradicts nothing we are discussing. Core carries almost two decades of evolution, public contracts, theme compatibility, subsystems that were created before Mustache, and components whose architecture genuinely depends on specialized renderers. The file `public/course/renderer.php` still exists in current code, as do renderers for enrolment, grades, and other subsystems.

Copying the existence of a structure from core without copying the problem that justified it is a common mistake. Core also contains legacy code that must continue working, APIs in the process of deprecation, and enormous components that would not be designed the same way if they were born today. Your new plugin does not have that historical debt, so there is no reason to start paying interest on it immediately.

The correct question is not "Does Moodle use renderers?", because it does. The question is "Does my plugin need its own renderer to solve this case?" Those are completely different questions.

### 6.25.7 The renderer is not deprecated; automatic use is what has aged

It is worth making this very clear so the text is not repeated out of context. `renderer_base`, `plugin_renderer_base`, and the renderer mechanism are not generically deprecated. Current Output API documentation still shows renderers and current PHPDoc still exposes these classes. Therefore, do not write in a technical review that "renderer was removed from Moodle" or that "`renderer.php` no longer works," because that is false.

What I consider extremely outdated is creating `renderer.php` as mandatory boilerplate in every plugin, especially when it only delegates to Mustache. This distinction preserves historical accuracy while still allowing a strong recommendation for new code.

### 6.25.8 When I would accept a new renderer

I would start considering a renderer when there is output behavior that genuinely needs to be polymorphic in PHP, when the component has an explicit renderer contract that must be extended, when a theme needs to replace rendering logic that cannot be handled by a template override, when different output targets require specific implementations, or when we are integrating with an existing core API that expects that renderer.

Even in those cases I would ask whether the need is real or whether we are simply using the renderer as a convenient place to put code. If the method queries the database, decides capabilities, saves configuration, or calls an external integration, it does not become correct simply because it is inside a class named `renderer`. A renderer, when it exists, is still part of the presentation layer.

There are also legacy components or extensions of specific types where not using a renderer would mean fighting the subsystem's own contract. There is no value in modernizing by ideology and breaking the way an API was designed. The recommendation is to avoid unnecessary renderers, not to ignore real platform contracts.

### 6.25.9 Prefer template overrides for markup changes

If a theme needs to change HTML, element order, classes, wrappers, or small visual details, the template is usually the most direct tool. The override remains declarative and located in the same layer as the markup being changed, while a renderer subclass introduces PHP, inheritance, and dependency on method signatures to solve a problem that is still visual.

Renderer overrides can still exist when a theme needs to change preparation behavior or choose another output strategy, but that should be the exception. The more the theme can work with templates, SCSS, and frontend components, the less PHP it needs to inherit from internal components.

### 6.25.10 Why renderer inheritance increases upgrade cost

A renderer override depends on the parent class, its methods, signatures, visibility, received objects, and internal behavior. When core deprecates a method, changes a type, or moves a responsibility to another component, the subclass may require adjustment even if the HTML you wanted to change remains practically identical.

A template override also has a contract and can break, especially when the context changes, but it couples the customization to the presentation artifact rather than to an entire PHP class. Moodle even has a specific template deprecation policy because it recognizes that these contexts are important contracts. That does not make templates immune to upgrades; it simply makes the customization boundary more coherent with the type of change being made.

### 6.25.11 A modern path for simple pages

For a small page, I would start with the simplest possible case. The page validates the request, context, and capability, calls the necessary services, prepares an array, and sends that array to the template. There is no requirement to create an output class when it adds no clarity, much less a renderer.

```php
require_once(__DIR__ . '/../../config.php');

require_login();
$context = context_system::instance();
require_capability('local/catalogsync:view', $context);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/catalogsync/index.php'));
$PAGE->set_title(get_string('pluginname', 'local_catalogsync'));
$PAGE->set_heading(get_string('pluginname', 'local_catalogsync'));

$data = [
    'items' => $service->get_items_for_view(),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_catalogsync/index', $data);
echo $OUTPUT->footer();
```

If the screen grows and preparation becomes complex, move that preparation to output classes or appropriate services. Do not anticipate a renderer before there is a problem it solves.

### 6.25.12 A modern path for richer components

When a component deserves its own object, use an output class with `templatable` or `named_templatable`. It can receive already loaded objects, prepare URLs, flags, labels, and collections, and give the template exactly the context it needs. The template remains the source of markup and `$OUTPUT` remains the rendering infrastructure.

This architecture scales better because each new visual component does not force you to edit a central class. You add a class and a template when necessary, and the component name itself already tells much of the code's story.

### 6.25.13 If the renderer only forwards to the template, delete the renderer

This is a refactoring rule I would use without much fear. Open the plugin renderer and see whether its methods only call `export_for_template()` followed by `render_from_template()`. If all of them follow that pattern and no external contract requires the class, you can probably remove an entire layer and let the standard infrastructure do the work.

Obviously the removal must be tested, especially if third-party themes might have overridden that renderer or if the plugin has a public API used by other extensions. In internal plugins or new code, however, the simplification is usually immediate.

### 6.25.14 What to look for in code review

When I review new Moodle code, `renderer.php` is one of those files that automatically raises a question: "Why does it exist?" This is not an accusation; it is an architectural check. If the answer shows a concrete responsibility, fine. If the answer is merely "to render the template," the file is probably unnecessary.

I also look for huge `render_*` methods, database queries inside the renderer, repeated capability checks in the output layer, extensive HTML concatenation, and renderer subclasses created in a theme merely to change markup. Each of those signs points to an architecture that can likely be simplified with templates, output classes, or better-defined services.

### 6.25.15 Practical rule for this book

From this point on, the examples in this book will not create `renderer.php` by default. When we need to render a simple interface, we will use `$OUTPUT->render_from_template()`. When we need to represent a richer presentation structure, we will use classes in `classes/output/` with `templatable` or `named_templatable` and let `$OUTPUT->render()` handle the rest. A custom renderer will only appear when there is a reason that survives the question, "What does this class do besides forward data to a template?"

That keeps the examples closer to the direction Moodle has taken since the introduction of Mustache and avoids teaching, as a rule, a solution that belongs to an earlier phase of the architecture. Anyone maintaining legacy code needs to understand renderers deeply because they will encounter them often, but anyone writing new code does not need to perpetuate them without necessity.

## 6.26 Why avoid building HTML inside PHP

Building HTML in PHP usually starts innocently.

```php
$html = '<div class="item">';
$html .= '<strong>' . s($item->name) . '</strong>';
$html .= '<a href="' . $url . '">Edit</a>';
$html .= '</div>';
```

With four lines, nobody sees a problem. Then capability checks, tooltips, badges, empty states, icons, `data-*` attributes, translations, and responsive classes arrive, and the file turns into twenty concatenations where one misplaced quote breaks the entire page.

The larger problem is that the HTML stops being readable as HTML. Anyone reviewing accessibility, semantic structure, or theme classes has to decipher PHP strings, while anyone working on the logic has to cross visual blocks to find the rule. Mustache solves exactly that friction.

There is also an impact on theme overrides. HTML hidden in PHP concatenation does not participate in the template infrastructure in the same way, so you reduce extensibility without gaining anything meaningful in return.

## 6.27 `html_writer`

`html_writer` is an older API that is still widely used in Moodle to generate small HTML fragments safely and structurally.

```php
$link = html_writer::link(
    $url,
    get_string('edit'),
    ['class' => 'btn btn-secondary'],
);
```

It is much better than concatenating attributes manually and remains useful for small local output, especially callbacks that need to return a simple fragment, legacy code, or APIs that traditionally work with an HTML string.

The mistake is using `html_writer` to build an entire page because "it is a Moodle API." Technically it will be more organized than string concatenation, but it still mixes visual structure into PHP and loses much of Mustache's advantage.

## 6.28 When `html_writer` is still acceptable

Use `html_writer` when the HTML is genuinely small and local, for example a link, a `span`, a short list generated by a specific callback, or output that an API directly expects as a string. It is also common in compatibility code for older branches and in parts of core that predate widespread template adoption.

If you notice yourself opening and closing several tags, creating an entire Bootstrap grid, or building a table with complex loops, stop and move it to a template. The boundary does not need to be ideological; simply notice when the code stops being a small element and starts representing a visual component.

## 6.29 Bootstrap used by Moodle

Moodle uses Bootstrap as an important foundation of the interface, especially through the Boost theme and themes derived from it. That means classes for grid, spacing, buttons, alerts, cards, and utilities are available, but there is a difference between using Moodle's visual ecosystem and assuming that any snippet copied from Bootstrap's documentation will work exactly as it does on the official Bootstrap site.

Moodle controls the version, customizations, SCSS, components, and JavaScript behavior within its own release cycle, so always check the version supported by the target branch and look for examples in core before introducing external patterns.

Another concern is not visually tying the plugin to a rigid combination of classes and colors. Themes can change variables, spacing, and appearance, so the interface should depend more on Moodle semantics and components than on a visual identity invented by the plugin.

### 6.29.1 Moodle 5.0 uses Bootstrap 5.3

It is worth fixing the version here, because "Moodle uses Bootstrap" is correct and still insufficient for someone writing markup. Moodle 5.0 migrated the Boost theme to Bootstrap 5.3 and added a compatibility layer to reduce breakage in plugins written for Bootstrap 4. That means a plugin aimed specifically at Moodle 5.0 should think in Bootstrap 5, even if some old markup keeps working through the transition bridge.

That layer exists to allow migration, not to turn old classes into a permanent contract. If a new plugin is born on 5.0, prefer current naming and use the bridge only as protection for legacy code that still needs to cross versions.

### 6.29.2 Bootstrap 4 changes that appear in Moodle plugins

Some replacements are simple but appear often in old templates: `dropdown-menu-right` became `dropdown-menu-end`, `dropdown-menu-left` became `dropdown-menu-start`, `custom-select` became `form-select`, `custom-check` became `form-check`, and `custom-switch` is now expressed with `form-check` and `form-switch`. Copying a template from Moodle 4.1 or an old theme snippet without reviewing those differences can produce an interface that looks correct on one screen and breaks on another.

```html
<div class="dropdown-menu dropdown-menu-end">...</div>
<select class="form-select">...</select>
<div class="form-check form-switch">...</div>
```

Avoid doing a blind conversion based only on search and replace, because JavaScript components, `data-*` attributes, and accessibility behavior also changed between generations. First look at how Moodle 5.0 itself implements the component you need and copy the contract, not merely the appearance.

### 6.29.3 The compatibility layer is not an excuse to depend directly on Bootstrap internals

The more the plugin uses utility classes only for layout and delegates modals, notifications, templates, and interactions to Moodle APIs, the lower the cost of the next migration. When `core/modal` or another core component exists for an interaction, prefer that surface over direct Bootstrap JavaScript, because Moodle can change libraries, markup, and initialization while keeping its own API more stable.

## 6.30 Moodle visual components

Before creating your own modal, notification, menu, or selection component, look for what core already provides. Beyond maintaining visual consistency, this reduces work on accessibility, theme compatibility, and future maintenance.

Components such as modals, notifications, dropdowns, core templates, and button patterns already solve recurring problems and have been tested within the ecosystem. Recreating everything in local CSS and JavaScript usually means reimplementing focus, keyboard behavior, contrast, mobile behavior, and internationalization as well, even if none of that appears in the first prototype.

A good Moodle interface does not need to look "generic," but it should communicate with the platform. A plugin can have its own identity without competing with the navigation, typography, and components users already know.

## 6.31 `$PAGE->requires`

`$PAGE->requires` is the API used to register frontend requirements associated with the page, such as JavaScript modules and other resources managed by Moodle.

In code using the traditional compiled-module model, a common call is to initialize a module from PHP.

```php
$PAGE->requires->js_call_amd('local_catalogsync/report', 'init', [$courseid]);
```

This pattern still exists in supported branches and in a great deal of plugin code, but it should not be used to dump large data structures into the HTML. If the module needs a lot of information, pass identifiers and let the frontend fetch data through an appropriate API.

Also do not use `$PAGE->requires` as a substitute for architecture. Putting hundreds of inline lines on the page because the API allows JavaScript does not make the code modern; it only moves the problem somewhere else.

## 6.32 JavaScript ESM

Moodle has recommended JavaScript modules in ECMAScript Module format for new code for several versions. On traditional branches, source code lives in `amd/src/`, is written with ESM syntax, and goes through the build pipeline to produce artifacts consumed by the browser.

```js
import Notification from 'core/notification';

export const init = () => {
    document.querySelectorAll('[data-action="catalogsync-run"]')
        .forEach((button) => {
            button.addEventListener('click', async() => {
                try {
                    // Perform the action.
                } catch (error) {
                    Notification.exception(error);
                }
            });
        });
};
```

The benefit is not just being able to use `import`. Modules create clear boundaries, reduce globals, make testing easier, and make dependencies explicit. One giant file with every plugin interaction remains hard to maintain even if it uses `export` and `import`.

This book uses Moodle 5.0 as its baseline. Starting with Moodle 5.2, a new frontend architecture appeared with native ESM, TypeScript, and React in dedicated paths for core components, but that is a later evolution and not a requirement for writing a Moodle 5.0 plugin. If the same plugin also supports 5.2 or later versions, treat that architecture as a compatibility boundary and adopt new features only when the minimum version allows them, rather than mixing 5.2 examples as though they were part of the 5.0 contract.

## 6.33 Legacy AMD


Before ESM was adopted as the authoring format, Moodle used AMD modules written in the RequireJS pattern. You will still find code using `define([...], function(...) { ... })` in old plugins and parts of legacy branches.

That code should not be copied into new development merely because it works. Moodle maintains compatibility out of necessity, but the recommendation for years has been to write new modules in ESM.

It is important to distinguish the authoring format from the generated format. For quite some time, developers wrote ESM in `amd/src/` and the build generated modules compatible with the AMD loader used in the browser. Therefore, calling everything under `amd/` "legacy JavaScript" would be incorrect. What is legacy is manually writing the old AMD style, not necessarily the directory that participates in the pipeline of traditional branches.

## 6.34 When you will still encounter AMD modules

You will find AMD in old plugins, code that must support very old versions, third-party libraries, and parts of core that have not yet been migrated. You will also see compiled artifacts in `amd/build/`, which should not be edited manually.

When fixing a bug in an existing plugin, do not rewrite an entire module just to change syntax if that increases risk without benefit. Migration needs an objective and tests. On the other hand, when creating new functionality inside a currently maintained plugin, prefer the pattern recommended for the minimum supported version.

This coexistence of styles is normal in a project with more than twenty years of history and long compatibility cycles. The mistake is not finding legacy code; the mistake is not knowing that it is legacy and turning it into a reference for new code.

## 6.35 `core/ajax`

`core/ajax` is the preferred way to call Moodle external functions from JavaScript on current branches. The PHP function must be registered in `db/services.php` and marked with `'ajax' => true`, after which the frontend calls the method through the core module.

A very useful organization is to centralize calls in a repository module.

```js
import {call as fetchMany} from 'core/ajax';

export const runSync = (itemid) => fetchMany([{
    methodname: 'local_catalogsync_run_sync',
    args: {itemid},
}])[0];
```

Then the interface module imports `runSync()` and deals with interaction, loading state, messages, and visual updates.

This separates transport from the interface and makes testing easier. It also avoids scattering Web Service names across all JavaScript files. Moodle can still group calls in certain situations, validate parameters, and reuse the same External API used by other clients.

Security remains on the server. The fact that a call came through `core/ajax` does not prove the user may perform the action, so the external function must validate parameters, context, and capabilities exactly as it would for any other client.

## 6.36 `core/notification`

`core/notification` standardizes messages, confirmations, and exception handling in the frontend. Instead of creating an `alert()` or an improvised modal for every error, use the component that already integrates with the rest of Moodle.

```js
import Notification from 'core/notification';

try {
    await runSync(itemid);
} catch (error) {
    Notification.exception(error);
}
```

That consistency matters because an error is not merely red text. Focus, assistive-technology reading, modal behavior, translation, and visual conventions are involved. A well-used core function solves several of those concerns at once.

## 6.37 `core/modal`

Modals are among the components that become problematic fastest when implemented manually. Drawing a centered box is easy, but controlling focus, closing, keyboard behavior, backdrop, scrolling, and accessibility integration is much more work.

Moodle provides its own infrastructure, and in modern versions the API allows you to create a modal with JavaScript, use templates in the body, and even define custom types when there is a real need.

```js
import ModalFactory from 'core/modal_factory';
import Templates from 'core/templates';

export const openDetails = async(context) => {
    const modal = await ModalFactory.create({
        title: context.title,
        body: Templates.render('local_catalogsync/details', context),
    });

    modal.show();
};
```

The exact API varies among versions, so always consult the documentation for the supported branch, especially because some old trigger patterns have been deprecated. The principle remains the same: reuse the core component before inventing another one.

## 6.38 `core/templates`

`core/templates` allows Mustache templates to be rendered in the browser. This is extremely useful when an AJAX action returns data and you need to insert a card, update a row, or replace a block without manually generating HTML in JavaScript.

The same idea used on the server remains valid on the client. Data goes in, the template produces markup, and the JavaScript module controls behavior. This symmetry reduces duplication because you do not need to maintain one PHP version and another JavaScript version of the same visual structure.

When inserting content dynamically, remember that Moodle may need to process behaviors associated with the new content, filters, and specific initializations. Do not treat `innerHTML` as a universal solution and do not use templates as an excuse to ignore the component lifecycle.

## 6.39 Fragment API

The Fragment API solves a different scenario from `core/ajax`. Instead of returning only structured data, a fragment allows you to ask the server for a rendered piece of interface within the correct context. This is useful for modals, panels, and regions that depend on richer PHP preparation.

A fragment must still respect security. The callback receives context and arguments, but it must validate what is being requested, confirm capabilities, and never trust IDs sent by the browser merely because the call originated from an authenticated page.

Fragments are especially useful when reusing the Forms API or complex templates in dynamic interfaces, but they should not become a way to turn an entire page into many tiny HTML requests without architecture. If the frontend needs only simple data, a Web Service through `core/ajax` may be clearer. If it needs a ready, contextual region, a fragment makes more sense.

## 6.40 Dynamic Forms

Dynamic Forms allow Moodle forms to be used inside dynamic interfaces, including modals, while preserving much of the Forms API validation and infrastructure. This avoids a common duplication in which the plugin has a complete PHP form for the traditional page and a second manual JavaScript implementation for the modal.

The real advantage appears when the form needs complex elements, validation, a filepicker, or behavior already supported by Moodle. Instead of rebuilding everything on the client, you reuse the form definition and integrate the submission cycle with the dynamic interface.

Even with Dynamic Forms, the authorization rule does not move into the browser. The backend continues validating context and capability while the frontend manages the user experience.

## 6.41 Dynamic Tables

Dynamic Tables are useful when the interface needs a list with pagination, sorting, filters, and asynchronous updates without reinventing the entire mechanism. Moodle has its own infrastructure for dynamic tables that integrates with core components and can substantially reduce the amount of custom JavaScript.

The important point is not to choose a dynamic table automatically. For twenty static records, a simple server-rendered table may be better and cheaper. When the volume grows, filters become rich, or updates need to happen without reloading the page, the dynamic infrastructure starts justifying its cost.

Also do not use Dynamic Tables to hide a bad query. Interface pagination does not fix a query that loads one hundred thousand records before slicing twenty in PHP. The data layer still needs to paginate and filter correctly.

## 6.42 JavaScript initialization from templates

Historically, Moodle templates have used the `{{#js}}` block to register JavaScript initialization associated with the markup.

```mustache
{{#js}}
require(['local_catalogsync/report'], function(Report) {
    Report.init();
});
{{/js}}
```

This pattern is still encountered and is useful especially in traditional Mustache interfaces, but do not put large logic inside the block. The template should only trigger the module while behavior lives in the appropriate JavaScript file.

In the new React-based interfaces introduced in Moodle 5.2, the documentation began recommending the React-specific helper and automatic initialization for new reactive components, while `{{#js}}` remains appropriate for existing Mustache markup and legacy scenarios. This is another example of architectures coexisting during a transition, not a reason to rewrite every plugin at once.

## 6.43 DOM events

DOM events are the foundation of frontend interaction. Clicks, field changes, submit events, keyboard events, and focus should be handled with `addEventListener()` and well-scoped modules, avoiding inline attributes such as `onclick`.

A robust strategy is to use `data-*` attributes to mark interface intent.

```html
<button type="button"
        class="btn btn-primary"
        data-action="catalogsync-run"
        data-itemid="42">
    Sync
</button>
```

JavaScript finds `[data-action="catalogsync-run"]` and registers the event. This reduces coupling to visual classes because `btn-primary` can change while the action remains identified by a semantic attribute.

In dynamic lists, event delegation may be better than registering a listener on every recreated button, but use it consciously and keep the scope as small as possible. A global listener on `document` for every kind of action makes collisions and debugging harder.

## 6.44 Custom events

When different modules need to communicate in the browser, custom events help reduce direct dependencies. One component can dispatch an event such as `local_catalogsync:updated` and other parts of the page can react without the synchronization module needing to know every consumer.

```js
window.dispatchEvent(new CustomEvent('local_catalogsync:updated', {
    detail: {itemid},
}));
```

Another module can listen for that event and update a counter, for example. The caution is not to create a chaotic global event bus with dozens of undocumented names. Events work best when they represent clear facts and carry a small, predictable payload.

If two modules belong to the same unit and always change together, a direct call may be simpler. A custom event is valuable when we want to decouple producers and consumers.

## 6.45 Plugin CSS

Plugin CSS should be the minimum necessary to complement what Moodle components and utilities already solve. The more you recreate grids, spacing, buttons, modals, and typography, the more work you will have maintaining theme compatibility.

Prefer selectors scoped to the component.

```css
.local-catalogsync-report .sync-status {
    font-weight: 600;
}
```

Avoid generic selectors such as `.card`, `.btn`, or `table td` in the plugin stylesheet, because you may alter elements from other areas when the CSS is loaded on the page. Scoping is a simple way to reduce side effects.

Also do not hide business rules in CSS. `display: none` does not replace a capability and does not make information confidential. If the user cannot see something, the server should not send that content.

## 6.46 SCSS and themes

Moodle themes rely heavily on SCSS to compose Bootstrap, variables, and visual customizations. An ordinary plugin, however, should not depend on modifying theme SCSS to work. The plugin provides semantic markup and local styles where necessary, while the theme decides global appearance.

If you maintain a theme plugin, the responsibility changes and SCSS becomes a central tool, including variables, presets, and overrides. Even then, try to work with Moodle's structure rather than forcefully overriding specific selectors from every component.

A plugin distributed to third parties needs to survive Boost, Boost-derived themes, and institutional customizations. If the interface works only because you assumed a color, fixed width, or a variable that exists only in your theme, there is hidden coupling.

## 6.47 Interface accessibility

Accessibility is not a review we perform after the interface is finished. It starts when we choose an HTML element, focus order, button text, contrast, modal behavior, and the way state is communicated.

Moodle has a clear accessibility policy and recommends semantic HTML before resorting to ARIA. A real `<button>` already provides keyboard behavior and semantics that a `<div role="button">` has to reimplement manually.

It is also important to test the interface without a mouse. If you cannot navigate, open an action, close a modal, and understand focus using the keyboard, the problem appears even before a screen-reader test.

Color cannot be the only way to communicate state. A red badge that indicates failure only through color does not work for someone who cannot perceive that visual difference. Text, an icon with appropriate meaning, or additional information must carry the message.

## 6.48 ARIA

ARIA should complement HTML when native semantics do not solve the case, not replace correct elements. Moodle itself emphasizes that incorrect ARIA can be worse than no ARIA.

`aria-label`, `aria-expanded`, `aria-controls`, and similar states are useful in interactive components, but they need to reflect the real state. An expansion button with `aria-expanded="false"` that does not change when the panel opens is giving assistive technology incorrect information.

Before adding a manual role, ask whether a native HTML element already provides the behavior. A button should be `<button>`, navigation should use an appropriate structure, and headings should follow a coherent hierarchy. ARIA enters when we need to describe a relationship or state that HTML alone does not represent.

## 6.49 Keyboard

Every important interaction needs to work with the keyboard. Native buttons and links already help considerably, but custom components require care with `Tab`, `Enter`, `Space`, `Escape`, and focus movement.

Modals should receive focus when opened and return focus to the originating element when closed. Menus need to allow navigation without trapping the user. Hidden elements should not remain tabbable. Drag and drop needs an alternative when the action is essential.

The most common mistake appears when developers test everything by clicking. The interface looks perfect until someone presses `Tab` and discovers that focus disappears, enters an invisible element, or never reaches the primary action.

## 6.50 Exercise — convert a PHP page full of HTML to Output + Mustache + ESM

The exercise in this chapter deliberately starts with a bad page. Create `local_catalogsync/report.php` and make a first version that queries records, builds a table by concatenation, creates buttons with HTML inside PHP, and uses a small inline script to retry a synchronization. The page must work, because the goal is not to fix a functional bug; it is to improve the architecture.

Then perform the first refactoring. Move all visual structure to `templates/report.mustache`, replace hard-coded strings with language strings, and build URLs with `moodle_url`. PHP should remain responsible for bootstrap, authorization, obtaining data, and calling the output layer.

In the second stage, create `classes/output/report_page.php` implementing `renderable` and `templatable`, move preparation of flags, URLs, and formatted values into `export_for_template()`, but do not put expensive queries there. If necessary, create a separate service that loads and aggregates the data.

In the third stage, extract the synchronization row or card into a partial, use sections for conditional actions and an inverted section for the empty state. Add at least one formatted text field using `format_text()` and use triple braces only for that field, clearly documenting why the content is safe for unescaped output.

In the fourth stage, move the synchronization action to an ESM module. Create an External Function registered for AJAX, centralize the call in a repository module, handle exceptions with `core/notification`, and update the necessary part of the interface using `core/templates` or a fragment where appropriate. Do not reload the entire page merely because it is easier.

In the fifth stage, turn item editing into a dynamic form inside a modal and compare the result with a manual implementation. Notice how much validation, focus, and handling code you avoid duplicating by using the official components.

Finally, perform an accessibility review. Navigate using only the keyboard, check focus, labels, heading hierarchy, contrast, and states communicated without depending exclusively on color. Run the frontend tools for the supported branch and test at least with Boost and one other Boost-based theme.

The final page should make one difference very clear. The PHP file is no longer a page that mixes everything together; it coordinates the request. The output class transforms data into context, Mustache describes markup, JavaScript handles interaction, and each layer can change without dragging the others along.

A modern interface in Moodle does not mean adding more JavaScript. It means reducing coupling, using the components the platform already provides, and consciously choosing where each responsibility lives. Mustache remains an important foundation for reusable markup, `classes/output/` helps prepare data without polluting the page, ESM organizes behavior, APIs such as `core/ajax`, `core/modal`, and `core/templates` prevent reinvention, and the transition started in Moodle 5.2 shows that the frontend will continue evolving. If the plugin is well separated, that evolution is adaptation; if everything is mixed together in `index.php`, every change becomes surgery.

## Technical references consulted

* Moodle Developer Resources. Moodle 5.0 developer update, Bootstrap 5 section. https://moodledev.io/docs/5.0/devupdate
* Moodle Developer Resources. Bootstrap 5 migration. https://moodledev.io/docs/5.2/guides/bs5migration (migration started in Moodle 5.0)
* MOODLE. Output renderers. MoodleDocs, historical Moodle 2.0 documentation. Available at https://docs.moodle.org/dev/Output_renderers. Accessed 23 Sep. 2026.
* MOODLE. Migrating your code to the 2.0 rendering API. MoodleDocs. Available at https://docs.moodle.org/dev/Migrating_your_code_to_the_2.0_rendering_API. Accessed 23 Sep. 2026.
* MOODLE. Moodle 2.9. Moodle Developer Resources. Available at https://moodledev.io/general/releases/2.9. Accessed 23 Sep. 2026.
* MOODLE. Templates. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/guides/templates. Accessed 23 Sep. 2026.
* MOODLE. named_templatable Interface Reference. Moodle PHP Documentation. Available at https://phpdoc.moodledev.io/main/d8/df6/interfacecore_1_1output_1_1named__templatable.html. Accessed 23 Sep. 2026.
* MOODLE. Output API. Moodle Developer Resources. Available at https://moodledev.io/docs/5.1/apis/subsystems/output. Accessed 23 Sep. 2026.
* MOODLE. Templates. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/guides/templates. Accessed 23 Sep. 2026.
* MOODLE. JavaScript Modules. Moodle Developer Resources. Available at https://moodledev.io/docs/5.1/guides/javascript/modules. Accessed 23 Sep. 2026.
* MOODLE. AJAX. Moodle Developer Resources. Available at https://moodledev.io/docs/5.2/guides/javascript/ajax. Accessed 23 Sep. 2026.
* MOODLE. Modal Dialogues. Moodle Developer Resources. Available at https://moodledev.io/docs/5.1/guides/javascript/modal. Accessed 23 Sep. 2026.
* MOODLE. Frontend Development. Moodle Developer Resources. Available at https://moodledev.io/docs/5.2/guides/frontend. Accessed 23 Sep. 2026.
* MOODLE. Accessibility. Moodle Developer Resources. Available at https://moodledev.io/general/development/policies/accessibility. Accessed 23 Sep. 2026.
* MOODLE. Moodle 5.2 Release Notes. Moodle Developer Resources. Available at https://moodledev.io/general/releases/5.2. Accessed 23 Sep. 2026.

{% endraw %}