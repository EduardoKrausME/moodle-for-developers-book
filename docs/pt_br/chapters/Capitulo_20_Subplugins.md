{% raw %}

# 20 SUBPLUGINS

Você tem um plugin que conversa com três sistemas externos. Então cria três classes. Chega o quarto, o quinto, o décimo e aparece aquele `switch` simpático: "se for SAP, faz isso; se for Totvs, faz aquilo; se for API X, chama outra classe". Em algum ponto fica claro que o plugin pai não deveria conhecer cada implementação concreta.

É exatamente esse tipo de problema que subplugins resolvem bem. Não porque "plugin dentro de plugin" seja uma organização bonita de diretórios, mas porque o componente pai pode declarar um contrato e permitir que cada implementação tenha versão, classes, configuração, banco e ciclo de vida próprios.

Pense no pai como quem define a pergunta e no subplugin como quem oferece uma resposta. O Quiz sabe que existem tipos de relatório e regras de acesso; Assignment sabe que existem tipos de submissão e feedback. Eles não precisam incorporar todas as variações numa classe central. Nos exemplos reais deste capítulo, a mesma ideia aparece nos `biblocks` e `bifilters` do Kopere BI, nos `geniaicontroller` do GeniAI e nos `certificatebeautifuldatainfo` do Beautiful Certificate. A lógica específica precisa morar no filho; caso contrário você ganhou novas pastas e continuou com a mesma arquitetura centralizada de antes.

## 20.1 O que é um subplugin

Subplugin é um plugin cujo tipo é declarado por outro plugin. No Kopere BI, por exemplo, `biblocks_pie` só existe como tipo reconhecido porque `local_kopere_bi` declara `biblocks` como um dos seus tipos de subplugin e informa ao core em qual diretório esses componentes ficam.

O subplugin continua sendo um plugin de verdade. Ele possui componente próprio, `version.php`, strings de idioma, classes e pode ter banco, Events, Hooks, Tasks, Privacy e outros recursos compatíveis com plugins Moodle. A diferença é que seu tipo não nasceu diretamente no core; nasceu em outro plugin.

## 20.2 O plugin pai é quem cria o ponto de extensão

Não existe subplugin sem plugin pai. O pai é responsável por declarar que aceita extensões e, principalmente, por definir o que essas extensões significam.

O GeniAI mostra isso de forma simples. `local_geniai` declara o tipo `geniaicontroller` e mantém uma interface pública chamada `controller_interface`. Um controller precisa conseguir informar se está configurado e precisa saber gerar uma completion. O pai conhece esse contrato; não precisa conhecer internamente a API de cada provedor.

Esse é o ponto que diferencia extensibilidade de desorganização. Declarar uma pasta em `subplugins.json` resolve descoberta. O contrato é o que transforma aquelas pastas em partes intercambiáveis de uma arquitetura.

## 20.3 Quando subplugin faz sentido

Subplugin faz sentido quando existe um componente principal com responsabilidade clara e variações independentes de uma parte dessa responsabilidade. O Quiz possui relatórios e regras de acesso. Assignment possui tipos de submissão e feedback.

No Kopere BI acontece algo parecido. O plugin principal cuida do dashboard, persistência, administração, utilitários e fluxo geral. Os tipos `biblocks` representam formas diferentes de apresentar indicadores, como `pie`, `line`, `table`, `maps` e outras. Já `bifilters` representam filtros independentes, como curso, usuário e coorte.

Eu poderia ter colocado todas essas variações dentro de `local_kopere_bi` e criado um grande `switch`. Funcionaria. E seria exatamente o tipo de arquitetura que fica pior a cada novo bloco ou filtro.

## 20.4 Quando não criar subplugins

Nem toda classe intercambiável precisa virar subplugin. Se existem duas estratégias pequenas que sempre serão distribuídas juntas, uma interface interna e duas classes podem ser suficientes. Criar um novo plugin type aumenta o custo de manutenção, instalação, testes, versionamento e documentação.

Também não use subplugin apenas para organizar diretórios. Se a funcionalidade nunca será instalada, atualizada ou distribuída separadamente, provavelmente você está tentando resolver organização de código com uma ferramenta de extensibilidade.

## 20.5 Subplugin não é dependência comum

Um plugin pode depender de outro sem ser subplugin. Um `local_reports` pode declarar dependência de `mod_quiz` e continuar sendo um plugin independente. Nesse caso existe uma relação de dependência, mas `local_reports` não passa a fazer parte de um tipo criado pelo Quiz.

