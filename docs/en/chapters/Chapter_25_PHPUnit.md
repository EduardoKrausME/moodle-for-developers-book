{% raw %}

# 25 PHPUNIT

Automated testing in a Moodle plugin should not enter the project only when someone asks for coverage before publishing. It should enter when the first business rule no longer fits comfortably in the head of the person who wrote the code, because that is exactly when discovering regressions by clicking through screens, creating courses, switching roles, running cron, and repeating the same scenario after every change starts becoming expensive.

The problem is that many people learn PHPUnit through the wrong path. First they learn `assertEquals()`, then create a test that calls a trivial method, see a green bar, and conclude that they have a test suite. In Moodle, however, the interesting part starts when the test needs a course, user, context, capability, activity module, file, event, task, Web Service, or database. The platform already provides a huge infrastructure for this and, when we use it correctly, the test stops being a fragile imitation of the real environment and starts executing the rule inside an isolated Moodle instance prepared specifically for testing.

In this chapter we will continue using `mod_checkpoint` as the reference. The activity already has an instance, responses, grades, completion, events, and backup, so it is a good laboratory for showing tests involving DML, capabilities, Events, Hooks, Tasks, External Functions, Privacy, and upgrades. The goal is not to end with one hundred tests because one hundred sounds impressive, but to build a suite that detects important behavioural changes and allows refactoring without turning every change into a trial-and-error session in the browser.

## 25.1 What PHPUnit tests in Moodle

PHPUnit is used to test PHP code behaviour automatically. In Moodle this ranges from pure classes with no platform dependency to integration flows that write to the database, create users, manipulate contexts, trigger events, and work with core APIs.

This means the expression "unit test" is used somewhat broadly in day-to-day Moodle development. A test that creates a course and writes records to the database is not a unit test in the strict academic sense, but it still runs through Moodle's PHPUnit infrastructure and normally belongs to the same suite.

What matters most is understanding the required isolation level for each case and not forcing a browser test when a PHP test solves the problem in milliseconds.

## 25.2 PHPUnit versus Behat

PHPUnit and Behat do not compete with each other. PHPUnit tests code and behaviour at PHP level, while Behat tests journeys through the user interface.

If I want to know whether a completion rule returns `COMPLETION_COMPLETE` when the learner submitted a valid response, PHPUnit is better. If I want to guarantee that the teacher can open the form, enable the option, save it, and then the learner sees the correct state in the interface, Behat is more appropriate.

The mistake is using Behat for every combination of business rules, because tests become much slower, or using PHPUnit to simulate HTML and JavaScript details that belong to the actual interface experience.

## 25.3 The `tests/` structure

Tests live inside the component's `tests/` directory.

```
mod/checkpoint/
    tests/
        generator/
            lib.php
        external/
            submit_response_test.php
        completion_test.php
        event_test.php
        instance_manager_test.php
        privacy_test.php
```

Test files must end in `_test.php`, use lowercase names, and according to current Moodle conventions each file should contain a single test case class whose name matches the file.

## 25.4 Test namespaces

Files inside `tests/` follow the same general namespace rules used under `classes/`. A `mod_checkpoint` test can live in:

```
namespace mod_checkpoint;

final class instance_manager_test extends \advanced_testcase {
}
```

When the test is organised in a subdirectory such as `tests/external/`, the namespace can follow the unit being tested, for example `mod_checkpoint\external`.

Do not create an artificial `mod_checkpoint\tests` namespace merely because the file is under the `tests` directory unless there is a concrete reason to do so.

## 25.5 PHPUnit 11.4 in Moodle 5.0

Moodle 5.0 migrated core to PHPUnit 11.4, while Moodle 4.4 and 4.5 remain on the PHPUnit 9.6 family. This difference matters when the same plugin codebase needs to be tested against both families, because the change is not only the executable version; removed APIs, signatures, and recommended practices changed too.

In PHPUnit 11.4, data providers must be public static and several older APIs no longer exist, while attributes gained importance for test metadata. Do not copy a PHPUnit 9.6 configuration into a Moodle 5.0 branch and try to fix errors one by one before checking the upgrade guide, because part of the difference belongs to core's own testing infrastructure.

If the plugin maintains a single branch for Moodle 4.5 and Moodle 5.x, be conservative with PHPUnit-version-specific features. In many projects, separate branches for major Moodle lines substantially reduce artificial compatibility code inside the tests themselves.

Treat 11.4 as part of the Moodle 5.0 platform, not as a dependency the plugin chooses freely. The branch's `composer.lock` and infrastructure define the compatible set; installing a newer global PHPUnit because "it is better" may produce failures that do not exist in Moodle's real environment.

## 25.6 Installing PHPUnit

PHPUnit is installed as a Moodle development dependency through Composer. In a development installation, the flow normally starts with:

```
composer install
```

After that, the executable is available at `vendor/bin/phpunit`.

Do not install an arbitrary global PHPUnit version and expect it to work with every Moodle branch. The supported version is part of the branch's dependency set.

