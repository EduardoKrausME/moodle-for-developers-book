{% raw %}

# 16 BLOCKS

A block looks simple because the first version everyone writes fits in a few lines. You create a class extending `block_base`, set a title in `init()`, return something from `get_content()` and Moodle immediately displays a little box on the side of the page. The problem is that this initial simplicity is deceptive. A block that started with two links can gain per-instance configuration, global configuration, context filtering, files, JavaScript, cache, permissions, per-user data and, before you notice it, the class that should merely coordinate presentation is querying five tables, building HTML, checking permissions, and making external calls inside `get_content()`.

In this chapter we will do the opposite. First we will understand the contract Moodle expects from a block plugin and then separate responsibilities correctly, because the fact that a block is visually small does not mean its architecture can be improvised. The goal is to finish with a block that can be installed, added to different pages, configured, controlled by capability, rendered with Mustache, use JavaScript when needed, and grow without turning `block_nome.php` into an impossible file to maintain.

## 16.1 What is a block plugin?

A block plugin is a plugin type that delivers content into block regions made available by a page and its theme. Visually, it may appear as a side box, a Dashboard panel, or another region defined by the layout, but the important point is that it participates in Moodle's block system, with its own instances, context, configuration, visibility, and rules about which pages it may appear on.

That is very different from saying a block is just a piece of HTML. When somebody adds an instance of your block to a course, Moodle creates an instance in `block_instances`, associates that instance with a region and a context and, depending on the plugin, may also store configuration specific to that instance. A block plugin should therefore be treated as a Moodle component, not a loose widget.

The Frankenstyle name for a block called `quicklinks`, for example, is `block_quicklinks`, and its directory is:

```
blocks/quicklinks/
```

An initial structure could be:

```
blocks/quicklinks/
├── block_quicklinks.php
├── version.php
├── db/
│   └── access.php
├── lang/
│   ├── en/
│   │   └── block_quicklinks.php
│   └── pt_br/
│       └── block_quicklinks.php
└── templates/
    └── content.mustache
```

Other files are added only when the real need appears, such as `settings.php`, `edit_form.php`, `amd/src/`, `classes/`, `backup/moodle2/`, and files used by the File API.

## 16.2 When to create a block

Create a block plugin when the functionality genuinely makes sense as content positioned in a block region and, especially, when the ability to add, remove, move, or configure that instance is part of the expected behavior.

A list of course shortcuts, a small progress-summary panel, a compact institutional information box, or a contextual view changing with the course are natural examples. A complete administrative screen, ERP integration, enrolment process, or functionality that must execute independently from whether a visual instance exists on a page usually belongs to another plugin type.

This matters because many things have historically been implemented as blocks merely because block plugins were easy to create and appeared quickly in the interface. That creates awkward coupling because the business rule begins to depend on somebody having placed an instance of the block on a particular page.

If a routine must exist even when no block is visible, the routine does not belong to the block. It can live in a class used by the block, a task, another plugin, or a shared API. The block should be one way to present and trigger that functionality, not the reason the functionality exists.

## 16.3 The main class and block_base

The main class normally lives in a file using the component name without duplicating the `block_` prefix. For `block_quicklinks`, the file is:

```
blocks/quicklinks/block_quicklinks.php
```

And the class begins like this:

```php
<?php

defined('MOODLE_INTERNAL') || die();

class block_quicklinks extends block_base {

    public function init(): void {
        $this->title = get_string('pluginname', 'block_quicklinks');
    }
}
```

The `block_base` class contains the contract used by Moodle's block system. You do not need to reinvent placement, instantiation, configuration, or rendering of the external block frame because core already manages all of that. Your job is to tell Moodle what the block is, where it can appear, how it should behave, and which content it provides.

A common trap is looking at `block_base` and overriding methods merely because they exist. Do not do that. Override only what actually changes your block's behavior. The smaller the plugin-specific surface is, the easier it is to follow version changes and the more predictable the result remains.

## 16.4 init()

The `init()` method is the minimum entry point practically every block implements. Its best-known purpose is setting the default title:

```php
public function init(): void {
    $this->title = get_string('pluginname', 'block_quicklinks');
}
```

What needs to be clear is that `init()` runs very early in the instance lifecycle. At this point you should not assume instance configuration is already available. Moodle documentation explicitly calls attention to this. If the title depends on `$this->config`, for example, this is not the correct place to make the final decision.

Another recurring mistake is turning `init()` into the plugin's general bootstrap. Do not load database data, call external services, run complex permission checks, or prepare content there. Think of `init()` as basic object initialization, not the `main()` of your block.

## 16.5 Fixed and dynamic titles

If every instance uses the same title, `init()` works very well. But some blocks allow every instance to have its own title or vary the title according to configuration.

