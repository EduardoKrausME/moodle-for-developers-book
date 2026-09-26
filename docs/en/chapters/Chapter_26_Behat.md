{% raw %}

# 26 BEHAT

In the previous chapter we worked with PHPUnit and saw an important truth: most of a plugin's business rules should be tested without opening a browser. This keeps the suite fast, predictable, and good at finding regressions in classes, the database, capabilities, Events, Hooks, Tasks, Web Services, Privacy, and practically every other Moodle API. But there is one category of problem PHPUnit does not see very well, because the error is not inside one isolated function; it is in the entire journey a user performs through the interface.

The teacher opens the course, turns editing on, adds an activity, fills in the form, saves it, enters the report, opens a modal, changes a filter, and expects a JavaScript component to update the table. Then the learner signs in with another account, opens the same activity, responds, saves, receives a notification, and the teacher returns to see the new state. We can test each PHP service separately, but one practical question remains: does the product actually work when somebody uses Moodle like a normal person?

That is where Behat comes in. It runs acceptance tests that describe journeys in Gherkin and interact with a Moodle installation prepared exclusively for testing. Depending on the scenario, interaction can happen without JavaScript or through a real browser controlled by WebDriver. The goal is not to replace PHPUnit and certainly not to automate every click in the system, but to protect critical flows where several layers need to work together.

In this chapter we will continue using `mod_checkpoint` as the example. The plugin already has a configuration form, learner page, response, grade, and completion, so it is a good laboratory for testing the complete teacher and learner experience. The main concern will be writing readable and stable scenarios, avoiding the kind of Behat suite that takes forty minutes, breaks when somebody changes a button label, and spends more time being repaired than finding bugs.

## 26.1 PHPUnit versus Behat

PHPUnit tests PHP code directly, while Behat tests behaviour observable through the interface. The difference sounds simple, but it completely changes the kinds of questions each tool answers.

If I want to know whether `response_service::submit()` rejects an empty response, I use PHPUnit. If I want to know whether the learner sees the correct message after submitting a valid response through the form, Behat may be more appropriate. If I want to test twenty combinations of completion rules, PHPUnit is better; if I want to guarantee that the teacher enables the rule through the form and the learner actually sees the activity as completed afterwards, Behat closes the journey.

The worst strategy is to use Behat for everything because browsers are expensive. Every scenario needs to prepare data, open pages, locate elements, wait for JavaScript, and then clean the environment. An equivalent PHP test may finish in milliseconds.

## 26.2 Unit, integration, and acceptance

The classification does not need to become an academic debate, but it helps choose the right tool. A unit test isolates a small unit of behaviour. An integration test verifies how several parts work together, normally including the database and Moodle APIs. An acceptance test looks at the system from the outside and verifies that expected behaviour is available to the user.

In practice, Moodle uses PHPUnit for a mixture of unit and integration tests, while Behat mainly occupies the acceptance layer.

What matters is not the category name but avoiding the same expensive rule being tested three times at different levels without a reason. Test the detail where it is cheapest and leave Behat for what really depends on the journey.

## 26.3 What Behat does in Moodle

Behat reads `.feature` files, interprets scenarios written in Gherkin, and finds step definitions matching each sentence. These steps perform actions in the Moodle environment, often through Mink and WebDriver, simulating navigation, clicks, field input, and assertions.

Moodle extends Behat with its own integration that discovers features and steps from multiple components, prepares a separate test site, captures PHP failures, `debugging()`, and exceptions, and provides a large collection of common steps so each plugin does not need to automate the browser from scratch.

This integration matters because the value is not in knowing Selenium. The value is in describing an action such as "I log in as student1" or "I press Save changes" and letting the framework handle the concrete interaction.

## 26.4 The Behat environment is another Moodle

Just as PHPUnit uses its own database and dataroot, Behat also needs a separate environment. In `config.php`, you normally see settings such as:

```php
$CFG->behat_wwwroot = 'http://127.0.0.1:8000';
$CFG->behat_prefix = 'bht_';
$CFG->behat_dataroot = '/var/moodledata_behat';
```

You can also define a separate database connection using `behat_dbname`, `behat_dbuser`, `behat_dbpass`, and `behat_dbhost`.

Never point Behat at a production database. The environment is aggressively recreated and modified during the suite because every scenario needs to begin in a predictable state.

## 26.5 `behat_wwwroot`

`behat_wwwroot` must be a real URL reachable by the browser used in the test. This differs from PHPUnit, which does not need to open the site in a browser.

If you use containers, VMs, or remote Selenium, be careful with `localhost`. `localhost` as seen by PHP, the browser, and the host can refer to different machines. This is one reason test environments work on a laptop and immediately fail in CI.

The URL also works as a safeguard because Moodle enters Behat mode only when the environment is properly enabled and accessed through the specific test address.

## 26.6 `behat_dataroot` and `behat_prefix`

The dataroot must be exclusive to the acceptance environment, as must the prefix or database being used. Do not share `moodledata` with the main environment while hoping tests "will not touch files".