## 25.7 The test environment is separate

The suite must not run against the real tables of your installation. Moodle requires a separate dataroot and a dedicated prefix for PHPUnit.

In `config.php`:

```php
$CFG->phpunit_prefix = 'phpu_';
$CFG->phpunit_dataroot = '/var/moodledata_phpunit';
```

You can also configure a completely separate database using the `phpunit_db*` options, which I prefer in CI environments and more controlled laboratories.

The idea is simple: tests destroy and recreate state all the time. If that environment points at real data, the problem is no longer testing; it is an incident.

## 25.8 Initialising the environment

After configuration, initialise it:

```
php admin/tool/phpunit/cli/init.php
```

In Moodle 5.1, considering the new public tree, the physical path may appear under `public/admin/...` depending on how the project is organised, but the important point is to execute the utility corresponding to the branch in use.

This process creates the test structures and generates `phpunit.xml` with the suites known to Moodle.

## 25.9 When to run `init.php` again

The test environment needs to follow the installed code. A Moodle version change, plugin installation or removal, and certain schema changes may require reinitialisation.

Do not try to repair a strange suite by deleting random tables. When the environment is out of sync with the code, recreate or update it through the official utility for your branch.

## 25.10 Running all tests

The simplest command is:

```
vendor/bin/phpunit
```

This may take a long time on a full installation. During development, you should normally execute only the component or test case you are working on and leave the larger suite to CI or pre-merge validation.

## 25.11 Running only the plugin

Once component configurations have been generated, you can run PHPUnit using that component's specific `phpunit.xml` or use filters.

A practical example:

```
vendor/bin/phpunit --testsuite mod_checkpoint_testsuite
```

The exact suite name depends on the generated configuration, so inspect the `phpunit.xml` for the branch in use instead of memorising names from examples written for another version.

## 25.12 Running one class or method

During development, filters save a lot of time:

```
vendor/bin/phpunit --filter instance_manager_test
```

Or a specific method:

```
vendor/bin/phpunit --filter test_create_instance
```

If you changed only one calculation rule and still run thousands of tests after every save, you are not gaining quality; you are merely increasing the time between writing code and receiving feedback.

## 25.13 `basic_testcase`

Moodle provides `basic_testcase` for truly simple tests that do not change the database, filesystem, or important globals.

A pure function such as:

```php
final class score_normalizer {
    public static function normalize(float $score): float {
        return max(0, min(100, $score));
    }
}
```

Can be tested without preparing a course, user, or database.

```php
final class score_normalizer_test extends \basic_testcase {
    public function test_limits_score(): void {
        $this->assertSame(100.0, score_normalizer::normalize(120));
        $this->assertSame(0.0, score_normalizer::normalize(-3));
    }
}
```

If you do not need Moodle state, do not use `advanced_testcase` by reflex.

## 25.14 `advanced_testcase`

Most Moodle plugin tests eventually use `advanced_testcase` because it provides helpers for database state, current user, generators, events, messages, hooks, contexts, and environment reset.

```
namespace mod_checkpoint;

final class response_service_test extends \advanced_testcase {
    public function test_submit_response(): void {
        // Test using Moodle data.
    }
}
```

The class is core's integration with PHPUnit, not merely an alias for `PHPUnit\Framework\TestCase`.

## 25.15 Isolation between tests

A test must not depend on what another test left in the database. Moodle's infrastructure restores state between tests and monitors changes to the database, filesystem, and globals.

That means the method below must work on its own, even if executed before every other test:

```php
public function test_submit_response(): void {
    $course = $this->getDataGenerator()->create_course();
    // ...
}
```

If you need `test_create()` to run before `test_update()`, you are probably testing a shared sequence instead of two independent scenarios.

## 25.16 `resetAfterTest()`

When a test changes persistent state or globals, `resetAfterTest()` tells the infrastructure that those changes are expected and that the environment must return to its original state.

```php
public function test_create_response(): void {
    $this->resetAfterTest();

    $course = $this->getDataGenerator()->create_course();
    // ...
}
```

Modern documentation also recommends not turning `resetAfterTest()` into an automatic ritual in every `setUp()`, because unnecessary resets cost memory and time. Use it in tests that genuinely modify state and avoid preparing an entire database for cases that could be pure.

## 25.17 Do not use `resetAfterTest(false)` to speed up the suite

It is technically possible to ask Moodle to keep data between tests, but that destroys isolation and usually creates a suite that depends on execution order.

The few seconds saved disappear as soon as one test passes alone but fails in the suite because another left behind different configuration.

Test performance should be improved by reducing unnecessary setup, using generators intelligently, and separating pure tests from integration tests, not by sharing dirty state across cases.

## 25.18 `setUp()`

`setUp()` is useful when several tests genuinely need the same preparation, but use it sparingly.

```php
protected function setUp(): void {
    parent::setUp();

    $this->service = new response_service();
}
```

