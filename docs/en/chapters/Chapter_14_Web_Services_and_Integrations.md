{% raw %}

# 14 WEB SERVICES AND INTEGRATIONS

![Web Services and Integrations](image/cap14-web-services-integrations.png)

There comes a point when Moodle stops talking only to itself. An ERP needs to enrol students, a financial system needs to report that an invoice was paid, an application needs to retrieve course data, an external dashboard needs to read indicators, the frontend needs to save a change without reloading the page and, suddenly, the class that until yesterday was called only by a PHP page becomes a boundary between different systems. That is exactly when a very common mistake appears: the developer takes a function that already exists, puts something into `db/services.php`, generates a token, and considers the integration solved.

But a Web Service is not a PHP function with remote access. When you expose an operation outside the normal page flow, you create a public contract with parameters, types, permissions, context, return format, error behavior, and consequences that need to remain predictable even when the caller is not your own code. The call may come from the Moodle App, JavaScript running inside Moodle, an ERP, a webhook, a command-line script, or an application you do not even know exists yet. That changes how implementation should be designed.

In this chapter we will build this boundary carefully. We will cover the External API, external functions, `classes/external`, `db/services.php`, input and output structures, services, tokens, AJAX, `core/ajax`, REST, calls to external APIs using Moodle's `curl` class, retry, timeout, rate limits, webhooks, and idempotency. We will also look at the newer Routing subsystem, available since Moodle 4.5, because in 2026 it no longer makes sense to teach integration as though the only possible path were exactly the same one used ten years ago. At the same time, we will not discard the traditional External API, which remains extremely important and sits behind AJAX, Mobile, and a large part of existing integrations.

## 14.1 First of all, there is a boundary

When a plugin PHP page calls an internal class, both sides live in the same process, share the same code version, and are normally updated together. When an ERP calls a Web Service, none of that is guaranteed. The ERP may be written in another language, maintained by another team, call a function created three years ago, and interpret any small change in the response as a broken integration.

So the first mindset change is this: external code is not merely reusable code, it is a contract. If today a function returns `userid`, `fullname`, and `status`, removing `status` tomorrow can break an integration even if the plugin continues working perfectly through its interface. If a field is optional today and becomes mandatory tomorrow, you changed the contract. If an error returns a warning today and becomes an exception tomorrow, you changed the contract.

This is similar to a public class API, but with greater consequences because consumers may live outside your repository, your company, and even your control.

## 14.2 External API

The External API is Moodle's infrastructure for declaring functions that can be consumed externally in a structured way. It describes accepted parameters and returned values, performs type validation, and provides the foundation used by several mechanisms, including traditional Web Services, AJAX calls, and the Moodle App.

The most important point is that the External API should not contain all the plugin's business logic. I prefer to think of it as an adapter layer. It receives data from outside, validates that data, establishes the correct context, checks authorization, calls the component's internal API, and returns a structure compatible with the external contract.

This design makes integration easier to test and avoids duplicated rules. The same operation used by the Web Service can be used by a PHP page, a task, or another component without making an HTTP call back into the same Moodle site and without copying logic into four places.

## 14.3 Internal API and external API are not the same thing

Imagine a plugin with a class responsible for approving a request.

```php
$result = request_manager::approve($requestid, $userid);
```

That class can receive objects, enums, domain-specific exceptions, and types that make sense inside PHP. The external function needs different care because it must accept serializable values, declare every parameter, and return something the external mechanism knows how to validate and transform into JSON, XML, or another supported protocol.

A simple architecture looks like this.

```
Frontend / ERP / App
        |
        v
External API
        |
        v
API do componente
        |
        v
DML / Events / Files / outras APIs Moodle
```

The mistake is putting the database, business rule, authorization, external integration, and return transformation all inside one `execute()` function. It works during the first month and becomes a problem when the same action needs another entry point.

## 14.4 classes/external

In current Moodle versions, external-function classes should live inside the component's `external` namespace, normally under `classes/external/`.

For a `local_integracao` plugin, a function used to query an order might live here.

```
local/integracao/classes/external/get_order.php
```

With a namespace.

```
namespace local_integracao\external;
```

The class normally extends `\core_external\external_api`.

```
use core_external\external_api;

class get_order extends external_api {
    // ...
}
```

Older code may still appear in `externallib.php`, because for many years that was a common way to declare external functions, but for current development I would avoid creating new code in that format when namespaced, autoloaded structure is available.

