# 6 MODERN INTERFACES AND THE OUTPUT API

A Moodle page can be functionally correct and still be badly designed. It may query the right data, respect permissions, and save without errors, but if it mixes HTML, SQL, JavaScript, strings, and business rules in the same PHP file, every later change becomes more expensive. Moodle's Output API exists to prevent that architecture.

The central idea is simple: PHP prepares data, output classes adapt those data for presentation, Mustache describes markup, JavaScript handles interaction, and the active theme remains free to control appearance. Keeping those responsibilities separate makes code easier to review, test, reuse, and upgrade.

## 6.1 Moodle Output API

The Output API is Moodle's presentation layer. It includes the page renderer available through `$OUTPUT`, Mustache templates, renderable and templatable objects, theme overrides, core UI components, and the infrastructure used to connect server-side data with browser-side behavior.

The API is not merely a set of helper functions for printing HTML. It establishes a boundary between application logic and presentation. A plugin should be able to change the visual structure of a report without rewriting the service that loads the report data.

## 6.2 The `$OUTPUT` global

After Moodle bootstrap, `$OUTPUT` represents the renderer for the current page and theme.

```php
echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('pluginname', 'local_catalogsync'));
echo $OUTPUT->footer();
```

Before calling `header()`, configure `$PAGE` correctly: URL, context, title, heading, layout, and JavaScript requirements all influence the final output.

## 6.3 `render_from_template()`

For modern plugin interfaces, a common pattern is to prepare a simple context and render a Mustache template.

```php
$data = [
    'name' => format_string($course->fullname),
    'status' => get_string('statusactive', 'local_catalogsync'),
];

echo $OUTPUT->render_from_template('local_catalogsync/course_status', $data);
```

The corresponding file is `templates/course_status.mustache`.

```mustache
<div class="local-catalogsync-course-status">
    <strong>{{name}}</strong>
    <span>{{status}}</span>
</div>
```

## 6.4 Mustache in Moodle

Mustache is intentionally limited. Templates should not query the database, check capabilities, call services, or reconstruct domain rules. They should receive presentation-ready data and describe how those data appear.

This limitation is useful. If a template needs to know whether a user may edit an item, PHP should normally provide a boolean such as `canedit` rather than forcing the template to understand authorization logic.

## 6.5 Template location and names

Plugin templates live under `templates/`. A file such as:

```
local/catalogsync/templates/item_card.mustache
```

is referenced as:

```
local_catalogsync/item_card
```

That Frankenstyle identifier lets Moodle locate the template and lets themes override it when necessary.

## 6.6 Template context

The context passed to Mustache should contain simple values, arrays, and objects representing presentation state.

```php
$data = [
    'title' => format_string($record->name),
    'canedit' => has_capability('local/catalogsync:manage', $context),
    'editurl' => (new moodle_url('/local/catalogsync/edit.php', ['id' => $record->id]))->out(false),
];
```

Avoid passing complex service objects or raw database models whose internal details the template does not need.

## 6.7 Variables and automatic escaping

Mustache variables use `{{name}}` and are HTML-escaped automatically.

```mustache
<h3>{{name}}</h3>
```

This default protects against a large class of XSS mistakes. Do not replace every variable with triple braces simply because rich HTML is sometimes required.

## 6.8 Sections and inverted sections

Sections handle conditions and iteration.

```mustache
{{#items}}
    <div class="item">{{name}}</div>
{{/items}}

{{^items}}
    <div class="alert alert-info">
        {{#str}} noitems, local_catalogsync {{/str}}
    </div>
{{/items}}
```

The output layer should prepare meaningful booleans and collections so templates remain readable.

## 6.9 Partials

Partials reuse another template.

```mustache
{{#items}}
    {{> local_catalogsync/item_card }}
{{/items}}
```

Extract a partial when it represents a real reusable visual component, not every time a template contains three lines of markup.

## 6.10 Language strings in templates

Use Moodle's `str` helper for translated interface strings.

```mustache
<button type="button" class="btn btn-primary">
    {{#str}} syncnow, local_catalogsync {{/str}}
</button>
```

Static user-facing text should not be hard-coded in English or Portuguese.

## 6.11 Icons and pix

The `pix` helper lets Moodle resolve icons through the active theme and component infrastructure. Prefer core icons where an appropriate one already exists instead of introducing a parallel icon system for common actions such as settings, edit, or delete.

## 6.12 URLs

Build URLs in PHP with `moodle_url` rather than concatenating routes inside Mustache.

```php
$data['editurl'] = (new moodle_url('/local/catalogsync/edit.php', [
    'id' => $record->id,
]))->out(false);
```

