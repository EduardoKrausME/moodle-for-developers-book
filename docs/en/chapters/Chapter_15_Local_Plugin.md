{% raw %}

# 15 LOCAL PLUGIN

There is a sentence I repeat often when someone starts developing for Moodle: a `local` plugin is not the place where we put whatever we do not know where else to put. It is a legitimate, useful, and extremely flexible plugin type, but that flexibility is exactly why it needs to be used with judgment, because when everything becomes `local` Moodle loses part of the architectural advantage of having specialized plugin types.

The official documentation is quite direct on this point and recommends using a standard plugin type whenever one exists. If what you are building is an activity a teacher adds to a course, it is probably a `mod`. If it is authentication, there is `auth`. If it is enrolment, there is `enrol`. If it is a visual block, there is `block`. If it is an administrative tool with a clearly administrative scope, `tool` often makes more sense. A `local` belongs where the functionality is genuinely institutional, cross-cutting, integration-oriented, or does not fit the contracts of specialized types correctly.

At the same time, it is important not to make the opposite mistake and treat a `local` plugin as a poor solution by definition. It is not. I use `local` plugins quite often, and so do many people working with institutional Moodle environments, because there is an enormous number of requirements that do not naturally belong to an activity, block, or enrolment method. ERP integrations, institutional synchronizations, internal business rules, administrative dashboards, event consumers, automations, custom APIs, and screens crossing several courses are all examples where `local` may be exactly the right type.

This chapter combines much of what we have seen so far and places it inside one complete project, because a real `local` plugin rarely consists only of `version.php`, `settings.php`, and one PHP page. It may have a database, capabilities, Events, Hooks, Tasks, cache, Web Services, external integrations, administrative pages, Mustache templates, and business rules, and the important part is doing all of that without turning the plugin into one giant `lib.php` with thousands of lines.

## 15.1 What a local plugin really is

A `local` plugin is a component installed inside `local/nome_do_plugin`, with Frankenstyle `local_nome_do_plugin`. It participates in Moodle's plugin system like any other component and has `version.php`, language files, namespaces, autoloading, database access, the Events API, Hooks, Tasks, cache, external services, and the other public APIs covered in previous chapters.

What changes is the purpose. A `local` does not represent a course activity, an authentication method, or a course format and does not automatically gain a specific place in the interface. It is deliberately generic and therefore may have no interface at all. A plugin that only listens to events and synchronizes data with another system may be a `local` without a single user-accessible page.

This characteristic matters. Many developers begin by thinking about a plugin from the screen they want to create, but in Moodle the first question should be which extension of the system is being implemented. The screen is a consequence. A `local` may have ten screens or none, while a `mod` exists because it represents a course activity even when its visual interface is very simple.

Moodle documentation also treats `local` as the appropriate type for functionality without a better fit among standard types, citing common cases such as consuming events to communicate with external systems, defining Web Services, applications extending Moodle at system level, administrative settings, and navigation customization.

## 15.2 When I would create a local plugin

I would consider `local` when the main problem is not tied to an entity with its own specialized plugin type, but to an institutional requirement spanning the environment. Imagine an institution has an academic ERP and needs to synchronize users, courses, enrolments, financial statuses, and registration changes. That is not an activity. It is not authentication unless the only responsibility is authenticating. It is not enrolment if the project involves much more than enrolment. An integration `local` may be appropriate.

Another case is an internal portal consolidating data from several Moodle areas. It may have administrative pages, reports, settings, scheduled tasks, AJAX endpoints, and APIs for other systems. If it does not fit `report` because it also modifies data, and does not fit `tool` because it is not merely an administrative tool and is used by different profiles, then `local` may be the correct fit.

Using `local` as an event consumer is also common. You may want to run an integration whenever a course is created, a user updated, or an activity completed. The plugin does not own those entities and should not modify the component that triggers the event. It simply observes what happens and reacts.

There are also institutional customizations that need to exist across the whole site. A specific notice, an extra rule, an integration with an internal service, an institutional page, a data automation, or a cross-cutting API may all make sense in `local`, provided there is no more specific type representing the problem better.

## 15.3 When I would not create a local plugin

The flexibility of `local` creates a strong temptation. A developer thinks that if almost anything can be implemented inside it, the fastest path is to create everything as `local`. Technically this often works. Architecturally it becomes expensive later.

If a teacher needs to add an activity to a course, configure parameters per instance, and every instance needs completion, grades, groups, backup and restore, then this looks like a `mod`. Implementing all of that manually in `local` would mean rebuilding contracts the `mod` type already provides.

