{% raw %}

# 21 GRADEBOOK AND COMPLETION

Grades and completion appear together in almost every assessed Moodle activity, but they are different subsystems and need to remain different in code. The Gradebook answers what grade a user has, which value range is valid, which scale is being used, whether the grade was manually overridden, and how it participates in course calculations, while Completion answers whether an activity is complete and which rules produced that state. An activity may have a grade without using completion, completion without a grade, or combine both, for example by requiring the learner to receive a grade in order to complete.

This separation prevents a very common mistake in custom plugins: creating one `completed` column and one `grade` column in the module table and beginning to behave as if Moodle had no Gradebook or Completion API. At first it looks practical because every rule stays inside the plugin, but the teacher does not see the grade correctly in the gradebook, completion does not appear on the course page, the Availability API cannot use the state, backup and restore become inconsistent, and any change made in Gradebook creates a parallel truth inside the plugin.

In this chapter we will continue using the `mod_checkpoint` created in Chapter 17. It will now receive full Gradebook integration and two custom completion rules, one requiring the learner to submit a response and another requiring that response to receive teacher feedback. This lets us follow the entire lifecycle, from grade-item creation to updating completion when a response is submitted, edited, assessed, or loses a condition that had previously been satisfied.

## 21.1 The Gradebook is not your plugin's grade table

A module may have its own tables for attempts, responses, evaluations, or internal scores, but the Gradebook is the official course-grade layer. This means the plugin may store the data required to calculate a grade, but the grade that should appear in the gradebook needs to be sent through the Gradebook API.

In our `mod_checkpoint`, table `checkpoint_answers` may store the teacher's evaluation because that record also belongs to the activity domain, but once the grade is defined it needs to be published to Gradebook. There is nothing wrong with persisting the source of the grade in the plugin; the mistake is assuming Moodle will discover that column by itself.

## 21.2 Gradebook architecture

The Gradebook architecture separates what is being graded from the individual grades users receive. In simplified terms, `{grade_items}` represents columns in the gradebook and `{grade_grades}` represents users' grades for each of those columns.

An activity normally creates one grade item. If `mod_checkpoint` is 100 points, the Gradebook may have an item called "Unit 3 Checkpoint" and every learner receives a record associated with that item when they are graded.

This separation lets item-level configuration such as maximum, minimum, scale, and category be handled once, while individual grades remain associated per user.

## 21.3 `grade_items`

The `{grade_items}` table contains the grade-item definition. Relevant fields include course, item name, type, module, instance, item number, grade type, minimum, maximum, scale, category, calculation, visibility, and several other properties used by Gradebook.

For a normal Activity Module, the conceptually important fields are:

```
itemtype     = mod
itemmodule   = checkpoint
iteminstance = checkpoint.id
itemnumber   = 0
```

`itemnumber` allows an activity to have more than one grade item, although most simple modules use only zero. If the plugin has one main grade and another independent grade, it can work with multiple items, but this increases the update contract considerably and should represent a real requirement.

## 21.4 `grade_grades`

The `{grade_grades}` table stores one row per user and grade item. It contains values such as `rawgrade`, `finalgrade`, override flags, locking, hidden state, and other information processed by Gradebook.

Do not use this table as though it were an ordinary plugin table. The existence of `rawgrade` and `finalgrade` often tempts developers into writing `update_record()`, but that ignores regrading, overrides, history, and calculations.

If the grade belongs to the activity, the activity reports its value through the API and lets Gradebook decide how that becomes the final state.

## 21.5 `rawgrade` and `finalgrade`

`rawgrade` represents the raw value supplied by the grade source, while `finalgrade` is the final value after Gradebook applies transformations, calculations, and other course mechanisms.

An activity should not write `finalgrade` directly. It sends the raw value corresponding to what it calculated and Gradebook takes care of the rest.

This difference becomes especially important when the teacher uses factors, offsets, calculations, categories, or other Gradebook configuration. The plugin should not attempt to reproduce those calculations outside the gradebook.

## 21.6 Manual override

A teacher may manually override a grade in Gradebook. When that happens, the activity should not simply overwrite the value every time it calls `grade_update()` as though the gradebook interface did not exist.

Gradebook knows the override state and preserves expected behavior. This is another reason to use the API rather than write directly to tables.

If the plugin needs to tell the teacher a grade has been overridden, inspect that state through the appropriate API or grade objects, but do not silently clear an override just because the activity recalculated a score.

## 21.7 Grade categories

Grade items may belong to Gradebook categories. Categories group assessments and participate in course aggregation, weighting, and calculations.

The plugin normally should not create its own category merely because it wants to "organize" the column. The teacher or course configuration can move the item to the desired category.

If an institutional solution genuinely needs to create categories automatically, do so consciously using the Gradebook API and understand the effect on calculations, weights, and teacher configuration. A simple module normally only creates its own item.

## 21.8 `FEATURE_GRADE_HAS_GRADE`

To tell Moodle that the activity can provide grades, `supports()` should declare:

```
case FEATURE_GRADE_HAS_GRADE:
    return true;
```

Or in a modern `match`:

```
FEATURE_GRADE_HAS_GRADE => true,
```

This feature has consequences beyond Gradebook. It also allows Moodle to offer completion based on receiving a grade when Completion is enabled.

