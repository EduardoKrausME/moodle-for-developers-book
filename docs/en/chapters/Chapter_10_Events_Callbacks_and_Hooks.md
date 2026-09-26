{% raw %}

# 10. Events, callbacks, and Hooks

If you have worked with Moodle for a while, you have probably opened a `lib.php` looking for a function with a very long name, found a `db/events.php` registering an observer and, on a newer branch, encountered a `db/hooks.php` pointing to a class that receives a Hook object. All three mechanisms exist to let one part of Moodle react to what another part is doing, but they were created at different times, solve different problems, and, when treated as synonyms, the code becomes confusing very quickly.

The most common mistake is reducing everything to a question such as "which one runs my code when something happens?". All three can execute code in response to something, but that does not mean they have the same semantics. An Event normally describes something that has already happened, records that fact, and allows observers to react. A Hook deliberately opens an extension point inside a flow and may allow other components to add, change, or even stop something, depending on that Hook's contract. A legacy callback is a historical convention in which core looks for a known function in plugins and calls it when execution reaches that point.

The difference looks small while the plugin has fifty lines and nobody depends on it, but in production it completely changes how you think about architecture. If you use an Event to ask another plugin to modify data before an operation, you are trying to turn a record of fact into a customization mechanism. If you use a Hook only to record that something happened, you may be ignoring Moodle's Events, logging, and observability infrastructure. And if you create a new callback today in `lib.php` because you found a 2014 example, you are adding technical debt exactly where Moodle has already created a modern alternative.

## 10.1 Difference between Event, Hook, and callback

A practical way to separate the three is to think about intent. Event best answers the sentence "this happened". Hook best answers "I am at this point in the process and allow other components to participate". Callback answers "Moodle knows that some plugins may implement this function and, if it exists, it will call it". This difference in intent is more important than the syntactic difference among `trigger()`, `dispatch()`, and a function in `lib.php`.

Imagine an activity has finished saving an attempt. Triggering an Event saying the attempt was submitted makes sense because the fact has happened and other components may record an audit entry, synchronize an external system, or update an integration. Now imagine that, before building a set of interface buttons, you want to let plugins add actions. That is much closer to a Hook because there is a deliberate customization point and the data is still being prepared. A historical callback such as `extend_navigation()` exists because for many years Moodle adopted the convention of searching plugins for known functions.

Another distinction that helps is mutability. An Event should be treated as a representation of a fact and an observer should not modify the Event in an attempt to change what happened. A Hook, on the other hand, may be designed precisely to carry an object that callbacks enrich or modify. A callback depends on the specific contract and is therefore the most irregular of the three: some only notify, some receive parameters by reference, and others return values that core combines.

## 10.2 What is a Moodle callback?

A callback in Moodle is not a special class or a single interface. Historically, it is a function or method that core knows how to find by name and call at a particular moment. In many old cases the convention is `frankenstyle_callbackname()`, such as a module or local-plugin function placed in `lib.php`. The important point is that the contract is defined by the code that invokes the callback, not by the plugin implementing it.

This means you cannot invent `local_meuplugin_quando_eu_quiser()` and expect Moodle to magically discover it. There must be a point in core or another component looking specifically for that callback, usually through APIs such as `get_plugins_with_function()`, `plugin_callback()`, or `component_callback()`. When the function is found, Moodle calls it with the parameters defined by that extension point's contract.

Callbacks still exist because they are part of older APIs and some plugin types still depend on mandatory callbacks, especially Activity Modules. So the message of this chapter is not "callbacks are forbidden". It is different: do not create a new callback out of habit when an appropriate modern API exists, and when consuming an old extension point, check whether a replacement Hook already exists.

## 10.3 Historical callbacks in lib.php

For many years, `lib.php` became the central extension file for Moodle plugins. If core needed to let plugins participate in a process, it created a function convention, searched components for that function, and executed it. This worked and enabled an enormous amount of extensibility before there was a formal Hooks API, but it also created a file that, in old plugins, easily becomes a collection of global functions with little obvious relationship to each other.

That is why you still find plugins with hundreds or thousands of lines in `lib.php`. Navigation, rendering, course, module, user, file, legacy cron, and integration callbacks all appear there, mixed together because each historical API added its own known function. The problem is not only aesthetic. Global functions are harder to organize, test, and type, and they increase the cost of loading a file that has a special place in Moodle's execution lifecycle.

In new code, `lib.php` should be seen as a compatibility and contract point, not the place where all plugin logic lives. If an old callback is mandatory, keep the function thin and forward the work to a class. If the callback already has a replacement Hook and your minimum branch lets you use it, prefer the modern API.

## 10.4 Why lib.php should remain small

