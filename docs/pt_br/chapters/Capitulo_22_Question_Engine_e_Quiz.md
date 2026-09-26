{% raw %}

# 22 QUESTION ENGINE E QUIZ

Quiz e Question Engine vivem tão próximos no Moodle que é fácil tratar os dois como se fossem a mesma coisa. O professor cria um Quiz, adiciona questões, o aluno responde e depois aparece uma nota, então visualmente parece existir apenas uma atividade chamada Questionário. No código, porém, a separação é muito mais importante, porque o Quiz é uma atividade que organiza tentativas, tempo, páginas, revisão, notas e regras de acesso, enquanto o Question Engine é um subsistema genérico que sabe executar questões, registrar cada interação, calcular frações, controlar estados e trabalhar com diferentes behaviours sem depender de `mod_quiz`.

Essa distinção explica muita coisa que inicialmente parece estranha. A tabela `quiz_attempts` não guarda as respostas das questões, porque as respostas ficam no Question Engine. O campo `uniqueid` da tentativa aponta para `question_usages`, e a partir daí aparecem `question_attempts`, `question_attempt_steps` e `question_attempt_step_data`. Também explica por que uma questão pode ser usada fora do Quiz, por exemplo em preview, em filtros que incorporam questões ou em outro plugin que cria um `question_usage_by_activity` próprio.

Neste capítulo vamos desmontar essa arquitetura camada por camada, começando pelo Question Bank e chegando até uma tentativa real de Quiz. No caminho vamos trabalhar com categorias, versões, referências, `qtype`, behaviours, states, fractions, feedback, hints, slots, questões aleatórias e criação programática. O objetivo não é decorar tabelas, mas conseguir olhar uma tentativa complexa e entender exatamente onde cada parte do estado está armazenada e qual API deve ser utilizada para alterá-la.

## 22.1 Quiz e Question Engine não são a mesma coisa

O `mod_quiz` é um activity module. Ele possui tabela principal, course module, formulário de configuração, gradebook, completion, calendário, regras de acesso, tentativas e relatórios. O Question Engine pertence ao subsistema `core_question` e pode ser utilizado por qualquer componente que precise executar questões interativas.

Pense no Quiz como o coordenador da experiência e no Question Engine como o motor que executa cada questão. O Quiz decide que existe uma tentativa de 30 minutos, que as questões aparecem em determinadas páginas e que o aluno só pode revisar o feedback depois do fechamento. O Question Engine decide como uma questão de múltipla escolha recebe uma resposta, como um behaviour imediato reage ao botão "Verificar", qual estado a questão assume e qual fraction foi obtida naquele passo.

Misturar essas responsabilidades costuma produzir código frágil. Se um plugin precisa apenas criar e executar questões, talvez ele não precise de `mod_quiz`; se precisa manipular um Quiz existente, então precisa entender tanto a atividade quanto o engine que está por baixo.

## 22.2 Question Bank

![Banco de questões do curso](image/cap22-banco-de-questoes-do-curso.png)

O Question Bank é a camada em que professores criam, organizam, editam e gerenciam questões reutilizáveis. A partir do Moodle 4.0 ele deixou de ser apenas uma interface sobre a tabela `question` e ganhou uma arquitetura explícita de entradas, versões e plugins `qbank`.

Isso é importante porque a identidade lógica da questão e a versão concreta que será tentada não são mais exatamente a mesma coisa. Uma questão chamada "Capital do Brasil" pode possuir cinco versões ao longo do tempo, mas continuar representando a mesma entrada no banco de questões.

## 22.3 `question_categories`

Questões ficam organizadas em categorias e a tabela `question_categories` relaciona cada categoria a um contexto. Isso permite que um banco de questões pertença a determinado curso, categoria de cursos, módulo ou outro contexto suportado, conforme a arquitetura e as capabilities utilizadas.

Os campos mais importantes incluem `contextid`, `name`, `parent`, `sortorder` e `idnumber`. O `contextid` não é detalhe técnico, porque ele define a fronteira de compartilhamento e autorização da categoria.

Não crie questão programaticamente e simplesmente escolha a primeira categoria encontrada no banco. O contexto precisa corresponder ao local em que aquela questão realmente deve existir e às permissões do usuário que a gerencia.

## 22.4 A entrada lógica em `question_bank_entries`

A partir do versionamento moderno, `question_bank_entries` representa a identidade lógica da questão dentro do banco. Cada linha possui a categoria, um `idnumber` opcional, `ownerid` e controle de próxima versão.

Essa tabela responde à pergunta "qual questão é esta no banco?", enquanto `question_versions` responde "qual versão concreta desta questão estamos falando?".

Isso é uma mudança conceitual importante para código legado. Antes do Moodle 4.0 muitos plugins guardavam diretamente `question.id` como se ele fosse a identidade eterna. Hoje isso pode significar apenas uma versão específica.

## 22.5 `question_versions`

`question_versions` liga uma entrada do banco a uma linha concreta da tabela `question`. Os campos principais são `questionbankentryid`, `version`, `questionid` e `status`.

Uma nova edição relevante pode gerar uma nova versão em vez de substituir a definição anterior. Isso preserva tentativas antigas e permite que novos usos apontem para a versão desejada sem reescrever o passado.

