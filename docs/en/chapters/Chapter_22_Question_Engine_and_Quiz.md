{% raw %}

# 22 QUESTION ENGINE AND QUIZ

Quiz and the Question Engine live so close together in Moodle that it is easy to treat them as if they were the same thing. A teacher creates a Quiz, adds questions, the learner answers them, and a grade appears later, so visually it may seem that there is only one activity called Quiz. In code, however, the separation matters much more, because Quiz is an activity that organises attempts, timing, pages, review, grades, and access rules, while the Question Engine is a generic subsystem that knows how to run questions, record every interaction, calculate fractions, control states, and work with different behaviours without depending on `mod_quiz`.

This distinction explains many things that initially look strange. The `quiz_attempts` table does not store question responses, because responses belong to the Question Engine. The attempt's `uniqueid` points to `question_usages`, and from there you find `question_attempts`, `question_attempt_steps`, and `question_attempt_step_data`. It also explains why a question can be used outside Quiz, for example in preview, in filters that embed questions, or in another plugin that creates its own `question_usage_by_activity`.

In this chapter we will take this architecture apart layer by layer, starting with the Question Bank and ending with a real Quiz attempt. Along the way we will work with categories, versions, references, `qtype`, behaviours, states, fractions, feedback, hints, slots, random questions, and programmatic creation. The goal is not to memorise tables, but to be able to inspect a complex attempt and understand exactly where each part of its state is stored and which API should be used to change it.

## 22.1 Quiz and Question Engine are not the same thing

`mod_quiz` is an activity module. It has a main table, course module, configuration form, gradebook integration, completion, calendar integration, access rules, attempts, and reports. The Question Engine belongs to the `core_question` subsystem and can be used by any component that needs to execute interactive questions.

Think of Quiz as the coordinator of the experience and the Question Engine as the engine that runs each question. Quiz decides that there is a 30-minute attempt, that questions appear on certain pages, and that the learner may only review feedback after the quiz closes. The Question Engine decides how a multiple-choice question receives an answer, how an immediate behaviour reacts to the "Check" button, which state the question enters, and which fraction was obtained in that step.

Mixing these responsibilities usually produces fragile code. If a plugin only needs to create and execute questions, it may not need `mod_quiz`; if it needs to manipulate an existing Quiz, then it needs to understand both the activity and the engine underneath it.

## 22.2 Question Bank

![Course question bank](image/chapter22-course-question-bank.png)

The Question Bank is the layer where teachers create, organise, edit, and manage reusable questions. Since Moodle 4.0 it has stopped being merely an interface over the `question` table and gained an explicit architecture of entries, versions, and `qbank` plugins.

This matters because the logical identity of a question and the concrete version that will be attempted are no longer exactly the same thing. A question called "Capital of Brazil" may have five versions over time while still representing the same entry in the Question Bank.

## 22.3 `question_categories`

Questions are organised into categories, and the `question_categories` table associates each category with a context. This allows a question bank to belong to a particular course, course category, module, or another supported context, depending on the architecture and capabilities in use.

The most important fields include `contextid`, `name`, `parent`, `sortorder`, and `idnumber`. `contextid` is not a minor implementation detail, because it defines the sharing and authorisation boundary of the category.

Do not create a question programmatically and simply choose the first category found in the database. The context must correspond to where that question should actually exist and to the permissions of the user who manages it.

## 22.4 The logical entry in `question_bank_entries`

With modern versioning, `question_bank_entries` represents the logical identity of the question inside the bank. Each row contains the category, an optional `idnumber`, `ownerid`, and next-version control.

This table answers the question "which question is this in the bank?", while `question_versions` answers "which concrete version of this question are we talking about?".

This is an important conceptual change for legacy code. Before Moodle 4.0 many plugins stored `question.id` directly as if it were the permanent identity. Today that may identify only one specific version.

## 22.5 `question_versions`

`question_versions` links a bank entry to a concrete row in the `question` table. The main fields are `questionbankentryid`, `version`, `questionid`, and `status`.

A significant edit may create a new version instead of replacing the previous definition. This preserves old attempts and allows new usages to point to the desired version without rewriting history.

That is why manipulating `question` directly with `$DB->update_record()` is almost always wrong in new code. You can change a definition that already participates in attempts or break the version chain expected by the Question Bank.

## 22.6 Version status

The `status` field can represent states such as `ready`, `hidden`, or `draft`. A draft version should not appear as a public, ready-to-use version in the same way as a completed version.

When your code chooses "the latest version", it needs to understand whether that means literally the highest number or the latest available non-draft version. The Question Bank APIs exist precisely so every plugin does not invent a different query.

## 22.7 `question_references`