Avoid creating a course, ten users, and three activities in `setUp()` if half the tests do not use them. That pattern makes every case slower and hides the actual scenario of each test.

## 25.19 `setUpBeforeClass()`

`setUpBeforeClass()` is for static test-case preparation, not for creating Moodle data that needs per-test reset.

Use it for required includes in non-autoloadable code or preparation that does not alter the database or application state.

If you create records in `setUpBeforeClass()` expecting them to exist for every test, you are fighting the suite's isolation mechanism.

## 25.20 The test database

Inside `advanced_testcase`, `$DB` is still Moodle's normal DML API, but it points to the PHPUnit environment.

That is excellent because you test the same code that runs in production without inventing a fake database that behaves differently from PostgreSQL, MariaDB, or another supported driver.

```php
global $DB;

$this->assertTrue($DB->record_exists('checkpoint_response', [
    'checkpointid' => $checkpoint->id,
    'userid' => $student->id,
]));
```

The test verifies the actual effect of the API on persistence.

## 25.21 Do not test Moodle DML

If your service calls `$DB->insert_record()`, there is no value in testing whether `insert_record()` can insert a row. That is core's responsibility.

Test your component's rule. Was the correct user stored? Does the record belong to the correct instance? Does a second response update or duplicate? Is the correct exception raised when the activity is closed?

Test plugin behaviour, not whether Moodle knows how to execute SQL.

## 25.22 Fixtures

A fixture is data prepared for a test scenario. It can be created with a generator, dataset, simple objects, or specific files.

I prefer generators for Moodle entities and small builders/helpers for plugin data. XML and CSV files make sense when the volume or structure would become unreadable in PHP.

The mistake is keeping a huge database dump as a fixture and forcing the entire suite to depend on magic IDs nobody understands anymore.

## 25.23 Data generators

The main entry point is:

```php
$generator = $this->getDataGenerator();
```

It knows how to create many core entities and can also load plugin-specific generators.

Instead of manually constructing course, context, and category records, you create a valid entity through the testing infrastructure.

## 25.24 Creating a user

```php
$user = $this->getDataGenerator()->create_user([
    'username' => 'student1',
    'email' => 'student1@example.com',
]);
```

Do not depend on fixed IDs. Keep the returned object and use `$user->id`.

The test environment starts with structural accounts such as admin and guest, but your test should not assume an ID sequence beyond contracts explicitly provided by the API.

## 25.25 Creating a course

```php
$course = $this->getDataGenerator()->create_course([
    'fullname' => 'Course for checkpoint test',
    'shortname' => 'CHKTEST',
]);
```

The generator creates a valid course structure, with category and other dependencies handled by Moodle.

## 25.26 Creating a category

```php
$category = $this->getDataGenerator()->create_category([
    'name' => 'Testing category',
]);
```

The course can then use `$category->id`. This makes the relationship that actually matters for the scenario explicit.

## 25.27 Enrolling users

The generator provides a simplified enrolment helper:

```php
$this->getDataGenerator()->enrol_user(
    $student->id,
    $course->id,
    $studentroleid,
    'manual'
);
```

When you are specifically testing an enrolment plugin, use that plugin's own API instead of the helper because the enrolment method's behaviour is exactly the unit under test.

## 25.28 Creating activity modules

For modules, the short form is:

```php
$checkpoint = $this->getDataGenerator()->create_module('checkpoint', [
    'course' => $course->id,
    'name' => 'Checkpoint 1',
]);
```

This requires `mod_checkpoint` to provide a compatible generator or for the generic generator to be able to work with the module's `mod_form` and callbacks.

## 25.29 The plugin's own generator

A module used in many tests should provide `tests/generator/lib.php`.

```php
class mod_checkpoint_generator extends testing_module_generator {
    public function create_instance($record = null, array $options = null) {
        $record = (object)($record ?? []);

        if (!isset($record->name)) {
            $record->name = 'Checkpoint ' . $this->instancecount;
        }

        if (!isset($record->grade)) {
            $record->grade = 100;
        }

        return parent::create_instance($record, $options);
    }
}
```

The goal is not to hide all configuration, but to provide valid defaults so each test specifies only what matters to its scenario.

## 25.30 A generator should not create an entire scenario by default

If `create_instance()` automatically creates five users, groups, and responses, every test begins with state it may not need.

The entity generator should create the entity. Larger scenarios can use dedicated helpers inside the test case or additional methods such as `create_response()`.

This separation avoids magical fixtures that are difficult to understand.

## 25.31 A `create_response()` helper

In the plugin generator:

```php
public function create_response(array $data): stdClass {
    global $DB;

    $record = (object)[
        'checkpointid' => $data['checkpointid'],
        'userid' => $data['userid'],
        'answertext' => $data['answertext'] ?? 'Test answer',
        'timemodified' => time(),
    ];

    $record->id = $DB->insert_record('checkpoint_response', $record);
    return $record;
}
```

This helper is excellent for preparing known state when creating the response is not what the test is trying to validate.