In that scenario `specialization()` is called after the instance has already been loaded and can see instance-specific configuration:

```php
public function specialization(): void {
    if (!empty($this->config->title)) {
        $this->title = format_string($this->config->title);
    }
}
```

This avoids the common workaround where a developer tries to access `$this->config` in `init()` and then wonders why the value does not exist yet.

It is also worth asking whether the title genuinely needs to be configurable. Adding configuration merely because it is easy increases testing, backup, translation, validation, and maintenance. If the block name is part of the feature's identity, keep it fixed.

## 16.6 get_content()

`get_content()` is the method everybody associates with blocks and, exactly for that reason, it is where the most poor code tends to accumulate. The method needs to return block content, normally an object with properties such as `text` and `footer`.

A minimal example:

```php
public function get_content(): stdClass {
    if ($this->content !== null) {
        return $this->content;
    }

    $this->content = new stdClass();
    $this->content->text = get_string('hello', 'block_quicklinks');
    $this->content->footer = '';

    return $this->content;
}
```

Notice the initial check. Moodle may request block content more than once during the same request, and there is no reason to repeat all work if it has already been prepared.

The problem begins when `get_content()` becomes a two-hundred-line method full of SQL, HTML, inline JavaScript, business rules, and authorization. The method may coordinate what needs to be displayed, but rules should live in specific classes and presentation should live in Mustache whenever the interface becomes more than trivial.

## 16.7 Do not build the whole interface inside get_content()

Code like this still appears frequently:

```php
$this->content->text = '<div class="mybox">';
$this->content->text .= '<h4>' . $title . '</h4>';
$this->content->text .= '<a href="' . $url . '">Abrir</a>';
$this->content->text .= '</div>';
```

It works. That is exactly the problem, because something working does not make it a good pattern to keep using.

When HTML is mixed into PHP you lose readability, make theme overrides harder, increase the risk of incorrect escaping, and make visual maintenance much worse. Chapter 6 already explained why presentation belongs in templates and the same reasoning applies here. A block does not receive an architectural exemption just because the HTML fits into five lines.

A better alternative:

```php
public function get_content(): stdClass {
    global $OUTPUT;

    if ($this->content !== null) {
        return $this->content;
    }

    $url = new moodle_url('/blocks/quicklinks/view.php');

    $data = [
        'title' => get_string('welcome', 'block_quicklinks'),
        'url' => $url->out(false),
    ];

    $this->content = new stdClass();
    $this->content->text = $OUTPUT->render_from_template(
        'block_quicklinks/content',
        $data
    );
    $this->content->footer = '';

    return $this->content;
}
```

And in `templates/content.mustache`:

```mustache
<div class="block-quicklinks-content">
    <h4>{{title}}</h4>
    <a href="{{url}}">{{#str}}open, block_quicklinks{{/str}}</a>
</div>
```

There is no need to create `renderer.php` merely for this. It would only add another layer calling a template, exactly the kind of boilerplate we avoided in Chapter 6.

## 16.8 applicable_formats()

A block may technically work on several page types, but that does not mean it should be available everywhere. `applicable_formats()` tells Moodle on which page formats the block may be added.

Example:

```
public function applicable_formats(): array {
    return [
        'site-index' => false,
        'course-view' => true,
        'mod' => true,
        'my' => false,
        'admin' => false,
    ];
}
```

Common identifiers include `site-index`, `course-view`, `mod`, `my`, and `admin`. You can also be more specific with values such as `course-view-weeks` or `mod-forum-view`.

The rule should follow the block's usefulness. If the block depends on a course, do not return `['all' => true]` out of laziness and then attempt to discover inside `get_content()` whether a valid `$COURSE` exists. The earlier Moodle knows where the block makes sense, the fewer invalid states your plugin needs to handle.

## 16.9 Course, activity, Dashboard, and administration are not the same thing

When a block appears on a course page, there is usually a relevant course context and a `$COURSE` representing that navigation. On the Dashboard this changes. On administrative pages it changes again. On an activity page the course still exists, but there is also a course module and module context.

That is why the sentence "my block works on any page" deserves caution. Sometimes it simply means it did not break in the pages you tested.

If content requires a real course, limit availability to `course-view` and, if needed, `mod`. If it is personal, the Dashboard may be the natural place. If it is administrative, perhaps a block plugin is not the correct type and a page in `admin` makes more sense.

The interface should appear where the underlying data model actually exists.

## 16.10 instance_allow_multiple()

By default, Moodle does not allow several instances of the same block on one page. If multiple instances make sense, you can allow them:

```
public function instance_allow_multiple(): bool {
    return true;
}
```

