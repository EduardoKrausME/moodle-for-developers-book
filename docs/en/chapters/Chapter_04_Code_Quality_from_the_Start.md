# 4 CODE QUALITY FROM THE START

There is a remarkably efficient way to create technical debt in a Moodle development course: spend twenty chapters teaching that the important thing is making it work, then leave Coding Style, organization, and quality tools until the end. The learner gets used to solving everything with global functions, copies old patterns from core, creates classes that do five things at once and, when the quality chapter finally arrives, has to unlearn half of what they practiced. I prefer to reverse that logic. If you are going to write a plugin today, you should already write it the way you expect to maintain it three years from now.

That does not mean turning every file into a demonstration of perfectionism or spending half an hour debating whether a variable name could be two characters shorter. Code quality is something else. It is being able to open a file without deciphering the author's intent, change a rule without breaking four apparently unrelated parts, replace a deprecated API without hunting through fifty hidden calls, and let automated tools find simple problems before they reach code review. In production, readability is not aesthetics. Readability reduces errors, support time, and maintenance cost.

Moodle helps a great deal because it has strong conventions and tools capable of checking many of them. The problem appears when we treat those rules like a school exam and the goal becomes "make the checker report zero errors." A line can pass PHPCS and still be a terrible architectural decision, while another can produce a warning that deserves to be understood before it is fixed. This chapter deals precisely with that difference, because a good tool does not replace reasoning; it simply keeps reasoning from being wasted on repetitive problems.

## 4.1 Moodle Coding Style

Moodle Coding Style is the set of rules defining how code should be written and organized so it remains consistent with the rest of the ecosystem. Current documentation makes it clear that when Moodle has no specific rule, PSR-12 and then PSR-1 are the references, but that does not mean a Moodle plugin is simply a PSR-12 project. Moodle has its own conventions for class names, variables, namespaces, files, documentation, globals, SQL, and many other details reflecting both the historical and current architecture of the platform.

The practical reason for having a standard is not to make everyone program the same way for the sake of taste. Imagine receiving a thirty-thousand-line plugin written by five people where one uses camelCase, another uses snake_case, one puts two classes in the same file, another invents arbitrary namespace names, and the third solves everything with global functions. The code may execute, but every file demands a small mental context switch before it can be understood. When rules are predictable, you stop spending attention on formatting and start spending it on behavior, which is exactly where code review should focus.

There is another important detail for people who learn by looking at core. Not every piece of code that exists inside Moodle represents the recommended pattern for new code. The project carries more than twenty years of compatibility, historical APIs, and areas that are still being modernized, so copying a construct merely because it appears somewhere in core may mean copying legacy. Before repeating an unfamiliar pattern, check the current documentation and determine whether that code exists because it is still required or simply because it has not yet been refactored.

## 4.2 Structure of a Moodle PHP file

A modern PHP file in a plugin tends to be very predictable. It starts with `<?php`, does not close the PHP tag at the end, includes the license header when applicable, declares a namespace when it contains an autoloaded class, imports required classes, documents the artifact, and contains only that file's responsibility. Scripts that execute directly or files that may cause side effects commonly include the guard `defined('MOODLE_INTERNAL') || die();`, but it should not be copied mechanically into every file without understanding why it exists.

A simple class might look like this:

```php
<?php

// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_catalogsync;

/**
 * Synchronises one catalogue item.
 *
 * @package    local_catalogsync
 * @copyright  2026 Eduardo Kraus
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class item_sync {
    public function execute(int $itemid): void {
        // Synchronisation logic.
    }
}
```

The example is deliberately small. There is no `require_once` to load the class, no closing `?>`, no code executing outside the class, and the filename should follow the autoloading rule, in this case `classes/item_sync.php`. When that structure becomes habit, you can open an unfamiliar plugin and quickly locate what you need because files stop being generic containers and start representing predictable contracts.

Another important distinction is not to confuse a "PHP file" with a "PHP page." An `index.php` accessed through the browser has bootstrap, parameters, context, authorization, `$PAGE` preparation, and output, while a class under `classes/` should not begin doing those things in global scope. If you open a class file and find `require_login()` executing before the class declaration, some responsibility ended up in the wrong place.

## 4.3 GPL header

Plugins distributed for Moodle normally use GNU GPL v3 or later, and project files should carry a license header compatible with that distribution. The header is not a decorative comment we copy because a validator complains. It tells people under which terms the code can be redistributed and modified and makes clear to tools and reviewers which license governs the file.

In everyday work, the most common mistake is not forgetting the license completely but copying an old header containing somebody else's copyright, the wrong year, or a different URL without noticing. This happens often when someone creates a plugin by duplicating an existing directory and starts renaming files. The plugin works, but now dozens of files say they were written by an author who has never seen the project. Tools can identify part of this problem, but human review still needs to verify that the information makes sense.