Behat can create uploads, caches, sessions, and other data while reproducing real user journeys. Isolation here is not a luxury; it is the minimum condition for running the suite safely.

## 26.7 Initialising the environment

After configuring the environment, run the initialisation utility:

```
php admin/tool/behat/cli/init.php
```

In Moodle 5.1, with the public-tree reorganisation, the physical path will normally be:

```
php public/admin/tool/behat/cli/init.php
```

The utility installs or updates required dependencies, prepares the test site, discovers features and step definitions, and generates the Behat configuration used by the suite.

## 26.8 The `$CFG->behat_* must be defined` error

If you run the utilities before configuring the environment, you will receive a message saying that `behat_dataroot`, `behat_prefix`, and `behat_wwwroot` must exist in `config.php`.

This is not a Selenium problem and not a plugin problem. Moodle simply refuses to prepare an acceptance environment without knowing where its database, files, and test URL are.

Fix the configuration first, then run `init.php`. Do not edit core scripts to bypass the validation.

## 26.9 Running the suite

After initialisation, one current way to run Behat is:

```
php admin/tool/behat/cli/run.php
```

In Moodle 5.1:

```
php public/admin/tool/behat/cli/run.php
```

During development, it almost never makes sense to run everything. Filter by tag, feature, or specific scenario to reduce the feedback cycle.

## 26.10 Running by tag

If the plugin uses its own tag, you can run only its scenarios:

```
php public/admin/tool/behat/cli/run.php --tags="@mod_checkpoint"
```

Tags are extremely useful in CI and during development, but they should not become an impossible taxonomy with twenty tags per scenario. Use tags that genuinely support suite selection or technical requirements.

## 26.11 Running one specific feature

The current wrapper also lets you point to a specific feature, which is excellent while writing or debugging one file.

```
php public/admin/tool/behat/cli/run.php \
    --feature="/absolute/path/mod/checkpoint/tests/behat/student_submit.feature"
```

This avoids waiting for scenarios unrelated to the current change.

## 26.12 `.feature` files

Plugin features normally live under:

```
mod/checkpoint/tests/behat/
```

For example:

```
mod/checkpoint/tests/behat/student_submit.feature
mod/checkpoint/tests/behat/teacher_grade.feature
```

The file should represent one coherent capability, not a random collection of steps that happen to use the same plugin.

## 26.13 Feature

A feature describes a high-level capability.

```
@mod_checkpoint
Feature: Students submit checkpoint responses
  In order to reflect on the activity
  As a student
  I need to submit a response to a checkpoint
```

The description does not execute anything, but it explains purpose. Do not write a feature as "Testing submit.php" because users do not know what `submit.php` means.

## 26.14 Scenario

Each scenario describes one complete observable behaviour.

```
Scenario: Student submits a valid response
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | student1 | Student | One | student1@example.com |
  When I log in as "student1"
  Then I should see "Dashboard"
```

A good scenario has a clear beginning, action, and outcome. If the scenario enrols users, answers an activity, grades it, changes configuration, exports CSV, and tests backup, it is probably trying to protect too many journeys at once.

## 26.15 Given, When, and Then

Gherkin organises the narrative into three moments. `Given` prepares state, `When` performs the central action, and `Then` verifies the result.

Moodle documentation recommends that each scenario use one initial `Given`, `When`, and `Then`, continuing related steps with `And` or `But`.

This avoids scenarios that read like endless procedural scripts. The semantics help anyone understand what is being prepared, which behaviour is under test, and what the expectation is.

## 26.16 And and But

`And` and `But` have no special behaviour of their own. They inherit the narrative context of the preceding step.

```
Given I am on the "Course 1" course page logged in as "teacher1"
And I turn editing mode on
When I add a "Checkpoint" activity to course "Course 1" section "1"
And I set the following fields to these values:
  | Name | Reflection 1 |
Then I should see "Reflection 1"
But I should not see "Configuration error"
```

Use them for readability, not to hide several different phases inside one scenario.

## 26.17 Background

When several scenarios share preparation, use `Background`.

```
Background:
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | teacher1 | Teacher | One | teacher1@example.com |
    | student1 | Student | One | student1@example.com |
  And the following "courses" exist:
    | fullname | shortname |
    | Course 1 | C1 |
  And the following "course enrolments" exist:
    | user | course | role |
    | teacher1 | C1 | editingteacher |
    | student1 | C1 | student |
```

The Background should contain preparation that is genuinely common. If it creates twenty objects used by only one scenario, it is hiding dependencies instead of reducing repetition.

## 26.18 Scenario Outline

`Scenario Outline` lets you run the same flow with combinations of values.

```html
Scenario Outline: Response validation
  Given I am logged in as "student1"
  When I submit "<response>" to the checkpoint
  Then I should see "<message>"

  Examples:
    | response | message |
    | Yes      | Response saved |
    | No       | Response saved |
```

It is useful for small variations of the same journey. If each example requires completely different logic, they are probably separate scenarios.

## 26.19 Do not turn Behat into a unit-test case table

Scenario Outline can tempt a developer into adding fifty input combinations. That is exactly the kind of work PHPUnit does better and faster.

