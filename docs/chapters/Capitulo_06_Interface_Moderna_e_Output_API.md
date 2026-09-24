# 6 INTERFACE MODERNA E OUTPUT API

Uma página Moodle pode estar correta do ponto de vista funcional e ainda assim estar mal construída. Ela consulta os dados certos, respeita capability, salva sem erro e entrega o resultado esperado, mas mistura HTML com PHP, espalha JavaScript pelo arquivo, duplica strings, cria botão manualmente, ignora o tema e fica praticamente impossível de reaproveitar quando aparece uma segunda tela parecida. É o tipo de código que passa no primeiro teste e começa a cobrar juros assim que o plugin cresce.

A Output API existe justamente para evitar que a interface vire uma coleção de `echo`, concatenação de HTML e decisões visuais misturadas com regra de negócio. O Moodle separa a preparação dos dados da forma como esses dados serão apresentados, enquanto templates, classes de output, JavaScript, componentes visuais e o sistema de temas trabalham em conjunto para permitir que a mesma funcionalidade continue sustentável quando o layout muda, quando o tema é trocado ou quando parte da interface passa a ser atualizada sem recarregar a página inteira.

Neste capítulo vamos construir essa separação aos poucos. Primeiro vamos entender o papel de `$OUTPUT` e dos templates Mustache, depois vamos organizar os dados em classes de output, entrar no JavaScript moderno do Moodle e terminar ligando tudo isso a acessibilidade, CSS, temas e componentes dinâmicos. A ideia não é decorar APIs, mas conseguir olhar para uma página PHP cheia de HTML e saber exatamente o que precisa sair dali e para onde cada responsabilidade deve ir.

## 6.1 Moodle Output API

A Output API é a camada que organiza a geração da interface do Moodle. Ela fica entre os dados preparados pelo código PHP e o HTML que finalmente será entregue ao navegador, por isso quando o plugin usa bem essa API ele deixa de tratar a página como um arquivo que imprime coisas e passa a tratá-la como uma composição de objetos, templates e componentes de apresentação.

Isso parece uma mudança de vocabulário, mas na prática muda bastante a manutenção. Imagine uma página administrativa que lista integrações externas, mostra estado, última sincronização e botões de ação. Uma implementação rápida pode consultar o banco e, dentro do mesmo `foreach`, montar `<tr>`, `<td>`, `<a>` e classes CSS. Funciona, mas agora a consulta conhece a tabela HTML, a regra que calcula o estado conhece a cor do badge e o código PHP precisa saber exatamente como o botão será desenhado. Quando alguém pede a mesma lista dentro de um modal ou em outra página, a duplicação começa.

Com a Output API, a consulta e a regra de negócio produzem dados, uma classe de output transforma esses dados em uma estrutura adequada para apresentação e um template decide o HTML. JavaScript pode complementar a interação sem precisar reimplementar a renderização do zero, e um tema ainda consegue sobrescrever templates quando isso fizer sentido. Não é uma separação criada por estética de arquitetura, mas uma forma de reduzir acoplamento entre coisas que mudam por motivos diferentes.

A documentação atual do Moodle continua tratando a Output API como o ponto central para renderers, renderables, templates e integração com temas, e nas versões recentes essa camada também ganhou novos caminhos de integração com frontend moderno, inclusive React no Moodle 5.2, mas a ideia base permanece a mesma, dados não deveriam conhecer detalhes desnecessários da apresentação.

## 6.2 A global `$OUTPUT`

Depois do bootstrap do Moodle, `$OUTPUT` aparece em praticamente qualquer página que precise gerar interface. Ele é um renderer ligado ao contexto da página e ao tema ativo, por isso não deve ser entendido como um simples objeto com funções utilitárias para imprimir HTML.

Quando você executa `echo $OUTPUT->header();`, por exemplo, não está apenas pedindo um cabeçalho estático. O Moodle considera o layout da página, o tema, navegação, blocos, metadados, requisitos JavaScript e vários outros elementos que foram configurados em `$PAGE`. O mesmo vale para `footer()`, `heading()`, notificações, pix icons e a renderização de templates.

Uma página mínima costuma ter algo nesta linha.

```php
require_once(__DIR__ . '/../../config.php');

require_login();

$url = new moodle_url('/local/catalogsync/index.php');
$PAGE->set_url($url);
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('pluginname', 'local_catalogsync'));
$PAGE->set_heading(get_string('pluginname', 'local_catalogsync'));

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('pluginname', 'local_catalogsync'));

echo $OUTPUT->footer();
```

O erro começa quando alguém conclui que, já que `$OUTPUT` está disponível, tudo que é interface deveria virar chamada direta nele. `$OUTPUT` não substitui template, não deveria receber regra de negócio e também não é motivo para criar um renderer próprio para cada página. Ele é uma peça da camada de saída e, na maioria das telas modernas, acaba sendo usado para estrutura geral da página e para renderizar templates ou objetos de output.

## 6.3 `render_from_template()`

`render_from_template()` é uma das funções mais úteis quando queremos parar de escrever HTML no PHP sem criar arquitetura demais. Você fornece o nome Frankenstyle do template e um contexto de dados simples, e o Moodle devolve o HTML renderizado.

```php
$data = [
    'name' => $course->fullname,
    'status' => get_string('statusactive', 'local_catalogsync'),
];

echo $OUTPUT->render_from_template('local_catalogsync/course_status', $data);
```

O template correspondente fica em `templates/course_status.mustache`.

```mustache
<div class="local-catalogsync-course-status">
    <strong>{{name}}</strong>
    <span>{{status}}</span>
</div>
```

O ganho não é apenas deixar o PHP mais bonito. O HTML agora pode ser lido sem navegar por concatenações, o template pode ser sobrescrito por tema, o mesmo contexto pode ser renderizado em outro ponto e o JavaScript consegue usar a mesma infraestrutura de templates quando necessário.

Existe uma tentação de usar `render_from_template()` para tudo diretamente a partir da página PHP, e em telas pequenas isso pode ser perfeitamente aceitável. Quando a preparação do contexto começa a crescer, porém, com regras de visibilidade, formatação, URLs, coleções e estados derivados, chegou a hora de mover essa preparação para `classes/output/` em vez de transformar `index.php` em uma fábrica de arrays gigantes.

## 6.4 Mustache no Moodle

Mustache é um sistema de templates propositalmente simples. Ele não foi criado para receber consultas, executar regra de negócio ou virar uma linguagem de programação paralela dentro do HTML, e essa limitação é uma vantagem porque força o template a trabalhar principalmente com apresentação.

No Moodle, templates Mustache podem ser renderizados no servidor pelo PHP e também no navegador pelo JavaScript, o que facilita manter uma única representação visual quando parte da interface precisa ser criada ou atualizada dinamicamente. O sistema de temas também pode sobrescrever templates de componentes, então a decisão de usar Mustache melhora a capacidade de customização sem que o plugin precise conhecer o tema ativo.

Se você está acostumado com engines mais poderosas, pode achar estranho não existir uma quantidade enorme de expressões dentro do template. A pergunta que vale fazer é outra. Se o template precisa calcular regra complexa para descobrir se um botão aparece, por que esse cálculo não foi feito antes? Normalmente o contexto deveria chegar preparado, algo como `canedit`, `showwarning` ou `items`, deixando o template decidir apenas o que renderizar com base nesses dados.

## 6.5 `templates/*.mustache`

Os templates do plugin ficam no diretório `templates/`, e o nome usado em `render_from_template()` combina componente e arquivo. Se temos `local_catalogsync/templates/course_status.mustache`, o identificador será `local_catalogsync/course_status`.

Essa convenção é importante porque o Moodle precisa localizar o template, aplicar possíveis overrides do tema e permitir que o frontend também faça referência ao mesmo recurso. Não invente uma pasta `views/` com PHP incluído manualmente só porque outro framework trabalha assim. Dentro do Moodle, `templates/` já participa da infraestrutura oficial e oferece mais integração.

É perfeitamente possível organizar templates com nomes descritivos e subdiretórios quando a versão suportada e as convenções do componente permitem, mas não transforme o diretório em uma árvore profunda sem necessidade. Uma boa regra prática é que o nome deve revelar o componente visual ou a parte da página que ele representa, como `sync_status`, `item_card`, `report_table` ou `settings_warning`.

Também vale lembrar que template não é página PHP. Ele não deveria executar bootstrap, verificar login, consultar banco nem chamar capability. Tudo isso acontece antes. Quando o Mustache recebe os dados, a decisão de acesso já deveria estar resolvida.

## 6.6 Contexto enviado ao Mustache

A palavra contexto aparece em dois lugares no Moodle e é fácil criar confusão. O contexto de permissão, como `context_course` ou `context_module`, controla autorização. O contexto do Mustache é simplesmente o conjunto de dados que será usado para renderizar o template.

```php
$data = [
    'title' => format_string($course->fullname),
    'canedit' => has_capability('local/catalogsync:manage', $context),
    'items' => $items,
];
```

Esse array é o contexto de renderização. Ele deve ser composto por valores simples, arrays e objetos adequados para serialização. Se você envia uma estrutura complexa demais, cheia de objetos de domínio e dependências internas, o template passa a depender de detalhes que não deveria conhecer.

A classe `templatable` reforça essa ideia ao exigir `export_for_template()`, cujo papel é transformar o estado interno da classe em algo apropriado para apresentação. Isso cria uma fronteira clara, de um lado você pode ter objetos ricos e regras de negócio, do outro o template recebe apenas aquilo que realmente precisa.

## 6.7 Variáveis

Variáveis em Mustache usam `{{nome}}`. Se o contexto contém `['name' => 'Curso de PHP']`, `{{name}}` será substituído pelo valor correspondente com escaping adequado para HTML.

```mustache
<h3>{{name}}</h3>
```

Quando a variável não existe ou está vazia, Mustache trabalha de forma silenciosa, o que é conveniente para apresentação mas pode esconder erro de preparação de dados durante o desenvolvimento. Se um campo obrigatório não aparece, não assuma imediatamente que o template está errado, primeiro confira o contexto exportado.