There is no need to invent a custom version of the text. Use the pattern Moodle itself follows and keep it consistent across files. In files containing only one documented artifact, such as a class, separate file-level documentation may be optional, but `@package`, copyright, and license still need to be represented correctly in the appropriate docblock.

## 4.4 PHPDoc

PHPDoc exists to explain contracts that code alone cannot communicate clearly and to feed IDEs, documentation generators, and analysis tools. The problem is that many people learned PHPDoc as an automatic repetition of the signature, so we encounter comments such as "Gets the name" above a method called `get_name()`, followed by `@return string The name`. That occupies space and adds almost nothing.

A good docblock explains intent, restrictions, data format, relevant side effects, and situations that are not obvious from the types alone. If a method receives a `courseid` and only works for courses visible to the current user, that is an important part of the contract. If it throws an exception when an external integration returns an invalid state, documenting that helps. If the parameter is `int $courseid`, writing only "Course id" in `@param` may be required in a particular documentation context, but it does not replace a genuinely useful description when additional rules exist.

Modern typing reduced the need to use PHPDoc to tell PHP something already expressed by the signature. A method such as `public function load(int $userid): ?profile` does not need `@param int $userid` merely so the IDE can discover that it is an integer, but it may still need documentation explaining which user can be loaded, which permissions are checked, and why `null` may be returned. PHPDoc should complement code rather than narrate it.

## 4.5 `@package`

`@package` identifies the Frankenstyle component the artifact belongs to. In a `local_catalogsync` plugin, the correct value is `local_catalogsync`; in `mod_supervideo`, it would be `mod_supervideo`. It sounds simple, but it is another place where copy and paste easily creates inconsistencies. If you duplicate a class from `local_oldplugin` and forget to change the package, the code may execute normally while documentation and tools begin treating the file as part of the wrong component.

Notice that `@package` is not a product name and not an arbitrary physical path. It represents the same technical identity discussed in earlier chapters, the same identity that appears in `version.php`, namespaces, strings, templates, and several APIs. When these names diverge, it is not merely an aesthetic detail; the component is describing itself differently in different places.

Do not try to use `@subpackage` to invent a second component tree. If you need to organize internal implementation, use namespaces according to Moodle rules. The package remains the main component.

## 4.6 Correct namespaces

Formal namespaces are required for new Moodle classes except at legacy integration points where an API still requires a global class or another historical convention. For a `local_catalogsync` plugin, the base namespace is `local_catalogsync`, and any additional organization must begin from that first level. You do not choose `Eduardo\CatalogSync` because it looks nice, nor `App\Services` because you are used to another framework. In Moodle, the first level is the component identity.

```php
namespace local_catalogsync;

final class synchroniser {
}
```

If a class implements a known API, the second namespace level normally represents that API. Events go under `event`, tasks under `task`, external classes under `external`, output classes under `output`, and so on. For internal classes that do not belong to a standardized Moodle API, Moodle reserves the second level `local`, which we will discuss later.

The namespace must also match the path. `local_catalogsync\local\sync\manager` should live in `classes/local/sync/manager.php`. If you move the class to `classes/service/manager.php` but retain a namespace that no longer corresponds to Moodle's expected rules, the autoloader will not guess your intent. Predictability is exactly why this convention exists.

## 4.7 Autoloading rules

Moodle autoloading removes the need to scatter `require_once` throughout a plugin for modern classes. The system knows the relationship among the component, the `classes/` directory, the namespace, and the class name, so it can load the file when the class is used. For this to work, you must satisfy the contract, not "almost" satisfy it.

Consider this class:

```php
namespace local_catalogsync\local\queue;

final class dispatcher {
}
```

The expected path is `local/catalogsync/classes/local/queue/dispatcher.php` in an installation whose public root still follows that arrangement, or the equivalent under `public/` in newer versions. The file should use the lowercase class filename expected by Moodle conventions. If you call it `Dispatcher.php`, create a `Services` directory, or invent private PSR-4 configuration for that plugin, you have begun fighting an infrastructure that already solved the problem.

Autoloading also changes how you think about dependencies. Instead of opening `lib.php` and including five files to guarantee everything is available, let each class load when it is needed. That reduces bootstrap cost and makes relationships clearer. `require_once` still exists for legacy libraries and old APIs outside the autoloading mechanism, but it should catch your attention when it appears between two modern classes in your own plugin.

## 4.8 Parameter typing

Current Coding Style requires type hints wherever possible in new code, with progressive migration where older APIs still prevent it. This rule improves much more than IDE completion. A typed parameter turns part of the contract into something PHP itself can verify, reduces ambiguity, and makes refactoring safer.

Compare these methods:

```php
public function sync($courseid, $force = false) {
}

public function sync(int $courseid, bool $force = false): void {
}
```

In the first, `courseid` might be a string, array, object, or `null`, and we only discover the expectation by reading implementation, documentation, or waiting for an error. In the second, an important part of intent is already visible in the signature. This does not replace domain validation. An integer does not guarantee the course exists or that the user can access it, but it eliminates an entire category of invalid input before business rules begin.

