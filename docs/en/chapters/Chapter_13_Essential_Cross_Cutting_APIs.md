{% raw %}

# 13 ESSENTIAL CROSS-CUTTING APIS

There comes a point when a plugin already knows how to store data, display an interface, receive forms, protect an action, and execute work in the background, yet dozens of small needs still appear and, when solved manually, make the code strange. The administrator wants a setting, the user wants to choose a preference, a page needs to appear in navigation, an integration needs to send a notification, a deadline needs to appear in the calendar, a report needs to respect groups, a record needs to become searchable in Global Search, and a large result needs to be exported to CSV or Excel. None of these things seems large enough to deserve its own chapter, but together they appear in almost every Moodle plugin that stops being a course example and starts being used for real.

That is exactly why this chapter exists. I see many plugins with their own table for user preferences, an invented function for building URLs, direct email sending with `email_to_user()` when that communication should really go through the Message API, a complete CSV assembled in memory and dumped at once, navigation altered through HTML or JavaScript, and configuration fields queried with direct SQL. Most of the time the developer did not do this because they wanted to complicate things; they did it because they knew PHP, but did not yet know the cross-cutting Moodle API that already solves that problem.

From here on, the question stops being only "how do I do this in PHP?" and becomes "which part of Moodle is already responsible for this?". That change looks small, but it is what lets a plugin coexist properly with language, theme, permissions, preferences, multiple message channels, calendar, groups, Global Search, exports, and site administration without trying to build a second Moodle inside the first one.

## 13.1 What I mean by a cross-cutting API

I call an API cross-cutting when it does not belong to only one plugin type or one application layer. The Files API appears in many components, but it is large enough to have received its own chapter. Config, String, URL, Page, Navigation, Message, Calendar, Groups, Preferences, Tags, Search, and Dataformat, on the other hand, are tools that cross several parts of the system and normally support another feature.

A `mod`, `local`, `tool`, `block`, `report`, or `enrol` may all need the same configuration, strings, messages, and export APIs, so knowing these tools greatly reduces the feeling that every plugin type is an entirely different world. The contract changes, the context changes, the screen changes, but many supporting tools remain exactly the same.

## 13.2 Config API

Configuration is one of the easiest things to implement badly because apparently all you need is a key/value table. The problem is that Moodle already has infrastructure for global and per-component configuration, including caching, administration integration, and a contract known throughout core, so creating a `meuplugin_config` table to store `apikey`, `enabled`, `endpoint`, and `timeout` usually means maintaining infrastructure that already existed.

The central read function is `get_config()`, while `set_config()` and `unset_config()` change and remove values. The important distinction is whether configuration belongs to the whole site or to a specific component, because that determines where it lives and how it should be read.

```php
$enabled = get_config('tool_courseaudit', 'enabled');
$endpoint = get_config('tool_courseaudit', 'endpoint');
```

When the second argument is omitted, `get_config()` can return the full set of configuration values for that component, which is useful in some situations, but I would avoid fetching everything when the code only needs one value, especially in frequently executed paths.

```php
$config = get_config('tool_courseaudit');

if (!empty($config->enabled)) {
    // Continua o processamento.
}
```

## 13.3 Global configuration and plugin configuration

Moodle historically stores global configuration in `config` and component configuration in `config_plugins`. This does not mean you should query those tables directly. The API exists precisely to hide storage details, handle caching, and keep access consistent.

Global configuration makes sense for values genuinely belonging to core or to the installation as a whole. For plugin code, the practical rule is simple: if the configuration belongs to the plugin, use the component name.

```
set_config('endpoint', 'https://api.exemplo.com', 'tool_courseaudit');
set_config('timeout', 15, 'tool_courseaudit');
```

In the database this will go to `config_plugins`, but the plugin should not depend on that detail to work.

## 13.4 Why not query config_plugins with $DB

I know the query is easy.

```php
$record = $DB->get_record('config_plugins', [
    'plugin' => 'tool_courseaudit',
    'name' => 'endpoint',
]);
```

But it bypasses the API, ignores its cache strategy, and creates an unnecessary dependency on the internal implementation. If Moodle changes some part of this flow later, code calling `get_config()` remains protected by the API while the direct query depends on the exact table structure.

