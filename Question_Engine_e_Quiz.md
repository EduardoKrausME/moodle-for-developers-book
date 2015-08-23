# QUESTION ENGINE E QUIZ

Quiz e Question Engine vivem tão próximos no Moodle que é fácil tratar os dois como se fossem a mesma coisa. O professor cria um Quiz, adiciona questões, o aluno responde e depois aparece uma nota, então visualmente parece existir apenas uma atividade chamada Questionário. No código, porém, a separação é muito mais importante, porque o Quiz é uma atividade que organiza tentativas, tempo, páginas, revisão, notas e regras de acesso, enquanto o Question Engine é um subsistema genérico que sabe executar questões, registrar cada interação, calcular frações, controlar estados e trabalhar com diferentes behaviours sem depender de `mod_quiz`.

Essa distinção explica muita coisa que inicialmente parece estranha. A tabela `quiz_attempts` não guarda as respostas das questões, porque as respostas ficam no Question Engine. O campo `uniqueid` da tentativa aponta para `question_usages`, e a partir daí aparecem `question_attempts`, `question_attempt_steps` e `question_attempt_step_data`. Também explica por que uma questão pode ser usada fora do Quiz, por exemplo em preview, em filtros que incorporam questões ou em outro plugin que cria um `question_usage_by_activity` próprio.

Neste capítulo vamos desmontar essa arquitetura camada por camada, começando pelo Question Bank e chegando até uma tentativa real de Quiz. No caminho vamos trabalhar com categorias, `qtype`, behaviours, states, fractions, feedback, hints, slots, questões aleatórias e criação programática. O objetivo não é decorar tabelas, mas conseguir olhar uma tentativa complexa e entender exatamente onde cada parte do estado está armazenada e qual API deve ser utilizada para alterá-la.

## Quiz e Question Engine não são a mesma coisa

O `mod_quiz` é um activity module. Ele possui tabela principal, course module, formulário de configuração, gradebook, completion, calendário, regras de acesso, tentativas e relatórios. O Question Engine pertence ao subsistema `core_question` e pode ser utilizado por qualquer componente que precise executar questões interativas.

Pense no Quiz como o coordenador da experiência e no Question Engine como o motor que executa cada questão. O Quiz decide que existe uma tentativa de 30 minutos, que as questões aparecem em determinadas páginas e que o aluno só pode revisar o feedback depois do fechamento. O Question Engine decide como uma questão de múltipla escolha recebe uma resposta, como um behaviour imediato reage ao botão "Verificar", qual estado a questão assume e qual fraction foi obtida naquele passo.

Misturar essas responsabilidades costuma produzir código frágil. Se um plugin precisa apenas criar e executar questões, talvez ele não precise de `mod_quiz`; se precisa manipular um Quiz existente, então precisa entender tanto a atividade quanto o engine que está por baixo.

## Question Bank

No Moodle 3.5, o banco de questões é organizado principalmente pelas tabelas `{question_categories}` e `{question}`, além das tabelas específicas de cada tipo de questão. A identidade principal da questão está em `{question}` e os tipos complementam esse registro com seus próprios dados.

## `question_categories`

Cada questão pertence a uma categoria. A categoria também está associada a um contexto, e isso define onde aquela questão pode ser utilizada e administrada. Não trate `category` apenas como agrupamento visual, porque o contexto da categoria participa das regras de compartilhamento e acesso.

## A tabela `question`

A tabela `{question}` representa a questão no banco no modelo do Moodle 3.5. Ela contém campos comuns como nome, texto, tipo, categoria, nota padrão e metadados, enquanto cada `qtype` pode possuir tabelas próprias para seus dados específicos.

Ao editar uma questão usada em tentativas, respeite as APIs do Question Engine e do tipo de questão. No Moodle 3.5, `{question}` é a definição central e possui campos históricos como `stamp`, `version` e `hidden`, mas eles fazem parte do modelo daquela versão e não justificam gravar linhas diretamente nas tabelas internas.

## Questão aleatória em Moodle 3.5

No Moodle 3.5 existe o tipo `qtype_random`. Ele não aparece como uma questão comum criada pelo professor, mas participa da seleção de questões aleatórias de uma categoria durante a montagem da tentativa. Portanto, ao ler código e banco dessa versão, encontrar `qtype_random` é esperado e não é sinal de estrutura legada removida.

## `qtype`

Question type define a natureza da questão. Múltipla escolha, verdadeiro ou falso, resposta curta, numérica, essay, matching e calculated são exemplos de qtypes disponíveis no ecossistema do Moodle 3.5, e plugins de terceiros podem acrescentar outros tipos.

Um qtype participa tanto da criação e edição da questão quanto da execução pelo Question Engine. Isso explica por que ele possui responsabilidades em formulário, persistência, carregamento, grading, rendering, feedback, File API e backup.

## Estrutura tradicional de um qtype

Uma estrutura típica pode conter:

```
question/type/simplechoice/
    backup/
        moodle2/
    lang/
        en/
            qtype_simplechoice.php
    pix/
        icon.svg
    edit_simplechoice_form.php
    question.php
    questiontype.php
    renderer.php
    version.php
```

Ao contrário do que discutimos em Output API e Mustache para páginas comuns, qtypes ainda possuem um contrato de rendering próprio integrado ao `core_question_renderer`, então aqui `renderer.php` não é simplesmente boilerplate histórico descartável. É uma das situações em que renderer continua fazendo parte da API específica do subsistema.

## `questiontype.php`

A classe de `questiontype.php` normalmente herda de `question_type` e responde por carregar e salvar dados persistidos, opções, respostas, hints e metadados do tipo.

O método `save_question()` da base salva os campos comuns da questão, prepara arquivos e depois delega ao qtype a persistência dos dados específicos. Não recrie esse fluxo manualmente.

## `edit_[qtype]_form.php`

O formulário define campos específicos de autoria da questão. Ele herda das classes de formulário de questões e integra nome, texto, nota padrão, feedback geral, hints e outros elementos comuns.

A regra continua igual à Forms API: validação visual não substitui validação server-side e campos específicos precisam usar os tipos corretos.

## `question.php`

`question.php` define a classe de runtime que representa uma questão durante uma tentativa. Normalmente ela deriva de classes como `question_graded_automatically` ou outras bases apropriadas ao comportamento.

É aqui que entram métodos que definem resposta esperada, completude, grading, summaries e comportamento específico daquele tipo durante a tentativa.

## Question definition

Uma `question_definition` não é apenas o registro da tabela. Ela é um objeto carregado e preparado para execução, contendo o qtype, opções, respostas e lógica necessária para participar de um attempt.

Quando você usa `question_bank::load_question($questionid)`, o core carrega dados e pede ao qtype que construa a definição correta.

## Answers

Muitos qtypes usam a tabela `question_answers`, que guarda `answer`, `fraction` e feedback, mas isso não é universal. Alguns tipos possuem tabelas próprias ou estruturas que não cabem no modelo de respostas simples.

Não crie integração supondo que toda questão possui exatamente quatro linhas em `question_answers`.

## Fractions

No Question Engine a correção normalmente trabalha com fraction em escala relativa. Uma resposta totalmente correta pode retornar `1.0`, parcialmente correta `0.5` e incorreta `0.0`. Alguns tipos podem permitir valores negativos ou superiores a 1 em cenários específicos, e o attempt possui `minfraction` e `maxfraction` para representar esses limites.

A nota efetiva da questão é calculada combinando fraction com `maxmark` da tentativa daquela questão.

```
fraction = 0.75
maxmark  = 2.0
mark     = 1.5
```

Essa separação permite que a mesma definição de questão valha pesos diferentes em usos distintos.

## `defaultmark` não é o peso final do Quiz

`question.defaultmark` é a nota padrão sugerida pela questão, mas um slot do Quiz possui `maxmark`, que representa quanto aquela questão vale naquele Quiz.

Alterar `defaultmark` da questão não deveria ser confundido com alterar retroativamente o peso de todos os quizzes que já a utilizam.

## General feedback

`generalfeedback` pertence à questão e é um feedback geral que pode ser mostrado conforme as review options do consumidor, por exemplo o Quiz.

Isso é diferente de feedback específico de uma resposta, feedback combinado por faixa de nota e feedback de comportamento.

O Question Engine sabe produzir a informação, enquanto o Quiz decide quando ela pode ser exibida.

## Specific feedback

Em qtypes com respostas definidas, cada alternativa pode possuir feedback próprio. Depois da correção, o renderer pode apresentar o feedback correspondente à resposta escolhida, desde que `question_display_options` permita.

Essa última condição é importante. Não basta o qtype ter feedback, porque o componente consumidor pode bloquear sua visualização naquele momento.

## Hints

Hints são dicas usadas principalmente em behaviours que permitem múltiplas tentativas dentro da mesma questão. A tabela `question_hints` guarda dicas e opções como limpar respostas erradas ou mostrar quantidade de partes corretas em tipos compatíveis.

O método `save_hints()` da base de qtype cuida inclusive de arquivos na File API, portanto gravar hints manualmente em SQL perde parte do contrato.

## Question Engine

O Question Engine é a camada que executa questões. Ele recebe definições, behaviours, respostas submetidas e controla o estado ao longo do tempo.

Entre as classes centrais estão `question_engine`, `question_usage_by_activity`, `question_attempt`, steps, states e behaviours.

Um plugin externo ao engine normalmente deveria entrar pelas APIs de `question_engine` e pelo `question_usage_by_activity`, não pelo data mapper interno.

## `question_engine`

`question_engine` é a fachada principal para criar, carregar e salvar usages. Métodos como `make_questions_usage_by_activity()`, `save_questions_usage_by_activity()` e `load_questions_usage_by_activity()` evitam que o consumidor precise conhecer detalhes das tabelas internas.