Do not declare the feature if the activity never produces a grade. The existence of a `grade` field in a table is not enough justification if that field means something else.

## 21.9 The activity's `grade` field

Many modules use a field called `grade` to define how the activity is graded. Historically there is a widespread convention where positive values represent the maximum numeric grade, negative values represent scales, and zero represents the absence of a numeric grade.

This appears in several core modules and remains useful when the form uses standard grade elements.

In `mod_checkpoint` we can use:

```
grade = 100   nota de 0 a 100
grade = 20    nota de 0 a 20
grade = -5    escala cujo id é 5
grade = 0     sem nota
```

The implementation needs to interpret this value consistently in `grade_item_update()`.

## 21.10 `grade_update()`

The central function for an activity to publish grades is `grade_update()`. It can create or update the grade item and also send user grades.

The signature works with source, course, type, module, instance, item number, grades, and item details. A reduced example is:

```php
grade_update(
    'mod/checkpoint',
    $checkpoint->course,
    'mod',
    'checkpoint',
    $checkpoint->id,
    0,
    $grades,
    $itemdetails
);
```

The first argument identifies the source of the change, while `itemtype`, `itemmodule`, `iteminstance`, and `itemnumber` identify the grade item.

## 21.11 Creating the grade item

The activity normally creates or updates its grade item whenever the instance is created or edited.

```php
function checkpoint_grade_item_update($checkpoint, $grades = null): int {
    global $CFG;

    require_once($CFG->libdir . '/gradelib.php');

    $itemdetails = [
        'itemname' => $checkpoint->name,
    ];

    if (!empty($checkpoint->cmidnumber)) {
        $itemdetails['idnumber'] = $checkpoint->cmidnumber;
    }

    if ($checkpoint->grade > 0) {
        $itemdetails['gradetype'] = GRADE_TYPE_VALUE;
        $itemdetails['grademax'] = $checkpoint->grade;
        $itemdetails['grademin'] = 0;
    } else if ($checkpoint->grade < 0) {
        $itemdetails['gradetype'] = GRADE_TYPE_SCALE;
        $itemdetails['scaleid'] = -$checkpoint->grade;
    } else {
        $itemdetails['gradetype'] = GRADE_TYPE_NONE;
    }

    return grade_update(
        'mod/checkpoint',
        $checkpoint->course,
        'mod',
        'checkpoint',
        $checkpoint->id,
        0,
        $grades,
        $itemdetails
    );
}
```

The callback centralizes the Gradebook contract and can be reused during creation, update, and grade publishing.

## 21.12 Creating the grade item in `add_instance()`

After inserting the instance, create the corresponding item:

```php
function checkpoint_add_instance($data, $mform = null): int {
    global $DB;

    $data->timemodified = time();
    $id = $DB->insert_record('checkpoint', $data);
    $data->id = $id;

    checkpoint_grade_item_update($data);

    return $id;
}
```

In a larger implementation I would delegate part of this flow to a service class, but the example shows the temporal relationship. The activity instance needs to exist first, then Gradebook receives an item pointing to that ID.

## 21.13 Updating the grade item in `update_instance()`

If the teacher changes the name, maximum, or scale, the grade item needs to follow.

```php
function checkpoint_update_instance($data, $mform): bool {
    global $DB;

    $data->id = $data->instance;
    $data->timemodified = time();

    $result = $DB->update_record('checkpoint', $data);
    checkpoint_grade_item_update($data);

    return $result;
}
```

This avoids a situation where the activity says maximum 50 while Gradebook is still configured for 100.

## 21.14 Changing maximum grade after grades already exist

Changing `grademax` in an activity that already has grades needs care. Gradebook has mechanisms for scaling and regrading, but the activity needs to understand the pedagogical meaning of the change.

If the teacher changes 100 to 20, do they want existing values converted while preserving percentage, or reinterpreted under the new maximum? Those are not always the same thing.

Do not implement a manual division across every grade merely because the maximum changed. Check Gradebook behavior and the API available for the supported Moodle version.

## 21.15 Updating one grade

To publish one user's grade, create a structure containing `userid` and `rawgrade`:

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => $value,
];

checkpoint_grade_item_update($checkpoint, $grade);
```

Feedback and its format can also be supplied when the activity workflow requires them.

The important point is not to open `{grade_grades}` and search for a row to edit manually.

## 21.16 Updating multiple grades

`grade_update()` also accepts a collection of grades. This is very useful during regrade or whole-module synchronization.

```php
$grades = [];

foreach ($records as $record) {
    $grades[$record->userid] = [
        'userid' => $record->userid,
        'rawgrade' => $record->grade,
    ];
}

checkpoint_grade_item_update($checkpoint, $grades);
```

At large volumes, build sensible batches and avoid loading an entire course population into memory unnecessarily.

## 21.17 `rawgrade = null`

`rawgrade = null` means the user has no grade. This is different from grade zero.

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => null,
];
```

Zero is a valid grade and may represent failure. `null` means absence of assessment.

The distinction looks obvious, but plugins that use `empty()` indiscriminately often turn zero into "no grade" and produce incorrect results.

## 21.18 Omitting a field is not the same as sending `null`

In the Gradebook API, an omitted property normally means "do not alter this value", while some fields explicitly sent as `null` have their own semantics.

