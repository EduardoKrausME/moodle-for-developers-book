{% raw %}

# 30 FINAL PROJECT

Reaching the final chapter of a book about Moodle plugin development and ending by creating one more isolated class would waste everything built so far. The final project needs to do the opposite: it should force you to make decisions that look small when each API is studied separately but begin depending on one another when the plugin becomes a real product.

That is why this chapter does not introduce a new API. Everything we will use has appeared before, and that is precisely the point. The challenge now is to choose the correct plugin type, design the database without creating fragile dependencies, define coherent capabilities, separate the interface from business rules, use Gradebook and Completion without duplicating state, integrate the Files API, Events, Tasks, Cache, Web Services, Privacy, Backup, and tests, close the CI loop, generate the ZIP, and prove that the package survives a clean installation, an upgrade, and restoration on another installation.

The project will be `mod_checkpoint`, which appeared in several chapters as a partial example. Now it stops being an example and becomes a complete activity. The teacher creates a checkpoint inside the course, provides instructions, a due date, and the activity's value; the learner submits evidence as text and optionally a file; the teacher assesses it, records feedback and a grade; and Moodle updates Gradebook and Completion. The plugin also provides a small monitoring view, asynchronous notification, Web Service status lookup, personal-data export and deletion, backup/restore, and a test suite sufficient to prevent a simple change from destroying the main flow.

The most important rule of this chapter is simple. Do not add an API merely to say that it was used. Hooks, subplugins, cache, tasks, or Web Services should enter only when a real responsibility exists for them. A good final project demonstrates that you know how to use Moodle APIs, but also that you know when not to use each one.

## 30.1 The project goal

`mod_checkpoint` represents a submission-check activity. It can be used for a project milestone, evidence of participation, a simple document, an internship stage, a practical delivery, or any situation where a learner needs to record that they reached a certain point and the teacher needs to assess that submission.

The activity needs to be simple for the learner, predictable for the teacher, and integrated into the course. The learner should not have to learn a new platform inside Moodle merely to submit evidence, and the teacher should not need to open five different reports to discover who submitted, who is late, and who has already been graded.

## 30.2 Functional specification comes before code

Before creating the `mod/checkpoint` directory, write down what the product does. A short specification for this version could be:

```
Teacher
    creates the activity
    defines instructions and due date
    defines the activity value
    chooses whether text, file, or both are accepted
    views pending submissions
    grades a submission
    records grade and feedback
    can reopen a submission

Learner
    opens the activity
    views instructions and deadline
    submits text and/or file
    views submission state
    views feedback and grade when released

System
    records relevant events
    updates Gradebook
    updates Completion
    sends a notification after grading
    provides status lookup through Web Service
    participates in Privacy API
    participates in backup and restore
```

This is already enough to start the architecture. If the specification changes every time a file is opened, the problem is not yet clear enough for code.

## 30.3 Acceptance criteria

The specification describes intent, while acceptance criteria make it possible to verify whether the product is finished. For this project, several criteria are mandatory.

An enrolled learner with submission capability can create their first submission, change it while the activity remains open, and cannot grade their own submission. A teacher with grading capability can list submissions from the correct context, record a grade and feedback, while a teacher without permission in that course cannot access the page directly by URL.

The grade must appear in Gradebook, completion must follow the configured rules, an uploaded file must survive backup and restore, and the user must be able to export and delete their personal data according to the Privacy API.

## 30.4 Choosing the correct plugin type

This project is a `mod`, not a `local`, because the functionality needs to exist as a course activity, have a `course_module`, module context, participate in completion and Gradebook, support activity backup, and be directly accessible by the learner inside a course section.

This is exactly where it is worth remembering the provocation from the beginning of the book about using `local` for almost everything. `local` is excellent when behaviour is institutional, cross-cutting, or does not need an instance inside the course. In this case, however, the pedagogical object needs to appear in the course, so making it a `local` plugin would create extra work to imitate things that `mod` already solves natively.

## 30.5 Component name

The Frankenstyle component is:

```
mod_checkpoint
```

The directory is:

```
public/mod/checkpoint
```

On installations before the public-directory reorganisation, the physical path may appear as `mod/checkpoint`, but the component remains `mod_checkpoint`. Business logic must never depend on manually assembling the physical path.

## 30.6 Initial directory structure

A production structure for the first version could be:

```
mod/checkpoint/
    amd/
        src/
            dashboard.js
    backup/
        moodle2/
            backup_checkpoint_activity_task.class.php
            backup_checkpoint_stepslib.php
            restore_checkpoint_activity_task.class.php
            restore_checkpoint_stepslib.php
    classes/
        completion/
            custom_completion.php
        event/
            submission_created.php
            submission_graded.php
        external/
            get_status.php
        form/
            submission_form.php
            grade_form.php
        output/
            student_status.php
        privacy/
            provider.php
        task/
            send_grade_notification.php
        local/
            manager.php
    db/
        access.php
        caches.php
        install.xml
        services.php
        tasks.php
        upgrade.php
    lang/
        en/
            checkpoint.php
        pt_br/
            checkpoint.php
    templates/
        student_status.mustache
    tests/
        behat/
            checkpoint.feature
        generator/
            lib.php
        manager_test.php
        privacy_provider_test.php
    index.php
    lib.php
    mod_form.php
    settings.php
    version.php
    view.php
```

This tree is not a goal by itself. Every directory needs to exist because there is a concrete responsibility behind it.

## 30.7 Data model

The project needs one table for activity configuration and another for the learner submission. The main `checkpoint` table follows the activity-module pattern, while the second table stores per-user state.

An initial model can be:

```
checkpoint
    id
    course
    name
    intro
    introformat
    duedate
    grade
    allowtext
    allowfile
    completionsubmit
    completiongrade
    timecreated
    timemodified

checkpoint_submission
    id
    checkpointid
    userid
    status
    submissiontext
    submissionformat
    grade
    feedback
    feedbackformat
    graderid
    timecreated
    timemodified
    timegraded
```

Do not store the learner's name, email, or course name in the second table. Store IDs and retrieve the remaining data from the correct entities.

## 30.8 Indexes and uniqueness

The business rule for this version says that each user has one current submission per checkpoint. That needs to appear in the database.

```
UNIQUE(checkpointid, userid)
INDEX(checkpointid, status)
INDEX(userid)
INDEX(graderid)
```

