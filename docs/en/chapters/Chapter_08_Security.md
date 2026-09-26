# 8 SECURITY

Security in a Moodle plugin is not a final checklist applied after the feature works. It is part of every decision involving input, authorization, output, files, SQL, external calls, tokens, and the relationship between an identifier received from the browser and the real object being accessed.

Moodle already gives developers strong building blocks: the Access API, contexts and capabilities, parameter cleaning, `sesskey`, DML parameter binding, Mustache escaping, the File API, HTTP infrastructure, and standard authentication. Those mechanisms only work when they are applied to the correct resource and threat. A page can call `require_login()` and still expose another user's records through an IDOR vulnerability.

## 8.1 Start with a threat model

Before choosing functions, identify what the plugin protects. Grades, personal data, payment state, assessment evidence, API credentials, course configuration, and a public catalog do not have the same impact when exposed or modified.

For each important operation, be able to answer:

- who may perform it;
- on which resource;
- in which Moodle context;
- whether ownership or another domain relationship further restricts access;
- which inputs cross a trust boundary;
- which side effects happen if the request succeeds.

A rule such as "a teacher with capability X may edit records belonging to this course" can be reviewed and tested. "This page is protected" cannot.

## 8.2 Authentication is not authorization

`require_login()` verifies that the request belongs to a Moodle session and, when a course is supplied, checks access to that course.

```php
require_login($course);
```

It does not mean the current user may manage every record in the course. Authorization still needs capabilities and, where applicable, ownership checks.

## 8.3 Capabilities

Declare plugin capabilities in `db/access.php` and check them at runtime.

```php
$context = context_course::instance($courseid);
require_capability('local/catalogsync:manage', $context);
```

Capability names should describe operations rather than roles. Prefer `local/catalogsync:manage` to something such as `local/catalogsync:teacher`, because Moodle roles are configurable and can vary among institutions.

## 8.4 Context is part of the permission

The same capability checked in system context and course context represents different authority.

If an operation belongs to course 42, use the course context unless the feature genuinely belongs to the whole site. For activity-specific actions, use the module context. User-specific actions may need a user context.

Choosing a broader context because it is convenient can silently grant access far beyond the intended resource.

## 8.5 `require_capability()` and `has_capability()`

Use `require_capability()` when the operation cannot continue without permission.

Use `has_capability()` when permission only changes optional output, such as whether an edit button is shown.

The endpoint behind that button must still enforce the capability. Hiding UI is not authorization.

## 8.6 Roles are configuration, not an API contract

Do not hardcode role IDs, role short names, or special user IDs.

Bad:

```php
if ($USER->id === 2) {
    // Allow administration.
}
```

A site may create a custom coordinator role with the necessary capability, and your plugin should work without knowing its name.

## 8.7 Ownership rules

Sometimes a capability allows an operation only over the caller's own records.

```php
$record = $DB->get_record(
    'local_example_response',
    ['id' => $id],
    '*',
    MUST_EXIST,
);

if ((int)$record->userid !== (int)$USER->id) {
    require_capability('local/example:manageallresponses', $context);
}
```

The relationship must come from server-side data, not a hidden field supplied by the browser.

## 8.8 IDOR

Insecure Direct Object Reference occurs when the server accepts an object ID but fails to verify that the current user is allowed to access that specific object.

Consider:

```
view.php?id=500&courseid=10
```

Checking permission in course 10 and then loading record 500 by ID alone is insufficient if record 500 might belong to another course.

Prefer loading through the relationship:

```php
$record = $DB->get_record(
    'local_example_report',
    [
        'id' => $id,
        'courseid' => $course->id,
    ],
    '*',
    MUST_EXIST,
);
```

Authorization must apply to the object actually being accessed.

## 8.9 Input validation

Retrieve request parameters through Moodle APIs.

```php
$id = required_param('id', PARAM_INT);
$status = optional_param('status', 'pending', PARAM_ALPHA);
```

The `PARAM_*` type validates format. It does not prove the corresponding object exists or that the current user may access it.

## 8.10 Avoid direct superglobal access

Do not use `$_GET`, `$_POST`, or `$_REQUEST` throughout ordinary Moodle pages. Direct access makes it easier to forget cleaning and creates ambiguity about where a value came from.

There are specialized cases, such as validating the exact raw body of a signed webhook, where raw request access is intentional. Isolate those cases at the integration boundary.