This matters in partial updates. If you do not intend to touch existing feedback, do not build an array containing `feedback => null` by reflex.

Define only what the operation genuinely changes.

## 21.19 Feedback

Gradebook accepts feedback associated with a grade. An activity may keep detailed feedback in its own tables and also send a summary to Gradebook.

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => $value,
    'feedback' => $feedback,
    'feedbackformat' => FORMAT_HTML,
];
```

Do not use Gradebook feedback as an automatic replacement for the plugin's entire evaluation model. If there are rubrics, annotated files, per-item comments, or review history, those data belong to the activity or the Advanced Grading API, not one string.

## 21.20 Scales

When an activity uses a scale, `gradetype` must be `GRADE_TYPE_SCALE` and `scaleid` identifies the scale.

In several modules the convention is to store `grade = -$scaleid`, hence the conversion:

```php
$itemdetails['gradetype'] = GRADE_TYPE_SCALE;
$itemdetails['scaleid'] = -$checkpoint->grade;
```

A scale is not simply a numeric grade with labels. Order and meaning belong to the scale, so any internal conversion needs to be handled carefully.

## 21.21 Minimum and maximum grade

For numeric grades, `grademin` and `grademax` define the range accepted by the item.

```
$itemdetails['gradetype'] = GRADE_TYPE_VALUE;
$itemdetails['grademin'] = 0;
$itemdetails['grademax'] = 100;
```

The activity must ensure the raw value it sends makes sense inside that range. If your internal logic computes 132 for a 100-point activity, do not rely on Gradebook to repair a broken algorithm.

## 21.22 Passing grade

The grade item may have `gradepass`, and that configuration can participate in Completion and reports. In many cases the teacher configures it in Gradebook or through elements of the activity form.

Do not confuse maximum grade with passing grade. A 100-point activity can require 60 to pass and still record lower grades normally.

If completion is configured to require passing grade, completion state may distinguish success and failure according to core rules.

## 21.23 `finalgrade`

The calculated final grade may differ from the raw value supplied by the module. Gradebook may apply transformations, calculations, overrides, and aggregations.

When the plugin needs to display the official course grade, do not assume its internal table is always the best source. Depending on the context, query Gradebook or use APIs returning the final grade.

When the plugin needs to recalculate the source grade, then its own table remains the source for reconstructing `rawgrade`.

## 21.24 `grade_item`

The `grade_item` class represents a Gradebook item and exposes methods for loading configuration, querying grades, inspecting overrides, working with visibility, and triggering regrade.

It is useful when you need to manipulate item details beyond simple publication through `grade_update()`, but do not turn every operation into direct object access when the higher-level function already solves it.

The general rule remains to prefer the highest API level satisfying the need and go lower only when there is a real reason.

## 21.25 `grade_grade`

`grade_grade` represents one user's grade for a particular item. It exposes information such as `rawgrade`, `finalgrade`, override, and lock state.

It is useful for reading and internal Gradebook flows, but Activity Modules should normally continue sending their grades through `grade_update()` instead of persisting `grade_grade` manually.

The existence of an ORM-style class does not turn the table into the module's write API.

## 21.26 Locked grades

Gradebook may lock grades or items. If a grade is locked, an activity should not try to bypass that by writing directly to the database.

The result of `grade_update()` and item state need to be respected. If an administrative action unlocks it, that belongs to the Gradebook flow and corresponding authorization.

## 21.27 Regrade

Regrade recalculates final grades when a dependency changes. Changing maximum, formula, category, or another property may cause Gradebook to mark items for recalculation.

The module should not walk through `{grade_grades}` recalculating `finalgrade`. Core provides `grade_regrade_final_grades()` and internal mechanisms that respect dependency ordering between items.

When the activity changes the source of grades, send the raw values again. Gradebook handles what belongs to the gradebook.

## 21.28 `checkpoint_get_user_grades()`

Modules integrating correctly with Gradebook normally implement a callback capable of rebuilding grades from activity-owned data.

```php
function checkpoint_get_user_grades($checkpoint, $userid = 0): array {
    global $DB;

    $params = ['checkpointid' => $checkpoint->id];
    $sql = "SELECT userid, grade AS rawgrade
              FROM {checkpoint_answers}
             WHERE checkpointid = :checkpointid";

    if ($userid) {
        $sql .= " AND userid = :userid";
        $params['userid'] = $userid;
    }

    return $DB->get_records_sql($sql, $params);
}
```

The structure needs to match what `grade_update()` expects and normally includes `userid`.

## 21.29 `checkpoint_update_grades()`

Another common callback is responsible for sending grades back to Gradebook:

```php
function checkpoint_update_grades($checkpoint, $userid = 0, $nullifnone = true): void {
    $grades = checkpoint_get_user_grades($checkpoint, $userid);

    if ($grades) {
        checkpoint_grade_item_update($checkpoint, $grades);
        return;
    }

    if ($userid && $nullifnone) {
        checkpoint_grade_item_update($checkpoint, [
            'userid' => $userid,
            'rawgrade' => null,
        ]);
        return;
    }

    checkpoint_grade_item_update($checkpoint);
}
```

This lets Gradebook ask the activity to republish grades when necessary.

## 21.30 Why the activity must be able to reconstruct the grade

If the only copy of the grade lived in `{grade_grades}`, the module would lose the ability to recompute it when its rules changed. That is why the activity generally preserves the source information or data from which the grade can be recalculated.

In `checkpoint`, the evaluation stored in `checkpoint_answers.grade` is domain data. Gradebook receives the official projection of that grade.

This is the same pattern seen elsewhere in Moodle: avoid making a projection the only source of truth when the domain producing it belongs to the plugin.

## 21.31 Deleting the grade item

When an activity stops having a grade or is deleted, the grade item needs to be removed through the Gradebook contract.

An implementation can use `grade_update()` with property `deleted` in item details according to the flow of the supported version. The important point is not to delete directly from `{grade_items}` and `{grade_grades}`.

Also do not remove user grades merely because the teacher temporarily changed a setting. Define whether the activity stopped being graded or whether the grade is only hidden.

## 21.32 Activity Module and Gradebook

Complete integration generally passes through four moments. Instance creation creates the grade item, editing updates configuration, assessment publishes grades, and deletion removes or marks the item according to the API.

This lifecycle must stay coherent with backup and restore. An activity restored into another course receives a new item related to the new instance, not a literal copy of the old Gradebook ID.

## 21.33 Advanced Grading is not Gradebook

Rubrics, marking guides, and other advanced methods use the Advanced Grading API. They help a teacher produce a grade, but the final grade still goes to Gradebook.

Do not confuse the interface used to calculate assessment with the place where the official course grade is stored and aggregated.

This distinction becomes important if `checkpoint` grows and begins using rubrics, because the Gradebook item continues to exist in the same way.

# Completion

## 21.34 What is Activity Completion?

Activity Completion represents the completion state of an activity for a user. A teacher may allow manual marking or configure automatic rules such as viewing, receiving a grade, submitting a response, or satisfying plugin-specific conditions.

Completion is not the same as availability. Completion says whether something is complete, while Availability can use that state to decide whether another resource is accessible.

Completion is not a grade either. An activity may be complete with a grade of zero, remain incomplete while having a grade, or be complete without any Gradebook item.

## 21.35 Activity Completion and Course Completion

Activity Completion deals with one individual activity. Course Completion deals with course-completion criteria and may use completed activities among its conditions.

A module normally should update its own Activity Completion correctly and let Course Completion perform the corresponding aggregation.

Avoid writing directly to course-completion tables every time somebody completes your activity. That creates unnecessary coupling and may ignore other criteria configured by the teacher.

## 21.36 Manual completion

If a module implements no special automatic rules, it can still participate in manual completion when the course allows that mode. The user marks the activity complete and core records the state.

The plugin does not need to invent its own checkbox inside `view.php`. Use Moodle's standard mechanism so state appears consistently on the course page, reports, and availability.

## 21.37 Automatic completion

Automatic completion means state is calculated from rules. Moodle can provide standard rules such as view and grade, while the module can provide custom rules.

The main difference is that the user does not mark the activity manually. The system observes state and updates completion as conditions change.

## 21.38 `FEATURE_COMPLETION_TRACKS_VIEWS`

If the module can mark views, declare:

```
FEATURE_COMPLETION_TRACKS_VIEWS => true,
```

And after a valid view:

```php
$completion = new completion_info($course);
$completion->set_module_viewed($cm);
```

As discussed in Chapter 17, this should happen after access validation and before the header when navigation needs to reflect the change immediately.

## 21.39 Completion by grade

If the module declares `FEATURE_GRADE_HAS_GRADE`, Moodle can offer a completion condition based on receiving a grade.

In that case the plugin does not need to create a custom rule named `completiongraded`. Standard infrastructure already understands the relationship between grade item and completion.

Creating a custom rule duplicating exactly a core condition increases maintenance and can produce two different states for the same intent.

## 21.40 Receiving a grade is not necessarily passing

A teacher can configure completion simply for receiving any grade or require a passing grade when that option exists in the Completion and Gradebook flow.

A grade of zero is still a received grade. If the activity requires a pass, state may also depend on `gradepass`.

This reinforces why Completion should not look directly at the plugin's internal grade column when the teacher selected a Gradebook-based rule.

## 21.41 `FEATURE_COMPLETION_HAS_RULES`

When the module has its own rules, declare:

```
FEATURE_COMPLETION_HAS_RULES => true,
```

Our `mod_checkpoint` will have two custom rules:

```
completionsubmit
completionfeedback
```

The first requires a submitted response. The second requires teacher feedback.

## 21.42 The modern custom-completion contract

Old plugins may have callbacks such as `checkpoint_get_completion_state()`. In modern Moodle this model was replaced by the class:

```
classes/completion/custom_completion.php
```

With namespace:

```
namespace mod_checkpoint\completion;
```

And inheritance:

```
use core_completion\activity_custom_completion;

