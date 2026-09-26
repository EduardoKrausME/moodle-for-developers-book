{% raw %}

# 11. Cron, Tasks, and asynchronous processing

![Cron, Tasks and Asynchronous Processing](image/cap11-cron-tasks-async.png)

When a page takes twenty seconds to respond, the problem is not always the SQL query or the server. Very often the code is simply doing, in the wrong place, work that should never have happened inside the user's request. Importing ten thousand records, converting files, synchronizing enrolments, calling an external API for hundreds of users, generating heavy reports, or sending thousands of messages may work inside a `view.php`, but working once in a development environment does not make that acceptable architecture.

This is one of those points where Moodle forces you to change how you think. The user performs an action, the plugin validates the request, records what needs to be done, and returns the page quickly. Heavy work is left to another process, outside the HTTP request, and that is exactly where cron, Scheduled Tasks, Adhoc Tasks, and the Lock API come in.

The word "asynchronous" also needs some care. When you queue a task, it does not magically start in another thread at that exact moment. You have placed work into a queue and some cron process must consume it. If cron runs once per hour, your queue may wait almost an hour. If it runs every minute and there are enough workers, behavior is very different. The API solves the processing architecture, but it does not fix poorly configured infrastructure.

## 11.1 How cron works

Moodle cron is the process that keeps an enormous number of things working without depending on somebody opening a page. Cleaning old data, sending messages, calculating statistics, synchronizations, notifications, queue processing, plugin tasks, and many core routines pass through it. On a small installation this may remain invisible for months precisely because many things still seem to work even with cron configured badly, but in production the symptoms appear as delayed email, growing queues, tasks that never run, and integrations that seem intermittent.

On the server, there is normally an operating-system scheduler calling Moodle cron through the CLI. On Linux, for example, it is common to configure something equivalent to one execution per minute. The exact command depends on where Moodle is installed, but the idea is this.

```
* * * * * /usr/bin/php /var/www/moodle/admin/cli/cron.php >/dev/null
```

This process does not execute one enormous function called "cron" and stop. Moodle queries the task system, identifies what is ready to run, executes Scheduled Tasks and Adhoc Tasks according to availability, and records execution results. On larger installations, multiple processes may participate in processing, which means code must be written assuming concurrency exists.

On modern versions, the correct architecture is the Task API. Legacy cron based on plugin `cron.php` files or callbacks such as `[modname]_cron()` was removed in Moodle 4.3. If you find an old tutorial telling you to create a `meuplugin_cron()` function in `lib.php`, you are not looking at an equivalent alternative; you are looking at an old model that should already have been migrated.

## 11.2 Why cron should run frequently

Moodle documentation recommends running cron at least once per minute, and that is not pedantry. An Adhoc Task you queue now can only be consumed when a cron process is working, so running cron every fifteen minutes means deliberately accepting up to fifteen minutes of latency before work even starts.

Think about an enrolment integration. A payment was approved at 14:02, the plugin correctly queued the enrolment, and responded to the webhook in a few milliseconds. If cron runs at 14:15, to the user it looks as though the integration took thirteen minutes, but the problem was not enrolment code; it was queue-execution infrastructure.

There is another detail. Running cron frequently does not necessarily mean executing everything serially in a single process. Larger installations may have dedicated workers, separate nodes, and different processing strategies, while the Task API provides the abstraction the plugin needs so it does not have to know on which server the work will execute. This independence is one of the reasons not to put business logic inside the cron script itself.

## 11.3 Scheduled Tasks

A Scheduled Task is the right choice when work needs to happen repeatedly and does not depend on a specific user action to exist. Synchronizing enrolments every ten minutes, cleaning expired records overnight, periodically querying an external service, or rebuilding derived data are typical examples.

The practical question is simple: if nobody clicks anything today, does this work still need to happen? If the answer is yes and there is a natural frequency, a Scheduled Task probably makes sense.

