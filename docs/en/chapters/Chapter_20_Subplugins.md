{% raw %}

# 20 SUBPLUGINS

Subplugins are one of those Moodle topics that look simple when viewed as a directory structure and become much more interesting once you understand the architecture behind them. The first impression is usually "it's a plugin inside another plugin", but that definition is too short because it does not explain who discovers that plugin, who defines the contract it must fulfill, where its Frankenstyle component comes from, how installation and upgrade work, or why some Moodle components can receive internal extensions while others cannot.

A more useful way to think about it is that a subplugin exists when a parent plugin decides to become extensible. The parent creates a formal extension point, declares a new plugin type, and allows other extensions to be installed inside that structure without editing the parent's code. This changes the design considerably. Instead of placing fifteen integrations in the same directory with one huge `switch` saying "if SAP do this, if Totvs do that, if custom API do something else", the parent defines a small contract and each integration becomes an independent component with its own version, classes, database, configuration, and lifecycle.

That is exactly why Quiz does not keep every report and access rule as one giant class inside `mod_quiz`, and why Assignment separates submission types from feedback types. The parent plugin knows the concept while the subplugin implements one variation of that concept.

In this chapter we will use a fictitious parent plugin called `local_deliveryhub`, designed to centralize the sending of academic data to external systems, and it will support subplugins of type `deliveryconnector`. One connector may talk to an ERP, another may publish to a REST API, and another may write to a corporate queue, but all obey the same contract defined by the parent. The example is fictitious, but the architecture is the same one that appears in several real parts of Moodle.

## 20.1 What is a subplugin?

A subplugin is a plugin whose type is declared by another plugin. This means `deliveryconnector_sap` does not exist in Moodle simply because somebody created a directory with that name; it exists because `local_deliveryhub` told core that it has a subplugin type named `deliveryconnector` and indicated where those components live.

The subplugin remains a real plugin. It has its own component, `version.php`, language strings, classes, possible `db/install.xml`, `db/upgrade.php`, Events, Hooks, Tasks, and other resources available to Moodle plugins. The difference is that its type was not created directly by core; it was created by a parent plugin.

## 20.2 The parent plugin creates the extension point

There is no subplugin without a parent plugin. The parent is responsible for declaring that it accepts extensions and, more importantly, defining what those extensions mean.

If `local_deliveryhub` declares `deliveryconnector`, it is responsible for saying what a connector needs to do. There may be an `connector` interface, an abstract class, a factory, or a dispatcher locating implementations, but there needs to be a comprehensible contract. Declaring a folder without defining behavior only creates several directories Moodle can recognize, not an extensible architecture.

This is the point separating extensibility from disorganization. The parent should know the subplugin type, but it should not know every future implementation in advance.

## 20.3 When a subplugin makes sense

A subplugin makes sense when there is one main component with a clear responsibility and independent variations of part of that responsibility. Quiz has a main activity and different reports, as well as different access rules. Assignment has the main activity and different submission and feedback methods.

In our example, `local_deliveryhub` knows the export process, maintains the queue, auditing, and general configuration, while each connector knows how to talk to one specific destination. This makes it possible to install or remove a connector without turning the parent into an endless collection of optional integrations.

## 20.4 When not to create subplugins

Not every interchangeable class needs to become a subplugin. If there are two small strategies that will always be distributed together, an internal interface and two classes may be enough. Creating a new plugin type increases maintenance, installation, testing, versioning, and documentation cost.

Do not use a subplugin merely to organize directories either. If functionality will never be installed, updated, or distributed independently, you are probably trying to solve code organization with an extensibility mechanism.

## 20.5 A subplugin is not an ordinary dependency

A plugin may depend on another plugin without being its subplugin. A `local_reports` may declare a dependency on `mod_quiz` and remain independent. In that situation there is a dependency relationship, but `local_reports` does not become part of a type created by Quiz.

With a subplugin the relationship is stronger. The type itself is defined by the parent and, according to Moodle's component communication policy, the subplugin may assume its parent exists, while it must not assume other optional plugins exist unless that dependency is declared or checked.

## 20.6 Which plugins can host subplugins

Moodle's architecture documentation restricts the ability to host subplugins to certain plugin types, including activity modules, editors, administration tools, and local plugins. This matters when designing a new extensible system because it is not correct to assume any plugin type can simply create `db/subplugins.json` and automatically become a host.

