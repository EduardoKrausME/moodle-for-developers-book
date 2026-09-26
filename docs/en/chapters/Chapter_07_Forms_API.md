# 7 FORMS API

![Forms API](image/cap07-forms-api.svg)

A form looks simple until it needs to edit an existing record, validate relationships in the database, manage files, preserve rich-text content, work inside a modal, and remain secure when the request does not look like anything the browser would normally submit. Moodle's Forms API exists to standardize that lifecycle.

The important distinction is that the form class owns the interaction, not the business rule. It defines fields, cleans values, validates input, and provides data to the caller. Saving records, dispatching events, enroling users, or synchronizing external systems belongs to reusable application code.

## 7.1 What `moodleform` is

`moodleform` is the base class for traditional Moodle forms. A form class extends it and implements `definition()`.

```php
namespace tool_catalog\form;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/formslib.php');

final class edit_item_form extends \moodleform {
    public function definition(): void {
        $mform = $this->_form;

        $mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
        $mform->setType('name', PARAM_TEXT);

        $this->add_action_buttons();
    }
}
```

The page using the form remains responsible for authentication, context, capability checks, loading the record, handling cancel, persisting validated data, and redirecting.

## 7.2 When to use Moodle Forms

Use Moodle Forms when users submit structured data and you want integration with cleaning, validation, accessibility, CSRF protection, editors, files, conditional fields, and Moodle's visual conventions.

Hand-written HTML can be reasonable for a very small control that is not really a data-entry form, but a plugin should not rebuild a complete form stack merely to avoid creating one class.

## 7.3 Form classes and namespaces

For new code, put ordinary forms under `classes/form/`.

```
classes/form/edit_item_form.php
```

maps to:

```php
\tool_catalog\form\edit_item_form
```

Activity Modules have additional conventions around `moodleform_mod` and `mod_form.php`, covered in the Activity Modules chapter.

## 7.4 `definition()`

`definition()` defines elements and simple validation rules. It should not save records or trigger side effects.

```php
public function definition(): void {
    $mform = $this->_form;

    $mform->addElement('text', 'code', get_string('code', 'tool_catalog'));
    $mform->setType('code', PARAM_ALPHANUMEXT);
    $mform->addRule('code', null, 'required', null, 'client');

    $this->add_action_buttons();
}
```

Expensive data loading should normally happen before the form is instantiated and be provided through `customdata`.

## 7.5 `customdata`

The constructor can receive data the form needs to build its interface.

```php
$form = new \tool_catalog\form\edit_item_form(
    action: $url,
    customdata: [
        'context' => $context,
        'categories' => $categories,
    ],
);
```

Inside the form this is available through `$this->_customdata`. Keep it focused on presentation dependencies rather than using it as a container for the entire application.

## 7.6 Text fields

A text element should have a matching `PARAM_*` type.

```php
$mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
$mform->setType('name', PARAM_TEXT);
```

The type is part of the input contract. Do not use `PARAM_RAW` by default and promise yourself that validation will happen later.

## 7.7 Textarea

Use `textarea` for multiline plain text.

```php
$mform->addElement(
    'textarea',
    'notes',
    get_string('notes', 'tool_catalog'),
    ['rows' => 8],
);
$mform->setType('notes', PARAM_TEXT);
```

If the field stores rich text with formatting and embedded files, use an `editor` instead.

## 7.8 Select and autocomplete

A select is appropriate for a small predictable option list.

```php
$options = [
    'draft' => get_string('statusdraft', 'tool_catalog'),
    'active' => get_string('statusactive', 'tool_catalog'),
];

$mform->addElement('select', 'status', get_string('status', 'tool_catalog'), $options);
```

For larger collections, autocomplete provides a better experience. Do not load tens of thousands of options into memory merely because autocomplete can search them in the browser; large sources need a scalable loading strategy.

## 7.9 Checkbox and radio

Use checkboxes for boolean choices and radio buttons when exactly one choice from a small visible group is required.

```php
$mform->addElement('advcheckbox', 'enabled', get_string('enabled', 'tool_catalog'));
$mform->setDefault('enabled', 1);
```

Browser state is not authorization. A disabled or hidden control can still be forged in a crafted request.

## 7.10 Date selectors

Use Moodle date selectors rather than manually assembling day, month, and year fields. Moodle's elements integrate with the platform's date conventions and avoid a great deal of localization and validation work.

Be explicit about whether you are storing a date, a date and time, or a Unix timestamp representing an instant. Timezone mistakes often begin with an unclear domain model rather than the form itself.

## 7.11 Hidden fields

Hidden values are still user-controlled.

```php
$mform->addElement('hidden', 'id');
$mform->setType('id', PARAM_INT);
```