In Behat, use a few representative cases to guarantee that the interface and integration are correct. Mathematical edge cases, detailed validation, and exhaustive combinations belong in the PHP layer.

## 26.20 Behat data generators

Setup steps can create data directly without navigating through the interface to prepare everything. This saves a lot of time.

```
Given the following "users" exist:
  | username | firstname | lastname | email |
  | teacher1 | Teacher | One | teacher1@example.com |
```

The same idea applies to courses, enrolments, groups, activities, and entities supported by generators.

## 26.21 Do not create setup data by clicking through the interface

If the scenario is testing learner submission, do not spend fifteen steps signing in as an administrator, creating a course, creating a user, enrolling them, and configuring the activity through screens.

Use generators for everything that is not part of the behaviour under test. The interface should only be used for the piece of the experience you actually want to validate.

This choice makes the suite much faster and less fragile.

## 26.22 A plugin-specific generator for Behat

When a plugin has entities that appear in many scenarios, it may be worth adding generator support so Gherkin can prepare them directly.

The idea is similar to the PHPUnit generator but integrated with Behat infrastructure. Instead of repeating interface steps to create every object, you declare data tables in the scenario and let the generator build state.

This is especially useful for activities with responses, attempts, rules, or auxiliary records that would be expensive to create through the UI.

## 26.23 Login

Moodle already provides login steps.

```
When I log in as "student1"
```

Or steps that navigate directly to a page while authenticated as a specific user.

Avoid creating a custom step such as `I login using checkpoint credentials` when authentication is standard. A custom step should exist because the plugin domain needs a new abstraction, not because you prefer another sentence.

## 26.24 Logout and switching users

Complete journeys often need to alternate between teacher and learner. Log out between identities and keep the transition explicit in the scenario.

Do not modify the session directly inside a custom step just to save clicks when login behaviour is part of the journey. At the same time, do not repeatedly test the login page in every scenario if it is not the focus.

## 26.25 Navigation

Use navigation steps that do not depend on an internal URL whenever navigation itself is part of the experience.

```
And I am on the "Course 1" course page
```

If the goal is to test one specific page and the navigation path is not important, a helper that takes you directly to the page may be more robust. The test needs to protect behaviour, not necessarily every intermediate click.

## 26.26 Testing breadcrumbs is not the same as testing the whole navigation

It is common to confuse "the user can reach this page" with "the breadcrumb has exactly these labels". Breadcrumbs can change with the theme or core reorganisation without breaking functionality.

If the requirement is that the page be reachable from a menu, test the required navigation. If the requirement is simply to open the page and use the feature, do not couple the scenario to decorative details.

## 26.27 Forms

Moodle provides steps for filling fields, ticking checkboxes, selecting options, and submitting forms.

```
And I set the following fields to these values:
  | Name | Checkpoint 1 |
  | Question | What did you learn? |
And I press "Save and display"
```

Prefer visible, stable labels that users actually see. Selecting a field by generated CSS should be a last resort.

## 26.28 Gherkin tables

Tables make configuration and expectations easier to read.

```
And I set the following fields to these values:
  | Allow changes | 1 |
  | Maximum grade | 10 |
```

They are also used by generators and custom steps to represent sets of records.

Do not create a table with forty columns just because you can. That is often a sign that the fixture is too large for the scenario.

## 26.29 HTML tables

To validate a rendered table, prefer steps that express content and visual relationship instead of enormous XPath selectors.

You can verify that a row contains particular values or that text appears inside a specific region.

The test should remain valid if the component gains a new column or changes a CSS class that is not part of the requirement.

## 26.30 Modal

Moodle uses modals in many modern interfaces. `@javascript` scenarios can open the modal, interact with its fields, and confirm or cancel actions.

The main concern is scope. If the word "Delete" appears both on the page and inside the modal, a generic step may click the wrong element. Restrict the action to the modal or another identifiable region.

## 26.31 Selectors

Behat and Mink work with different selectors, such as text, link, button, field, CSS, and XPath. In Moodle, prefer semantic selectors and existing steps.

A practical priority is:

```
accessible text/label
button or link name
identifiable region
stable component CSS
XPath only when necessary
```

Position-based XPath such as `div[3]/div[2]/span[1]` is practically a request to break on the next layout change.

## 26.32 Test IDs

In complex interfaces it may make sense to add stable test identifiers, provided the project's policy accepts them and they do not become unnecessary visual dependencies.

The best selector is one tied to interface semantics. If no semantic selector can identify a control without depending on the entire DOM structure, perhaps the accessibility markup itself also needs improvement.

## 26.33 Gherkin should be readable by someone who has never seen the DOM

A scenario such as:

```html
When I click on "[data-region='checkpoint-answer'] button:nth-child(2)" "css_element"
```

may work, but it has lost Behat's main benefit. Someone reading it cannot tell what the user did.

Whenever possible, the sentence should say something like:

```
When I press "Submit response"
```

or use a genuinely meaningful domain-specific custom step.

## 26.34 `@javascript`

Scenarios that depend on JavaScript need the `@javascript` tag.

