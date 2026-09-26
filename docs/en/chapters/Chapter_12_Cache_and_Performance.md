{% raw %}

# 12. Cache and performance

Performance in Moodle is a topic that often starts in the wrong place. A page is slow, somebody opens cache administration, sees Redis available, and concludes the problem will be solved as soon as everything is moved into memory. Sometimes it really does improve, especially when the installation is still using a slow filesystem for application caches, but that improvement can hide a bad query, a callback running on every page, an observer doing heavy work, `get_records()` bringing half a million rows into memory, or a sequence of N+1 calls that will continue to exist, only a little more quietly.

Cache does not fix bad architecture; it trades repeated work for consistency complexity. Instead of calculating or fetching information every time, you store the result somewhere and reuse it, but from that moment a question appears that did not exist before: when does this result stop being valid? If that answer is not clear, cache can make the page faster while making the system wrong, which is a particularly bad trade in an educational, financial, or academic environment.

Moodle has its own layer for this problem, the Moodle Universal Cache, normally called MUC. It exists so the plugin declares what kind of data it wants to store and which guarantees it needs, while the installation decides which store satisfies that definition. This lets the same code run on a development machine with file cache, on a server with APCu, or in a cluster using Redis, without the plugin knowing an IP address, port, password, or storage technology.

In this chapter the goal is not to turn cache into a list of `get()` and `set()` methods, but to understand request cost, invalidation, key design, distribution across nodes, database queries, profiling, and measurement. If you finish the chapter thinking performance is synonymous with Redis, something important was missed.

## 12.1 What is expensive in a Moodle request

Before optimizing a page, you need to discover where the time is going. That sounds obvious, but a lot of poor optimization begins in the opposite order: somebody chooses a technology first and then looks for a problem that justifies the choice.

A Moodle request already begins with a significant bootstrap. `config.php` loads `lib/setup.php`, configuration is read, subsystems are prepared, the session may be initialized, the user is reconstructed, contexts and permissions may be queried, language strings come into play, and several internal caches are used. This does not mean Moodle is inherently slow; it simply means adding work to a page that already has a complete lifecycle deserves some respect for accumulated cost.

The database is usually one of the first places to look, but not only because of query count. A query using an index and returning five rows may cost almost nothing, while one query with a poorly planned `LIKE '%texto%'` or `JOIN`, sorting without an index, and millions of rows can dominate the whole request. Raw query count is a signal, not a diagnosis.

Filesystem access matters too. Reading many small files from shared storage, scanning directories, loading files that should not be loaded, or depending on a slow NFS can turn a simple operation into a bottleneck. In a cluster, network latency among frontend, database, storage, and cache enters the equation even when every individual component looks fast.

External calls are even easier to notice. If a page calls three APIs and each takes 800 milliseconds, you have already lost more than two seconds before rendering anything. Caching the result may help, but the right decision may instead be moving the work into the Task API, especially when the user does not need that data updated in real time.

Another common cost is memory volume. Fetching fifty thousand database objects, building huge structures in PHP, serializing all of it to JSON, and then sending a small fraction to the template wastes work at several layers. The page may be slow because it is doing work that will never be displayed.

So the first performance question is not "which cache do I use?" but "what is this request doing, and what does each part cost?".

## 12.2 Moodle Universal Cache

The Moodle Universal Cache was introduced to create a common cache layer in Moodle and avoid every component inventing its own directory, table, global array, or direct Memcached and Redis integration. The central idea is simple: plugin code works with a cache definition, not with the physical technology that stores the data.

Imagine a plugin needs to display an external configuration calculated from several tables. You can declare a cache called `courseconfig` and then obtain an instance with `cache::make()`.

```php
$cache = cache::make('local_meuplugin', 'courseconfig');

$data = $cache->get($courseid);
if ($data === false) {
    $data = $service->build_course_config($courseid);
    $cache->set($courseid, $data);
}
```

This code does not know whether the value ended up in a file, a local memory region, or a shared Redis server. That ignorance is intentional and is one of the best characteristics of the API.

It is also important to realize MUC is not one single cache. The same installation can have several configured stores, different definitions mapped to different backends, and multiple cache layers. Small, frequently accessed data may live in local memory while larger structures use a different store. The plugin describes requirements and administration decides the infrastructure.

This separation is especially important for plugins distributed to third parties. If you hardcode Redis because it exists on your server, you have moved an installation-level decision into plugin code.

## 12.3 db/caches.php

Caches declared by the plugin live in `db/caches.php`. This is where you tell Moodle the definition name, its mode, and, when necessary, additional characteristics.