In Chapter 3 I already treated `lib.php` as a file that should not become a warehouse for business logic, and here there is an even more concrete reason. Callbacks may be discovered and executed in many different flows, so a heavy function in `lib.php` can hide database cost, external calls, or data preparation in a place nobody would suspect while looking at the current page.

A ten-line callback function that validates parameters and calls `\local_meuplugin\service\alguma_coisa` is much easier to understand than three hundred lines of procedural logic. The class it calls can receive dependencies, be tested in isolation, and evolve without turning `lib.php` into an archaeological map of the plugin's last ten versions.

There is a compatibility benefit too. If tomorrow the callback is replaced by a Hook, you do not want to port three hundred lines of logic. You want to create a new entry point that calls the same existing class. This separation turns an API migration into changing an adapter rather than rewriting a component.

## 10.5 Events API

Moodle's modern Events API gained a central role during the 2.x generation and was consolidated when core events were converted to the new API in Moodle 2.7. Today it serves both communication between components and the modern logging system. That matters because a well-designed Event is not merely a "callback with a class"; it enters an infrastructure that knows how to record what happened, associate context, user, and object information, and produce auditable data.

The most natural use of an Event is after a meaningful action. A record was created, an attempt was submitted, a file was updated, a course was viewed, an enrolment changed. You represent that fact with an event class, create an instance with the required data, and call `trigger()`. From there Moodle records the event according to its logging infrastructure and calls interested observers.

For that reason, I would avoid using Events as a mechanism to modify the main flow. Moodle's own development policy makes clear that observers are notified about what happened and may act on the information received, but they should not modify event data or prevent the original action. If you need to offer customization before a decision is finalized, Hooks are a much more appropriate tool.

## 10.6 What is an event?

An event is an object representing something relevant that happened in the system. It carries the event type identity, context, user, course when applicable, related object, educational level, CRUD nature, and additional data. This structure means Moodle does not depend on loose text strings to understand what happened.

Think about `\core\event\course_viewed`. The class states that a course was viewed, defines `crud` as a read operation, and uses course context. Logging can record who viewed it, which course was involved, in which context it happened, and still produce a human-readable description. A plugin can observe that event without modifying the code that renders the course.

The main benefit is decoupling. The component triggering the event does not need to know who will react. The observer knows the public contract of that event and receives a typed instance. This allows integrations without embedding `require_once()` from one plugin into another and without editing core.

## 10.7 The classes/event directory

Events created by the plugin normally live in `classes/event/`, respecting the component namespace and autoloading. A `local_integracao` plugin may have `classes/event/processamento_concluido.php`, whose class is `\local_integracao\event\processamento_concluido`. The class name describes a fact, normally in the past tense, because the event represents something that happened rather than a command for someone to execute.

This convention helps both reading and discovery. When you open a plugin and find `classes/event/`, you know those are facts published by the component. Do not put observers in the same directory simply because both deal with events. The Event class defines the contract of the fact, while observer code can live in an appropriate callback or observer class according to the plugin architecture.

## 10.8 Creating an event

An Event class normally extends `\core\event\base` and implements `init()` to configure its essential characteristics. In new code you should define at least the appropriate CRUD nature and educational level when relevant, as well as `objecttable` when `objectid` points to a specific table. Then implement `get_name()` and `get_description()` and, when the fact has a natural URL, `get_url()`.

Avoid turning the Event into a generic DTO with twenty arbitrary fields inside `other`. Event design should be stable and semantically clear because other plugins may begin observing that contract. If tomorrow you change its structure arbitrarily, you create a broken dependency outside your own component.

```php
<?php
namespace local_integracao\event;

final class registro_processado extends \core\event\base {
    protected function init(): void {
        $this->data['crud'] = 'u';
        $this->data['edulevel'] = self::LEVEL_OTHER;
        $this->data['objecttable'] = 'local_integracao_item';
    }

    public static function get_name(): string {
        return get_string('eventregistroprocessado', 'local_integracao');
    }

    public function get_description(): string {
        return "The user with id '{$this->userid}' processed the record " .
            "with id '{$this->objectid}'.";
    }
}
```

## 10.9 create()

You do not instantiate a Moodle Event with `new` and begin filling properties manually. The pattern is to use the inherited static `create()` method and provide event data in an array. This method validates and prepares the internal structure required for consistent API behavior.

The minimum almost always includes `context`. Depending on the event, `objectid`, `relateduserid`, and `other` are also used. Context deserves special attention because it is not decoration for the log. It places the fact inside Moodle's context tree and influences derived information such as course and context level.

```php
$event = \local_integracao\event\registro_processado::create([
    'context' => $context,
    'objectid' => $record->id,
    'relateduserid' => $record->userid,
    'other' => [
        'source' => 'import',
    ],
]);
```

## 10.10 trigger()

