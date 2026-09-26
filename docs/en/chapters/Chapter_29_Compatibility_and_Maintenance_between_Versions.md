{% raw %}

# 29 COMPATIBILITY AND MAINTENANCE ACROSS VERSIONS

![Compatibility and Maintenance Across Versions](image/cap29-version-compatibility-maintenance.png)

Creating a plugin that works on one Moodle version is one task. Keeping the same plugin working for years while PHP, databases, JavaScript, APIs, directory structures, and deprecation policies change is something else entirely. The difference becomes clear when the plugin stops being a one-off project and becomes a product. From that point on, you no longer control only the code you wrote, because you need to live with customers on different branches, upgrades happening at different paces, and installations that cannot always upgrade Moodle, PHP, and the database at the same time.

This is where dangerous solutions begin. An `if ($CFG->version >= ...)` appears to fix one incompatibility, then another `if` appears in another file, then a third one checks `class_exists()`, and within a few months nobody knows which combination was actually tested. The plugin remains "compatible" only because no important installation has broken yet.

In this chapter we will treat compatibility as architecture and process, not as patchwork. The goal is to show how to choose a supported range, declare it correctly in `version.php`, separate branch compatibility, recognize deprecated APIs, use feature detection when it is better than version detection, create adapters and shims when necessary, test different combinations in CI, and decide when an old version needs to stop being supported.

This book was built with Moodle 5.0 as its main reference, but a professional plugin rarely exists only on that version. In September 2026, Moodle 4.5 is still the LTS under security support, Moodle 5.1 and 5.2 are still supported lines, and Moodle 5.3 LTS is about to be released. That makes this a particularly useful moment to discuss maintenance because a developer needs to deal simultaneously with a previous LTS, two regular releases, and a new LTS arriving.

## 29.1 Compatibility needs to be an explicit decision

Do not write "compatible with Moodle 4.5 or later" merely because the plugin installed on two machines. Compatibility needs to answer at least four questions.

What is the oldest supported Moodle branch? What is the newest tested branch? Which PHP and database versions are in the matrix? And what policy will be used when core removes an API that is still required on the old branch?

Without those answers, the project is merely waiting for users to find broken combinations.

## 29.2 Supported does not mean only installable

A plugin can install without an error and still be incompatible. The main page may open while backup fails, a task uses a removed method, JavaScript stops working in Boost, Behat breaks on another branch, or a callback has a different signature.

When you declare support, the expectation should include clean installation, upgrade, main workflows, Tasks, backup/restore when applicable, PHPUnit, relevant Behat coverage, and any integration that represents the product.

## 29.3 The real matrix is larger than Moodle versus PHP

In practice, a matrix may involve:

```
Moodle
```

```php
PostgreSQL / MariaDB / MySQL
browser
worker OS
Redis or another cache store
local filesystem or object storage
theme
CLI mode versus web
```

This does not mean testing the complete Cartesian product. It means choosing combinations that represent risk instead of pretending one installation covers everything.

## 29.4 A useful snapshot in September 2026

As a time reference for this chapter, the official Moodle situation is approximately:

```
Moodle 4.5 LTS
    initial release: 7 Oct 2024
    security until:  4 Oct 2027
    minimum PHP:     8.1

Moodle 5.0
    initial release: 14 Apr 2025
    security until:  5 Oct 2026
    minimum PHP:     8.2

Moodle 5.1
    initial release: 6 Oct 2025
    security until:  19 Apr 2027
    minimum PHP:     8.2

Moodle 5.2
    initial release: 20 Apr 2026
    security until:  4 Oct 2027
    minimum PHP:     8.3
```

These dates age, so do not turn the table into an eternal rule. Its value is to show that a plugin's compatibility range also needs to respect Moodle's own support lifecycle.

## 29.5 The next LTS changes the discussion

Moodle 5.3 is expected to be the next LTS. When a new LTS reaches production, many environments jump directly from the previous LTS to it, creating a window in which a plugin needs to support two fairly different lines.

This is exactly when adapters, CI, and a well-designed branch policy repay the investment made earlier.

## 29.6 `version.php` is part of the compatibility policy

`version.php` is not merely a mandatory installer file. It tells Moodle which plugin is installed, which code version is present, and on which branches that package may run.

