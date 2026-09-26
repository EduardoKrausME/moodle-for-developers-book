{% raw %}

# 19 AUTHENTICATION PLUGINS

Authentication is one of those topics where an apparently simple word begins to mean different things as architecture grows. In a small Moodle site, authentication may simply mean receiving a username and password, comparing the password with a local hash, and creating a session. In a larger institution, the same word may include LDAP, an external database, OAuth 2, OpenID Connect, SAML, corporate login, a student portal, passwordless access links, and MFA, and if all of that is treated as merely a variation of `user_login()`, the plugin quickly becomes a tangle of responsibilities.

The first objective of this chapter is to separate those responsibilities. An `auth` plugin exists to participate in the process by which Moodle establishes a user's identity, but not every scenario commercially called "SSO" is simply an `auth` plugin receiving a username and password. There is a huge difference between Moodle receiving credentials and asking another system whether they are valid, the browser being redirected to an identity provider and returning with an assertion, and a CMS or student portal where the person is already authenticated generating a temporary link that lets that user enter Moodle without typing anything again.

We will work with an example called `auth_academicsso`, but without falling into the trap of turning every form of SSO into `auth_academicsso`. In some scenarios it genuinely is the correct component. In others, Moodle merely needs to receive proof of identity already established by another system and turn that proof into a local session safely. The distinction looks semantic until you begin dealing with passwords, logout, account creation, secret rotation, replay, redirects, and identity linking.

## 19.1 What is the Authentication API?

The Authentication API is the set of contracts Moodle uses to determine how a user's identity is proven. The plugin type is `auth`, and each method can implement completely different mechanisms, from local passwords to LDAP directories, external databases, or federated login.

The `auth_manual` component, for example, uses Moodle's local password infrastructure. `auth_db` queries an external source. `auth_oauth2` works with a flow in which the user is authenticated by an identity provider. All belong to the same plugin type because they participate in establishing identity, but their internal flows are quite different.

This is the first reason not to begin an authentication plugin by copying `user_login()` from an old example. Before writing any method, define where identity comes from and how proof of that identity reaches Moodle.

## 19.2 Authentication, authorization, and enrolment

Authentication answers who the user is. Authorization answers what that user may do. Enrolment answers which courses they participate in and which method controls that participation.

These three concerns meet during normal Moodle use but should not be merged into one implementation. A user can authenticate correctly and be enrolled in no courses. They can be enrolled and still lack a given capability. They can have a role in course context without an active enrolment, as discussed in the previous chapter.

Therefore, if an institution has an ERP that validates identity and also reports contracted courses, that does not mean the `auth` plugin should perform all enrolment synchronization during login. The same external system may be a data source for two different subsystems: `auth` for identity and `enrol` for course participation.

## 19.3 Structure of an `auth` plugin

Authentication plugins carry a lot of Moodle history. You will still find classic implementations whose main class lives in `auth.php`, while newer parts of core use namespaced classes under `classes/`. The project's minimum supported branch matters greatly here.

A traditional structure may be:

```
auth/academicsso/
    classes/
        client.php
        task/
            sync_users.php
    db/
        tasks.php
    lang/
        en/
            auth_academicsso.php
        pt_br/
            auth_academicsso.php
    auth.php
    settings.php
    version.php
```

The existence of historical files is not an invitation to repeat every old practice. New configuration should use the Admin settings API, new logic should live in autoloaded classes whenever possible, and `auth.php` should remain a small layer implementing contracts required by the plugin type.

## 19.4 `auth_plugin_base`

The historical base class for authentication methods is `auth_plugin_base`. It provides methods that tell Moodle what the method can do, how it authenticates, whether it can update users, whether passwords can be changed, whether passwords are local, whether external synchronization exists, and how several older Hooks behave.

A simple skeleton can begin like this:

```php
require_once($CFG->libdir . '/authlib.php');

class auth_plugin_academicsso extends auth_plugin_base {
    public function __construct() {
        $this->authtype = 'academicsso';
        $this->config = get_config('auth_academicsso');
    }
}
```

Do not override methods simply because they exist. Every override tells Moodle your plugin is taking responsibility for another part of the authentication lifecycle.

