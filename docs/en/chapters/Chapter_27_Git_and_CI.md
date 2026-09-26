{% raw %}

# 27 GIT AND CI

In Chapter 4 we discussed quality as a developer responsibility. Code needs to follow Coding Style, upgrades need to be correct, JavaScript needs to compile, Mustache needs to be valid, tests need to pass, and a plugin should not be published merely because it opened without errors in the author's environment. The problem is that relying on human memory to run all these checks before every delivery works until the day you are fixing an urgent bug, forget one command, and publish exactly the mistake the process was supposed to prevent.

This is where Git and CI stop being merely infrastructure tools and become part of the plugin architecture. Git records history, organises maintenance across versions, and creates reproducible release points, while Continuous Integration automatically executes what the project considers mandatory before accepting a change. The goal is not to create an attractive GitHub workflow; it is to turn rules that currently depend on discipline into checks that always run.

In this chapter we will continue using `mod_checkpoint`. In Chapter 25 it gained PHPUnit tests, in Chapter 26 it gained Behat journeys, and now we will put all of that into a real pipeline using GitHub Actions and Moodle Plugin CI. The same pipeline will also run PHP lint, Coding Style, PHPDoc, Moodle Plugin CI `validate`, Moodle Plugin Validate, savepoints, Mustache, Grunt, PHPUnit, and Behat, as well as selected combinations of Moodle, PHP, and database versions. At the end, an approved tag will be able to produce a reproducible ZIP without somebody opening a file manager and manually compressing the directory.

## 27.1 Git is not merely code backup

Git records states and relationships between states. That sounds obvious, but it changes how Moodle plugin development works because every change now has an origin, diff, author, review history, and exact commit that can be reproduced.

When a customer reports that an installed version started failing after an update, the question stops being "which ZIP did you upload?" and becomes "which tag or commit is installed?". When a fix needs to return to an older Moodle branch, you can locate the commit and backport it instead of copying files between directories.

A healthy repository lets you reconstruct a release without depending on the computer of the person who published it.

## 27.2 One repository per plugin

For plugins distributed separately, one repository per component is usually the simplest option. `mod_checkpoint` lives in one repository, `local_deliveryhub` in another, and each has its own issues, releases, tags, and CI.

A monorepo is also possible, especially when several components are always developed and delivered together, but it changes versioning and pipeline complexity. If five independent plugins live in the same repository, one tag no longer clearly answers which version of each component was released.

Do not choose a monorepo merely because every project belongs to the same company. Choose it when the development and delivery lifecycle is genuinely shared.

## 27.3 Repository root

For an isolated plugin, I like the repository root to be the plugin itself:

```
mod_checkpoint/
    .github/
    classes/
    db/
    lang/
    tests/
    version.php
    README.md
```

When Moodle Plugin CI checks out the plugin, that directory is installed in the correct location inside a temporary Moodle copy.

This structure also makes the release ZIP predictable, because you only need to package the content under a `checkpoint` directory to deliver it under `mod/checkpoint`.

## 27.4 `.gitignore`

`.gitignore` should exclude generated or local files that do not belong to the plugin source. An initial example:

```
/vendor/
/node_modules/
.phpunit.result.cache
/.idea/
/.vscode/
/coverage/
*.log
.DS_Store
```

Do not treat this as a list copied from the internet. What should be ignored depends on what is generated, what is required in production, and the release build process.

## 27.5 Do not ignore `amd/build` by reflex

This is an important mistake in Moodle plugins. `amd/src` contains source code, but Moodle serves the compiled files from `amd/build` in production. If the plugin is distributed as a ZIP, build files need to be present in the final package.

Therefore do not put `amd/build` in `.gitignore` merely because directories named `build` are often disposable in other ecosystems. In Moodle development it is common to version the compiled output required for production.

The same question applies to every frontend artefact: if the production server will not run the toolchain to generate that file, it needs to arrive ready in the release.

## 27.6 `node_modules` does not belong in the published plugin

`node_modules` contains development dependencies and can be recreated by `npm`. It should not be committed to Git or included in the plugin ZIP.

What matters is the manifest and, when used, the lock file that allows the same dependency tree to be reconstructed.

```
package.json
package-lock.json
```

The output Moodle needs must be compiled into its build directories, not loaded from `node_modules` in production.

## 27.7 Composer and `vendor`

`vendor` should not enter Git merely because CI uses Composer. Moodle Plugin CI, PHPCS, PHPUnit, and other development tools can be installed during the pipeline.

The situation is different when the plugin has a PHP runtime library that is not provided by core. In that case you need to decide deliberately how that dependency reaches the Moodle installation, while respecting licensing and `thirdpartylibs.xml`. Do not assume the administrator will run `composer install` inside every plugin after installing the ZIP.

A CI dependency and a runtime dependency are different problems.

## 27.8 The lock file

If the repository has its own `composer.json` for development tooling, a versioned `composer.lock` can make the CI environment more reproducible. The team knows exactly which versions passed in the release.

For projects behaving as Composer libraries there is a separate discussion about whether to publish a lock file, but a Moodle plugin with its own toolchain usually benefits from predictability.

The important part is not to run `composer update` automatically in every pipeline and then believe you are always testing the same thing. `composer install` installs the known state; `composer update` changes that state.

## 27.9 Small, understandable commits

A commit should represent a coherent change. "Fix report capability" is much more useful than "changes" containing thirty unrelated files.

Small commits help review, `git bisect`, cherry-pick, and backporting. They also reduce the risk that a Moodle 4.5 fix accidentally carries a refactor exclusive to Moodle 5.2.

You do not need to turn every line into a commit, but every commit should tell a small story that makes sense on its own.

