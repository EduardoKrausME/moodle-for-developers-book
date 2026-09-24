{% raw %}

# 21 GRADEBOOK E COMPLETION

Nota e conclusão aparecem juntas em quase toda atividade avaliativa do Moodle, mas são subsistemas diferentes e precisam continuar diferentes dentro do código. O Gradebook responde qual é a nota do usuário, qual faixa de valores é válida, qual escala está sendo usada, se aquela nota foi sobrescrita manualmente e como ela participa dos cálculos do curso, enquanto Completion responde se uma atividade foi concluída e por quais regras essa conclusão aconteceu. Uma atividade pode ter nota sem usar conclusão, pode ter conclusão sem nota e pode combinar os dois, por exemplo exigindo que o estudante receba uma nota para concluir.

Essa separação evita um erro muito comum em plugins próprios, que é criar uma coluna `completed` e outra `grade` na tabela do módulo e começar a tratar aquilo como se o Moodle não possuísse Gradebook e Completion API. No começo parece prático porque toda regra está dentro do plugin, mas o professor não vê a nota corretamente no livro, a conclusão não aparece na página do curso, Availability API não consegue usar o estado, backup e restore ficam inconsistentes e qualquer alteração feita no Gradebook deixa o plugin com uma verdade paralela.

Neste capítulo vamos continuar usando o `mod_checkpoint` criado no Capítulo 17. Agora ele receberá integração completa com o Gradebook e duas regras customizadas de conclusão, uma exigindo que o estudante envie uma resposta e outra exigindo que essa resposta receba feedback do professor. Com isso conseguimos acompanhar o ciclo inteiro, desde a criação do grade item até a atualização da conclusão quando a resposta é enviada, editada, avaliada ou perde uma condição que antes estava satisfeita.

## 21.1 Gradebook não é a tabela de notas do seu plugin

Um módulo pode possuir tabelas próprias para tentativas, respostas, avaliações ou pontuações internas, mas o Gradebook é a camada oficial de notas do curso. Isso significa que o plugin pode guardar dados necessários para calcular uma nota, porém a nota que deve aparecer no livro precisa ser enviada pela Gradebook API.

No nosso `mod_checkpoint`, a tabela `checkpoint_answers` pode guardar a avaliação feita pelo professor porque esse registro também pertence ao domínio da atividade, mas depois que a nota é definida ela precisa ser publicada no Gradebook. Não existe problema em persistir a origem da nota no plugin, o problema é acreditar que o Moodle vai procurar essa coluna sozinho.

## 21.2 A arquitetura do Gradebook

A arquitetura do Gradebook separa o que está sendo avaliado das notas individuais recebidas pelos usuários. Em termos simples, `{grade_items}` representa colunas do livro de notas e `{grade_grades}` representa as notas dos usuários em cada uma dessas colunas.

Uma atividade normalmente cria um grade item. Se o `mod_checkpoint` vale 100 pontos, o Gradebook pode ter um item chamado "Checkpoint da Unidade 3" e cada estudante terá um registro associado àquele item quando receber uma nota.

Essa separação permite que configuração do item, como máximo, mínimo, escala e categoria, seja tratada uma vez, enquanto notas individuais ficam associadas por usuário.

## 21.3 `grade_items`

A tabela `{grade_items}` contém a definição do item de nota. Entre os campos relevantes aparecem curso, nome do item, tipo, módulo, instância, número do item, tipo de nota, valor mínimo, valor máximo, escala, categoria, cálculo, visibilidade e várias outras propriedades utilizadas pelo Gradebook.

Para um activity module comum, os campos conceituais mais importantes são:

```
itemtype     = mod
itemmodule   = checkpoint
iteminstance = checkpoint.id
itemnumber   = 0
```

O `itemnumber` permite que uma atividade possua mais de um item de nota, embora a maioria dos módulos simples utilize apenas zero. Se o plugin possui nota principal e outra nota independente, ele pode trabalhar com múltiplos itens, mas isso aumenta bastante o contrato de atualização e precisa ser uma necessidade real.

## 21.4 `grade_grades`

A tabela `{grade_grades}` guarda uma linha por usuário e grade item. Ela possui valores como `rawgrade`, `finalgrade`, flags de override, bloqueio, ocultação e outras informações processadas pelo Gradebook.

Não use essa tabela como se fosse uma tabela comum do plugin. A presença de `rawgrade` e `finalgrade` costuma tentar o desenvolvedor a fazer um `update_record()`, mas isso ignora regrade, overrides, histórico e cálculos.

Se a nota pertence à atividade, a atividade informa o valor usando a API e deixa o Gradebook decidir como aquilo se transforma no estado final.

## 21.5 `rawgrade` e `finalgrade`

`rawgrade` representa o valor bruto fornecido pela fonte da nota, enquanto `finalgrade` é o valor final depois que o Gradebook aplica transformações, cálculos e outros mecanismos do curso.

Uma atividade não deveria escrever `finalgrade` diretamente. Ela informa o valor bruto correspondente ao que calculou e o Gradebook cuida do restante.

Essa diferença fica especialmente importante quando o professor usa fatores, offset, cálculo, categoria ou alguma outra configuração no livro. O plugin não deveria tentar recalcular essas coisas por fora.

## 21.6 Override manual

O professor pode sobrescrever uma nota manualmente no Gradebook. Quando isso acontece, a atividade não deveria simplesmente atropelar o valor toda vez que chama `grade_update()` como se a interface de notas não existisse.

O Gradebook conhece o estado de override e preserva o comportamento esperado. Esse é mais um motivo para utilizar a API em vez de escrever diretamente nas tabelas.

Se o plugin precisa informar ao professor que existe uma nota sobrescrita, consulte o estado pela API ou pelos objetos de grade adequados, mas não tente desmarcar override silenciosamente porque a atividade recalculou uma pontuação.

## 21.7 Grade categories

Itens de nota podem pertencer a categorias do Gradebook. Categorias agrupam avaliações e participam de agregações, pesos e cálculos do curso.

O plugin normalmente não deveria criar uma categoria própria apenas porque quer "organizar" a coluna. O professor ou a configuração do curso pode mover o item para a categoria desejada.

Se uma solução institucional realmente precisa criar categorias automaticamente, faça isso conscientemente com a Gradebook API e entenda o impacto em cálculo, pesos e configuração do professor. Um módulo simples normalmente só cria seu próprio item.

## 21.8 `FEATURE_GRADE_HAS_GRADE`

Para informar ao Moodle que a atividade pode fornecer nota, o `supports()` deve declarar:

```
case FEATURE_GRADE_HAS_GRADE:
    return true;
```

Ou em um `match` moderno:

```
FEATURE_GRADE_HAS_GRADE => true,
```

Essa feature tem consequências além do Gradebook. Ela também permite que o Moodle ofereça conclusão baseada em receber uma nota, caso Completion esteja habilitado.

Não declare a feature se a atividade nunca gera nota. A presença do campo `grade` na tabela por si só não é justificativa suficiente se ele representa outra coisa.

## 21.9 O campo `grade` na atividade

Muitos módulos usam um campo chamado `grade` para definir como a atividade será avaliada. Historicamente existe uma convenção bastante difundida em que valores positivos representam nota numérica máxima, valores negativos representam escalas e zero significa ausência de nota numérica.

Isso aparece em vários módulos do core e continua sendo útil quando o formulário utiliza os elementos padrão de nota.

No `mod_checkpoint` podemos usar:

```
grade = 100   nota de 0 a 100
grade = 20    nota de 0 a 20
grade = -5    escala cujo id é 5
grade = 0     sem nota
```

A implementação precisa interpretar esse valor de forma consistente em `grade_item_update()`.

## 21.10 `grade_update()`

A função central para uma atividade publicar notas é `grade_update()`. Ela pode criar ou atualizar o grade item e também enviar notas de usuários.

A assinatura trabalha com origem, curso, tipo, módulo, instância, item number, notas e detalhes do item. Um exemplo reduzido seria:

```php
grade_update(
    'mod/checkpoint',
    $checkpoint->course,
    'mod',
    'checkpoint',
    $checkpoint->id,
    0,
    $grades,
    $itemdetails
);
```

O primeiro argumento identifica a origem da alteração, enquanto `itemtype`, `itemmodule`, `iteminstance` e `itemnumber` identificam o grade item.

## 21.11 Criando o grade item

A atividade normalmente cria ou atualiza seu grade item sempre que a instância é criada ou editada.

```php
function checkpoint_grade_item_update($checkpoint, $grades = null): int {
    global $CFG;

    require_once($CFG->libdir . '/gradelib.php');

    $itemdetails = [
        'itemname' => $checkpoint->name,
    ];

    if (!empty($checkpoint->cmidnumber)) {
        $itemdetails['idnumber'] = $checkpoint->cmidnumber;
    }

    if ($checkpoint->grade > 0) {
        $itemdetails['gradetype'] = GRADE_TYPE_VALUE;
        $itemdetails['grademax'] = $checkpoint->grade;
        $itemdetails['grademin'] = 0;
    } else if ($checkpoint->grade < 0) {
        $itemdetails['gradetype'] = GRADE_TYPE_SCALE;
        $itemdetails['scaleid'] = -$checkpoint->grade;
    } else {
        $itemdetails['gradetype'] = GRADE_TYPE_NONE;
    }

    return grade_update(
        'mod/checkpoint',
        $checkpoint->course,
        'mod',
        'checkpoint',
        $checkpoint->id,
        0,
        $grades,
        $itemdetails
    );
}
```

O callback concentra o contrato do Gradebook e pode ser reutilizado na criação, atualização e envio de notas.

## 21.12 Criando o grade item no `add_instance()`

Depois de inserir a instância, crie o item correspondente:

```php
function checkpoint_add_instance($data, $mform = null): int {
    global $DB;

    $data->timemodified = time();
    $id = $DB->insert_record('checkpoint', $data);
    $data->id = $id;

    checkpoint_grade_item_update($data);

    return $id;
}
```

Em uma implementação maior eu delegaria parte desse fluxo para uma classe de serviço, mas o exemplo mostra a relação temporal. Primeiro a instância precisa existir, depois o Gradebook recebe o item apontando para aquele ID.

## 21.13 Atualizando o grade item no `update_instance()`

Se o professor altera nome, máximo ou escala, o grade item precisa acompanhar.

```php
function checkpoint_update_instance($data, $mform): bool {
    global $DB;

    $data->id = $data->instance;
    $data->timemodified = time();

    $result = $DB->update_record('checkpoint', $data);
    checkpoint_grade_item_update($data);

    return $result;
}
```

Isso evita situações em que a atividade mostra máximo 50, mas o Gradebook continua configurado em 100.

## 21.14 Alterar nota máxima depois que existem notas

Mudar `grademax` em uma atividade que já possui notas precisa ser tratado com cuidado. O Gradebook possui mecanismos para trabalhar com escalonamento e regrade, mas a atividade precisa entender o significado pedagógico da mudança.

Se um professor muda de 100 para 20, ele quer converter os valores mantendo percentual ou quer reinterpretar as notas existentes? Nem sempre essas duas coisas significam a mesma coisa.

Não implemente uma divisão manual em todas as notas apenas porque o máximo mudou. Verifique o comportamento do Gradebook e a API disponível para a versão suportada.

## 21.15 Atualizando uma nota

Para publicar a nota de um usuário, crie uma estrutura com `userid` e `rawgrade`:

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => $value,
];

checkpoint_grade_item_update($checkpoint, $grade);
```

Também é possível fornecer feedback e formato quando o fluxo da atividade exige.

O ponto importante é não abrir `{grade_grades}` e procurar a linha para editar manualmente.

## 21.16 Atualizando várias notas

`grade_update()` também aceita um conjunto de notas. Isso é muito útil em regrade ou sincronização de um módulo inteiro.

```php
$grades = [];

foreach ($records as $record) {
    $grades[$record->userid] = [
        'userid' => $record->userid,
        'rawgrade' => $record->grade,
    ];
}

checkpoint_grade_item_update($checkpoint, $grades);
```

Em grandes volumes, monte lotes coerentes e evite carregar toda a população do curso em memória sem necessidade.

## 21.17 `rawgrade = null`

`rawgrade = null` significa que o usuário está sem nota. Isso é diferente de nota zero.

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => null,
];
```

Zero é uma nota válida e pode representar reprovação. `null` representa ausência de avaliação.

Essa diferença parece óbvia, mas plugins que usam `empty()` de forma indiscriminada costumam transformar zero em ausência de nota e geram resultados incorretos.

## 21.18 Omitir um campo não é o mesmo que enviar `null`

Na Gradebook API, uma propriedade ausente normalmente significa "não altere esse valor", enquanto alguns campos explicitamente enviados como `null` possuem semântica própria.

Isso é importante em atualizações parciais. Se você não pretende tocar no feedback existente, não monte um array com `feedback => null` por reflexo.