`question_references` records where a specific question is used. The record stores `usingcontextid`, `component`, `questionarea`, `itemid`, `questionbankentryid`, and optionally a version.

In modern Quiz, a slot does not need to point directly to `question.id`. The reference tells Moodle which bank entry is linked to that usage and whether it should use a specific version or the latest valid version.

This abstraction is what allows the Question Bank to be updated without necessarily rewriting every consumer.

## 22.8 `question_set_references`

Random questions do not represent one specific question but an eligible set. This case is represented by `question_set_references`, which stores the question context and a JSON filter condition.

Current core prevents creating a question with `qtype = random` through the normal `save_question()` flow, because a random question stopped being a fake question and became a reference to a set. Architecturally this is much cleaner, but it breaks many old examples still found online.

## 22.9 Do not treat random questions as `qtype_random`

Legacy code may search for a question of type `random` in the `question` table, but that model no longer represents modern versions correctly. If the goal is to add a random question to a Quiz, use the Quiz structure APIs that create a `question_set_reference` with the appropriate criteria.

This also improves random-question filters because the set can be defined by category, tags, and other filters supported by the Question Bank.

## 22.10 The `question` table

The `question` table still contains the concrete definition of one version, with fields such as `name`, `questiontext`, `questiontextformat`, `generalfeedback`, `defaultmark`, `penalty`, `qtype`, timestamps, and other common data.

Today, however, it should be understood as part of the chain `question_bank_entries -> question_versions -> question`. An isolated row does not tell the whole story of a question in the bank.

## 22.11 Type-specific data

Each `qtype` may store additional data in its own tables. Multiple choice has its own options and answers, while more complex types can have completely different structures.

That is why querying only `{question}` is not enough to reconstruct every question. Use `question_bank::load_question_data()` or `question_bank::load_question()` when you need the complete definition, because the qtype participates in loading its options.

## 22.12 Question Bank `qbank` plugins

Since Moodle 4.0 the Question Bank has its own plugin type, `qbank`. These plugins can add columns, filters, actions, bulk actions, navigation, preview, and other functionality to the bank interface.

The Question Bank core now behaves more like an aggregator of these extensions. For modern development, that means a new Question Bank UI feature does not have to become a hack in `question/edit.php` or a change to the `qtype`.

## 22.13 When to create a `qbank`

If the feature is "add a column showing question usage", "create a new filter", "add a bulk action", or "show an extra tab in the bank", we are probably talking about `qbank`, not `qtype`.

`qtype` defines what a question is and how it is attempted. `qbank` extends the Question Bank management experience.

## 22.14 `qtype`

A question type defines the nature of the question. Multiple choice, true/false, short answer, numerical, ordering, and third-party types such as STACK or crossword are examples of qtypes.

A qtype participates both in authoring and editing the question and in its execution by the Question Engine. That is why it has responsibilities involving forms, persistence, loading, grading, rendering, feedback, File API, and backup.

## 22.15 Traditional qtype structure

A typical structure may contain:

```
question/type/simplechoice/
    backup/
        moodle2/
    lang/
        en/
            qtype_simplechoice.php
    pix/
        icon.svg
    edit_simplechoice_form.php
    question.php
    questiontype.php
    renderer.php
    version.php
```

Unlike what we discussed in Chapter 6 for ordinary pages, qtypes still have their own rendering contract integrated with `core_question_renderer`, so `renderer.php` is not simply disposable historical boilerplate here. This is one of the situations where a renderer remains part of the subsystem-specific API.

## 22.16 `questiontype.php`

The class in `questiontype.php` normally extends `question_type` and is responsible for loading and saving persisted data, options, answers, hints, and type metadata.

The base `save_question()` method coordinates the transaction, bank entry, version, common files, and then delegates details to the qtype. Do not recreate this flow manually.

## 22.17 `edit_[qtype]_form.php`

The form defines fields specific to authoring that question type. It extends the question form classes and integrates the name, question text, default mark, general feedback, hints, and other common elements.

The Forms API rule still applies: visual validation does not replace server-side validation, and specific fields must use the correct parameter types.

## 22.18 `question.php`

`question.php` defines the runtime class that represents a question during an attempt. It normally extends classes such as `question_graded_automatically` or other bases appropriate to the behaviour.

This is where methods that define expected responses, completeness, grading, summaries, and type-specific runtime behaviour live.

## 22.19 Question definition

A `question_definition` is not just a row from the table. It is an object loaded and prepared for execution, containing the qtype, options, answers, and logic required to participate in an attempt.

When you call `question_bank::load_question($questionid)`, core loads the data and asks the qtype to build the correct definition.

## 22.20 Answers

