{% raw %}

# 18 ENROLMENT PLUGINS

When an external system says that a particular learner purchased a course, signed a contract, joined a class, or lost the right to access it, many developers' first impulse is to create a `local` plugin, insert something into `user_enrolments`, and then assign the student role. That may look simple in the first test, but it is exactly the kind of shortcut that ignores Moodle's architecture because enrolment is not merely a row that grants entry into a course. It has a source, instance, status, dates, role relationships, expiry, synchronization, events, backup, and rules specific to each enrolment method.

Moodle has a dedicated plugin type for this: `enrol`. An enrolment plugin does not merely create enrolments; it represents the method by which those enrolments are controlled. The distinction matters because one learner may be enrolled manually, another through a cohort, another from an external database, another by payment, and another by an institutional integration, all in the same course, each belonging to a different method instance and obeying different rules for suspension, removal, duration, and editing.

In this chapter we will use an example called `enrol_contractsync`, imagining an institution where an ERP owns academic contracts and Moodle must reflect that state. If the contract is active, enrolment needs to be active; if temporarily blocked, perhaps enrolment should be suspended; if cancelled, the institution needs to decide whether to remove the enrolment or merely suspend it to preserve history. This scenario helps explain why writing directly to tables is not the same thing as correctly implementing an enrolment method.

## 18.1 What is an enrolment plugin?

An enrolment plugin is a plugin of type `enrol`, normally installed in `enrol/nome` and identified by component `enrol_nome`. Its purpose is to define how users become enrolled in courses and how that relationship is maintained over time.

The important word is "how." Moodle already provides the general enrolment infrastructure through tables `{enrol}` and `{user_enrolments}`, but every method decides where authorization comes from, whether the user interacts with the process, whether a teacher may change the enrolment manually, whether an external synchronization exists, which dates are used, and what happens when the origin no longer considers the user valid.

For that reason, `enrol` is not merely a screen. It is the logical owner of enrolments created through its instances.

## 18.2 When to choose `enrol` instead of `local`

If the main problem is controlling who is enrolled in which courses, `enrol` should be one of the first options considered. A `local` can observe events, provide reports, or communicate with external systems, but when creating and removing enrolments becomes the central business responsibility it is usually taking on work already represented by a specific plugin type.

An ERP reporting course registrations, an institutional contract rule, a product-to-course relationship, LDAP source, academic database, or payment mechanism may justify an `enrol` plugin as long as the core relationship genuinely is course enrolment.

If the system only needs to execute an action after an enrolment occurs, an observer in another plugin type may be enough. If it needs to authenticate the user, the correct type is probably `auth`. If it sells and controls plans covering many services beyond enrolment, there may be a larger institutional layer, but enrolment creation should still reach Moodle through the Enrolment API.

## 18.3 Basic structure

A minimal plugin may begin like this:

```
enrol/contractsync/
    db/
        access.php
    lang/
        en/
            enrol_contractsync.php
        pt_br/
            enrol_contractsync.php
    lib.php
    settings.php
    version.php
```

Depending on the project, `classes/task/`, `db/tasks.php`, custom tables, services, events, forms, a privacy provider, and backup files may be added. Unlike many modern plugin types where the main class lives under `classes/`, the historical contract of `enrol` still requires the base plugin class in `lib.php`.

## 18.4 The `enrol_plugin` class

Every enrolment method derives from `enrol_plugin`. For our example:

```
class enrol_contractsync_plugin extends enrol_plugin {
}
```

This core base class contains the contracts Moodle uses to create instances, enrol, suspend, unenrol, edit, and synchronize users. The plugin should not reimplement the general enrolment-table mechanism; it should override only the points required by its own flow and delegate to `parent` when using the standard implementation.

This resembles other plugin types but matters even more here because `enrol_user()` does not write one isolated record. It coordinates enrolment, the role assigned by the method, events, and other consequences expected by the platform.

## 18.5 Plugin and instance are not the same thing

`enrol_contractsync` is the plugin installed site-wide, while an instance is a configuration of that enrolment method inside one particular course. One course can simultaneously have a manual-enrolment instance, self-enrolment instance, cohort instance, and one of our `contractsync` instances.