## 14.5 Anatomy of an external function

A modern external function normally has three main parts.

```php
public static function execute_parameters(): external_function_parameters {
    // Descreve entrada.
}

public static function execute(int $orderid): array {
    // Executa a operação.
}

public static function execute_returns(): external_single_structure {
    // Descreve saída.
}
```

The signature of `execute()` must correspond to what was declared in `execute_parameters()`. This is not optional documentation; it is part of the function contract and validation.

I like to think of these three functions as three separate questions: what comes in, what happens, and what goes out. If any one of them is vague, the whole integration is vague.

## 14.6 db/services.php

Creating the class is not enough. Moodle needs to know the external function exists, and that declaration happens in `db/services.php`.

```php
$functions = [
    'local_integracao_get_order' => [
        'classname' => 'local_integracao\\external\\get_order',
        'description' => 'Returns an order visible to the current user.',
        'type' => 'read',
        'ajax' => true,
    ],
];
```

The function name must be globally unique, which is why the Frankenstyle prefix matters. The `type` property tells Moodle whether the function reads or writes, while `ajax` defines whether it may be used through Moodle's AJAX endpoint.

After changing `db/services.php`, remember the file is processed during installation and upgrade, so the plugin version must be incremented and the upgrade executed before the definition reaches the internal tables used by the subsystem.

## 14.7 Do not confuse an external function with a service

An external function is one individual operation. A service is a group of functions exposed under a particular configuration.

You may have a function.

```
local_integracao_get_order
```

And a service named, for example.

```
ERP Integration
```

Containing several functions.

```
local_integracao_get_order
local_integracao_create_order
local_integracao_update_order
```

This separation lets you control which functions a particular integration may use rather than handing every consumer the entire universe of functions available on the site.

## 14.8 Predefined service or administrator-configured service

The plugin can declare a service in `db/services.php`.

```php
$services = [
    'ERP integration' => [
        'functions' => [
            'local_integracao_get_order',
            'local_integracao_update_order',
        ],
        'restrictedusers' => 1,
        'enabled' => 1,
        'shortname' => 'local_integracao_erp',
    ],
];
```

But a custom service is not always necessary. An administrator can also create services through the interface and select functions according to the integration's needs. Defining a fixed service in the plugin makes sense when it represents a known, stable integration that should exist with a controlled function set.

Do not create five services just because the file allows it. A service is an access and operation boundary, not visual organization for `db/services.php`.

## 14.9 ajax in db/services.php

When you define.

```
'ajax' => true,
```

You are telling Moodle that the external function may be called through the AJAX mechanism using the current session. This does not automatically make it a public REST service and does not remove authorization from `execute()`.

I see a lot of code treating `ajax => true` as though it were a security seal. It is not. It merely makes the function available through the appropriate AJAX endpoint. Who may do what remains the function's responsibility.

## 14.10 External structures

The External API works with explicit data descriptions. Among the most commonly used classes are.

```
external_function_parameters
external_value
external_single_structure
external_multiple_structure
```

They can describe everything from a simple integer to a complete record tree.

```
return new external_function_parameters([
    'orderid' => new external_value(PARAM_INT, 'Order ID'),
]);
```

Or a list of objects.

```
return new external_multiple_structure(
    new external_single_structure([
        'id' => new external_value(PARAM_INT, 'Order ID'),
        'status' => new external_value(PARAM_ALPHANUMEXT, 'Order status'),
    ])
);
```

Do not treat this as bureaucracy. This description is what lets Moodle validate input, validate output, and document the contract.

## 14.11 external_value

`external_value` represents a scalar value and receives a type based on the same `PARAM_*` used elsewhere in Moodle.

```
'courseid' => new external_value(PARAM_INT, 'Course ID')
```

Choose the type that actually describes the data. Using `PARAM_RAW` for everything because "then it doesn't complain" is the external-API equivalent of disabling validation and hoping callers behave.

For numeric identifiers, use `PARAM_INT`. For text without tags, there is normally a more appropriate type. For URLs, email addresses, component names, and other recognized formats, use the corresponding parameter type whenever the contract allows it.

## 14.12 VALUE_REQUIRED, VALUE_OPTIONAL, and VALUE_DEFAULT

Not every field has the same requirement.

