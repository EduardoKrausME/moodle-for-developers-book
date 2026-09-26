{% raw %}

# 16 BLOCOS

Bloco parece simples porque a primeira versão que todo mundo escreve cabe em poucas linhas. Você cria uma classe que herda de `block_base`, coloca um título em `init()`, devolve alguma coisa em `get_content()` e pronto, o Moodle já mostra uma caixinha na lateral da página. O problema é que essa simplicidade inicial engana bastante. Um bloco que começou exibindo dois links pode ganhar configuração por instância, configuração global, filtro por contexto, arquivo, JavaScript, cache, permissão, dados por usuário e, quando você percebe, aquela classe que deveria apenas coordenar a apresentação está consultando cinco tabelas, montando HTML, verificando permissões e executando chamadas externas dentro de `get_content()`.

Neste capítulo vamos fazer o contrário. Primeiro vamos entender o contrato que o Moodle espera de um block plugin e depois vamos separar as responsabilidades corretamente, porque o fato de o bloco ser visualmente pequeno não significa que a arquitetura pode ser improvisada. A ideia é chegar ao fim com um bloco que pode ser instalado, adicionado em páginas diferentes, configurado, controlado por capability, renderizado com Mustache, usar JavaScript quando necessário e crescer sem transformar `block_nome.php` em um arquivo impossível de manter.

## 16.1 O que é um block plugin

Um block plugin é um tipo de plugin que entrega conteúdo dentro das regiões de blocos disponibilizadas pela página e pelo tema. Em termos visuais, ele pode aparecer como uma caixa lateral, um painel no Dashboard ou outra região definida pelo layout, mas o ponto importante é que ele participa do sistema de blocos do Moodle, com instâncias próprias, contexto, configuração, visibilidade e regras sobre em quais páginas pode aparecer.

Isso é bem diferente de dizer que um bloco é apenas um pedaço de HTML. Quando alguém adiciona uma instância do seu bloco em um curso, o Moodle cria uma instância em `block_instances`, associa aquela instância a uma região e a um contexto e, dependendo do plugin, também pode armazenar configurações específicas daquela instância. Por isso um block plugin deve ser tratado como componente do Moodle, não como widget solto.

O Frankenstyle de um bloco chamado `quicklinks`, por exemplo, será `block_quicklinks`, e sua pasta ficará em:

```
blocks/quicklinks/
```

Uma estrutura inicial poderia ser:

```
blocks/quicklinks/
├── block_quicklinks.php
├── version.php
├── db/
│   └── access.php
├── lang/
│   ├── en/
│   │   └── block_quicklinks.php
│   └── pt_br/
│       └── block_quicklinks.php
└── templates/
    └── content.mustache
```

A partir daí entram outros arquivos conforme a necessidade real, como `settings.php`, `edit_form.php`, `amd/src/`, `classes/`, `backup/moodle2/` e arquivos usados pela File API.

## 16.2 Quando criar um bloco

Crie um block plugin quando a funcionalidade realmente fizer sentido como conteúdo que pode ser posicionado em uma região de blocos e, principalmente, quando a possibilidade de adicionar, remover, mover ou configurar aquela instância fizer parte do comportamento esperado.

Uma lista de atalhos do curso, um painel resumido de progresso, um pequeno quadro com informações institucionais ou uma visão contextual que muda conforme o curso são exemplos naturais. Já uma tela administrativa completa, uma integração de ERP, um processo de matrícula ou uma funcionalidade que deve executar independentemente de existir uma instância visual na página normalmente pertencem a outro tipo de plugin.

Esse ponto é importante porque muita coisa já foi implementada como bloco apenas porque block plugin era fácil de criar e aparecia rapidamente na interface. Isso deixa um acoplamento estranho, porque a regra de negócio passa a depender de alguém ter colocado uma instância do bloco em determinada página.

Se uma rotina precisa existir mesmo quando nenhum bloco está visível, a rotina não pertence ao bloco. Ela pode estar em uma classe usada pelo bloco, em uma task, em outro plugin ou em uma API compartilhada. O bloco deve ser uma forma de apresentar e acionar aquela funcionalidade, não o motivo pelo qual ela existe.

## 16.3 A classe principal e block_base

A classe principal normalmente fica em um arquivo com o mesmo nome do componente sem o prefixo `block_` duplicado. Para `block_quicklinks`, o arquivo será:

```
blocks/quicklinks/block_quicklinks.php
```

E a classe começa assim:

```php
<?php

defined('MOODLE_INTERNAL') || die();

class block_quicklinks extends block_base {

    public function init(): void {
        $this->title = get_string('pluginname', 'block_quicklinks');
    }
}
```

A classe `block_base` concentra o contrato usado pelo sistema de blocos. Você não precisa reinventar posicionamento, instanciação, configuração ou renderização externa da moldura do bloco, porque o core já gerencia tudo isso. Seu trabalho é informar o que o bloco é, onde pode aparecer, como deve se comportar e qual conteúdo deve entregar.

Uma armadilha comum é olhar para `block_base` e sair sobrescrevendo métodos porque eles existem. Não faça isso. Sobrescreva somente o que muda o comportamento do seu bloco. Quanto menor for a superfície de código específica, mais fácil será acompanhar mudanças de versão e mais previsível será o resultado.

## 16.4 init()

O método `init()` é o ponto mínimo que praticamente todo bloco implementa. A função mais conhecida dele é definir o título padrão:

```php
public function init(): void {
    $this->title = get_string('pluginname', 'block_quicklinks');
}
```

O que precisa ficar claro é que `init()` acontece muito cedo no ciclo de criação da instância. Nesse momento você não deve assumir que a configuração da instância já está disponível. A própria documentação do Moodle chama atenção para isso. Se o título depende de `$this->config`, por exemplo, esse não é o lugar adequado para tomar a decisão final.