The status index helps the teacher screen, which normally queries pending submissions by activity. The user index helps personal queries and the Privacy API.

## 30.9 Do not invent one table per state

Pending, submitted, graded, and reopened are states of the same submission, not four entities. Creating `checkpoint_pending`, `checkpoint_graded`, and `checkpoint_reopened` would turn simple transitions into physical movement of rows.

A `status` column with well-defined constants is more predictable.

```php
/**
 * Centralises the states allowed for a submission.
 */
final class submission_status {
    // Represents a submission not yet formally submitted by the learner.
    public const DRAFT = 'draft';

    // Represents a submission formally sent for grading.
    public const SUBMITTED = 'submitted';

    // Represents a submission that has already been graded.
    public const GRADED = 'graded';

    // Represents a submission returned to the learner for further editing.
    public const REOPENED = 'reopened';
}
```

## 30.10 `version.php`

The plugin version needs to reflect the compatibility policy defined in Chapter 29.

```php
<?php

// Prevents direct execution of this file outside Moodle bootstrap.
defined('MOODLE_INTERNAL') || die();

// Declares metadata used by Moodle during installation and upgrade.
$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

Do not copy example numbers into production without validating the actual branch that will be supported.

## 30.11 Upgrade path from the first release

Even version 1.0 needs to be born thinking about 1.1. If `feedbackfiles`, `latepolicy`, or a new column appears tomorrow, the change must go into `db/upgrade.php` with the correct savepoint.

The common mistake is treating `install.xml` as a live schema and editing only it after the plugin has already been distributed. That fixes clean installations and breaks upgrades for people already using the plugin.

## 30.12 `settings.php`

Global configuration should store only what genuinely applies to every instance. In this project we can have a default file-size limit and a global setting controlling notification after grading.

```php
// Adds a global administrative setting to enable notifications after grading.
$settings->add(new admin_setting_configcheckbox(
    'mod_checkpoint/notifygrade',
    get_string('notifygrade', 'mod_checkpoint'),
    get_string('notifygrade_desc', 'mod_checkpoint'),
    1
));
```

Do not put due dates, maximum grades, or instructions in global settings because those values belong to the activity instance.

## 30.13 Capabilities

A first version can use:

```
mod/checkpoint:addinstance
mod/checkpoint:view
mod/checkpoint:submit
mod/checkpoint:grade
mod/checkpoint:manage
```

`submit` belongs to learners, `grade` to teachers, and `manage` to administrative operations on the activity. Do not use `is_siteadmin()` as a replacement for authorisation.

## 30.14 The correct context

Almost everything in this plugin operates in `context_module`.

```php
// Loads the course module and fails immediately if the ID does not exist.
$cm = get_coursemodule_from_id('checkpoint', $id, 0, false, MUST_EXIST);

// Resolves the module context, which is the correct context for activity capabilities.
$context = context_module::instance($cm->id);

// Requires course login and validates view permission inside the module.
require_login($cm->course, false, $cm);
require_capability('mod/checkpoint:view', $context);
```

A capability needs to be checked in the context where the action actually happens. Checking at system context because it is easier is a classic way to open permissions too broadly.

## 30.15 `mod_form.php`

The activity configuration form should contain only instance properties.

```php
/**
 * Configuration form for a Checkpoint instance.
 */