A simple example:

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '2.4.0';
```

This package declares that it requires at least Moodle 4.5 and that its supported range ends at 5.2.

## 29.7 `$plugin->requires`

`requires` indicates the minimum core version required to install that plugin release.

If the plugin uses an API introduced in Moodle 5.0 and there is no fallback, declaring 4.5 as the requirement just to increase the number of installations is a product mistake. The installer may accept the package, but runtime will fail later.

Prefer blocking early with a clear message to allowing a combination you already know is invalid.

## 29.8 Build number is not branch number

Moodle 4.5.0 has build `2024100700`, while the branch value used in `supported` is `405`. They are different scales.

Do not write:

```php
$plugin->supported = [2024100700, 2026042000];
```

The correct format for the branch range is:

```php
$plugin->supported = [405, 502];
```

## 29.9 `$plugin->supported`

```php
$plugin->supported defines the oldest and newest branches supported by that plugin release.
```

This is different from `requires`. A package may technically install on a later branch, but you may want to declare that the release has not been tested there.

Example:

```php
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
```

The implicit message is that 4.5 through 5.2 are part of the support policy for that package.

## 29.10 `$plugin->incompatible`

`incompatible` is used to declare the first branch from which that plugin release should no longer be used.

It is useful in specific scenarios, but it does not replace an organized release policy. In many projects, `supported` already communicates the expected range more clearly.

Avoid contradictory combinations between `requires`, `supported`, and `incompatible`.

## 29.11 `$plugin->dependencies`

Compatibility is not only about core. If the plugin depends on another component, declare it.

```php
$plugin->dependencies = [
    'local_deliveryhub' => 2026090100,
];
```

Do not test for its presence at runtime and silently continue with half the functionality when the dependency is genuinely mandatory.

## 29.12 An optional dependency is different from a mandatory dependency

If integration with another plugin is optional, do not declare a mandatory dependency merely to discover whether it is installed.

In that case, use discovery and feature detection:

```php
$manager = core_plugin_manager::instance();
$info = $manager->get_plugin_info('local_optionalfeature');

if ($info !== null) {
    // Optional integration available.
}
```

The architecture needs to keep working without that component.

## 29.13 `release` does not control upgrades

```php
$plugin->release = '2.4.0' is a human-readable name. The installer decides upgrades using $plugin->version.
```

You may use Semantic Versioning for the release and a date-based integer for the version:

```php
$plugin->version = 2026092401;
$plugin->release = '2.4.1';
```

Do not try to replace one with the other.

## 29.14 The Git branch is also part of compatibility

When one repository supports several Moodle lines, you need to choose between a single branch with internal compatibility or separate maintenance branches.

Both strategies can work, but they have different costs.

## 29.15 A single branch

A single branch is attractive because it reduces backports. The same patch serves 4.5, 5.0, 5.1, and 5.2.

It works best when the APIs being used are stable and differences between branches can be isolated in a few adapters.

It starts becoming painful when `if version` appears everywhere, classes need incompatible signatures, or the frontend requires different builds.

## 29.16 Branches per line

Another strategy is to maintain branches such as:

```
MOODLE_405_STABLE
MOODLE_500_STABLE
MOODLE_501_STABLE
MOODLE_502_STABLE
main
```

This makes branch-specific code easier, but increases backport cost and the risk that fixes diverge.

For smaller plugins, maintaining one branch per version without a real need can become bureaucracy.

## 29.17 Branch for compatibility, not anxiety

Do not create a branch merely because a new Moodle version was released. First check whether the same codebase remains compatible.

If 5.1 only requires a deployment adjustment and the plugin's PHP still works unchanged, a single branch may still be better. If 5.2 requires PHP 8.3 and you want to start using language features that would break 4.5, then separation may begin to make sense.

## 29.18 PHP is part of the problem

Moodle 4.5 accepts PHP 8.1, while 5.2 requires PHP 8.3. If you promise to support 4.5, you cannot write the entire plugin using syntax exclusive to PHP 8.3 just because your development machine has already been upgraded.

The oldest PHP version in your Moodle support range limits the syntax shared code may use.

## 29.19 Syntax compatibility is different from API compatibility

Code can be syntactically valid on PHP 8.1 and still call a Moodle API that only exists in 5.2.

That is why linting does not prove compatibility with a branch. You need to test the plugin inside every supported Moodle line.

## 29.20 The PHP 8.2 to 8.3 jump in Moodle 5.2

Moodle 5.0 and 5.1 use PHP 8.2 as their minimum, while 5.2 raised the minimum to 8.3.

If the plugin supports 4.5 through 5.2 in one codebase, shared syntax still needs to remain compatible with PHP 8.1, even if the matrix also tests 8.4 on newer branches.

This is one reason not to confuse "my production uses PHP 8.4" with "my plugin may require PHP 8.4."

## 29.21 Databases change too

Moodle 5.0 increased minimum database requirements and removed Oracle Database support. A plugin that promises compatibility needs to respect the database set supported by core for each branch.

Do not write PostgreSQL-specific SQL in a generally distributed plugin merely because your main environment uses PostgreSQL.

## 29.22 DML protects part of portability

Using DML and placeholders reduces dependence on database-specific syntax.

```php
$sql = "SELECT id, userid
          FROM {mod_checkpoint_response}
         WHERE checkpointid = :checkpointid";