Outro erro recorrente é transformar `init()` em bootstrap geral do plugin. Não carregue dados do banco, não chame serviço externo, não faça consulta de permissões complexa e não prepare o conteúdo ali. Pense em `init()` como inicialização básica do objeto, e não como `main()` do seu bloco.

## 16.5 Título fixo e título dinâmico

Se todas as instâncias usam o mesmo título, `init()` resolve muito bem. Mas alguns blocos permitem que cada instância tenha um título próprio ou que o título varie conforme a configuração.

Nesse cenário entra `specialization()`, que é chamado depois que a instância já foi carregada e pode enxergar a configuração específica:

```php
public function specialization(): void {
    if (!empty($this->config->title)) {
        $this->title = format_string($this->config->title);
    }
}
```

Isso evita uma gambiarra comum em que o desenvolvedor tenta acessar `$this->config` em `init()` e depois fica se perguntando por que o valor ainda não existe.

Também vale pensar se o título realmente precisa ser configurável. Adicionar configuração só porque é fácil aumenta teste, backup, tradução, validação e manutenção. Se o nome do bloco é parte da identidade da funcionalidade, mantenha-o fixo.

## 16.6 get_content()

`get_content()` é o método que todo mundo associa a blocos e, justamente por isso, é onde mais aparece código ruim. O método deve entregar o conteúdo do bloco, normalmente em um objeto com propriedades como `text` e `footer`.

Um exemplo mínimo:

```php
public function get_content(): stdClass {
    if ($this->content !== null) {
        return $this->content;
    }

    $this->content = new stdClass();
    $this->content->text = get_string('hello', 'block_quicklinks');
    $this->content->footer = '';

    return $this->content;
}
```

Observe o teste inicial. O Moodle pode solicitar o conteúdo mais de uma vez durante a mesma requisição e não existe motivo para refazer todo o trabalho se ele já foi preparado.

O erro começa quando `get_content()` vira um método de duzentas linhas com SQL, HTML, JavaScript inline, regra de negócio e autorização. O método pode coordenar o que precisa ser exibido, mas a regra deve estar em classes específicas e a apresentação em Mustache sempre que a interface passar do trivial.

## 16.7 Não monte a interface inteira dentro de get_content()

Código assim ainda aparece bastante:

```php
$this->content->text = '<div class="mybox">';
$this->content->text .= '<h4>' . $title . '</h4>';
$this->content->text .= '<a href="' . $url . '">Abrir</a>';
$this->content->text .= '</div>';
```

Funciona. Esse é justamente o problema, porque algo funcionar não significa que seja um bom padrão para continuar usando.

Quando você mistura HTML com PHP perde legibilidade, dificulta override pelo tema, aumenta risco de escaping incorreto e torna a manutenção visual muito pior. O Capítulo 6 já discutiu por que a camada de apresentação deve ficar em template e o mesmo raciocínio vale aqui. O bloco não ganha uma exceção arquitetural só porque o HTML cabe em cinco linhas.

Uma alternativa melhor:

```php
public function get_content(): stdClass {
    global $OUTPUT;

    if ($this->content !== null) {
        return $this->content;
    }

    $url = new moodle_url('/blocks/quicklinks/view.php');

    $data = [
        'title' => get_string('welcome', 'block_quicklinks'),
        'url' => $url->out(false),
    ];

    $this->content = new stdClass();
    $this->content->text = $OUTPUT->render_from_template(
        'block_quicklinks/content',
        $data
    );
    $this->content->footer = '';

    return $this->content;
}
```

E em `templates/content.mustache`:

```mustache
<div class="block-quicklinks-content">
    <h4>{{title}}</h4>
    <a href="{{url}}">{{#str}}open, block_quicklinks{{/str}}</a>
</div>
```

Não precisa criar `renderer.php` para isso. Seria apenas mais uma camada chamando um template, exatamente o tipo de boilerplate que evitamos no Capítulo 6.

## 16.8 applicable_formats()

Um bloco pode tecnicamente ser utilizável em várias páginas, mas isso não significa que deva aparecer em todas. `applicable_formats()` informa ao sistema em quais tipos de página o bloco pode ser adicionado.

Exemplo:

```
public function applicable_formats(): array {
    return [
        'site-index' => false,
        'course-view' => true,
        'mod' => true,
        'my' => false,
        'admin' => false,
    ];
}
```

Alguns identificadores comuns são `site-index`, `course-view`, `mod`, `my` e `admin`. Também é possível ser mais específico, como `course-view-weeks` ou `mod-forum-view`.

A regra deve seguir a utilidade do bloco. Se o bloco depende de curso, não devolva `['all' => true]` por preguiça e depois tente descobrir em `get_content()` se existe `$COURSE` válido. Quanto mais cedo o Moodle souber onde o bloco faz sentido, menos estados inválidos o plugin precisará tratar.

## 16.9 Curso, atividade, Dashboard e administração não são a mesma coisa

Quando um bloco aparece em uma página de curso, normalmente existe um contexto de curso relevante e um `$COURSE` que representa aquela navegação. No Dashboard, isso muda. Em páginas administrativas muda de novo. Em páginas de atividade existe o curso, mas também existe um course module e um contexto de módulo.

Por isso a frase "meu bloco funciona em qualquer página" precisa ser vista com cuidado. Às vezes ele simplesmente não quebrou nos testes que você fez.

Se o conteúdo exige um curso real, limite a disponibilidade para `course-view` e, se necessário, `mod`. Se ele é pessoal, talvez o Dashboard seja o lugar natural. Se é administrativo, talvez um block plugin nem seja o tipo correto e uma página em `admin` faça mais sentido.

A interface deve aparecer onde o modelo de dados por trás dela realmente existe.

## 16.10 instance_allow_multiple()

Por padrão, o Moodle não permite várias instâncias do mesmo bloco na mesma página. Se fizer sentido que existam várias, você pode permitir:

```
public function instance_allow_multiple(): bool {
    return true;
}
```

Permitir múltiplas instâncias não é apenas decisão visual. Se cada instância pode apontar para um conjunto diferente de links, uma categoria diferente ou uma configuração diferente, isso faz sentido. Se todas as instâncias sempre mostram exatamente a mesma coisa, permitir duplicação normalmente só cria confusão.

No `block_base`, permitir múltiplas instâncias também está relacionado à expectativa de configuração por instância. Isso existe porque, na prática, se duas instâncias podem coexistir na mesma página, normalmente deve haver alguma diferença entre elas.

## 16.11 instance_allow_config()

Existe outro cenário. Você não quer permitir duas instâncias do bloco na mesma página, mas ainda quer que a única instância seja configurável. Para isso existe `instance_allow_config()`:

```
public function instance_allow_config(): bool {
    return true;
}
```

Se `instance_allow_multiple()` retorna `true`, a configuração por instância já faz parte do comportamento esperado. `instance_allow_config()` é mais importante quando múltiplas instâncias continuam proibidas, mas a instância única precisa de opções próprias.

Isso ajuda a separar duas perguntas diferentes. "Pode haver mais de uma instância?" e "cada instância possui configuração?" parecem a mesma coisa em exemplos pequenos, mas não são.

## 16.12 Configuração global e configuração por instância

Blocos podem ter dois níveis de configuração e é importante não misturá-los.

Configuração global pertence ao plugin. Se o administrador define uma API key, uma opção de comportamento padrão ou uma integração usada por todas as instâncias, isso deve ficar nas configurações globais do plugin.

Configuração por instância pertence àquela ocorrência específica do bloco. Se uma instância mostra a categoria A e outra mostra a categoria B, esse valor pertence à instância.

Uma forma simples de pensar é perguntar: se eu apagar esta instância do bloco e criar outra, a configuração deveria continuar existindo? Se a resposta for sim, provavelmente é configuração global. Se a resposta for não, provavelmente pertence à instância.

## 16.13 has_config() e settings.php

Para informar que o block plugin possui configurações globais, você pode implementar:

```
public function has_config(): bool {
    return true;
}
```

E então criar `settings.php` como faria em outros tipos de plugin.

Um exemplo simples:

```php
<?php

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    $settings->add(new admin_setting_configcheckbox(
        'block_quicklinks/showicons',
        get_string('showicons', 'block_quicklinks'),
        get_string('showicons_desc', 'block_quicklinks'),
        1
    ));
}
```

Depois:

```php
$showicons = get_config('block_quicklinks', 'showicons');
```

O mesmo cuidado discutido nos capítulos anteriores continua valendo. `settings.php` não deve fazer trabalho pesado só porque foi carregado. Não consulte API externa incondicionalmente, não faça agregações caras e não transforme a abertura da administração do site em um benchmark involuntário do seu plugin.

## 16.14 config_instance.html e por que você ainda pode encontrar isso

Quem pega código antigo de blocks pode encontrar referências a `config_instance.html`. Isso pertence a uma geração anterior da API de blocos e aparece em tutoriais e plugins antigos. Não é o padrão que eu usaria para um bloco novo.

A documentação atual orienta a configuração por instância por meio de `edit_form.php`, usando uma classe que estende `block_edit_form`. Então, se você está criando código novo e alguém sugere começar por `config_instance.html`, provavelmente está repetindo um padrão aprendido em versões antigas do Moodle.

Esse é um bom exemplo de uma regra que serve para o livro inteiro. Não copie estrutura de plugin apenas porque encontrou em um plugin que ainda funciona. Moodle carrega muitos anos de compatibilidade, e uma API sobreviver no código não significa que ela continue sendo o melhor ponto de partida.

## 16.15 edit_form.php

Para adicionar configuração por instância, crie `edit_form.php`:

```php
<?php

class block_quicklinks_edit_form extends block_edit_form {

    protected function specific_definition($mform): void {
        $mform->addElement(
            'header',
            'configheader',
            get_string('blocksettings', 'block')
        );

        $mform->addElement(
            'text',
            'config_title',
            get_string('customtitle', 'block_quicklinks')
        );
        $mform->setType('config_title', PARAM_TEXT);
    }
}
```

O prefixo `config_` é importante porque os dados serão tratados como configuração da instância. Depois de salvos, eles ficam disponíveis em `$this->config`.

Aqui vale reaplicar tudo que vimos na Forms API. Use tipos corretos, valide o que precisa ser validado e não confie no fato de o formulário ter sido aberto por um usuário com edição ativada. A tela é apenas a origem do dado, não uma justificativa para armazenar qualquer valor.

## 16.16 Como a configuração da instância é armazenada

A configuração padrão de uma instância de bloco fica associada ao registro em `block_instances`. O core serializa os dados e os disponibiliza novamente em `$this->config` quando a instância é carregada.

Isso é ótimo para configurações pequenas. Título, modo de exibição, quantidade máxima de itens e filtros simples cabem perfeitamente nesse modelo.

Não use `configdata` como banco de dados genérico. Se o bloco começa a armazenar centenas de registros, histórico, relacionamentos, estados por usuário ou dados que precisam ser consultados individualmente, crie tabelas próprias e modele aquilo corretamente no XMLDB. Configuração de instância é configuração, não substituto de schema.

## 16.17 instance_config_save()

Na maior parte dos blocos você não precisa sobrescrever `instance_config_save()`, porque o comportamento padrão já salva os dados de configuração.

Existem casos em que você precisa preparar os dados antes, por exemplo quando uma configuração envolve editor de texto com arquivos associados ou alguma transformação específica. Aí o método pode ser útil:

```php
public function instance_config_save($data, $nolongerused = false): void {
    $data->title = trim($data->title ?? '');
    parent::instance_config_save($data, $nolongerused);
}
```