No subplugin a relação é mais forte. O próprio tipo é definido pelo pai e, conforme a política de comunicação de componentes do Moodle, o filho pode assumir a presença de seu host, enquanto não deve assumir a presença de outros plugins opcionais sem declarar ou verificar essa dependência.

## 20.6 Quais plugins podem hospedar subplugins

A documentação de arquitetura do Moodle restringe a capacidade de hospedar subplugins a determinados tipos, entre eles activity modules, editors, administration tools e local plugins. Não é correto imaginar que qualquer plugin type pode criar `db/subplugins.json` e automaticamente se transformar em host.

Kopere BI e GeniAI são `local`, enquanto Beautiful Certificate é `mod`. Os três conseguem hospedar subplugins porque seus tipos permitem esse desenho.

## 20.7 Frankenstyle do subplugin

O Frankenstyle combina o tipo do subplugin com seu nome. No Kopere BI, o tipo `biblocks` e o nome `pie` formam:

```
biblocks_pie
```

Isso aparece em namespace, strings, configuração e outras APIs:

```php
get_string('pluginname', 'biblocks_pie');
get_config('biblocks_pie', 'enabled');
```

O nome `local_kopere_bi` não precisa aparecer no componente do filho porque a relação com o pai já é conhecida pelo tipo `biblocks`.

## 20.8 Estrutura de diretórios do pai

No Kopere BI a estrutura real inclui dois diretórios de subplugins:

```
local/kopere_bi/
    biblocks/
    bifilters/
    classes/
    db/
        subplugins.json
    lang/
    settings.php
    version.php
```

O nome desses diretórios não é descoberto por convenção solta. Ele é declarado pelo pai em `db/subplugins.json`.

## 20.9 Estrutura de um subplugin

O bloco de gráfico de pizza existe em:

```
local/kopere_bi/biblocks/pie/
    classes/
        provider.php
    lang/
    templates/
    version.php
```

O namespace da implementação é `biblocks_pie` e a classe `provider` implementa o contrato `local_kopere_bi\block\i_block_provider`.

Ele está fisicamente dentro da árvore do pai, mas continua possuindo identidade própria.

## 20.10 `db/subplugins.json`

O arquivo real do Kopere BI é um ótimo exemplo porque mostra dois tipos e compatibilidade entre formatos:

```json
{
  "subplugintypes": {
    "bifilters": "bifilters",
    "biblocks": "biblocks"
  },
  "plugintypes": {
    "bifilters": "local/kopere_bi/bifilters",
    "biblocks": "local/kopere_bi/biblocks"
  }
}
```

A chave é o plugin type criado pelo pai. No formato moderno o caminho é relativo à raiz do pai; no formato legado ele parte da raiz do Moodle.

## 20.11 A mudança do Moodle 5.0

No Moodle 5.0 houve uma mudança no metadata de subplugins. O objeto moderno passou a se chamar `subplugintypes` e seus caminhos são relativos à raiz do plugin pai.

Antes disso era utilizado `plugintypes`, com caminhos relativos à raiz inteira do Moodle. O arquivo do Kopere BI mantém os dois formatos justamente para atravessar branches diferentes sem transformar `biblocks` em dois tipos distintos.

## 20.12 `subplugintypes` no Moodle 5.0 ou superior

A parte moderna do arquivo é:

```json
{
  "subplugintypes": {
    "bifilters": "bifilters",
    "biblocks": "biblocks"
  }
}
```

Como o arquivo pertence a `local_kopere_bi`, `biblocks` é interpretado relativamente à raiz desse plugin.

## 20.13 `plugintypes` nas branches antigas

O mesmo projeto mantém a declaração legada:

```json
{
  "plugintypes": {
    "bifilters": "local/kopere_bi/bifilters",
    "biblocks": "local/kopere_bi/biblocks"
  }
}
```

Aqui o caminho é absoluto dentro da árvore de plugins do Moodle.

## 20.14 Suportando Moodle 4.5 e Moodle 5.x no mesmo código

Quando o host precisa atravessar essa fronteira, declarar os dois objetos evita espalhar detecção de versão pela regra de negócio. O component manager de cada branch lê o formato que conhece.

O ponto mais importante é manter as mesmas chaves. `biblocks` precisa continuar sendo `biblocks` nos dois formatos. Compatibilidade de metadata não deve mudar a identidade do componente.

## 20.15 As chaves precisam continuar iguais

