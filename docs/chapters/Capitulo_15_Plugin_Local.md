# 15 PLUGIN LOCAL

Existe uma frase que eu repito bastante quando alguém começa a desenvolver para Moodle: plugin `local` não é o lugar onde colocamos aquilo que não sabemos onde colocar. Ele é um tipo de plugin legítimo, útil e extremamente flexível, mas essa flexibilidade é justamente o motivo pelo qual ele precisa ser usado com critério, porque quando tudo vira `local` a arquitetura do Moodle perde parte da vantagem de ter tipos de plugins especializados.

A documentação oficial é bem direta nesse ponto e recomenda usar um tipo padrão sempre que ele existir. Se o que você está criando é uma atividade que o professor adiciona no curso, provavelmente é `mod`. Se é autenticação, existe `auth`. Se é matrícula, existe `enrol`. Se é um bloco visual, existe `block`. Se é uma ferramenta administrativa com escopo claramente administrativo, muitas vezes `tool` faz mais sentido. O `local` entra quando a funcionalidade é realmente institucional, transversal, integradora ou não se encaixa corretamente nos contratos dos tipos especializados.

Ao mesmo tempo, é importante não cair no exagero contrário e tratar plugin `local` como se fosse uma solução ruim por definição. Não é. Eu uso bastante plugin `local`, e muita gente que trabalha com Moodle institucional também usa, porque há uma quantidade enorme de demandas que não pertencem naturalmente a uma atividade, a um bloco ou a um método de matrícula. Integrações com ERP, sincronizações institucionais, regras internas de negócio, dashboards administrativos, consumo de eventos, automações, APIs próprias e telas que atravessam vários cursos são exemplos em que `local` pode ser exatamente o tipo certo.

Este capítulo junta boa parte do que vimos até aqui e coloca tudo dentro de um projeto completo, porque um plugin `local` de verdade raramente vive apenas de `version.php`, `settings.php` e uma página PHP. Ele pode ter banco, capabilities, eventos, Hooks, Tasks, cache, Web Services, integrações externas, páginas administrativas, templates Mustache e regras de negócio, e o ponto importante é fazer tudo isso sem transformar o plugin em um grande `lib.php` com milhares de linhas.

## 15.1 O que realmente é um plugin local

Um plugin `local` é um componente instalado dentro de `local/nome_do_plugin`, com Frankenstyle `local_nome_do_plugin`. Ele participa do sistema de plugins do Moodle como qualquer outro componente, possui `version.php`, arquivo de idioma, namespaces, autoload, acesso ao banco, Events API, Hooks, Tasks, cache, serviços externos e demais APIs públicas que vimos nos capítulos anteriores.

O que muda é a finalidade. Um `local` não representa uma atividade do curso, não representa um método de autenticação, não representa um formato de curso e não ganha automaticamente um lugar específico na interface. Ele é deliberadamente genérico e, por isso, pode não ter interface nenhuma. Um plugin que apenas escuta eventos e sincroniza dados com outro sistema pode ser `local` sem possuir uma única página acessível pelo usuário.

Essa característica é importante. Muitos desenvolvedores começam imaginando plugin a partir da tela que desejam criar, mas no Moodle o primeiro raciocínio deveria ser qual extensão do sistema está sendo implementada. A tela é consequência. Um `local` pode ter dez telas ou nenhuma, enquanto um `mod` existe porque representa uma atividade do curso, mesmo que visualmente seja muito simples.

A documentação do Moodle também trata `local` como o tipo apropriado para funcionalidades que não encontram encaixe melhor nos tipos padrão, citando entre os casos comuns consumo de eventos para comunicação com sistemas externos, definição de Web Services, aplicações que estendem o Moodle em nível de sistema, configurações administrativas e personalizações de navegação.

## 15.2 Quando eu criaria um plugin local

Eu pensaria em `local` quando a pergunta principal não estiver ligada a uma entidade específica de outro tipo de plugin, mas a uma necessidade institucional que atravessa o ambiente. Imagine que a instituição possui um ERP acadêmico e precisa sincronizar usuários, cursos, matrículas, situações financeiras e alterações de cadastro. Isso não é uma atividade. Não é autenticação, a menos que a única responsabilidade seja autenticar. Não é enrolment se o projeto inteiro envolve muito mais do que matrícula. Um `local` de integração pode ser adequado.

Outro caso é um portal interno que consolida dados de várias áreas do Moodle. Ele pode possuir páginas administrativas, relatórios, configurações, tarefas agendadas, endpoints AJAX e APIs para outros sistemas. Se ele não se encaixa como `report` porque também modifica dados, não se encaixa como `tool` porque não é apenas ferramenta de administração e precisa ser usado por diferentes perfis, então `local` pode ser o encaixe correto.

Também é comum utilizar `local` como consumidor de eventos. Você pode querer executar uma integração sempre que um curso for criado, um usuário atualizado ou uma atividade concluída. O plugin não é dono dessas entidades e não deveria alterar o código do componente que dispara o evento. Ele apenas observa o que acontece e reage.

Há ainda personalizações institucionais que precisam existir no site inteiro. Um aviso específico, uma regra adicional, uma integração com um serviço interno, uma página institucional, uma automação de dados ou uma API transversal podem fazer sentido em `local`, desde que não exista um tipo mais específico que represente melhor o problema.

## 15.3 Quando eu não criaria um plugin local

A flexibilidade do `local` gera uma tentação muito forte. O desenvolvedor pensa que, se qualquer coisa pode ser implementada dentro dele, então é mais rápido criar tudo como `local`. Tecnicamente, muitas vezes funciona. Arquiteturalmente, isso cobra preço depois.

Se o professor precisa adicionar uma atividade no curso, configurar parâmetros por instância e cada atividade precisa de conclusão, nota, grupos, backup e restauração, então isso tem cara de `mod`. Implementar tudo manualmente em `local` significaria reconstruir contratos que o tipo `mod` já entrega.