Defina somente o que a operação realmente está alterando.

## 21.19 Feedback

O Gradebook aceita feedback associado à nota. Uma atividade pode manter feedback detalhado em suas próprias tabelas e também enviar um resumo para o Gradebook.

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => $value,
    'feedback' => $feedback,
    'feedbackformat' => FORMAT_HTML,
];
```

Não use feedback do Gradebook como substituto automático de todo o modelo de avaliação do plugin. Se existe rubrica, arquivo anotado, comentários em itens ou histórico de revisão, esses dados pertencem à atividade ou à Advanced Grading API, não a uma única string.

## 21.20 Escalas

Quando a atividade usa uma escala, `gradetype` deve ser `GRADE_TYPE_SCALE` e `scaleid` identifica a escala.

Em vários módulos a convenção é armazenar `grade = -$scaleid`, daí a conversão:

```php
$itemdetails['gradetype'] = GRADE_TYPE_SCALE;
$itemdetails['scaleid'] = -$checkpoint->grade;
```

Escala não é apenas nota numérica com labels. A ordem e o significado dos itens pertencem à escala, portanto qualquer conversão interna precisa ser feita com cuidado.

## 21.21 Nota mínima e nota máxima

Em nota numérica, `grademin` e `grademax` definem o intervalo aceito pelo item.

```
$itemdetails['gradetype'] = GRADE_TYPE_VALUE;
$itemdetails['grademin'] = 0;
$itemdetails['grademax'] = 100;
```

A atividade deve garantir que o valor bruto enviado faça sentido dentro desse intervalo. Se sua lógica interna calcula 132 em uma atividade de 100 pontos, não confie no Gradebook como lugar para corrigir um algoritmo quebrado.

## 21.22 Nota de aprovação

O grade item pode possuir `gradepass`, e essa configuração pode participar de Completion e relatórios. Em muitos casos o professor configura isso no Gradebook ou por elementos do próprio formulário da atividade.

Não confunda nota máxima com nota de aprovação. Uma atividade de 100 pontos pode exigir 60 para aprovação e ainda assim registrar notas abaixo disso normalmente.

Se a conclusão estiver configurada para exigir nota de aprovação, o estado de completion pode distinguir sucesso e falha conforme as regras do core.

## 21.23 `finalgrade`

A nota final calculada pode ser diferente do valor bruto enviado pelo módulo. O Gradebook pode aplicar transformações, cálculos, overrides e agregações.

Quando o plugin precisa exibir a nota oficial do curso, não assuma que sua tabela interna continua sendo a melhor fonte. Dependendo do contexto, consulte o Gradebook ou utilize as APIs que devolvem a nota final.

Quando o plugin precisa recalcular a origem da nota, aí a tabela própria continua sendo a fonte para reconstruir o `rawgrade`.

## 21.24 `grade_item`

A classe `grade_item` representa um item do Gradebook e oferece métodos para carregar configuração, consultar grades, verificar overrides, trabalhar com visibilidade e disparar regrade.

Ela é útil quando você precisa manipular detalhes do item além de uma simples publicação por `grade_update()`, mas não transforme toda operação em acesso direto ao objeto se a função de alto nível já resolve.

A regra geral continua sendo preferir a API mais alta que atende seu caso e descer de nível apenas quando existe necessidade real.

## 21.25 `grade_grade`

`grade_grade` representa a nota de um usuário para determinado item. Ela expõe informações como `rawgrade`, `finalgrade`, override e lock.

É uma classe útil para leitura e para fluxos internos do Gradebook, mas activity modules normalmente devem continuar enviando suas notas por `grade_update()` em vez de persistir `grade_grade` manualmente.

A existência de uma classe de ORM não transforma a tabela em API de gravação do módulo.

## 21.26 Notas bloqueadas

O Gradebook pode bloquear notas ou itens. Se uma nota foi bloqueada, uma atividade não deveria tentar contornar isso escrevendo diretamente no banco.

O resultado de `grade_update()` e o estado do item precisam ser respeitados. Se existe uma ação administrativa que desbloqueia, ela pertence ao fluxo do Gradebook e à autorização correspondente.

## 21.27 Regrade

Regrade é o processo de recalcular notas finais quando alguma dependência muda. Alterar máximo, fórmula, categoria ou outros elementos pode fazer o Gradebook marcar itens como necessitando atualização.

O módulo não deve sair percorrendo `{grade_grades}` recalculando `finalgrade`. O core possui `grade_regrade_final_grades()` e mecanismos internos para respeitar a ordem de dependências entre itens.

Quando sua atividade muda a origem das notas, envie novamente os valores brutos. O Gradebook resolve o que pertence ao livro.

## 21.28 `checkpoint_get_user_grades()`

Módulos que integram corretamente com Gradebook costumam implementar um callback capaz de reconstruir as notas a partir dos dados próprios da atividade.

```php
function checkpoint_get_user_grades($checkpoint, $userid = 0): array {
    global $DB;

    $params = ['checkpointid' => $checkpoint->id];
    $sql = "SELECT userid, grade AS rawgrade
              FROM {checkpoint_answers}
             WHERE checkpointid = :checkpointid";

    if ($userid) {
        $sql .= " AND userid = :userid";
        $params['userid'] = $userid;
    }

    return $DB->get_records_sql($sql, $params);
}
```

O formato precisa ser compatível com o que `grade_update()` espera e normalmente inclui o `userid`.

## 21.29 `checkpoint_update_grades()`

Outro callback comum é responsável por reenviar notas ao Gradebook:

```php
function checkpoint_update_grades($checkpoint, $userid = 0, $nullifnone = true): void {
    $grades = checkpoint_get_user_grades($checkpoint, $userid);

    if ($grades) {
        checkpoint_grade_item_update($checkpoint, $grades);
        return;
    }

    if ($userid && $nullifnone) {
        checkpoint_grade_item_update($checkpoint, [
            'userid' => $userid,
            'rawgrade' => null,
        ]);
        return;
    }

    checkpoint_grade_item_update($checkpoint);
}
```

Esse callback permite ao Gradebook pedir que a atividade atualize novamente suas notas quando necessário.

## 21.30 Por que a atividade precisa conseguir reconstruir a nota

Se a única cópia da nota estivesse em `{grade_grades}`, o módulo perderia capacidade de recomputar quando suas regras mudassem. Por isso a atividade geralmente mantém a informação de origem ou os dados a partir dos quais a nota pode ser recalculada.

No `checkpoint`, a avaliação salva em `checkpoint_answers.grade` é o dado do domínio. O Gradebook recebe a projeção oficial dessa nota.

Essa é a mesma ideia de outras partes do Moodle: evite transformar uma projeção em única fonte de verdade quando o domínio que a produz pertence ao plugin.

## 21.31 Excluindo o grade item

Quando uma atividade deixa de possuir nota ou é excluída, o grade item precisa ser removido pelo contrato do Gradebook.

Uma implementação pode utilizar `grade_update()` com a propriedade `deleted` nos detalhes do item, conforme o fluxo da versão suportada. O importante é não apagar diretamente de `{grade_items}` e `{grade_grades}`.

Também não remova notas de usuários apenas porque o professor alterou temporariamente uma configuração. Defina se a atividade deixou de ser avaliativa ou se a nota apenas está oculta.

## 21.32 Activity Module e Gradebook

A integração completa geralmente passa por quatro momentos. Criação da instância cria o grade item, edição atualiza sua configuração, avaliação envia notas e exclusão remove ou marca o item conforme a API.

Esse ciclo deve permanecer coerente com backup e restore. Uma atividade restaurada em outro curso recebe um novo item relacionado à nova instância, não uma cópia literal do ID antigo do Gradebook.

## 21.33 Advanced Grading não é Gradebook

Rubricas, guias de avaliação e outros métodos avançados utilizam a Advanced Grading API. Eles ajudam o professor a produzir uma nota, mas a nota final ainda vai para o Gradebook.

Não confunda a interface utilizada para calcular a avaliação com o lugar onde a nota oficial do curso é armazenada e agregada.

Essa distinção vai ser importante se o `checkpoint` crescer e passar a utilizar rubrica, porque o item do Gradebook continua existindo do mesmo jeito.

# Completion

## 21.34 O que é Activity Completion

Activity Completion representa o estado de conclusão de uma atividade para um usuário. O professor pode permitir marcação manual ou configurar regras automáticas, como visualizar, receber nota, enviar uma resposta ou satisfazer condições específicas do plugin.

Completion não é a mesma coisa que disponibilidade. Completion diz se algo foi concluído, enquanto Availability pode utilizar esse estado para decidir se outro recurso fica acessível.

Completion também não é nota. Uma atividade pode estar concluída com nota zero, pode estar incompleta mesmo possuindo nota e pode ser concluída sem possuir qualquer Gradebook item.

## 21.35 Activity Completion e Course Completion

Activity Completion trata uma atividade individual. Course Completion trata critérios de conclusão do curso e pode utilizar atividades concluídas entre suas condições.

O módulo normalmente deveria atualizar corretamente sua própria Activity Completion e deixar o sistema de Course Completion fazer a agregação correspondente.

Evite escrever diretamente em tabelas de conclusão de curso só porque sua atividade ficou completa. Isso cria acoplamento desnecessário e pode ignorar outros critérios configurados pelo professor.

## 21.36 Conclusão manual

Se um módulo não implementa nenhuma regra automática especial, ainda pode participar de conclusão manual quando o curso permite esse modo. O usuário marca a atividade como concluída e o core registra esse estado.

O plugin não precisa inventar checkbox próprio dentro de `view.php`. Use o mecanismo padrão do Moodle para que o estado apareça na página do curso, relatórios e disponibilidade.

## 21.37 Conclusão automática

Conclusão automática acontece quando o estado é calculado a partir de regras. O Moodle pode oferecer regras padrão, como visualizar e receber nota, e o módulo pode oferecer regras customizadas.

A diferença principal é que o usuário não marca manualmente. O sistema observa o estado e atualiza a conclusão quando as condições mudam.

## 21.38 `FEATURE_COMPLETION_TRACKS_VIEWS`

Se o módulo sabe marcar visualização, declare:

```
FEATURE_COMPLETION_TRACKS_VIEWS => true,
```

E, depois de uma visualização válida:

```php
$completion = new completion_info($course);
$completion->set_module_viewed($cm);
```

Como vimos no Capítulo 17, isso deve acontecer depois de validar acesso e antes do cabeçalho quando a navegação precisa refletir imediatamente a mudança.

## 21.39 Conclusão por nota

Se o módulo declara `FEATURE_GRADE_HAS_GRADE`, o Moodle pode oferecer a condição de conclusão baseada em receber nota.

Nesse caso o plugin não precisa criar uma regra customizada chamada `completiongraded`. A infraestrutura padrão já conhece a relação entre grade item e completion.

Criar uma regra customizada que duplica exatamente uma condição do core aumenta manutenção e pode produzir dois estados diferentes para a mesma intenção.

## 21.40 Nota recebida não é necessariamente nota de aprovação

O professor pode configurar conclusão apenas por receber qualquer nota ou pode exigir aprovação quando essa opção está disponível no fluxo de Completion e Gradebook.

Uma nota zero continua sendo nota recebida. Se a atividade exige aprovação, então o estado pode depender também de `gradepass`.

Isso reforça por que Completion não deveria olhar diretamente para a coluna interna do plugin sem considerar a lógica do Gradebook quando a regra escolhida pelo professor é uma regra de nota.

## 21.41 `FEATURE_COMPLETION_HAS_RULES`

Quando o módulo possui regras próprias, declare:

```
FEATURE_COMPLETION_HAS_RULES => true,
```

No nosso `mod_checkpoint`, teremos duas regras customizadas:

```
completionsubmit
completionfeedback
```

A primeira exige uma resposta enviada. A segunda exige feedback do professor.

## 21.42 O contrato moderno de custom completion

Plugins antigos podem ter callbacks como `checkpoint_get_completion_state()`. Esse modelo foi substituído no Moodle moderno pela classe:

```
classes/completion/custom_completion.php
```

Com namespace:

```
namespace mod_checkpoint\completion;
```

E herança:

```
use core_completion\activity_custom_completion;