$records = $DB->get_records_sql($sql, [
    'checkpointid' => $checkpointid,
]);
```

Even so, specific SQL functions, types, and ordering behavior may vary. Test more than one database when the plugin contains complex queries.

## 29.23 XMLDB is part of compatibility

A schema defined with XMLDB is precisely the mechanism for coherent installation and upgrades across supported databases.

Avoid manual DDL such as:

```php
$DB->execute('ALTER TABLE ...');
```

Use `xmldb_table`, `xmldb_field`, `xmldb_index`, and Database Manager, especially in `upgrade.php`.

## 29.24 Deprecation does not mean immediate removal

Moodle has a formal deprecation policy. A public API normally goes through an initial stage, a final stage, and then removal.

This creates a migration window. The problem comes when a developer ignores `debugging()` for two releases and only discovers the change when the method disappears.

## 29.25 `DEBUG_DEVELOPER` is a compatibility tool

CI and development environments should run with enough debugging to report deprecated calls.

A test that passes while producing ten deprecation messages is not truly healthy. It is warning that the next upgrade will probably break.

## 29.26 Do not silence deprecations

Never "solve" a deprecation with:

```
@deprecated_function();
```

or by globally filtering warnings.

The message exists to give you time to migrate. Silencing it merely transfers the cost to the next upgrade.

## 29.27 Read `UPGRADING.md` and developer updates

Before declaring support for a new branch, read the developer update and the relevant upgrade notes.

Look especially for:

```
deprecated
removed
renamed
signature changed
moved
new mandatory feature
minimum PHP
minimum database
JavaScript
```

```mustache
theme
course format
plugin type
```

This greatly reduces the number of incompatibilities discovered only in production.

## 29.28 Public APIs and internal details

Code that depends on public APIs tends to survive better. Code that calls an internal class, accesses a `protected` method through reflection, relies on a table with no contract, or copies an internal template from another area increases the risk of breakage.

A PHP method being `public` does not automatically make it a Moodle public API. The policy also considers intent and expected use.

## 29.29 The deeper the coupling, the higher the upgrade cost

If your plugin needs to override an internal renderer, copy an entire core template, and call an undocumented method, every Moodle release becomes a migration project.

Sometimes this is unavoidable, especially in themes and course formats, but it needs to be treated as conscious technical debt and covered by specific tests.

## 29.30 Feature detection versus version detection

A bad pattern is spreading checks such as:

```php
if ($CFG->version >= 2025100600) {
    // Moodle 5.1.
}
```

In many cases it is better to ask whether the capability exists:

```
if (class_exists('\core\some\new_api')) {
    // API available.
}
```

Feature detection describes what you actually need.

## 29.31 When version detection is legitimate

Not every difference can be detected with `class_exists()` or `method_exists()`. Sometimes the same class exists, but behavior intentionally changed between branches.

In those cases a version check can be legitimate, provided it is centralized and documented.

The problem is not using `$CFG->version`. The problem is turning the application into a forest of magic numbers.

## 29.32 Centralize version differences

Create a small compatibility layer:

```php
namespace mod_checkpoint\local;

