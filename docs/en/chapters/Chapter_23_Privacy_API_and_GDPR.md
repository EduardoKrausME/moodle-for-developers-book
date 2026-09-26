{% raw %}

# 23 PRIVACY API AND GDPR

When the Privacy API appeared in Moodle, many people treated it as one more bureaucratic requirement: create `classes/privacy/provider.php`, implement an interface, and make Plugin Validate stop complaining. That is probably the worst way to think about the problem, because the Privacy API does not exist to satisfy the validator; it exists to force a plugin to answer questions that should have been part of the design from the beginning: which personal data it stores, why it stores it, in which contexts that data exists, how a user can receive a copy of what belongs to them, and what should happen when a deletion request exists.

In a small plugin this may look simple. One table has `userid`, so we export that row and delete it when requested. In a real plugin, however, data may be spread across custom tables, the File API, preferences, tags, comments, ratings, logs, external services, and subplugins. Some information needs to be deleted, some needs to be anonymised because it belongs to a shared structure, and some does not even belong directly to the plugin although the plugin created it through a core subsystem.

In this chapter we will work with an example called `mod_reflection`, an activity in which the learner writes a reflection, can attach files, and has an individual display preference. The activity can also optionally send a copy of the text to an external analysis service. This example lets us cover almost all the important problems: metadata, context lists, user lists, export, deletion, files, preferences, external locations, and responsibility boundaries between components.

The legal aspects of GDPR and Brazil's LGPD will not be treated as legal advice here. The goal is technical: understand what Moodle expects a plugin to be able to describe and execute. The institution remains responsible for defining legal basis, retention, purpose, and policies, while the plugin must provide correct mechanisms so those policies can be applied.

## 23.1 Why the Privacy API exists

The Privacy API was created to standardise two families of problems. The first is describing which types of personal data a component processes. The second is allowing administrative tools to execute requests related to that data, such as export and deletion.

Without a common API, every plugin would need to invent its own export page, its own deletion routine, and its own way of explaining what it stores. That would be impractical on an installation with hundreds of components.

Moodle therefore defines a contract. Each component reports what it stores and implements the necessary providers. `core_privacy` coordinates those providers, and tools such as `tool_dataprivacy` can work with the whole set without knowing the internal details of every plugin.

## 23.2 Privacy API is not a privacy policy

Implementing the Privacy API does not mean the site automatically complies with GDPR, LGPD, or any other legislation. The API provides technical mechanisms, but it does not decide purpose, legal basis, retention period, or contractual obligations.

If an institution has decided to keep assessment records for five years, the plugin needs to be able to identify those records and participate in the correct process, but the provider does not invent that retention period.

Likewise, a deletion request may conflict with institutional or legal rules that require certain evidence to be preserved. The Privacy API provides export and removal mechanisms, while the decision about when a request may be approved belongs to the institution's process.

## 23.3 Every plugin needs to be audited

The most important idea is this: even a plugin that does not store personal data should state that conclusion consciously.

Simply omitting `provider.php` is not enough. The absence of a provider does not tell us whether the developer audited the component or simply forgot the Privacy API. That is why `null_provider` exists: it explicitly represents the conclusion that the plugin does not store, process, or send personal data that needs to be declared by that component.

The provider is therefore also evidence of an architectural review.

## 23.4 Where the provider lives

The standard implementation lives in:

```
classes/privacy/provider.php
```

For `mod_reflection`, the namespace is:

```
namespace mod_reflection\privacy;
```

The class must be named `provider` because the privacy manager discovers the implementation through that convention.

## 23.5 Metadata provider and request providers

The architecture is divided into two main groups. The metadata provider describes data processed by the component. Request providers allow Moodle to find, export, and delete data.

A plugin that stores personal data normally implements:

```
\core_privacy\local\metadata\provider
\core_privacy\local\request\plugin\provider
\core_privacy\local\request\core_userlist_provider
```

Depending on the case, it may also implement a user-preference provider or specific contracts defined by subplugin parents and subsystems.

## 23.6 `metadata\provider`

The metadata provider has one central method:

```php
public static function get_metadata(collection $collection): collection
```

It does not export data and it does not delete anything. Its job is to describe what the component stores or processes.

This is more important than it may appear because this description feeds privacy reports and administrative documentation. An `ipaddress` field that is not declared is still personal data; the difference is that the plugin is now documented incorrectly as well.

## 23.7 What counts as personal data for the plugin

Do not look only for fields named `userid`, `email`, or `name`. Personal data can appear in many forms.

A response written by a learner is obviously personal content. An IP address can identify or help identify a person. A timestamp linked to a user reveals activity. An external identifier may allow correlation with another system. Interface preferences, messages, logs, and files can also be part of the set.