Many qtypes use the `question_answers` table, which stores `answer`, `fraction`, and feedback, but this is not universal. Some types have their own tables or structures that do not fit the simple-answer model.

Do not build an integration assuming every question has exactly four rows in `question_answers`.

## 22.21 Fractions

In the Question Engine, grading normally works with a relative fraction. A completely correct response may return `1.0`, a partially correct response `0.5`, and an incorrect response `0.0`. Some types may allow negative values or values greater than 1 in specific scenarios, and the attempt has `minfraction` and `maxfraction` to represent these limits.

The effective mark for the question is calculated by combining the fraction with the `maxmark` for that question attempt.

```
fraction = 0.75
maxmark  = 2.0
mark     = 1.5
```

This separation allows the same question definition to have different weights in different usages.

## 22.22 `defaultmark` is not the final Quiz weight

`question.defaultmark` is the default mark suggested by the question, while a Quiz slot has `maxmark`, which represents how much that question is worth in that Quiz.

Changing the question's `defaultmark` should not be confused with retroactively changing the weight of every quiz that already uses it.

## 22.23 General feedback

`generalfeedback` belongs to the question and is general feedback that may be shown according to the consumer's review options, for example Quiz.

This differs from answer-specific feedback, combined feedback by grade range, and behaviour feedback.

The Question Engine knows how to produce the information, while Quiz decides when it may be displayed.

## 22.24 Specific feedback

In qtypes with defined answers, each option may have its own feedback. After grading, the renderer can present the feedback corresponding to the selected answer, provided `question_display_options` allows it.

That last condition matters. It is not enough for the qtype to have feedback, because the consuming component may prevent it from being shown at that moment.

## 22.25 Hints

Hints are mainly used in behaviours that allow multiple tries within the same question. The `question_hints` table stores hints and options such as clearing incorrect responses or showing the number of correct parts in compatible question types.

The base qtype `save_hints()` method also handles files through the File API, so writing hints manually with SQL loses part of the contract.

## 22.26 Question Engine

The Question Engine is the layer that executes questions. It receives definitions, behaviours, submitted responses, and controls state over time.

Central classes include `question_engine`, `question_usage_by_activity`, `question_attempt`, steps, states, and behaviours.

A plugin outside the engine should normally enter through the `question_engine` APIs and `question_usage_by_activity`, not through the internal data mapper.

## 22.27 `question_engine`

`question_engine` is the main facade for creating, loading, and saving usages. Methods such as `make_questions_usage_by_activity()`, `save_questions_usage_by_activity()`, and `load_questions_usage_by_activity()` prevent consumers from needing to know the internal table details.

Core itself makes it clear that the data mapper is an implementation detail and should not be used directly for normal inserts and updates.

## 22.28 `question_usage_by_activity`

`question_usage_by_activity`, often called `quba`, represents a set of questions being used by an activity or component.