Evite nomes genéricos como `value`, `data1` ou `flag`. Templates vivem bastante e muitas vezes são revisados por outra pessoa sem abrir a classe PHP ao lado, portanto `canmanage`, `formatteddate` e `detailurl` explicam muito mais do que `x`, `date` e `url`.

Também prefira enviar dados já formatados quando a regra de formatação pertence ao servidor. Uma data pode chegar como `formattedtime` em vez de obrigar o template a saber como converter timestamp, e uma URL deve chegar preparada como string apropriada ou estrutura prevista pela camada de output, não montada por concatenação dentro do HTML.

## 6.8 Sections

Sections usam `{{#nome}} ... {{/nome}}` e servem tanto para condições verdadeiras quanto para percorrer coleções. Isso cobre boa parte das necessidades de apresentação sem criar `if` ou `foreach` tradicionais dentro do template.

```mustache
{{#canmanage}}
    <a href="{{editurl}}" class="btn btn-secondary">
        {{#str}} edit, core {{/str}}
    </a>
{{/canmanage}}
```

Para listas, o mesmo mecanismo é aplicado sobre cada item.

```mustache
{{#items}}
    <div class="local-catalogsync-item">
        <span>{{name}}</span>
        <span>{{status}}</span>
    </div>
{{/items}}
```

O ponto importante é não começar a transportar regra de negócio para essas condições. `{{#canmanage}}` é bom porque a autorização já foi calculada. Criar várias combinações de flags para reconstruir uma regra complexa dentro do template normalmente indica que a preparação dos dados ainda está incompleta.

## 6.9 Inverted sections

Inverted sections usam `{{^nome}} ... {{/nome}}` e renderizam quando o valor é falso, vazio ou a coleção não possui itens. São especialmente úteis para estados vazios.

```mustache
{{^items}}
    <div class="alert alert-info">
        {{#str}} noitems, local_catalogsync {{/str}}
    </div>
{{/items}}
```

Isso evita que o PHP precise escolher entre dois templates apenas para mostrar a ausência de dados. Mesmo assim, se o estado vazio tiver comportamento totalmente diferente, talvez seja mais claro preparar uma propriedade como `isempty` ou até usar componentes separados, especialmente quando o layout cresce.

## 6.10 Partials

Partials permitem reutilizar outro template dentro do template atual. A sintaxe é `{{> componente/template }}`.

```mustache
{{#items}}
    {{> local_catalogsync/item_card }}
{{/items}}
```

Essa técnica é útil quando o mesmo pedaço visual aparece em listas diferentes ou quando um template principal começa a ficar grande demais. Um card, uma linha de estado ou um bloco de ações pode virar partial e receber o contexto do ponto em que foi incluído.

O cuidado é o mesmo que existe com funções pequenas demais. Dividir cada `<span>` em um template separado não melhora arquitetura, apenas espalha a leitura. Extraia um partial quando ele representar um componente visual identificável ou quando houver reutilização real.

O Moodle também fornece partials de core para componentes comuns, e usar esses elementos costuma ser melhor do que recriar marcação complexa por conta própria.

## 6.11 Helpers do Moodle

O Moodle adiciona helpers ao Mustache para resolver tarefas recorrentes sem colocar PHP no template. Entre os mais conhecidos estão helpers de string, pix, quote e blocos usados para inicialização de comportamento no frontend.

Helpers são interessantes porque preservam a separação entre template e implementação do core. Em vez de escrever manualmente uma URL de imagem ou tentar resolver idioma no PHP apenas para um rótulo simples, você usa o mecanismo que o Moodle já sabe processar tanto no servidor quanto em outros contextos de renderização.

Não confunda helper com desculpa para esconder lógica. Se você começa a desejar um helper próprio para calcular regra de negócio, provavelmente está tentando forçar o template a assumir responsabilidade que pertence ao PHP ou ao componente JavaScript.

## 6.12 Strings de idioma em templates

O helper `str` permite buscar strings diretamente no template.

```mustache
<button type="button" class="btn btn-primary">
    {{#str}} savechanges, core {{/str}}
</button>
```

Para strings do plugin, informe o componente.

```mustache
{{#str}} syncnow, local_catalogsync {{/str}}
```

Isso evita preparar no PHP dezenas de propriedades apenas para rótulos estáticos. Se o texto depende de dados, o helper também suporta parâmetros, mas quando a composição começa a ficar complexa pode ser mais legível fazer `get_string()` durante a preparação do contexto.

A regra principal continua a mesma do restante do Moodle, texto de interface não deve ser escrito diretamente no template se precisa ser traduzível. Escrever `<button>Sincronizar agora</button>` funciona na sua instalação em português e já nasce errado para distribuição, testes de idioma e manutenção.

## 6.13 Pix helper

O helper `pix` gera imagens e ícones usando a infraestrutura do Moodle, respeitando tema e localização dos recursos.

```mustache
{{#pix}} i/settings, core, {{#str}} settings, core {{/str}} {{/pix}}
```

Em vez de apontar para `/pix/icon.svg` manualmente, deixe o Moodle resolver o recurso. Isso é especialmente importante porque temas podem sobrescrever imagens e porque caminhos físicos mudam de acordo com componente, cache e estrutura da instalação.

Para ícones de interface, verifique primeiro se o Moodle já oferece um ícone adequado. Criar um conjunto paralelo de SVG para ações comuns como editar, excluir ou configurações geralmente cria inconsistência visual sem benefício real.

## 6.14 URLs

URLs devem ser construídas no PHP com `moodle_url` quando dependem de rotas tradicionais e parâmetros conhecidos, ou pelas APIs modernas correspondentes quando a funcionalidade estiver usando o Routing Engine. O template recebe o resultado pronto para uso, em vez de concatenar caminhos e query strings.

```mustache
$data['editurl'] = (new moodle_url('/local/catalogsync/edit.php', [
    'id' => $item->id,
]))->out(false);
<a href="{{editurl}}">{{#str}} edit, core {{/str}}</a>
```

Concatenar algo como `/local/catalogsync/edit.php?id={{id}}` parece inofensivo, mas espalha conhecimento de rota pelo template, dificulta mudanças e incentiva a mesma prática em URLs mais complexas. A camada de apresentação deveria receber a URL que deve usar, não decidir como montá-la.

Em links de ação que modificam estado, a URL não resolve autorização nem CSRF. O endpoint continua responsável por validar login, capability, propriedade do recurso e `sesskey` quando necessário. Uma interface escondendo botão não é controle de segurança.

## 6.15 Escaping automático

Uma das vantagens de usar `{{variavel}}` é que Mustache faz escaping de HTML. Se o valor contém `<script>` ou qualquer marcação, o conteúdo é tratado como texto e não interpretado como HTML.

Esse comportamento reduz bastante a chance de Stored XSS quando você apresenta dados vindos de usuário, banco ou integração externa, mas não substitui todas as regras de segurança. O dado ainda precisa ser tratado de acordo com sua natureza, e textos ricos devem passar pelas APIs corretas, como `format_text()`, considerando contexto, formato e arquivos incorporados.

O erro perigoso aparece quando alguém percebe que o texto formatado está sendo escapado e decide trocar todas as variáveis por três chaves. A partir desse momento você retirou uma proteção importante e assumiu a responsabilidade de garantir que aquele HTML é seguro.

```mustache
6.16 {{{ }}} e os riscos de conteúdo não escapado
```

Três chaves informam ao Mustache que o conteúdo já está pronto para ser inserido como HTML. Isso é necessário em alguns casos, por exemplo quando o PHP já executou `format_text()` e devolveu HTML sanitizado conforme as regras do Moodle.

```mustache
$data['description'] = format_text(
    $record->description,
    $record->descriptionformat,
    ['context' => $context],
);
<div class="description">
    {{{description}}}
</div>
```

O problema é usar `{{{description}}}` diretamente sobre valor bruto vindo do banco porque "preciso preservar o HTML". Se esse campo contém conteúdo controlável por usuário e não passou pela API adequada, você acabou de abrir uma porta para XSS.

Uma prática saudável é que toda propriedade destinada a três chaves tenha nome que deixe claro que já foi processada, como `formatteddescription` ou `html`, e que essa transformação aconteça em `export_for_template()` ou em serviço de apresentação conhecido. Isso não torna o código magicamente seguro, mas torna a intenção auditável.

## 6.17 `classes/output/`

O diretório `classes/output/` organiza classes voltadas à apresentação. Ele costuma conter renderables, templatable objects, view models e, quando realmente necessário, renderer do componente.

Essa localização não é apenas estética. O autoload do Moodle entende a namespace do plugin e permite que a classe `local_catalogsync\output\report_page` viva em `classes/output/report_page.php`, deixando claro para quem lê o projeto que aquela classe pertence à camada de saída.

Não jogue qualquer classe usada por uma página dentro de `output`. Se uma classe consulta banco, executa sincronização e dispara task, ela provavelmente pertence a outra camada. `output` deve preparar o que será mostrado, e isso pode envolver pequenas decisões de apresentação, mas não deveria virar o novo `locallib.php` com tudo misturado.

## 6.18 `renderable`

`renderable` é uma interface marcadora. Ela indica que um objeto pode ser renderizado pela infraestrutura de output, mas não exige métodos próprios.

```php
namespace local_catalogsync\output;

use renderable;

final class status_badge implements renderable {
    public function __construct(
        public readonly string $status,
    ) {
    }
}
```

Sozinha, essa interface diz pouco sobre como os dados chegarão ao template, por isso normalmente aparece junto de `templatable` ou de uma implementação de renderer que saiba transformar o objeto em HTML.

Em código novo, pense no renderable como um objeto que representa algo visível, não como um serviço genérico. `report_page`, `sync_summary` e `item_card` fazem sentido, enquanto `utils` implementando `renderable` provavelmente revela que o desenho da classe ainda está confuso.

## 6.19 `templatable`