O cuidado é não transformar esse método em evento genérico de "salvou qualquer coisa, então vou fazer vinte operações". Se a alteração dispara processamento pesado, pense em Adhoc Task. Se altera entidades próprias do plugin, talvez deva existir um service dedicado. A configuração da instância não precisa conhecer toda a aplicação.

## 16.18 Contexto da instância

Cada instância de bloco possui contexto próprio, normalmente um `context_block`. Isso é extremamente útil porque capabilities e arquivos podem ser associados àquela instância, e não ao sistema inteiro.

Você pode acessar:

```php
$context = $this->context;
```

Esse contexto deve ser levado a sério. Se uma capability foi definida em `CONTEXT_BLOCK`, não teste no contexto de sistema apenas porque é mais fácil obter `context_system::instance()`.

Da mesma forma, se você armazena arquivo que pertence à instância, o `contextid` do block context é normalmente a identificação natural da área de arquivos. Quando o bloco é removido, isso também ajuda o Moodle a entender o vínculo daquele conteúdo.

## 16.19 Capabilities de um block plugin

Blocos normalmente definem capabilities em `db/access.php`. Duas aparecem com frequência nos padrões de block plugin, uma para adicionar instâncias em páginas e outra para adicionar ao Dashboard pessoal.

Exemplo:

```php
<?php

$capabilities = [
    'block/quicklinks:addinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_BLOCK,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/site:manageblocks',
    ],

    'block/quicklinks:myaddinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'user' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/my:manageblocks',
    ],
];
```

Além dessas, seu plugin pode ter capabilities próprias, como `block/quicklinks:viewprivate` ou `block/quicklinks:manageitems`, sempre no contexto que represente de verdade a operação.

## 16.20 Adicionar o bloco não significa poder usar tudo dentro dele

É possível um usuário ter permissão para adicionar uma instância e não ter permissão para executar determinada ação que o bloco mostra. Da mesma forma, um usuário pode conseguir visualizar o bloco, mas não gerenciar os itens apresentados.

Por isso o conteúdo e as ações internas precisam aplicar suas próprias regras de autorização. Não use a existência da instância como prova de que o usuário pode alterar dados.

Isso volta ao Capítulo 8. A interface pode esconder um botão, mas a página ou endpoint que recebe a ação precisa verificar novamente login, contexto, capability e, se houver objeto específico, propriedade ou vínculo com aquele objeto.

## 16.21 Onde o bloco aparece

`applicable_formats()` controla onde o tipo de bloco pode ser utilizado, mas a instância real também tem posição, região, peso e contexto. O tema define regiões possíveis e cada página declara quais regiões suporta.

Isso significa que o plugin não deve assumir que existe sempre "coluna direita" ou que o bloco será estreito. Temas podem alterar completamente a disposição visual, especialmente entre Desktop e Mobile.

Por isso CSS rígido baseado em largura fixa costuma envelhecer mal. O conteúdo deve ser responsivo e respeitar o espaço disponibilizado pelo tema.

## 16.22 Bloco de curso

Um bloco que depende de curso pode usar `applicable_formats()` para se restringir a páginas de curso e atividades. Mas ainda precisa identificar com precisão o que significa aquele curso para a funcionalidade.

Exemplo:

```
public function applicable_formats(): array {
    return [
        'course-view' => true,
        'mod' => true,
        'my' => false,
        'site-index' => false,
    ];
}
```

Dentro do conteúdo, se a regra depende do curso, prefira passar o `courseid` para uma classe de serviço e evitar espalhar `$COURSE` por toda a implementação. Globais são úteis na camada de integração com a página, mas a regra de negócio fica mais testável quando recebe os valores de que precisa explicitamente.

## 16.23 Bloco no Dashboard

O Dashboard é pessoal. Um bloco ali normalmente está mais relacionado ao usuário atual do que a um curso específico.

Se o plugin pode ser adicionado ao Dashboard, implemente a capability `myaddinstance` e permita `my` em `applicable_formats()`.

Não tente descobrir "o curso atual" no Dashboard porque essa ideia simplesmente não existe da mesma forma. Se o bloco mostra cursos do usuário, faça a consulta a partir do usuário e das matrículas, não de uma variável de contexto inventada.

## 16.24 Dados por usuário

Às vezes duas pessoas veem a mesma instância do bloco, mas o conteúdo precisa ser diferente. Um exemplo seria "minhas pendências" dentro de um curso.

Não armazene o estado individual dentro da configuração da instância. `$this->config` pertence ao bloco, não ao usuário que está olhando naquele momento.

Se existe estado por usuário, use User Preferences quando o dado for realmente preferência simples, ou tabelas próprias quando existe entidade persistente, histórico ou relacionamento. O bloco apenas consulta e apresenta o que corresponde ao usuário atual.

## 16.25 Cuidado com cache quando o conteúdo depende do usuário

Blocks podem ser renderizados muitas vezes e, por isso, cache pode fazer diferença. O problema é cachear conteúdo personalizado com uma chave que não inclui o usuário.

Imagine que você cacheie "pendências do curso 12" e esqueça que o resultado depende também do usuário. O primeiro aluno preenche o cache e o segundo pode receber conteúdo do primeiro. Isso deixa de ser apenas bug de performance e vira vazamento de informação.

A regra é a mesma do Capítulo 12. A chave do cache precisa representar todas as dimensões que alteram o resultado, como curso, usuário, grupo, idioma ou configuração, dependendo da consulta.

## 16.26 Cache do conteúdo do bloco

Se o bloco faz consultas caras e o resultado é reutilizável, use MUC em vez de inventar armazenamento próprio. Defina o cache em `db/caches.php` e busque por uma chave coerente.

Exemplo:

```php
$cache = cache::make('block_quicklinks', 'courseitems');
$key = $courseid . ':' . $userid;

$data = $cache->get($key);
if ($data === false) {
    $data = $service->get_items($courseid, $userid);
    $cache->set($key, $data);
}
```