class mod_checkpoint_mod_form extends moodleform_mod {
    /**
     * Defines activity-specific fields and the standard elements.
     *
     * @return void
     */
    public function definition() {
        // Gets the Moodle form instance maintained by the base class.
        $mform = $this->_form;

        // Defines the required activity name and applies the appropriate parameter type.
        $mform->addElement('text', 'name', get_string('checkpointname', 'mod_checkpoint'));
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        // Includes the standard activity introduction fields.
        $this->standard_intro_elements();

        // Allows an optional submission deadline to be configured.
        $mform->addElement('date_time_selector', 'duedate', get_string('duedate', 'mod_checkpoint'), [
            'optional' => true,
        ]);

        // Defines which evidence formats learners may submit.
        $mform->addElement('checkbox', 'allowtext', get_string('allowtext', 'mod_checkpoint'));
        $mform->addElement('checkbox', 'allowfile', get_string('allowfile', 'mod_checkpoint'));

        // Adds grading, common module settings, and action buttons.
        $this->standard_grading_coursemodule_elements();
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
```

## 30.16 Validating configuration

If both text and file are disabled, the learner has nothing to submit. That rule belongs in form validation.

```php
/**
 * Validates activity configuration combinations.
 *
 * @param array $data Data submitted by the form.
 * @param array $files Files submitted by the form.
 * @return array Errors found, indexed by field name.
 */
public function validation($data, $files) {
    // Preserves validations supplied by Moodle's default implementation.
    $errors = parent::validation($data, $files);

    // Prevents an activity where no submission type is enabled.
    if (empty($data['allowtext']) && empty($data['allowfile'])) {
        $errors['allowtext'] = get_string('error:nosubmissiontype', 'mod_checkpoint');
    }

    // Returns all errors so Moodle can associate them with form fields.
    return $errors;
}
```

Form validation does not replace authorisation in the endpoint processing the action.

## 30.17 Instance callbacks

`checkpoint_add_instance()`, `checkpoint_update_instance()`, and `checkpoint_delete_instance()` remain part of the activity-module contract.

Ideally, keep these callbacks small and move rules into testable classes.

```php
/**
 * Creates a new activity instance.
 *
 * @param stdClass $data Validated instance data.
 * @param moodleform_mod|null $mform Form used during creation, when available.
 * @return int ID of the new instance.
 */
function checkpoint_add_instance(stdClass $data, ?moodleform_mod $mform = null): int {
    // Gets the service from the container so dependencies remain centralised in the manager.
    $manager = \core\di::get(\mod_checkpoint\local\manager::class);

    // Delegates persistence and creation rules to the service layer.
    return $manager->create_instance($data);
}
```

## 30.18 A service class for business rules

The manager class centralises important transitions, but now it also applies the Dependency Injection model studied in Chapter 4. Instead of static methods pulling globals from anywhere, the class declares in its constructor the resources it actually uses.

```php
namespace mod_checkpoint\local;

/**
 * Centralises Checkpoint business rules and state transitions.
 */
final class manager {
    /**
     * Creates the service with explicit dependencies that can be replaced in tests.
     *
     * @param \moodle_database $db Database access layer.
     * @param \core\clock $clock Clock used by time-dependent rules.
     */
    public function __construct(
        private readonly \moodle_database $db,
        private readonly \core\clock $clock,
    ) {
    }

    /**
     * Creates or updates a learner submission.
     *
     * @param int $checkpointid Activity ID.
     * @param int $userid Learner ID.
     * @param array $data Submission data.
     * @return int Persisted submission ID.
     */
    public function submit(int $checkpointid, int $userid, array $data): int {
        // Uses the injected clock to keep time rules deterministic in tests.
        $now = $this->clock->time();

        // Validates the submission, persists data, processes files, and updates derived state.
    }

    /**
     * Grades a submission and publishes the derived effects of grading.
     *
     * @param int $submissionid Submission ID.
     * @param int $graderid Grader ID.
     * @param float $grade Grade awarded.
     * @param string $feedback Grading feedback.
     * @return void
     */
    public function grade(int $submissionid, int $graderid, float $grade, string $feedback): void {
        // Captures the grading instant from the same time source used by the domain.
        $now = $this->clock->time();

        // Persists grading and synchronises Gradebook, event, and asynchronous notification.
    }

    /**
     * Reopens a previously submitted or graded submission.
     *
     * @param int $submissionid Submission ID.
     * @return void
     */
    public function reopen(int $submissionid): void {
        // Changes the submission state and invalidates derived data that is no longer valid.
    }
}
```

The database and clock stop being invisible dependencies. This lets a due-date rule always use the same clock, allows PHPUnit to control time when needed, and lets callbacks or entry points obtain the class from the container without turning `\core\di::get()` into a call scattered inside every method.

### 30.18.1 `\core\clock` in the activity deadline

The checkpoint has a due date, so time is part of the domain and needs to be testable. Instead of comparing `duedate` with `time()` across multiple files, concentrate the rule in the service and use `$this->clock->time()`. A test can then simulate before, exactly at, and after the deadline without waiting for the real clock to advance.

```php
/**
 * Checks whether the activity has passed its deadline.
 *
 * @param \stdClass $checkpoint Activity record.
 * @return bool True when a deadline exists and has already passed.
 */
private function is_late(\stdClass $checkpoint): bool {
    // Considers it late only when the activity has a configured deadline.
    return $checkpoint->duedate > 0
        && $this->clock->time() > $checkpoint->duedate;
}
```

## 30.19 Transactions

Submitting evidence may involve a table, the Files API, an Event, and Completion. The transaction should protect only what is transactional in the database and must not remain open during a slow external call.

```php
// Opens a transaction only for changes that need to be atomic.
$transaction = $DB->start_delegated_transaction();

// Perform here the database changes that must commit or fail together.

// Commits the transaction before external or potentially slow operations begin.
$transaction->allow_commit();
```

After commit, trigger what should not keep a lock open, especially integrations and asynchronous notifications.

## 30.20 Submission form

The learner needs a dedicated Moodle form, separate from `mod_form`.

```php
namespace mod_checkpoint\form;

/**
 * Form used by learners to submit Checkpoint evidence.
 */
class submission_form extends \moodleform {
    /**
     * Defines fields available for the submission.
     *
     * @return void
     */
    public function definition() {
        // Gets the form object supplied by the base class.
        $mform = $this->_form;

        // Adds the text editor for textual evidence.
        $mform->addElement('editor', 'submissiontext', get_string('submissiontext', 'mod_checkpoint'));
        $mform->setType('submissiontext', PARAM_RAW);

        // Adds the file area and the button that completes submission.
        $mform->addElement('filemanager', 'evidence_filemanager', get_string('evidence', 'mod_checkpoint'));
        $mform->addElement('submit', 'submitbutton', get_string('submit'));
    }
}
```

The presence of fields can be conditioned on the activity configuration.

## 30.21 Draft area and Files API

Evidence files should follow the normal draft-file-area flow.

```php
// Prepares the draft area with files already associated with the current submission.
file_prepare_standard_filemanager(
    $data,
    'evidence',
    $options,
    $context,
    'mod_checkpoint',
    'evidence',
    $submissionid
);
```

When saving, use `file_postupdate_standard_filemanager()`. Do not manually move files into `moodledata`.

## 30.22 File area and itemid

The file area is `evidence` and `itemid` is the submission ID.

```
contextid = module context
component = mod_checkpoint
filearea = evidence
itemid = checkpoint_submission.id
```

This choice makes backup, restore, `pluginfile()`, and deletion much more predictable.

## 30.23 `pluginfile()`

Serving the file requires authentication and authorisation.

```php
/**
 * Serves protected files stored in the activity file area.
 *
 * @param stdClass $course Course record.
 * @param stdClass $cm Course module record.
 * @param context $context Context associated with the file.
 * @param string $filearea Requested file area name.
 * @param array $args Remaining file URL arguments.
 * @param bool $forcedownload Whether the browser should download the file.
 * @param array $options Additional serving options.
 * @return bool Returns false when the file cannot be served.
 */
function checkpoint_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    // Ensures file access occurs inside an authenticated course session.
    require_login($course, true, $cm);

    // Rejects any context or file area that does not belong to module evidence.
    if ($context->contextlevel !== CONTEXT_MODULE || $filearea !== 'evidence') {
        return false;
    }

    // Validates itemid and confirms the user owns the submission or has grading capability.
    // Locates the authorised stored_file and ends the response with send_stored_file().
}
```

Never treat knowledge of the URL as permission to access a file.

## 30.24 Who can view the evidence

The learner can view their own evidence. A user with `mod/checkpoint:grade` in the module context can view evidence they need to assess.

This rule needs to be tested explicitly because `pluginfile()` is one of the places where IDOR easily appears when code validates only that a file exists.

## 30.25 Learner page

`view.php` should resolve context, permissions, and data, but it should not build a wall of HTML.

The page can prepare an output object:

```php
// Builds the output object with domain data already prepared for presentation.
$status = new \mod_checkpoint\output\student_status(
    checkpoint: $checkpoint,
    submission: $submission,
    canedit: $canedit,
);

// Delegates rendering to Moodle's renderer instead of producing HTML manually.
echo $OUTPUT->render($status);
```

Presentation remains in the template.

## 30.26 Output class

The output class transforms domain state into simple data for Mustache.

```php
namespace mod_checkpoint\output;

/**
 * Prepares learner state for rendering by the Mustache template.
 */
final class student_status implements \renderable, \templatable {
    /**
     * Creates the output object with data required by the interface.
     *
     * @param \stdClass $checkpoint Activity record.
     * @param \stdClass|null $submission Current learner submission, when present.
     * @param bool $canedit Whether the submission can still be edited.
     */
    public function __construct(
        private readonly \stdClass $checkpoint,
        private readonly ?\stdClass $submission,
        private readonly bool $canedit,
    ) {
    }