A common mistake is using a Scheduled Task as an improvised queue. The plugin stores pending records in a table and creates a scheduled task every minute to search for everything not yet processed. This can work and there are scenarios where it is intentional, especially when you want a centralized consumer, but very often an Adhoc Task per unit of work or per batch expresses intent better and avoids scanning a table unnecessarily.

## 11.4 `db/tasks.php`

Initial Scheduled Task configuration lives in `db/tasks.php`. This file declares which recurring tasks belong to the plugin and what their default schedule is.

```php
<?php

defined('MOODLE_INTERNAL') || die();

$tasks = [
    [
        'classname' => '\\local_meuplugin\\task\\sync_users',
        'blocking' => 0,
        'minute' => '*/10',
        'hour' => '*',
        'day' => '*',
        'month' => '*',
        'dayofweek' => '*',
    ],
];
```

The important point is not memorizing cron syntax but understanding that this file defines the initial default. The administrator can change frequency in Moodle's interface and, if they customized that task, a later change to `db/tasks.php` should not simply erase the administrative decision. This prevents a plugin upgrade from silently resetting a schedule infrastructure staff changed for local reasons.

The `blocking` field appears in a lot of old code and may still appear in documentation for older branches, but support for tasks that block all other tasks was removed in Moodle 4.4. Do not design new architecture around it. If two executions cannot happen at the same time, solve the problem with queue design, idempotency, and the Lock API, not by stopping the whole system so one task can pass.

## 11.5 The `classes/task/` directory

Task classes belong in the autoloaded `classes/task/` directory. This may look like mere organization, but it helps a lot as the plugin grows because it separates task-system entry points from classes that implement the actual business rule.

A Task class should not become a thousand-line monster merely because it runs in the background. Ideally, it loads the minimum required state, controls execution, records progress, and delegates work to plugin services.

```php
namespace local_meuplugin\task;

class sync_users extends \core\task\scheduled_task {
    public function get_name(): string {
        return get_string('tasksyncusers', 'local_meuplugin');
    }

    public function execute(): void {
        $service = new \local_meuplugin\service\user_sync();
        $service->execute();
    }
}
```

When the logic lives in `service\user_sync`, it can be tested directly, reused by CLI, and called by another Task when necessary. The Task becomes responsible for execution context rather than becoming the place where the whole plugin lives.

## 11.6 `scheduled_task`

Every Scheduled Task extends `\core\task\scheduled_task`. The base class connects your implementation to the task manager, exposes schedule information, and participates in cron's execution lifecycle.

You normally implement `get_name()` and `execute()`. There is no need to build a mini-framework around this. If the task needs twenty private methods to function, an important part of the logic may be in the wrong class.

Also do not assume `execute()` runs in the context of a normal web request. There is no browser waiting for a response, no open form, and the effective user may be the cron user. This changes decisions around capabilities, messages, relative URLs, session state, and any code that implicitly depends on the current user.

## 11.7 `get_name()`

`get_name()` returns the human-readable task name, normally using `get_string()`. It seems cosmetic until you open the administrative screen with dozens of failing tasks and discover that clear names matter.

```php
public function get_name(): string {
    return get_string('tasksyncexternalusers', 'local_meuplugin');
}
```

Avoid vague names such as "Process task" or "Run job". The site administrator should understand what the task does without opening your source code. "Synchronize users with ERP" is much more useful than "Run synchronization".

## 11.8 `execute()`

`execute()` is called when the manager decides to execute the task. This is where many implementations become dangerous because the developer thinks "now I can do anything, I am outside the page" and writes an unbounded operation that processes millions of records.

Leaving the HTTP request solves browser timeout, but it does not make memory and CPU infinite. A task that loads 500,000 records at once with `get_records()` can kill the worker just as easily as it would kill a web page, only without a user staring at the screen.

The correct design normally uses batches, cursors, recordsets, or some progress marker, allowing the task to process a controlled amount of data, release resources, and continue later when necessary.

## 11.9 Administrative frequency configuration

Scheduled Tasks appear in Moodle administration and administrators can change the schedule, disable execution, and inspect task information. This matters because a plugin does not know every infrastructure environment where it will be installed.