final class compatibility {
    public static function is_moodle_51_or_later(): bool {
        global $CFG;
        return $CFG->version >= 2025100600;
    }
}
```

Better still, when possible, hide the difference inside an adapter that exposes one API to the rest of the plugin.

## 29.33 An adapter is better than scattered `if` statements

Imagine that the way to obtain a certain object changed between branches.

Instead of:

```
if (...) {
    // New version.
} else {
    // Old version.
}
```

in ten files, create:

```php
interface course_bridge {
    public function get_activity_data(int $cmid): array;
}
```

Then choose the implementation once.

## 29.34 Shim

A shim is a small layer that reproduces an interface missing from an old branch or adapts an old interface to the new one.

It is useful when the difference is small and temporary. It becomes a problem when it grows until it copies half of core.

If the shim starts requiring several hundred lines, it may be time to split maintenance branches.

## 29.35 Do not copy entire core classes

Copying a class from Moodle 5.2 into the plugin to "have the new API on 4.5" looks like a quick solution, but you also copy bugs, dependencies, and assumptions from that version.

Implement only the minimum part required, or keep your own implementation clearly isolated.

## 29.36 Compatibility with Hooks

Modern Hooks have been introduced progressively and replace some historical callbacks or extension points.

If the oldest supported branch does not yet have a given Hook, the plugin may keep the legacy callback and register the Hook on newer branches, provided both call the same service class.

Do not duplicate business rules in both paths.

## 29.37 A shared service for callback and Hook

Conceptual example:

```php
final class course_observer_service {
    public static function handle(array $data): void {
        // Single rule.
    }
}
```

The old bridge calls `handle()`. The new subscriber also calls `handle()`.

This keeps compatibility at the edge instead of inside the main rule.

## 29.38 `db/hooks.php` and old branches

Do not assume an old branch understands every metadata file introduced later. Before adding a new file to the same codebase, check how that version's component manager handles it.

In many cases unknown files are simply ignored, but that needs to be confirmed and tested, not assumed.

## 29.39 Subplugins between 4.5 and 5.0

Chapter 20 showed a concrete compatibility change. In Moodle 5.0, subplugin metadata started using `subplugintypes` with a path relative to the parent plugin root.

To support 4.5 and 5.x in the same codebase, declare both formats:

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

This is a classic example of compatibility solved declaratively, without an `if` at runtime.

## 29.40 Activity purpose in 5.1

Since Moodle 5.1, `FEATURE_MOD_PURPOSE` is a mandatory part of the activity's primary classification, and `FEATURE_MOD_OTHERPURPOSE` may be used as a secondary purpose.

If the same module needs to run on a branch where the secondary constant does not exist yet, protect its use:

```php
if (defined('FEATURE_MOD_OTHERPURPOSE') && $feature === FEATURE_MOD_OTHERPURPOSE) {
    return MOD_PURPOSE_COMMUNICATION;
}
```

The primary feature must remain coherent with every supported branch.

## 29.41 New constants need protection

Referencing a nonexistent constant may fail before your condition is evaluated, depending on how the code was written.

Use `defined()` when compatibility genuinely requires working with a constant introduced later.

## 29.42 PHP attributes and old branches

Moodle 4.4 introduced the Deprecation API, also based on the `\core\attribute\deprecated` attribute, while attribute syntax itself requires modern PHP, which is already compatible with those branches.

Even so, do not use an attribute class that does not exist on the oldest supported branch unless you separate the code or guarantee that the file will not be loaded there.

## 29.43 The Deprecation API does not replace PHPDoc

Current documentation reinforces that the `deprecated` attribute does not replace `@deprecated` in PHPDoc. They serve different needs.

If your plugin exposes its own public API used by third parties, apply a coherent deprecation policy to your own code as well.

## 29.44 Deprecating your plugin's API

Do not remove a public method between `2.3.0` and `2.4.0` with no transition if other plugins depend on it.

Do something like:

```php
/**
 * @deprecated since mod_checkpoint 2.4.0.
 * @see new_method()
 */