For this chapter we use `local_deliveryhub` because `local` is one of the types allowed to host subplugins and because our scenario is a generic institutional extension.

## 20.7 Subplugin Frankenstyle name

A subplugin's Frankenstyle component follows the same general logic as other plugins, combining the subplugin type and its short name. If the type is `deliveryconnector` and the name is `sap`, the component is `deliveryconnector_sap`.

This appears in strings, namespaces, configuration, Events, and several APIs:

```php
get_string('pluginname', 'deliveryconnector_sap');
get_config('deliveryconnector_sap');
```

The parent name does not need to appear in the component because the parent relationship is already known through type `deliveryconnector`.

## 20.8 Parent directory structure

A possible structure for the parent is:

```
local/deliveryhub/
    classes/
    connector/
    db/
        subplugins.json
    lang/
        en/
            local_deliveryhub.php
    settings.php
    version.php
```

The `connector/` directory will be where subplugins are installed. The name of this directory is a parent-plugin decision and will be declared in `db/subplugins.json`.

## 20.9 Structure of a subplugin

A connector named `sap` could contain:

```
local/deliveryhub/connector/sap/
    classes/
        connector.php
    db/
        tasks.php
    lang/
        en/
            deliveryconnector_sap.php
    settings.php
    version.php
```

It lives physically inside the parent's tree but continues to have its own identity. That distinction matters because parent and subplugin versions do not need to advance together.

## 20.10 `db/subplugins.json`

The file declaring subplugin types lives in the parent plugin under `db/subplugins.json`. In current Moodle, a minimal example is:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    }
}
```

The key is the new plugin type and the value is the path, relative to the parent root, where components of that type live.

## 20.11 The Moodle 5.0 change

Moodle 5.0 introduced an important change to subplugin metadata. The modern object became `subplugintypes` and its paths are relative to the parent plugin root.

Before that, `plugintypes` was used with paths relative to the whole Moodle root. The change seems small but fixes an old inconsistency and makes the parent less coupled to its absolute position in the project tree.

## 20.12 `subplugintypes` on Moodle 5.0 or later

For our modern example:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    }
}
```

Because `subplugins.json` is inside `local/deliveryhub/db/`, the `connector` path is interpreted relative to `local/deliveryhub/`.

## 20.13 `plugintypes` on older branches

If the same plugin must run on Moodle 4.5 or earlier, the legacy format still needs to be declared:

```
{
    "plugintypes": {
        "deliveryconnector": "local/deliveryhub/connector"
    }
}
```

Notice the difference. In the legacy form the path starts from Moodle root, while in the new form it starts from the parent plugin root.

## 20.14 Supporting Moodle 4.5 and Moodle 5.x in the same codebase