`templatable` define que a classe sabe exportar seus dados para um template por meio de `export_for_template(renderer_base $output)`. É uma das formas mais limpas de separar o estado interno do formato de apresentação.

```php
namespace local_catalogsync\output;

use renderable;
use renderer_base;
use templatable;

final class sync_summary implements renderable, templatable {
    public function __construct(
        private readonly int $total,
        private readonly int $pending,
        private readonly int $failed,
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'total' => $this->total,
            'pending' => $this->pending,
            'failed' => $this->failed,
            'hasfailures' => $this->failed > 0,
        ];
    }
}
```

Perceba que `hasfailures` é uma decisão útil para apresentação. O template não precisa comparar números nem descobrir a regra, recebe o estado pronto e decide mostrar ou esconder o aviso.

## 6.20 `named_templatable`

`named_templatable` estende a ideia de `templatable` permitindo que a própria classe informe qual template deve ser usado. Isso é útil quando o nome da classe e o nome do template não seguem a convenção esperada ou quando queremos explicitar esse vínculo.

A classe implementa `get_template_name()` e devolve algo como `local_catalogsync/sync_summary`. O Moodle consegue então renderizar o objeto sem que você crie um método de renderer apenas para encaminhar os dados ao template.

Essa possibilidade é uma das razões pelas quais criar `renderer.php` automaticamente para cada plugin moderno costuma ser desperdício. Se a única função do renderer seria chamar `export_for_template()` e depois `render_from_template()`, a infraestrutura já consegue fazer isso.

## 6.21 `export_for_template()`

`export_for_template()` é a fronteira entre objeto e template, e vale tratá-la com cuidado. Ela deve devolver uma estrutura simples, previsível e adequada para serialização, composta por escalares, arrays, `stdClass` e valores compatíveis com a infraestrutura.

Esse método é um bom lugar para preparar URLs, flags de apresentação, strings formatadas e coleções já transformadas. Não é um bom lugar para executar uma consulta pesada toda vez que alguém renderiza o objeto, nem para disparar efeito colateral como salvar registro ou enviar notificação.

Uma classe pode receber dependências ou dados no construtor e usar isso para montar a saída, mas tente evitar que `export_for_template()` vire uma segunda camada de serviço de domínio. Se o relatório exige várias consultas e agregações, um serviço pode preparar os dados e a classe de output apenas organizá-los para a tela.

Nas versões atuais existe ainda um detalhe importante. A documentação do Moodle 5.1 passou a destacar que o formato retornado por `export_for_template()` não deve ser usado como contrato estável de Web Service, porque ele pertence ao template e pode mudar junto com a interface. Para dados externos estáveis, a plataforma introduziu caminhos específicos como `externable` e exporters apropriados. Interface de tela e API pública são contratos diferentes, e misturá-los economiza código hoje para criar dependência ruim amanhã.

## 6.22 Separar preparação de dados da apresentação

Essa separação é provavelmente a decisão mais importante de todo o capítulo. A interface precisa receber dados já preparados o suficiente para não reproduzir regra de negócio, mas também não deveria carregar detalhes desnecessários de domínio apenas porque a classe original já os possui.

Imagine uma lista de sincronizações com estado `pending`, `running`, `failed` e `done`. A página precisa mostrar uma label traduzida, talvez um ícone, um botão de nova tentativa em alguns estados e um link para detalhes. Se o template recebe apenas o valor cru de `status`, ele passa a decidir qual texto usar e quando mostrar cada ação. Se o PHP monta o HTML inteiro, você volta ao problema original. A solução saudável é preparar propriedades como `statuslabel`, `canretry`, `detailurl` e, se necessário, uma classe semântica aprovada para apresentação.

A pergunta prática é sempre a mesma. Quem deveria conhecer essa regra? Se a regra existe porque o negócio funciona de determinada maneira, ela pertence ao domínio ou ao serviço. Se existe apenas para decidir como representar algo já calculado, pode ficar na camada de output. O template deve ser a última etapa, não o lugar em que a regra começa.

## 6.23 Por que eu evitaria criar renderer.php em um plugin novo

Se eu estiver começando um plugin Moodle hoje e alguém me perguntar se deve criar um renderer.php, minha resposta inicial é não. Não porque a API de renderer tenha desaparecido, não porque plugin_renderer_base tenha sido removido e muito menos porque o core tenha deixado de usar renderers, mas porque o arquivo deixou de ser a solução padrão para o problema que normalmente temos em um plugin novo. Na maior parte das telas atuais, criar uma classe de renderer apenas para receber um objeto, chamar export_for_template() e encaminhar o resultado para render_from_template() adiciona uma camada que não toma decisão nenhuma, e camada que não toma decisão costuma existir apenas porque herdamos uma receita antiga sem perguntar se o motivo original continua válido.

Esse cuidado é importante porque existe uma diferença grande entre dizer que renderer está deprecated e dizer que criar renderer por padrão é uma arquitetura ultrapassada. A primeira afirmação seria tecnicamente errada. O Moodle ainda possui renderer_base, plugin_renderer_base, core_renderer, get_renderer(), render() e vários renderers no core, além disso a documentação atual ainda mostra situações em que um renderer faz sentido. A segunda afirmação, porém, é exatamente o ponto que interessa neste livro. O padrão histórico de começar qualquer camada de interface criando renderer.php perdeu grande parte da razão de existir depois que o Moodle ganhou Mustache, render_from_template(), templatable, named_templatable e override de templates por tema.

Por isso eu prefiro uma regra bastante simples para código novo. Não crie renderer.php até conseguir explicar, em uma frase objetiva, qual comportamento ele acrescenta que não pode ser resolvido diretamente por template, classe de output ou pela infraestrutura normal de renderização. Se a resposta for "porque todo plugin tem renderer", "porque o tutorial mandou" ou "porque preciso chamar render_from_template()", não existe motivo arquitetural, existe apenas tradição.

### 6.23.1 Antes do renderer o HTML estava espalhado pelo Moodle

Para entender por que renderer.php parece tão importante quando você lê documentação antiga, precisamos voltar ao Moodle 1.9. Naquele período, a saída HTML estava espalhada por funções gerais em weblib.php e por código específico dentro de lib.php, locallib.php, view.php e outros arquivos dos componentes. Era normal encontrar PHP tomando decisão de negócio, consultando dados e construindo marcação no mesmo fluxo, além de funções globais como print_header(), print_box() e várias outras imprimindo diretamente partes da página.

O problema não era apenas estética. Quando o HTML nasce espalhado por funções globais e arquivos de domínio, o tema tem pouca capacidade de substituir a estrutura produzida pelo componente, e o desenvolvedor também não possui uma fronteira clara entre preparação dos dados e apresentação. Alterar a aparência de um controle podia exigir conhecer código PHP interno do componente, enquanto uma mudança funcional corria o risco de mexer em concatenações de HTML que não tinham relação com a regra alterada.

Foi nesse cenário que a arquitetura de renderers apareceu como uma melhoria importante. A documentação histórica do Moodle 2.0 registra explicitamente que, no Moodle 1.9, funções de output geral ficavam em weblib.php e módulos guardavam renderização em lib.php, locallib.php, view.php e outros pontos, e o projeto do novo sistema de renderização tinha entre seus objetivos oferecer uma API estável, fácil de usar e fácil de customizar por temas. Quando você olha para isso com os olhos de 2010, renderer não é excesso de arquitetura, é justamente a tentativa de tirar HTML de lugares ainda piores.

### 6.23.2 O Moodle 2.0 e a criação da Output API

O Moodle 2.0 trouxe uma mudança grande com a Output API, o global $OUTPUT e as classes de renderer. Em vez de chamar antigas funções print_* que imprimiam diretamente a resposta, o código passou a pedir a um renderer que produzisse a representação visual e devolvesse a string correspondente. Como o renderer podia variar conforme o tema, uma mesma chamada conseguia produzir saída diferente sem modificar o componente original.

A migração oficial para a API 2.0 deixava isso muito claro. Uma chamada antiga como print_box() passava a ser substituída por $OUTPUT->box(), enquanto componentes com saída própria podiam obter um renderer por meio da página e delegar a ele a geração do HTML. Naquele momento essa separação era uma evolução real, pois tirava o output de funções históricas e criava um lugar explícito para o tema sobrescrever comportamento de apresentação.

```php
// Estilo que se tornou comum a partir do Moodle 2.0.
$renderer = $PAGE->get_renderer('mod_exemplo');
echo $renderer->render_item($item);
```

O renderer também permitia targets diferentes, como HTML, CLI ou outras formas de saída, e o mecanismo de factories dos temas conseguia trocar a implementação concreta usada para renderizar um componente. Em um Moodle que ainda não tinha Mustache como sistema padrão de templates, colocar os métodos de saída em classes substituíveis era uma solução coerente para um problema que precisava ser resolvido.

### 6.23.3 Por que renderer.php fazia sentido naquela época

Há uma tendência ruim de olhar para arquitetura antiga e tratá-la como se sempre tivesse sido um erro. Não foi. renderer.php fazia sentido porque o Moodle precisava centralizar o HTML em algum lugar, permitir que temas tivessem controle sobre a saída e criar uma ponte entre código de negócio e apresentação. Sem um template engine integrado ao servidor e ao navegador, o renderer era o ponto onde a marcação podia ser organizada e sobrescrita.

A própria documentação da época incentivava que cada componente tivesse seu renderer e que os métodos fossem responsáveis por widgets ou controles específicos. O objetivo era reduzir a quantidade de HTML perdido em view.php e funções auxiliares. Se você mantinha Moodle 2.0, 2.1 ou 2.2, seguir esse padrão era bastante razoável e, em muitos casos, era a forma moderna de trabalhar naquele momento.

O problema começa quando pegamos uma solução criada para uma plataforma de 2010 e a tratamos como obrigação estrutural em 2026. O fato de uma decisão ter sido correta quando surgiu não significa que ela deva continuar sendo a primeira escolha depois que a plataforma adicionou mecanismos melhores para a mesma responsabilidade.

### 6.23.4 O renderer antigo ainda misturava PHP e HTML