After creating the Event and completing the action it represents, call `trigger()`. Order matters. If the event is named `registro_processado`, it makes no sense to trigger it before processing is complete and then discover the operation failed. An Event should not announce a reality that can still be reversed by ordinary validation within the same flow.

Also avoid triggering the same Event in three different layers merely because they all pass through the same code. Choose the point where the fact genuinely becomes true. Duplicate events pollute logs, make observers run twice, and create bugs that look like concurrency when the actual problem is trigger design.

```php
// A operação principal foi concluída.
$DB->update_record('local_integracao_item', $record);

$event->trigger();
```

## 10.11 Event context

Context answers where the action happened from the perspective of Moodle authorization and organization. An activity event normally uses `context_module`, a course event uses `context_course`, while global events may use `context_system`. Putting everything in system context because it is easier makes logs poorer and may break observer assumptions.

If the event belongs to a record associated with an activity, do not choose context based on where the code is executing; choose it based on the domain object. A task may be running through CLI and still trigger an event whose correct context is the module associated with the processed record. Execution environment and semantic context are different things.

## 10.12 Object ID

`objectid` identifies the primary object to which the event refers. When the class defines `objecttable`, that id gains a clear relationship with the specified table. In an event such as `registro_processado`, for example, `objectid` may point to the row in `{local_integracao_item}` that was processed.

Do not use `objectid` for any convenient number. If the event refers to record A and you put the id of B there because it happened to be easier at trigger time, observers and reports begin interpreting the contract incorrectly. Event is public API and semantic consistency matters more than saving two lines.

## 10.13 Related user

`relateduserid` exists for situations where there is another relevant user besides the person performing the action. Imagine an administrator suspending a student's enrolment. The Event's `userid` may be the administrator who performed the operation, while `relateduserid` points to the affected student. This distinction matters for logs, privacy, and observers.

A common mistake is mentally redefining `userid` as "the user this event is about." Not always. `userid` normally represents the actor of the event, while `relateduserid` lets you record the person related to the fact. Before populating them, read the event semantics and ask who acted and who was affected.

## 10.14 Other data

`other` is for additional data that belongs to the Event contract and does not fit the standard fields. That does not mean dumping the complete database record there. Everything placed in `other` expands the event's public surface and may appear in logs or be consumed by observers, so choose stable, necessary information without unnecessary exposure of sensitive data.

Document the structure in PHPDoc and validate it when required. If an observer depends on `other['source']`, that field must have a predictable meaning. Silently replacing `source` with `origin` in a future release is an API break for consumers observing the event.

## 10.15 CRUD events

Events carry a CRUD classification with create, read, update, and delete values. This is not cosmetic. The information classifies the nature of the operation and helps tools analyzing events. A viewed course is a read operation, a created record is create, and a modified preference is update.

Not every event fits a simplistic mental table perfectly, but that is not a reason to choose any letter. Think about the main effect the event represents on the resource and consult similar core events when in doubt. Consistency with the ecosystem matters more than a creative local interpretation.

## 10.16 Snapshots and previous state

In some events, especially when an object is about to be changed or removed, adding a snapshot of the record may be useful so the event preserves relevant information even after the original row changes or no longer exists. The Events API supports snapshots precisely because observers and logs may need to understand the object at a particular moment.

Do not confuse a snapshot with an excuse to always load everything. Large objects copied into every Event add cost and may send unnecessary data into the logging system. Use snapshots when the contract genuinely needs to preserve state and prefer the minimum needed to explain the fact.

## 10.17 Observers

An observer is code that reacts to an Event. It does not need to live in the component that created the Event, and that is precisely the point of the mechanism. A local plugin can observe a course event, a module may observe an event from another subsystem when there is architectural justification, and an integration can listen for user creation without editing account-creation code.

The observer method receives the event instance. From it you access context, user, objectid, relateduserid, and other public data. If you need to load the related record, do so explicitly and validate your assumptions because an Event does not promise every entity will continue to exist forever, especially in deletion events.

## 10.18 db/events.php

Observers are registered in `db/events.php`. This file declares which Event class will be observed and which callable should run. The registration is cached, so during development a change may require a cache purge or version increment depending on the case. Do not try to register observers dynamically on every request because that bypasses Moodle's discovery infrastructure.

Keep the file declarative. It is not the place for database queries, API calls, or complex conditional logic. Like other files under `db/`, it describes configuration Moodle reads and caches.

```php
<?php
$observers = [
    [
        'eventname' => \core\event\course_viewed::class,
        'callback' => '\\local_integracao\\observer::course_viewed',
    ],
];
<?php
namespace local_integracao;

final class observer {
    public static function course_viewed(\core\event\course_viewed $event): void {
        $courseid = $event->courseid;
        // Encaminhe a regra para uma classe própria quando houver trabalho real.
    }
}
```