Se a funcionalidade é um método de matrícula, um `enrol` recebe integração nativa com o fluxo de matrícula, instâncias por curso e regras próprias desse subsistema. Colocar a mesma lógica em `local` pode até matricular usuários chamando APIs, mas perde semântica e integração com o modelo do Moodle.

O mesmo vale para autenticação, filtros, formatos de curso, tipos de questão, temas, relatórios e outras extensões. Sempre que existe um tipo que representa exatamente a responsabilidade que você está implementando, comece por ele.

E aqui existe uma diferença entre "consigo fazer" e "deveria fazer". Em Moodle, praticamente qualquer plugin pode chamar dezenas de APIs e interferir em muitas partes do sistema. A arquitetura não serve para dizer o que o PHP permite, serve para manter responsabilidades compreensíveis depois de três anos, cinco upgrades e três pessoas diferentes mexendo no projeto.

## 15.4 "Mas Kraus, você só cria plugin local para quase tudo"

Essa crítica é justa, principalmente olhando uma lista de projetos institucionais em que aparece `local_` em todo lado. Eu crio bastante plugin `local`, mas o motivo normalmente está no tipo de problema que chega para mim. Grande parte desses projetos não é uma atividade que um professor adiciona ao curso, nem um método de autenticação, nem um bloco pequeno, mas integração, automação, dashboard, regra institucional, sincronização ou camada de serviço que atravessa vários componentes.

O erro seria pegar essa experiência e transformar em regra universal. Se eu preciso que o aluno abra uma atividade específica, tenha uma instância daquela atividade no curso, conclusão, notas, backup e configurações próprias por atividade, então `mod` continua sendo o caminho certo. Agora, se eu preciso executar uma regra quando o usuário acessa qualquer atividade do Moodle, não preciso transformar tudo em `local` nem alterar todos os módulos. Posso ter um componente que escuta eventos ou utiliza Hooks adequados e, a partir das variáveis disponíveis naquele evento, decide quando atuar.

Esse é um bom exemplo de como escolher o tipo pelo domínio do problema. Um `mod` existe porque é uma atividade. Um `local` pode observar o ecossistema inteiro quando sua responsabilidade é transversal. O importante é não escolher o tipo olhando apenas para a pasta que parece mais fácil de programar.

## 15.5 A pergunta correta antes de criar a pasta

Antes de criar `local/meuplugin`, eu faria algumas perguntas. A funcionalidade representa uma entidade que já possui plugin type próprio? Ela precisa de instâncias por curso? É executada apenas em páginas de um componente específico ou precisa atravessar o Moodle? O professor precisa adicioná-la manualmente? Existe lifecycle específico como matrícula, autenticação, atividade, question type ou formato de curso? A interface é administrativa ou utilizada por diversos perfis?

Essas perguntas eliminam muitos `local` desnecessários. Se depois delas a resposta continuar sendo "isso é uma extensão institucional que não se encaixa bem em nenhum tipo especializado", aí o `local` deixa de ser solução genérica e passa a ser escolha arquitetural consciente.

## 15.6 Estrutura inicial

Vamos imaginar um projeto chamado `local_institutionhub`, responsável por integrar o Moodle com sistemas internos da instituição, fornecer algumas páginas de acompanhamento e executar sincronizações assíncronas.

Uma estrutura possível começa assim.

```
local/institutionhub/
|-- classes/
|   |-- external/
|   |-- hook/
|   |-- observer/
|   |-- output/
|   |-- service/
|   |-- task/
|   `-- integration/
|-- db/
|   |-- access.php
|   |-- caches.php
|   |-- events.php
|   |-- hooks.php
|   |-- install.xml
|   |-- services.php
|   |-- tasks.php
|   `-- upgrade.php
|-- lang/
|   |-- en/
|   `-- pt_br/
|-- templates/
|-- index.php
|-- lib.php
|-- settings.php
`-- version.php
```

Não significa que todo plugin `local` precisa criar todas essas pastas. Muito pelo contrário. A estrutura deve crescer conforme o recurso existe. Criar dez diretórios vazios "para ficar profissional" só produz barulho. O exemplo serve para visualizar como responsabilidades diferentes podem ser separadas sem concentrar tudo no arquivo principal.

## 15.7 version.php continua declarativo

O `version.php` de um plugin local não ganha nenhuma licença especial para executar regra de negócio. Ele continua servindo para declarar metadados do componente.

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'local_institutionhub';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

Se o plugin depender de outro componente, a dependência deve ser declarada quando aplicável, em vez de descobrir no meio de uma requisição que uma classe esperada não existe. `version.php` não é lugar para consultar banco, chamar API externa, criar tabela manualmente ou executar sincronização.

## 15.8 O lib.php deve continuar pequeno

Plugin `local` historicamente ficou associado a `lib.php` porque vários callbacks antigos do Moodle são descobertos nesse arquivo. Isso fez nascer muitos projetos em que `lib.php` virou quase a aplicação inteira. Encontramos funções de navegação, chamadas de banco, HTTP, HTML e regras institucionais misturadas dentro dele.

Hoje eu trataria `lib.php` como ponto de compatibilidade para callbacks que realmente precisam estar ali. A função pode receber o chamado do Moodle e delegar para uma classe, mantendo o corpo pequeno e legível.

```php
function local_institutionhub_extend_navigation(global_navigation $navigation): void {
    \local_institutionhub\navigation\manager::extend($navigation);
}
```

Se existe Hook moderno equivalente, prefira a arquitetura de Hook para código novo nas branches que você suporta. Se precisa manter compatibilidade com versões anteriores, use a estratégia discutida no capítulo de Hooks em vez de duplicar comportamento sem controle.

