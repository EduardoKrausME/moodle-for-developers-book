{% raw %}

# 28 APPLIED OFFENSIVE SECURITY

Up to this point we have treated security almost entirely from the perspective of somebody building a plugin correctly. We used `required_param()`, capabilities, contexts, `require_login()`, `require_sesskey()`, DML with placeholders, the Output API, File API, Privacy API, and many other Moodle contracts because they prevent entire classes of problems. In this chapter we will reverse the perspective. Instead of starting with "which API should I use?", we will look at a plugin as somebody trying to break it and ask where data enters, at which point its trust level changes, which authorisation decisions are made, which files can be reached, which endpoints exist, and what happens when somebody sends values the interface would never send.

This does not mean turning Moodle development into generic penetration testing or teaching exploitation against third-party installations. Every laboratory here must run in a controlled development environment with a deliberately vulnerable plugin and test data. The idea is to learn how to find flaws in your own code before somebody else finds them in production, because effective security review depends less on memorising names such as XSS, IDOR, and SSRF and more on following the trust flow from a request to the operation it performs.

In the examples we will use a fictional plugin called `local_vulnlab`. It will have pages, AJAX, External Functions, files, a webhook, a task, and several deliberately badly written endpoints. In each laboratory we will first look at the defect, then a safe way to prove that it exists, and finally the patch. The goal of this chapter is not to produce reusable exploits; it is to train the review mindset and turn discovered problems into objective fixes.

## 28.1 Offensive security applied to development

Offensive security in this context means reviewing the plugin as though you trusted none of the assumptions made by the interface. If the form sends `courseid=42`, try `courseid=43`. If the screen hides a button from a learner, call the endpoint directly. If AJAX expects the current user's `userid`, change the value. If a page loads a file called `report.php`, ask whether an unexpected path such as `../../config.php` could be requested.

The difference from a purely defensive review is that you do not stop after seeing `require_capability()` in a file and ticking a checklist. You try to discover whether the capability is checked in the right context, whether the validated object really belongs to that context, whether another endpoint performs the same operation without the check, and whether a concurrent request can break the rule.

## 28.2 The laboratory must be disposable

Do not run the tests in this chapter in production or in an environment containing real data. Use a local installation or isolated development instance with fictional users, courses, and files.

A simple structure can contain:

```
Development Moodle
    |
    +-- test admin
    +-- test teacher
    +-- learner A
    +-- learner B
    +-- course A
    +-- course B
    +-- local_vulnlab
```

This lets you test identity, context, and ownership changes without risking real users.

## 28.3 The goal is not to "find a CVE"

A good plugin review does not begin by trying to fit code into a vulnerability acronym. It begins by understanding the functionality.

If there is a page that downloads reports, the first question is "who should be able to download which report?". If there is a webhook, ask "how does the server know who sent this message?". If a task consumes a queue, ask "what happens if two executions take the same item?".

Once the problem is understood, the technical name helps communicate and classify it, but it should not replace the reasoning.

## 28.4 Review methodology

I usually divide a manual review into six movements repeated across the whole plugin. First I discover every input, then every output, followed by authentication and authorisation decisions, file-access points, external integrations, and finally asynchronous and concurrent flows.

This creates a concrete list of places to review instead of opening random files and looking for something that "looks insecure".

## 28.5 Attack surface

The attack surface is the set of places through which somebody can influence plugin behaviour. In Moodle this includes much more than PHP pages reachable through a browser.

Look for:

```
*.php reachable by URL
classes/external/
db/services.php
classes/ajax/
pluginfile()
webhooks
auth/enrol callbacks
cron and tasks
CLI
file uploads
imports
URL parameters
forms
received JSON
administrative settings
consumed Events and Hooks
queue messages
content coming from external APIs
```

A small plugin can have a larger surface than it seems if it exposes several of these entry points.

## 28.6 Build an inventory before testing

Before touching the code, create a mental or written table with endpoint, expected context, authorised user, received data, and resulting effect.

For example:

```
/download.php
    context: course
    capability: local/vulnlab:download
    receives: fileid
    effect: serves file

/classes/external/delete_item.php
    context: module
    capability: local/vulnlab:manage
    receives: itemid
    effect: deletes record
```

When this cannot be explained easily, there is already a chance that the design is mixing responsibilities.

## 28.7 Identify inputs

Input is not only `$_POST`. Consider everything arriving in the plugin from outside the current function.

Typical inputs include:

```php
required_param() / optional_param()
Moodle forms
External Functions
AJAX
CLI options
HTTP headers
uploaded files
webhook payloads
settings
records coming from external APIs
received Events
task custom data
cookies
session
```

Some inputs may already have type validation, but that does not mean they have authorisation or ownership validation.

## 28.8 A valid type does not mean an authorised object

`PARAM_INT` guarantees that `itemid` is an integer, but it does not guarantee that the item belongs to the current course or that the user may access it.

This code validates the type:

```php
$itemid = required_param('itemid', PARAM_INT);
$item = $DB->get_record('local_vulnlab_item', ['id' => $itemid], '*', MUST_EXIST);
```

It still needs context, capability, and relationship validation between `$item` and the object the user is supposed to manipulate.

## 28.9 Identify outputs