## 27.10 Do not mix a refactor with an urgent fix

If you need to fix a security issue, make the smallest coherent fix. Do not also rename twenty classes, move directories, and replace the database access pattern in the same commit.

CI can prove the tests passed, but it does not reduce the human cost of reviewing an enormous diff. Separating functional changes from refactors makes it easier to understand exactly what was fixed and to backport the fix to older branches.

## 27.11 Main branch

The main branch normally represents the current development line. It may be called `main` or follow another organisational convention.

If the plugin supports several Moodle versions, you need to decide whether `main` targets the newest supported version or a more conservative line compatible with all versions. For plugins that follow new APIs, keeping `main` aligned with the latest Moodle generally simplifies development.

## 27.12 Branch per Moodle version

When APIs genuinely diverge, use stable branches by Moodle line. A common convention in the ecosystem is:

```
main
MOODLE_405_STABLE
MOODLE_500_STABLE
MOODLE_501_STABLE
MOODLE_502_STABLE
```

There is no requirement to create a branch for every version if the same code genuinely works on all of them. A branch with no divergence adds merge work without delivering value.

## 27.13 Compatibility from a single branch

If `mod_checkpoint` works from Moodle 4.5 through 5.2 with the same code and a few compatibility checks, one branch may be better. The CI matrix proves that compatibility continues to exist.

The advantage is fixing a bug once. The disadvantage is maintaining compatibility conditionals and respecting the oldest PHP version supported by the entire set.

This is a maintenance trade-off, not a religious Git rule.

## 27.14 When to split branches

Split when compatibility starts harming the code. If Moodle 5.x requires a new architecture and supporting 4.5 means scattering `if (class_exists(...))` throughout the project, an older stable branch may be clearer.

The cost becomes backporting important fixes. The team therefore needs to state which branches receive bug fixes, which receive only security fixes, and which are closed.

## 27.15 Maintenance strategy

A simple policy could be:

```
main                 active development
MOODLE_502_STABLE    bug fixes and security
MOODLE_501_STABLE    security and critical fixes
MOODLE_500_STABLE    security until the date defined by the project
```

The plugin policy does not need to be identical to Moodle core's policy, but it should not promise support that nobody tests.

If a branch is listed as supported in the README, it needs to exist in the CI matrix.

## 27.16 Backport

When a fix is created on `main` and also applies to a stable branch, prefer a small commit that can be brought over with `cherry-pick`.

```
git checkout MOODLE_500_STABLE
git cherry-pick abc1234
```

A conflict is not a reason to copy an entire file from another branch. Resolve only the necessary differences and run CI for the destination branch.

## 27.17 Do not rewrite published history

Once a stable branch and tags have been shared, avoid `push --force`, destructive rebases, and moving tags.

A release is a reference for real installations. If `v1.4.0` pointed to one commit and later points somewhere else, two people can say they use the same version while having different code.

If the release was wrong, publish `v1.4.1`.

## 27.18 Tags

A tag marks a specific Git state that you consider a release.

```
git tag -a v1.4.0 -m "Release 1.4.0"
git push origin v1.4.0
```

Prefer annotated tags for formal releases because they have their own metadata and message.

## 27.19 Git tag and `$plugin->version` are different things

In `version.php` we might have:

```php
$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2025041400;
$plugin->release = '1.4.0';
$plugin->maturity = MATURITY_STABLE;
```

The tag may be `v1.4.0`, but Moodle's upgrade mechanism is controlled by `$plugin->version`, a monotonically increasing number.

Git does not replace `version.php`, and `version.php` does not replace Git.

## 27.20 `$plugin->version`

This value needs to increase whenever an existing installation needs to execute an upgrade. A common convention uses a date in the `YYYYMMDDXX` format.

```
2026092400
2026092401
2026092500
```

Do not decrease the number on a published branch. Moodle uses it to know whether it needs to execute `db/upgrade.php` and other update steps.

## 27.21 `$plugin->release`

`release` is a human-readable identifier. It can follow SemVer when appropriate:

```
1.4.0
1.4.1
2.0.0
```

It helps users and administrators recognise the release, while `version` remains the technical upgrade identifier.

Do not rely on SemVer for core to know whether an upgrade should run because Moodle does not use this field for that purpose.

## 27.22 Tag and release need to agree

If you publish tag `v1.4.0` while `version.php` still says `release = '1.3.2'`, the pipeline should fail.

This is an excellent custom CI check because it prevents a release with inconsistent metadata. You can extract the version from the tag and compare it with `$plugin->release` before generating the ZIP.

## 27.23 GitHub Releases

A GitHub Release normally points to a tag and can attach artefacts, a changelog, and release notes.

It is useful even when the Moodle Marketplace requires manual ZIP upload because it keeps a reproducible history of code and artefacts.

The GitHub release does not need to be the only distribution method, but it should represent exactly the same code as the published package.

## 27.24 Continuous Integration

CI means that for every relevant change the project automatically runs checks before the code is considered integrable.

The pipeline answers questions such as:

```
Does the PHP compile?
Is the Coding Style correct?
Is plugin metadata valid?
Are savepoints correct?
Are templates valid?
Does the JavaScript pass lint/build?
Does PHPUnit pass?
Does Behat pass?
Does the plugin work on the promised Moodle, PHP, and database versions?
```

If any mandatory answer is "no", the merge should stop.

## 27.25 CI is not CD

Continuous Integration validates changes. Continuous Delivery or Deployment handles automated delivery.

You can have excellent CI and still publish manually. You can also generate a ZIP automatically without installing anything in production.

Do not mix the stages. Testing a pull request should not have production-server credentials merely because another release workflow needs them.

## 27.26 GitHub Actions