The correct question is not "is this column called userid?", but "is this data related to an identified or identifiable person within the context in which the plugin operates?".

## 23.8 The example table

Imagine that `mod_reflection` has a table:

```
reflection_entries
    id
    reflectionid
    userid
    text
    textformat
    ipaddress
    timecreated
    timemodified
```

All of these fields participate in the user's data to some extent. Even `reflectionid` matters because it explains in which activity the entry was created.

In the metadata provider we can declare:

```php
$collection->add_database_table(
    'reflection_entries',
    [
        'reflectionid' => 'privacy:metadata:reflection_entries:reflectionid',
        'userid' => 'privacy:metadata:reflection_entries:userid',
        'text' => 'privacy:metadata:reflection_entries:text',
        'ipaddress' => 'privacy:metadata:reflection_entries:ipaddress',
        'timecreated' => 'privacy:metadata:reflection_entries:timecreated',
        'timemodified' => 'privacy:metadata:reflection_entries:timemodified',
    ],
    'privacy:metadata:reflection_entries'
);
```

## 23.9 Descriptions belong in language strings

Metadata should not contain hard-coded explanatory text. Each field and each structure should point to strings in the component.

```
$string['privacy:metadata:reflection_entries'] =
    'Stores reflections submitted by users.';
$string['privacy:metadata:reflection_entries:ipaddress'] =
    'The IP address recorded when the reflection was submitted.';
```

This allows the description itself to be translated and displayed correctly in administrative tools.

## 23.10 Do not declare the entire table out of laziness

`add_database_table()` expects the fields that matter for privacy, not a dump of `install.xml`.

If a column is merely an internal technical key with no informative relationship to the user, it may not need an individual description. On the other hand, hiding a sensitive field because it is "just technical" is a mistake.

Use metadata to document the data model that matters for privacy, not to copy the schema mechanically.

## 23.11 Data stored in Moodle subsystems

A plugin may not have its own table for a particular piece of data and still be responsible for declaring that it uses a core subsystem.

Examples include files, tags, ratings, and other subsystems that have their own privacy providers.

The current collection API provides `add_subsystem_link()` to register that relationship:

```php
$collection->add_subsystem_link(
    'core_files',
    [],
    'privacy:metadata:core_files'
);
```

The exact subsystem name must follow that feature's contract. Do not invent an identifier simply because it sounds descriptive.

## 23.12 `add_subsystem_link()` and the legacy method

Older code may still use `link_subsystem()`, but the current collection implementation marks that method as legacy and recommends `add_subsystem_link()`.

This difference is worth recording because many Privacy API examples were written in 2018 and are still circulating. The concept remains valid, but the API evolved.

In new code, prefer the current method.

## 23.13 User preferences

User preferences are also data that must be described when they are persisted.

If `mod_reflection` stores:

```
set_user_preference('mod_reflection_compactview', 1);
```

The metadata needs to include:

```php
$collection->add_user_preference(
    'mod_reflection_compactview',
    'privacy:metadata:preference:compactview'
);
```

And if the preference can be exported as a global preference, the plugin should implement the corresponding provider.

## 23.14 Session data is not long-term persistence

The privacy subsystem documentation makes a useful distinction. Data kept only in the session does not need to be exported as persistent plugin storage because the session is temporary and is not available to an export process run later.

That does not mean you can place anything in the session without security concerns. It only means the Subject Access Request contract does not treat temporary session state as persistent storage owned by the component.

## 23.15 Data sent to an external service

Our `mod_reflection` may optionally send the reflection text to an external analysis service. Even if the plugin does not keep an additional local copy of that transmission, it processes personal data and must declare the external destination.

The current API provides `add_external_location_link()`:

```php
$collection->add_external_location_link(
    'reflectionanalysis',
    [
        'userid' => 'privacy:metadata:external:userid',
        'text' => 'privacy:metadata:external:text',
    ],
    'privacy:metadata:external'
);
```

This reports that certain data may leave Moodle under the responsibility of that component.

## 23.16 `link_external_location()` is legacy

As with subsystems, there is a historical `link_external_location()` method. The current collection implementation recommends `add_external_location_link()`.

Maintainers of old plugins do not need to rename things blindly without testing supported branches, but new code should prefer the newer API.

## 23.17 Sending data out and being unable to retrieve it later

An uncomfortable case appears when a plugin sends data to an external API but that API provides no endpoint to retrieve or delete individual content.

The Privacy API cannot invent a capability that the external service does not have. The plugin should declare the transmission and implement its request provider consistently with what it can actually do, while the institution needs to understand that limitation before approving use of the service.

This is exactly why privacy should be considered before contracting and integrating an API, not afterwards.

## 23.18 `null_provider`

Plugins that genuinely do not store or send personal data may implement:

```
class provider implements
    \core_privacy\local\metadata\null_provider {

    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
```

The string should explain why the plugin does not store personal data.

This is a strong statement. Do not use `null_provider` as a shortcut to avoid implementing the rest.

## 23.19 When `null_provider` cannot be used

The documentation is quite clear on several criteria. A plugin should not use a null provider if it has tables containing user data, persistent preferences, or sends data to an external location.

It also needs to consider subsystems. A plugin that uses the Comments API or another subsystem to create personal data may still have responsibilities even if its own table is empty.

The absence of `userid` in `install.xml` does not prove that the plugin is null.

## 23.20 A legitimate null-provider example

A block that only reads existing calendar data and displays it, without storing its own preferences, sending data externally, or creating records in another subsystem, can be a legitimate candidate.

The core monthly calendar block uses exactly this model and implements only `null_provider` with an explanatory reason.

## 23.21 Metadata does not replace export

After describing the data, Moodle still needs to be able to find and export it. This is where the request provider comes in.

Metadata says "I store reflections with userid, text, IP, and timestamps". The request provider answers "this user's reflections are in contexts X and Y, and here is an exportable representation of each one".

They are different responsibilities.

## 23.22 `plugin\provider`

The standard provider for plugins that store data implements:

```
\core_privacy\local\request\plugin\provider
```

This contract requires methods related to locating, exporting, and deleting user data.

In current plugins it is also common to implement `core_userlist_provider`, because retention tools need to discover which users have data in a specific context.

## 23.23 `get_contexts_for_userid()`

The first problem is discovering in which contexts the plugin has data for a user.

The signature is:

```php
public static function get_contexts_for_userid(int $userid): contextlist
```

For an activity module, we normally want module contexts in which that user has records.

## 23.24 Why the API returns contexts

The Privacy API organises export and deletion around the context tree. This allows a request to be approved or rejected for particular contexts and helps relate data to a course, activity, user, or system.

If a learner wrote reflections in five activities, the provider may return five distinct `context_module` objects. The privacy manager decides which contexts are approved for the next stage.

## 23.25 `contextlist`

The method creates a `contextlist` and adds the contexts it found.

```php
$contextlist = new contextlist();
$contextlist->add_from_sql($sql, $params);
return $contextlist;
```

The API is designed to receive SQL that returns `contextid`, avoiding the need to load a huge number of objects just to discover IDs.

## 23.26 Search in the database, not in a PHP loop

A poor implementation would fetch all reflections for the user and then load the activity, course module, and context separately for each row.

That creates N+1 queries precisely in an operation that may traverse years of historical data.

Prefer one query joining `{context}`, `{course_modules}`, the activity's main table, and the user-data table, returning the relevant context IDs directly.

## 23.27 Context-list example

For `mod_reflection`:

```php
$sql = "SELECT ctx.id
          FROM {context} ctx
          JOIN {course_modules} cm
            ON cm.id = ctx.instanceid
           AND ctx.contextlevel = :contextlevel
          JOIN {modules} m
            ON m.id = cm.module
           AND m.name = :modname
          JOIN {reflection} r
            ON r.id = cm.instance
          JOIN {reflection_entries} re
            ON re.reflectionid = r.id
         WHERE re.userid = :userid";

$params = [
    'contextlevel' => CONTEXT_MODULE,
    'modname' => 'reflection',
    'userid' => $userid,
];

$contextlist = new contextlist();
$contextlist->add_from_sql($sql, $params);
return $contextlist;
```

The goal of this query is only to discover contexts, not to export the full content.

## 23.28 A user may appear through more than one path

Perhaps the plugin has a reflection created by the learner, an assessment written by the teacher, and mentions of users. Each of those relationships may represent personal data in different contexts.

`contextlist` lets you add more than one query. That is better than building one monstrous SQL statement with `UNION` merely for aesthetics.

What matters is covering every real data path.

## 23.29 `core_userlist_provider`

The inverse operation is also necessary. Instead of asking "in which contexts does this user have data?", Moodle asks "which users have data in this context?".

The component implements:

```
\core_privacy\local\request\core_userlist_provider
```

And provides:

```php
public static function get_users_in_context(userlist $userlist): void
```

## 23.30 Why the user list exists

Retention tools may want to delete data for all users in a particular activity or process only users approved according to a policy.

Without a user list, core would need to know the plugin's internal schema to discover who appears in an instance.

The provider turns that information into a common contract.

## 23.31 `get_users_in_context()`

First validate whether the context type makes sense:

```php
$context = $userlist->get_context();

if (!$context instanceof \context_module) {
    return;
}
```

Then add IDs with `add_from_sql()`:

```php
$userlist->add_from_sql('userid', $sql, $params);
```

The query should return only users from that context, without accidentally including subcontexts.