Não crie `biblocks` no objeto moderno e `bicharts` no legado. Isso faria a mesma família de plugins parecer dois tipos diferentes dependendo da versão do Moodle.

A compatibilidade deve mudar a forma como o caminho é descrito, não o nome lógico do tipo.

## 20.16 O que o Moodle faz com essa declaração

Depois de conhecer o tipo, o component manager consegue mapear `biblocks` e `bifilters` para seus diretórios e descobrir implementações sem o pai varrer filesystem manualmente.

Por isso o Kopere BI não precisa de um `glob()` inventado para localizar todos os gráficos. Código de negócio deve trabalhar com as APIs de componentes, deixando descoberta e cache para o core.

## 20.17 `core_component::get_subplugins()`

Para consultar os tipos definidos pelo pai:

```php
$types = core_component::get_subplugins('local_kopere_bi');
```

O retorno descreve os tipos de subplugin conhecidos para aquele componente.

## 20.18 `core_plugin_manager::get_subplugins()`

O plugin manager também possui `get_subplugins()`, mas em escopo mais amplo, útil para administração, diagnóstico e ferramentas que precisam enxergar relações entre vários hosts.

```php
$manager = core_plugin_manager::instance();
$definitions = $manager->get_subplugins();
```

## 20.19 `get_subplugins_of_plugin()`

Quando o pai já é conhecido:

```php
$manager = core_plugin_manager::instance();
$plugins = $manager->get_subplugins_of_plugin('local_kopere_bi');
```

Isso é mais robusto do que deduzir componentes a partir de diretórios.

## 20.20 Descobrir plugins de um tipo específico

O próprio Kopere BI usa a ideia de descobrir implementações por tipo. Para `biblocks`:

```php
$blocks = core_component::get_plugin_list('biblocks');
```

A classe `local_kopere_bi\plugininfo\biblocks` trabalha com essa lista para gerenciamento dos filhos.

## 20.21 `plugininfo`

O Kopere BI possui classes de `plugininfo` próprias para `biblocks` e `bifilters`. Elas participam da administração, permitem controlar instalação/desinstalação e definem como esses componentes aparecem para o administrador.

Isso é diferente do contrato funcional. `plugininfo` descreve o componente para o gerenciador de plugins; `i_block_provider` e `i_filter_provider` dizem o que a implementação precisa fazer em runtime.

## 20.22 O pai precisa definir um contrato

Aqui aparece a pergunta que decide se você realmente criou uma arquitetura extensível: o pai consegue trabalhar com um filho sem saber antecipadamente qual implementação concreta está instalada?

No GeniAI, o contrato é explícito:

```php
namespace local_geniai;

interface controller_interface {
    public function completions(array $messages, $replacemodel = "");

    public function is_configured();
}
```

O pai sabe pedir uma completion e sabe perguntar se o controller está configurado. Ele não precisa conhecer como ChatGPT, outro provedor ou uma implementação futura monta a requisição.

## 20.23 Interface ou classe abstrata

Interface funciona bem quando o pai quer definir comportamento e não existe implementação comum suficiente para justificar herança. O GeniAI segue exatamente esse caminho: `controller_interface` é pequena e não existe uma superclasse enorme obrigando cada provedor a herdar decisões que talvez não façam sentido.

Classe abstrata continua sendo válida quando existe comportamento realmente compartilhado. A regra não é "subplugin precisa de base class"; é "o contrato precisa ser explícito".

## 20.24 Base class

O fato de o GeniAI não precisar de base class é um exemplo útil. É muito fácil criar uma superclasse porque parece mais arquitetural e depois colocar ali configuração, HTTP, logging, parsing e regras específicas de vários provedores.

Se não existe comportamento comum estável, uma interface pequena é melhor. Adicione uma classe base apenas quando repetição real justificar a herança, não para preencher uma peça de diagrama.

## 20.25 Implementação no subplugin

O controller ChatGPT implementa o contrato do pai:

```php
namespace geniaicontroller_chatgpt;

use local_geniai\controller_interface;

class controller implements controller_interface {
    public function is_configured() {
        // Verifica a configuração necessária.
    }

    public function completions(array $messages, $replacemodel = "") {
        // Implementação específica do provedor.
    }
}
```

A lógica específica da API fica no filho. O pai trabalha com `controller_interface`.

## 20.26 Factory

O GeniAI também possui um exemplo real da parte que muita gente acaba chamando de factory. `local_geniai\controller::get_instance()` descobre o controller escolhido, monta a classe esperada e valida o contrato:

```php
$classname = "\\" . self::PLUGIN_TYPE . "_" . $name . "\\controller";

if (!class_exists($classname)) {
    throw new coding_exception(
        "Invalid GeniAI controller class: {$classname}"
    );
}

$instance = new $classname();

if (!($instance instanceof controller_interface)) {
    throw new coding_exception("Invalid controller contract.");
}
```

Centralizar isso evita espalhar construção dinâmica de classname pelo plugin.

## 20.27 Factory não substitui descoberta

Antes de instanciar, o GeniAI descobre controllers com:

```php
core_component::get_plugin_list("geniaicontroller");
```

Esse detalhe importa. A entrada do administrador escolhe entre componentes que o Moodle já reconheceu; ela não vira um nome de classe arbitrário vindo diretamente da requisição.

## 20.28 Dispatcher

No GeniAI o método estático `controller::completions()` funciona como uma fronteira simples de despacho:

```php
public static function completions(array $messages, $replacemodel = "") {
    return self::get_instance()->completions(
        $messages,
        $replacemodel
    );
}
```

Quem consome o serviço não precisa saber qual provider está ativo. A escolha e a validação ficam concentradas no componente pai.

## 20.29 Habilitar e desabilitar subplugins

Instalado e habilitado não são sinônimos. O Kopere BI deixa isso explícito em suas classes `plugininfo`. Um `biblocks_*` pode existir no filesystem e continuar desabilitado por configuração.

Essa separação é útil porque remover um componente pode significar também remover configuração, arquivos ou itens que dependem dele. Às vezes você quer apenas impedir execução sem destruir o que já existe.

## 20.30 Configuração global do pai e configuração do filho

O pai deve guardar configurações que pertencem ao sistema como um todo, por exemplo tamanho de lote e política de retry. O filho deve guardar configurações específicas de sua implementação, como endpoint, tenant ou identificador de fila.

```php
$defaultpie = get_config('local_kopere_bi', 'chart_pie_default');
$enabled = get_config('biblocks_pie', 'enabled');
```

Essa divisão evita que o pai acumule dezenas de settings que só fazem sentido quando determinado subplugin está instalado.

## 20.31 `settings.php` nos subplugins

Como um subplugin é um componente real, ele pode possuir `settings.php`. Porém o local exato onde a página aparecerá na árvore administrativa pode depender do plugin pai e de como ele organiza seus settings.

Em hosts mais sofisticados, o pai monta uma categoria própria e inclui ou referencia configurações dos filhos. O ponto importante é não fazer o filho depender de HTML ou rotas internas do pai sem um contrato estável.

## 20.32 `version.php` do subplugin

Cada subplugin possui seu próprio `version.php`:

```php
$plugin->component = 'biblocks_pie';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
```

As versões do pai e do filho não precisam avançar juntas. Isso é uma das grandes vantagens de separar implementações independentes.

## 20.33 Dependência explícita do pai

Mesmo que a relação de subplugin já implique a presença do host, declarar dependências quando apropriado torna requisitos de versão mais claros, principalmente quando o contrato do pai evolui.

```php
$plugin->dependencies = [
    'local_kopere_bi' => 2026092300,
];
```

Assim um subplugin que depende de uma interface introduzida em determinada versão não é instalado silenciosamente em um pai antigo.

## 20.34 Evite dependência circular

O pai define o contrato e o filho depende do pai. Se o pai começa a depender diretamente de `biblocks_pie`, você criou uma dependência circular conceitual e destruiu a extensibilidade.

O pai pode saber que existem filhos instalados por descoberta, mas não deveria exigir uma implementação específica para funcionar, salvo se isso for uma decisão explícita do produto e estiver refletida nas dependências.

## 20.35 Instalação do subplugin

Como componente próprio, o subplugin pode possuir `db/install.xml` e `db/install.php`. Suas tabelas precisam usar prefixos coerentes com seu componente e existir apenas quando realmente pertencem à implementação.

Um conector que precisa guardar mapeamentos externos pode ter tabela própria, enquanto o pai mantém fila e auditoria comuns. Essa separação facilita remoção e atualização independente.

## 20.36 Upgrade do subplugin

O subplugin também possui `db/upgrade.php` e sua função `xmldb_[component]_upgrade()` segue o mesmo princípio dos outros plugin types.

Não coloque todas as mudanças de schema dos filhos dentro do `upgrade.php` do pai. Isso força o pai a conhecer internamente versões e tabelas de extensões que deveriam ser independentes.