On GitHub, workflows live under:

```
.github/workflows/
```

For the plugin we can create:

```
.github/workflows/ci.yml
.github/workflows/release.yml
```

Separating CI from release reduces permissions and makes it clearer which workflow only tests and which produces artefacts.

## 27.27 CI trigger

A simple base:

```
name: Moodle Plugin CI

on:
  push:
  pull_request:
  workflow_dispatch:
```

`push` validates pushed commits, `pull_request` protects integration, and `workflow_dispatch` allows manual execution.

Do not use `pull_request_target` to execute untrusted PR code with secrets because that event has very different security implications.

## 27.28 Least privilege for `GITHUB_TOKEN`

If CI only reads the repository, declare:

```
permissions:
  contents: read
```

Do not give write permission to a job that only needs to check out and test code.

The same principle applies to every token or secret. A pipeline is executable code and should follow least privilege.

## 27.29 Checkout

The current Moodle Plugin CI template checks out the plugin into a directory named `plugin`:

```
- name: Check out repository code
  uses: actions/checkout@v6
  with:
    path: plugin
    persist-credentials: false
```

`persist-credentials: false` is a useful protection when the rest of the job does not need to push back to the repository.

## 27.30 Moodle Plugin CI

`moodle-plugin-ci` automates installation of a Moodle copy and execution of the primary checks used by plugin developers.

The current flow usually begins with:

```
- name: Initialise moodle-plugin-ci
  run: |
    composer create-project -n --no-dev --prefer-dist moodlehq/moodle-plugin-ci ci ^4
    echo $(cd ci/bin; pwd) >> $GITHUB_PATH
    echo $(cd ci/vendor/bin; pwd) >> $GITHUB_PATH
    sudo locale-gen en_AU.UTF-8
```

Then the `install` command prepares Moodle, the database, the plugin, and test environments.

## 27.31 Why use Moodle Plugin CI

You could write shell scripts to clone Moodle, install dependencies, create a database, copy the plugin, generate `config.php`, and initialise PHPUnit and Behat. The problem is that you would need to maintain that infrastructure every time core changes.

Moodle Plugin CI concentrates this knowledge and exposes consistent commands for plugins.

That does not prevent custom steps; it simply avoids rebuilding what already exists.

## 27.32 Installation in the workflow

A typical step:

```mustache
- name: Install Moodle Plugin CI environment
  run: moodle-plugin-ci install --plugin ./plugin --db-host=127.0.0.1
  env:
    DB: ${{ matrix.database }}
    MOODLE_BRANCH: ${{ matrix.moodle-branch }}
```

The matrix decides which combination is installed in that job.

## 27.33 Matrix

A matrix lets the same job run across different combinations of Moodle version, PHP, and database.

The naive example would be:

```
matrix:
  php: ['8.1', '8.2', '8.3', '8.4']
  moodle-branch: [MOODLE_405_STABLE, MOODLE_500_STABLE, MOODLE_501_STABLE, MOODLE_502_STABLE]
  database: [pgsql, mariadb]
```

This generates invalid combinations, such as Moodle 5.2 with PHP 8.1. It also explodes the number of jobs without necessarily increasing useful coverage.

## 27.34 Prefer `matrix.include` for real compatibility

An explicit matrix is clearer:

```
strategy:
  fail-fast: false
  matrix:
    include:
      - moodle-branch: MOODLE_405_STABLE
        php: '8.1'
        database: pgsql
      - moodle-branch: MOODLE_405_STABLE
        php: '8.3'
        database: mariadb
      - moodle-branch: MOODLE_500_STABLE
        php: '8.2'
        database: pgsql
      - moodle-branch: MOODLE_500_STABLE
        php: '8.4'
        database: mariadb
      - moodle-branch: MOODLE_501_STABLE
        php: '8.4'
        database: pgsql
      - moodle-branch: MOODLE_502_STABLE
        php: '8.3'
        database: mariadb
      - moodle-branch: MOODLE_502_STABLE
        php: '8.4'
        database: pgsql
```

The matrix should follow the plugin's support policy, not a table copied forever.

## 27.35 Test minimum and maximum PHP

An economical strategy is to test at least the lowest and highest PHP versions supported by each important Moodle line.

If the plugin declares Moodle 5.0 with PHP 8.2 through 8.4, testing only 8.4 does not prove 8.2 still works. Likewise, testing only the minimum fails to catch incompatibilities with the newer version users are already adopting.

## 27.36 Moodle 4.5, 5.0, 5.1, and 5.2

Recent lines have different requirements. Moodle 4.5 starts at PHP 8.1, Moodle 5.0 and 5.1 at PHP 8.2, while Moodle 5.2 starts at PHP 8.3.

Do not leave these numbers hard-coded in internal documentation forever without reviewing them because PHP support evolves over the lifetime of branches.

CI is where this policy needs to become executable configuration.

## 27.37 PostgreSQL

PostgreSQL is an excellent second database family for discovering SQL that happened to work in MySQL/MariaDB.

Case sensitivity, casts, grouping, boolean handling, and database-specific functions quickly expose poorly portable queries.

If the plugin promises support for Moodle's official databases, testing only your main customer's database is not enough.

## 27.38 MariaDB is not simply MySQL

Despite historical compatibility, MariaDB and MySQL evolve independently. A query may work in one and behave differently in the other.

The current Moodle Plugin CI template uses MariaDB and PostgreSQL as its primary services. If your installed base includes MySQL and the plugin has complex SQL, add a representative MySQL execution too.

Do not write "MySQL/MariaDB" in the README as if they were one engine merely because both use Moodle's `mysqli` extension.

## 27.39 The cost of testing every database

