{% raw %}

# 7. Forms API

Formulário parece uma das partes mais simples de um plugin Moodle até você precisar editar um registro existente, validar uma regra que depende do banco, receber arquivos, manter um editor HTML com imagens, abrir o mesmo formulário dentro de uma modal e impedir que uma submissão duplicada faça besteira. Nesse momento fica claro que um `<form>` com alguns `<input>` não resolve o problema inteiro, porque a parte difícil nunca foi desenhar o campo na tela, mas fazer o ciclo completo funcionar de forma previsível dentro do Moodle.

A Forms API existe justamente para isso. Ela padroniza a construção dos campos, integra validação, acessibilidade, limpeza dos valores recebidos, proteção contra CSRF, File API, editores, botões de ação e vários comportamentos que seriam repetidos manualmente em cada plugin. Por baixo ainda existe uma herança histórica do PEAR HTML_QuickForm, o que explica alguns nomes e algumas escolhas de API que parecem estranhas para quem chega hoje, mas a regra prática é simples. Você trabalha com `moodleform`, não com HTML_QuickForm diretamente, e deixa o Moodle cuidar da parte repetitiva enquanto seu código fica responsável pelas regras de negócio.

Isso não significa que Forms API resolve autorização, persistência e arquitetura por você. Um formulário pode validar perfeitamente e ainda assim salvar algo que o usuário não deveria poder alterar se a página esqueceu `require_capability()`, da mesma forma que um `setType()` correto não substitui escaping na saída. É importante entender esse limite desde o começo, porque um dos erros mais comuns em plugins é transformar a classe do formulário em um lugar onde tudo acontece, com consulta, regra de negócio, atualização de banco, envio de mensagem e redirect misturados dentro de `validation()`. Funciona até deixar de funcionar, e geralmente deixa de funcionar quando você precisa reutilizar a mesma regra fora daquela tela.

## 7.1 O que é `moodleform`

`moodleform` é a classe base que organiza o formulário tradicional do Moodle. Você cria uma classe que herda dela, implementa `definition()` e descreve quais elementos existem, quais valores devem ser limpos, quais regras simples devem ser aplicadas e quais botões serão exibidos. Depois uma página instancia essa classe, verifica se o usuário cancelou, tenta obter os dados validados e, se nada foi submetido, renderiza o formulário.

A Forms API ainda carrega a origem em HTML_QuickForm, mas esse detalhe interessa mais para entender algumas decisões históricas do que para orientar código novo. O plugin não deveria instanciar `HTML_QuickForm`, depender de classes internas do PEAR ou copiar exemplos antigos que manipulam diretamente estruturas internas da biblioteca, porque o contrato mantido pelo Moodle é `moodleform` e seus elementos. Quando o core precisa adaptar acessibilidade, validação, layout ou integração com JavaScript, é nessa camada que a compatibilidade é preservada.

Um formulário mínimo fica assim.

```php
<?php

namespace tool_catalog\form;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/formslib.php');

final class edit_item_form extends \moodleform {
    public function definition(): void {
        $mform = $this->_form;

        $mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
        $mform->setType('name', PARAM_TEXT);

        $this->add_action_buttons();
    }
}
```

A classe só descreve o formulário. Ela ainda não sabe qual registro será salvo, para onde o usuário será redirecionado ou se a operação é criação ou edição, e isso é bom, porque essas responsabilidades pertencem ao fluxo que usa o formulário e às classes de domínio do plugin.

## 7.2 Quando usar Moodle Forms

Se o usuário precisa preencher dados em uma página Moodle, Moodle Forms deveria ser a primeira opção, principalmente quando o formulário possui validação, campos condicionais, editor, arquivos ou precisa seguir o comportamento visual e de acessibilidade do restante da plataforma. Criar HTML manualmente parece mais rápido quando existem dois campos, mas a conta muda quando você precisa incluir `sesskey`, mensagens de erro consistentes, valores antigos após falha de validação, suporte a leitores de tela, File API e comportamento correto em temas diferentes.

Há exceções. Um filtro simples dentro de uma tabela dinâmica, um botão isolado, um controle totalmente gerenciado por um componente JavaScript ou uma interação que não representa uma submissão de dados pode não justificar uma classe `moodleform`, mas a decisão deve vir do tipo de interação e não de preguiça de criar uma classe. Um formulário de cadastro escrito manualmente em um template Mustache continua sendo um formulário de cadastro e continua precisando resolver as mesmas questões, só que agora você assumiu manualmente responsabilidades que o Moodle já resolveu.

Eu costumo usar uma pergunta bem prática. Se amanhã esse formulário ganhar um campo de arquivo, uma regra condicional e precisar aparecer em uma modal, a estrutura atual continua saudável? Se a resposta for não, provavelmente o HTML manual parecia simples apenas porque você olhou para a primeira versão e ignorou a evolução natural da funcionalidade.

## 7.3 Criando uma classe de formulário

Em código novo, coloque a classe em um namespace do componente, normalmente abaixo de `classes/form/`. Para um plugin `tool_catalog`, por exemplo, `classes/form/edit_item_form.php` resulta naturalmente em `\tool_catalog\form\edit_item_form`. Isso mantém autoloading, organização e descoberta previsíveis, em vez de repetir o padrão antigo de arquivos `edit_form.php` espalhados pela raiz do plugin.

Existe uma exceção importante e histórica nos Activity Modules. `moodleform_mod` ainda possui convenções específicas e o formulário de configuração da atividade é procurado pelo fluxo de edição de módulos, por isso o Capítulo 17 volta ao assunto com calma. Aqui o importante é não pegar esse caso especial e concluir que todo formulário Moodle deve ficar em um arquivo chamado `mod_form.php` ou usar classe global sem namespace.

A classe recebe argumentos no construtor herdado, incluindo a action URL e `customdata`. O `customdata` é útil quando a definição visual depende de dados externos que já foram resolvidos pela página, por exemplo uma lista de categorias permitidas ou um contexto que a classe precisa conhecer para montar um autocomplete. Use isso para fornecer dependências de apresentação, não para transformar `_customdata` em um saco sem fundo com meia aplicação dentro.