```
@mod_checkpoint @javascript
Feature: Checkpoint modal actions
```

This makes the test use a browser and driver capable of executing JavaScript. Without the tag, simple scenarios can run in a lighter and faster mode.

Do not mark every feature as `@javascript` out of habit. If a scenario works without JavaScript and is not testing JS behaviour, keep it cheaper.

## 26.35 Tests without JavaScript

Tests without `@javascript` remain useful for traditional flows, basic validation, simple pages, and detecting exceptions.

They are faster and less dependent on frontend timing. A balanced suite uses JavaScript where the application requires it, not as a universal default.

## 26.36 WebDriver

WebDriver is the protocol used to control modern browsers. Selenium can provide the server that receives automation commands and communicates with Chrome, Firefox, and other browsers.

From the perspective of the `.feature` author, this detail should ideally remain hidden. You write a user action and the driver handles clicking, typing, and querying the DOM.

Even so, understanding this layer helps diagnose connection failures, incompatible browsers, and differences in CI execution.

## 26.37 Selenium

Selenium remains a common and recommended option in the Moodle ecosystem for running JavaScript scenarios. It must be reachable by the Behat environment and compatible with the browser in use.

Do not assume that a Selenium or browser version that works with Moodle 4.5 will necessarily behave the same way on another branch years later. CI needs to control versions and update combinations deliberately.

## 26.38 Chrome and Firefox

Running everything in every browser can be expensive. Many projects run the main suite in one browser and keep a smaller matrix of critical scenarios in another.

The goal is to detect improper browser dependencies without multiplying pipeline time by four.

When the plugin uses highly specific JavaScript, cross-browser coverage becomes more important than in a mostly server-side interface.

## 26.39 `behat.yml`

Behat generates configuration describing suites, contexts, drivers, and execution parameters. In Moodle you normally do not manually edit the generated `behat.yml` as a permanent file because the environment is rebuilt from configuration and installed components.

Customisation should use supported mechanisms in `config.php`, such as `behat_config` and additional profiles, so initialisation can reproduce the environment.

## 26.40 Profiles

Profiles allow different browser or environment configurations. This is useful for Chrome, Firefox, remote execution, and specific capability combinations.

The current wrapper accepts `--profile` during execution.

```
php public/admin/tool/behat/cli/run.php --profile=chrome
```

Keep these profiles versioned in development or CI environment configuration, not as forgotten manual settings on one person's machine.

## 26.41 Tags

Besides `@javascript`, tags can group features by component, functionality, or environment requirement.

```
@mod_checkpoint @javascript
Feature: Grading checkpoint submissions
```

A tag on the feature header applies to all its scenarios. Do not repeat it on every scenario unnecessarily.

## 26.42 Exclusion tags

You can also run a suite while excluding categories, for example slow tests or tests depending on a particular resource.

This can be useful in fast pipelines, but be careful not to create an "official suite" that never executes half the tests because every inconvenient scenario was marked optional.

## 26.43 Custom steps

If the available language cannot express a domain action clearly and reusefully, create a custom step.

A plugin can have a file under:

```
mod/checkpoint/tests/behat/behat_mod_checkpoint.php
```

The class defines methods recognised by the framework through attributes or the mechanism supported by the Moodle branch in question.

Before creating one, search the available steps. Moodle already provides many, and duplicating an existing step increases maintenance without adding value.

## 26.44 A custom step should represent the domain

A good custom step could be:

```
Given the student "student1" has submitted "I learned about caching" to checkpoint "Reflection 1"
```

This step prepares a domain state reused by several grading scenarios.

A bad step would be:

```
When I click the third blue button inside the second card
```

That does not represent the domain; it merely hides a fragile selector inside PHP.

## 26.45 Setup step versus interface step

A custom `Given` setup step can create state directly through APIs and generators without navigating through the UI. That is desirable when the state itself is not what is being tested.

A `When` representing a user's action should normally interact with the real interface. If the scenario says "When I submit the response" and the step simply inserts a row into the database, the test is lying about the behaviour it protects.

## 26.46 Do not hide assertions inside every step

An action step should act and an assertion step should assert. Mixing internal assertions into navigation steps can make a scenario fail for a reason that is not visible in the Gherkin sentence.

Some technical checks are unavoidable, such as confirming an element exists before clicking it, but the business requirement should appear explicitly in the `Then`.

## 26.47 Page interaction

Custom steps inherit Behat context helpers and can locate elements, navigate, click, wait, and inspect DOM state.

Before calling WebDriver APIs directly, check what `behat_base` and Moodle's contexts already provide. These abstractions handle selectors, exceptions, and waiting in a way that is more consistent with the rest of the suite.

The more directly your step talks to Selenium, the more it depends on infrastructure details.

## 26.48 Asynchronous waits

The classic Behat problem with JavaScript is timing. The test clicks, AJAX starts, and the assertion runs before the interface finishes updating.

The correct solution is not to put `sleep(5)` everywhere. Use steps and helpers that wait for the real condition, such as a loader disappearing, an element appearing, pending JavaScript completing, or a specific DOM change.