A simple example looks like this.

```php
$definitions = [
    'courseconfig' => [
        'mode' => cache_store::MODE_APPLICATION,
        'simplekeys' => true,
    ],
];
```

The name `courseconfig` is the cache area inside the component. The component is inferred from the file location, so the effective pair becomes something like `local_meuplugin/courseconfig`.

After adding or changing definitions, update the plugin version so the upgrade process rereads this configuration. Creating `db/caches.php`, opening a page, and expecting the definition to appear without an upgrade is a good way to lose a few minutes searching for a bug that does not exist.

Documentation also expects a language string for the definition using the `cachedef_` prefix.

```
$string['cachedef_courseconfig'] = 'Configuração calculada dos cursos';
```

This helps site administration understand what the definition represents when configuring mappings and stores.

## 12.4 Cache definitions

A cache definition should not be treated as a collection of options to tick randomly. Each property communicates an expectation from code to infrastructure.

`simplekeys`, for example, states that your keys use only a simple character set and do not need to be transformed before reaching the store. `simpledata` states that values are scalars or arrays of scalars and may avoid part of the serialization cost. Setting both to `true` because "it sounds faster" when you store objects or complex keys is exactly the kind of optimization that buys a bug in exchange for a micro-gain.

There are also requirements around identifiers, persistence guarantees, locking, size, TTL, datasource, static acceleration, and local-store support. Some are quite advanced and should appear only when there is a concrete need.

A good start is to declare the minimum required, measure, and evolve the definition when application behavior genuinely demands it.

## 12.5 Request cache

Request cache lives only during the current request. When PHP finishes that execution, the cache may disappear, and that is exactly the expected behavior.

It is useful when expensive information may be requested several times within the same page but does not make sense, or would not be safe, to reuse in later requests. Think of a function called by five different page components, all asking for the same derived structure. Without cache you calculate it five times; with Request cache you calculate it once and reuse it during that request.

The mode in the definition is `cache_store::MODE_REQUEST`.

```php
$definitions = [
    'permissionsummary' => [
        'mode' => cache_store::MODE_REQUEST,
    ],
];
```

Conceptually it resembles a static cache in PHP, but it goes through Moodle's cache infrastructure and may provide additional features. We will compare the two later.

Request cache is also a useful reminder that not every cache needs Redis. Sending information across the network when it will only be reused inside one request may be more expensive than keeping it locally.

## 12.6 Session cache

Session cache has user-session scope. The data belongs to that session and may survive across requests while the session remains active.

This is appropriate for temporary information related to that user's experience that should not be shared globally. The mode is `cache_store::MODE_SESSION`.

```php
$definitions = [
    'wizardstate' => [
        'mode' => cache_store::MODE_SESSION,
    ],
];
```

Do not confuse Session cache with Moodle's session backend. You may use Redis for sessions and Redis for MUC, but they are different responsibilities. The fact that both may end up using the same product does not make the APIs equivalent.

Also do not use Session cache to hide important functional state. If process continuity must survive logout, session expiry, switching browser, or resuming the next day, you probably need persistent state in the database rather than cache.

## 12.7 Application cache

Application cache is shared at application scope, so different users and requests may reuse the same values. It is the most intuitive mode when we think about configuration, metadata, calculated structures, or relatively static information.

The definition uses `cache_store::MODE_APPLICATION`.

```php
$definitions = [
    'catalog' => [
        'mode' => cache_store::MODE_APPLICATION,
        'simplekeys' => true,
    ],
];
```

Here invalidation strategy becomes even more important. If a teacher changes a setting and you leave an old copy in Application cache, other users may continue seeing the previous state indefinitely.

Application cache is powerful precisely because it crosses request boundaries, but that also means an invalidation bug crosses request boundaries.

## 12.8 Modes

Request, Session, and Application are not merely storage options; they are scope contracts.

Request means "valid for this execution." Session means "valid for this user session." Application means "may be shared across the application." Choosing the wrong mode can cause anything from wasted performance to leaking state between users.

If you place user-dependent data in Application cache and forget to include the user in the key, you have built a very efficient way to deliver one person's information to another. If you put global data in Session cache, you create repeated copies for thousands of users with almost no reuse.

The right question is always "who can reuse this value, and until when is it correct?". The answer usually points to the right mode.

## 12.9 Keys

A cache key looks like a detail until you need to invalidate one specific entry or discover why two different values are colliding.

A key needs to represent every dimension that makes the value vary. If the result depends on `courseid` and `lang`, a key using only `courseid` is incomplete. If it depends on configuration version, group, and user role, those dimensions need to appear somehow in the design.