When response creation itself is the behaviour under test, use the real service, not the generator, because otherwise you skip exactly the code you wanted to verify.

## 25.32 `setUser()`

To simulate the current user:

```php
$this->setUser($student);
```

This updates the session and relevant access caches for the test execution.

Do not simply do:

```php
$USER = $student;
```

Changing the global manually does not reproduce correctly what core's helper prepares.

## 25.33 `setAdminUser()` and `setGuestUser()`

There are useful shortcuts:

```php
$this->setAdminUser();
$this->setGuestUser();
```

And to return to a logged-out state:

```php
$this->setUser(null);
```

This makes it straightforward to test the same service from three different authorisation perspectives.

## 25.34 Assertions

Use standard PHPUnit assertions when they describe the behaviour well.

```php
$this->assertSame($student->id, $response->userid);
$this->assertTrue($service->can_submit($student->id));
$this->assertCount(2, $responses);
$this->assertNull($result);
```

Do not choose `assertEquals()` for everything. `assertSame()` detects type differences and often represents PHP contracts better.

## 25.35 `assertEquals()` versus `assertSame()`

`assertEquals()` compares values with more flexible semantics, while `assertSame()` requires both value and type to match.

If your API promises an `int`, this is stronger:

```php
$this->assertSame(42, $result);
```

Than:

```php
$this->assertEquals(42, $result);
```

A return value of `'42'` could hide an inconsistency that later appears in JSON, a type hint, or a strict comparison.

## 25.36 Testing exceptions

When an error is part of the contract, test the exception.

```php
$this->expectException(\required_capability_exception::class);

$service->delete_response($responseid);
```

When a message or errorcode is relevant, validate the stable value, but avoid coupling the test to translatable human text that can change without changing behaviour.

## 25.37 Do not use `try/catch` just to assert an exception

This pattern is unnecessary:

```php
try {
    $service->execute();
    $this->fail('Exception expected');
} catch (moodle_exception $e) {
    $this->assertSame('invalidstate', $e->errorcode);
}
```

There are cases where you need to inspect the exception, but when checking the type is enough, use `expectException()` and let PHPUnit control the flow.

## 25.38 Data providers

A data provider lets the same test run with different inputs.

```php
#[\PHPUnit\Framework\Attributes\DataProvider('score_provider')]
public function test_normalize(float $input, float $expected): void {
    $this->assertSame($expected, score_normalizer::normalize($input));
}

public static function score_provider(): array {
    return [
        'normal' => [50.0, 50.0],
        'below zero' => [-1.0, 0.0],
        'above max' => [130.0, 100.0],
    ];
}
```

In PHPUnit 11 the provider must be public and static.

## 25.39 Data-provider compatibility with Moodle 4.5

If the plugin also runs on Moodle 4.5, attributes may complicate compatibility. The annotation format remains an option for branches that need to span PHPUnit 9.6 and 11.

```php
/**
 * @dataProvider score_provider
 */
public function test_normalize(float $input, float $expected): void {
}
```

That is why the plugin's branch strategy also affects how tests are written.

## 25.40 Do not create Moodle data in the data provider

```php
The provider should supply values, not run $this->getDataGenerator() or write to the database.
```

Providers are evaluated outside the same test reset cycle, and in modern PHPUnit they must also be static.

Pass a scenario description and create the entities inside the test method itself.

## 25.41 Mocks

Mocks are useful when the unit depends on a collaborator you genuinely want to replace.

Imagine a service that depends on an external client:

```php
$client = $this->createMock(external_client::class);
$client->expects($this->once())
    ->method('send')
    ->willReturn(new send_result(true));
```

This lets you test your rule without accessing the network.

## 25.42 Do not mock all of Moodle

If a test needs `$DB`, context, course, and capability, it is normally better to use Moodle's real test environment than to build ten mocks of internal objects.

Too many mocks turn the test into a validation of what you imagined Moodle does, not what Moodle actually does.

Use the real infrastructure for core APIs and mocks mainly at boundaries controlled by your own design, such as HTTP clients and internal gateways.

## 25.43 Test doubles

A mock is only one type of test double. You can also use fakes, stubs, and spies.

A fake external API can implement the same interface and store calls in memory, making the test more readable than a mock configured with twenty expectations.

The choice depends on what you want to prove. If you need to assert that `send()` was called exactly once, a mock or spy works. If you only need a predictable implementation, a fake is usually simpler.

## 25.44 Dependency injection improves tests

Code like this is difficult to replace:

```php
$client = new erp_client();
$client->send($data);
```

Code like this is easier to test:

```php
public function __construct(private erp_client_interface $client) {
}
```

Now the test can supply a controlled implementation.

This does not mean turning every plugin into a dependency-injection framework, but important external dependencies should be replaceable without hacks.

## 25.45 Testing DML

Suppose the service guarantees one response per learner and activity.

The test should exercise the public API:

```php
$first = $service->submit($checkpoint->id, $student->id, 'A');
$second = $service->submit($checkpoint->id, $student->id, 'B');

$this->assertSame($first->id, $second->id);
$this->assertSame('B', $second->answertext);
```