Mas não coloque cache só porque este é o capítulo de Blocks. Primeiro descubra se existe custo que vale a pena evitar e, principalmente, qual evento invalida aquele resultado.

## 16.27 Evite trabalho pesado em get_content()

Essa regra merece uma seção própria. `get_content()` participa da construção da página. Se você fizer uma chamada HTTP de três segundos ali, adicionou três segundos ao carregamento da página. Se o endpoint externo cair e esperar timeout de trinta segundos, seu bloco pode transformar a abertura de um curso inteiro em uma espera de trinta segundos.

Integração remota frequente deve ser processada antes, normalmente por Tasks, e o bloco lê o resultado local. Se a informação precisa ser atualizada pelo usuário, ainda assim considere AJAX assíncrono com timeout controlado e feedback visual, em vez de bloquear a renderização inicial.

Bloco é apresentação. Não faça dele worker de integração.

## 16.28 JavaScript no bloco

Quando existe interação real no frontend, use módulos JavaScript conforme a arquitetura suportada pela branch do Moodle que você atende. Em muitas branches você encontrará `amd/src/`, e nas versões mais recentes existe a transição para ESM moderno discutida no Capítulo 6.

Exemplo tradicional de inicialização:

```php
$this->page->requires->js_call_amd(
    'block_quicklinks/main',
    'init',
    [$this->instance->id]
);
```

O JavaScript deve receber o mínimo necessário. Não despeje registros inteiros do banco em atributos `data-*` nem confie em `instanceid` vindo do navegador como autorização. Se o módulo chama AJAX, o endpoint valida contexto e capability novamente.

## 16.29 Não coloque JavaScript inline em get_content()

Evite:

```html
$this->content->text .= '<script>...</script>';
```

Além de misturar responsabilidades, isso dificulta CSP, cache, lint, testes e manutenção. O Moodle já possui um pipeline e APIs para carregar módulos JavaScript, então use esse caminho.

O bloco pode colocar identificadores necessários no template e o módulo JavaScript encontra os elementos por seletores ou recebe os parâmetros na inicialização.

## 16.30 Mustache em Blocks

Blocks são um ótimo lugar para Mustache porque a saída costuma ser pequena e bem delimitada. Você prepara os dados, chama o template e deixa a marcação fora do PHP.

Uma classe dentro de `classes/output/` pode ser útil se a preparação dos dados começar a crescer, mas não precisa criar uma arquitetura cerimonial para uma lista de três campos. Use classe quando ela melhorar separação e teste, não porque todo template precisa obrigatoriamente de um objeto intermediário.

E, novamente, não crie `renderer.php` só para ter um método que chama `render_from_template()`. Esse padrão era comum quando renderer tinha um papel muito maior na arquitetura de apresentação do Moodle, mas para um block plugin novo com template direto normalmente não acrescenta nada.

## 16.31 Output class quando o conteúdo cresce

Quando o bloco precisa preparar uma estrutura maior, crie uma classe dedicada:

```php
namespace block_quicklinks\output;

use renderable;
use templatable;
use renderer_base;

class content implements renderable, templatable {

    public function __construct(
        private readonly array $items
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'hasitems' => !empty($this->items),
            'items' => $this->items,
        ];
    }
}
```

No bloco:

```php
$view = new \block_quicklinks\output\content($items);
$data = $view->export_for_template($OUTPUT);
$this->content->text = $OUTPUT->render_from_template(
    'block_quicklinks/content',
    $data
);
```

A vantagem é manter `get_content()` legível e concentrar preparação da view em um lugar testável.

## 16.32 Links e URLs

Não concatene URL manualmente:

```php
$url = $CFG->wwwroot . '/blocks/quicklinks/view.php?id=' . $courseid;
```

Use `moodle_url`:

```php
$url = new moodle_url('/blocks/quicklinks/view.php', [
    'courseid' => $courseid,
]);
```

Além da consistência, isso reduz erros com escaping, parâmetros e mudanças de base URL.

Se o link executa uma ação de alteração de estado, ele provavelmente precisa de `sesskey` e a página precisa chamar `require_sesskey()`, ou melhor ainda, a ação deve ser submetida por um fluxo apropriado e não por GET apenas porque cabe em um link.

## 16.33 Arquivos em Blocks

Um block plugin pode armazenar arquivos usando File API exatamente como outros componentes. O componente será algo como `block_quicklinks`, e o contexto natural de arquivos específicos da instância normalmente será o contexto do bloco.

Uma file area poderia se chamar `attachments`:

```
contextid = contexto da instância do bloco
component = block_quicklinks
filearea = attachments
itemid = 0 ou identificador da entidade
```

O importante é não assumir caminho físico em moodledata. Use `get_file_storage()`, `stored_file` e `pluginfile()` conforme vimos no Capítulo 9.

## 16.34 pluginfile() em block plugin

Se o bloco possui arquivos privados que devem ser servidos sob controle do plugin, implemente o callback correspondente, por exemplo:

```php
function block_quicklinks_pluginfile(
    $course,
    $bi,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($context->contextlevel !== CONTEXT_BLOCK) {
        return false;
    }

    require_login();

    if ($filearea !== 'attachments') {
        return false;
    }

    // Localize o arquivo com File API, valide acesso e envie com send_stored_file().
}
```

Não use o callback como proxy cego para qualquer arquivo do contexto. Valide filearea, parâmetros, login, capability e relação do usuário com o conteúdo.

## 16.35 Editor com arquivos na configuração da instância

Quando a configuração da instância usa editor HTML com imagens ou anexos, o assunto fica mais complexo porque os arquivos inicialmente passam pela draft area do usuário e depois precisam ser movidos para uma file area permanente.