Allowing multiple instances is not merely a visual decision. If every instance can point to a different link set, category, or configuration, it makes sense. If every instance always shows exactly the same thing, allowing duplication normally creates only confusion.

In `block_base`, allowing multiple instances is also related to the expectation of per-instance configuration. In practice, if two instances can coexist on the same page, there is normally some difference between them.

## 16.11 instance_allow_config()

There is another scenario. You do not want multiple instances on the same page, but still want the one instance to be configurable. That is what `instance_allow_config()` is for:

```
public function instance_allow_config(): bool {
    return true;
}
```

If `instance_allow_multiple()` returns `true`, per-instance configuration is already part of expected behavior. `instance_allow_config()` matters more when multiple instances remain prohibited but the single instance still needs its own options.

This helps separate two different questions: "can there be more than one instance?" and "does each instance have configuration?" They may look equivalent in small examples, but they are not.

## 16.12 Global configuration and per-instance configuration

Blocks can have two configuration levels and they should not be mixed.

Global configuration belongs to the plugin. If an administrator defines an API key, a default behavior option, or an integration used by every instance, that belongs in global plugin settings.

Per-instance configuration belongs to that particular occurrence of the block. If one instance shows category A and another shows category B, that value belongs to the instance.

A simple way to think about it is to ask: if I delete this block instance and create another, should the configuration continue to exist? If yes, it is probably global configuration. If no, it probably belongs to the instance.

## 16.13 has_config() and settings.php

To tell Moodle that the block plugin has global settings, implement:

```
public function has_config(): bool {
    return true;
}
```

Then create `settings.php` just as with other plugin types.

A simple example:

```php
<?php

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    $settings->add(new admin_setting_configcheckbox(
        'block_quicklinks/showicons',
        get_string('showicons', 'block_quicklinks'),
        get_string('showicons_desc', 'block_quicklinks'),
        1
    ));
}
```

Then:

```php
$showicons = get_config('block_quicklinks', 'showicons');
```

The same caution from previous chapters remains. `settings.php` should not perform heavy work merely because it was loaded. Do not call an external API unconditionally, run expensive aggregations, or turn opening site administration into an accidental benchmark of your plugin.

## 16.14 config_instance.html and why you may still find it

Anyone maintaining older block code may encounter references to `config_instance.html`. This belongs to an earlier generation of the Blocks API and appears in old tutorials and plugins. It is not the pattern I would choose for a new block.

Current documentation directs per-instance configuration through `edit_form.php` using a class extending `block_edit_form`. So if you are writing new code and somebody suggests starting with `config_instance.html`, they are probably repeating a pattern learned on old Moodle versions.

This is a useful rule for the whole book. Do not copy a plugin structure merely because you found it in a plugin that still works. Moodle carries many years of compatibility, and an API surviving in code does not mean it remains the best starting point.

## 16.15 edit_form.php

To add per-instance configuration, create `edit_form.php`:

```php
<?php

class block_quicklinks_edit_form extends block_edit_form {

    protected function specific_definition($mform): void {
        $mform->addElement(
            'header',
            'configheader',
            get_string('blocksettings', 'block')
        );

        $mform->addElement(
            'text',
            'config_title',
            get_string('customtitle', 'block_quicklinks')
        );
        $mform->setType('config_title', PARAM_TEXT);
    }
}
```

The `config_` prefix matters because the data will be handled as instance configuration. Once saved, it becomes available in `$this->config`.

Everything from the Forms API chapter applies here. Use appropriate types, validate what needs validating, and do not trust a value simply because the form was opened by a user with editing enabled. The screen is merely where the data came from, not a reason to store any arbitrary value.

## 16.16 How instance configuration is stored

The standard configuration of a block instance is associated with the record in `block_instances`. Core serializes the data and makes it available in `$this->config` when the instance is loaded again.

This works very well for small settings. Title, display mode, maximum number of items, and simple filters fit perfectly.

Do not use `configdata` as a generic database. If the block begins storing hundreds of records, history, relationships, per-user states, or data that needs individual querying, create proper tables and model them in XMLDB. Instance configuration is configuration, not a schema replacement.

## 16.17 instance_config_save()

Most blocks do not need to override `instance_config_save()` because the default behavior already saves configuration data.

There are cases where the data needs preparation first, for example when configuration contains a rich-text editor with associated files or requires a specific transformation. Then the method can be useful:

```php
public function instance_config_save($data, $nolongerused = false): void {
    $data->title = trim($data->title ?? '');
    parent::instance_config_save($data, $nolongerused);
}
```

Be careful not to turn the method into a generic "something was saved so I will perform twenty operations" event. If the change triggers heavy processing, consider an Adhoc Task. If it modifies plugin-owned entities, a dedicated service may be more appropriate. Instance configuration does not need to know the whole application.