Depending on the method, a course may even have more than one instance of the same plugin. This is useful when each instance represents a different origin or rule, but it requires the plugin to distinguish clearly which instance owns each enrolment.

That separation explains why `enrol_user()` receives a `$instance` object. A user is not enrolled simply "by the plugin"; they are enrolled through one instance of that plugin in one course.

## 18.6 The `{enrol}` table

The `{enrol}` table stores enrolment-method instances. Important fields include the course, method name, status, default role, and generic configuration fields such as `customint*`, `customchar*`, `customtext*`, and `customdec*`.

This means the plugin does not need its own table simply to store two or three small instance settings, although custom tables still make sense for larger data models such as synchronization history, external mappings, or integration queues.

In our example, an instance might store the ERP's external class code in `customchar1` and its policy for users removed from the source in `customint1`. The generic field names are not descriptive, so code should centralize their meaning in constants or methods rather than scattering `customint3` throughout the project with nobody remembering what it means.

## 18.7 The `{user_enrolments}` table

The `{user_enrolments}` table represents the relationship between a user and an enrolment instance. It does not connect the user directly to the course because the course is already connected to the instance in `{enrol}`.

The simplified relationship is:

```
course
   |
   +-- enrol
          |
          +-- user_enrolments
                  |
                  +-- user
```

This lets Moodle know not only that a user participates in a course, but which method controls that enrolment. This is essential when several methods are active and only one of them should be synchronized or removed.

## 18.8 Enrolment and role assignment are different concepts

This is the point that needs to be clearer than anything else in this chapter. Being enrolled does not simply mean having the student role, and having a role in a course context does not necessarily mean being enrolled.

`{user_enrolments}` stores the enrolment relationship, including status and dates. Role assignments live in `{role_assignments}` and are associated with a context. An enrolment plugin normally creates an enrolment and assigns a role in course context, but these are conceptually separate operations.

That is why it is wrong to find "course students" only through `role_assignments`, and equally wrong to conclude that every enrolled user necessarily has the role you expect. Moodle documentation itself points out that somebody can be enrolled without a role and can have a role without an enrolment.

## 18.9 A role may exist without an enrolment

Administrators, managers, and institutional customizations make this particularly clear. A user may have a role assignment in a given context while having no corresponding `user_enrolments` record for that course.

This detail appears in checks such as `is_enrolled()`, participant listings, activities requiring participation, and the gradebook. Capabilities and enrolment answer different questions. A capability says what a user can do in a context; enrolment represents formal participation controlled by an enrolment method.

If your requirement says "only enrolled participants may submit," checking only `has_capability()` may be insufficient.

## 18.10 How Moodle decides whether an enrolment is active

Having one row in `{user_enrolments}` is not enough to consider an enrolment active. Moodle combines several states because an enrolment may not have started yet, may already have ended, may be suspended, its instance may be disabled, or even the plugin itself may be disabled site-wide.

In practical terms, the enrolment record, `timestart`, `timeend`, user status, instance status, and overall plugin state all participate in the decision. This prevents every plugin from inventing its own `active` field while ignoring dates and method configuration.

## 18.11 Instance status

An instance in `{enrol}` has its own status. A disabled instance continues to exist but no longer provides active enrolment through that method.

This differs from suspending one specific user. If an instance representing class `ERP-2026-03` is disabled, the problem concerns the whole source in that course; if only one contract was blocked, status belongs in that user's `user_enrolments`.

The distinction helps prevent solutions that suspend hundreds of users when the rule actually was to temporarily disable one instance.

## 18.12 `ENROL_USER_ACTIVE` and `ENROL_USER_SUSPENDED`

A user's enrolment status normally uses `ENROL_USER_ACTIVE` or `ENROL_USER_SUSPENDED`. Suspension preserves the enrolment relationship but prevents normal participation through that enrolment.

Suspension is very useful in academic integrations. Imagine a learner with a temporary financial hold. If institutional policy requires preserving history and restoring access once the situation is resolved, suspension may represent the state better than completely removing the enrolment.

But this is not a purely technical choice. It needs to reflect institutional policy because removal may have different consequences in reports, groups, roles, and historical-data visibility.

## 18.13 `timestart` and `timeend`

An enrolment can have a start and end date. These fields allow future access or limited participation through a given date without requiring a task to manually enable and disable every user at the exact minute.