```php
$form = new \tool_catalog\form\edit_item_form(
    action: $url,
    customdata: [
        'context' => $context,
        'categories' => $categories,
    ],
);
```

Dentro da classe você acessa esses valores por `$this->_customdata`. Mesmo sendo uma API antiga e com underscore no nome, esse é o mecanismo previsto por `moodleform`.

## 7.4 `definition()`

`definition()` descreve a estrutura inicial do formulário e é chamado durante a construção da instância. É aqui que você adiciona elementos, define tipos, valores padrão, regras simples, agrupamentos e botões, mas não deveria usar esse método para salvar dados, disparar eventos, atualizar tabelas ou executar qualquer efeito colateral. O método pode ser chamado em situações em que a intenção ainda é apenas renderizar ou validar a estrutura, então misturar persistência aqui produz comportamento difícil de prever.

Também vale evitar consultas caras dentro de `definition()`. Se a página já conhece a lista necessária, passe por `customdata`; se o valor depende de uma API do domínio, prefira preparar antes da construção ou encapsular a consulta em uma classe adequada. Um formulário que executa quinze queries só para descobrir quais opções mostrar já começa caro antes mesmo de o usuário tocar em qualquer campo.

Há casos em que a definição depende do próprio valor submetido e o Moodle oferece mecanismos como `definition_after_data()`, mas use isso quando a estrutura realmente precisa ser adaptada depois que os dados foram organizados. Para mostrar e esconder campos conforme um checkbox, `hideIf()` e `disabledIf()` normalmente resolvem com menos complexidade.

## 7.5 `$this->_form`

A propriedade `$this->_form` contém o objeto `MoodleQuickForm` que efetivamente recebe os elementos. A convenção mais comum é guardá-lo em `$mform` logo no início de `definition()`, porque repetir `$this->_form` vinte vezes deixa o código pesado sem ganhar clareza.

```php
public function definition(): void {
    $mform = $this->_form;

    $mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
    $mform->setType('name', PARAM_TEXT);
}
```

Há uma diferença que pega quem está começando. Métodos como `addElement()`, `setType()` e `setDefault()` pertencem ao objeto `$mform`, enquanto `add_action_buttons()` pertence à classe `moodleform`, portanto o código correto é `$this->add_action_buttons()` e não `$mform->add_action_buttons()`. Parece detalhe pequeno, mas é justamente o tipo de coisa que leva alguém a copiar exemplos aleatórios sem perceber qual objeto está manipulando.

## 7.6 Elementos de formulário

A Forms API possui elementos HTML comuns e vários elementos específicos do Moodle. A escolha não deveria ser feita apenas pelo visual, porque alguns componentes carregam comportamento adicional, integração com JavaScript, acessibilidade, File API ou APIs internas. Um `autocomplete`, por exemplo, não é apenas um `<select>` com aparência melhor, e um `editor` não é uma `<textarea>` com botões em cima.

Também evite criar componentes customizados para tudo. Se o core já possui um elemento que resolve a interação, usar o padrão reduz JavaScript próprio, melhora compatibilidade com temas e tende a produzir uma interface mais consistente. Componente personalizado faz sentido quando o domínio pede algo que realmente não cabe nos elementos existentes, e não porque você quer mudar três pixels de uma seleção.

## 7.7 Text

O elemento `text` serve para entradas curtas e é provavelmente o campo mais usado. Sempre combine o campo com `setType()`, porque o tipo informa ao Forms API como o valor recebido deve ser limpo antes de você utilizá-lo.

```php
$mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
$mform->setType('name', PARAM_TEXT);
$mform->addRule('name', null, 'required', null, 'client');
```

Não escolha `PARAM_TEXT` por hábito sem pensar no conteúdo esperado. Um identificador, uma URL, um inteiro e um texto livre possuem necessidades diferentes. O Capítulo 8 volta aos `PARAM_*` pelo lado da segurança, mas já vale guardar uma regra simples: tipar entrada é parte do contrato do campo, não decoração para satisfazer checker.

## 7.8 Textarea

`textarea` é apropriado para texto simples de múltiplas linhas, quando você não quer formatação rica nem arquivos embutidos. Se o conteúdo precisa de links, imagens, listas, negrito e processamento de filtros do Moodle, o elemento correto normalmente será `editor`, porque uma textarea não carrega formato nem gerencia arquivos associados.

```php
$mform->addElement(
    'textarea',
    'notes',
    get_string('notes', 'tool_catalog'),
    ['rows' => 8, 'cols' => 60],
);
$mform->setType('notes', PARAM_TEXT);
```

Um erro frequente é usar `textarea` para armazenar HTML com `PARAM_RAW` só porque o campo cresceu além de uma linha. Se você está armazenando HTML produzido pelo usuário, existe uma conversa maior sobre editor, formato, limpeza e saída, então pular essa arquitetura para economizar algumas linhas quase sempre cobra juros depois.

## 7.9 Select

`select` funciona bem quando existe um conjunto pequeno e previsível de opções. As chaves do array são os valores submetidos e os valores são os rótulos exibidos, portanto pense no que realmente precisa ser persistido e não use texto traduzido como identificador de negócio.

```php
$options = [
    'draft' => get_string('statusdraft', 'tool_catalog'),
    'active' => get_string('statusactive', 'tool_catalog'),
    'archived' => get_string('statusarchived', 'tool_catalog'),
];

$mform->addElement('select', 'status', get_string('status', 'tool_catalog'), $options);
$mform->setType('status', PARAM_ALPHA);
```

Se o conjunto possui centenas ou milhares de itens, um select convencional vira uma parede de opções e ainda pode custar caro para montar. Nesse cenário, `autocomplete` costuma oferecer experiência melhor e pode trabalhar com seleção múltipla e pesquisa, embora listas realmente gigantes possam pedir uma solução de carregamento mais específica para evitar trazer tudo para a página de uma vez.

## 7.10 Autocomplete

`autocomplete` é uma das melhores escolhas quando o usuário precisa localizar uma opção em uma lista maior. Ele oferece busca e pode aceitar múltiplos valores, mas não use isso como desculpa para carregar cinquenta mil usuários em um array PHP apenas porque a interface consegue pesquisar depois que tudo chegou ao navegador.