## 20.37 Upgrade do pai e evolução do contrato

Agora pense no problema pelo lado de quem mantém um subplugin de terceiro. Você altera a interface do pai numa terça-feira e publica a nova versão. O que acontece com quem implementava o contrato antigo? Extensibilidade é fácil quando todos os componentes estão no mesmo repositório; ela fica interessante quando versões diferentes precisam conviver.

A parte mais delicada é quando o pai muda a interface que os filhos implementam. Alterar um método obrigatório pode quebrar todos os subplugins terceiros de uma vez.

Prefira evolução compatível, métodos novos opcionais quando possível, interfaces versionadas em mudanças grandes ou um período de depreciação claro. Subplugin transforma sua API interna em uma API para terceiros, portanto mudanças precisam ser tratadas com o mesmo cuidado de qualquer API pública.

## 20.38 API pública do pai

Se terceiros vão construir subplugins, o código usado por eles precisa ser conscientemente público. Não espere que desenvolvedores externos importem classes de namespace `local` que você pretende reescrever a cada versão e depois culpe o subplugin por quebrar.

Defina contratos estáveis, documente os pontos de extensão e deixe detalhes de implementação realmente internos fora da superfície que os filhos precisam consumir.

## 20.39 Events em subplugins

Subplugins podem observar Events usando `db/events.php` como outros plugins. Isso é útil quando uma implementação precisa reagir a fatos do Moodle sem o pai despachar manualmente cada situação.

Mas observe a arquitetura. Se todos os conectores precisam receber exatamente o mesmo evento de negócio do pai, talvez um dispatcher explícito seja melhor do que fazer cada filho observar eventos internos e reconstruir contexto sozinho.

## 20.40 Events próprios

Um subplugin também pode disparar Events próprios. Se `biblocks_pie` precisasse registrar um fato específico de sua implementação, o evento pertenceria ao componente `biblocks_pie`, não a `local_kopere_bi` apenas por o pai hospedar aquele tipo. Isso permite auditoria, observação por outros componentes e integração com o log padrão quando o evento realmente representa um fato relevante.

Não use Event como chamada de método indireta. A regra do Capítulo 10 continua valendo: Event representa algo que aconteceu.

## 20.41 Hooks em subplugins

Subplugins podem consumir Hooks disponibilizados pelo core ou pelo plugin pai, quando esse pai publica pontos de extensão por Hook. Isso pode ser interessante quando existem vários consumidores e o fluxo precisa permitir alteração de dados antes de uma ação.

O host também pode usar Hooks para ampliar extensibilidade além do contrato principal, mas não crie quinze mecanismos diferentes para a mesma coisa. Se a interface `connector` já resolve o envio, não precisa inventar um Hook apenas para chamar `send()`.

## 20.42 Tasks próprias

Cada subplugin pode declarar Scheduled e Adhoc Tasks. Um conector pode, por exemplo, renovar token ou sincronizar catálogo em frequência própria.

Ainda assim, tarefas que representam a fila comum do produto normalmente pertencem ao pai. Se cada conector criar sua própria fila, retry, lock e auditoria, você perde justamente a centralização que justificou o host.

## 20.43 Adhoc Task e identificação do subplugin

Uma estratégia comum é o pai enfileirar trabalho e guardar no custom data apenas o identificador do conector. Quando a task executar, ela usa a factory e chama o filho.

Isso evita serializar objetos de classes de subplugin dentro da task e deixa o payload mais resistente a upgrades.

## 20.44 Lock API

Se subplugins processam recursos externos compartilhados, o mesmo cuidado de concorrência dos capítulos anteriores continua valendo. Um conector pode precisar de lock por conta, tenant ou lote para impedir envio duplicado.

O fato de a implementação estar isolada em outro plugin não elimina as condições de corrida.

## 20.45 Cache

Subplugins também podem declarar caches em `db/caches.php`. Se o dado é específico do conector, o cache deve pertencer ao filho; se representa informação agregada de todos os conectores, provavelmente pertence ao pai.

Evite criar cache no pai com chaves que embutem detalhes privados de cada implementação, porque isso volta a acoplar o host aos filhos.

## 20.46 Files API

Um subplugin pode possuir file areas próprias usando seu próprio componente. Isso é importante porque componente faz parte da identidade de um arquivo no Moodle.

Se um `biblocks_*` precisa armazenar arquivo que realmente pertence àquela implementação, use a Files API com o component do próprio subplugin. Não jogue tudo em `local_kopere_bi` apenas porque o pai está mais perto.