```php
$timestart = strtotime('2026-10-01 00:00:00');
$timeend = strtotime('2026-12-31 23:59:59');
```

A common mistake is treating `timeend` as merely visual information. It participates in effective enrolment state, so reports and integrations need to understand that a relationship can remain stored while no longer being active due to time rules.

## 18.14 Obtaining the plugin with `enrol_get_plugin()`

When other code needs to operate an enrolment through one method, obtain the plugin through the API:

```php
$plugin = enrol_get_plugin('contractsync');
```

If the plugin exists, `$plugin` is an instance of `enrol_contractsync_plugin`. From there, code can call public Enrolment API methods instead of changing `{user_enrolments}` directly.

This preserves plugin contracts and lets overridden methods apply additional rules.

## 18.15 Obtaining instances with `enrol_get_instances()`

To discover enrolment methods configured in a course, use `enrol_get_instances()`:

```php
$instances = enrol_get_instances($courseid, true);
```

The second parameter controls whether only enabled instances are returned. An integration will often filter further using `enrol`:

```php
foreach ($instances as $instance) {
    if ($instance->enrol !== 'contractsync') {
        continue;
    }

    // Esta instância pertence ao nosso método.
}
```

Do not assume there is only one instance per course when the plugin design permits several.

## 18.16 Creating an instance

`add_instance()` creates an enrolment-method instance in a course. This is different from enrolling one user.

```php
$plugin = enrol_get_plugin('contractsync');

$instanceid = $plugin->add_instance($course, [
    'status' => ENROL_INSTANCE_ENABLED,
    'roleid' => $studentroleid,
    'customchar1' => 'ERP-TURMA-2026-03',
]);
```

After that, the instance exists and can begin controlling users. In a synchronized plugin, an administrator or teacher may configure the instance and a later task fetches participants.

## 18.17 Standard editing interface

Moodle has a standard interface for adding and editing enrolment instances. When the plugin can fit its flow into that interface, it is generally better than inventing independent pages for settings that clearly belong to the instance.

Methods such as `use_standard_editing_ui()`, `edit_instance_form()`, `edit_instance_validation()`, `can_add_instance()`, and `add_instance()` integrate the plugin with course enrolment-method management.

The logic resembles what we discussed in the Forms API: use the standard flow when it solves the problem because it reduces inconsistencies in navigation, capability, validation, and future maintenance.

## 18.18 `can_add_instance()`

`can_add_instance()` answers whether the current user may add an instance of that method to a course. This should not be decided merely by whether somebody can open a URL.

An institutional plugin may require a capability such as `enrol/contractsync:config`, while a fully automated plugin may not allow teachers to create instances manually at all.

The interface needs to reflect the actual rule, but processing must also enforce it because hiding a button is not authorization.

## 18.19 `allow_enrol()`

`allow_enrol()` indicates whether other code can manually enrol users in that instance through the standard flow. This makes sense for a genuinely manual method but can be dangerous in an ERP-synchronized method.

Imagine a teacher manually enrols somebody into `contractsync` without an ERP contract. On the next synchronization the plugin will probably remove or suspend that user, creating a confusing experience. Externally controlled plugins therefore normally restrict manual editing.

## 18.20 `enrol_user()`

The central operation for creating an enrolment is `enrol_user()`:

```php
$plugin->enrol_user(
    $instance,
    $userid,
    $roleid,
    $timestart,
    $timeend,
    ENROL_USER_ACTIVE
);
```

Prefer this method over direct inserts into `{user_enrolments}` followed by creating `role_assignments`. Core understands the relationship between enrolment, role assignment, and events, while a manual sequence tends to forget some detail.

A plugin may override `enrol_user()` to enforce its own rules and then call `parent::enrol_user()`, but it should not duplicate the complete core implementation.

## 18.21 The role passed to `enrol_user()`

`roleid` represents the role the instance assigns to the user in course context. In many cases it is the student role, but this is not mandatory.

The instance itself may also contain `roleid` as the default role. The rule needs to be clear because inconsistent role selection can produce valid enrolments with incorrect permissions.

If the external integration sends an academic profile, do not accept any arbitrary role ID supplied from outside. Use a controlled mapping and validate whether that role may genuinely be assigned in that context.