## 8.11 Cleaning is not authorization

This code:

```php
$userid = required_param('userid', PARAM_INT);
```

only proves the value is an integer. It does not authorize access to that user.

Likewise, `PARAM_URL` proves a value has URL syntax but does not make the destination safe for a server-side HTTP request.

## 8.12 CSRF and `sesskey`

Cross-Site Request Forgery abuses a logged-in browser to send an unwanted state-changing request. Moodle protects custom actions with the session key.

For state changes outside the normal Forms API flow:

```php
require_login();
require_capability('local/example:manage', $context);
require_sesskey();
```

A valid `sesskey` does not replace a capability. It proves the request carries the expected session token, not that the user has authority over the resource.

## 8.13 Do not perform destructive operations through GET

Opening:

```
delete.php?id=10
```

should not immediately delete record 10. Crawlers, browser prefetching, embedded requests, or copied links can trigger GET unexpectedly.

Use GET for a confirmation page and POST, a form, or an appropriate External Function to perform the actual mutation.

## 8.14 SQL Injection

Never concatenate untrusted values into SQL.

Bad:

```php
$sql = "SELECT * FROM {user} WHERE email = '{$email}'";
```

Good:

```php
$sql = "SELECT id, email
          FROM {user}
         WHERE email = :email";

$user = $DB->get_record_sql($sql, ['email' => $email]);
```

Moodle's DML parameter binding protects values and maintains database portability.

## 8.15 Dynamic identifiers need allowlists

SQL parameters cannot represent a column name or sort direction. If the user selects sorting, map the request to a fixed server-side list.

```php
$allowed = [
    'name' => 'u.lastname',
    'time' => 'u.timemodified',
];

$sort = optional_param('sort', 'name', PARAM_ALPHA);
$sortfield = $allowed[$sort] ?? $allowed['name'];

$sql .= " ORDER BY {$sortfield}";
```

Never append the raw request value.

## 8.16 XSS

Cross-Site Scripting happens when untrusted content reaches HTML or JavaScript as executable code.

Stored XSS is particularly dangerous in Moodle because content written by a student may later be viewed by a teacher or administrator. The attack executes with the privileges and session of the viewer.

Prefer Mustache's automatic escaping, `format_string()` for short formatted strings, and `format_text()` for rich content.

## 8.17 Input cleaning does not replace output escaping

A value cleaned with `PARAM_TEXT` is not automatically safe for every output context.

HTML text, HTML attributes, JavaScript, URLs, JSON, and SQL each have different encoding or binding requirements.

In Mustache, use `{{value}}` by default. In PHP, use Moodle output and formatting APIs instead of raw `echo` where possible.

## 8.18 `s()`, `format_string()`, and `format_text()`

`s()` escapes plain text for HTML.

```php
echo s($record->name);
```

`format_string()` is appropriate for short Moodle strings such as course or activity names.

```php
$name = format_string(
    $course->fullname,
    true,
    ['context' => $context],
);
```

`format_text()` handles rich content stored with a text format.

```php
$html = format_text(
    $record->description,
    $record->descriptionformat,
    ['context' => $context],
);
```

## 8.19 Mustache escaping and triple braces

Default variables are escaped:

```mustache
<span>{{name}}</span>
```

Triple braces are not:

```mustache
<div>{{{formatteddescription}}}</div>
```

Only use triple braces for values intentionally prepared as HTML through an appropriate Moodle formatting pipeline.

## 8.20 Avoid JavaScript injection

Do not generate executable JavaScript by concatenating user values into inline scripts.

Bad:

```php
echo "<script>openItem('{$name}');</script>";
```

Move behavior into ESM modules and exchange data through proper APIs. Browser-side code is visible and modifiable by the user.

## 8.21 Hidden fields remain untrusted

A hidden `userid`, `courseid`, or `ownerid` can be changed as easily as any visible input.

Reload trusted relationships from the database during processing and verify the caller's authority over them.

## 8.22 Mass assignment

Do not send an entire submitted object directly to persistence.

Bad:

```php
$DB->update_record('local_example_item', (object)$_POST);
```

Build the persisted record explicitly:

```php
$record = (object) [
    'id' => $id,
    'name' => $data->name,
    'description' => $data->description,
    'timemodified' => time(),
];

$DB->update_record('local_example_item', $record);
```

This prevents callers from adding administrative fields the interface never intended them to control.

## 8.23 File uploads

