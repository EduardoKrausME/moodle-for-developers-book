# 20 SUBPLUGINS

Subplugin é um daqueles assuntos do Moodle que parece simples quando visto pela estrutura de diretórios e fica muito mais interessante quando você entende a arquitetura por trás. A primeira impressão costuma ser "é um plugin dentro de outro plugin", mas essa definição é curta demais porque não explica quem descobre esse plugin, quem define o contrato que ele precisa cumprir, de onde vem o Frankenstyle component, como instalação e upgrade acontecem, nem por que alguns componentes do Moodle conseguem receber extensões internas enquanto outros não conseguem.

A forma mais útil de pensar é que um subplugin existe quando um plugin pai decide ser extensível. O pai cria um ponto de extensão formal, declara um novo tipo de plugin e passa a permitir que outras extensões sejam instaladas dentro daquela estrutura sem precisar editar o código do pai. Isso muda bastante o desenho. Em vez de colocar quinze integrações dentro da mesma pasta, com um `switch` gigante dizendo "se for SAP faça isto, se for Totvs faça aquilo, se for API própria faça outra coisa", o pai define um contrato pequeno e cada integração vira um componente independente com versão, classes, banco, configurações e ciclo de vida próprios.

É exatamente por isso que o Quiz não possui todos os relatórios e todas as regras de acesso escritos como uma única classe dentro de `mod_quiz`, e por que o Assignment separa tipos de submissão e tipos de feedback. O plugin pai conhece o conceito, enquanto o subplugin implementa uma variação daquele conceito.

Neste capítulo vamos usar como exemplo um plugin pai fictício chamado `local_deliveryhub`, pensado para centralizar envio de dados acadêmicos para sistemas externos, e ele permitirá subplugins do tipo `deliveryconnector`. Um conector pode falar com um ERP, outro pode publicar em uma API REST e outro pode gravar em uma fila corporativa, mas todos obedecem ao mesmo contrato definido pelo pai. O exemplo é fictício, porém a arquitetura é a mesma que aparece em vários pontos reais do Moodle.

## 20.1 O que é um subplugin

Subplugin é um plugin cujo tipo é declarado por outro plugin. Isso significa que `deliveryconnector_sap` não existe no Moodle simplesmente porque alguém criou uma pasta com esse nome, ele existe porque `local_deliveryhub` informou ao core que possui um tipo de subplugin chamado `deliveryconnector` e indicou onde esses componentes ficam.

O subplugin continua sendo um plugin de verdade. Ele possui componente próprio, `version.php`, strings de idioma, classes, possibilidade de `db/install.xml`, `db/upgrade.php`, Events, Hooks, Tasks e outros recursos compatíveis com plugins Moodle. A diferença é que seu tipo não nasceu diretamente no core, ele nasceu em um plugin pai.

## 20.2 O plugin pai é quem cria o ponto de extensão

Não existe subplugin sem plugin pai. O pai é responsável por declarar que aceita extensões e, principalmente, por definir o que essas extensões significam.

Se `local_deliveryhub` declara `deliveryconnector`, então cabe a ele dizer o que um conector precisa fazer. Pode existir uma interface `connector`, uma classe abstrata, uma factory ou um dispatcher que localiza implementações, mas precisa haver um contrato compreensível. Declarar a pasta sem definir comportamento apenas cria várias pastas que o Moodle reconhece, não uma arquitetura extensível.

Esse é o ponto que diferencia extensibilidade de desorganização. O pai deve conhecer o tipo do subplugin, mas não deve conhecer antecipadamente cada implementação futura.

## 20.3 Quando subplugin faz sentido

Subplugin faz sentido quando existe um componente principal com uma responsabilidade clara e existem variações independentes de uma parte dessa responsabilidade. O Quiz possui uma atividade principal e diferentes relatórios, além de diferentes regras de acesso. O Assignment possui a atividade principal e formas diferentes de submissão e feedback.

No nosso exemplo, `local_deliveryhub` conhece o processo de exportar dados, mantém fila, auditoria e configuração geral, enquanto cada conector sabe falar com um destino específico. Isso permite instalar ou remover um conector sem transformar o plugin pai em uma coleção infinita de integrações opcionais.

## 20.4 Quando não criar subplugins