## 16.18 Instance context

Every block instance has its own context, normally a `context_block`. This is extremely useful because capabilities and files can belong to that particular instance instead of the whole system.

You can access:

```php
$context = $this->context;
```

Take this context seriously. If a capability is defined at `CONTEXT_BLOCK`, do not test it in system context merely because `context_system::instance()` is easier to obtain.

Likewise, when storing a file belonging to one instance, the block context's `contextid` is normally the natural identifier for the file area. When the block is deleted, this also helps Moodle understand the relationship of that content.

## 16.19 Capabilities of a block plugin

Blocks normally define capabilities in `db/access.php`. Two frequently seen patterns control adding instances to pages and adding them to the personal Dashboard.

Example:

```php
<?php

$capabilities = [
    'block/quicklinks:addinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_BLOCK,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/site:manageblocks',
    ],

    'block/quicklinks:myaddinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'user' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/my:manageblocks',
    ],
];
```

Beyond these, your plugin may define its own capabilities such as `block/quicklinks:viewprivate` or `block/quicklinks:manageitems`, always using the context that genuinely represents the operation.

## 16.20 Being allowed to add the block does not mean being allowed to use everything inside it

A user may have permission to add an instance but not to execute a particular action shown by the block. Likewise, a user may be able to view the block but not manage the items it displays.

So internal content and actions need their own authorization rules. Do not use the existence of an instance as proof that a user may modify data.

This returns to Chapter 8. The interface may hide a button, but the page or endpoint receiving the action must again check login, context, capability and, where a specific object is involved, ownership or relationship to that object.

## 16.21 Where the block appears

`applicable_formats()` controls where a block type may be used, but the actual instance also has a position, region, weight, and context. The theme defines available regions and every page declares which regions it supports.

This means the plugin should not assume there is always a "right column" or that the block will always be narrow. Themes can completely change layout, especially between desktop and mobile.

That is why rigid CSS based on fixed widths ages poorly. Content should be responsive and respect the space provided by the theme.

## 16.22 Course block

A course-dependent block can use `applicable_formats()` to restrict itself to course and activity pages. It still needs to identify precisely what that course means for the feature.

Example:

```
public function applicable_formats(): array {
    return [
        'course-view' => true,
        'mod' => true,
        'my' => false,
        'site-index' => false,
    ];
}
```

Inside content generation, if the rule depends on the course, prefer passing `courseid` into a service class rather than spreading `$COURSE` throughout the implementation. Globals are useful at the page-integration layer, but business logic is easier to test when it explicitly receives the values it needs.

## 16.23 Block on the Dashboard

The Dashboard is personal. A block there is normally more related to the current user than to a specific course.

If the plugin can be added to the Dashboard, implement `myaddinstance` and allow `my` in `applicable_formats()`.

Do not try to discover "the current course" on the Dashboard because that concept simply does not exist in the same way. If the block shows the user's courses, query from the user and enrolments rather than inventing a course-context variable.

## 16.24 Per-user data

Sometimes two people see the same block instance but its content needs to differ. One example is "my pending items" inside a course.

Do not store individual state in instance configuration. `$this->config` belongs to the block instance, not to whichever user is looking at it right now.

If there is per-user state, use User Preferences when it is genuinely a simple preference, or plugin tables when there is a persistent entity, history, or relationship. The block only queries and displays what belongs to the current user.

## 16.25 Be careful with cache when content depends on the user

Blocks can be rendered frequently, so cache may matter. The problem is caching personalized content with a key that does not include the user.

Imagine caching "pending items for course 12" and forgetting that the result also depends on the user. The first student populates the cache and the second may receive the first student's content. This stops being only a performance bug and becomes information leakage.

The same rule from Chapter 12 applies. A cache key must represent every dimension changing the result, such as course, user, group, language, or configuration depending on the query.

## 16.26 Caching block content

If a block performs expensive queries and the result is reusable, use MUC rather than inventing your own storage. Define the cache in `db/caches.php` and access it with a coherent key.

Example:

```php
$cache = cache::make('block_quicklinks', 'courseitems');
$key = $courseid . ':' . $userid;

$data = $cache->get($key);
if ($data === false) {
    $data = $service->get_items($courseid, $userid);
    $cache->set($key, $data);
}
```

But do not add cache merely because this is the Blocks chapter. First determine whether there is a cost worth avoiding and, most importantly, which event invalidates that result.

## 16.27 Avoid heavy work in get_content()

This deserves a section of its own. `get_content()` participates in page construction. If you make a three-second HTTP call there, you just added three seconds to page load. If the external endpoint fails and waits for a thirty-second timeout, your block can turn opening an entire course into a thirty-second wait.