This pattern will repeat throughout the chapter. When a public API exists for an operation, querying its internal table directly is usually a sign that you have dropped to a lower layer without needing to.

## 13.5 set_config() does not replace settings.php

`set_config()` stores configuration, but that does not mean you should build your own administrative page merely to call it. When configuration belongs in normal plugin administration, `settings.php` remains the natural place to declare fields because Moodle handles the form, administrative permissions, persistence, and visual consistency.

The Config API appears later when reading the value and also when the system itself needs to change a configuration value programmatically. The mistake is turning `set_config()` into an excuse to recreate the entire administration interface.

## 13.6 unset_config() and the difference between empty and nonexistent

Sometimes an empty value and a missing value mean different things. If the plugin applies a default only when a setting does not exist, saving an empty string may prevent that behavior and produce a different result from removing the setting.

```
unset_config('endpoint', 'tool_courseaudit');
```

From then on `get_config()` will not find the value and code can deliberately apply the default. This becomes particularly important when a configuration setting is deprecated, renamed, or starts being calculated.

## 13.7 String API

Never treat interface text as a cosmetic detail. In Moodle, strings are architectural because language packs, customization, and translation depend on them, so hardcoding text in PHP, Mustache, or JavaScript creates technical debt even if the site currently uses only Portuguese.

The basics are familiar.

```php
$title = get_string('pluginname', 'tool_courseaudit');
```

And in `lang/en/tool_courseaudit.php` or the corresponding language pack there is a definition.

```
$string['pluginname'] = 'Course audit';
```

A Portuguese language pack can provide its own translation without changing plugin code.

## 13.8 Do not put logic in a language file

A language file should be simple. It is not `config.php`, it is not `lib.php`, and it is not a place to calculate values, include classes, or query the database. These files are loaded frequently by the string subsystem and need to remain predictable.

```
$string['reporttitle'] = 'Relatório de auditoria';
$string['nothingfound'] = 'Nenhum registro encontrado';
```

If the string depends on a value, use a placeholder instead of concatenating translated fragments.

## 13.9 Placeholders with $a

When there is a variable value, Moodle allows `$a`. For a single value, it may be scalar.

```
$string['recordsfound'] = '{$a} registros encontrados';
```

The call then looks like this.

```php
$message = get_string('recordsfound', 'tool_courseaudit', $count);
```

When there are multiple values, pass an object.

```php
$string['syncsummary'] = 'Foram importados {$a->created} registros e atualizados {$a->updated}.';
$a = (object) [
    'created' => $created,
    'updated' => $updated,
];

$message = get_string('syncsummary', 'tool_courseaudit', $a);
```

This is much better than building the sentence through concatenation because each language can rearrange the elements.

## 13.10 Plural is not simply adding an "s"

Portuguese sometimes tempts people into constructions such as "registro(s)", but that is already ugly and does not solve languages with different plural rules. Moodle has mechanisms and string patterns that can structure this type of text better, but the most important rule for developers is not to assume universal pluralization is just concatenating one letter.

When the experience needs a genuinely natural phrase, separate appropriate strings or use the approach recommended for the Moodle versions supported by the project instead of hiding linguistic logic in PHP.

## 13.11 Strings in Mustache

In templates there is no reason to prepare every static string in PHP merely to pass it to Mustache. The `str` helper exists precisely for that.

```mustache
<h2>{{#str}} reporttitle, tool_courseaudit {{/str}}</h2>
```

When the string has a simple placeholder, the helper also accepts an argument.

```mustache
{{#str}} backto, core, {{coursename}} {{/str}}
```

The important point is not to start mixing business logic into the template merely because the helper exists. Strings are presentation; rules still belong elsewhere.

## 13.12 Strings in JavaScript

On a modern frontend, do not copy translations into HTML attributes and do not create one JavaScript file per language. Core provides `core/str`, which retrieves system strings and uses browser caching.

```
import {getString} from 'core/str';

const label = await getString('confirmdelete', 'tool_courseaudit');
```

On recent versions, methods returning native Promises should be preferred. If the plugin maintains compatibility with very old branches, check the contract for that branch rather than blindly copying the newest example and blaming Moodle when JavaScript breaks.