That does not mean concatenating arbitrary values without thinking.

```php
$key = $courseid . ':' . $USER->id . ':' . time();
```

Putting `time()` in the key, for example, virtually eliminates any chance of a hit and turns the cache into a garbage depot. A key is not there to guarantee "always new"; it is there to identify a reusable version of a value.

Also consider cardinality. A global cache with one huge entry per user, course, group, language, and day can create millions of keys. The backend may support it, but memory cost, purge cost, and warm-up behavior change completely.

## 12.10 Cache stores

A store is the physical implementation holding values. Moodle has specific plugin types for this, such as `cachestore`, and an installation can have several stores configured and mapped to different definitions.

Plugin code should not normally choose the store. Your job is to describe the cache. The administrator knows topology, available memory, cluster layout, latency, and operational requirements and is therefore better placed to decide where each definition should live.

This separation also lets a small installation stay simple. It makes no sense to require Redis for a plugin storing twenty configuration keys per day. Likewise, an installation with many frontends may need a shared store because local file cache would not be coherent across nodes.

The Cache API is the boundary between those two responsibilities.

## 12.11 Redis

Redis is a common choice for MUC because it provides in-memory access, sharing across multiple frontends, and low latency when placed correctly in the architecture. Moodle has its own Redis store, so the normal path is to configure infrastructure in administration and map definitions to it.

Nothing changes in the plugin.

```php
$cache = cache::make('local_meuplugin', 'catalog');
```

If tomorrow the administrator replaces Redis with another compatible store, your code continues to work.

Do not confuse "Redis is in memory" with "Redis is always faster." If the frontend is on the same machine as a local SSD and Redis sits across a slow network, some workloads may behave differently from expectations. In large installations, network latency, connection count, object size, serialization, and eviction policy need measurement.

Another detail is that cache should not compete with sessions for space without operational planning. Losing a session breaks the user experience; losing cache should merely cause a miss and reconstruction. Even when both use Redis, it is worth considering separation by instance, database, prefix, or infrastructure policy depending on the environment.

## 12.12 Valkey

Valkey emerged as an open-source continuation compatible with Redis OSS 7.2 and maintains the RESP protocol used by Redis clients. In practice, many existing clients can communicate with Valkey without code changes, which is why it has started appearing in environments where Redis was previously used.

For a Moodle plugin, the rule remains exactly the same: do not write Valkey-specific cache integration. Use MUC.

Today Moodle does not have a cache mode called `VALKEY_APPLICATION` or a parallel API. The normal path goes through the Redis store and a compatible PHP client, so actual compatibility depends on Moodle version, `phpredis` extension version, commands being used, and the Valkey server version. Because Valkey maintains protocol compatibility with Redis OSS 7.2, many scenarios work transparently, but that still needs validation in the infrastructure where it will run.

This is another reason a plugin should not know the backend. If cache is properly encapsulated, moving between Redis and a compatible alternative is an operational concern rather than business-logic refactoring.

## 12.13 Cache invalidation

The hard part of cache is not storing a value; it is knowing when it became stale.

Imagine a plugin calculates the total number of active enrolments in a course and stores the result. The first request runs the query, receives 812, writes the cache, and all subsequent requests become fast. So far, so good. Then user 813 is enrolled.

If nothing invalidates the entry, your cache continues answering 812 with impressive efficiency.

That is why invalidation strategy has to be designed together with the cache. If the data changes through one function controlled by your plugin, that function may delete or update the entry. If it can change through multiple routes, perhaps an Event or Hook offers a better invalidation point. If it depends on versioned configuration, a revision in the key may avoid hunting down old copies.

A correct cache is not the one with the highest hit ratio; it is the one that only returns stale data when that staleness was deliberately accepted.

## 12.14 Purge

Purge removes cached content and forces reconstruction. Moodle allows purging at different levels, from a specific entry to broad cache clearing.

The problem is turning "purge all caches" into the default solution. If the plugin only needs to invalidate course 42, clearing all site caches is like rebooting the server to update one variable.

Prefer specific operations.

```php
$cache->delete($courseid);
```

If a change invalidates the whole definition, `purge()` may make sense.

```php
$cache->purge();
```

Moodle also has cache-invalidation events through `cache_helper::purge_by_event()`. These predate the Events API and allow multiple definitions to declare dependency on the same signal. Do not confuse them with the domain events discussed in Chapter 10.

Broad purge has a reconstruction cost. On a large site, clearing everything can cause a storm of misses immediately afterward, exactly when all users begin recalculating the same data.