## 23.32 The wrong context is a privacy bug

Imagine the plugin receives a `context_course` and simply returns every user with data in any activity in that course, even though the implementation is registered for module contexts.

That could make a deletion routine remove more data than it should.

The Privacy API needs the same context discipline as the Access API. Do not choose a context merely because it makes the query convenient.

## 23.33 `approved_contextlist`

After contexts are discovered, the manager does not call export and deletion with the original list directly. It supplies an `approved_contextlist`.

This is fundamental because discovery may find data in ten contexts, while the administrative request may have approved only three.

Your provider must operate only on the approved contexts.

## 23.34 `export_user_data()`

The method receives the approved list:

```php
public static function export_user_data(
    approved_contextlist $contextlist
): void
```

First obtain the user:

```php
$user = $contextlist->get_user();
```

Then load only that user's data from the authorised contexts.

## 23.35 Do not export the raw database

The goal is not to create a CSV containing `SELECT * FROM reflection_entries`. The export should be understandable and contextualised.

Internal IDs may be useful in some cases, but they should not replace names and information that make sense to a person reading the data package.

Convert timestamps to human-readable representations, structure the records, and include enough context to explain what each piece of information means.

## 23.36 `writer`

Exports use `writer`:

```
use core_privacy\local\request\writer;
```

For a context:

```php
writer::with_context($context)
    ->export_data($subcontext, $data);
```

The writer organises data in the export format used by the privacy subsystem.

## 23.37 Subcontext

Several records may exist inside the same context. The subcontext creates a logical hierarchy.

For example:

```php
$subcontext = [
    get_string('reflections', 'mod_reflection'),
    $entry->id,
];
```

Then:

```php
writer::with_context($context)
    ->export_data($subcontext, $data);
```

The structure should be stable and understandable, not a random path based on loop indexes.

## 23.38 Transforming timestamps

The Privacy API provides transformation helpers to make data more readable. Instead of exporting only `1727105902`, transform the date.

```php
use core_privacy\local\request\transform;

$data->timecreated = transform::datetime($entry->timecreated);
```

The technical value can still exist if necessary, but exports should be oriented towards people, not only developers.

## 23.39 Exporting text with embedded files

If the text uses a Moodle editor and `@@PLUGINFILE@@`, do not export the raw string without rewriting URLs.

The writer provides mechanisms to rewrite file URLs in the export context and then export the files from the corresponding area.

This makes the export self-contained instead of depending on a protected Moodle URL that may later stop existing.

## 23.40 Exporting files

After exporting the data you can export a file area:

```php
writer::with_context($context)
    ->export_area_files(
        $subcontext,
        'mod_reflection',
        'attachment',
        $entry->id
    );
```

This respects the File API and associates the files with the correct location in the privacy package.

## 23.41 Files are personal data too

A PDF uploaded by a learner may contain a name, student ID, signature, or any other sensitive content. The fact that `mdl_files` belongs to core does not remove the plugin's responsibility to indicate correctly which file areas represent that user's data.

The component's Privacy API implementation needs to know how that file relates to the exported record and to deletion.

## 23.42 Exporting additional metadata

In some cases it is useful to export metadata that does not belong naturally inside the main object.

The writer provides `export_metadata()` for this kind of structure.

This can be useful, for example, to record first view, the source of a state, or complementary information that explains the main data.

## 23.43 User preferences

If the plugin has site-wide preferences, implement:

```
\core_privacy\local\request\user_preference_provider
```

And the method:

```php
public static function export_user_preferences(int $userid): void
```

The preference is exported with:

```php
writer::export_user_preference(
    'mod_reflection',
    'mod_reflection_compactview',
    (string)$value,
    get_string('privacy:preference:compactview', 'mod_reflection')
);
```

## 23.44 Global preference and contextual preference

A global user preference can be exported through the preferences provider. If the meaning of that preference depends on a specific instance, the privacy subsystem documentation recommends handling it together with the corresponding contexts.

Do not force everything into `export_user_preferences()` just because the data came from the User Preferences API.

The export structure should preserve the meaning of the data.

## 23.45 Delete for everyone in a context

The provider needs to implement:

```php
public static function delete_data_for_all_users_in_context(
    \context $context
): void
```

This method is used when all personal data for a component in that context needs to be removed.

Validate the context type before doing anything.

## 23.46 Example deletion by activity context

```php
if (!$context instanceof \context_module) {
    return;
}

$cm = get_coursemodule_from_id('reflection', $context->instanceid);
if (!$cm) {
    return;
}

$DB->delete_records('reflection_entries', [
    'reflectionid' => $cm->instance,
]);
```

If files, ratings, tags, or other subsystems exist, they also need to be handled through the appropriate contract.