```php
$mform->addElement(
    'autocomplete',
    'reviewers',
    get_string('reviewers', 'tool_catalog'),
    $useroptions,
    ['multiple' => true],
);
```

Quando a origem é grande, procure APIs e componentes que suportem busca remota ou repense o fluxo. Interface bonita não corrige consulta ruim, e um autocomplete com um array gigante continua sendo um select gigante com maquiagem.

## 7.11 Checkbox

Checkbox representa uma condição booleana, mas lembre que formulários HTML tratam campos desmarcados de maneira diferente de campos marcados, então deixe o Forms API normalizar o comportamento e estabeleça defaults quando necessário.

```php
$mform->addElement('advcheckbox', 'enabled', get_string('enabled', 'tool_catalog'));
$mform->setDefault('enabled', 1);
```

No Moodle você encontrará bastante `advcheckbox`, que oferece comportamento mais adequado ao ecossistema do que montar checkbox bruto. O valor ainda precisa ser interpretado pelo seu domínio e não deveria decidir autorização. Um usuário enviar `enabled=1` nunca significa que ele possui permissão para habilitar alguma coisa.

## 7.12 Radio

Radio é útil quando o usuário precisa escolher exatamente uma opção entre poucas alternativas e é importante que todas estejam visíveis ao mesmo tempo. Se existem dez ou vinte alternativas, provavelmente um select ou autocomplete comunica melhor a informação e ocupa menos espaço.

```php
$mform->addElement('radio', 'visibility', '', get_string('public'), 'public');
$mform->addElement('radio', 'visibility', '', get_string('private'), 'private');
$mform->setType('visibility', PARAM_ALPHA);
```

Quando vários radios representam a mesma decisão, agrupar os elementos pode melhorar organização e acessibilidade, principalmente se o rótulo da pergunta precisa ser associado corretamente ao conjunto inteiro.

## 7.13 Date selectors

Datas parecem simples até entrarem timezone, horário opcional e valores vazios. O Moodle oferece seletores próprios justamente para manter consistência com as preferências e convenções da plataforma. Você pode trabalhar com `date_selector`, `date_time_selector` e opções relacionadas conforme o nível de precisão necessário.

Evite montar três selects de dia, mês e ano manualmente ou confiar em um campo textual interpretado pelo servidor. Além de reinventar interface, você passa a responder por validação, localização e comportamento de datas que o core já resolveu. Quando o valor representa um timestamp, deixe claro no domínio se o horário é significativo ou se você está modelando apenas uma data lógica, porque misturar as duas coisas costuma produzir bugs de um dia de diferença em fusos distintos.

## 7.14 Hidden

Campo `hidden` existe para transportar valores pelo fluxo do formulário, não para proteger valores. Tudo que está no navegador pode ser alterado pelo usuário e precisa ser tratado como entrada não confiável.

```php
$mform->addElement('hidden', 'id');
$mform->setType('id', PARAM_INT);
```

Se `id=52` identifica o registro a ser editado, o backend precisa carregar o registro e confirmar que o usuário pode editar exatamente aquele item. Colocar o ID em hidden não cria autorização, assim como esconder um `userid` da tela não impede alguém de trocar o valor na requisição. Essa distinção volta com força no Capítulo 8 porque é a origem de muito IDOR em plugin Moodle.

## 7.15 Static

`static` exibe informação dentro do formulário sem receber um valor editável. É útil para mostrar dados contextuais, descrições ou valores que o usuário precisa consultar enquanto preenche o restante.

```php
$mform->addElement(
    'static',
    'createdby',
    get_string('createdby', 'tool_catalog'),
    fullname($creator),
);
```

Não confunda `static` com valor de segurança. Se a informação precisa participar do processamento, recarregue do servidor a partir de uma chave confiável em vez de confiar no que apareceu na tela. O campo está ali para a pessoa ler, não para o backend aprender algo que ele já deveria saber.

## 7.16 Group

Groups ajudam a organizar elementos relacionados em uma única linha ou bloco lógico. Um caso comum é agrupar botões, opções complementares ou elementos que formam uma mesma decisão.

O ganho não é apenas estético. Um bom agrupamento deixa a relação entre campos mais clara, reduz ruído visual e pode melhorar a semântica do formulário, enquanto usar groups para espremer dez controles na mesma linha normalmente faz o oposto. Moodle é utilizado em telas pequenas e com zoom elevado, então uma linha perfeita no seu monitor de 27 polegadas não pode ser a única referência de layout.

## 7.17 `addRule()`

`addRule()` adiciona validações padronizadas, como obrigatoriedade, tamanho, número ou formatos conhecidos. Quando a regra é simples e pertence claramente ao campo, colocar isso na definição deixa o contrato visível onde o elemento é criado.

```php
$mform->addRule('name', get_string('required'), 'required', null, 'client');
$mform->addRule('code', null, 'maxlength', 40, 'client');
```

O parâmetro que habilita validação client-side melhora experiência, mas não deve ser confundido com proteção. Tudo que roda no navegador pode ser ignorado, portanto regras que realmente definem se os dados são válidos precisam existir no servidor. Quando a verificação depende de outro campo, de um registro existente ou de uma regra do domínio, `validation()` é o lugar mais apropriado.

## 7.18 `setType()`

`setType()` informa como o valor recebido deve ser limpo e normalizado usando os tipos `PARAM_*`. Isso acontece antes de o valor chegar ao processamento normal do formulário e reduz a chance de cada página inventar sua própria limpeza.

```php
$mform->setType('id', PARAM_INT);
$mform->setType('name', PARAM_TEXT);
$mform->setType('code', PARAM_ALPHANUMEXT);
```

Não existe um tipo universal. Usar `PARAM_RAW` em tudo porque "eu valido depois" normalmente significa que ninguém validou depois, enquanto usar um tipo excessivamente restritivo pode mutilar dado válido. Escolha pelo contrato real do campo e lembre que limpeza de entrada não substitui escaping de saída. Um texto validado com `PARAM_TEXT` ainda deve ser apresentado pela API correta no contexto correto.