## 10.19 An observer is not a before hook

This point deserves to be written in large letters in the reasoning, even if it does not need to become a banner in the book. An Event observer is not the place to say "before saving, change this value." When the observer receives the Event, the semantics are that something happened, and Moodle policy reinforces that observers must not modify event data or prevent the original action.

It is possible to write code that tries to work around this, for example by observing an event and then updating the record again to produce an effect similar to changing the result. Technically it may work in one case, but you are creating a conflict between the main flow and a later reaction. If the real requirement is customization before completion, look for a Hook or an API specifically designed for that point.

## 10.20 Performance and failures in observers

Observers run in the Event flow and therefore heavy work needs care. If every course view triggers a synchronous two-second HTTP integration, you have turned a fast page into a page dependent on another system's latency. The normal solution is for the observer to record or queue the minimum required work and delegate heavy processing to an adhoc task, which is the subject of Chapter 11.

Also think about idempotency. Events may legitimately be triggered again in different flows, and your integration should not create duplicates because it assumed that observer would run exactly once in the history of the universe. If the external operation has a natural key, its own id, or retry capability, design for that from the start.

## 10.21 Communication between components

Events are an excellent communication mechanism when component A wants to announce a fact without knowing component B. This independence reduces direct coupling and allows observers to be installed or removed without modifying the emitter. It is much better than `if (file_exists($CFG->dirroot . '/local/outroplugin/...')) require_once(...)`, which creates an implicit dependency and spreads knowledge between components.

But decoupling does not mean lack of contract. If B semantically depends on an Event published by A, there is still an API dependency even without `require_once`. You need to consider event stability, minimum version, and what happens when A is not installed. Decoupled architecture is not architecture without responsibility.

## 10.22 Dependencies between plugins

When a plugin only enriches behavior if another plugin is present, an observer may be optional and simply never receive anything when the emitting component does not exist. When the plugin cannot function without that other component, declare the dependency in `version.php` rather than hiding a mandatory dependency behind an Event.

Another concern is installation and upgrade ordering. Reactive code must not assume all tables and settings exist at every moment of setup. This becomes even more obvious with Hooks because some Hooks may run during installation and upgrade, while equivalent legacy callbacks historically did not run at those moments.

## 10.23 Hooks API

The Hooks API arrived in Moodle 4.3 as a modern replacement for some one-to-many callbacks based on `lib.php`, aligned with PSR-14. This does not mean Events disappeared. Hooks and Events coexist because they solve different intentions, and this is one of the most important things to understand instead of using the word "hook" generically as older documentation sometimes did.

A typical Hook scenario occurs when core or a plugin reaches a point where it wants to deliberately offer extensibility. Instead of searching all plugins for a global function by name, it creates a Hook object, dispatches it through the manager, and lets registered callbacks react. The object may only inform, may carry mutable data, and may implement stoppable behavior when the contract requires it.

## 10.24 Why Hooks were created

Historical callbacks worked, but they grew without a unified model. Every callback needed its own convention, discovery mechanism, and frequently a global function in `lib.php`. Hooks bring a class-based model, declaratively registered callbacks, explicit priority, centralized discovery, and integration with Dependency Injection in modern versions.

The gain is not merely replacing a function with an object. A Hook can document its own contract with attributes, carry data in a dedicated class, and be discovered on the overview page. There is also an official migration strategy that lets a Hook declare it replaces old callbacks and preserve compatibility across branches without calling the same plugin twice.

## 10.25 PSR-14

Moodle maps its Hooks API to PSR-14 concepts. The Hook object corresponds to the PSR-14 Event, the callback corresponds to the listener, the dispatching code is the emitter, and the Hook manager acts as dispatcher and provider. The word "Event" in PSR-14 can be confusing because Moodle already has an Events API with different semantics, so Moodle documentation uses Hook to avoid mixing the two worlds.

You do not need to memorize the standard's mapping table to use the API, but understanding the design helps explain why a Hook is an object and why the dispatcher should not know the concrete callbacks. This separation keeps the emitter focused on the extension point and the manager responsible for discovering, ordering, and calling consumers.

## 10.26 Hook versus Event

If you need a short rule to choose between them, use this as a starting point: Event describes a completed fact and is excellent for logging, auditing, and decoupled reactions. Hook describes an extension point and is appropriate when other components may participate in the flow, influence data, or complement behavior. Borderline cases exist, but this distinction resolves most decisions.

A concrete example helps. After deleting a block, you may trigger or already have an Event indicating deletion. Immediately before deletion, however, if plugins need to inspect the object or participate in the flow, a Hook such as `block_delete_pre` makes sense. Core itself uses this example when documenting migration from the legacy `pre_block_delete` callback.