## 19.5 The constructor is not the place to authenticate

In the constructor, load configuration and prepare lightweight dependencies. Do not open a remote connection, test a token, perform an LDAP bind, or query an API simply because the object was instantiated.

```php
public function __construct() {
    $this->authtype = 'academicsso';
    $this->config = get_config('auth_academicsso');
}
```

Authentication objects can be created in flows that do not represent a login attempt. A remote call in the constructor makes simply loading the plugin depend on external infrastructure.

## 19.6 `user_login()`

In the classic username/password model, `user_login()` receives the entered credential and answers whether that combination is valid.

```php
public function user_login($username, $password) {
    $client = new \auth_academicsso\client($this->config);
    return $client->validate_credentials($username, $password);
}
```

This is what I call credential-delegated authentication in this chapter. Moodle receives username and password but, instead of validating a local hash, asks another source whether the credential is valid.

The password exists in clear text at that moment and must be treated as extremely sensitive data. Do not log it, serialize it, store it in a task, put it in an exception, or save it in a temporary table.

## 19.7 An external `auth` based on password

Imagine a university where the official learner password is maintained by an academic service. The learner opens `/login/index.php`, enters username and password, and Moodle calls `auth_academicsso`.

Conceptually the flow is:

```
Usuário
  |
  | usuário + senha
  v
Moodle
  |
  | valida credencial
  v
Serviço institucional
  |
  +-- válida   -> Moodle continua o login
  +-- inválida -> Moodle nega o login
```

Here an `auth` plugin makes complete sense. The credential reaches Moodle and the authentication method decides whether it is valid.

## 19.8 Do not perform the entire institutional integration inside `user_login()`

The service may also return name, email, course, financial plan, class, scholarship, and twenty other fields. That does not mean login should process all of them.

Basic profile fields may be synchronized because we are still dealing with identity. Enrolment belongs to the Enrolment API. Financial updates may queue a task or integrate another component. Certificate issuance certainly should not happen because somebody typed a password.

The smaller the synchronous login portion is, the fewer systems can prevent a user from signing in.

## 19.9 An external user still has a local record

Even when authentication occurs outside Moodle, there is normally a record in `{user}`. The platform needs a local `userid` for messages, grades, logs, preferences, files, submissions, context, and nearly everything else.

Therefore, "external user" means authority over identity or password lives outside Moodle, not that Moodle operates without a local user.

## 19.10 `is_internal()`

An external plugin normally reports it does not use internal authentication:

```
public function is_internal() {
    return false;
}
```

This helps Moodle understand that the credential does not belong to the standard local mechanism.

## 19.11 `prevent_local_passwords()`

When the password should exist only in the external system, the plugin can also prevent a functional local password from being maintained:

```
public function prevent_local_passwords() {
    return true;
}
```

This is especially important in SSO and corporate authentication. There is little value in requiring MFA and strong-password policy at the provider if a parallel Moodle password can bypass the external flow.

## 19.12 Never copy the external password into Moodle

If the external backend owns the credential, validate it there. Do not copy the clear-text password, do not copy a proprietary hash into a local column, and do not try to synchronize password as though it were a profile attribute.

A password is not a name, email, or department field. It is an authentication secret and must remain under the mechanism responsible for validating it.

## 19.13 Local hashes

When the method genuinely is internal, use Moodle's password infrastructure. Do not implement MD5, simple SHA, or a parallel password column.

Moodle has services responsible for checking and upgrading hashes, including allowing algorithms to evolve over time. A plugin that invents its own password format creates unnecessary security debt.

## 19.14 `get_userinfo()`

External plugins may fetch profile data from the source:

```php
public function get_userinfo($username) {
    $client = new \auth_academicsso\client($this->config);
    $profile = $client->get_profile($username);

    if (!$profile) {
        return false;
    }

    return [
        'firstname' => $profile->firstname,
        'lastname' => $profile->lastname,
        'email' => $profile->email,
        'idnumber' => $profile->idnumber,
    ];
}
```

Map fields explicitly. Do not automatically copy an entire JSON response into the user object.

## 19.15 Profile synchronization

