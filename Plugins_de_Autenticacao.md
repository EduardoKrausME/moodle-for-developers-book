# PLUGINS DE AUTENTICAÇÃO

Autenticação é um daqueles assuntos em que uma palavra aparentemente simples começa a significar coisas diferentes conforme a arquitetura cresce. Em um Moodle pequeno, autenticar pode significar apenas receber usuário e senha, comparar a senha com um hash local e criar a sessão. Em uma instituição maior, a mesma palavra passa a englobar LDAP, banco externo, OAuth 2, OpenID Connect, SAML, login corporativo, área do aluno, portal acadêmico, links de acesso sem senha e MFA, e se tudo isso for tratado como se fosse apenas uma variação de `user_login()`, o plugin rapidamente vira um emaranhado de responsabilidades.

O primeiro objetivo deste capítulo é separar essas responsabilidades. Um plugin `auth` existe para participar do processo pelo qual o Moodle estabelece a identidade do usuário, mas nem todo cenário chamado comercialmente de "SSO" é simplesmente um plugin `auth` que recebe usuário e senha. Existe uma diferença enorme entre o Moodle receber uma credencial e perguntar a outro sistema se ela é válida, o navegador ser redirecionado para um provedor de identidade e voltar com uma asserção, e um CMS ou área do aluno já autenticado gerar um link temporário que permite ao usuário entrar no Moodle sem digitar nada novamente.

Vamos trabalhar com um exemplo chamado `auth_academicsso`, mas sem cair na armadilha de transformar todo tipo de SSO em `auth_academicsso`. Em alguns cenários ele será realmente o componente correto. Em outros, o Moodle apenas precisa receber uma prova de identidade já estabelecida por outro sistema e transformar essa prova em uma sessão local de forma segura. A diferença parece semântica até começar a lidar com senha, logout, criação de conta, rotação de segredo, replay, redirect e vínculo entre identidades.

## O que é a Authentication API

A Authentication API é o conjunto de contratos usados pelo Moodle para determinar como a identidade de um usuário é comprovada. O tipo de plugin é `auth`, e cada método pode implementar mecanismos completamente diferentes, desde senha local até diretório LDAP, banco externo ou login federado.

O componente `auth_manual`, por exemplo, utiliza a infraestrutura local de senha do Moodle. `auth_db` consulta uma fonte externa. `auth_oauth2` trabalha com um fluxo no qual o usuário é autenticado por um provedor de identidade. Todos pertencem ao mesmo plugin type porque participam do estabelecimento da identidade, mas os fluxos internos são bastante diferentes.

Essa é a primeira razão para não começar um plugin de autenticação copiando `user_login()` de algum exemplo antigo. Antes de escrever qualquer método, defina de onde vem a identidade e como a prova dessa identidade chega ao Moodle.

## Autenticação, autorização e matrícula

Autenticação responde quem é o usuário. Autorização responde o que ele pode fazer. Matrícula responde em quais cursos ele participa e por qual método essa participação é controlada.

Essas três coisas se encontram durante o uso do Moodle, mas não devem ser fundidas em uma única implementação. Um usuário pode autenticar corretamente e não estar matriculado em curso algum. Pode estar matriculado e ainda não ter determinada capability. Pode ter um papel no contexto do curso e não possuir uma matrícula ativa, como discutimos no capítulo anterior.

Por isso, se a instituição possui um ERP que valida a identidade e também informa cursos contratados, isso não significa que o plugin `auth` deva executar toda a sincronização de matrícula no login. O mesmo sistema externo pode ser fonte de dados para dois subsistemas diferentes, `auth` para identidade e `enrol` para participação em cursos.

## Estrutura de um plugin `auth`

Os plugins de autenticação carregam bastante história do Moodle. No Moodle 3.5 você ainda encontra implementações clássicas cuja classe principal fica em `auth.php`, enquanto outras responsabilidades podem ser organizadas em classes namespaced dentro de `classes/`. O importante é respeitar o contrato específico do tipo `auth` usado por essa versão.

Uma estrutura tradicional pode ser:

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

O fato de existirem arquivos históricos não é convite para repetir toda prática antiga. Configuração nova deve utilizar Admin settings API, lógica nova deve ir para classes autoloaded sempre que possível e `auth.php` deve permanecer uma camada pequena que implementa os contratos exigidos pelo tipo.

## `auth_plugin_base`

A classe base histórica dos métodos de autenticação é `auth_plugin_base`. Ela oferece métodos que informam ao Moodle quais capacidades aquele método possui, como ele autentica, se pode atualizar usuários, se pode trocar senha, se a senha é local, se há sincronização externa e como determinados callbacks de autenticação devem se comportar.