public function old_method(): void {
    debugging('old_method() is deprecated. Use new_method().', DEBUG_DEVELOPER);
    $this->new_method();
}
```

Then remove it only in a major version or according to the published policy.

## 29.45 Mustache template compatibility

Themes may override templates. If you completely change the structure of a public template between plugin releases, a customer's override may break silently.

Keep names and context data stable when possible, and document incompatible changes.

## 29.46 Context data is also API

If the template receives:

```
[
    'items' => $items,
    'canedit' => $canedit,
]
```

another theme or plugin may depend on that structure. Renaming `canedit` to `editable` may be a breaking change even if PHP keeps working.

## 29.47 JavaScript also has a compatibility contract

AMD modules, ESM, selectors, DOM Events, and templates may change between branches.

Do not treat the frontend as a disposable layer. A plugin can be perfectly compatible in PHP and completely broken in the browser.

## 29.48 JavaScript deprecations in Moodle 5.2

The JavaScript deprecation policy was formalized further in Moodle 5.2, including a dedicated core deprecation utility.

For plugins that expose modules consumed by third parties, adopt the same discipline. Avoid renaming a module or exported function without a transition period.

## 29.49 AMD and modern code

If your support range includes branches where AMD is still the common plugin path, do not migrate the whole frontend to a form that the old branch cannot build or load without a fallback strategy.

Build compatibility also needs to be part of CI.

## 29.50 Bootstrap 4 and Bootstrap 5

Moodle 5.0 brought Bootstrap 5 and a compatibility layer to smooth the transition. That does not mean any old markup will remain safe forever.

Plugins that use Bootstrap classes directly should review utility, component, and behavior changes, especially if they also support 4.5.

## 29.51 Prefer Moodle components to version-specific CSS

The more your UI depends on Bootstrap internal classes, the greater the risk when versions change.

When the Output API, a core template, or a Moodle component exists for the problem, it usually offers a more stable surface.

## 29.52 Moodle 5.1 and the new `public` root

Moodle 5.1 began restructuring the codebase by moving most web-accessible code into a `public` directory.

This is a huge filesystem change, but it was designed to have little impact on plugin code. `$CFG->wwwroot` and `$CFG->dirroot` continue to work according to the documented contract, and a new read-only `$CFG->root` variable points to the installation root.

## 29.53 Do not build paths assuming the old root

Bad code:

```php
$path = dirname(__DIR__, 4) . '/config.php';
```

This depends on the physical position of the directory.

Better code uses Moodle bootstrap and official variables, or APIs that completely avoid the need to resolve paths manually.

## 29.54 `$CFG->dirroot` versus `$CFG->root`

In the new structure, `$CFG->dirroot` represents the public root of the Moodle code, while `$CFG->root` represents the overall installation root.

Your plugin should normally keep using the documented contracts instead of trying to discover paths with `realpath()` and a fixed number of `dirname()` calls.

## 29.55 CLI scripts and directory structure

Custom tools that execute something like:

```
php admin/cli/cron.php
```

may need to be reviewed on 5.1+ installations depending on the working directory and deployment model.

That is why CI scripts and operational documentation are also part of compatibility, not only the plugin's PHP.

## 29.56 The plugin ZIP is still the plugin

The core restructuring does not mean you should include a `public` directory inside your plugin ZIP.

The package still represents the component root, and the installer or deployment process places the plugin at the appropriate location for that installation.

## 29.57 Hardcoded tools are a risk

Old shell scripts, deployment scripts, and Jenkins jobs may assume paths such as:

```
/var/www/moodle/mod/myplugin
```

On 5.1+ structures the physical path may change. Document root variables and make deployment configurable.

## 29.58 Moodle 5.2 and Composer for plugins

Moodle 5.2 introduced native support for distributing and installing plugins through Composer using `moodle/composer-installer`.

This adds another delivery path, but does not eliminate traditional ZIP installation.

If you publish through Composer, continue declaring mandatory Moodle dependencies in `version.php` too, because installations without Composer still need to validate them correctly.

## 29.59 Do not create a Composer-only dependency unless you decide to abandon ZIP

Current documentation recommends caution with runtime dependencies that would exist only when the plugin is installed through Composer.

If your plugin is still distributed as a ZIP, it needs to work in that flow or clearly detect that an external dependency is missing.

## 29.60 `composer.json` does not replace `version.php`

Even in Moodle 5.2, `version.php` remains part of the plugin contract.

Composer describes packages and dependencies in the Composer ecosystem; Moodle still needs its own metadata for installation and upgrades.

## 29.61 PHPUnit also changes by branch

Moodle 5.0 updated core to PHPUnit 11.4, while earlier branches use older versions.

If a single suite needs to run on 4.5 and 5.x, avoid writing tests that depend on a PHPUnit 11-only feature without an adapter or separation.

Chapter 25 showed how modern data providers and attributes need to be handled during this transition.

## 29.62 Behat and tooling also change

The same reasoning applies to Behat. The command, dependencies, and environment are supplied by the branch's core.

Do not pin an arbitrary version of the testing stack in the plugin repository and expect it to represent every Moodle branch.

## 29.63 CI is where the compatibility promise becomes proof

If `version.php` says `[405, 502]`, CI should run at least representative scenarios across that range.

You do not need to test every patch release, but you do need to cover the extremes and relevant changes.

## 29.64 A pragmatic matrix

Conceptual example:

```
strategy:
  matrix:
    include:
      - moodle: MOODLE_405_STABLE
        php: '8.1'
        db: pgsql

      - moodle: MOODLE_405_STABLE
        php: '8.3'
        db: mariadb

      - moodle: MOODLE_501_STABLE
        php: '8.2'
        db: pgsql

      - moodle: MOODLE_502_STABLE
        php: '8.3'
        db: mariadb

      - moodle: MOODLE_502_STABLE
        php: '8.4'
        db: pgsql