## 23.47 Do not delete what belongs to the activity structure

Deleting users' personal data does not mean deleting the whole activity.

`mod_reflection` can continue to exist with its name, configuration, and instruction text while learner entries are removed.

The implementation needs to distinguish instance configuration data from personal data generated by participants.

## 23.48 Delete for one user

The method:

```php
public static function delete_data_for_user(
    approved_contextlist $contextlist
): void
```

receives a user and the authorised contexts.

The code must delete only that user's data inside those contexts.

## 23.49 The danger of forgetting the context filter

This would be extremely serious:

```php
$DB->delete_records('reflection_entries', [
    'userid' => $userid,
]);
```

If the request approved only two contexts, this code would delete that user's reflections across the entire installation.

Always combine the user with the instance or with the approved set of contexts.

## 23.50 `approved_userlist`

For bulk deletion of users inside a single context there is `approved_userlist`.

The provider implements:

```php
public static function delete_data_for_users(
    approved_userlist $userlist
): void
```

This avoids calling individual deletion thousands of times when a retention policy works by context.

## 23.51 Bulk deletion must remain restricted to the context

Obtain the approved user IDs:

```php
$userids = $userlist->get_userids();
```

And combine them with the instance that belongs to the context.

Use `$DB->get_in_or_equal()` and parameterised SQL; never concatenate an arbitrary list received from the object.

## 23.52 Delete versus anonymise

Not every piece of data can simply disappear without breaking a shared structure. A post that has replies, for example, may need to continue existing while its authorship and content are handled in a specific way.

The decision depends on the plugin model. The Privacy API does not require every operation to be `DELETE FROM`.

You may replace content, remove the user reference, or keep a minimal structure when necessary to preserve consistency, provided the result satisfies the deletion purpose defined by the institution.

## 23.53 Content created by the user and content about the user

A reflection written by a learner is content created by that learner. An assessment written by a teacher about the learner is personal data about the learner and also content created by the teacher.

This kind of overlap requires care in export and deletion. A request from one user may need to include content another person wrote about them, depending on policy and data model.

Do not limit discovery to `userid` columns if fields such as `targetuserid`, `reviewerid`, or indirect relationships exist.

## 23.54 Logs

Moodle has its own logging system and Events API. If a plugin triggers events, the standard log may contain data related to the user.

In many cases the component does not need to duplicate export and deletion of logs because the responsible subsystem has its own privacy provider.

But the plugin should declare use of the subsystem where the contract requires it and avoid creating a second log table with the same information and no privacy strategy.

## 23.55 Do not use a log table as an excuse for eternal retention

If the plugin creates `local_plugin_log` with userid, IP, full payload, and response body, that table is directly the plugin's responsibility.

It needs to appear in metadata, participate in export where applicable, participate in deletion, and have a coherent retention policy.

"It is only a technical log" does not turn personal data into anonymous data.

## 23.56 External payloads

Integrations often store full JSON payloads to make debugging easier. That JSON may contain name, email, document number, phone number, grades, and other personal data that do not even appear as explicit columns.

Privacy review needs to inspect semi-structured content too.

If you do not need to store the full payload, do not store it. Minimal logging reduces both security risk and privacy work.

## 23.57 External locations

When a plugin sends data to a third party, metadata needs to explain which fields are sent and for what purpose.

This is especially important for AI services, antivirus, plagiarism detection, videoconferencing, analytics, and gateways that receive user identifiers or user-created content.

The Privacy API does not replace a contract with the supplier, but at least it makes the technical data flow visible inside Moodle.

## 23.58 Deleting data from an external service

If the external API provides a deletion operation, the plugin can call that operation during the appropriate flow, provided it is safe and predictable.

But think about reliability. The Privacy API should not mark a deletion as completed locally and silently forget a remote failure.

Depending on the service, it may be necessary to schedule a removal task, retry transient failures, and provide observability to administrators.

## 23.59 Asynchronous external deletion

A remote deletion may take time or depend on rate limits. An Adhoc Task can be useful, but the institution needs to understand that the request now has a pending state.

Do not hide asynchronous processing behind a method that returns immediately without any traceability.

The architecture needs to connect the privacy request to the actual completion of the external work.

## 23.60 Subplugins

Chapter 20 showed that subplugins are independent components. The Privacy API respects that separation.

If `assignsubmission_custom` has its own table containing user content, it is not enough for `mod_assign` to declare generically that it "has submissions". The parent defines a privacy contract for its subplugins, and each child participates according to that contract.

## 23.61 Subplugin provider

The privacy subsystem documentation defines specific interfaces for subplugins based on `subplugin_provider`.

The parent defines how it will query the children. This is necessary because context, subcontext, and lifecycle normally belong to the parent, while the child knows its own specific data.