## 13.13 URL API and moodle_url

A URL looks simple until `$CFG->wwwroot`, parameters, encoding, `sesskey`, fragments, and structural changes appear. The `moodle_url` class exists so the plugin works with URLs as objects rather than hand-built strings.

```php
$url = new moodle_url('/admin/tool/courseaudit/view.php', [
    'id' => $courseid,
    'page' => 2,
]);
```

When you need to output the URL, the object knows how to convert itself correctly.

```php
echo $url->out(false);
```

In most Moodle APIs you can pass the object itself without converting it first.

## 13.14 Why not build URLs through concatenation

This works until the day it does not.

```php
$url = $CFG->wwwroot . '/admin/tool/courseaudit/view.php?id=' . $courseid . '&page=' . $page;
```

Besides looking bad, this pattern pushes encoding, optional parameters, and maintenance onto the developer. With `moodle_url`, adding, changing, or removing parameters becomes explicit.

```php
$url->param('sort', 'name');
$url->remove_params('page');
```

You stop manipulating text and start manipulating a URL.

## 13.15 $PAGE is not only for setting the title

In Chapter 6 we already encountered `$PAGE` because of interface rendering, but it is more important than it first appears. The `moodle_page` object represents the current page context and concentrates URL, context, layout, title, heading, navigation, and frontend requirements.

A minimally well-constructed Moodle page normally sets its context and URL deliberately.

```php
require_login();

$context = context_system::instance();
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/admin/tool/courseaudit/index.php'));
$PAGE->set_title(get_string('pluginname', 'tool_courseaudit'));
$PAGE->set_heading(get_string('pluginname', 'tool_courseaudit'));
```

When the context is course, module, or user, use the correct context. Do not put `context_system` everywhere merely because it is easy to obtain.

## 13.16 Canonical page URL

```php
$PAGE->set_url() não é detalhe visual. A URL da página é usada por diferentes partes do Moodle, inclusive navegação e componentes que precisam saber qual é a página atual, então deixar $PAGE sem URL correta pode gerar comportamento estranho que parece não ter relação com o código.
```

The URL should represent the current page with the parameters that genuinely identify that state. A purely transient parameter does not always need to be part of it.

## 13.17 redirect()

When an operation has finished and the correct response is to take the user somewhere else, use `redirect()` instead of building an HTTP header manually.

```php
redirect(
    new moodle_url('/admin/tool/courseaudit/index.php'),
    get_string('changessaved'),
    null,
    \core\output\notification::NOTIFY_SUCCESS
);
```

This integrates the message and redirect with Moodle's flow. There is no need to use `header('Location: ...')` and `exit` as though you were writing an isolated PHP application.

## 13.18 Navigation API

Changing Moodle navigation does not mean editing a theme template, injecting a link with JavaScript, or modifying core. There is a Navigation API and there are specific callbacks for extending the navigation tree according to context.

The callback varies depending on plugin type and desired location, but the idea is the same: you receive a navigation structure and add a node at the appropriate point.

## 13.19 $PAGE->navbar

The page breadcrumb can be extended with `$PAGE->navbar` when the current route requires levels Moodle cannot infer on its own.

```php
$PAGE->navbar->add(
    get_string('reports', 'tool_courseaudit'),
    new moodle_url('/admin/tool/courseaudit/index.php')
);
$PAGE->navbar->add(get_string('details', 'tool_courseaudit'));
```

A common mistake is rebuilding the entire breadcrumb manually in HTML. If navigation is part of the system, feed the system's navigation structure.

## 13.20 Administrative navigation

For administrative pages, `settings.php` and the administration tree are usually the most natural solution. You register the page, configure capability, and Moodle places the entry into the administrative structure without requiring any core-file edits.

```php
$ADMIN->add('reports', new admin_externalpage(
    'tool_courseaudit',
    get_string('pluginname', 'tool_courseaudit'),
    new moodle_url('/admin/tool/courseaudit/index.php'),
    'tool/courseaudit:view'
));
```

This already demonstrates one clear advantage of using the API. The link appears or disappears according to permissions and the administration tree rather than depending on a theme-specific visual modification.