Mesmo com a separação proporcionada pela Output API, o renderer clássico continuava sendo PHP produzindo HTML. A implementação podia usar html_writer, concatenar trechos, chamar métodos menores e organizar melhor a saída, mas a estrutura visual ainda vivia dentro de métodos PHP. Para quem precisava alterar marcação, revisar semântica HTML ou trabalhar apenas no tema, isso continuava criando uma dependência maior do código do componente.

```php
class mod_exemplo_renderer extends plugin_renderer_base {
    public function render_item($item): string {
        $output = html_writer::start_div('item');
        $output .= html_writer::tag('strong', s($item->name));
        $output .= html_writer::end_div();
        return $output;
    }
}
```

Esse exemplo é muito melhor do que espalhar concatenações pelo view.php, mas ainda precisamos abrir PHP para enxergar a estrutura da interface. À medida que componentes ficaram mais ricos, esses renderers cresceram e alguns acabaram virando classes enormes com dezenas de métodos, condicionais e pequenos pedaços de markup, o que resolveu a dispersão original mas criou outro tipo de concentração.

### 6.23.5 Não confunda $OUTPUT com renderer.php

Aqui existe uma distinção que vale repetir porque ela evita uma conclusão errada. Eu estou defendendo que você quase nunca precise criar um renderer.php novo no seu plugin, não que deva abandonar $OUTPUT ou a Output API. O próprio $OUTPUT é um renderer do Moodle e continua sendo a porta para header(), footer(), notification(), render_from_template(), render() e vários elementos compartilhados do core.

Também não estou dizendo que renderer_base deixou de existir ou que export_for_template() não possa receber um renderer. Essas peças continuam no contrato atual porque a infraestrutura de output do Moodle foi construída sobre elas. O que mudou é que o seu plugin não precisa necessariamente adicionar outra subclasse apenas para participar dessa infraestrutura.

## 6.24 O ponto de virada foi o Moodle 2.9 com Mustache

A mudança que realmente enfraqueceu a necessidade de um renderer próprio aconteceu no Moodle 2.9. O release incluiu o MDL-49152, descrito nas notas oficiais como suporte para implementar renderers usando templates Mustache no PHP e no JavaScript. Isso não foi apenas uma troca de sintaxe para escrever HTML de outro jeito, pois o template passou a existir como artefato separado, podia ser renderizado tanto no servidor quanto no navegador e podia ser sobrescrito por temas.

A partir daí, grande parte da razão histórica para criar um renderer PHP começou a desaparecer. Se o objetivo era separar markup da regra, o template fazia isso melhor porque o HTML finalmente estava em um arquivo de HTML com placeholders. Se o objetivo era permitir customização pelo tema, o tema podia sobrescrever o template. Se o objetivo era reutilizar a mesma representação em resposta AJAX, o JavaScript também conseguia renderizar o mesmo Mustache. A classe intermediária deixou de ser a única fronteira possível entre dados e saída.

### 6.24.1 Mustache separou de verdade a marcação do PHP

Com Mustache, o PHP prepara dados e o arquivo .mustache descreve a estrutura. Isso parece uma diferença pequena quando o componente possui meia dúzia de linhas, mas muda completamente a manutenção quando a tela cresce. O desenvolvedor consegue revisar a regra de preparação sem atravessar uma floresta de tags, enquanto quem trabalha em tema ou acessibilidade consegue analisar o HTML sem reconstruir mentalmente uma sequência de chamadas html_writer.

Essa separação também torna mais evidente quando uma responsabilidade está no lugar errado. Se o template começa a precisar calcular regra, faltou preparação no PHP. Se export_for_template() começa a devolver HTML inteiro para ser colocado em três chaves, provavelmente estamos devolvendo markup para o lugar do qual acabamos de tirá-lo. O ganho não é apenas ter outro arquivo, é tornar visível a fronteira entre dados de apresentação e estrutura visual.

### 6.24.2 O tema passou a poder sobrescrever o template diretamente

Um dos argumentos históricos mais fortes para renderer era permitir que o tema substituísse a forma como um componente produzia HTML. Com templates, a maior parte das customizações puramente visuais pode acontecer substituindo o próprio Mustache, sem criar uma subclasse PHP e sem replicar um método inteiro apenas para alterar uma div, uma classe ou a disposição de elementos.

Isso reduz bastante a necessidade de override por herança. Se a diferença é marcação, use a camada feita para marcação. Criar uma classe de renderer no tema para alterar HTML que já poderia ser sobrescrito por template é carregar a solução anterior para dentro da arquitetura nova, e ainda aumenta o acoplamento com assinatura de método e implementação PHP do componente.

### 6.24.3 O mesmo template pode ser usado no servidor e no navegador

Outro ganho que o renderer PHP clássico não resolvia sozinho é renderização no cliente. A partir do sistema de templates, a mesma definição visual pode ser usada pelo PHP e pelo JavaScript, então uma lista carregada inicialmente pelo servidor e um item inserido depois por AJAX podem compartilhar a mesma marcação. Isso reduz aquela situação desagradável em que o PHP possui um HTML e o JavaScript mantém uma segunda versão quase igual montada com strings.

Quando uma arquitetura consegue usar o mesmo template nos dois lados, criar um renderer PHP que apenas encaminha dados para esse template passa a ser ainda menos interessante. O template é o artefato reutilizável, não a classe que faz o repasse.

### 6.24.4 render_from_template() eliminou o motivo mais comum para um renderer vazio

A API render_from_template() permite renderizar um template diretamente a partir de $OUTPUT ou de qualquer renderer_base. Em páginas simples, isso já resolve a maioria dos casos sem nenhuma classe adicional.

```php
$data = [
    'total' => $total,
    'failed' => $failed,
    'hasfailures' => $failed > 0,
];

echo $OUTPUT->render_from_template(
    'local_catalogsync/sync_summary',
    $data,
);
```

Se esse é todo o trabalho que a tela precisa, criar renderer.php para esconder essas três linhas não melhora arquitetura. Você não remove complexidade, apenas desloca a chamada para outro arquivo, adiciona uma classe e obriga quem mantém o plugin a navegar por mais uma camada para descobrir que ela não faz nada além de retornar render_from_template().

### 6.24.5 templatable tornou a preparação dos dados explícita

Quando a preparação do contexto merece uma classe própria, templatable resolve a outra parte do problema. O objeto sabe exportar uma estrutura simples para apresentação e o template continua responsável pela marcação. Isso é muito mais expressivo do que colocar dezenas de métodos render_* em uma classe central só porque todos produzem HTML.

Em vez de um renderer que conhece cada widget do plugin, você passa a ter pequenos objetos de output próximos daquilo que representam. Um sync_summary prepara resumo de sincronização, um report_page prepara a página de relatório e um item_card prepara o card correspondente. Cada classe pode ser testada isoladamente e o plugin não precisa de uma classe Deus chamada renderer acumulando todos os formatos de saída.

### 6.24.6 named_templatable reduz ainda mais a necessidade do renderer

named_templatable fecha praticamente todo o caso de uso do renderer intermediário. A própria classe informa qual template deve ser utilizado por meio de get_template_name(), enquanto export_for_template() entrega os dados. Quando você passa o objeto para $OUTPUT->render(), a infraestrutura sabe qual template renderizar sem exigir um método render_algumacoisa() escrito manualmente.

```php
namespace local_catalogsync\output;

use core\output\named_templatable;
use renderer_base;

final class sync_summary implements named_templatable {
    public function __construct(
        private readonly int $total,
        private readonly int $failed,
    ) {
    }

    public function export_for_template(renderer_base $output): array {
        return [
            'total' => $this->total,
            'failed' => $this->failed,
            'hasfailures' => $this->failed > 0,
        ];
    }

    public function get_template_name(renderer_base $renderer): string {
        return 'local_catalogsync/sync_summary';
    }
}
$view = new \local_catalogsync\output\sync_summary($total, $failed);
echo $OUTPUT->render($view);
```

Perceba o que não existe nesse desenho. Não existe get_renderer(), não existe renderer.php do plugin, não existe uma classe estendendo plugin_renderer_base e não existe um método cujo corpo contém apenas duas linhas previsíveis. A classe que representa a saída declara o template e exporta os dados, enquanto o Moodle continua usando internamente toda a infraestrutura de renderer necessária.

### 6.24.7 A própria documentação diz que o renderer pode ser dispensado no caso simples

Esse ponto não é uma invenção de estilo deste livro. A documentação de Templates do Moodle explica que, no caso mais simples em que o objeto renderable e templatable corresponde ao template esperado, não é necessário adicionar código de renderer explicitamente, pois $OUTPUT->render() consegue inferir o template, chamar export_for_template() e depois render_from_template(). A documentação atual de named_templatable mantém justamente a capacidade de o objeto declarar o nome do template quando a convenção automática não é suficiente.

Isso é importante porque desmonta a ideia de que renderer.php seria uma etapa obrigatória da Output API. Ele é uma extensão disponível, não um pedágio que todo plugin precisa pagar para usar Mustache corretamente.

## 6.25 renderer.php como padrão automático é arquitetura ultrapassada

Depois de entender a história, eu colocaria a recomendação de forma bem direta. Em plugin novo, não crie renderer.php por reflexo. Comece sem ele. Use $OUTPUT para a estrutura da página, render_from_template() quando a tela é simples e classes em classes/output/ quando os dados de apresentação merecem organização própria. Se um problema concreto aparecer e esse problema realmente exigir um renderer, aí você cria a classe sabendo exatamente por quê.

O caminho inverso costuma produzir código cerimonial. O desenvolvedor cria renderer.php, registra mentalmente que "Moodle usa renderer", escreve render_report(), render_card(), render_summary() e render_table(), mas todos os métodos fazem a mesma coisa, recebem um objeto, chamam export_for_template() e encaminham para um Mustache. Não existe polimorfismo útil, não existe estratégia de saída, não existe comportamento compartilhado e não existe decisão de apresentação que precise ser sobrescrita em PHP. Existe apenas uma camada com nome importante.