You may think synchronizing an ERP every minute is reasonable, but a customer's endpoint may allow only one hundred calls per hour. A nightly cleanup may be cheap in one environment and heavy in another. Allowing administrative adjustment is part of Task API architecture.

For this reason I would avoid putting a hardcoded condition such as `if (date('H') !== '03') return;` inside `execute()`. If periodicity is a scheduling concern, put it in the schedule. Code should decide what to do, not hide a second cron system inside the task itself.

## 11.10 Adhoc Tasks

An Adhoc Task represents work queued on demand. Something happened now and you want to execute an operation outside the current request.

A teacher uploads a large file for import, the plugin validates the upload, creates an import record, and queues an Adhoc Task. The browser receives confirmation quickly while the real processing happens later. This is much more natural than making the teacher wait while the entire spreadsheet is parsed.

The same class can be queued many times with different data. You can have one hundred instances of the same Adhoc Task processing one hundred different imports, which is completely different from one Scheduled Task executing according to a fixed schedule.

## 11.11 `adhoc_task`

The class extends `\core\task\adhoc_task` and normally needs only `execute()`, although in modern code it is very useful to create a factory method that constructs the task consistently.

```php
namespace local_meuplugin\task;

class import_file extends \core\task\adhoc_task {
    public static function instance(int $importid, int $userid): self {
        $task = new self();
        $task->set_custom_data((object) [
            'importid' => $importid,
        ]);
        $task->set_userid($userid);
        return $task;
    }

    public function execute(): void {
        $data = $this->get_custom_data();
        $importid = (int) $data->importid;
        $service = new \local_meuplugin\service\importer($importid);
        $service->execute();
    }
}
```

Then the code receiving the request simply queues it.

```php
$importid = $import->id;
$userid = $USER->id;
$task = \local_meuplugin\task\import_file::instance($importid, $userid);
\core\task\manager::queue_adhoc_task($task);
```

The factory method prevents details such as `customdata` format, execution user, and retry options from being scattered throughout the plugin. If tomorrow you add a new required field, there is one central place to adjust task creation.

## 11.12 `set_custom_data()`

`set_custom_data()` lets you store execution-specific data. It is tempting to put the entire object you already have in memory there, but it is normally better to pass identifiers and rebuild current state when the task runs.

```php
$task->set_custom_data((object) [
    'importid' => $import->id,
    'courseid' => $course->id,
]);
```

When the task executes, seconds, minutes, or hours may have passed. If you serialized a huge snapshot of old state, you may be processing obsolete data. If you passed `importid`, you can reread the current record and make a decision based on the actual state.

This also reduces queue size, makes debugging easier, and avoids carrying unnecessary information inside the task.

## 11.13 Serializing task data

Custom task data must be JSON-serializable. That rules out arbitrary objects containing internal resources, closures, connections, and other things that make no sense across the boundary between the request that queues work and the cron process that executes it.

Even when an object appears serializable, do not turn `customdata` into a second database table. If the operation needs fifty fields, those fields probably belong to a domain entity with its own record and the task should receive only the ID.

Passing IDs is also useful for retries. The first attempt may have partially changed state before failing. When the task runs again, it must determine what already happened rather than blindly replaying a snapshot from before the first attempt.

## 11.14 When to use an Adhoc Task

Use an Adhoc Task when there is a unit of work triggered by an action and it can happen later. File import, heavy sending, package generation, video processing, batch calls to an external service, expensive calculation, and post-event integration are natural examples.

It is also an excellent fit when an observer reacts to an Event but the real work is heavy. The observer should remain short, gather the identifiers it needs, and queue the task. This prevents an apparently simple Event from turning into a twenty-second operation for everyone who triggers it.

## 11.15 When NOT to use an Adhoc Task

Do not use a queue to hide poorly designed code. If the operation takes 50 milliseconds, depends on an immediate answer, and is part of the transaction the user expects to complete, moving it into an Adhoc Task may make consistency and user experience worse.