```

This tests minimums, maximums, and varied combinations without multiplying everything by everything.

## 29.65 Test the oldest supported PHP

Many projects test only the newest PHP version. That is exactly the opposite of what most effectively reveals syntax incompatibility.

If you declare 4.5 and PHP 8.1, at least one job needs to run on 8.1.

## 29.66 Test the newest supported PHP

The other end matters too. PHP warnings, deprecations, and behavior changes appear first on the newest version.

Ideally, the matrix covers the oldest and newest PHP versions valid for the branch.

## 29.67 Test the oldest Moodle branch

The oldest branch reveals accidental use of new APIs.

If every test runs only on 5.2, you may introduce `FEATURE_MOD_OTHERPURPOSE` or another API and discover the problem only when a 4.5 customer upgrades the plugin.

## 29.68 Test the newest branch

The newest branch reveals deprecations, removals, and visual changes.

This test should run with developer debugging enabled so warnings become work items before they become breakage in the next release.

## 29.69 Testing `main` can be useful

If the plugin is strategic and you want to anticipate future Moodle changes, a non-required job against `main` can warn about breakage before release.

It should not block stable releases if the future branch is still under development, but it serves as radar.

## 29.70 Compatibility CI is not only PHPUnit

Include:

```
moodle-plugin-ci validate
phpcs
phpdoc
php lint
PHPUnit
critical Behat
install test
upgrade test
backup/restore when important
Grunt/ESLint for frontend
```

The exact combination depends on the plugin, but compatibility needs to span the product.

## 29.71 Clean installation test

A new version may work in your development database only because it carries years of accumulated upgrades.

Test a clean installation on every supported line.

This catches `install.xml`, defaults, and metadata issues that `upgrade.php` may have hidden.

## 29.72 Upgrade test

If customers are coming from the previous plugin version, CI needs to validate that path.

A clean installation test does not detect an incorrect savepoint, incomplete migration, or an old column that should have been transformed.

## 29.73 Upgrading Moodle and the plugin at the same time

Real environments frequently upgrade core and plugins in the same maintenance window.

Test at least one scenario in which the database begins on an old combination and then both core and plugin are upgraded together to the new supported combination.

## 29.74 `upgrade.php` should not ask the Moodle version for everything

An upgrade step should represent a plugin version and a data transformation.

If the transformation depends on a core difference, isolate that detail, but do not turn `upgrade.php` into a huge tree of Moodle branches.

## 29.75 Savepoints remain mandatory

Every upgrade step needs to close correctly with the component savepoint.

Compatibility without consistent upgrades is an illusion because users do not reinstall the plugin on every release.

## 29.76 Data compatibility is harder than code compatibility

You can fix a class and publish a new ZIP. Fixing incorrectly migrated data is much harder.

Before changing a JSON format, enum, external identifier, or column semantics, think about how older versions have already persisted those values.

### Real case: structurally correct restore with links still pointing to the source

Data compatibility is not only about columns and formats. Rich content may also carry identifiers and URLs that stop being valid when an activity is duplicated, imported, or restored into another course or another installation.

Consider an activity with fields such as `intro`, solution, support material, or instructions that allows the teacher to insert links to the activity itself. On the source site there may be something like:

```text
https://moodle-a.example/mod/videodiagnostic/view.php?id=123
```

The `123` is the original instance's `course_modules.id`. After backup and restore, the new activity may receive `course_modules.id = 456`. If the plugin transports only the literal text, every record may be restored correctly and the process may finish without an exception, but the HTML still points to `id=123`.

This bug is particularly deceptive because backup appears to work. The activity exists, the data is present, and files may have been restored, yet the content still carries a physical reference to the previous installation. On another domain the problem usually appears as a link back to the old site; on the same domain it can be worse because `id=123` may exist and send the user to a completely different activity.

A clear sign of an incomplete implementation is a backup task containing something equivalent to:

```php
public static function encode_content_links($content) {
    return $content;
}
```

while the restore task keeps:

```php
public static function define_decode_rules() {
    return [];
}