### 6.25.1 O anti-pattern do renderer de duas linhas

```php
final class renderer extends plugin_renderer_base {
    public function render_sync_summary(sync_summary $summary): string {
        $data = $summary->export_for_template($this);
        return $this->render_from_template(
            'local_catalogsync/sync_summary',
            $data,
        );
    }
}
```

Esse método não encapsula uma decisão, não converte um contrato externo, não escolhe estratégia, não aplica fallback e não resolve uma limitação do template. Ele apenas reproduz uma sequência que a própria infraestrutura já conhece. É o equivalente arquitetural de criar uma função soma($a, $b) que só devolve $a + $b e depois afirmar que o sistema está mais organizado porque existe uma abstração.

Em code review eu trataria esse renderer como candidato imediato a remoção. Quanto menos arquivos intermediários sem responsabilidade real existirem, mais rápido alguém entende o fluxo da página, e isso importa muito mais em manutenção do que seguir uma estrutura herdada de exemplos antigos.

### 6.25.2 Renderer vazio não é separação de responsabilidades

Existe uma frase que aparece bastante nessas discussões, "eu criei renderer para separar apresentação da regra". A intenção está correta, mas a conclusão não necessariamente está. Quem separa a marcação hoje é o template. Quem prepara o contexto pode ser uma classe de output. Criar mais uma classe no meio não aumenta a separação se ela não possui responsabilidade própria.

Aliás, em alguns projetos ela piora a leitura porque passa a existir uma cadeia artificial página PHP -> objeto de output -> renderer -> template. Quando o renderer só encaminha chamada, a cadeia ideal é página PHP -> objeto de output -> template, com a infraestrutura do Moodle realizando internamente o que precisa para renderizar.

### 6.25.3 Não crie renderer apenas para usar Mustache

Mustache não depende de você criar renderer.php. Esta talvez seja a correção mais importante para quem aprendeu Moodle por tutoriais antigos. Você pode renderizar template diretamente com $OUTPUT->render_from_template(), e pode usar objetos templatable com $OUTPUT->render(). renderer.php é uma possibilidade adicional, não o requisito que habilita o sistema de templates.

Se alguém disser que "para usar templates corretamente precisa de renderer", peça para mostrar qual comportamento essa classe acrescenta. Na maioria dos exemplos modernos a resposta acaba sendo nenhuma, e o próprio código fica mais claro quando a camada é retirada.

### 6.25.4 Não crie renderer para esconder render_from_template()

Esconder uma chamada clara em outro método só vale a pena quando o novo método oferece uma abstração melhor. render_from_template() já diz exatamente o que está acontecendo, recebe o nome do template e o contexto, e não existe ganho em substituir isso por render_summary() se esse método simplesmente repete a chamada.

Abstração boa reduz conhecimento necessário ou concentra regra que poderia divergir. Abstração vazia apenas troca um nome conhecido da plataforma por um nome local que o mantenedor precisa descobrir. Em plugins que vivem por anos e atravessam equipes, essa diferença custa bastante.

### 6.25.5 Não crie renderer para centralizar todo o output do plugin

Outra herança do modelo antigo é imaginar que todo output do plugin precisa passar por uma única classe renderer. Isso produz arquivos enormes e cria acoplamento entre componentes visuais que não têm relação entre si. Se um plugin possui dashboard, tabela de sincronizações, modal de conflito, card de status e página administrativa, não existe benefício automático em fazer uma classe conhecer todas essas representações.

Classes pequenas dentro de classes/output/ deixam cada estrutura de apresentação perto dos dados que prepara, enquanto templates separados mantêm o HTML igualmente modular. A centralização só é útil quando existe comportamento realmente compartilhado, e mesmo nesse caso vale perguntar se esse comportamento não pertence a uma classe base específica, helper de output ou componente reutilizável mais explícito.

### 6.25.6 "Mas o core do Moodle ainda usa renderer.php"

Sim, e isso não contradiz nada do que estamos discutindo. O core carrega quase duas décadas de evolução, contratos públicos, compatibilidade com temas, subsistemas que nasceram antes de Mustache e componentes cuja arquitetura realmente depende de renderers especializados. O arquivo public/course/renderer.php continua existindo no código atual, assim como renderers de enrolment, grade e outros subsistemas.

Copiar a existência de uma estrutura no core sem copiar o problema que justificou aquela estrutura é um erro comum. O core também contém código legado que precisa continuar funcionando, APIs em processo de depreciação e componentes enormes que não seriam desenhados da mesma forma se nascessem hoje. Seu plugin novo não possui essa dívida histórica, então não existe motivo para começar já pagando juros dela.

A pergunta correta não é "o Moodle usa renderer?", porque usa. A pergunta é "o meu plugin precisa de um renderer próprio para resolver este caso?". São questões completamente diferentes.

### 6.25.7 O renderer não está deprecated, o uso automático é que envelheceu

Vale deixar isso muito claro para evitar que o texto seja repetido fora de contexto. renderer_base, plugin_renderer_base e o mecanismo de renderers não estão genericamente deprecated. A documentação atual da Output API ainda mostra renderers e o PHPDoc atual continua expondo essas classes. Portanto, não escreva em uma revisão técnica que "renderer foi removido do Moodle" ou que "renderer.php não funciona mais", porque isso é falso.

O que considero extremamente ultrapassado é criar renderer.php como boilerplate obrigatório em todo plugin, especialmente quando ele só delega para Mustache. Essa distinção preserva a precisão histórica e, ao mesmo tempo, permite uma recomendação forte para código novo.

### 6.25.8 Quando eu aceitaria um renderer novo

Eu começaria a considerar um renderer quando existe comportamento de saída que realmente precisa ser polimórfico em PHP, quando o componente possui contrato explícito de renderer que deve ser estendido, quando um tema precisa substituir lógica de renderização que não pode ser resolvida por override de template, quando diferentes targets de saída exigem implementação específica ou quando estamos integrando com uma API existente do core que espera aquele renderer.

Mesmo nesses casos eu perguntaria se a necessidade é real ou se estamos apenas usando renderer como ponto conveniente para colocar código. Se o método consulta banco, decide capability, salva configuração ou chama integração externa, ele não virou correto só porque está dentro de uma classe chamada renderer. Renderer, quando existe, continua sendo camada de apresentação.

Também existem componentes legados ou extensões de tipos específicos em que não usar renderer significaria brigar contra o contrato do próprio subsistema. Não vale modernizar por ideologia e quebrar a forma como a API foi desenhada. A recomendação é evitar renderer desnecessário, não ignorar contratos reais da plataforma.

### 6.25.9 Override de template deve ser preferido para mudança de markup

Se a necessidade do tema é alterar HTML, ordem de elementos, classes, wrappers ou pequenos detalhes visuais, o template costuma ser a ferramenta mais direta. O override fica declarativo e localizado na mesma camada da marcação que está sendo alterada, enquanto uma subclasse de renderer introduz PHP, herança e dependência de assinaturas de métodos para resolver um problema que continua sendo visual.

Renderer override ainda pode existir quando o tema precisa alterar comportamento de preparação ou escolher outra estratégia de output, mas deveria ser a exceção. Quanto mais o tema consegue trabalhar com templates, SCSS e componentes de frontend, menor é a quantidade de PHP que ele precisa herdar de componentes internos.

### 6.25.10 Por que herança de renderer aumenta o custo de upgrade

Um override de renderer depende da classe pai, de seus métodos, assinaturas, visibilidade, objetos recebidos e comportamento interno. Quando o core deprecia um método, muda um tipo ou move uma responsabilidade para outro componente, a subclasse pode exigir ajuste mesmo que o HTML que você queria alterar continue praticamente igual.

Um override de template também tem contrato e pode quebrar, principalmente quando o contexto muda, mas ele acopla a customização ao artefato de apresentação em vez de acoplá-la a uma classe PHP inteira. O Moodle possui inclusive uma política específica para depreciação de templates porque reconhece que esses contextos são contratos importantes. Isso não torna template imune a upgrade, apenas torna a fronteira de customização mais coerente com o tipo de mudança que está sendo feita.

### 6.25.11 Um caminho moderno para páginas simples

Para uma página pequena, eu começaria do caso mais simples possível. A página valida requisição, contexto e capability, chama os serviços necessários, prepara um array e envia esse array ao template. Não há nenhuma obrigação de criar uma classe de output quando ela não acrescenta clareza, e muito menos um renderer.

```php
require_once(__DIR__ . '/../../config.php');

require_login();
$context = context_system::instance();
require_capability('local/catalogsync:view', $context);

$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/catalogsync/index.php'));
$PAGE->set_title(get_string('pluginname', 'local_catalogsync'));
$PAGE->set_heading(get_string('pluginname', 'local_catalogsync'));

$data = [
    'items' => $service->get_items_for_view(),
];

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_catalogsync/index', $data);
echo $OUTPUT->footer();
```

Se a tela crescer e a preparação ficar complexa, mova essa preparação para classes de output ou serviços adequados. Não antecipe um renderer antes de existir um problema que ele resolva.

### 6.25.12 Um caminho moderno para componentes mais ricos

Quando o componente merece um objeto próprio, use uma classe de output com templatable ou named_templatable. Ela pode receber objetos já carregados, preparar URLs, flags, labels e coleções, e entregar ao template exatamente o contexto necessário. O template continua sendo a fonte da marcação e $OUTPUT continua sendo a infraestrutura de renderização.

Essa arquitetura escala melhor porque cada novo componente visual não obriga a editar uma classe central. Você adiciona uma classe e um template quando necessário, e o nome do componente já conta boa parte da história do código.

### 6.25.13 Se o renderer só encaminha para template, apague o renderer

Essa é uma regra de refatoração que eu usaria sem muito medo. Abra o renderer do plugin e veja se os métodos fazem apenas export_for_template() seguido de render_from_template(). Se todos seguem esse padrão e não existe contrato externo exigindo a classe, provavelmente você consegue remover uma camada inteira e deixar a infraestrutura padrão fazer o trabalho.