## 18.22 `recovergrades`

When reenrolling a user who previously participated in a course, Moodle can restore grade history removed during a previous unenrolment depending on policy and the `recovergrades` parameter.

This is a good example of a detail easily lost if a developer treats enrolment as `INSERT INTO user_enrolments`. The API knows an enrolment lifecycle has consequences elsewhere and exposes specific parameters accordingly.

The decision to recover grades should follow institutional rules rather than being enabled automatically without understanding the earlier enrolment.

## 18.23 Updating enrolment with `update_user_enrol()`

When the user still belongs to the same instance but status or period changes, there is no need to remove and recreate the enrolment. Use `update_user_enrol()`:

```php
$plugin->update_user_enrol(
    $instance,
    $userid,
    $newstart,
    $newend,
    ENROL_USER_ACTIVE
);
```

This is particularly important in synchronization because preserving the same relationship reduces side effects and preserves the meaning that "this enrolment continues to be controlled by the same source."

## 18.24 Suspending instead of removing

Suspension is often the better choice when the academic relationship still exists but access needs to be temporarily blocked. An unpaid contract, locked academic enrolment, or temporary leave may fit this category depending on institutional policy.

```php
$plugin->update_user_enrol(
    $instance,
    $userid,
    null,
    null,
    ENROL_USER_SUSPENDED
);
```

In practice you normally preserve existing dates rather than blindly passing `null` because the exact signature and behavior need to be checked for the supported Moodle version. The example demonstrates intent: update enrolment state instead of reconstructing the whole enrolment.

## 18.25 Removing with `unenrol_user()`

When policy genuinely requires ending that enrolment, use:

```php
$plugin->unenrol_user($instance, $userid);
```

Unenrolment does not mean deleting every contribution made by that user in the course. Forum posts, submissions, and other data have their own rules. Moodle tries to preserve content that needs to remain visible to other participants while some participation data may no longer appear in certain interfaces.

That is why `unenrol_user()` is an operation with consequences rather than simply changing one flag.

## 18.26 Unenrolling is not deleting the user

It sounds obvious, but poor integrations sometimes mix these concepts. Removing somebody from a course should not delete their account, just as deleting an account should not be the normal mechanism for removing course access.

User, enrolment, role, and participation are separate layers. The more accurately the plugin respects these boundaries, the fewer surprises appear when one person participates in many courses through different methods.

## 18.27 `allow_unenrol()`

`allow_unenrol()` tells Moodle whether external operations may remove all users from that instance, for example during some reset or management flows.

In a synchronized method you may decide nobody should manually remove ERP-controlled enrolments because it would break the source-of-truth model. In other cases the operation may be acceptable provided the corresponding capability also exists.

The answer should reflect data ownership, not interface convenience.

## 18.28 `allow_unenrol_user()`

`allow_unenrol_user()` permits a more specific decision for one individual enrolment. A pattern used by some plugins is allowing manual removal only when the enrolment is already suspended.

That can make sense because the plugin may say: while the external source considers the user active, a teacher cannot remove them; after the source suspends the enrolment, manual cleanup may be allowed.

This avoids the classic conflict where a teacher removes somebody and an external task recreates the enrolment a few minutes later.

## 18.29 `allow_manage()`

`allow_manage()` controls whether other code may manually alter status and dates of that enrolment. Synchronization plugins normally return `false` because manual changes would be reverted during the next synchronization.

If the ERP says the enrolment ends on November 30, allowing a teacher to change `timeend` to December creates information lasting only until the next cron. It is better to prevent editing than present a form that lies to the user.

## 18.30 `roles_protected()`

`roles_protected()` controls whether roles assigned by this enrolment method may be changed by other flows. By default protection exists precisely because that role may be part of the enrolment contract.

In an external method, manually removing the student role while keeping the enrolment may leave the user in a state that is difficult to interpret. If the integration owns that assignment, protecting the role is coherent.

If the project wants roles to be administered separately, that needs to be an explicit and tested decision.

## 18.31 Plugin capabilities

An enrolment plugin normally defines capabilities in course context. Depending on the flow, these may include:

```
enrol/contractsync:config
enrol/contractsync:enrol
enrol/contractsync:manage
enrol/contractsync:unenrol
enrol/contractsync:unenrolself
```