O próprio código do core deixa claro que o data mapper é implementação interna e não deve ser usado diretamente para inserção e atualização normais.

## `question_usage_by_activity`

`question_usage_by_activity`, frequentemente chamado de `quba`, representa um conjunto de questões sendo utilizado por alguma atividade ou componente.

Um Quiz attempt possui um QUBA, mas um preview de questão também pode possuir outro. Cada QUBA tem contexto, componente proprietário e behaviour preferido.

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context
);
$quba->set_preferred_behaviour('deferredfeedback');
```

Depois você adiciona questões, inicia e salva o usage.

## A tabela `question_usages`

Cada `question_usage_by_activity` persistido corresponde a uma linha em `question_usages`. Os campos principais são `contextid`, `component` e `preferredbehaviour`.

O componente informa quem é o dono daquele uso. Em Quiz será `mod_quiz`; em outro plugin será o Frankenstyle correspondente.

## Slot no Question Engine

Dentro de um QUBA as questões são identificadas por slots sequenciais. O engine deliberadamente não utiliza `question.id` como posição, porque a mesma questão pode aparecer mais de uma vez e porque o consumidor trabalha com uma sequência própria.

O slot é uma posição dentro daquele usage, não uma identidade global.

## `question_attempt`

Cada questão dentro de um usage possui um `question_attempt`. A tabela `question_attempts` armazena `questionusageid`, `slot`, behaviour, `questionid`, variant, `maxmark`, fractions limite, flagged e summaries.

Esse registro representa a questão concreta que está sendo tentada naquele usage.

## `questionid` da tentativa identifica a questão usada

Em `question_attempts`, `questionid` aponta para a questão concreta em `{question}.id` utilizada naquela tentativa. Além disso, o attempt guarda resumos como `questionsummary`, `rightanswer` e `responsesummary`, que ajudam relatórios e revisão a representar o que ocorreu durante aquela execução.

Por isso, uma tentativa antiga não deve ser reconstruída consultando apenas o estado atual do formulário de autoria da questão; use o Question Engine e os dados persistidos da própria tentativa.

## Variant

Alguns qtypes podem gerar variantes, por exemplo números diferentes em uma questão calculada. O campo `variant` registra qual variante foi escolhida para aquela tentativa.

Isso é parte da reprodutibilidade. Se o aluno recebeu `x = 7`, a revisão posterior precisa reconstruir exatamente a mesma questão, não sortear outra variante.

## Summaries

`questionsummary`, `responsesummary` e `rightanswer` armazenam representações textuais úteis para relatórios e revisão.

Eles não substituem os dados completos da questão, mas evitam que relatórios precisem entender todas as estruturas internas de todos os qtypes apenas para mostrar uma descrição humana da resposta.

## Steps

Uma tentativa de questão não é um único estado. Cada interação relevante cria um step, armazenado em `question_attempt_steps`.

O step guarda `sequencenumber`, `state`, `fraction`, `timecreated` e `userid`. A sequência começa em zero e evolui conforme o behaviour recebe ações.

Isso permite reconstruir a história da questão, inclusive múltiplas tentativas, grading e ações intermediárias.

## `question_attempt_step_data`

Dados específicos enviados em cada step ficam em `question_attempt_step_data` como pares `name` e `value`.

A documentação do schema registra convenções importantes: dados pertencentes ao behaviour podem começar com `-`, enquanto valores cacheados podem usar `_` ou `_-`.

Não faça parse dessas convenções por conta própria se a API do attempt já oferece acesso aos dados que você precisa.

## States

O Question Engine possui estados como todo, complete, invalid, needs grading, graded right, partially right, wrong e outros intermediários.

O state é uma abstração comum que permite ao Quiz entender em que situação está a questão sem conhecer internamente cada qtype.

Isso é um compromisso interessante da arquitetura. O qtype tem liberdade para ser complexo, mas o consumidor ainda consegue perguntar se a resposta está completa, corrigida ou precisa de avaliação manual.

## Behaviour

Behaviour define como o estudante interage com a questão durante a tentativa. `deferredfeedback`, `immediatefeedback`, `interactive`, behaviours adaptativos e variantes com certeza baseada em confiança são exemplos.

O qtype responde o que é a questão. O behaviour responde como essa questão evolui durante a interação.

## `qbehaviour`

Question behaviours também são plugins, do tipo `qbehaviour`, instalados em `question/behaviour`.

Criar um behaviour customizado faz sentido quando você deseja alterar o ciclo de interação de várias questões, não quando quer apenas um novo formato de resposta. Um novo tipo de pergunta é `qtype`; uma nova forma de tentar perguntas é `qbehaviour`.

## Deferred feedback

Em deferred feedback o aluno responde as questões e a correção principal acontece quando o attempt é finalizado. Esse modelo se aproxima de uma prova tradicional.

O step pode registrar a resposta durante a tentativa sem necessariamente produzir o feedback completo naquele instante.

## Immediate feedback

Immediate feedback permite verificar a questão durante a tentativa e receber feedback imediatamente, conforme a configuração do Quiz e o qtype.

Isso muda a sequência de steps e o estado da questão, mas não exige que o qtype seja reescrito especificamente para o Quiz.

## Interactive with multiple tries

No interactive behaviour o aluno pode tentar novamente depois de uma resposta incorreta, usando hints e aplicando penalties conforme a questão.

Esse é um bom cenário para estudar steps, porque uma mesma questão pode passar por várias respostas e fractions antes do estado final.

## Penalty

`question.penalty` normalmente representa a penalidade padrão usada em behaviours com múltiplas tentativas. Ela não significa automaticamente que toda tentativa errada perde aquela quantidade em qualquer behaviour.

O behaviour interpreta a penalidade dentro do seu próprio fluxo.

## Display options

`question_display_options` controla quais partes podem ser mostradas na renderização, como correctness, marks, feedback, right answer e histórico.

No Quiz essas opções são calculadas a partir da configuração de revisão e do momento da tentativa. Assim, o mesmo `question_attempt` pode ser renderizado de maneiras diferentes durante a tentativa, imediatamente após e depois do fechamento.

## Renderização da questão

O `core_question_renderer` combina layout geral do Question Engine com renderer do qtype e do behaviour. Esse é um dos casos em que a arquitetura de renderer continua central e não deve ser substituída por um template isolado criado pelo consumidor.

Se você cria um qtype, precisa respeitar esse pipeline para que review, behaviours, feedback e accessibility funcionem de forma consistente.

## Criando um QUBA programaticamente

Um fluxo simplificado para utilizar uma questão fora do Quiz pode começar assim:

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context
);

$quba->set_preferred_behaviour('deferredfeedback');

$question = question_bank::load_question($questionid);
$slot = $quba->add_question($question, 1.0);
$quba->start_question($slot);

question_engine::save_questions_usage_by_activity($quba);
```