O que eu evitaria é colocar um service inteiro dentro de `lib.php` só porque a primeira chamada chegou por callback.

## 15.9 settings.php e configurações administrativas

Plugin `local` é particularmente confortável para configurações administrativas, inclusive porque os plugins locais são carregados mais tarde durante a construção da árvore administrativa. Mesmo assim, a regra de performance continua valendo. `settings.php` pode ser incluído em situações em que aquela tela não será efetivamente mostrada, então ele não deve fazer consulta pesada nem acessar API externa de forma incondicional.

```php
if ($hassiteconfig) {
    $settings = new admin_settingpage(
        'local_institutionhub',
        get_string('pluginname', 'local_institutionhub')
    );

    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configtext(
        'local_institutionhub/baseurl',
        get_string('baseurl', 'local_institutionhub'),
        get_string('baseurl_desc', 'local_institutionhub'),
        '',
        PARAM_URL
    ));
}
```

O nome da configuração deve continuar seguindo `componente/setting`, por exemplo `local_institutionhub/baseurl`. O Moodle grava esses valores em `config_plugins` e o código pode usar `get_config('local_institutionhub', 'baseurl')`.

O fato de ser fácil criar configuração não significa que segredo deva ser tratado sem cuidado. Tokens, senhas e chaves precisam de decisão consciente sobre armazenamento, acesso e exposição em logs, e ambientes maiores podem usar mecanismos externos para secrets conforme a infraestrutura da instituição.

## 15.10 Páginas do plugin

Um plugin `local` pode ter páginas próprias, normalmente dentro da própria pasta do componente. Isso não significa que cada arquivo PHP deva conter toda a aplicação.

```php
<?php

require_once(__DIR__ . '/../../config.php');

require_login();

$context = context_system::instance();
require_capability('local/institutionhub:viewdashboard', $context);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/institutionhub/index.php'));
$PAGE->set_title(get_string('dashboard', 'local_institutionhub'));
$PAGE->set_heading(get_string('dashboard', 'local_institutionhub'));

$viewmodel = \local_institutionhub\output\dashboard::from_user($USER->id);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template(
    'local_institutionhub/dashboard',
    $viewmodel->export_for_template($OUTPUT)
);
echo $OUTPUT->footer();
```

Essa página faz bootstrap, segurança, configuração do `$PAGE`, obtém o objeto que representa os dados e renderiza o template. Ela não deveria conter uma consulta de trezentas linhas, uma chamada ao ERP, geração de HTML em `echo` e lógica de permissão misturadas.

## 15.11 Navegação

Um `local` frequentemente precisa adicionar entrada em navegação ou na administração. Esse é um dos motivos pelos quais muita personalização institucional foi historicamente parar nesse tipo de plugin.

O cuidado é não tratar navegação como local onde se executa regra pesada. Callbacks de navegação podem ser chamados em muitas páginas, então uma consulta cara feita ali se transforma em custo global do site.

Se a decisão para mostrar um item depende apenas de contexto e capability, ótimo. Se depende de análise complexa, tente carregar somente quando necessário, usar cache apropriado ou mudar a arquitetura.

Também não altere arquivos do core para adicionar menu. Se o resultado pode ser obtido por Navigation API, callback ou Hook disponível, use o contrato público. Alterar `lib/navigationlib.php` ou template do core para inserir um link institucional pode parecer rápido hoje, mas vira uma dívida a cada atualização.

## 15.12 Capabilities em plugin local

Um plugin `local` pode declarar capabilities em `db/access.php` como qualquer outro componente. O erro comum é achar que, por se tratar de uma página institucional, basta chamar `require_login()` e pronto.

```php
$capabilities = [
    'local/institutionhub:viewdashboard' => [
        'riskbitmask' => RISK_PERSONAL,
        'captype' => 'read',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],

    'local/institutionhub:managesync' => [
        'riskbitmask' => RISK_DATALOSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
```

As duas ações não precisam compartilhar a mesma capability. Visualizar dashboard e disparar sincronização são responsabilidades diferentes e podem ter riscos diferentes.

Também não escolha sempre `CONTEXT_SYSTEM` apenas porque o plugin é `local`. Se uma ação pertence a um curso específico e a autorização deve respeitar papéis daquele curso, talvez `context_course` seja o contexto correto. O tipo do plugin não define sozinho o contexto da autorização.

## 15.13 Capability não substitui propriedade do dado

Voltamos ao ponto do capítulo de segurança. Se a página recebe `recordid=123`, verificar `local/institutionhub:view` no contexto do sistema não prova que o usuário pode acessar aquele registro.

O código precisa carregar o registro, descobrir a qual entidade ele pertence, determinar o contexto apropriado e aplicar também as regras de propriedade ou relacionamento. Um plugin `local` costuma lidar com dados institucionais amplos e, justamente por isso, IDOR aparece com frequência quando o desenvolvedor acha que "ser manager" ou "ter capability" resolve toda autorização.

## 15.14 Banco de dados próprio

Se o plugin precisa persistir informação própria, utilize `db/install.xml` e DDL API como vimos no capítulo de banco de dados. Não crie tabela em `install.php` usando SQL bruto e muito menos execute `CREATE TABLE` quando a página abre.

Uma integração pode ter tabelas de fila, mapeamento, status de sincronização ou auditoria. Cada uma precisa de propósito claro, índices coerentes e caminho de upgrade.

Exemplo conceitual.

```
local_institutionhub_map
- id
- externalid
- moodleid
- entitytype
- timemodified

local_institutionhub_queue
- id
- eventtype
- payload
- status
- attempts
- nextrun
- timecreated
```

Os nomes reais e o schema dependem do projeto, mas a ideia é separar estado de negócio de mecanismos temporários de execução quando isso fizer sentido.

## 15.15 install.xml e upgrade.php