```
'limit' => new external_value(
    PARAM_INT,
    'Maximum number of records',
    VALUE_DEFAULT,
    100
)
```

A required value must exist, an optional value may be absent, and a defaulted value has explicit behavior when omitted. This is part of the contract and should be chosen based on meaning, not simply to reduce exceptions during development.

A field that is semantically required should not receive `VALUE_OPTIONAL` just because the current frontend always knows how to fill it. Another consumer may not know tomorrow.

## 14.13 validate_parameters()

Declaring parameters does not replace validation inside `execute()`. The external function must validate received data against its own description.

```php
$params = self::validate_parameters(
    self::execute_parameters(),
    [
        'orderid' => $orderid,
    ]
);
```

From that point onward you work with `$params`, which represents input validated and cleaned according to the contract.

Skipping this step is especially dangerous because it creates a false sense of security. The developer wrote `execute_parameters()`, looks at it, and assumes the data has already been validated, but validation must actually be executed.

## 14.14 validate_context()

After input comes context. If the operation works with data belonging to a course, module, user, or system, obtain the corresponding context and validate it.

```php
$context = context_course::instance($courseid);
self::validate_context($context);
```

This call matters inside external functions and should not be replaced with `require_login()` as though they were equivalent. The Web Service environment has its own characteristics, and `validate_context()` performs checks and prepares the context required for the external operation.

The context should be the most specific one related to the resource. Using `context_system` for everything remains just as wrong here as it was in Chapter 8.

## 14.15 Capability is still required

Validating context does not answer whether the user may perform the action. After establishing the correct context, check the relevant capability whenever the operation requires it.

```php
require_capability('local/integracao:vieworders', $context);
```

If the function changes data.

```php
require_capability('local/integracao:manageorders', $context);
```

An external function does not receive special permission merely because it is external. On the contrary, it deserves extra care because it creates another path to the same business rule.

## 14.16 userid, courseid, and other client-supplied IDs

Chapter 8 already covered this heavily, but in Web Services the problem appears all the time. The client sends.

```
{
  "userid": 18,
  "courseid": 72
}
```

And the code accepts these numbers as though being integers proved authorization. `PARAM_INT` only proves the value is an integer. It does not prove the current user may access course 72 or operate on user 18.

Validate the type, load the real record, determine the context, check capability, and, when necessary, verify the relationship between the authenticated user and the requested object.

## 14.17 Do not put all business logic inside execute()

A better implementation normally looks like this.

```php
public static function execute(int $orderid): array {
    $params = self::validate_parameters(
        self::execute_parameters(),
        ['orderid' => $orderid]
    );

    $order = order_repository::get($params['orderid']);
    $context = context_course::instance($order->courseid);

    self::validate_context($context);
    require_capability('local/integracao:vieworders', $context);

    return order_service::get_external_data($order);
}
```

The External API handles the boundary while `order_service` handles the domain operation. This also reduces the temptation for another class to call `get_order::execute()` directly just to reuse code.

## 14.18 Do not call an external function directly as your internal API

Even though an external function is a PHP class, calling it directly from another component is not the best path. Moodle documentation calls attention to this because external functions depend on their own environment, language, theme, and context behavior.

If you genuinely need to invoke an external function programmatically, use the External API's own mechanism. But in most cases, the better solution is extracting logic into the component's internal API and having both paths call that internal API.

This returns to the separation established at the beginning of the chapter. The External API is an adapter, not the center of the plugin universe.

## 14.19 execute_returns()

The response is also a contract and must be described explicitly.

```
public static function execute_returns(): external_single_structure {
    return new external_single_structure([
        'id' => new external_value(PARAM_INT, 'Order ID'),
        'status' => new external_value(PARAM_ALPHANUMEXT, 'Current status'),
        'timemodified' => new external_value(PARAM_INT, 'Modification timestamp'),
    ]);
}
```

Do not declare one thing and return another. Moodle validates the return value, which is excellent because it catches inconsistencies before a consumer receives JSON whose shape changes depending on the execution path.

## 14.20 A return that is "too flexible" becomes impossible to maintain

Try to avoid responses where a field is sometimes an integer, sometimes a string, and sometimes absent without a clear rule. That makes the integration fragile and usually forces consumers to write dozens of defensive checks.

If a value may be absent, declare that possibility. If there are different states, model them. If an operation can return an empty list, return an empty list rather than alternating among `false`, `null`, object, and array.