É por isso que manipular `question` diretamente com `$DB->update_record()` é quase sempre errado em código novo. Você pode alterar uma definição que já participa de tentativas ou quebrar o encadeamento de versões que o Question Bank espera.

## 22.6 Status da versão

O campo `status` pode representar estados como `ready`, `hidden` ou `draft`. Uma versão draft não deveria aparecer como versão pública pronta para ser usada da mesma forma que uma versão finalizada.

Quando seu código escolhe "a última versão", precisa entender se quer literalmente o maior número ou a última versão não draft disponível. As APIs do Question Bank existem justamente para evitar que cada plugin invente uma consulta diferente.

## 22.7 `question_references`

`question_references` registra onde uma questão específica é utilizada. O registro guarda `usingcontextid`, `component`, `questionarea`, `itemid`, `questionbankentryid` e, opcionalmente, uma versão.

No Quiz moderno, um slot não precisa apontar diretamente para `question.id`. A referência informa qual entrada do banco está ligada àquele uso e se deve usar uma versão específica ou a última versão válida.

Essa abstração é o que permite atualizar o banco de questões sem obrigatoriamente reescrever todos os consumidores.

## 22.8 `question_set_references`

Questões aleatórias não representam uma questão específica, mas um conjunto elegível. Esse caso é representado por `question_set_references`, que guarda contexto das questões e uma condição de filtro em JSON.

O próprio core atual impede criar uma questão com `qtype = random` pelo fluxo normal de `save_question()`, porque questão aleatória deixou de ser uma questão fake e passou a ser uma referência a conjunto. Essa mudança é excelente arquiteturalmente, mas quebra vários exemplos antigos encontrados na internet.

## 22.9 Não trate questão aleatória como `qtype_random`

Código legado pode procurar por uma questão do tipo `random` na tabela `question`, mas esse modelo não representa corretamente as versões modernas. Se o objetivo é adicionar questão aleatória a um Quiz, use as APIs de estrutura do Quiz que criam uma `question_set_reference` com critérios apropriados.

Isso também melhora filtros de questões aleatórias, porque o conjunto pode ser definido por categoria, tags e outros filtros suportados pelo Question Bank.

## 22.10 A tabela `question`

A tabela `question` continua contendo a definição concreta de uma versão, com campos como `name`, `questiontext`, `questiontextformat`, `generalfeedback`, `defaultmark`, `penalty`, `qtype`, timestamps e outros dados comuns.

Mas hoje ela deve ser entendida dentro do conjunto `question_bank_entries -> question_versions -> question`. A linha isolada não conta toda a história da questão no banco.

## 22.11 Dados específicos por tipo

Cada `qtype` pode armazenar dados adicionais em tabelas próprias. Múltipla escolha possui opções e respostas específicas, enquanto tipos mais complexos podem ter estruturas completamente diferentes.

Por isso consultar apenas `{question}` não é suficiente para reconstruir qualquer questão. Use `question_bank::load_question_data()` ou `question_bank::load_question()` quando precisa da definição completa, porque o qtype participa do carregamento das opções.

## 22.12 Question Bank plugins `qbank`

Desde Moodle 4.0 o Question Bank possui plugin type próprio, `qbank`. Esses plugins podem adicionar colunas, filtros, ações, bulk actions, navegação, preview e outras funcionalidades à interface do banco.

O core do Question Bank passou a funcionar mais como um agregador dessas extensões. Para desenvolvimento moderno, isso significa que uma funcionalidade nova de interface do banco não precisa virar hack em `question/edit.php` nem alteração do `qtype`.

## 22.13 Quando criar `qbank`

Se a funcionalidade é "adicionar uma coluna mostrando uso da questão", "criar um filtro novo", "adicionar uma ação em massa" ou "mostrar uma aba extra no banco", provavelmente estamos falando de `qbank`, não de `qtype`.

`qtype` define o que uma questão é e como ela é tentada. `qbank` estende a experiência de gestão do banco.

## 22.14 `qtype`

Question type define a natureza da questão. Múltipla escolha, verdadeiro ou falso, resposta curta, numérica, ordering e tipos de terceiros como STACK ou crossword são exemplos de qtypes.

Um qtype participa tanto da criação e edição da questão quanto da execução pelo Question Engine. Isso explica por que ele possui responsabilidades em formulário, persistência, carregamento, grading, rendering, feedback, File API e backup.

## 22.15 Estrutura tradicional de um qtype

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

Ao contrário do que discutimos no Capítulo 6 para páginas comuns, qtypes ainda possuem um contrato de rendering próprio integrado ao `core_question_renderer`, então aqui `renderer.php` não é simplesmente boilerplate histórico descartável. É uma das situações em que renderer continua fazendo parte da API específica do subsistema.

## 22.16 `questiontype.php`

A classe de `questiontype.php` normalmente herda de `question_type` e responde por carregar e salvar dados persistidos, opções, respostas, hints e metadados do tipo.

O método `save_question()` da base coordena transação, entrada no banco, versão, arquivos comuns e depois delega detalhes para o qtype. Não recrie esse fluxo manualmente.

## 22.17 `edit_[qtype]_form.php`

O formulário define campos específicos de autoria da questão. Ele herda das classes de formulário de questões e integra nome, texto, nota padrão, feedback geral, hints e outros elementos comuns.

A regra continua igual à Forms API: validação visual não substitui validação server-side e campos específicos precisam usar os tipos corretos.