Also do not use an Adhoc Task when the rule requires a synchronous result. Imagine validating whether a coupon is still valid before completing a purchase. You cannot respond "purchase completed" and discover two minutes later that validation failed.

Another mistake is queuing thousands of tiny tasks without evaluating cost. If you need to update ten million rows, one task per row may be worse than well-sized batches. Queues have overhead, databases have overhead, and every process must bootstrap Moodle. Asynchronous does not mean free.

## 11.16 Processing queue

A well-designed queue has observable state. You need to know what is pending, processing, completed, or failed, especially when the work matters to the business.

The Task API maintains its own queue, but many features also benefit from a domain table recording the process. An import, for example, may have `status`, `totalitems`, `processeditems`, `lasterror`, `timecreated`, and `timecompleted`. The task remains the execution mechanism while the table describes the functional state the interface needs to display.

Do not confuse the two. Querying internal task tables directly to build your plugin UI creates unnecessary coupling. Your application should have its own state when that state matters to users.

## 11.17 Splitting heavy work

If an operation can take an hour, I would avoid writing one task that promises to stay alive for an hour. The longer the execution, the greater the chance that the network fails, the process restarts, a deployment interrupts it, memory grows, or a retry repeats too much work.

Splitting the work reduces the blast radius. An import of 100,000 records can be divided into batches of one thousand, and each execution knows which range it must process. If batch 47 fails, you do not need to repeat the first 46.

The ideal size depends on the cost of each item. One thousand simple updates may be cheap while ten video conversions may be expensive. Batch size should therefore come from measurement, not from a magic number copied from another plugin.

## 11.18 Batch processing

A simple pattern is to store a cursor or the last processed ID. The task fetches the next N records, processes them, updates the checkpoint, and, if work remains, queues the continuation.

```php
$records = $DB->get_records_select(
    'local_meuplugin_queue',
    'id > :lastid AND status = :status',
    ['lastid' => $lastid, 'status' => 'pending'],
    'id ASC',
    '*',
    0,
    500
);
```

After the batch completes, you store the new position and schedule the next execution. This design also helps with external rate limits because the batch can control how many calls are made before giving the worker back to the queue.

Be careful not to confuse offset pagination with a stable checkpoint. If records change status while you process them, `LIMIT 500 OFFSET 500` may skip or repeat items. In mutable queues, advancing by a stable key is normally more predictable.

## 11.19 Resuming processing

Robust processing assumes interruptions will happen. A server restarts, an external API returns 500, the database becomes unavailable, a deployment kills the worker, a file disappears, or one unexpected record throws an exception.

The question is not "how do I prevent every failure?", because that does not exist. The question is "when it fails, where do I resume?".

Checkpoints, per-item status, and idempotency form the answer. If the task can reread state and determine items 1 through 4,500 are complete, continuing at 4,501 is straightforward. If all progress exists only in memory variables, any interruption turns progress into smoke.

## 11.20 Idempotency

Idempotency means repeating an operation does not produce unwanted duplicate effects. In a queue this is not a luxury because retry exists specifically to repeat execution after failure.

Imagine a task creates a charge in a payment gateway and then records the returned ID in Moodle. The gateway creates the charge, but the connection drops before your database receives the ID. The task fails and tries again. If the integration does not use an idempotency key and cannot query the previous operation, you may create two charges.

The same idea applies locally to inserts. Instead of assuming "if I am running, it does not exist yet", use a unique key consistent with the business rule, inspect current state, and design the operation so it can safely be repeated.

A task that works only if it executes exactly once under perfect conditions is not robust. It simply has not encountered the right failure yet.

## 11.21 Retry

The task system handles failures and can automatically reschedule execution. Current documentation describes progressively increasing intervals between attempts, starting short and potentially becoming much longer when failure persists.

Modern Adhoc Tasks also have control over available attempts through `set_attempts_available()`, introduced in Moodle 4.4, as well as the ability to alter behavior with `retry_until_success()`.