Use Forms API and File API rather than manually moving `$_FILES`.

Limit size and number of files, restrict types where the use case permits, and inspect content when the business rule depends on the real format. A `.pdf` filename is not proof that the bytes are a safe PDF.

Permanent files should live in Moodle's file areas and be served through authorization-aware mechanisms, not placed directly under a public web directory.

## 8.24 Antivirus

Moodle can integrate antivirus scanning into its file pipeline. Use site-level infrastructure instead of hardwiring a scanner call into every plugin upload.

Antivirus is one layer of defense; it does not replace authorization, file-type handling, or safe rendering.

## 8.25 Path traversal

Avoid building filesystem paths from request values. A value containing sequences such as `../` may escape the intended directory.

For Moodle-managed content, use the File API. If local filesystem access is genuinely necessary, use a fixed base directory, normalize the candidate path, and verify the resolved result remains inside the allowed root.

## 8.26 Local File Inclusion

Never include a file selected directly by request input.

Bad:

```php
$page = required_param('page', PARAM_RAW);
require(__DIR__ . "/pages/{$page}.php");
```

Use an allowlist or, preferably, explicit classes/routes.

```php
$handlers = [
    'summary' => summary_page::class,
    'details' => details_page::class,
];
```

Removing `../` from a string is not a robust LFI defense.

## 8.27 Command injection

Prefer PHP APIs and libraries to shell commands. When an external binary is unavoidable, validate every argument with strict allowlists and avoid shell interpretation where possible.

`escapeshellarg()` helps but should not become the entire security design for a command assembled from many dynamic pieces.

## 8.28 SSRF

Server-Side Request Forgery happens when user-influenced URLs make the Moodle server access internal or privileged destinations.

A feature such as "import from URL" or "test webhook" can become an SSRF proxy even when the URL uses HTTPS.

Validate more than syntax: constrain schemes, hosts, ports, and business-allowed destinations. Use Moodle's HTTP infrastructure and available SSRF protections.

## 8.29 Outbound HTTP

Use Moodle's HTTP/cURL infrastructure rather than raw sockets or unrelated clients. Site proxy and network settings can then be respected consistently.

Set sensible connection and request timeouts. A remote integration must not leave a PHP worker blocked indefinitely.

## 8.30 Allowlist external hosts

If the plugin exists to communicate with one known API, do not accept arbitrary destinations.

A setting that permits only `https://api.example.com` is safer than a generic URL field whose value is used for server-side requests. Administrator-controlled configuration is still a security boundary.

## 8.31 Webhook authentication

An incoming webhook is untrusted until verified.

Prefer provider-supported cryptographic signatures over a secret embedded in a query string. Verify signatures against the raw request body when required and include timestamp/replay protections where supported.

## 8.32 Replay protection and idempotency

A correctly signed webhook can still be replayed. If processing twice creates duplicate enrolments, payments, certificates, or messages, the endpoint is fragile.

Store a provider event ID or another idempotency key under a unique constraint and make repeated processing lead to the same final state.

## 8.33 Secrets

API keys, private keys, passwords, and bearer tokens must not be committed to Git, placed in browser JavaScript, or printed in templates.

Store secrets in appropriate configuration or infrastructure-level secret storage, minimize where they are readable, and redact them from exceptions and logs.

## 8.34 Tokens

Tokens should have limited scope, expiry or lifecycle where possible, and revocation.

For Moodle Web Services, use the platform's service and token infrastructure rather than inventing a parallel authentication table unless the external protocol genuinely requires it.

Avoid putting sensitive tokens in query strings because URLs commonly reach history, reverse proxies, access logs, and referrers.

## 8.35 Sensitive logs

Do not log an entire request or remote response merely because debugging is difficult. Payloads may contain personal data, passwords, access tokens, assessment content, or payment information.

Log identifiers and diagnostic metadata, redact secrets, and define retention according to the actual operational need.

## 8.36 Error messages

Production errors should help the user recover without exposing SQL, stack traces, filesystem paths, tokens, or confidential resource existence.

Developer debugging can expose technical details in controlled development environments. Do not use production users as your debug console.

## 8.37 Open redirects

A user-controlled `returnurl` can turn a trusted Moodle link into a redirect to a malicious site.

Prefer server-generated `moodle_url` targets. If a return destination must be supplied by the client, validate host and allowed path or map a logical destination to a server-side allowlist.

## 8.38 Clickjacking and browser security