## 7.19 `setDefault()`

`setDefault()` define o valor inicial quando não há dado mais específico carregado. É útil para defaults de criação, mas não confunda valor padrão com valor atual de uma edição. Em formulários que editam registro, `set_data()` normalmente deve carregar o estado persistido e prevalecer sobre o default.

```php
$mform->setDefault('enabled', 1);
$mform->setDefault('status', 'draft');
```

Defaults também não deveriam esconder regra de negócio crítica dentro do formulário. Se toda entidade nova nasce com status `draft`, talvez essa seja uma propriedade do serviço que cria a entidade e não apenas da tela. O formulário pode sugerir o valor, mas o backend ainda precisa manter a regra quando a mesma entidade for criada por CLI, web service ou importação.

## 7.20 `disabledIf()`

`disabledIf()` desabilita um elemento conforme o valor de outro campo. É ótimo para dependências simples e evita JavaScript próprio para coisas como "só peça a data de encerramento se encerramento estiver habilitado".

```php
$mform->addElement('advcheckbox', 'hasenddate', get_string('hasenddate', 'tool_catalog'));
$mform->addElement('date_time_selector', 'enddate', get_string('enddate', 'tool_catalog'));
$mform->disabledIf('enddate', 'hasenddate', 'notchecked');
```

O estado visual não substitui validação. Um usuário consegue fabricar a requisição com qualquer combinação de valores, então o servidor precisa decidir o que fazer quando `hasenddate` está desligado e `enddate` foi enviado mesmo assim. Normalmente você ignora o valor dependente ou normaliza de acordo com a regra do domínio.

## 7.21 `hideIf()`

`hideIf()` é parecido com `disabledIf()`, mas esconde o elemento. Use quando mostrar o campo sem a condição correspondente apenas polui a interface ou causa confusão.

Esconder campo também não é controle de acesso. Se determinado campo só pode ser alterado por quem possui uma capability, o ideal é nem adicioná-lo para usuários sem permissão ou garantir no processamento que o valor nunca será aceito desses usuários. `hideIf()` responde a estado da interface, não a autorização.

## 7.22 `freeze()`

`freeze()` transforma um elemento em somente leitura dentro do formulário. Isso é útil quando você quer exibir um valor no mesmo layout, mas não quer que ele seja alterado naquela operação, por exemplo um identificador imutável durante a edição.

A mesma advertência vale novamente porque é importante. Read-only no frontend não é segurança. Se o valor não pode mudar, a regra real precisa estar no backend e o processamento deve ignorar qualquer tentativa de alteração. Um atacante não precisa respeitar o HTML renderizado pelo Moodle.

## 7.23 `validation()`

`validation()` é onde entram regras que não cabem em tipos e regras simples. O método recebe os dados e arquivos submetidos e retorna um array de erros, em que cada chave normalmente corresponde ao nome do elemento que deve receber a mensagem.

```php
public function validation($data, $files): array {
    $errors = parent::validation($data, $files);

    if (!empty($data['hasenddate']) && $data['enddate'] <= time()) {
        $errors['enddate'] = get_string('enddatemustbefuture', 'tool_catalog');
    }

    return $errors;
}
```

É tentador colocar toda regra de negócio aqui porque o método já recebe os dados, mas pense no que acontece quando a mesma operação chega por REST ou por uma task. Se uma regra determina se a entidade pode existir, ela deveria estar em uma camada reutilizável e `validation()` apenas traduz essa regra para mensagens associadas aos campos. Assim você não cria duas verdades, uma para formulário e outra para todo o resto.

Também evite efeitos colaterais em `validation()`. Nada de inserir registro para testar unicidade, enviar e-mail ou "pré-reservar" alguma coisa. Validação pode ser executada mais de uma vez e deve ser segura para repetição.

## 7.24 Validação client-side versus server-side

Validação client-side existe para experiência. Ela avisa rápido que um campo obrigatório está vazio, evita ida desnecessária ao servidor e torna o formulário mais confortável, mas qualquer pessoa pode desabilitar JavaScript, alterar o DOM ou chamar o endpoint diretamente.

Validação server-side existe para integridade. É ela que precisa garantir datas, relacionamentos, unicidade, limites e qualquer regra que não pode ser violada. Em sistemas reais, trate o client como uma ajuda para a pessoa honesta e o servidor como a autoridade final.

A mesma regra vale para Dynamic Forms. O fato de a submissão acontecer por AJAX não deixa o navegador mais confiável, apenas muda o transporte. O PHP continua precisando validar contexto, capability, parâmetros e regra de negócio.

## 7.25 `get_data()`

`get_data()` representa o ponto em que o formulário foi submetido e passou pela validação. Quando ele retorna um objeto, você pode seguir para o processamento da operação.

```php
if ($data = $form->get_data()) {
    $service->save($data);
    redirect($returnurl, get_string('changessaved'));
}
```

Não trate `get_data()` como persistência automática. Moodle Forms coleta e valida entrada, mas quem decide como isso vira entidade, registro, evento ou arquivo permanente é seu código. Essa separação é ótima porque permite testar regra de negócio sem precisar construir um formulário inteiro.

Também prefira copiar explicitamente os campos necessários ou passar os dados para uma camada que conheça o contrato, em vez de mandar o objeto inteiro para `$DB->insert_record()` sem pensar. Formulários crescem e um novo campo visual não deveria virar automaticamente nova coluna persistida por acidente.

## 7.26 `set_data()`

`set_data()` carrega valores existentes no formulário, principalmente em cenários de edição. O objeto ou array deve usar nomes compatíveis com os elementos definidos.

```php
if (!$form->is_submitted()) {
    $form->set_data($record);
}
```

Na prática, você normalmente organiza o fluxo para só chamar `set_data()` no caminho de exibição, depois de tratar cancelamento e submissão. O detalhe importante é preparar o dado antes quando há editor ou filemanager, porque esses campos trabalham com draft areas e não aceitam simplesmente o valor bruto salvo no banco.

Outro cuidado é não fazer `set_data()` com um objeto gigantesco vindo de tabela e supor que qualquer propriedade extra será inofensiva para sempre. A classe do formulário deveria conhecer os campos que recebe, especialmente quando nomes se sobrepõem a elementos hidden ou controles internos.