An external identity source may control first name, surname, email, institution, department, and academic identifier. For each field, define authority.

If the ERP provides the official name, perhaps the user should not edit it locally. If the ERP leaves phone empty, Moodle may allow local editing. The hard part is not saving the value but deciding which change wins when both sides differ.

## 19.16 SSO can mean completely different things

There is confusion here that needs to be resolved before continuing. The acronym SSO is often used for any situation where a user does not type their password twice, but architecturally we may have very different flows.

In the first, Moodle still receives username and password and delegates validation to another system. That remains the classic credential-based `auth` scenario.

In the second, the browser is redirected to an identity provider such as an OIDC or SAML IdP. The provider authenticates the user and returns an assertion or code Moodle needs to validate.

In the third, there is a CMS, academic portal, or student area where the person is already authenticated. That system wants to display an "Access Moodle" button taking the learner directly to a course while already logged in. In that case there is no new password for Moodle to validate. The problem is transferring trust from one application to another and creating a Moodle session based on trustworthy temporary proof.

Mixing these three scenarios inside the same explanation of `user_login()` only confuses the reader.

## 19.17 SSO with username and password is still delegated authentication

If a learner types a username and password on the Moodle page and the plugin asks an external service to answer `true` or `false`, we are clearly inside the traditional `auth` contract.

```
/login/index.php
      |
      | username + password
      v
auth_academicsso
      |
      v
API institucional
```

Moodle received the credential and delegated validation. `user_login()` is central to this flow.

## 19.18 Federated SSO with OIDC or SAML

In federated authentication, Moodle normally does not receive the user's password. The browser goes through the identity provider and Moodle validates a cryptographically protected response.

```
Moodle -> IdP -> autenticação -> callback Moodle
```

Moodle needs to validate `state`, `nonce`, issuer, audience, signature, expiry, and the other elements of the relevant protocol. This is why implementing OIDC manually because "it's just decoding a JWT" is a bad idea.

When a maintained implementation exists for the protocol and Moodle version you need, prefer it over inventing your own SSO.

## 19.19 "But Kraus, I already have a student portal. I only want a link that enters Moodle already logged in"

That is a different problem.

Imagine an institution has a CMS or student portal called Academic Portal. The learner already signed in there, the application knows exactly who that person is, and there is a button:

```
Acessar ambiente de aprendizagem
```

When clicked, the institution wants to send the user to:

```
/course/view.php?id=42
```

with the Moodle session already created.

There is no reason to request the password again, and the CMS should not send the learner's password to Moodle hidden in a POST either. The external system already authenticated that person. What Moodle needs is short-lived proof that a trusted application asserts that this user is who it says they are.

I would not model this as "the auth plugin validates the learner's password" because there is no learner password being validated at that moment. It is an authentication handoff, a controlled transfer of trust between systems to establish a Moodle session.

## 19.20 This is not `user_login()`

This is the point I want to make explicit.

If the CMS calls a Moodle API to generate a one-time link and then redirects the browser to that link, there is no reason to implement:

```php
public function user_login($username, $password) {
    // ...
}
```

because that method answers a different question.

The CMS already has an authenticated session. What we need now is to validate a system credential or signature, securely identify the corresponding Moodle user, issue short-lived proof of login, consume that proof once, and only then ask Moodle to establish the local session.

## 19.21 Correct flow for a one-time access link

A common design looks like this:

```
1. Aluno está autenticado no CMS

2. CMS chama um Web Service servidor-servidor do Moodle
   usando credencial técnica própria

3. CMS informa o identificador institucional do aluno
   e, opcionalmente, o destino dentro do Moodle

4. Moodle valida a aplicação chamadora

5. Moodle resolve o usuário local

6. Moodle gera uma chave aleatória de uso único
   com expiração muito curta

7. Moodle devolve uma URL temporária

8. CMS redireciona o navegador para essa URL

9. Moodle consome a chave

10. Moodle cria a sessão com complete_user_login()

11. A chave é destruída

12. Moodle redireciona para o destino permitido
```

The learner's password never crosses this integration.

## 19.22 Do not put `userid` or email in a URL and call it SSO

This would be absurd:

```
https://moodle.exemplo.com/loginexterno.php?userid=438
```

Anyone could replace `438` with another ID.

This is not much better:

```
?email=aluno@example.com&secret=MINHA_CHAVE_GLOBAL
```

because a static key in a URL ends up in browser history, proxies, analytics, server logs, and screenshots.

The token needs to be unpredictable, short-lived, single-use, and issued only after the external server has authenticated itself through its own secure channel.

## 19.23 The CMS identity is not the learner identity

This is an important distinction. The server-to-server call is authenticated as the CMS application. It proves that an authorized application is requesting login for a particular user.

The browser later presents the temporary key. That key represents limited authorization to establish a session as the requested user.

Do not use an administrative Web Service token directly in the browser as though it were the learner's token. The technical token has another scope and, if leaked, may have enormous impact.

## 19.24 One-time token

A login key must be random, unpredictable, short-lived, and invalidated immediately after use.

It may be stored so Moodle can associate it with:

```
userid
expires
used
allowed destination
issuer/client
```

Depending on the design it may also carry an IP restriction or transaction identifier. What cannot happen is for a URL to remain valid for hours and be shareable with another person.

## 19.25 Why single use matters

Imagine somebody copies the URL from browser history or a proxy log. If the token remains valid after the first access, it has become a reusable temporary password.

When consuming the key, invalidate it before or within the same atomic operation that authorizes login. Two simultaneous requests should not both be able to use the same proof.

## 19.26 Short expiry

A login token does not need to last a day. The CMS just requested the link and will redirect the user immediately.

Sixty seconds, a few minutes, or another short window appropriate to the environment normally makes much more sense than a long-lived credential.

If the user opens the URL after expiry, generate another one instead of extending the original indefinitely.

## 19.27 Destination after login

The CMS may want to send the user to a course, activity, or Dashboard. This may be represented by a `wantsurl`, but the destination needs validation.

Do not accept an arbitrary external URL and then call `redirect($wantsurl)`. A login endpoint with an open redirect is especially valuable for phishing because the flow begins on a trusted domain.

I prefer accepting only validated local URLs or, even better, known destination types such as `courseid` and `cmid` and letting Moodle build the final URL.

## 19.28 Where should this mechanism live?

There is an important nuance here. Conceptually this flow is not the same as an `auth` method validating username and password. It is a session bridge between applications.

Technically, implementations exist that put this mechanism inside an `auth` plugin because the final endpoint establishes a Moodle identity and the plugin type participates naturally in login. The well-known `auth_userkey`, for example, follows exactly this idea: request a temporary login URL for a user and consume a one-time key.

Therefore I would not write that "this can never be auth" because that would be technically false. The correct point is different: do not model this case as `user_login()` based on username/password. Model it as delegated login through a one-time token or federated protocol and choose the Moodle component offering the most coherent contract.

## 19.29 When I would put this outside an `auth`

In a custom institutional project, a `local` or another integration component might expose a Web Service issuing temporary authorization and a dedicated endpoint consuming it.

That endpoint could validate the key, locate the user, and use Moodle's session API, including `complete_user_login()`, to establish the session.

But this freedom increases responsibility. You need to correctly implement token generation, storage, single use, expiry, replay protection, destination validation, logout, and auditing. Creating an `local_sso.php` with `complete_user_login($user)` after comparing a fixed secret in the query string is not architecture; it is a vulnerability with a nice name.

## 19.30 When a specific `auth` can still make sense

If the component's whole purpose is establishing identities through that SSO mechanism and you want it to appear and behave as a Moodle authentication method, `auth` may be perfectly appropriate.

The `auth_userkey` example demonstrates this in practice. Traditional `user_login()` returns `false` because login is not password-based; specific logic consumes a key, locates the user, and calls `complete_user_login()`.

The lesson is not to choose a directory by dogma. It is to model the flow correctly.

## 19.31 A trusted CMS does not mean a trusted browser

The CMS and Moodle may communicate through an authenticated server-to-server channel, but afterward the URL passes through the user's browser.

Everything in that URL may be copied, stored in history, sent through chat, or recorded by intermediary infrastructure. That is why the key must have minimal scope.