```php
$task = \local_meuplugin\task\send_batch::instance($batchid);
$task->set_attempts_available(3);
\core\task\manager::queue_adhoc_task($task);
```

Retry makes sense for transient failures such as timeout, DNS problems, an unavailable external service, or an occupied lock. There is no point trying twelve times with an invalid national ID or a file format that will never be accepted. In that case the failure is functional and should be recorded as definitive rather than making cron suffer for hours.

## 11.22 Failures

A Task can simply throw an exception and let the manager record the failure and apply the retry strategy. That is better than swallowing every exception and ending with a successful status when half the work failed.

There is a nuance when you process many independent items. If item 20 fails, it may not make sense to prevent items 21 through 500 from continuing. You can catch the exception per item, record the error, and continue, but from that point onward responsibility for diagnosis belongs to your code.

```php
try {
    $this->process_item($item);
} catch (\Throwable $e) {
    mtrace_exception($e);
    $haserrors = true;
}
```

At the end, depending on the rule, you may throw an exception so the overall execution is marked as failed or complete while keeping errors recorded per item. The important thing is not to produce the worst scenario, where cron says "success" and the user later discovers 30% of the data was never processed.

## 11.23 Logs

Tasks need to leave useful traces. This does not mean dumping sensitive data or printing every processed row, but you should be able to answer basic questions when something breaks. Which task ran? Which batch? Which record? How many items were processed? How long did it take? Which exception occurred?

Moodle provides task-log views and administrative tools to follow executions, but your plugin may also need functional state. An ERP synchronization that failed for 17 users may need to store those 17 errors in its own table because an administrator needs to fix and reprocess them later.

Avoid logging tokens, passwords, complete payloads containing personal data, or authentication headers. Useful debugging does not require turning logs into a credential leak.

## 11.24 `mtrace()`

`mtrace()` is the traditional way to produce textual output appropriate for cron and CLI. Use messages that help somebody understand progress without opening the code.

```
mtrace('Starting ERP user synchronization');
mtrace('Batch 12: 500 records loaded');
mtrace('Batch 12: 497 processed, 3 failed');
mtrace('ERP user synchronization finished');
```

"Starting task" and "Finished task" in every class are not very helpful when there are dozens of tasks. Prefer messages that carry operational context.

For caught exceptions, `mtrace_exception()` helps record details consistently. If you caught the exception, the manager cannot guess there was a problem, so do not hide precisely the information required for investigation.

## 11.25 Duplicate tasks

Duplicate work in a queue is one of the most silent sources of bugs. A user clicks twice, a webhook is redelivered, two observers receive the same trigger, or two processes check the same condition at the same time and both queue equivalent work.

Depending on the case, duplication may be acceptable because the operation is idempotent, but in other cases you want to prevent two equivalent tasks from sitting in the queue. The Task API provides mechanisms to queue or reschedule Adhoc Tasks while considering class identity, component, custom data, and user, which can be useful when one execution represents the current state of a resource.

Even so, do not treat duplicate-queue prevention as a substitute for idempotency. Many things can change between checking and executing, and an old task may already be running when a new one is created. Processing itself must remain safe.

## 11.26 Concurrency

If your code only works when there is a single cron process on the planet, it is fragile. Moodle can run tasks in parallel, especially on larger installations, and two executions may reach the same resource almost simultaneously.

The classic example is a table-backed queue. Worker A loads the first pending record. Before A updates its status, Worker B runs the same query and receives the same record. Both process it and now you have a duplicate send, duplicate charge, or duplicate import.

A transaction solves some cases, a unique index solves others, and the Lock API solves exclusive access to a resource. The choice depends on the operation. What does not work is hoping the processes never collide.

## 11.27 Lock API

The Lock API exists to prevent multiple processes from simultaneously accessing a resource that needs exclusivity, including in clusters. This matters because `flock()` on a local file does not solve the problem when you have three different nodes running cron.

The flow is to obtain the factory configured for the site, request a lock for a resource, and release it when finished.