public static function define_decode_contents() {
    return [];
}
```

The backup XML may be perfect while the portability contract is still broken.

Activity modules that store internal URLs in content need to encode those references during backup and decode them during restore. For a URL where `id` represents the course module, the backup task transforms the address into a portable placeholder and the restore task declares a rule based on the `course_module` mapping.

The central point is to understand the meaning of the identifier, not merely recognize the URL. In:

```text
/mod/videodiagnostic/view.php?id=123
```

`id` normally represents the `cmid`, so it needs to follow the `course_module` mapping. If another route uses an ID from the activity's own table or from a child entity, the rule needs to use the corresponding mapping. Copying the old number literally is not compatibility; it is merely hoping the destination database has the same accidental IDs.

It is also not enough to create `define_decode_rules()` and forget `define_decode_contents()`. The restore decoder needs to know which tables and fields should be scanned for placeholders. If links may appear in `intro`, `solution`, and `material`, but only `intro` is included in the decode-content list, the other fields keep URLs from the source.

That is why a backup compatibility test needs to change at least one of the two coordinates the old code may have assumed: the identifier or the domain. A simple scenario is to create the activity on site A with `cmid = 123`, insert a link to itself in the editor, back it up, and restore it on site B where it receives `cmid = 456`. The restored content must point to site B and to `id=456`.

This test finds a class of problem that clean installation, isolated PHPUnit, and even restore into the same course can hide. When a plugin promises that an activity can be duplicated or transported by backup, internal URLs are also part of the data that must remain semantically correct.

## 29.77 Migration should be forward-only

Moodle does not provide automatic downgrade of plugin schema.

After a version increments `$plugin->version` and transforms the database, putting old code back is not a safe rollback.

Document this in release and operational processes.

## 29.78 Feature flags for transition

When a new feature needs to coexist with old behavior for some time, a feature flag can help more than duplicated branches.

Give it a removal deadline. A permanent flag becomes a second architecture nobody tests.

## 29.79 Theme compatibility

UI plugins need to be tested at least with Boost and with the themes actually supported commercially.

Template overrides, CSS classes, and Bootstrap changes may break without any PHP error.

## 29.80 Course formats require special care

Course formats underwent significant changes between 4.x and 5.x, especially in migration away from old libraries and in output architecture.

If your plugin injects controls into a course format, follow official APIs and avoid DOM selectors based on private core markup.

## 29.81 Activity chooser in 5.1

Moodle 5.1 moved activity chooser logic and templates from `core_course` to `core_courseformat`.

Themes and formats that overrode the old templates need to migrate. This is a perfect example of a change an ordinary plugin might not even notice while a specific UI plugin breaks immediately.

## 29.82 Do not treat a template override as an eternal contract

A core template may be an extension API in some contexts, but relevant changes are announced and need to be followed.

When overriding, keep the diff as small as possible and review it on every branch.

## 29.83 Compatibility with legacy callbacks

Some plugin types still have historical callbacks in `lib.php`. When a modern API appears, do not necessarily migrate by deleting the callback if the old branch still depends on it.

Turn the callback into a thin bridge to the new service class.

## 29.84 Avoid duplicated logic in the bridge

Bad:

```
function plugin_old_callback(...) {
    // 80 lines of logic.
}

class new_handler {
    // The same 80 lines adapted.
}
```

Better:

```php
function plugin_old_callback(...) {
    return \plugin\local\service::handle(...);
}
```

The external API changes; the internal rule does not.

## 29.85 External Function compatibility

If external clients consume your Web Services, changing parameters, types, or return values may break applications even when Moodle itself is fine.

Version the contract or preserve compatibility for optional parameters when possible.

Do not confuse a plugin upgrade with permission to break a remote client.

## 29.86 A Web Service really is a public API

Once a mobile app or ERP depends on the function, the contract exists outside the repository.

Incompatible changes need a versioning, deprecation, and documentation strategy.

## 29.87 External database compatibility

ERP integrations face two versions at once: Moodle's version and the external system's version.

Keep integration adapters separate from Moodle business rules so a change in the ERP payload does not force changes throughout the entire plugin.

## 29.88 Compatibility with REST and external APIs

Do not depend on undocumented provider fields. Validate payloads and handle missing optional fields.

If the external API offers versions, deliberately pin the version being used and plan migration before the old endpoint is switched off.

## 29.89 SemVer helps, but does not solve everything

Semantic Versioning is useful for communicating plugin breaking changes, but Moodle uses its own integer for upgrades.

You can combine:

```
release 2.7.3
version 2026092403
```

The policy needs to explain what major, minor, and patch mean to your users.

## 29.90 Major release when removing compatibility

Dropping Moodle 4.5 support may be a breaking change even if no plugin feature changed.

Consider reflecting that in a major release or, at minimum, communicating it clearly in the changelog and metadata.

## 29.91 Do not abandon a branch silently

If the new plugin version starts requiring Moodle 5.2, keep the last release compatible with 4.5 available and document which one it is.

This allows administrators to receive fixes appropriate for the line they still use.

## 29.92 Security fixes on old lines

While a plugin branch remains supported, security flaws may require backports even if new features no longer reach that line.

Define the difference between functional support and security support, especially for institutional customers.

## 29.93 The changelog should report compatibility

A useful changelog does not merely say "v2.4.0 released."

Include something like:

```
Added support for Moodle 5.2.
Dropped support for Moodle 4.4.
Minimum PHP is now 8.1.
Replaced deprecated course renderer API.
Added Composer metadata for Moodle 5.2 installations.
```

This reduces surprises during upgrades.

## 29.94 `README` should not be the only source

Compatibility needs to exist in executable metadata, CI, and release notes. README helps humans but does not prevent an invalid installation.

If the package does not work on a given branch, `version.php` should reflect that.

## 29.95 Support policy

A simple policy might be:

```
We support the current LTS and the two most recent regular releases.
We maintain critical fixes on the previous LTS while it still receives core security support.
New features are added only to lines under general support.
```

The exact rule depends on the product. What matters is that it exists and can actually be followed.

## 29.96 Cost of every supported version

Every added branch increases CI, support, QA, documentation, and backport work.

Supporting ten versions is not automatically better service. Sometimes it means none of them is tested properly.

## 29.97 One codebase or different releases

The practical criterion is how much conditional code exists.

If differences are concentrated in two or three bridges, one codebase works well. If every form, renderer, and task has a fork, line-specific releases begin to become simpler.

## 29.98 How I would organize `mod_checkpoint`

For the plugin built throughout this book, I would keep shared business rules in classes with no version dependency and create an adapters directory only for concrete differences.

```
classes/
    local/
        compatibility/
            bridge.php
            bridge_45.php
            bridge_50.php
            bridge_52.php
        service/
            submission_manager.php
            grading_manager.php