Then a database query can confirm that only one row exists.

## 25.46 Test database constraints when they matter

If your rule requires uniqueness and the schema has a unique index, also test the consequence when relevant, especially in paths exposed to concurrency.

Do not replace the business rule with an index test, but make sure the schema protects a critical invariant that code alone cannot guarantee across two simultaneous requests.

## 25.47 Testing capabilities

Capabilities deserve tests because it is very easy to check the correct permission in the wrong context.

A basic scenario creates a course, activity, user, and role, then executes the operation with module context.

```php
$this->setUser($student);

$this->expectException(\required_capability_exception::class);
$service->grade_response($responseid, 80);
```

Then repeat with a user who has the capability and confirm success.

## 25.48 Do not use admin in every test

Admin bypasses or has practically every capability, so a test that runs only as admin can hide exactly the authorisation bug it should detect.

Use admin for setup when necessary, but validate the final action with the real role that will perform it in production.

## 25.49 Creating a test role

You can use generators for role creation and assignment or reuse existing archetypes depending on the scenario.

When the rule depends on one specific capability, creating a minimal role makes the test more precise than using editingteacher and inheriting dozens of unrelated permissions.

## 25.50 Correct context

Explicitly test the case where the same capability exists at course level but not in the activity if that distinction is part of the plugin's security.

This may sound excessive until a regression appears where someone changes:

```php
context_module::instance($cmid)
```

To:

```php
context_course::instance($courseid)
```

And the test prevents the failure from reaching production.

## 25.51 Testing Events

`advanced_testcase` can redirect Events to a sink.

```php
$sink = $this->redirectEvents();

$service->submit($checkpoint->id, $student->id, 'Answer');

$events = $sink->get_events();
$sink->close();

$this->assertCount(1, $events);
$this->assertInstanceOf(
    \mod_checkpoint\event\response_submitted::class,
    $events[0],
);
```

This avoids depending on a logstore to know whether the event was triggered.

## 25.52 Verify important event data

Do not stop at `assertInstanceOf()`. When the contract matters, validate context, objectid, relateduserid, and `other`.

```php
$event = reset($events);

$this->assertSame($response->id, $event->objectid);
$this->assertSame($student->id, $event->relateduserid);
$this->assertSame($cm->id, $event->contextinstanceid);
```

An event with the right class and wrong IDs is still the wrong event.

## 25.53 Testing Hooks

The current infrastructure allows Hook callbacks to be redirected during tests.

```php
$called = false;

$this->redirectHook(
    \mod_checkpoint\hook\before_submit::class,
    function($hook) use (&$called): void {
        $called = true;
    }
);

$service->submit(...);
$this->assertTrue($called);
```

The infrastructure cleans redirects during teardown, but avoid creating test dependencies around manually registered callbacks.

## 25.54 A Hook that changes data

If a Hook allows mutation, test the result of that mutation, not merely that the callback ran.

For example, a Hook that adjusts an attempt limit should result in the final value used by the service.

That protects the useful Hook contract and lets internal dispatcher details change without breaking the test.

## 25.55 Testing Tasks

For a task, you normally do not need to wait for a real cron run. Instantiate the task, configure custom data where necessary, and call `execute()`.

```php
$task = new \mod_checkpoint\task\recalculate_scores();
$task->set_custom_data([
    'checkpointid' => $checkpoint->id,
]);

$task->execute();
```

Then verify the final state in the database or in the fake external service.

## 25.56 Scheduled Task versus Adhoc Task in tests

A Scheduled Task tends to be tested as one execution unit, while an Adhoc Task also needs correct custom data.

If the code under test is the observer that queues the task, test queueing in the observer and test task logic separately. Do not turn a simple test into a complete cron run merely to prove two different things at once.

## 25.57 Task idempotency

An integration task should be tested twice against the same state.

```php
$task->execute();
$task->execute();

$this->assertSame(1, $DB->count_records('checkpoint_sync', [
    'checkpointid' => $checkpoint->id,
]));
```

This test catches duplicates that almost never appear on the first happy path.

## 25.58 Testing messages

You can redirect messages to a sink.

```php
$sink = $this->redirectMessages();

$service->notify_teacher($checkpoint->id);

$messages = $sink->get_messages();
$sink->close();

$this->assertCount(1, $messages);
```

This is much better than querying a real email account or external message inbox.

## 25.59 Testing email

For code that really sends email, the test environment also offers email redirection.

The same rule applies: capture, execute, and validate relevant fields without sending anything to an external SMTP server during PHPUnit.

Automated tests should not surprise someone with fifty emails because infrastructure isolation was forgotten.

## 25.60 Testing External Functions

External Functions need tests for parameters, context, capabilities, and return values.

A useful test does not merely call `execute()` as admin. It verifies at least one allowed case, one denied case, and invalid input.