## 12.15 Why caching without an invalidation strategy causes bugs

Cache without invalidation creates a particularly unpleasant kind of bug because it does not happen every time. The database record is correct, the interface shows an old value, clearing caches temporarily fixes it, and somebody concludes that "Moodle was buggy."

In reality, the application now has two sources of truth: the original data and a copy with no defined lifecycle.

These bugs are also hard to reproduce. In development you constantly purge caches, change code, and restart processes, so everything looks correct. In production an entry may survive for hours or days and only some users hit the exact combination of stale state.

When somebody says "if it breaks, tell them to clear cache", they are usually describing missing architecture, not a cache strategy.

## 12.16 TTL should not be your first solution

TTL defines how long an entry may remain valid before expiring. It is tempting because it avoids thinking about invalidation: "I will keep it for five minutes and that's it."

MUC documentation itself discourages using TTL as the first choice and recommends change-driven invalidation whenever possible. Not all stores handle TTL in exactly the same way and, when the backend lacks appropriate native support, the cost can be greater.

Besides, TTL answers "when will I throw it away?", not "when did it stop being correct?". If an enrolment is cancelled one second after cache creation and TTL is one hour, you deliberately accepted up to 59 minutes and 59 seconds of stale data.

Sometimes that is perfectly acceptable. External exchange rates, non-critical rankings, dashboard data, and analytics may tolerate delay. The difference is making the decision consciously.

## 12.17 Versioned caches

Modern MUC versions provide versioned operations such as `set_versioned()` and `get_versioned()`, which are especially useful with distributed and multi-layer caches.

The idea is to associate a value with a known data version. If the stored version is old, the cache is not accepted as current. This helps avoid some invalidation problems among localized frontends because changing the revision makes the next read seek the correct version instead of trusting an old key.

This mechanism is particularly interesting for large and expensive structures because it lets you work with one relevant version rather than accumulating old keys merely to represent revisions.

Do not use a random version. It needs to advance when the dependency changes and be shared among processes that need to agree on current state.

## 12.18 Static cache

Static cache is the old and useful pattern of storing a result in a static variable during PHP execution.

```php
function get_expensive_data(int $courseid): array {
    static $cache = [];

    if (!array_key_exists($courseid, $cache)) {
        $cache[$courseid] = build_expensive_data($courseid);
    }

    return $cache[$courseid];
}
```

This can be excellent when a function is called many times in the same request and the value never needs to cross request boundaries. The cost is nearly zero and there is no round trip to an external store.

The problem appears when the function starts depending on more dimensions and the key remains only `courseid`, or when a long process changes the underlying data midway through execution while the static variable continues returning the old snapshot.

Static cache is simple, but simplicity does not remove the need to think about validity.

## 12.19 MUC versus static variables

There is no universal winner between MUC and a static variable. They solve different scopes.

If a value only needs to be reused in the current request, a static variable or Request cache may be enough. If it needs to cross requests or be shared among frontends, MUC is the appropriate abstraction.

MUC also provides administration, store mappings, invalidation, multiple levels, and contracts that a static variable does not. On the other hand, going through a shared store to avoid a 20-microsecond function may cost more than recalculating it.

The question is not "which API is more modern?" but "what is the reuse scope and what cost am I avoiding?".

## 12.20 Static acceleration

MUC can use `staticacceleration` to retain a copy of items already read or written within the current request. This avoids repeated access to the underlying store when the same item is requested several times in one request.

```php
$definitions = [
    'catalog' => [
        'mode' => cache_store::MODE_APPLICATION,
        'staticacceleration' => true,
        'staticaccelerationsize' => 100,
    ],
];
```

It is an interesting optimization, but it consumes memory. If you access thousands of huge keys in one request, statically accelerating all of them can turn a latency gain into RAM pressure.

Again, do not enable an option because "it sounds better". Measure the access pattern.

## 12.21 cachedir, localcachedir, and localized caches

On installations with multiple frontends, the distinction between shared cache and node-local cache stops being a detail.

```php
$CFG->cachedir deve ser compartilhado quando o cluster depende daquele conteúdo comum, enquanto $CFG->localcachedir foi pensado para dados que podem ficar locais em cada frontend. Na Cache API existe ainda canuselocalstore, que informa que determinada definição pode funcionar com store local sem comprometer correção.
```

This can reduce network latency, but creates the classic problem: how does one node know another changed the data? Modern MUC documentation discusses localized caches, versioned keys, and local-plus-shared layers precisely because of this difficulty.

At larger scale, one central cache can become a bottleneck. At smaller scale, distributing cache unnecessarily can increase complexity. Good architecture matches the real size of the problem.