Not all are mandatory. An automatic synchronizer may only need `config`, while a manual method may expose `enrol`, `manage`, and `unenrol`.

A capability alone also does not replace methods such as `allow_manage()`. The two mechanisms complement each other: one determines whether the plugin permits an operation, while the other determines whether the current user is authorized to perform it.

## 18.32 Self-enrolment is a different flow

In `enrol_self`, the user initiates the enrolment. This requires a different interface from an automatic synchronizer because the plugin needs to decide whether to show a link, present a form, validate an enrolment key, apply cohort restrictions, or enforce other conditions.

Interactive plugins may override methods such as `show_enrolme_link()` and `enrol_page_hook()`. This demonstrates why one plugin type can support very different workflows connected by the same enrolment concept.

Do not copy the entire `enrol_self` implementation just to create an external synchronizer. Implement only the contracts matching your workflow.

## 18.33 Fully automatic plugins

A plugin such as our `contractsync` may present no form to the learner at all. The enrolment exists because an external source says it should.

In that case the architecture normally combines one instance per course or class, a synchronization task, mapping to an external key, and clear creation, update, suspension, and removal policies.

A teacher does not need to "click to synchronize" when the process is recurring, although a manual administrative action may exist for diagnostics.

## 18.34 Source of truth

Before writing the task, decide who wins. If the ERP is the source of truth, Moodle should not allow local changes that will later be silently overwritten. If Moodle can augment data, clearly separate which fields are local and which are externally owned.

This concept resolves many decisions. If the ERP controls start and end dates, the task updates `timestart` and `timeend`. If the teacher may extend enrolment locally, synchronization cannot simply overwrite `timeend` every time it runs.

Without a source-of-truth definition, the plugin becomes a conflict between interfaces.

## 18.35 Strategies when a user disappears from the source

Core defines policies used by several synchronization plugins. Conceptually these include removing, keeping, suspending while retaining roles, and suspending while removing roles.

Conceptually:

```
UNENROL              remove a matrícula
KEEP                  mantém como está
SUSPEND               suspende e mantém os papéis
SUSPENDNOROLES        suspende e remove papéis controlados pela instância
```

The real core constants begin with `ENROL_EXT_REMOVED_`. Use those constants rather than magic numbers and explain the option to administrators because every choice changes the user experience and visibility in reports.

## 18.36 Synchronization through Scheduled Task

An external source with thousands of contracts should not be queried during every `require_login()`. The natural place is a Scheduled Task:

```
enrol/contractsync/
    classes/
        task/
            sync_enrolments.php
    db/
        tasks.php
```

The task retrieves changes, resolves the corresponding instance, compares external state with Moodle, and applies only what is necessary.

If processing is large, use Chapter 11 strategies such as batches, checkpoints, logs, locks, and optionally Adhoc Tasks to divide the work.

## 18.37 The task needs to be idempotent

Running the task twice with the same source data should result in the same state. That means no duplicate enrolment, no repeated welcome message, and no artificial events when nothing actually changed.

A typical flow first discovers whether `{user_enrolments}` already exists for that user and instance. If it does, compare status and dates before updating. If it does not, enrol the user.

Idempotency matters because cron may fail midway, execute again, use multiple workers, or receive the same external record more than once.

## 18.38 `sync_user_enrolments()`

The base class provides a per-user synchronization point used by core in specific scenarios. Some methods may override `sync_user_enrolments($user)` when recalculating one user's enrolments makes sense.

That does not make login the right place to synchronize an entire ERP. Infrastructure still needs frequency and cost protection. If processing involves large external queries, prefer Scheduled Tasks and keep any per-user synchronization extremely cheap and controlled.

## 18.39 Incremental synchronization

Fetching every enrolment in every course every minute may work for one hundred learners and fail for one hundred thousand. A mature integration looks for changes since the last cursor, timestamp, or processed identifier.

For example, the ERP may expose:

```
GET /enrolments?updated_after=2026-09-23T18:00:00
```

The plugin processes only changes, safely records the cursor, and periodically runs a complete reconciliation to correct divergence. This reduces load without assuming no update will ever be missed.

## 18.40 Locks and multiple workers