Waiting for a condition is predictable; waiting for time is gambling.

## 26.49 Why `sleep()` makes tests slow and still fragile

If AJAX finishes in 200 ms, a five-second sleep wastes 4.8 seconds on every run. If CI is slow and it takes six seconds, the test still fails after waiting.

Across one hundred scenarios, those sleeps become whole minutes of pipeline time without guaranteeing stability.

Synchronise with application state instead.

## 26.50 `I wait` only for debugging

During diagnosis it can be useful to pause to inspect the screen or open DevTools. That does not mean the artificial wait should remain in the final scenario.

If you needed to add a wait for the test to pass, identify the actual state that needed to be awaited and turn the pause into a semantic step.

## 26.51 AJAX and loaders

If the plugin has its own loader, give it stable markup and accessible state. That improves both UX and testability.

A test can wait for the loader to disappear before checking the table. Better still, use core patterns that already integrate with pending-JS tracking, reducing the need for custom Behat logic.

## 26.52 `core/ajax` and Behat

When your frontend uses `core/ajax`, the Moodle framework can track much of the asynchronous state. Even so, custom code must resolve Promises correctly and register pending activity where appropriate.

JavaScript that fires an isolated `fetch()` and never tells the ecosystem that work is still pending can make the interface look ready to the test before it really is.

Testability often exposes real frontend architecture problems.

## 26.53 Modals and animations

Modals and animations also introduce timing. Do not click a button that is still transitioning or search for content before the modal is visible.

Use steps that understand modals or visibility conditions. Disabling every animation in plugin code just for Behat is a bad smell if real users still receive different behaviour.

## 26.54 Data preparation

Test data should be minimal and explicit. For a learner submission, you probably need a course, teacher, learner, enrolments, and activity. You do not need five categories, four groups, and two administrators if the scenario uses none of them.

Small fixtures reduce execution time and make failures easier to understand.

## 26.55 IDs should not appear in Gherkin without a reason

Prefer stable references such as shortname, username, and activity name instead of database IDs.

```
Given I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
```

An ID is a persistence detail and may change according to generator order.

## 26.56 Unique names help the test

If a page has three activities all named "Test", locating the correct element becomes unnecessarily difficult. In Behat fixtures, use clear names such as `Checkpoint 1`, `Checkpoint restricted`, and `Checkpoint graded`.

This also makes screenshots and failures easier to read.

## 26.57 Test as the correct user

Always make clear who performs the action. A scenario may pass as admin and fail for a teacher because admin bypasses many restrictions.

If the requirement belongs to the learner, test as a learner. If it belongs to an editing teacher, use that role. Testing everything as administrator is an efficient way to hide capability problems.

## 26.58 Negative permission tests

Behat is also useful for proving that something does not appear or cannot be reached through the interface.

```
Then I should not see "Grade responses"
```

But hiding a button is not complete security. The endpoint still needs PHPUnit or another lower-level test proving server-side authorisation. Use Behat for visible experience and PHPUnit for the rule that actually protects the action.

## 26.59 Stable form identifiers

Labels and field names should be consistent. If the test can only fill a field through an obscure selector, review the form.

The Forms API normally produces labels and attributes suitable for automation and accessibility, so using standard components helps Behat without additional work.

## 26.60 Testing dynamic tables

Dynamic Tables and AJAX grids need careful testing around pagination, filters, and asynchronous updates.

Do not verify the whole table cell by cell if the requirement is only that the new record appears. The more unnecessarily specific the assertion, the more it breaks on cosmetic changes.

## 26.61 Filters

A useful scenario can prepare two records, apply a filter, and verify that one appears while the other does not.

This tests behaviour without depending on the entire table order.

## 26.62 Sorting

If sorting is critical functionality, prepare data that produces an unambiguous order and verify the necessary sequence or extremes.

Do not use data already naturally ordered as expected because the test will pass even if clicking the column heading does nothing.

## 26.63 Filepicker and Filemanager

Uploads can be tested through Behat, but they are heavier. Use small fixture files inside the plugin test area.

If you only need to test the rule validating MIME type or processing content, PHPUnit is better. Behat should remain for proving that the user can attach a file and that it appears where it should.

## 26.64 HTML editor

Rich-text editors depend on JavaScript and may vary between versions. Use the available dedicated steps for editing content instead of manipulating the editor's internal DOM.

The test should assert the saved text or rendered output, not the span structure generated by the editor.

## 26.65 Screenshots on failures

When a JavaScript scenario fails, Moodle can generate screenshots and page HTML in the faildump area. These artefacts are extremely valuable because they show the browser's real state at the moment of failure.

In CI, preserve faildumps as artefacts. A log saying "element not found" is far less useful than a screenshot showing that the modal never opened.

## 26.66 `behat_faildump_path`

The faildump path can be configured to a location accessible from the development or CI environment. Moodle Docker commonly exposes it conveniently for inspection.

Do not automatically publish faildumps to a public location. A test page may contain fixture names, emails, and other data that does not need to be publicly exposed.

## 26.67 HTML dump