## 12.22 Multi-layer caching

One efficient cluster strategy is combining a fast local cache with a shared cache. If the item exists locally, the read is very cheap. If it does not, the shared layer can provide the value without making every frontend recalculate it independently.

MUC documentation uses examples such as local APCu combined with shared Redis for small, frequently accessed data. This reduces latency and prevents newly started frontends from attacking the database and filesystem simultaneously while warming up.

The benefit only exists if the definition can be localized safely. Putting data requiring immediate invalidation into independent caches without versions or a coherence strategy is simply manufacturing distributed inconsistency.

## 12.23 Cache stampede

A cache stampede happens when an expensive entry expires or is purged and many processes observe the miss at the same time. They all begin reconstructing the same value and, for a few seconds, the cache that should protect the database does the opposite: it concentrates dozens of heavy queries at once.

MUC provides locking-related options for cases where computation is genuinely expensive, but the documentation recommends care because locking adds cost and complexity. When used, the process acquiring the lock should check again whether another worker already filled the cache before recalculating.

Other strategies include versioning, controlled pre-warming, or asynchronous refresh when the domain allows slightly stale data for a period.

There is no universal recipe, but there is a common symptom: everything gets slow immediately after a purge or deployment.

## 12.24 N+1 queries

N+1 is one of the most common bottlenecks in code that looks perfectly reasonable line by line.

```php
$courses = $DB->get_records('course', ['visible' => 1]);

foreach ($courses as $course) {
    $course->teachers = $DB->get_records_sql(
        'SELECT ... WHERE courseid = ?',
        [$course->id]
    );
}
```

One query loads courses and then another query runs for every course. With ten courses, nobody may notice. With two thousand, the page executes two thousand and one queries.

Cache may reduce part of this, but the real correction is normally redesigning the query, aggregation, or preloading. If each item needs related data, fetch sets in bulk and organize them in memory.

Caching N+1 is like adding a turbocharger to a car with the handbrake on. It may go faster, but the main problem is still there.

## 12.25 Recordsets - revisiting Chapter 5

When you need to iterate over many records, a recordset avoids loading the entire result into memory at once. This does not magically make the query cheap, but it changes the memory-consumption profile.

```php
$rs = $DB->get_recordset_sql($sql, $params);

foreach ($rs as $record) {
    process_record($record);
}

$rs->close();
```

For reports, tasks, and maintenance routines, this difference is enormous. `$DB->get_records_sql()` must materialize the entire set in an array, while a recordset allows progressive processing.

Still, watch out for N+1 inside `foreach`. Replacing `get_records()` with a recordset and then running three queries per row only moves the problem.

## 12.26 Pagination

If the interface shows fifty records, fetching fifty thousand and then slicing them in PHP is wasteful. The DML API allows limits and offsets, and the query should return only what the page actually needs.

Pagination improves database time, transfer, PHP memory, serialization, and rendering. It is one of the simplest and most frequently ignored optimizations.

Also consider the cost of `COUNT(*)` when the dataset is enormous and filters are complex. Some screens require the exact total; others only need to know whether a next page exists. Interface design can strongly influence backend cost.

When you control product and architecture, do not treat UX and performance as teams that never talk to each other.

## 12.27 Indexes - revisiting Chapter 5

An index exists so the database does not need to examine an absurd number of rows to answer frequent queries. That does not mean creating an index for every field appearing in a `WHERE`.

Column order in a composite index matters, selectivity matters, and operations such as applying functions to columns can prevent efficient index use. An index that helps reads also costs space and write work in `INSERT`, `UPDATE`, and `DELETE`.

Use `EXPLAIN`, inspect the real plan, and align indexes with critical queries. "I added an index and it looks faster" is a weak conclusion for a system you expect to maintain for years.

In a distributed Moodle plugin, also remember the schema needs to work across supported databases. Do not introduce database-specific optimization without evaluating compatibility.

## 12.28 Avoiding gigantic get_records()

`get_records()` is convenient and for exactly that reason appears in code fetching far more data than it should.

```php
$all = $DB->get_records('meuplugin_log');
```

On a small table it works. On a table with twenty million rows it may exhaust memory before you reach the second `foreach`.

First ask whether you actually need all of them. Usually the answer is no. Filter by course, user, period, status, or batch. If you genuinely need to traverse the whole set, use a recordset and incremental processing.

Also select only the columns you need. Fetching large text fields and blobs when the screen only uses `id`, `status`, and `timemodified` wastes I/O and memory.

## 12.29 Lazy loading