Frequent remote integration should be processed beforehand, normally through Tasks, while the block reads local state. If information needs to be refreshed on demand by the user, consider asynchronous AJAX with a controlled timeout and visual feedback instead of blocking initial rendering.

A block is presentation. Do not make it an integration worker.

## 16.28 JavaScript in a block

When there is real frontend interaction, use JavaScript modules according to the architecture supported by the Moodle branch you target. In many branches you will encounter `amd/src/`, while newer versions include the transition to modern ESM discussed in Chapter 6.

Traditional initialization example:

```php
$this->page->requires->js_call_amd(
    'block_quicklinks/main',
    'init',
    [$this->instance->id]
);
```

JavaScript should receive only what it needs. Do not dump whole database records into `data-*` attributes and do not trust `instanceid` coming from the browser as authorization. If the module calls AJAX, the endpoint validates context and capability again.

## 16.29 Do not put inline JavaScript in get_content()

Avoid:

```html
$this->content->text .= '<script>...</script>';
```

Besides mixing responsibilities, this makes CSP, caching, linting, testing, and maintenance harder. Moodle already has a pipeline and APIs for loading JavaScript modules, so use them.

The block can place required identifiers into the template and the JavaScript module finds elements using selectors or receives parameters during initialization.

## 16.30 Mustache in Blocks

Blocks are an excellent fit for Mustache because their output is usually compact and well delimited. You prepare data, call the template, and keep markup out of PHP.

A class under `classes/output/` may be useful once preparation grows, but there is no need for ceremonial architecture around a three-field list. Use a class when it improves separation and testing, not because every template must have an intermediate object.

And again, do not create `renderer.php` only to have one method that calls `render_from_template()`. That pattern was common when renderers had a much larger role in Moodle's presentation architecture, but for a new block plugin rendering a template directly it normally adds nothing.

## 16.31 Output class when content grows

When a block needs to prepare a larger structure, create a dedicated class:

```php
namespace block_quicklinks\output;

use renderable;
use templatable;
use renderer_base;

class content implements renderable, templatable {

    public function __construct(
        private readonly array $items
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'hasitems' => !empty($this->items),
            'items' => $this->items,
        ];
    }
}
```

In the block:

```php
$view = new \block_quicklinks\output\content($items);
$data = $view->export_for_template($OUTPUT);
$this->content->text = $OUTPUT->render_from_template(
    'block_quicklinks/content',
    $data
);
```

The advantage is keeping `get_content()` readable and concentrating view preparation in a testable location.

## 16.32 Links and URLs

Do not concatenate a URL manually:

```php
$url = $CFG->wwwroot . '/blocks/quicklinks/view.php?id=' . $courseid;
```

Use `moodle_url`:

```php
$url = new moodle_url('/blocks/quicklinks/view.php', [
    'courseid' => $courseid,
]);
```

Beyond consistency, this reduces errors with escaping, parameters, and base-URL changes.

If the link executes a state-changing action, it probably needs `sesskey` and the page needs to call `require_sesskey()`, or better yet the action should be submitted through an appropriate flow rather than GET merely because it fits in a link.

## 16.33 Files in Blocks

A block plugin can store files using the File API exactly like other components. The component will be something like `block_quicklinks`, and the natural context for instance-specific files is normally the block context.

A file area could be named `attachments`:

```
contextid = contexto da instância do bloco
component = block_quicklinks
filearea = attachments
itemid = 0 ou identificador da entidade
```

The important thing is not assuming a physical path in moodledata. Use `get_file_storage()`, `stored_file`, and `pluginfile()` as covered in Chapter 9.

## 16.34 pluginfile() in a block plugin

If a block has private files that must be served under plugin control, implement the corresponding callback, for example:

```php
function block_quicklinks_pluginfile(
    $course,
    $bi,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($context->contextlevel !== CONTEXT_BLOCK) {
        return false;
    }

    require_login();

    if ($filearea !== 'attachments') {
        return false;
    }

    // Localize o arquivo com File API, valide acesso e envie com send_stored_file().
}
```

Do not use the callback as a blind proxy for any file in the context. Validate filearea, parameters, login, capability, and the user's relationship to the content.

## 16.35 Editor with files in instance configuration

When instance configuration uses an HTML editor with images or attachments, the flow becomes more complex because files initially pass through the user's draft area and then need to move into a permanent file area.

This is one case where `instance_config_save()` may be necessary to process content and save files correctly. Do not save `@@PLUGINFILE@@` or draft URLs without understanding the lifecycle because the configuration may appear to work for the user who edited it and fail for somebody else or after the draft area is cleaned.

Because this is the same conceptual flow covered by the Forms API and Files API chapters, reuse core functions rather than manually copying files.