Trust belongs in token issuance, not in the fact that somebody clicked a link from a visually familiar page.

## 19.32 Web Service for issuing the URL

A design I like is for the CMS never to know how the key is constructed. It calls an External Function conceptually similar to:

```
auth_sso_request_login_url
```

It sends a stable learner identifier and logical destination. Moodle validates the calling application through a Web Service token with a specific capability and returns a disposable URL.

The technical Web Service key remains in the CMS backend and never reaches browser JavaScript.

## 19.33 Capability for login issuance

Generating a URL that allows somebody to log in as another user is an extremely powerful operation. The technical Web Service user needs a specific, limited, auditable capability.

Do not use a site-administrator token merely because it is easier. If the credential leaks, the attacker would gain much more power than required to issue logins.

## 19.34 User mapping

The external system needs to identify the person, but the mapping field must be stable and appropriate.

Email addresses can change and, in some institutions, may even be reused. Usernames may follow conventions that change over time. `idnumber` or a dedicated institutional identifier is normally more predictable when governed properly.

Ideally there is an immutable external identity identifier with an explicit relationship to Moodle `userid`.

## 19.35 Do not automatically change the user's authentication method

Another trap is assuming that because a user entered once through a temporary link, their `auth` column must change to the user-key mechanism.

That depends on architecture. The user may continue being `manual`, `oauth2`, `ldap`, or another method while receiving one specific delegated access from a trusted application.

If the implementation chooses to change `auth`, it must understand the impact on local passwords, account recovery, and subsequent logins. Historical discussions around user-key implementations exist precisely because of this kind of side effect.

## 19.36 Logout between CMS and Moodle

If the user entered Moodle from the CMS, what happens when they log out of one system?

Several policies are possible: local logout only in Moodle, portal logout that also ends the Moodle session, global logout from the IdP, or simply independent session expiry.

The important point is not to promise "single sign-on" and automatically assume "single logout." They are different problems and federated protocols treat logout as a separate concern.

## 19.37 Automatic account creation

Some SSO flows need to create the local user on first access. That may be acceptable, but creation should happen only after external identity has been validated.

Do not accept profile data supplied by the browser as sufficient proof. If the CMS needs to create a user, data should arrive through the authenticated server-to-server channel or be obtained from a trusted source.

## 19.38 Automatic account updates

The same applies to updates. Name, email, and other fields may be refreshed during link issuance, but only if the CMS genuinely is authoritative for those values.

Do not turn session issuance into an `update_record()` of everything appearing in the payload. Separate identity, trusted attributes, and local preferences.

## 19.39 `complete_user_login()`

After Moodle has definitively validated identity or login proof, `complete_user_login()` is the central infrastructure that completes login for that user and prepares the session.

Do not reproduce its behavior manually by assigning `$USER` and writing cookies yourself.

```php
$user = get_complete_user_data('id', $userid);
complete_user_login($user);
```

This call may only happen after the entire authentication flow has been completed securely.

## 19.40 `get_userinfo()` and local creation

Returning to traditional `auth` plugins, `get_userinfo()` can synchronize attributes after identity is validated. This remains useful in external-password authentication and some federated flows.

The important point is not to confuse profile data returned by the provider with authorization. If the payload says `admin=true`, that should not automatically turn somebody into a Moodle administrator.

## 19.41 Locked fields

When a field belongs to the external system, the plugin can prevent local editing or only allow local editing when the source does not provide a value.

This prevents the annoying loop where a user changes their name in Moodle, sees it saved, and on next login the ERP overwrites it again.

The interface should reflect who truly has authority over every attribute.

## 19.42 `is_synchronised_with_external()`

A plugin can report that account data is synchronized with the external source:

```
public function is_synchronised_with_external() {
    return true;
}
```

This does not turn login into a complete synchronization job. It simply indicates particular user information originates externally.

## 19.43 Scheduled Tasks for synchronization

When an institution needs to create, update, or suspend accounts even without recent login, use a Scheduled Task.

