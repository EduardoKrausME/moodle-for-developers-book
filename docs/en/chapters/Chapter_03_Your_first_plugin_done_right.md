# 3 BUILDING YOUR FIRST PLUGIN CORRECTLY

Creating a Moodle plugin that installs is relatively easy. Creating a plugin that remains understandable after two years, survives upgrades without surprises, does not scatter logic through global files, and does not force the next developer to discover hidden rules is another story. The problem is that both plugins can look identical on the first day. Both have a `version.php`, both appear in administration, and both may display a page that works. The difference appears later, when the project grows and what looked like a directory with a few files starts depending on events, permissions, scheduled tasks, integrations, cache, web services, backup, and compatibility across versions.

For that reason this chapter will not begin with the classic "create a directory under `local/` and put an `index.php` inside it." After the previous chapter we already know that the plugin type is an architectural decision, so now we can look at the second problem: organizing a component correctly after the type has been chosen. Moodle has very strong conventions for this and, when we follow them, much of the infrastructure comes almost for free. When we ignore them, we begin rebuilding mechanisms core already provides and the code becomes increasingly difficult to maintain.

The larger subjects appear here as a map. Database, Events, Hooks, Tasks, Web Services, Privacy, and Backup have their own chapters, so it would make little sense to turn this chapter into an abbreviated version of all of them. What we need now is to understand where each piece lives, when it is loaded, and which responsibility it should assume, because the first skill of a good Moodle developer is not memorizing functions but knowing where to look and where to put each thing.

## 3.1 What is a Moodle plugin?

A Moodle plugin is an installable component that participates in the system architecture through a plugin type recognized by core and a unique name inside that type. It is not simply a directory of PHP files placed somewhere in the application. When Moodle recognizes `tool_catalogsync`, for example, it knows there is a component of type `tool` named `catalogsync`; it can locate its files, autoload classes, find language strings, identify settings, run upgrade steps, and discover declarations made in files such as `db/tasks.php`, `db/hooks.php`, or `db/services.php`.

That identity runs through practically every modern API. A capability might be `tool/catalogsync:manage`, a string comes from `tool_catalogsync`, a template might be `tool_catalogsync/status`, a class starts with the `tool_catalogsync` namespace, a cache definition belongs to the `tool_catalogsync` component, and a setting is stored under that same component. The name is not decoration; it is the plugin's technical identity.

This changes how you should think about structure. In an ordinary PHP application it may be tempting to create a `src` directory, another called `helpers`, a third called `includes`, and organize everything according to personal preference. Moodle gives you some freedom, but inside very clear rules. Core expects certain files in certain places and the autoloader expects classes under `classes/`. Working against those conventions does not make the project more original; it simply makes you lose automatic features and create unnecessary work.

## 3.2 Minimum plugin structure

The minimum structure depends on the plugin type because some types require files that others do not. Even so, almost every modern plugin begins with two things you can treat as fundamental: `version.php` and an English language file. Depending on the type there may also be a mandatory `lib.php` or specific callbacks, but those are requirements of that plugin type's contract rather than a universal rule for every plugin.

A generic skeleton could begin like this:

```
pluginname/
|-- classes/
|-- lang/
|   `-- en/
|       `-- plugintype_pluginname.php
`-- version.php
```

It looks small because it really is small. A plugin does not need to be born with fifteen empty directories copied from another project. If there is no database yet, there is no reason to create `db/install.xml`; if there are no tasks, `db/tasks.php` does not need to exist; if the plugin sends no messages, `db/messages.php` only adds noise; if there is no JavaScript, creating `amd/src/` in advance improves nothing.

This is a simple rule that avoids a surprising amount of confusion: create structure when the responsibility appears. Moodle discovers many features by the presence of conventional files, so empty or unnecessarily copied files can lead readers to search for functionality that does not actually exist.

## 3.3 Correct directory name

The physical directory name is the plugin's short name and must live in the directory corresponding to the chosen plugin type. If we create `tool_catalogsync`, the directory is named `catalogsync` and lives under the admin tools directory. Starting with Moodle 5.1, after the codebase reorganization into `public/`, that normally means a path such as `public/admin/tool/catalogsync`, while in earlier branches the same type appeared directly under `admin/tool/catalogsync` at the installation root.

The important detail is that `tool_catalogsync` must not become the directory name. The type is already represented by the path, and Moodle builds the Frankenstyle name by combining the known type with the directory name. For `mod_supervideo`, for example, the directory is `supervideo` under `mod`; for `auth_myauth`, it is `myauth` under `auth`; for `local_integration`, it is `integration` under `local`.

Use lowercase names and follow the rules for the plugin type. Avoid inventing separators, spaces, uppercase letters, or unnecessarily long names. Besides appearing in many identifiers, the name also influences table names, capabilities, callback functions, and other elements with their own constraints. Renaming a plugin after it already has data, integrations, and production installations is far more work than choosing the name carefully at the beginning.

## 3.4 Component Frankenstyle

Frankenstyle is the component's full name in the form `type_name`. In our example, the type is `tool`, the short name is `catalogsync`, and the component becomes `tool_catalogsync`. This form appears throughout Moodle and must remain consistent because the system uses the component as a key to locate resources.

Inside `version.php` we have `$plugin->component = 'tool_catalogsync'`, the base namespace is `tool_catalogsync`, the language file is `lang/en/tool_catalogsync.php`, templates are referenced as `tool_catalogsync/name`, plugin settings belong to the `tool_catalogsync` component, and several APIs require exactly that identifier.

Some plugin families have slight variations in paths and naming for historical reasons, especially subplugins, but the principle remains the same. You should not guess Frankenstyle from the commercial name alone. The reliable source is the selected plugin type, the location recognized by Moodle, and the rules specific to that type.

When something appears not to load, the first check should be trivial and is therefore often forgotten. Compare the physical path, `$plugin->component`, the namespace, and the language filename. One character of difference is enough to create errors that look mysterious until somebody notices that the plugin calls itself three different things in its own code.

## 3.5 What is `version.php`?

`version.php` is the plugin's metadata file. Moodle uses it to know which component is present on disk, which version of the code is installed, which Moodle version it requires, which branches it declares as supported, what maturity level it has, and whether it depends on other plugins.

It is read in important installation, upgrade, and component-discovery paths, so it must be simple and predictable. Do not think of it as your plugin's bootstrap file. It does not exist to load classes, execute queries, inspect configuration, or initialize services. It is a metadata declaration file.

A reduced example could look like this:

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'tool_catalogsync';
$plugin->version = 2026092300;
$plugin->requires = 2025100600;
$plugin->supported = [501, 502];
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

The numbers above are examples and must be adjusted to the project's real requirements and supported branches. What matters now is understanding that every property solves a different problem, and mixing those meanings usually produces a versioning strategy that is difficult to maintain.

## 3.6 `$plugin->component`

```php
$plugin->component declares the plugin's complete Frankenstyle name and must match exactly the location where the component is installed. In our example, tool_catalogsync must live in the directory Moodle recognizes as an admin tool and inside a directory named catalogsync.
```

Moodle uses this information for validation and diagnosis during installation and upgrade. If you copy `version.php` from another plugin and forget to change the component, you may receive an error before reaching the logic you are trying to test. That is a good thing because it prevents a package from being installed under an identity different from the one assumed by its other files.

Do not generate this value dynamically. The component is a static identity of the code and should be obvious to anyone opening the file. If the name changes, that is not an ordinary configuration change; it is a component migration and needs to be treated as such.

## 3.7 `$plugin->version`

```php
$plugin->version is the technical version used by the upgrade mechanism. The most common convention follows the date-based format YYYYMMDDXX, where the last two digits allow multiple revisions on the same day. Thus 2026092300 could represent the first technical version published on September 23, 2026, and 2026092301 a later revision of that same set of changes.
```

This number is not the same as the product version displayed to users. If you want to call the release `1.4.2`, that belongs in `$plugin->release`; `$plugin->version` must increase monotonically because Moodle compares it with the version stored in the database to decide whether an upgrade needs to run.

A classic mistake occurs when somebody lowers the number after realizing they typed the wrong date. In a clean development environment it may appear to work, but installations that have already recorded a larger number will not run an upgrade to a smaller version. Once a version has been distributed, treat the number as immutable history and move forward from it.

Another mistake is changing `db/upgrade.php`, `db/services.php`, `db/tasks.php`, `db/access.php`, or other declarations that depend on upgrade processing and forgetting to increment `$plugin->version`. The file changed in Git, but Moodle has no reason to reprocess that configuration. When something "does not update" after a structural change, check the version before chasing ghosts in the cache.

## 3.8 `$plugin->requires`

```php
$plugin->requires defines the minimum core version required for the plugin to work. The value uses Moodle's technical version number, not the friendly number such as 5.1. If the plugin uses an API introduced in a particular release, this property is the barrier that prevents installation on an earlier version where the code would inevitably fail.
```

Choosing this value requires honesty. Declaring an older version merely to increase the number of potential installations does not make the plugin compatible. If you use a class, Hook, method, or behavior that only exists in Moodle 5.1, claiming compatibility with 4.5 transfers the problem to the administrator and turns installation into an involuntary integration test.

On the other hand, there is no reason to increase `requires` on every release if the plugin does not need it. If the code genuinely works on older branches that you chose to support, keep the minimum version consistent and confirm that compatibility with tests. Compatibility should be the result of code and CI, not optimism in `version.php`.

## 3.9 `$plugin->supported`

```php
$plugin->supported lets you explicitly declare the range of Moodle branches supported by the plugin. The values represent branches, for example [501, 502] to indicate support from 5.1 through 5.2, inclusive.
```

This property helps turn compatibility policy into data Moodle itself can read. Without it, an administrator may install the plugin on a newer branch and discover incompatibility only when some API has been removed. With it, you document in executable form the range you actually test and maintain.

Do not use `supported` as a substitute for `$plugin->requires`. The first describes supported branches, while the second establishes the minimum core version required. They complement each other. In a project with multiple plugin branches, it is common for each branch to maintain its own supported range and a corresponding `requires` value.

## 3.10 `$plugin->maturity`

```php
$plugin->maturity communicates the stability level of the release and normally uses MATURITY_ALPHA, MATURITY_BETA, MATURITY_RC, or MATURITY_STABLE. It even influences update notifications because administrators can configure which maturity levels they want to consider.
```

Do not treat `MATURITY_STABLE` as mandatory decoration. If the release is still experimental, has migrations that have not been tested, or depends on an API you just integrated, calling it stable does not improve the code; it only removes a useful warning for the person installing it.

Likewise, keeping `MATURITY_BETA` forever to avoid responsibility does not help. Maturity should reflect the real stage of that release and may evolve with the project.

## 3.11 `$plugin->release`

```php
$plugin->release is the human-readable release identifier. Here you can use a convention such as 1.0.0, 2.3.1, or another naming scheme that makes sense for the product. This is the value humans tend to recognize more easily and that may correspond to releases and repository tags.
```

Do not confuse this property with the upgrade trigger. Moodle does not decide to run `db/upgrade.php` by comparing `1.0.0` with `1.0.1`; it looks at `$plugin->version`. You can change only `release` and discover that nothing happens to the database because technically the installation version did not increase.

A healthy strategy is to keep both values with distinct and predictable roles. `$plugin->version` handles technical ordering and upgrades, while `$plugin->release` handles release communication. When we try to make one number serve both purposes, we usually end up with conventions that are difficult to explain.

## 3.12 `$plugin->dependencies`

```php
$plugin->dependencies declares dependencies on other plugins and their minimum versions. This is useful when your component truly requires another component to work and cannot provide acceptable behavior without it.
$plugin->dependencies = [
    'mod_forum' => 2025100600,
    'local_baseinstitution' => 2026090100,
];
```

The declaration prevents incomplete installations and makes the relationship explicit to the Plugin manager. If `tool_catalogsync` calls public classes from `local_baseinstitution`, for example, hiding that dependency behind scattered `class_exists()` checks only makes a failure harder to diagnose.

Do not declare a dependency merely for convenience either. If integration with another component is optional and the plugin works fully without it, it may be better to detect whether that component is present and enable the integration only when available. A mandatory dependency should represent a real architectural need.

## 3.13 Why `version.php` must not execute logic

Current documentation explicitly treats `version.php` as a data file and discourages includes or side effects. This exists for performance and predictability. Core may read version files at times when you did not expect business logic to run, and it may do so for many components.

Imagine putting a query in `version.php` to discover an external resource, a `require_once` to load a library, or a call that depends on a session. The file stops answering only "who is this plugin?" and begins depending on the state of the entire application. Now a simple plugin-check screen can fail because an external API is unavailable. That is not flexibility; it is coupling at the worst possible point.

Use `version.php` only for metadata. If something must execute once during installation, use `db/install.php`; if data must be migrated during upgrade, use `db/upgrade.php`; if behavior must be initialized at runtime, there is probably an appropriate class, callback, Hook, or API. The version file should not become a shortcut for any of those responsibilities.

## 3.14 What is `lib.php`?

`lib.php` is a historical file that acts as a bridge between core and a plugin's global callbacks. Many plugin types still require specific functions in this file because parts of their contracts predate the modern namespace and autoloading system. Activity Modules are a clear example because mandatory callbacks related to creating, updating, and deleting instances still exist.

The problem begins when we treat `lib.php` as the plugin's general-purpose library. Because the filename says "library", many developers put queries, improvised classes, utility functions, formatting, HTTP calls, and any shared code there. You will find plenty of that in old plugins, but using legacy code as an argument to repeat legacy architecture is a very efficient way to produce more legacy code.

The practical rule today is simple. If Moodle requires a global callback, it stays in `lib.php`; the logic needed by that callback should be delegated to autoloaded classes whenever possible. This keeps the file small and moves real behavior into organized, testable code that loads only when needed.

## 3.15 Why `lib.php` is considered legacy

The common-files documentation itself classifies `lib.php` as legacy. This does not mean the file has been removed or that all of its uses are wrong. It means it belongs to an earlier architecture and, for new code, should be used only at points where Moodle's contract still depends on it.

There is a performance reason in addition to organization. Moodle may load `lib.php` from several plugins of a particular type during some operations. If each file contains hundreds of lines and initializes unnecessary structures, you pay that cost even when the plugin's actual functionality will not be used in the request.

Autoloaded classes solve exactly this problem. They remain on disk until needed, and the autoloader knows how to find them without you filling global files with `require_once`. That is why "it works in lib.php" is not a sufficient argument. The correct question is whether the code needs to be a global callback or whether it is only there because that was the easiest place to paste it.

## 3.16 What should still remain in `lib.php`

Callbacks that the plugin type or an API still expects as global functions, and for which no appropriate modern replacement exists, should remain in `lib.php`. In a `mod`, for example, callbacks such as `[modname]_add_instance()`, `[modname]_update_instance()`, and `[modname]_delete_instance()` remain part of the activity contract. Other types have their own integration points and you must consult the type-specific documentation.

Even in those cases the callback can be thin. It receives data, adapts the required format, and invokes a class containing the real rule. If deleting an activity requires removing integrations, updating related records, and generating events, you do not need to place all of that into a hundred-line global function merely because the entry point is global.

There may also be callbacks that have not yet been replaced by Hooks or another modern API. Before moving a function merely because the file is called legacy, find out how core discovers it. Removing a callback that Moodle still invokes does not modernize the plugin; it simply breaks the integration.

## 3.17 What NOT to put in `lib.php`

Do not put general business rules, database access shared by several pages, HTTP wrappers, generic helpers, file manipulation, HTML construction, or functions that exist only because you wanted to reuse twenty lines in two places into `lib.php`. All of that can live in classes with defined responsibilities.

Also avoid code that executes at global scope. A `lib.php` should not run a query merely because it was included, mutate state, or check permissions for a specific page. Remember that core may load the file in contexts different from the one you had in mind when writing the logic.

Another warning sign is a sequence of functions named `tool_catalogsync_get_data()`, `tool_catalogsync_process_data()`, `tool_catalogsync_format_data()`, `tool_catalogsync_send_data()`, and `tool_catalogsync_log_data()`. The prefix makes the functions follow a global naming convention, but it does not create architecture. If they all represent a coherent domain, you probably already have a class trying to be born.

## 3.18 Why creating a new `locallib.php` is wrong

An important qualification is needed here. `locallib.php` did not stop working and still exists in many core components and well-known plugins. Moodle Coding Style itself accepts `require_once(__DIR__ . '/locallib.php')` when that file is already part of the architecture. The point is different: current documentation classifies `locallib.php` as legacy and says that new uses are not recommended, preferring autoloaded classes inside `classes/`.

Historically `locallib.php` served internal functions that did not need to live in `lib.php`. It was better than filling the global file, but it remained a function library and still required manual inclusion. Today we have namespaces, autoloading, and a much clearer class structure, so creating a new `locallib.php` generally means starting a modern project with a solution that was already born as historical compatibility.

There is also a growth problem. At first the file has three functions. Then there are fifteen, each calling the others, some touching the database, some formatting output, and another making HTTP calls. Without an explicit responsibility boundary, `locallib.php` becomes that kitchen drawer where everything fits and nothing can be found quickly. A small class with a specific name forces you to answer a useful question: "what does this code actually do?"

So "wrong" here does not mean Moodle will reject your plugin merely because it finds the file. It means that for new code you are consciously choosing a legacy structure when a better and recommended alternative already exists.

## 3.19 Migrating logic from `lib.php` and `locallib.php` into classes

Migration does not need to be a heroic rewrite. Start by identifying groups of functions that deal with the same domain and turn those groups into small classes. If the plugin synchronizes a catalog, perhaps there is a `sync_manager` class; if it talks to an external API, a `client`; if it normalizes incoming records, a `mapper`; if it persists its own entities, perhaps a specific repository layer or the Persistent API makes sense.

The global callback remains when required but delegates:

```php
function tool_catalogsync_some_legacy_callback($data): void {
    $manager = new \tool_catalogsync\sync_manager();
    $manager->process($data);
}
```

The example is deliberately simple. In a real project you might use dependency injection, factories, or a better-defined component API, subjects we will encounter as the architecture grows. The initial gain is already clear because logic leaves the global scope, becomes autoloaded, and can be tested much more independently.

When migrating, do not create a class called `utils` merely to move the problem somewhere else. A `utils` class with fifty static methods is a `locallib.php` wearing new clothes. The goal is not to satisfy an object-oriented aesthetic; it is to separate responsibilities so names and dependencies explain the system.

## 3.20 `settings.php`

`settings.php` declares the plugin's administrative settings and is normally processed while the administration tree is being built. This is where you add fields such as integration URLs, configurable keys, limits, behavior flags, and other options belonging to the component's global configuration.

A simple example could look like this:

```php
$settings->add(new admin_setting_configtext(
    'tool_catalogsync/endpoint',
    get_string('endpoint', 'tool_catalogsync'),
    get_string('endpoint_help', 'tool_catalogsync'),
    '',
    PARAM_URL,
));
```

The setting has the full name `tool_catalogsync/endpoint`, which lets Moodle store it in the `config_plugins` table associated with the component. At runtime, you can retrieve it using `get_config('tool_catalogsync', 'endpoint')`.

Do not confuse `settings.php` with a generic administration page. It describes settings participating in Moodle's settings infrastructure. If you need a complex dashboard, dynamic table, importer, or operational workflow, you should probably create a dedicated page and use `settings.php` only to register a navigation entry or genuinely configurable options.

## 3.21 `config_plugins`

Component-specific settings are stored in `config_plugins`, while global core settings use the general config structure. You should not write SQL directly to this table to store plugin options. Use `get_config()`, `set_config()`, and `unset_config()` because these functions encapsulate the API and avoid unnecessary dependence on internal structure.

```php
$endpoint = get_config('tool_catalogsync', 'endpoint');
set_config('lastsync', time(), 'tool_catalogsync');
unset_config('legacyoption', 'tool_catalogsync');
```

Notice that an option edited by the administrator is one thing, while a small piece of internal state that the plugin chooses to store as configuration is another. Both may use the Config API, but do not turn `config_plugins` into an improvised database. If you start storing hundreds of numbered records in keys such as `item_1`, `item_2`, and `item_3`, you have passed the point where a proper table would be more appropriate.

Configuration works well for discrete, relatively small values that describe component behavior. Business data, history, queues, and relationships belong in a database model designed for them.

## 3.22 Be careful with queries inside `settings.php`

This is a small detail in code and a large one in production. `settings.php` can be included in situations where the settings screen itself will not even be displayed, so running unconditional queries there adds cost to flows that may never use the result.

Imagine populating a select box by loading ten thousand courses every time the administration tree is built. On a small environment you may not notice; in production the administration menu becomes responsible for an expensive query appearing in apparently unrelated requests. Current documentation calls attention to exactly this problem and recommends lazy-loading mechanisms when a setting genuinely needs database-backed data.

The same idea applies to external calls. Do not query an ERP, payment API, or video service while `settings.php` is being included. If a setting needs validation, perform it when the value is saved or through an explicit action. Administrative configuration should not turn navigation-tree construction into an availability test for external systems.

## 3.23 The `classes/` directory

`classes/` is where most modern PHP code in a plugin lives. Moodle has convention-based autoloading and can load classes from the component namespace without requiring `require_once` calls scattered throughout the project.

If we create `classes/sync_manager.php`, the class may be `\tool_catalogsync\sync_manager`. If we create `classes/local/client.php`, it becomes `\tool_catalogsync\local\client`. Some subdirectories have meanings defined by APIs, including `classes/event/`, `classes/task/`, `classes/external/`, `classes/output/`, and `classes/privacy/`, so do not treat the tree as a completely free taxonomy.

The benefit of autoloading goes beyond removing includes. It makes location predictable. If you see `\tool_catalogsync\external\sync_now`, you already know that class is under `classes/external/`. If you see `\tool_catalogsync\task\sync_catalog`, you know where to look for the task. That predictability is valuable when you enter a plugin you have never seen before.

Avoid using `classes/` as a directory where everything sits directly at the root. Internal namespaces help communicate intent, but do not invent five levels of subdirectories merely to look organized. Good structure reduces navigation effort rather than increasing it.

## 3.24 The `lang/` directory

`lang/` contains the component's translatable strings. Moodle separates interface text from code and uses `get_string()` and equivalent template mechanisms to load the translation appropriate to the user's language.

The conventional structure has one directory per language and a file named after the component. In our example, `lang/en/tool_catalogsync.php` contains English, and a Brazilian Portuguese translation might exist under `lang/pt_br/tool_catalogsync.php` during development or distribution, although official translations for published plugins may also follow Moodle's language-pack workflow.

Do not write interface text directly into PHP merely because the text is short. Today it is "Save"; tomorrow it appears in the mobile app, a message, a test, or another language. When strings are centralized from the beginning, the cost of internationalization becomes almost negligible.

## 3.25 `lang/en/component.php`

Every plugin must provide at least English. The file must use the correct Frankenstyle name and define the strings expected by the plugin type, normally including `pluginname`.

```php
<?php