## 16.36 Block CSS

CSS can live in `styles.css` according to plugin conventions, but try to scope selectors to your component. Avoid generic rules such as:

```
.card {
    margin: 0;
}
```

That may affect any other Moodle component using `.card`.

Prefer scope:

```
.block_quicklinks .quicklinks-list {
    margin: 0;
}
```

Even then, do not try to redesign the whole outer frame of the block. That belongs to the theme. Your CSS should handle internal content and component-specific states.

## 16.37 Accessibility

A small block still needs to be accessible. Links need understandable text, buttons need to be real buttons, decorative icons should not pollute screen readers, and interactive controls need to work by keyboard.

If the visual title says "Pending items" and the action is only an arrow icon, the screen reader needs an accessible name for that action. If you show a list of items, mark it as a list when that is semantically what it represents.

Do not use JavaScript to turn a `div` into a button when a `<button>` solves the problem better.

## 16.38 Visibility and empty content

Sometimes a block has nothing to display. Rather than rendering a box saying "no data" with no useful purpose, consider whether the block should disappear or show a useful empty state.

The base implementation has content logic and the system can consider empty blocks. If content is genuinely optional, keep that behavior predictable and do not use spaces, `&nbsp;`, or invisible HTML merely to force the box to appear.

An empty state is part of the interface. It can explain why there is no content and what the user needs to do, as long as that is genuinely helpful.

## 16.39 hide_header()

There is support for hiding the block header by overriding `hide_header()`, but use it carefully.

A title matters for visual context and accessibility. Hiding the header only because it looks cleaner may leave the content without clear identification.

If the design asks for a component without a title, inspect the resulting theme behavior and semantics before simply returning `true`.

## 16.40 Configuration and cache

When an administrator changes global configuration or an instance is edited, any cache derived from those values may become stale. Connect configuration changes to the necessary invalidation.

If the cache is request-scoped, the problem disappears on the next page load. If it is Application cache in Redis, it may continue delivering old data for hours or days.

Again, cache without an invalidation strategy is not a complete optimization.

## 16.41 Block backup

Blocks participate in backup and restore when they are part of content copied between courses, but the amount of implementation depends on what the plugin stores.

If the block only stores simple configuration on the instance itself and has no additional tables or complex file areas, very little extra code may be necessary. If it has its own tables, files, user references, or course-related entities, you need support in `backup/moodle2/` to transport that data correctly.

The Backup API has block-specific tasks and works with structure, file areas, and instance configuration. We will go much deeper into this mechanism in Chapter 24; the point here is simply not to assume every piece of data invented by the plugin is automatically backed up.

## 16.42 Backing up configuration is not backing up your tables

If you create a `block_quicklinks_items` table, its records do not magically enter the backup merely because the block using them was included in the course.

You need to declare how the data is exported and restored, including remapping IDs where necessary. The same applies to files associated with those entities.

This problem often appears only when a customer duplicates a course and discovers that the copied block still points to data from the original course, or worse, to records that do not exist in the target installation.

## 16.43 Instance removal and data cleanup

If your data belongs exclusively to one block instance, think about what happens when the instance is deleted. Do not let orphan records accumulate forever.

If data is global to the plugin, obviously it should not be deleted together with one instance. The decision depends on the ownership model you defined.

This is another reason to model the relationship between instance and data explicitly. When everything lives in serialized configuration, lifecycle is easy. When dedicated tables exist, lifecycle needs conscious handling.

## 16.44 A block is not a place for improvised cron

Do not attempt periodic updates by checking the time every time `get_content()` runs:

```
if ($lastupdate < time() - 3600) {
    update_everything();
}
```

This creates races, latency, and unpredictable behavior. If something needs updating hourly, use a Scheduled Task. If a user action needs to schedule processing, use an Adhoc Task.

The block reads processed state and presents the result. The rule does not change merely because the interface is small.

## 16.45 A block should not become an entire mini-application

A block plugin can certainly have several classes, auxiliary pages, and endpoints, but at some point you need to ask whether the plugin type still represents the functionality.

If the block became only an icon opening a ten-page administrative application, perhaps that application should be a `local` or another appropriate type, with the block acting only as an optional visual integration.

There is no prize for concentrating everything in one plugin. Good architecture means each component has a coherent responsibility.

## 16.46 Structure of a somewhat larger block

A mature block plugin could look like this:

```
blocks/quicklinks/
├── amd/
│   └── src/
│       └── main.js
├── classes/
│   ├── local/
│   │   └── service.php
│   └── output/
│       └── content.php
├── db/
│   ├── access.php
│   └── caches.php
├── lang/
│   ├── en/
│   │   └── block_quicklinks.php
│   └── pt_br/
│       └── block_quicklinks.php
├── templates/
│   └── content.mustache
├── block_quicklinks.php
├── edit_form.php
├── settings.php
├── styles.css
└── version.php
```