```php
$lockfactory = \core\lock\lock_config::get_lock_factory('local_meuplugin_sync');
$lock = $lockfactory->get_lock('course:' . $courseid, 10);

if (!$lock) {
    throw new \moodle_exception('locktimeout', 'local_meuplugin');
}

try {
    $service->sync_course($courseid);
} finally {
    $lock->release();
}
```

`finally` is important. A lock forgotten during an exception may leave the resource unavailable until the backend treats the lock as expired or the process ends in a way that lets the mechanism release it correctly.

Documentation itself warns that locking was not designed to be an extremely cheap operation called thousands of times per request. The priority is correctness across processes and even across nodes, so use it when a truly shared resource needs exclusivity.

## 11.28 Named locks

When we talk about named locks in Moodle, the practical idea is to build a stable identity for what is being protected. The Lock API works with a lock type, which should be namespaced by component, and a resource key.

```php
$locktype = 'local_meuplugin_import';
$resource = 'import:' . $importid;
```

Do not use a generic key such as `lock` for everything. That would serialize work that could run in parallel. If two independent imports can execute together, each should have a different resource. If the rule requires one global ERP synchronization, then a single key such as `erp-sync` may make sense.

Lock granularity is architecture. Too broad and you kill parallelism; too narrow and you fail to protect the actual resource.

## 11.29 Preventing two workers from processing the same record

A common design is to acquire a lock by ID before processing a record. The worker that gets the lock continues and the other skips or retries later.

```php
$resource = 'queueitem:' . $item->id;
$lock = $lockfactory->get_lock($resource, 0);

if (!$lock) {
    return;
}

try {
    $params = ['id' => $item->id];
    $fresh = $DB->get_record(
        'local_meuplugin_queue',
        $params,
        '*',
        MUST_EXIST
    );

    if ($fresh->status !== 'pending') {
        return;
    }

    $this->process($fresh);
} finally {
    $lock->release();
}
```

Notice that I reread the record after acquiring the lock. Before the lock, state was only an observation that might already be stale. Once exclusivity is acquired, I check again that the item is still pending.

In other cases, an atomic database update with a status condition may be better than an explicit lock. There is no single recipe, but there is one consistent rule: the decision "who owns this item now?" must be atomic somehow.

## 11.30 Execution as a specific user

Tasks normally run in the context of the cron user, and that may be wrong when the operation represents a user action and needs to respect that user's permissions.

An Adhoc Task can define `userid` with `set_userid()`. That does not mean you should blindly trust a capability calculation made hours earlier. The task must validate current context and current state when it executes, especially if permissions may have changed.

Scheduled Tasks are different because there is no natural user who triggered the operation. When a check needs to happen on behalf of somebody, explicitly assume that user or provide the relevant user to permission checks rather than depending on `$USER` magically being the right person.

## 11.31 `set_next_run_time()`

An Adhoc Task can be scheduled not to execute before a timestamp using `set_next_run_time()`. This is useful for digests, delayed processing, retries after a rate-limit window, and actions that should only start after a certain moment.

```php
$task->set_next_run_time(time() + HOURSECS);
\core\task\manager::queue_adhoc_task($task);
```

This is not a precision clock. The task will not execute before that time, but the actual moment depends on cron, queue depth, and worker availability. If you need something to happen exactly at 10:00:00 with hard real-time guarantees, the Task API should not be treated as a hard real-time scheduler.

## 11.32 Clearing caches in long-running tasks

Very long tasks may change large amounts of data while Moodle APIs keep static caches in the same process. After many changes, running additional tasks in that same process may carry assumptions that no longer reflect current state.

The Task API provides `\core\task\manager::clear_static_caches()` to signal that static caches should be cleared before subsequent work. This is especially relevant after routines that modify a lot of data.

Do not start calling it after every item. The purpose is not to replace MUC or purge caches superstitiously, but to avoid accumulated in-process state after substantial changes in long-running execution.

## 11.33 What happened to blocking tasks