Alongside the screenshot, captured HTML helps when an element exists but is invisible or outside the expected region.

This is much better than guessing from the Gherkin sentence. Look at the real state before adding one more selector or one more `sleep()`.

## 26.68 Debugging with one scenario

When a scenario fails, run only that scenario. Do not execute the entire suite after every attempt.

You can filter by feature, tag, or scenario name according to options supported by the Behat runner.

The ideal correction cycle is short: reproduce, inspect, change, run again.

## 26.69 `--rerun` and previous failures

The current Moodle runner supports rerunning processes that failed in a previous execution, including parallel mode.

This is useful in large suites, but do not use rerun to hide a flaky test. If a test frequently passes only on the second attempt, there is a race, state dependency, or timing problem that needs to be fixed.

## 26.70 Auto-rerun is not a solution for flakiness

Pipelines sometimes configure automatic retries to reduce infrastructure noise, but a suite that depends on this loses credibility.

The test should be deterministic within supported conditions. Use retry only as an additional operational mechanism, not as part of scenario logic.

## 26.71 Parallelism

Moodle supports initialising multiple Behat environments for parallel execution.

```
php public/admin/tool/behat/cli/init.php --parallel=4
```

The runner then distributes execution according to configuration.

Parallelism reduces total time but increases database, CPU, memory, browser, and filesystem consumption. Four workers do not guarantee four times the speed.

## 26.72 A test must be isolated to run in parallel

If two scenarios depend on one shared external service, fixed file, or global state outside the Moodle environment, parallelism can reveal race conditions.

That is useful because the same problem may exist in production. But Behat fixtures should not depend on an unnecessary non-isolated external resource.

## 26.73 Do not call real services

An acceptance suite should not charge a card, email a customer, publish a production webhook, or depend on a real ERP.

Use fake environments, sandboxes, backend stubs, or test-specific configuration. Behat needs to be reproducible and safe to run in CI hundreds of times.

## 26.74 Email

If the journey needs to prove that an action generates a communication, PHPUnit with a message sink often tests the sending rule better. In Behat, test only the consequence visible to the user when that belongs to the requirement, such as an in-interface notification.

Do not open a real Gmail account during a plugin test. That turns your suite into third-party-service automation rather than Moodle testing.

## 26.75 Accessibility and Behat

Current Behat environments can also integrate accessibility checks, including axe support during environment initialisation.

This does not replace manual review, keyboard testing, and screen readers, but it helps detect basic regressions in tested interfaces.

If the plugin introduces new UI, consider putting accessibility in the pipeline instead of treating it as a one-time audit before publication.

## 26.76 Existing steps before custom steps

Moodle administration has an Acceptance testing area that lists available steps when the Behat environment is prepared.

Check that list before creating a step. It is common for a developer to write fifty lines of PHP for an action that already exists in core under a slightly different name.

IDE support for Gherkin also helps discover steps and avoid typing errors.

## 26.77 Naming a custom step

When creating your own step, give it language that identifies the plugin domain. This avoids collisions with generic steps from other components.

Instead of:

```
Given a response exists
```

prefer something like:

```
Given the following checkpoint responses exist:
```

The name remains readable while making its origin clear.

## 26.78 Do not write a step that calls too many steps

It is tempting to create `Given a complete checkpoint course exists` and hide thirty internal steps. This reduces repetition but turns the scenario into a black box.

Create abstractions at the right level. A step can prepare one domain entity; it should not hide the entire world required by the test without letting the reader know which preconditions exist.

## 26.79 Composite steps and maintenance

When a custom step calls other steps, any change to intermediate wording can break the composition. It is often better to use APIs and generators directly for setup than to build a textual chain of steps.

For real browser actions, use the appropriate context helpers.

## 26.80 Fragile scenarios

A fragile scenario fails because of things that do not represent a real regression. A slightly changed button label, irrelevant visual order, internal CSS class, animation delay, or additional page content can break it.

Every assertion should correspond to a requirement. If you cannot explain which requirement a line protects, perhaps that line should not exist.

## 26.81 Testing too much text

`Then I should see` is easy to use and can therefore be overused. A page may contain the expected text somewhere else and the test may pass by accident.

When location matters, restrict the region. When it does not, do not invent a more complex selector merely to be specific.

The precision level should follow the requirement.

## 26.82 Testing too much CSS

Do not test colour, margin, Bootstrap class, or grid structure with ordinary Behat unless they represent functional behaviour and there is an appropriate technique.

A theme change should not break the business-rule suite. Visual regression requires dedicated tools and a different testing strategy.

## 26.83 Random data makes failures harder to reproduce

Generators can create values automatically, but Behat scenarios benefit from predictable names. When a test fails and the screenshot shows `Course 7a83f`, you waste time discovering which object it was.

Use deterministic fixtures whenever scenario and faildump readability matter.

## 26.84 Time and dates

Date tests can become unstable around midnight, timezone changes, or DST. Prefer relative dates controlled by the generator or periods with sufficient margin.

If the requirement is exactly about a temporal boundary, the main rule probably deserves PHPUnit with time control, leaving Behat for one representative case.