The objective is not to make the response pretty, but predictable.

## 14.21 Warnings

Not every condition needs to abort the whole function. In operations processing multiple records, it may make sense to return results together with warnings for items that could not be processed.

Core provides `external_warnings`, used by many external functions.

```
use core_external\external_warnings;

'warnings' => new external_warnings()
```

The result can then include structured warnings.

```php
$warnings[] = [
    'item' => 'order',
    'itemid' => $orderid,
    'warningcode' => 'alreadyprocessed',
    'message' => get_string('alreadyprocessed', 'local_integracao'),
];
```

A warning is useful for recoverable conditions. Do not use warnings to hide authorization failures, data corruption, or an error that makes the operation invalid.

## 14.22 Exceptions

When the operation cannot continue, throw an appropriate exception instead of returning.

```
return ['success' => false, 'error' => 'qualquer coisa'];
```

That pattern looks simple, but it invents an error protocol for every function. Web Service infrastructure already knows how to handle exceptions and turn failures into responses suitable for the transport protocol.

Also avoid exposing unnecessary internal details. Stack traces, complete SQL, API secrets, or sensitive content should not become part of an error returned to a client.

## 14.23 Traditional Moodle REST

In the classic model, Moodle exposes external functions through Web Service endpoints, with REST being one of the most common protocols. A call normally includes a token, function name, response format, and the function-specific parameters.

A simplified URL looks like this.

```
/webservice/rest/server.php
```

With parameters such as.

```
wstoken
wsfunction
moodlewsrestformat=json
```

Do not put a real token from your environment into an example, public documentation, log, or screenshot. Always use fictitious values.

## 14.24 Protocols

Moodle has a Web Service protocol architecture and historically supports different communication styles. REST became the most common approach in modern integrations because it fits HTTP and JSON clients well, but the External API is conceptually separate from the protocol.

This matters because the external function should not depend on transport-specific details. It describes data and operation while the protocol server converts request and response.

## 14.25 Tokens

A token is a credential. That sounds obvious, but many projects treat tokens as ordinary configuration and then they appear in Git, screenshots, support tickets, debug logs, and shell history.

A Web Service token represents access within the rules of the associated user and service. If that user has broad privileges and the service exposes many functions, the impact of leakage grows accordingly.

Prefer narrow services, dedicated users when appropriate, and the minimum capabilities required by the integration.

## 14.26 A token does not replace authorization inside the function

A function should not conclude "there is a token, therefore access is allowed." The token identifies and authenticates a user within a service, but the function still needs to validate context and capability for the actual operation.

Think in two layers.

```
Token/serviço -> quem conseguiu entrar por esta porta
Capability/contexto -> o que esse usuário pode fazer neste objeto
```

Removing the second layer creates an API where any function added to the service trusts the technical integration user far too much.

## 14.27 Restricted services

Services can be restricted to particular users, which is useful when an integration should only be available to specific accounts. This reduces the access radius and makes administration more explicit.

Even so, a restricted service does not remove capability checks, context validation, or parameter validation. Integration security works in layers rather than one checkbox in administration.

## 14.28 Dedicated technical user

Using a personal administrator account as the token owner for an ERP integration is a poor design. The person changes role, password, MFA, permissions, or leaves the institution and the ERP stops working, while logs mix human actions with automated actions.

When appropriate, create an identifiable technical user with minimum permissions and a documented purpose. This improves auditing and reduces dependence on a personal account.

## 14.29 Never store a token in source code

This should never exist.

```php
$token = 'abc123-token-real-da-producao';
```

Not in PHP, JavaScript, or an example file committed to Git. Secrets belong in appropriate environment configuration with restricted access.

Also be careful not to print a token in `mtrace()`, `debugging()`, exceptions, query strings captured in logs, or administrative screens.

## 14.30 Web Service and AJAX are not the same thing

Both can use the External API, but authentication and transport are different. An external REST client normally uses a token and a Web Service endpoint. JavaScript running inside Moodle normally uses the current session and `core/ajax`.

The external function may be the same, but you should not teach frontend code to manually call REST with a user token just to save a form inside Moodle. That increases risk, exposes credentials, and ignores Moodle's own AJAX infrastructure.

## 14.31 core/ajax

The traditional recommendation for AJAX interactions in Moodle is to use `core/ajax`, which calls external functions marked with `ajax => true` using the current session.