class custom_completion extends activity_custom_completion {
}
```

Para código novo, esta é a abordagem correta. O callback antigo só deve aparecer no capítulo como referência para manutenção de plugins legados.

## 21.43 `get_defined_custom_rules()`

A classe declara as regras que o módulo conhece:

```
public static function get_defined_custom_rules(): array {
    return [
        'completionsubmit',
        'completionfeedback',
    ];
}
```

Isso é o contrato estático da atividade. Uma instância pode ativar uma, as duas ou nenhuma, mas o módulo informa quais regras existem.

## 21.44 `get_state()`

`get_state()` calcula o estado de uma regra para um usuário específico.

```php
public function get_state(string $rule): int {
    global $DB;

    $this->validate_rule($rule);

    $answer = $DB->get_record('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return match ($rule) {
        'completionsubmit' => $answer
            ? COMPLETION_COMPLETE
            : COMPLETION_INCOMPLETE,

        'completionfeedback' => !empty($answer->feedback)
            ? COMPLETION_COMPLETE
            : COMPLETION_INCOMPLETE,

        default => COMPLETION_UNKNOWN,
    };
}
```

O método não recebe o usuário atual pela global `$USER`, porque a conclusão pode ser calculada para outro usuário em relatórios, cron ou avaliações.

## 21.45 Nunca use `$USER` em regra de completion que recebe `$userid`

Esse erro é extremamente comum. A regra funciona quando o aluno abre a atividade, mas o relatório do professor calcula o estado usando o professor porque o código olhou para `$USER`.

Na classe moderna o ID correto está em `$this->userid`. Use sempre o usuário para quem o estado está sendo calculado.

## 21.46 `validate_rule()`

Antes de calcular, chame:

```php
$this->validate_rule($rule);
```

Essa validação garante que a regra existe e está disponível para aquela instância, evitando aceitar qualquer string arbitrária como nome de condição.

Não substitua isso por um `switch` silencioso que devolve `false` para qualquer valor desconhecido.

## 21.47 `get_custom_rule_descriptions()`

O Moodle precisa mostrar ao usuário o que falta concluir. A classe deve devolver descrições legíveis:

```php
public function get_custom_rule_descriptions(): array {
    return [
        'completionsubmit' => get_string(
            'completiondetail:submit',
            'mod_checkpoint'
        ),
        'completionfeedback' => get_string(
            'completiondetail:feedback',
            'mod_checkpoint'
        ),
    ];
}
```

Essas strings aparecem na experiência de conclusão e precisam ser escritas para pessoas, não como nomes técnicos de configuração.

## 21.48 `get_sort_order()`

O método define a ordem em que as regras aparecem junto das regras padrão:

```
public function get_sort_order(): array {
    return [
        'completionview',
        'completionsubmit',
        'completionfeedback',
        'completionusegrade',
    ];
}
```

A lista precisa corresponder às regras realmente suportadas e à experiência que você quer apresentar.

## 21.49 Onde guardar configuração das regras

Configurações customizadas de completion normalmente ficam na tabela principal da atividade, porque já são carregadas junto da instância e pertencem àquela configuração.

No `checkpoint` podemos ter:

```
completionsubmit     0 ou 1
completionfeedback   0 ou 1
```

Se a regra exige quantidade, o campo pode guardar esse valor. Exemplo `completionattempts = 3`.

Não guarde esse tipo de configuração em tabela separada sem necessidade, porque isso adiciona consulta a um estado que já pertence naturalmente à instância.

## 21.50 `mod_form.php` e regras customizadas

O formulário da atividade precisa permitir que o professor ative as regras dentro da seção padrão de conclusão. Para isso `moodleform_mod` oferece `add_completion_rules()`.

```php
public function add_completion_rules(): array {
    $mform = $this->_form;

    $submit = $this->get_suffixed_name('completionsubmit');
    $feedback = $this->get_suffixed_name('completionfeedback');

    $mform->addElement(
        'checkbox',
        $submit,
        '',
        get_string('completionsubmit', 'mod_checkpoint')
    );

    $mform->addElement(
        'checkbox',
        $feedback,
        '',
        get_string('completionfeedback', 'mod_checkpoint')
    );

    return [$submit, $feedback];
}
```

Nas versões modernas, o sufixo é importante porque a seção de completion passou por mudanças para evitar IDs duplicados.

## 21.51 `get_suffixed_name()`

Desde a reconstrução do formulário de completion introduzida nas versões modernas, custom rules precisam trabalhar com nomes sufixados no form.

Não use simplesmente `completionsubmit` em todos os elementos esperando que o DOM nunca tenha duplicidade.

Esse é um daqueles detalhes de compatibilidade em que copiar código de um plugin Moodle 3.9 para Moodle 5.x pode produzir comportamento estranho sem erro PHP evidente.

## 21.52 `completion_rule_enabled()`

O formulário precisa informar se pelo menos uma regra customizada foi ativada:

```php
public function completion_rule_enabled($data): bool {
    $submit = $this->get_suffixed_name('completionsubmit');
    $feedback = $this->get_suffixed_name('completionfeedback');

    return !empty($data[$submit]) || !empty($data[$feedback]);
}
```

Isso participa da validação do modo automático e evita que o professor selecione completion automática sem qualquer condição efetiva.

## 21.53 `get_data()` e campos sufixados

Dependendo de como os elementos customizados são montados, pode ser necessário normalizar os nomes sufixados antes de salvar no objeto final da atividade.

Não copie cegamente overrides de `get_data()` de módulos antigos. Primeiro entenda como sua branch de Moodle trata custom completion forms e só ajuste quando o valor não estiver chegando no formato esperado.

Esse é um ponto sensível de compatibilidade entre versões.

## 21.54 `get_coursemodule_info()` e `customdata`

O Moodle precisa conhecer as regras customizadas sem fazer consultas extras em toda renderização da página do curso. Por isso o módulo adiciona as configurações relevantes no `cm_info` por meio de `customdata`.

```php
function checkpoint_get_coursemodule_info($coursemodule) {
    global $DB;

    $checkpoint = $DB->get_record(
        'checkpoint',
        ['id' => $coursemodule->instance],
        'id,name,intro,introformat,completionsubmit,completionfeedback',
        MUST_EXIST
    );

    $info = new cached_cm_info();
    $info->name = $checkpoint->name;

    if ($coursemodule->completion == COMPLETION_TRACKING_AUTOMATIC) {
        $info->customdata['customcompletionrules'] = [
            'completionsubmit' => $checkpoint->completionsubmit,
            'completionfeedback' => $checkpoint->completionfeedback,
        ];
    }

    return $info;
}
```

Isso alimenta a classe de custom completion sem obrigar o core a consultar a tabela da atividade repetidamente.

## 21.55 Completion e cache de `cm_info`

Como `cm_info` é cacheado, mudar configuração da atividade precisa passar pelos fluxos normais que invalidam modinfo. Não edite campos de completion por SQL fora dos callbacks e espere que a página do curso reflita imediatamente.

Usar o formulário e as APIs de course module mantém cache e estado mais coerentes.

## 21.56 `completion_info`

A classe `completion_info` é a principal interface para consultar e atualizar Activity Completion dentro de um curso.

```php
$completion = new completion_info($course);
```

Com ela você pode verificar se completion está habilitado, obter estado, marcar visualização e solicitar recálculo quando uma condição mudou.

Não escreva em `{course_modules_completion}` diretamente.

## 21.57 `is_enabled()`

Antes de executar trabalho específico de completion, verifique se o recurso está ativo para o curso ou para o course module:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    // Atualização de estado.
}
```