## 13.21 Do not put everything in the main menu

Adding a navigation link does not mean it belongs in the most prominent area possible. Moodle deliberately restricts some navigation spaces to avoid turning the interface into a collection of plugin shortcuts.

Before forcing an item into primary navigation, ask whether it truly belongs there for every user and on every page. Often the page belongs inside a course, user preferences, a report, or administration. The API lets you add the link, but navigation architecture remains a UX decision.

## 13.22 Message API

When a plugin needs to notify a person, the first question should not be "how do I send an email?". In Moodle, a message is an abstraction above the delivery channel. The user may receive it in the interface, by email, or through another available processor depending on preferences and site configuration.

That is why directly using `email_to_user()` may be a poor choice when the intent is to send a system notification. You are choosing the channel in code rather than letting the message subsystem decide.

## 13.23 db/messages.php

Before sending messages, the component declares the message providers it offers. This happens in `db/messages.php`.

```php
$messageproviders = [
    'syncfinished' => [
        'capability' => 'tool/courseaudit:receivenotification',
    ],
];
```

The provider name becomes part of the message contract, so choose something stable and tied to purpose rather than delivery channel.

## 13.24 \core\message\message

To send a message, create a `\core\message\message` object and populate the required data.

```php
$message = new \core\message\message();
$message->component = 'tool_courseaudit';
$message->name = 'syncfinished';
$message->userfrom = core_user::get_noreply_user();
$message->userto = $user;
$message->subject = get_string('syncfinishedsubject', 'tool_courseaudit');
$message->fullmessage = get_string('syncfinishedtext', 'tool_courseaudit', $a);
$message->fullmessageformat = FORMAT_PLAIN;
$message->fullmessagehtml = get_string('syncfinishedhtml', 'tool_courseaudit', $a);
$message->smallmessage = get_string('syncfinishedshort', 'tool_courseaudit', $a);
$message->notification = 1;

message_send($message);
```

Notice there are several representations of the same communication because a processor delivering a short in-app notification does not necessarily use the same content as a complete email.

## 13.25 subject, fullmessage, HTML, and smallmessage

Do not use the same text in every field out of laziness. `subject` must work as a subject, `fullmessage` as a complete plain-text alternative, `fullmessagehtml` as rich content when the processor supports HTML, and `smallmessage` as a short summary.

For important notifications this makes a substantial difference. A message that looks excellent in email may be terrible in push notification if the short field contains 900 characters.

## 13.26 Notification versus personal message

The `notification` field distinguishes a system notification from a personal message. If a plugin is telling someone processing finished, a deadline changed, or a report is ready, this is normally a notification. Do not mark everything as personal communication merely because it goes to one person.

Beyond semantics, this information may influence processor behavior and preferences, so do not treat the field as decoration.

## 13.27 Message preferences belong to the user

One reason for using the Message API is precisely to respect preferences. Users may want specific message types through particular processors, and administrators can also define defaults and restrictions.

If you send email outside this infrastructure, you bypass that layer and end up with two notification systems competing inside the same Moodle.

## 13.28 Calendar API

If a plugin has dates relevant to the user, ask whether they should appear in the calendar. Due dates, deadlines, action windows, and institutional events are obvious examples. Using the Calendar API lets the event become part of Moodle's normal experience rather than existing only on your plugin's screen.

An event can be created through the `calendar_event` class.

```php
$event = new stdClass();
$event->name = get_string('auditdeadline', 'tool_courseaudit');
$event->description = get_string('auditdeadlinedescription', 'tool_courseaudit');
$event->format = FORMAT_HTML;
$event->courseid = $courseid;
$event->groupid = 0;
$event->userid = 0;
$event->modulename = '';
$event->instance = 0;
$event->eventtype = 'deadline';
$event->timestart = $deadline;
$event->timeduration = 0;
$event->visible = 1;

calendar_event::create($event);
```

The real structure varies according to event type and component, so do not copy fields blindly. Understand who owns the event and which entity it represents.

## 13.29 Updating and deleting events

If the date of your object changes, the calendar also needs to change. Do not create a new event every time, otherwise the user soon has three deadlines for the same thing.