## 22.18 `question.php`

`question.php` define a classe de runtime que representa uma questão durante uma tentativa. Normalmente ela deriva de classes como `question_graded_automatically` ou outras bases apropriadas ao comportamento.

É aqui que entram métodos que definem resposta esperada, completude, grading, summaries e comportamento específico daquele tipo durante a tentativa.

## 22.19 Question definition

Uma `question_definition` não é apenas o registro da tabela. Ela é um objeto carregado e preparado para execução, contendo o qtype, opções, respostas e lógica necessária para participar de um attempt.

Quando você usa `question_bank::load_question($questionid)`, o core carrega dados e pede ao qtype que construa a definição correta.

## 22.20 Answers

Muitos qtypes usam a tabela `question_answers`, que guarda `answer`, `fraction` e feedback, mas isso não é universal. Alguns tipos possuem tabelas próprias ou estruturas que não cabem no modelo de respostas simples.

Não crie integração supondo que toda questão possui exatamente quatro linhas em `question_answers`.

## 22.21 Fractions

No Question Engine a correção normalmente trabalha com fraction em escala relativa. Uma resposta totalmente correta pode retornar `1.0`, parcialmente correta `0.5` e incorreta `0.0`. Alguns tipos podem permitir valores negativos ou superiores a 1 em cenários específicos, e o attempt possui `minfraction` e `maxfraction` para representar esses limites.

A nota efetiva da questão é calculada combinando fraction com `maxmark` da tentativa daquela questão.

```
fraction = 0.75
maxmark  = 2.0
mark     = 1.5
```

Essa separação permite que a mesma definição de questão valha pesos diferentes em usos distintos.

## 22.22 `defaultmark` não é o peso final do Quiz

`question.defaultmark` é a nota padrão sugerida pela questão, mas um slot do Quiz possui `maxmark`, que representa quanto aquela questão vale naquele Quiz.

Alterar `defaultmark` da questão não deveria ser confundido com alterar retroativamente o peso de todos os quizzes que já a utilizam.

## 22.23 General feedback

`generalfeedback` pertence à questão e é um feedback geral que pode ser mostrado conforme as review options do consumidor, por exemplo o Quiz.

Isso é diferente de feedback específico de uma resposta, feedback combinado por faixa de nota e feedback de comportamento.

O Question Engine sabe produzir a informação, enquanto o Quiz decide quando ela pode ser exibida.

## 22.24 Specific feedback

Em qtypes com respostas definidas, cada alternativa pode possuir feedback próprio. Depois da correção, o renderer pode apresentar o feedback correspondente à resposta escolhida, desde que `question_display_options` permita.

Essa última condição é importante. Não basta o qtype ter feedback, porque o componente consumidor pode bloquear sua visualização naquele momento.

## 22.25 Hints

Hints são dicas usadas principalmente em behaviours que permitem múltiplas tentativas dentro da mesma questão. A tabela `question_hints` guarda dicas e opções como limpar respostas erradas ou mostrar quantidade de partes corretas em tipos compatíveis.

O método `save_hints()` da base de qtype cuida inclusive de arquivos na File API, portanto gravar hints manualmente em SQL perde parte do contrato.

## 22.26 Question Engine

O Question Engine é a camada que executa questões. Ele recebe definições, behaviours, respostas submetidas e controla o estado ao longo do tempo.

Entre as classes centrais estão `question_engine`, `question_usage_by_activity`, `question_attempt`, steps, states e behaviours.

Um plugin externo ao engine normalmente deveria entrar pelas APIs de `question_engine` e pelo `question_usage_by_activity`, não pelo data mapper interno.

## 22.27 `question_engine`

`question_engine` é a fachada principal para criar, carregar e salvar usages. Métodos como `make_questions_usage_by_activity()`, `save_questions_usage_by_activity()` e `load_questions_usage_by_activity()` evitam que o consumidor precise conhecer detalhes das tabelas internas.

O próprio código do core deixa claro que o data mapper é implementação interna e não deve ser usado diretamente para inserção e atualização normais.

## 22.28 `question_usage_by_activity`

`question_usage_by_activity`, frequentemente chamado de `quba`, representa um conjunto de questões sendo utilizado por alguma atividade ou componente.