Every output is a place where data can escape the expected trust level. This includes HTML, JSON, files, CSV, email, logs, exceptions, messages, JavaScript, and Web Service responses.

An XSS review looks at HTML, but a privacy review also looks at CSV and logs. A secret review looks at headers, exceptions, and debugging. Do not limit "output" to what appears visually in the browser.

## 28.10 Identify authorisation decisions

Look for:

```php
require_login()
require_course_login()
require_capability()
has_capability()
validate_context()
is_enrolled()
groups_*()
ownership checks
```

Then ask whether each decision occurs before sensitive data is read or changed and whether it uses the most specific possible context.

## 28.11 Identify exposed files

Look for every operation accepting a filename, filepath, itemid, or file ID. Then identify whether the plugin uses the File API or accesses the filesystem directly.

Warning signs include:

```php
file_get_contents($path)
readfile($path)
include($path)
require($path)
unlink($path)
move_uploaded_file(...)
fopen(...)
```

These functions are not vulnerabilities by themselves, but they deserve review when the path depends on external input.

## 28.12 Identify endpoints

Search for PHP files that are more than classes, `db/services.php`, External methods, AJAX callbacks, `pluginfile()`, and custom routes.

It is common to fix the main page and forget a secondary endpoint that calls the same operation without the same controls.

## 28.13 Flow-oriented review

After creating the inventory, choose a feature and follow its data to the end. For example, "delete report".

```php
request
 -> required_param('id')
 -> load record
 -> resolve context
 -> require_login
 -> require_capability
 -> require_sesskey
 -> delete
 -> event
 -> redirect
```

If the sequence is inverted or a step is missing, you have found a concrete review point.

## 28.14 SQL Injection laboratory

Consider this deliberately vulnerable code:

```php
$search = optional_param('search', '', PARAM_RAW);

$sql = "SELECT *
          FROM {local_vulnlab_item}
         WHERE name LIKE '%{$search}%'";

$records = $DB->get_records_sql($sql);
```

The problem is not `PARAM_RAW` alone. The problem is concatenating controllable data into SQL.

## 28.15 How to demonstrate SQL Injection safely

In the laboratory, do not try to extract real data or build a sophisticated payload. It is enough to use input containing quotes or metacharacters and observe whether the query breaks or changes behaviour.

An even better defensive test is to write PHPUnit that guarantees values containing quotes are treated as literal text and do not alter the query structure.

## 28.16 SQL Injection patch

Use placeholders:

```php
$search = optional_param('search', '', PARAM_RAW_TRIMMED);

$sql = "SELECT *
          FROM {local_vulnlab_item}
         WHERE " . $DB->sql_like('name', ':search', false);

$params = [
    'search' => '%' . $DB->sql_like_escape($search) . '%',
];

$records = $DB->get_records_sql($sql, $params);
```

The practical rule remains simple: values enter as parameters, not as SQL fragments.

## 28.17 Do not try to fix SQL Injection with `addslashes()`

Manually escaping quotes is not a substitute for bound parameters. Besides being database-dependent, it means you start maintaining two languages at once and increase the chance that a future condition concatenates another untreated value.

Moodle DML already exists to solve this portably.

## 28.18 Stored XSS

Stored XSS happens when malicious content is persisted and later executed for another user.

Vulnerable code:

```php
$record->title = required_param('title', PARAM_RAW);
$DB->insert_record('local_vulnlab_item', $record);

// On another page.
echo $record->title;
```

Persistence does not necessarily need to remove every special character, but output needs to respect the content type.

## 28.19 How to test Stored XSS

In the laboratory, save harmless HTML markup that lets you observe whether the browser interprets it or displays it literally. The goal is to prove that output lacks escaping, not to execute an action against third parties.

Then test the same input in the different places where the value appears, because it is common for a list to escape correctly while a detail page does not.

## 28.20 Stored XSS patch

If `title` is plain text:

```php
echo s($record->title);
```

Or in Mustache:

```mustache
<h3>{{title}}</h3>
```

Mustache escapes by default. Do not switch to `{{{title}}}` without a genuine need.

## 28.21 `format_string()` is not another name for `s()`

Use `format_string()` when a field is a label that may use filters and minimal Moodle-supported content, such as course or activity names.

For arbitrary plain text, `s()` or Mustache's natural escaping is more direct. For rich HTML, use `format_text()` with the correct format and context.

## 28.22 Reflected XSS

Reflected XSS does not need to persist in the database. Input is returned immediately in the response.

```php
$q = optional_param('q', '', PARAM_RAW);
echo '<p>Search for: ' . $q . '</p>';
```

The patch follows the same principle:

```php
echo html_writer::tag('p', 'Search for: ' . s($q));
```

Or, better, send the value to a template and let default escaping handle output.

## 28.23 XSS in JavaScript

A common mistake is escaping HTML and then placing the same value inside inline JavaScript:

```html
echo '<script>window.itemname = "' . $name . '";</script>';
```

The context changed, so the earlier escaping no longer applies. Avoid inline JavaScript and pass data using Moodle's own APIs or JS module initialisation with correctly serialised data.

## 28.24 Triple Mustache is a review point

Every occurrence of:

```mustache
{{{html}}}
```

deserves an immediate question: who produced this HTML and why is it already safe?

Sometimes the value came from `format_text()` and triple Mustache is correct. Other times somebody received `PARAM_RAW` and decided it "needs to render HTML". The difference is enormous.