```php
namespace auth_academicsso\task;

class sync_users extends \core\task\scheduled_task {
    public function get_name(): string {
        return get_string('tasksyncusers', 'auth_academicsso');
    }

    public function execute(): void {
        $manager = new \auth_academicsso\sync\manager();
        $manager->run();
    }
}
```

The task should work in batches, be idempotent, and record progress, following the principles from Chapter 11.

## 19.44 User removed from the source

When an account disappears from the external directory, policy needs to be explicit. Suspension is often safer than deletion because the user may have grades, messages, logs, and submissions that must remain.

"Not returned by the query" is also not automatically synonymous with "definitively removed." An integration failure can produce the same absence.

## 19.45 `user_exists()`

`user_exists()` lets the plugin ask whether an identity exists in the external backend without authenticating:

```php
public function user_exists($username) {
    return $this->client()->user_exists($username);
}
```

Existence and valid credentials are different questions, so do not mix the two operations.

## 19.46 `user_update()`

Some plugins allow changes from Moodle to be sent back to the source. Implement this only when Moodle genuinely has authority to write to that system.

If the ERP is the master source, `user_update()` may be conceptually wrong even if the external API accepts the call.

## 19.47 Password change

`can_change_password()` reports whether the method allows password changes. In SSO and OAuth 2 scenarios Moodle should normally return `false` and direct the user to the portal that owns the credential.

```
public function can_change_password() {
    return false;
}
```

Where external password changes are genuinely supported, `user_update_password()` can forward the new password, always without logging or storing clear text.

## 19.48 `change_password_url()`

If password is managed outside Moodle, return the appropriate URL so the user reaches the correct system.

That address may be configurable, but it needs validation and must not turn the feature into an arbitrary redirect.

## 19.49 Password recovery

If Moodle does not control the password, it should not claim it can recover it either. `can_reset_password()` and related mechanisms need to reflect real authority.

An OAuth user should reset the credential at the IdP, not on a Moodle screen that does not own the secret.

## 19.50 Registration and confirmation

Some methods allow self-registration and confirmation. In integrated academic environments the account usually originates in the institutional system and Moodle merely creates its local representation when required.

Do not enable external self-registration merely because the API has a method for it. Institutional identity policy comes first.

## 19.51 `can_be_manually_set()`

If a method depends on external identifiers and special configuration, it may not be safe to let an administrator simply switch any account to that `auth` manually.

The plugin should report whether it can genuinely support that transition without locking the user out.

## 19.52 Historical login Hooks

`auth_plugin_base` exposes historical Hooks such as `pre_loginpage_hook()`, `loginpage_hook()`, `pre_user_login_hook()`, and `user_authenticated_hook()`.

They exist and may be necessary, but they should not become a kind of global authentication `lib.php`. Use each only when it represents the correct point in the flow and keep heavy work outside the login request.

## 19.53 Identity providers on the login screen

To display buttons such as "Sign in with Google" or "Sign in with institutional account", the plugin can expose identity providers for the login page.

This is better than injecting HTML directly into a theme template because Moodle retains control of layout and the plugin only describes the authentication option.

## 19.54 `wantsurl`

`wantsurl` represents the intended destination after login. Validate that destination in every SSO flow.

This matters particularly in CMS-to-Moodle scenarios because a legitimate login URL that then redirects to a malicious domain can be used for phishing. There have even been recent discussions in user-key implementations about open redirects when `wantsurl` accepts external destinations.

## 19.55 OAuth 2

OAuth 2 itself is an authorization framework, while OpenID Connect adds the identity layer normally used for federated login.

In Moodle, the OAuth 2 flow demonstrates the architecture where the password is not given to Moodle. The browser goes through the provider, Moodle validates the response, and links the external identity to a local account.

Do not copy the access token into the session as a substitute for `$USER`. The external token and Moodle session serve different purposes.

## 19.56 LDAP

LDAP remains a classic external-authentication example. The plugin may validate credentials, synchronize attributes, create local accounts, and process removed users.

This type of integration also demonstrates the importance of timeouts, TLS, correct filters, and asynchronous synchronization. Slow LDAP binds at multiple points in login can quickly degrade availability.

## 19.57 External database

`auth_db` represents another classic model. Identity exists in an external table and Moodle queries that source.