If the functionality is an enrolment method, a `enrol` gains native integration with the enrolment flow, per-course instances, and subsystem-specific rules. Putting the same logic into `local` may still enrol users through APIs, but it loses semantics and integration with Moodle's model.

The same applies to authentication, filters, course formats, question types, themes, reports, and other extensions. Whenever a plugin type already represents exactly the responsibility you are implementing, start there.

There is an important difference here between "I can do it" and "I should do it." In Moodle, practically any plugin can call dozens of APIs and affect many parts of the system. Architecture does not exist to tell you what PHP permits; it exists to keep responsibilities understandable after three years, five upgrades, and three different people maintaining the project.

## 15.4 "But Kraus, you create local plugins for almost everything"

That criticism is fair, especially if you look at a list of institutional projects where `local_` appears everywhere. I do create many `local` plugins, but the reason is usually the kind of problem that reaches me. A large portion of those projects are not activities a teacher adds to a course, authentication methods, or small blocks; they are integrations, automations, dashboards, institutional rules, synchronizations, or service layers crossing many components.

The mistake would be turning that experience into a universal rule. If I need a student to open a specific activity with a course instance, completion, grades, backup, and per-activity settings, then `mod` remains the right path. If I need a rule to run whenever the user accesses any Moodle activity, I do not need to turn everything into `local` or modify every module. I can use a component observing appropriate events or Hooks and decide when to act based on the information available there.

This is a good example of choosing a plugin type from the problem domain. A `mod` exists because it is an activity. A `local` may observe the whole ecosystem when its responsibility is cross-cutting. The important thing is not choosing the type based only on which directory seems easiest to program.

## 15.5 The right question before creating the directory

Before creating `local/meuplugin`, I would ask a few questions. Does the feature represent an entity with its own plugin type? Does it need per-course instances? Does it execute only in pages of a specific component, or must it cross Moodle? Does a teacher need to add it manually? Is there a specific lifecycle such as enrolment, authentication, activity, question type, or course format? Is the interface administrative or used by multiple profiles?

These questions eliminate many unnecessary `local` plugins. If after asking them the answer remains "this is an institutional extension that does not fit a specialized type well", then `local` stops being the generic fallback and becomes a conscious architectural choice.

## 15.6 Initial structure

Let us imagine a project called `local_institutionhub`, responsible for integrating Moodle with internal institutional systems, providing a few monitoring pages, and running asynchronous synchronizations.

One possible structure starts like this.

```
local/institutionhub/
|-- classes/
|   |-- external/
|   |-- hook/
|   |-- observer/
|   |-- output/
|   |-- service/
|   |-- task/
|   `-- integration/
|-- db/
|   |-- access.php
|   |-- caches.php
|   |-- events.php
|   |-- hooks.php
|   |-- install.xml
|   |-- services.php
|   |-- tasks.php
|   `-- upgrade.php
|-- lang/
|   |-- en/
|   `-- pt_br/
|-- templates/
|-- index.php
|-- lib.php
|-- settings.php
`-- version.php
```

This does not mean every `local` plugin needs all these directories. Quite the opposite. Structure should grow as responsibilities appear. Creating ten empty directories "to look professional" only creates noise. The example exists to show how different responsibilities can be separated without concentrating everything in the main file.

## 15.7 version.php remains declarative

The `version.php` of a local plugin gets no special permission to execute business logic. It still exists to declare component metadata.

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_institutionhub';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

If the plugin depends on another component, declare the dependency when applicable rather than discovering halfway through a request that an expected class does not exist. `version.php` is not the place to query the database, call an external API, manually create a table, or run a synchronization.

## 15.8 lib.php should remain small

The `local` plugin type became historically associated with `lib.php` because several old Moodle callbacks are discovered in that file. This created many projects where `lib.php` became almost the whole application. Navigation functions, database access, HTTP, HTML, and institutional rules all ended up mixed together.

Today I would treat `lib.php` as a compatibility point for callbacks that genuinely need to live there. The function can receive Moodle's call and delegate to a class, keeping the body small and readable.

```php
function local_institutionhub_extend_navigation(global_navigation $navigation): void {
    \local_institutionhub\navigation\manager::extend($navigation);
}
```

If an equivalent modern Hook exists, prefer the Hook architecture for new code on branches you support. If you need compatibility with older versions, use the strategy discussed in the Hooks chapter rather than duplicating behavior without control.

What I would avoid is placing an entire service inside `lib.php` merely because the first entry point happened to be a callback.

## 15.9 settings.php and administrative configuration

A `local` plugin is particularly convenient for administrative configuration, including because local plugins are loaded later while the administration tree is built. Even so, the performance rule still applies. `settings.php` may be included in situations where that particular settings page will never actually be displayed, so it should not run heavy queries or call an external API unconditionally.