Keep the relationship required between the plugin object and its event, load the existing event, and update it. Likewise, when the originating record is removed, remove its calendar event.

The lesson is simple: a calendar entry is a projection of domain data. When the domain changes, the projection must follow.

## 13.30 Action events

For many Moodle versions, events can have an associated action and appear in places such as the Dashboard. This is different from simply putting a date on the calendar. An action event represents something the user needs to do and may have a URL leading directly to that action.

If a plugin creates a genuine pending action, it is worth understanding the action-event API instead of creating a custom block merely to list deadlines Moodle can already surface in its normal workflow.

## 13.31 Human-readable dates in Moodle 5.0

Moodle 5.0 introduced a better way to present dates close to the user without every plugin reinventing "today", "tomorrow", time display, deadline warnings, and intervals. The calendar subsystem gained output classes for human representations of dates and periods, gradually replacing older functions such as calendar_format_event_time() and calendar_time_representation().

The advantage is not only visual. These classes respect the user's time presentation and keep deadline semantics in a reusable component, while the plugin remains responsible only for deciding which timestamp represents its domain.

## 13.32 humandate

core_calendar\output\humandate represents one timestamp. Instead of manually formatting userdate() and then inventing logic to determine whether the value is today or tomorrow, create the output object and let Moodle's renderer produce the presentation.

```php
use core_calendar\output\humandate;

$clock = \core\di::get(\core\clock::class);
$timestamp = $clock->time();
$date = humandate::create_from_timestamp($timestamp);

echo $OUTPUT->render($date);
```

Using \core\clock here connects this chapter to the Dependency Injection model discussed in Chapter 4. The time value remains domain data while humandate solves presentation.

## 13.33 humantimeperiod

core_calendar\output\humantimeperiod does the same for intervals. When start and end fall on the same day, the renderer can avoid repeating unnecessary information and produce more compact output; when they span days, the period remains readable without the plugin maintaining its own collection of formatting rules.

```php
use core_calendar\output\humantimeperiod;

$period = humantimeperiod::create_from_timestamp(
    $starttimestamp,
    $endtimestamp,
);

echo $OUTPUT->render($period);
```

Do not confuse human representation with the stored value. Continue storing timestamps according to the corresponding API contract and use these classes only for output. Text such as "tomorrow" is excellent for people and terrible as a source of truth for business logic.

## 13.34 Groups API

A Moodle group is not merely a table containing grouped users. Group mode, groupings, visibility, and behavior depending on course and activity all exist, so filtering records only by `groups_members` is usually insufficient when the intention is to reproduce Moodle rules.

The first thing to understand is the difference between groups and groupings. A group is a collection of users. A grouping contains groups and may restrict which groups are considered by a particular activity.

## 13.35 groups_get_activity_group()

When you are inside an activity context and need to respect the group selected in the interface, functions such as `groups_get_activity_group()` prevent you from rebuilding the selection rule.

```php
$groupid = groups_get_activity_group($cm, true);
```

From there the report or listing can apply a filter consistent with the activity and current user.

## 13.36 Group mode

The main modes are no groups, separate groups, and visible groups. The difference is not cosmetic. With separate groups, a user normally cannot see data from another group without an appropriate capability, while with visible groups they may see other groups even if interaction remains restricted.

If the plugin provides a report, activity, or participant view, it must inspect group mode before deciding who appears. A standalone `WHERE groupid = ...` does not replace this analysis.

## 13.37 Groupings and activities

An activity may be linked to a specific grouping. This means not every group in the course is necessarily relevant in that context. Activity plugins ignoring groupings end up showing options a teacher did not expect or mixing students who should be outside that flow.

That is why I keep returning to the same point: use the API that understands Moodle's rule instead of reconstructing it from tables.

## 13.38 Logs and events

If a plugin needs to record important user actions, Moodle's modern logging foundation is the Events API. When a relevant action happens, the component triggers an Event that can be consumed by the standard logstore, observers, and other ecosystem mechanisms.

This does not mean every debugging line should become an Event. Functional audit logging and technical debug output are different things. An event such as "report exported", "configuration changed", or "record approved" may make sense; an intermediate variable from an external API attempt does not need to become a domain event.