Esse é um dos casos em que `instance_config_save()` pode ser necessário para processar o conteúdo e salvar os arquivos corretamente. Não grave `@@PLUGINFILE@@` ou draft URLs sem entender o fluxo, porque a configuração pode parecer funcionar para quem editou e quebrar para outro usuário ou depois que a draft area for limpa.

Como o fluxo é exatamente o mesmo conceito visto na Forms API e no Files API, reutilize as funções do core em vez de copiar arquivo manualmente.

## 16.36 CSS do bloco

CSS pode ficar em `styles.css` conforme a convenção do plugin, mas tente limitar os seletores ao seu componente. Evite regras genéricas como:

```
.card {
    margin: 0;
}
```

Isso pode alterar qualquer outro componente do Moodle que use `.card`.

Prefira escopo:

```
.block_quicklinks .quicklinks-list {
    margin: 0;
}
```

Mesmo assim, não tente redesenhar a moldura externa inteira do bloco. Essa parte pertence ao tema. Seu CSS deveria cuidar do conteúdo interno e dos estados específicos do componente.

## 16.37 Acessibilidade

Um bloco pequeno também precisa ser acessível. Links precisam de texto compreensível, botões precisam ser botões, ícones decorativos não devem poluir leitores de tela e controles interativos precisam funcionar por teclado.

Se o título visual diz "Pendências" e o link é apenas um ícone de seta, o leitor de tela precisa receber nome acessível para aquela ação. Se você usa lista de itens, marque como lista quando isso representa semanticamente o conteúdo.

Não use JavaScript para transformar `div` em botão se um `<button>` resolve melhor.

## 16.38 Visibilidade e conteúdo vazio

Nem sempre o bloco tem algo para mostrar. Em vez de renderizar uma caixa com "nenhum dado" sem utilidade, pense se faz sentido o bloco desaparecer ou apresentar estado vazio útil.

A implementação base possui lógica de conteúdo e o sistema pode considerar blocos vazios. Se o conteúdo é realmente opcional, mantenha esse comportamento previsível e não use espaços, `&nbsp;` ou HTML invisível apenas para forçar a caixa a aparecer.

Estado vazio é parte da interface. Pode explicar ao usuário por que não existe conteúdo e o que ele precisa fazer, desde que isso ajude de verdade.

## 16.39 hide_header()

Existe suporte para ocultar o cabeçalho do bloco sobrescrevendo `hide_header()`, mas use isso com bastante critério.

Um título é importante para contexto visual e acessibilidade. Esconder o cabeçalho apenas porque o layout parece mais bonito pode deixar o conteúdo sem identificação clara.

Se o design pede um componente sem título, verifique como o tema e a semântica resultante ficam antes de simplesmente retornar `true`.

## 16.40 Configuração e cache

Quando o administrador muda uma configuração global ou uma instância é editada, qualquer cache derivado daqueles valores pode ficar inválido. Não esqueça de ligar a alteração à invalidação necessária.

Se o cache é apenas por requisição, o problema some na próxima página. Se é Application cache em Redis, ele pode continuar entregando dado antigo por horas ou dias.

Mais uma vez, cache sem estratégia de invalidação não é otimização completa.

## 16.41 Backup de Blocks

Blocos participam de backup e restore quando fazem parte de conteúdos que são copiados entre cursos, mas o nível de implementação depende do que o plugin armazena.

Se o bloco guarda apenas configuração simples na própria instância e não possui tabelas ou file areas adicionais complexas, a quantidade de código necessária pode ser pequena. Se o bloco possui tabelas próprias, arquivos, referências para usuários ou entidades do curso, você precisa implementar suporte em `backup/moodle2/` para transportar esses dados corretamente.

A API de backup possui tarefas específicas para blocks e trabalha com estrutura, file areas e dados configurados da instância. Vamos aprofundar todo esse mecanismo no Capítulo 24, então aqui o objetivo é apenas não cair na falsa ideia de que backup de bloco acontece automaticamente para qualquer dado inventado pelo plugin.

## 16.42 Backup de configuração não é backup das suas tabelas

Se você criou uma tabela `block_quicklinks_items`, os registros dessa tabela não entram magicamente no backup só porque o bloco que os usa foi incluído no curso.

Você precisa declarar como esses dados são exportados e restaurados, inclusive remapeando IDs quando necessário. O mesmo vale para arquivos associados às entidades.

Esse problema às vezes só aparece quando um cliente duplica um curso e percebe que o bloco copiado continua apontando para dados do curso original, ou pior, para registros que nem existem na nova instalação.

## 16.43 Remoção da instância e limpeza de dados

Se seus dados pertencem exclusivamente a uma instância de bloco, pense no que acontece quando ela é removida. Não deixe registros órfãos acumulando para sempre.

Se os dados são globais do plugin, obviamente não devem ser apagados junto com uma instância. A decisão depende do modelo de propriedade que você definiu.

Essa é mais uma razão para modelar explicitamente o vínculo entre instância e dados. Quando tudo está misturado em configuração serializada, fica fácil. Quando existem tabelas próprias, o ciclo de vida precisa ser tratado conscientemente.

## 16.44 Bloco não é lugar para cron improvisado

Não tente fazer atualização periódica verificando o horário toda vez que `get_content()` executa:

```
if ($lastupdate < time() - 3600) {
    update_everything();
}
```

Isso cria corrida, lentidão e comportamento imprevisível. Se precisa atualizar de hora em hora, use Scheduled Task. Se uma ação do usuário precisa agendar processamento, use Adhoc Task.

O bloco lê o estado processado e apresenta o resultado. A regra não muda porque a interface é pequena.

## 16.45 Bloco não deve virar mini aplicação inteira

É perfeitamente possível um block plugin ter várias classes, páginas auxiliares e endpoints, mas em algum momento você precisa perguntar se o tipo de plugin ainda representa a funcionalidade.