## 28.25 CSRF

Cross-Site Request Forgery happens when an authenticated user's browser is induced to perform an action the user did not intend.

Vulnerable code:

```php
$id = required_param('delete', PARAM_INT);
require_login();
require_capability('local/vulnlab:manage', context_system::instance());
$DB->delete_records('local_vulnlab_item', ['id' => $id]);
```

The user may be authenticated and authorised, but the intent behind that request was not proven.

## 28.26 CSRF patch

For state-changing actions initiated by the interface, use POST when appropriate and validate the sesskey:

```php
$id = required_param('delete', PARAM_INT);
require_login();
$context = context_system::instance();
require_capability('local/vulnlab:manage', $context);
require_sesskey();

$DB->delete_records('local_vulnlab_item', ['id' => $id]);
```

The order can vary according to the flow, but the action must not happen without the required validation.

## 28.27 `sesskey` does not replace capability

If an authenticated learner can obtain their own `sesskey`, a page checking only `require_sesskey()` remains vulnerable to unauthorised action.

Sesskey proves intent inside the session. Capability proves permission. They are different controls.

## 28.28 GET that changes state

A URL such as:

```
/local/vulnlab/delete.php?id=12&sesskey=...
```

may exist in older flows, but for new significant operations prefer POST. GET should be used for reads whenever possible because URLs leak into history, logs, sharing, and referrer data much more easily.

## 28.29 IDOR

IDOR appears when the server trusts a received identifier without checking whether the user may access that object.

```php
$reportid = required_param('reportid', PARAM_INT);
$report = $DB->get_record('local_vulnlab_report', ['id' => $reportid], '*', MUST_EXIST);

require_login();
echo $report->content;
```

Changing `reportid` may expose another course's or user's report.

## 28.30 IDOR patch

Load the object, derive its actual context, and validate access in that context:

```php
$reportid = required_param('reportid', PARAM_INT);
$report = $DB->get_record('local_vulnlab_report', ['id' => $reportid], '*', MUST_EXIST);

$context = context_course::instance($report->courseid);
require_login(get_course($report->courseid));
require_capability('local/vulnlab:viewreport', $context);
```

If the report belongs to a specific user, ownership may still need to be validated.

## 28.31 Capability bypass

A capability bypass appears when an alternative route reaches an operation without the same check.

For example, `view.php` checks `local/vulnlab:manage`, but `ajax.php` calls the same class directly without checking the capability.

The fix is not duplicating five random `require_capability()` calls. Put the authorisation rule in a layer that every entry point must cross, or guarantee that every boundary explicitly validates access before calling internal logic.

## 28.32 Context confusion

Context confusion appears when the capability is correct but checked in the wrong context.

```php
$context = context_system::instance();
require_capability('local/vulnlab:manageitems', $context);
```

If the operation changes an item belonging to course 42, system context may make the rule broader than intended.

## 28.33 Context confusion patch

Derive the context from the object:

```php
$item = $DB->get_record('local_vulnlab_item', ['id' => $itemid], '*', MUST_EXIST);
$context = context_course::instance($item->courseid);
require_capability('local/vulnlab:manageitems', $context);
```

Do not accept a client-supplied `contextid` and use that value as proof of where the object lives.

## 28.34 `contextid` manipulation

Unsafe code:

```php
$contextid = required_param('contextid', PARAM_INT);
$context = context::instance_by_id($contextid);
require_capability('local/vulnlab:manage', $context);

$itemid = required_param('itemid', PARAM_INT);
$DB->delete_records('local_vulnlab_item', ['id' => $itemid]);
```

The user can send a context where they have the capability and an item belonging to another context.

## 28.35 Derive context; do not accept it as truth

When there is a primary object, load it and derive its context. `contextid` may still be received for optimisation or routing, but it must be compared with the object's real relationship before any authorisation decision.

This pattern also applies to `courseid`, `cmid`, `userid`, `groupid`, and other IDs that may look harmless.

## 28.36 `userid` manipulation

An endpoint that updates a user preference might do:

```php
$userid = required_param('userid', PARAM_INT);
$value = required_param('value', PARAM_BOOL);
set_user_preference('vulnlab_option', $value, $userid);
```

If any authenticated user can call it, they can alter somebody else's preference.

## 28.37 `userid` patch

If the action is always about the current user, do not accept the parameter at all:

```php
global $USER;
$value = required_param('value', PARAM_BOOL);
set_user_preference('vulnlab_option', $value, $USER->id);
```

If administrators can act on other users, model the capability and context explicitly.

## 28.38 `courseid` manipulation

Receiving `courseid` and calling `require_login($course)` is useful, but you still need to verify that manipulated objects belong to the same course.

A common mistake is loading `courseid=10`, passing every authorisation check in course 10, and then updating `itemid=900` belonging to course 11.

Validate relationships between IDs before mutation.

## 28.39 LFI

Local File Inclusion happens when external input directly influences an `include` or `require`.

A deliberately vulnerable example:

```php
$page = required_param('page', PARAM_RAW);
require(__DIR__ . '/pages/' . $page . '.php');
```

Even if the developer expects `page=dashboard`, the server cannot depend on that expectation.

## 28.40 LFI patch with an allowlist