For years Scheduled Tasks could declare `blocking`, causing one task to prevent others from running while it was active. That sounds attractive because it turns concurrency into "nobody runs until I am done", but the global cost is enormous.

Support was removed in Moodle 4.4. Documentation itself points to serious performance and correctness problems with the model. If a plugin still depends on task blocking on an older branch, treat that as technical debt and migrate to granular locks, separate queues, and idempotent operations.

Blocking the entire cron because one resource cannot be processed by two workers is like closing the entire highway because two people want the same parking space.

## 11.34 The end of legacy cron

Another important historical piece is legacy cron. Older plugins could implement callbacks and dedicated files that cron scanned periodically, and for many years this coexisted with the Task API.

The Task API arrived in Moodle 2.7 and became the recommended architecture for background work. In Moodle 4.3, support for legacy cron was removed. This matters because you can still find old examples in forums, snippets, and abandoned plugins.

If the goal is current maintainable code, Scheduled Tasks and Adhoc Tasks are the path forward. Do not recreate a removed mechanism merely because a 2012 tutorial ranks well in search results.

## 11.35 CLI execution

Sometimes you want to run a service manually for maintenance, diagnostics, or a controlled operation. That does not mean hacking around protected task methods or copying logic elsewhere. If the business rule lives in a service class, Tasks and CLI can share the same code.

```php
require(__DIR__ . '/../../../config.php');

if (PHP_SAPI !== 'cli') {
    die('CLI only');
}

$service = new \local_meuplugin\service\user_sync();
$service->execute();
```

Moodle also provides CLI tools to execute cron and tasks in administrative contexts depending on the purpose and version. During development, being able to trigger a task manually helps reproduce failures without waiting for the next normal cycle.

Even in CLI, keep logs clear, exit codes meaningful, and do not assume unlimited resources. A manual script can bring down the database just as effectively if it runs the same bad query fifty million times.

## 11.36 Do not turn a task into a request without a browser

A common conceptual mistake is writing a Task as though it were a web page without HTML. It reads globals unnecessarily, builds redirects, calls `require_login()`, depends on session state, and reads `optional_param()` as though HTTP parameters still existed.

A Task should receive state through the queue or read it from the database. If it needs `courseid`, pass that ID in `customdata` or use the entity representing the process. If it needs to execute on behalf of a user, set the user correctly. Do not try to reconstruct a request inside cron.

This separation improves testing and also makes clear that anything placed in the queue may execute in another process, another server, and much later than the page that created it.

## 11.37 Scheduled Task or Adhoc Task

A practical rule works well. A Scheduled Task represents a recurring obligation of the system. An Adhoc Task represents a specific piece of work that entered the queue.

"Every day at 02:00 review expired enrolments" is a Scheduled Task. "Process this import the teacher just uploaded" is an Adhoc Task. "Every five minutes check whether an external FTP has files" may be a Scheduled Task. "Convert file 9182" is an Adhoc Task.

In some projects the two work together. A Scheduled Task queries an external source and discovers 3,000 new items, then creates batches and queues Adhoc Tasks for parallel processing. This is much better than keeping the scheduled task occupied for hours when batches can be independent.

## 11.38 Rate limits and external APIs

External integrations are natural candidates for Tasks, but the queue does not eliminate vendor limits. If the API allows one hundred requests per minute and you start twenty workers, you can turn asynchronous processing into a distributed attack against your own provider.

Batch control, backoff, `set_next_run_time()`, and retry state need to consider `429 Too Many Requests`, quota windows, and temporary unavailability. When the service provides `Retry-After`, respecting that information is better than hammering the endpoint on every execution.

Another important rule is explicit timeout. Background Task does not mean HTTP call without a time limit. A stuck external connection can occupy a worker for a long time and delay the whole queue.

## 11.39 Memory and long-running tasks

PHP releases memory when the process ends, but while a Task is alive any growth continues to exist. A `foreach` that accumulates objects in a history array may consume gigabytes even if each individual query is small.

