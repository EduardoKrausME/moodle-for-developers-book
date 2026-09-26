{% raw %}

# 17 ACTIVITY MODULES

If there is one plugin type where Moodle stops looking like a collection of PHP pages and starts revealing the complete platform architecture, it is the activity module. A `mod` is not merely a plugin that places one item in a course because, from the moment the activity appears in the teacher's chooser, it participates in a series of Moodle contracts such as its own context, visibility, availability, groups, calendar, grades, completion, files, backup, restore, duplication, events, and navigation. That is precisely why a simple module can begin with a few hundred lines and grow quickly once it integrates correctly with the rest of the platform.

The first contact with a `mod` is often deceptively simple. A developer creates `mod/minhaatividade`, adds a `view.php`, stores one record in a table, and sees the link appear in the course, so it looks finished. In practice only the visible part was built, because Moodle has already created a record in `course_modules`, placed it in a course section, defined context, started considering availability, exposed the activity to backup, and probably opened the door to groups, completion, and the gradebook. If the plugin ignores these relationships it may work in a test scenario, but inconsistencies begin appearing when a teacher duplicates the activity, restores the course in another environment, changes its section, enables groups, or configures a completion condition.

In this chapter we will build our understanding of an activity module from these relationships, always separating what belongs in the activity's own table, what belongs in `course_modules`, and what belongs to other Moodle subsystems. The goal is not to memorize callbacks, but to understand why each exists and which problem it solves.

## 17.1 What is an activity module?

An activity module is a plugin of type `mod`, installed inside `mod/` or, on Moodle 5.1 and later with the new public directory, inside the corresponding public tree. Its Frankenstyle name follows `mod_nome`, so an activity called `confidence` is identified as `mod_confidence` and normally lives in `mod/confidence`.

The key point is that an instance of the module exists inside a course. That sounds simple, but it changes almost everything compared with a `local` plugin because the instance receives a `course module`, belongs to a section, can be hidden, moved, duplicated, restricted by availability, use groups and completion, and participate in gradebook and calendar.

Moodle does not treat the activity merely as one row in the plugin's table. It treats it as a course entity.

That is why I like to summarize a `mod` this way: the plugin table stores what is specific to the activity, while Moodle stores everything common to all activities. If you duplicate in your own table information Moodle already maintains in `course_modules`, `course_sections`, gradebook, completion, or calendar, you create two sources of truth and sooner or later they diverge.

## 17.2 When a `mod` is the correct choice

Use an activity module when a teacher genuinely needs to add an instance to the course and a learner or teacher needs to interact with that instance as part of the learning structure. A quiz, forum, book, assignment, poll, or confidence activity makes sense as `mod` because each instance belongs to a course, appears in a section, has its own name, and may be configured differently from another instance.

The mistake appears when a developer chooses `mod` merely because learners need to access a page. If the functionality is global, administrative, or independent of an instance placed in a section, perhaps `local`, `tool`, `report`, or another type represents the problem better. In the opposite direction, turning a learning activity into `local` normally forces the developer to manually rebuild everything Moodle already provides to `mod`, such as the activity chooser, duplication, availability, and completion.

It is worth returning to a distinction from the beginning of the book. Code specific to an activity normally exists because that instance was created in the course, but a `mod` plugin can also react to events triggered by other activities when that makes architectural sense and the dependency is handled correctly. The fact that the plugin is `mod` does not mean its PHP can only run when somebody opens its own `view.php`.

## 17.3 Anatomy of a module

A real activity structure may look like this:

```
mod/example/
├── backup/
│   └── moodle2/
├── classes/
│   ├── event/
│   ├── output/
│   └── form/
├── db/
│   ├── access.php
│   ├── install.xml
│   └── upgrade.php
├── lang/
│   ├── en/
│   │   └── example.php
│   └── pt_br/
│       └── example.php
├── pix/
│   └── icon.svg
├── templates/
├── index.php
├── lib.php
├── mod_form.php
├── version.php
└── view.php
```

This is not a list of mandatory files for every module because the exact contents depend on the features used, but some pieces practically define the type. `lib.php` contains callbacks expected by core, `mod_form.php` or its variant under `classes/mod_form.php` defines the create/edit form, `view.php` is the standard instance entry point, the main table stores activity-specific data, and `db/access.php` normally defines at least capabilities for adding and viewing the activity.

As the module grows, backup files, event classes, output, additional forms, tasks, Web Services, and the other pieces we have already studied appear. The important part is that all of them continue following the same APIs. An activity does not gain permission to invent a parallel architecture simply because it is a `mod`.

## 17.4 The module's main table

Moodle requires the module to have a main table with the same short name as the activity. If the plugin is `mod_confidence`, the main table is `{confidence}`. This table represents the instance and normally contains configuration specific to that activity.

The expected basic fields are `id`, `course`, `name`, `timemodified`, `intro`, and `introformat`. `id` is the primary key, `course` references the course, `name` stores the name entered by the teacher, `timemodified` records the instance's most recent change, while `intro` and `introformat` form the standard pair used for the activity description when the module declares support for `FEATURE_MOD_INTRO`.

An initial schema could look like this:

```
example
    id
    course
    name
    intro
    introformat
    timemodified
    allowchange
    showresults
```