## 10.27 Hook that allows data changes

Because a Hook is an arbitrary PHP object, it can expose properties or methods allowing callbacks to change the result the emitter will later use. This solves a problem Events should not solve. You can, for example, build a collection of actions, dispatch a Hook, and then continue rendering with the collection already enriched by consumers.

Mutability needs to be designed, not simply made available without rules. If every callback can overwrite any public property without a clear contract, callback order becomes an architectural lottery. Prefer specific methods such as `add_action()`, `set_value()`, or controlled collections when the contract requires modification, and document how conflicts should be handled.

## 10.28 Stoppable Hook

Some Hooks may allow propagation to later callbacks to be stopped, using `Psr\EventDispatcher\StoppableEventInterface`. The object must be able to report whether propagation was stopped and provide an appropriate mechanism to change that state. The manager stops calling later callbacks when the Hook indicates execution should stop.

Do not enable stoppable behavior merely because it seems powerful. If the contract has no clear reason why a single consumer should win or later processing should be interrupted, do not create that competition. The more callbacks can block one another, the more important priority and interruption effects become to document.

## 10.29 Creating a Hook

A Hook normally lives in the `[component]\hook\*` namespace and current documentation recommends final classes. Its constructor receives the data required for that extension point, preferably with readonly properties when callbacks only need to inspect it. When consumers may change something, expose an explicit API for that modification.

The name should describe the point. Starting in Moodle 4.4, new Hooks using temporal naming follow the convention of `before` and `after` prefixes, such as `before_form_validation` and `after_form_validation`. This may look like a naming detail, but it makes the Hook catalog far more predictable.

```php
<?php
namespace local_integracao\hook;

#[\core\attribute\label('Hook dispatched before an integration payload is sent')]
#[\core\attribute\tags('integration', 'payload')]
final class before_payload_sent {
    public function __construct(
        public readonly int $recordid,
        private array $payload,
    ) {
    }

    public function get_payload(): array {
        return $this->payload;
    }

    public function replace_payload(array $payload): void {
        $this->payload = $payload;
    }
}
```

## 10.30 label and tags

Hooks can describe themselves with attributes such as `\core\attribute\label` and `\core\attribute\tags`. This helps discovery and the overview page while placing essential documentation close to the class itself. The label should explain what the Hook represents in English and tags help grouping and search.

There is also an alternative interface-based description mechanism provided by the API, but in modern code attributes make the contract quite readable. The important thing is not to create a silent Hook that only makes sense after opening the emitter and reading fifty lines of surrounding code.

## 10.31 Dispatching a Hook

After constructing the object, the emitting component calls the Hook manager. Since Moodle 4.4 the recommendation is to obtain the manager through Dependency Injection with `\core\di::get()` and call `dispatch()`. This form improves testability because the manager can be replaced with a fixture implementation during PHPUnit.

Dispatch must happen exactly at the semantic point promised by the name. A `before_payload_sent` dispatched after the HTTP request is an architectural lie even if the code compiles. Name, timing, and carried data need to tell the same story.

```php
$hook = new \local_integracao\hook\before_payload_sent(
    recordid: $record->id,
    payload: $payload,
);

\core\di::get(\core\hook\manager::class)->dispatch($hook);
$payload = $hook->get_payload();
```

## 10.32 Consuming a Hook

The consumer creates a method, normally static, receiving the exact Hook type. Inside it, apply only that callback's responsibility and leave larger rules in the plugin's own service or domain classes. Typing helps a lot here because the contract already tells you exactly which object reaches the method and which operations are available.

Do not create one universal callback receiving `object $hook` and dozens of `instanceof` checks just to put everything in one class. That recreates the disorganization of `lib.php` inside a modern file. A callback class may group related methods, but each method should remain specific to a Hook.

## 10.33 db/hooks.php

Registration lives in `db/hooks.php`. Each entry identifies the Hook class, callable, and optionally priority. Like `db/events.php`, this file should remain declarative and is cached. Changed a registration during development and nothing happened? Before rewriting half the plugin, purge caches and verify that the branch supports the notation you used.

Since Moodle 4.4 callbacks can be declared using array notation. If the plugin still supports Moodle 4.3, use the string notation compatible with that version. This is a simple example of how the minimum supported version affects even seemingly minor implementation details.

```php
<?php
$callbacks = [
    [
        'hook' => \local_integracao\hook\before_payload_sent::class,
        'callback' => [\local_outroplugin\hook_callbacks::class, 'before_payload_sent'],
        'priority' => 500,
    ],
];
```

## 10.34 Callback class