Nem toda classe intercambiável precisa virar subplugin. Se existem duas estratégias pequenas que sempre serão distribuídas juntas, uma interface interna e duas classes podem ser suficientes. Criar um novo plugin type aumenta o custo de manutenção, instalação, testes, versionamento e documentação.

Também não use subplugin apenas para organizar diretórios. Se a funcionalidade nunca será instalada, atualizada ou distribuída separadamente, provavelmente você está tentando resolver organização de código com uma ferramenta de extensibilidade.

## 20.5 Subplugin não é dependência comum

Um plugin pode depender de outro sem ser subplugin. Um `local_reports` pode declarar dependência de `mod_quiz` e continuar sendo um plugin independente. Nesse caso existe uma relação de dependência, mas `local_reports` não passa a fazer parte de um tipo criado pelo Quiz.

No subplugin a relação é mais forte. O próprio tipo é definido pelo pai e, conforme a política de comunicação de componentes do Moodle, o subplugin pode assumir que seu pai existe, enquanto não deve assumir a presença de outros plugins opcionais sem declarar ou verificar essa dependência.

## 20.6 Quais plugins podem hospedar subplugins

A documentação de arquitetura do Moodle restringe a capacidade de hospedar subplugins a alguns tipos de plugin, entre eles activity modules, editors, administration tools e local plugins. Isso importa quando você está desenhando um novo sistema extensível, porque não é correto imaginar que qualquer plugin type pode simplesmente criar `db/subplugins.json` e automaticamente se transformar em host.

Para o exemplo deste capítulo usamos `local_deliveryhub` justamente porque `local` é um dos tipos que pode hospedar subplugins e porque o cenário é uma extensão institucional genérica.

## 20.7 Frankenstyle do subplugin

O Frankenstyle component de um subplugin segue a mesma lógica dos demais plugins, combinando o tipo do subplugin com seu nome. Se o tipo é `deliveryconnector` e o nome é `sap`, o componente será `deliveryconnector_sap`.

Isso aparece em strings, namespaces, configurações, Events e em diversas APIs:

```php
get_string('pluginname', 'deliveryconnector_sap');
get_config('deliveryconnector_sap');
```

O nome do pai não precisa aparecer no componente porque a relação de parentesco já é conhecida pelo tipo `deliveryconnector`.

## 20.8 Estrutura de diretórios do pai

Uma estrutura possível para o pai seria:

```
local/deliveryhub/
    classes/
    connector/
    db/
        subplugins.json
    lang/
        en/
            local_deliveryhub.php
    settings.php
    version.php
```

A pasta `connector/` será o diretório onde os subplugins serão instalados. O nome dessa pasta é uma decisão do plugin pai e será declarado em `db/subplugins.json`.

## 20.9 Estrutura de um subplugin

Um conector chamado `sap` poderia ter:

```
local/deliveryhub/connector/sap/
    classes/
        connector.php
    db/
        tasks.php
    lang/
        en/
            deliveryconnector_sap.php
    settings.php
    version.php
```

Ele está fisicamente dentro da árvore do pai, mas continua possuindo identidade própria. Essa distinção é importante porque atualização do pai e atualização do subplugin não precisam ter a mesma versão.

## 20.10 `db/subplugins.json`

O arquivo que declara os tipos de subplugin fica no plugin pai em `db/subplugins.json`. No Moodle atual, um exemplo mínimo é:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    }
}
```

A chave é o novo plugin type e o valor é o caminho relativo à raiz do plugin pai onde os componentes daquele tipo ficam.

## 20.11 A mudança do Moodle 5.0

No Moodle 5.0 houve uma mudança importante no metadata de subplugins. O objeto moderno passou a se chamar `subplugintypes` e seus caminhos são relativos à raiz do plugin pai.

Antes disso era utilizado `plugintypes`, com caminhos relativos à raiz inteira do Moodle. A mudança parece pequena, mas resolve uma inconsistência antiga e deixa o plugin pai menos acoplado à localização absoluta dentro da árvore do projeto.

## 20.12 `subplugintypes` no Moodle 5.0 ou superior

Para o nosso exemplo moderno:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    }
}
```

Como `subplugins.json` está dentro de `local/deliveryhub/db/`, o caminho `connector` é entendido relativamente a `local/deliveryhub/`.