The final two fields would be specific to our example. That distinction is exactly what matters: `course` and `name` participate in the module contract, while `allowchange` and `showresults` represent behavior exclusive to this activity.

## 17.5 The `course` field

`course` stores the ID of the course the instance belongs to, but that does not mean this field replaces `course_modules.course`. The two records exist at different architectural levels and core manages their association during creation, update, duplication, and restore.

The value remains useful for queries and validation inside the activity, but when you already have `$cm` and `$course` there is no reason to fetch everything again merely because `course` exists in the plugin table. Small unnecessary queries like this become meaningful when repeated thousands of times.

## 17.6 The `name` field

`name` is the instance name displayed on the course page and in several Moodle interfaces. It must be treated as user-supplied content, so output normally goes through `format_string()` in the proper context.

It is tempting to create another field such as `title` and start deciding on every page whether to show `name` or `title`, but that is only justified when they are genuinely different concepts. If it is simply the activity name, use the field Moodle expects.

## 17.7 `intro` and `introformat`

`intro` is not just another textarea. It normally receives editor content and therefore needs to travel together with `introformat` so Moodle knows how that content must be processed. When the module declares `FEATURE_MOD_INTRO`, the standard form integrates the description with normal activity behavior and, depending on supported options, the teacher may even decide whether the description appears on the course page.

On output, do not use `echo $instance->intro`. Use Moodle formatting APIs because the text may include filters, embedded files, security rules, and an associated format.

## 17.8 `timemodified`

`timemodified` is normally updated in `add_instance()` and `update_instance()`. Do not turn this field into a history mechanism because it represents only the most recent change to that instance. If the plugin needs auditing, create appropriate events or a dedicated structure rather than overloading a simple timestamp with responsibilities it does not have.

## 17.9 Relationship between the plugin table and `course_modules`

This is one of the most important points in the chapter. When a teacher creates an activity, Moodle does not only insert into `{example}`. It also maintains a record in `{course_modules}`, and that record is the link between the plugin instance and the course structure.

Think of it like this:

```
course_modules.id = CMID
course_modules.course = curso
course_modules.module = tipo do módulo
course_modules.instance = example.id
course_modules.section = seção do curso
```

The `id` received by `view.php` is normally the `cmid`, not the ID of table `{example}`. This distinction explains a large number of beginner-module bugs because the developer receives `id=37`, queries `{example}` using `id=37` and it happens to work in development while the IDs coincide, until one day they do not.

## 17.10 `course_module`, `course_modules`, and `cm_info`

The similar names make the structures easy to confuse. `{course_modules}` is the persistent database table while `cm_info` is the optimized representation Moodle uses when working with activity information inside a course. In modern code, when navigating course activities, visibility, availability, or metadata used for rendering, working with `get_fast_modinfo()` and `cm_info` objects is often more appropriate than querying `{course_modules}` manually.

This matters because `cm_info` does not represent only table columns. It includes computed state, cache, and information from other subsystems. If your code runs a huge SQL query to reconstruct something `get_fast_modinfo()` already provides, stop and verify whether you are duplicating core logic.

## 17.11 The `lib.php` of an activity is special

In Chapter 3 we insisted that `lib.php` should remain small, and the rule still applies here even though activity modules depend on several global callbacks core locates by name. Current documentation treats `lib.php` as a legacy bridge between core and plugin, so the objective is not to place the entire application there but to implement expected callbacks and delegate to classes when logic grows.

A healthy `lib.php` may contain `example_add_instance()`, `example_update_instance()`, `example_delete_instance()`, `example_supports()`, and some callbacks specific to APIs the module uses. What it should not become is a disguised service class with two thousand lines of business logic.

## 17.12 Mandatory callbacks

For an activity module, three functions are fundamental:

```php
function example_add_instance($data, $mform = null): int;
function example_update_instance($data, $mform): bool;
function example_delete_instance($id): bool;
```

These callbacks form the basic instance lifecycle. The first creates, the second updates, and the third removes. Their simple signatures hide significant responsibility because the module must maintain its own table and everything directly connected to creation, editing, and deletion of an instance.

## 17.13 `add_instance()`

`example_add_instance()` receives data already processed by the standard activity form flow and must insert the instance into the main table, as well as prepare structures that depend on that instance existing.

A simple example:

```php
function example_add_instance($data, $mform = null): int {
    global $DB;

    $data->timemodified = time();
    return $DB->insert_record('example', $data);
}
```

A real activity may also need to save editor files, create a grade item, calendar events, or auxiliary data. The caution is not to hide an enormous sequence inside the callback. The callback can coordinate the flow and call plugin services while keeping `lib.php` understandable.

## 17.14 The ID returned by `add_instance()`

The callback returns the ID of the activity's main-table record, not the `cmid`. Core uses that value to complete the association in `course_modules.instance`.

This distinction must be very clear because within the same flow you may have the `coursemodule` field received in `$data`, the `course` field, the newly created activity ID, and later the `cmid`, all representing different things. Naming all of them `$id` is an excellent way to create a bug that takes hours to understand.

## 17.15 `update_instance()` and the `instance` field

During editing Moodle makes the instance ID available in `$data->instance`, so it is common to convert that value into `id` before calling `$DB->update_record()`.