## 13.39 Standard log

The Standard log is Moodle's default event storage on many installations. As a plugin developer, you normally should not write directly to the log table. Trigger appropriate events and let the logging subsystem record them according to site configuration.

This decoupling matters because Moodle supports different logstores and configurations. Writing directly to the table makes your code depend on an implementation that should not be the plugin's responsibility.

## 13.40 Querying logs

Sometimes a plugin itself needs to display history, but before querying the physical standard-log table, check the managers and APIs available for reading. The site may not use only that store, retention can vary, and internal structure is not your plugin's contract.

If history is a central feature of your domain and needs to exist independently from logstores, then you may genuinely need your own history table. What does not make sense is creating a table merely to duplicate every event Moodle already records.

## 13.41 When to create your own history table

There is a difference between "I want to know the user opened the page" and "I need to retain the legal trail of every approved version of a document for five years." The first is clearly logging. The second may be part of the business model and require its own persistence with retention, immutability, and query rules.

Do not use Events as a domain database, but also do not create a domain database to replace the Events API. The decision depends on the meaning and guarantees the data needs.

## 13.42 User Preferences API

A user preference is different from plugin configuration. Configuration normally defines how the system works globally or for a component. A preference records how one person chose to use a feature.

Simple examples include compact mode, default tab, collapsed panel, preferred sorting, or whether certain information should be shown.

```php
set_user_preference('tool_courseaudit_compact', 1);
$compact = get_user_preferences('tool_courseaudit_compact', 0);
```

## 13.43 Do not create a table for every preference

A `tool_courseaudit_userprefs` table with columns such as `userid`, `compact`, `showhelp`, and `defaulttab` is probably wasteful if the values are merely simple preferences. The Preference API already handles storage for authenticated users and also works with session behavior where necessary.

Documentation also recommends avoiding storing the default value for everyone. If the default is zero, simply use zero as fallback and only store users who chose something different.

## 13.44 Preferences are not for business data

The convenience of the API can tempt you to store anything there. Do not. Processing results, authorization, account balances, enrolments, academic progress, or critical workflow state are not preferences. A preference is a user choice about behavior or presentation.

If losing the value compromises business integrity, you probably chose the wrong place to store it.

## 13.45 Custom Fields API

The Custom Fields API is useful when a component needs to let administrators or responsible users configure additional fields that the plugin does not know in advance. This is very different from adding a fixed column to install.xml. A fixed column belongs to your domain contract; a custom field belongs to an extensible area whose configuration may vary from one installation to another.

core_course uses this mechanism for course custom fields, but any component can define its own areas when there is a genuine use case. The same subsystem also has the customfield plugin type for new field types, so consuming a custom-field area and creating a new field type are different responsibilities.

## 13.46 Areas, handler, and itemid

Every component exposing custom fields defines an area and a handler class under classes/customfield/. The handler extends \core_customfield\handler and acts as the bridge between the generic subsystem and the plugin's concrete entity, including context, instance, permissions, and configuration rules.

The itemid lets you decide whether the area configuration is unique for the whole component or varies per instance. A plugin may have a global area with itemid zero or let each activity configure its own set of fields using the instance ID. This decision needs to follow the product because choosing itemid for convenience changes the configuration model and the amount of metadata created.

```php
$handler = \local_acervo\customfield\asset_handler::create($itemid);
$data = $handler->get_instance_data($assetid);
```

## 13.47 Reading and displaying custom fields without bypassing authorization

The handler can return data controllers and output-ready representations, but documentation leaves one important responsibility to the caller: whoever invokes the API must validate access to the entity before requesting field values for that instance. The Custom Fields API organizes additional data; it does not grant permission to see the object owning that data.

Also do not use custom fields to hide a schema that should be explicit. If your rule fundamentally depends on status, billing institution, or an integration identifier, that data probably deserves its own structure, indexes, and upgrade contract. Custom fields work better for configurable extension, filtering, and optional metadata than as a generic replacement for database modeling.

## 13.48 Tags API

Tags are useful when users or the system need to classify objects using reusable labels and then find related objects. Moodle provides the Tags API to create taggable areas, associate tags with items, and search those relationships.