Current documentation provides specific helpers for Web Services, but the central logic remains the same: prepare data, establish the user, call the function, and validate the returned contract.

## 25.61 Validating an External Function return value

Besides testing the resulting array, validate the external structure when that makes sense because Moodle also validates the return according to `execute_returns()`.

An apparently harmless change from `int` to string or a missing field can break a client even if the PHP method still works.

The test should protect the public contract, not only the implementation.

## 25.62 Testing the Privacy API

A privacy provider is an excellent PHPUnit candidate because export and delete have many cases that would be tedious to verify manually.

Create a user, context, and personal data, call `get_contexts_for_userid()`, export the data, verify the content, and then execute deletion.

At the end, confirm that the correct records disappeared and that another user's data remained.

## 25.63 Privacy in bulk

If the provider implements `delete_data_for_users()`, test two or more users inside the same context and a third one outside the approved list.

This catches bugs involving `get_in_or_equal()` and overly broad deletes that a single-user test would not reveal.

Privacy cannot be tested with `assertTrue(true)` merely to satisfy a checklist.

## 25.64 Testing the File API

When a rule uses files, create files in the test storage through `get_file_storage()` and then inspect the filearea.

Do not write files manually into `$CFG->dataroot`. The goal is to test the plugin through the same File API it will use in production.

If deleting an entity should clean up files, assert that explicitly.

## 25.65 Testing the Gradebook

For activity modules, execute the callback or service that updates grades and then inspect the Gradebook through the appropriate API or records.

The interesting test is whether grade, maximum, scale, and feedback arrive correctly, and what happens when grading is disabled or changed.

Do not test by writing directly to `grade_grades`, because that bypasses exactly the API the plugin should use.

## 25.66 Testing Completion

Custom completion should be exercised across different states.

For `mod_checkpoint`, create scenarios with no response, with a response, with a grade below the minimum, and with a sufficient grade according to the implemented rules.

The `custom_completion` class should return exactly the expected state for each combination without depending on browser interaction.

## 25.67 Testing groups

If the rule changes under `SEPARATEGROUPS`, create two groups and different users. Test a teacher with `accessallgroups`, a learner in group A, and an attempt to access data from group B.

A test with only one group does not prove that isolation works.

## 25.68 Testing cache

Cache deserves a test when it is part of observable behaviour, especially invalidation.

A good scenario is to populate the cache, alter the real source through the public API, and confirm that the next read returns the new value.

Do not test internal details such as an exact cache-key name unless that is part of the contract, because this kind of test prevents refactoring without protecting useful behaviour.

## 25.69 Testing upgrade

Upgrade is one of the most important tests for a distributed plugin and one of the most commonly forgotten. The difficulty is that it requires simulating an old state and running only the relevant upgrade step.

When a migration transforms data, prepare records in the old format, execute the corresponding upgrade function, and validate the resulting schema and content.

These tests require care because the PHPUnit environment already represents the current schema, so preparation often requires temporary DDL or helpers specific to the project's test strategy.

## 25.70 Not every upgrade needs an automated test

Adding a simple column with a predictable default may be sufficiently protected by installation tests and CI depending on project risk.

A migration that converts thousands of records, changes semantics, or rebuilds relationships deserves a dedicated test.

Test where a regression would be expensive, not where it merely increases the coverage counter.

## 25.71 Testing backup and restore

Backup/restore can be exercised through subsystem helpers and controllers, but these tests tend to be heavier. For a module with complex data, it is worth having at least one test that creates a complete instance, runs backup and restore, and compares functional state.

The goal is not to compare IDs because they change. Compare data, files, mappings, and relationships that should survive.

Chapter 24 showed the flow; here the new part is automating the guarantee.

## 25.72 Code coverage

Coverage helps identify untested areas, but 100% is not synonymous with a good suite.

You can execute every line without making a meaningful assertion, or test trivial getters while leaving a critical rule without an error case.

Use coverage as a map, not as an isolated target.

## 25.73 `coverage.php`

Since Moodle 4.0 there is standard plugin coverage configuration including `classes`, `tests/generator`, `lib.php`, and other conventional files. A `coverage.php` is only necessary when you want to adjust that set.

Do not create the file merely because an old tutorial said every plugin needed one.

## 25.74 `#[CoversClass]`

In Moodle 5.x with modern PHPUnit, attributes can declare the covered class:

```php
#[\PHPUnit\Framework\Attributes\CoversClass(response_service::class)]
final class response_service_test extends \advanced_testcase {
}
```

For plugins that also need to run on PHPUnit 9.6, annotations may be the compatible choice.

## 25.75 Coverage should follow the unit under test

Prefer declaring coverage for the class as a whole instead of marking dozens of methods individually.

This also forces a healthy question: which class does this file actually test? If the answer is "about twenty classes because I built the entire system", perhaps the test case is too large or the code is too coupled.

## 25.76 What is not worth testing

Do not test getters with no logic, constants, native PHP, Moodle's basic DML, whether `get_string()` works, or whether `moodle_url` concatenates parameters correctly.