Do not add types artificially merely to satisfy a tool. If an external API genuinely accepts two formats, model that correctly; if a legacy method you override has a signature that cannot be changed compatibly, respect the API contract and document the limitation. The goal is greater precision without breaking interoperability.

## 4.9 Return typing

Return types are just as important as parameter types because they tell callers what they can expect after execution. New methods should declare return types whenever possible, including `void` when the absence of a return value is part of the contract.

```php
public function find(int $id): ?item {
    // ...
}

public function save(item $item): void {
    // ...
}
```

Without a declared return type, a method may start by returning `stdClass`, later gain a `false` error path, then somebody adds `null`, and before long every caller must handle three possibilities. That is easy to find in legacy code, but there is no reason to reproduce that ambiguity in new classes.

Some older Moodle APIs historically return mixed values, so you will still encounter `mixed`, `false` combined with another type, and methods without modern declarations. Before copying them, determine whether that is a real API requirement or merely an inheritance from a time when PHP had fewer typing features.

## 4.10 Nullable types

A nullable type expresses that `null` is a legitimate part of the contract. `?int` means "integer or null," which is different from leaving a parameter untyped because anything is acceptable. When `null` means absence, unknown, or "use the default," declare that explicitly.

```php
public function get_course(?int $courseid = null): stdClass {
    if ($courseid === null) {
        $courseid = SITEID;
    }

    return get_course($courseid);
}
```

The important point is not to use `null` to hide too many states. If a method returns `null` when the record does not exist, when the user lacks permission, and when an external API fails, the caller has lost information. Nullable works well when absence has clear semantics, not when it becomes the generic answer to every problem.

For optional parameters, Coding Style recommends consistency with nullable syntax when `null` is the default value. That makes the signature honest. Writing `string $value = null` may still work in historical PHP combinations, but `?string $value = null` communicates the intent directly.

## 4.11 Union types when appropriate

Union types let you declare that a value may belong to more than one type, such as `int|string`. The feature is useful when the domain genuinely has more than one valid representation, but it can also hide a badly designed API. If you begin writing `int|string|array|false|null`, you probably have not discovered a powerful PHP feature; you have merely formalized a mess.

Moodle has historical APIs that return something like `record|false`, and in those cases the union represents an existing contract. For new code, ask whether the types represent the same concept. An identifier that may arrive as an integer or numeric string could perhaps be normalized at the boundary and remain an integer internally, while a function that accepts both `stored_file` and a pathname may actually be trying to perform two different operations inside one method.

Compatibility matters too. Union types depend on the PHP version, so a plugin supporting older Moodle branches cannot simply use every syntax feature available on the developer's machine. The practical rule is to choose language features based on the minimum PHP version supported by the oldest Moodle branch you declare compatible, not based on the PHP installed on your laptop.

## 4.12 Visibility

Class methods and properties should declare visibility explicitly. `public`, `protected`, and `private` do more than satisfy the parser or checker; they define the maintenance surface of the class. Anything you make public may eventually be used by another component, a test, an institutional extension, or even your own code that starts depending on a detail that should have remained internal.

Use `public` for the class's contract, `protected` when legitimate subclasses need to participate in implementation, and `private` when the detail belongs only to the class itself. The frequent mistake is making everything `public` "because it is easier." It is easier today and harder tomorrow, because changing a public property may break any caller that decided to access it directly.

Do not create getters and setters automatically either, as though encapsulation meant adding two methods for every property. If an object only needs to carry immutable data, `public readonly` properties may be more appropriate. If a change requires validation, a domain-specific method is better than a generic `set_status()`. Visibility should reflect design rather than ritual.

## 4.13 `final`

`final` communicates that a class or method was not designed for extension. This can be useful for internal services, value objects, handlers, and other classes where inheritance is not part of the contract. By marking a class final, you gain freedom to change internal details without imagining unknown subclasses depending on them.

```php
final class token_generator {
    public function generate(int $userid): string {
        // ...
    }
}
```

Do not mark everything final by ideology. Moodle has APIs based on inheritance, including forms, specialized tasks, and several plugin classes, so preventing extension in a class that exists precisely to be extended is contradictory. Good use of `final` begins with a simple question: "am I offering inheritance as an API?" If the answer is no, final can make that explicit; if it is yes, you need to decide which methods belong to the extension contract.

In large projects, `final` also helps static analysis and readers understand that composition is preferred at that point. The gain is not PHP execution speed; it is reducing the number of possibilities we have to consider when modifying the class.

## 4.14 `readonly`

`readonly` is useful for objects whose state should not change after initialization. In integrations, processed configuration, DTOs, and event objects, that guarantee reduces a particularly unpleasant kind of bug where one layer silently changes a value other parts assumed was stable.