Obviamente a remoção deve ser testada, principalmente se temas de terceiros podem ter sobrescrito aquele renderer ou se o plugin possui API pública usada por outras extensões. Em plugin interno ou código novo, porém, o ganho de simplicidade costuma ser imediato.

### 6.25.14 O que procurar em code review

Quando eu reviso código Moodle novo, renderer.php é um daqueles arquivos que fazem surgir uma pergunta automática, "por que ele existe?". Não é uma acusação, é uma verificação arquitetural. Se a resposta mostra uma responsabilidade concreta, seguimos. Se a resposta é apenas "para renderizar o template", o arquivo provavelmente está sobrando.

Também procuro métodos render_* enormes, consultas ao banco dentro do renderer, capability checks repetidos na camada de output, concatenação extensa de HTML e subclasses de renderer criadas em tema apenas para trocar markup. Cada um desses sinais aponta para uma arquitetura que pode ser simplificada com templates, classes de output ou serviços mais bem definidos.

### 6.25.15 Regra prática para este livro

Daqui para frente, os exemplos deste livro não criarão renderer.php por padrão. Quando precisarmos renderizar uma interface simples, usaremos $OUTPUT->render_from_template(). Quando precisarmos representar uma estrutura de apresentação mais rica, usaremos classes em classes/output/ com templatable ou named_templatable e deixaremos $OUTPUT->render() cuidar do restante. Um renderer próprio só aparecerá quando houver um motivo que sobreviva à pergunta "o que esta classe faz além de encaminhar dados para um template?".

Isso deixa os exemplos mais próximos da direção tomada pelo Moodle desde a introdução do Mustache e evita ensinar como regra uma solução que pertence a uma fase anterior da arquitetura. Quem mantém código legado precisa entender renderer profundamente, porque vai encontrá-lo bastante, mas quem escreve código novo não precisa perpetuá-lo sem necessidade.

## 6.26 Por que evitar HTML construído dentro do PHP

Montar HTML no PHP costuma começar inocente.

```php
$html = '<div class="item">';
$html .= '<strong>' . s($item->name) . '</strong>';
$html .= '<a href="' . $url . '">Editar</a>';
$html .= '</div>';
```

Com quatro linhas, ninguém vê problema. Depois entram capability, tooltip, badge, estado vazio, ícone, atributos `data-*`, traduções e classes responsivas, e o arquivo passa a ter vinte concatenações em que uma aspas fechada no lugar errado quebra a página inteira.

O problema maior é que o HTML deixa de ser HTML legível. Quem precisa revisar acessibilidade, estrutura semântica ou classes do tema passa a decifrar strings PHP, enquanto quem trabalha na lógica precisa atravessar blocos visuais para encontrar a regra. Mustache resolve exatamente essa fricção.

Também existe impacto na capacidade de override por tema. HTML escondido em concatenação PHP não participa da mesma forma da infraestrutura de templates, então você reduz extensibilidade sem ganhar nada relevante em troca.

## 6.27 `html_writer`

`html_writer` é uma API antiga e ainda bastante usada no Moodle para gerar pequenos trechos de HTML de forma segura e estruturada.

```php
$link = html_writer::link(
    $url,
    get_string('edit'),
    ['class' => 'btn btn-secondary'],
);
```

Ela é muito melhor do que concatenar atributos manualmente e continua útil em pontos pequenos, especialmente callbacks que precisam devolver um fragmento simples, código legado ou APIs que tradicionalmente trabalham com string HTML.

O erro é usar `html_writer` para montar uma página inteira porque "é API do Moodle". Tecnicamente será mais organizado do que concatenar string, mas continua misturando estrutura visual no PHP e perde boa parte das vantagens de Mustache.

## 6.28 Quando `html_writer` ainda é aceitável

Use `html_writer` quando o HTML é realmente pequeno e local, por exemplo um link, um `span`, uma lista curta gerada por callback específico ou uma saída que a API espera diretamente como string. Também é comum encontrá-lo em código de compatibilidade com branches antigas e em pontos do core que antecedem a adoção ampla de templates.

Se você percebe que está abrindo e fechando várias tags, criando uma grade Bootstrap inteira ou montando uma tabela com loops complexos, pare e mova isso para template. A fronteira não precisa ser ideológica, basta observar quando o código deixa de ser um pequeno elemento e passa a representar um componente visual.

## 6.29 Bootstrap utilizado pelo Moodle

O Moodle usa Bootstrap como base importante da interface, principalmente por meio do tema Boost e dos temas derivados dele. Isso significa que classes como grid, spacing, botões, alerts, cards e utilitários estão disponíveis, mas existe uma diferença entre usar o ecossistema visual do Moodle e assumir que qualquer snippet copiado da documentação do Bootstrap funcionará exatamente como no site oficial.

O Moodle controla versão, customizações, SCSS, componentes e comportamento JavaScript dentro do próprio ciclo de releases, portanto sempre confira a versão suportada pela branch alvo e procure exemplos no core antes de introduzir padrões externos.

Outro cuidado é não amarrar o plugin visualmente a uma combinação rígida de classes e cores. Temas podem alterar variáveis, espaçamento e aparência, então a interface deve depender mais de semântica e componentes do Moodle do que de uma identidade visual inventada pelo plugin.

### 6.29.1 Moodle 5.0 usa Bootstrap 5.3

Aqui vale fixar a versão, porque "o Moodle usa Bootstrap" é correto e ainda assim insuficiente para quem está escrevendo markup. O Moodle 5.0 migrou o tema Boost para Bootstrap 5.3 e adicionou uma camada de compatibilidade para reduzir a quebra de plugins escritos para Bootstrap 4. Isso significa que um plugin voltado especificamente ao Moodle 5.0 deve pensar em Bootstrap 5, mesmo que parte do markup antigo continue funcionando graças à ponte de transição.

Essa camada existe para permitir migração, não para transformar classes antigas em contrato permanente. Se o plugin novo nasce no 5.0, prefira a nomenclatura atual e use a ponte apenas como proteção para código legado que ainda precisa atravessar versões.

### 6.29.2 Mudanças de Bootstrap 4 que aparecem em plugins Moodle

Algumas trocas são simples, mas aparecem bastante em templates antigos: dropdown-menu-right virou dropdown-menu-end, dropdown-menu-left virou dropdown-menu-start, custom-select virou form-select, custom-check passou para form-check e custom-switch passou a ser expresso com form-check e form-switch. Copiar um template de Moodle 4.1 ou um snippet antigo de tema sem revisar essas diferenças pode produzir uma interface aparentemente correta em uma tela e quebrada em outra.

```html
<div class="dropdown-menu dropdown-menu-end">...</div>
<select class="form-select">...</select>
<div class="form-check form-switch">...</div>
```

Evite fazer uma conversão cega baseada apenas em busca e substituição, porque componentes JavaScript, atributos data-* e comportamento de acessibilidade também mudaram entre gerações. Procure primeiro como o próprio Moodle 5.0 implementa o componente que você precisa e copie o contrato, não apenas a aparência.

### 6.29.3 A camada de compatibilidade não é desculpa para depender de Bootstrap internamente

Quanto mais o plugin usa apenas classes utilitárias para layout e delega modais, notificações, templates e interações às APIs do Moodle, menor o custo da próxima migração. Quando existe core/modal ou outro componente do core para a interação, prefira essa superfície ao JavaScript direto do Bootstrap, pois o Moodle pode alterar biblioteca, markup e inicialização mantendo sua própria API mais estável.

## 6.30 Componentes visuais do Moodle

Antes de criar um modal próprio, notificação própria, menu próprio ou componente de seleção próprio, procure o que o core já oferece. Além de manter consistência visual, isso reduz trabalho de acessibilidade, compatibilidade com temas e manutenção futura.

Componentes como modais, notificações, dropdowns, templates core e padrões de botões já resolvem problemas recorrentes e foram testados dentro do ecossistema. Recriar tudo em CSS e JavaScript local normalmente significa reimplementar também foco, teclado, contraste, comportamento mobile e internacionalização, mesmo que isso não apareça no primeiro protótipo.

Uma interface Moodle boa não precisa parecer "genérica", mas deve conversar com a plataforma. O plugin pode ter identidade própria sem competir com a navegação, tipografia e componentes que o usuário já conhece.

## 6.31 `$PAGE->requires`

```php
$PAGE->requires é a API usada para registrar requisitos de frontend associados à página, como módulos JavaScript e outros recursos gerenciados pelo Moodle.
```

Em código que usa o modelo tradicional de módulos compilados, uma chamada comum é inicializar um módulo a partir do PHP.

```php
$PAGE->requires->js_call_amd('local_catalogsync/report', 'init', [$courseid]);
```

Esse padrão continua existindo em branches suportadas e em muito código de plugins, mas não deve ser usado para despejar grandes estruturas de dados no HTML. Se o módulo precisa de muita informação, passe identificadores e deixe o frontend buscar dados por API apropriada.

Também não use `$PAGE->requires` como substituto de arquitetura. Colocar centenas de linhas inline na página porque a API permite JavaScript não torna o código moderno, apenas desloca o problema para outro lugar.

## 6.32 JavaScript ESM

O Moodle recomenda módulos JavaScript no formato ECMAScript Modules para código novo há várias versões. Em branches tradicionais, o código fonte fica em `amd/src/`, é escrito com sintaxe ESM e passa pelo pipeline de build para gerar artefatos consumidos pelo navegador.

```html
import Notification from 'core/notification';

export const init = () => {
    document.querySelectorAll('[data-action="catalogsync-run"]')
        .forEach((button) => {
            button.addEventListener('click', async() => {
                try {
                    // Executa ação.
                } catch (error) {
                    Notification.exception(error);
                }
            });
        });
};
```

O benefício não é apenas poder usar `import`. Módulos criam fronteiras claras, reduzem variáveis globais, facilitam testes e permitem que dependências fiquem explícitas. Um arquivo gigante com todas as interações do plugin continua sendo difícil de manter mesmo se usar `export` e `import`.