## 7.27 `is_cancelled()`

O botão Cancelar não deve ser tratado como uma submissão comum que falhou em validação. `is_cancelled()` existe para identificar esse caminho e permitir retorno imediato à página anterior ou ao destino apropriado.

```php
if ($form->is_cancelled()) {
    redirect($returnurl);
}
```

Cheque cancelamento antes de processar `get_data()`. Além de deixar a intenção clara, isso evita executar preparação desnecessária para uma operação que o usuário explicitamente abandonou. E não invente um botão "cancelar" que grava status, apaga rascunho ou altera banco, porque aí ele deixou de ser cancelamento e virou uma ação de negócio que merece fluxo próprio.

## 7.28 Submit

O botão principal normalmente é adicionado com `add_action_buttons()`, que cria a estrutura padrão de submit e, opcionalmente, cancelamento.

```php
$this->add_action_buttons(
    cancel: true,
    submitlabel: get_string('savechanges'),
);
```

Desde versões modernas também existe `add_sticky_action_buttons()`, útil em formulários longos porque mantém as ações mais acessíveis durante a rolagem. Não use uma solução JavaScript própria para fixar botões quando o core já oferece a convenção.

Para ações diferentes, tome cuidado com múltiplos submits e botões no-submit. O fato de o formulário possuir três botões não significa que tudo deva desembocar em uma função com quinze `if`s. Quando as ações têm semântica e autorização diferentes, às vezes separar endpoints produz código mais claro do que transformar o formulário em painel de controle genérico.

## 7.29 Cancel

O Cancelar padrão faz parte do contrato de navegação do Moodle e deveria devolver o usuário para um lugar previsível, normalmente sem efeitos colaterais. Se o formulário abriu dentro de modal dinâmica, o cancelamento também deve fechar a interação sem persistir dados.

Parece óbvio, mas é comum encontrar plugin onde cancelar dispara uma atualização porque o código processou algum valor antes de verificar `is_cancelled()`. Esse tipo de bug nasce da ordem do fluxo, não do botão, e desaparece quando a página segue uma sequência clara de autorização, construção, cancelamento, submissão válida e renderização.

## 7.30 `repeat_elements()`

`repeat_elements()` resolve cenários em que você precisa de quantidade variável de grupos, como opções de resposta, critérios ou linhas de configuração. O Moodle controla a quantidade de repetições e normalmente recarrega a estrutura quando o usuário pede mais campos.

```php
$elements = [
    $mform->createElement('text', 'label', get_string('label', 'tool_catalog')),
    $mform->createElement('text', 'value', get_string('value', 'tool_catalog')),
];

$options = [
    'label' => ['type' => PARAM_TEXT],
    'value' => ['type' => PARAM_TEXT],
];

$this->repeat_elements(
    $elements,
    3,
    $options,
    'rule_repeats',
    'rule_add_fields',
    1,
);
```

O retorno chega indexado, então sua persistência precisa tratar a coleção, remover linhas vazias e validar cada item. Não use `repeat_elements()` para editar uma tabela gigantesca de registros existentes, porque depois de certo tamanho a página inteira vira um formulário pesado e difícil de usar. Nesse caso uma tabela com edição individual ou modal costuma escalar melhor.

## 7.31 Editor HTML

O elemento `editor` não é apenas uma textarea enriquecida. Ele trabalha com texto, formato e arquivos embutidos, e por isso o valor normalmente envolve uma estrutura com `text`, `format` e `itemid` de draft.

```php
$mform->addElement(
    'editor',
    'description_editor',
    get_string('description', 'tool_catalog'),
    null,
    $editoroptions,
);
```

Ao editar conteúdo existente, você prepara uma draft area, reescreve os links para os arquivos temporários e carrega esse conjunto no formulário. Na submissão, os arquivos precisam sair do draft para a file area permanente e o texto deve voltar a armazenar referências `@@PLUGINFILE@@` quando aplicável. O Capítulo 9 mergulha nisso porque Files API merece tratamento próprio, mas aqui você precisa pelo menos entender por que simplesmente salvar `$data->description_editor['text']` pode deixar URLs apontando para uma área temporária do usuário.

Se o plugin não precisa de HTML, não use editor só porque ele parece mais completo. Quanto maior o poder do campo, maior a superfície de formatação, arquivos e tratamento necessário.

## 7.32 Filepicker

`filepicker` é adequado quando o usuário escolhe um arquivo que será consumido pela operação, como um CSV para importação ou uma imagem que será imediatamente processada. Ele integra Repository API e upload, evitando `<input type="file">` manual e todas as diferenças de origem do arquivo.

Depois da submissão, você pode obter o arquivo temporário ou salvá-lo na File API conforme a finalidade. Para importações transitórias, não faz sentido criar uma file area permanente apenas para guardar eternamente o arquivo que já foi processado, a menos que exista uma necessidade de auditoria ou reprocessamento definida pelo produto.

Também valide o conteúdo no servidor. Extensão e MIME ajudam, mas importação de dados precisa verificar estrutura, tamanho e limites, porque o fato de o Filepicker ter aceitado um arquivo não significa que o conteúdo faz sentido para sua regra de negócio.

## 7.33 Filemanager

`filemanager` gerencia uma coleção de arquivos ligada a uma file area. É o elemento mais comum quando o usuário pode adicionar, remover e reorganizar anexos que precisam permanecer associados a uma entidade.

Ele trabalha sobre draft area durante a edição. Isso é importante porque o usuário pode remover um arquivo e adicionar outro sem alterar imediatamente a área permanente; somente quando a submissão válida é processada você sincroniza o draft com o destino definitivo.

Um fluxo de edição costuma ter esta forma conceitual.

```php
$draftitemid = file_get_submitted_draft_itemid('attachments');

file_prepare_draft_area(
    $draftitemid,
    $context->id,
    'tool_catalog',
    'attachments',
    $record->id,
    $fileoptions,
);

$record->attachments = $draftitemid;
$form->set_data($record);
```

Depois de uma submissão válida, a área é salva.