```php
final class sync_request {
    public function __construct(
        public readonly int $courseid,
        public readonly bool $force,
    ) {
    }
}
```

Now anyone receiving `sync_request` knows that `courseid` and `force` will not be replaced after construction. This is stronger than a comment saying "do not change." PHP helps enforce the rule.

But `readonly` also requires compatibility with the PHP version used by the supported Moodle branch, and it does not provide deep immutability for everything a property may reference. If a readonly property contains a mutable object, you cannot replace the reference, but the object itself can still change internally. Use the feature knowing exactly what it guarantees rather than merely because it makes the class look modern.

## 4.15 Constructor property promotion

Constructor property promotion lets you declare properties directly in the constructor signature, reducing the repetitive trio of "declare property, receive parameter, assign parameter." In small objects it can improve readability significantly.

```php
final class report_filter {
    public function __construct(
        private readonly int $courseid,
        private readonly ?int $groupid = null,
    ) {
    }
}
```

Without promotion, the same code would need two property declarations and two assignments without adding meaning. The feature works especially well when combined with typing and `readonly`.

The caution is not to turn the constructor into a wall of fifteen promoted parameters. If a class needs fifteen dependencies or fifteen values in order to exist, the problem is probably larger than syntax. Property promotion reduces repetition but does not fix a class with excessive responsibility. When the constructor starts taking half the screen, inspect the architecture before searching for a more compact way to format it.

## 4.16 `#[\Override]`

When a method overrides a method from a parent class, interface, or trait, current Coding Style strongly recommends the `#[\Override]` attribute. Besides documenting intent, PHP can detect situations where you believe you are overriding something but the parent method was actually renamed, removed, or no longer matches what you expected.

```php
final class import_task extends \core\task\scheduled_task {
    #[\Override]
    public function get_name(): string {
        return get_string('taskimport', 'local_catalogsync');
    }

    #[\Override]
    public function execute(): void {
        // ...
    }
}
```

This kind of protection is excellent during upgrades. Imagine an API changes and your method remains under its old name. Without explicit indication, it may simply become an ordinary method that is never called, and you discover the problem when the feature disappears. With `#[\Override]`, the incompatibility appears early.

In current Moodle standards, the attribute also acts as a signal for PHPCS rules, which know that the method follows an external contract and can adjust some documentation and naming checks accordingly. It is therefore not merely syntax sugar; it participates in the project's validation ecosystem.

## 4.17 Small classes and single responsibility

A "small class" does not mean an arbitrary fifty-line target. A class can have two hundred lines and still have one coherent responsibility, while a thirty-line class can mix authorization, SQL, HTTP, and HTML. A more useful criterion is how many different reasons could cause that class to change.

Imagine `course_sync_manager`. If it loads courses from the database, calls an external API, transforms payloads, saves logs, sends messages, and renders a status table, changes in six unrelated areas may force you to edit the same file. Besides being difficult to test, the class now knows too much. A better decomposition might separate an external gateway, repository, synchronization service, and result object, giving each piece a clearer reason to change.

This does not mean one class per method. Excessive fragmentation also hurts, especially when you need to open ten files to understand a simple operation. The goal is to find boundaries that represent real responsibilities. When a class name starts using "and", when the constructor receives services from very different domains, or when half of its methods use completely different dependencies from the other half, you have strong signs the class is doing too much.

## 4.18 Why not to create giant `utils` classes

Every codebase seems eventually to produce a `utils`, `helper`, `functions`, or `common`. At first it has two harmless methods, then it gains date formatting, user lookup, HTTP calls, file conversion, capability checks, and anything else that did not immediately find a home. A few months later there is a thousand-line class that everybody imports and nobody wants to touch.

The problem with `utils` is not the name itself but the absence of a domain. A class named `course_name_formatter` tells you exactly what it does. `external_catalog_client` defines a boundary. `sync_result` represents a concept. `utils` only says that there is code inside. When anything can go in, nothing has a clear responsibility.

Giant helpers also create cross-cutting coupling. A simple string-formatting method becomes dependent on the same class that knows about `$DB`, cURL, and global settings, making testing and reuse harder. If you are about to add the tenth method unrelated to the previous ones in `utils`, do not ask only where to put the method; ask what concept it represents.

## 4.19 Public API versus internal implementation

Inside a plugin there is code you intend to offer as a stable contract and code that exists only to implement the component itself. Mixing the two categories makes evolution much harder. If another plugin starts depending directly on an internal class and you later refactor it, a change that should have been private becomes a breaking change.

A public API must be deliberate. Name, types, exceptions, side effects, and stability all matter because external callers may depend on them. Internal implementation can change more freely as long as public behavior remains stable. This distinction exists in any well-organized library, but Moodle namespace conventions help signal the intent.

Do not assume that `public` in PHP automatically means "public plugin API." `public` defines language visibility, while API stability is an architectural decision. A class may need a public method to collaborate with another internal class and still not be a supported extension point for third parties. Documentation, namespace, design, and explicit contracts where appropriate help avoid this confusion.