O `install.xml` deve representar o schema correto para uma instalação nova. O `upgrade.php` descreve como instalações existentes chegam a esse estado.

Esse ponto é especialmente importante em plugin institucional porque ele tende a viver muitos anos. Um `local` usado internamente pode não passar pelo Marketplace, mas continua precisando de upgrades confiáveis. Às vezes isso é ainda mais importante, porque a tabela pode ter milhões de registros reais e não apenas dados de demonstração.

Nunca edite somente `install.xml` depois de publicar a primeira versão achando que a atualização vai alterar a tabela existente. Instalações já feitas não recriam o plugin do zero. A mudança precisa entrar em `xmldb_local_institutionhub_upgrade()` com savepoint adequado.

## 15.16 Classes de serviço

Uma forma prática de impedir que o plugin cresça desorganizado é concentrar regras de negócio em classes com responsabilidades compreensíveis.

```
classes/service/user_sync.php
classes/service/course_sync.php
classes/integration/erp_client.php
classes/integration/payload_mapper.php
classes/repository/sync_repository.php
```

Não precisa adotar arquitetura cerimonial com dez camadas para salvar um registro. A separação serve quando existe responsabilidade real.

Eu gosto de pensar assim. Se a regra precisa ser usada por uma página, por uma Task e por uma External API, ela não pertence a nenhum desses pontos de entrada. Ela pertence a uma classe de domínio ou serviço que todos eles chamam.

Isso reduz duplicação e, principalmente, impede que o comportamento mude dependendo de onde foi acionado.

## 15.17 Interface sem renderer.php desnecessário

O que discutimos no Capítulo 6 vale integralmente aqui. Não existe motivo para um plugin `local` novo ganhar `renderer.php` por tradição.

Se você consegue preparar os dados em uma classe `templatable` e chamar `render_from_template()`, faça isso. Não crie uma classe intermediária apenas para receber o objeto e devolver exatamente o mesmo template.

```php
$data = (new \local_institutionhub\output\dashboard($summary))
    ->export_for_template($OUTPUT);

echo $OUTPUT->render_from_template(
    'local_institutionhub/dashboard',
    $data
);
```

Renderer continua existindo no Moodle e há situações de compatibilidade e override em que ele faz sentido, mas criar `renderer.php` automaticamente em todo `local` novo é carregar para 2026 uma camada que, na maioria dos casos, o Mustache já tornou redundante.

## 15.18 Events API dentro do plugin local

Uma das utilizações clássicas de `local` é reagir a eventos de outros componentes. Suponha que toda vez que um usuário for atualizado o ERP precise receber uma notificação.

O plugin declara o observer em `db/events.php`.

```php
$observers = [
    [
        'eventname' => '\\core\\event\\user_updated',
        'callback' => '\\local_institutionhub\\observer\\user::updated',
    ],
];
```

A classe observer não deveria transformar a requisição do usuário em uma integração longa e frágil.

```php
namespace local_institutionhub\observer;

final class user {
    public static function updated(\core\event\user_updated $event): void {
        $task = new \local_institutionhub\task\sync_user();
        $task->set_custom_data([
            'userid' => $event->objectid,
        ]);

        \core\task\manager::queue_adhoc_task($task);
    }
}
```

O observer registra o fato e enfileira trabalho. A chamada externa acontece depois. Isso reduz latência e evita que a edição do perfil falhe porque o ERP ficou fora do ar.

## 15.19 Event não é Hook

Se você precisa saber que algo aconteceu, Event é natural. Se precisa interferir em um ponto de extensão antes ou durante uma operação e o Moodle oferece Hook para isso, use Hook.

Não use observer como mecanismo de veto tentando "desfazer" algo que já aconteceu. O evento é registro de um fato. Essa separação evita muitos códigos estranhos em que um observer dispara update inverso, gera outro evento e entra em ciclo.

## 15.20 Hooks em plugin local

Plugins locais também podem consumir Hooks em `db/hooks.php`. Isso é particularmente útil em personalizações institucionais que antes dependiam de callbacks globais em `lib.php`.

Uma definição pode apontar para uma classe callback e definir prioridade conforme o contrato do Hook utilizado. A implementação deve continuar pequena e delegar para serviços quando a regra cresce.

O cuidado é o mesmo do capítulo anterior. Não migre callback antigo para Hook simplesmente porque Hook parece mais moderno. Primeiro confirme se existe substituto oficial para aquele callback e se todas as branches suportadas pelo plugin possuem a API necessária.

## 15.21 Scheduled Tasks

Se existe sincronização periódica, limpeza, reconciliação ou processamento em lote, `db/tasks.php` é o caminho natural.

```php
$tasks = [
    [
        'classname' => '\\local_institutionhub\\task\\reconcile_courses',
        'blocking' => 0,
        'minute' => '*/15',
        'hour' => '*',
        'day' => '*',
        'month' => '*',
        'dayofweek' => '*',
    ],
];
```

Em versões atuais do Moodle, a noção antiga de task blocking foi removida do comportamento do scheduler, então não desenhe concorrência confiando naquele campo. Use idempotência, Lock API e estado persistente quando duas execuções simultâneas seriam perigosas.

A task não deveria processar indefinidamente todos os dados do ERP em uma execução. Divida lote, registre progresso e permita retomada.

## 15.22 Adhoc Tasks

Adhoc Task funciona muito bem quando a necessidade nasce de uma ação ou evento e pode ser processada depois.

Um usuário é atualizado, o plugin cria uma task. Uma importação é enviada, o plugin divide em lotes e cria tasks. Um webhook precisa de processamento pesado, o endpoint valida assinatura, persiste o recebimento e enfileira trabalho.

Isso transforma o plugin `local` em um bom ponto de integração sem obrigar a requisição web a fazer tudo de uma vez.