```php
function example_update_instance($data, $mform): bool {
    global $DB;

    $data->id = $data->instance;
    $data->timemodified = time();
    return $DB->update_record('example', $data);
}
```

This callback is also a natural place to synchronize structures derived from configuration, such as grade items and calendar events, while still keeping coordination separate from business rules.

## 17.16 `delete_instance()` means more than deleting one row

When an activity is removed from the course, `example_delete_instance()` needs to remove data belonging to that instance. If there are child tables, plugin-owned files, internal grading structures, or external resources controlled by the plugin, this is where cleanup needs to be considered.

```php
function example_delete_instance($id): bool {
    global $DB;

    if (!$instance = $DB->get_record('example', ['id' => $id])) {
        return false;
    }

    $DB->delete_records('example_answers', ['exampleid' => $id]);
    $DB->delete_records('example', ['id' => $id]);

    return true;
}
```

Do not manually delete rows from core tables. Moodle manages the general course-module structures; the plugin manages what belongs to the plugin. This boundary prevents inconsistent deletions.

## 17.17 `supports()` is the module's technical-feature contract

`example_supports()` tells core which Moodle features the module knows how to integrate with. Do not confuse this with a user capability. `FEATURE_GROUPS` does not say who may use groups; it says the module knows how to work with groups. `FEATURE_COMPLETION_TRACKS_VIEWS` does not grant permission to complete; it says the module understands view-based completion.

A modern example may look like this:

```php
function example_supports(string $feature): bool|string|null {
    return match ($feature) {
        FEATURE_GROUPS => true,
        FEATURE_GROUPINGS => true,
        FEATURE_MOD_INTRO => true,
        FEATURE_COMPLETION_TRACKS_VIEWS => true,
        FEATURE_GRADE_HAS_GRADE => true,
        FEATURE_BACKUP_MOODLE2 => true,
        FEATURE_SHOW_DESCRIPTION => true,
        FEATURE_MOD_PURPOSE => MOD_PURPOSE_ASSESSMENT,
        default => null,
    };
}
```

The `default => null` detail matters. Returning `false` for an unknown feature and returning `null` do not necessarily mean the same thing to every consumer, so follow the contract of the specific feature.

## 17.18 `FEATURE_MOD_PURPOSE`

Purpose tells Moodle which category the activity belongs to and participates in presentation inside the activity chooser. In Moodle 5.1 this contract became more important, with `FEATURE_MOD_PURPOSE` as the primary purpose and optional `FEATURE_MOD_OTHERPURPOSE` as a secondary purpose.

Current purposes include administration, assessment, collaboration, communication, interactive content, resources, and others. Choosing `MOD_PURPOSE_ASSESSMENT` merely because the activity has a grade is too simplistic. Purpose should represent the activity's primary role in the course, not a secondary characteristic.

## 17.19 `FEATURE_MOD_OTHERPURPOSE`

Starting with Moodle 5.1, an activity can declare a second purpose when that genuinely improves classification. A discussion activity that is also strongly communication-oriented might use collaboration as the primary purpose and communication as the secondary purpose, for example.

If the plugin supports branches older than 5.1, compatibility needs planning. Chapter 29 will go deeper into compatibility strategies, but already keep one rule in mind: do not copy a new constant into code claiming to run on a version where that constant does not exist without protection.

## 17.20 Other `FEATURE_*`

Common module features include `FEATURE_GROUPS`, `FEATURE_GROUPINGS`, `FEATURE_MOD_INTRO`, `FEATURE_SHOW_DESCRIPTION`, `FEATURE_COMPLETION_TRACKS_VIEWS`, `FEATURE_COMPLETION_HAS_RULES`, `FEATURE_GRADE_HAS_GRADE`, `FEATURE_GRADE_OUTCOMES`, `FEATURE_BACKUP_MOODLE2`, and `FEATURE_QUICKCREATE`.

Do not declare support merely to make an option appear in the interface. When you return `true`, you are telling core the module implements the expected behavior. If you declare groups and then completely ignore group mode when listing data, the interface promises one thing while access rules deliver another.

## 17.21 The activity form

The create/edit form of an activity is a special case of the Forms API studied in Chapter 7. The class must be called `mod_example_mod_form` and extend `moodleform_mod`.

Historically this class lived in `mod/example/mod_form.php`, and that path is still widely used. Current documentation also permits, under conditions supported by core, locating the class in `mod/example/classes/mod_form.php`, but the class name continues following the historical `mod_[modname]_mod_form` contract.

This is a good example of Moodle's gradual transition. Not everything old can simply be renamed into a modern namespace because core still needs to discover the class by convention during the activity-editing flow.

## 17.22 `moodleform_mod`

`moodleform_mod` specializes `moodleform` for activity context. It does more than add two standard buttons because it integrates the form with course-module elements such as availability, groups, completion, tags, and other site-enabled features.

Creating a normal form and manually rebuilding those options would therefore be a step backward. When the screen genuinely is the activity configuration form, use `moodleform_mod`.

## 17.23 `definition()`

The structure remains similar to other Moodle forms:

```php
class mod_example_mod_form extends moodleform_mod {
    public function definition(): void {
        $mform = $this->_form;

        $mform->addElement('text', 'name', get_string('name'), ['size' => 64]);
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        $this->standard_intro_elements();
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
```