Se o bloco virou apenas um ícone que abre uma aplicação administrativa com dez páginas, talvez a aplicação devesse ser um `local` ou outro tipo apropriado, e o bloco apenas uma integração opcional apontando para ela.

Não existe prêmio por concentrar tudo em um único plugin. Arquitetura boa é aquela em que cada componente possui responsabilidade coerente.

## 16.46 Estrutura de um bloco um pouco maior

Um block plugin maduro poderia ficar assim:

```
blocks/quicklinks/
├── amd/
│   └── src/
│       └── main.js
├── classes/
│   ├── local/
│   │   └── service.php
│   └── output/
│       └── content.php
├── db/
│   ├── access.php
│   └── caches.php
├── lang/
│   ├── en/
│   │   └── block_quicklinks.php
│   └── pt_br/
│       └── block_quicklinks.php
├── templates/
│   └── content.mustache
├── block_quicklinks.php
├── edit_form.php
├── settings.php
├── styles.css
└── version.php
```

A estrutura não é objetivo. Ela é consequência das responsabilidades que o plugin adquiriu.

## 16.47 Exemplo completo - objetivo

Vamos criar um bloco `block_coursepulse` que exibe um pequeno resumo do curso atual. Ele mostrará quantidade de atividades visíveis e um link para uma página detalhada. Cada instância pode escolher um título e a quantidade máxima de itens exibidos.

Não vamos implementar analytics completo porque isso desviaria o foco. O objetivo é mostrar a arquitetura correta de um block plugin.

## 16.48 version.php

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'block_coursepulse';
$plugin->version = 2026092300;
$plugin->requires = 2024100700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

A versão mínima deve refletir a branch que você realmente suporta. Não copie `requires` de exemplo sem relacionar com a matriz de testes do plugin.

## 16.49 Strings

Em `lang/en/block_coursepulse.php`:

```php
<?php

$string['pluginname'] = 'Course pulse';
$string['customtitle'] = 'Custom title';
$string['maxitems'] = 'Maximum items';
$string['openreport'] = 'Open detailed report';
$string['coursepulse:addinstance'] = 'Add a Course pulse block';
$string['coursepulse:myaddinstance'] = 'Add a Course pulse block to Dashboard';
```

Em `pt_br`, traduza os mesmos identificadores. Não coloque texto literal em template ou PHP apenas porque o exemplo é pequeno.

## 16.50 db/access.php

```php
<?php

$capabilities = [
    'block/coursepulse:addinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_BLOCK,
        'archetypes' => [
            'editingteacher' => CAP_ALLOW,
            'manager' => CAP_ALLOW,
        ],
        'clonepermissionsfrom' => 'moodle/site:manageblocks',
    ],

    'block/coursepulse:myaddinstance' => [
        'riskbitmask' => RISK_SPAM | RISK_XSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [],
        'clonepermissionsfrom' => 'moodle/my:manageblocks',
    ],
];
```

Neste exemplo o bloco foi pensado para curso, então não vamos habilitar normalmente no Dashboard, apesar de manter a capability padrão disponível caso o desenho mude no futuro. Também seria válido nem permitir `my` em `applicable_formats()`.

## 16.51 edit_form.php

```php
<?php

class block_coursepulse_edit_form extends block_edit_form {

    protected function specific_definition($mform): void {
        $mform->addElement(
            'header',
            'configheader',
            get_string('blocksettings', 'block')
        );

        $mform->addElement(
            'text',
            'config_title',
            get_string('customtitle', 'block_coursepulse')
        );
        $mform->setType('config_title', PARAM_TEXT);

        $mform->addElement(
            'select',
            'config_maxitems',
            get_string('maxitems', 'block_coursepulse'),
            [3 => 3, 5 => 5, 10 => 10]
        );
        $mform->setDefault('config_maxitems', 5);
    }
}
```

Esse formulário configura a instância, não o plugin inteiro.

## 16.52 Classe de serviço

Em `classes/local/service.php`:

```php
<?php

namespace block_coursepulse\local;

class service {

    public function get_course_items(int $courseid, int $limit): array {
        global $DB;

        $sql = "SELECT cm.id, m.name AS modulename
                  FROM {course_modules} cm
                  JOIN {modules} m ON m.id = cm.module
                 WHERE cm.course = :courseid
                   AND cm.visible = :visible
              ORDER BY cm.id DESC";

        return array_values($DB->get_records_sql(
            $sql,
            [
                'courseid' => $courseid,
                'visible' => 1,
            ],
            0,
            $limit
        ));
    }
}
```

Em uma aplicação real talvez seja melhor usar APIs de course/modinfo em vez de consultar determinadas tabelas diretamente, dependendo do que você precisa. O exemplo está isolado na classe justamente para que a decisão de obtenção dos dados não contamine o bloco inteiro.

## 16.53 Output class

```php
<?php

namespace block_coursepulse\output;

use renderable;
use renderer_base;
use templatable;

class content implements renderable, templatable {

    public function __construct(
        private readonly array $items,
        private readonly string $reporturl
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'hasitems' => !empty($this->items),
            'items' => array_map(
                static fn($item) => [
                    'id' => $item->id,
                    'modulename' => $item->modulename,
                ],
                $this->items
            ),
            'reporturl' => $this->reporturl,
        ];
    }
}
```

A classe não monta HTML. Ela prepara uma estrutura previsível para o template.

## 16.54 Template

Em `templates/content.mustache`:

```mustache
<div class="block-coursepulse-content">
    {{#hasitems}}
        <ul class="block-coursepulse-list">
            {{#items}}
                <li>{{modulename}} #{{id}}</li>
            {{/items}}
        </ul>
    {{/hasitems}}

    {{^hasitems}}
        <p>{{#str}}nothingtodisplay{{/str}}</p>
    {{/hasitems}}

    <a href="{{reporturl}}">
        {{#str}}openreport, block_coursepulse{{/str}}
    </a>
</div>
```