Even here, use parameterized queries and correctly handle encoding, connection, and password policy. A table being on an internal network does not eliminate SQL Injection or credential leakage.

## 19.58 MFA is not an `auth` plugin

MFA is another layer. It does not answer which backend authenticates the account but requires additional proof after or during the primary authentication flow.

Modern Moodle has its own MFA infrastructure using `tool_mfa` and factor plugins. Therefore, if the requirement is TOTP, email, security key, or a contextual rule, creating `auth_meumfa` is conceptually wrong.

A user may authenticate through `auth_academicsso` and then be challenged by Moodle MFA.

## 19.59 MFA does not fix an insecure first factor

Adding a second factor does not compensate for reusable tokens, exposed secrets, open redirects, missing TLS, or incorrect identity linking.

Every layer needs to be secure on its own.

## 19.60 Stable external identifier

Avoid depending only on email for account linking. Email changes and may be reused.

When the provider offers an immutable subject or the institution has a stable academic ID, use that identifier in the relationship between systems.

## 19.61 Account linking

Associating an external identity with an existing account is sensitive. Do not link automatically merely because email matches unless institutional policy guarantees that equivalence.

A wrong association exposes academic history, grades, and personal data to the wrong person.

## 19.62 Moodle session

After identity has been proven, Moodle creates its own session. Do not replace this with a plugin-specific cookie.

In token-based SSO, the token exists only to safely reach the point where `complete_user_login()` can be called. After that the Moodle session takes over normal processing.

## 19.63 Login-form token is not an SSO token

Moodle's login form has its own protections and a `logintoken` used in that page flow. This is not a generic credential for a CMS to authenticate users externally.

Do not repurpose the form's CSRF/login token as an integration key between systems. They address completely different threats and lifecycles.

## 19.64 TLS

Every external authentication flow must use TLS with correct certificate validation.

Disabling `SSL_VERIFYPEER` to "fix" an internal certificate creates interception risk exactly on the channel carrying credentials or authentication assertions.

## 19.65 Timeout

An unavailable identity service cannot hold all PHP workers indefinitely.

Define connection and overall timeouts, distinguish credential failure from infrastructure failure, and do not retry aggressively in the critical login path.

## 19.66 Public message and technical log

The user needs to know login failed but does not need to see LDAP hostnames, stack traces, invalid client secrets, or JWT internals.

Keep public messages controlled and record technical diagnostics safely, without passwords, tokens, or secrets.

## 19.67 `settings.php`

New code should use the Admin settings API. Older `config.html` mechanisms and historical configuration callbacks survive in legacy code but are not a good starting point.

Configuration may contain endpoints, client ID, password URL, expiry time, synchronization mode, and other options, always with appropriate administrative access.

## 19.68 Secrets

Client secrets, bind passwords, CMS technical tokens, and signing keys need their own lifecycle.

Do not place them in Git, logs, JavaScript, or URLs. Plan rotation and limit privileges of technical credentials to the minimum required.

## 19.69 Roles coming from the IdP

If the IdP returns `role=admin`, do not automatically turn that into Moodle administrator.

Mappings from external groups or attributes into local roles need to be explicit, limited, and auditable. The source being authenticated does not mean every value received should control unrestricted authorization.

## 19.70 Login performance

The login path is critical. Minimize calls, avoid repeated queries, and reuse data obtained during the same request.

If the authentication response already provided name and email, do not immediately call another API simply to fetch the same fields in `get_userinfo()`.

## 19.71 Separate external client

Do not spread HTTP code throughout `auth.php`.

```php
namespace auth_academicsso;

class client {
    public function __construct(private \stdClass $config) {
    }

    public function authenticate(string $username, string $password): array|false {
        $curl = new \curl();

        $response = $curl->post(
            $this->config->endpoint . '/login',
            [
                'username' => $username,
                'password' => $password,
            ],
            [
                'CURLOPT_CONNECTTIMEOUT' => 3,
                'CURLOPT_TIMEOUT' => 8,
            ],
        );

        if ($curl->get_errno()) {
            return false;
        }

        $data = json_decode($response, true);
        return !empty($data['authenticated']) ? $data : false;
    }
}
```