Order matters. First come module-specific fields and introduction elements when used, then standard course-module elements, and finally actions. This preserves the experience teachers already know from other activities.

## 17.24 `standard_intro_elements()`

When the module uses `intro` and `introformat`, this function prevents each activity from rebuilding the same editor manually. Besides visual consistency, it reduces the chance of forgetting processing details and files associated with the editor.

If the activity does not use an introduction, do not add these fields merely because they appear in nearly every example. First decide the module contract, then declare coherent features, and only then build the form.

## 17.25 `standard_coursemodule_elements()`

This call injects standard elements belonging to the relationship between activity and course. Availability, groups, completion, and other controls appear there according to site configuration and features declared by the module.

The developer should not duplicate `visible`, `groupmode`, or availability fields inside the main plugin table merely because they need to appear in the form. Core already has a storage and lifecycle for that information.

## 17.26 `add_action_buttons()`

Save and cancel buttons may look like the least interesting part of the form, but even they participate in Moodle's expected behavior. Avoid inventing a completely different footer for a form that should follow the normal activity-editing flow.

Special interfaces can exist, but the main create/edit form benefits from looking and behaving like the rest of the platform.

## 17.27 `defaults_preprocessing()`

When persisted data does not exactly match the format expected by a form element, `defaults_preprocessing()` lets you adjust values before filling the editing form.

This avoids a common workaround of changing database format merely to make the interface convenient. Persistence and form representation do not need to be identical as long as conversion is explicit and predictable.

## 17.28 What not to put in `mod_form.php`

Avoid heavy queries, external calls, data mutations, and extensive business rules inside the form definition. A form may need to load options, but that does not justify turning `definition()` into an integration service.

Think about operational cost: every time a teacher opens activity editing, this code runs. If constructing one select calls an external API without cache and appropriate timeout, the whole configuration screen now depends on that service.

## 17.29 `view.php`

`view.php` is the standard entry point for viewing an instance. The conventional `id` parameter is the `cmid`, and from it you obtain the course, course module, and plugin-specific activity record.

A modern base can begin like this:

```php
require('../../config.php');

$id = required_param('id', PARAM_INT);

[$course, $cm] = get_course_and_cm_from_cmid($id, 'example');
$instance = $DB->get_record('example', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

This flow is much better than receiving an instance ID and manually trying to discover course and context. `cmid` is precisely the key connecting the page to the course structure.

## 17.30 `require_login($course, true, $cm)`

Passing the course module into `require_login()` lets Moodle apply checks related to activity access, including availability. This matters because an activity can be visible in the course yet unavailable to a particular user due to date, grade, completion of another activity, or a combination of conditions.

Rebuilding those conditions manually in `view.php` would be a very poor idea. Let core enforce what belongs to core and implement only plugin-specific rules.

## 17.31 Module context

Each instance has a `context_module`. Capabilities controlling internal actions of the activity should normally be checked in this context.

```php
$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

Do not use `context_course` merely because the activity belongs to a course. If the permission concerns that instance, the most specific context is generally the module context. This allows permission overrides on one activity without changing all the others.

## 17.32 `$PAGE` inside the activity

After resolving the course, course module, and context, configure the page with the correct URL, title, and heading. Avoid producing HTML before preparing page state because navigation, theme, breadcrumb, and several integrations depend on it.

```php
$PAGE->set_url(new moodle_url('/mod/example/view.php', ['id' => $cm->id]));
$PAGE->set_title(format_string($instance->name));
$PAGE->set_heading(format_string($course->fullname));
```

From there use the Output API and Mustache as covered in Chapter 6, without creating `renderer.php` solely to forward a template.

## 17.33 Marking a view for completion

If the module declares `FEATURE_COMPLETION_TRACKS_VIEWS`, a valid view should inform the completion system.

```php
$completion = new completion_info($course);
$completion->set_module_viewed($cm);
```

Documentation recommends doing this before printing the header so availability changes depending on that completion can be reflected correctly within the same navigation. Do not mark a view before access is validated because an unsuccessful attempt to open the activity should not become completion.

## 17.34 The `course_module_viewed` event

Alongside completion, an activity normally triggers a view event. The event supports logs, analytics, and integrations observing what happened.

Do not confuse marking completion with triggering an event. These are different subsystems and may both be necessary. The event records a fact while completion changes progress state according to configured rules.

## 17.35 `index.php`

Historically each module implemented a page listing all instances of that activity type in one course. Starting in Moodle 5.0, core provides a consolidated Activities view and `index.php` can redirect users to that page through activityoverviewbase::redirect_to_overview_page(), so the old index page no longer needs to be the place where every module reinvents its own listing.

This is a useful example of an API that changed over time. If you find an older plugin with a huge table in `index.php`, do not assume you should copy it. Check current core behavior and the plugin's minimum supported version.

### 17.35.1 Activity Overview is a module integration, not merely a redirect

Redirecting index.php solves navigation, but a Moodle 5.0 module can genuinely participate in the new Activities page by providing its own data. That is what the mod_PLUGINNAME\courseformat\overview class is for, located in classes/courseformat/overview.php and derived from \core_courseformat\activityoverviewbase.