class custom_completion extends activity_custom_completion {
}
```

For new code this is the correct approach. The old callback should appear only as a reference when maintaining legacy plugins.

## 21.43 `get_defined_custom_rules()`

The class declares the rules known by the module:

```
public static function get_defined_custom_rules(): array {
    return [
        'completionsubmit',
        'completionfeedback',
    ];
}
```

This is the activity's static contract. One instance may enable one, both, or neither, but the module reports which rules exist.

## 21.44 `get_state()`

`get_state()` calculates one rule's state for one specific user.

```php
public function get_state(string $rule): int {
    global $DB;

    $this->validate_rule($rule);

    $answer = $DB->get_record('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return match ($rule) {
        'completionsubmit' => $answer
            ? COMPLETION_COMPLETE
            : COMPLETION_INCOMPLETE,

        'completionfeedback' => !empty($answer->feedback)
            ? COMPLETION_COMPLETE
            : COMPLETION_INCOMPLETE,

        default => COMPLETION_UNKNOWN,
    };
}
```

The method does not obtain the current user from global `$USER` because completion can be calculated for another user in reports, cron, or assessments.

## 21.45 Never use `$USER` in a completion rule receiving `$userid`

This error is extremely common. The rule works when the learner opens the activity, but the teacher's report calculates state using the teacher because code looked at `$USER`.

In the modern class the correct ID is in `$this->userid`. Always use the user whose state is being calculated.

## 21.46 `validate_rule()`

Before calculating, call:

```php
$this->validate_rule($rule);
```

This validation guarantees the rule exists and is available for that instance instead of accepting an arbitrary string as a condition name.

Do not replace it with a silent `switch` that returns `false` for any unknown value.

## 21.47 `get_custom_rule_descriptions()`

Moodle needs to show users what remains to complete. The class should return readable descriptions:

```php
public function get_custom_rule_descriptions(): array {
    return [
        'completionsubmit' => get_string(
            'completiondetail:submit',
            'mod_checkpoint'
        ),
        'completionfeedback' => get_string(
            'completiondetail:feedback',
            'mod_checkpoint'
        ),
    ];
}
```

These strings appear in the completion experience and need to be written for people rather than as technical configuration names.

## 21.48 `get_sort_order()`

This method defines the order in which custom rules appear alongside standard rules:

```
public function get_sort_order(): array {
    return [
        'completionview',
        'completionsubmit',
        'completionfeedback',
        'completionusegrade',
    ];
}
```

The list needs to correspond to rules actually supported and to the experience you want to present.

## 21.49 Where rule configuration lives

Custom completion configuration normally lives in the activity's main table because it is loaded with the instance and naturally belongs to that configuration.

In `checkpoint` we may have:

```
completionsubmit     0 ou 1
completionfeedback   0 ou 1
```

If a rule requires a quantity, the field may store that value, such as `completionattempts = 3`.

Do not create a separate table for this kind of configuration unless necessary because that adds a query for state already belonging naturally to the instance.

## 21.50 `mod_form.php` and custom rules

The activity form needs to let a teacher enable rules inside the standard completion section. For this `moodleform_mod` provides `add_completion_rules()`.

```php
public function add_completion_rules(): array {
    $mform = $this->_form;

    $submit = $this->get_suffixed_name('completionsubmit');
    $feedback = $this->get_suffixed_name('completionfeedback');

    $mform->addElement(
        'checkbox',
        $submit,
        '',
        get_string('completionsubmit', 'mod_checkpoint')
    );

    $mform->addElement(
        'checkbox',
        $feedback,
        '',
        get_string('completionfeedback', 'mod_checkpoint')
    );

    return [$submit, $feedback];
}
```

On modern versions the suffix matters because the completion section changed to avoid duplicate IDs.

## 21.51 `get_suffixed_name()`

Since the completion form was rebuilt in modern versions, custom rules need to work with suffixed form names.

Do not simply use `completionsubmit` for every element assuming the DOM will never contain duplication.

This is one of those compatibility details where copying Moodle 3.9 plugin code into Moodle 5.x can produce strange behavior without an obvious PHP error.

## 21.52 `completion_rule_enabled()`

The form needs to report whether at least one custom rule was enabled:

```php
public function completion_rule_enabled($data): bool {
    $submit = $this->get_suffixed_name('completionsubmit');
    $feedback = $this->get_suffixed_name('completionfeedback');

    return !empty($data[$submit]) || !empty($data[$feedback]);
}
```

This participates in automatic-mode validation and prevents the teacher selecting automatic completion with no effective conditions.

## 21.53 `get_data()` and suffixed fields

Depending on how custom elements are built, it may be necessary to normalize suffixed names before saving them into the final activity object.

Do not blindly copy `get_data()` overrides from old modules. First understand how your Moodle branch handles custom-completion forms and only adjust when values are not arriving in the expected format.

This is a sensitive compatibility point between versions.

## 21.54 `get_coursemodule_info()` and `customdata`

Moodle needs to know custom-rule configuration without making extra queries every time it renders the course page. The module therefore adds relevant configuration to `cm_info` through `customdata`.

```php
function checkpoint_get_coursemodule_info($coursemodule) {
    global $DB;

    $checkpoint = $DB->get_record(
        'checkpoint',
        ['id' => $coursemodule->instance],
        'id,name,intro,introformat,completionsubmit,completionfeedback',
        MUST_EXIST
    );

    $info = new cached_cm_info();
    $info->name = $checkpoint->name;

    if ($coursemodule->completion == COMPLETION_TRACKING_AUTOMATIC) {
        $info->customdata['customcompletionrules'] = [
            'completionsubmit' => $checkpoint->completionsubmit,
            'completionfeedback' => $checkpoint->completionfeedback,
        ];
    }

    return $info;
}
```

This feeds the custom-completion class without forcing core to repeatedly query the activity table.

## 21.55 Completion and `cm_info` cache

Because `cm_info` is cached, changing activity configuration needs to pass through normal flows invalidating modinfo. Do not edit completion fields with SQL outside callbacks and expect the course page to reflect it immediately.

Using the form and course-module APIs keeps cache and state coherent.

## 21.56 `completion_info`

The `completion_info` class is the main interface for querying and updating Activity Completion inside a course.

```php
$completion = new completion_info($course);
```

It lets you check whether completion is enabled, retrieve state, mark a view, and request recalculation when a condition changed.

Do not write directly to `{course_modules_completion}`.

## 21.57 `is_enabled()`

Before doing completion-specific work, check whether the feature is active for the course or course module:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    // Atualização de estado.
}
```