$string['pluginname'] = 'Catalog synchronisation';
$string['endpoint'] = 'Service endpoint';
$string['endpoint_help'] = 'URL used to synchronise the external catalogue.';
```

If the component is `tool_catalogsync`, the file must be named `tool_catalogsync.php`. An apparently harmless difference such as `catalogsync.php` can have you searching for a cache problem when the actual issue is simply a filename that does not follow the convention.

Strings have their own rules for placeholders, contextual help, and other features that we will study later, but discipline begins here. Text shown to users belongs to the language system, not to concatenations scattered through controllers and templates.

## 3.26 Why English must exist even in a Brazilian plugin

English is the required base language for Moodle plugins. Even if the project is used only in Brazil, `lang/en/` must exist. This does not mean forcing Brazilian users to use English; it means giving Moodle a consistent base that is compatible with the ecosystem.

There is also a practical reason. The plugin may be installed in an environment where `pt_br` is not available, may be published in the Marketplace, may be analyzed by validation tools, and may receive contributions from people outside the original institution. Having English as the base prevents the local language from becoming a technical dependency of the component.

For developers who work in Portuguese, a good practice is to write both versions while the context is still fresh. Leaving translation until the end tends to produce incomplete language files or strings whose meanings have already changed during development.

## 3.27 The `pix/` directory

`pix/` stores images and icons belonging to the plugin and integrated with Moodle's pix mechanism. The best-known file is the component icon, especially in plugin types that appear visually in selectors, lists, or navigation.

Do not use `pix/` as a generic asset directory merely because it contains images. Moodle has its own icon conventions, themes may participate in presentation, and some APIs resolve images by component and icon name. When you use the proper mechanism, the theme and core can take part in resolution rather than forcing you to construct a physical URL manually.

Also avoid depending on paths such as `/local/myplugin/pix/icon.png` hard-coded in HTML. Besides the `public/` restructuring changing the relationship between filesystem and web root in newer versions, Moodle already has APIs for generating resource URLs in a safer and more portable way.

## 3.28 `templates/` overview, covered in depth in Chapter 6

`templates/` contains Mustache templates used by the Output API. The goal is to separate data preparation from HTML markup and avoid pages where PHP, queries, business rules, and HTML tags are mixed in the same file.

A `templates/status.mustache` template in our plugin can be rendered as `tool_catalogsync/status`. The class or page prepares a simple context and the template decides how to present it. Chapter 6 covers `render_from_template()`, escaping, helpers, partials, output classes, and visual components.

For now keep one rule in mind. If you are concatenating dozens of lines of HTML inside PHP, it is probably time to create a template. Mustache does not solve architecture by itself, but it creates a useful boundary between data and presentation.

## 3.29 `amd/src/` overview, covered in depth in Chapter 6

`amd/src/` is the traditional location for source JavaScript modules in Moodle plugins. During the build process, Grunt generates the distributable versions under `amd/build/`, which are the files used in production.

Although the ecosystem is evolving toward JavaScript ESM in modern areas, you will still find AMD throughout core and plugins, especially when you need compatibility across branches. A developer therefore needs to recognize the structure even when choosing a newer approach where supported.

Do not manually edit `amd/build/` as the primary source. The source should remain versioned under `amd/src/` and the build must be reproducible. Generated code that no longer matches its source is an excellent way to fix a bug today and make it reappear after the next `grunt`.

## 3.30 `cli/`

`cli/` is the convention for command-line scripts. They are useful for administrative tasks, imports, diagnostics, reprocessing, or operations that do not need a web interface and may also handle long-running processes more effectively.

One advantage of CLI is avoiding limits and peculiarities of an HTTP request, but that does not turn every heavy process into a manual script. If work must run periodically, a Scheduled Task is better; if it should be queued after a user action, an Adhoc Task is probably better. CLI makes sense when there is a deliberate operation that an administrator or external process will execute as a command.

The directory also makes discovery easier. Instead of hiding executable scripts at the plugin root, system maintainers know they can look under `cli/` for operational tools.

## 3.31 How to create CLI scripts correctly

A CLI script must define `CLI_SCRIPT` before loading `config.php`, because this tells Moodle execution is happening outside the web environment. It should also use functions from `clilib.php` for parameters, help text, exit codes, and consistent interaction.

```php
<?php