Um esqueleto simples pode começar assim:

```php
require_once($CFG->libdir . '/authlib.php');

class auth_plugin_academicsso extends auth_plugin_base {
    public function __construct() {
        $this->authtype = 'academicsso';
        $this->config = get_config('auth_academicsso');
    }
}
```

Não sobrescreva métodos apenas porque eles existem. Cada override diz ao Moodle que seu plugin assume responsabilidade por uma parte adicional do ciclo de autenticação.

## O construtor não é lugar para autenticar

No construtor, carregue configuração e prepare dependências leves. Não abra conexão remota, não teste token, não faça LDAP bind e não consulte API apenas porque o objeto foi instanciado.

```php
public function __construct() {
    $this->authtype = 'academicsso';
    $this->config = get_config('auth_academicsso');
}
```

Objetos de autenticação podem ser instanciados em fluxos que não representam uma tentativa de login. Uma chamada remota no construtor transforma simplesmente carregar o plugin em depender de infraestrutura externa.

## `user_login()`

No modelo clássico baseado em usuário e senha, `user_login()` recebe a credencial digitada e responde se aquela combinação é válida.

```php
public function user_login($username, $password) {
    $client = new \auth_academicsso\client($this->config);
    return $client->validate_credentials($username, $password);
}
```

É isso que eu chamo neste capítulo de autenticação delegada por credencial. O Moodle recebe o usuário e a senha, mas em vez de validar o hash local, pergunta a outra fonte se a credencial é válida.

A senha está em texto claro naquele momento do fluxo e deve ser tratada como dado extremamente sensível. Não registre em log, não serialize, não grave em task, não coloque em exception e não salve em tabela temporária.

## Um `auth` externo baseado em senha

Imagine uma universidade em que a senha oficial do aluno é mantida por um serviço acadêmico. O aluno abre `/login/index.php`, digita usuário e senha e o Moodle chama `auth_academicsso`.

O fluxo conceitual é:

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

Aqui o plugin `auth` faz total sentido. A credencial entra no Moodle e o método de autenticação decide se ela é válida.

## Não faça a integração institucional inteira em `user_login()`

O serviço pode devolver também nome, email, curso, plano financeiro, turma, bolsa e vinte outros campos. Isso não significa que o login deveria executar tudo.

Perfil básico pode ser sincronizado porque ainda estamos trabalhando com identidade. Matrícula deve ir para Enrolment API. Atualização financeira pode gerar uma task ou integrar outro componente. Emissão de certificado definitivamente não deveria ocorrer porque alguém digitou a senha.

Quanto menor for a parte síncrona do login, menor o número de sistemas que podem impedir o usuário de entrar.

## Usuário externo continua tendo registro local

Mesmo quando a autenticação acontece fora do Moodle, normalmente existe um registro em `{user}`. A plataforma precisa de `userid` local para mensagens, notas, logs, preferências, arquivos, submissões, contexto e praticamente todo o restante.

Portanto, "usuário externo" significa que a autoridade sobre identidade ou senha está fora do Moodle, não que o Moodle navega sem um usuário local.

## `is_internal()`

Um plugin externo normalmente informa que não utiliza autenticação interna:

```
public function is_internal() {
    return false;
}
```

Isso ajuda o Moodle a entender que a credencial não pertence ao mecanismo local padrão.

## `prevent_local_passwords()`

Quando a senha deve existir apenas no sistema externo, o plugin também pode impedir que uma senha local funcional seja mantida:

```
public function prevent_local_passwords() {
    return true;
}
```

Essa decisão é especialmente importante em SSO e autenticação corporativa. Não adianta exigir MFA e política de senha forte no provedor se existe uma senha Moodle paralela que contorna o fluxo externo.

## Nunca copie a senha externa para o Moodle

Se o backend é a fonte da credencial, valide lá. Não copie a senha em texto puro, não copie um hash proprietário para uma coluna local e não tente sincronizar senha como se fosse atributo de perfil.

Senha não é nome, email ou departamento. É segredo de autenticação e deve permanecer sob o mecanismo responsável por validá-la.

## Hash local

Quando o método é realmente interno, use a infraestrutura de senha do Moodle. Não implemente MD5, SHA simples ou uma coluna paralela.

O Moodle possui serviços responsáveis por verificar e atualizar hashes, inclusive permitindo evolução de algoritmos ao longo do tempo. Um plugin que decide seu próprio formato de senha cria uma dívida de segurança desnecessária.