When a plugin needs to cross this version boundary, current documentation recommends declaring both objects with the same keys:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    },
    "plugintypes": {
        "deliveryconnector": "local/deliveryhub/connector"
    }
}
```

This is not duplication of two different types; it is the same information expressed in two formats understood by different branches.

## 20.15 Keys need to remain identical

Do not create `deliveryconnector` in one object and `deliveryintegration` in the other. If the objective is compatibility, the type needs to be the same. Only the way its path is expressed changes.

This rule also prevents a very bad upgrade scenario where the same directory begins to look like two different plugin types depending on the Moodle version.

## 20.16 What Moodle does with this declaration

After Moodle knows the type, the component manager can map `deliveryconnector` to the corresponding directory and begins discovering plugins of that type the same way it discovers other components.

That is why you do not need to write `glob($CFG->dirroot . '/local/deliveryhub/connector/*')` to find connectors. Manual filesystem scanning ignores Moodle's component system, caches, and validation.

## 20.17 `core_component::get_subplugins()`

Core provides discovery of subplugin declarations made by the parent. A call like this lets you query the types defined by a component:

```php
$types = core_component::get_subplugins('local_deliveryhub');
```

The result represents subplugin types known for that parent. Use component APIs instead of reconstructing the information by manually reading JSON.

## 20.18 `core_plugin_manager::get_subplugins()`

The plugin manager also exposes `get_subplugins()`, but its purpose is broader: it returns plugins defining subplugins and information about the types they declare.

```php
$manager = core_plugin_manager::instance();
$definitions = $manager->get_subplugins();
```

This is useful when building administrative tools, diagnostics, or when you need to understand parent/type relationships in general.

## 20.19 `get_subplugins_of_plugin()`

When you already know the parent and want its installed subplugins, the plugin manager provides a direct API:

```php
$manager = core_plugin_manager::instance();
$plugins = $manager->get_subplugins_of_plugin('local_deliveryhub');
```

The result uses component names as keys and `plugininfo` objects as values. This is much more robust than inferring components from directory names.

## 20.20 Discovering plugins of one specific type

If the parent knows type `deliveryconnector`, it can also use ordinary plugin APIs for that type. In many cases working with `core_component::get_plugin_list('deliveryconnector')` is enough to obtain the names and directories of known implementations.

```php
$connectors = core_component::get_plugin_list('deliveryconnector');
```

From there the parent decides which ones are enabled and how to instantiate them.

## 20.21 `plugininfo`

Moodle represents discovered plugins through `plugininfo` objects. They carry component, version, dependency, directory, installation state, and other metadata used by the plugin manager.

For a subplugin host this is useful in administrative and diagnostic screens because it avoids creating a second inventory system parallel to core. The parent can query the plugin manager and work with the same view Moodle uses.

Do not confuse `plugininfo` with your subplugin's functional API. `plugininfo` describes the component for management; the business behavior remains defined by the parent plugin's contract.

## 20.22 The parent needs to define a contract

The JSON declaration solves discovery only. You still need to answer what an `deliveryconnector` must implement.

A modern approach is defining an interface in the parent:

```php
namespace local_deliveryhub\local;

interface connector {
    public function get_name(): string;

    public function is_available(): bool;

    public function send(array $records): send_result;
}
```

Now every subplugin has a clear contract and the parent can work without knowing SAP, ERP, or REST API details.

## 20.23 Interface or abstract class

An interface works well when the parent only wants to define behavior. An abstract class is useful when there is shared implementation that genuinely belongs to the contract.

Do not put fifty methods into a base class merely because every connector "might need them one day." The larger the mandatory surface, the harder it becomes to evolve the parent without breaking third parties.

## 20.24 Base class

When common behavior exists, a base class can centralize configuration access, logging, or helpers belonging specifically to the contract:

```php
namespace local_deliveryhub\local;

abstract class connector_base implements connector {
    public function __construct(
        protected readonly string $name,
    ) {
    }

    protected function component(): string {
        return 'deliveryconnector_' . $this->name;
    }
}
```

The objective is to remove genuinely common repetition, not create a superclass that knows the details of every implementation.

## 20.25 Implementation in the subplugin

The SAP subplugin can implement the contract:

```php
namespace deliveryconnector_sap;

class connector extends \local_deliveryhub\local\connector_base {
    public function get_name(): string {
        return get_string('pluginname', 'deliveryconnector_sap');
    }

    public function is_available(): bool {
        return !empty(get_config('deliveryconnector_sap', 'endpoint'));
    }

    public function send(array $records): \local_deliveryhub\local\send_result {
        // Envio específico ao SAP.
    }
}
```

The parent continues to know only the interface and component.

## 20.26 Factory

A factory can transform a plugin name into a contract instance:

```php
namespace local_deliveryhub\local;