A partir daí seu componente guarda o ID do QUBA para carregar novamente depois.

## Não grave `question_usages` diretamente

Apesar de o schema ser conhecido, não insira manualmente em `question_usages`, `question_attempts` ou steps. O Question Engine possui um unit of work e um data mapper que coordenam persistência.

Se você escreve direto nas tabelas, perde inicialização de behaviours, summaries, metadata e consistência entre steps.

## Processando respostas

O QUBA oferece métodos para processar ações submetidas e atualizar as questões. O formato exato depende de como seu componente coleta e encaminha os dados, mas a ideia é deixar o engine interpretar os nomes de campos e behaviours.

Não tente corrigir manualmente a resposta lendo `$_POST['answer']` e comparando com `question_answers` se você está usando o Question Engine. Isso ignora qtypes complexos, multiple tries, files e behaviours.

## Salvando após alterações

Depois de processar ações, salve o usage usando `question_engine::save_questions_usage_by_activity($quba)`. O engine conhece quais partes mudaram e persiste attempts, steps e step data de forma coordenada.

Pular essa etapa deixa o objeto em memória correto e o banco desatualizado, um tipo de bug especialmente difícil quando a página parece funcionar até o próximo request.

## Criando questões programaticamente

Criar questão por código é diferente de inserir uma linha em `{question}`. No Moodle 3.5, o fluxo precisa tratar os dados comuns da questão, opções do qtype, respostas, hints e arquivos conforme o contrato daquele tipo.

A base `question_type::save_question()` já coordena grande parte disso e deve ser utilizada sempre que possível.

## Preparando os dados de formulário

`save_question()` foi desenhado para receber dados no formato esperado pelo formulário de edição, por isso a criação programática costuma montar um objeto semelhante ao resultado do form.

Um exemplo conceitual de verdadeiro/falso poderia conter nome, categoria, questiontext, generalfeedback, defaultmark, penalty e campos específicos do qtype.

O detalhe importante é conferir o qtype real que está sendo criado, porque cada um exige opções adicionais diferentes.

## Categoria no formato esperado

Historicamente o formulário envia categoria em formato que pode incluir categoria e contexto separados por vírgula. O `save_question()` da base extrai a categoria e resolve o contexto.

Isso mostra por que copiar um objeto incompleto de um exemplo antigo pode falhar em uma branch nova. Antes de automatizar criação em massa, examine a classe de edição do qtype escolhido e os testes do core.

## `question_bank::get_qtype()`

Para trabalhar com o handler do qtype:

```php
$qtype = question_bank::get_qtype('truefalse');
```

A partir daí você pode utilizar os contratos de persistência do tipo. Mas lembre que `save_question()` espera uma estrutura coerente com aquele qtype e com o formulário de edição do Moodle 3.5.