## `get_userinfo()`

Plugins externos podem buscar os dados do perfil na fonte externa:

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

Mapeie explicitamente os campos. Não copie automaticamente todo JSON retornado pelo serviço para o objeto do usuário.

## Sincronização de perfil

Uma identidade externa pode controlar nome, sobrenome, email, instituição, departamento e identificador acadêmico. Para cada campo, defina a autoridade.

Se o ERP manda o nome oficial, talvez o usuário não possa editar localmente. Se o ERP deixa telefone vazio, talvez o Moodle possa permitir edição local. O problema não é tecnicamente salvar o valor, mas decidir qual alteração vence quando os dois lados diferem.

## SSO pode significar coisas completamente diferentes

Aqui existe uma confusão que precisa ser resolvida antes de continuar. A sigla SSO costuma ser utilizada para qualquer situação em que o usuário não digita a senha duas vezes, mas arquiteturalmente podemos ter fluxos bastante diferentes.

No primeiro, o Moodle ainda recebe usuário e senha e delega a validação para outro sistema. Isto continua sendo o cenário clássico de um plugin `auth` baseado em credencial.

No segundo, o navegador é redirecionado para um provedor de identidade, como um IdP OIDC ou SAML. O provedor autentica o usuário e devolve ao Moodle uma asserção ou código que precisa ser validado.

No terceiro, existe um CMS, portal acadêmico ou área do aluno onde a pessoa já está autenticada. Esse sistema quer mostrar um botão "Acessar Moodle" que leve diretamente ao curso com o usuário já logado. Nesse caso, não existe uma nova senha para o Moodle validar. O problema é transferir confiança de uma aplicação para outra e criar uma sessão Moodle com base numa prova temporária e confiável.

Misturar esses três cenários dentro da mesma explicação de `user_login()` só confunde o leitor.

## SSO com usuário e senha ainda é autenticação delegada

Se o aluno digita usuário e senha na página do Moodle e o plugin consulta um serviço externo para dizer `true` ou `false`, estamos claramente dentro do contrato tradicional do `auth`.

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

O Moodle recebeu a credencial e a validação foi delegada. O método `user_login()` é parte central do fluxo.

## SSO federado com OIDC ou SAML

Em autenticação federada, o Moodle normalmente não recebe a senha do usuário. Ele inicia ou recebe um fluxo com o provedor de identidade e valida uma resposta criptograficamente protegida.

```
Moodle -> IdP -> autenticação -> callback Moodle
```

O Moodle precisa validar `state`, `nonce`, issuer, audience, assinatura, expiração e demais elementos do protocolo correspondente. É por isso que implementar OIDC na mão porque "é só decodificar um JWT" é uma ideia ruim.

Quando existe implementação mantida para o protocolo e a versão necessária, prefira utilizá-la a inventar seu próprio SSO.

## "Mas Kraus, eu já tenho uma área do aluno. Quero só um link que entre no Moodle logado"

Esse é outro problema.

Imagine que a instituição possui um CMS ou uma área do aluno chamada Portal Acadêmico. O estudante já entrou nesse portal, a aplicação já sabe exatamente quem ele é e existe um botão:

```
Acessar ambiente de aprendizagem
```

Ao clicar, a instituição quer enviá-lo para:

```
/course/view.php?id=42
```

já com a sessão Moodle criada.

Aqui não faz sentido pedir a senha novamente, e também não faz sentido o CMS enviar a senha do aluno para o Moodle escondida num POST. O sistema externo já autenticou aquela pessoa. O que o Moodle precisa receber é uma prova curta de que uma aplicação confiável afirma que aquele usuário é quem diz ser.

Eu não trataria isso como "o plugin auth que valida a senha do aluno", porque não existe senha do aluno sendo validada nesse momento. Trata-se de um handoff de autenticação, uma troca controlada de confiança entre sistemas para estabelecer a sessão Moodle.

## Isso não é `user_login()`

Esse é o ponto que eu quero deixar explícito.

Se o CMS chama uma API do Moodle para gerar um link de uso único e depois redireciona o navegador para esse link, não existe motivo para implementar:

```php
public function user_login($username, $password) {
    // ...
}
```

porque esse método responde a outra pergunta.

O CMS já possui uma sessão autenticada. O que precisamos agora é validar uma credencial de sistema ou uma assinatura, identificar com segurança o usuário Moodle correspondente, emitir uma prova de login de vida curta, consumir essa prova uma única vez e então pedir ao Moodle para estabelecer a sessão local.

## O fluxo correto de um link de acesso único

Um desenho comum fica assim:

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