This avoids unnecessary queries and updates when the activity does not use completion.

## 21.58 `update_state()`

When a fact influencing custom rules changes, tell the Completion subsystem:

```php
$completion->update_state(
    $cm,
    COMPLETION_UNKNOWN,
    $userid
);
```

`COMPLETION_UNKNOWN` tells the system to recalculate state from current rules rather than artificially forcing complete or incomplete.

This is especially appropriate when multiple rules exist and one change may affect only one of them.

## 21.59 Do not force `COMPLETION_COMPLETE` unnecessarily

If the module has custom rules, do not always mark `COMPLETION_COMPLETE` when an action occurs. Another rule may still be unsatisfied.

In our example, submitting a response satisfies `completionsubmit`, but `completionfeedback` may still be missing. Calling `update_state($cm, COMPLETION_COMPLETE)` at that point could communicate the wrong state.

Prefer recalculation through `COMPLETION_UNKNOWN` when the system should recompute all conditions.

## 21.60 When to update completion after a submission

After the learner creates or changes a response:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    $completion->update_state(
        $cm,
        COMPLETION_UNKNOWN,
        $userid
    );
}
```

Do this after persisting the change because the custom-completion class will query the new state.

## 21.61 When to update completion after feedback

When the teacher saves feedback, the same idea applies:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    $completion->update_state(
        $cm,
        COMPLETION_UNKNOWN,
        $studentid
    );
}
```