If two executions synchronize the same instance simultaneously, races, duplicate messages, and conflicting updates may occur. Use the Lock API when there is a real concurrency risk.

The lock may be per instance, per course, or per integration partition depending on scale. A global lock is simpler but destroys parallelism; a granular lock requires more design but scales better.

Do not attempt to solve this with an `running = 1` field without expiry and atomicity.

## 18.41 Cohorts and enrolment

A cohort is a collection of users in a context, while enrolment is participation in a course. The `enrol_cohort` plugin connects these concepts by synchronizing cohort members into an enrolment instance in the course.

This differs from "enrol the current cohort members once." With synchronization, when cohort membership changes, enrolment follows according to the method's policy.

That distinction needs to be clear when choosing between a one-off action and a permanent link.

## 18.42 A cohort is not automatically a course class

Many institutions use the word class or cohort for several different concepts, but Moodle distinguishes them. A cohort may exist at system or category level, a group exists inside a course, and an enrolment instance connects users to the course.

If an external academic class corresponds to a cohort, you may use `enrol_cohort`. If it has specific contract, calendar, and source rules, a dedicated enrolment plugin may represent it better.

Do not choose the Moodle structure solely by the term used in the ERP.

## 18.43 Synchronization with groups

Some enrolment plugins also add users to course groups. This is useful when an instance represents one particular class and participants need to remain separated inside activities.

But group membership and enrolment are still different concepts. The plugin should treat group membership as a controlled consequence of the instance, and removal needs to remain coherent with unenrolment and suspension policies.

If the institution permits manually moving learners between groups, decide whether the next synchronization should preserve or overwrite that local change.

## 18.44 Enrolment expiry

When a plugin uses `timeend`, it needs to decide what happens after that date. Core supports expiry processing and notifications for methods implementing the corresponding behavior.

Methods such as `process_expirations()` and `send_expiry_notifications()` exist because expiry is more than noticing a timestamp passed. Policy may require suspending, unenrolling, notifying the user, or notifying responsible staff.

Do not create a parallel task without first checking the contract already offered by the Enrolment API.

## 18.45 Expiry notifications

An institution may want to warn learners several days before enrolment ends. That requires more than sending an email when `timeend < time()` because the plugin must control the notification window, prevent duplicates, respect instance configuration, and choose an appropriate message channel.

If the method already uses core expiry support, keep the logic integrated with it. If you need an additional institutional rule, explicitly record when a message was sent or derive the notification window idempotently.

## 18.46 Integration with external systems

An external enrolment plugin normally needs to map at least three things: user, course, and instance/source. The worst mistake is trusting Moodle's internal IDs as durable identifiers in an external system.

Prefer `idnumber`, controlled fields, or an explicit mapping table:

```
external_course_id -> courseid
external_user_id   -> userid
external_class_id  -> enrol_instance_id
```

This allows environments to be migrated, courses restored, and internal IDs changed without breaking the integration.

## 18.47 Never write directly to `{user_enrolments}` to "save time"

The table is visible, its structure looks simple, and an `INSERT` works. Even so, this bypasses the plugin contract, role assignment, events, callbacks, and other consequences Moodle expects.

The same applies to `role_assignments`. If your intention is to create an enrolment, use the Enrolment API. Direct table access may be legitimate for reporting and diagnostics, but should not replace the API for normal mutations.

This is a principle running through the whole book: reading an internal table may be acceptable in specific situations, but writing around the public contract is usually where difficult bugs begin.

## 18.48 Payment enrolment

Payment is an interactive flow where a user acquires the right to be enrolled after a charge is confirmed. The enrolment plugin remains responsible for the relationship with the course, but financial processing should not be reinvented inside it if the platform already provides the Payment API and gateways.

The enrolment method defines price, currency, instance, and what happens after confirmation, while the gateway communicates with the payment provider. This separation allows PayPal, Pix, cards, or another gateway to be changed without turning every enrolment method into a complete financial integration.

## 18.49 Do not confuse payment gateway with enrolment method

A gateway answers "how do we charge?" The enrolment plugin answers "what does payment grant?" The distinction seems semantic until the same gateway needs to serve another type of purchase or the same enrolment method needs to accept another provider.