## 20.13 `plugintypes` nas branches antigas

Se o mesmo plugin precisa funcionar no Moodle 4.5 ou anterior, ainda é necessário declarar o formato legado:

```
{
    "plugintypes": {
        "deliveryconnector": "local/deliveryhub/connector"
    }
}
```

Perceba a diferença. No legado o caminho parte da raiz do Moodle, enquanto no formato novo ele parte da raiz do plugin pai.

## 20.14 Suportando Moodle 4.5 e Moodle 5.x no mesmo código

Quando o plugin precisa atravessar essa fronteira de versões, a documentação atual recomenda declarar os dois objetos e manter as mesmas chaves:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    },
    "plugintypes": {
        "deliveryconnector": "local/deliveryhub/connector"
    }
}
```

Isso não é duplicação de dois tipos diferentes, é a mesma informação expressa nos dois formatos que branches diferentes entendem.

## 20.15 As chaves precisam continuar iguais

Não crie `deliveryconnector` em um objeto e `deliveryintegration` no outro. Se o objetivo é compatibilidade, o tipo precisa ser o mesmo. O que muda é a forma de expressar o caminho.

Essa regra também ajuda a impedir um cenário muito ruim em upgrade, no qual a mesma pasta passa a ser vista como dois plugin types diferentes dependendo da versão do Moodle.

## 20.16 O que o Moodle faz com essa declaração

Depois de conhecer o tipo, o component manager consegue mapear `deliveryconnector` para o diretório correspondente e passa a descobrir plugins daquele tipo como descobre outros componentes.

É por isso que você não precisa escrever um `glob($CFG->dirroot . '/local/deliveryhub/connector/*')` para encontrar conectores. Fazer a varredura manual ignora o sistema de componentes, caches e validações que o Moodle já possui.

## 20.17 `core_component::get_subplugins()`

O core oferece descoberta da declaração feita pelo plugin pai. Uma chamada como esta permite consultar os tipos definidos pelo componente:

```php
$types = core_component::get_subplugins('local_deliveryhub');
```

O retorno representa os subplugin types conhecidos para aquele pai. Use as APIs de componentes em vez de reconstruir a informação lendo JSON manualmente.

## 20.18 `core_plugin_manager::get_subplugins()`

O plugin manager também possui `get_subplugins()`, mas seu objetivo é mais amplo, retornando plugins que definem subplugins e informações sobre os tipos declarados.

```php
$manager = core_plugin_manager::instance();
$definitions = $manager->get_subplugins();
```

Essa API é útil quando você está construindo ferramentas administrativas, diagnósticos ou precisa compreender a relação geral entre pais e tipos.

## 20.19 `get_subplugins_of_plugin()`

Quando você já conhece o pai e quer os subplugins instalados relacionados a ele, o plugin manager possui uma API direta:

```php
$manager = core_plugin_manager::instance();
$plugins = $manager->get_subplugins_of_plugin('local_deliveryhub');
```

O retorno utiliza componentes como chave e objetos `plugininfo` como valor. Isso é bem mais robusto do que deduzir componente a partir de nome de diretório.

## 20.20 Descobrir plugins de um tipo específico

Se o pai conhece o tipo `deliveryconnector`, também pode usar as APIs normais de plugins daquele tipo. Em vários casos basta trabalhar com `core_component::get_plugin_list('deliveryconnector')` para obter nome e diretório das implementações conhecidas.

```php
$connectors = core_component::get_plugin_list('deliveryconnector');
```

A partir daí o pai decide quais estão habilitados e como instanciá-los.

## 20.21 `plugininfo`

O Moodle representa plugins descobertos por meio de objetos `plugininfo`. Eles carregam informações sobre componente, versão, dependências, diretório, estado de instalação e outros metadados utilizados pelo gerenciador de plugins.

Para um host de subplugins, isso é útil em telas administrativas e diagnósticos porque evita criar um segundo sistema de inventário paralelo. O pai pode consultar o plugin manager e trabalhar com a mesma visão que o core usa.

Não confunda `plugininfo` com a API funcional do seu subplugin. `plugininfo` descreve o componente para gerenciamento; quem define o comportamento de negócio continua sendo o contrato do plugin pai.

## 20.22 O pai precisa definir um contrato

A declaração no JSON só resolve descoberta. Ainda falta responder o que um `deliveryconnector` precisa implementar.

Uma forma moderna é definir uma interface dentro do pai:

```php
namespace local_deliveryhub\local;