This model prevents every subplugin from trying to discover the entire parent structure by itself.

## 23.62 A subplugin should not implement something only because the validator requested it

If a parent defines a privacy interface, the child needs to understand that parent's contract. Copying a provider from another subplugin and leaving methods empty can make the component look compatible without actually exporting or deleting data.

Review each child's tables, files, preferences, and external locations separately.

## 23.63 Subsystem plugins

Some plugin types are called mainly by a subsystem, such as plagiarism plugins. In those cases the subsystem may define its own privacy contract.

The logic is similar to subplugins. The plugin does not operate in isolation, and the parent or subsystem understands the structure in which the data was created.

Before implementing a generic provider, check the contract for that plugin type.

## 23.64 Files and Privacy

The File API already knows context, component, filearea, and itemid, but it does not automatically know which user is entitled to a particular export.

The plugin needs to connect its records to the correct files. If filearea `attachment` uses `itemid = entryid`, the provider should locate that user's entries and export or delete only the associated files.

Never delete the entire filearea for the context during an individual request if it contains files from other users.

## 23.65 Shared files

If the same file is used by several users, the model needs to say who the logical owner is. Physical deduplication in the File API does not change that, because different stored files may share the same contenthash.

Privacy works with the logical reference, not with arbitrarily deleting bytes from `filedir`.

That is why privacy routines must never manipulate `filedir` directly.

## 23.66 Privacy and Gradebook

If the plugin sends grades to the Gradebook, the official grade data is also managed by the grade subsystem. The plugin still needs to handle its internal assessment data, if it has any, but it should not write a second routine that deletes `grade_grades` directly.

Use the APIs and privacy contracts of the responsible subsystems.

That keeps ownership clear.

## 23.67 Privacy and Question Engine

An activity that uses the Question Engine may have attempts and responses stored in core question tables. The consuming component still needs to participate in the privacy relationship because it knows how the QUBA relates to a user and to a business context.

Do not assume `core_question` can by itself guess that a particular question usage belongs to a specific attempt in your activity.

This is another situation where component and subsystem need to cooperate.

## 23.68 Privacy and Events

Events can send data to logs and observers. Triggering an event does not mean you need to export the log copy again in your own provider, but data persisted directly by the plugin remains your responsibility.

Avoid putting sensitive data in `other` simply because it is convenient. Logs often have long retention and broad administrative visibility.

The best privacy data is often the data you never needed to store.

## 23.69 Data minimisation applied to code

If you only need to know that an action happened, perhaps you do not need to store the full payload. If you need correlation, perhaps an ID is enough. If the information is only needed during a task, perhaps it does not need to remain indefinitely.

The Privacy API is not just export/delete. It should influence the design before persistence.

Less data means less exposure, less backup, fewer indexes, less export work, and fewer problems when a deletion request arrives.

## 23.70 Retention

Moodle has administrative data-privacy and retention tools that work together with contexts and providers.

Your plugin must provide correct information so these tools can act. If `get_users_in_context()` forgets half the users, a retention policy may never process those records.

If `delete_data_for_users()` ignores an auxiliary table, the process remains incomplete even if the administrative tool reports success.

## 23.71 Performance of `get_contexts_for_userid()`

These methods can run on huge installations. Do not write queries that scan entire tables without appropriate indexes.

If `reflection_entries` is queried by `userid` and `reflectionid`, think about the indexes back in Chapter 5. The Privacy API should not be the first time you discover that your 40-million-row table has no user index.

Test with realistic volumes.

## 23.72 Performance of user lists

`get_users_in_context()` also needs to scale. A course context may contain tens of thousands of users and millions of records.

Return IDs directly from SQL into the `userlist`. Do not build enormous PHP arrays just to pass them to the object afterwards.

The API classes were designed precisely to avoid that kind of waste.

## 23.73 Recordsets during export

If a user owns a lot of data, `get_records_sql()` may load everything into memory. Prefer a recordset when volume can be large, export in a logical streaming fashion, and close the recordset at the end.

Core Forum does this in parts of its export because a user may own thousands of posts.

The same discipline applies to institutional plugins.

## 23.74 Transactions during delete

Deleting one person's data may involve several related tables. Depending on the model, a delegated transaction helps prevent partial deletion.

But do not keep a database transaction open while calling an external API. Database and network have different lifecycles, and a slow call can hold locks unnecessarily.

Separate atomic local deletion from external processing with an explicit strategy.

## 23.75 Deletion order

If child tables exist, respect foreign keys and logical relationships. Delete children first when necessary, associated files, subsystem references, and finally the user's main entity.

Do not depend on invisible cascade behaviour without knowing what the schema actually defines.

And do not delete shared records merely because one of the related users is being removed.

## 23.76 Anonymisation