Even without extra fields, the base class lets core present common information such as name and completion where applicable. The plugin should add only what belongs to its own domain, such as due date, submission state, or a primary action.

### 17.35.2 Minimum structure of classes/courseformat/overview.php

```
namespace mod_example\courseformat;

use core_courseformat\activityoverviewbase;

final class overview extends activityoverviewbase {
    // O core já fornece itens básicos; sobrescreva apenas o que o módulo precisa.
}
```

Do not confuse this class with a page renderer. It is the activity module's integration with course format and returns overview objects core can present, filter, and reuse in other contexts.

### 17.35.3 get_extra_overview_items()

Module-specific information enters through get_extra_overview_items(), which returns an array of overviewitem objects indexed by shortname. The value participates in filters and metadata while content is what is displayed; when information does not apply to the current user, returning null is better than exposing a useless column or calculating expensive data for everyone.

```php
use core_courseformat\local\overview\overviewitem;

#[\Override]
public function get_extra_overview_items(): array {
    return [
        'submitted' => new overviewitem(
            name: get_string('submitted', 'mod_example'),
            value: $this->has_submission(),
            content: $this->has_submission() ? get_string('yes') : get_string('no'),
        ),
    ];
}
```

### 17.35.4 Due date and primary action

The page has specific extension points for due date and the primary action. If the module has a deadline, implement get_due_date_overview(); if it has a useful action such as opening pending submissions or answering the activity, implement get_actions_overview(). This avoids throwing everything into generic columns and lets core understand the semantic role of the data.

Do not calculate dates or actions by manually querying another module's tables. The overview class belongs to its own component and should use that component's internal APIs while respecting context and capabilities just like a normal page.

### 17.35.5 Dependency Injection inside Activity Overview

One especially interesting detail in Moodle 5.0 is that the overview class is loaded using Dependency Injection. The constructor needs to preserve the cm_info expected by the base class, but it may receive other dependencies such as moodle_database, a plugin service, or \core\clock. This lets you calculate dates and state without hiding globals again inside the integration.

```php
public function __construct(
    \cm_info $cm,
    private readonly \moodle_database $db,
    private readonly \core\clock $clock,
) {
    parent::__construct($cm);
}
```

This shows in practice why Dependency Injection was introduced in Chapter 4 before Hooks and modules. The API is not adding ceremony; it lets a core integration point receive testable dependencies without turning every method into a collection of globals.

## 17.36 Course sections

An activity belongs to a course section, but the section is not owned by the activity table. The relationship lives in `course_modules` and `course_sections` and is managed by the course subsystem and course format.

If you need to discover where the activity is, move it, or reorganize modules, use appropriate course APIs instead of updating `course_modules.section` directly. Manual changes may leave caches and section sequences inconsistent.

## 17.37 The activity chooser

When a teacher enables editing and asks to add an activity or resource, your module enters the activity chooser. Name, icon, capabilities, and purpose influence that experience.

The `mod/example:addinstance` capability controls who may create the activity, while `FEATURE_MOD_PURPOSE` helps Moodle classify it. In Moodle 5.1 the activity chooser was also internally refactored and began using new attributes in course-format rendering, reinforcing an important rule: activity plugins should depend on the public chooser contract, not details of theme or format HTML.

## 17.38 Activity icon

The module should provide an appropriate icon, normally in `pix/icon.svg`. Moodle applies visual treatment according to context and activity purpose.

Do not place text inside the icon, depend on a fixed size, or try to encode final color into the SVG when core expects an icon compatible with the visual system. Also remember that chooser category color is not a free decision of the SVG because the declared purpose participates in that presentation.

## 17.39 Minimum capabilities

Two capabilities appear in practically every module:

```
'mod/example:addinstance'
'mod/example:view'
```

`addinstance` normally uses `CONTEXT_COURSE` because the action is adding a new activity to the course. `view` normally uses `CONTEXT_MODULE` because permission concerns one specific instance.

This does not prevent additional capabilities such as `mod/example:manage`, `mod/example:viewreports`, `mod/example:submit`, or `mod/example:grade`. What matters is modeling real actions and checking them in the correct context.

## 17.40 Capability does not replace business rules

Returning to Chapter 8, even inside a module it is not enough to check a generic capability and assume any record sent by the client belongs to the current activity. If the URL receives `answerid=900`, load the response and confirm it belongs to `$instance->id`, in addition to checking the required capability.

This avoids IDOR between different instances of the same module, an easy mistake when all records live in one auxiliary table.

## 17.41 Groups

If the activity declares `FEATURE_GROUPS` or `FEATURE_GROUPINGS`, the standard interface allows group mode and grouping configuration. From that point onward, the plugin must respect those settings when listing and accepting data.

```php
$groupmode = groups_get_activity_groupmode($cm);
$currentgroup = groups_get_activity_group($cm, true);
```

For a teacher with `moodle/site:accessallgroups`, behavior may differ from a learner's behavior. Instead of inventing your own membership interpretation, use the Groups API because it already accounts for visibility and permissions.

## 17.42 No groups, separate groups, and visible groups