interface connector {
    public function get_name(): string;

    public function is_available(): bool;

    public function send(array $records): send_result;
}
```

Agora qualquer subplugin possui um contrato claro e o pai pode trabalhar sem conhecer detalhes de SAP, ERP ou API REST.

## 20.23 Interface ou classe abstrata

Interface funciona bem quando o pai quer definir somente comportamento. Classe abstrata é útil quando existe implementação compartilhada que realmente pertence ao contrato.

Não coloque cinquenta métodos na base apenas porque todos os conectores "talvez precisem um dia". Quanto maior a superfície obrigatória, mais difícil fica evoluir o pai sem quebrar terceiros.

## 20.24 Base class

Se houver comportamento comum, uma base class pode centralizar acesso a configuração, logging ou helpers específicos do contrato:

```php
namespace local_deliveryhub\local;

abstract class connector_base implements connector {
    public function __construct(
        protected readonly string $name,
    ) {
    }

    protected function component(): string {
        return 'deliveryconnector_' . $this->name;
    }
}
```

O objetivo é eliminar repetição realmente comum, não criar uma superclasse que sabe detalhes de todas as implementações.

## 20.25 Implementação no subplugin

O subplugin SAP pode implementar o contrato:

```php
namespace deliveryconnector_sap;

class connector extends \local_deliveryhub\local\connector_base {
    public function get_name(): string {
        return get_string('pluginname', 'deliveryconnector_sap');
    }

    public function is_available(): bool {
        return !empty(get_config('deliveryconnector_sap', 'endpoint'));
    }

    public function send(array $records): \local_deliveryhub\local\send_result {
        // Envio específico ao SAP.
    }
}
```

O pai continua conhecendo apenas a interface e o componente.

## 20.26 Factory

Uma factory pode transformar o nome do plugin em uma instância do contrato:

```php
namespace local_deliveryhub\local;