Isso evita consultas e atualizações desnecessárias quando a atividade não está usando conclusão.

## 21.58 `update_state()`

Quando um fato que influencia as regras customizadas muda, avise o Completion subsystem:

```php
$completion->update_state(
    $cm,
    COMPLETION_UNKNOWN,
    $userid
);
```

`COMPLETION_UNKNOWN` diz ao sistema para recalcular o estado com base nas regras atuais em vez de forçar artificialmente complete ou incomplete.

Essa abordagem é especialmente adequada quando existem várias regras e a alteração pode afetar somente uma delas.

## 21.59 Não force `COMPLETION_COMPLETE` sem necessidade

Se o módulo possui custom rules, não marque sempre `COMPLETION_COMPLETE` quando uma ação acontece. Talvez outra regra ainda não tenha sido satisfeita.

No nosso exemplo, enviar a resposta satisfaz `completionsubmit`, mas ainda pode faltar `completionfeedback`. Chamar `update_state($cm, COMPLETION_COMPLETE)` nesse momento poderia comunicar um estado incorreto.

Prefira solicitar recálculo com `COMPLETION_UNKNOWN` quando o sistema deve recomputar todas as condições.

## 21.60 Quando atualizar completion depois de um envio

Depois que o estudante cria ou altera a resposta:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    $completion->update_state(
        $cm,
        COMPLETION_UNKNOWN,
        $userid
    );
}
```

Faça isso depois de persistir a alteração, porque a classe de custom completion vai consultar o estado novo.

## 21.61 Quando atualizar completion depois do feedback

Quando o professor salva feedback, a mesma ideia se aplica:

```php
$completion = new completion_info($course);