## Exemplo conceitual de criação

Um fluxo reduzido pode ficar assim:

```php
$qtype = question_bank::get_qtype('truefalse');

$question = new stdClass();
$question->qtype = 'truefalse';

$form = new stdClass();
$form->category = $categoryid . ',' . $contextid;
$form->name = 'Questão criada por código';
$form->questiontext = [
    'text' => 'O Moodle possui Question Engine independente do Quiz?',
    'format' => FORMAT_HTML,
];
$form->generalfeedback = [
    'text' => 'O Question Engine pode ser utilizado por outros componentes.',
    'format' => FORMAT_HTML,
];
$form->defaultmark = 1;
$form->penalty = 1;
$form->correctanswer = 1;
$form->feedbacktrue = ['text' => '', 'format' => FORMAT_HTML];
$form->feedbackfalse = ['text' => '', 'format' => FORMAT_HTML];

$saved = $qtype->save_question($question, $form);
```

Esse exemplo precisa ser adaptado ao qtype utilizado, mas a ideia principal é chamar a API do tipo em vez de inserir manualmente registros em `{question}`, tabelas de opções, respostas e hints.

## Criar em massa exige transação e estratégia

Se você precisa gerar milhares de questões, não coloque tudo em uma requisição web e não faça uma transação gigantesca envolvendo o lote inteiro. Use Task, processe em lotes e deixe cada questão ser salva pelo contrato do qtype.

Também trate duplicidade. Como `{question}` no Moodle 3.5 não oferece um identificador externo próprio para esse caso, mantenha em uma tabela do seu plugin a chave do sistema de origem associada ao `question.id` criado no Moodle.

## Atualizando questões programaticamente

Para atualizar uma questão, use o mesmo fluxo de edição e as APIs do qtype utilizadas pelo Moodle 3.5. Não faça `UPDATE question SET questiontext = ...` apenas porque a mudança parece pequena, pois opções, respostas, hints, arquivos e dados específicos do tipo também podem precisar ser atualizados de forma coordenada.

## Quiz slots

A tabela `quiz_slots` representa posições na estrutura do Quiz. No Moodle 3.5, cada slot possui `quizid`, número do slot, página, `questionid`, `maxmark` e `requireprevious`; para questões aleatórias também aparecem `questioncategoryid` e `includingsubcategories`.

O slot responde qual questão ocupa aquela posição, onde ela aparece e quanto vale naquele Quiz. Para uma questão fixa, `quiz_slots.questionid` aponta diretamente para `{question}.id`.

## Slot não é question attempt

Um `quiz_slot` existe na definição do Quiz antes de qualquer aluno iniciar. Um `question_attempt.slot` existe dentro de um QUBA de uma tentativa concreta.

Eles compartilham a ideia de posição, mas são tabelas e ciclos diferentes. O Quiz utiliza seus slots para montar o QUBA quando uma nova tentativa começa.

## Páginas do Quiz

`quiz_slots.page` define em qual página cada slot aparece. `quiz_sections` permite criar seções com heading e shuffle próprio.

Editar layout não é simplesmente mudar uma string. As APIs do Quiz mantêm sequência, page breaks e slots coerentes.

## Questões fixas no Quiz

Quando o professor adiciona uma questão específica no Moodle 3.5, o vínculo é direto: `quiz_slots.questionid` referencia a linha correspondente em `{question}`. Não existe a camada posterior de referências e versões do banco de questões.

## Questões aleatórias no Quiz

No Moodle 3.5, uma questão aleatória é representada pelo próprio `qtype_random`. O Quiz mantém um slot ligado à questão aleatória e registra também a categoria de origem e se subcategorias devem ser consideradas. Ao iniciar a tentativa, o Question Engine seleciona uma questão concreta compatível com esses critérios.

Depois que a tentativa existe, `question_attempts.questionid` registra qual questão concreta foi realmente escolhida.

## Filtros de questões aleatórias

No Moodle 3.5, a seleção aleatória é construída a partir da configuração da questão aleatória, principalmente categoria e inclusão de subcategorias, com suporte do próprio `qtype_random`. Não replique essa seleção com SQL próprio, porque o qtype também precisa excluir tipos incompatíveis e questões já usadas na tentativa.

Use as APIs de estrutura do Quiz e filtros suportados pelo core.

## Tentativas de Quiz

`quiz_attempts` guarda o estado da tentativa da atividade. Campos importantes incluem `quiz`, `userid`, número da tentativa, `uniqueid`, state, timestamps, página atual e `sumgrades`.

O `uniqueid` é especialmente importante porque referencia `question_usages.id`. É a ponte entre o mundo do Quiz e o Question Engine.

## `quiz_attempt`

No código, a classe `quiz_attempt` encapsula uma tentativa e fornece APIs para navegação, questions, review, timing, states e acesso ao QUBA.

Se você precisa ler uma tentativa detalhadamente, prefira essa classe e seus métodos antes de fazer joins manuais em dez tabelas.