final class connector_factory {
    public static function create(string $name): connector {
        $classname = "\\deliveryconnector_{$name}\\connector";

        if (!class_exists($classname)) {
            throw new \coding_exception("Connector {$name} is not available");
        }

        $instance = new $classname($name);

        if (!$instance instanceof connector) {
            throw new \coding_exception("Invalid connector {$name}");
        }

        return $instance;
    }
}
```

The factory centralizes convention and validation. Do not scatter dynamic class-name construction across ten parent files.

## 20.27 A factory does not replace discovery

A factory instantiates, but it should not be responsible for discovering filesystem directories. First obtain the list through `core_component`, then instantiate only known components.

This separation prevents user input from becoming part of an arbitrary class name and keeps the design more predictable.

## 20.28 Dispatcher

Some parents need to run every enabled subplugin for a particular event. A dispatcher can do this:

```php
final class dispatcher {
    public function send_to_all(array $records): array {
        $results = [];

        foreach ($this->repository->get_enabled() as $name) {
            $connector = connector_factory::create($name);
            $results[$name] = $connector->send($records);
        }

        return $results;
    }
}
```

The dispatcher should not know implementation-specific rules. If it starts containing `if ($name === 'sap')`, the abstraction is already leaking.

## 20.29 Enabling and disabling subplugins

Moodle recognizing a subplugin does not mean it has to be operational. The mechanism for enable/disable is a responsibility the parent may need to define.

A simple approach is for the parent to keep a configuration list of enabled plugins and expose an administration screen. Another is for every subplugin to have its own flag. The important thing is to have one predictable source for that decision.

Do not confuse "installed" with "enabled." A component may remain installed to preserve configuration and data while being temporarily disabled for execution.

## 20.30 Parent-global configuration and child-specific configuration

The parent should keep configuration belonging to the system as a whole, such as batch size and retry policy. The child should keep configuration specific to its implementation, such as endpoint, tenant, or queue identifier.

```php
$batchsize = get_config('local_deliveryhub', 'batchsize');
$endpoint = get_config('deliveryconnector_sap', 'endpoint');
```

This prevents the parent from accumulating dozens of settings that only make sense when one particular subplugin is installed.

## 20.31 `settings.php` in subplugins

Because a subplugin is a real component, it can have `settings.php`. However, the exact place where its page appears in the administration tree may depend on the parent and how the parent organizes settings.

More sophisticated hosts may build their own category and include or reference child settings. The important point is not to make the child depend on private HTML or internal routes of the parent without a stable contract.

## 20.32 The subplugin's `version.php`

Every subplugin has its own `version.php`:

```php
$plugin->component = 'deliveryconnector_sap';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
```

Parent and child versions do not need to move together. This is one of the major benefits of separating independent implementations.

## 20.33 Explicit dependency on the parent

Although the subplugin relationship already implies the host exists, declaring dependencies where appropriate makes version requirements clearer, especially when the parent's contract evolves.

```php
$plugin->dependencies = [
    'local_deliveryhub' => 2026092300,
];
```

That way a connector depending on an interface introduced in a certain version is not silently installed against an old parent.

## 20.34 Avoid circular dependencies

The parent defines the contract and the child depends on the parent. If the parent begins directly depending on `deliveryconnector_sap`, you created a conceptual circular dependency and destroyed extensibility.

The parent may discover installed connectors, but it should not require one specific implementation to function unless this is an explicit product decision reflected in dependencies.

## 20.35 Subplugin installation

As its own component, the subplugin can have `db/install.xml` and `db/install.php`. Its tables need prefixes coherent with its component and should exist only when they genuinely belong to that implementation.

A connector that needs to store external mappings can have its own table while the parent maintains common queue and audit data. This separation makes independent removal and upgrade easier.

## 20.36 Subplugin upgrades

The subplugin also has `db/upgrade.php` and its `xmldb_[component]_upgrade()` function follows the same principles as other plugin types.

Do not put every child schema change inside the parent's `upgrade.php`. That forces the parent to know versions and tables belonging to extensions that should be independent.

## 20.37 Parent upgrades and contract evolution

The delicate part appears when the parent changes the interface children implement. Altering a required method can break every third-party subplugin at once.

Prefer backwards-compatible evolution, new optional methods where possible, versioned interfaces for major changes, or a clear deprecation window. Subplugins turn your internal API into an API for third parties, so changes need the same care as any public API.

## 20.38 Public API of the parent

If third parties will build subplugins, code they need to use must be consciously public. Do not expect external developers to import classes from `local` that you intend to rewrite in every release and then blame their subplugin when it breaks.

Define stable contracts, document extension points, and keep implementation details genuinely internal and outside the surface children need to consume.

## 20.39 Events in subplugins

Subplugins can observe Events through `db/events.php` like other plugins. This is useful when an implementation needs to react to Moodle facts without the parent manually dispatching every situation.

But inspect the architecture. If every connector needs to receive exactly the same business event from the parent, an explicit dispatcher may be better than making every child observe internal events and reconstruct context independently.

## 20.40 Events created by subplugins

A subplugin can also trigger its own Events, for example `deliveryconnector_sap\event\delivery_failed`. This enables auditing, observation by other components, and standard-log integration when the event genuinely represents a relevant fact.

Do not use an Event as an indirect method call. The Chapter 10 rule still applies: an Event represents something that happened.

## 20.41 Hooks in subplugins

Subplugins can consume Hooks from core or from the parent when the parent publishes extension points using Hooks. This can be useful when several consumers exist and the flow needs to allow data changes before an action.

The host can also use Hooks to expand extensibility beyond the primary contract, but do not create fifteen mechanisms for the same thing. If `connector` already solves sending, you do not need a Hook merely to call `send()`.

## 20.42 Tasks owned by subplugins

Every subplugin may declare Scheduled and Adhoc Tasks. A connector might renew a token or synchronize a catalog on its own schedule.

Still, work representing the common product queue normally belongs to the parent. If every connector creates its own queue, retry strategy, lock, and audit system, you lose the centralization that justified the host in the first place.

## 20.43 Adhoc Task and subplugin identification

One common strategy is for the parent to queue work and store only the connector identifier in custom data. When the task executes, it uses the factory and calls the child.

This avoids serializing subplugin class objects into task data and makes the payload more resilient to upgrades.

## 20.44 Lock API

If subplugins process shared external resources, the same concurrency concerns from previous chapters remain. A connector may need a lock per account, tenant, or batch to prevent duplicate sends.

Being isolated into a separate plugin does not eliminate race conditions.

## 20.45 Cache

Subplugins can declare caches in `db/caches.php` too. If data is connector-specific, the cache should belong to the child; if it represents aggregated information across connectors, it probably belongs to the parent.

Avoid creating parent caches with keys embedding private details of each implementation because that couples the host back to its children.

## 20.46 Files API

A subplugin may have its own file areas using its own component. This matters because component is part of a Moodle file's identity.

If `deliveryconnector_sap` needs to store a public certificate or auxiliary file, use the Files API with `component = deliveryconnector_sap`, provided the file genuinely belongs to that implementation.

## 20.47 Capabilities

Subplugins can define their own capabilities when there is a genuinely implementation-specific operation. Think carefully before creating one capability per implementation if the conceptual action is the same for every child.

Sometimes `local_deliveryhub:manageconnectors` on the parent is enough. In other cases one connector needs special permission to view sensitive information. The decision comes from the authorization model, not the directory structure.

## 20.48 Web Services and AJAX

Nothing prevents a subplugin from exposing external functions or endpoints, but the same contract principle applies. If every integration should be accessed through the parent's uniform API, exposing private child endpoints may break the abstraction and force clients to understand each implementation.

Use subplugin-specific endpoints when the functionality is genuinely specific and documented as part of that subplugin.

## 20.49 Privacy API

If a subplugin stores personal data, it needs to participate correctly in the Privacy API. The parent's provider does not automatically cover tables and data owned by the child.

In extensible systems this responsibility needs to be documented in the subplugin-development contract because third parties may introduce new personal data the parent does not know about.

## 20.50 Backup and restore

Backup is one place where the phrase "it is a real plugin" needs nuance. A subplugin can participate in backup and restore, but there is no universal magic that automatically inserts every child record into the parent's backup.

The host needs to offer appropriate integration points and the plugin type needs to be connected to the backup plan. Activities such as Quiz and Assignment have specific infrastructure allowing their subplugins to add structures and process data.

In a custom host you need to design this deliberately. If `local_deliveryhub` stores global integration data, that may not belong in course backup at all; if the parent were an Activity Module and each child stored per-instance data, backup and restore would be essential parts of the contract.

## 20.51 Do not copy IDs across installations

When backup and restore involve subplugins, never assume local IDs will remain the same. The subplugin must use restore mappings and references like any other component.

This matters even more when a subplugin references parent records because restore order and mappings need to be well defined.

## 20.52 Uninstallation

A subplugin can be removed independently, so the parent should not break when one implementation disappears. Rediscover available plugins and handle obsolete configuration.

If the enabled list contains `sap` but component `deliveryconnector_sap` was removed, the administration screen should report the problem and runtime should fail in a controlled way rather than producing a fatal error on every request.

## 20.53 Do not store class names as eternal truth

Saving `\deliveryconnector_sap\connector` directly in the database may look practical but couples persistence to a class-layout decision. Prefer a logical name such as `sap` or component `deliveryconnector_sap` and let the factory resolve the class.

That way internal implementation can move without migrating every database row simply because you reorganized classes.

## 20.54 Directory names are not a business API

The path `local/deliveryhub/connector/sap` is a discovery detail. Business logic should not build pathnames to decide how to call a child.

Use component names, the plugin manager, and contracts. This also reduces problems when metadata structure changes between Moodle versions.

## 20.55 Quiz reports

Quiz provides a classic subplugin example. Reports use type `quiz` and live under `mod/quiz/report`. Components such as `quiz_overview`, `quiz_statistics`, and `quiz_responses` are independent plugins of that type.

The Quiz activity understands the report concept and provides infrastructure for them, but every report can have its own classes, configuration, and code. This prevents `mod_quiz` from directly containing every possible attempt-analysis method.

## 20.56 Quiz access rules

The second important Quiz type is `quizaccess`, located under `mod/quiz/accessrule`. Rules such as passwords, IP addresses, secure windows, and attempt limits represent independent policies participating in Quiz access.

This makes the value of subplugins very clear: Quiz defines when a rule can intervene and each rule implements the required contract, without core containing an `if` for every access policy in the world.

## 20.57 The real Quiz `subplugins.json`

Current Quiz versions declare both formats for compatibility:

```
{
    "subplugintypes": {
        "quiz": "report",
        "quizaccess": "accessrule"
    },
    "plugintypes": {
        "quiz": "mod/quiz/report",
        "quizaccess": "mod/quiz/accessrule"
    }
}
```

This is an excellent example of the path differences between Moodle 5.x and previous branches.

## 20.58 Assignment submission

Assignment declares `assignsubmission`, used for ways of submitting work. Online text and file submission are examples.

The `mod_assign` parent controls activity, dates, attempts, grade, and general workflow while a submission subplugin knows how to capture, store, and present one type of submission.

## 20.59 Assignment feedback

The second Assignment type is `assignfeedback`. It lets developers implement different ways of returning feedback to learners.

Submission and feedback live under the same parent but have different contracts because they represent different extension points. This is another reason not to create one generic type called merely `assignplugin`.

## 20.60 The real Assignment `subplugins.json`

The current declaration follows the same pattern:

```
{
    "subplugintypes": {
        "assignsubmission": "submission",
        "assignfeedback": "feedback"
    },
    "plugintypes": {
        "assignsubmission": "mod/assign/submission",
        "assignfeedback": "mod/assign/feedback"
    }
}
```

The type name communicates responsibility and the path shows where implementations are installed.

## 20.61 Database field types

The Database activity is extensible too. `datafield` represents field types used in the activity, while `datapreset` represents presets and has a more historical character.

A text, number, or URL field is an implementation of a concept understood by `mod_data`. The parent controls records, templates, and the activity while the subplugin controls details of that field type.

## 20.62 The real Database `subplugins.json`

In the current tree we find:

```
{
    "subplugintypes": {
        "datafield": "field",
        "datapreset": "preset"
    },
    "plugintypes": {
        "datafield": "mod/data/field",
        "datapreset": "mod/data/preset"
    }
}
```

This example also reminds us that subplugin types can age. Current documentation describes Database presets as a legacy plugin type, so do not assume every historical extension point represents the ideal pattern for new design.

## 20.63 Deprecating subplugin types

Since Moodle 5.0 there is a formal process for deprecating plugin types and subplugin types. This means the extension declaration itself also has a lifecycle.

If a host decides to retire a subplugin type, it first needs to remove or replace internal dependencies on that type and provide a migration strategy. Deprecating a type is not merely adding `@deprecated` to one class.

## 20.64 Compatibility between branches

If you maintain a host for Moodle 4.5 and 5.x, test clean installation on both families rather than only upgrades in one development environment. `subplugins.json` is read very early during discovery and an error there can cause Moodle simply not to recognize the type.

CI for a parent plugin with subplugins should install at least one test implementation because validating only the parent does not prove discovery and contract behavior work.

## 20.65 Testing the parent contract

The parent should have tests for its factory, repository, and dispatcher. Test no-subplugin scenarios, one valid subplugin, one disabled subplugin, and one invalid implementation.

It can also be worthwhile to create a small fixture subplugin in tests when infrastructure permits, because this checks the real extension point instead of only mocks of internal classes.

## 20.66 Testing a subplugin

The child tests its specific implementation. For `deliveryconnector_sap`, test payload transformation, error handling, configuration, and integration with the parent contract.

Do not repeat in every child all tests that belong to the host. The parent tests the extensibility framework; the child tests the implementation.

## 20.67 Code review for a system with subplugins

During review I first look for inappropriate knowledge. Does the parent contain `if` with child names? Does the child query internal parent tables without an API? Does the parent build physical paths? Is child configuration spread throughout the parent? Does parent upgrade alter a child table?

Those are signs that directories are separate but architecture is not.

## 20.68 Document the contract for third parties

If third parties can build subplugins, documentation needs to describe minimum structure, interface, Events, Hooks, configuration, capabilities, backup, privacy, supported versions, and compatibility policy.

The best extensibility test is to give only that documentation to another team and see whether they can build a component without opening three existing implementations to discover hidden conventions.

## 20.69 A complete extensible-host project

Our `local_deliveryhub` could centralize queue, audit, locks, retries, and the administrative interface. Type `deliveryconnector` would contain only destination connectors.

The flow would be: one parent rule creates a batch, an Adhoc Task loads the enabled connector through the factory, the dispatcher calls `send()`, the child converts data to its protocol and returns a `send_result`, and the parent records uniform state regardless of destination.

This means adding `deliveryconnector_totvs` should not require changing `local_deliveryhub`. If it does, ask whether the contract was really designed as an extension point.

## 20.70 Exercise

Create a parent plugin `local_deliveryhub` with a subplugin type named `deliveryconnector` and make the project work on Moodle 4.5 and Moodle 5.x. The parent should declare `plugintypes` and `subplugintypes`, provide a small public interface, factory, installed-connector repository, enabled configuration, dispatcher, Adhoc Task, and audit trail.

Then create two subplugins, `deliveryconnector_file` and `deliveryconnector_http`. The first writes the batch to a file using Moodle APIs and the second simulates HTTP sending through the Curl API. Each child must have its own `version.php`, language strings, settings, and implementation tests.

Then evolve the parent's contract compatibly by adding an optional capability such as `supports_healthcheck()` without breaking the two existing children. Finally, test clean installation, upgrade, disabling one connector, physically removing a child still listed in configuration, concurrent task execution, and behavior when a third subplugin implements the interface incorrectly.

The exercise is only complete when you can install a third connector without editing one line of the parent. If you need to open `dispatcher.php` and add another `case`, you built a collection of implementations, not a subplugin system.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Plugin types. Available at: https://moodledev.io/docs/5.2/apis/plugintypes. Accessed Sep 23, 2026.
* MOODLE. Moodle Developer Resources. Metadata. Available at: https://moodledev.io/general/development/tools/metadata. Accessed Sep 23, 2026.
* MOODLE. Moodle Developer Resources. Component Communication. Available at: https://moodledev.io/general/development/policies/component-communication. Accessed Sep 23, 2026.
* MOODLE. Moodle Developer Resources. Moodle 5.0 developer update. Available at: https://moodledev.io/docs/5.0/devupdate. Accessed Sep 23, 2026.
* MOODLE. Moodle Developer Resources. Assignment sub-plugins. Available at: https://moodledev.io/docs/5.2/apis/plugintypes/assign. Accessed Sep 23, 2026.
* MOODLE. Moodle Developer Resources. Database activity sub-plugins. Available at: https://moodledev.io/docs/5.0/apis/plugintypes/mod_data. Accessed Sep 23, 2026.
* MOODLE. Moodle source code. mod/quiz/db/subplugins.json. Available at: https://github.com/moodle/moodle/blob/main/public/mod/quiz/db/subplugins.json. Accessed Sep 23, 2026.
* MOODLE. Moodle source code. mod/assign/db/subplugins.json. Available at: https://github.com/moodle/moodle/blob/main/public/mod/assign/db/subplugins.json. Accessed Sep 23, 2026.
* MOODLE. Moodle source code. mod/data/db/subplugins.json. Available at: https://github.com/moodle/moodle/blob/main/public/mod/data/db/subplugins.json. Accessed Sep 23, 2026.
* MOODLE. Moodle source code. core_plugin_manager. Available at: https://github.com/moodle/moodle/blob/main/public/lib/classes/plugin_manager.php. Accessed Sep 23, 2026.

{% endraw %}