define('CLI_SCRIPT', true);

require(__DIR__ . '/../../../../../config.php');
require_once($CFG->libdir . '/clilib.php');

[$options, $unrecognized] = cli_get_params(
    [
        'help' => false,
        'force' => false,
    ],
    [
        'h' => 'help',
        'f' => 'force',
    ]
);
```

The path to `config.php` depends on the plugin type and, starting with Moodle 5.1, also on the new organization under `public/`, so do not blindly copy the number of `../` segments from another component. Coding Style recommends safe paths based on `__DIR__`, and CLI scripts should not depend on the shell's current working directory to locate files.

Security still matters. A CLI script executed by the server user can perform very powerful operations, so validate arguments, confirm important states when appropriate, and produce messages that support auditing. "It only runs in the terminal" does not mean "it does not need validation."

## 3.32 `tests/` overview, covered in depth in Chapters 25 and 26

`tests/` contains the plugin's automated tests. PHPUnit covers units and integrations in Moodle's test environment, while Behat `.feature` files describe UI and acceptance journeys.

At this point you do not need to master the infrastructure, but you should get used to the idea that tests are part of component structure rather than an optional activity that appears at the end when somebody asks about coverage. When an important rule is introduced, creating the test at the same time is much cheaper than trying to reconstruct every scenario months later.

Chapters 25 and 26 cover generators, `advanced_testcase`, database reset, mocks, Gherkin, Selenium, and JavaScript tests. For now it is enough to recognize that a professional plugin usually carries its own suite and that `tests/` should not contain manual scripts disguised as automated tests.

## 3.33 `thirdpartylibs.xml`

`thirdpartylibs.xml` declares third-party libraries distributed inside the plugin. It records their location, name, version, and license and helps Moodle tooling recognize code that should not be analyzed as though it had been written according to core Coding Style.

```xml
<?xml version="1.0"?>
<libraries>
    <library>
        <location>vendor/example/library/</location>
        <name>Example Library</name>
        <version>2.4.0</version>
        <license>MIT</license>
        <licenseversion></licenseversion>
    </library>