Este livro toma Moodle 5.0 como base. A partir do Moodle 5.2 surgiu uma nova arquitetura de frontend com ESM nativo, TypeScript e React em caminhos próprios para componentes do core, mas isso é evolução posterior e não requisito para escrever um plugin Moodle 5.0. Se o mesmo plugin também suportar 5.2 ou versões seguintes, trate essa arquitetura como uma fronteira de compatibilidade e adote recursos novos apenas quando a versão mínima permitir, em vez de misturar exemplos de 5.2 como se fossem parte do contrato do 5.0.

## 6.33 AMD legado

Antes da adoção de ESM como formato de autoria, o Moodle usava módulos AMD escritos no padrão RequireJS. Você ainda encontrará código com `define([...], function(...) { ... })` em plugins antigos e partes de branches legadas.

Esse código não deve ser copiado para desenvolvimento novo apenas porque funciona. O Moodle mantém compatibilidade por necessidade, mas a recomendação há anos é escrever módulos novos em ESM.

É importante distinguir formato de autoria de formato gerado. Durante bastante tempo, o desenvolvedor escrevia ESM em `amd/src/` e o build produzia módulos compatíveis com o carregador AMD usado no navegador. Por isso chamar todo `amd/` de "JavaScript legado" seria incorreto. O que está legado é escrever manualmente o estilo AMD antigo, não necessariamente o diretório que participa do pipeline das branches tradicionais.

## 6.34 Quando você ainda encontrará módulos AMD

Você encontrará AMD em plugins antigos, código que precisa suportar versões muito antigas, bibliotecas de terceiros e trechos do core que ainda não foram migrados. Também verá artefatos compilados em `amd/build/`, que não devem ser editados manualmente.

Ao corrigir bug em plugin existente, não reescreva um módulo inteiro só para trocar sintaxe se isso aumenta risco sem benefício. Migração precisa ter objetivo e testes. Por outro lado, ao criar funcionalidade nova dentro de plugin mantido atualmente, prefira o padrão recomendado para a menor versão suportada.

Essa convivência de estilos é normal em um projeto com mais de vinte anos e ciclos de compatibilidade longos. O erro não é encontrar legado, é não saber que ele é legado e transformá-lo em referência para código novo.

## 6.35 `core/ajax`

`core/ajax` é a forma preferida de chamar funções externas do Moodle a partir do JavaScript nas branches atuais. A função PHP precisa ser registrada em `db/services.php` e marcada com `'ajax' => true`, depois o frontend chama o método por meio do módulo core.

Uma organização muito útil é centralizar chamadas em um módulo de repositório.

```
import {call as fetchMany} from 'core/ajax';

export const runSync = (itemid) => fetchMany([{
    methodname: 'local_catalogsync_run_sync',
    args: {itemid},
}])[0];
```

Depois o módulo de interface importa `runSync()` e se preocupa com interação, loading, mensagens e atualização visual.

Isso separa transporte de interface e facilita testes. Também evita espalhar nomes de Web Service por todos os arquivos JavaScript. O Moodle ainda consegue agrupar chamadas em determinadas situações, validar parâmetros e aproveitar a mesma External API usada por outros clientes.

A parte de segurança continua no servidor. O fato de uma chamada vir de `core/ajax` não prova que o usuário pode executar a ação, portanto a função externa deve validar parâmetros, contexto e capabilities exatamente como faria para qualquer cliente.

## 6.36 `core/notification`

`core/notification` padroniza mensagens, confirmações e tratamento de exceções no frontend. Em vez de criar `alert()` ou modal improvisado para cada erro, use o componente que já conversa com o restante do Moodle.

```
import Notification from 'core/notification';

try {
    await runSync(itemid);
} catch (error) {
    Notification.exception(error);
}
```

Essa consistência importa porque erro não é apenas texto vermelho. Há foco, leitura por tecnologia assistiva, comportamento de modal, tradução e padrão visual envolvidos. Uma função core bem usada resolve várias dessas preocupações de uma vez.

## 6.37 `core/modal`

Modais são um dos componentes que mais rapidamente viram problema quando implementados manualmente. É fácil desenhar uma caixa centralizada, mas é muito mais trabalhoso controlar foco, fechamento, teclado, backdrop, scroll e integração com acessibilidade.

O Moodle oferece infraestrutura própria e nas versões modernas a API permite criar modal por JavaScript, usar templates no corpo e até definir tipos customizados quando existe necessidade real.

```
import ModalFactory from 'core/modal_factory';
import Templates from 'core/templates';

export const openDetails = async(context) => {
    const modal = await ModalFactory.create({
        title: context.title,
        body: Templates.render('local_catalogsync/details', context),
    });

    modal.show();
};
```

A API exata varia entre versões, então sempre consulte a documentação da branch suportada, principalmente porque alguns padrões antigos de trigger foram descontinuados. O princípio, porém, permanece, reutilize o componente do core antes de inventar outro.

## 6.38 `core/templates`

`core/templates` permite renderizar templates Mustache no navegador. Isso é extremamente útil quando uma ação AJAX devolve dados e você precisa inserir um card, atualizar uma linha ou substituir um bloco sem gerar HTML manualmente no JavaScript.

A mesma ideia usada no servidor continua válida no cliente. Dados entram, template produz marcação e o módulo JavaScript controla comportamento. Essa simetria reduz duplicação, porque você não precisa manter uma versão PHP e outra JavaScript da mesma estrutura visual.

Ao inserir conteúdo dinamicamente, lembre que o Moodle pode precisar processar comportamentos associados ao novo conteúdo, filtros e inicializações específicas. Não trate `innerHTML` como solução universal e não use template como desculpa para ignorar o ciclo de vida do componente.

## 6.39 Fragment API

A Fragment API resolve um cenário diferente de `core/ajax`. Em vez de retornar apenas dados estruturados, um fragment permite pedir ao servidor um trecho de interface renderizada dentro do contexto correto. Isso é útil para modais, painéis e regiões que dependem de preparação PHP mais rica.

Um fragment deve continuar respeitando segurança. O callback recebe contexto e argumentos, mas precisa validar o que está sendo solicitado, confirmar capabilities e nunca confiar em IDs enviados pelo navegador apenas porque a chamada partiu de uma página autenticada.

Fragments são especialmente úteis quando reaproveitamos Forms API ou templates complexos em interfaces dinâmicas, mas não devem virar uma forma de transformar toda página em pequenas requisições HTML sem arquitetura. Se o frontend precisa apenas de dados simples, Web Service com `core/ajax` pode ser mais claro. Se precisa de uma região pronta e contextual, fragment faz mais sentido.

## 6.40 Dynamic Forms

Dynamic Forms permitem usar formulários Moodle dentro de interfaces dinâmicas, inclusive modais, preservando boa parte da validação e infraestrutura da Forms API. Isso evita uma duplicação comum, em que o plugin possui um formulário PHP completo para a página tradicional e uma segunda implementação manual em JavaScript para o modal.

A vantagem real aparece quando o formulário precisa de elementos complexos, validação, filepicker ou comportamento já suportado pelo Moodle. Em vez de reconstruir tudo no cliente, você reaproveita a definição do formulário e integra o ciclo de submissão com a interface dinâmica.

Mesmo com Dynamic Forms, a regra de autorização não vai para o navegador. O backend continua validando contexto e capability, enquanto o frontend cuida da experiência de uso.

## 6.41 Dynamic Tables

Dynamic Tables são úteis quando a interface precisa de listagem com paginação, ordenação, filtros e atualização assíncrona sem reinventar toda a mecânica. O Moodle possui infraestrutura própria para tabelas dinâmicas que conversa com componentes do core e pode reduzir bastante o volume de JavaScript customizado.

O ponto importante é não escolher tabela dinâmica automaticamente. Para vinte registros estáticos, uma tabela simples renderizada no servidor pode ser melhor e mais barata. Quando o volume cresce, os filtros ficam ricos ou a atualização precisa acontecer sem recarregar página, a infraestrutura dinâmica começa a justificar o custo.

Também não use Dynamic Tables para esconder consulta ruim. Paginação de interface não corrige uma query que carrega cem mil registros antes de cortar vinte no PHP. A camada de dados continua precisando paginar e filtrar corretamente.

## 6.42 Inicialização JavaScript de templates

Historicamente, templates Moodle usam o bloco `{{#js}}` para registrar inicialização JavaScript associada ao markup.

```mustache
{{#js}}
require(['local_catalogsync/report'], function(Report) {
    Report.init();
});
{{/js}}
```

Esse padrão continua sendo encontrado e é útil principalmente em interfaces Mustache tradicionais, mas não coloque lógica grande dentro do bloco. O template deve apenas disparar o módulo, enquanto o comportamento vive no arquivo JavaScript apropriado.

Nas interfaces novas baseadas em React do Moodle 5.2, a documentação passou a recomendar o helper específico de React e auto inicialização para novos componentes reativos, enquanto `{{#js}}` permanece apropriado para markup Mustache existente e cenários legados. Isso é mais um exemplo de convivência entre arquiteturas durante a transição, e não motivo para reescrever todo plugin de uma vez.

## 6.43 Eventos DOM

Eventos DOM são a base de interação no frontend. Clique, mudança de campo, submit, teclado e foco devem ser tratados com `addEventListener()` e módulos bem delimitados, evitando atributos inline como `onclick`.

Uma estratégia robusta é usar atributos `data-*` para marcar intenção da interface.

```html
<button type="button"
        class="btn btn-primary"
        data-action="catalogsync-run"
        data-itemid="42">
    Sincronizar
</button>
```

O JavaScript busca `[data-action="catalogsync-run"]` e registra o evento. Isso reduz acoplamento com classe visual, porque `btn-primary` pode mudar enquanto a ação continua identificada por um atributo semântico.

Em listas dinâmicas, event delegation pode ser melhor do que registrar listener em cada botão recriado, mas use isso conscientemente e mantenha o escopo o menor possível. Um listener global em `document` para todo tipo de ação torna colisões e depuração mais difíceis.

## 6.44 Custom events