## 26.85 Scenario order

Never depend on execution order. Each scenario must prepare its own state and work independently.

Behat can redistribute scenarios during parallel execution, so hidden dependencies between features quickly become visible.

A scenario that only passes after another scenario created configuration is wrong.

## 26.86 A small scenario does not mean an artificial scenario

Try to keep each scenario focused, but do not split a natural journey into five tests that repeat all setup simply to avoid fifteen lines.

The ideal size is the one with one central action and a clear consequence, without mixing independent features.

## 26.87 Reuse without losing readability

Background, generators, and custom steps help reduce repetition. The goal is not zero repetition but understandable Gherkin.

Two repeated lines in three scenarios may be cheaper than a mysterious abstraction with a generic name.

## 26.88 What is not worth testing with Behat

Do not use Behat for pure algorithms, combinatorial validation, specific SQL, every branch of a task, internal payload formatting, method return values, or a class exception.

These tests are better in PHPUnit.

Also avoid testing core functionality with no plugin-specific relationship. Every plugin does not need to prove that login, course creation, and the Forms API work.

## 26.89 What is very valuable to test with Behat

Critical user flows, integration between forms and rules, visible permissions, modals, AJAX, filters, state changes that must appear in the UI, teacher-learner journeys, and regressions that historically broke in production are excellent candidates.

If a real bug cost hours of support and could have been reproduced as a stable journey, it probably deserves a scenario.

## 26.90 Behat and security

Behat is useful for confirming that a user without permission does not see links or cannot reach a particular flow through the interface. Server-side authorisation, however, should also have lower-level tests.

A hidden UI can be bypassed by a manual request, and Behat should not be the only proof that `require_capability()` exists.

Combine the levels instead of choosing only one.

## 26.91 Behat and custom JavaScript

If the plugin has ESM that initialises a modal, fetches data, and updates the DOM, Behat is one of the few ways to test the whole composition inside Moodle.

Write JavaScript with observable state in mind. Clear loading state, error messages, accessible elements, and correctly resolved Promises improve the real experience and make testing more stable at the same time.

## 26.92 Complete `mod_checkpoint` example

Let us test a teacher-learner journey. The teacher creates an activity with a grade and completion by submission. The learner responds. Then the teacher opens the report, assigns a grade, and the learner sees the feedback.

The scenario does not need to validate every internal rule because PHPUnit already covers those. It needs to prove that the main components communicate correctly through the interface.

## 26.93 Preparing the feature

Create:

```
mod/checkpoint/tests/behat/teacher_student_journey.feature
```

With tags:

```
@mod_checkpoint @javascript
Feature: Teacher and student use a checkpoint activity
  In order to support reflective activities
  As a teacher and student
  I need to create, submit and grade a checkpoint
```

## 26.94 Example Background

```
Background:
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | teacher1 | Teacher | One | teacher1@example.com |
    | student1 | Student | One | student1@example.com |
  And the following "courses" exist:
    | fullname | shortname |
    | Course 1 | C1 |
  And the following "course enrolments" exist:
    | user | course | role |
    | teacher1 | C1 | editingteacher |
    | student1 | C1 | student |
```

We have not created the activity yet because in this scenario creating it through the form is part of the behaviour we want to protect.

## 26.95 Teacher creates the activity

```
Scenario: Teacher creates, student responds and teacher grades
  Given I am on the "Course 1" course page logged in as "teacher1"
  And I turn editing mode on
  When I add a "Checkpoint" activity to course "Course 1" section "1"
  And I set the following fields to these values:
    | Name | Reflection 1 |
    | Question | What was the most important concept? |
    | Maximum grade | 10 |
  And I press "Save and display"
  Then I should see "Reflection 1"
  And I should see "What was the most important concept?"
```

Depending on the steps available in the branch, the activity-addition flow may use slightly different wording. Always inspect the steps generated in your own environment.

## 26.96 Learner responds

In the same scenario we can switch users:

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
  And I set the field "Response" to "Cache without invalidation becomes a bug"
  And I press "Submit response"
  Then I should see "Response saved"
```

If the form is JavaScript-based, keep `@javascript`. If it uses a traditional submit and the rest of the scenario does not need JS, it may be better to split the scenarios and remove the tag where unnecessary.

## 26.97 Teacher grades

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "teacher1"
  And I follow "Responses"
  Then I should see "Cache without invalidation becomes a bug"
  When I follow "Grade" in the "student1" "table_row"
  And I set the field "Grade" to "9"
  And I press "Save changes"
  Then I should see "Grade saved"
```

Here the `table_row` selector prevents clicking another user's link if the table contains several records.

## 26.98 Learner sees the result

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
  Then I should see "9"
  And I should see "Complete"