I like to keep the class receiving Hooks small, almost like an adapter. It receives the Hook, extracts what it needs, and calls a domain class or plugin service. This keeps integration with Moodle's API separate from the main rule and makes the rule easier to test without simulating the whole dispatcher.

A class named `hook_callbacks` or similar makes sense because it describes the technical role of that layer. What I would avoid is putting twenty queries, an HTTP call, PDF construction, and message sending in it. The name "callback" does not turn arbitrary logic into good architecture.

```php
<?php
namespace local_outroplugin;

final class hook_callbacks {
    public static function before_payload_sent(
        \local_integracao\hook\before_payload_sent $hook,
    ): void {
        $payload = $hook->get_payload();
        $payload['institution'] = get_config('local_outroplugin', 'institution');
        $hook->replace_payload($payload);
    }
}
```

## 10.35 Priority

Hook callbacks are ordered from highest to lowest priority. This is useful when ordering genuinely belongs to the contract, but do not use priority to hide implicit dependencies between plugins. If plugin B only works because plugin A always runs first and modifies an undocumented structure, you created coupling disguised as a number.

When order matters, document why and keep behavior predictable. Priority should solve coordination expected by the API, not a silent race among customizations nobody can understand six months later.

## 10.36 Hooks Overview

One practical advantage of the Hooks API is the overview page available to administrators and developers. It lists discovered Hooks and registered callbacks, letting you see who reacts to a given extension point without searching every `lib.php` in the installation for function names.

This visibility changes support significantly in large environments. When a customization interferes with a flow, you can start from the Hook and see consumers and priorities rather than depending only on grep. Hooks inside the standard `*[component]\hook\*` namespace are discovered automatically, while non-standard locations require a discovery agent.

## 10.37 Disabling callbacks

In special cases Moodle allows Hook callbacks to be overridden through configuration, including disabling a specific callback. This is powerful for diagnostics and environments where an integration needs to be temporarily neutralized without editing the plugin, but it should not become an everyday improvised feature-flag mechanism.

If your own plugin needs to enable or disable behavior as part of the product, create plugin configuration and handle it inside the callback. Global Hook overrides are administrative and exceptional tools, not substitutes for functional modeling.

```php
$CFG->hooks_callback_overrides = [
    \local_integracao\hook\before_payload_sent::class => [
        'local_outroplugin\\hook_callbacks::before_payload_sent' => [
            'disabled' => true,
        ],
    ],
];
```

## 10.38 Discovering available Hooks

Before inventing a new callback or editing core, look for Hooks that already exist. Start with the installation's Hooks overview page, then search code for `hook` namespaces, `dispatch(`, and description attributes. Official documentation also lists the API, but code from the branch you actually support remains the final source when versions differ.

This avoids two common hacks. The first is observing an Event after the fact simply because you did not notice an appropriate before Hook existed. The second is creating a renderer override, core hack, or patch in a central file when an extension point designed for exactly that flow already exists.

## 10.39 replaces_callbacks

The \core\attribute\hook
eplaces_callbacks attribute records that a Hook replaces one or more legacy callbacks. This is valuable because it documents migration directly on the class and lets discovery tools show the relationship between the new and old mechanisms.

When you find a historical callback in your plugin, look for this kind of metadata on the corresponding Hook. Do not guess based on similar names. A replacement Hook must provide sufficiently equivalent semantics for migration and the class itself can explicitly declare which old callbacks it replaces.

## 10.40 deprecated_callback_replacement

Besides the attribute, the API provides specific support for legacy callback deprecation through `\core\hook\deprecated_callback_replacement`. The Hook can list the old callbacks it replaces and the manager can emit debugging messages when it finds plugins that have not yet migrated.

The interesting part is that this does not force every community plugin to abandon older branches on the same day. The mechanism was designed to allow a compatibility window in which the legacy callback still exists while the modern Hook is adopted progressively.

## 10.41 Old one-to-many callbacks

Hooks primarily replace the category of one-to-many callbacks in which a point in core searches multiple plugins for implementations and calls all of them. These callbacks were a kind of Hook before there was a formal Hooks API, but they depended on function conventions and specific discovery infrastructure.

Do not confuse this with every callback in Moodle. Some callbacks are fundamental contracts of plugin types, such as mandatory Activity Module functions, and should not be migrated merely because "Hooks are new". Documentation discusses replacement of some one-to-many callbacks, not universal extinction of `lib.php`.

## 10.42 get_plugins_with_function()

`get_plugins_with_function()` is one of the historical functions used to locate plugins implementing a particular callback in `lib.php`. Core supplies the callback name, receives the functions it finds, and calls them. When reading old code, this pattern is a strong signal of a one-to-many extension point that may already have, or may eventually receive, a Hook replacement.