If `id` identifies the object being edited, the server must load that object and confirm the current user may edit it. A hidden field is not a security control.

## 7.12 Static elements

A static element displays contextual information that is not edited in the current form.

Use it for information the user needs to see, not as a way for the server to recover trusted values. Trusted values should be loaded again from the database when processing the request.

## 7.13 Groups

Groups organize related controls and can improve semantics and layout. Do not use them merely to squeeze many elements into one horizontal line. Moodle interfaces must remain usable on narrow screens and at high zoom levels.

## 7.14 `addRule()`

Simple field rules can be declared close to the element.

```php
$mform->addRule('name', get_string('required'), 'required', null, 'client');
$mform->addRule('code', null, 'maxlength', 40, 'client');
```

Client-side validation improves user experience but can always be bypassed. Important rules must still be enforced on the server.

## 7.15 `setType()`

`setType()` cleans submitted values according to Moodle's parameter types.

```php
$mform->setType('id', PARAM_INT);
$mform->setType('name', PARAM_TEXT);
$mform->setType('code', PARAM_ALPHANUMEXT);
```

Cleaning input does not replace escaping output and does not establish authorization.

## 7.16 `setDefault()`

Defaults represent the initial value for new input.

```php
$mform->setDefault('enabled', 1);
$mform->setDefault('status', 'draft');
```

A default that is also a domain invariant should be enforced in the service layer too, because the same entity may later be created by CLI, import, or Web Service.

## 7.17 `disabledIf()` and `hideIf()`

Conditional form behavior can be declared without writing custom JavaScript.

```php
$mform->addElement('advcheckbox', 'hasenddate', get_string('hasenddate', 'tool_catalog'));
$mform->addElement('date_time_selector', 'enddate', get_string('enddate', 'tool_catalog'));
$mform->disabledIf('enddate', 'hasenddate', 'notchecked');
```

The server still needs to normalize and validate the relationship between these values.

## 7.18 `freeze()`

`freeze()` makes an element read-only in the rendered form. It is useful for immutable values shown during editing, but the server must independently reject or ignore attempts to change them.

Frontend read-only state is not an authorization mechanism.

## 7.19 `validation()`

Use `validation()` for cross-field and domain-aware validation that does not fit simple element rules.

```php
public function validation($data, $files): array {
    $errors = parent::validation($data, $files);

    if (!empty($data['hasenddate']) && $data['enddate'] <= time()) {
        $errors['enddate'] = get_string('enddatemustbefuture', 'tool_catalog');
    }

    return $errors;
}
```

Avoid side effects. Validation may run more than once and must be safe to repeat.

If a rule also applies to CLI, REST, scheduled tasks, or imports, place the actual rule in a reusable service and let the form translate failures into field messages.

## 7.20 Client-side versus server-side validation

Client validation is convenience. Server validation is integrity.

A browser can disable JavaScript, modify HTML, or bypass the form entirely. Any rule that must never be violated needs a server-side implementation, and structural uniqueness should also be protected by the database where appropriate.

## 7.21 `get_data()`

When `get_data()` returns an object, the form was submitted and validation succeeded.

```php
if ($data = $form->get_data()) {
    $service->save($data);
    redirect($returnurl, get_string('changessaved'));
}
```

The form does not persist automatically. That separation is intentional.

## 7.22 `set_data()`

Use `set_data()` to populate an existing record for editing.

```php
if ($record) {
    $form->set_data($record);
}
```

Editors and file managers require draft-area preparation before calling `set_data()`; they cannot be treated as ordinary scalar fields.

## 7.23 `is_cancelled()`

Check cancellation before processing valid data.

```php
if ($form->is_cancelled()) {
    redirect($returnurl);
}
```

Cancel should normally have no business side effect. If a button changes status or deletes a draft, that is a separate action, not cancellation.

## 7.24 Action buttons

Use `add_action_buttons()` for conventional submit/cancel controls.

```php
$this->add_action_buttons(
    cancel: true,
    submitlabel: get_string('savechanges'),
);
```

Long forms can use sticky action buttons where supported instead of implementing a separate custom floating toolbar.

## 7.25 `repeat_elements()`

`repeat_elements()` creates a variable number of repeated groups. It is useful for answer options, criteria, and small configurable collections.

Do not use it to edit thousands of rows. At that scale, a table plus individual editing generally produces a better UI and a better request lifecycle.

## 7.26 HTML editor

The editor element carries text, text format, and possibly embedded files.

```php
$mform->addElement(
    'editor',
    'description_editor',
    get_string('description', 'tool_catalog'),
    null,
    $editoroptions,
);
```