When there is genuinely a finite set of pages, map logical values to fixed files:

```php
$page = required_param('page', PARAM_ALPHA);

$allowed = [
    'dashboard' => __DIR__ . '/pages/dashboard.php',
    'summary' => __DIR__ . '/pages/summary.php',
];

if (!isset($allowed[$page])) {
    throw new moodle_exception('invalidpage', 'local_vulnlab');
}

require($allowed[$page]);
```

Better still, organise behaviour into classes and internal routing without dynamic includes.

## 28.41 `basename()` does not solve every include problem

Applying `basename()` may reduce some path manipulation, but it does not answer whether that file should be loadable, whether the extension is allowed, or whether an unexpected file was placed in the directory.

For finite sets, an allowlist is stronger and easier to review.

## 28.42 Path traversal

Path traversal happens when a user can escape the expected directory using path components.

```php
$file = required_param('file', PARAM_RAW);
$path = $CFG->dataroot . '/local_vulnlab/' . $file;
readfile($path);
```

The fundamental problem is exposing a physical path as part of the API.

## 28.43 Path traversal patch

In Moodle, the answer is normally to avoid working with physical `moodledata` paths. Use the File API and identify files by context, component, filearea, itemid, filepath, and filename.

When a resource outside the File API genuinely needs filesystem access, use controlled identifiers and resolve the path on the server without accepting arbitrary client path segments.

## 28.44 File disclosure

File disclosure does not require traversal. A plugin can use the File API correctly and still serve a private file to the wrong person.

Example:

```php
$fileid = required_param('fileid', PARAM_INT);
$file = get_file_storage()->get_file_by_id($fileid);

send_stored_file($file);
```

The file exists, but no authorisation was performed.

## 28.45 File disclosure patch

Before serving it, derive the context and validate the relationship:

```php
$file = get_file_storage()->get_file_by_id($fileid);
if (!$file) {
    send_file_not_found();
}

$context = context::instance_by_id($file->get_contextid());
require_login();
require_capability('local/vulnlab:viewfiles', $context);
```

Depending on the filearea, also validate itemid and ownership of the associated record.

## 28.46 Vulnerable `pluginfile()`

A vulnerable callback often looks like this:

```php
function local_vulnlab_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    $fs = get_file_storage();
    $filename = array_pop($args);
    $filepath = '/' . implode('/', $args) . '/';

    $file = $fs->get_file(
        $context->id,
        'local_vulnlab',
        $filearea,
        0,
        $filepath,
        $filename
    );

    send_stored_file($file);
}
```

It trusts context, filearea, and access without validation.

## 28.47 `pluginfile()` patch

Validate the expected context, login, capability, filearea, and itemid before locating the file.

```php
if ($context->contextlevel !== CONTEXT_COURSE) {
    return false;
}

require_login($course);
require_capability('local/vulnlab:viewfiles', $context);

if ($filearea !== 'reports') {
    return false;
}
```

Then resolve the related record and confirm that the `itemid` genuinely belongs to that context.

## 28.48 Unsafe upload

An unsafe upload is not only accepting `.php`. It may involve unlimited size, unexpected extensions, active content, incorrect ownership, storage in a public directory, or serving a file inline when it should be downloaded.

In Moodle, use the File API and form-component controls, but still define `accepted_types`, size, and access rules consistently.

## 28.49 Do not trust only the extension

`document.pdf` does not prove that the content is a valid PDF, and `image.jpg` may contain unexpected content. Depending on the feature, MIME detection and additional processing may be needed.

Do not try to build your own antivirus. Define what the feature really needs to accept and restrict everything else.

## 28.50 SVG deserves attention

SVG is an active format and can carry resources and behaviours that other image formats do not. If untrusted users can upload files that will later be displayed inline, carefully evaluate whether SVG should be accepted.

The principle from Moodle security documentation remains valid: content uploaded by untrusted users needs to be served in a way that does not gain unexpected execution within the application domain.

## 28.51 Unsafe AJAX endpoint

An AJAX endpoint may look "internal" because only the plugin's JavaScript knows the URL, but that does not create protection.

Vulnerable code:

```php
require('../../config.php');

$id = required_param('id', PARAM_INT);
$value = required_param('value', PARAM_TEXT);

$DB->set_field('local_vulnlab_item', 'value', $value, ['id' => $id]);

echo json_encode(['ok' => true]);
```

Anyone who discovers the URL can call it.

## 28.52 Traditional AJAX patch

The page needs the same controls as any state-changing endpoint:

```php
require_login();
require_sesskey();

$item = $DB->get_record('local_vulnlab_item', ['id' => $id], '*', MUST_EXIST);
$context = context_course::instance($item->courseid);
require_capability('local/vulnlab:manageitems', $context);
```

Then return JSON through the appropriate mechanism and do not expose internal exception details.

## 28.53 Unsafe External Function

A vulnerable External Function:

```php
public static function execute(int $itemid, string $value): array {
    global $DB;

    $DB->set_field('local_vulnlab_item', 'value', $value, ['id' => $itemid]);

    return ['status' => true];
}
```

Even though parameters are typed in PHP, the External API contracts are missing.

## 28.54 External Function patch

The correct flow starts by validating parameters, then context and capability:

```php
$params = self::validate_parameters(
    self::execute_parameters(),
    [
        'itemid' => $itemid,
        'value' => $value,
    ]
);

$item = $DB->get_record(
    'local_vulnlab_item',
    ['id' => $params['itemid']],
    '*',
    MUST_EXIST
);

$context = context_course::instance($item->courseid);
self::validate_context($context);
require_capability('local/vulnlab:manageitems', $context);
```

In External Functions do not replace `validate_context()` with `require_login()`.

## 28.55 `db/services.php` does not protect the function

A capability declared in `db/services.php` helps with service configuration and documentation, but it does not replace the check inside `execute()`.

The endpoint still needs to validate context and capability during actual execution.

## 28.56 Missing sesskey in an administrative action

Administrative pages often receive too much attention around capability and too little around CSRF because the developer thinks "only admins can access this".

In reality that can increase the impact of CSRF. An external link capable of inducing an authenticated administrator to delete data may be much more serious than the same action from an ordinary account.

## 28.57 Capability in the wrong context

A patch that adds `require_capability()` can remain vulnerable if it chooses a broad context.

```php
require_capability(
    'local/vulnlab:manageitems',
    context_system::instance()
);
```

If the capability was designed for course context, the correct approach is to validate the object's course. Security is not the presence of a function; it is the match between the decision and the protected resource.

## 28.58 SSRF

Server-Side Request Forgery appears when the server makes a request to a URL controlled by a user or untrusted configuration.

```php
$url = required_param('url', PARAM_URL);
$curl = new curl();
$content = $curl->get($url);
```

`PARAM_URL` validates URL format but does not prove the destination is allowed.

## 28.59 SSRF risk in Moodle

A Moodle server may reach networks the user's browser cannot, such as internal hosts, metadata services, administrative panels, and firewall-protected services.

That is why "the server is only doing a GET" is not a security argument.

## 28.60 SSRF patch with controlled destinations

When the integration knows the allowed hosts, use an allowlist of hostnames and schemes:

```php
$parts = parse_url($url);

$allowedhosts = [
    'api.example.edu',
    'files.example.edu',
];

if (($parts['scheme'] ?? '') !== 'https'
        || !in_array($parts['host'] ?? '', $allowedhosts, true)) {
    throw new moodle_exception('invaliddestination', 'local_vulnlab');
}
```

Open-ended integrations need more complete defence, including protection against DNS resolution into internal networks.

## 28.61 Redirects can reopen SSRF

Even if the initial hostname is allowed, the remote server can reply with a redirect to another destination. If the library follows redirects automatically, the initial allowlist can be bypassed.

Review redirect behaviour and validate the effective destination as required by the integration.

## 28.62 Webhook without validation

A vulnerable webhook:

```php
$payload = file_get_contents('php://input');
$data = json_decode($payload);

process_payment($data->orderid);
```

Anyone who can reach the URL can forge the payload.

## 28.63 Webhook signature

The endpoint needs to validate authenticity according to the provider protocol, normally with an HMAC signature, shared secret, or asymmetric signature.

A generic check may look like:

```php
$received = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $received)) {
    throw new moodle_exception('invalidsignature', 'local_vulnlab');
}
```

In real code, follow exactly the algorithm, canonicalisation, timestamp, and headers defined by the provider.

## 28.64 Webhook replay

A valid signature does not prevent replay if the same message can be sent more than once and produce the same side effect repeatedly.

Use a unique event or transaction identifier and make processing idempotent. If the provider supplies a timestamp, validate its allowed time window according to the contract.

## 28.65 Token exposure

Tokens appear in unexpected places: query strings, exceptions, logs, screenshots, `var_dump`, debugging payloads, or JSON responses.

Avoid URLs such as:

```
/callback.php?token=super-secret-token
```

when the protocol allows headers or request bodies, because query strings are commonly recorded at several infrastructure layers.

## 28.66 Do not log the whole request

During debugging it is tempting to do:

```
error_log(json_encode($_SERVER));
```

That may include Authorization headers, cookies, tokens, and other secrets.

Log only required fields, with explicit redaction for credentials.

## 28.67 Race condition

A race condition appears when two requests that are individually correct produce an incorrect result when executed simultaneously.

Example:

```php
if (!$DB->record_exists('local_vulnlab_claim', ['itemid' => $itemid])) {
    $DB->insert_record('local_vulnlab_claim', [
        'itemid' => $itemid,
        'userid' => $USER->id,
    ]);
}
```

Two requests can both pass `record_exists()` before either insert occurs.

## 28.68 Fixing race conditions

Depending on the problem, use a unique index, transaction, Lock API, or a combination of these mechanisms.

For simple logical exclusivity, a database constraint is usually the most reliable final line of defence. For a larger flow involving several operations, a lock may be necessary.

## 28.69 A lock without a timeout becomes another problem

Do not use an infinite lock. Define a sensible timeout, handle failure to acquire it, and release it in `finally` when required.

A concurrency solution that blocks the entire cron process for hours has only replaced one bug with another.

## 28.70 Duplicate task

Adhoc Tasks can be queued twice because of retries, concurrent calls, or application logic.

If running twice causes duplicate charges, duplicate messages, or a destructive repeated change, the problem is in the operation design, not only the scheduler.

## 28.71 Task idempotency

Use a business key and record processing state:

```
external_event_id = evt_9348
status = processed
```