```
import Ajax from 'core/ajax';

export const loadOrder = async(orderid) => {
    const [result] = await Ajax.call([{
        methodname: 'local_integracao_get_order',
        args: {orderid},
    }]);

    return result;
};
```

The frontend does not need to know `/lib/ajax/service.php`, internal payload format, `sesskey`, or serialization details. That abstraction is exactly why you use `core/ajax` instead of a manual `fetch()` pointing to internal endpoints.

## 14.32 A repository.js or service module for calls

Even in small JavaScript code, I prefer concentrating external calls in a specific module.

```
amd/src/repository.js
```

Or, in newer frontend architectures, an equivalent service module.

The screen calls.

```
const order = await repository.getOrder(orderid);
```

And only the repository knows which `methodname` to use. When the contract changes, you do not need to hunt for `Ajax.call()` across five visual components.

## 14.33 loginrequired => false is an exception

Current documentation allows, in very specific cases, an AJAX function to be marked safe for use without a session. This exists for completely public information that is cheap to query.

Do not use it to work around login because "the screen has not opened a session yet." If the function accesses private data, depends on a user, changes state, or can be abused to consume resources, it should not be exposed that way.

Any security exception that feels too convenient deserves a second reading.

## 14.34 Moodle App

The Moodle App also consumes external functions. When a function needs to be available in the official Mobile service, it can be associated with the appropriate service in its declaration.

```
'services' => [
    MOODLE_OFFICIAL_MOBILE_SERVICE,
],
```

Do not mark a function for Mobile automatically. Consider whether the contract actually makes sense for the application, data volume, mobile connectivity, permissions, and offline behavior when relevant.

## 14.35 Calling third-party APIs

So far we have mostly discussed systems calling Moodle. The opposite direction is also common: Moodle needs to call an ERP, payment gateway, CRM, video service, digital-signature provider, or any external API.

Here the tool changes. You are not creating an external function to call the ERP. You are writing an HTTP client inside the plugin.

And that client should live in its own class.

```
classes/client/erp_client.php
```

Instead of scattering `curl` across pages, tasks, observers, and Web Services.

## 14.36 Moodle Curl API

Moodle provides a `curl` class for HTTP requests that integrates better with system proxy and infrastructure configuration than creating a completely independent connection.

```php
$curl = new \curl();

$response = $curl->get(
    'https://api.exemplo.com/orders/123',
    [],
    [
        'timeout' => 15,
        'connecttimeout' => 5,
    ]
);
```

For POST.

```php
$curl = new \curl();
$curl->setHeader([
    'Content-Type: application/json',
    'Authorization: Bearer ' . $token,
]);

$response = $curl->post(
    'https://api.exemplo.com/orders',
    json_encode($payload),
    ['timeout' => 20]
);
```

After the call, inspect status, content, and error conditions instead of assuming a non-empty response means success.

## 14.37 core\http_client in Moodle 5.0

The curl class remains part of the Moodle ecosystem and you will find plenty of correct code using it, but modern Moodle also provides \core\http_client, built on Guzzle and compatible with PSR-18. For new service-class code, especially when the integration needs clean tests, http_client fits better with the Dependency Injection model studied in Chapter 4.

```php
namespace local_integracao\local;

final class erp_client {
    public function __construct(
        private readonly \core\http_client $client,
    ) {
    }

    public function fetch_order(int $id): array {
        $response = $this->client->request(
            'GET',
            'https://erp.example.test/orders/' . $id,
            ['timeout' => 5],
        );

        return json_decode((string) $response->getBody(), true, flags: JSON_THROW_ON_ERROR);
    }
}
```

The benefit is not simply replacing one HTTP call with another bearing a newer name. The benefit is having the class declare it depends on an HTTP client, letting dependency construction live outside the business rule and letting tests replace the real client without intercepting the network.

## 14.38 PSR-18 and why it matters

\core\http_client implements the PSR-18 contract through sendRequest(), in addition to exposing operations provided by Guzzle. Most plugins do not need to memorize the standard, but understanding that there is a contract helps separate "make an HTTP request" from "use one specific concrete class."

This separation is particularly useful in internal libraries and larger integrations. If a class depends only on a client contract, testing, proxying, instrumentation, and transport policy can evolve without contaminating the business rule interpreting orders, enrolments, or academic data.

## 14.39 Inject the client instead of instantiating it inside the rule