```php
file_save_draft_area_files(
    $data->attachments,
    $context->id,
    'tool_catalog',
    'attachments',
    $record->id,
    $fileoptions,
);
```

Essas funções aparecem novamente no Capítulo 9 com muito mais detalhe, inclusive `contextid`, `component`, `filearea`, `itemid`, diretórios virtuais e `pluginfile.php`.

## 7.34 Draft files

Draft area é uma área temporária ligada ao usuário enquanto ele edita. Ela existe porque o navegador precisa permitir upload, remoção e edição de arquivos antes que você saiba se a pessoa vai salvar o formulário. Se cada clique alterasse imediatamente os arquivos permanentes, Cancelar seria quase impossível de implementar corretamente.

Essa arquitetura explica comportamentos que parecem estranhos quando você olha apenas para o banco. Durante a edição, o arquivo pode existir em uma área de rascunho do usuário, e somente depois da submissão válida ele é copiado ou movido logicamente para a combinação definitiva de contexto, componente, filearea e itemid. Por isso jamais tente adivinhar o caminho físico no `moodledata` e copiar arquivo com `rename()` ou `copy()`.

Outro detalhe importante é o ciclo de vida. Draft não é armazenamento definitivo e pode ser limpo pelo Moodle. Se seu código salva no banco o itemid de um draft esperando encontrá-lo semanas depois, ele está usando a área errada para a finalidade errada.

## 7.35 Form identifiers

Cada formulário precisa ser identificável na página, tanto para JavaScript quanto para CSS e mecanismos internos. A documentação atual observa que o nome da classe influencia o `id` HTML do formulário, com remoção do sufixo `_form`, por isso nomes genéricos como `edit_form` espalhados por contextos diferentes podem produzir ambiguidade e tornam customizações mais difíceis.

Prefira nomes ligados à responsabilidade, como `edit_item_form`, `import_users_form` ou `configure_provider_form`, dentro de namespace igualmente claro. Em Dynamic Forms existe ainda um identificador usado no transporte e no carregamento da classe, então colisão e renomeação passam a ter impacto maior do que simples estética.

Não escreva JavaScript procurando `form:eq(2)` ou assumindo que o formulário é o terceiro elemento da página. Se o comportamento depende de um formulário específico, identifique de forma estável e use a API que acompanha o componente.

## 7.36 CSRF e Forms API

Forms API integra proteção de sessão no fluxo padrão e inclui `sesskey` nas submissões, o que remove muita repetição e reduz erros comuns. Isso não quer dizer que qualquer ação executada a partir de um `moodleform` está automaticamente segura.

CSRF responde à pergunta "a requisição foi enviada dentro de uma sessão válida e com o token esperado?". Capability responde "esse usuário pode executar essa ação nesse contexto?". Propriedade do registro responde "ele pode mexer neste objeto específico?". São problemas diferentes e um formulário correto precisa coexistir com as três verificações quando aplicável.

Também não use GET para uma ação destrutiva só porque existe um formulário bonito antes. A operação que altera estado deve seguir o mecanismo apropriado e validar sessão no endpoint que realmente faz a mudança. O Capítulo 8 entra em profundidade nos ataques, mas aqui vale a regra prática: a Forms API ajuda muito com CSRF, porém não terceiriza sua autorização.

## 7.37 Dynamic Forms

Dynamic Forms resolvem um problema diferente do formulário tradicional. Em vez de a página inteira ser carregada e submetida, uma classe baseada em `\core_form\dynamic_form` pode ser carregada e processada por AJAX, normalmente dentro de uma modal ou de um container da própria página.

Essa API não é "moodleform com JavaScript mágico" e vale entender o contrato específico. A classe ainda herda de `moodleform`, portanto continua usando `definition()`, tipos e validação, mas precisa implementar métodos para descobrir contexto, verificar acesso, preparar dados iniciais, processar a submissão e informar qual URL representa a página para componentes que dependem dela.

Uma estrutura típica se parece com isto.

```php
namespace tool_catalog\form;

final class edit_item_dynamic_form extends \core_form\dynamic_form {
    public function definition(): void {
        $mform = $this->_form;
        $mform->addElement('text', 'name', get_string('name', 'tool_catalog'));
        $mform->setType('name', PARAM_TEXT);
    }

    protected function get_context_for_dynamic_submission(): \context {
        return \context_system::instance();
    }

    protected function check_access_for_dynamic_submission(): void {
        require_capability('tool/catalog:manage', $this->get_context_for_dynamic_submission());
    }

    public function set_data_for_dynamic_submission(): void {
        $id = $this->optional_param('id', 0, PARAM_INT);
        if ($id) {
            $this->set_data($this->load_record($id));
        }
    }

    public function process_dynamic_submission() {
        $data = $this->get_data();
        return $this->save_record($data);
    }

    protected function get_page_url_for_dynamic_submission(): \moodle_url {
        return new \moodle_url('/admin/tool/catalog/index.php');
    }
}
```

O exemplo simplifica a camada de serviço para destacar o contrato do formulário. Em código real, `load_record()` e `save_record()` provavelmente pertenceriam a uma API ou classe de domínio, principalmente para que a mesma operação possa ser chamada fora da modal.

## 7.38 Formulários dentro de Modal

Modal é um ótimo uso para Dynamic Forms quando a operação é curta e contextual, como editar um item de uma tabela sem abandonar a página. O erro é usar modal para qualquer formulário porque parece moderno. Um formulário com quarenta campos, editores, anexos e várias seções normalmente merece uma página própria, porque modal pequena vira um site dentro do site.

No frontend, o Moodle possui infraestrutura para abrir a modal e carregar a classe dinâmica, tratando submissão, erros de validação e fechamento. Quando a validação server-side falha, o formulário pode ser renderizado novamente com os erros sem recarregar a página inteira, o que preserva a experiência do formulário tradicional dentro do fluxo AJAX.

Mesmo na modal, não devolva HTML arbitrário produzido por concatenação PHP. Continue usando Forms API, templates e componentes do core. A modal muda o contêiner, não revoga as decisões arquiteturais do Capítulo 6.

## 7.39 Formulários AJAX