    /**
     * Exports simple data for the Mustache template.
     *
     * @param \renderer_base $output Active Moodle renderer.
     * @return array Normalised template data.
     */
    public function export_for_template(\renderer_base $output): array {
        // Formats values before exposing them to the template.
        return [
            'name' => format_string($this->checkpoint->name),
            'has_submission' => $this->submission !== null,
            'can_edit' => $this->canedit,
        ];
    }
}
```

## 30.27 Mustache

The template should not discover business rules. It only presents the state it receives.

```mustache
<div class="mod-checkpoint-status">
    <h3>{{name}}</h3>

    {{#has_submission}}
        <div class="alert alert-info">{{#str}}submitted, mod_checkpoint{{/str}}</div>
    {{/has_submission}}

    {{#can_edit}}
        <a class="btn btn-primary" href="{{editurl}}">{{#str}}editsubmission, mod_checkpoint{{/str}}</a>
    {{/can_edit}}
</div>
```

## 30.28 Teacher screen

The teacher needs to see the queue, not every detail of every learner at once. A paginated table with name, state, submission date, lateness, and a grading action is enough for the first version.

This screen should query only relevant users and only necessary columns. Do not load every file from every submission merely to build a status listing.

### 30.28.1 Moodle 5.0 Activity Overview

`mod_checkpoint` does not need to maintain its own `index.php` page listing every instance. Because the final project targets Moodle 5.0, it participates in the Activities page through `classes/courseformat/overview.php` and lets `index.php` redirect to the consolidated course view.

```php
namespace mod_checkpoint\courseformat;

use core_courseformat\activityoverviewbase;
use core_courseformat\local\overview\overviewitem;
use core_calendar\output\humandate;

/**
 * Integrates Checkpoint with the course activity overview.
 */
final class overview extends activityoverviewbase {
    /**
     * Creates the integration with access to Moodle's database and clock.
     *
     * @param \cm_info $cm Course module information.
     * @param \moodle_database $db Database access layer.
     * @param \core\clock $clock Clock used by time-based rules.
     */
    public function __construct(
        \cm_info $cm,
        private readonly \moodle_database $db,
        private readonly \core\clock $clock,
    ) {
        // Initialises the common Activity Overview integration contract.
        parent::__construct($cm);
    }

    /**
     * Returns the formatted due date for the activity overview.
     *
     * @return overviewitem|null Overview item containing the due date.
     */
    #[\Override]
    public function get_due_date_overview(): ?overviewitem {
        // Fetches only the fields required to build the due-date item.
        $checkpoint = $this->db->get_record(
            'checkpoint',
            ['id' => $this->cm->instance],
            'id, duedate',
            MUST_EXIST,
        );

        // Converts the timestamp into Moodle's UI representation.
        return new overviewitem(
            name: get_string('duedate'),
            value: $checkpoint->duedate ?: null,
            content: $checkpoint->duedate
                ? humandate::create_from_timestamp($checkpoint->duedate)
                : '-',
        );
    }
}
```

The complete version can add `get_extra_overview_items()` to display submission state and `get_actions_overview()` to take the learner to submission or the teacher to the grading queue. The class already receives the database and clock through DI, so it does not need to return to globals merely because it is loaded by the course format.

### 30.28.2 `index.php` becomes navigation compatibility

```php
// Loads Moodle bootstrap before accessing parameters or platform APIs.
require_once(__DIR__ . '/../../config.php');

// Reads and validates the course ID received by the request.
$courseid = required_param('id', PARAM_INT);

// Redirects to the standard overview page filtered to Checkpoint activities.
\core_courseformat\activityoverviewbase::redirect_to_overview_page(
    $courseid,
    'checkpoint',
);
```

This closes an important gap between "an activity that opens" and "an activity integrated with Moodle 5.0". The first has `view.php` and `mod_form`; the second also participates in the course flows users already rely on to see deadlines, completion, grades, and actions from other activities.

## 30.29 AJAX only where it improves the experience

The dashboard can update pending, graded, and late counters without reloading the whole page. That is a reasonable use of AJAX.

Do not turn version 1 into an SPA merely because the course introduced modern JavaScript.

## 30.30 ESM for the dashboard

A simple module can request updated counters and replace only the numbers.

```
import Ajax from 'core/ajax';

export const init = (cmid) => {
    const refresh = async() => {
        const [data] = await Ajax.call([{
            methodname: 'mod_checkpoint_get_status',
            args: {cmid},
        }]);

        document.querySelector('[data-checkpoint-pending]').textContent = data.pending;
    };

    refresh();
};
```

JavaScript does not decide whether the user is allowed to see the information. The External Function continues to validate context and capability.

## 30.31 External Function for status

The external function should declare parameters, validate context, and return a small structure.

```php
/**
 * Returns Checkpoint state totals for authorised external consumers.
 *
 * @param int $cmid Course module ID.
 * @return array Counters grouped by state.
 */
public static function execute(int $cmid): array {
    global $DB;

    // Resolves the course module and its context from the received identifier.
    $cm = get_coursemodule_from_id('checkpoint', $cmid, 0, false, MUST_EXIST);
    $context = context_module::instance($cm->id);

    // Validates External Function context and requires grading permission.
    self::validate_context($context);
    require_capability('mod/checkpoint:grade', $context);

    // Returns only the data allowed by the external contract.
    return self::count_states($cm->instance);
}
```

## 30.32 Web Service for external integration

The same component can expose a function returning the status of the current user's own submission to a mobile app or another authorised client.

Do not automatically reuse the teacher-dashboard function because scope and authorisation are different. A good API starts from the use case and the principle of least privilege.

## 30.33 Events

Two Events represent relevant facts:

```
mod_checkpoint\event\submission_created
mod_checkpoint\event\submission_graded
```

The Event is triggered after the primary change has happened. It should not be used as an obscure replacement for calling the next function in the flow.

## 30.34 Submission Event

After saving the submission:

```php
// Creates the event with context, affected submission, and related user.
$event = \mod_checkpoint\event\submission_created::create([
    'context' => $context,
    'objectid' => $submission->id,
    'relateduserid' => $userid,
    'other' => [
        'checkpointid' => $checkpoint->id,
    ],
]);

// Triggers the event only after every required contract value has been filled.
$event->trigger();
```

`objectid` represents the event's primary entity, while `relateduserid` identifies the related user without inventing parallel fields.

## 30.35 Do Hooks belong here?

For this first version, there is no real need for a custom Hook. The plugin has Events for completed facts and internal classes for its main flow.

Adding `before_submission_save` only to tick a box saying "we use Hooks" would enlarge the public API without a real consumer. The correct decision here is not to create a custom Hook in version 1.0.

If third parties later need to change validation before submission, the contract can then be designed deliberately.

## 30.36 Adhoc Task for grading notification

Sending a notification after grading does not need to hold the teacher's request open. An Adhoc Task receives only stable identifiers.

```php
// Creates the Adhoc Task responsible for sending the notification outside the main request.
$task = new \mod_checkpoint\task\send_grade_notification();

// Passes only identifiers sufficient for the task to reconstruct the required context.
$task->set_custom_data([
    'submissionid' => $submission->id,
]);

// Queues the task for asynchronous execution by cron.
\core\task\manager::queue_adhoc_task($task);
```

Do not serialise entire objects into custom data.

## 30.37 Task idempotency

The task may run more than once after a retry. The plugin needs to prevent duplicate notifications, for example with a `notificationtime` timestamp or outbox table when this guarantee matters to the product.

"The task normally runs once" is not a consistency policy.

## 30.38 Is a Scheduled Task necessary?

For the first version, a Scheduled Task could check overdue submissions and update an indicator cache, but that only makes sense if there is processing independent of an immediate user action.

If lateness can be calculated with `duedate < time()` without persisting anything, a task merely to change `submitted` into `late` would duplicate state. In this project we prefer to derive lateness and avoid that task.

## 30.39 Cache

The teacher dashboard can use a small cache for per-activity counters, especially in large classes.

```php
// Gets the cache definition declared by the plugin.
$cache = cache::make('mod_checkpoint', 'summary');

// Uses a stable key per activity to avoid collisions between checkpoints.
$key = 'checkpoint:' . $checkpointid;

// Attempts to reuse the computed summary before querying or recalculating data.
$summary = $cache->get($key);
```

Cache is an optimisation. The submissions table remains the source of truth.

## 30.40 Cache invalidation

Whenever a submission is submitted, graded, reopened, or deleted, invalidate that activity's summary.

An incorrect cache is worse than a slightly slower query because it presents false information with the appearance of truth.

## 30.41 `db/caches.php`

The definition can be simple:

```php
// Declares caches owned by the component in db/caches.php.
$definitions = [
    'summary' => [
        // Uses application cache because the summary does not belong to one specific session.
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Do not choose a TTL as a substitute for invalidation that your own code can perform deterministically.

## 30.42 Gradebook

The activity has a grade item. `checkpoint_grade_item_update()` creates or updates it using `grade_update()`.

```php
// Defines the grade-item configuration that will be published to Gradebook.
$params = [
    'itemname' => $checkpoint->name,
    'gradetype' => GRADE_TYPE_VALUE,
    'grademin' => 0,
    'grademax' => $checkpoint->grade,
];

// Creates or updates the grade item associated with the activity instance.
grade_update(
    'mod/checkpoint',
    $checkpoint->course,
    'mod',
    'checkpoint',
    $checkpoint->id,
    0,
    null,
    $params
);
```

## 30.43 Updating the user's grade

When grading:

```php
// Converts the internal assessment into the format expected by the Gradebook API.
$grade = [
    'userid' => $submission->userid,
    'rawgrade' => $submission->grade,
];

// Publishes the learner's grade to the item corresponding to the activity.
checkpoint_grade_item_update($checkpoint, $grade);
```

The grade must not be written directly to `grade_grades`.

## 30.44 Gradebook is not the assessment table

`checkpoint_submission.grade` stores the activity's domain grade, while Gradebook receives the official projection used by the course.

This allows Gradebook to be reconstructed by `checkpoint_update_grades()` when necessary without losing the origin of the assessment.

## 30.45 Completion

The activity can offer two custom rules:

```
completionsubmit
completiongrade
```

The first checks whether a submission has been made. The second checks whether the submission has been graded according to the defined rule.

## 30.46 `custom_completion`

```php
namespace mod_checkpoint\completion;

/**
 * Implements the activity's custom completion rules.
 */
final class custom_completion extends \core_completion\activity_custom_completion {
    /**
     * Lists custom completion rules provided by the plugin.
     *
     * @return array Completion rule names.
     */
    public static function get_defined_custom_rules(): array {
        // Keeps names aligned with fields configured in the activity form.
        return [
            'completionsubmit',
            'completiongrade',
        ];
    }

    /**
     * Calculates the state of one specific custom rule.
     *
     * @param string $rule Requested rule name.
     * @return int Completion state recognised by the Completion API.
     */
    public function get_state(string $rule): int {
        // Rejects unknown names before querying activity state.
        $this->validate_rule($rule);

        // Routes each rule to its corresponding specialised calculation.
        return match ($rule) {
            'completionsubmit' => $this->get_submit_state(),
            'completiongrade' => $this->get_grade_state(),
        };
    }
}
```

## 30.47 Completion should not duplicate Gradebook

If the rule is "complete when graded", use the existing assessment information and the Completion APIs. Do not create another `checkpoint_completion` table merely to repeat the same fact.

The more duplicated states exist, the harder it becomes to explain why a learner appears graded on one screen and incomplete on another.

## 30.48 Privacy API

The plugin stores submission text, files, grades, feedback, timestamps, and user IDs. It is therefore clearly a personal-data provider.

There is no justification for `null_provider`.

## 30.49 Metadata

The provider should declare the submissions table and relevant file areas.

```php
// Declares which personal data is stored in the submissions table.
$items->add_database_table(
    'checkpoint_submission',
    [
        'userid' => 'privacy:metadata:submission:userid',
        'submissiontext' => 'privacy:metadata:submission:text',
        'grade' => 'privacy:metadata:submission:grade',
        'feedback' => 'privacy:metadata:submission:feedback',
        'graderid' => 'privacy:metadata:submission:graderid',
    ],
    'privacy:metadata:submission'
);
```

## 30.50 Export

Export needs to present data in module context and include evidence files belonging to the user.

Do not export only raw IDs when a more useful and safe representation exists for the person receiving the package.

## 30.51 Deletion

When deleting user data, the decision depends on product policy. If the submission may be removed, also delete its file-area files and invalidate Gradebook/Completion where necessary.

If some information must be preserved because of an institutional obligation, that needs to be handled through policy and data design, not by simply ignoring the Privacy API request.

## 30.52 Backup

The activity backup needs to include configuration and, when `userinfo` is enabled, user submissions.

```php
// Defines the root element representing the activity instance in backup.
$checkpoint = new backup_nested_element('checkpoint', ['id'], [
    'name', 'intro', 'introformat', 'duedate', 'grade',
    'allowtext', 'allowfile', 'completionsubmit', 'completiongrade'
]);

// Creates the container and repeating element for submissions linked to the activity.
$submissions = new backup_nested_element('submissions');
$submission = new backup_nested_element('submission', ['id'], [
    'userid', 'status', 'submissiontext', 'submissionformat',
    'grade', 'feedback', 'feedbackformat', 'graderid',
    'timecreated', 'timemodified', 'timegraded'
]);
```

## 30.53 Annotating IDs

Learners and graders need to be annotated.

```php
// Marks the submission author so the Backup API can remap the user during restore.
$submission->annotate_ids('user', 'userid');

// Also marks the grader because that ID may change on the destination installation.
$submission->annotate_ids('user', 'graderid');
```

During restore these IDs cannot be reused directly.

## 30.54 Annotating files

```php
// Includes files used by the activity intro field.
$checkpoint->annotate_files('mod_checkpoint', 'intro', null);

// Includes evidence files using the submission ID as itemid.
$submission->annotate_files('mod_checkpoint', 'evidence', 'id');
```

The evidence `itemid` is the old submission ID in backup and needs to be mapped to the new ID during restore.

## 30.55 Restore

In `process_checkpoint()`, create the new instance and call `apply_activity_instance()`. In `process_submission()`, map `userid` and `graderid`, insert the new row, and register the submission mapping.

Then in `after_execute()`, restore files using that mapping.

## 30.56 Backup must be tested on another installation

Restoring into the same database can hide accidental dependencies on IDs. The real test is to produce an `.mbz`, move it to another installation, and verify that course, activity, submission, files, mapped users, and grades behave correctly.

That test is part of final-project acceptance.

## 30.57 Would a subplugin make sense here?

Not for this version. The activity has one submission model and one grading flow.

Creating `checkpointsubmission_text`, `checkpointsubmission_file`, and `checkpointfeedback_comments` merely to imitate Assignment would add complexity without a real need. If the product evolves into dozens of independently installable evidence types, then a subplugin type may become justified.

Knowing when not to create a subplugin is part of understanding subplugins.

## 30.58 Required cross-cutting APIs

Besides the main APIs, the project uses DML, Access, Context, Forms, Output, Strings, URLs, Files, Gradebook, Completion, Events, Tasks, Cache, External Functions, Privacy, Backup, and Testing.

There is no benefit in listing each one in the README as a badge of complexity. Documentation should explain where each responsibility lives.

## 30.59 Security from the main flow

Every endpoint begins with context and authorisation. Every ID received from the user is treated as untrusted. Every text output passes through the appropriate function, every mutable form action validates `sesskey` where the mechanism does not do so automatically, and files go through `pluginfile()` with real authorisation.

Security is not added at the end as a cosmetic audit.

## 30.60 IDOR in the final project

One mandatory test is attempting to open another learner's evidence by changing only the `itemid` or submission parameter.

The endpoint must deny access even when both IDs exist. This test directly connects the final project with Chapter 28.

## 30.61 CSRF

Actions such as reopening a submission and deleting an assessment must not be GET links that alter state.

Use a form or validate `require_sesskey()` in appropriate action endpoints.

## 30.62 SQL Injection

No query receives SQL built from a raw parameter.

```php
// Filters by activity and state using structured parameters without SQL concatenation.
$DB->get_records('checkpoint_submission', [
    'checkpointid' => $checkpointid,
    'status' => submission_status::SUBMITTED,
]);
```

When custom SQL is necessary, use placeholders.

## 30.63 XSS

Submission text can contain rich content if the product permits an editor. That does not mean printing the raw value.

Use the stored format, Files API, and appropriate rendering functions. Activity names go through `format_string()`.

## 30.64 Teacher-listing performance

The table does not need to query one user at a time inside a loop. Use one query containing the required fields or load users in bulk.

N+1 in a class of 30 learners may look invisible and become a problem in a class of 30,000.

## 30.65 Pagination

The teacher queue must be paginated. Never use `get_records()` with no limit merely because the development environment has only a few learners.

The screen should filter by state and, when necessary, by name using queries that remain index-friendly.

## 30.66 Locks

If the same learner sends two nearly simultaneous requests, the unique constraint already prevents two rows, but the file-and-state update flow may still require a lock if compound operations are vulnerable to races.

Do not use locks by default everywhere, but know how to identify transitions that need serialisation.

## 30.67 Logging and observability

Events record relevant domain facts. Operational failures in tasks or integrations should be logged usefully for administrators without exposing tokens, passwords, or sensitive content.

A message such as "error sending" with no submission ID, activity ID, or useful exception context does not help operate the system.

## 30.68 PHPUnit for the submission rule

A first test creates a course, learner, activity, and submits evidence through the service class.

```php
/**
 * Tests the service layer responsible for Checkpoint submissions.
 */
final class manager_test extends \advanced_testcase {
    /**
     * Confirms that an enrolled learner can register a submission.
     *
     * @return void
     */
    public function test_student_can_submit(): void {
        // Isolates database changes made during this test.
        $this->resetAfterTest();

        // Creates the course, enrolled learner, and a real activity instance.
        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $checkpoint = $this->getDataGenerator()
            ->get_plugin_generator('mod_checkpoint')
            ->create_instance(['course' => $course->id]);

        // Executes the action authenticated as the learner making the submission.
        $this->setUser($student);

        // Gets the service from the same container used by production code.
        $manager = \core\di::get(\mod_checkpoint\local\manager::class);
        $id = $manager->submit(
            $checkpoint->id,
            $student->id,
            ['submissiontext' => 'My evidence']
        );

        // Confirms that the service layer returned a valid persisted identifier.
        $this->assertGreaterThan(0, $id);
    }
}
```

## 30.69 Plugin generator

The generator avoids repeating instance setup across every test.

```php
/**
 * Test generator for creating Checkpoint module instances.
 */
class mod_checkpoint_generator extends testing_module_generator {
    /**
     * Creates an instance with defaults suitable for tests.
     *
     * @param stdClass|array|null $record Data overriding defaults.
     * @param array|null $options Additional generator options.
     * @return stdClass Activity record created.
     */
    public function create_instance($record = null, array $options = null) {
        // Normalises the record to compose it easily with default values.
        $record = (array)$record;

        // Defines only useful defaults that reduce repetition in test setup.
        $record += [
            'name' => 'Test checkpoint',
            'grade' => 100,
            'allowtext' => 1,
            'allowfile' => 1,
        ];

        // Delegates actual activity creation to Moodle's standard module generator.
        return parent::create_instance($record, $options);
    }
}
```

## 30.70 Negative capability test

The most important test is often the one that must fail.

Create a user without `mod/checkpoint:grade`, attempt to grade a submission, and confirm the capability exception. Then temporarily remove `require_capability()` and watch the test fail.

## 30.71 Testing Events

Use the event sink, execute the action, and confirm type, objectid, relateduserid, and context.

Do not test merely that "some event" was triggered.

## 30.72 Testing Gradebook

After grading, query the grades API and confirm the published value. Also test grade updates and reconstruction through `checkpoint_update_grades()`.

This detects regressions where the internal table changes but Gradebook stops following.

## 30.73 Testing Completion

Create scenarios with and without submissions and with grading present or absent. Test each custom rule independently.

Completion needs to answer real state, not the order in which tests happened to execute.

## 30.74 Testing Privacy

The provider needs tests for metadata, user contexts, export, and delete.

After deletion, verify both database and files. Do not accept a test that merely calls the method and checks that no exception was thrown.

## 30.75 Testing the task

Execute the Adhoc Task directly with known custom data and use a message sink to confirm the notification.

Run the task again and verify the idempotent behaviour defined by the product.

## 30.76 Behat for the teacher flow

One scenario should create a course, teacher, learner, and activity, log in as the teacher, and confirm that the queue displays the pending submission.

The teacher then opens grading, enters a grade and feedback, and saves.

## 30.77 Behat for the learner flow

The learner opens the activity, submits evidence, receives the submission state, and later sees the grade and feedback after assessment.

This scenario does not replace PHPUnit, but confirms integration between UI, permissions, form, and navigation.

## 30.78 Negative Behat scenario

It is also worth confirming that a learner does not see the grading button and cannot navigate to the administrative screen through a route exposed in the interface.

Real authorisation remains covered by PHPUnit, but the UI should not offer impossible actions to the wrong role.

## 30.79 Coding Style

Before release, run Code Checker or the set of checks adopted by the project. Do not postpone Coding Style into a massive cleanup after months of development.

CI should prevent a new style regression from entering the main branch.

## 30.80 Plugin Validate

Plugin Validate helps find structural, metadata, and expected-practice problems in the Moodle ecosystem.

Passing it does not mean the plugin is correct, secure, or fast. It is one validation layer, not product certification.

It is also important not to treat every validator message as a mandatory Moodle rule. A concrete example is the recommendation to place internal component classes under `classes/local/`. That directory is **not mandatory**. Moodle's official Coding Style documentation states that only the first namespace level is mandatory, while `\local` may be used as a second-level namespace when the maintainer wants to organise classes into additional namespaces; the same documentation explicitly notes that, for most components, keeping classes directly in the component's root namespace is sufficient.

Therefore, a plugin-specific class may perfectly well live in `classes/manager.php` with namespace `mod_checkpoint`, without being moved artificially to `classes/local/manager.php` merely to satisfy an automated recommendation. If the validator reports the absence of `classes/local/` as a problem even though the structure is valid, this is a rule that **does not need to be followed**. Do not change a correct architecture just to make a warning disappear when that warning does not correspond to an actual Moodle requirement.

This mismatch has already appeared in the official plugin review process, as documented in CONTRIB-9824:

https://moodle.atlassian.net/browse/CONTRIB-9824

The normative reference for deciding the class structure remains Moodle Coding Style, especially its namespace rules, rather than an isolated interpretation made by a validation tool:

https://moodledev.io/general/development/policies/codingstyle

## 30.81 PHPDoc

Document public APIs, extension classes, methods whose contracts are not obvious, and relevant structures.

Do not use PHPDoc merely to repeat the method name in slightly different English. Documentation needs to add context.

## 30.82 CI

The pipeline needs to run at least lint, Coding Style, Plugin Validate, PHPUnit, and essential Behat scenarios across the supported combinations defined by the project.

Do not create a matrix impossible to maintain. Choose combinations that cover the edges of the support range and one primary combination used during daily development.

## 30.83 Clean installation in CI

One job needs to install the plugin from scratch. This finds errors in `install.xml`, missing dependencies, missing strings, classes that existed only in the developer's environment, and files not committed to the repository.

The fact that upgrade works does not prove a clean installation.

## 30.84 Upgrade in CI

Another job can install a fixture from the previous version, load expected data, and then run the upgrade to the current branch.

The important part is testing the real path from old version to new version, not merely calling an empty `upgrade.php`.

## 30.85 JavaScript build

If `amd/src/dashboard.js` exists, the release needs to contain the artefacts required by the production environment according to Moodle and project policy.

Do not depend on the administrator running Grunt after installing a Marketplace ZIP.

## 30.86 Final ZIP

The ZIP must contain the correct directory at its root.

```
checkpoint/
    version.php
    lib.php
    mod_form.php
    classes/
    db/
    lang/
    templates/
    amd/
    backup/
    tests/
```

Do not include `.git`, IDE directories, temporary files, dumps, test screenshots, or unnecessary development dependencies.

## 30.87 Test the ZIP, not only the checkout

One of the final validations is to create the ZIP exactly as it will be distributed, install that ZIP in a clean environment, and run a smoke test.

This catches the most irritating kind of release error: the repository works but the published package forgot an essential file.

## 30.88 Security review

Perform a specific pass while thinking like an attacker.

List endpoints, ID parameters, files, External Functions, mutable actions, user outputs, callbacks, Tasks, and every external integration. For each one, ask who can call it, from which context, with which data, and what happens if the request is repeated or tampered with.

## 30.89 Performance review

Enable development debugging and observe queries on the main pages. Test a small class and an artificially larger volume.

Look for N+1, loops calling expensive APIs, unnecessary caches, queries without indexes, unnecessary file loading, and tasks that scan the entire installation on every execution.

## 30.90 Code review

A good code review does not ask only whether the code works. It asks whether responsibility is in the right place, whether the contract is clear, whether authorisation is explicit, whether state is duplicated, and whether the change will still be understandable two years from now.

For the final project, review the code as if the author were somebody else.

## 30.91 Clean-installation checklist

On an empty installation:

```
install the ZIP
run site upgrade
create course
create checkpoint
enrol teacher and learner
learner submits evidence
teacher grades
confirm Gradebook
confirm Completion
confirm file
confirm notification
```

If the flow depends on hidden configuration that exists only in the development environment, this test will reveal it.

## 30.92 Upgrade checklist

Start with the real previous plugin version, create representative data, and then install the new version.

Verify schema, old data, configuration, Gradebook, Completion, files, Tasks, and main pages. An upgrade that completes without an exception may still have lost information.

## 30.93 Backup and restore checklist

Create a course containing the activity, two submissions, one file, and one assessment. Generate a backup with user data and restore it on another installation.

Confirm the new instance, user mappings, files, grades, completion, and absence of references to the old course module.

## 30.94 Technical documentation

The project should end with short but sufficient maintenance documentation.

It needs to explain the goal, supported Moodle versions, requirements, main structure, tables, capabilities, Tasks, file areas, External Functions, build process, tests, backup/restore, and release procedure.

## 30.95 README does not replace code documentation

README explains the product and installation/maintenance process. PHPDoc explains contracts in code. Comments explain local decisions that are not obvious.

Putting everything into one enormous README does not improve maintainability.

## 30.96 Changelog

Record changes that matter to people installing and upgrading the plugin.

```
1.0.0
- First stable release
- Text and file submission
- Grading with grade and feedback
- Gradebook and Completion
- Privacy API
- Backup and restore
- PHPUnit and Behat
```

## 30.97 Definition of done

The project is not finished when the screen "seems to work". It is finished when the distributable package reproduces the flow in a clean environment, passes automated tests, has a tested upgrade, restores on another installation, and contains no known security issue that invalidates its intended use.

This definition takes more work, but it is also the difference between demonstration code and a professional plugin.

## 30.98 What did not enter the first version

We did not create subplugins, a custom Hook, a lateness Scheduled Task, custom analytics, a BI report, or ERP integration. That was a decision, not an omission.

Each of these pieces can appear when the product has a concrete use case. The final project does not need to prove maturity through the number of directories.

## 30.99 Evolving without destroying the architecture

When the next requirement arrives, first ask which responsibility it belongs to. A second evidence type may continue to be one more field, or may justify a subplugin if it becomes an ecosystem. An external integration may be an External Function, an observer, a task, or an independent connector depending on the flow direction.

Good architecture does not predict every future feature, but it makes clear where to make decisions when they appear.

## 30.100 Final exercise

Implement the complete `mod_checkpoint` and deliver an installable ZIP. Producing isolated files is not enough, and the exercise is not complete merely because the activity opened once.

Start from this chapter's functional specification and adapt only what is necessary for your scenario. Implement the database, upgrade path, settings, capabilities, contexts, `mod_form`, submission form, Files API, Output, Mustache, ESM, AJAX, Gradebook, Completion, Events, Adhoc Task, Cache, External Functions, Privacy, and Backup/Restore. Route the main rule through services with Dependency Injection, use `\core\clock` in deadline decisions, and implement Moodle 5.0 Activity Overview integration in `classes/courseformat/overview.php`. Hooks and subplugins should remain outside until a use case justifies their existence.

Create PHPUnit tests for submission rules, authorisation, Gradebook, Completion, Events, Privacy, and the task. Create Behat for the complete teacher-learner flow. Run Coding Style, Plugin Validate, and the CI pipeline. Perform an offensive review looking for IDOR, CSRF, XSS, SQL Injection, unauthorised file access, and capability failures. Perform a performance review with artificially larger volume than you used during development.

Then generate the final ZIP and perform three independent proofs. The first is installing it on a clean Moodle installation. The second is upgrading an installation containing the previous version and realistic test data. The third is generating a course backup, moving the `.mbz` to another installation, and restoring it. Document every difference you find and fix the plugin before creating the final release.

The goal is not to finish with the largest plugin in the book. The goal is to finish with a plugin you understand end to end, from the first requirement to the last test, and that another person can install, audit, maintain, and upgrade without depending on your memory of how it was supposed to work.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Dependency Injection, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/di
* MOODLE. Moodle Developer Resources. Course overview integration, Moodle 5.0. https://moodledev.io/docs/5.0/apis/plugintypes/mod/courseoverview
* MOODLE. Moodle 5.0 developer update. Bootstrap 5, Activity overview and PHPUnit 11.4. https://moodledev.io/docs/5.0/devupdate
* MOODLE. Moodle Developer Resources. Activity modules. Available at: https://moodledev.io/docs/5.0/apis/plugintypes/mod. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Access API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/access. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Forms API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/form. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Files API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/files. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Output API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/output. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Gradebook API. Available at: https://moodledev.io/docs/5.0/apis/core/grade. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Activity completion API. Available at: https://moodledev.io/docs/5.0/apis/core/activitycompletion. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Privacy API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/privacy. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Backup API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/backup. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit. Available at: https://moodledev.io/general/development/tools/phpunit. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Behat. Available at: https://moodledev.io/general/development/tools/behat. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Coding style. Available at: https://moodledev.io/general/development/policies/codingstyle. Accessed: 24 Sep. 2026.

{% endraw %}