Notice that the user whose completion is being recalculated is the learner, not the teacher who performed the assessment.

## 21.62 Completion can return to incomplete

Depending on the rule, a state that was complete may become incomplete again. If the teacher removes feedback, a response is deleted, or one condition changes, the plugin needs to request another update.

Do not assume completion is always monotonic and only moves from incomplete to complete. Behavior depends on the rule and system permissions.

If your rule requires a record that can be removed, implement the reverse path too.

## 21.63 Completion states

Known states include `COMPLETION_INCOMPLETE`, `COMPLETION_COMPLETE`, `COMPLETION_COMPLETE_PASS`, `COMPLETION_COMPLETE_FAIL`, and `COMPLETION_UNKNOWN` in calculation contexts.

Use core constants rather than magic numbers.

Do not invent a custom state such as `2 = enviado` and expect core to understand it. If the plugin needs additional domain states, keep them in the plugin's own table and translate only final completion into the Completion subsystem.

## 21.64 Pass and fail

When a passing grade participates in completion, Moodle can distinguish completed-with-pass from completed-with-fail.

That state does not necessarily mean the activity is not complete. In some workflows the user completed the attempt but did not achieve the passing grade.

This difference matters for Availability and reports and should not be flattened into a boolean `completed` inside the plugin.

## 21.65 Course Completion

Course Completion aggregates criteria that may include completed activities, dates, duration, manual approval, grades, and other course-configured elements.

An Activity Module generally does not need to write Course Completion logic. It needs to provide correct Activity Completion and let course criteria use that state.

If the plugin directly modifies course-completion tables every time someone submits an activity, there is a good chance it crossed the wrong boundary.

## 21.66 Expected completion

Activities can have an expected completion date used in calendar and planning. This is different from the activity deadline and different from `timeclose`.

Core provides an API for updating the event associated with expected completion, and modules supporting this feature should use the proper contract rather than create a second event unrelated to standard configuration.

## 21.67 Completion and Availability

Activity B may depend on completion of activity A. When A changes state, Moodle can recalculate B's availability.

This is one reason to update completion at the correct moment. If the learner satisfied a condition but the plugin leaves state stale until overnight cron, the next activity may remain unnecessarily locked.

The opposite also matters. Marking complete too early may unlock content prematurely.

## 21.68 Completion performance

Custom completion may be queried while rendering the course page for many users or inside reports. A rule that executes six expensive queries just to answer a boolean is a performance problem.

Prefer indexed fields, simple queries, and configuration data in `cm_info->customdata`. If state depends on very expensive aggregation, consider maintaining a projection when events happen instead of recalculating thousands of records every time somebody opens a report.

But do not create a cache without invalidation. Completion needs to remain correct.

## 21.69 Avoid N+1 in completion reports

If a report lists one hundred users and calls a function executing three queries for each one, you just created 300 queries.

When the plugin needs custom completion reports, load data in bulk. The Completion API remains the source of official state, while plugin-specific complementary data can be retrieved in one query per activity.

## 21.70 Completion and events

The subsystem triggers events when states change and other parts of Moodle can react. Do not create your own log table merely to know an activity was completed when the standard event already represents the fact you need.