In production, handle HTTP status, invalid JSON, TLS, observability, and specific failures.

## 19.72 Reusing login data

When authentication already returned profile data, a request-local static cache can avoid a second call:

```php
private static ?array $userinfo = null;

public function user_login($username, $password) {
    $result = $this->client()->authenticate($username, $password);

    if (!$result) {
        return false;
    }

    self::$userinfo = $result['profile'] ?? [];
    return true;
}

public function get_userinfo($username) {
    return self::$userinfo ?: false;
}
```

This is not storing credentials. It only reuses information within the same request.

## 19.73 Complete CMS-to-Moodle flow

For the student-portal scenario, I would design:

```
Aluno autentica no CMS
        |
        v
CMS conhece externaluserid
        |
        | Web Service servidor-servidor
        v
Moodle valida o CMS
        |
        v
Moodle resolve userid local
        |
        v
Moodle gera token one-time de vida curta
        |
        v
CMS recebe URL de login
        |
        v
Navegador abre a URL
        |
        v
Moodle consome token
        |
        v
complete_user_login($user)
        |
        v
redirect para curso/atividade
```

This flow does not require the CMS to know the learner's Moodle password and does not require Moodle to receive the password used in the CMS.

## 19.74 Complete `auth` flow with external password

The other scenario remains different:

```
Aluno abre Moodle
        |
        v
Digita username/password
        |
        v
auth_academicsso
        |
        v
Serviço externo valida credencial
        |
        v
Moodle estabelece sessão
```

Both may be called SSO in commercial conversation, but they are different architectures and deserve different implementations.

## 19.75 What should not live in an `auth` plugin

Do not put enrolment, payment, certificates, grades, completion, or heavy processing into the authentication method merely because it runs early in the flow.

If the requirement is to react to login, use an event. If it is maintaining courses, use the Enrolment API. If it is heavy work, use a Task. If it is creating a session from proof emitted by a CMS, design a secure handoff rather than pretending a password exists to be validated.

## 19.76 Checklist

Before considering authentication complete, clearly answer who the identity source is, where the password is validated, whether Moodle keeps a local password, how users are mapped, what happens when the external account is disabled, who controls each profile field, what the logout policy is, how MFA participates, and how external failures affect availability.

If there is a CMS or student portal, add more questions: who may issue login links, how long the key lives, how single use is guaranteed, which field identifies the user, which destinations are allowed, how replay is blocked, and what happens when the same link is opened twice.

## 19.77 Exercise - two different SSOs

Implement two distinct proofs of concept.

In the first, create `auth_academicsso` to validate username and password against an institutional API. Moodle must not store a local password, must synchronize first name, surname, email, and `idnumber`, and password changes must point to the external portal. A Scheduled Task should update inactive users without enrolling them in courses.

In the second, imagine the Academic Portal already has the learner authenticated. Create a server-to-server service receiving an institutional identifier, validating the calling application's capability, and generating a random, single-use, short-lived login token. The token may carry only one validated local Moodle destination. The browser accesses the consumption endpoint, the key is invalidated, and only then is the session established with `complete_user_login()`.

Test replay of the same token, an expired token, nonexistent user, external destination, two simultaneous requests, a CMS without permission, and a Moodle user already logged in as someone else. This second exercise must never request or know the learner's password.

Then explain in writing why both mechanisms can be called SSO, but only the first is a classic `user_login()` while the second is a session handoff based on trust between systems.

## Technical references consulted

* Moodle PHP Documentation. `auth_plugin_base` and core authentication infrastructure. https://phpdoc.moodledev.io/
* Moodle core source. `public/lib/authlib.php`, `public/auth/manual/auth.php`, `public/auth/db/auth.php`, and `public/auth/oauth2/`. https://github.com/moodle/moodle/
* Moodle Developer Resources. Moodle 4.3 release notes and core Multi-factor Authentication. https://moodledev.io/general/releases/4.3
* Catalyst IT. User key authentication plugin. Implementation of one-time login URLs between an external application and Moodle. https://github.com/catalyst/moodle-auth_userkey

{% endraw %}