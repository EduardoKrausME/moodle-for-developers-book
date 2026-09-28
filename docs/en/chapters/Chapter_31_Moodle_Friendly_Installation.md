{% raw %}

# 31 MOODLE FRIENDLY INSTALLATION: OPERATIONS AND AUTOMATION

So far this book has dealt mainly with what happens inside Moodle: plugins, APIs, security, databases, testing, continuous integration, and maintenance. But part of the problem begins before any `version.php` is loaded. Someone still has to create the installation, prepare the database and directories, configure the web server, issue SSL certificates, execute privileged tasks, diagnose failures, monitor resource usage, and, in some environments, build the mobile application as well.

This is where **Moodle Friendly Installation** fits. The project is available at [https://github.com/EduardoKrausME/moodle_friendly_installation](https://github.com/EduardoKrausME/moodle_friendly_installation).

It is not a Moodle plugin. It is an operations panel for managing multiple Moodle installations on a private server, and precisely because it lives outside Moodle it exposes a different class of architectural decisions: privilege separation, job queues, infrastructure automation, generated configuration, observability, and safe handling of actions that need to run as `root`.

The project can be installed with:

```bash
curl -fsSL https://raw.githubusercontent.com/EduardoKrausME/moodle_friendly_installation/refs/heads/master/install/installation.sh -o i.sh && chmod +x i.sh && ./i.sh
```

The purpose of this chapter is not to turn that repository into a universal Moodle-hosting recipe. It represents one concrete architecture with concrete decisions, and it is therefore more useful to study it as a real system than to copy scripts without understanding what each process is allowed to do.

## 31.1 The problem the project solves

Imagine a server hosting several Moodle installations, each under `/home/[domain]/moodle`, with its own `moodledata`, database, NGINX or Apache configuration, SSL certificate, and possibly its own Android application.

Doing this manually works when there are two sites and the administrator remembers every detail. As the number grows, operations begin depending on somebody's memory: create the user and database, copy configuration, adjust permissions, install plugins, enable the certificate, review DNS, configure logs, check debugging, and repeat everything without missing a step.

Moodle Friendly Installation turns that workflow into a panel that lists existing installations, creates new ones, runs diagnostics, tracks jobs, collects resource usage, controls selected server settings, and generates APK/AAB packages for each domain when APP support is available.

## 31.2 The web panel must not be root

The project's most important architectural decision is that the web panel **does not execute privileged operations directly**.

PHP-FPM or Apache serves the interface and creates a job. A separate process, executed by CRON as `root`, consumes the queue and performs the operation.

Conceptually, the flow is:

```
browser
    ↓
PHP panel
    ↓
validate input
    ↓
write pending job
    ↓
root CRON
    ↓
acquire lock
    ↓
execute privileged operation
    ↓
write result and log
    ↓
panel displays state
```

This avoids a much worse solution: granting the web-server user permission to reload NGINX, modify files under `/home`, administer databases, or execute installation scripts as superuser.

When an administrative panel needs to perform something privileged, the right question is not "how do I make PHP run as root?", but "how do I turn this action into a validated message for a privileged executor with the smallest possible attack surface?".

## 31.3 Control plane versus executor

The panel acts as the control plane. It receives intent, validates parameters, records state, and presents results.

The runner acts as the executor. It knows a closed set of job types and executes only the operations that were designed into the system.

This separation reduces the impact of a panel vulnerability. If arbitrary browser input can become a shell command directly, the web application has effectively become a remote API to the operating system. A queue does not solve this by itself, but it creates a boundary where each action type can be validated again before execution.

## 31.4 The queue is a state machine

A job should not be merely a JSON file containing a command. It has state and transition rules.

A simple model may use:

```
pending
running
waiting_dns
completed
failed
cancelled
```

Transitions need to be atomic enough to prevent two concurrent executions and to prevent cancellation after the runner has already claimed the job.

The project uses a runner lock and executes one pending job at a time. This reduces parallelism, but greatly simplifies consistency on a server where jobs modify configuration, databases, filesystems, and operating-system services.

Before increasing concurrency, you need to know which operations can safely run together without competing for the same files, ports, packages, services, or host limits.

## 31.5 Moodle installation as a pipeline

Installation is not a single operation. It is a sequence of dependent steps.

At a high level:

```
validate domain and parameters
    ↓
prepare directories
    ↓
create database and credentials
    ↓
obtain Moodle code
    ↓
generate config.php
    ↓
generate NGINX/Apache configuration
    ↓
run CLI installation
    ↓
install default plugins
    ↓
issue/validate SSL
    ↓
validate the final environment
```

If DNS does not yet point to the server, for example, treating certificate issuance as a permanent failure of the entire process may be wrong. A waiting state can be more appropriate than repeating the complete installation.

The distinction between a recoverable error, an unsatisfied external dependency, and a permanent failure matters in every infrastructure automation system.

## 31.6 Templates are production code

The project generates server files from templates. Those templates require the same care as PHP code.

A broken NGINX template can take a domain offline. A malformed Apache template can prevent reload. An installation script with an unescaped variable can become a security problem.

Generated configuration should therefore be validated before activation. For NGINX, use `nginx -t`; for Apache, use `apache2ctl` or `httpd` with the appropriate option.

The project validates configuration before activating changes and restores the previous configuration when validation or reload fails. That matters far more than displaying "saved successfully" in the interface.

## 31.7 Rollback is not a luxury

Every administrative action that modifies a working configuration should consider the way back.

The general pattern is:

```
read current state
create temporary backup
generate new state
validate
activate
test/reload
if it fails:
    restore previous state
    reload again
    record error
```

Without rollback, the interface can turn a small typo or template bug into downtime.

## 31.8 Diagnostics should answer operational questions

A useful diagnostic screen does not merely show green "OK" labels. It helps explain why a site is not working.

The project checks, among other things:

* the Moodle `config.php`;
* basic database information;
* domain DNS;
* SSL certificate;
* NGINX and Apache files;
* environment control flags;
* debug and maintenance mode.

The value comes from correlation. Correct DNS with missing SSL suggests a different problem from incorrect DNS with a certificate that has not yet been issued.

## 31.9 Expensive metrics do not belong in the web request

Calculating Moodle code size, `moodledata`, database size, and disk usage can involve expensive operations. Doing that every time the page opens turns the panel into an I/O generator.

The project collects these values in the background and stores snapshots. If a snapshot is missing or too old, the runner refreshes it.

The pattern is simple:

```
web request
    ↓
read fast snapshot

background
    ↓
perform expensive operation
    ↓
replace snapshot
```

The same reasoning appears inside Moodle whenever information can be materialised or calculated outside the user's critical request path.

## 31.10 Logs need boundaries

Providing log access through a panel sounds simple until someone opens a multi-gigabyte file.

The project limits reads to the last 256 KB and 500 lines and provides a text filter. New per-domain logs are also rotated.

This avoids two classes of problems: excessive PHP memory usage and using the panel itself as a denial-of-service tool against the server.

The panel should also read only known files. A parameter such as `?file=/etc/shadow` must never be free to decide which path will be opened.

## 31.11 Path and domain security

Domains, directories, package UIDs, and values used in filenames must be treated as hostile input.

Removing `../` is not enough. A safer design converts external input into a strictly validated identifier and only then builds internal paths relative to a known root.

For example, if the system operates only under `/home/[domain]`, the domain should pass strict format validation and the final resolved path must remain under the expected root.

Infrastructure automation amplifies mistakes. A path traversal bug in a plugin may expose Moodle files; a similar bug in a panel connected to a root runner may expose the entire server.

## 31.12 ModSecurity and cache are jobs

Enabling or disabling ModSecurity or NGINX cache is not a visual preference. It is a server-configuration change.

That is why these actions enter the privileged queue, pass configuration validation, and use controlled reloads.

The UI can still present a simple button, but the implementation needs to treat the click as an operational change that can fail and may require rollback.

## 31.13 Administrative SSO

The project can provide administrative access through an SSO file generated inside Moodle.

This deserves special attention because every automatic administrative-login mechanism is sensitive by definition.

Tokens or temporary files should be unpredictable, narrowly scoped, short-lived, and ideally single-use. They should also be removed or invalidated after consumption.

The convenience of "log in as admin with one click" must never create a permanent URL that behaves like an eternal password.

## 31.14 Panel data outside public

Users, queues, runtime state, and logs are written under directories such as:

```
data/
data/logs/
data/queue/
data/runtime/
```

These files do not need to live inside the document root. Keeping operational data outside `public/` reduces the chance that a web-server misconfiguration exposes JSON files, logs, password hashes, queues, or internal state.

The same principle applies to any PHP application: if the browser does not need to download a file directly, it probably does not belong in the document root.

## 31.15 Passwords and bootstrap

The first user is created in `data/users.json`. When a plain-text password is found on first login, it is replaced with `password_hash()`.

This simplifies bootstrap, but the initial password still needs to be protected as a secret from the moment it is written.

In production, the natural next step is to minimise the time any plain-text secret exists and to enforce restrictive file permissions.

## 31.16 APP build as a second pipeline

Building the Android application is a second pipeline, separate from Moodle installation.

It needs Node.js, NPM, Cordova, Android SDK, Gradle, Java 17, and ImageMagick, and it must handle application identity, icons, keystores, and final artefacts.

The project validates a 1024x1024 PNG icon, associates resources with the `Package UID`, creates the keystore during the first configuration, and generates APK/AAB packages through the queue.

The important architectural point is that mobile builds are also heavy and potentially slow, so they should not execute inside the HTTP request that received the form.

## 31.17 Package UID is not cosmetic

After an application is published, changing its package ID changes its identity for Android and app stores.

The project therefore locks the `Package UID` after its first save.

This is a good example of a domain rule: technically the field could remain editable, but allowing that would create a consequence much larger than the interface suggests.

## 31.18 A keystore is a critical asset

The keystore used to sign the APP needs to be treated as a long-term asset.

Losing the file or its password may prevent future application updates. Exposing it may allow someone else to sign builds as if they were legitimate.

Backup, filesystem permissions, and keystore recovery procedures therefore deserve explicit documentation rather than being hidden as an implementation detail behind a form.

## 31.19 Multilingual interface

Panel texts live under `public/app/lang/`. Each language returns an array containing strings and metadata such as the language name, HTML language code, and flag.

The selection is stored in the session and cookie and can also be changed through the URL.

Separating interface text from application code avoids the classic pattern of spreading strings across templates and conditionals, which turns a future translation into a project-wide search-and-replace exercise.

## 31.20 What the project teaches about security

The project connects several trust boundaries that often appear separately:

```
browser → PHP
PHP → queue
queue → root runner
runner → shell
runner → database
runner → filesystem
runner → NGINX/Apache
runner → Certbot
runner → Android toolchain
```

Every arrow needs a contract and validation.

The more privileged the next process is, the less freedom the previous input should have.

Do not pass "commands" through the queue. Pass structured intent such as `install_moodle`, `toggle_modsecurity`, or `build_app`, and let the executor construct the allowed operation internally.

## 31.21 What the project teaches about observability

Automation without history becomes a black box.

Every job should record at least:

```
id
type
domain/target
state
created at
started at
finished at
result
error message
log reference
```

When an installation fails at three in the morning, the question cannot be "who remembers which step the script was on?".

## 31.22 Idempotency

Infrastructure scripts need to consider re-execution.

If an attempt fails after creating the database, the second attempt should not destroy data or fail merely because the database now exists. The same applies to directories, certificates, configuration files, and plugins.

Not every step can be perfectly idempotent, but the workflow must distinguish "already in the desired state" from "unexpected state".

## 31.23 The repository as a case study

When studying Moodle Friendly Installation, do not look only at screens. Follow one complete flow.

For example, choose "Install Moodle" and trace:

1. where the form validates domain, branch, and credentials;
2. how the job is persisted;
3. how the runner finds and locks the job;
4. which script performs the installation;
5. where NGINX/Apache and `config.php` are generated;
6. how errors are recorded;
7. how the panel presents the result.

Then repeat the exercise for APP build and for a server-configuration change.

This transverse reading exposes architecture far better than analysing isolated files.

## 31.24 Where the project can evolve

A natural evolution is to replace JSON files gradually with transactional storage when volume, concurrency, or audit requirements justify it.

Another is to formalise the job state machine, create retry policies by failure type, add health checks, automate template tests, and integrate a secrets mechanism instead of depending on static configuration for sensitive credentials.

It may also make sense to separate adapters for NGINX, Apache, databases, and Linux distributions when environment differences begin producing too many conditionals in the core.

The same rule used for plugins still applies: abstraction should be born from real variation, not from the desire to create more directories.

## 31.25 Practical exercise

Clone the project into a disposable environment and choose one workflow to audit.

For Moodle installation, draw the job state machine, list every external input, identify each privileged command, and mark which validations happen before the queue and which must happen again in the runner.

Then provoke at least four controlled failures: incorrect DNS, invalid NGINX configuration, incorrect database credentials, and a missing build dependency. The panel should report where the process failed without exposing passwords, tokens, or sensitive commands.

Finally, answer three questions.

If the PHP process is compromised, which actions can an attacker request from the runner? If a job file is modified manually on disk, does the runner validate its contents again or trust it blindly? And if the server restarts halfway through an installation, how does the system know whether to continue, retry, or require intervention?

Those answers say much more about the automation's security and maturity than the dashboard's appearance.

## 31.26 Source code

The complete project is available at:

[https://github.com/EduardoKrausME/moodle_friendly_installation](https://github.com/EduardoKrausME/moodle_friendly_installation)

The repository README contains the current server requirements, installation command, root-runner workflow, diagnostics, APP generation, languages, data layout, and expected operating flow. Because this is an active project, always use the repository as the source of truth for details that may change as the implementation evolves.

{% endraw %}