If the plugin has a different fact, such as "feedback published", then its own event may make sense.

## 21.71 Completion and backup

Configuration fields for custom rules need to enter the activity backup. If `completionsubmit` and `completionfeedback` are in the main table and that structure is already backed up correctly, ensure those fields are included.

User completion state is handled by the general mechanism according to backup options with user data, while rule configuration belongs to the activity and should travel even in backups without users.

## 21.72 Completion and restore

On restore, the new instance receives its completion rules and the corresponding course module needs to finish configured coherently.

Do not restore `course_modules_completion` IDs manually. Mappings and the restore mechanism exist because `cmid`, `userid`, and other identifiers may change.

## 21.73 Gradebook and backup

An activity's grade item is also recreated inside the new course, related to the new instance. This is different from copying the old `{grade_items}` row.

User grades enter when the backup includes user data and the module implements backup correctly, but the source grade in the plugin also needs to be restored so `update_grades()` can reconstruct Gradebook in the future.

## 21.74 Gradebook and Privacy API

Grades are personal data and may appear both in Gradebook and in the activity's internal tables. The plugin needs to declare its own data in Privacy API when it stores evaluations, feedback, or internal scores.

The fact that Gradebook has its own provider does not automatically cover table `checkpoint_answers`.

## 21.75 Gradebook and Groups API

Groups may limit which users a teacher can assess or view in a particular activity. This does not change grade-item structure but affects the interface and queries loading participants.

Do not filter `grade_grades` manually by group as an authorization method. First determine permitted users using the Groups API and appropriate capability.

## 21.76 Gradebook and capabilities

Grading a user normally requires a specific capability, for example:

```
mod/checkpoint:grade
```

This capability should be checked in `context_module`. The existence of a grade item authorizes nobody to alter a grade.

Likewise, a Web Service or AJAX assessment action needs to repeat authorization on the server.

## 21.77 Grade calculated by the plugin or entered by the teacher

Some activities calculate automatically while others receive a manual grade. In both cases the output to Gradebook may be the same, but the internal source differs.

For automatic calculation, store the data allowing reproduction of the grade. For manual assessment, store who graded, when, and the data required for domain auditing.

Do not use `grade_grades.usermodified` as an automatic substitute for all history your activity needs.

## 21.78 Regrading after changing the rule

If a version update changes the grading algorithm, you need to decide whether historical grades will be recalculated. This is a data-upgrade problem and should not happen silently every time a teacher opens the activity.

Moodle 5.2 had important changes and recent fixes related to Gradebook calculations, reinforcing a general rule: do not internally reproduce the Gradebook calculation engine and follow release notes when your plugin depends on advanced behavior.

## 21.79 A complete assessment flow

In our `mod_checkpoint`, one assessment flow could be:

```
Aluno envia resposta
        |
        +-- salva checkpoint_answers
        +-- atualiza custom completion
        |
Professor avalia
        |
        +-- grava grade e feedback no domínio
        +-- chama checkpoint_grade_item_update()
        +-- atualiza custom completion
        |
Gradebook
        |
        +-- calcula finalgrade
        +-- atualiza conclusão por nota quando configurada
```

No part of this needs to write directly to Gradebook or Completion internal tables.

## 21.80 The `completionsubmit` rule

The first custom rule is satisfied when a valid user response exists.

```php
case 'completionsubmit':
    $complete = $DB->record_exists('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return $complete
        ? COMPLETION_COMPLETE
        : COMPLETION_INCOMPLETE;
```

If the plugin allows deleting the response, deletion needs to request recalculation.

## 21.81 The `completionfeedback` rule

The second rule requires teacher feedback to have been published:

```php
case 'completionfeedback':
    $answer = $DB->get_record('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return !empty($answer->feedback)
        ? COMPLETION_COMPLETE
        : COMPLETION_INCOMPLETE;
```

In practice, using an explicit `feedbackpublished` field may be better than testing an empty string because a teacher may publish feedback without text, using only a file or rubric. Domain modeling needs to match the pedagogical rule.

## 21.82 Do not use grade presence as a synonym for feedback

A grade may exist without feedback and feedback may exist without a grade. If the rule is called "receive feedback", test the feedback defined by the domain rather than merely `grade !== null`.

If the institution considers a grade alone sufficient feedback, then the rule should have another name and description.

## 21.83 Combining custom rules with standard rules

A teacher can enable `completionsubmit`, `completionfeedback`, view, and grade at the same time. The Completion subsystem combines conditions according to the model supported by course and activity.

The plugin should not build one giant `if` duplicating every standard rule merely to decide completion. The custom class answers only for rules belonging to the module.

## 21.84 Completion and later editing

If the learner can edit a response after completion, define whether editing preserves the condition. For `completionsubmit` it probably does as long as the record continues to exist.

If editing invalidates prior feedback, perhaps `completionfeedback` needs to return to incomplete. In that case the service saving a new response version should mark earlier feedback as outdated and request recalculation.

That is a business decision that Completion merely represents.

## 21.85 Testing Gradebook

In PHPUnit, create course, activity, and users, apply a grade through the plugin service, then inspect Gradebook to verify item, maximum, scale, and published grade.

Also test zero, `null`, changed maximum, regrade, and override when plugin behavior needs to respect it.