## Carregando uma tentativa

Dependendo do ponto do código, você pode carregar uma tentativa pelo helper do Quiz e obter um objeto `quiz_attempt`.

O objeto conhece course, quiz, course module, attempt record e question usage, reduzindo a chance de combinar dados de tentativas diferentes.

## Estados da tentativa de Quiz

A tentativa pode estar `inprogress`, `overdue`, `finished` ou `abandoned`. Esse state pertence à tentativa do Quiz e não deve ser confundido com os states das questões individuais.

Uma tentativa pode estar `inprogress` enquanto algumas questões já estão graded e outras ainda estão todo.

## `sumgrades`

`quiz_attempts.sumgrades` é a soma das marks obtidas nos slots daquela tentativa antes da escala para a nota final do Quiz.

A nota final no gradebook pode passar pelo método de agregação entre tentativas e pela escala definida em `quiz.grade`.

Não altere `sumgrades` manualmente sem entender regrade e engine, porque ele é consequência do estado das questões.

## Regrade

Quando uma questão é alterada ou uma regra de correção muda, o Quiz pode regradear tentativas. O Question Engine recria ou atualiza steps de grading preservando histórico necessário.

Esse é outro motivo para não tratar steps como registros simples que podem ser apagados e recriados livremente.

## Lendo uma tentativa detalhadamente

Para investigar uma tentativa, eu começaria no `quiz_attempt`, depois acessaria o QUBA e percorreria slots.

Conceitualmente:

```php
$attemptobj = quiz_attempt::create($attemptid);
$quba = $attemptobj->get_question_usage();

foreach ($quba->get_slots() as $slot) {
    $qa = $quba->get_question_attempt($slot);

    $state = $qa->get_state();
    $mark = $qa->get_mark();
    $response = $qa->get_response_summary();
}
```

Os nomes exatos disponíveis dependem da classe e da branch, portanto confira a API da versão suportada, mas o caminho conceitual é este.

## Lendo steps

Quando o problema é "o aluno respondeu X, depois mudou para Y e o sistema calculou Z", precisamos descer para os steps.

```php
foreach ($qa->get_step_iterator() as $step) {
    $state = $step->get_state();
    $fraction = $step->get_fraction();
    $time = $step->get_timecreated();
    $userid = $step->get_user_id();
}
```

Depois você pode inspecionar os dados do step pela API apropriada.

## Não comece por `question_attempt_step_data`

Quando alguém recebe um chamado dizendo que uma resposta está errada, a primeira reação costuma ser abrir a tabela de step data e procurar o valor. Isso ajuda no diagnóstico, mas não deve ser a API de negócio do plugin.

Os nomes dos campos dependem do qtype e do behaviour, então usar essa tabela diretamente cria acoplamento com detalhes internos.

## Responses report e summaries

Para relatórios simples, `responsesummary` e APIs de reporting podem ser mais adequados do que reconstruir o form data de cada step.

Se você precisa mostrar exatamente o que o aluno enviou em um qtype específico, aí talvez seja necessário trabalhar com o question attempt e o qtype, mas mantenha essa complexidade encapsulada.

## Question behaviours e relatórios

Behaviours com múltiplas tentativas geram histórias diferentes. Um report que olha apenas o último step pode perder tentativas intermediárias, penalties e feedbacks.

Antes de criar analytics, defina se quer a resposta final, a primeira resposta, todas as tries ou o percurso completo.

## Question Bank e Quiz têm responsabilidades diferentes

O Question Bank armazena e organiza questões, enquanto o Quiz define slots, páginas, tentativas, comportamento e peso dessas questões dentro de uma atividade. No Moodle 3.5, `{question}` é a entidade central da definição da questão e os dados específicos ficam nas tabelas dos respectivos `qtype`.
## Backup de questões

Backup de questões é especialmente delicado porque questões podem ser compartilhadas entre atividades e contextos. O backup precisa transportar definições, categorias, references e attempts sem criar cópias desnecessárias.

Backup e Restore vai aprofundar backup, mas aqui é importante saber que qtypes possuem responsabilidades específicas no restore.

## Restore e duplicação de questões

Durante o restore, o Moodle precisa reconstruir categorias e questões sem confiar nos IDs da instalação de origem. Um `qtype` que possui tabelas próprias deve fornecer corretamente sua estrutura de backup e restore, pois dados incompletos nessa etapa podem produzir questões quebradas ou duplicadas.

Se um qtype customizado não participa adequadamente desse matching, duplicar quizzes pode encher o Question Bank de cópias desnecessárias.

## `restore_qtype_*_plugin`

Qtypes que possuem dados próprios precisam revisar sua classe de restore e garantir que os dados relevantes entram no hash e no processo de restauração.

Um tipo que usa somente tabelas padrão pode precisar de pouca customização, mas um qtype com tabelas extras não pode presumir que o core conhecerá automaticamente todas as suas colunas.