## 20.47 Capabilities

Subplugins podem ter capabilities próprias quando existe uma operação realmente específica. Porém pense bem antes de criar uma capability por implementação se a ação conceitual é a mesma para todos os filhos.

Às vezes uma capability no pai é suficiente para administrar todos os blocos. Em outros casos um filho pode precisar de uma permissão específica. A decisão vem do modelo de autorização, não da estrutura de pastas.

## 20.48 Web Services e AJAX

Nada impede um subplugin de possuir funções externas ou endpoints próprios, mas o mesmo princípio de contrato vale. Se toda integração deveria ser acessada pela API uniforme do pai, expor endpoints particulares pode quebrar a abstração e obrigar clientes a conhecer cada implementação.

Use endpoints próprios quando a funcionalidade é realmente específica e documentada como parte do subplugin.

## 20.49 Privacy API

Se o subplugin armazena dados pessoais, ele precisa participar corretamente da Privacy API. O fato de o pai já possuir um provider não cobre automaticamente tabelas e dados pertencentes ao filho.

Em sistemas extensíveis, essa responsabilidade precisa estar documentada no contrato de desenvolvimento de subplugins, porque terceiros podem introduzir novos dados que o pai nem conhece.

## 20.50 Backup e restore

Backup é um dos lugares em que a frase "é um plugin de verdade" precisa de cuidado. O subplugin pode participar de backup e restore, mas não existe uma mágica universal que faça qualquer dado do filho entrar automaticamente no backup do pai.

O host precisa oferecer pontos de integração apropriados e o tipo de plugin precisa estar conectado ao plano de backup. Activities como Quiz e Assignment possuem infraestrutura própria para permitir que seus subplugins adicionem estruturas e processem dados.

Em um host customizado, você precisa desenhar isso conscientemente. No `local_kopere_bi`, boa parte dos dados é global e não pertence ao backup de um curso. Já no `mod_certificatebeautiful`, que é um activity module e também hospeda subplugins, qualquer dado do filho ligado à instância precisa ser pensado junto do contrato de backup e restore.

## 20.51 Não copie IDs entre instalações

Quando backup e restore envolvem subplugins, nunca assuma que IDs locais permanecerão iguais. O subplugin precisa trabalhar com mappings e referências do mecanismo de restore, assim como qualquer outro componente.

Esse cuidado é ainda maior quando um subplugin referencia registros do pai, porque a ordem de restauração e os mappings precisam estar bem definidos.

## 20.52 Desinstalação

Subplugin pode ser removido independentemente, portanto não deixe o pai quebrar quando uma implementação desaparece. Descubra novamente os plugins disponíveis e trate configuração obsoleta.

Se uma configuração ainda referencia `pie`, mas `biblocks_pie` foi removido, a tela administrativa deve sinalizar o problema e o runtime deve falhar de forma controlada, não produzir fatal error em toda requisição.

## 20.53 Não salve classname como verdade eterna

Guardar `\biblocks_pie\provider` diretamente no banco parece prático, mas acopla persistência a uma decisão de classe. Prefira salvar o nome lógico `pie` ou o component `biblocks_pie` e resolver a implementação pelo contrato do pai.

Assim você consegue mover implementação interna sem migrar todas as linhas da tabela apenas porque reorganizou classes.

## 20.54 Nomes de diretório não são API de negócio

O caminho `local/kopere_bi/biblocks/pie` é detalhe de descoberta. Regra de negócio não deveria montar pathname para decidir como chamar o filho.

Use componente, plugin manager e contratos. Isso também reduz problemas quando a estrutura de metadata evolui entre versões do Moodle.

## 20.55 Quiz reports

O Quiz oferece um exemplo clássico de subplugin. Relatórios usam o tipo `quiz` e ficam em `mod/quiz/report`. Componentes como `quiz_overview`, `quiz_statistics` e `quiz_responses` são plugins independentes daquele tipo.

A atividade Quiz conhece o conceito de relatório e oferece infraestrutura para eles, mas cada relatório pode ter classes, configurações e código próprios. Isso impede que `mod_quiz` precise conter diretamente toda forma possível de análise de tentativa.

## 20.56 Quiz access rules

O segundo tipo importante do Quiz é `quizaccess`, localizado em `mod/quiz/accessrule`. Regras como senha, endereço IP, janela segura e limite de tentativas representam políticas independentes que podem participar do acesso ao Quiz.