`NOGROUPS` means the activity does not separate participants by group. `SEPARATEGROUPS` normally limits interaction and visibility to the permitted group, while `VISIBLEGROUPS` allows other groups to be seen according to the nature of the activity.

Do not treat visible groups like separate groups merely because that makes the SQL easier. The plugin needs to define behavior that makes sense for the feature while remaining within Moodle's visibility contract.

## 17.43 `groups_get_activity_allowed_groups()`

When you need to discover which groups a user can access in that activity, this API is much safer than manually fetching memberships and forgetting `accessallgroups`, groupings, or visibility rules.

The general rule remains the same as in earlier chapters: if a core API already knows context, user, and activity configuration, use it before trying to reconstruct everything in SQL.

## 17.44 Events

Modules are excellent event producers because they represent concrete learning actions. Viewing, submitting, changing an answer, grading, and completing an attempt are examples of facts that may deserve their own events.

Events should represent something that already happened. If another component needs to intervene before the operation, that belongs to a Hook or another extension mechanism, not an observer reacting afterward.

## 17.45 Instance CRUD events

Activity creation, update, and deletion already participate in known Moodle flows. When creating additional events, avoid duplicating facts core already records without a reason.

On the other hand, internal module-specific actions deserve their own events when relevant to logs, reports, analytics, or auditing. A `mod_confidence`, for example, could trigger an event when a user records or changes their confidence level.

## 17.46 Calendar

If an activity has an opening date, closing date, due date, or another milestone meaningful to the user, the Calendar API lets you create events linked to the module.

A common mistake is creating the event inside `add_instance()` and forgetting to update it in `update_instance()` or remove it when the date is disabled. Think of calendar state as derived from activity configuration, so creation, editing, and deletion need to remain synchronized.

## 17.47 Gradebook

If the activity awards a grade, do not create your own table and expect Moodle to discover that grade. The plugin needs to integrate with the Gradebook API and declare appropriate support, normally including `FEATURE_GRADE_HAS_GRADE`.

An activity generally implements callbacks such as `example_grade_item_update()` and uses `grade_update()` to create or update the grade item. When user grades exist, they also need to be sent through the gradebook's expected contract.

Chapter 21 will go deeper into this API, but the rule here is simple: the activity's internal tables may store detail required to calculate a grade, but the official grade visible in Moodle must reach the gradebook.

## 17.48 Do not write directly to grade tables

Never treat `{grade_items}` or `{grade_grades}` as normal plugin tables. Grade calculations, regrading, locks, overrides, and other relationships are involved and are easy to break with a direct `update_record()`.

Use the Gradebook API. It may appear more laborious in the first implementation, but it prevents a whole class of inconsistencies that only appear when the teacher changes grade configuration or recalculates the course.

## 17.49 Completion

Activity completion may be manual, based on view, grade, or module-specific rules. The activity declares support through `supports()` and implements the corresponding behavior.

For view-based completion we already saw `set_module_viewed()`. For custom rules the plugin needs to expose configuration fields, report supported rules, and update state when the user reaches or loses the condition according to the API model.

## 17.50 Completion is not availability

Completion answers whether the activity is complete. Availability answers whether a user may access a given activity or section. One may be used as a condition for the other, but they are different concepts.

This matters because a lot of custom logic mixes both ideas into one field called `status`. Moodle already has separate subsystems, so use each for the problem it solves.

## 17.51 Files in modules

A module may have several file areas, for example introduction files, instance attachments, user-uploaded files, and private materials. Every file area needs a clear meaning, coherent itemid, and `pluginfile()` callback where content needs controlled serving.

Do not create `uploads/` inside `mod/example`. Everything from Chapter 9 still applies, including the possibility that `filedir` is backed by alternative storage.

## 17.52 `mod_example_pluginfile()`

The `pluginfile()` callback is the authorization boundary before delivering a module's private file. A skeleton might begin like this:

```php
function mod_example_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($context->contextlevel !== CONTEXT_MODULE) {
        return false;
    }

    require_login($course, true, $cm);
    require_capability('mod/example:view', $context);

    // Validar filearea, itemid e relação com a instância antes de obter o arquivo.
}
```

The most important part is in the comment. Do not use `send_stored_file()` before confirming that `itemid` genuinely belongs to the instance and the user may access that specific object.

## 17.53 Introduction editor files

When `intro` accepts embedded files, the editor flow needs to move files from the draft area into the permanent file area and rewrite `@@PLUGINFILE@@` according to File and Forms API conventions.

Do not turn HTML stored in the database into a set of absolute URLs for `moodledata` because that breaks restore, domain changes, and alternative storage.

## 17.54 Backup and restore are not optional for a serious module

Technically you can install an activity without implementing backup, but operationally that is usually unacceptable. Teachers expect course backup, import, restore, and duplication to work.

When the module declares `FEATURE_BACKUP_MOODLE2`, it is saying it implements that contract. Files under `backup/moodle2/` describe how activity-owned data enters the backup and how it is recreated at the destination.

## 17.55 Activity backup structure

A typical implementation uses classes such as:

```
backup_example_activity_task.class.php
backup_example_stepslib.php
restore_example_activity_task.class.php
restore_example_stepslib.php
```

The task organizes work and the step describes the data structure. During backup you create `backup_nested_element`, link elements hierarchically, define sources, and annotate IDs or file areas requiring special treatment.