A tag and a tag instance are not the same thing. The tag is the label while the instance represents the association between that label and one particular object. This distinction matters especially during deletion and maintenance.

## 13.49 Defining a tag area

Plugins allowing tags should declare the appropriate area instead of simply storing comma-separated names in a column. The API can integrate the object into Moodle's tag ecosystem and existing administrative mechanisms.

If the requirement is only a fixed system-defined category, a tag may not be the right abstraction. Tags work best for flexible, potentially reusable classification.

## 13.50 Search API and Global Search

If the plugin stores relevant content, it can participate in Moodle's Global Search. This is much better than creating a separate search screen for every component and forcing users to remember where content lives.

The Search API works through search areas. Each area defines the kind of item that can be indexed, how an item becomes a searchable document, how access is checked, and how the result takes the user back to the content.

## 13.51 Search area

A search area normally lives in a component-specific namespace and extends the appropriate subsystem classes. The implementation needs to provide documents and access logic to Moodle.

The most important point is that indexing content does not make it public. The search area needs to respect context, capabilities, and visibility at the proper moment because a search result is also a form of information access.

## 13.52 Indexing does not happen on every search

Global Search should not execute `SELECT` against every table from every plugin each time the user types something. The system works from an index, and the plugin participates in indexing by supplying new or changed documents.

This explains why data-model changes need to consider index updates. If your record changes but the indexing mechanism cannot identify that change, users may continue finding stale content.

## 13.53 Indexed content should be sufficient, but not excessive

Do not serialize the entire record into the index simply because you can. Choose a title, textual content, and metadata that genuinely help locate the object. Secrets, tokens, administrative fields, or data a user should never search do not belong in the indexed document.

Search is an exposure surface and deserves the same care as any listing.

## 13.54 Dataformat API

Exporting data looks trivial until the report has 300,000 rows. Naive code often builds one gigantic array, converts everything to CSV in memory, and only then starts the download, so a feature that worked in development dies in production from memory exhaustion or timeout.

The Dataformat API standardizes export and supports Moodle output formats while allowing streaming-style generation when appropriate.

## 13.55 CSV, Excel, and available formats

Instead of hardcoding an exporter per file extension, the plugin can work with Moodle's data-format infrastructure. The same report can then be sent as CSV, Excel, or other formats available on the site without duplicating the whole generation logic.

Report data remains the plugin's responsibility. Output format should not force you to rewrite the query.

## 13.56 Large exports need incremental processing

If you use `$DB->get_records()` to fetch 500,000 records and then create the complete matrix in PHP, the problem has already happened before the first cell is written. For large exports, combine recordsets or pagination with incremental writing.

```php
$recordset = $DB->get_recordset_sql($sql, $params);

foreach ($recordset as $record) {
    // Converte apenas a linha atual para o formato de exportação.
}

$recordset->close();
```

The Dataformat API can receive data progressively, and the query must be designed for the same pattern.

## 13.57 Do not export data the user could not see on screen

Export is not an alternate route around capability checks, group mode, or filters. Before writing each dataset, apply the same authorization rules that would be used for a normal listing.

I have seen systems where the screen showed only a teacher's own data but the CSV button exported everything because the developer wrote a separate query and forgot the filter. The vulnerability was not in CSV; it was in duplicating the access rule.

## 13.58 Filename and encoding

Do not manually build HTTP headers unless necessary and do not assume every value can safely become a filename. Use Moodle's download and dataformat APIs, choose a safe predictable name, and let the subsystem handle the response.

CSV also brings details such as delimiter, escaping, and encoding. The less of this leaks into business code, the better.

## 13.59 A complete cross-cutting example

Imagine a course-audit plugin. An administrator configures whether the feature is enabled and the default deadline through the Config API. The title comes from the String API. The page uses `moodle_url` and `$PAGE`, enters administrative navigation through the correct mechanism, and respects capability checks. A teacher chooses whether they want a compact interface and this becomes a User Preference. When an audit is completed, the plugin triggers an Event, schedules a Calendar event when there is a deadline, and sends a notification through the Message API. The report respects the Groups API, completed reports can be indexed by the Search API, and results can be exported through Dataformat.