```php
if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_institutionhub',
        get_string('pluginname', 'local_institutionhub')
    );

    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configtext(
        'local_institutionhub/baseurl',
        get_string('baseurl', 'local_institutionhub'),
        get_string('baseurl_desc', 'local_institutionhub'),
        '',
        PARAM_URL
    ));
}
```

The configuration name should continue to follow `componente/setting`, for example `local_institutionhub/baseurl`. Moodle stores those values in `config_plugins` and code can use `get_config('local_institutionhub', 'baseurl')`.

The fact that configuration is easy to create does not mean secrets should be treated carelessly. Tokens, passwords, and keys require conscious decisions about storage, access, and exposure in logs, and larger environments may use external secret-management mechanisms according to institutional infrastructure.

## 15.10 Plugin pages

A `local` plugin may have its own pages, normally inside the component directory. This does not mean every PHP file should contain the entire application.

```php
<?php

require_once(__DIR__ . '/../../config.php');

require_login();

$context = context_system::instance();
require_capability('local/institutionhub:viewdashboard', $context);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/institutionhub/index.php'));
$PAGE->set_title(get_string('dashboard', 'local_institutionhub'));
$PAGE->set_heading(get_string('dashboard', 'local_institutionhub'));

$viewmodel = \local_institutionhub\output\dashboard::from_user($USER->id);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template(
    'local_institutionhub/dashboard',
    $viewmodel->export_for_template($OUTPUT)
);
echo $OUTPUT->footer();
```

The page handles bootstrap, security, `$PAGE` configuration, obtains the object representing the data, and renders the template. It should not contain a three-hundred-line query, an ERP call, HTML generation in `echo`, and permission logic all mixed together.

## 15.11 Navigation

A `local` often needs to add entries to navigation or administration. This is one reason so much institutional customization historically ended up in this plugin type.

The caution is not to treat navigation as a place for heavy logic. Navigation callbacks may run on many pages, so one expensive query there becomes a global cost across the site.

If deciding whether to display an item depends only on context and capability, great. If it depends on complex analysis, try loading only when necessary, using appropriate cache, or changing the architecture.

Also do not modify core files to add a menu item. If the result can be achieved with the Navigation API, a callback, or an available Hook, use the public contract. Editing `lib/navigationlib.php` or a core template to insert an institutional link may look fast today but becomes debt on every upgrade.

## 15.12 Capabilities in a local plugin

A `local` plugin can declare capabilities in `db/access.php` like any other component. A common mistake is thinking that because it is an institutional page, calling `require_login()` is enough.

```php
$capabilities = [
    'local/institutionhub:viewdashboard' => [
        'riskbitmask' => RISK_PERSONAL,
        'captype' => 'read',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],

    'local/institutionhub:managesync' => [
        'riskbitmask' => RISK_DATALOSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
```

These two actions do not need to share the same capability. Viewing a dashboard and triggering a synchronization are different responsibilities and may carry different risks.

Also do not always choose `CONTEXT_SYSTEM` merely because the plugin is `local`. If an action belongs to a specific course and authorization should respect roles in that course, `context_course` may be the correct context. Plugin type does not determine authorization context by itself.

## 15.13 Capability does not replace data ownership

We return to the security chapter. If a page receives `recordid=123`, checking `local/institutionhub:view` in system context does not prove the user may access that record.

Code needs to load the record, determine which entity it belongs to, derive the appropriate context, and also apply ownership or relationship rules. A `local` plugin often handles broad institutional data and, for exactly that reason, IDOR appears frequently when a developer assumes that "being a manager" or "having the capability" solves all authorization.

## 15.14 Its own database

If the plugin needs to persist its own information, use `db/install.xml` and the DDL API as discussed in the database chapter. Do not create a table in `install.php` with raw SQL and definitely do not execute `CREATE TABLE` when the page opens.

An integration may have queue, mapping, synchronization status, or audit tables. Each needs a clear purpose, coherent indexes, and an upgrade path.

Conceptual example.

```
local_institutionhub_map
- id
- externalid
- moodleid
- entitytype
- timemodified

local_institutionhub_queue
- id
- eventtype
- payload
- status
- attempts
- nextrun
- timecreated
```

Actual names and schema depend on the project, but the point is to separate business state from temporary execution mechanisms when that distinction makes sense.

## 15.15 install.xml and upgrade.php

`install.xml` must represent the correct schema for a fresh installation. `upgrade.php` describes how existing installations reach that state.

This is particularly important in an institutional plugin because it tends to live for many years. An internal `local` may never go through Marketplace review, but it still needs reliable upgrades. Sometimes this matters even more because the tables may contain millions of real records rather than demonstration data.