We will not repeat Chapter 24 here, but you need to leave this chapter understanding that auxiliary activity data does not magically enter `.mbz` merely because it contains a `exampleid` column.

## 17.56 IDs cannot be restored as though they were universal

If your table stores `userid`, `groupid`, file IDs, IDs of other activities, or any reference to records recreated at the destination, restore must map those values.

Copying the old ID literally may point to a different person or object in the new course. Backup/restore mappings exist precisely because database IDs are local to an installation and restore process.

## 17.57 Duplicating an activity depends on backup and restore

When a teacher uses Duplicate, Moodle does not call some magical `clone()` on your table. Duplication uses the activity's backup and restore infrastructure.

That is why a plugin can look perfect until a teacher duplicates an instance and discovers only the main table was copied while answers, child configuration, or files disappeared. Testing duplication needs to be part of the checklist for any module storing more than the basic fields.

## 17.58 Backup without user data

Course backup may be created with or without user information. The module needs to classify correctly which data belongs to activity configuration and which belongs to participants.

A question created by a teacher may be part of the activity structure, while an answer submitted by a learner is user data. If you ignore `$userinfo`, you may export personal data when the backup was supposed to contain only structure.

## 17.59 `index.php`, backup, and the complete lifecycle

It is useful to notice that traditional files of a `mod` are not independent. `mod_form` creates configuration, `add_instance()` persists it, `view.php` presents it, Events record actions, gradebook receives grades, completion receives progress, pluginfile serves files, Calendar shows dates, and backup transports the complete object to another course.

Module quality appears when these flows stay coherent after editing, duplication, restore, and deletion. If every part was built as an island, the first operation outside the happy path exposes the inconsistency.

## 17.60 An example project

Imagine `mod_checkpoint`, a short activity where the teacher creates a checkpoint with a question and the learner records a short answer that may receive a simple grade. The main table could be:

```
checkpoint
    id
    course
    name
    intro
    introformat
    questiontext
    questionformat
    grade
    timeopen
    timeclose
    timemodified
```

And an answers table:

```
checkpoint_answers
    id
    checkpointid
    userid
    answertext
    answerformat
    grade
    timemodified
```

Notice how many decisions arise without inventing any exotic feature. `checkpointid` needs an index, the answer needs to belong to the correct instance, groups may limit reports, the grade needs to reach gradebook, dates may enter calendar, answers are user data in backup, embedded files need the File API, completion may depend on submission or grade, and capabilities need to separate answering from grading.

## 17.61 A slim `lib.php` in the project

`lib.php` does not need to implement all of that directly. It can coordinate services:

```php
function checkpoint_add_instance($data, $mform = null): int {
    return \mod_checkpoint\local\instance_manager::create($data, $mform);
}

function checkpoint_update_instance($data, $mform): bool {
    return \mod_checkpoint\local\instance_manager::update($data, $mform);
}

function checkpoint_delete_instance($id): bool {
    return \mod_checkpoint\local\instance_manager::delete($id);
}
```

The `local` namespace inside the component, discussed in Chapter 4, is suitable for internal implementation that is not part of the plugin's public API. Core can still find the old callbacks it requires while business rules stay in autoloaded classes.

## 17.62 A slim `view.php` in the project

The same applies to `view.php`. It resolves request, security, and context, delegates data preparation to classes, and then sends a simple context to Mustache.

```php
$id = required_param('id', PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($id, 'checkpoint');
$checkpoint = $DB->get_record('checkpoint', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/checkpoint:view', $context);

$viewmodel = \mod_checkpoint\local\view_factory::for_user(
    $checkpoint,
    $cm,
    $USER->id
);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_checkpoint/view', $viewmodel);
echo $OUTPUT->footer();
```

Notice what is not here. There are no fifty lines of SQL, no concatenated HTML, no improvised group rule, and no direct call to `renderer.php` merely to forward a template.

## 17.63 Common error: using the wrong ID

Perhaps the most classic module bug is mixing `cmid` with the instance ID. Avoid generic names and make the difference explicit:

```php
$cmid = required_param('id', PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($cmid, 'checkpoint');
$checkpointid = $cm->instance;
```

When an internal URL points to `view.php`, it normally uses `id => $cmid`. When querying the main table, use `$checkpointid`. It seems small, but naming them this way prevents a lot of confusion.

## 17.64 Common error: querying `course_modules` manually for everything

There are situations where SQL involving `course_modules` is legitimate, particularly in complex reports, but normal activity flows already have helpers and `get_fast_modinfo()` carrying rules, cache, and contextual information.

Before writing a join across `modules`, `course_modules`, `course_sections`, and the plugin table, ask whether the objective is simply to get `$cm` for a known instance or iterate course activities. If so, the API is normally better.

## 17.65 Common error: putting every option in the plugin table

Visibility, availability, group mode, grouping, completion, and several other states belong to the course module and related subsystems. Duplicating these values in the main table creates unnecessary synchronization.

Store only activity-specific data there. This discipline makes backup, editing, and core integration much more predictable.

## 17.66 Common error: not testing deletion

Developers test creation and editing because they are obvious actions but often forget deletion. Then the activity leaves orphan answers, files, calendar events, or external data.