Mas lembre do que já vimos. Adhoc não significa execução instantânea. Ela depende do cron e dos workers. Se o cron está quebrado, a fila cresce.

## 15.23 Concorrência e Lock API

Integrações institucionais frequentemente possuem jobs que não podem rodar duas vezes sobre o mesmo objeto. Imagine dois workers sincronizando a mesma matrícula ao mesmo tempo.

A Lock API resolve exclusão mútua entre processos sem você inventar uma tabela `locks` própria.

```php
$factory = \core\lock\lock_config::get_lock_factory('local_institutionhub');
$lock = $factory->get_lock('sync_user_' . $userid, 5);

if (!$lock) {
    return;
}

try {
    $service->sync_user($userid);
} finally {
    $lock->release();
}
```

O lock evita concorrência, mas não substitui idempotência. Se a execução falhar depois de enviar a requisição externa e antes de gravar o status local, o retry precisa saber lidar com essa situação.

## 15.24 Cache

Um dashboard institucional pode fazer consultas caras e integração pode consultar configurações ou mapeamentos repetidamente. Isso não significa instanciar Redis diretamente dentro do plugin.

Declare caches em `db/caches.php` e use MUC. O administrador decide a store.

```php
$definitions = [
    'mapping' => [
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Depois.

```php
$cache = cache::make('local_institutionhub', 'mapping');
$value = $cache->get($externalid);
```

A parte mais importante continua sendo invalidação. Se um mapeamento muda no banco, o código precisa invalidar o cache correspondente. Cache sem estratégia de invalidação não é otimização, é atraso programado de bug.

## 15.25 Web Services próprios

Se outro sistema precisa chamar o Moodle, um plugin `local` é um lugar comum para definir External Functions e serviços em `db/services.php`.

A External API precisa validar parâmetros, contexto e capability como vimos no capítulo anterior. Não coloque a regra de negócio dentro do método `execute()` se ela também pode ser usada em outros fluxos.

```php
public static function execute(int $userid): array {
    global $PAGE;

    $params = self::validate_parameters(
        self::execute_parameters(),
        ['userid' => $userid]
    );

    $context = context_system::instance();
    self::validate_context($context);
    require_capability('local/institutionhub:readsync', $context);

    return \local_institutionhub\service\user_sync::status($params['userid']);
}
```

O endpoint é adaptador. A regra vive no service.

## 15.26 AJAX da interface

A tela administrativa também pode chamar External Functions com `core/ajax`, sem criar um arquivo `ajax.php` improvisado que lê `$_POST`, executa SQL e devolve JSON manualmente.

Se a operação possui contrato reutilizável e é adequada para AJAX, use a External API com o sinalizador correspondente, respeitando sesskey, autenticação, contexto e capability.

Isso deixa o mesmo conjunto de regras do Moodle trabalhando a seu favor.

## 15.27 Moodle chamando sistemas externos

Plugin `local` aparece muito do outro lado da integração, quando o Moodle precisa chamar ERP, CRM, gateway, serviço de vídeo ou qualquer API externa.

Use a API Curl do Moodle em vez de criar cliente HTTP improvisado com `file_get_contents()` ou `curl_init()` espalhado por várias classes.

Centralize o cliente.

```php
namespace local_institutionhub\integration;