During execution, if the event has already completed, finish without repeating the side effect.

Do not use only the Adhoc Task ID for deduplication because a new task can represent the same external event.

## 28.72 Download without authorisation

A page may protect the screen listing documents and forget the direct download.

```php
$id = required_param('id', PARAM_INT);
$file = repository::get_file($id);
send_file($file->path, $file->name);
```

The download URL is an independent endpoint and needs to perform authorisation again.

## 28.73 Authorisation at the boundary

Do not trust "nobody knows this URL" or "the link only appears for teachers". The HTTP boundary needs to be secure on its own.

This principle applies to downloads, CSV exports, PDFs, previews, thumbnails, AJAX, Web Services, and any script that can be called directly.

## 28.74 Privacy leak

A privacy leak does not need to be a classic unauthorised-access vulnerability. It can be an authorised endpoint that returns too much data.

For example, a function returns learners with `email`, `idnumber`, IP address, and last access when the screen only needs name and status.

Less returned data means less leak surface.

## 28.75 `SELECT *` also deserves a privacy review

`SELECT *` is not automatically vulnerable, but in external endpoints and exports it can make accidental exposure easier when the table gains new sensitive fields.

Select explicitly what the response really needs.

## 28.76 Logs and privacy leaks

A plugin may protect its interface perfectly while persisting complete integration payloads containing national identifiers, email, tokens, or academic content in permanent logs.

Logs are data too. Define retention, access, redaction, and purpose.

## 28.77 `unserialize()` with untrusted input

If the plugin uses `unserialize()` on controllable content, mark it for immediate review. Object injection can cause unexpected effects depending on available classes.

For simple structured data, JSON is usually safer and more interoperable:

```php
$data = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
```

Even after that, validate the expected structure.

## 28.78 Unsafe dynamic call

Patterns such as:

```php
$callback = required_param('callback', PARAM_RAW);
call_user_func($callback, $data);
```

let input decide which code executes. In plugin architecture, prefer an explicit mapping of actions to known classes or methods.

## 28.79 Open redirect

If a page receives `returnurl` and redirects directly:

```php
redirect(required_param('returnurl', PARAM_URL));
```

the user can be sent to an external domain after passing through a trusted Moodle URL.

When the destination should be internal, validate that it belongs to the same site or use routes constructed by the server.

## 28.80 CSV Injection

CSV exports can be dangerous when user-controlled cells begin with characters interpreted as formulas by spreadsheet applications.

If the plugin exports data that will later be opened in Excel or equivalent software, evaluate formula neutralisation according to project policy and the library used.

Output security depends on the consumer, not only the file format.

## 28.81 Header injection

A filename or user-supplied text should not be concatenated directly into HTTP headers.

Use Moodle file-serving APIs and functions that handle filename and content disposition correctly instead of constructing `Content-Disposition` manually.

## 28.82 Email injection and templates

If a plugin sends email, do not accept arbitrary user addresses, subjects, or headers and pass them directly to a mail library without validation.

Use user objects, the Message API, and existing functions. For HTML bodies, apply the same reasoning about trusted content and escaping.

## 28.83 Command injection

Shell calls deserve strong review:

```
exec('convert ' . $filename . ' output.png');
```

If `$filename` is controllable, metacharacters can alter the command.

Avoid the shell when a PHP library exists. If you genuinely need it, escape arguments correctly and never build a command with naive concatenation.

## 28.84 `PARAM_FILE` does not make shell execution safe

`PARAM_FILE` reduces characters allowed in filenames, but it is not a universal policy for every command and does not remove the need to escape arguments.

Input filters do not replace output escaping specific to the destination context.

## 28.85 Sensitive information in exceptions

Never do this:

```php
throw new moodle_exception(
    'apierror',
    'local_vulnlab',
    '',
    null,
    'Token=' . $token . ' response=' . $rawresponse
);
```

Even information intended for debugging can reach logs or administrative interfaces. Record enough context to diagnose the problem without including secrets.

## 28.86 Debug mode is not permission to leak secrets

Development with `DEBUG_DEVELOPER` displays much more information, but code should still assume logs and screenshots can be shared.

Secrets should not appear in stack traces, exception payloads, or dumped objects.

## 28.87 Capability risk bits

When creating capabilities that allow unfiltered HTML, uploads, sensitive configuration, or actions capable of generating spam, use the appropriate risk bits in `db/access.php`.

This does not protect the operation by itself, but it helps administrators understand the risk when granting the capability.

## 28.88 Groups as a data boundary

In activities using separate groups, authorisation does not end at `require_capability()`. A learner may have permission to use the activity and still not be allowed to see records from another group.

Use the Groups API and account for `moodle/site:accessallgroups` where applicable. Manual SQL based only on `userid` often forgets these rules.

## 28.89 A visible course does not mean an accessible activity

An activity may be hidden or unavailable through the Availability API. Passing `courseid` and calling `require_login($course)` may be insufficient for activity endpoints.

When there is a `$cm`, use the login and module-context flow that accounts for that course module.

## 28.90 Test with a minimally privileged user

Many authorisation bugs do not appear when testing as admin because administrators can pass almost every restriction.

For offensive review, use a learner with minimal permissions and then add roles or overrides only as needed. The principle is to discover what an ordinary user can do outside the expected interface.