A senha do aluno nunca atravessa essa integração.

## Não coloque `userid` ou email em uma URL e chame isso de SSO

Isto seria absurdo:

```
https://moodle.exemplo.com/loginexterno.php?userid=438
```

Qualquer pessoa poderia trocar `438` por outro ID.

Também não melhora muito fazer:

```
?email=aluno@example.com&secret=MINHA_CHAVE_GLOBAL
```

porque uma chave estática em URL acaba em histórico, proxy, analytics, log de servidor e captura de tela.

O token precisa ser imprevisível, ter vida curta, uso único e ser emitido depois que o servidor externo foi autenticado por um canal próprio.

## A identidade do CMS não é a identidade do aluno

Esse detalhe é importante. A chamada servidor-servidor é autenticada como a aplicação CMS. Ela prova que uma aplicação autorizada está pedindo um login para determinado usuário.

O navegador depois apresenta a chave temporária. A chave representa uma autorização limitada para estabelecer uma sessão como aquele usuário.

Não tente usar um token de Web Service administrativo diretamente no navegador como se fosse o token do aluno. O token técnico possui outro escopo e, se vazar, o impacto pode ser enorme.

## One-time token

Uma chave de login deve ser aleatória, imprevisível, curta em tempo de vida e invalidada imediatamente depois do uso.

Ela pode ser armazenada de forma que o Moodle consiga associá-la a:

```
userid
expires
used
allowed destination
issuer/client
```

Dependendo do desenho, também pode carregar restrição de IP ou um identificador de transação. O que não pode acontecer é uma URL continuar válida durante horas e poder ser compartilhada com outra pessoa.

## Por que uso único importa

Imagine que alguém copie a URL do histórico do navegador ou de um log de proxy. Se o token continuar válido depois do primeiro acesso, ele virou uma senha temporária reutilizável.

Ao consumir a chave, invalide-a antes ou dentro da mesma operação atômica que autoriza o login. Dois requests simultâneos não deveriam conseguir usar a mesma prova.

## Expiração curta

Um token de login não precisa durar um dia. O CMS acabou de pedir o link e vai redirecionar o usuário imediatamente.

Sessenta segundos, alguns minutos ou outra janela curta definida pelo ambiente normalmente fazem muito mais sentido que uma credencial de longa duração.

Se o usuário abrir a URL depois da expiração, o sistema deve gerar outra, não aumentar indefinidamente a validade da primeira.

## Destino após o login

O CMS pode querer enviar o usuário para um curso, uma atividade ou Dashboard. Isso pode ser representado por um `wantsurl`, mas o destino precisa ser validado.

Não aceite uma URL externa arbitrária e depois faça `redirect($wantsurl)`. Um endpoint de login com open redirect é particularmente valioso para phishing porque começa num domínio confiável.

Eu prefiro aceitar apenas URLs locais validadas ou, melhor ainda, tipos de destino conhecidos, como `courseid` e `cmid`, e deixar o Moodle construir a URL final.

## Onde esse mecanismo deve morar

Aqui existe uma nuance importante. Conceitualmente, esse fluxo não é o mesmo que um método `auth` que valida username e password. Ele é uma ponte de sessão entre aplicações.

Tecnicamente, existem implementações que colocam esse mecanismo em um plugin `auth`, porque o endpoint final estabelece uma identidade Moodle e porque o plugin type já participa naturalmente do login. O conhecido `auth_userkey`, por exemplo, usa exatamente a ideia de solicitar uma URL de login temporária para um usuário e consumir uma chave de uso único.

Portanto, eu não escreveria no livro que "isso nunca pode ser um auth", porque seria tecnicamente falso. O ponto correto é outro: não modele esse caso como `user_login()` por usuário e senha. Modele como login delegado por token de uso único ou protocolo federado, e escolha o componente Moodle que oferece o contrato mais coerente para a solução.

## Quando eu colocaria isso fora de um `auth`

Em um projeto institucional próprio, pode existir um plugin `local` ou outro componente responsável por integração entre sistemas que exponha um Web Service para emitir a autorização temporária e um endpoint específico para consumi-la.

Esse endpoint pode validar a chave, localizar o usuário e utilizar a API de sessão do Moodle, incluindo `complete_user_login()`, para estabelecer a sessão.

Mas essa liberdade aumenta sua responsabilidade. Você precisa implementar corretamente geração de token, armazenamento, uso único, expiração, proteção contra replay, destination validation, logout e auditoria. Criar um `local_sso.php` com `complete_user_login($user)` depois de comparar um segredo fixo na query string não é arquitetura, é vulnerabilidade com nome bonito.