Recordsets, batch processing, and releasing references help. For tasks processing large volumes, monitor memory and duration in an environment similar to production. "It ran on my laptop" says nothing about a table with fifty million rows.

Also consider internal caches in libraries, HTTP clients, and domain objects. The bottleneck is not always `$DB`.

## 11.40 A queue does not replace a transaction

A Task determines when to execute; it does not guarantee atomicity of what happens inside. If you update three tables that must change together, you still need an appropriate transaction.

Likewise, a transaction does not replace a queue. Opening a transaction and performing a two-minute HTTP call inside it is an excellent way to hold database locks for too long. In integrations, the correct design often separates local persistence, commit, and external operation with an intermediate state and idempotency.

Chapter 5 covered database transactions. The important reminder here is that background processing does not suspend consistency rules; it only changes the process executing the code.

## 11.41 Operational monitoring

Once Tasks support enrolment, payments, certificates, or integrations, the queue becomes part of critical operations. Developing it and forgetting about it is not enough.

Moodle administration provides Task logs, Scheduled Task configuration, and visibility into running tasks. In larger environments it is worth monitoring queue delay, failing-task counts, average duration, growth of related tables, and worker availability.

A cron process that "is running" can still be unhealthy. If ten thousand jobs arrive every minute and infrastructure processes only five thousand, the queue grows continuously. The problem is capacity, not binary availability.

## 11.42 Exercise - import thousands of records without blocking an HTTP request

Create a fictitious plugin that receives a CSV with at least 50,000 rows. The form should only validate the upload, save the file using the Files API, create an import record, and queue an Adhoc Task. The HTTP response must finish quickly and the page should show that the import is pending.

The Adhoc Task must not load the whole file into memory or process 50,000 rows in one execution without a checkpoint. Work in batches, update `processeditems`, record the number of errors, and queue continuation while pending records remain. If a row has already been imported, repeating the batch must not create duplicates.

Add a lock per import so two workers cannot process the same file simultaneously, but do not use a global lock that prevents different imports from running in parallel. Simulate a failure in batch 20 and confirm processing resumes without repeating the previous 19 batches.

Then run the same scenario with cron stopped for a few minutes. Notice the upload still responds quickly, but nothing is processed. Start cron again and watch the queue move. This simple test makes it very clear that the Task API organizes work while cron infrastructure determines when that work will actually run.

## 11.43 The mental model that should remain

Cron is the infrastructure that gives Moodle opportunities to execute work outside normal requests. A Scheduled Task represents recurring work. An Adhoc Task represents work queued on demand. The Lock API solves exclusivity when multiple processes may compete for the same resource. Idempotency ensures retries and duplicates do not destroy consistency.

If I could summarize this chapter in one practical rule, it would be this: never put a heavy operation inside a page merely because it works in your test environment, but also do not throw everything into an Adhoc Task just so you can say it became asynchronous. First define the unit of work, how it resumes, what happens if it repeats, who may execute it, and how two workers avoid processing the same resource.

When those answers exist, the Task API stops being a trick for escaping timeout and becomes a real part of plugin architecture.

## Technical references consulted

* Moodle Developer Resources. Task API, versions 4.5, 5.0, and current documentation. Concepts of Scheduled Tasks, Adhoc Tasks, cron every minute, retries, execution as a user, logs, and clearing static caches.
* Moodle Developer Resources. Scheduled Tasks and `db/tasks.php`. Class structure, initial scheduling configuration, and behavior when administrators customize frequency.
* Moodle Developer Resources. Adhoc Tasks. `set_custom_data()`, factory methods, `set_userid()`, `set_next_run_time()`, attempt control, and queueing mechanisms.
* Moodle Developer Resources. Lock API, version 5.2. Lock factory, resource keys, exclusivity between processes, and support for multi-node environments.
* Moodle Developer Resources. Moodle 2.7 release notes. Introduction of the Task API and recommendation to migrate legacy cron.
* Moodle Developer Resources. Task API. Removal of legacy cron in Moodle 4.3 and blocking tasks in Moodle 4.4.

{% endraw %}