Test your decision about those resources. Does the plugin choose the correct URL? Is the right string used in the error state? Is the correct record loaded?

If the test could belong in core and does not mention any rule from your component, you may be testing the wrong layer.

## 25.77 Fragile tests

A fragile test breaks when the implementation changes even though behaviour does not.

A classic example is asserting the exact order of five internal calls when the public contract promises only a result. A legitimate refactor changes the order and fifty tests turn red even though nothing was broken for the user.

Test results, effects, and important contracts, not unnecessary internal choreography.

## 25.78 Do not use Reflection as the first option

If the only way to test an important rule is to access a private method with Reflection, perhaps that rule deserves its own class with a well-defined internal public API.

Reflection can be a last resort in legacy code, but it should not drive new design.

Encapsulation also matters during testing.

## 25.79 Time and tests

Code based on `time()` can produce intermittent tests. When core or your architecture allows it, use clock abstractions or compare within a window using appropriate helpers.

`advanced_testcase` provides helpers such as `assertTimeCurrent()`, useful when you only need to guarantee that a timestamp was created now.

Do not write `sleep(2)` merely to make timestamps different. Besides being slow, it can still be unstable in CI.

## 25.80 Randomness and tests

Randomisation is excellent in production and bad for reproducibility when it is uncontrolled.

If an algorithm draws a question, inject a seed, choose a deterministic source, or test invariants independent of the exact choice.

A test that fails once every twenty runs is worse than a test that always fails because it steals confidence from the entire suite.

## 25.81 External calls

Standard unit tests should not depend on the internet. Mock or fake the external client and test your local rule separately.

If there is a need for a real integration test with an external service, mark it as a long test or place it in a dedicated suite with explicit configuration.

Never make the default suite depend on the client's ERP being online at three in the morning.

## 25.82 Long tests

Moodle supports long tests. Tests that take more than roughly ten seconds or access expensive resources should stay outside the default run.

A fast suite is run frequently. A suite that takes forty minutes after every change eventually gets ignored, and ignored tests protect nothing.

## 25.83 Suite performance

A lot of slowness comes from unnecessary setup. Creating a course and user in one hundred tests when half could use `basic_testcase` costs more than it seems.

Also avoid a heavy reset in `setUp()` for every case. Put data near the test that actually needs it.

The same performance discipline applied in production also applies to development infrastructure.

## 25.84 Test names

The test name should explain behaviour.

Prefer:

```
public function test_student_cannot_grade_response(): void
```

Instead of:

```
public function test_case_03(): void
```

When the test fails in CI, the name should help explain what broke without forcing you to open the file immediately.

## 25.85 One behaviour per test

This does not mean a single assertion. One behaviour may require several related assertions.

The problem is placing creation, editing, deletion, backup, and privacy in one method and then receiving "1 test failed" without knowing which contract was actually violated.

Split by intent, not by an arbitrary number of assertions.

## 25.86 Comments in tests

A well-written test should tell its story through its name, setup, and assertions. Use comments to explain non-obvious decisions, not to narrate every line.

This is noise:

```php
// Create user.
$user = $this->getDataGenerator()->create_user();
```

This may be useful:

```
// The user has the capability at course level, but not in this module context.
```

The second comment explains why the scenario exists.

## 25.87 AAA without turning it into a religion

Arrange, Act, Assert helps keep tests readable.

```php
// Arrange.
$checkpoint = ...;
$student = ...;

// Act.
$response = $service->submit(...);

// Assert.
$this->assertSame(...);
```

But there is no need to add three comments to every method if the division is already obvious. The structure serves readability, not a rigid template.

## 25.88 Testing `debugging()`

If expected behaviour calls `debugging()`, `advanced_testcase` provides dedicated assertions.

```php
$this->assertDebuggingCalled('Deprecated option used');
```

There is also `assertDebuggingNotCalled()`.

This is better than capturing output or changing `error_reporting()` manually.

## 25.89 `expectOutputRegex()`

Some legacy callbacks still write directly to output. PHPUnit can validate that output when it is genuinely part of the contract.

```php
$this->expectOutputRegex('/submitted/');
```

For new code, however, prefer the Output API and testable data classes because comparing complete HTML tends to create fragile tests.

## 25.90 Testing `templatable` classes

An output class can be tested by calling `export_for_template()` and validating the resulting array.

This is more stable than rendering Mustache and comparing an entire HTML string.

If the class promises `hasresponses`, `items`, and `canedit`, test those values. The template can be exercised by Behat or frontend tests where necessary.

## 25.91 Testing legacy `lib.php` code

Global callbacks can be called directly, but if the whole rule lives in `lib.php`, the test becomes harder to organise.

A good refactor keeps the callback small and tests the class to which it delegates. Then a small callback test confirms that parameters arrive correctly when that contract deserves protection.

This design reduces the cost of testing legacy code without turning PHPUnit into a reason to preserve old architecture.

## 25.92 Testing upgrades between plugin versions