Avoid writing new \core\http_client() in the middle of every business method. The code will work, but it hides the dependency again and makes PHPUnit control of the call harder. Receive the client in the constructor and let Moodle's container resolve it when the class is obtained through Dependency Injection.

```php
$client = \core\di::get(\local_integracao\local\erp_client::class);
$order = $client->fetch_order($orderid);
```

At legacy entry points, this one-time call to the container is acceptable; inside classes that already receive an erp_client, continue using constructor injection rather than spreading \core\di::get() throughout the object tree.

## 14.40 curl or core\http_client?

There is no need to automatically rewrite every integration based on the curl class. Stable, tested code supporting several branches may continue using the API it already has, especially when its minimum version predates newer APIs. For new code targeting Moodle 5.0, however, http_client is a very interesting option when testability, PSR-18, and Dependency Injection are part of the design.

Regardless of the client, the risks remain the same: SSRF, redirects, timeout, TLS, authentication, response size, retry, rate limits, and secret leakage. No library magically turns a user-supplied URL into a safe destination.

## 14.41 Timeout is not a detail

An integration without a timeout can hold a PHP process waiting for a service that never responds. On a web page this becomes a user staring at an endless loading state, occupied workers, and declining application capacity.

Define connection and total timeouts appropriate to the operation. An internal API in the same region may deserve only a few seconds, while a large upload may require another strategy.

The correct value depends on the service, but "no limit" is almost never a conscious architectural choice.

## 14.42 Retry

Retry does not mean repeating every failure three times.

If an API returns a temporary error, timeout, or status indicating unavailability, retrying may make sense. If it returns `400` because the payload is wrong, repeating the same request simply creates three errors instead of one.

Retrying a write operation also requires idempotency. If you POST a payment, lose the response, and repeat without an idempotency key, you may create a duplicate payment.

## 14.43 Backoff

When retry is necessary, do not hammer the service immediately.

```
1a tentativa -> falhou
aguarda 2 s
2a tentativa -> falhou
aguarda 5 s
3a tentativa
```

In background processing, the interval can be much larger and controlled by the task itself. The goal is to give the service time to recover and avoid turning an external failure into a flood of requests.

## 14.44 Rate limits

External APIs frequently limit requests per second, minute, or usage window. A plugin needs to respect those limits both to avoid being blocked and to avoid harming other consumers using the same credential.

If you need to synchronize fifty thousand users, do not make fifty thousand sequential calls inside one web request. Use batches, tasks, checkpoints, and pacing control, returning to the ideas from Chapter 11.

## 14.45 An HTTP response needs interpretation

Do not do this.

```
if (!empty($response)) {
    // Deu certo.
}
```

An API may return an error JSON with status `400`, proxy HTML with `502`, rate-limit JSON with `429`, or a legitimate empty response with `204`.

Inspect response metadata, HTTP status, and expected format. Validate JSON before reading keys and treat invalid responses as integration errors rather than partially correct data.

## 14.46 Incoming webhook

An incoming webhook is when an external system calls Moodle because something happened, such as payment confirmation, signature completion, or changed registration data.

This creates a public endpoint and requires different care from an external function authenticated through a user session. The endpoint must validate source authenticity, format, replay, duplication, and volume.

Do not create a `webhook.php` file that reads `php://input`, trusts a `secret` parameter, and immediately changes the database without anything else.

## 14.47 Webhook signature

A common strategy is for the provider to sign the request body with a shared secret. Your plugin calculates the expected signature from the raw payload and compares it with the received header using a timing-safe comparison.

Pseudocode.

```php
$rawbody = file_get_contents('php://input');
$received = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $rawbody, $secret);

if (!hash_equals($expected, $received)) {
    throw new moodle_exception('invalidsignature', 'local_integracao');
}
```

Each provider defines the exact algorithm, encoding, and signed content. Follow the provider specification rather than inventing a "similar" signature.

## 14.48 Timestamp and replay

A valid signature does not necessarily stop the same request from being sent again. Some providers include timestamps and event identifiers so you can check whether the message is recent and whether it has already been processed.

If a payment webhook is delivered five times, the result should still be one recognized payment, not five enrolments, five receipts, and five messages.

That leads directly to idempotency.

## 14.49 Idempotency

An idempotent operation can be repeated without causing an additional unintended effect.

For webhooks, normally store the external event or operation identifier.