A Quiz attempt has a QUBA, but a question preview may have another one. Each QUBA has a context, owning component, and preferred behaviour.

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context,
);
$quba->set_preferred_behaviour('deferredfeedback');
```

Then you add questions, start them, and save the usage.

## 22.29 The `question_usages` table

Each persisted `question_usage_by_activity` corresponds to a row in `question_usages`. The main fields are `contextid`, `component`, and `preferredbehaviour`.

The component identifies who owns that usage. In Quiz it will be `mod_quiz`; in another plugin it will be the corresponding Frankenstyle component name.

## 22.30 Slot in the Question Engine

Inside a QUBA, questions are identified by sequential slots. The engine deliberately does not use `question.id` as the position because the same question can appear more than once and because the consumer works with its own sequence.

The slot is a position inside that usage, not a global identity.

## 22.31 `question_attempt`

Each question inside a usage has a `question_attempt`. The `question_attempts` table stores `questionusageid`, `slot`, behaviour, `questionid`, variant, `maxmark`, fraction limits, flagged state, and summaries.

This record represents the concrete question being attempted in that usage.

## 22.32 The attempt's `questionid` is the concrete version

In `question_attempts`, `questionid` points to the concrete definition in `question.id` that was used in that attempt. This preserves history even if the Question Bank receives newer versions later.

An old attempt must continue to display and grade the question the learner actually saw, not the latest version available today.

## 22.33 Variant

Some qtypes can generate variants, for example different numbers in a calculated question. The `variant` field records which variant was selected for that attempt.

This is part of reproducibility. If the learner received `x = 7`, later review must reconstruct exactly the same question rather than draw another variant.

## 22.34 Summaries

`questionsummary`, `responsesummary`, and `rightanswer` store textual representations useful for reports and review.

They do not replace the complete question data, but they prevent reports from needing to understand every internal structure of every qtype just to show a human-readable description of the response.

## 22.35 Steps

A question attempt is not a single state. Every relevant interaction creates a step stored in `question_attempt_steps`.

A step stores `sequencenumber`, `state`, `fraction`, `timecreated`, and `userid`. The sequence begins at zero and evolves as the behaviour receives actions.

This makes it possible to reconstruct the history of the question, including multiple tries, grading, and intermediate actions.

## 22.36 `question_attempt_step_data`

Specific data submitted in each step is stored in `question_attempt_step_data` as `name` and `value` pairs.

The schema documentation records important conventions: behaviour-owned data may begin with `-`, while cached values may use `_` or `_-`.

Do not parse these conventions yourself if the attempt API already gives you access to the data you need.

## 22.37 States

The Question Engine has states such as todo, complete, invalid, needs grading, graded right, partially right, wrong, and other intermediate states.

The state is a common abstraction that allows Quiz to understand the situation of the question without knowing the internals of every qtype.

This is an interesting architectural compromise. The qtype has freedom to be complex, but the consumer can still ask whether the response is complete, graded, or needs manual grading.

## 22.38 Behaviour

A behaviour defines how the learner interacts with the question during an attempt. `deferredfeedback`, `immediatefeedback`, `interactive`, adaptive behaviours, and certainty-based variants are examples.

The qtype answers what the question is. The behaviour answers how that question evolves during interaction.

## 22.39 `qbehaviour`

Question behaviours are also plugins, of type `qbehaviour`, installed under `question/behaviour`.

Creating a custom behaviour makes sense when you want to change the interaction cycle for multiple question types, not when you only want a new response format. A new type of question is a `qtype`; a new way of attempting questions is a `qbehaviour`.

## 22.40 Deferred feedback

With deferred feedback, the learner answers the questions and the main grading happens when the attempt is finished. This model is close to a traditional exam.

A step can record the response during the attempt without necessarily producing full feedback at that moment.

## 22.41 Immediate feedback

Immediate feedback allows the learner to check a question during the attempt and receive feedback immediately, according to the Quiz configuration and the qtype.

This changes the sequence of steps and the question state, but it does not require the qtype to be rewritten specifically for Quiz.

## 22.42 Interactive with multiple tries

With the interactive behaviour, the learner can try again after an incorrect response, using hints and applying penalties according to the question.

This is a good scenario for studying steps because the same question may pass through several responses and fractions before reaching its final state.

## 22.43 Penalty

`question.penalty` normally represents the default penalty used by behaviours with multiple tries. It does not automatically mean every incorrect attempt loses that amount in every behaviour.

The behaviour interprets the penalty within its own flow.

## 22.44 Display options

`question_display_options` controls which parts may be shown when rendering, such as correctness, marks, feedback, right answer, and history.

In Quiz these options are calculated from the review settings and the current stage of the attempt. Therefore, the same `question_attempt` can be rendered differently during the attempt, immediately afterwards, and after the quiz closes.

## 22.45 Question rendering

`core_question_renderer` combines the general Question Engine layout with the qtype and behaviour renderers. This is one of the cases where renderer architecture remains central and should not be replaced by an isolated template created by the consumer.

If you create a qtype, you need to respect this pipeline so review, behaviours, feedback, and accessibility work consistently.

## 22.46 Creating a QUBA programmatically

A simplified flow for using a question outside Quiz can start like this:

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context,
);

$quba->set_preferred_behaviour('deferredfeedback');

$question = question_bank::load_question($questionid);
$slot = $quba->add_question($question, 1.0);
$quba->start_question($slot);

question_engine::save_questions_usage_by_activity($quba);
```

From there, your component stores the QUBA ID so it can load it again later.

## 22.47 Do not write `question_usages` directly

Even though the schema is known, do not insert manually into `question_usages`, `question_attempts`, or the step tables. The Question Engine has a unit of work and data mapper that coordinate persistence.

If you write directly to those tables, you lose behaviour initialisation, summaries, metadata, and consistency between steps.

## 22.48 Processing responses

QUBA provides methods for processing submitted actions and updating questions. The exact format depends on how your component collects and forwards the data, but the idea is to let the engine interpret field names and behaviours.

Do not manually grade a response by reading `$_POST['answer']` and comparing it with `question_answers` if you are using the Question Engine. That ignores complex qtypes, multiple tries, files, and behaviours.

## 22.49 Saving after changes

After processing actions, save the usage with `question_engine::save_questions_usage_by_activity($quba)`. The engine knows which parts changed and persists attempts, steps, and step data in a coordinated way.

Skipping this leaves the in-memory object correct and the database stale, a particularly difficult kind of bug when the page appears to work until the next request.

## 22.50 Creating questions programmatically