## 28.91 Test horizontal and vertical escalation

Horizontal escalation means accessing another user's data at the same privilege level, such as learner A reading learner B's response. Vertical escalation means performing a higher-role action, such as a learner calling a teacher endpoint.

Every feature receiving a `userid` or user-object ID deserves both tests.

## 28.92 Test cross-course behaviour

Create two courses and use similar business objects in both. Many flaws appear when code checks a capability in course A and accepts an object from course B.

This test is particularly important for `local` plugins aggregating information from multiple courses.

## 28.93 Test without JavaScript

If a button is hidden by JavaScript or the frontend prevents a particular option, call the request manually inside the controlled test environment or write PHPUnit for the internal function.

Interface controls must never be the only barrier.

## 28.94 Test extra and missing parameters

Do not test only different values. Remove fields, send arrays where scalars are expected when the boundary permits it, repeat parameters, and use boundary values.

The External API and Forms API help a lot, but manual endpoints may have fragile assumptions.

## 28.95 Test unexpected state

Try acting on an already deleted record, suspended item, invisible activity, unenrolled user, deleted course module, and already processed task.

Security and consistency flaws often appear in intermediate states, not on the happy path.

## 28.96 Automate security regressions

When you find a flaw, write a test that fails before the patch and passes afterwards. This turns a one-time discovery into permanent protection.

A fixed IDOR deserves a test where user A attempts to access user B's item. A fixed CSRF deserves the appropriate test of the internal method and validation flow where possible. A corrected capability deserves an explicit negative scenario.

## 28.97 PHPUnit for authorisation

A service test can create two courses, two learners, and one item per course, then execute the operation as learner A while trying to use the ID from course B.

The expected result should be a capability exception, access exception, or absence of data according to the contract.

What matters is proving negative behaviour, not only success.

## 28.98 Behat for the security interface

Behat is not the main tool for testing every vulnerability, but it is useful for guaranteeing that dangerous actions do not appear to inappropriate roles and that legitimate flows still work after the patch.

Combine Behat for the interface with PHPUnit for internal authorisation and domain rules.

## 28.99 Static analysis and grep help, but do not replace review

Pattern searches are excellent for identifying candidates:

```php
$_GET
$_POST
$_REQUEST
PARAM_RAW
include(
require(
readfile(
file_get_contents(
exec(
shell_exec(
unserialize(
call_user_func(
->get_records_sql(
{{{
```

But each occurrence needs context. `PARAM_RAW` is correct for some fields; `file_get_contents()` is safe with fixed paths; triple Mustache may receive already-sanitised HTML.

## 28.100 Plugin Validate is not a complete security scanner

Validation tools catch structure, Coding Style, and several poor patterns, but they do not know the business rule saying learner A must never read learner B's record.

Security requires tools and human review because ownership and context depend on the meaning of the data.

## 28.101 Reviewing external endpoints

For each External Function, use this mental order:

```
validate_parameters
load object
resolve most specific context
validate_context
require_capability
validate ownership/relationship
perform operation
return only required fields
```

If the function works across several contexts, validate each context before producing data from it.

## 28.102 Reviewing PHP pages

For normal pages:

```
require config.php
read parameters with PARAM_*
load course/cm/object
require_login or require_course_login
resolve context
require_capability
require_sesskey for state change
perform operation
render/redirect
```

The exact order can vary slightly, but any sensitive data read before authentication and authorisation deserves review.

## 28.103 Reviewing downloads

A short checklist:

```
does the file exist?
is the context expected?
is the user authenticated?
is the capability correct?
does itemid belong to the object?
is ownership/group correct?
is the filearea allowed?
is forcedownload appropriate?
```

If any answer depends on the URL having been generated by a protected screen, the download remains weak.

## 28.104 Reviewing HTTP integrations

For outbound calls, verify destination, TLS, timeout, redirects, secrets, logs, personal data, and unexpected responses.

For received callbacks, verify signature, replay, idempotency, payload size, and the logical origin of the transaction.

## 28.105 Reviewing tasks

Ask whether two tasks can process the same object, whether a retry repeats side effects, whether a lock exists where necessary, and whether custom data can point to an object that no longer exists.

Also check whether the task trusts IDs serialised months earlier without revalidating current state.

## 28.106 Reviewing Privacy

Do not limit security to intrusion. Check whether exports return too much data, deletion removes the correct user's records, logs and files are covered, and externally sent data was declared.

A privacy failure can exist even when every capability is correct.

## 28.107 How to write the report

A useful finding needs to be reproducible. Record the component, file, endpoint, precondition, required user, reproduction steps in the test environment, impact, root cause, and suggested patch.

Avoid reports that say only "critical IDOR". Explain which object can be read, by whom, and why current authorisation fails.

## 28.108 Severity without theatre

Not every flaw is critical. An XSS available only to an administrator with a capability marked `RISK_XSS` can have a very different risk from stored XSS created by a learner and executed for a teacher.

Context, required privileges, impact, and reach matter more than choosing the most alarming word.

## 28.109 Responsible disclosure

When the vulnerability is in a third-party plugin or core, do not publish an exploit before giving maintainers a reasonable chance to fix it. Moodle's security process exists precisely to avoid exposing details of unfixed flaws before security releases.