Aqui fica muito claro o valor do subplugin: o Quiz define em quais momentos uma regra pode interferir e cada regra implementa o contrato necessário, sem o core possuir um `if` para cada política existente no mundo.

## 20.57 O `subplugins.json` real do Quiz

Nas versões atuais o arquivo do Quiz declara os dois formatos para manter compatibilidade:

```
{
    "subplugintypes": {
        "quiz": "report",
        "quizaccess": "accessrule"
    },
    "plugintypes": {
        "quiz": "mod/quiz/report",
        "quizaccess": "mod/quiz/accessrule"
    }
}
```

Esse é um excelente exemplo para visualizar a diferença de caminhos entre Moodle 5.x e branches anteriores.

## 20.58 Assignment submission

O Assignment declara `assignsubmission`, usado para formas de envio de trabalho. Texto online e arquivo são exemplos de implementações.

O pai `mod_assign` controla a atividade, datas, tentativas, grade e fluxo geral, enquanto o subplugin de submissão conhece como capturar, armazenar e apresentar determinado tipo de entrega.

## 20.59 Assignment feedback

O segundo tipo do Assignment é `assignfeedback`. Ele permite implementar maneiras diferentes de devolver feedback ao estudante.

Submission e feedback vivem dentro do mesmo pai, mas possuem contratos diferentes, porque representam pontos de extensão diferentes. Esse é outro motivo para não criar um tipo genérico chamado apenas `assignplugin`.

## 20.60 O `subplugins.json` real do Assignment

A declaração atual segue o mesmo padrão:

```
{
    "subplugintypes": {
        "assignsubmission": "submission",
        "assignfeedback": "feedback"
    },
    "plugintypes": {
        "assignsubmission": "mod/assign/submission",
        "assignfeedback": "mod/assign/feedback"
    }
}
```

O nome do tipo comunica a responsabilidade e o caminho mostra onde a implementação é instalada.

## 20.61 Database field types

A atividade Database também é extensível. `datafield` representa tipos de campo que podem ser usados na atividade, enquanto `datapreset` representa presets e possui características mais históricas.

Um campo de texto, número ou URL é uma implementação de um conceito que o `mod_data` conhece. O pai controla registro, templates e atividade; o subplugin controla detalhes do tipo de campo.

## 20.62 O `subplugins.json` real do Database

Na árvore atual encontramos:

```
{
    "subplugintypes": {
        "datafield": "field",
        "datapreset": "preset"
    },
    "plugintypes": {
        "datafield": "mod/data/field",
        "datapreset": "mod/data/preset"
    }
}
```

Esse exemplo também é útil para lembrar que subplugin types podem envelhecer. A documentação atual descreve presets do Database como um plugin type legado, então não presuma que todo ponto de extensão histórico representa o padrão ideal para um design novo.

## 20.63 Deprecação de tipos de subplugin

Desde Moodle 5.0 existe um processo formal para deprecar plugin types e subplugin types. Isso significa que a própria declaração de extensibilidade também possui ciclo de vida.

Se um host decide encerrar um tipo de subplugin, precisa primeiro remover ou substituir as dependências internas daquele tipo e oferecer uma estratégia de migração. Deprecar o tipo não é apenas colocar `@deprecated` em uma classe.

## 20.64 Compatibilidade entre branches

Se você mantém um host para Moodle 4.5 e 5.x, teste instalação limpa nas duas famílias e não apenas upgrade em um ambiente de desenvolvimento. `subplugins.json` é lido muito cedo no processo de descoberta e um erro ali pode fazer o Moodle simplesmente não reconhecer o tipo.

CI para um plugin pai com subplugins deveria instalar pelo menos uma implementação de teste, porque validar só o pai não comprova que a descoberta e o contrato funcionam.

## 20.65 Testando o contrato do pai

O pai deve ter testes para sua factory, repository e dispatcher. Teste cenário sem subplugin, um subplugin válido, um desabilitado e uma implementação inválida.

Também vale criar um pequeno subplugin fixture em testes quando a infraestrutura permitir, porque isso verifica o ponto de extensão real e não somente mocks de classes internas.

## 20.66 Testando um subplugin

O filho testa sua implementação específica. Para `biblocks_pie`, você quer testar a preparação dos dados do gráfico, configuração e integração com `i_block_provider`, sem repetir todos os testes que pertencem ao host.

Não repita nos filhos todos os testes que já pertencem ao host. O pai testa o framework de extensibilidade; o filho testa a implementação.

## 20.67 Code review de um sistema com subplugins