Creating a question in code is different from inserting one row into `{question}`. The modern flow needs to create or update the bank entry, version, common data, qtype options, answers, hints, and files.

The base `question_type::save_question()` already coordinates much of this and should be used whenever possible.

## 22.51 Preparing form data

`save_question()` was designed to receive data in the format expected by the edit form, so programmatic creation usually builds an object similar to the form result.

A conceptual true/false example might contain name, category, question text, general feedback, default mark, penalty, and qtype-specific fields.

The important point is to inspect the actual qtype being created, because each one requires different additional options.

## 22.52 Category in the expected format

Historically the form submits the category in a format that may include the category and context separated by a comma. The base `save_question()` extracts the category and resolves the context.

This shows why copying an incomplete object from an old example may fail on a newer branch. Before automating mass creation, inspect the edit class for the selected qtype and core tests.

## 22.53 New question versus new version

If no previous question exists, the flow creates a new bank entry and version 1. When you edit a versioned question, the API may create a new version linked to the same bank entry.

Do not try to simulate a new version by copying a row from the `question` table and manually incrementing a number.

## 22.54 `question_bank::get_qtype()`

To work with the qtype handler:

```php
$qtype = question_bank::get_qtype('truefalse');
```

From there you can use the type's persistence contracts. Remember, however, that `save_question()` expects a structure consistent with that qtype and with the current Question Bank.

## 22.55 Conceptual creation example

A reduced flow may look like this:

```php
$qtype = question_bank::get_qtype('truefalse');

$question = new stdClass();
$question->qtype = 'truefalse';

$form = new stdClass();
$form->category = $categoryid . ',' . $contextid;
$form->name = 'Question created in code';
$form->questiontext = [
    'text' => 'Does Moodle have a Question Engine independent of Quiz?',
    'format' => FORMAT_HTML,
];
$form->generalfeedback = [
    'text' => 'The Question Engine can be used by other components.',
    'format' => FORMAT_HTML,
];
$form->defaultmark = 1;
$form->penalty = 1;
$form->correctanswer = 1;
$form->feedbacktrue = ['text' => '', 'format' => FORMAT_HTML];
$form->feedbackfalse = ['text' => '', 'format' => FORMAT_HTML];

$saved = $qtype->save_question($question, $form);
```

This example needs to be adapted to the branch and qtype in use, but the main idea is to call the type API instead of manually constructing the bank entry, version, and options.

## 22.56 Bulk creation requires transactions and a strategy

If you need to generate thousands of questions, do not put everything into one web request and do not create one giant transaction around the whole batch. Use a Task, process in batches, and let each question be saved through the qtype contract.

Also handle duplicates. The bank entry's `idnumber` can be useful for mapping questions from an external system without depending on `question.id`.

## 22.57 Updating questions programmatically

Modern updates need to respect versioning. If a change should produce a new version, use the same editing flow the Question Bank uses, preserving the relationship with the bank entry.

Do not update `questiontext` with SQL just because the change looks small. An old attempt may depend on the previous definition and a Quiz may be configured to use a specific version.

## 22.58 Quiz slots

The `quiz_slots` table represents positions in the Quiz structure. Each slot has `quizid`, slot number, page, `maxmark`, `requireprevious`, and additional information such as grade item when the Quiz uses subgrades.

The slot answers where the question appears and how much it is worth in that Quiz. The question identity is resolved through Question Bank references.

## 22.59 A slot is not a question attempt

A `quiz_slot` exists in the Quiz definition before any learner starts. A `question_attempt.slot` exists inside the QUBA of one concrete attempt.

They share the idea of a position, but they are different tables and lifecycles. Quiz uses its slots to build the QUBA when a new attempt begins.

## 22.60 Quiz pages

`quiz_slots.page` defines on which page each slot appears. `quiz_sections` allows sections with their own heading and shuffle setting.

Editing layout is not simply changing a string. Quiz APIs keep sequence, page breaks, slots, and references consistent.

## 22.61 Fixed questions in Quiz

When the teacher adds a specific question, the slot is associated with a `question_reference`. Depending on configuration, the reference may use a fixed version or follow the latest non-draft version.

This is much richer than the old idea of storing only `questionid` in the slot.

## 22.62 Random questions in Quiz

A random slot uses `question_set_references`, representing a set defined by filters. When the attempt is created, Quiz resolves that set and selects a concrete question.

Once the attempt exists, the Question Engine records in `question_attempt.questionid` which concrete version was actually selected.

## 22.63 Random-question filters

The set may use criteria such as category and tags, and the modern Question Bank also has an extensible filter system. This means random questions should not depend on custom SQL copied from old Moodle versions.

Use Quiz structure APIs and the filters supported by core.

## 22.64 Quiz attempts