Do not limit the test to the activity's internal grade column because the contract being tested is exactly its Gradebook integration.

## 21.86 Testing Completion

For completion, create the activity with each rule individually and then with both combined. Verify state before submission, after submission, after feedback, and after feedback removal when that path exists.

Also test a user different from the logged-in user to ensure the implementation does not accidentally depend on `$USER`.

That test catches a surprising number of bugs.

## 21.87 Testing backup and restore

Create an activity with a grade, two custom rules, response, feedback, and completion state, back it up, and restore it into another course. Then verify grade-item configuration, completion fields, and user data according to backup options.

This kind of test identifies incorrectly copied IDs and fields forgotten from the backup structure.

## 21.88 Common Gradebook errors

The most frequent errors are writing directly to `{grade_grades}`, using zero to represent no grade, failing to update the grade item when the maximum changes, not implementing `update_grades()`, ignoring scales, overwriting manual overrides, and confusing an internal grade with finalgrade.

Another common error is publishing the grade before the domain transaction completes and then failing in the local database, leaving Gradebook with a state the activity cannot reconstruct.

## 21.89 Common Completion errors

The most common errors are using `$USER` when calculating another user's state, marking complete directly while multiple rules exist, forgetting to recalculate after state changes, implementing a legacy callback in a new plugin, failing to put configuration into `cm_info`, failing to use suffixed names in modern forms, and creating a custom rule duplicating completion by view or grade.

Another frequent mistake is updating only the path that becomes complete and forgetting the path that becomes incomplete.

## 21.90 Final exercise

Evolve `mod_checkpoint` into a complete graded activity. The teacher can choose a maximum numeric grade or a scale, and the plugin should create the corresponding grade item using `grade_update()`.

The learner response is stored in `checkpoint_answers`. The teacher can record a grade and feedback, and that assessment must update Gradebook without writing directly to grade tables.

Implement `checkpoint_grade_item_update()`, `checkpoint_get_user_grades()`, and `checkpoint_update_grades()`. Ensure `rawgrade = null` represents no grade and zero remains a valid grade.

Then implement two custom completion rules in `classes/completion/custom_completion.php`:

```
completionsubmit
completionfeedback
```

The first becomes complete when a response exists, while the second becomes complete when feedback has been published. Add controls in `mod_form.php`, store configuration in the main table, and expose values through `get_coursemodule_info()`.

When the response is submitted or removed, call `completion_info->update_state()` with `COMPLETION_UNKNOWN` for the corresponding learner. Do the same when feedback is published, changed, or removed.

Also test combination with standard view and grade rules, including passing grade. A teacher should be able to configure, for example, that the learner must view, submit, receive feedback, and achieve a passing grade to complete.

Finally, back up and restore the activity to another course, change the maximum after assessments already exist, test a manually overridden Gradebook grade, and execute completion tests for a user different from current `$USER`.

If everything remains coherent, the activity is not merely displaying a number and a green check. It is integrated with Moodle's two subsystems responsible for those states.

## 21.91 What should remain from this chapter

Gradebook and Completion meet inside activities, but they are not the same thing. The activity produces or receives the assessment and publishes `rawgrade` through the Gradebook API, while Gradebook maintains the item, final grade, categories, calculations, overrides, and regrading. The activity declares completion criteria and the Completion subsystem maintains the official state used by the course, reports, and Availability.

The plugin table remains the source for domain data allowing grade and rule reconstruction, but it does not replace `{grade_items}`, `{grade_grades}`, or `{course_modules_completion}`. Likewise, writing directly to those tables is not integration; it merely bypasses the APIs keeping the rest of Moodle coherent.

When the plugin creates the grade item correctly, can republish its grades, respects overrides, uses the modern `custom_completion` class, updates state when facts change, and tests restore, it begins behaving like a real part of Moodle rather than an isolated activity that happens to display a number and a checkbox.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Activity completion API. Available at: https://moodledev.io/docs/4.5/apis/core/activitycompletion. Accessed September 2026.
* MOODLE. Moodle Developer Resources. Activity modules. Available at: https://moodledev.io/docs/5.1/apis/plugintypes/mod. Accessed September 2026.
* MOODLE. Moodle PHP Documentation. Grade API and `grade_update()`. Available at: https://phpdoc.moodledev.io/main/da/d09/group__core__grades.html. Accessed September 2026.
* MOODLE. Moodle PHP Documentation. `grade_item`. Available at: https://phpdoc.moodledev.io/5.0/d0/d8b/classgrade__item.html. Accessed September 2026.
* MOODLE. Moodle PHP Documentation. `grade_grade`. Available at: https://phpdoc.moodledev.io/5.0/dc/df3/classgrade__grade.html. Accessed September 2026.
* MOODLE. Moodle PHP Documentation. `core_completion\\activity_custom_completion`. Available at: https://phpdoc.moodledev.io/. Accessed September 2026.
* MOODLE. Moodle source code. `mod/choice/classes/completion/custom_completion.php`. Available at: https://github.com/moodle/moodle/blob/main/public/mod/choice/classes/completion/custom_completion.php. Accessed September 2026.
* MOODLE. Moodle source code. `mod/assign/lib.php`. Gradebook callback implementation. Available at: https://github.com/moodle/moodle/blob/main/public/mod/assign/lib.php. Accessed September 2026.

{% endraw %}