## 4.20 The `local` namespace

There is a naming confusion worth addressing here. The `local` namespace inside a component is not the same thing as a plugin of type `local`. A `mod_supervideo` plugin can perfectly well contain classes under `mod_supervideo\local\...`, and that does not turn the activity into a local plugin.

The second-level `local` namespace is reserved for internal component implementation when you need to organize classes that do not belong to a specific Moodle API. One example could be `local_catalogsync\local\mapping\resolver`. That class lives under `classes/local/mapping/resolver.php` and signals that it belongs to the plugin's internal implementation.

```php
namespace local_catalogsync\local\mapping;

final class resolver {
}
```

This namespace is useful precisely because it separates contract from implementation details. If another plugin starts importing classes from `\local\` as though they were a stable API, question that dependency. Sometimes it is unavoidable in an institutional ecosystem, but then it may be time to define a proper public interface instead of depending on internal details.

## 4.21 Allowed namespace levels

Moodle's rules divide namespaces into levels. The first level is the complete component, such as `local_catalogsync` or `mod_forum`. The second level, when used, should represent a recognized API such as `event`, `task`, `output`, `external`, or `local` for internal organization. From the third level onward there is more freedom to organize the plugin's domain.

This means `local_catalogsync\service` may look natural to someone coming from another framework, but you need to verify whether `service` is an allowed second level under Moodle conventions. In many cases, coherent internal organization would instead be `local_catalogsync\local\service`. On the other hand, `local_catalogsync\task` makes sense because `task` represents a known API and core expects task classes there.

The rule prevents every plugin from inventing a different vocabulary exactly where Moodle uses namespaces to organize APIs. After the third level, you can create something such as `local_catalogsync\local\sync\strategy` without competing with names reserved for core APIs.

## 4.22 Dependency Injection in Moodle

Dependency Injection is often presented as a sophisticated technique, but the problem it solves is very ordinary. A class needs to talk to the database, query an HTTP service, or discover the current time, and if it simply reaches for globals or instantiates concrete dependencies inside its own methods, it ends up deciding both what to do and how to obtain each resource. That increases coupling, hides dependencies, and makes testing unnecessarily difficult.

Since Moodle 4.4 there has been support for a PSR-11-compatible container accessed through `\core\di`. The container can resolve many classes by name and provides core dependencies, but that does not mean every class should call `\core\di::get()` everywhere. Inside service classes, the preferred approach is to make dependencies explicit through the constructor, because the contract then appears in the signature and the object can receive controlled implementations during tests.

## 4.23 Constructor injection in practice

Consider a class that queries a remote catalog and needs to record the time of synchronization. Instead of creating the HTTP client and calling `time()` inside the method, let the dependencies enter through the constructor.

```php
namespace local_catalogsync\local;

final class synchronizer {
    public function __construct(
        private readonly \core\http_client $client,
        private readonly \core\clock $clock,
    ) {
    }