## Quando um `auth` específico ainda pode fazer sentido

Se toda a finalidade do componente é estabelecer identidades vindas daquele mecanismo de SSO e você quer que ele apareça e se comporte como método de autenticação do usuário, `auth` pode ser perfeitamente adequado.

O exemplo de `auth_userkey` mostra isso na prática. O método tradicional `user_login()` retorna `false`, porque o login não acontece por senha; a lógica específica consome uma chave, localiza o usuário e chama `complete_user_login()`.

A lição não é escolher uma pasta por dogma. É modelar corretamente o fluxo.

## CMS confiável não significa navegador confiável

O CMS e o Moodle podem conversar por um canal servidor-servidor autenticado, mas depois a URL passa pelo navegador do usuário.

Tudo que estiver nessa URL pode ser copiado, salvo no histórico, enviado por chat ou registrado em infraestrutura intermediária. É por isso que a chave precisa ter alcance mínimo.

A confiança deve estar na emissão do token, não no fato de a pessoa ter clicado em um link vindo de uma página visualmente conhecida.

## Web Service para emitir a URL

Um desenho que gosto bastante é o CMS nunca conhecer como a chave é formada. Ele chama uma External Function parecida conceitualmente com:

```
auth_sso_request_login_url
```

Envia um identificador estável do aluno e o destino lógico. O Moodle valida a aplicação por token de Web Service com capability específica e devolve uma URL descartável.

A chave técnica do Web Service fica no backend do CMS e nunca vai para o JavaScript do navegador.

## Capability para emissão de login

Gerar uma URL que permite entrar como outro usuário é uma operação extremamente poderosa. O usuário técnico do Web Service deve possuir uma capability específica, limitada e auditável.

Não use um token de administrador do site apenas porque é mais fácil. Se a credencial vazar, o atacante ganharia muito mais poder do que o necessário para emitir logins.

## Mapeamento do usuário

O sistema externo precisa informar quem é a pessoa, mas o campo escolhido para mapping precisa ser estável e apropriado.

Email pode mudar e, em algumas instituições, pode até ser reutilizado. Username pode seguir convenções alteradas ao longo do tempo. `idnumber` ou um identificador institucional dedicado costuma ser mais previsível quando existe governança sobre ele.

O ideal é ter um identificador imutável da identidade externa e uma relação explícita com o `userid` Moodle.

## Não troque automaticamente o método de autenticação do usuário

Outra armadilha é pensar que, porque o usuário entrou uma vez por link temporário, sua coluna `auth` precisa ser alterada para o mecanismo de user key.

Isso depende da arquitetura. O usuário pode continuar sendo `manual`, `oauth2`, `ldap` ou outro método e receber um acesso delegado específico por uma aplicação confiável.

Se a implementação decidir mudar `auth`, precisa entender o impacto sobre senha local, recuperação e próximos logins. Existem discussões históricas em implementações de user key justamente por causa desse tipo de efeito colateral.

## Logout entre CMS e Moodle

Se o usuário entrou no Moodle a partir do CMS, o que acontece quando ele faz logout de um dos dois?

Existem várias políticas possíveis. Logout apenas local no Moodle, logout do portal que também encerra Moodle, logout global do IdP ou simplesmente expiração independente de sessões.

O importante é não prometer "single sign-on" e presumir automaticamente "single logout". São problemas diferentes e protocolos federados tratam logout como uma etapa própria.

## Criação automática de conta

Alguns fluxos de SSO precisam criar o usuário local na primeira entrada. Isso pode ser aceitável, mas a criação deve acontecer somente depois de a identidade externa ser validada.

Não aceite dados de perfil enviados pelo navegador como prova suficiente. Se o CMS precisa criar usuário, os dados devem chegar pelo canal servidor-servidor autenticado ou ser obtidos de uma fonte confiável.

## Atualização automática de conta

O mesmo vale para atualização. Nome, email e outros campos podem ser atualizados durante a emissão do link, mas somente se o CMS for realmente fonte autoritativa desses dados.

Não transforme a emissão de uma sessão em um `update_record()` de tudo que apareceu no payload. Separe identidade, atributos confiáveis e preferências locais.

## `complete_user_login()`

Depois que o Moodle validou definitivamente a identidade ou a prova de login, `complete_user_login()` é a infraestrutura central que conclui o login daquele usuário e prepara a sessão.

Não tente reproduzir manualmente tudo que ela faz atribuindo `$USER` e gravando cookie na mão.

```php
$user = get_complete_user_data('id', $userid);
complete_user_login($user);
```