Some structures need to preserve aggregates or relationships. In that case deletion may replace authorship with a neutral value and clear personal fields.

However, true anonymisation is harder than setting `userid = 0`. If other fields still allow re-identification, the data remains personal.

The implementation must follow the real policy rather than merely masking the most obvious field.

## 23.77 IP address

IP is a classic example of technical data being treated as if it were not personal. If you store an IP linked to a user and timestamp, declare it, export it, and apply appropriate retention.

And ask whether you need to keep it forever. In many cases a short retention period is enough for operational security.

Do not record IP addresses out of habit.

## 23.78 External IDs

`externaluserid`, `customerid`, `documentid`, and similar fields may be even more sensitive because they connect Moodle to other systems.

They need to appear in metadata when they are personal data or facilitate identification.

Avoid exporting secrets or tokens just because they are stored in the same table; a credential is not something that should appear in a Subject Access Request package.

## 23.79 Tokens and secrets do not belong in user exports

An access token used by an integration may relate to a user, but exporting it in plain text would be a vulnerability.

A privacy export does not mean dumping every secret stored in the database.

Describe the data correctly, but protect credentials and consider whether the user needs an informative representation instead of the secret value.

## 23.80 Testing metadata

A simple review starts by comparing `install.xml`, the Preferences API, the File API, and external integrations with `get_metadata()`.

For every table, ask which fields identify or describe people. For every filearea, ask who the logical owner is. For every external service, ask what leaves Moodle.

This checklist finds a lot before any PHPUnit test exists.

## 23.81 Testing context discovery

Create two courses, two instances, and two users. Insert cross-linked data and verify that `get_contexts_for_userid()` returns only the expected contexts for each person.

Include a user with no data and a user with indirect data if the plugin has that concept.

Also test deletion of one instance to make sure an orphaned context does not cause an exception.

## 23.82 Testing the user list

In the same fixture, call `get_users_in_context()` and confirm that every related user appears and that no user from another instance is included by mistake.

If the plugin has authors and reviewers, both may need to appear according to the nature of the data.

Do not test only the primary `userid` field.

## 23.83 Testing export

The PHPUnit infrastructure allows tests to work with the privacy writer. The test should verify that exported data contains the expected content and that files appear at the correct path.

Do not assert only that the method "did not throw an exception". That proves almost nothing.

Verify structure, values, transforms, and separation by subcontext.

## 23.84 Testing individual delete

Create data for two users in the same context, delete only one, and confirm that the other remains intact.

Then repeat with the same user in two contexts, approve only one, and confirm that the second remains.

These two tests find the most dangerous deletion bugs.

## 23.85 Testing delete for everyone

Create several users in one activity and data in another activity in the same course. Run `delete_data_for_all_users_in_context()` only on the first one.

The correct result is that the first activity becomes clean and the second remains untouched.

If your SQL uses only `courseid`, the test will expose the problem immediately.

## 23.86 Testing bulk delete

Build an `approved_userlist` containing a subset of the users in that context and call `delete_data_for_users()`.

Confirm that non-approved users still have their data.

This function exists precisely to support selective policies and must be as restrictive as the individual version.

## 23.87 Development utilities

Moodle documentation provides helper scripts to check compliance and exercise providers during development.

They are useful for diagnosing missing metadata, implemented interfaces, and basic export execution, but the documentation itself makes clear that they do not replace PHPUnit.

Use utilities for fast feedback and automated tests for real assurance.

## 23.88 Plugin Validate does not prove compliance

A validator can detect a missing provider and some structural problems, but it cannot know that your query forgot a table or that `delete_data_for_user()` deletes everybody's data.

Privacy API is an area where code review and domain testing are indispensable.

Passing the checker is the beginning, not the end.

## 23.89 The `mod_reflection` case

Let us consolidate the example. The plugin has an entries table, an `attachment` filearea, a global preference, and an optional external integration.

Metadata declares the table, preference, File API/subsystem when necessary, and external location. The request provider locates module contexts containing the user's entries, exports text and files, deletes entries by context, and supports user lists.

The preference is exported by the appropriate provider, while the external service needs its own deletion policy and documentation of what was sent.

## 23.90 Provider skeleton

A class can begin like this:

```
namespace mod_reflection\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;

class provider implements
        \core_privacy\local\metadata\provider,
        \core_privacy\local\request\plugin\provider,
        \core_privacy\local\request\core_userlist_provider,
        \core_privacy\local\request\user_preference_provider {

    // get_metadata()
    // get_contexts_for_userid()
    // get_users_in_context()
    // export_user_data()
    // export_user_preferences()
    // delete_data_for_all_users_in_context()
    // delete_data_for_user()
    // delete_data_for_users()
}
```