Never change only `install.xml` after publishing the first version and assume an update will alter an existing table. Existing installations do not reinstall the plugin from scratch. The change belongs in `xmldb_local_institutionhub_upgrade()` with an appropriate savepoint.

## 15.16 Service classes

A practical way to keep the plugin from growing chaotically is to concentrate business rules in classes with understandable responsibilities.

```
classes/service/user_sync.php
classes/service/course_sync.php
classes/integration/erp_client.php
classes/integration/payload_mapper.php
classes/repository/sync_repository.php
```

You do not need ceremonial architecture with ten layers to save one record. Separation exists where there is a real responsibility.

I like to think of it this way: if a rule needs to be used by a page, a Task, and an External API, it belongs to none of those entry points. It belongs to a domain or service class they all call.

This reduces duplication and, more importantly, prevents behavior from changing depending on where it was triggered.

## 15.17 Interface without an unnecessary renderer.php

Everything discussed in Chapter 6 applies here. There is no reason for a new `local` plugin to receive `renderer.php` by tradition.

If you can prepare data in an `templatable` class and call `render_from_template()`, do that. Do not create an intermediate class merely to receive an object and return exactly the same template.

```php
$data = (new \local_institutionhub\output\dashboard($summary))
    ->export_for_template($OUTPUT);

echo $OUTPUT->render_from_template(
    'local_institutionhub/dashboard',
    $data
);
```

Renderers still exist in Moodle and there are compatibility and override scenarios where they make sense, but automatically creating `renderer.php` in every new `local` means carrying a layer into 2026 that Mustache has made redundant in most cases.

## 15.18 Events API inside a local plugin

One classic use of `local` is reacting to events from other components. Suppose the ERP needs to be notified every time a user is updated.

The plugin declares an observer in `db/events.php`.

```php
$observers = [
    [
        'eventname' => '\\core\\event\\user_updated',
        'callback' => '\\local_institutionhub\\observer\\user::updated',
    ],
];
```

The observer should not turn the user's request into a long, fragile integration.

```php
namespace local_institutionhub\observer;

final class user {
    public static function updated(\core\event\user_updated $event): void {
        $task = new \local_institutionhub\task\sync_user();
        $task->set_custom_data([
            'userid' => $event->objectid,
        ]);

        \core\task\manager::queue_adhoc_task($task);
    }
}
```

The observer records the fact and queues work. The external call happens later. This reduces latency and prevents profile editing from failing because the ERP is unavailable.

## 15.19 Event is not Hook

If you need to know that something happened, an Event is natural. If you need to intervene before or during an extension point and Moodle offers a Hook for that, use the Hook.

Do not use an observer as a veto mechanism by trying to "undo" something that has already happened. The Event represents a fact. This separation prevents strange code where an observer issues a reverse update, triggers another Event, and enters a cycle.

## 15.20 Hooks in a local plugin

Local plugins can also consume Hooks in `db/hooks.php`. This is particularly useful for institutional customizations that historically depended on global callbacks in `lib.php`.

A definition can point to a callback class and set priority according to the Hook contract. The implementation should remain small and delegate to services as the rule grows.

The same warning from the previous chapter applies. Do not migrate an old callback to a Hook merely because Hooks look newer. First confirm there is an official replacement for that callback and that all plugin-supported branches provide the API you need.

## 15.21 Scheduled Tasks

If there is periodic synchronization, cleanup, reconciliation, or batch processing, `db/tasks.php` is the natural path.

```php
$tasks = [
    [
        'classname' => '\\local_institutionhub\\task\\reconcile_courses',
        'blocking' => 0,
        'minute' => '*/15',
        'hour' => '*',
        'day' => '*',
        'month' => '*',
        'dayofweek' => '*',
    ],
];
```

On current Moodle versions, the old task-blocking concept has been removed from scheduler behavior, so do not design concurrency around that field. Use idempotency, the Lock API, and persistent state when two simultaneous executions would be dangerous.

The task should not process the entire ERP dataset indefinitely in one execution. Split work into batches, record progress, and allow resumption.

## 15.22 Adhoc Tasks

An Adhoc Task works very well when the requirement originates from an action or event and can be processed later.

A user is updated, the plugin creates a task. An import is uploaded, the plugin splits it into batches and creates tasks. A webhook needs heavy processing, so the endpoint validates the signature, persists receipt, and queues work.

This turns `local` into a good integration point without forcing the web request to do everything at once.

But remember what we already saw. Adhoc does not mean instant execution. It depends on cron and workers. If cron is broken, the queue grows.

## 15.23 Concurrency and the Lock API