Nem todo formulário AJAX precisa aparecer em modal. `core_form/dynamicform` permite montar a classe dentro de um container existente e controlar eventos de submit e cancelamento sem destruir a página inteira. Isso é útil em configurações embutidas, painéis e áreas em que a edição faz parte do próprio contexto visual.

A vantagem sobre criar um endpoint AJAX manual é importante. Você reaproveita a mesma definição, limpeza e validação da Forms API, e a infraestrutura do core cuida do transporte específico da submissão dinâmica. Isso reduz aquela arquitetura ruim em que existe um formulário PHP para a primeira renderização e uma segunda implementação paralela em JavaScript para salvar, cada uma com regra diferente.

Ainda assim, Dynamic Form não é Web Service genérico. Se sua funcionalidade precisa ser consumida por aplicativo externo, integração ou vários clientes, provavelmente a regra de negócio deveria estar em uma API reutilizável e uma External Function deveria expor o contrato adequado. A Dynamic Form então chama a mesma camada internamente, sem virar API pública por acidente.

## 7.40 `moodleform_mod`

`moodleform_mod` é a especialização usada pelo formulário de criação e edição de Activity Modules. Ele conhece conceitos que um `moodleform` genérico não conhece, como curso, course module, configuração comum de atividades, grupos, disponibilidade, conclusão e elementos padronizados do formulário de módulo.

Por isso não faz sentido herdar de `moodleform_mod` em um plugin local ou admin tool só porque ele "tem mais recursos". A classe pertence ao ciclo de vida de Activity Modules e carrega expectativas específicas do `modedit.php` e das callbacks do tipo `mod`.

No Capítulo 17 veremos `mod_form.php`, `standard_intro_elements()`, `standard_coursemodule_elements()`, `add_action_buttons()`, preprocessamento e pós-processamento de dados com muito mais detalhe. Aqui basta guardar a separação. Formulário comum herda de `moodleform`; formulário de configuração de atividade herda de `moodleform_mod`; formulário dinâmico herda de `core_form\dynamic_form`.

## 7.41 Um fluxo de página que não vira macarrão

Uma página de edição saudável costuma seguir uma ordem previsível. Primeiro carrega o Moodle e parâmetros básicos, resolve contexto e autorização, carrega o registro quando existe, prepara dados auxiliares, instancia o formulário, trata cancelamento, trata submissão válida e só então renderiza.

```php
require_once(__DIR__ . '/../../../config.php');

$id = optional_param('id', 0, PARAM_INT);

$context = context_system::instance();
require_login();
require_capability('tool/catalog:manage', $context);

$url = new moodle_url('/admin/tool/catalog/edit.php', ['id' => $id]);
$returnurl = new moodle_url('/admin/tool/catalog/index.php');

$record = $id ? $repository->get($id) : null;
$form = new \tool_catalog\form\edit_item_form($url);

if ($form->is_cancelled()) {
    redirect($returnurl);
}

if ($data = $form->get_data()) {
    $service->save($data, $record);
    redirect($returnurl, get_string('changessaved'));
}

if ($record) {
    $form->set_data($record);
}

$PAGE->set_context($context);
$PAGE->set_url($url);
$PAGE->set_title(get_string('edititem', 'tool_catalog'));
$PAGE->set_heading(get_string('edititem', 'tool_catalog'));

echo $OUTPUT->header();
$form->display();
echo $OUTPUT->footer();
```

Esse desenho parece simples porque cada etapa possui responsabilidade clara. Se salvar exige cinquenta linhas no meio desse arquivo, o problema não é Forms API, é a ausência de uma camada adequada para a regra de negócio.

## 7.42 Não transforme a classe do formulário em service

Existe uma tentação de colocar métodos como `save()`, `delete()`, `send_notification()` e `calculate_price()` dentro da classe porque "os dados já estão ali". Isso amarra regra de negócio à interface e torna qualquer segundo canal mais difícil.

Imagine que amanhã a mesma operação precise acontecer por CLI. Você vai instanciar um formulário falso dentro da task só para reutilizar `save()`? Se a resposta parece absurda, é porque a regra está na classe errada. A form class deveria definir, preparar e validar a interação, enquanto uma service class ou API do plugin executa a operação.

Essa separação também melhora PHPUnit. É muito mais simples testar `catalog_service::save()` com dados controlados do que simular todo o ciclo de um formulário para verificar uma regra que nem é de interface.

## 7.43 Validação que consulta banco

Consultar banco durante validação não é proibido, mas precisa ser feito com intenção. Verificar se um código já existe pode ser necessário para associar o erro ao campo antes da submissão, porém a garantia definitiva de unicidade pertence ao banco quando a regra é estrutural.

Sem índice unique, duas requisições concorrentes podem passar pela mesma validação e inserir o mesmo valor. A Forms API não resolve race condition. O formulário melhora a mensagem para o usuário, enquanto schema e transação protegem a integridade.

O mesmo vale para permissões. Não consulte banco em `validation()` para descobrir se o usuário pode editar o registro e depois assuma que está autorizado. Faça a checagem de capability e ownership no fluxo de acesso, e use validação para dizer se os dados são coerentes.

## 7.44 Campos condicionais e verdade do servidor

`disabledIf()` e `hideIf()` criam uma interface boa, mas a regra real sempre precisa existir do lado PHP. Se marcar "possui prazo" habilita uma data, normalize o dado no backend de forma explícita.

```php
if (empty($data->hasenddate)) {
    $data->enddate = 0;
}
```

Isso evita carregar lixo histórico. Caso contrário, alguém marca a opção, escolhe uma data, depois desmarca e salva, mas a data antiga continua no banco. Meses depois outra parte do código verifica apenas `enddate` e passa a tratar um prazo que visualmente estava desligado.

Interface e persistência precisam concordar sobre qual campo determina o estado.

## 7.45 Erros de validação que ajudam de verdade

Mensagem "Dados inválidos" é quase inútil. Quando possível, associe o erro ao elemento certo e explique o que precisa ser corrigido sem expor detalhe interno. "A data final precisa ser posterior à data inicial" ajuda, enquanto "Exception invalid value" não ajuda ninguém.