Um Quiz attempt possui um QUBA, mas um preview de questão também pode possuir outro. Cada QUBA tem contexto, componente proprietário e behaviour preferido.

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context,
);
$quba->set_preferred_behaviour('deferredfeedback');
```

Depois você adiciona questões, inicia e salva o usage.

## 22.29 A tabela `question_usages`

Cada `question_usage_by_activity` persistido corresponde a uma linha em `question_usages`. Os campos principais são `contextid`, `component` e `preferredbehaviour`.

O componente informa quem é o dono daquele uso. Em Quiz será `mod_quiz`; em outro plugin será o Frankenstyle correspondente.

## 22.30 Slot no Question Engine

Dentro de um QUBA as questões são identificadas por slots sequenciais. O engine deliberadamente não utiliza `question.id` como posição, porque a mesma questão pode aparecer mais de uma vez e porque o consumidor trabalha com uma sequência própria.

O slot é uma posição dentro daquele usage, não uma identidade global.

## 22.31 `question_attempt`

Cada questão dentro de um usage possui um `question_attempt`. A tabela `question_attempts` armazena `questionusageid`, `slot`, behaviour, `questionid`, variant, `maxmark`, fractions limite, flagged e summaries.

Esse registro representa a questão concreta que está sendo tentada naquele usage.

## 22.32 `questionid` da tentativa é a versão concreta

Em `question_attempts`, `questionid` aponta para a definição concreta em `question.id` que foi utilizada naquela tentativa. Isso preserva histórico mesmo que o banco de questões ganhe versões novas depois.

Uma tentativa antiga precisa continuar mostrando e corrigindo a questão que o aluno realmente viu, não a última versão disponível hoje.

## 22.33 Variant

Alguns qtypes podem gerar variantes, por exemplo números diferentes em uma questão calculada. O campo `variant` registra qual variante foi escolhida para aquela tentativa.

Isso é parte da reprodutibilidade. Se o aluno recebeu `x = 7`, a revisão posterior precisa reconstruir exatamente a mesma questão, não sortear outra variante.

## 22.34 Summaries

`questionsummary`, `responsesummary` e `rightanswer` armazenam representações textuais úteis para relatórios e revisão.

Eles não substituem os dados completos da questão, mas evitam que relatórios precisem entender todas as estruturas internas de todos os qtypes apenas para mostrar uma descrição humana da resposta.

## 22.35 Steps

Uma tentativa de questão não é um único estado. Cada interação relevante cria um step, armazenado em `question_attempt_steps`.

O step guarda `sequencenumber`, `state`, `fraction`, `timecreated` e `userid`. A sequência começa em zero e evolui conforme o behaviour recebe ações.

Isso permite reconstruir a história da questão, inclusive múltiplas tentativas, grading e ações intermediárias.

## 22.36 `question_attempt_step_data`

Dados específicos enviados em cada step ficam em `question_attempt_step_data` como pares `name` e `value`.

A documentação do schema registra convenções importantes: dados pertencentes ao behaviour podem começar com `-`, enquanto valores cacheados podem usar `_` ou `_-`.

Não faça parse dessas convenções por conta própria se a API do attempt já oferece acesso aos dados que você precisa.

## 22.37 States

O Question Engine possui estados como todo, complete, invalid, needs grading, graded right, partially right, wrong e outros intermediários.

O state é uma abstração comum que permite ao Quiz entender em que situação está a questão sem conhecer internamente cada qtype.

Isso é um compromisso interessante da arquitetura. O qtype tem liberdade para ser complexo, mas o consumidor ainda consegue perguntar se a resposta está completa, corrigida ou precisa de avaliação manual.

## 22.38 Behaviour

Behaviour define como o estudante interage com a questão durante a tentativa. `deferredfeedback`, `immediatefeedback`, `interactive`, behaviours adaptativos e variantes com certeza baseada em confiança são exemplos.

O qtype responde o que é a questão. O behaviour responde como essa questão evolui durante a interação.

## 22.39 `qbehaviour`

Question behaviours também são plugins, do tipo `qbehaviour`, instalados em `question/behaviour`.

Criar um behaviour customizado faz sentido quando você deseja alterar o ciclo de interação de várias questões, não quando quer apenas um novo formato de resposta. Um novo tipo de pergunta é `qtype`; uma nova forma de tentar perguntas é `qbehaviour`.

## 22.40 Deferred feedback

Em deferred feedback o aluno responde as questões e a correção principal acontece quando o attempt é finalizado. Esse modelo se aproxima de uma prova tradicional.

O step pode registrar a resposta durante a tentativa sem necessariamente produzir o feedback completo naquele instante.

## 22.41 Immediate feedback

Immediate feedback permite verificar a questão durante a tentativa e receber feedback imediatamente, conforme a configuração do Quiz e o qtype.

Isso muda a sequência de steps e o estado da questão, mas não exige que o qtype seja reescrito especificamente para o Quiz.

## 22.42 Interactive with multiple tries

No interactive behaviour o aluno pode tentar novamente depois de uma resposta incorreta, usando hints e aplicando penalties conforme a questão.

Esse é um bom cenário para estudar steps, porque uma mesma questão pode passar por várias respostas e fractions antes do estado final.

## 22.43 Penalty

`question.penalty` normalmente representa a penalidade padrão usada em behaviours com múltiplas tentativas. Ela não significa automaticamente que toda tentativa errada perde aquela quantidade em qualquer behaviour.

O behaviour interpreta a penalidade dentro do seu próprio fluxo.

## 22.44 Display options

`question_display_options` controla quais partes podem ser mostradas na renderização, como correctness, marks, feedback, right answer e histórico.

No Quiz essas opções são calculadas a partir da configuração de revisão e do momento da tentativa. Assim, o mesmo `question_attempt` pode ser renderizado de maneiras diferentes durante a tentativa, imediatamente após e depois do fechamento.

## 22.45 Renderização da questão

O `core_question_renderer` combina layout geral do Question Engine com renderer do qtype e do behaviour. Esse é um dos casos em que a arquitetura de renderer continua central e não deve ser substituída por um template isolado criado pelo consumidor.

Se você cria um qtype, precisa respeitar esse pipeline para que review, behaviours, feedback e accessibility funcionem de forma consistente.

## 22.46 Criando um QUBA programaticamente

Um fluxo simplificado para utilizar uma questão fora do Quiz pode começar assim:

```php
$quba = question_engine::make_questions_usage_by_activity(
    'mod_myactivity',
    $context,
);