## 16.55 Classe principal completa

```php
<?php

defined('MOODLE_INTERNAL') || die();

class block_coursepulse extends block_base {

    public function init(): void {
        $this->title = get_string('pluginname', 'block_coursepulse');
    }

    public function specialization(): void {
        if (!empty($this->config->title)) {
            $this->title = format_string($this->config->title);
        }
    }

    public function applicable_formats(): array {
        return [
            'course-view' => true,
            'mod' => true,
            'my' => false,
            'site-index' => false,
            'admin' => false,
        ];
    }

    public function instance_allow_multiple(): bool {
        return true;
    }

    public function get_content(): stdClass {
        global $COURSE, $OUTPUT;

        if ($this->content !== null) {
            return $this->content;
        }

        $limit = (int)($this->config->maxitems ?? 5);
        if (!in_array($limit, [3, 5, 10], true)) {
            $limit = 5;
        }

        $service = new \block_coursepulse\local\service();
        $items = $service->get_course_items((int)$COURSE->id, $limit);

        $url = new moodle_url('/blocks/coursepulse/report.php', [
            'courseid' => $COURSE->id,
        ]);

        $view = new \block_coursepulse\output\content(
            $items,
            $url->out(false)
        );

        $this->content = new stdClass();
        $this->content->text = $OUTPUT->render_from_template(
            'block_coursepulse/content',
            $view->export_for_template($OUTPUT)
        );
        $this->content->footer = '';

        return $this->content;
    }
}
```

O método principal continua curto porque banco, preparação de dados e apresentação não foram empilhados dentro dele.

## 16.56 Página detalhada

A página `report.php` deve repetir todas as verificações necessárias. O fato de o link ter vindo do bloco não autoriza ninguém.

```php
<?php

require('../../config.php');

$courseid = required_param('courseid', PARAM_INT);

$course = get_course($courseid);
require_login($course);

$context = context_course::instance($course->id);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/blocks/coursepulse/report.php', [
    'courseid' => $course->id,
]));
$PAGE->set_title(get_string('pluginname', 'block_coursepulse'));
$PAGE->set_heading(format_string($course->fullname));

echo $OUTPUT->header();

// Renderize o relatório usando Output API e Mustache.

echo $OUTPUT->footer();
```

Se o relatório exige capability própria, chame `require_capability()` aqui. Não confie em ocultar o link no bloco.

## 16.57 Erros comuns em Blocks

Depois de revisar muitos plugins, alguns padrões aparecem repetidamente. `get_content()` consulta tudo diretamente, concatena HTML e chama API externa; `applicable_formats()` retorna `all => true` porque ninguém pensou onde o bloco realmente funciona; configuração por instância guarda dados que deveriam estar em tabela; JavaScript inline manipula DOM global; o plugin consulta `$CFG->dataroot` diretamente para arquivo; capability é testada no contexto errado; e uma rotina essencial só acontece quando alguém abre a página onde o bloco está instalado.

Nenhum desses problemas existe porque Block API é ruim. Eles aparecem porque a superfície pequena do bloco incentiva o desenvolvedor a concentrar responsabilidade ali.

## 16.58 O bloco como camada de integração visual

Uma forma saudável de pensar em Blocks é tratá-los como adaptadores visuais. Eles pegam dados que já existem em serviços do plugin ou do Moodle e os apresentam no contexto da página.

Quando a regra fica fora da classe principal, o mesmo serviço pode ser usado por uma página completa, AJAX, task ou Web Service. O bloco deixa de ser o centro do sistema e vira uma das interfaces possíveis para aquela funcionalidade.

Isso também facilita teste. Você não precisa instanciar todo o sistema de blocos para validar uma regra de negócio que poderia ser testada diretamente em uma classe.

## 16.59 Exercício - criar um bloco configurável e contextual

Crie um plugin chamado `block_courseoverviewplus` com os seguintes requisitos.

O bloco deve aparecer apenas em páginas de curso e de atividades. Deve permitir múltiplas instâncias e cada instância poderá escolher um título próprio e um limite entre 3, 5 ou 10 itens. O conteúdo exibirá atividades recentes ou outro conjunto de dados do curso que você considere útil, mas a consulta deve ficar em uma classe dentro de `classes/local/`, nunca diretamente no template.

A interface deve usar Mustache e não pode montar HTML concatenando strings em `get_content()`. Não crie `renderer.php`. Se houver JavaScript, use módulo próprio e não script inline. Defina `addinstance` em `db/access.php`, aplique contexto corretamente e crie uma página de detalhes que repita autenticação e autorização em vez de confiar no link vindo do bloco.

Adicione uma configuração global em `settings.php` que permita ao administrador ativar ou desativar um recurso visual do bloco e uma configuração por instância em `edit_form.php`. Se usar cache, explique qual evento ou alteração invalida o dado. Se adicionar arquivos, use File API e contexto do bloco.

Por fim, responda por escrito quatro perguntas. O que deixaria de funcionar se a instância fosse removida? Quais dados pertencem ao plugin e quais pertencem à instância? O bloco continuaria seguro se alguém chamasse diretamente a página de detalhes? E, se a consulta de conteúdo demorasse cinco segundos, qual parte você moveria para processamento assíncrono?

Se você consegue responder essas quatro perguntas com clareza, então não criou apenas um bloco que aparece na tela. Você criou um componente que entende o próprio ciclo de vida dentro do Moodle.

## Referências técnicas consultadas

* Moodle Developer Resources. Block plugins. https://moodledev.io/docs/5.0/apis/plugintypes/blocks
* Moodle Developer Resources. Backup API. https://moodledev.io/docs/5.2/apis/subsystems/backup
* Moodle Developer Resources. File API. https://moodledev.io/docs/5.0/apis/subsystems/files
* Moodle source code. `public/blocks/moodleblock.class.php`. https://github.com/moodle/moodle

{% endraw %}