Essa chamada só pode acontecer depois de toda a autenticação do fluxo ter sido concluída com segurança.

## `get_userinfo()` e criação local

Voltando aos plugins `auth` tradicionais, `get_userinfo()` permite sincronizar atributos depois da identidade validada. Essa lógica continua útil tanto em autenticação por senha externa quanto em alguns fluxos federados.

O ponto é não confundir o perfil retornado pelo provedor com autorização. Se o payload diz `admin=true`, isso não deveria automaticamente transformar a pessoa em administrador do Moodle.

## Campos travados

Quando um campo pertence ao sistema externo, o plugin pode impedir edição local ou defini-la apenas quando a fonte não fornece valor.

Essa política evita o ciclo irritante em que o usuário altera o nome no Moodle, vê a alteração salva e no próximo login o ERP sobrescreve tudo novamente.

A interface deve refletir quem realmente possui autoridade sobre cada atributo.

## `is_synchronised_with_external()`

Um plugin pode informar que os dados da conta são sincronizados com a fonte externa:

```
public function is_synchronised_with_external() {
    return true;
}
```

Isso não transforma o login em job de sincronização completa. Significa apenas que determinadas informações do usuário têm origem externa.

## Scheduled Tasks para sincronização

Quando a instituição precisa criar, atualizar ou suspender contas mesmo sem login recente, use Scheduled Task.

```php
namespace auth_academicsso\task;

class sync_users extends \core\task\scheduled_task {
    public function get_name(): string {
        return get_string('tasksyncusers', 'auth_academicsso');
    }

    public function execute() {
        $manager = new \auth_academicsso\sync\manager();
        $manager->run();
    }
}
```

A task deve trabalhar em lotes, ser idempotente e registrar progresso, retomando os princípios de Cron, Tasks e Processamento Assíncrono.

## Usuário removido da fonte

Quando uma conta desaparece do diretório externo, a política precisa ser explícita. Suspender é muitas vezes mais seguro do que excluir, porque o usuário pode possuir notas, mensagens, logs e submissões que não devem desaparecer.

"Não apareceu na consulta" também não é sinônimo automático de "foi definitivamente desligado". Uma falha de integração pode produzir a mesma ausência.

## `user_exists()`

`user_exists()` permite perguntar se uma identidade existe no backend externo sem autenticar:

```php
public function user_exists($username) {
    return $this->client()->user_exists($username);
}
```

Existência e credencial válida são perguntas diferentes, por isso não misture as duas operações.

## `user_update()`

Alguns plugins permitem enviar alterações do Moodle para a origem. Só implemente isso quando o Moodle realmente possuir autoridade para escrever naquele sistema.

Se o ERP é mestre dos dados, `user_update()` pode ser conceitualmente incorreto mesmo que a API externa aceite a chamada.

## Mudança de senha

`can_change_password()` informa se o método permite alteração de senha. Em SSO e OAuth 2 normalmente o Moodle deve devolver `false` e apontar o usuário para o portal responsável pela credencial.

```
public function can_change_password() {
    return false;
}
```

Quando existe mudança externa suportada, `user_update_password()` pode encaminhar a nova senha, sempre sem registrá-la ou persistir texto puro.

## `change_password_url()`

Se a senha é gerenciada fora do Moodle, devolva a URL adequada para o usuário chegar ao sistema correto.

O endereço pode ser configurável, mas deve ser validado e não deve transformar a funcionalidade em redirect arbitrário.

## Recuperação de senha

Se o Moodle não controla a senha, também não deveria afirmar que consegue recuperá-la. `can_reset_password()` e os mecanismos relacionados precisam refletir a autoridade real.

Um usuário OAuth deve redefinir a credencial no IdP, não numa tela Moodle que não possui o segredo.

## Cadastro e confirmação

Alguns métodos permitem auto cadastro e confirmação. Em ambientes acadêmicos integrados, normalmente a conta nasce no sistema institucional e o Moodle apenas cria a representação local quando necessário.

Não habilite auto cadastro externo apenas porque a API possui o método. A política de identidade da instituição deve vir primeiro.

## `can_be_manually_set()`

Se o método depende de identificadores externos e configuração específica, talvez não seja seguro permitir que um administrador simplesmente mude qualquer conta para esse `auth` manualmente.

O plugin deve dizer se consegue realmente suportar essa transição sem deixar o usuário bloqueado.

## Callbacks de login

`auth_plugin_base` expõe callbacks como `pre_loginpage_hook()`, `loginpage_hook()`, `pre_user_login_hook()` e `user_authenticated_hook()`.