if ($completion->is_enabled($cm)) {
    $completion->update_state(
        $cm,
        COMPLETION_UNKNOWN,
        $studentid
    );
}
```

Observe que o usuário cuja conclusão está sendo recalculada é o estudante, não o professor que realizou a avaliação.

## 21.62 Completion pode voltar para incompleto

Dependendo da regra, um estado que estava completo pode deixar de estar. Se o professor remove o feedback, se uma resposta é apagada ou se uma condição muda, o plugin precisa solicitar atualização novamente.

Não assuma que completion é sempre um estado monotônico que só vai de incompleto para completo. O comportamento depende da regra e das permissões do sistema.

Se sua regra exige um registro que pode ser removido, trate o caminho inverso também.

## 21.63 Estados de completion

Entre os estados conhecidos estão `COMPLETION_INCOMPLETE`, `COMPLETION_COMPLETE`, `COMPLETION_COMPLETE_PASS`, `COMPLETION_COMPLETE_FAIL` e `COMPLETION_UNKNOWN` em contextos de cálculo.

Use as constantes do core e não números mágicos.

Também não invente um estado próprio como `2 = enviado` e espere que o core entenda. Se o plugin precisa mostrar estados de domínio adicionais, mantenha-os em sua própria tabela e traduza somente a conclusão final para o Completion subsystem.

## 21.64 Pass e fail

Quando nota de aprovação participa da conclusão, o Moodle pode distinguir conclusão com aprovação e conclusão com reprovação.

Esse estado não significa que a atividade deixou de estar concluída. Em alguns fluxos, o usuário concluiu a tentativa mas não atingiu a nota de aprovação.

Essa diferença é relevante para Availability e relatórios e não deveria ser achatada em um boolean `completed` dentro do plugin.

## 21.65 Course Completion

Conclusão de curso agrega critérios que podem incluir conclusão de atividades, datas, duração, aprovação manual, notas e outros elementos configurados pelo curso.

Um activity module geralmente não precisa escrever lógica de Course Completion. Ele precisa entregar Activity Completion correta e deixar os critérios do curso usarem esse estado.

Se o plugin modifica diretamente tabelas de curso concluído toda vez que alguém envia uma atividade, existe grande chance de estar atravessando a fronteira errada.

## 21.66 Completion esperado

Atividades podem possuir uma data esperada de conclusão utilizada em calendário e planejamento. Essa informação é diferente de deadline da atividade e diferente de `timeclose`.

O core possui API para atualizar o evento correspondente à data esperada de completion, e módulos que oferecem esse recurso devem utilizar o contrato apropriado em vez de criar um segundo evento sem relação com a configuração padrão.

## 21.67 Completion e Availability

Uma atividade B pode depender da conclusão da atividade A. Quando A muda de estado, o Moodle pode recalcular a disponibilidade de B.

Esse é um dos motivos para atualizar completion no momento certo. Se o aluno concluiu uma condição e o plugin deixa o estado desatualizado até o cron da madrugada, a próxima atividade pode continuar bloqueada sem necessidade.

O oposto também vale. Marcar complete cedo demais pode liberar conteúdo antes da hora.

## 21.68 Performance de completion

Custom completion pode ser consultada durante renderização da página do curso para muitos usuários ou em relatórios. Uma regra que faz seis queries pesadas para responder um boolean é um problema de performance.

Prefira campos já indexados, consultas simples e dados em `cm_info->customdata` para configuração. Se o estado depende de agregação muito cara, considere manter uma projeção atualizada quando os eventos acontecem em vez de recalcular milhares de registros toda vez que alguém abre um relatório.

Mas cuidado para não criar um cache sem invalidação. Completion precisa continuar correto.

## 21.69 Evite N+1 em relatórios de conclusão

Se um relatório lista cem usuários e chama uma função que executa três queries para cada um, você acabou de criar 300 queries.

Quando o plugin precisa gerar relatórios próprios de completion, busque dados em lote. A Completion API continua sendo a fonte do estado oficial, mas dados complementares do plugin podem ser carregados com uma única consulta por atividade.

## 21.70 Completion e eventos

O subsystem dispara eventos quando estados mudam e outras partes do Moodle podem reagir. Não crie sua própria tabela de log apenas para saber que a atividade foi concluída se o evento padrão já representa o fato necessário.

Se o plugin possui um fato diferente, como "feedback publicado", aí um evento próprio pode fazer sentido.

## 21.71 Completion e backup

Campos de configuração das regras customizadas precisam entrar no backup da atividade. Se `completionsubmit` e `completionfeedback` estão na tabela principal e essa estrutura já é salva corretamente, garanta que os campos fazem parte do backup.

O estado de completion dos usuários é tratado pelo mecanismo geral conforme as opções de backup com user data, enquanto a configuração da regra pertence à atividade e deve viajar mesmo em backup sem usuários.

## 21.72 Completion e restore

No restore, a nova instância recebe suas regras de completion e o course module correspondente precisa terminar configurado de forma coerente.

Não restaure IDs de `course_modules_completion` manualmente. Mappings e o mecanismo de restore existem justamente porque `cmid`, `userid` e outros identificadores podem mudar.

## 21.73 Gradebook e backup

O grade item de uma atividade também é recriado dentro do novo curso, relacionado à nova instância. Isso é diferente de copiar a linha antiga de `{grade_items}`.

Notas de usuários entram quando o backup inclui user data e o módulo implementa seu backup corretamente, mas a origem da nota no plugin também precisa ser restaurada para que `update_grades()` consiga reconstruir o Gradebook no futuro.

## 21.74 Gradebook e Privacy API

Notas são dados pessoais e podem aparecer tanto no Gradebook quanto nas tabelas internas da atividade. O plugin precisa declarar seus próprios dados na Privacy API quando armazena avaliações, feedback ou pontuação interna.

O fato de o Gradebook possuir seu provider não cobre automaticamente a tabela `checkpoint_answers`.

## 21.75 Gradebook e Groups API

Grupos podem limitar quem um professor consegue avaliar ou visualizar em determinada atividade. Isso não altera a estrutura do grade item, mas altera a interface e as consultas usadas para carregar participantes.

Não filtre `grade_grades` manualmente por grupo como forma de autorização. Primeiro determine os usuários permitidos pela Groups API e pela capability correspondente.

## 21.76 Gradebook e capabilities

Avaliar usuário normalmente exige capability própria, por exemplo:

```
mod/checkpoint:grade
```

Essa capability deve ser verificada em `context_module`. A existência do grade item não autoriza ninguém a alterar nota.

Da mesma forma, uma Web Service ou ação AJAX de avaliação precisa repetir a autorização no servidor.

## 21.77 Nota calculada pelo plugin ou informada pelo professor

Algumas atividades calculam automaticamente, outras recebem uma nota manual. Em ambos os casos a saída para o Gradebook pode ser a mesma, mas a fonte interna é diferente.

Em cálculo automático, salve os dados que permitem reproduzir a nota. Em avaliação manual, salve quem avaliou, quando avaliou e os dados necessários para auditoria do domínio.

Não use `grade_grades.usermodified` como substituto automático de todo o histórico que sua atividade precisa.

## 21.78 Reavaliar depois de mudar a regra

Se uma atualização de versão muda o algoritmo de nota, você precisa decidir se notas antigas serão recalculadas. Esse é um problema de upgrade de dados e não deve acontecer silenciosamente toda vez que o professor abre a atividade.

O Moodle 5.2 teve mudanças importantes e correções recentes relacionadas a cálculos do Gradebook, o que reforça uma regra geral: não replique internamente o mecanismo de cálculo do Gradebook e acompanhe as notas de release quando seu plugin depende de comportamentos avançados.

## 21.79 Um fluxo completo de avaliação

No nosso `mod_checkpoint`, um fluxo de avaliação poderia ser:

```
Aluno envia resposta
        |
        +-- salva checkpoint_answers
        +-- atualiza custom completion
        |