Testing every combination of Moodle, PHP, and four databases can create dozens of jobs per commit. That is not always necessary.

A balanced strategy distributes coverage:

```
oldest Moodle + oldest PHP + PostgreSQL
oldest Moodle + newest PHP + MariaDB
current Moodle + oldest PHP + MariaDB
current Moodle + newest PHP + PostgreSQL
additional periodic job with MySQL
```

The goal is to find different classes of incompatibility without turning every typo into a one-hour suite.

## 27.40 Database services in GitHub Actions

Example with PostgreSQL:

```
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_USER: postgres
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 3
```

The health check prevents Moodle installation from starting before the database is ready.

## 27.41 MariaDB service

```
mariadb:
  image: mariadb:11
  env:
    MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: '1'
    MYSQL_CHARACTER_SET_SERVER: utf8mb4
    MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
  ports:
    - 3306:3306
```

CI image versions also need to follow the requirements of the branches being tested.

## 27.42 PHP Setup

The workflow needs to install the selected version:

```mustache
- name: Setup PHP ${{ matrix.php }}
  uses: shivammathur/setup-php@v2
  with:
    php-version: ${{ matrix.php }}
    ini-values: max_input_vars=5000, opcache.enable_cli=1
    coverage: none
```

If you are not collecting coverage in that job, do not load Xdebug out of habit because it adds overhead.

## 27.43 PHP lint

The first check should be cheap:

```
- name: PHP Lint
  run: moodle-plugin-ci phplint
```

It makes no sense to spend several minutes installing a browser only to discover at the end that a PHP file has a syntax error.

Organise the pipeline so cheap problems fail early.

## 27.44 Moodle Coding Style

```
- name: Moodle Code Checker
  run: moodle-plugin-ci phpcs --max-warnings 0
```

`--max-warnings 0` turns warnings into debt that must be solved now instead of accumulating hundreds of warnings nobody reads anymore.

If legacy code exists, handle exceptions locally and document them rather than disabling the checker entirely.

## 27.45 PHPDoc

```
- name: Moodle PHPDoc Checker
  run: moodle-plugin-ci phpdoc --max-warnings 0
```

Code documentation can look like a detail until a public API becomes ambiguous to the next maintainer or to somebody writing a subplugin.

CI prevents the standard from silently degrading.

## 27.46 Moodle Plugin CI `validate`

```
- name: Validate plugin
  run: moodle-plugin-ci validate
```

Validate checks metadata, structure, and several formal plugin requirements. It does not prove security or functional correctness, but it catches an important class of packaging and declaration errors.

Do not treat a green `validate` result as a security seal.

## 27.47 Moodle Plugin Validate