Eles existem e podem ser necessários, mas não devem virar uma espécie de `lib.php` global da autenticação. Use cada um quando representa o ponto correto do fluxo e mantenha processamento pesado fora da requisição.

## Provedores de identidade na tela de login

Para mostrar botões como "Entrar com Google" ou "Entrar com conta institucional", o plugin pode fornecer identity providers para a página de login.

Isso é melhor do que injetar HTML diretamente no template do tema, porque o Moodle continua controlando o layout e o plugin apenas descreve a opção de autenticação.

## `wantsurl`

`wantsurl` representa o destino pretendido depois do login. Em qualquer fluxo SSO, valide esse destino.

Esse cuidado é especialmente importante no cenário CMS -> Moodle, porque uma URL de login legítima que depois redireciona para um domínio malicioso pode ser usada em phishing. Há inclusive discussões recentes em implementações de user key sobre open redirect quando `wantsurl` aceita destinos externos.

## OAuth 2

OAuth 2 por si só é um framework de autorização, enquanto OpenID Connect adiciona a camada de identidade normalmente usada para login federado.

No Moodle, o fluxo OAuth 2 mostra bem a arquitetura em que a senha não é entregue ao Moodle. O navegador passa pelo provedor, o Moodle valida a resposta e vincula a identidade externa a uma conta local.

Não copie access token para a sessão como substituto de `$USER`. O token externo e a sessão Moodle possuem funções diferentes.

## LDAP

LDAP continua sendo um exemplo clássico de autenticação externa. O plugin pode validar credencial, sincronizar atributos, criar contas locais e processar usuários removidos.

Esse tipo de integração também mostra a importância de timeout, TLS, filtros corretos e sincronização assíncrona. Fazer LDAP bind demorado em vários pontos do login degrada rapidamente a disponibilidade.

## Banco externo

`auth_db` representa outro modelo clássico. A identidade existe em uma tabela externa e o Moodle consulta essa fonte.

Mesmo nesse cenário, use queries parametrizadas e trate corretamente encoding, conexão e política de senha. A tabela estar na rede interna não elimina SQL Injection nem vazamento de credencial.

## Identificador externo estável

Evite depender apenas de email para account linking. Email muda e pode ser reutilizado.

Quando o provedor oferece um subject imutável ou a instituição possui um ID acadêmico estável, use esse identificador na relação entre sistemas.

## Account linking

Associar uma identidade externa a uma conta existente é uma operação sensível. Não faça linking automático apenas porque o email coincide, a menos que a política institucional garanta essa equivalência.

Uma associação errada entrega histórico acadêmico, notas e dados pessoais para a pessoa errada.

## Sessão Moodle

Depois que a identidade foi comprovada, o Moodle cria sua própria sessão. Não substitua isso por cookie próprio do plugin.

Em SSO baseado em token, o token serve apenas para chegar com segurança ao momento em que `complete_user_login()` pode ser chamado. Depois disso, a sessão Moodle assume o fluxo normal.

## Login token do formulário não é token de SSO

O formulário de login do Moodle faz parte do fluxo interno de autenticação e não deve ser tratado como uma API genérica para um CMS autenticar usuários externamente. Se outro sistema precisa iniciar uma sessão Moodle, desenhe explicitamente o protocolo de confiança, a prova de identidade e o consumo único dessa prova.

Não tente reaproveitar o token CSRF/login do formulário como chave de integração entre sistemas. São ameaças e ciclos de vida completamente diferentes.

## TLS

Qualquer fluxo de autenticação externo deve usar TLS com validação correta de certificado.

Desabilitar `SSL_VERIFYPEER` para "resolver" um certificado interno cria possibilidade de interceptação exatamente no canal onde transitam credenciais ou assertions de login.

## Timeout

Um serviço de identidade indisponível não pode prender todos os workers PHP indefinidamente.

Defina timeout de conexão e total, diferencie erro de credencial de erro de infraestrutura e não faça retry agressivo no caminho crítico do login.

## Mensagem pública e log técnico

O usuário precisa saber que não conseguiu entrar, mas não precisa receber host LDAP, stack trace, client secret inválido ou detalhes de JWT.

Mantenha a mensagem pública controlada e registre diagnóstico técnico de forma segura, sem senha, token ou segredo.

## `settings.php`

Código novo deve usar Admin settings API. Os mecanismos antigos de `config.html` e callbacks históricos de configuração sobrevivem em código legado, mas não são um bom ponto de partida.