The structure is not the objective. It is a consequence of the responsibilities the plugin acquired.

## 16.47 Complete example — objective

Let us create a `block_coursepulse` block showing a small summary of the current course. It will display the number of visible activities and a link to a detailed page. Every instance can choose its own title and a maximum number of displayed items.

We will not implement complete analytics because that would distract from the subject. The objective is to demonstrate proper block-plugin architecture.

## 16.48 version.php

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'block_coursepulse';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

The minimum version should reflect the branch you genuinely support. Do not copy `requires` from an example without relating it to the plugin's test matrix.

## 16.49 Strings

In `lang/en/block_coursepulse.php`:

```php
<?php

$string['pluginname'] = 'Course pulse';
$string['customtitle'] = 'Custom title';
$string['maxitems'] = 'Maximum items';
$string['openreport'] = 'Open detailed report';
$string['coursepulse:addinstance'] = 'Add a Course pulse block';
$string['coursepulse:myaddinstance'] = 'Add a Course pulse block to Dashboard';
```

In `pt_br`, translate the same identifiers. Do not put literal text in a template or PHP merely because the example is small.

## 16.50 db/access.php

```php
<?php

$capabilities = [
    'block/coursepulse:addinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_BLOCK,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/site:manageblocks',
    ],

    'block/coursepulse:myaddinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [],
        'clonepermissionsfrom' => 'moodle/my:manageblocks',
    ],
];
```

In this example the block was designed for courses, so we will not normally enable it on the Dashboard even though the standard capability remains available in case the design changes later. It would also be valid not to allow `my` in `applicable_formats()`.

## 16.51 edit_form.php

```php
<?php

class block_coursepulse_edit_form extends block_edit_form {

    protected function specific_definition($mform): void {
        $mform->addElement(
            'header',
            'configheader',
            get_string('blocksettings', 'block')
        );

        $mform->addElement(
            'text',
            'config_title',
            get_string('customtitle', 'block_coursepulse')
        );
        $mform->setType('config_title', PARAM_TEXT);

        $mform->addElement(
            'select',
            'config_maxitems',
            get_string('maxitems', 'block_coursepulse'),
            [3 => 3, 5 => 5, 10 => 10]
        );
        $mform->setDefault('config_maxitems', 5);
    }
}
```

This form configures the instance, not the whole plugin.

## 16.52 Service class

In `classes/local/service.php`:

```php
<?php

namespace block_coursepulse\local;

class service {

    public function get_course_items(int $courseid, int $limit): array {
        global $DB;

        $sql = "SELECT cm.id, m.name AS modulename
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module
                 WHERE cm.course = :courseid
                   AND cm.visible = :visible
              ORDER BY cm.id DESC";

        return array_values($DB->get_records_sql(
            $sql,
            [
                'courseid' => $courseid,
                'visible' => 1,
            ],
            0,
            $limit
        ));
    }
}
```

In a real application it may be better to use course/modinfo APIs instead of querying certain tables directly depending on what you need. The example isolates this decision inside the class precisely so data-access choices do not contaminate the whole block.

## 16.53 Output class

```php
<?php

namespace block_coursepulse\output;

use renderable;
use renderer_base;
use templatable;

class content implements renderable, templatable {

    public function __construct(
        private readonly array $items,
        private readonly string $reporturl
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'hasitems' => !empty($this->items),
            'items' => array_map(
                static fn($item) => [
                    'id' => $item->id,
                    'modulename' => $item->modulename,
                ],
                $this->items
            ),
            'reporturl' => $this->reporturl,
        ];
    }
}
```

The class does not build HTML. It prepares a predictable structure for the template.

## 16.54 Template

In `templates/content.mustache`:

```mustache
<div class="block-coursepulse-content">
    {{#hasitems}}
        <ul class="block-coursepulse-list">
            {{#items}}
                <li>{{modulename}} #{{id}}</li>
            {{/items}}
        </ul>
    {{/hasitems}}

    {{^hasitems}}
        <p>{{#str}}nothingtodisplay{{/str}}</p>
    {{/hasitems}}

    <a href="{{reporturl}}">
        {{#str}}openreport, block_coursepulse{{/str}}
    </a>
</div>
```

## 16.55 Complete main class