A good `delete_instance()` test creates a complete instance, adds child data and files where applicable, deletes it, and verifies plugin-owned data is cleaned without incorrectly deleting shared data.

## 17.67 Common error: ignoring duplication

If teachers use the module, duplication is not a detail. It is part of the normal authoring workflow. Test a fully configured instance, duplicate it, and verify fields, child data that should be duplicated, files, calendar, grade item, and completion configuration.

User data normally should not appear in a normal activity duplication in the same way it appears in a complete backup with users, so the structure needs to respect the context of the operation.

## 17.68 Common error: creating a custom renderer out of habit

As discussed in Chapter 6, an older module may have `renderer.php` and that does not mean the file is forbidden. The problem is creating a new renderer merely because a Moodle 2.x tutorial did.

If your page prepares data and calls `render_from_template()`, do not invent a class that simply receives the same object and calls the same template. Use the Output API directly or `templatable` classes where they provide real value. Renderers still exist in core and specific APIs, but they should not be automatic boilerplate for a new module.

## 17.69 Common error: placing access control only in the menu

Hiding a button does not protect an action. If the user should not be able to grade, `grade.php`, an external function, or an AJAX action must check capability and relationship to the instance regardless of whether the button is invisible in Mustache.

The same applies to files, reports, and exports. Security belongs on the server and in the correct context.

## 17.70 Minimum checklist before considering a module finished

Before calling a module complete, create an instance, edit every field, move it between sections, hide and show it, test availability, groups, permissions, completion, grades where applicable, files, deletion, backup, restore, and duplication. Then repeat the essential flows with a learner and a teacher who does not have administrative permission.

If the module has JavaScript or AJAX, also test network failures and repeated submissions. If it integrates with an external service, turn that service off and see how the activity behaves. A `mod` lives inside an ecosystem, so the happy path represents only part of the test.

## 17.71 Exercise - create a complete activity

Create `mod_checkpoint` with a question defined by the teacher and a short learner answer. The teacher can decide whether the activity is graded, define opening and closing times, enable groups, and configure completion by submission. The learner sees the question in `view.php`, submits an answer, and may edit it while the activity remains open.

The implementation must use a main table with standard fields, an answers table with an index on `checkpointid` and coherent uniqueness for user and instance when the rule allows only one answer, `db/access.php` with separate capabilities to view, answer, and grade, `moodleform_mod` for activity configuration, and the Forms API for the answer form.

The module must declare only the `FEATURE_*` features it really supports, respect group mode, trigger an event when an answer is submitted, create or update a calendar event for the closing date, integrate with the Gradebook API when grading is enabled, and update completion when a valid answer is recorded.

Backup and restore files must transport configuration and, when `$userinfo` permits, user answers. After implementation, perform four mandatory manual tests: backup and restore into another course, duplication within the same course, activity deletion followed by residue checks, and access by a learner from a different group under `SEPARATEGROUPS`.

The most important part of the exercise is not seeing a page work. It is being able to say the activity behaves like a Moodle activity when it goes through the workflows teachers already use elsewhere on the platform.

## 17.72 Closing the chapter

Activity modules are where many decisions we studied separately begin to meet. Database, Forms API, Output API, security, Files API, Events, Calendar, Groups, Gradebook, Completion, and backup stop being isolated chapters and become one learning object inside a course.

The pattern worth keeping is simple. The plugin table stores what belongs to the activity, `course_modules` and core subsystems store what belongs to Moodle, `lib.php` implements only callbacks core still requires, internal classes handle business rules, and the interface uses modern APIs without rebuilding features that already exist. When this separation is respected, duplicating, restoring, moving, and configuring the activity stop being surprises and become normal platform behavior.

## Technical references consulted

* Moodle Developer Resources. Course overview integration, Moodle 5.0. https://moodledev.io/docs/5.0/apis/plugintypes/mod/courseoverview
* Moodle Developer Resources. Moodle 5.0 developer update, Activity overview page integration. https://moodledev.io/docs/5.0/devupdate
* Moodle Developer Resources. Activity modules. Documentation for Moodle 5.1. https://moodledev.io/docs/5.1/apis/plugintypes/mod
* Moodle Developer Resources. Form API usage. Current Forms API documentation and Activity Module usage. https://moodledev.io/docs/5.2/apis/subsystems/form/usage
* Moodle Developer Resources. Moodle 5.1 developer update. Activity Module changes, including `FEATURE_MOD_OTHERPURPOSE`. https://moodledev.io/docs/5.1/devupdate
* Moodle Developer Resources. Activity completion API. Documentation for module integration with completion. https://moodledev.io/docs/4.5/apis/core/activitycompletion
* Moodle Developer Resources. Groups API. Group modes and activity integration. https://moodledev.io/docs/5.0/apis/subsystems/group
* Moodle Developer Resources. Availability API. Availability control for activities and sections. https://moodledev.io/docs/5.1/apis/subsystems/availability
* Moodle Developer Resources. Backup API. Backup structure for activity modules. https://moodledev.io/docs/5.2/apis/subsystems/backup
* Moodle Developer Resources. Restore API. Restoring Activity Module data. https://moodledev.io/docs/5.0/apis/subsystems/backup/restore

{% endraw %}