    public function sync(): void {
        $response = $this->client->get('https://api.example.test/catalog');
        $startedat = $this->clock->time();

        // Validate the response and perform the synchronisation.
    }
}
```

The signature now reveals that `synchronizer` depends on HTTP and time. It may look like a small detail, but it changes testability completely. A test can provide a controlled client and predictable clock without using the real network or depending on the second in which the suite happens to run.

## 4.24 When to use `\core\di::get()`

Not every Moodle entry point is automatically created by the container. Legacy callbacks, functions in `lib.php`, some static methods, and integration points with historical APIs may need to obtain a dependency explicitly. At these boundaries, `\core\di::get()` is a legitimate bridge into the world of injectable objects.

```php
$manager = \core\di::get(\core\hook\manager::class);
$manager->dispatch($hook);
```

This is exactly the pattern we will encounter in Chapter 10 when dispatching Hooks. The important point is not to turn the container into a global with a different name. If an entire class calls `\core\di::get()` in ten methods, dependencies remain hidden; it would normally be better to receive them in the constructor and keep container access restricted to the boundary that creates or obtains the object.

## 4.25 Interfaces, dependencies, and test doubles

Dependency Injection does not require creating an interface for every class. An interface is worthwhile when there is a real contract with interchangeable implementations, when core already exposes a standard contract, or when a test needs to replace a dependency with something controlled. Creating `IUserRepository`, `IUserRepositoryFactory`, and `IUserRepositoryProvider` for one simple query does not improve architecture; it merely multiplies names.

The benefit appears when a dependency has external or variable behavior. HTTP, clocks, queues, remote storage, and third-party services are clear examples. If the main rule depends directly on them, testing becomes hostage to the network, time, and environment; if the dependency enters through a contract, the rule can be exercised deterministically.

## 4.26 `\core\clock` instead of `time()`

Time is a dependency and often goes unnoticed because `time()` looks harmless. The problem appears when testing an activity that closes exactly at midnight, a task that must repeat after fifteen minutes, or a token that expires in five seconds. If the class reads the global clock directly, the test has to wait, manipulate data artificially, or live with a race window.

Moodle provides `\core\clock`, compatible with PSR-20, and recommends using it to obtain the current instant in modern code. When the class is created through Dependency Injection, receive the clock in the constructor; in legacy code that does not pass through the container, obtain it at the boundary with `\core\di::get(\core\clock::class)`.

```php
$clock = \core\di::get(\core\clock::class);
$now = $clock->time();
```

There is no benefit in mechanically replacing `time()` in every old file merely to increase the count of modern APIs in the project. The change is most valuable where time participates in business rules or tests, because a controllable clock eliminates an entire class of fragile tests.

## 4.27 Deprecated APIs

A deprecated API is code that still exists for compatibility but already has a replacement or removal path defined. The most dangerous mistake is treating a deprecation warning as "not an error, so I can ignore it." The application may indeed continue working today, but the warning is telling you that the next upgrade may be more expensive if you continue building on that point.

When you encounter a deprecated call, do not blindly replace it with the first suggested name. Read the documentation, the corresponding `upgrade.txt`, and core code when necessary. Sometimes the new API only changes a name, but in other cases it changes the data model, context, return value, or responsibility. Replacing the call without understanding the new semantics may silence the warning and introduce a bug.

There are also cases where a plugin supports more than one Moodle branch. The solution may then require a controlled compatibility layer or separate plugin branches. What works poorly is spreading version checks and `function_exists()` throughout the codebase. Compatibility needs a strategy, not improvisation in every file.

## 4.28 `debugging()`

`debugging()` is Moodle's mechanism for reporting diagnostic messages through the platform's debugging infrastructure. In plugin code it is preferable to `echo`, `var_dump()`, and other improvised output when you need to signal an unexpected condition without necessarily stopping execution.

```php
if ($legacyvalue !== null) {
    debugging(
        'The legacy configuration value is still in use.',
        DEBUG_DEVELOPER,
    );
}
```

The second argument lets you indicate the level at which the message should appear. `DEBUG_DEVELOPER` is especially useful for warnings relevant during development that should not be exposed to end users in production.

Do not turn `debugging()` into application logging, however. A debugging message, audit event, operational log, and integration error are different things. If you need to record every completed synchronization for years, there is probably a more appropriate logging or event strategy. `debugging()` exists to help developers notice conditions that deserve attention during execution and testing.

## 4.29 Developer debugging

Enabling developer-level debugging in a development environment completely changes the experience of writing a plugin. Warnings, notices, deprecation messages, and diagnostics that are hidden in production become visible, which lets you fix problems while they are still cheap.

Developing with debugging disabled is a little like driving after removing the dashboard lights because they are annoying. The system appears calmer, but you have merely stopped seeing signals that already existed. Accessing a nonexistent property, missing a language string, using an incompatible signature, or calling a deprecated API can remain silent until it reaches a scenario that is much harder to reproduce.

Naturally, production must not dump technical details onto the user's screen. Debug levels and display settings need to respect security and operations. The recommendation is to make the development environment genuinely a development environment with `DEBUG_DEVELOPER` enabled, rather than using production as a laboratory because "that is where the real error appears."

## 4.30 Moodle Code Checker

Moodle Code Checker checks compliance with the platform's coding standards. It uses PHP_CodeSniffer and Moodle-specific rules to identify invalid names, formatting, documentation, prohibited patterns, and many other inconsistencies that would be tedious to find manually in every review.

The best use is to run it early and often. If you wait until the end of a five-thousand-line feature, you receive a wall of warnings and start fixing them mechanically. When the checker participates in the daily cycle, each problem appears close to the change that introduced it and the correction is usually obvious.

It is also important to understand that Code Checker verifies what it can formalize. It can tell you that a variable name follows the standard but cannot necessarily tell you that the variable represents the wrong concept. It can happily accept a perfectly formatted thousand-line `utils` class. Architectural quality remains the responsibility of the developer and reviewer.

## 4.31 PHP_CodeSniffer

PHP_CodeSniffer, normally called PHPCS, is the infrastructure that analyzes PHP tokens and applies a collection of sniffs. Moodle maintains its standard and tools on top of this mechanism, so understanding the basics helps considerably when an error message looks obscure.

When you run PHPCS, the message normally reports the file, line, column, rule, and description. Do not read only the description. The sniff name often tells you exactly which policy was violated and lets you search documentation or the rule implementation when necessary. This is particularly useful when a short message does not explain the full rationale.

Some problems can be fixed automatically by PHPCBF, but use it with judgment. Fixing whitespace, indentation, or line breaks is excellent work for automation; restructuring semantics, renaming a public API, or deciding a return type should not be delegated blindly. If the tool offers an autofix, review the diff just as you would review any code change.

## 4.32 Moodle Coding Standard

The Moodle Coding Standard is the PHPCS ruleset that implements much of Coding Style. In a modern environment you can install the standard through Composer and run `phpcs` directly against the plugin, integrating the check into the editor, pre-commit hooks, or CI.

The benefit of using the official standard is eliminating divergent personal configurations. It makes no sense for one developer to format according to a local rule while the pipeline applies another. The same code should be evaluated the same way on a developer's machine and on the integration server.

Control tool versions as well. Updating the standard may introduce new sniffs or make existing rules stricter, so a reproducible pipeline should install known versions, particularly when maintaining multiple Moodle branches. "It passed on my machine" is often less mysterious than it sounds: the two machines simply used different tools.

## 4.33 ESLint

Modern Moodle plugins often contain JavaScript in ESM modules or, in legacy code, AMD. ESLint plays a role for JavaScript similar to PHPCS for PHP, checking syntax, patterns, and style before small problems reach the browser.

This matters because JavaScript has an impressive ability to accept constructs that appear to work until one particular combination of data occurs. Unused variables, undefined references, poorly handled promises, and many style patterns can be detected without opening the page in a browser.

Do not treat JavaScript as a secondary part of the plugin that can follow any standard because "it is only frontend." An ESM error can prevent an entire interface from initializing, break a modal or AJAX calls, or damage accessibility. If PHP undergoes strict validation while JavaScript is shipped without linting, component quality remains unbalanced.

## 4.34 Grunt

Grunt remains part of Moodle's development flow for tasks related to JavaScript, linting, and building certain artifacts. Someone looking only at current Node tooling may find it strange to encounter Grunt in 2026, but in Moodle development the important question is not whether a tool looks new; it is which pipeline core uses on the branch you support.

When changing JavaScript, SCSS, or other resources involved in these tasks, running the appropriate command avoids discovering in CI that a compiled file is stale or lint fails. Moodle Plugin CI can execute the Grunt tasks relevant to a plugin, reducing the difference between local validation and the pipeline.

Do not version generated results without understanding what the branch expects. In some areas Moodle keeps compiled artifacts in the repository; in others the strategy may evolve. The source of truth remains documentation for the relevant version and the pattern practiced by core, not a recipe from a five-year-old blog post.

## 4.35 Mustache lint

Mustache templates look simple because much of them is HTML with placeholders, but they can still accumulate structural problems, inappropriate inline JavaScript, invalid markup, and patterns Moodle tooling can detect. Mustache-specific linting exists precisely for this layer.

If a template fails lint, do not fix it by randomly removing structure or escaping content until the tool stops complaining. Understand whether the problem is invalid HTML, an incorrect attribute, misuse of a helper, or another template contract. Mustache sits on the boundary between data prepared in PHP and presentation, so errors there often signal that a responsibility is crossing that boundary badly.

The Output API chapter examines this separation in depth. For now the rule is simple: a template is production code too and deserves automated validation, especially because HTML and accessibility problems may not show up immediately in a quick manual test.

## 4.36 PHPStan and static analysis when used by the project

PHPStan and similar tools perform deeper static analysis of type flow and calls. They can find situations the parser accepts and Coding Style does not address, such as a method called on a possibly null object, incompatible return values, logically impossible branches, and many contract inconsistencies.

Moodle has historical peculiarities and dynamic APIs that may require configuration or extensions for static analysis to work well, so it makes little sense to impose PHPStan casually and then create hundreds of ignores until the report becomes green. If a project decides to use static analysis, define the level, a baseline where needed, and a strategy for evolution.

The best scenario is not to leave the tool only in CI. Integrate it with the editor or run it locally so errors appear while you still remember what you were implementing. An analysis that takes two seconds before commit costs much less than a broken pipeline twenty minutes later, and far less than an unexpected `null` discovered in production.

## 4.37 Moodle Plugin CI

Moodle Plugin CI brings several checks and tests together into a workflow designed for plugins. Available steps include PHP lint, Code Checker, PHPDoc checker, structural plugin validation, savepoint checks, Mustache, Grunt, PHPUnit, and Behat. A major advantage is the ability to run the same battery against different Moodle branches, PHP versions, and databases when your compatibility strategy requires it.

There is no need to wait until the CI chapter to benefit from the tool. Even locally, it can run plugin validations and reveal problems early. Chapter 27 builds the full pipeline, matrix, and artifacts, but from this point onward the project should be written assuming these checks will exist.

A pipeline does not turn bad code into good code. It prevents a class outside the standard, invalid syntax, or a broken test from moving forward unnoticed. It is a safety net, not an architect. If every check passes but nobody can explain why a single class queries the database, calls HTTP, and generates HTML, CI did its job and code review still has work to do.

## 4.38 Plugin Validate

Plugin validation checks structure and conventions beyond simple PHP formatting. Depending on the tool and flow used, it can detect problems in metadata, required files, versioning, known definitions, and other Moodle-specific aspects.

Moodle Plugin CI has a `validate` step specifically for lightweight validation of plugin structure and code. For developers publishing to the Marketplace or maintaining automated distribution, validating before creating a release avoids discovering problems only during submission or installation in another environment.

Do not confuse Validate with functional testing. A plugin can have all expected files, correct metadata, and zero structural errors while saving the wrong grade, allowing unauthorized access, or losing data during upgrade. Validation answers "does this package respect a set of contracts?" while tests and review must answer "is the behavior correct?"

## 4.39 Code review

Code review should not be one person running PHPCS mentally. If a machine can verify indentation, filenames, and trailing whitespace, let the machine do it. The reviewer should spend time on decisions that depend on context, such as authorization, responsibility boundaries, compatibility, performance, API clarity, error handling, and behavior in edge cases.

A good review begins by understanding the problem the change solves. Without that, it is easy to argue over local details while missing that the whole solution was placed in the wrong plugin type or duplicated an API Moodle already provides. Then inspect data flow. Where do parameters enter, where are they validated, in which context is the capability checked, which tables are read, which side effects occur, and what happens if one step fails?

Also review with the next change in mind, not just the current feature. If tomorrow we need a second external provider, can this class be extended reasonably or is everything hard-coded? If a call becomes slow, can we move it to a task without rewriting half the plugin? If the API changes, is there a clear boundary for adaptation? These are the questions that distinguish architectural review from cosmetic correction.

## 4.40 How to read tool errors instead of merely making them disappear

When a tool reports an error, there are three questions better than "how do I make this go away?" First, which rule was violated? Second, why does that rule exist? Third, does the proposed fix preserve or improve the intent of the code? That sequence avoids the terrible habit of changing things randomly until the pipeline turns green.

Imagine a checker saying that a class name does not follow convention. You could add an ignore, disable the sniff, or rename the class. Before choosing, determine whether the class implements a legacy API that requires that name. If it does, the exception may be legitimate; if not, the name is probably wrong. The error is not merely an order; it is a clue pointing you toward a contract worth investigating.

The same applies to complexity and static analysis. If a tool says a value may be `null`, adding `/** @var object $value */` above the line may silence the analyzer, but it does not make the value non-null at runtime. Sometimes the right fix is to validate and throw an exception, sometimes to accept `null`, sometimes to correct the source. Silencing the diagnosis without addressing the condition merely replaces a visible error with false confidence.

Avoid obsession with zero warnings out of context too. A warning may exist because a legacy API forces a different signature or because a third-party library does not follow Moodle standards. In those cases, suppression should be small, documented, and localized. Disabling a rule for the entire plugin because one legitimate line was inconvenient is using a sledgehammer to adjust a screw.

## 4.41 Exercise - refactor a functional but poorly written plugin

The exercise in this chapter starts from a plugin that works. That matters because refactoring is not fixing a broken system; it is improving structure while preserving behavior. The plugin receives a `courseid`, queries course data, calls an external API, saves the result in its own table, and displays a status page. Everything is concentrated in `lib.php` and `index.php`, with global functions, SQL built by string concatenation, HTML inside PHP, and a `utils` class whose methods perform unrelated tasks.

Before changing anything, run the plugin and record the expected behavior. Then run Code Checker, PHPCS, plugin validation, and, if the project contains JavaScript or Mustache, the corresponding checks. Keep those results. The goal is not to begin by fixing every red line, because you would spend time formatting code that may disappear during refactoring.

First identify responsibilities. Separate access to the external service, persistence, synchronization rules, and output preparation. Move classes under `classes/`, apply correct namespaces and autoloading, type parameters and returns where contracts allow it, use `readonly` only if the minimum supported version permits it, apply `#[\Override]` to methods that truly override contracts, and reduce `lib.php` to callbacks that still need to remain global.

Then run the tools a second time. Now style errors are being applied to the architecture you intend to keep. Fix each group while understanding the rule, run the behavioral tests again, and compare the result with the original version. If an "improvement" changed behavior unnecessarily, the refactoring failed at that point.

Finally, perform code review as though the plugin belonged to somebody else. Look for accidental public API, internal classes outside `local`, hidden dependencies, parameters left untyped without justification, unnecessary public properties, broad suppressions, and comments that explain confusing code instead of simplifying it. The expected result is not merely a report with zero errors but a plugin where the next person can locate each responsibility and change one without needing to understand all the others.

This exercise closes an idea that will follow us through the rest of the book. Quality is not a finishing stage applied after a feature is complete. It starts in the first file because every decision about naming, namespaces, types, dependencies, and responsibility determines how much work we will have when the plugin inevitably needs to change.

## Additional technical references

* Moodle Developer Resources. Dependency Injection, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/di
* Moodle Developer Resources. Clock API, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/clock