For your own private plugin, record the issue internally and control who receives the patch until the update has been distributed.

## 28.110 Do not fix a vulnerability with obscurity

Renaming `download.php` to `d93f2.php` is not a patch. Removing the menu link is not a patch. Minifying JavaScript is not a patch. Hiding an ID in Base64 is not a patch.

Fix authentication, authorisation, validation, escaping, or concurrency at the correct point.

## 28.111 Defence in depth

Some flaws deserve more than one barrier. A delete operation can have capability, ownership, sesskey, confirmation, and a transaction. A webhook can have TLS, signature, timestamp, and idempotency.

None of these layers justifies removing the others when they protect against different threats.

## 28.112 The `local_vulnlab` laboratory project

The deliberately vulnerable plugin can have this structure:

```
local/vulnlab/
    classes/
        external/
            update_item.php
        task/
            process_queue.php
    db/
        access.php
        services.php
    lang/
        pt_br/
            local_vulnlab.php
    files/
    delete.php
    download.php
    include.php
    search.php
    webhook.php
    lib.php
    version.php
```

Each file should contain one known flaw and a corrected version on the exercise patch branch.

## 28.113 Do not mix every flaw into the same endpoint

If `download.php` contains IDOR, path traversal, XSS, and CSRF all at once, the laboratory becomes confusing. One vulnerability per main flow makes the cause, test, and fix easier to understand.

After learning them in isolation, it becomes useful to audit a plugin where problems are mixed together more realistically.

## 28.114 Vulnerable branch and fixed branch

Use Git to keep:

```
vulnlab-vulnerable
vulnlab-fixed
```

The diff between branches becomes teaching material. The learner can review the vulnerable version without immediately receiving the answer and then compare the patch.

## 28.115 Final exercise - audit

Receive a deliberately vulnerable version of `local_vulnlab` without a list of flaws. Your first task is to map the entire attack surface, classifying pages, External Functions, files, webhook, and task.

Then create a table with:

```
ID
location
type of flaw
precondition
minimum required user
impact
reproduction steps
cause
patch
automated regression
```

Do not begin fixing while you are still discovering because premature changes can hide other related flaws.

## 28.116 Final exercise - minimum expected flaws

The laboratory should contain at least problems equivalent to:

```
SQL Injection
Stored XSS
Reflected XSS
CSRF
IDOR
capability bypass
context confusion
LFI
path traversal
file disclosure
unsafe upload
unsafe AJAX
unsafe External Function
manipulable contextid
manipulable userid
manipulable courseid
missing sesskey
capability in wrong context
SSRF
webhook without validation
token exposure
race condition
duplicate task
download without authorisation
vulnerable pluginfile
privacy leak
```

The exact implementation can vary so the exercise does not become a simple search for known names.

## 28.117 Final exercise - patch

For each problem, deliver a separate commit whenever that makes sense. The patch should use Moodle APIs instead of improvised filters.

Expected correction examples:

```
SQLi -> placeholders/DML
XSS -> Output API/escaping/format_text
CSRF -> POST + sesskey
IDOR -> ownership + real context
LFI -> allowlist or removal of dynamic include
files -> File API + authorisation
External -> validate_parameters + validate_context + capability
SSRF -> controlled destinations
race -> constraint/Lock API/idempotency
privacy -> reduce data and cover provider
```

## 28.118 Final exercise - regression tests

The work does not end with the patch. Write PHPUnit or Behat tests for at least the authorisation, context, and concurrency flaws that can be automated.

A correction without automated regression protection can disappear a few months later during an apparently harmless refactor.

## 28.119 Final exercise - cross-review

After fixing the plugin, give it to another person without explaining the patches and ask for a fresh review. If they find the same problem through another route, the correction was too localised.

This step also helps discover assumptions the patch author is still making without noticing.

## 28.120 What this chapter should change in the way you program

After practising these laboratories, the goal is not to become paranoid about every `PARAM_RAW`. The goal is to develop the habit of following trust and authorisation through the entire flow.

Whenever you write a new endpoint, ask where the ID came from, who controls the value, which context the object really belongs to, who may perform the action, whether the action needs a sesskey, how output will be interpreted, whether any file can escape its intended area, and what happens when two requests arrive at the same time.

When these questions become part of development before code review, most vulnerabilities in this chapter stop looking like a list of attacks and start looking like a collection of architectural mistakes you already know how to recognise.

## Technical references consulted

* MOODLE. Moodle Developer Resources. Security. Available at: https://moodledev.io/general/development/policies/security. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Cross-site scripting. Available at: https://moodledev.io/general/development/policies/security/crosssite-scripting. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Cross-site request forgery. Available at: https://moodledev.io/general/development/policies/security/crosssite-request-forgery. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. External functions security. Available at: https://moodledev.io/docs/5.0/apis/subsystems/external/security. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. File API. Available at: https://moodledev.io/docs/5.2/apis/subsystems/files. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Plugin contribution checklist. Available at: https://moodledev.io/general/community/plugincontribution/checklist. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Peer review. Available at: https://moodledev.io/general/development/process/peer-review. Accessed: 24 Sep. 2026.
* OWASP FOUNDATION. OWASP Cheat Sheet Series. Available at: https://cheatsheetseries.owasp.org/. Accessed: 24 Sep. 2026.

{% endraw %}