If `enrol` directly calls a card API, implements its own webhook, stores the transaction, and also controls enrolment, it begins accumulating responsibilities. In larger institutional projects, separate charging, confirmation, and enrolment behind clear contracts.

## 18.50 Confirmed payment must be idempotent

Financial webhooks may arrive more than once. Never assume "payment approved" will be delivered exactly once.

Before enrolling, verify whether the transaction has already been processed and whether the enrolment already exists in that instance. The second receipt should end in the same state, not create another enrolment, role assignment, or welcome message.

The principle is the same as Tasks in Chapter 11 and webhooks in Chapter 14.

## 18.51 Enrolment events

The Enrolment API triggers events related to the enrolment lifecycle. These are useful for auditing, secondary integrations, and functionality that needs to react after something happened.

If another plugin needs to inform a CRM that a learner was enrolled, observing the event may be more appropriate than coupling the CRM into every enrolment method.

But remember Chapter 10's rule: an Event represents a fact that happened. Do not use an observer to attempt to prevent an enrolment that should have been blocked by the method or authorization beforehand.

## 18.52 An observer should not become a second enrolment source

It is possible to observe one event and then create another enrolment, which may be legitimate in a well-defined flow, but can also create difficult-to-follow chains. One enrolment triggers an event, an observer enrols in another course, a new event fires, and another rule executes.

If there is an institutional cascade rule, document the origin, avoid loops, and prefer an explicit orchestration layer. Events are excellent for decoupling but should not hide the business model.

## 18.53 Backups need to understand enrolment origin

When a course is backed up, enrolment instances are part of course context and may participate in restore. Correct behavior depends on the method.

A manual enrolment can be restored differently from one controlled by an ERP. If the external origin remains the source of truth, restoring old users as though they were still valid may be wrong.

That is why `enrol` has its own backup and restore extension points and more complex plugins may need to implement methods for restoring the instance and user enrolments.

## 18.54 Restoring instances

During restore, Moodle needs to decide whether to create a new instance, reuse an existing one, or ignore a given method. The plugin can control this behavior when the default does not represent its case.

In `contractsync`, for example, an instance restored into a test Moodle should not immediately begin synchronizing with a production class merely because `customchar1` preserved the external identifier. The restored instance may need to be disabled or require remapping.

This is a real architectural problem, not merely a backup detail.

## 18.55 Restoring user enrolments

Restore must also decide what to do with users who were enrolled through the original instance. In an external method it often makes sense to let synchronization rebuild current state rather than blindly trust the old snapshot.

In other scenarios preserving a suspended enrolment may be required to keep history. The plugin needs to make that choice consciously through enrolment restore contracts instead of manipulating tables after backup finishes.

## 18.56 Roles during restore

Because enrolment and role are separate, restore needs to consider both. If the enrolment method controls the role, the plugin needs to preserve the correct relationship between the new instance, restored user, and component-managed role assignment.

This is where manual SQL solutions usually fail because the `itemid` of an assignment may point to the old instance and IDs change during restore.

Backup and restore exist specifically to remap internal identifiers safely.

## 18.57 `find_instance()` and CSV course creation

Plugins capable of uniquely identifying an instance from declarative data can implement `find_instance()`. This enables integration with flows such as CSV course upload.

The method needs to distinguish one instance without ambiguity. In cohort enrolment, for example, a combination of identifiers may be enough, while in more complex methods there may be no stable field set uniquely identifying one instance.

Do not implement it merely to "support CSV" if two instances can answer to the same set of fields.

## 18.58 Security in enrolment plugins

Enrolment changes course access, so any endpoint creating, suspending, or removing users is a sensitive authorization operation. Validate course context, capability, `sesskey` in browser actions, and ownership of the instance.

In Web Services use `validate_context()` and appropriate capabilities. Tasks have no interactive user to authorize, so trust comes from secure integration configuration, credentials, and internal plugin rules.

Do not accept `courseid`, `userid`, `roleid`, and `enrolid` from a client and conclude the combination is valid merely because all four are integers.

## 18.59 Performance and large volumes

Synchronizing enrolment for an entire university may involve millions of relationships. The first concern is avoiding one query per learner inside a loop when one bulk query can solve the same problem.

Load the existing enrolments for an instance, index by `userid`, compare in memory when volume permits, and process in batches. At larger scale, use recordsets and partitioning.