The template then simply uses `{{editurl}}`.

## 6.13 Rich HTML and triple braces

Triple braces render content without escaping.

```mustache
<div class="description">{{{formatteddescription}}}</div>
```

Only use this for content that has already passed through the correct Moodle formatting API.

```php
$data['formatteddescription'] = format_text(
    $record->description,
    $record->descriptionformat,
    ['context' => $context],
);
```

Raw user input must not be placed directly inside triple braces.

## 6.14 `classes/output/`

Modern plugins commonly place presentation objects under `classes/output/`.

```
classes/
└── output/
    ├── report_page.php
    └── item_card.php
```

These classes prepare presentation data; they should not become services that perform synchronization, save records, or implement unrelated business logic.

## 6.15 `renderable` and `templatable`

A presentation object can implement `renderable` and `templatable`.

```php
namespace local_catalogsync\output;

use renderable;
use renderer_base;
use templatable;

final class sync_summary implements renderable, templatable {
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
}
```

The template does not need to calculate whether failures exist; it receives that state explicitly.

## 6.16 `export_for_template()`

`export_for_template()` is the boundary between internal objects and presentation. It is an appropriate place for prepared URLs, labels, booleans, formatted dates, and collections.

It is a poor place for expensive database queries or side effects. If preparing the page requires complex data loading, perform that work in a service and pass the result to the output object.

## 6.17 Do not create `renderer.php` by reflex

Historically, custom renderers were central to Moodle's output architecture because HTML was generated by PHP methods and themes needed a replaceable rendering layer. Moodle 2.0's Output API was a major improvement over scattered `print_*` functions.

Mustache changed the default approach. Since Moodle 2.9, templates provide a better place for markup, can be used from PHP and JavaScript, and can be overridden directly by themes. A custom renderer is still supported and sometimes necessary, but it should solve a concrete problem rather than exist as boilerplate.

If a renderer method only performs:

```php
$data = $view->export_for_template($this);
return $this->render_from_template('local_catalogsync/view', $data);
```

then the class often adds no architectural value.

## 6.18 `named_templatable`

When an output object should explicitly declare its template, `named_templatable` reduces the need for trivial renderer methods. The class can provide its template name and export its data, while `$OUTPUT->render()` handles the infrastructure.

The practical rule used throughout this book is therefore:

- use `$OUTPUT->render_from_template()` for simple pages;
- use output classes when presentation data deserve their own object;
- create a custom renderer only when it adds real rendering behavior or an API explicitly expects one.

## 6.19 Avoid HTML generated inside PHP

This code is easy to start and difficult to maintain:

```php
$html = '<div class="item">';
$html .= '<strong>' . s($item->name) . '</strong>';
$html .= '<a href="' . $url . '">Edit</a>';
$html .= '</div>';
```

As the component grows, markup becomes hidden inside concatenations and theme customization becomes harder. Move visual structure into Mustache.

## 6.20 `html_writer`

`html_writer` remains useful for small HTML fragments where an API expects a string.

```php
$link = html_writer::link(
    $url,
    get_string('edit'),
    ['class' => 'btn btn-secondary'],
);
```

It should not be the default tool for building an entire modern page.

## 6.21 Bootstrap in Moodle

Boost and Boost-based themes use Bootstrap as a major UI foundation. Moodle 5.0 moved Boost to Bootstrap 5.3, with a compatibility layer to reduce breakage for older plugin markup.

For new Moodle 5.0 code, prefer current Bootstrap 5 conventions. Examples include `dropdown-menu-end` instead of `dropdown-menu-right`, `form-select` instead of `custom-select`, and `form-check form-switch` instead of older custom-switch markup.

Use the compatibility layer as a migration aid, not as a reason to keep writing Bootstrap 4 markup in new plugins.

## 6.22 Core visual components

Before creating your own modal, notification, dropdown, or dynamic table, look for Moodle's existing component. Reusing core behavior improves consistency, accessibility, theme compatibility, and upgradeability.

A custom box centered with CSS is not equivalent to a Moodle modal because focus management, keyboard behavior, backdrop behavior, screen-reader semantics, and mobile layout are part of the component contract.

## 6.23 `$PAGE->requires`

Traditional Moodle pages register JavaScript requirements through `$PAGE->requires`.

```php
$PAGE->requires->js_call_amd(
    'local_catalogsync/report',
    'init',
    [$courseid],
);
```

Keep large datasets out of the generated HTML. Pass small identifiers and let JavaScript request data through appropriate APIs when necessary.

## 6.24 JavaScript modules