Institutional integrations frequently have jobs that must not run twice against the same object. Imagine two workers synchronizing the same enrolment simultaneously.

The Lock API provides mutual exclusion across processes without requiring you to invent your own `locks` table.

```php
$factory = \core\lock\lock_config::get_lock_factory('local_institutionhub');
$lock = $factory->get_lock('sync_user_' . $userid, 5);

if (!$lock) {
    return;
}

try {
    $service->sync_user($userid);
} finally {
    $lock->release();
}
```

The lock prevents concurrency but does not replace idempotency. If execution fails after sending the external request and before storing local status, the retry still needs to handle that situation safely.

## 15.24 Cache

An institutional dashboard may execute expensive queries and an integration may repeatedly read configuration or mappings. This does not mean directly instantiating Redis in the plugin.

Declare caches in `db/caches.php` and use MUC. The administrator chooses the store.

```php
$definitions = [
    'mapping' => [
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Then.

```php
$cache = cache::make('local_institutionhub', 'mapping');
$value = $cache->get($externalid);
```

Invalidation remains the most important part. If a mapping changes in the database, code must invalidate the corresponding cache. Cache without invalidation strategy is not optimization; it is a delayed bug.

## 15.25 Custom Web Services

If another system needs to call Moodle, a `local` plugin is a common place to define External Functions and services in `db/services.php`.

The External API needs to validate parameters, context, and capability as we saw in the previous chapter. Do not put business logic inside `execute()` if other flows may need it.

```php
public static function execute(int $userid): array {
    global $PAGE;

    $params = self::validate_parameters(
        self::execute_parameters(),
        ['userid' => $userid]
    );

    $context = context_system::instance();
    self::validate_context($context);
    require_capability('local/institutionhub:readsync', $context);

    return \local_institutionhub\service\user_sync::status($params['userid']);
}
```

The endpoint is an adapter. The rule belongs in the service.

## 15.26 Interface AJAX

The administrative interface can also call External Functions through `core/ajax` without creating an improvised `ajax.php` file that reads `$_POST`, executes SQL, and returns JSON manually.

If an operation has a reusable contract and is suitable for AJAX, use the External API with the proper flag while respecting sesskey, authentication, context, and capability.

This lets Moodle's own rule set work in your favor.

## 15.27 Moodle calling external systems

A `local` plugin often appears on the other side of integration, when Moodle needs to call an ERP, CRM, payment gateway, video service, or any external API.

Use Moodle's Curl API rather than inventing an HTTP client with `file_get_contents()` or `curl_init()` scattered through several classes.

Centralize the client.

```php
namespace local_institutionhub\integration;