You do not need to reproduce this mechanism in a new plugin. If you need to create a modern extension point, create a Hook. Reproducing `get_plugins_with_function()` today to discover custom functions means deliberately choosing the old infrastructure despite a dedicated API already existing.

## 10.43 plugin_callback() and component_callback()

`plugin_callback()` and `component_callback()` appear in historical communication mechanisms and allow known callbacks to be invoked in components. They may still exist in old APIs and therefore you need to recognize them, but they are not the first choice for designing a modern extension between plugins.

When you find one in core or an older plugin, first understand its contract and check whether a documented replacement exists. Migrating only the call without understanding who consumes it, which parameters circulate, and at what point in the lifecycle it occurs is the fastest way to create a Hook with the wrong semantics.

## 10.44 How to discover whether a callback already has a replacement Hook

There are three practical routes. First search the Hooks API documentation and overview page. Then search code for the callback name inside `replaces_callbacks`. Finally, check whether the Hook class implements `deprecated_callback_replacement` or declares the callbacks it replaces through an attribute.

This search must be done on the branch the plugin supports. A callback may not have a replacement in Moodle 4.3 and have one in 5.2. If your plugin supports several branches, the architectural answer may be to keep both entry points calling the same internal implementation until the minimum branch advances.

## 10.45 after_config and its corresponding Hook

`after_config` is a useful example of the migration strategy. Historically, plugins could implement the callback invoked at the end of `lib/setup.php`. The Hooks API introduced `\core\hook\after_config`, described as a Hook dispatched at the end of setup and marked as a replacement for the legacy callback.

For a plugin supporting only modern branches where this Hook exists, registering the Hook is the natural direction. For a plugin that still needs to run on older branches, you can keep the legacy callback and the Hook registration pointing to the same internal logic. The objective is compatibility without duplicated behavior.

## 10.46 pre_block_delete and core hook block_delete_pre

Another official example is `pre_block_delete`, replaced by `\core\hook\block_delete_pre`. The Hook carries the block instance and explicitly declares that it replaces the old callback. This example shows why Hooks are more expressive: there is a typed class for the extension point instead of a global function discovered by name.

When migrating a plugin that implemented `meuplugin_pre_block_delete($instance)`, the idea is not to copy the whole body into another function. Put the rule in a class and make both the legacy callback and the Hook call that implementation during the compatibility window.

## 10.47 Prefer a Hook when a modern replacement exists

If your minimum Moodle version already provides an official Hook replacing the one-to-many callback you would otherwise use, prefer the Hook. It has better discovery, a class-based contract, priority, integration with modern infrastructure, and a maintenance path aligned with core.

This does not mean removing mandatory Activity Module callbacks or APIs that never received a Hook. The rule is more specific: when Moodle itself says a certain Hook replaces that old callback and your version matrix permits using the Hook, do not voluntarily choose the legacy layer.

## 10.48 Keep the old callback and the Hook when supporting old branches

Plugin compatibility is where absolute rules tend to break. If you support Moodle 4.1, 4.5, and 5.2, you may need to keep an old entry point because the oldest branch does not know the Hook, while also registering the Hook for newer branches. The key is not maintaining two independent implementations.

Make the legacy callback and Hook callback converge on the same service class. That way a rule fix happens only once and the difference between branches remains limited to the adaptation layer. When the minimum version increases and the legacy path is no longer needed, remove the old adapter without touching the domain.

## 10.49 How Moodle avoids double invocation during migration

Hooks API documentation explicitly anticipates a plugin containing both a legacy callback and a Hook callback during transition. When the equivalent Hook is registered, the corresponding legacy callback can be ignored by migration infrastructure, preventing the same plugin from processing the action twice.

This matters because compatibility without that behavior would produce duplicate effects such as two records, two notifications, or two external calls. Even so, test your version matrix. Callback migration is exactly the kind of change where a simple counter test quickly detects double execution.

## 10.50 Hooks during installation and upgrade

There is an important behavioral difference to keep in mind. Hooks may be dispatched during installation and upgrade, including moments when the database is not yet fully available or your plugin has not finished installing. Documentation explicitly calls this out because equivalent legacy callbacks were not always executed at those times.

A Hook callback therefore must not assume it can always query every table. Depending on the Hook, check `during_initial_install()`, the existence of the plugin version in config, and upgrade state before accessing structures that may not yet exist. A migration can be mechanically correct in code and still break the installation screen if it ignores lifecycle.

## 10.51 Do not blindly migrate callbacks that still have no Hook

Not every old callback has a modern replacement. If you invent a Hook inside your own plugin to "replace" a callback core still calls directly, nothing changed from Moodle's perspective. Core will continue expecting the old function. Your internal Hook may help organize code, but it does not replace the external contract.