$quba->set_preferred_behaviour('deferredfeedback');

$question = question_bank::load_question($questionid);
$slot = $quba->add_question($question, 1.0);
$quba->start_question($slot);

question_engine::save_questions_usage_by_activity($quba);
```

A partir daí seu componente guarda o ID do QUBA para carregar novamente depois.

## 22.47 Não grave `question_usages` diretamente

Apesar de o schema ser conhecido, não insira manualmente em `question_usages`, `question_attempts` ou steps. O Question Engine possui um unit of work e um data mapper que coordenam persistência.

Se você escreve direto nas tabelas, perde inicialização de behaviours, summaries, metadata e consistência entre steps.

## 22.48 Processando respostas

O QUBA oferece métodos para processar ações submetidas e atualizar as questões. O formato exato depende de como seu componente coleta e encaminha os dados, mas a ideia é deixar o engine interpretar os nomes de campos e behaviours.

Não tente corrigir manualmente a resposta lendo `$_POST['answer']` e comparando com `question_answers` se você está usando o Question Engine. Isso ignora qtypes complexos, multiple tries, files e behaviours.

## 22.49 Salvando após alterações

Depois de processar ações, salve o usage usando `question_engine::save_questions_usage_by_activity($quba)`. O engine conhece quais partes mudaram e persiste attempts, steps e step data de forma coordenada.

Pular essa etapa deixa o objeto em memória correto e o banco desatualizado, um tipo de bug especialmente difícil quando a página parece funcionar até o próximo request.

## 22.50 Criando questões programaticamente

Criar questão por código é diferente de inserir uma linha em `{question}`. O fluxo moderno precisa criar ou atualizar bank entry, version, dados comuns, opções do qtype, respostas, hints e arquivos.

A base `question_type::save_question()` já coordena grande parte disso e deve ser utilizada sempre que possível.

## 22.51 Preparando os dados de formulário

`save_question()` foi desenhado para receber dados no formato esperado pelo formulário de edição, por isso a criação programática costuma montar um objeto semelhante ao resultado do form.

Um exemplo conceitual de verdadeiro/falso poderia conter nome, categoria, questiontext, generalfeedback, defaultmark, penalty e campos específicos do qtype.

O detalhe importante é conferir o qtype real que está sendo criado, porque cada um exige opções adicionais diferentes.

## 22.52 Categoria no formato esperado

Historicamente o formulário envia categoria em formato que pode incluir categoria e contexto separados por vírgula. O `save_question()` da base extrai a categoria e resolve o contexto.

Isso mostra por que copiar um objeto incompleto de um exemplo antigo pode falhar em uma branch nova. Antes de automatizar criação em massa, examine a classe de edição do qtype escolhido e os testes do core.

## 22.53 Nova questão versus nova versão

Se não existe questão anterior, o fluxo cria uma nova entrada do banco e versão 1. Quando você edita uma questão versionada, a API pode criar uma nova versão ligada à mesma bank entry.

Não tente simular nova versão copiando a linha da tabela `question` e incrementando um número manualmente.

## 22.54 `question_bank::get_qtype()`

Para trabalhar com o handler do qtype:

```php
$qtype = question_bank::get_qtype('truefalse');
```

A partir daí você pode utilizar contratos de persistência do tipo. Mas lembre que `save_question()` espera uma estrutura coerente com aquele qtype e com o Question Bank atual.

## 22.55 Exemplo conceitual de criação

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

Esse exemplo precisa ser adaptado à branch e ao qtype utilizados, mas a ideia principal é chamar a API do tipo em vez de construir manualmente bank entry, version e options.

## 22.56 Criar em massa exige transação e estratégia

Se você precisa gerar milhares de questões, não coloque tudo em uma requisição web e não faça uma transação gigantesca envolvendo o lote inteiro. Use Task, processe em lotes e deixe cada questão ser salva pelo contrato do qtype.

Também trate duplicidade. `idnumber` da bank entry pode ser útil para mapear questões vindas de sistema externo sem depender de `question.id`.

## 22.57 Atualizando questões programaticamente

Atualização moderna precisa respeitar versionamento. Se a alteração deve produzir uma nova versão, use o mesmo fluxo de edição que o Question Bank utiliza, mantendo a relação com a bank entry.

Não atualize `questiontext` por SQL apenas porque a mudança parece pequena. Uma tentativa antiga pode depender da definição anterior e um Quiz pode estar configurado para usar versão específica.

## 22.58 Quiz slots

A tabela `quiz_slots` representa posições na estrutura do Quiz. Cada slot possui `quizid`, número do slot, página, `maxmark`, `requireprevious` e informações adicionais como grade item quando o Quiz usa subgrades.

O slot responde onde a questão aparece e quanto vale naquele Quiz. A identidade da questão é resolvida pelas referências do Question Bank.

## 22.59 Slot não é question attempt

Um `quiz_slot` existe na definição do Quiz antes de qualquer aluno iniciar. Um `question_attempt.slot` existe dentro de um QUBA de uma tentativa concreta.

Eles compartilham a ideia de posição, mas são tabelas e ciclos diferentes. O Quiz utiliza seus slots para montar o QUBA quando uma nova tentativa começa.

## 22.60 Páginas do Quiz

`quiz_slots.page` define em qual página cada slot aparece. `quiz_sections` permite criar seções com heading e shuffle próprio.

Editar layout não é simplesmente mudar uma string. APIs do Quiz mantêm sequência, page breaks, slots e referências coerentes.

## 22.61 Questões fixas no Quiz

Quando o professor adiciona uma questão específica, o slot fica associado a uma `question_reference`. Dependendo da configuração, a referência pode usar uma versão fixa ou acompanhar a última versão não draft.

Isso é muito mais rico do que a antiga ideia de gravar apenas `questionid` no slot.

## 22.62 Questões aleatórias no Quiz

Um slot aleatório usa `question_set_references`, que representa um conjunto definido por filtros. Na criação da tentativa, o Quiz resolve esse conjunto e escolhe uma questão concreta.

Depois que a tentativa existe, o Question Engine registra em `question_attempt.questionid` qual versão concreta foi realmente escolhida.

## 22.63 Filtros de questões aleatórias

O conjunto pode usar critérios como categoria e tags, e o Question Bank moderno também possui sistema extensível de filtros. Isso significa que random questions não deveriam depender de consultas SQL próprias copiadas de versões antigas.

Use as APIs de estrutura do Quiz e filtros suportados pelo core.

## 22.64 Tentativas de Quiz

`quiz_attempts` guarda o estado da tentativa da atividade. Campos importantes incluem `quiz`, `userid`, número da tentativa, `uniqueid`, state, timestamps, página atual e `sumgrades`.

O `uniqueid` é especialmente importante porque referencia `question_usages.id`. É a ponte entre o mundo do Quiz e o Question Engine.

## 22.65 `quiz_attempt`

No código, a classe `quiz_attempt` encapsula uma tentativa e fornece APIs para navegação, questions, review, timing, states e acesso ao QUBA.

Se você precisa ler uma tentativa detalhadamente, prefira essa classe e seus métodos antes de fazer joins manuais em dez tabelas.

## 22.66 Carregando uma tentativa

Dependendo do ponto do código, você pode carregar uma tentativa pelo helper do Quiz e obter um objeto `quiz_attempt`.

O objeto conhece course, quiz, course module, attempt record e question usage, reduzindo a chance de combinar dados de tentativas diferentes.

## 22.67 Estados da tentativa de Quiz

A tentativa pode estar `inprogress`, `overdue`, `finished` ou `abandoned`. Esse state pertence à tentativa do Quiz e não deve ser confundido com os states das questões individuais.

Uma tentativa pode estar `inprogress` enquanto algumas questões já estão graded e outras ainda estão todo.

## 22.68 `sumgrades`

`quiz_attempts.sumgrades` é a soma das marks obtidas nos slots daquela tentativa antes da escala para a nota final do Quiz.

A nota final no gradebook pode passar pelo método de agregação entre tentativas e pela escala definida em `quiz.grade`.

Não altere `sumgrades` manualmente sem entender regrade e engine, porque ele é consequência do estado das questões.

## 22.69 Regrade

Quando uma questão é alterada ou uma regra de correção muda, o Quiz pode regradear tentativas. O Question Engine recria ou atualiza steps de grading preservando histórico necessário.

Esse é outro motivo para não tratar steps como registros simples que podem ser apagados e recriados livremente.

## 22.70 Lendo uma tentativa detalhadamente

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

## 22.71 Lendo steps

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

## 22.72 Não comece por `question_attempt_step_data`

Quando alguém recebe um chamado dizendo que uma resposta está errada, a primeira reação costuma ser abrir a tabela de step data e procurar o valor. Isso ajuda no diagnóstico, mas não deve ser a API de negócio do plugin.

Os nomes dos campos dependem do qtype e do behaviour, então usar essa tabela diretamente cria acoplamento com detalhes internos.

## 22.73 Responses report e summaries

Para relatórios simples, `responsesummary` e APIs de reporting podem ser mais adequados do que reconstruir o form data de cada step.

Se você precisa mostrar exatamente o que o aluno enviou em um qtype específico, aí talvez seja necessário trabalhar com o question attempt e o qtype, mas mantenha essa complexidade encapsulada.

## 22.74 Question behaviours e relatórios

Behaviours com múltiplas tentativas geram histórias diferentes. Um report que olha apenas o último step pode perder tentativas intermediárias, penalties e feedbacks.

Antes de criar analytics, defina se quer a resposta final, a primeira resposta, todas as tries ou o percurso completo.

## 22.75 Question Bank e Quiz são versionáveis em ritmos diferentes

Uma bank entry pode ganhar nova versão enquanto o Quiz continua apontando para uma versão específica. Outro Quiz pode acompanhar a latest version.

Portanto, "qual é a questão deste Quiz?" não é respondido corretamente apenas consultando `question_versions` e pegando a maior versão.

Primeiro leia a referência do slot.

## 22.76 Backup de questões

Backup de questões é especialmente delicado porque questões podem ser compartilhadas entre atividades e contextos. O backup precisa transportar definições, categorias, references e attempts sem criar cópias desnecessárias.

O Capítulo 24 vai aprofundar backup, mas aqui é importante saber que qtypes possuem responsabilidades específicas no restore.

## 22.77 Restore e duplicação de questões

Desde Moodle 4.4.6 houve melhorias importantes no matching de questões durante restore para reduzir duplicação de questões compartilhadas. O mecanismo calcula hashes e qtypes precisam fornecer corretamente seus dados customizados para que duas questões iguais sejam reconhecidas como iguais.

Se um qtype customizado não participa adequadamente desse matching, duplicar quizzes pode encher o Question Bank de cópias desnecessárias.

## 22.78 `restore_qtype_*_plugin`

Qtypes que possuem dados próprios precisam revisar sua classe de restore e garantir que os dados relevantes entram no hash e no processo de restauração.

Um tipo que usa somente tabelas padrão pode precisar de pouca customização, mas um qtype com tabelas extras não pode presumir que o core conhecerá automaticamente todas as suas colunas.

## 22.79 Quiz subplugins

Como vimos no Capítulo 20, o Quiz possui subplugins como `quiz` reports e `quizaccess`. Eles estendem o Quiz, não o Question Engine.

Um relatório de tentativas é `quiz` subplugin. Uma regra de acesso é `quizaccess`. Um novo tipo de questão é `qtype`. Uma nova forma de interação é `qbehaviour`. Uma coluna no banco de questões é `qbank`.

Escolher o tipo certo evita colocar tudo dentro de `mod_quiz` ou de um plugin `local`.

## 22.80 Question formats

`qformat` define formatos de importação e exportação de questões. Moodle XML, GIFT e outros formatos vivem nessa camada.

Se seu objetivo é importar questões de um formato acadêmico próprio, não crie qtype apenas por causa do arquivo. O qtype representa a questão; o qformat representa como definições entram ou saem do Question Bank.

## 22.81 Criando um qtype simples

Vamos imaginar `qtype_exactphrase`, uma questão que aceita uma frase exata depois de normalização simples. Ela não é pedagogicamente revolucionária, mas é suficiente para estudar a estrutura.

O professor define a resposta correta, o aluno digita texto e o engine atribui fraction 1 ou 0.

## 22.82 Tabela do qtype

Se precisamos de uma configuração extra específica, criamos tabela própria:

```
qtype_exactphrase_options
    id
    questionid
    correctphrase
    casesensitive