A configuração pode conter endpoint, client ID, URL de senha, tempo de expiração, modo de sincronização e outras opções, sempre com acesso administrativo adequado.

## Secrets

Client secret, senha de bind, token técnico do CMS e chaves de assinatura precisam de ciclo de vida próprio.

Não coloque em Git, log, JavaScript ou URL. Planeje rotação e limite os privilégios da credencial técnica ao mínimo necessário.

## Roles vindas do IdP

Se o IdP devolve `role=admin`, não transforme automaticamente isso em administrador Moodle.

Mapeamentos de grupos ou atributos externos para roles locais precisam ser explícitos, limitados e auditáveis. A origem ser autenticada não significa que qualquer valor recebido deva controlar autorização irrestrita.

## Performance do login

A rota de login é crítica. Reduza chamadas, evite consultas repetidas e reutilize dados obtidos na mesma requisição.

Se a resposta de autenticação já trouxe nome e email, não chame outra API imediatamente apenas para recuperar os mesmos campos em `get_userinfo()`.

## Cliente externo separado

Não espalhe HTTP dentro de `auth.php`.

```php
namespace auth_academicsso;

class client {
    private $config;

    public function __construct(\stdClass $config) {
        $this->config = $config;
    }

    public function authenticate($username, $password) {
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
            ]
        );

        if ($curl->get_errno()) {
            return false;
        }

        $data = json_decode($response, true);
        return !empty($data['authenticated']) ? $data : false;
    }
}
```

Em produção, trate HTTP status, JSON inválido, TLS, observabilidade e erros específicos.

## Reaproveitando os dados do login

Quando a autenticação já devolveu perfil, um cache estático por requisição pode evitar segunda chamada:

```php
private static $userinfo = null;

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

Isso não é armazenar credencial. É apenas reutilizar dados durante o mesmo request.

## Fluxo completo com CMS e Moodle

Para o cenário da área do aluno, eu desenharia assim:

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

Esse fluxo não exige que o CMS conheça a senha do aluno no Moodle e não exige que o Moodle receba a senha usada no CMS.

## Fluxo completo com `auth` por senha externa

O outro cenário permanece diferente:

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

Os dois podem ser chamados de SSO em conversas comerciais, mas são arquiteturas diferentes e merecem implementações diferentes.

## O que não deve estar num plugin `auth`

Não coloque matrícula, pagamento, certificado, nota, conclusão ou processamento pesado no método de autenticação apenas porque ele acontece cedo no fluxo.

Se o requisito é reagir ao login, use evento. Se é manter cursos, use Enrolment API. Se é executar algo pesado, use Task. Se é criar sessão a partir de uma prova emitida por um CMS, desenhe um handoff seguro, não finja que existe uma senha para validar.

## Checklist

Antes de considerar a autenticação pronta, responda claramente quem é a fonte de identidade, onde a senha é validada, se o Moodle mantém senha local, como o usuário é mapeado, o que acontece quando a conta externa é desativada, quem controla cada campo do perfil, qual é a política de logout, como MFA entra no fluxo e como erros externos afetam disponibilidade.

Se existe CMS ou área do aluno, acrescente outras perguntas: quem pode emitir links de login, quanto tempo a chave vive, como uso único é garantido, qual campo identifica o usuário, que destinos são permitidos, como replay é bloqueado e o que acontece quando o mesmo link é aberto duas vezes.

## Exercício - dois SSOs diferentes

Implemente duas provas de conceito distintas.

Na primeira, crie `auth_academicsso` para validar username e password em uma API institucional. O Moodle não deve armazenar senha local, deve sincronizar nome, sobrenome, email e `idnumber`, e troca de senha deve apontar para o portal externo. Uma Scheduled Task deve atualizar usuários inativos sem fazer matrícula em cursos.

Na segunda, imagine que o Portal Acadêmico já possui o aluno autenticado. Crie um serviço servidor-servidor que recebe um identificador institucional, valida capability da aplicação chamadora e gera um login token aleatório, de uso único e vida curta. O token deve poder carregar apenas um destino Moodle local validado. O navegador acessa o endpoint de consumo, a chave é invalidada e só então a sessão é estabelecida com `complete_user_login()`.

Teste replay do mesmo token, token expirado, usuário inexistente, destino externo, dois requests simultâneos, CMS sem permissão e usuário Moodle já logado como outra pessoa. Esse segundo exercício não pode pedir nem conhecer a senha do aluno.

Depois explique por escrito por que os dois mecanismos podem ser chamados de SSO, mas apenas o primeiro é um `user_login()` clássico e o segundo é um handoff de sessão baseado em confiança entre sistemas.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