Do not weaken site-level frame or browser security headers because an integration is easier when everything can be embedded.

If embedding is a real requirement, design an explicit origin policy and understand the effect on administrative and state-changing pages.

## 8.39 Content Security Policy

Code written without inline scripts, `eval`, arbitrary third-party CDNs, and dynamically generated JavaScript is easier to protect with CSP.

Use Moodle modules and controlled assets. Do not add permissive CSP exceptions to compensate for avoidable frontend architecture.

## 8.40 Privacy and security

An authorization bug exposing personal data is both a security incident and a privacy problem.

Use the Privacy API where applicable, collect only data the feature needs, define retention, and avoid storing information "just in case."

The most secure sensitive value is often the one you never collected.

## 8.41 Backup and restore

Backups can carry plugin data between environments. Do not place site-wide secrets in transportable course backup content.

Restore should treat backup content as data to be mapped and validated, not as trusted identifiers or executable content.

## 8.42 Scheduled tasks

Tasks often run without an interactive user session and with broad technical access. They still need to process only legitimate queued work, validate current state before side effects, and protect external calls with timeouts and idempotency.

Do not treat task custom data as permanently authoritative merely because it was serialized by your own code earlier.

## 8.43 Web Services and AJAX

Every External Function is a security boundary. Validate parameters, context, capability, and object relationships.

The fact that a request carries a valid Web Service token or comes from `core/ajax` does not eliminate object-level authorization.

## 8.44 Race conditions

This sequence is unsafe under concurrency:

1. check that a record does not exist;
2. insert it.

Two workers can pass step 1 simultaneously.

Protect structural invariants with unique indexes, transactions, atomic database operations, or Moodle locks depending on the problem.

## 8.45 Lock API

Use the Lock API when an operation must not run concurrently across workers or cluster nodes and a database constraint alone does not solve the problem.

Acquire with a bounded timeout and release inside `finally`.

A lock that can remain held indefinitely after an exception is a new reliability problem rather than a security solution.

## 8.46 Least privilege

Capabilities, service accounts, API tokens, filesystem permissions, and external credentials should receive the minimum authority required for the feature.

Least privilege limits the blast radius when a session, credential, or implementation is compromised.

## 8.47 Review checklist

Before releasing an endpoint, ask:

- Are request values retrieved and typed appropriately?
- Is authentication required where it should be?
- Is capability checked in the correct context?
- Does the specific object belong to the authorized resource?
- Are ownership rules enforced?
- Are mutations protected against CSRF?
- Is SQL parameterized?
- Is output escaped or formatted correctly?
- Are files stored and served through Moodle APIs?
- Are external URLs constrained against SSRF?
- Are secrets absent from the browser and logs?
- Is the operation safe under retry, replay, and concurrency?

## 8.48 Offensive testing of your own plugin

After the normal path works, deliberately stop behaving like the UI expects.

Change object IDs. Modify hidden user IDs. Remove `sesskey`. Replay POST requests. Use a different course role. Request another user's record. Insert markup in text fields. Change upload extensions and content. Point configurable URLs at local/private destinations in a controlled development environment.

The backend must remain secure even when the browser interface is bypassed.

## 8.49 Exercise - break and fix an insecure plugin

Build a deliberately insecure report plugin:

- load records only by ID;
- check permission in system context although records belong to courses;
- trust a hidden `userid`;
- delete through GET;
- concatenate search strings into SQL;
- render stored description without escaping;
- accept arbitrary import URLs;
- write full API responses including tokens to logs.

Exploit each weakness in a development environment, then refactor the plugin so:

1. the real course/context relationship is resolved on the server;
2. a specific capability is checked in that context;
3. object ownership is verified;
4. destructive actions use POST plus `sesskey`;
5. SQL is parameterized;
6. output uses Mustache escaping or `format_text()`;
7. outbound destinations are constrained;
8. logs redact secrets;
9. once-only actions are protected against concurrency;
10. automated tests cover at least one unauthorized object access and one unauthorized state change.

Security is successful when the server enforces the rule independently of what the interface happens to display.

## Technical references consulted

* Moodle Developer Resources. Security guidelines.
* Moodle Developer Resources. Access API.
* Moodle Developer Resources. DML API.
* Moodle Developer Resources. Output API and Templates.
* Moodle Developer Resources. File API.
* OWASP Web Security Testing Guide and OWASP Top 10.