None of these APIs is the main product, but together they make the plugin feel like part of Moodle instead of a PHP system glued inside it.

## 13.60 The mistake of building a second platform inside Moodle

The more experience a developer has outside Moodle, the greater the temptation may be to bring the entire previous architecture along. They create a configuration table, preference table, custom notification service, custom cron, custom breadcrumbs, custom search, custom exports, and custom menu. Technically it can all work, but very quickly you have two platforms sharing the same screen.

Users configure one preference in Moodle and another in the plugin, receive notifications in two places, find some content in Global Search and other content in a separate search, while administrators need to learn a second configuration model.

Integrating with cross-cutting APIs reduces this friction and also reduces code.

## 13.61 Public API before internal table

One rule worth keeping from this chapter is this: if Moodle exposes a public API for an operation, try using it before querying the internal table that supports that API. This applies to configuration, preferences, messages, calendar, tags, search, groups, and logs.

This is not an absolute prohibition on SQL. There are reports where you genuinely need to query core data, but when performing an operation in a subsystem, its API is normally the correct contract.

## 13.62 Exercise — turn an isolated page into a real Moodle page

Take a report page that currently reads parameters from GET, builds URLs through concatenation, hardcodes text in PHP, renders breadcrumbs in HTML, stores sorting preference in its own table, sends email directly, and builds the entire CSV in memory. The task is to refactor it without changing the functional requirement.

First replace hardcoded text with the String API and URLs with `moodle_url`. Then correctly define `$PAGE`, context, and navigation. Move simple preferences into User Preferences, turn system email into a Message API notification with a declared provider, and check whether the event or deadline belongs in the Calendar API. If the report operates on a grouped course, start respecting Group mode. Finally, rewrite export using Dataformat and incremental processing, ensuring the export query applies exactly the same authorization rules as the screen.

The expected result is not merely fewer lines of code. The page should start behaving like part of Moodle, following language, permissions, preferences, navigation, message channels, and site infrastructure without maintaining parallel implementations.

## 13.63 Closing the chapter

These APIs are easy to underestimate because none of them in isolation seems as important as the database, security, or Files API. But the quality of a large plugin appears precisely in the sum of small decisions. A plugin using `get_config()`, strings correctly, `moodle_url`, `$PAGE`, the Navigation API, Message API, Calendar API, Groups API, Events, Preferences, Tags, Search, and Dataformat is not merely following convention; it is delegating responsibilities to Moodle and reducing the amount of infrastructure it needs to maintain itself.

In the next chapter we will go deeper into Web Services and integrations, and many ideas from here will return. Configuration stores endpoints and policies, strings feed errors and interface text, the Message API can report failures, Tasks remove heavy work from requests, and Events record what happened. Once these pieces are clear, external integration stops being a strange block attached to the plugin and starts using the same contracts as the rest of Moodle.

## Technical references consulted

* MOODLE. Moodle 5.0 developer update. Calendar: new human date renderers. https://moodledev.io/docs/5.0/devupdate
* MOODLE. Date and Time Output Classes. API available since Moodle 5.0. https://moodledev.io/docs/5.1/apis/subsystems/output/humandate
* MOODLE. Custom fields API. https://moodledev.io/docs/4.5/apis/core/customfields
* MOODLE. Developer Resources. Core APIs. Available at: https://moodledev.io/docs/5.1/apis/core
* MOODLE. Developer Resources. Navigation API. Available at: https://moodledev.io/docs/4.5/apis/core/navigation
* MOODLE. Developer Resources. Message API. Available at: https://moodledev.io/docs/5.0/apis/core/message
* MOODLE. Developer Resources. Calendar API. Available at: https://moodledev.io/docs/5.0/apis/core/calendar
* MOODLE. Developer Resources. Groups API. Available at: https://moodledev.io/docs/5.0/apis/subsystems/group
* MOODLE. Developer Resources. Preference API. Available at: https://moodledev.io/docs/5.2/apis/core/preference
* MOODLE. Developer Resources. Tag API. Available at: https://moodledev.io/docs/5.2/apis/subsystems/tag
* MOODLE. Developer Resources. Templates. Available at: https://moodledev.io/docs/5.0/guides/templates

{% endraw %}