## Question formats

`qformat` define formatos de importação e exportação de questões. Moodle XML, GIFT e outros formatos vivem nessa camada.

Se seu objetivo é importar questões de um formato acadêmico próprio, não crie qtype apenas por causa do arquivo. O qtype representa a questão; o qformat representa como definições entram ou saem do Question Bank.

## Criando um qtype simples

Vamos imaginar `qtype_exactphrase`, uma questão que aceita uma frase exata depois de normalização simples. Ela não é pedagogicamente revolucionária, mas é suficiente para estudar a estrutura.

O professor define a resposta correta, o aluno digita texto e o engine atribui fraction 1 ou 0.

## Tabela do qtype

Se precisamos de uma configuração extra específica, criamos tabela própria:

```
qtype_exactphrase_options
    id
    questionid
    correctphrase
    casesensitive
```

`questionid` referencia a definição concreta da questão. Em qtypes que utilizam `question_answers`, talvez nem seja necessário criar uma tabela para resposta principal, dependendo do desenho.

## `question_type`

A classe de `questiontype.php` pode declarar `extra_question_fields()` para permitir que a base carregue e salve opções específicas automaticamente.

```
class qtype_exactphrase extends question_type {
    public function extra_question_fields() {
        return [
            'qtype_exactphrase_options',
            'correctphrase',
            'casesensitive',
        ];
    }
}
```

Isso evita código repetitivo de persistência para opções simples.

## Definition da questão

Em `question.php` podemos ter:

```php
class qtype_exactphrase_question extends question_graded_automatically {
    public $correctphrase;
    public $casesensitive;

    public function get_expected_data() {
        return [
            'answer' => PARAM_RAW_TRIMMED,
        ];
    }

    public function is_complete_response(array $response) {
        return array_key_exists('answer', $response) && $response['answer'] !== '';
    }
}
```

Depois entram métodos de comparação e grading.

## `grade_response()`

Um qtype automaticamente corrigível devolve fraction e state compatíveis com a resposta.

```php
public function grade_response(array $response) {
    $given = $response['answer'] ?? '';
    $expected = $this->correctphrase;

    if (!$this->casesensitive) {
        $given = core_text::strtolower($given);
        $expected = core_text::strtolower($expected);
    }

    if ($given === $expected) {
        return [1.0, question_state::$gradedright];
    }

    return [0.0, question_state::$gradedwrong];
}
```

A fraction continua relativa; o `maxmark` do attempt decide o peso real.

## Renderer do qtype

O renderer precisa mostrar o controle de resposta respeitando o Question Engine e display options. Ele recebe question attempt, options e componentes preparados pelo engine.

Não crie um `<form>` completamente separado que ignora os nomes de campos esperados pelo attempt, porque o engine depende desses nomes para reconstruir responses e steps.

## Accessibility no qtype

Um novo qtype precisa ser utilizável por teclado, possuir labels corretos e comunicar feedback e estados de forma acessível. Questions são componentes interativos e erros aqui afetam diretamente a capacidade do aluno responder.

Não use apenas cor para indicar correto e incorreto e não esconda label porque visualmente o campo parece óbvio.

## Testes do qtype

Teste `get_expected_data()`, completude, grading, summary, save/load e backup/restore quando houver dados próprios.

Também teste o qtype com behaviours diferentes suportados, porque uma questão que funciona em deferred feedback pode expor bugs em interactive multiple tries.

## Criando questões por código para importações institucionais

Um caso real é converter um banco de questões externo para Moodle. Não faça um script SQL que insere em cinco tabelas, porque cada qtype possui opções próprias e o fluxo padrão também precisa cuidar de respostas, hints e arquivos.

Crie um importador que resolve categoria, mapeia qtype, monta os dados no formato do form e chama a API do qtype. Para milhares de questões, processe em Task com checkpoints.

## Mapeamento externo

Quando precisar relacionar questões com um sistema externo, mantenha esse identificador em uma tabela própria do seu plugin, associando-o ao `question.id`. Não reutilize campos semânticos do core para guardar chaves externas apenas porque parecem convenientes.

Esse detalhe simplifica sincronização e evita depender de IDs internos que não sobrevivem a restore ou migração.

## Segurança

Criar, editar e usar questões exige capabilities específicas no contexto correto. Não aceite `questionid` vindo do usuário e carregue a questão sem verificar a categoria, o contexto e as capabilities que autorizam o acesso àquela questão.

Em tentativas, o acesso ao Quiz e à tentativa precisa ser validado antes de expor respostas, right answers ou feedback que review options escondem do aluno.

## Performance

Question Engine pode gerar grandes volumes de dados. Cada tentativa pode ter dezenas de question attempts, cada uma com vários steps e step data. Relatórios que fazem uma consulta por step ou carregam QUBAs completos para milhares de tentativas podem ficar extremamente caros.