The provider can become quite large. Split out private helpers when that improves readability, but do not scatter privacy logic across random classes without a reason.

## 23.91 Common mistake: using a null provider because the table has no `userid`

Imagine a table with `entryid`, `externalid`, and `ipaddress`, linked to another table that identifies the user. The data is still personal even without a direct `userid`.

Metadata must consider relationships, not only column names.

If you can reach a person through a join, there is a good chance that data belongs in the privacy review.

## 23.92 Common mistake: exporting only the main table

Mature plugins often have comments, files, grades, tags, preferences, and auxiliary data. Exporting only the main row produces an incomplete package.

Create an inventory of all cross-cutting APIs used by the component.

Every subsystem needs clear ownership.

## 23.93 Common mistake: deleting everyone's files

A lazy implementation calls `delete_area_files($contextid, 'mod_reflection', 'attachment')` while deleting one user's data.

If the filearea contains attachments from several entries, you just deleted everyone's files.

Use itemid or specific IDs that belong to that user.

## 23.94 Common mistake: forgetting external data

The integration sends text to an external service, but the provider declares only the local table. Moodle's export becomes technically incomplete as documentation of processing.

An external location is not an optional detail. It is part of the component's data map.

## 23.95 Common mistake: confusing logs with anonymity

A log containing `userid`, IP, URL, and timestamp is personal data. Even if the message field does not contain the person's name, the relationship still exists.

If the log is only for debugging, define short retention and avoid full payloads.

## 23.96 Common mistake: deleting more contexts than were approved

This is the most dangerous implementation bug. The developer receives `$userid` and runs a global delete for that user, ignoring the `approved_contextlist`.

Always treat the context list as the authorisation boundary of the operation.

The provider does not get to expand the request.

## 23.97 Exercise

Extend `mod_reflection` so it has a `reflection_entries` table, a text editor, attachments, the `mod_reflection_compactview` preference, and an optional integration with an external analysis endpoint.

Implement `get_metadata()` declaring all personal fields in the table, the preference, and the external location. Then implement `get_contexts_for_userid()` using SQL that returns module contexts, `get_users_in_context()`, and full export with `writer`, including transformed timestamps and the entry's files.

Implement all three deletion forms: all users in a context, one user in approved contexts, and several approved users in one context. In every case write tests proving that data from other contexts and other users is not removed.

Add a test where two people have attachments in the same activity and confirm that deleting one does not remove the other's files. Add another test where the external integration is enabled and verify that metadata correctly declares the fields that are sent.

Finally, create an alternative version of the plugin with no user persistence, no preferences, no files, and no external integration, and implement `null_provider`. Explain why the first version could never use `null_provider`, even if we removed the `userid` column from the table.

## 23.98 Closing the chapter

The Privacy API is not a formality isolated from the rest of the architecture. It reveals whether the plugin knows who owns each piece of data, in which context it exists, and which subsystems participate in persistence.

When a provider is difficult to implement, the problem is often not the Privacy API but the data model. A table with no clear link to context, huge payloads in logs, files with inconsistent itemids, and external integrations with no correlation identifier make privacy difficult because they already made the system difficult to understand.

The best implementation begins before `provider.php`. It begins when you decide to store only what is necessary, model ownership, use contexts correctly, and avoid duplicating data that already belongs to Moodle subsystems. After that, metadata, export, and deletion stop being a patch and become another coherent view of the same architecture.

## Technical references consulted

* MOODLE. Privacy API. Moodle Developer Resources. https://moodledev.io/docs/5.2/apis/subsystems/privacy. Accessed 24 Sep. 2026.
* MOODLE. Privacy API FAQ. Moodle Developer Resources. https://moodledev.io/docs/5.0/apis/subsystems/privacy/faq. Accessed 24 Sep. 2026.
* MOODLE. Privacy API utilities. Moodle Developer Resources. https://moodledev.io/docs/5.0/apis/subsystems/privacy/utils. Accessed 24 Sep. 2026.
* MOODLE. Core source: `core_privacy\local\metadata\collection`. https://github.com/moodle/moodle/blob/main/public/privacy/classes/local/metadata/collection.php. Accessed 24 Sep. 2026.
* MOODLE. Core source: `core_privacy\local\request\writer`. https://github.com/moodle/moodle/blob/main/public/privacy/classes/local/request/writer.php. Accessed 24 Sep. 2026.
* MOODLE. Core source: `mod_choice\privacy\provider`. https://github.com/moodle/moodle/blob/main/public/mod/choice/classes/privacy/provider.php. Accessed 24 Sep. 2026.
* MOODLE. Core source: `mod_forum\privacy\provider`. https://github.com/moodle/moodle/blob/main/public/mod/forum/classes/privacy/provider.php. Accessed 24 Sep. 2026.

{% endraw %}