`quiz_attempts` stores the state of the activity attempt. Important fields include `quiz`, `userid`, attempt number, `uniqueid`, state, timestamps, current page, and `sumgrades`.

`uniqueid` is especially important because it references `question_usages.id`. It is the bridge between the Quiz world and the Question Engine.

## 22.65 `quiz_attempt`

In code, the `quiz_attempt` class encapsulates an attempt and provides APIs for navigation, questions, review, timing, states, and access to the QUBA.

If you need to read an attempt in detail, prefer this class and its methods before writing manual joins across ten tables.

## 22.66 Loading an attempt

Depending on where you are in the code, you can load an attempt through a Quiz helper and obtain a `quiz_attempt` object.

The object knows the course, quiz, course module, attempt record, and question usage, reducing the chance of combining data from different attempts.

## 22.67 Quiz attempt states

The attempt may be `inprogress`, `overdue`, `finished`, or `abandoned`. This state belongs to the Quiz attempt and must not be confused with the states of individual questions.

An attempt can be `inprogress` while some questions are already graded and others are still todo.

## 22.68 `sumgrades`

`quiz_attempts.sumgrades` is the sum of the marks obtained in the slots of that attempt before scaling to the final Quiz grade.

The final grade in the gradebook may then pass through the aggregation method across attempts and the scale defined in `quiz.grade`.

Do not alter `sumgrades` manually without understanding regrading and the engine, because it is a consequence of the question state.

## 22.69 Regrade

When a question changes or a grading rule changes, Quiz can regrade attempts. The Question Engine recreates or updates grading steps while preserving the required history.

This is another reason not to treat steps as simple records that may be deleted and recreated freely.

## 22.70 Reading an attempt in detail

To investigate an attempt, I would start with `quiz_attempt`, then access the QUBA and iterate through the slots.

Conceptually:

```php
$attemptobj = quiz_attempt::create($attemptid);
$quba = $attemptobj->get_question_usage();

foreach ($quba->get_slots() as $slot) {
    $qa = $quba->get_question_attempt($slot);

    $state = $qa->get_state();
    $mark = $qa->get_mark();
    $response = $qa->get_response_summary();
}
```

The exact method names available depend on the class and branch, so check the API for the supported version, but this is the conceptual path.

## 22.71 Reading steps

When the problem is "the learner answered X, then changed to Y, and the system calculated Z", we need to go down to the steps.

```php
foreach ($qa->get_step_iterator() as $step) {
    $state = $step->get_state();
    $fraction = $step->get_fraction();
    $time = $step->get_timecreated();
    $userid = $step->get_user_id();
}
```

Then you can inspect the step data through the appropriate API.

## 22.72 Do not start with `question_attempt_step_data`

When someone reports that a response is wrong, the first reaction is often to open the step-data table and look for the value. That helps with diagnosis, but it should not become the plugin's business API.

Field names depend on the qtype and behaviour, so using this table directly couples your code to internal details.

## 22.73 Responses report and summaries

For simple reports, `responsesummary` and reporting APIs may be more appropriate than reconstructing the form data for every step.

If you need to show exactly what the learner submitted for a particular qtype, then you may need to work with the question attempt and the qtype, but keep that complexity encapsulated.

## 22.74 Question behaviours and reports

Behaviours with multiple tries generate different histories. A report that looks only at the last step may lose intermediate attempts, penalties, and feedback.

Before building analytics, define whether you want the final response, first response, all tries, or the complete path.

## 22.75 Question Bank and Quiz can version at different rates

A bank entry may gain a new version while a Quiz continues to point to one specific version. Another Quiz may track the latest version.

Therefore, "which question belongs to this Quiz?" is not answered correctly by querying `question_versions` and taking the largest version number.

Read the slot reference first.

## 22.76 Question backup

Question backup is especially delicate because questions may be shared across activities and contexts. Backup needs to transport definitions, categories, references, and attempts without creating unnecessary copies.

Chapter 24 will go deeper into backup, but here it is important to know that qtypes have specific responsibilities during restore.

## 22.77 Restore and duplicated questions

Since Moodle 4.4.6 there have been important improvements in question matching during restore to reduce duplication of shared questions. The mechanism calculates hashes, and qtypes need to provide their custom data correctly so two equivalent questions can be recognised as the same.

If a custom qtype does not participate in this matching correctly, duplicating quizzes can fill the Question Bank with unnecessary copies.

## 22.78 `restore_qtype_*_plugin`

Qtypes with their own data need to review their restore class and ensure relevant data participates in the hash and restoration process.

A type that only uses standard tables may require little customisation, but a qtype with extra tables cannot assume core will automatically know every custom column.

## 22.79 Quiz subplugins