final class connector_factory {
    public static function create(string $name): connector {
        $classname = "\\deliveryconnector_{$name}\\connector";

        if (!class_exists($classname)) {
            throw new \coding_exception("Connector {$name} is not available");
        }

        $instance = new $classname($name);

        if (!$instance instanceof connector) {
            throw new \coding_exception("Invalid connector {$name}");
        }

        return $instance;
    }
}
```

A factory concentra convenção e validação. Não espalhe montagem dinâmica de classname por dez arquivos do plugin pai.

## 20.27 Factory não substitui descoberta

A factory instancia, mas não deveria ser responsável por descobrir diretórios no filesystem. Primeiro obtenha a lista por `core_component`, depois instancie somente componentes conhecidos.

Essa separação evita que entrada do usuário vire parte de um nome de classe arbitrário e mantém o desenho mais previsível.

## 20.28 Dispatcher

Em alguns pais existe a necessidade de executar todos os subplugins habilitados para um determinado evento. Um dispatcher pode fazer isso:

```php
final class dispatcher {
    public function send_to_all(array $records): array {
        $results = [];

        foreach ($this->repository->get_enabled() as $name) {
            $connector = connector_factory::create($name);
            $results[$name] = $connector->send($records);
        }

        return $results;
    }
}
```

O dispatcher não deveria conhecer regras específicas de cada filho. Se começar a ter `if ($name === 'sap')`, a abstração já está vazando.

## 20.29 Habilitar e desabilitar subplugins

O Moodle reconhecer um subplugin não significa que ele precisa estar operacional. O mecanismo de enable/disable é uma responsabilidade que o plugin pai pode precisar definir.

Uma abordagem simples é manter no pai uma configuração com a lista habilitada e oferecer uma tela administrativa. Outra é cada subplugin possuir um flag próprio. O importante é existir uma fonte única e previsível para essa decisão.

Não misture "instalado" com "habilitado". Um componente pode estar instalado para preservar configuração e dados, mas temporariamente desativado para execução.

## 20.30 Configuração global do pai e configuração do filho

O pai deve guardar configurações que pertencem ao sistema como um todo, por exemplo tamanho de lote e política de retry. O filho deve guardar configurações específicas de sua implementação, como endpoint, tenant ou identificador de fila.

```php
$batchsize = get_config('local_deliveryhub', 'batchsize');
$endpoint = get_config('deliveryconnector_sap', 'endpoint');
```

Essa divisão evita que o pai acumule dezenas de settings que só fazem sentido quando determinado subplugin está instalado.

## 20.31 `settings.php` nos subplugins

Como um subplugin é um componente real, ele pode possuir `settings.php`. Porém o local exato onde a página aparecerá na árvore administrativa pode depender do plugin pai e de como ele organiza seus settings.

Em hosts mais sofisticados, o pai monta uma categoria própria e inclui ou referencia configurações dos filhos. O ponto importante é não fazer o filho depender de HTML ou rotas internas do pai sem um contrato estável.

## 20.32 `version.php` do subplugin

Cada subplugin possui seu próprio `version.php`:

```php
$plugin->component = 'deliveryconnector_sap';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
```

As versões do pai e do filho não precisam avançar juntas. Isso é uma das grandes vantagens de separar implementações independentes.

## 20.33 Dependência explícita do pai

Mesmo que a relação de subplugin já implique a presença do host, declarar dependências quando apropriado torna requisitos de versão mais claros, principalmente quando o contrato do pai evolui.

```php
$plugin->dependencies = [
    'local_deliveryhub' => 2026092300,
];
```

Assim um conector que depende de uma interface introduzida em determinada versão não é instalado silenciosamente em um pai antigo.

## 20.34 Evite dependência circular

O pai define o contrato e o filho depende do pai. Se o pai começa a depender diretamente de `deliveryconnector_sap`, você criou uma dependência circular conceitual e destruiu a extensibilidade.

O pai pode saber que existem conectores instalados por descoberta, mas não deveria exigir uma implementação específica para funcionar, salvo se isso for uma decisão explícita do produto e estiver refletida nas dependências.

## 20.35 Instalação do subplugin

Como componente próprio, o subplugin pode possuir `db/install.xml` e `db/install.php`. Suas tabelas precisam usar prefixos coerentes com seu componente e existir apenas quando realmente pertencem à implementação.

Um conector que precisa guardar mapeamentos externos pode ter tabela própria, enquanto o pai mantém fila e auditoria comuns. Essa separação facilita remoção e atualização independente.

## 20.36 Upgrade do subplugin

O subplugin também possui `db/upgrade.php` e sua função `xmldb_[component]_upgrade()` segue o mesmo princípio dos outros plugin types.

Não coloque todas as mudanças de schema dos filhos dentro do `upgrade.php` do pai. Isso força o pai a conhecer internamente versões e tabelas de extensões que deveriam ser independentes.

## 20.37 Upgrade do pai e evolução do contrato

A parte mais delicada é quando o pai muda a interface que os filhos implementam. Alterar um método obrigatório pode quebrar todos os subplugins terceiros de uma vez.

Prefira evolução compatível, métodos novos opcionais quando possível, interfaces versionadas em mudanças grandes ou um período de depreciação claro. Subplugin transforma sua API interna em uma API para terceiros, portanto mudanças precisam ser tratadas com o mesmo cuidado de qualquer API pública.

## 20.38 API pública do pai

Se terceiros vão construir subplugins, o código usado por eles precisa ser conscientemente público. Não espere que desenvolvedores externos importem classes de namespace `local` que você pretende reescrever a cada versão e depois culpe o subplugin por quebrar.

Defina contratos estáveis, documente os pontos de extensão e deixe detalhes de implementação realmente internos fora da superfície que os filhos precisam consumir.

## 20.39 Events em subplugins

Subplugins podem observar Events usando `db/events.php` como outros plugins. Isso é útil quando uma implementação precisa reagir a fatos do Moodle sem o pai despachar manualmente cada situação.

Mas observe a arquitetura. Se todos os conectores precisam receber exatamente o mesmo evento de negócio do pai, talvez um dispatcher explícito seja melhor do que fazer cada filho observar eventos internos e reconstruir contexto sozinho.

## 20.40 Events próprios

Um subplugin também pode disparar seus próprios Events, por exemplo `deliveryconnector_sap\event\delivery_failed`. Isso permite auditoria, observação por outros componentes e integração com o log padrão quando o evento realmente representa um fato relevante.

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

Se `deliveryconnector_sap` precisa armazenar um certificado público ou arquivo auxiliar, use a Files API com `component = deliveryconnector_sap`, desde que o arquivo realmente pertença àquela implementação.

## 20.47 Capabilities

Subplugins podem ter capabilities próprias quando existe uma operação realmente específica. Porém pense bem antes de criar uma capability por implementação se a ação conceitual é a mesma para todos os filhos.

Às vezes `local_deliveryhub:manageconnectors` no pai é suficiente. Em outros casos o conector precisa de uma permissão particular para visualizar informações sensíveis. A decisão vem do modelo de autorização, não da estrutura de pastas.

## 20.48 Web Services e AJAX

Nada impede um subplugin de possuir funções externas ou endpoints próprios, mas o mesmo princípio de contrato vale. Se toda integração deveria ser acessada pela API uniforme do pai, expor endpoints particulares pode quebrar a abstração e obrigar clientes a conhecer cada implementação.

Use endpoints próprios quando a funcionalidade é realmente específica e documentada como parte do subplugin.

## 20.49 Privacy API

Se o subplugin armazena dados pessoais, ele precisa participar corretamente da Privacy API. O fato de o pai já possuir um provider não cobre automaticamente tabelas e dados pertencentes ao filho.

Em sistemas extensíveis, essa responsabilidade precisa estar documentada no contrato de desenvolvimento de subplugins, porque terceiros podem introduzir novos dados que o pai nem conhece.

## 20.50 Backup e restore

Backup é um dos lugares em que a frase "é um plugin de verdade" precisa de cuidado. O subplugin pode participar de backup e restore, mas não existe uma mágica universal que faça qualquer dado do filho entrar automaticamente no backup do pai.

O host precisa oferecer pontos de integração apropriados e o tipo de plugin precisa estar conectado ao plano de backup. Activities como Quiz e Assignment possuem infraestrutura própria para permitir que seus subplugins adicionem estruturas e processem dados.

Em um host customizado, você precisa desenhar isso conscientemente. Se `local_deliveryhub` mantém dados globais de integração, talvez nem façam sentido em backup de curso; se o pai fosse uma activity module e cada filho guardasse dados por instância, então backup e restore seriam parte essencial do contrato.

## 20.51 Não copie IDs entre instalações

Quando backup e restore envolvem subplugins, nunca assuma que IDs locais permanecerão iguais. O subplugin precisa trabalhar com mappings e referências do mecanismo de restore, assim como qualquer outro componente.

Esse cuidado é ainda maior quando um subplugin referencia registros do pai, porque a ordem de restauração e os mappings precisam estar bem definidos.

## 20.52 Desinstalação

Subplugin pode ser removido independentemente, portanto não deixe o pai quebrar quando uma implementação desaparece. Descubra novamente os plugins disponíveis e trate configuração obsoleta.

Se a lista de habilitados contém `sap`, mas o componente `deliveryconnector_sap` foi removido, a tela administrativa deve sinalizar o problema e o runtime deve falhar de forma controlada, não produzir fatal error em toda requisição.

## 20.53 Não salve classname como verdade eterna

Guardar `\deliveryconnector_sap\connector` diretamente no banco parece prático, mas acopla persistência a uma decisão de classe. Prefira salvar o nome lógico `sap` ou o component `deliveryconnector_sap` e resolver a classe pela factory.

Assim você consegue mover implementação interna sem migrar todas as linhas da tabela apenas porque reorganizou classes.

## 20.54 Nomes de diretório não são API de negócio

O caminho `local/deliveryhub/connector/sap` é detalhe de descoberta. Regra de negócio não deveria montar pathname para decidir como chamar o filho.

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

O filho testa sua implementação específica. Para `deliveryconnector_sap`, você quer testar transformação de payload, tratamento de erro, configuração e integração com o contrato do pai.

Não repita nos filhos todos os testes que já pertencem ao host. O pai testa o framework de extensibilidade; o filho testa a implementação.

## 20.67 Code review de um sistema com subplugins

Em revisão eu procuro primeiro por conhecimento indevido. O pai possui `if` com nomes de filhos? O filho consulta tabelas internas do pai sem API? O pai monta caminho físico? Configuração de um filho está espalhada no pai? Upgrade do pai altera tabela do filho?

Esses sinais mostram que existe separação de diretório, mas não separação arquitetural.

## 20.68 Documente o contrato para terceiros

Se terceiros poderão criar subplugins, a documentação precisa informar estrutura mínima, interface, eventos, Hooks, configuração, capabilities, backup, privacy, versões suportadas e política de compatibilidade.

O melhor teste de extensibilidade é entregar apenas essa documentação a outra equipe e verificar se ela consegue criar um componente sem abrir o código de três implementações existentes para descobrir convenções escondidas.

## 20.69 Um projeto completo de host extensível

Nosso `local_deliveryhub` poderia concentrar fila, auditoria, locks, retry e interface administrativa. O tipo `deliveryconnector` concentra somente conectores de destino.

O fluxo seria: uma regra do pai cria um lote, a Adhoc Task carrega o conector habilitado pela factory, o dispatcher chama `send()`, o filho converte para seu protocolo e devolve um `send_result`, e o pai registra estado uniforme independentemente do destino.

Isso significa que adicionar `deliveryconnector_totvs` não exige mudar `local_deliveryhub`. Se exige, a pergunta é se o contrato realmente foi desenhado como ponto de extensão.

## 20.70 Exercício

Crie um plugin pai `local_deliveryhub` com um subplugin type chamado `deliveryconnector` e faça o projeto funcionar em Moodle 4.5 e Moodle 5.x. O pai deve declarar `plugintypes` e `subplugintypes`, fornecer uma interface pública pequena, factory, repository de conectores instalados, configuração de habilitados, dispatcher, Adhoc Task e auditoria.

Depois crie dois subplugins, `deliveryconnector_file` e `deliveryconnector_http`. O primeiro grava o lote em arquivo usando APIs do Moodle e o segundo simula envio HTTP por meio da Curl API. Cada filho deve possuir `version.php`, idioma, settings próprios e testes da implementação.

Em seguida altere o contrato do pai de maneira compatível, adicionando uma capability opcional como `supports_healthcheck()` sem quebrar os dois filhos existentes. Por fim teste instalação limpa, upgrade, desativação de um conector, remoção física de um filho ainda listado na configuração, execução concorrente da task e comportamento quando um terceiro subplugin implementa a interface incorretamente.

O exercício só está concluído quando você consegue instalar um terceiro conector sem editar uma única linha do pai. Se for necessário abrir `dispatcher.php` e adicionar mais um `case`, você construiu uma coleção de implementações, não um sistema de subplugins.

## REFERÊNCIAS

MOODLE. Moodle Developer Resources. Plugin types. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes. Acesso em: 23 set. 2026.

MOODLE. Moodle Developer Resources. Metadata. Disponível em: https://moodledev.io/general/development/tools/metadata. Acesso em: 23 set. 2026.

MOODLE. Moodle Developer Resources. Component Communication. Disponível em: https://moodledev.io/general/development/policies/component-communication. Acesso em: 23 set. 2026.

MOODLE. Moodle Developer Resources. Moodle 5.0 developer update. Disponível em: https://moodledev.io/docs/5.0/devupdate. Acesso em: 23 set. 2026.

MOODLE. Moodle Developer Resources. Assignment sub-plugins. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes/assign. Acesso em: 23 set. 2026.

MOODLE. Moodle Developer Resources. Database activity sub-plugins. Disponível em: https://moodledev.io/docs/5.0/apis/plugintypes/mod_data. Acesso em: 23 set. 2026.

MOODLE. Moodle source code. mod/quiz/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/quiz/db/subplugins.json. Acesso em: 23 set. 2026.

MOODLE. Moodle source code. mod/assign/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/assign/db/subplugins.json. Acesso em: 23 set. 2026.

MOODLE. Moodle source code. mod/data/db/subplugins.json. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/data/db/subplugins.json. Acesso em: 23 set. 2026.

MOODLE. Moodle source code. core_plugin_manager. Disponível em: https://github.com/moodle/moodle/blob/main/public/lib/classes/plugin_manager.php. Acesso em: 23 set. 2026.