Professor avalia
        |
        +-- grava grade e feedback no domínio
        +-- chama checkpoint_grade_item_update()
        +-- atualiza custom completion
        |
Gradebook
        |
        +-- calcula finalgrade
        +-- atualiza conclusão por nota quando configurada
```

Nenhuma parte precisa escrever diretamente em tabelas internas do Gradebook ou Completion.

## 21.80 A regra `completionsubmit`

A primeira regra customizada é satisfeita quando existe uma resposta válida do usuário.

```php
case 'completionsubmit':
    $complete = $DB->record_exists('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return $complete
        ? COMPLETION_COMPLETE
        : COMPLETION_INCOMPLETE;
```

Se o plugin permite apagar a resposta, a remoção precisa pedir novo cálculo.

## 21.81 A regra `completionfeedback`

A segunda regra exige que o professor tenha publicado feedback:

```php
case 'completionfeedback':
    $answer = $DB->get_record('checkpoint_answers', [
        'checkpointid' => $this->cm->instance,
        'userid' => $this->userid,
    ]);

    return !empty($answer->feedback)
        ? COMPLETION_COMPLETE
        : COMPLETION_INCOMPLETE;
```

Na prática, talvez seja melhor utilizar um campo explícito `feedbackpublished` do que testar string vazia, porque professor pode publicar feedback sem texto e apenas com arquivo ou rubrica. A modelagem do domínio precisa ser coerente com a regra pedagógica.

## 21.82 Não use presença de grade como sinônimo de feedback

Pode existir nota sem feedback e feedback sem nota. Se a regra se chama "receber feedback", teste a existência do feedback definido pelo domínio, não simplesmente `grade !== null`.

Se a instituição considera nota uma forma suficiente de feedback, então a regra deveria ter outro nome e outra descrição.

## 21.83 Combinar regras customizadas com regras padrão

O professor pode ativar `completionsubmit`, `completionfeedback`, visualização e nota ao mesmo tempo. O Completion subsystem combina as condições de acordo com o modelo suportado pelo curso e pela atividade.

O plugin não deveria fazer um `if` gigante duplicando todas as regras padrão para decidir completion. A classe customizada responde apenas pelas regras que pertencem ao módulo.

## 21.84 Completion e edição posterior

Se o estudante pode editar uma resposta depois de completa, defina se a edição mantém a condição satisfeita. Para `completionsubmit`, provavelmente sim enquanto o registro continuar existindo.

Se a edição invalida o feedback anterior, talvez `completionfeedback` precise voltar para incompleto. Nesse caso o service que salva nova versão da resposta deve marcar o feedback anterior como desatualizado e pedir novo cálculo.

Essa é uma decisão de negócio que Completion apenas representa.

## 21.85 Testando Gradebook

Em PHPUnit, crie curso, atividade e usuários, aplique nota pelo service do plugin e depois consulte o Gradebook para verificar item, máximo, escala e grade publicada.

Teste também zero, `null`, alteração do máximo, regrade e override quando o comportamento do plugin precisa respeitá-lo.

Não limite o teste a verificar a coluna interna da atividade, porque o contrato que estamos testando é justamente a integração com o Gradebook.

## 21.86 Testando Completion

Para completion, crie a atividade com cada regra isolada e depois com as duas combinadas. Verifique estado antes do envio, depois do envio, depois do feedback e depois da remoção do feedback quando esse caminho existir.

Teste também um usuário diferente do usuário logado para garantir que a implementação não depende acidentalmente de `$USER`.

Esse teste pega uma quantidade surpreendente de bugs.

## 21.87 Testando backup e restore

Crie uma atividade com nota, duas regras customizadas, resposta, feedback e estado de completion, faça backup e restaure em outro curso. Depois verifique configuração do grade item, campos de completion e dados do usuário conforme a opção de backup.

Esse é o tipo de teste que identifica IDs copiados incorretamente e campos esquecidos na estrutura de backup.

## 21.88 Erros comuns no Gradebook

Os erros mais recorrentes são gravar direto em `{grade_grades}`, usar zero para representar ausência de nota, não atualizar o grade item quando o máximo muda, não implementar `update_grades()`, ignorar escala, sobrescrever override manual e confundir nota interna com finalgrade.

Outro erro frequente é publicar nota antes de a transação do domínio terminar e depois falhar no banco local, deixando o Gradebook com um estado que a atividade não consegue reconstruir.

## 21.89 Erros comuns em Completion

Os erros mais comuns são usar `$USER` em cálculo de outro usuário, marcar complete diretamente quando existem múltiplas regras, esquecer de recalcular depois que o estado muda, implementar callback legado em plugin novo, não colocar configuração em `cm_info`, não usar nomes sufixados no formulário moderno e criar regra customizada que duplica conclusão por visualização ou nota.

Também aparece muito o erro de atualizar apenas no caminho que completa e esquecer o caminho que deixa de completar.

## 21.90 Exercício final do capítulo

Evolua o `mod_checkpoint` para uma atividade avaliativa completa. O professor poderá escolher nota máxima numérica ou escala, e o plugin deve criar o grade item correspondente usando `grade_update()`.

A resposta do estudante será armazenada em `checkpoint_answers`. O professor poderá registrar nota e feedback, e essa avaliação deve atualizar o Gradebook sem escrever diretamente em tabelas de notas.

Implemente `checkpoint_grade_item_update()`, `checkpoint_get_user_grades()` e `checkpoint_update_grades()`. Garanta que `rawgrade = null` represente ausência de nota e que zero continue sendo uma nota válida.

Depois implemente duas regras customizadas de completion em `classes/completion/custom_completion.php`:

```
completionsubmit
completionfeedback
```

A primeira fica completa quando existe resposta, enquanto a segunda fica completa quando o feedback foi publicado. Adicione os controles em `mod_form.php`, grave as configurações na tabela principal e exponha os valores por `get_coursemodule_info()`.

Quando a resposta for enviada ou removida, chame `completion_info->update_state()` com `COMPLETION_UNKNOWN` para o estudante correspondente. Faça o mesmo quando o feedback for publicado, alterado ou removido.

Teste ainda a combinação com as regras padrão de visualização e nota, incluindo nota de aprovação. O professor deve conseguir configurar, por exemplo, que o estudante precisa visualizar, enviar, receber feedback e atingir nota de aprovação para concluir.

Por fim faça backup e restore da atividade para outro curso, altere a nota máxima depois de já existirem avaliações, teste uma nota sobrescrita manualmente no Gradebook e execute os testes de completion para um usuário diferente do `$USER` atual.

Se tudo continuar coerente, a atividade não está apenas mostrando uma nota e um check verde. Ela está integrada aos dois subsistemas do Moodle que administram esses estados.

## 21.91 O que precisa ficar deste capítulo

Gradebook e Completion se encontram em atividades, mas não são a mesma coisa. A atividade produz ou recebe a avaliação e publica `rawgrade` pela Gradebook API, enquanto o Gradebook mantém item, grade final, categorias, cálculos, overrides e regrade. A atividade informa seus critérios de conclusão e o Completion subsystem mantém o estado oficial utilizado por curso, relatórios e Availability.

A tabela do plugin continua sendo fonte para os dados de domínio que permitem reconstruir nota e regras, mas ela não substitui `{grade_items}`, `{grade_grades}` nem `{course_modules_completion}`. Da mesma forma, escrever diretamente nessas tabelas não é uma integração, é apenas contornar as APIs que mantêm o restante do Moodle coerente.

Quando o plugin cria grade item corretamente, consegue reenviar suas notas, respeita override, utiliza a classe moderna `custom_completion`, atualiza o estado quando os fatos mudam e testa restore, ele passa a se comportar como parte real do Moodle e não como uma atividade isolada que por acaso exibe um número e um checkbox.

## REFERÊNCIAS

MOODLE. Moodle Developer Resources. Activity completion API. Disponível em: https://moodledev.io/docs/4.5/apis/core/activitycompletion. Acesso em setembro de 2026.

MOODLE. Moodle Developer Resources. Activity modules. Disponível em: https://moodledev.io/docs/5.1/apis/plugintypes/mod. Acesso em setembro de 2026.

MOODLE. Moodle PHP Documentation. Grade API e `grade_update()`. Disponível em: https://phpdoc.moodledev.io/main/da/d09/group__core__grades.html. Acesso em setembro de 2026.

MOODLE. Moodle PHP Documentation. `grade_item`. Disponível em: https://phpdoc.moodledev.io/5.0/d0/d8b/classgrade__item.html. Acesso em setembro de 2026.

MOODLE. Moodle PHP Documentation. `grade_grade`. Disponível em: https://phpdoc.moodledev.io/5.0/dc/df3/classgrade__grade.html. Acesso em setembro de 2026.

MOODLE. Moodle PHP Documentation. `core_completion\\activity_custom_completion`. Disponível em: https://phpdoc.moodledev.io/. Acesso em setembro de 2026.

MOODLE. Moodle source code. `mod/choice/classes/completion/custom_completion.php`. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/choice/classes/completion/custom_completion.php. Acesso em setembro de 2026.

MOODLE. Moodle source code. `mod/assign/lib.php`. Implementação de Gradebook callbacks. Disponível em: https://github.com/moodle/moodle/blob/main/public/mod/assign/lib.php. Acesso em setembro de 2026.


{% endraw %}