```
provider = asaas
external_event_id = evt_12345
status = processed
```

Before processing, check whether the event has already been handled. If it has, return success again without repeating the effect.

Do not rely solely on a query without a unique index. Two simultaneous requests may both pass the check. Use a database constraint, transaction, or lock according to the flow.

## 14.50 A webhook does not need to do everything immediately

In many cases the endpoint only needs to validate authenticity, validate the minimum payload, record the event, and queue an Adhoc Task.

```
Webhook chega
    |
    v
Valida assinatura
    |
    v
Registra evento
    |
    v
Enfileira task
    |
    v
Responde rapidamente
```

The task performs heavy integration work afterward. This reduces provider timeouts and separates webhook availability from ERP, email, certificate generation, or any downstream process.

This is exactly where Chapter 11 connects.

## 14.51 Outgoing webhook

Moodle may also need to notify external systems when something happens. An observer can detect the event and queue a task responsible for sending the webhook.

I would avoid making a heavy HTTP call directly inside the observer.

```
Evento Moodle
    |
    v
Observer leve
    |
    v
Adhoc task
    |
    v
Webhook externo
```

If the destination is unavailable, you do not delay the user's original action and can still apply retry in background processing.

## 14.52 Authenticating outgoing calls

Depending on the API, authentication may use bearer tokens, basic auth, OAuth 2, client certificates, or HMAC signatures. The plugin should encapsulate this detail inside the HTTP client rather than spreading authentication headers throughout the system.

```php
final class erp_client {
    public function __construct(
        private readonly string $baseurl,
        private readonly string $token,
    ) {
    }

    public function get_order(int $id): array {
        // Monta e executa a chamada.
    }
}
```

This also makes replacing the authentication scheme easier later without changing tasks, observers, and pages.

## 14.53 Secrets and rotation

External tokens, HMAC secrets, and client secrets need to be replaceable without editing code. The institution should be able to rotate a credential and update configuration.

When possible, treat secrets as sensitive data in the administrative interface too. Do not display the full value unnecessarily and do not include it in exports, logs, or error messages.

A secure integration does not stop at the algorithm; it includes the credential lifecycle.

## 14.54 Routing API and REST v2

Since Moodle 4.5 there is also a Routing subsystem based on declared routes and a REST API group using the `/api/rest/v2` prefix. This mechanism works with attributes, route parameters, query parameters, headers, and structured responses.

This represents a more modern direction for Moodle HTTP APIs and is worth knowing for developers targeting recent branches. At the same time, the classic External API has not disappeared and remains essential for `core/ajax`, the Moodle App, and countless existing integrations.

I do not recommend choosing a new API simply because it is new. First define the plugin's minimum branch, consumer, and required contract. A plugin that must support Moodle 4.1 cannot depend on Routing introduced in 4.5. A new plugin restricted to 5.2 can evaluate that path much more freely.

## 14.55 Do not create two contracts for the same operation without a reason

If you expose `create_order` through the External API and create another REST route with different rules for almost the same operation, you have duplicated the public boundary.

Ideally both should call the same internal component API and apply the same central rules. Otherwise the route will eventually accept a field the Web Service rejects, one path will trigger an Event while the other does not, or one interface will validate a different capability.

Protocols may vary. Business rules should not vary by accident.

## 14.56 Synchronous or asynchronous integration

One simple question resolves a lot of architecture: does the user genuinely need the external response before continuing?

If the answer is no, that call can probably become a task.

Examples that normally do not need to block a page include synchronizing a CRM profile, sending a webhook, generating a large file, recalculating a batch, updating an external index, and importing hundreds of records.

Examples that may require synchronous execution include validating a coupon before completing a purchase or querying availability required to finish the current action.

Even then, use short timeouts and well-defined failure behavior.

## 14.57 Integration logging

An integration without logs is very hard to maintain, but logging secrets is a security problem.

Record enough information to reconstruct what happened.

```
integration = erp
operation = create_enrolment
externalid = 839291
httpstatus = 201
attempt = 1
duration = 0.742
```

Avoid storing tokens, passwords, authorization headers, card data, complete payloads containing personal data, or full responses without a clear need.

Also distinguish operational logging from Moodle Events. Not every HTTP attempt needs to become an academic or user-audit Event.

## 14.58 Correlation ID

When an operation crosses several systems, a correlation identifier helps enormously.

```
Moodle -> task -> ERP -> webhook -> Moodle
```