```

The compatibility factory chooses the bridge; the rest of the plugin remains the same.

## 29.99 A compatibility factory

Example:

```php
namespace mod_checkpoint\local\compatibility;

final class factory {
    public static function get(): bridge {
        global $CFG;

        if ($CFG->version >= 2026042000) {
            return new bridge_52();
        }

        if ($CFG->version >= 2025041400) {
            return new bridge_50();
        }

        return new bridge_45();
    }
}
```

The rest of the code asks for `factory::get()` and does not know version numbers.

## 29.100 Do not create a bridge without a need

The directory above is an example of isolation, not a recommendation for every plugin.

If there is no real difference, one implementation is better. Compatibility architecture can also become useless abstraction when created prematurely.

## 29.101 Exercise - cross 4.5, 5.0, 5.1, and 5.2

Take the `mod_checkpoint` from previous chapters and declare support from Moodle 4.5 through 5.2. Build a CI matrix that runs the oldest and newest supported PHP combinations, at least PostgreSQL and MariaDB, PHPUnit, and a critical Behat set.

Then deliberately introduce four incompatibilities. Use a 5.1-only constant without protection, an API deprecated in 5.2, an absolute path that assumes the pre-`public` directory structure, and a test using a PHPUnit 11-only feature. Run the matrix and observe which job finds each problem.

Fix them without spreading `if ($CFG->version ...)` throughout the application. Use feature detection where appropriate, a bridge for the behavioral difference, and declarative metadata for the subplugin case.

Then create two ZIP versions. The first should support 4.5 through 5.1; the second starts requiring 5.0 and supports through 5.2. Confirm that Moodle prevents the second one from being installed on 4.5 before any fatal error occurs.

Finally, write a one-page support policy for the plugin. It needs to define accepted Moodle branches, tested PHP versions, a policy for security fixes, how long an old line keeps receiving fixes, and how the user discovers the last release compatible with their installation.

The exercise is complete only when compatibility stops depending on developer memory and starts existing in `version.php`, CI, branches, changelog, tests, and documentation.

## 29.102 Closing the chapter

Compatibility is not a layer added at the end of a project. It begins when you choose public APIs, separate business rules from integration, avoid physical paths, treat deprecation notices as real work, and keep branch differences at the edges.

The easiest plugin to maintain is not the one with the most version checks; it is the one that needs fewer checks because it was written against stable contracts. When a difference is unavoidable, isolate it. When a branch is no longer viable, end support explicitly. And when you declare that a version is supported, make CI prove it.

This is where maintenance stops being a reaction to each new Moodle release and becomes a planned product characteristic.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Moodle versions and release support. https://moodledev.io/general/releases/
* MOODLE. Moodle Developer Resources. PHP version policy. https://moodledev.io/general/development/policies/php
* MOODLE. Moodle Developer Resources. Deprecation policy. https://moodledev.io/general/development/policies/deprecation
* MOODLE. Moodle Developer Resources. Deprecation API. https://moodledev.io/docs/5.2/apis/core/deprecation
* MOODLE. Moodle Developer Resources. Moodle 4.5 developer update. https://moodledev.io/docs/4.5/devupdate
* MOODLE. Moodle Developer Resources. Moodle 5.0 developer update. https://moodledev.io/docs/5.0/devupdate
* MOODLE. Moodle Developer Resources. Moodle 5.1 developer update. https://moodledev.io/docs/5.1/devupdate
* MOODLE. Moodle Developer Resources. Moodle 5.2 developer update. https://moodledev.io/docs/5.2/devupdate
* MOODLE. Moodle Developer Resources. Code restructure. https://moodledev.io/docs/5.1/guides/restructure
* MOODLE. Moodle Developer Resources. Composer support for plugins. https://moodledev.io/docs/5.2/guides/composer
* MOODLE. Moodle Developer Resources. version.php. https://moodledev.io/docs/4.5/apis/commonfiles/version.php
* MOODLE. Moodle Developer Resources. Backup API. https://moodledev.io/docs/5.2/apis/subsystems/backup

{% endraw %}