Lazy loading means delaying work until the moment it is genuinely needed. It is useful when a page has execution paths that are not always used.

Imagine a class that loads course, users, groups, files, and external configuration in the constructor even though some methods need only `courseid`. Every instance pays the full cost.

A more careful design can load expensive dependencies only when the relevant method is called, then retain the result locally for the lifetime of the object.

Lazy loading should not become an excuse to hide a query in every getter. If you iterate over one thousand objects and every `get_teacher()` fires SQL, you have created elegant, object-oriented N+1.

## 12.30 settings.php and lazy loading

`settings.php` deserves special attention because it may be loaded while Moodle builds the administrative tree, and database queries or external calls placed there may cost time on pages with no direct relationship to plugin configuration.

Avoid building huge selects by querying an entire table every time the file is processed. Avoid calling an external API to discover options. Avoid doing work simply because the administrator might open a setting.

When possible, use dedicated pages, on-demand callbacks, autocomplete, and dynamic loading. Administrative configuration does not need to fetch ten thousand courses for an `<select>` during initial load.

This is an excellent example of a performance problem cache should not hide. The problem may be doing the work too early.

## 12.31 Callback performance

Global callbacks can execute far more often than you imagine. A navigation callback, for example, may run on many pages and for many users. Putting a heavy query there turns a small plugin feature into a tax on the whole site.

Before doing work, check context and cheap conditions that allow an early return.

```php
if (!$PAGE->course || $PAGE->course->id == SITEID) {
    return;
}
```

After that, query only what you genuinely need. And if the result is repeated and stable, consider an appropriate cache.

The best callback is often one that returns quickly when it has nothing to do.

## 12.32 lib.php performance

In Chapter 3 we saw why `lib.php` should remain small. Performance is another reason.

Moodle may include this file in different flows while discovering component callbacks. If you execute logic in the global scope of `lib.php`, it may run merely because Moodle needed to know whether a particular function exists.

No database queries outside functions, no HTTP-client initialization, no heavy configuration reads, and no object construction at the top of the file.

`lib.php` should declare callbacks genuinely required by the plugin type. Business logic belongs in classes and executes only when some flow calls it intentionally.

## 12.33 Observer performance

An Event observer needs to be fast. The event happens inside a flow already in progress and the observer contributes to the cost perceived by whoever triggered that action.

If an observer for `course_module_created` calls an external API, processes files, and recalculates hundreds of records, creating an activity can take seconds or fail because an external vendor is unavailable.

The normal solution is to collect identifiers, record minimal state, and queue an Adhoc Task, as we saw in Chapter 11.

Also be careful with very generic observers. Listening to a frequent event and only discovering after five queries that there was nothing to do is an excellent way to degrade the whole site.

## 12.34 Hook performance

Hooks may be even closer to critical paths because some exist precisely to let code intervene before or during an operation. This means a slow callback can block the main operation.

Use the same rules: cheap conditions first, no unnecessary synchronous external calls, no repeated per-item queries, and particular care with Hooks firing in listings or internal loops.

A Hook is an extension point, not a license to turn every request into your plugin's pipeline.

## 12.35 External APIs and cache

Data from external APIs is a common cache candidate because networks are expensive and unreliable. Even so, three questions matter.

First, how stale may the data become? Second, does the user need to wait for the API or can we update in the background? Third, does the cache contain global information or data specific to a user and their authorization?

If an exchange-rate table can be five minutes stale, cache with an update policy makes sense. If the data is a user's financial balance, you may need much stronger consistency. If the endpoint takes five seconds but is not required to complete the action, the Task API may be better than caching a synchronous response.

Do not let a performance decision degrade business rules.

## 12.36 Session locking is different from the Lock API

In Chapter 11 we used the Lock API to prevent two workers from executing the same business rule at the same time. Session locking solves a different problem: while an authenticated request keeps the session open for writing, another request from the same session may need to wait until that lock is released. This prevents two requests from writing session state simultaneously, but can also turn calls that seemed parallel into an invisible queue.

This effect appears frequently with AJAX. A screen fires three requests at the same time, the first enters a slow operation while holding the session lock, and the other two stop before even reaching the code you are measuring. In the browser it looks as if API B took five seconds, but in reality four and a half seconds were spent waiting for the session lock created by API A.

## 12.37 A long request holding the session becomes a global bottleneck for that user

External calls, file generation, large reports, and downloads prepared in PHP are especially dangerous when they continue holding the session despite no longer needing to modify it. The database may be fast and caches may be warm, yet the interface still feels frozen because every other authenticated request from that user waits for the long request to finish.