```

This ending verifies the journey's integration with grades and completion without repeating all the internal Gradebook and Completion tests already written in PHPUnit.

## 26.99 Splitting scenarios for better diagnosis

The previous example is useful for teaching, but in a real suite I might split creation/configuration, submission, and grading into two or three scenarios depending on the regression history.

When everything sits in one very long scenario, a failure during creation prevents us from learning whether submission and grading still work. When we fragment too much, we pay repeated setup costs and lose the integrated journey.

There is no magic number; there is a balance between diagnosis, execution time, and coverage.

## 26.100 Custom step for an existing response

For grading scenarios, submitting through the interface may not be the focus. We can therefore create a setup step:

```
Given the following checkpoint responses exist:
  | checkpoint | user | response |
  | Reflection 1 | student1 | Cache needs invalidation |
```

The step uses plugin APIs to create the response directly. That lets the grading feature begin in the required state without repeating the learner journey.

## 26.101 Screenshots should help, not replace assertions

A screenshot is a diagnostic tool. Do not consider the test successful because the image "looks right" to a person reviewing CI.

Assertions remain the executable text of the requirement. Screenshots enter when something fails and we need to understand the visual state.

## 26.102 CI

The next chapter will go deeper into Git and CI, but Behat needs to enter the pipeline strategically. A complete acceptance suite may be too expensive for every tiny commit, while a selection of critical tags can run on pull requests and the full suite in longer-running jobs.

The important part is not leaving Behat as a command that "someone runs before release". An automated test that depends on human memory is not really automated.

## 26.103 CI artefacts

When a scenario fails, preserve logs, screenshots, HTML dumps, and JUnit reports when configured. This avoids reproducing locally just to discover that the page showed an obvious PHP error.

Artefacts also help compare intermittent failures between browsers and workers.

## 26.104 Suite execution time

Track execution time. A scenario that takes two minutes deserves investigation, especially if most of the time is UI setup or `sleep()`.

Test performance matters because a slow suite is run less often. And a test run less often finds bugs later.

## 26.105 Reviewing Behat in code review

During review I immediately look for a few things. Does the scenario test behaviour or DOM details? Does it use generators for setup? Does it have `@javascript` unnecessarily? Does it use `sleep`? Does it depend on execution order? Does it call a real external service? Does the name explain the rule? Is there already a core step that would do the same thing? Does the assertion prove the requirement or merely confirm that the page contains some generic text?

Good Behat should read almost like executable documentation of the journey.

## 26.106 Final exercise

Create a Behat suite for `mod_checkpoint` with at least four independent journeys.

The first scenario should allow a teacher to create an activity with grading and completion by submission. The second should allow an enrolled learner to submit a response and see the completion state. The third should allow the teacher to grade a response already prepared by a generator or custom step and then let the learner see the grade. The fourth should prove that a learner in another group cannot see a response that should be protected under `SEPARATEGROUPS`.

Use Background only for users, course, and enrolments that are genuinely shared. Do not prepare the activity through the interface in scenarios where creation is not the focus. Add `@javascript` only where the UI genuinely depends on JavaScript.

Then deliberately introduce three regressions. Remove the submission button from the template, break JavaScript initialisation for the grading modal, and remove the group check from the listing. The suite should detect all three changes, but server-side authorisation must also remain covered by PHPUnit because hiding or showing content in the browser is not the only security layer.

Finally, run the feature by itself, by tag, and in parallel execution. Preserve the faildumps from a deliberately induced failure and identify from the screenshot and HTML which interface state caused the error. If diagnosis requires adding `sleep(10)` until the test passes, the exercise is not finished.

## 26.107 Closing the chapter

Behat is valuable because it tests Moodle at the level where teachers, learners, and administrators actually work. It finds problems an isolated PHP test cannot see, such as a button that does not appear, a modal that does not open, JavaScript that never finishes, a field with the wrong name, a filter that does not update, or a journey requiring a permission the interface failed to respect.

But precisely because it involves a browser and the complete application, it is an expensive tool. The secret of a good suite is not having the largest number of scenarios, but choosing critical journeys, preparing state with generators, using semantic selectors, avoiding sleeps, reusing core steps, and leaving rule details to PHPUnit. When this division is respected, PHPUnit protects the logic and Behat protects the experience, and together they let you change a large plugin without depending on a manual click marathon before every release.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Behat. Available at: https://moodledev.io/general/development/tools/behat. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Writing acceptance tests. Available at: https://moodledev.io/general/development/tools/behat/writing. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Running acceptance tests. Available at: https://moodledev.io/general/development/tools/behat/running. Accessed: September 2026.
* MOODLE. Moodle source code. `config-dist.php`, Behat support section. Available at: https://github.com/moodle/moodle/blob/main/config-dist.php. Accessed: September 2026.
* MOODLE. Moodle source code. `admin/tool/behat/cli/init.php`. Available at: https://github.com/moodle/moodle/blob/main/public/admin/tool/behat/cli/init.php. Accessed: September 2026.
* MOODLE. Moodle source code. `admin/tool/behat/cli/run.php`. Available at: https://github.com/moodle/moodle/blob/main/public/admin/tool/behat/cli/run.php. Accessed: September 2026.
* MOODLEHQ. Moodle Docker. Examples of running Behat in a development environment. Available at: https://github.com/moodlehq/moodle-docker. Accessed: September 2026.

{% endraw %}