Before removing any function from `lib.php`, confirm there is an official modern extension point and that it exists on your minimum branch. The worst migration is the one that makes code look cleaner and simply causes Moodle to stop calling your plugin.

## 10.52 Avoiding core hacks with Hooks

One of the best effects of Hooks is reducing the justification for editing core. When an appropriate point exists, you can customize behavior while leaving Moodle code intact and keeping your rule inside an installable plugin. This improves upgrades, security review, and the ability to compare your installation with upstream.

But a Hook is not an excuse to implement any policy anywhere. If the point does not provide the data or mutability you need, the correct architecture may be another plugin type, another API, or even proposing a new Hook to core. Forcing an unsuitable Hook can be as fragile as the hack you wanted to avoid.

## 10.53 A complete decision example

Imagine your institution needs to send a message to an ERP whenever an enrolment is created and also needs to add a field to a payload before one of your own integrations sends it. These are two different problems. For the created enrolment, observing an Event makes sense because the fact already happened and your integration simply reacts. For the payload still being prepared, a before Hook makes sense because another component needs to participate before the external action.

Now imagine you find an old callback in `lib.php` used specifically to enrich that payload and the new version of the component declares a Hook with `replaces_callbacks`. The correct migration is to register the Hook, keep a legacy adapter only as long as older branches require it, and move the shared rule into a class. What you should not do is observe an Event after the send and try to fix the payload too late.

## 10.54 How to choose in new code

First ask whether you are announcing a fact or opening an extension point. If the fact is complete, Event is a strong candidate. If other components need to participate in the current flow and perhaps modify data, Hook is a strong candidate. If documentation for a plugin type requires a specific callback, implement the callback because it is part of that contract. If you find a historical one-to-many callback, look for a modern replacement before writing a new function.

Then ask about coupling and cost. A heavy observer should probably only queue a task. A Hook with mutable data needs a clear contract. A mandatory callback should forward into a class. And any solution beginning with editing a core file needs to justify why no official extension point works, because in most cases there is a better alternative or a path to create one.

## 10.55 Exercise — migrating a legacy callback

Create a fictitious plugin that initially uses the legacy `after_config` callback to register a simple initialization. Keep the real logic in `classes/service/bootstrap.php` and make the callback in `lib.php` only call that class. Then register the `\core\hook\after_config` Hook in `db/hooks.php`, pointing to a callback class that calls the same service.

Test on a branch where the Hook exists and confirm the logic executes only once. Then add protection for initial installation and simulate an upgrade, ensuring the modern callback does not try to access a table that does not yet exist. Finally, temporarily remove the Hook registration and observe the legacy callback behavior, understanding how the compatibility strategy works in practice.

As a second part, observe a core Event, for example a course view, but do not perform heavy work inside the observer. Record only a minimal marker or queue a fictitious adhoc task. Mentally compare the two cases and explain why one is an Event and the other a Hook. If the answer is only "because the documentation says so," return to the beginning of the chapter.

## 10.56 The mental model that should remain

Events, Hooks, and callbacks are extension mechanisms, but they are not three names for the same thing. An Event represents something that happened and integrates with logging and observation. A Hook creates a deliberate participation point between components and may allow modification or interruption according to its contract. A callback is the historical convention that still supports important parts of Moodle and must be respected where it remains official API.

When you separate these intentions, the code becomes much more predictable. Event stops being used as a workaround for a before action, Hook stops becoming an improvised log, and `lib.php` stops receiving another global function for every new requirement. Migrations also become smaller because the real rule lives in classes and Moodle APIs work as adapters around it.

If I could summarize this chapter in one practical rule, it would be this: do not choose the mechanism based on how many examples you found on Google. Determine what you want to communicate, at which point in the flow it happens, and whether the consumer may influence the operation. Then choose the API that expresses that intent. In older Moodle much was a callback because there was no better alternative. In modern Moodle, continuing to do everything that way is already a choice, not a necessity.

## Technical references consulted

* Moodle Developer Resources. Hooks API, version 5.2. Documentation for the API introduced in Moodle 4.3, registration in `db/hooks.php`, priorities, stoppable Hooks, attributes, and migration from legacy callbacks.
* Moodle Developer Resources. Development policies, Events section. Observers receive information about events that occurred and must not modify event data or prevent the original action.
* Moodle Developer Resources. Moodle 2.7 release notes. Conversion of core events to the new Events API and deprecation of older logging APIs.
* Moodle core. `public/lib/classes/event/course_viewed.php`, current example of an Event with `init()`, CRUD, educational level, description, URL, and context validation.
* Moodle Developer Resources. Hooks API 4.5 and 5.x. Compatibility strategy between legacy callbacks and Hooks, including `after_config`, `pre_block_delete`, `replaces_callbacks`, and `deprecated_callback_replacement`.

{% endraw %}