Também evite duplicar a mensagem do label. Um campo chamado "Código" com erro "Código inválido" ainda deixa a pessoa sem saber qual formato é esperado. Se existe uma restrição de 3 a 20 caracteres alfanuméricos, diga isso na ajuda ou na mensagem.

Validação boa reduz chamado de suporte, mas não deve revelar se um recurso sigiloso existe quando o usuário não deveria ter essa informação. Segurança também passa pela mensagem de erro.

## 7.46 Formulários longos

Quando um formulário passa de duas ou três telas de rolagem, o problema raramente é resolvido diminuindo fonte. Use headers, advanced elements, grupos coerentes e sticky action buttons quando fizer sentido, e pergunte se todas as opções realmente precisam aparecer juntas.

Às vezes o melhor formulário é dois fluxos menores, principalmente quando uma parte só é necessária depois que o registro existe. Arquivos e configurações dependentes de ID são exemplos clássicos. Criar o registro básico primeiro e abrir configurações adicionais depois pode simplificar draft areas, validação e experiência.

Mas não fragmente só para parecer moderno. Cinco etapas com dois campos cada também cansam e dificultam revisão. O ponto é modelar a tarefa real do usuário, não obedecer uma quantidade arbitrária de campos por página.

## 7.47 Acessibilidade não vem apenas do componente

Forms API entrega uma base muito melhor do que HTML improvisado, mas ainda é possível criar um formulário ruim. Labels vagos, grupos sem contexto, instruções dependentes apenas de cor e ordem ilógica de elementos continuam sendo problemas mesmo usando `moodleform`.

Use strings claras, help buttons quando a explicação realmente ajuda, e não remova labels visualmente só para deixar a tela "clean" sem entender o impacto no leitor de tela. O Moodle já carrega muito trabalho de acessibilidade nos componentes e vale trabalhar a favor dessa infraestrutura.

Também teste teclado. Se um campo customizado só funciona com mouse, o problema não desaparece porque ele está dentro de um formulário Moodle.

## 7.48 Exercício - CRUD completo utilizando Forms API

O exercício deste capítulo é construir um pequeno CRUD de catálogo administrativo no plugin fictício `tool_catalog`. O objetivo não é criar um sistema de produtos, mas juntar as decisões estudadas sem ainda depender de APIs que aparecem nos próximos capítulos.

Crie uma tabela `tool_catalog_item` com `id`, `name`, `code`, `description`, `status`, `enabled`, `timecreated` e `timemodified`. A listagem deve mostrar os registros e oferecer criação e edição, enquanto a exclusão precisa usar uma ação protegida e confirmação apropriada. O formulário de edição deve ficar em `classes/form/edit_item_form.php`, usar `text` para nome e código, `editor` para descrição, `select` para status e `advcheckbox` para habilitação.

O código precisa validar nome obrigatório, formato do código e unicidade, mas a tabela também deve possuir índice unique para o código. Na edição, o próprio registro não pode colidir consigo mesmo durante a verificação. A descrição deve ser armazenada com formato e preparada corretamente se você decidir permitir arquivos embutidos, e nesse caso já vale deixar a integração pronta para o aprofundamento do Capítulo 9.

A página `edit.php` não pode executar SQL direto para salvar. Crie uma pequena classe de serviço ou repository para a persistência e deixe a página apenas coordenar contexto, autorização, formulário e redirects. Faça o cancelamento retornar sem efeito colateral e use `set_data()` apenas no fluxo de exibição.

Depois que a versão tradicional estiver funcionando, crie uma segunda edição usando `\core_form\dynamic_form` dentro de modal, reaproveitando a mesma classe de serviço. A meta é perceber que a interface pode mudar sem duplicar a regra de negócio. Se você precisar copiar a lógica de salvar para dentro do Dynamic Form, a separação ainda não ficou boa.

Por fim, force erros. Envie um ID de outro registro, altere hidden fields, remova JavaScript, tente código duplicado em duas requisições e envie dados que o client-side bloquearia. Um formulário correto não é o que funciona quando o usuário faz exatamente o que você espera, mas o que continua íntegro quando a requisição não respeita a interface.

## 7.49 O que você deveria levar deste capítulo

Forms API não é uma coleção de métodos para desenhar campos, mas uma infraestrutura que organiza entrada, validação e experiência de usuário dentro do Moodle. Quando usada corretamente ela remove bastante código repetitivo, mas não substitui modelagem, autorização, File API ou camada de negócio.

Se existe uma ideia que vale carregar para os próximos capítulos é esta: a classe do formulário conhece a interação, enquanto sua aplicação conhece a regra. Misturar as duas coisas torna qualquer evolução mais cara, principalmente quando aparecem AJAX, web services, CLI, importação e testes automatizados.

O melhor sinal de que o formulário está bem desenhado é conseguir trocar a interface sem reescrever a operação. Uma página normal, uma modal e uma API podem usar a mesma regra de negócio, cada uma cuidando apenas da forma como os dados entram e a resposta volta para quem chamou.

## 7.50 Referências técnicas consultadas

Moodle Developer Resources. Forms API, versão 5.2 e documentação main. Disponível em `https://moodledev.io/docs/5.2/apis/subsystems/form` e `https://moodledev.io/docs/5.3/apis/subsystems/form`.

Moodle Developer Resources. Form Usage. Disponível em `https://moodledev.io/docs/5.2/apis/subsystems/form/usage`.

Moodle Developer Resources. Repeat elements. Disponível em `https://moodledev.io/docs/5.2/apis/subsystems/form/advanced/repeat-elements`.

Moodle Developer Resources. Files in Forms e File API. Disponível em `https://moodledev.io/docs/5.0/apis/subsystems/form/usage/files` e `https://moodledev.io/docs/5.2/apis/subsystems/files`.

Moodle PHP Documentation. `core_form\dynamic_form` e `moodleform_mod`. Disponível em `https://phpdoc.moodledev.io/`.

Moodle Developer Documentation. Modal and AJAX forms. A documentação histórica continua útil para compreender `core_form\dynamic_form`, os métodos de acesso, carregamento de dados e processamento da submissão dinâmica.


{% endraw %}