Em revisão eu procuro primeiro por conhecimento indevido. O pai possui `if` com nomes de filhos? O filho consulta tabelas internas do pai sem API? O pai monta caminho físico? Configuração de um filho está espalhada no pai? Upgrade do pai altera tabela do filho?

Esses sinais mostram que existe separação de diretório, mas não separação arquitetural.

## 20.68 Documente o contrato para terceiros

Se terceiros poderão criar subplugins, a documentação precisa informar estrutura mínima, interface, eventos, Hooks, configuração, capabilities, backup, privacy, versões suportadas e política de compatibilidade.

O melhor teste de extensibilidade é entregar apenas essa documentação a outra equipe e verificar se ela consegue criar um componente sem abrir o código de três implementações existentes para descobrir convenções escondidas.

## 20.69 Três hosts reais, três desenhos diferentes

O Kopere BI mostra um host com **dois tipos** de subplugin. `biblocks` cuida das variações de blocos de visualização e `bifilters` das variações de filtro. Cada família possui contrato próprio, `plugininfo` próprio e implementações independentes.

O GeniAI mostra outro desenho. Existe um tipo `geniaicontroller`, uma interface pequena no pai e uma classe de descoberta que escolhe a implementação configurada. A lógica específica de ChatGPT fica em `geniaicontroller_chatgpt`; adicionar outro provedor não deveria exigir transformar o pai num `switch` de marcas.

Beautiful Certificate mostra que um activity module também pode hospedar subplugins. O tipo `certificatebeautifuldatainfo` permite separar fontes de dados usadas na geração do certificado. Isso é particularmente interessante porque o pai continua sendo uma atividade completa, com seu próprio backup, tasks e lifecycle, enquanto as extensões tratam uma parte específica do domínio.

Os três projetos reforçam a mesma ideia: subplugin não é uma pasta bonita. Ele vale a pena quando existe uma variação que merece identidade própria e quando o pai consegue trabalhar com o contrato sem incorporar a implementação de cada filho.

## 20.70 Exercício

Use os três projetos reais como referência e crie um pequeno host didático com um único tipo de subplugin. O pai deve declarar `plugintypes` e `subplugintypes`, oferecer uma interface pública pequena, descobrir implementações por `core_component`, validar a classe antes de instanciar e diferenciar claramente "instalado" de "habilitado".

Crie dois filhos com comportamentos diferentes e faça o pai funcionar sem nenhum `if ($name === 'filho1')` ou `switch` por implementação. Depois remova um dos filhos e verifique se o host continua funcionando de forma controlada.

Por fim compare sua solução com três pontos reais: a dupla `biblocks`/`bifilters` do Kopere BI, `controller_interface` e `controller::get_instance()` do GeniAI, e o tipo `certificatebeautifuldatainfo` do Beautiful Certificate. Se o seu pai precisa abrir o código de cada filho para saber como chamá-lo, o contrato ainda não está bom.

## Referências técnicas consultadas

* MOODLE. Moodle Developer Resources. Plugin types. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes. Acesso em: 23 set. 2026.
* MOODLE. Moodle Developer Resources. Metadata. Disponível em: https://moodledev.io/general/development/tools/metadata. Acesso em: 23 set. 2026.
* MOODLE. Moodle Developer Resources. Component Communication. Disponível em: https://moodledev.io/general/development/policies/component-communication. Acesso em: 23 set. 2026.
* MOODLE. Moodle Developer Resources. Moodle 5.0 developer update. Disponível em: https://moodledev.io/docs/5.0/devupdate. Acesso em: 23 set. 2026.
* MOODLE. Moodle Developer Resources. Assignment sub-plugins. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes/assign. Acesso em: 23 set. 2026.
* MOODLE. Moodle Developer Resources. Database activity sub-plugins. Disponível em: https://moodledev.io/docs/5.0/apis/plugintypes/mod_data. Acesso em: 23 set. 2026.
* MOODLE. Moodle source code. mod/quiz/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/quiz/db/subplugins.json. Acesso em: 23 set. 2026.
* MOODLE. Moodle source code. mod/assign/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/assign/db/subplugins.json. Acesso em: 23 set. 2026.
* MOODLE. Moodle source code. mod/data/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/data/db/subplugins.json. Acesso em: 23 set. 2026.
* MOODLE. Moodle source code. core_plugin_manager. Disponível em: https://github.com/moodle/moodle/blob/main/public/lib/classes/plugin_manager.php. Acesso em: 23 set. 2026.

{% endraw %}