New JavaScript should be modular, avoid global variables, and declare dependencies explicitly.

```javascript
import Notification from 'core/notification';

export const init = () => {
    document.querySelectorAll('[data-action="catalogsync-run"]')
        .forEach((button) => {
            button.addEventListener('click', async() => {
                try {
                    // Run action.
                } catch (error) {
                    Notification.exception(error);
                }
            });
        });
};
```

Older Moodle branches use the AMD build pipeline even when source code is authored with modern ESM syntax. Do not confuse the build directory with the source style.

## 6.25 `core/ajax`

For AJAX calls, register an External Function with `ajax => true` and call it through Moodle's frontend API.

A useful architecture separates the transport module from the UI module so Web Service names do not become scattered across every interaction file.

Server-side validation remains mandatory. JavaScript is never an authorization boundary.

## 6.26 `core/notification`

Use Moodle's notification infrastructure for errors and confirmations instead of `alert()` or a custom modal for every failure.

```javascript
import Notification from 'core/notification';

try {
    await runSync(itemid);
} catch (error) {
    Notification.exception(error);
}
```

## 6.27 `core/modal`

Use Moodle modal APIs rather than hand-building dialogs. Modals require correct focus trapping, keyboard handling, closing behavior, accessibility, and responsive layout.

When a form belongs inside a modal, Dynamic Forms are often a better fit than duplicating a server-side form in JavaScript.

## 6.28 `core/templates`

The browser can render Mustache templates too, which means the same visual component can be used during initial server rendering and later AJAX updates.

This avoids the architecture where PHP owns one HTML version and JavaScript owns a second version assembled from string concatenation.

## 6.29 Fragment API

A fragment is useful when JavaScript needs a contextual server-rendered interface region rather than only structured data. It is particularly suitable for complex modal content or UI that depends on existing Moodle rendering APIs.

Fragments still require context and capability validation. They are not trusted merely because they were requested by an authenticated page.

## 6.30 Dynamic Forms and Dynamic Tables

Dynamic Forms reuse Forms API definitions in AJAX interactions. Dynamic Tables help with lists requiring asynchronous pagination, sorting, filtering, and updates.

Use them when the interaction justifies the extra machinery. A static list of twenty records does not automatically need a dynamic table.

## 6.31 DOM events

Mark interface actions with semantic `data-*` attributes rather than binding behavior to purely visual classes.

```html
<button type="button"
        class="btn btn-primary"
        data-action="catalogsync-run"
        data-itemid="42">
    Synchronize
</button>
```

JavaScript can then listen for `[data-action="catalogsync-run"]` without depending on whether the button is primary or secondary.

## 6.32 Plugin CSS

Keep plugin CSS scoped.

```css
.local-catalogsync-report .sync-status {
    font-weight: 600;
}
```

Avoid global selectors such as `.card`, `.btn`, or `table td` that can affect unrelated Moodle components on the same page.

CSS must never replace access control. Content a user is not allowed to see should not be sent and merely hidden with `display: none`.

## 6.33 Accessibility

Prefer native semantic HTML before adding ARIA. Use real buttons for actions, coherent heading hierarchy, keyboard-accessible interactions, visible focus, and labels that explain the field or action.

Color must not be the only way to communicate state. A red failure badge should also contain meaningful text or another accessible indicator.

Test the interface without a mouse. If a user cannot reach, activate, and leave a component with the keyboard, the interface is incomplete.

## 6.34 Exercise - refactor a mixed PHP page

Create a report page that initially does everything badly on purpose: database query, HTML concatenation, fixed strings, inline JavaScript, and a custom AJAX action.

Then refactor it in stages:

1. move all markup to Mustache;
2. replace fixed strings with language strings;
3. prepare URLs with `moodle_url`;
4. create an output class when the context becomes non-trivial;
5. move interaction to an ESM module;
6. expose the server action through the External API and call it through `core/ajax`;
7. update the interface through a template or fragment;
8. use core notifications and modals;
9. review keyboard navigation and accessibility;
10. test the result in Boost and another Boost-based theme.

The final PHP page should coordinate the request rather than act as database layer, business service, renderer, HTML document, and JavaScript file all at once.

## Technical references consulted

* Moodle Developer Resources. Output API.
* Moodle Developer Resources. Templates.
* Moodle Developer Resources. JavaScript modules and AJAX.
* Moodle Developer Resources. Modal dialogues.
* Moodle Developer Resources. Accessibility policy.
* Moodle 5.0 developer update, Bootstrap 5 migration.
* Moodle 2.9 release notes, Mustache renderer support.