```

`questionid` referencia a definição concreta da questão. Em qtypes que utilizam `question_answers`, talvez nem seja necessário criar uma tabela para resposta principal, dependendo do desenho.

## 22.83 `question_type`

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

## 22.84 Definition da questão

Em `question.php` podemos ter:

```php
class qtype_exactphrase_question extends question_graded_automatically {
    public string $correctphrase;
    public bool $casesensitive;

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

## 22.85 `grade_response()`

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

## 22.86 Renderer do qtype

O renderer precisa mostrar o controle de resposta respeitando o Question Engine e display options. Ele recebe question attempt, options e componentes preparados pelo engine.

Não crie um `<form>` completamente separado que ignora os nomes de campos esperados pelo attempt, porque o engine depende desses nomes para reconstruir responses e steps.

## 22.87 Accessibility no qtype

Um novo qtype precisa ser utilizável por teclado, possuir labels corretos e comunicar feedback e estados de forma acessível. Questions são componentes interativos e erros aqui afetam diretamente a capacidade do aluno responder.

Não use apenas cor para indicar correto e incorreto e não esconda label porque visualmente o campo parece óbvio.

## 22.88 Testes do qtype

Teste `get_expected_data()`, completude, grading, summary, save/load e backup/restore quando houver dados próprios.

Também teste o qtype com behaviours diferentes suportados, porque uma questão que funciona em deferred feedback pode expor bugs em interactive multiple tries.

## 22.89 Criando questões por código para importações institucionais

Um caso real é converter banco de questões externo para Moodle. Não faça um script SQL que insere em cinco tabelas, porque a arquitetura de versões e referências muda entre branches.

Crie um importador que resolve categoria, mapeia qtype, monta os dados no formato do form e chama a API do qtype. Para milhares de questões, processe em Task com checkpoints.

## 22.90 Mapeamento externo

Use `question_bank_entries.idnumber` quando precisar de identificador estável vindo de outro sistema. Assim você pode localizar a entrada lógica mesmo que `question.id` mude a cada nova versão.

Esse detalhe simplifica sincronização e evita depender de IDs internos que não sobrevivem a restore ou migração.

## 22.91 Segurança

Criar, editar e usar questões exige capabilities específicas no contexto correto. Não aceite `questionid` vindo do usuário e carregue a questão sem verificar se ele pode acessá-la no contexto da bank entry.

Em tentativas, o acesso ao Quiz e à tentativa precisa ser validado antes de expor respostas, right answers ou feedback que review options escondem do aluno.

## 22.92 Performance

Question Engine pode gerar grandes volumes de dados. Cada tentativa pode ter dezenas de question attempts, cada uma com vários steps e step data. Relatórios que fazem uma consulta por step ou carregam QUBAs completos para milhares de tentativas podem ficar extremamente caros.

Use APIs de reporting quando existirem, faça consultas em lote quando o objetivo é análise agregada e só carregue a tentativa completa quando precisa realmente reconstruir seu estado.

## 22.93 N+1 em relatórios de tentativas

Um erro clássico é buscar cem `quiz_attempts` e para cada um carregar o QUBA completo individualmente. Dependendo do relatório, isso explode em centenas ou milhares de queries.

Se o objetivo é apenas estado, nota e timestamps, obtenha os campos diretamente das tabelas do Quiz. Se precisa de respostas detalhadas, procure métodos do data mapper voltados a reporting ou desenhe consulta em lote com cuidado.

## 22.94 Não altere steps para corrigir nota manualmente

Se uma correção está errada, não execute `UPDATE question_attempt_steps SET fraction = ...`. Isso deixa state, summaries, behaviours e regrade inconsistentes.

Use os mecanismos de regrade ou grading manual do Quiz e do Question Engine conforme o qtype.

## 22.95 Questões que exigem correção manual

Nem todo qtype consegue calcular fraction automaticamente. Essay é o exemplo clássico. Nesses casos o state pode indicar `needsgrading` até um avaliador informar a nota.

O Question Engine continua registrando responses e steps, enquanto o Quiz controla a interface de grading e atualização da tentativa.

## 22.96 Manual grading não é `grade_grades`

A nota de uma questão dissertativa é primeiro parte do question attempt. Depois o Quiz recalcula `sumgrades` e a nota geral chega ao Gradebook.

Editar o Gradebook diretamente não equivale a corrigir a questão, porque são camadas diferentes da cadeia de avaliação.

## 22.97 Flags

O aluno pode marcar uma questão com flag durante a tentativa. O estado `flagged` fica no question attempt e é independente de correctness ou grading.

Esse pequeno recurso mostra novamente por que o Question Engine precisa de uma estrutura própria em vez de uma simples tabela resposta/nota.

## 22.98 Questions summary versus source question

Depois de uma tentativa, `questionsummary` ajuda a preservar informação sobre o que foi apresentado, inclusive em questões randomizadas. Não use esse campo como fonte para recriar a questão original ou editar o banco.

Ele é um resumo de reporting, não o modelo de autoria.

## 22.99 Projeto - criar questões por código

No primeiro exercício, crie uma ferramenta CLI que recebe uma categoria e gera dez questões `truefalse` pela API do qtype. Cada questão deve receber `idnumber` estável, feedback geral e nome identificável.

Rode o script duas vezes e faça a segunda execução criar nova versão somente quando o texto tiver mudado. Não duplique bank entries.

Depois abra o Question Bank e confirme visualmente as versões e os statuses.

## 22.100 Projeto - ler detalhadamente uma tentativa

Escolha uma tentativa de Quiz e produza um relatório técnico por slot contendo número do slot, questionid concreto, qtype, behaviour, state atual, mark, maxmark, response summary e todos os steps com timestamp, userid, state e fraction.

A regra do exercício é usar `quiz_attempt`, QUBA e Question Engine sempre que possível, deixando SQL direto apenas para diagnóstico complementar.

Compare uma questão deferred feedback com uma interactive para perceber como a sequência de steps muda.

## 22.101 Projeto - criar um qtype simples

Implemente `qtype_exactphrase` com formulário de edição, persistência da frase correta, opção case-sensitive, definition class, renderer, grading automático, response summary, feedback e testes.

Depois crie duas questões do tipo, coloque em um Quiz e teste deferred feedback e interactive. Faça backup do curso, restaure em outro ambiente e confirme que as questões não são duplicadas incorretamente no banco.

Por fim, edite uma questão para criar nova versão e confirme que uma tentativa antiga continua ligada à definição que realmente foi apresentada ao aluno.

## 22.102 O que precisa ficar deste capítulo

Question Bank, Question Engine e Quiz são camadas diferentes que cooperam. O Question Bank organiza identidade, categorias, versões e referências; o Question Engine executa definições, behaviours, attempts, steps e states; o Quiz organiza slots, tentativas, páginas, regras de acesso, revisão e nota global.

A tabela `question` deixou de ser a identidade completa da questão nas versões modernas, porque `question_bank_entries`, `question_versions` e references passaram a fazer parte do modelo. Questões aleatórias também deixaram de ser simplesmente um `qtype random` e passaram a utilizar referências de conjunto.

Se você guardar uma regra prática, guarde esta: para criar ou alterar questões, use as APIs do Question Bank e do qtype; para executar questões, use Question Engine; para manipular Quiz, use as APIs do `mod_quiz`. SQL direto é excelente para diagnóstico e relatórios específicos, mas é uma péssima ferramenta para substituir os contratos que mantêm essas três camadas sincronizadas.

## Referências técnicas consultadas

* MOODLE. Moodle Developer Resources. Questions API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/question. Acesso em: setembro de 2026.
* MOODLE. Moodle Developer Resources. Question type plugins. Disponível em: https://moodledev.io/docs/5.1/apis/plugintypes/qtype. Acesso em: setembro de 2026.
* MOODLE. Moodle Developer Resources. Question bank plugins. Disponível em: https://moodledev.io/docs/5.1/apis/plugintypes/qbank. Acesso em: setembro de 2026.
* MOODLE. Moodle Developer Resources. Question bank filters. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes/qbank/filters. Acesso em: setembro de 2026.
* MOODLE. Moodle Developer Resources. Question type plugin restore code. Disponível em: https://moodledev.io/docs/5.2/apis/plugintypes/qtype/restore. Acesso em: setembro de 2026.
* MOODLE. Moodle source code. Core question engine, question usage, question type base and Quiz database schema. Disponível em: https://github.com/moodle/moodle. Acesso em: setembro de 2026.

{% endraw %}