Also avoid one external call per user. If the ERP offers batch, page, or change-stream APIs, use them. Network cost can be much greater than local database cost.

## 18.60 Synchronization logs

A task that only prints "sync finished" is nearly useless when somebody asks why learner 48321 lost access. Record enough information to diagnose the flow without exposing sensitive data.

A useful log can include:

```
instância 87
curso 214
origem ERP-TURMA-2026-03
processados 1450
criados 12
reativados 4
suspensos 7
removidos 0
erros 2
```

For individual investigation, keep a correlation identifier or audit table if the institution genuinely requires that history.

## 18.61 Common errors

The first error is writing directly to `{user_enrolments}`. The second is treating role as synonymous with enrolment. The third is allowing manual edits in an instance that the ERP will overwrite. The fourth is using `unenrol_user()` for every temporary absence when policy should suspend. The fifth is synchronizing everything at login. The sixth is processing the whole dataset in one transaction or request.

Another frequent error is failing to distinguish plugin from instance. Code searches for "the contractsync instance" and simply takes the first one even though a course may have several. When multiple instances are supported, the external key needs to identify which one owns the enrolment.

## 18.62 A complete flow for `enrol_contractsync`

Imagine a mature synchronization sequence. The task asks the ERP for changes since the last cursor and discovers external user `A9842` now has an active contract in class `T2026-03`. The plugin resolves `A9842` to a `userid`, resolves the class to an `enrol_contractsync` instance, searches for an existing enrolment, and finds none.

Then it calls:

```php
$plugin->enrol_user(
    $instance,
    $userid,
    $instance->roleid,
    $contract->timestart,
    $contract->timeend,
    ENROL_USER_ACTIVE
);
```

Some days later the contract becomes blocked. The task finds the same enrolment and calls `update_user_enrol()` to suspend it. When the contract returns to regular state, the same relationship is reactivated without removing and recreating the enrolment.

If the contract ends permanently, behavior depends on `External unenrol action`. One institution may use `SUSPEND`, another `UNENROL`, and code does not need to hide that policy in a fixed `if`.

## 18.63 What belongs to the plugin and what belongs to core

The plugin decides where truth comes from, how instances are mapped, which policy applies, when synchronization runs, and which settings are exposed. Core should remain responsible for creating and updating enrolment relationships, assigning roles through the API contract, triggering events, and maintaining general infrastructure.

This separation is what lets an enrolment plugin remain compatible with the rest of Moodle. The more it replaces the Enrolment API with custom SQL, the more it becomes a parallel enrolment system inside Moodle.

## 18.64 Exercise — enrolment synchronized with an external system

Create a `enrol_academicsync` plugin representing classes coming from an academic system. Every instance must have an external identifier, default role, a policy for users removed from the source, and an option enabling or disabling synchronization.

Implement a Scheduled Task reading a simulated source, which can be a plugin table or test JSON, and synchronize users in batches. If the enrolment does not exist, create it through the Enrolment API; if it exists and the dates changed, update it; if the user was blocked, suspend it; if the user disappeared from the source, apply the configured policy.

Add configuration and management capabilities, but make `allow_manage()` return `false` when the instance is in authoritative-external-source mode. Record one summary per execution, protect the task with a lock per instance, and guarantee two consecutive executions with identical input do not modify the same records again.

Then test four scenarios many implementations ignore: a user with a course role but no enrolment, a user enrolled without the expected role, two instances of the plugin in the same course, and restoring the course to another installation where the external identifier must not immediately start synchronization.

If the exercise only works in the happy path where every course has one instance, every user has exactly one role, and the integration never fails, it is not ready.

## Technical references consulted

* MOODLE. Enrolment plugins. Moodle Developer Resources, Moodle 5.1 documentation. Available at: https://moodledev.io/docs/5.1/apis/plugintypes/enrol. Accessed September 2026.
* MOODLE. Enrolment API. Moodle Developer Resources, Moodle 5.0 documentation. Available at: https://moodledev.io/docs/5.0/apis/subsystems/enrol. Accessed September 2026.
* MOODLE. Core enrolment implementation, `lib/enrollib.php`. Official Moodle repository on GitHub. Accessed September 2026.

{% endraw %}