```php
<?php

defined('MOODLE_INTERNAL') || die();

class block_coursepulse extends block_base {

    public function init(): void {
        $this->title = get_string('pluginname', 'block_coursepulse');
    }

    public function specialization(): void {
        if (!empty($this->config->title)) {
            $this->title = format_string($this->config->title);
        }
    }

    public function applicable_formats(): array {
        return [
            'course-view' => true,
            'mod' => true,
            'my' => false,
            'site-index' => false,
            'admin' => false,
        ];
    }

    public function instance_allow_multiple(): bool {
        return true;
    }

    public function get_content(): stdClass {
        global $COURSE, $OUTPUT;

        if ($this->content !== null) {
            return $this->content;
        }

        $limit = (int)($this->config->maxitems ?? 5);
        if (!in_array($limit, [3, 5, 10], true)) {
            $limit = 5;
        }

        $service = new \block_coursepulse\local\service();
        $items = $service->get_course_items((int)$COURSE->id, $limit);

        $url = new moodle_url('/blocks/coursepulse/report.php', [
            'courseid' => $COURSE->id,
        ]);

        $view = new \block_coursepulse\output\content(
            $items,
            $url->out(false)
        );

        $this->content = new stdClass();
        $this->content->text = $OUTPUT->render_from_template(
            'block_coursepulse/content',
            $view->export_for_template($OUTPUT)
        );
        $this->content->footer = '';

        return $this->content;
    }
}
```

The main method stays short because database access, data preparation, and presentation were not piled into it.

## 16.56 Detailed page

The `report.php` page must repeat all required checks. The fact that its link came from the block authorizes nobody.

```php
<?php

require('../../config.php');

$courseid = required_param('courseid', PARAM_INT);

$course = get_course($courseid);
require_login($course);

$context = context_course::instance($course->id);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/blocks/coursepulse/report.php', [
    'courseid' => $course->id,
]));
$PAGE->set_title(get_string('pluginname', 'block_coursepulse'));
$PAGE->set_heading(format_string($course->fullname));

echo $OUTPUT->header();

// Renderize o relatório usando Output API e Mustache.

echo $OUTPUT->footer();
```

If the report requires its own capability, call `require_capability()` here. Do not trust hiding the link inside the block.

## 16.57 Common errors in Blocks

After reviewing many plugins, some patterns appear repeatedly. `get_content()` queries everything directly, concatenates HTML, and calls external APIs; `applicable_formats()` returns `all => true` because nobody considered where the block genuinely works; per-instance configuration stores data that should live in a table; inline JavaScript manipulates the global DOM; the plugin queries `$CFG->dataroot` directly for files; capabilities are checked in the wrong context; and an essential routine only runs when somebody opens the page where the block is installed.

None of these problems exist because the Blocks API is poor. They appear because the block's small visual surface encourages developers to concentrate responsibility there.

## 16.58 The block as a visual integration layer

A healthy way to think about Blocks is as visual adapters. They take data that already exists in plugin or Moodle services and present it in the page context.

When the rule lives outside the main class, the same service can be used by a full page, AJAX, a task, or a Web Service. The block stops being the center of the system and becomes one possible interface for that functionality.

This also improves testing. You do not need to instantiate the entire block system just to validate a business rule that can be tested directly in a class.

## 16.59 Exercise — create a configurable, contextual block

Create a plugin named `block_courseoverviewplus` with the following requirements.

The block must appear only on course and activity pages. It must allow multiple instances, and every instance can choose its own title and a limit of 3, 5, or 10 items. Its content should show recent activities or another useful course dataset, but the query must live in a class under `classes/local/`, never directly in the template.

The interface must use Mustache and cannot build HTML by concatenating strings in `get_content()`. Do not create `renderer.php`. If there is JavaScript, use a dedicated module and not inline script. Define `addinstance` in `db/access.php`, apply context correctly, and create a detail page that repeats authentication and authorization rather than trusting the link from the block.

Add a global setting in `settings.php` allowing an administrator to enable or disable one visual feature of the block and per-instance configuration in `edit_form.php`. If you use cache, explain which event or change invalidates the data. If you add files, use the File API and block context.

Finally, answer four questions in writing. What stops working if the instance is removed? Which data belongs to the plugin and which belongs to the instance? Would the block remain secure if someone called the detail page directly? And if the content query took five seconds, which part would you move to asynchronous processing?

If you can answer those four questions clearly, you did not merely create a block that appears on screen. You created a component that understands its own lifecycle inside Moodle.

## Technical references consulted

* Moodle Developer Resources. Block plugins. https://moodledev.io/docs/5.0/apis/plugintypes/blocks
* Moodle Developer Resources. Backup API. https://moodledev.io/docs/5.2/apis/subsystems/backup
* Moodle Developer Resources. File API. https://moodledev.io/docs/5.0/apis/subsystems/files
* Moodle source code. `public/blocks/moodleblock.class.php`. https://github.com/moodle/moodle

{% endraw %}