Quando módulos diferentes precisam se comunicar no navegador, custom events ajudam a reduzir dependência direta. Um componente pode disparar um evento como `local_catalogsync:updated` e outras partes da página reagem sem que o módulo de sincronização precise conhecer cada consumidor.

```
window.dispatchEvent(new CustomEvent('local_catalogsync:updated', {
    detail: {itemid},
}));
```

Outro módulo pode escutar esse evento e atualizar um contador, por exemplo. O cuidado é não criar um barramento global caótico com dezenas de nomes sem documentação. Eventos funcionam melhor quando representam fatos claros e têm payload pequeno e previsível.

Se dois módulos pertencem à mesma unidade e sempre mudam juntos, uma chamada direta pode ser mais simples. Custom event vale quando queremos desacoplar emissores e consumidores.

## 6.45 CSS do plugin

CSS do plugin deve ser o mínimo necessário para complementar o que os componentes e utilitários do Moodle já resolvem. Quanto mais você recria grid, espaçamento, botão, modal e tipografia, mais trabalho terá para manter compatibilidade com temas.

Prefira seletores escopados ao componente.

```
.local-catalogsync-report .sync-status {
    font-weight: 600;
}
```

Evite seletores genéricos como `.card`, `.btn` ou `table td` dentro de folha do plugin, porque você pode alterar elementos de outras áreas quando o CSS é carregado na página. Escopo é uma forma simples de reduzir efeitos colaterais.

Também não esconda regra de negócio em CSS. `display: none` não substitui capability e não torna informação confidencial. Se o usuário não pode ver algo, o servidor não deve enviar esse conteúdo.

## 6.46 SCSS e temas

Temas Moodle trabalham fortemente com SCSS para compor Bootstrap, variáveis e customizações visuais. Plugin comum, porém, não deveria depender de alterar SCSS do tema para funcionar. O plugin oferece marcação semântica e estilos locais quando necessário, enquanto o tema decide aparência global.

Se você mantém um theme plugin, aí a responsabilidade muda e SCSS passa a ser uma ferramenta central, inclusive para variáveis, presets e overrides. Mesmo assim, tente trabalhar com a estrutura do Moodle em vez de sobrescrever seletor específico de cada componente por força bruta.

Um plugin distribuído para terceiros precisa sobreviver a Boost, temas derivados e customizações institucionais. Se a interface só funciona porque você assumiu cor, largura fixa ou uma variável que existe apenas no seu tema, existe acoplamento escondido.

## 6.47 Acessibilidade da interface

Acessibilidade não é uma revisão que fazemos depois que a interface ficou pronta. Ela começa quando escolhemos elemento HTML, ordem de foco, texto do botão, contraste, comportamento de modal e forma como estado é comunicado.

O Moodle possui uma política clara de acessibilidade e recomenda usar HTML semântico antes de recorrer a ARIA. Um `<button>` real já oferece comportamento de teclado e semântica que uma `<div role="button">` precisa reimplementar manualmente.

Também é importante testar interface sem mouse. Se você não consegue navegar, abrir ação, fechar modal e entender foco usando teclado, o problema aparece antes mesmo de um teste com leitor de tela.

Cores não podem ser a única forma de comunicar estado. Um badge vermelho dizendo apenas por cor que algo falhou não serve para quem não percebe a diferença visual. Texto, ícone com significado adequado ou informação adicional precisam carregar a mensagem.

## 6.48 ARIA

ARIA deve complementar HTML quando a semântica nativa não resolve o caso, não substituir elementos corretos. O próprio Moodle destaca que usar ARIA incorretamente pode ser pior do que não usar.

`aria-label`, `aria-expanded`, `aria-controls` e estados semelhantes são úteis em componentes interativos, mas precisam refletir o estado real. Um botão de expansão com `aria-expanded="false"` que não muda quando o painel abre está entregando informação errada para tecnologia assistiva.

Antes de adicionar role manual, pergunte se existe elemento HTML nativo que já oferece esse comportamento. Botão deve ser `<button>`, navegação deve usar estrutura adequada e títulos devem seguir hierarquia coerente. ARIA entra quando precisamos descrever relação ou estado que o HTML sozinho não representa.

## 6.49 Teclado

Toda interação importante precisa funcionar por teclado. Botões e links nativos já ajudam bastante, mas componentes customizados exigem cuidado com `Tab`, `Enter`, `Space`, `Escape` e movimentação de foco.

Modais devem receber foco ao abrir e devolver foco ao elemento de origem ao fechar. Menus precisam permitir navegação sem prender o usuário. Elementos ocultos não deveriam continuar tabuláveis. Drag and drop precisa de alternativa quando a ação é essencial.

O erro mais comum aparece quando o desenvolvedor testa tudo clicando. A interface parece perfeita até alguém apertar `Tab` e descobrir que o foco desaparece, entra em elemento invisível ou não alcança a ação principal.

## 6.50 Exercício - converter uma página PHP cheia de HTML para Output + Mustache + ESM

O exercício deste capítulo começa de propósito com uma página ruim. Crie `local_catalogsync/report.php` e faça uma primeira versão que consulta registros, monta tabela por concatenação, cria botões com HTML dentro do PHP e usa um pequeno script inline para repetir uma sincronização. A página precisa funcionar, porque o objetivo não é corrigir bug funcional, é melhorar arquitetura.

Depois faça a primeira refatoração. Mova toda estrutura visual para `templates/report.mustache`, substitua strings fixas por language strings e construa URLs com `moodle_url`. O PHP deve ficar responsável por bootstrap, autorização, obtenção dos dados e chamada da camada de output.

Na segunda etapa, crie `classes/output/report_page.php` implementando `renderable` e `templatable`, mova para `export_for_template()` a preparação de flags, URLs e valores formatados, mas não coloque consultas pesadas ali. Se necessário, crie um serviço separado que carregue e agregue dados.

Na terceira etapa, extraia a linha ou card de sincronização para partial, use sections para ações condicionais e inverted section para estado vazio. Adicione pelo menos um texto formatado com `format_text()` e use três chaves somente nesse campo, documentando claramente por que o conteúdo é seguro para saída não escapada.

Na quarta etapa, mova a ação de sincronizar para um módulo ESM. Crie uma External Function registrada para AJAX, centralize a chamada em um módulo de repositório, trate exceções com `core/notification` e atualize a parte necessária da interface usando `core/templates` ou um fragment quando fizer sentido. Não recarregue a página inteira apenas porque é mais fácil.

Na quinta etapa, transforme a edição de um item em formulário dinâmico dentro de modal e compare o resultado com uma implementação manual. Observe quanto código de validação, foco e tratamento você deixaria de duplicar usando os componentes oficiais.

Por fim, faça uma revisão de acessibilidade. Navegue apenas com teclado, confira foco, rótulos, hierarquia de headings, contraste e estados comunicados sem depender exclusivamente de cor. Rode as ferramentas de frontend da branch suportada e teste pelo menos em Boost e em outro tema baseado em Boost.

A página final deve deixar uma diferença muito clara. O arquivo PHP não é mais uma página que mistura tudo, ele coordena a requisição. A classe de output transforma dados em contexto, o Mustache descreve marcação, o JavaScript cuida da interação e cada camada consegue mudar sem arrastar as outras junto.

Interface moderna no Moodle não significa colocar mais JavaScript. Significa reduzir acoplamento, usar os componentes que a plataforma já oferece e escolher conscientemente onde cada responsabilidade vive. Mustache continua sendo uma base importante para markup reutilizável, `classes/output/` ajuda a preparar dados sem poluir a página, ESM organiza comportamento, APIs como `core/ajax`, `core/modal` e `core/templates` evitam reinvenção e a transição iniciada no Moodle 5.2 mostra que o frontend continuará evoluindo. Se o plugin estiver bem separado, essa evolução é adaptação; se tudo estiver misturado em `index.php`, cada mudança vira cirurgia.

## Referências técnicas consultadas

Moodle Developer Resources. Moodle 5.0 developer update, seção Bootstrap 5. https://moodledev.io/docs/5.0/devupdate

Moodle Developer Resources. Bootstrap 5 migration. https://moodledev.io/docs/5.2/guides/bs5migration (migração iniciada no Moodle 5.0)

MOODLE. Output renderers. MoodleDocs, documentação histórica do Moodle 2.0. Disponível em https://docs.moodle.org/dev/Output_renderers. Acesso em 23 set. 2026.

MOODLE. Migrating your code to the 2.0 rendering API. MoodleDocs. Disponível em https://docs.moodle.org/dev/Migrating_your_code_to_the_2.0_rendering_API. Acesso em 23 set. 2026.

MOODLE. Moodle 2.9. Moodle Developer Resources. Disponível em https://moodledev.io/general/releases/2.9. Acesso em 23 set. 2026.

MOODLE. Templates. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.0/guides/templates. Acesso em 23 set. 2026.

MOODLE. named_templatable Interface Reference. Moodle PHP Documentation. Disponível em https://phpdoc.moodledev.io/main/d8/df6/interfacecore_1_1output_1_1named__templatable.html. Acesso em 23 set. 2026.

MOODLE. Output API. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.1/apis/subsystems/output. Acesso em 23 set. 2026.

MOODLE. Templates. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.0/guides/templates. Acesso em 23 set. 2026.

MOODLE. JavaScript Modules. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.1/guides/javascript/modules. Acesso em 23 set. 2026.

MOODLE. AJAX. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.2/guides/javascript/ajax. Acesso em 23 set. 2026.

MOODLE. Modal Dialogues. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.1/guides/javascript/modal. Acesso em 23 set. 2026.

MOODLE. Frontend Development. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.2/guides/frontend. Acesso em 23 set. 2026.

MOODLE. Accessibility. Moodle Developer Resources. Disponível em https://moodledev.io/general/development/policies/accessibility. Acesso em 23 set. 2026.

MOODLE. Moodle 5.2 Release Notes. Moodle Developer Resources. Disponível em https://moodledev.io/general/releases/5.2. Acesso em 23 set. 2026.