final class erp_client {
    public function get_user(string $externalid): array {
        $curl = new \curl();

        $response = $curl->get(
            get_config('local_institutionhub', 'baseurl') . '/users/' . rawurlencode($externalid),
            [],
            [
                'CURLOPT_TIMEOUT' => 15,
            ]
        );

        return json_decode($response, true, 512, JSON_THROW_ON_ERROR);
    }
}
```

Em produção, ainda precisamos lidar com status HTTP, timeout, erros de rede, autenticação, retry, rate limit e logs sem expor segredo.

## 15.28 Retry não pode ser cego

Se o servidor externo responde `500`, talvez faça sentido repetir depois. Se responde `400` porque o payload é inválido, repetir cem vezes só aumenta ruído.

Se responde `429`, pode haver `Retry-After`. Se a operação cria cobrança ou matrícula, repetir sem idempotency key pode duplicar efeito.

O plugin local costuma ser a ponte entre sistemas e, por isso, precisa entender diferença entre falha transitória e falha permanente.

## 15.29 Webhooks de entrada

Quando o sistema externo avisa o Moodle, o plugin pode receber webhook. A sequência segura normalmente é curta no endpoint.

Receber corpo bruto, validar assinatura, validar timestamp ou proteção contra replay quando o protocolo permitir, registrar identificador idempotente, persistir o mínimo necessário e enfileirar processamento.

Não faça um processo de quinze segundos dentro do webhook se o provedor espera resposta rápida. E não confie em `userid`, `courseid` ou qualquer outro dado vindo do payload sem verificar relacionamento e estado interno.

## 15.30 Logs de integração

Logs são essenciais quando dois sistemas conversam, mas não devemos confundir log técnico com depósito de payload integral.

Guarde identificador da operação, direção, entidade, resultado, status externo, tentativa, tempo e correlation id quando isso ajuda suporte. Evite senha, token, segredo e dados pessoais desnecessários.

Para ações Moodle significativas, Events API pode ser o mecanismo correto de log. Para observabilidade operacional da integração, pode existir log técnico específico, desde que tenha retenção e propósito definidos.

## 15.31 Sem core hack

Um dos melhores usos de `local` é justamente substituir core hack por extensão suportada. Se a instituição possui código dentro de `user/editadvanced.php`, `course/view.php` ou `lib/moodlelib.php`, a primeira pergunta deveria ser se aquilo pode ser movido para Event, Hook, callback, Navigation API, Output API ou outra extensão pública.

Nem todo hack possui substituto perfeito, mas muitos possuem.

A diferença operacional é enorme. Com core hack, cada upgrade exige reaplicar patch e resolver conflito. Com plugin, o core permanece atualizável e a compatibilidade fica concentrada no componente.

O plugin `local` não deve ser justificativa para continuar alterando core. Ele deve ser uma das ferramentas para parar de alterar core.

## 15.32 Personalização institucional

Existe uma categoria de demanda que é praticamente a casa natural do `local`. Regras específicas de uma organização que não fazem sentido para o ecossistema Moodle inteiro.

Um exemplo pode ser bloquear determinada operação quando existe pendência no ERP, acrescentar uma tela administrativa de reconciliação, sincronizar um identificador interno, disponibilizar um dashboard institucional ou disparar fluxo interno após determinado evento.

A regra é local à instituição, daí o nome fazer bastante sentido historicamente. Mesmo assim, ela deve usar APIs públicas, possuir capabilities, testes, upgrade e isolamento como qualquer plugin distribuído publicamente.

Ser "só para este cliente" não é desculpa para escrever código descartável, porque justamente esses plugins costumam sobreviver por muitos anos.

## 15.33 Dependências com outros plugins

Um plugin local pode depender de outro plugin, mas essa dependência deve ser explícita e consciente.

Se `local_institutionhub` só funciona quando `mod_customactivity` está instalado, declare a dependência em `version.php` quando aplicável e organize o código para falhar de forma clara.

Não assuma silenciosamente que qualquer plugin opcional existe em todos os Moodle. Até plugins distribuídos com uma instalação podem ser desabilitados ou variar entre ambientes.

Quando a comunicação entre componentes puder acontecer por Event ou Hook sem acoplamento direto, isso pode ser melhor. Quando uma chamada direta é parte real do contrato, prefira dependência explícita a um `class_exists()` espalhado por cinquenta lugares.

## 15.34 Subplugins e plugin local

Plugins `local` podem hospedar subplugins quando possuem uma arquitetura que realmente precisa ser estendida por componentes filhos. Isso é poderoso, mas não é assunto para inventar no primeiro dia do projeto.

Se o plugin possui três integrações e todas podem viver como classes internas, talvez subplugin seja complexidade desnecessária. Se o projeto virou uma plataforma onde outras equipes precisam instalar conectores independentes, com ciclo de vida e versão próprios, aí subplugins podem fazer sentido e serão tratados no capítulo específico.

## 15.35 Arquitetura de um projeto completo

Vamos juntar as peças em um fluxo real. O `local_institutionhub` precisa sincronizar usuários com um ERP, oferecer dashboard de acompanhamento e permitir que gestores reprocesssem falhas.

Quando um usuário muda no Moodle, `user_updated` dispara. O observer não chama o ERP, ele cria uma Adhoc Task contendo o `userid`. A task adquire lock daquele usuário e chama `user_sync_service`. O service carrega usuário e mapeamento, usa `erp_client` para enviar dados e registra o resultado. Em sucesso, invalida cache do dashboard. Em erro transitório, deixa a task falhar de maneira que o scheduler possa repetir conforme a estratégia escolhida. Em erro permanente, registra status que aparece para o gestor.

A página `index.php` exige login e capability, chama uma classe de consulta que utiliza cache quando apropriado, prepara um `templatable` e renderiza Mustache. Nenhum `renderer.php` é criado só para isso.

O botão "reprocessar" chama uma External Function via `core/ajax`. Essa função valida parâmetros, contexto, capability e propriedade do registro, depois enfileira nova task em vez de conversar com o ERP dentro do clique.

Uma Scheduled Task roda a cada certo intervalo buscando itens que ficaram inconsistentes, mas trabalha em lotes e utiliza Lock API para não competir com outro worker.

Esse fluxo usa vários recursos do Moodle, mas cada um faz uma coisa só.

## 15.36 O que fica em cada lugar

Uma divisão simples ajuda bastante.

`index.php` faz bootstrap e coordena a página. `settings.php` declara configuração. `db/access.php` declara capabilities. `db/events.php` registra observers. `db/hooks.php` registra Hooks. `db/tasks.php` declara tarefas recorrentes. `db/services.php` expõe External Functions. `db/caches.php` descreve caches. `db/install.xml` descreve schema inicial e `db/upgrade.php` evolui o schema.

Dentro de `classes/`, observers recebem eventos, task executa unidade de trabalho, external adapta chamada externa para service, integration conversa com outro sistema, output prepara dados para template e services concentram regra de negócio.

Essa organização não é religião. O importante é que o nome e o lugar ajudem quem abrir o código daqui a dois anos a descobrir onde uma regra está.

## 15.37 O que eu evitaria

Eu evitaria `lib.php` com regra de negócio, `ajax.php` manual para tudo, HTML dentro de classe de banco, consulta de banco em `settings.php`, cron que processa milhão de registros sem lote, observer fazendo HTTP síncrono, task sem idempotência, URL montada por concatenação, capability sempre no contexto system, token aparecendo em log e acesso direto a tabelas internas de outro plugin quando existe API pública.

Também evitaria criar uma classe chamada `utils` e jogar dentro dela tudo que não encontramos onde colocar. Normalmente isso é apenas um `lib.php` gigante disfarçado de orientação a objetos.

## 15.38 Local não quer dizer global o tempo inteiro

Existe outro erro conceitual. Como o plugin se chama `local`, alguns desenvolvedores tratam tudo nele como global ao site.

Mas o escopo de uma ação depende do domínio. Uma página pode trabalhar com um curso específico e utilizar `context_course`. Um serviço pode processar usuário e trabalhar com `context_user`. Uma integração pode ter configuração global, enquanto determinada operação precisa respeitar capability em contexto de curso.

O tipo do plugin diz como ele se encaixa no sistema de extensões, não qual contexto toda função deve usar.

## 15.39 Local não significa código executado em toda página

Instalar um plugin `local` também não significa que todo código dentro dele é executado automaticamente em qualquer acesso ao Moodle. O que executa depende dos pontos de integração que o plugin registra.

Um observer roda quando o evento correspondente acontece. Um Hook callback roda quando aquele Hook é disparado. Uma Scheduled Task depende do cron. Uma página roda quando é acessada. Um callback em `lib.php` roda quando o core chama aquele callback. Um módulo JavaScript roda quando a página o carrega.

Essa distinção é importante porque muita gente coloca código no arquivo errado acreditando que o simples fato de estar dentro de `local` faz dele "global".

## 15.40 Quando preciso executar algo ao acessar qualquer atividade

Voltemos a um exemplo prático. Você tem um `mod_meuplugin`, mas percebe que a regra precisa acontecer quando o aluno acessa qualquer atividade, não apenas `mod_meuplugin`.

Não faz sentido copiar o código para todos os módulos. Também não faz sentido transformar todas as atividades em dependência do seu `mod`.

Procure primeiro um Event ou Hook que represente o ponto de extensão necessário. Se o Moodle dispara evento de visualização adequado, um plugin transversal pode observá-lo e terá informações como usuário, contexto, course module e objeto relacionado conforme o evento. A partir daí, a regra decide se precisa agir.

O importante é entender que o `mod` continua responsável por sua atividade, enquanto a regra transversal pertence a outro componente ou serviço. Essa separação evita que uma atividade assuma responsabilidade pelo ecossistema inteiro.

## 15.41 Performance de plugin local

Plugin local pode facilmente afetar o site inteiro porque alguns de seus pontos de extensão são chamados em muitas páginas. Por isso, performance precisa ser tratada com mais cuidado, não menos.

Callbacks de navegação, Hooks muito frequentes e observers comuns não devem fazer consultas repetidas sem necessidade. Use carregamento preguiçoso, cache quando houver estratégia de invalidação e Tasks para trabalho pesado.

Se uma função roda em cada page load e adiciona 30 ms, isso parece pequeno no seu navegador, mas em uma instalação com milhões de requisições o custo fica significativo.

## 15.42 Segurança de plugin institucional

Como `local` costuma integrar sistemas e concentrar funcionalidades administrativas, ele frequentemente manipula dados sensíveis e operações poderosas.

Cada entrada deve usar Parameter API adequada. Toda ação precisa de autenticação e autorização coerentes. Mudanças de estado via formulário ou ação web precisam de proteção contra CSRF. Dados exibidos precisam de escaping e formatação corretos. SQL precisa de parâmetros. Arquivos precisam passar pelo Files API e `pluginfile()` quando aplicável.

Integração externa adiciona outra fronteira de segurança. Token, webhook, SSRF, redirect, TLS, rate limit e logs passam a fazer parte do projeto.

Plugin local não é atalho em torno da segurança do Moodle. Ele está dentro do Moodle e precisa respeitar o mesmo modelo.

## 15.43 Testabilidade

Quando toda regra fica dentro de `index.php`, observer e task, testar vira difícil. Separar services melhora não só organização, mas também teste.

Uma classe que recebe dados, aplica regra e usa dependências claras pode ser exercitada em PHPUnit. A task pode ser testada para garantir que chama o serviço correto. A External Function pode ser testada em permissões, validação e retorno.

Nos capítulos de testes vamos aprofundar isso, mas vale construir o plugin pensando desde já que código testável geralmente é também código menos acoplado ao ponto de entrada.

## 15.44 Compatibilidade de versões

Plugin institucional muitas vezes precisa suportar mais de uma branch do Moodle. Nesse cenário, o desenho deve considerar as APIs mínimas disponíveis.

Hooks, atributos PHP, mudanças em frontend, Routing API e outras evoluções não chegaram todas na mesma versão. Não copie código da documentação 5.2 para um plugin que declara suporte ao Moodle 4.1 sem verificar compatibilidade.

Às vezes a melhor estratégia é uma branch do plugin por linha principal do Moodle. Em outros casos, um único código com pequenas camadas de compatibilidade é suficiente. O capítulo de upgrade e compatibilidade tratará isso com profundidade.

## 15.45 Um exemplo de fluxo de instalação

Quando `local_institutionhub` é instalado, o Moodle lê `version.php`, processa schema inicial, capabilities, tasks, services, eventos e demais arquivos declarativos conforme o ciclo de instalação.

Plugins locais possuem algumas particularidades de ordem no ciclo de plugins e tradicionalmente são processados por último entre tipos de plugin em instalação e upgrade. Isso pode ser útil em personalizações que dependem do restante do ambiente, mas não deve ser usado como desculpa para dependência implícita.

Se existe uma dependência real, declare e trate essa dependência. Ordem de instalação não é contrato de negócio.

## 15.46 Projeto completo do capítulo

O exercício deste capítulo é construir um `local_institutionhub` funcional, mas sem tentar fazer um ERP inteiro. O objetivo é demonstrar a arquitetura integrada.

O plugin deve possuir uma configuração de URL externa e habilitação da integração, uma capability para visualizar o dashboard e outra para reprocessar falhas, uma tabela de fila ou status, um observer de atualização de usuário, uma Adhoc Task para sincronização, uma Scheduled Task de reconciliação, Lock API por usuário, cache para o resumo do dashboard, uma página Mustache sem renderer próprio, uma External Function utilizada pelo frontend via `core/ajax` e um cliente HTTP separado para conversar com o sistema externo.

O serviço pode ser simulado. Não precisamos de um ERP real. A resposta pode vir de um endpoint de teste ou de uma implementação fake durante os testes. O importante é demonstrar onde cada responsabilidade fica.

## 15.47 Passo 1, configuração

Crie `settings.php` com pelo menos `enabled`, `baseurl` e timeout. Não consulte o servidor externo durante a construção da árvore administrativa.

Na classe cliente, leia configuração com `get_config()`. Se `enabled` estiver desligado, o service deve tratar isso explicitamente, sem fazer tentativa de rede.

## 15.48 Passo 2, capabilities

Crie `local/institutionhub:viewdashboard` e `local/institutionhub:reprocess` em `db/access.php`.

A página inicial exige a primeira. O endpoint AJAX que enfileira reprocessamento exige a segunda.

Teste com um usuário que pode ver e não pode reprocessar. Esse cenário é melhor do que conceder uma capability única chamada `manage` para tudo.

## 15.49 Passo 3, persistência

Crie uma tabela para registrar estado de sincronização por usuário. Ela pode guardar `userid`, identificador externo, último status, última tentativa, mensagem resumida de erro e timestamps.

Crie os índices necessários para as consultas que realmente serão executadas, principalmente por `userid`, status e próximo processamento quando houver fila baseada no banco.

Não adicione índice em toda coluna por reflexo. Cada índice também custa escrita e espaço.

## 15.50 Passo 4, observer e fila

Registre `user_updated`. No observer, faça o mínimo. Verifique apenas condições baratas indispensáveis e enfileire Adhoc Task.

Evite montar payload enorme com objeto completo dentro de `custom_data`. Muitas vezes basta guardar o identificador e carregar o estado atual na execução. Isso reduz serialização, evita payload obsoleto e mantém a task pequena.

## 15.51 Passo 5, task e lock

A task recebe `userid`, adquire lock, chama o service e libera o lock em `finally`.

O service deve poder ser chamado também por reprocessamento manual e por reconciliação. Se cada ponto de entrada implementar a sincronização sozinho, em pouco tempo teremos três versões diferentes da mesma regra.

## 15.52 Passo 6, dashboard

A página lê um resumo, preferencialmente por uma classe de consulta própria, e envia dados ao Mustache.

O template mostra quantidade de sincronizações com sucesso, falha e pendência, além das últimas falhas. Não busque todos os registros para contar em PHP se o banco pode agregar corretamente.

Cache o resumo apenas se houver benefício real e defina quando invalidar. Atualização do status de sincronização é um bom ponto para invalidar a chave correspondente.

## 15.53 Passo 7, reprocessamento via AJAX

O botão de reprocessar chama uma External Function. Ela recebe o identificador, valida parâmetros, contexto, capability e existência do registro.

Depois enfileira uma nova task e devolve estado simples ao frontend. Ela não faz HTTP com ERP durante a requisição AJAX.

O JavaScript mostra notificação de que o item foi colocado na fila. Se o usuário precisar acompanhar resultado, a interface consulta status depois ou atualiza em nova visita, dependendo do requisito.

## 15.54 Passo 8, reconciliação

A Scheduled Task procura registros pendentes ou inconsistentes em lotes. Para cada item, pode enfileirar Adhoc Task em vez de executar toda sincronização dentro de uma tarefa monolítica.

Isso melhora paralelismo e retry, mas não deve criar milhões de tasks sem controle. Escolha tamanho de lote e limite de fila de acordo com o ambiente.

## 15.55 Passo 9, observabilidade

Use `mtrace()` nas Tasks para informação operacional adequada ao cron. Registre eventos do Moodle para ações significativas do usuário, como reprocessamento manual, quando fizer sentido.

Para integração, mantenha correlation id e estado técnico suficiente para suporte descobrir o que aconteceu sem armazenar segredo ou payload completo sem necessidade.

## 15.56 Passo 10, falhas reais

Simule alguns cenários. API indisponível, timeout, resposta inválida, usuário sem mapeamento, capability negada, cron parado, duas tasks concorrentes e cache antigo.

Um projeto só parece pronto enquanto testamos o caminho feliz. O valor do capítulo está justamente em observar se a arquitetura continua compreensível quando alguma coisa dá errado.

## 15.57 Revisão arquitetural

No fim, olhe o plugin e tente responder rapidamente onde fica cada responsabilidade.

Onde está a chamada externa? Onde a regra de sincronização vive? Onde a página prepara dados? Onde permissionamento é declarado? Onde Tasks são registradas? Onde cache é definido? Onde schema evolui? Onde Hooks e observers são declarados?

Se a resposta para quase tudo for `lib.php`, ainda não terminamos.

Se a resposta exigir abrir quinze abstrações para descobrir como um boolean é salvo, fomos para o exagero oposto.

Boa arquitetura em plugin Moodle não é quantidade de classes. É conseguir entender o fluxo e alterar uma responsabilidade sem quebrar cinco outras.

## 15.58 O que este capítulo fecha

Até aqui estudamos arquitetura do Moodle, tipos de plugins, estrutura, qualidade de código, banco, Output API, Forms, segurança, Files API, Events, Hooks, Tasks, cache, APIs transversais e Web Services. O plugin `local` é um bom ponto para juntar tudo porque ele não impõe um domínio tão específico quanto atividade ou matrícula.

Isso não significa que agora todo projeto deve ser `local`. Significa que, depois de entender todas essas APIs, você consegue usar `local` como extensão institucional de verdade, sem transformá-lo em pasta de sobras.

Nos próximos capítulos vamos voltar aos tipos especializados e perceber justamente o contrário: muitas coisas que implementamos manualmente em um `local` aparecem prontas quando escolhemos `block`, `mod`, `enrol` ou `auth`, porque esses tipos possuem contratos próprios com o Moodle.

## Referências

Moodle Developer Resources. Local plugins. https://moodledev.io/docs/5.2/apis/plugintypes/local

Moodle Developer Resources. Plugin types. https://moodledev.io/docs/5.2/apis/plugintypes

Moodle Developer Resources. Component communication. https://moodledev.io/general/development/policies/component-communication