Use APIs de reporting quando existirem, faça consultas em lote quando o objetivo é análise agregada e só carregue a tentativa completa quando precisa realmente reconstruir seu estado.

## N+1 em relatórios de tentativas

Um erro clássico é buscar cem `quiz_attempts` e para cada um carregar o QUBA completo individualmente. Dependendo do relatório, isso explode em centenas ou milhares de queries.

Se o objetivo é apenas estado, nota e timestamps, obtenha os campos diretamente das tabelas do Quiz. Se precisa de respostas detalhadas, procure métodos do data mapper voltados a reporting ou desenhe consulta em lote com cuidado.

## Não altere steps para corrigir nota manualmente

Se uma correção está errada, não execute `UPDATE question_attempt_steps SET fraction = ...`. Isso deixa state, summaries, behaviours e regrade inconsistentes.

Use os mecanismos de regrade ou grading manual do Quiz e do Question Engine conforme o qtype.

## Questões que exigem correção manual

Nem todo qtype consegue calcular fraction automaticamente. Essay é o exemplo clássico. Nesses casos o state pode indicar `needsgrading` até um avaliador informar a nota.

O Question Engine continua registrando responses e steps, enquanto o Quiz controla a interface de grading e atualização da tentativa.

## Manual grading não é `grade_grades`

A nota de uma questão dissertativa é primeiro parte do question attempt. Depois o Quiz recalcula `sumgrades` e a nota geral chega ao Gradebook.

Editar o Gradebook diretamente não equivale a corrigir a questão, porque são camadas diferentes da cadeia de avaliação.

## Flags

O aluno pode marcar uma questão com flag durante a tentativa. O estado `flagged` fica no question attempt e é independente de correctness ou grading.

Esse pequeno recurso mostra novamente por que o Question Engine precisa de uma estrutura própria em vez de uma simples tabela resposta/nota.

## Questions summary versus source question

Depois de uma tentativa, `questionsummary` ajuda a preservar informação sobre o que foi apresentado, inclusive em questões randomizadas. Não use esse campo como fonte para recriar a questão original ou editar o banco.

Ele é um resumo de reporting, não o modelo de autoria.

## Projeto - criar questões por código

No primeiro exercício, crie uma ferramenta CLI que recebe uma categoria e gera dez questões `truefalse` pela API do qtype. Cada questão deve ter feedback geral e nome identificável.

Mantenha uma tabela de mapeamento no seu plugin com um identificador externo único e o `question.id` correspondente. Rode o script duas vezes e faça a segunda execução reconhecer as questões já importadas em vez de duplicá-las.

Depois abra o Question Bank e confirme visualmente a categoria, os nomes, textos, respostas e feedbacks criados.

## Projeto - ler detalhadamente uma tentativa

Escolha uma tentativa de Quiz e produza um relatório técnico por slot contendo número do slot, questionid concreto, qtype, behaviour, state atual, mark, maxmark, response summary e todos os steps com timestamp, userid, state e fraction.

A regra do exercício é usar `quiz_attempt`, QUBA e Question Engine sempre que possível, deixando SQL direto apenas para diagnóstico complementar.

Compare uma questão deferred feedback com uma interactive para perceber como a sequência de steps muda.

## Projeto - criar um qtype simples

Implemente `qtype_exactphrase` com formulário de edição, persistência da frase correta, opção case-sensitive, definition class, renderer, grading automático, response summary, feedback e testes.

Depois crie duas questões do tipo, coloque em um Quiz e teste deferred feedback e interactive. Faça backup do curso, restaure em outro ambiente e confirme que as questões não são duplicadas incorretamente no banco.

Por fim, conclua uma tentativa, edite a questão pelo fluxo normal do Moodle e confirme que a tentativa anterior continua legível e coerente na revisão. O objetivo é observar o comportamento real do Moodle 3.5 sem manipular diretamente as tabelas do Question Engine.

## O que precisa ficar deste capítulo

Question Bank, Question Engine e Quiz são camadas diferentes que cooperam. No Moodle 3.5, o Question Bank organiza questões e categorias; o Question Engine executa definições, behaviours, attempts, steps e states; o Quiz organiza slots, tentativas, páginas, regras de acesso, revisão e nota global.

No Moodle 3.5, `{question}` continua sendo a tabela central do banco de questões, os `qtype` guardam os dados específicos de cada tipo e as questões aleatórias são implementadas pelo `qtype_random`. O ponto principal é respeitar o Question Engine e suas APIs em vez de gravar diretamente tabelas de tentativas e steps.

Se você guardar uma regra prática, guarde esta: para criar ou alterar questões, use as APIs do Question Bank e do qtype; para executar questões, use Question Engine; para manipular Quiz, use as APIs do `mod_quiz`. SQL direto é excelente para diagnóstico e relatórios específicos, mas é uma péssima ferramenta para substituir os contratos que mantêm essas três camadas sincronizadas.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