Existing content must be prepared into a draft area, and submitted content must be saved back through the File API so embedded `@@PLUGINFILE@@` references remain valid.

Simply storing `$data->description_editor['text']` can leave temporary draft URLs in persisted content.

## 7.27 Filepicker

Use `filepicker` when one file is selected for an operation such as import or immediate processing. It integrates upload and repositories without requiring manual `$_FILES` handling.

Validate size, expected format, and content on the server. A filename extension alone is not a security guarantee.

## 7.28 Filemanager

Use `filemanager` for a persistent collection of files associated with an entity.

Editing happens in a user draft area:

```php
$draftitemid = file_get_submitted_draft_itemid('attachments');

file_prepare_draft_area(
    $draftitemid,
    $context->id,
    'tool_catalog',
    'attachments',
    $record->id,
    $fileoptions,
);

$record->attachments = $draftitemid;
```

After valid submission:

```php
file_save_draft_area_files(
    $data->attachments,
    $context->id,
    'tool_catalog',
    'attachments',
    $record->id,
    $fileoptions,
);
```

The Files API chapter explains these concepts in depth.

## 7.29 Draft files

A draft area exists so users can add, remove, and edit files before deciding to save the form. Cancel can therefore discard changes without partially modifying the permanent file area.

Draft item IDs are temporary. Do not persist one in your own table expecting it to remain a permanent file reference.

## 7.30 CSRF and forms

The Forms API integrates `sesskey` handling for normal form submissions, but it does not replace capability checks or record-level authorization.

CSRF protection answers whether the state-changing request belongs to the active session. Authorization answers whether this user may perform the action on this resource. Both are required where applicable.

## 7.31 Dynamic Forms

`\core_form\dynamic_form` lets the same Forms API ideas work over AJAX, frequently inside a modal.

A dynamic form still defines fields in `definition()`, but also implements methods to determine context, verify access, prepare initial data, process submission, and provide the page URL.

```php
final class edit_item_dynamic_form extends \core_form\dynamic_form {
    protected function get_context_for_dynamic_submission(): \context {
        return \context_system::instance();
    }

    protected function check_access_for_dynamic_submission(): void {
        require_capability(
            'tool/catalog:manage',
            $this->get_context_for_dynamic_submission(),
        );
    }
}
```

The business operation should still live outside the form so a normal page, modal, CLI command, or Web Service can share the same rule.

## 7.32 Forms inside modals

A short contextual edit is a good modal candidate. A forty-field configuration screen with editors and file managers probably deserves its own page.

The modal changes the presentation container, not the security model. Context, capability, parameter validation, and server-side business rules remain mandatory.

## 7.33 `moodleform_mod`

Activity Module configuration forms extend `moodleform_mod`, not ordinary `moodleform`. This specialized class integrates standard activity settings such as intro, groups, availability, and completion.

Do not use it in unrelated plugin types merely because it appears more powerful. It belongs to the Activity Module lifecycle.

## 7.34 A healthy edit-page flow

A conventional page should be easy to read from top to bottom:

```php
$id = optional_param('id', 0, PARAM_INT);

$context = context_system::instance();
require_login();
require_capability('tool/catalog:manage', $context);

$record = $id ? $repository->get($id) : null;
$form = new \tool_catalog\form\edit_item_form($url);

if ($form->is_cancelled()) {
    redirect($returnurl);
}

if ($data = $form->get_data()) {
    $service->save($data, $record);
    redirect($returnurl, get_string('changessaved'));
}

if ($record) {
    $form->set_data($record);
}

echo $OUTPUT->header();
$form->display();
echo $OUTPUT->footer();
```

If saving requires another hundred lines in this file, the missing abstraction is not another form method but a domain or service layer.

## 7.35 Exercise - CRUD with traditional and dynamic forms

Build a small catalog CRUD with fields for name, code, description, status, and enabled state.

Requirements:

1. define the form under `classes/form/`;
2. use appropriate `PARAM_*` types;
3. validate a unique code while also protecting uniqueness with a database index;
4. use an editor correctly for formatted description;
5. keep persistence in a separate service;
6. handle cancel without side effects;
7. implement the same edit operation as a Dynamic Form in a modal;
8. deliberately forge hidden fields and bypass JavaScript to verify server rules remain correct.

A well-designed form is not one that works only when a user follows the UI perfectly. It is one where the server remains consistent even when the request bypasses the UI entirely.

## Technical references consulted

* Moodle Developer Resources. Forms API.
* Moodle Developer Resources. Form usage.
* Moodle Developer Resources. Repeat elements.
* Moodle Developer Resources. Files in Forms.
* Moodle PHP Documentation. `core_form\dynamic_form`.
* Moodle PHP Documentation. `moodleform_mod`.