If every point logs something like.

```
correlationid = 7bc2d9a4...
```

it becomes much easier to determine whether an error happened before sending, inside the ERP, or during the webhook response.

This is especially useful when retries exist and the same object generates several requests over a period of minutes.

## 14.59 Errors I look for in code review

When reviewing a Moodle integration, some signs make me stop immediately: a hardcoded token, a REST endpoint called from JavaScript with an exposed credential, `PARAM_RAW` used everywhere, missing `validate_parameters()`, missing `validate_context()`, capability checked in the wrong context, `userid` supplied by the client and used directly, an external function with 300 lines of business logic, an HTTP call without timeout, retrying POST without idempotency, an observer waiting on an external API, a webhook without a signature, and a log storing the entire `Authorization`.

None of these problems requires sophisticated architecture to avoid. They require treating integration as a critical boundary rather than a `curl` that happened to return `200` on your laptop.

## 14.60 Exercise - secure REST and ESM client

The exercise in this chapter is to create an external function for a fictitious `local_coursecatalog` plugin that returns course details to authorized users and can be called by Moodle's own frontend using `core/ajax`.

The function must receive `courseid`, validate parameters, load the course, use `context_course`, call `validate_context()`, check a plugin capability, and return an explicit structure containing `id`, `fullname`, `shortname`, `visible`, and `warnings`.

The declaration in `db/services.php` must mark the function as `read` and `ajax => true`.

Then create a frontend module responsible only for calling the API.

```
import Ajax from 'core/ajax';

export const getCourse = async(courseid) => {
    const [course] = await Ajax.call([{
        methodname: 'local_coursecatalog_get_course',
        args: {courseid},
    }]);

    return course;
};
```

The visual interface should not know `methodname` directly; it calls `getCourse()` from the service module.

In the second part of the exercise, create a fictitious outgoing integration with an external catalog API. The call must use Moodle's `curl` class, have a timeout, encapsulate authentication in a client class, and execute through an Adhoc Task rather than inside a web request.

Finally, design a return webhook containing an HMAC signature, a unique external identifier, and idempotent processing. The endpoint must not perform heavy work; it should validate, record, and queue the task.

If you can implement all three parts without duplicating business logic, exposing a token, or depending on a gigantic `webhook.php`, you have understood the main point of the chapter.

## 14.61 What should remain from this chapter

The External API is a contract, not a shortcut for exposing a PHP function. `db/services.php` declares the boundary, but security remains inside the operation through validated parameters, correct context, and capability checks. A service controls grouping and access, a token is a credential and should not appear in code or logs, while AJAX inside Moodle should prefer `core/ajax` rather than inventing a REST call with a token.

In the opposite direction, calls to external APIs need an isolated client, timeout, status interpretation, conscious retry, and rate-limit handling. Webhooks need authentication, signatures where available, replay protection, and idempotency. When processing is heavy or an external system may be slow, use Tasks and keep the HTTP request short.

And most importantly, do not put the business rule inside the transport layer. A PHP page, external function, AJAX call, task, webhook, and a new REST route may all need to execute the same operation, and when that happens you will be glad to have an internal component API that knows what to do without depending on how the call arrived.

## References
* Moodle Developer Resources. Dependency Injection, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/di

Moodle PHP Documentation. core\http_client, Moodle 5.0. https://phpdoc.moodledev.io/5.0/dc/dfe/classcore_1_1http__client.html
* Moodle Developer Resources. External Services. https://moodledev.io/docs/5.2/apis/subsystems/external
* Moodle Developer Resources. Function Definitions. https://moodledev.io/docs/5.2/apis/subsystems/external/functions
* Moodle Developer Resources. External services security. https://moodledev.io/docs/5.2/apis/subsystems/external/security
* Moodle Developer Resources. Service creation. https://moodledev.io/docs/5.2/apis/subsystems/external/advanced/custom-services
* Moodle Developer Resources. AJAX. https://moodledev.io/docs/5.2/guides/javascript/ajax
* Moodle Developer Resources. Routing. https://moodledev.io/docs/5.2/apis/subsystems/routing
* Moodle Developer Resources. Responses. https://moodledev.io/docs/5.2/apis/subsystems/routing/responses

Moodle PHP Documentation. curl class. https://phpdoc.moodledev.io/main/da/d9f/classcurl.html

{% endraw %}