This also explains why two users may experience completely different behavior in the same minute. The lock belongs to the session, not the whole site, so a user trapped in one slow request may feel the interface is frozen while another continues navigating normally.

## 12.38 Releasing the session when there will be no more writes

When code has finished everything it needed to modify in the session and is about to enter a long phase that no longer depends on it, \core\session\manager::write_close() writes pending state and releases the lock so other requests from the same session can proceed.

```php
\core\session\manager::write_close();

// A partir daqui, execute processamento longo que não precisa mais alterar a sessão.
$report = $service->generate_large_report();
```

Do not call write_close() at the start of every page as an automatic optimization. After releasing the session, later changes to $SESSION should not be treated as though they will still be persisted normally, and code called farther down the stack may legitimately need that state. The decision belongs at the point where you know the remaining flow is independent from session writes.

Session locking also does not replace the Lock API. Closing the session allows concurrency among requests from the same user; it does not stop two users, two tasks, or two workers from processing the same record. When the shared resource belongs to the plugin domain, keep using the Lock API or another appropriate transactional guarantee.

## 12.39 Profiling

When a page is still slow and the cause is not obvious, profiling helps discover where PHP is actually spending time and memory.

Moodle integrates with tools following the XHProf model and has specific profiling documentation. These tools show call counts, inclusive and exclusive time, memory, and execution hierarchy.

It is much more useful to discover one function was called 18,000 times than to spend an afternoon "optimizing" a template responsible for 1% of total time.

Xdebug also provides profiling features, but normally has higher overhead and is not recommended for production. The tool needs to match the environment and objective.

## 12.40 Debug performance info

During development, performance information shown by Moodle itself helps reveal page-generation time, memory, and database-query count. It does not replace a profiler, but it is excellent for spotting regressions quickly.

If a simple change turns a page from 80 to 900 queries, you do not need forensic analysis to know something went wrong.

Use DEBUG_DEVELOPER and performance information in an appropriate environment; do not expose internal details to users in production. Debugging is a development tool, not footer decoration.

Also compare equivalent scenarios. The first request after a purge is naturally more expensive because caches need to warm up.

## 12.41 EXPLAIN in the database

`EXPLAIN` shows how the database intends to execute a query. It helps identify table scans, which index is used, join order, row estimates, and expensive operations.

Take the real SQL generated by the slow page, substitute parameters carefully in a test environment, and inspect the plan. In PostgreSQL, `EXPLAIN ANALYZE` executes the query and shows actual timings, so use it responsibly, especially with data-changing statements or heavy queries. MySQL and MariaDB provide equivalent plan-analysis tools.

The goal is not to memorize every field in the execution plan but to answer concrete questions. Is the database using the index I expected? Is it reading millions of rows to return twenty? Is sorting creating an expensive operation? Does the join begin from the wrong table?

Adding indexes without reading the plan becomes trial and error.

## 12.42 Measuring hits and misses

Cache only makes sense when there is enough reuse to pay for its cost. A cache receiving a million `set()` and almost no successful `get()` is consuming memory and I/O without proportional benefit.

With Redis or Valkey infrastructure, metrics for hits, memory, eviction, connections, and latency help explain behavior. Inside Moodle, cache configuration and administrative tools show stores and mappings, while external observability can complete the picture.

Do not analyze only the global hit percentage. One critical definition may behave badly while being hidden by another heavily accessed definition.

And remember that a high hit rate does not prove correctness either. An incorrect cache can have a 99.9% hit ratio while delivering stale data with impressive efficiency.

## 12.43 Serialization also costs

When you store a large object in cache, it must be converted into a storable representation and reconstructed later. Depending on the store and definition, serialization and transfer may cost more than recalculating a simple value.

This appears especially when somebody decides to cache a huge object "to avoid a query" that returned five columns in microseconds.

`simpledata` exists precisely to allow optimization when values are simple, but the more important rule is to reduce data. Cache the information you need, not an entire object graph for convenience.

Fewer bytes mean less memory, less network traffic, less serialization, and cheaper purge.

## 12.44 Cache does not replace an index

It is common to see a three-second query "solved" by cache. The first user still pays three seconds, every purge brings the problem back, and frequent changes make the page oscillate between fast and slow.

If the query is intrinsically bad, fix the query. Then evaluate whether cache still adds value.

Cache is excellent for avoiding repeated correct and expensive work. It should not be a bandage for SQL scanning an entire table because a composite index is missing.

## 12.45 Cache does not replace the Task API