As we saw in Chapter 20, Quiz has subplugins such as `quiz` reports and `quizaccess`. They extend Quiz, not the Question Engine.

An attempt report is a `quiz` subplugin. An access rule is `quizaccess`. A new question type is `qtype`. A new interaction model is `qbehaviour`. A Question Bank column is `qbank`.

Choosing the right plugin type avoids putting everything inside `mod_quiz` or a `local` plugin.

## 22.80 Question formats

`qformat` defines question import and export formats. Moodle XML, GIFT, and other formats live in this layer.

If your goal is to import questions from a custom academic format, do not create a qtype just because of the file format. The qtype represents the question; qformat represents how definitions enter or leave the Question Bank.

## 22.81 Creating a simple qtype

Imagine `qtype_exactphrase`, a question that accepts an exact phrase after simple normalisation. It is not pedagogically revolutionary, but it is enough to study the structure.

The teacher defines the correct response, the learner enters text, and the engine assigns fraction 1 or 0.

## 22.82 The qtype table

If we need one extra type-specific setting, we create our own table:

```
qtype_exactphrase_options
    id
    questionid
    correctphrase
    casesensitive
```

`questionid` references the concrete question definition. In qtypes that use `question_answers`, it may not even be necessary to create a table for the primary answer, depending on the design.

## 22.83 `question_type`

The class in `questiontype.php` can declare `extra_question_fields()` so the base class can automatically load and save simple type-specific options.

```
class qtype_exactphrase extends question_type {
    public function extra_question_fields() {
        return [
            'qtype_exactphrase_options',
            'correctphrase',
            'casesensitive',
        ];
    }
}
```

This avoids repetitive persistence code for simple options.

## 22.84 Question definition

In `question.php` we might have:

```php
class qtype_exactphrase_question extends question_graded_automatically {
    public string $correctphrase;
    public bool $casesensitive;

    public function get_expected_data() {
        return [
            'answer' => PARAM_RAW_TRIMMED,
        ];
    }

    public function is_complete_response(array $response) {
        return array_key_exists('answer', $response) && $response['answer'] !== '';
    }
}
```

Then come the comparison and grading methods.

## 22.85 `grade_response()`

An automatically graded qtype returns a fraction and state compatible with the response.

```php
public function grade_response(array $response) {
    $given = $response['answer'] ?? '';
    $expected = $this->correctphrase;

    if (!$this->casesensitive) {
        $given = core_text::strtolower($given);
        $expected = core_text::strtolower($expected);
    }

    if ($given === $expected) {
        return [1.0, question_state::$gradedright];
    }

    return [0.0, question_state::$gradedwrong];
}
```

The fraction remains relative; the attempt's `maxmark` determines the actual weight.

## 22.86 qtype renderer

The renderer needs to display the response control while respecting the Question Engine and display options. It receives the question attempt, options, and components prepared by the engine.

Do not create a completely separate `<form>` that ignores the field names expected by the attempt, because the engine depends on those names to reconstruct responses and steps.

## 22.87 Accessibility in a qtype

A new qtype needs to be usable from the keyboard, have correct labels, and communicate feedback and states accessibly. Questions are interactive components, and mistakes here directly affect a learner's ability to answer.

Do not use colour alone to indicate correct and incorrect, and do not hide the label simply because the field looks visually obvious.

## 22.88 qtype tests

Test `get_expected_data()`, completeness, grading, summary, save/load, and backup/restore when the qtype owns additional data.

Also test the qtype with the different supported behaviours, because a question that works with deferred feedback may expose bugs with interactive multiple tries.

## 22.89 Creating questions in code for institutional imports

A real-world case is converting an external question bank into Moodle. Do not write an SQL script that inserts into five tables, because the versioning and reference architecture changes between branches.

Create an importer that resolves the category, maps the qtype, builds data in form format, and calls the qtype API. For thousands of questions, process them in a Task with checkpoints.

## 22.90 External mapping

Use `question_bank_entries.idnumber` when you need a stable identifier coming from another system. This lets you locate the logical entry even when `question.id` changes with each new version.

This detail simplifies synchronisation and avoids depending on internal IDs that do not survive restore or migration.

## 22.91 Security

Creating, editing, and using questions requires specific capabilities in the correct context. Do not accept a `questionid` from the user and load the question without checking whether that user can access it in the bank-entry context.

For attempts, access to the Quiz and the attempt must be validated before exposing responses, right answers, or feedback that review options hide from the learner.

## 22.92 Performance

The Question Engine can generate large volumes of data. Each attempt may have dozens of question attempts, each with several steps and step-data rows. Reports that execute one query per step or load complete QUBAs for thousands of attempts can become extremely expensive.