final class erp_client {
    public function get_user(string $externalid): array {
        $curl = new \curl();

        $response = $curl->get(
            get_config('local_institutionhub', 'baseurl') . '/users/' . rawurlencode($externalid),
            [],
            [
                'CURLOPT_TIMEOUT' => 15,
            ]
        );

        return json_decode($response, true, 512, JSON_THROW_ON_ERROR);
    }
}
```

In production, you still need to handle HTTP status, timeout, network errors, authentication, retry, rate limits, and logs without exposing secrets.

## 15.28 Retry cannot be blind

If the external server responds with `500`, retrying later may make sense. If it responds with `400` because the payload is invalid, retrying one hundred times only adds noise.

If it responds with `429`, there may be `Retry-After`. If the operation creates a charge or enrolment, retrying without an idempotency key may duplicate the effect.

A local plugin often becomes the bridge between systems and therefore needs to understand the difference between transient and permanent failure.

## 15.29 Incoming webhooks

When an external system notifies Moodle, the plugin may receive a webhook. The secure sequence at the endpoint is normally short.

Receive the raw body, validate the signature, validate timestamp or replay protection when the protocol supports it, record an idempotent identifier, persist the minimum required state, and queue processing.

Do not run a fifteen-second process inside a webhook when the provider expects a quick response. And do not trust `userid`, `courseid`, or any other payload field without validating relationships and current internal state.

## 15.30 Integration logs

Logs are essential when two systems communicate, but technical logging should not become a warehouse of complete payloads.

Keep operation identifier, direction, entity, result, external status, attempt count, timing, and correlation ID when that helps support. Avoid passwords, tokens, secrets, and unnecessary personal data.

For meaningful Moodle actions, the Events API may be the correct logging mechanism. For operational observability of the integration, a specific technical log may exist as long as it has retention and a defined purpose.

## 15.31 No core hacks

One of the best uses of `local` is precisely replacing core hacks with supported extension points. If an institution has custom code inside `user/editadvanced.php`, `course/view.php`, or `lib/moodlelib.php`, the first question should be whether it can move to an Event, Hook, callback, Navigation API, Output API, or another public extension mechanism.

Not every hack has a perfect replacement, but many do.

The operational difference is enormous. With a core hack, every upgrade requires reapplying a patch and resolving conflicts. With a plugin, core remains upgradeable and compatibility is concentrated in the component.

A `local` plugin should not justify continuing to modify core. It should be one of the tools that helps you stop modifying core.

## 15.32 Institutional customization

There is a category of requirements that is almost the natural home of `local`: organization-specific rules that do not make sense for the entire Moodle ecosystem.

Examples include blocking an operation when there is an ERP debt, adding an administrative reconciliation screen, synchronizing an internal identifier, providing an institutional dashboard, or triggering an internal workflow after a specific event.

The rule is local to the institution, which is where the name historically makes sense. Even so, it should use public APIs, declare capabilities, have tests, upgrades, and isolation like any publicly distributed plugin.

"Only for this customer" is not an excuse for disposable code, because these plugins often survive for many years.

## 15.33 Dependencies on other plugins

A local plugin may depend on another plugin, but that dependency should be explicit and deliberate.

If `local_institutionhub` only works when `mod_customactivity` is installed, declare the dependency in `version.php` when applicable and organize the code to fail clearly.

Do not silently assume an optional plugin exists on every Moodle site. Even plugins normally distributed with one installation can be disabled or vary among environments.

When communication between components can happen through an Event or Hook without direct coupling, that may be better. When a direct call is genuinely part of the contract, prefer an explicit dependency over `class_exists()` scattered through fifty places.

## 15.34 Subplugins and local plugins

`local` plugins can host subplugins when they have an architecture that genuinely needs to be extended by child components. This is powerful, but not something to invent on day one.

If the plugin has three integrations and all can live as internal classes, subplugins may be unnecessary complexity. If the project has become a platform where other teams need to install independent connectors with their own lifecycle and versioning, then subplugins may make sense and will be covered in their dedicated chapter.

## 15.35 Architecture of a complete project

Let us put the pieces together in a real flow. `local_institutionhub` needs to synchronize users with an ERP, provide a monitoring dashboard, and allow managers to reprocess failures.

When a user changes in Moodle, `user_updated` is triggered. The observer does not call the ERP; it creates an Adhoc Task containing `userid`. The task acquires a lock for that user and calls `user_sync_service`. The service loads user and mapping data, uses `erp_client` to send data, and records the result. On success, it invalidates the dashboard cache. On transient failure, it lets the task fail so the scheduler can retry according to the chosen strategy. On permanent failure, it records a status visible to the manager.

The `index.php` page requires login and capability, calls a query class using cache where appropriate, prepares `templatable`, and renders Mustache. No `renderer.php` is created just for that.

The "reprocess" button calls an External Function through `core/ajax`. The function validates parameters, context, capability, and record ownership, then queues a new task instead of talking to the ERP during the click.

A Scheduled Task runs at intervals looking for inconsistent items, but works in batches and uses the Lock API so it does not compete with another worker.

This flow uses several Moodle features, but each one does only one thing.

## 15.36 What belongs where

A simple division helps a lot.

`index.php` bootstraps and coordinates the page. `settings.php` declares configuration. `db/access.php` declares capabilities. `db/events.php` registers observers. `db/hooks.php` registers Hooks. `db/tasks.php` declares recurring tasks. `db/services.php` exposes External Functions. `db/caches.php` describes caches. `db/install.xml` describes the initial schema and `db/upgrade.php` evolves that schema.

Inside `classes/`, observers receive events, tasks execute units of work, external classes adapt external calls to services, integration classes communicate with other systems, output classes prepare template data, and services concentrate business rules.

This organization is not religion. The important thing is that names and locations help someone opening the code two years from now discover where a rule lives.

## 15.37 What I would avoid

I would avoid `lib.php` containing business logic, manual `ajax.php` for everything, HTML inside database classes, database queries in `settings.php`, cron processing a million records without batches, observers performing synchronous HTTP, tasks without idempotency, URLs built through concatenation, capability always checked in system context, tokens appearing in logs, and direct access to another plugin's internal tables when a public API exists.

I would also avoid creating a class called `utils` and putting everything there that we could not place elsewhere. That is normally just a giant `lib.php` disguised as object-oriented programming.

## 15.38 Local does not mean globally scoped all the time

There is another conceptual mistake. Because the plugin is called `local`, some developers treat everything inside it as global to the site.

But an action's scope depends on the domain. A page may work with a specific course and use `context_course`. A service may process a user and work with `context_user`. An integration may have global configuration while one particular operation still needs to respect a capability in course context.

The plugin type says how the component fits Moodle's extension system, not which context every function must use.

## 15.39 Local does not mean code executed on every page

Installing a `local` plugin also does not mean every line inside it executes automatically on every Moodle request. What runs depends on the integration points the plugin registers.

An observer runs when the corresponding event happens. A Hook callback runs when that Hook is dispatched. A Scheduled Task depends on cron. A page runs when accessed. A callback in `lib.php` runs when core calls that callback. A JavaScript module runs when a page loads it.

This distinction matters because many people put code in the wrong file believing that simply living inside `local` makes it "global."

## 15.40 When I need something to run whenever any activity is accessed

Return to a practical example. You have a `mod_meuplugin` but discover the rule needs to run when a student accesses any activity, not only `mod_meuplugin`.

It makes no sense to copy the code into every module. It also makes no sense to turn every activity into a dependency of your `mod`.

First look for an Event or Hook representing the extension point you need. If Moodle triggers an appropriate view event, a cross-cutting plugin can observe it and will receive information such as user, context, course module, and related object according to the event. From there the rule decides whether it needs to act.

The important thing is understanding that `mod` remains responsible for its own activity while the cross-cutting rule belongs to another component or service. This separation prevents one activity from assuming responsibility for the whole ecosystem.

## 15.41 Local-plugin performance

A local plugin can easily affect the entire site because some of its extension points run on many pages. That means performance deserves more care, not less.

Navigation callbacks, very frequent Hooks, and common observers should not perform repeated expensive queries unnecessarily. Use lazy loading, cache when there is an invalidation strategy, and Tasks for heavy work.

If a function runs on every page load and adds 30 ms, that looks small in your browser, but on an installation with millions of requests the cost becomes significant.

## 15.42 Security of an institutional plugin

Because `local` often integrates systems and concentrates administrative functionality, it frequently handles sensitive data and powerful operations.

Every input should use the appropriate Parameter API. Every action needs coherent authentication and authorization. State changes through forms or web actions need CSRF protection. Displayed data needs proper escaping and formatting. SQL needs parameters. Files need the Files API and `pluginfile()` where applicable.

External integration adds another security boundary. Tokens, webhooks, SSRF, redirects, TLS, rate limits, and logs all become part of the project.

A local plugin is not a shortcut around Moodle security. It lives inside Moodle and needs to respect the same model.

## 15.43 Testability

When every rule lives inside `index.php`, observers, and tasks, testing becomes difficult. Separating services improves organization and testability at the same time.

A class receiving data, applying a rule, and using clear dependencies can be exercised in PHPUnit. A Task can be tested to confirm it calls the correct service. An External Function can be tested for permissions, validation, and return values.

The testing chapters will go much deeper, but it is worth designing the plugin now with the understanding that testable code is usually code less coupled to its entry point.

## 15.44 Version compatibility

Institutional plugins often need to support more than one Moodle branch. In that scenario, design must consider the minimum available APIs.

Hooks, PHP attributes, frontend changes, the Routing API, and other evolutions did not arrive in the same version. Do not copy code from 5.2 documentation into a plugin declaring Moodle 4.1 support without checking compatibility.

Sometimes the best strategy is one plugin branch per major Moodle line. In other cases a single codebase with small compatibility layers is enough. The upgrade and compatibility chapter will cover this in depth.

## 15.45 An installation-flow example

When `local_institutionhub` is installed, Moodle reads `version.php`, processes the initial schema, capabilities, tasks, services, events, and other declarative files according to the installation lifecycle.

Local plugins have some ordering peculiarities in Moodle's plugin lifecycle and are traditionally processed last among plugin types during installation and upgrade. This can help institutional customizations depending on the rest of the environment, but it should not be used as an excuse for implicit dependencies.

If there is a real dependency, declare and handle it. Installation order is not a business contract.

## 15.46 Complete project for this chapter

The exercise in this chapter is to build a functional `local_institutionhub` without trying to create an entire ERP. The goal is to demonstrate integrated architecture.

The plugin should have an external URL setting and an enable/disable flag, one capability for viewing the dashboard and another for reprocessing failures, a queue or status table, a user-update observer, an Adhoc Task for synchronization, a reconciliation Scheduled Task, a per-user Lock API lock, cache for the dashboard summary, a Mustache page without a custom renderer, an External Function used by the frontend through `core/ajax`, and a separate HTTP client for communicating with the external system.

The service can be simulated. We do not need a real ERP. The response can come from a test endpoint or a fake implementation during tests. The important thing is demonstrating where each responsibility belongs.

## 15.47 Step 1, configuration

Create `settings.php` with at least `enabled`, `baseurl`, and timeout. Do not query the external server while building the administration tree.

In the client class, read configuration with `get_config()`. If `enabled` is disabled, the service should handle that explicitly and not attempt a network call.

## 15.48 Step 2, capabilities

Create `local/institutionhub:viewdashboard` and `local/institutionhub:reprocess` in `db/access.php`.

The main page requires the first. The AJAX endpoint queueing reprocessing requires the second.

Test with a user who can view but cannot reprocess. That is better than granting one capability named `manage` for everything.

## 15.49 Step 3, persistence

Create a table to record synchronization state per user. It may store `userid`, an external identifier, last status, last attempt, a summarized error message, and timestamps.

Create indexes required by the queries that will genuinely execute, especially on `userid`, status, and next-processing time when using a database-backed queue.

Do not add an index to every column by reflex. Every index also costs writes and storage.

## 15.50 Step 4, observer and queue

Register `user_updated`. Keep the observer minimal. Check only indispensable cheap conditions and queue the Adhoc Task.

Avoid building a huge payload with the complete object inside `custom_data`. Often the identifier is enough and current state can be loaded when execution happens. This reduces serialization, avoids stale payloads, and keeps the task small.

## 15.51 Step 5, task and lock

The task receives `userid`, acquires the lock, calls the service, and releases the lock in `finally`.

The service should also be callable from manual reprocessing and reconciliation. If every entry point implements synchronization on its own, you will soon have three versions of the same rule.

## 15.52 Step 6, dashboard

The page reads a summary, preferably through a dedicated query class, and sends data to Mustache.

The template shows counts of successful, failed, and pending synchronizations together with the latest failures. Do not fetch every record just to count in PHP when the database can aggregate correctly.

Cache the summary only when there is a real benefit and define when it is invalidated. Updating synchronization status is a natural point to invalidate the corresponding key.

## 15.53 Step 7, reprocessing through AJAX

The reprocess button calls an External Function. It receives the identifier, validates parameters, context, capability, and record existence.

It then queues a new task and returns a simple state to the frontend. It does not perform ERP HTTP calls inside the AJAX request.

JavaScript shows a notification that the item entered the queue. If users need to follow the result, the interface can query status later or update on the next visit depending on the requirement.

## 15.54 Step 8, reconciliation

The Scheduled Task searches pending or inconsistent records in batches. For each item, it may queue an Adhoc Task rather than performing the entire synchronization inside one monolithic task.

This improves parallelism and retry behavior, but should not create millions of tasks without control. Choose batch size and queue limits according to the environment.

## 15.55 Step 9, observability

Use `mtrace()` inside Tasks for operational information appropriate to cron. Record Moodle Events for meaningful user actions such as manual reprocessing when that makes sense.

For integrations, keep a correlation ID and enough technical state for support to understand what happened without storing secrets or complete payloads unnecessarily.

## 15.56 Step 10, real failures

Simulate several scenarios: unavailable API, timeout, invalid response, user without mapping, denied capability, stopped cron, two concurrent tasks, and stale cache.

A project only looks complete while we test the happy path. The value of this chapter is precisely seeing whether the architecture remains understandable when something goes wrong.

## 15.57 Architectural review

At the end, look at the plugin and try to answer quickly where every responsibility lives.

Where is the external call? Where does the synchronization rule live? Where does the page prepare data? Where are permissions declared? Where are Tasks registered? Where is cache defined? Where does schema evolve? Where are Hooks and observers declared?

If the answer to almost everything is `lib.php`, we are not finished.

If answering requires opening fifteen abstractions just to discover how one boolean is stored, we went too far in the opposite direction.

Good Moodle plugin architecture is not a number of classes. It is being able to understand the flow and change one responsibility without breaking five others.

## 15.58 What this chapter closes

Up to this point we have studied Moodle architecture, plugin types, structure, code quality, database access, the Output API, Forms, security, Files API, Events, Hooks, Tasks, cache, cross-cutting APIs, and Web Services. The `local` plugin is a good place to bring all of this together because it does not impose a domain as specific as an activity or enrolment method.

This does not mean every project should now become `local`. It means that after understanding all these APIs, you can use `local` as a genuine institutional extension without turning it into a leftovers directory.

In the next chapters we return to specialized plugin types and will see the opposite effect: many things we implemented manually in a `local` already come built into `block`, `mod`, `enrol`, or `auth` because those types have their own contracts with Moodle.

## Technical references consulted

* Moodle Developer Resources. Local plugins. https://moodledev.io/docs/5.2/apis/plugintypes/local
* Moodle Developer Resources. Plugin types. https://moodledev.io/docs/5.2/apis/plugintypes
* Moodle Developer Resources. Component communication. https://moodledev.io/general/development/policies/component-communication

{% endraw %}