Another mistake is caching the result of work that should be precomputed in the background. A report taking two minutes to calculate and changing once per night might be better generated by a Scheduled Task and served ready, instead of depending on the first user of the morning to warm a cache.

Likewise, a heavy external integration may periodically update local state so pages can query the database quickly.

Cache reduces repetition. A Task changes when execution happens. They are different tools and many good architectures use both together.

## 12.46 Measure before optimizing

Optimization without measurement produces a lot of strange code for gains nobody can prove.

Before changing anything, capture time, query count, memory, volume, and scenario. Then apply one change and compare exactly the same flow.

If you change three things at once, you do not know which helped. If you measured with warm caches before and cold caches afterward, the comparison is invalid. If you tested with ten records and production has ten million, the result may be completely different.

Performance is experimental engineering: hypothesis, measurement, change, new measurement.

And there is one detail people rarely like to hear: sometimes a 400 ms page is already good enough. Spending three days to reach 360 ms may be technically entertaining and economically useless.

## 12.47 A practical methodology for a slow page

When I investigate a slow page, I start by dividing the time into categories.

First I look at query count and duration. If there is N+1 or an obviously expensive query, I fix that before thinking about Redis. Then I inspect memory and the size of loaded datasets. Next I look for external calls, filesystem work, callbacks, observers, and Hooks executing in that flow.

Only after that do I ask whether there is repeated work that genuinely deserves caching. When it does, I define scope, key, invalidation, and tolerance for stale data before writing `cache::make()`.

If the cause is still unclear, profiling comes in. And if SQL is suspicious, `EXPLAIN` stops being optional.

This process looks slower than installing Redis, but usually saves time because you fix the actual bottleneck.

## 12.48 Exercise - receive a slow page and identify the bottlenecks

Create or receive a fictitious plugin with an intentionally poor report page. It should load all courses using `get_records()`, run one extra query per course to count users, fetch external configuration over HTTP inside the loop, build the entire list, and only then display the first fifty items.

Also add a navigation callback that executes an unnecessary query on every page and an incorrectly designed Application cache that uses only `courseid` as the key even though the result also varies by language.

First measure the scenario without fixing anything. Record total time, query count, memory, and number of external calls. Then attack one bottleneck at a time.

Replace N+1 with an appropriate bulk query or aggregation. Implement database pagination. If a large dataset must be processed, evaluate a recordset. Review indexes with `EXPLAIN`. Remove the external call from the loop and decide whether it should be cached or processed by a Task. Make the callback return early when it does not apply.

Then fix the cache. Define the proper mode, a key representing every dimension of the value, and an invalidation strategy. Compare cold and warm cache behavior because looking only at the second access gives an incomplete picture.

As a final step, configure a Redis store in a test installation and repeat the measurements. The question is not "did Redis make it faster?" but "which part became faster and did the main bottleneck move somewhere else?".

If you can answer that with numbers, the exercise achieved its purpose.

## 12.49 The mental model that should remain

Performance in Moodle is the result of database, PHP, filesystem, network, cache, data volume, and extension points executed throughout the request. MUC solves reuse of calculated data; it does not solve every one of these problems.

Request cache serves the request. Session cache serves the session. Application cache shares reusable state across the application. A store is infrastructure and should be selected by the installation rather than hardcoded by the plugin. Redis and Valkey may participate in the architecture, but they remain backends, not business APIs.

N+1 is fixed by redesigning data access. Large datasets are handled with filters, pagination, and recordsets. Slow queries call for indexes and `EXPLAIN`. A heavy observer may call for a Task. A global callback should return early. Cache requires invalidation. And every optimization needs measurement before and after.

If I had to leave one rule, it would be this: do not cache something merely because it is slow; discover why it is slow and only use cache when reusing the result is genuinely part of the solution.

## Technical references consulted

* Moodle PHP Documentation. core\session\manager::write_close(), Moodle 5.0. https://phpdoc.moodledev.io/5.0/
* Moodle Developer Resources. Cache API, current documentation for versions 5.0 and 5.2. Concepts of MUC, `db/caches.php`, Request, Session and Application modes, definitions, stores, `staticacceleration`, `canuselocalstore`, TTL, locking, localized caches, and versioned caches.
* Moodle `config-dist.php`. Configuration of `cachedir`, `localcachedir`, shared directories in clusters, cache configuration path, and current Redis-session examples.
* Moodle Developer Resources. Profiling PHP. Integration with XHProf-style tools and guidance on Xdebug in production environments.
* Valkey Documentation. RESP and migration guide from Redis OSS. Protocol compatibility and Redis-client behavior with compatible Valkey versions.

{% endraw %}