The command above belongs to Moodle Plugin CI. It should not be confused with [Moodle Plugin Validate](https://github.com/EduardoKrausME/moodle-plugin-validate), a separate static validator that can inspect a plugin before Moodle itself is installed.

That distinction matters in CI. `moodle-plugin-ci validate` runs inside the Moodle Plugin CI environment and checks the plugin using the infrastructure prepared for that pipeline. Moodle Plugin Validate works directly against the repository files, does not bootstrap Moodle, and therefore can fail quickly before the more expensive installation step begins.

At project-root level it checks basic packaging requirements such as a licence file, README, `version.php`, a valid `$plugin->component`, and a positive numeric `$plugin->version`. It also cross-checks the base language file against metadata that frequently drifts during development, including `pluginname`, capabilities declared in `db/access.php`, message providers, cache definitions, literal Privacy API string references, and literal `get_string()` calls for the current component.

One particularly useful area is subplugin validation. When `db/subplugins.json` exists, the validator checks its JSON structure, accepted keys, subplugin type names, paths, required language strings, and consistency between legacy `plugintypes` and modern `subplugintypes` declarations. Bundled subplugins are then inspected independently, including their own `version.php`, component name, version number, explicit dependency on the parent plugin, and whether that dependency is compatible with the parent version shipped in the same repository.

The tool also reports selected architecture warnings without turning every recommendation into a hard failure. For example, it can warn about legacy AJAX endpoints and large literal HTML fragments constructed in JavaScript. That separation is useful: an invalid component name should stop the pipeline, while an architectural smell may deserve review without necessarily blocking an emergency fix.

Because the validator is static, it can run immediately after checkout and PHP setup:

```yaml
- name: Validate Moodle plugin statically
  uses: EduardoKrausME/moodle-plugin-validate@main
  with:
    plugin: ./plugin
```

For a long-lived production workflow, prefer an immutable release tag or commit SHA once the project publishes one instead of following `@main` forever. The important point is where this check runs: before `moodle-plugin-ci install`. There is little value in spending time creating a Moodle test environment when the repository already has a missing language string, malformed subplugin declaration, or invalid plugin metadata that a static pass can detect immediately.

It can also be executed locally without a GitHub Action. The repository currently exposes the command-line binary as `bin/moodle-string-validate`:

```bash
php bin/moodle-string-validate /path/to/plugin
php bin/moodle-string-validate /path/to/plugin --format=github
```

The GitHub format emits workflow annotations, while the normal text format prints every executed validation as `OK`, `WARNING`, or `ERROR`. Errors return exit code `1`, warnings do not fail the build, and invalid command-line usage or runtime failures return `2`.

This validator does not replace Moodle Plugin CI, PHPCS, PHPUnit, Behat, or a real installation test. Its value is earlier feedback and checks targeted at mistakes that are easy to create in Moodle plugin repositories but expensive to discover only after the complete environment has been assembled. In a serious pipeline, the two validators complement each other rather than compete for the same job.

## 27.48 Savepoints

```
- name: Check upgrade savepoints
  run: moodle-plugin-ci savepoints
```

This step checks common `db/upgrade.php` mistakes, especially inconsistencies between version numbers and savepoints.

This is exactly the kind of failure that can go unnoticed on a clean installation and only appear for a customer upgrading from an older version.

## 27.49 Mustache lint

```
- name: Mustache Lint
  run: moodle-plugin-ci mustache
```

A broken template may not be exercised by PHPUnit and appear only when a particular page is opened.

Cheap lint should run before browser tests.

## 27.50 JavaScript and Grunt

```
- name: Grunt
  run: moodle-plugin-ci grunt --max-lint-warnings 0
```

Moodle's toolchain uses Grunt for JavaScript and CSS lint/build. Depending on plugin code, this step runs ESLint, stylelint, and compilation tasks.

If you change `amd/src` and forget to regenerate `amd/build`, CI should notice.

## 27.51 ESLint

When the plugin needs a specific JavaScript check, it can also run Grunt tasks directed at the relevant code.

The goal is not to have "one more linter", but to guarantee that the delivered source follows the rules and that the versioned build matches what the toolchain would produce.

Never automatically fix files and commit from ordinary CI. The pipeline should verify the received commit, not silently produce a different one.

## 27.52 PHPUnit

```
- name: PHPUnit tests
  run: moodle-plugin-ci phpunit --fail-on-warning
```

Everything built in Chapter 25 now becomes a merge gate.

A test that runs only on the developer's laptop is useful; a test that runs on every pull request is a quality policy.

## 27.53 Behat

```
- name: Behat features
  id: behat
  run: moodle-plugin-ci behat --profile chrome --scss-deprecations
```

Behat is more expensive, so you may choose to run it only on some matrix combinations or in a separate job.

There is no need to open Chrome eight times to prove the same journey if the other jobs already cover PHP and databases.

## 27.54 Do not run Behat on every combination without thinking

A common strategy is to execute lint and PHPUnit across the full matrix and Behat only on one primary combination:

```
if: >-
  matrix.moodle-branch == 'MOODLE_502_STABLE' &&
  matrix.php == '8.4' &&
  matrix.database == 'pgsql'
```

This reduces time and cost without abandoning interface coverage.

If there is database-specific behaviour visible in the journey, then justify a second combination.

## 27.55 Behat faildump

When Behat fails in CI, a screenshot and browser dump are far more useful than simply "step failed".

```mustache
- name: Upload Behat faildump
  if: ${{ failure() && steps.behat.outcome == 'failure' }}
  uses: actions/upload-artifact@v7
  with:
    name: behat-faildump-${{ matrix.moodle-branch }}-${{ matrix.php }}
    path: ${{ github.workspace }}/moodledata/behat_dump
    retention-days: 7
    if-no-files-found: ignore
```

The artefact exists for diagnosis after the runner has already been destroyed.

## 27.56 Artefact is not cache

Cache speeds execution by reusing dependencies. An artefact preserves job output.

Use cache for reconstructible downloads such as Composer packages. Use artefacts for release ZIPs, coverage, logs, or faildumps.

Mixing the two concepts creates workflows that are difficult to maintain and can introduce supply-chain risk.

## 27.57 Composer cache

Hosted runners start clean, so downloading the same dependencies every time costs time.

You can preserve Composer's cache directory with `actions/cache`, using a key based on the system, PHP version, and lock file.

Do not cache secrets, tokens, sensitive configuration files, or an entire Moodle installation without understanding the consequences.

## 27.58 Cache must be allowed to miss

The pipeline should work on a cache miss. If deleting every cache makes CI fail, you have turned cache into a hidden dependency.

Cache is an optimisation. The source of truth remains manifests, lock files, and reproducible scripts.

## 27.59 Cache security

A restored cache should be treated as untrusted content, especially in workflows that receive external pull requests.

Do not allow an untrusted PR to write a cache that will later be executed by a privileged workflow with secrets.

CI also has an attack surface.

## 27.60 Composer in CI

For repository dependencies:

```
composer validate --strict
composer install --no-interaction --prefer-dist --no-progress
```

Avoid `composer update` in the normal job because that changes the version set instead of verifying the versioned set.

A new dependency should enter through a separate PR with a reviewed lock file and green CI.

## 27.61 Moodle Plugin CI dependencies

Moodle Plugin CI itself is an external tool and evolves. Using `^4` follows the 4.x line, while exact pinning increases reproducibility.

There is a trade-off. Rigid pinning ages and may become incompatible with new runners; a broad range can introduce an unexpected pipeline change.

A healthy policy combines conscious pinning with reviewed automated updates.

## 27.62 Dependabot

Dependabot can open PRs to update dependencies and Actions.

A basic file:

```
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly

  - package-ecosystem: composer
    directory: /
    schedule:
      interval: weekly
```

If the plugin has `package.json`, you can add `npm` too.

## 27.63 Dependabot does not replace review

An automated PR still needs to pass the same CI and be reviewed, especially for a major update.

Do not configure unrestricted auto-merge merely because the PR author is a bot. An Action or dependency update can change pipeline and build behaviour.

Automation reduces repetitive work; it does not remove responsibility.

## 27.64 Updating GitHub Actions

Dependabot can track references such as `actions/checkout`, `actions/cache`, and `actions/upload-artifact`.

This matters because old Actions become unsupported and runners change. A pipeline is software too and needs maintenance.

## 27.65 Pinning by SHA

For environments with higher security requirements, GitHub recommends pinning third-party Actions by full commit SHA because a tag can move.

Conceptual example:

```html
uses: actions/checkout@<full-sha>
```

The downside is readability and maintenance, which makes tools such as Dependabot even more useful for opening reviewable PRs that update those SHAs.

## 27.66 `continue-on-error`

The Moodle Plugin CI template often lets optional analyses such as PHP Mess Detector fail without breaking the job:

```
continue-on-error: true
```

Use this only when the tool is informative. Do not put PHPUnit, PHPCS, or validate under `continue-on-error` and then say the pipeline protects quality.

A rule that can fail without blocking is not a gate.

## 27.67 Failing the build on error

The desired behaviour for a mandatory check is simple: a non-zero exit code needs to fail the job.

Avoid scripts like:

```
moodle-plugin-ci phpcs || true
```

That produces a green pipeline printing red errors, which is worse than having no CI because it creates false confidence.

## 27.68 `fail-fast: false`

In a matrix, `fail-fast: false` lets the other combinations continue even after one fails.

```
strategy:
  fail-fast: false
```

This is useful because you want to know whether the problem occurs only on PostgreSQL, only on the oldest PHP version, or on every combination.

Cancelling everything on the first failure saves minutes but loses diagnosis.

## 27.69 Timeout

Jobs should have a reasonable limit:

```
timeout-minutes: 30
```

Without a timeout, a stuck Behat run, stalled download, or unavailable database can consume a runner for a long time.

Timeouts also help detect suite performance regressions.

## 27.70 Concurrency

If a developer quickly pushes five commits to the same PR, you normally do not need to finish all five older workflows.

GitHub Actions can group executions by branch or PR and cancel the previous run.

That saves runner time and delivers feedback on the current commit faster.

## 27.71 Pull request as a gate

The best use of CI appears when the main branch requires green status checks before merge.

If the team can ignore the pipeline and push directly to `main`, CI becomes a report rather than protection.

Branch protection or rulesets should require the jobs that actually matter.

## 27.72 Do not let the gate depend on an unstable job

If a flaky Behat test blocks half of all PRs randomly, the team starts ignoring CI.

Fix or isolate the unstable test. A trustworthy gate must fail because of a real change, not because the runner woke up in a bad mood.

The principles from Chapter 26 apply here even more strongly.

## 27.73 Clean installation

A release must install on a clean Moodle. Moodle Plugin CI's standard process already installs the plugin during preparation and therefore catches several schema and metadata problems.

Even so, if the project has special scripts or extra dependencies, create an explicit job that simulates a real installation of the distribution, not only the Git tree.

This catches the classic case where the repository has a file that the ZIP-generation script forgot to include.

## 27.74 Upgrade test

A clean installation does not test `db/upgrade.php`. For that you need to start from a previously installed version.

A real upgrade flow is:

```
install previous release
create representative data
replace code with the new version
run admin/cli/upgrade.php --non-interactive
run post-upgrade checks
```

Savepoints help, but they do not replace this test.

## 27.75 Automated upgrade test

A pipeline can download an earlier tag of the same plugin, install it, insert fixture data, switch to the current commit, and run the upgrade.

This job is more expensive and does not need to run on every combination. One main combination per release already delivers enormous value.

Plugins with complex schemas should consider an upgrade test a release requirement.

## 27.76 Test the ZIP, not only the repository

The strongest packaging test is to install the actual artefact that will be published.

If the pipeline tests the Git tree and then a different script removes files while generating the ZIP, a broken release is still possible.

The release stage should build the ZIP, extract it into a clean environment, and run at least validate and installation before attaching the artefact.

## 27.77 Generating the ZIP

A simple script can prepare the structure:

```
set -euo pipefail

rm -rf build/package
mkdir -p build/package/checkpoint

rsync -a ./ build/package/checkpoint/ \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  --exclude 'coverage'

cd build/package
zip -r ../mod_checkpoint.zip checkpoint
```

The exclusion list must respect the plugin's runtime dependencies.

## 27.78 Directory name inside the ZIP

For `mod_checkpoint`, the package must contain a `checkpoint` directory with the plugin files.

After generating it, always inspect it:

```
unzip -l build/mod_checkpoint.zip
```

A ZIP containing `repository-main/checkpoint` or all files loose at the root can fail during installation even if the code itself is perfect.

## 27.79 Reproducible ZIP

Ideally, two runs over the same commit should produce the same logical content.

Do not include unnecessary timestamps, local logs, `.DS_Store`, temporary files, or IDE configuration.

The package should be a deterministic consequence of the commit and build recipe.

## 27.80 Generated files need to be up to date

Before creating the ZIP, validate that compiled assets correspond to source. One strategy is to run the build and verify that `git diff --exit-code` remains clean.

```
npx grunt amd
git diff --exit-code
```

If the build changes `amd/build`, somebody forgot to version the correct output.

This prevents a release containing old JavaScript even though the new source is present in the repository.

## 27.81 Release artefact

After generating the ZIP, publish it as a workflow artefact:

```mustache
- name: Upload plugin ZIP
  uses: actions/upload-artifact@v7
  with:
    name: mod_checkpoint-${{ github.ref_name }}
    path: build/mod_checkpoint.zip
```

An artefact is useful for review and download even before creating a GitHub Release.

## 27.82 Release workflow

A separate workflow can respond only to tags:

```
on:
  push:
    tags:
      - 'v*'
```

It should rebuild or repeat essential checks, verify that the tag and `version.php` agree, generate the ZIP, and publish the artefact.

Do not depend on "the PR CI was green three days ago" if the tag may have been created on another commit.

## 27.83 Release only from a green commit

An even stronger safeguard is to allow formal tags only on commits that have already passed mandatory checks.

This can be an organisational process rule or automation.

The goal is to prevent somebody from tagging an unreviewed local commit and bypassing the whole pipeline.

## 27.84 Changelog

A release should explain changes in a useful way for the person upgrading.

```
Added
- Custom completion rule for feedback received.

Fixed
- Group filtering in teacher report.
- PostgreSQL compatibility in response query.
```

Do not use only the raw commit list if commits are too implementation-specific for an administrator.

## 27.85 Database versioning and release

A change to `install.xml` for new installations normally also requires thinking about `upgrade.php` for existing installations and increasing `$plugin->version`.

CI can check savepoints, but the team needs to review semantically whether the schema change has an upgrade path.

This is an excellent pull-request checklist item.

## 27.86 A release branch does not replace a tag

A branch moves; a release tag should be immutable.

`MOODLE_500_STABLE` may receive dozens of commits after `v1.4.0`. Therefore do not tell users to "download the stable branch" when you want to provide a reproducible package.

Use an identifiable tag or release.

## 27.87 Dependency PRs

Composer, npm, or GitHub Actions updates should enter as separate PRs when possible.

That makes it clear whether a failure came from the dependency or a functional plugin change.

Dependabot automates exactly this kind of maintenance, but keeping changes separate remains useful for diagnosis.

## 27.88 Fast checks and expensive checks

A mature pipeline does not need to put everything into one sequential job.

You can have:

```
lint
unit-matrix
behat
upgrade
package
```

Lint fails quickly, the unit matrix covers compatibility, Behat tests journeys, upgrade protects migrations, and package validates delivery.

Independent jobs can also run in parallel.

## 27.89 `needs`

When one stage depends on another, use `needs`.

```
package:
  needs:
    - lint
    - unit-matrix
    - behat
```

This way the ZIP is created only after the relevant gates are green.

Do not create artificial dependencies between jobs that could run in parallel.

## 27.90 Separate lint job

Running PHPCS and validate once is enough. There is no need to repeat the same linters across eight database combinations when they do not depend on a database.

A better architecture separates:

```
lint             1 job
phpunit matrix   N jobs
behat            1 or 2 jobs
```

This reduces cost and feedback time.

## 27.91 PHPUnit matrix

PHPUnit is where a compatibility matrix delivers the most value because it runs quickly compared with a browser while still touching the database and real APIs.

If a query is not portable, PostgreSQL finds it. If the code accidentally uses a PHP 8.4 feature, the PHP 8.2 job finds it. If an API changed between 4.5 and 5.2, both jobs expose it.

This is the heart of CI for a Moodle plugin.

## 27.92 Non-blocking future job

A useful technique is periodically testing against Moodle's `main` branch to discover incompatibilities before the next release.

This job can initially be informational and not block merges because core development moves. When the new version is released and you promise support, it enters the mandatory matrix.

This reduces surprises in the upgrade month.

## 27.93 Scheduled CI

Dependencies and Moodle change even when your plugin receives no commits. A weekly or monthly workflow can detect external regressions.

```
on:
  schedule:
    - cron: '17 4 * * 1'
```

Choose a non-special minute to avoid common cron peaks at minute zero.

## 27.94 CI and secrets

Public pull requests should not receive production secrets. External integrations used in tests should have their own minimal-scope credentials or be mocked whenever possible.

If a job depends on a secret unavailable to forks, separate it from the basic checks that every contribution needs to be able to run.

Do not use `pull_request_target` merely to "solve" secret access while executing PR code.

## 27.95 Production is not a CI environment

Never configure the pipeline to test against a customer database, production bucket, or real destructive API.

CI must be disposable and reproducible. If the external integration has no sandbox, build a fake server, fixture, or replaceable adapter.

The pipeline should be able to run twenty times without causing twenty enrolments, twenty charges, or twenty real emails.

## 27.96 A complete pipeline for `mod_checkpoint`

One possible structure:

```mustache
name: Moodle Plugin CI

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 35

    strategy:
      fail-fast: false
      matrix:
        include:
          - moodle-branch: MOODLE_500_STABLE
            php: '8.2'
            database: pgsql
          - moodle-branch: MOODLE_500_STABLE
            php: '8.4'
            database: mariadb
          - moodle-branch: MOODLE_502_STABLE
            php: '8.3'
            database: mariadb
          - moodle-branch: MOODLE_502_STABLE
            php: '8.4'
            database: pgsql

    services:
      postgres:
        image: ${{ matrix.database == 'pgsql' && 'postgres:17' || '' }}
        env:
          POSTGRES_USER: postgres
          POSTGRES_HOST_AUTH_METHOD: trust
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 3

      mariadb:
        image: ${{ matrix.database == 'mariadb' && 'mariadb:11' || '' }}
        env:
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: '1'
          MYSQL_CHARACTER_SET_SERVER: utf8mb4
          MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v6
        with:
          path: plugin
          persist-credentials: false

      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          ini-values: max_input_vars=5000, opcache.enable_cli=1
          coverage: none

      - name: Static Moodle plugin validation
        uses: EduardoKrausME/moodle-plugin-validate@main
        with:
          plugin: ./plugin

      - name: Initialise Moodle Plugin CI
        run: |
          composer create-project -n --no-dev --prefer-dist moodlehq/moodle-plugin-ci ci ^4
          echo $(cd ci/bin; pwd) >> $GITHUB_PATH
          echo $(cd ci/vendor/bin; pwd) >> $GITHUB_PATH
          sudo locale-gen en_AU.UTF-8

      - name: Install
        run: moodle-plugin-ci install --plugin ./plugin --db-host=127.0.0.1
        env:
          DB: ${{ matrix.database }}
          MOODLE_BRANCH: ${{ matrix.moodle-branch }}

      - run: moodle-plugin-ci phplint
      - run: moodle-plugin-ci phpcs --max-warnings 0
      - run: moodle-plugin-ci phpdoc --max-warnings 0
      - run: moodle-plugin-ci validate
      - run: moodle-plugin-ci savepoints
      - run: moodle-plugin-ci mustache
      - run: moodle-plugin-ci grunt --max-lint-warnings 0
      - run: moodle-plugin-ci phpunit --fail-on-warning
```

This example can still be refined by separating linters from the matrix, but it already turns policy into executable code.

## 27.97 Adding Behat without multiplying cost

In the same job, add a condition:

```
- name: Behat
  id: behat
  if: >-
    matrix.moodle-branch == 'MOODLE_502_STABLE' &&
    matrix.php == '8.4' &&
    matrix.database == 'pgsql'
  run: moodle-plugin-ci behat --profile chrome --scss-deprecations
```

This keeps Behat protecting the main journey without quadrupling matrix execution time.

## 27.98 Separating lint from the matrix

On a larger project I prefer an independent `lint` job and another `phpunit` job with a matrix. This avoids running PHPCS four times.

The architecture can look like:

```
lint
  |
  +------ phpunit[4 combinations]
  |
  +------ behat
  |
  +------ upgrade
             |
             +------ package
```

The package appears only when all required gates are green.

## 27.99 Release checklist

Before publishing a tag, the project should be able to answer almost everything automatically:

```
version.php updated
upgrade.php coherent
PHPCS green
PHPDoc green
Moodle Plugin Validate green
Moodle Plugin CI validate green
Savepoints green
Mustache green
Grunt green
PHPUnit green
Behat green
upgrade test green
ZIP generated from a clean tree
ZIP reinstalled in a clean environment
```

The fewer items depend on "I remembered to run it", the more predictable the release.

## 27.100 Exercise - complete project pipeline

Take `mod_checkpoint` from the previous chapters and turn the repository into a project that does not allow broken code to merge.

Create `.gitignore`, define the branch strategy, and document which Moodle versions are supported. Add a `version.php` consistent with release `1.0.0` and create a test tag without publishing it yet.

Build a GitHub Actions workflow with a lint job running PHP lint, PHPCS, PHPDoc, Moodle Plugin Validate, Moodle Plugin CI `validate`, savepoints, Mustache, and Grunt. Then create a PHPUnit matrix with at least two Moodle versions, the lowest and highest supported PHP versions, and PostgreSQL/MariaDB. Add Behat on only one primary combination.

Create a second release workflow triggered by tags. It must check that tag `vX.Y.Z` matches `$plugin->release`, ensure the tree remains clean after the frontend build, generate `mod_checkpoint-X.Y.Z.zip`, list the ZIP contents, and publish it as an artefact.

Then deliberately introduce six failures: a PHP syntax error, a PHPCS warning, an incorrect savepoint, invalid Mustache, a broken PHPUnit test, and stale `amd/build`. In every case the pipeline must turn red for the correct reason.

Finally, create a change in `install.xml` accompanied by `upgrade.php`, install the previous tag, run an automated upgrade to the current commit, and confirm that old data remains valid. Once that works, the pipeline has stopped being decoration in the README and started genuinely protecting plugin maintenance.

## 27.101 Closing the chapter

Git organises plugin history, but CI turns that history into a verifiable process. Branches define maintenance lines, tags make releases reproducible, `version.php` controls upgrades, and the pipeline prevents a change from advancing without passing the rules the project chose to enforce.

The goal is not to run the largest possible number of tools. It is to choose checks representing real risks and put them in the right place. Lint should fail quickly, PHPUnit should cover Moodle, PHP, and database combinations, Behat should protect critical journeys, upgrade tests should prove migrations, and the final ZIP should be tested as the artefact that will actually be distributed.

From here, quality stops being something remembered at the end of development and becomes part of the normal flow of every commit.

## Technical references consulted

* KRAUS, Eduardo. Moodle Plugin Validate. Static validator for Moodle plugin structure, metadata, subplugins, language strings, Privacy API references, and selected code-quality checks. Available at: https://github.com/EduardoKrausME/moodle-plugin-validate. Accessed: 26 Sep. 2026.
* MOODLEHQ. Moodle Plugin CI. Documentation and GitHub Actions templates. Available at: https://github.com/moodlehq/moodle-plugin-ci. Accessed: 24 Sep. 2026.
* MOODLEHQ. Moodle Plugin CI. `gha.dist.yml`. Available at: https://github.com/moodlehq/moodle-plugin-ci/blob/main/gha.dist.yml. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. GitHub Actions integration. Available at: https://moodledev.io/general/development/tools/gha. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. NodeJS and Grunt. Available at: https://moodledev.io/general/development/tools/nodejs. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. PHP CodeSniffer. Available at: https://moodledev.io/general/development/tools/phpcs. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Plugin code prechecks. Available at: https://moodledev.io/general/community/plugincontribution/codeprechecks. Accessed: 24 Sep. 2026.
* MOODLE. Moodle Developer Resources. Moodle 4.5, 5.0, 5.1 and 5.2 release requirements. Available at: https://moodledev.io/general/releases. Accessed: 24 Sep. 2026.
* GITHUB. Workflow syntax for GitHub Actions. Available at: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax. Accessed: 24 Sep. 2026.
* GITHUB. Dependency caching. Available at: https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching. Accessed: 24 Sep. 2026.
* GITHUB. Workflow artifacts. Available at: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts. Accessed: 24 Sep. 2026.
* GITHUB. Secure use reference. Available at: https://docs.github.com/en/actions/reference/security/secure-use. Accessed: 24 Sep. 2026.
* GITHUB. Dependabot version updates. Available at: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates. Accessed: 24 Sep. 2026.

{% endraw %}