When the plugin has older branches, it is worth keeping fixtures that represent data produced by the previous version and running migration to the new one without depending on a real production export.

This is especially valuable for schema changes that convert JSON, split tables, or change external identifiers.

An upgrade that passes on a clean installation does not prove that an existing customer's upgrade works.

## 25.93 Tests and multiple databases

A suite that runs only on MariaDB can hide SQL that is incompatible with PostgreSQL. Well-written DML reduces that risk, but CI with more than one database increases confidence.

You do not need to run every combination locally on every commit. That is exactly where the CI matrix discussed in Chapter 27 becomes worth the cost.

## 25.94 Tests and Moodle versions

A function may work in 5.2 and not even exist in 4.5. If the plugin promises both, the suite needs to run on both or you are testing only half of the promise.

Avoid `if (version_compare(...))` in dozens of tests. When differences become substantial, separate branches make both code and tests clearer.

## 25.95 The `mod_checkpoint` suite

After the previous chapters, a reasonable suite for `mod_checkpoint` could include:

```
tests/
    generator/
        lib.php
    external/
        submit_response_test.php
    completion_test.php
    event_test.php
    grade_test.php
    instance_manager_test.php
    privacy_test.php
    response_service_test.php
    task_test.php
```

There is no obligation to have one file for each class. The structure should reflect understandable units of behaviour.

## 25.96 Complete `response_service_test` example

```php
namespace mod_checkpoint;

final class response_service_test extends \advanced_testcase {
    public function test_submit_creates_single_response(): void {
        global $DB;

        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $checkpoint = $this->getDataGenerator()->create_module('checkpoint', [
            'course' => $course->id,
        ]);

        $this->setUser($student);

        $service = new \mod_checkpoint\local\response_service();
        $first = $service->submit($checkpoint->id, 'First');
        $second = $service->submit($checkpoint->id, 'Second');

        $this->assertSame($first->id, $second->id);
        $this->assertSame('Second', $second->answertext);
        $this->assertSame(1, $DB->count_records('checkpoint_response', [
            'checkpointid' => $checkpoint->id,
            'userid' => $student->id,
        ]));
    }
}
```

The test does not check how the service implements the update; it only guarantees the visible contract: one response and updated content.

## 25.97 Testing the negative rule

After the happy path, test what must not happen.

```php
public function test_user_cannot_submit_to_other_checkpoint_context(): void {
    $this->resetAfterTest();

    // Creates two courses, two instances, and a learner with access only to the first.
    // Attempts to submit to the second and expects an authorisation exception.
}
```

These negative tests often find more vulnerabilities than increasing happy-path coverage from 80% to 95%.

## 25.98 Exercise - complete plugin suite

Take the `mod_checkpoint` built throughout the book and create a suite that tests instance creation, editing, and deletion, learner response, grade, completion, capabilities, events, task, External Function, Privacy API, and at least one meaningful data migration.

Create `tests/generator/lib.php` with an activity generator and response helper. Do not use fixed IDs, do not depend on test order, and do not create data in the data provider. For each authorisation rule, include at least one allowed and one denied case.

Implement one task-idempotency test, one Event test using a sink, one Privacy test proving that deleting learner A does not delete learner B's data, and one External Function test validating context and capability.

Then run the suite against at least two Moodle versions supported by the plugin and, where possible, two different databases. Generate coverage and use the report to identify one important untested rule, not to chase an artificial 100%.

Finally, deliberately remove a `require_capability()` call, replace a `context_module` with `context_course`, remove a cache invalidation, and make the task insert a duplicate. The suite should fail in every case. If it stays green, it is executing code but not protecting the behaviour that really matters.

## 25.99 What you should take away from this chapter

PHPUnit in Moodle is not there to prove that a function ran without error; it turns important plugin decisions into executable contracts. `advanced_testcase`, generators, sinks, context helpers, and the isolated database exist precisely so tests can run close to real behaviour without opening a browser and repeating an entire human journey.

A good suite makes refactoring less risky, catches authorisation regressions before the customer does, and reduces the time spent reproducing bugs manually. But it only does that when it tests real rules. High coverage with empty assertions is still just a decorative green bar.

In the next chapter we will move one level higher and use Behat to test what PHPUnit deliberately does not see well: the user's complete journey through the interface, including navigation, forms, modals, JavaScript, and visible behaviour in the browser.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Writing PHPUnit tests, Moodle 5.1. Available at: https://moodledev.io/docs/5.1/guides/testing. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit. Available at: https://moodledev.io/general/development/tools/phpunit. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit 11 Upgrade. Available at: https://moodledev.io/general/development/tools/phpunit/upgrading-11. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. External services - Unit Testing. Available at: https://moodledev.io/docs/5.1/apis/subsystems/external/testing. Accessed: 24 Sep. 2026.
* MOODLE. Moodle core source. `advanced_testcase`. Available in the official Moodle repository at: https://github.com/moodle/moodle. Accessed: 24 Sep. 2026.

{% endraw %}