</libraries>
```

Putting a `vendor/` directory into the ZIP and moving on is not enough. Third-party code brings responsibilities around licensing, updates, and security. The documentation also recommends a `readme_moodle.txt` containing the origin and update instructions when a library is incorporated into the component.

## 3.34 When to declare third-party libraries

Declare libraries whose code is distributed with the plugin and is not maintained by the Moodle project itself. Before doing that, check whether core already provides the dependency. Bundling a second version of a library Moodle already loads can create conflicts that are difficult to diagnose and increases the maintenance surface.

Check the license. Plugins distributed in the Moodle ecosystem must respect GPLv3 compatibility, and an incompatible library cannot simply be bundled because it technically works. Licensing is part of package engineering.

Also distinguish a development dependency from a library delivered at runtime. Tools used only for build or CI do not necessarily belong among libraries incorporated into the plugin. `thirdpartylibs.xml` describes third-party code present in the distributed component.

## 3.35 Files under `db/`

The `db/` directory brings together declarative files and lifecycle hooks related to schema, permissions, events, tasks, cache, messages, services, and other subsystems. The name is slightly misleading because not everything there is database-related in the sense of SQL tables. It is closer to a directory of declarations that Moodle reads at specific moments.

This leads to an important rule. Files such as `db/access.php`, `db/events.php`, `db/tasks.php`, and similar files must not turn into libraries with includes and arbitrary logic. Core processes them in its own contexts, many of which are sensitive to performance, installation, and upgrade. Think of them as configuration written in PHP, not as general execution points for the plugin.

Another consequence is that several changes under `db/` require incrementing `$plugin->version` and running the upgrade so Moodle reprocesses and persists the new declarations. Saving the file and purging caches is not always enough.

## 3.36 `db/install.xml` overview, covered in depth in Chapter 5

`db/install.xml` describes the schema a fresh installation of the plugin must create. Tables, fields, keys, and indexes are represented in Moodle's XMLDB format, allowing core to generate SQL compatible with supported database engines.

Do not write this file manually as though it were arbitrary XML. Moodle provides the XMLDB Editor precisely to create and modify structures according to portability rules. It can also generate upgrade snippets when you alter the schema.

Chapter 5 covers types, indexes, foreign keys, and schema changes in detail. For now remember one fundamental relationship: `install.xml` must represent the current final state of a clean installation, while `upgrade.php` describes the path required to move older installations to that same state.

## 3.37 `db/install.php`

`db/install.php` contains a hook executed after the plugin's initial installation and after the schema defined in `install.xml` has been created. It exists for actions that must happen once on a fresh installation and are not simply table definitions.

An example might be initializing data that cannot be expressed in XMLDB or performing a preparation step that only makes sense at first installation. Even so, use it sparingly. Default settings can often be declared in other ways, and inserting fixed data without need can complicate upgrades and reinstalls.

The most important point is that `install.php` does not run during upgrades. If you add an action there today and expect sites that installed the plugin six months ago to execute it, they will not. Existing installations must be handled through `db/upgrade.php`.

## 3.38 Difference between `install.xml` and `install.php`

The similar names make beginners confuse their roles. `install.xml` describes database structure that Moodle creates during a fresh installation. `install.php` runs code after that structure has been created. One is declarative schema; the other is an installation hook.

If you need to create a table, field, index, or key, the answer is `install.xml`, not writing `$DB->execute('CREATE TABLE...')` in `install.php`. Manual DDL loses portability and ignores the DDL API and XMLDB, which exist precisely to handle different databases.

If you need to create an initial record that depends on the table already existing, then `install.php` may be appropriate. Even in that case ask whether the data truly needs to exist physically or whether a runtime default would solve the problem better.

## 3.39 `db/upgrade.php` overview, covered in depth in Chapters 5 and 29

`db/upgrade.php` describes incremental steps for installations that already have an earlier version of the plugin. Moodle calls `xmldb_[type]_[name]_upgrade()` and compares the installed version against conditional blocks so it executes only the changes that have not yet been applied.

This is where you add fields, migrate data, remove obsolete settings, and transform existing structures. Each step ends in a savepoint with the corresponding version number, allowing Moodle to record how far the migration progressed.

Do not edit an already distributed upgrade step as though it were an unpublished migration. If a version is in production, that code is part of history. New changes need a new version number and a new block; otherwise sites that ran the upgrade before and after your edit will end up with different behavior.

Chapter 29 discusses branches and compatibility much more carefully, but from this point onward treat `upgrade.php` as migration history rather than as a snapshot of the current schema.

## 3.40 `db/uninstall.php`

`db/uninstall.php` provides a hook executed before final removal of the plugin's data and tables. It can be used to clean external resources, related settings, or elements that Moodle's standard uninstallation mechanism would not remove automatically.

Do not put an attempt to manually drop every table from `install.xml` in this file. Moodle already knows the component's schema and takes care of removing its own structures. Uninstall code should exist only for things outside that standard flow.

Also think carefully about external dependencies. If uninstall calls a remote API and that API is unavailable, do you really want to prevent the administrator from removing the plugin? In many cases it is better to log the failure and allow local cleanup than to make the installation hostage to an external service.

## 3.41 `db/access.php` overview, covered in depth in Chapter 8

`db/access.php` declares the plugin's capabilities. Each capability has a Frankenstyle name, operation type, expected context level, risks, and default archetypes.

```php
$capabilities = [
    'tool/catalogsync:manage' => [
        'riskbitmask' => RISK_CONFIG,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
```

This declaration does not replace authorization checks. It only registers the capability and its defaults. The page or service still needs to call `require_capability()` or `has_capability()` in the correct context.

Because capability changes must be processed by the upgrade system, remember to increment the plugin version when changing `db/access.php` in a meaningful way.

## 3.42 `db/events.php` overview, covered in depth in Chapter 10

`db/events.php` registers observers for events dispatched by Moodle or other components. The file tells Moodle which event should be observed and which callback should be invoked.

```php
$observers = [
    [
        'eventname' => '\\core\\event\\course_created',
        'callback' => '\\tool_catalogsync\\observer::course_created',
    ],
];
```

The callback class should remain autoloaded and contain only what is necessary to react to the event. If processing is heavy, the observer should often only register the work and hand the rest to an Adhoc Task, avoiding turning the user's original action into a long-running process.

Events have the semantics of something that has already happened and differ from Hooks, which can provide extension points for changing behavior. That difference is explained in Chapter 10.

## 3.43 `db/hooks.php` overview, covered in depth in Chapter 10

`db/hooks.php` registers callbacks for the Hooks API, introduced in Moodle 4.3 as a modern replacement for some one-to-many callbacks historically based in `lib.php`. Each entry identifies the Hook class, the callable, and optionally a priority.

```php
$callbacks = [
    [
        'hook' => \core\hook\some_hook::class,
        'callback' => [\tool_catalogsync\hook_callbacks::class, 'handle'],
        'priority' => 500,
    ],
];
```

Hook registrations are cached, so changes normally require an upgrade or cache purge during development. The callback must also consider that some Hooks may occur at sensitive times, including installation and upgrade, when not all services you expect are available.

The dedicated chapter covers stoppable Hooks, data modification, discovery attributes, and migration of older callbacks. Here the important point is not to create a global callback in `lib.php` when the supported Moodle version already provides an official Hook for the extension point.

## 3.44 `db/tasks.php` overview, covered in depth in Chapter 11

`db/tasks.php` declares the plugin's Scheduled Tasks. The file describes the task class, whether it is blocking, and its default frequency, while the actual logic lives in a class under `classes/task/` extending the appropriate base class.

```php
$tasks = [
    [
        'classname' => '\\tool_catalogsync\\task\\sync_catalog',
        'blocking' => 0,
        'minute' => '*/15',
        'hour' => '*',
        'day' => '*',
        'month' => '*',
        'dayofweek' => '*',
    ],
];
```

Administrators can change the frequency through the Scheduled tasks interface, so do not assume in code that it will always run exactly at the default interval you wrote. A good task should be idempotent and tolerate delays, failures, and subsequent runs.

Adhoc Tasks are not declared in `db/tasks.php`; they are queued by code. We will examine both approaches in Chapter 11.

## 3.45 `db/caches.php` overview, covered in depth in Chapter 12

`db/caches.php` declares Moodle Universal Cache definitions. You provide the cache area name and mode and may add requirements and characteristics that allow administrators to map that definition to suitable stores.

```php
$definitions = [
    'catalogmetadata' => [
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

The code then obtains an instance through the Cache API rather than talking directly to Redis, Valkey, or another implementation. That separation is essential because the real backend is an infrastructure decision made by the site.

Do not create a cache before you know what invalidates the data. Cache without an invalidation strategy merely turns wrong information into wrong information faster. Chapter 12 addresses exactly this problem.

## 3.46 `db/messages.php` overview, covered in depth in Chapter 13

`db/messages.php` declares message providers produced by the component. This lets Moodle know which categories of messages the plugin can send and present appropriate preferences to users and administrators.

The declaration does not send a message. Sending happens through the Message API, normally with `\core\message\message` and `message_send()`. The file only registers providers and their associated capabilities when necessary.

If your plugin sends email directly with `mail()` because "it is only a notification", it bypasses preferences, configured outputs, and infrastructure Moodle already has. Chapter 13 shows why the Message API is more than an email wrapper.

## 3.47 `db/services.php` overview, covered in depth in Chapter 14

`db/services.php` declares external functions and, when necessary, services grouping those functions. It is a bridge between External API classes and mechanisms such as REST, AJAX, and the Moodle App.

In modern versions implementation normally lives under `classes/external/`, while `db/services.php` registers the name, class, operation type, AJAX availability, and other metadata.

```php
$functions = [
    'tool_catalogsync_sync_now' => [
        'classname' => '\\tool_catalogsync\\external\\sync_now',
        'description' => 'Synchronise the catalogue now.',
        'type' => 'write',
        'ajax' => true,
    ],
];
```

Declaring a capability in service metadata does not replace `validate_context()` and authorization checks inside the external function. External API security is covered carefully in Chapter 14.

## 3.48 `db/subplugins.json` overview, covered in depth in Chapter 20

`db/subplugins.json` declares subplugin types hosted by a component designed to be extensible. It is not a file every plugin should create. It makes sense only when the parent component genuinely offers an architecture for plugins beneath it.

Since Moodle 5.0 there is a `subplugintypes` key where paths are relative to the plugin root. Components that need compatibility with Moodle 4.5 and earlier may also keep the old `plugintypes` structure to support both generations.

Chapter 20 covers this in detail because creating subplugins involves much more than listing a directory. You need to define a contract, discovery, interfaces, configuration, upgrade behavior, and parent-plugin behavior. `subplugins.json` only tells Moodle where those subtypes live.

## 3.49 `db/mobile.php`

`db/mobile.php` registers plugin extensions for the Moodle App through the Site Plugins mechanism. It describes handlers and delegates that tell the application which areas the component intends to extend and which PHP methods will provide the required content.

Mobile support does not simply mean reusing the web page inside a WebView. The App uses its own components and conventions based on Ionic and Angular, and the plugin can provide templates and JavaScript specific to that experience.

Current documentation places `db/mobile.php` alongside files such as `classes/output/mobile.php`, `templates/mobileapp/`, and `js/mobileapp/`. This is a specialized integration and should exist only when the plugin genuinely offers application behavior.

## 3.50 Why `db/mobile.php` exists even without a dedicated Moodle App chapter

This course is about Moodle plugin development rather than full application development, but ignoring `db/mobile.php` would make the structural map incomplete. You may encounter this file in real plugins and should understand why it exists even if you are not building a mobile extension now.

The editorial decision is simple. We explain the file's role and location, but we do not open the entire Ionic ecosystem, delegates, handlers, offline functions, and App build lifecycle because that would be another course. The same applies to third-party libraries and some specialized APIs. Knowing how to identify a piece is different from exploring every technology that may pass through it.

If a project requires advanced App support, the Moodle App Plugins documentation should be treated as the primary reference and tested against the version of the application actually used by the institution.

## 3.51 `db/renamedclasses.php`

`db/renamedclasses.php` preserves compatibility when a public class is renamed or moved to another namespace. Moodle can map the old name to the new class and prevent dependent components that still use the previous API from breaking immediately.

This only makes sense for classes that genuinely formed part of the component's public API. If an internal class should never have been used externally, preserving an alias forever merely turns a private implementation detail into an accidental contract.

The documentation recommends this especially when a class may be reused by third parties. The file is read by the autoloading mechanism and refreshed when caches are purged, so renaming a public API also involves communicating deprecation and planning future removal, not merely adding an entry to an array.

## 3.52 `db/legacyclasses.php`

`db/legacyclasses.php` solves a different problem. It allows classes with legacy, non-namespaced names to be autoloaded from the `classes/` directory. Since Moodle 4.5 this mechanism has been part of the strategy for modernizing older classes without immediately breaking consumers.

Use it when a class must preserve its legacy name for compatibility or when a public API still depends on that identifier. For new code there is no reason to create global classes and then register them as legacy. The file exists for transition and compatibility, not as an alternative development style.

The distinction between `renamedclasses.php` and `legacyclasses.php` becomes clearer when you consider intent. The first says an old name now points to a different modern name; the second enables autoloading for a class that continues to use a legacy name.

## 3.53 Compatibility when moving or renaming public classes

Moving a class from `\tool_catalogsync\client` to `\tool_catalogsync\local\client` looks like an internal refactor, but it stops being internal the moment another plugin depends on it. If you published the class as part of the API and third parties use it, the change can be breaking even if your own plugin continues to work.

Before moving it, determine whether the class was documented, marked `@api`, used by subplugins, or consumed by known integrations. If there is a public contract, provide a compatibility layer, deprecate the old name, and establish a removal window.

This also shows why the word `local` inside namespaces is useful. Classes under `\component\local\...` communicate that they are internal implementation and should not be used by other components. It is not an absolute technical barrier, but it is an important architectural contract that we will examine further in the Coding Style chapter.

## 3.54 Files that depend on the plugin type

So far we have looked at files that can appear in many plugin types. Now we reach files whose meaning depends directly on the contract chosen in Chapter 2. An Activity Module has `mod_form.php` and normally `view.php`; an enrolment plugin may require a specific class in `lib.php`; a block works with its `block_name` class; an auth plugin implements a completely different base class.

This is another reason not to create plugins by copying entire directories. A file required for `mod` may have no meaning in `tool`, and a callback expected in `enrol` may be irrelevant in `local`. The documentation for the plugin type must be read together with common-file documentation.

The following sections look at some filenames you will encounter often, but only as a map. The specific chapters will cover the correct implementations.

## 3.55 `mod_form.php` for Activity Modules, covered in depth in Chapter 17

`mod_form.php` defines the form used to create and edit an Activity Module instance. The class extends `moodleform_mod` and works with standard course elements, the intro, groups, completion, and other settings shared by activities.

Do not confuse this form with any form used inside the activity. It configures the course instance. A student's response form, for example, may use the Forms API in another class and follow a different lifecycle.

Current documentation also permits, under certain conditions, a modern organization in `classes/mod_form.php`, but the Activity Module contract still requires the class name and integration expected by core. Chapter 17 covers this detail so we do not mix rules specific to `mod` with generic plugin structure.

## 3.56 `view.php` for Activity Modules, covered in depth in Chapter 17

`view.php` is traditionally the main page opened when a user accesses an activity instance through the course. It receives the course-module id, loads the course and instance, validates login, configures `$PAGE`, checks capabilities, and renders the corresponding interface.

The file should not contain the whole application. Think of it as an entry controller. It resolves request context and calls classes that execute rules or prepare output. An eight-hundred-line `view.php` containing SQL, HTML, uploads, and business rules does not become acceptable merely because Moodle expects the filename.

Some modules can also control whether they provide a view link through specific features, so even the practical existence of `view.php` should be understood within the module contract.

## 3.57 `index.php` in plugin types that provide a listing page

`index.php` historically represents a listing or entry page in several plugin types. In Activity Modules, for example, it may list instances of that module in a course; in other components it may serve as the plugin's home page.

There is no universal rule that every plugin needs an `index.php`. Creating an empty file merely to "complete the structure" adds nothing. Its presence depends on navigation flow and the conventions of the type.

When it exists, treat `index.php` like any other Moodle web endpoint. Load `config.php`, validate parameters, login, and capabilities, configure context and URL, and only then produce output. A conventional filename does not reduce security requirements.

## 3.58 `edit.php`

`edit.php` is a conventional name used by many components for editing screens, but it is not a magical file universally recognized by core. Its behavior depends on the plugin implementing it.

That may seem like a minor detail, but it prevents a common misconception. Developers sometimes look at core files and assume that creating an `edit.php` automatically connects their plugin to an API. In most cases you are simply choosing a predictable name for your own endpoint.

The value of the convention is readability. If I see `edit.php`, I expect an editing flow; if I see `manage.php`, I expect management; if I see `view.php`, I expect viewing. Use coherent names, but do not attribute to the filename powers that belong to the code or to the plugin-type contract.

## 3.59 `manage.php`

`manage.php` follows the same principle. It is a common convention for pages that manage lists, operational settings, or plugin entities. It does not replace `settings.php` and does not have a universal contract.

A plugin might have `manage.php` so administrators can manage registered integrations, while `settings.php` contains only global settings such as a timeout and API key. That separation makes the difference between static configuration and operational data clear.

Again, security and the Page API remain mandatory. An administrative-sounding filename does not grant permission automatically. Check context and capability explicitly.

## 3.60 `lib.php` with mandatory callbacks for specific plugin types

Some plugin types still have essential parts of their contracts implemented as functions or methods in `lib.php`. Activity Modules, enrolment plugins, and other historical components provide clear examples. This does not contradict the recommendation to keep `lib.php` small, because the rule is to keep there only the entry point core still looks for.

Before deleting a function because it looks old, consult documentation for the supported branch. Before creating a new function because you found something similar in a plugin from 2014, check whether a Hook or modern API now exists. Modernizing Moodle often means knowing how to coexist with older contracts without expanding them unnecessarily.

When a mandatory callback becomes large, delegate to classes. That lets you respect the external contract without sacrificing internal organization.

## 3.61 `backup/moodle2/` overview, covered in depth in Chapter 24

`backup/moodle2/` contains classes that let a plugin participate in Moodle's backup and restore system. Activity Modules are the best-known example, but the mechanism provides integration points for several plugin types and subplugins.

Backup needs to know which data belong to the component, how those data relate to one another, which IDs must be annotated, which files must be included, and how everything will be reconstructed at the destination. It is not a simple copy of database tables.

Chapter 24 covers `backup_nested_element`, mappings, files, subplugins, and activity duplication. For now remember that any plugin storing transportable content needs to investigate how to participate correctly in this lifecycle rather than assume course backup will magically discover its tables.

## 3.62 `classes/privacy/provider.php`, covered in depth in Chapter 23

`classes/privacy/provider.php` implements the plugin's participation in the Privacy API. Depending on what the component stores, it can declare personal-data metadata, locate contexts related to a user, export information, and delete data according to API contracts.

Plugins that genuinely store no personal data also need to communicate that fact through the appropriate provider rather than simply omit an implementation and leave privacy tooling unable to tell whether the component was forgotten or contains no data.

Chapter 23 distinguishes direct and indirect data, external locations, and deletion strategies. For now it is important to recognize `classes/privacy/provider.php` as part of a mature plugin's structure when applicable.

## 3.63 `classes/event/`, covered in depth in Chapter 10

`classes/event/` contains the plugin's own event classes. They normally extend Moodle's Events infrastructure and describe context, `objectid`, related information, and properties required by logging and observers.

Do not place observers in this directory merely because they react to events. The directory represents events emitted by the component, while observers can live in another appropriate class and are registered through `db/events.php`.

This distinction can look pedantic until a plugin grows. Later, separating "events I emit" from "code that reacts to events" makes navigation much clearer.

## 3.64 `classes/task/`, covered in depth in Chapter 11

`classes/task/` contains Scheduled and Adhoc Task classes. A Scheduled Task declared in `db/tasks.php` points to a class in this namespace, while an Adhoc Task is created and queued by code.

The class should contain processing that can run outside the original request and must assume failures happen. Do not depend on the session of the user who initiated the action, do not store complex objects in custom data without need, and think about idempotency from the beginning.

Chapter 11 covers locks, retries, batching, and concurrency because moving code into a task without considering those details merely transfers the problem from the browser to cron.

## 3.65 `classes/external/`, covered in depth in Chapter 14

`classes/external/` contains modern External API implementations. Each external function describes its input parameters, performs validation, checks context and authorization, and declares its return structure.

The directory does not mean "classes accessible by anyone." External here means a formal API that may be exposed through web services or AJAX according to its declaration. Security still happens inside the function.

This layer should preferably call an internal component API rather than duplicate all business logic. That way the same operation can be used by a web page, task, and external service without three diverging implementations.

## 3.66 `classes/output/`, covered in depth in Chapter 6

`classes/output/` contains classes focused on preparing data for presentation, including renderables, templatable objects, and other structures used by the Output API. It is a good place to transform entities and internal state into a simple context that Mustache can render.

The most valuable rule is to avoid making the template understand the database, capabilities, or domain details. It receives already-prepared data and focuses on presentation. Likewise, an output class should not become a business service merely because it produces the final array.

Chapter 6 examines this boundary with complete examples and also discusses when a custom renderer still makes sense. For now recognize `classes/output/` as part of an architecture where HTML does not need to live inside PHP controllers.

## 3.67 A map of a plugin that grows without becoming a mess

After so many files, it is natural to want a complete tree. The danger is interpreting the tree as a checklist and creating everything at once. Use this example only as a map of possibilities for an admin tool that has grown over time.

```
catalogsync/
|-- amd/
|   `-- src/
|       `-- status.js
|-- backup/
|   `-- moodle2/
|-- classes/
|   |-- external/
|   |   `-- sync_now.php
|   |-- output/
|   |   `-- status.php
|   |-- privacy/
|   |   `-- provider.php
|   |-- task/
|   |   `-- sync_catalog.php
|   |-- client.php
|   `-- sync_manager.php
|-- cli/
|   `-- sync.php
|-- db/
|   |-- access.php
|   |-- caches.php
|   |-- hooks.php
|   |-- services.php
|   |-- tasks.php
|   `-- upgrade.php
|-- lang/
|   `-- en/
|       `-- tool_catalogsync.php
|-- templates/
|   `-- status.mustache
|-- tests/
|-- settings.php
|-- thirdpartylibs.xml
`-- version.php
```

Notice what did not appear. We did not create `locallib.php`, did not invent `helpers.php`, did not add a generic `includes/` directory, and did not create `db/` files the plugin does not use. The structure grew alongside concrete responsibilities.

That is the pattern worth carrying into the following chapters. Whenever a new feature appears, first check whether Moodle already has an API and conventional location for it. If it does, use the convention. If it does not, create an internal class with a clear responsibility. What we should avoid is the architecture where every new feature becomes another function in `lib.php` or another loose file at the root.

## 3.68 Building the first plugin correctly starts before the first screen

It is common to feel that a plugin only really starts once a page appears in the browser. In practice it starts earlier, when the plugin type is chosen, the component receives a stable name, `version.php` declares compatibility honestly, and the structure starts separating the contract with core from internal implementation.

If that foundation is correct, the following chapters fit naturally. Database work goes into `db/install.xml` and `db/upgrade.php`, interfaces use the Output API and templates, the Forms API handles forms, capabilities live in `db/access.php`, Events and Hooks have their registrations, Tasks move work out of the web request, cache stops depending directly on Redis, and external integrations gain an External API when they need to be exposed.

If the foundation is wrong, each of these APIs becomes another exception. The developer starts asking "where do I shove this?" and the answer almost always ends up being `lib.php`, `locallib.php`, or some `functions.php`. Moodle works best when you let the framework itself answer where each responsibility belongs.

In the next chapter we will look at code quality from the beginning, because correct structure without Coding Style, typing, PHPDoc, static analysis, and review can still produce a plugin that is perfectly organized in directories and difficult to maintain internally. The difference is that we now have a foundation on which those rules make sense.

## Technical references consulted

* MOODLE. Common files. Moodle Developer Resources. Available at https://moodledev.io/docs/4.5/apis/commonfiles. Accessed Sep. 23, 2026.
* MOODLE. version.php. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/apis/commonfiles/version.php. Accessed Sep. 23, 2026.
* MOODLE. Activity modules. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/apis/plugintypes/mod. Accessed Sep. 23, 2026.
* MOODLE. Coding style. Moodle Developer Resources. Available at https://moodledev.io/general/development/policies/codingstyle. Accessed Sep. 23, 2026.
* MOODLE. Hooks API. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/apis/core/hooks. Accessed Sep. 23, 2026.
* MOODLE. Cache API. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/apis/subsystems/muc. Accessed Sep. 23, 2026.
* MOODLE. Function Declarations. Moodle Developer Resources. Available at https://moodledev.io/docs/5.2/apis/subsystems/external/description. Accessed Sep. 23, 2026.
* MOODLE. Moodle App Plugins Development Guide. Moodle Developer Resources. Available at https://moodledev.io/general/app/development/plugins-development-guide. Accessed Sep. 23, 2026.
* MOODLE. Moodle 5.0 developer update. Moodle Developer Resources. Available at https://moodledev.io/docs/5.0/devupdate. Accessed Sep. 23, 2026.
* MOODLE. Moodle 5.1 developer update. Moodle Developer Resources. Available at https://moodledev.io/docs/5.1/devupdate. Accessed Sep. 23, 2026.