Use reporting APIs where available, query in batches when the goal is aggregate analysis, and only load the complete attempt when you really need to reconstruct its state.

## 22.93 N+1 in attempt reports

A classic mistake is fetching one hundred `quiz_attempts` and loading the complete QUBA individually for every one. Depending on the report, that explodes into hundreds or thousands of queries.

If you only need state, grade, and timestamps, retrieve those fields directly from Quiz tables. If you need detailed responses, look for data-mapper methods intended for reporting or design a careful batch query.

## 22.94 Do not change steps to fix a grade manually

If grading is wrong, do not run `UPDATE question_attempt_steps SET fraction = ...`. This leaves state, summaries, behaviours, and regrading inconsistent.

Use the regrade or manual-grading mechanisms provided by Quiz and the Question Engine for that qtype.

## 22.95 Questions that require manual grading

Not every qtype can calculate its fraction automatically. Essay is the classic example. In those cases the state may indicate `needsgrading` until a grader assigns the mark.

The Question Engine continues recording responses and steps, while Quiz controls the grading interface and attempt updates.

## 22.96 Manual grading is not `grade_grades`

The mark for an essay question is first part of the question attempt. Then Quiz recalculates `sumgrades`, and the overall grade reaches the Gradebook.

Editing the Gradebook directly is not equivalent to grading the question because these are different layers of the assessment chain.

## 22.97 Flags

The learner can flag a question during the attempt. The `flagged` state belongs to the question attempt and is independent of correctness or grading.

This small feature again shows why the Question Engine needs its own structure instead of a simple answer/grade table.

## 22.98 Question summary versus source question

After an attempt, `questionsummary` helps preserve information about what was presented, including for randomised questions. Do not use this field as the source for recreating the original question or editing the bank.

It is a reporting summary, not the authoring model.

## 22.99 Project - create questions in code

For the first exercise, create a CLI tool that receives a category and generates ten `truefalse` questions through the qtype API. Each question should receive a stable `idnumber`, general feedback, and an identifiable name.

Run the script twice and make the second execution create a new version only when the text changed. Do not duplicate bank entries.

Then open the Question Bank and visually confirm the versions and statuses.

## 22.100 Project - inspect an attempt in detail

Choose a Quiz attempt and produce a technical report per slot containing slot number, concrete questionid, qtype, behaviour, current state, mark, maxmark, response summary, and every step with timestamp, userid, state, and fraction.

The rule for the exercise is to use `quiz_attempt`, QUBA, and Question Engine whenever possible, leaving direct SQL only for complementary diagnosis.

Compare a deferred-feedback question with an interactive one to see how the step sequence changes.

## 22.101 Project - create a simple qtype

Implement `qtype_exactphrase` with an edit form, persistence of the correct phrase, a case-sensitive option, definition class, renderer, automatic grading, response summary, feedback, and tests.

Then create two questions of this type, add them to a Quiz, and test deferred feedback and interactive behaviour. Back up the course, restore it in another environment, and confirm that the questions are not duplicated incorrectly in the bank.

Finally, edit one question to create a new version and confirm that an old attempt remains linked to the definition that was actually shown to the learner.

## 22.102 What you should take away from this chapter

Question Bank, Question Engine, and Quiz are different layers that cooperate. The Question Bank organises identity, categories, versions, and references; the Question Engine executes definitions, behaviours, attempts, steps, and states; Quiz organises slots, attempts, pages, access rules, review, and the overall grade.

The `question` table is no longer the complete identity of a question in modern versions, because `question_bank_entries`, `question_versions`, and references are now part of the model. Random questions also stopped being simply a `qtype random` and now use set references.

If you keep one practical rule from this chapter, keep this one: to create or change questions, use the Question Bank and qtype APIs; to execute questions, use the Question Engine; to manipulate Quiz, use the `mod_quiz` APIs. Direct SQL is excellent for diagnosis and specialised reports, but it is a terrible replacement for the contracts that keep these three layers synchronised.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Questions API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/question. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Question type plugins. Available at: https://moodledev.io/docs/5.1/apis/plugintypes/qtype. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Question bank plugins. Available at: https://moodledev.io/docs/5.1/apis/plugintypes/qbank. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Question bank filters. Available at: https://moodledev.io/docs/5.2/apis/plugintypes/qbank/filters. Accessed: September 2026.
* MOODLE. Moodle Developer Resources. Question type plugin restore code. Available at: https://moodledev.io/docs/5.2/apis/plugintypes/qtype/restore. Accessed: September 2026.
* MOODLE. Moodle source code. Core question engine, question usage, question type base and Quiz database schema. Available at: https://github.com/moodle/moodle. Accessed: September 2026.

{% endraw %}
