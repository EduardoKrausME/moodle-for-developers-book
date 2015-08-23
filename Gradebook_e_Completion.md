# GRADEBOOK E COMPLETION

Nota e conclusão aparecem juntas em quase toda atividade avaliativa do Moodle, mas são subsistemas diferentes e precisam continuar diferentes dentro do código. O Gradebook responde qual é a nota do usuário, qual faixa de valores é válida, qual escala está sendo usada, se aquela nota foi sobrescrita manualmente e como ela participa dos cálculos do curso, enquanto Completion responde se uma atividade foi concluída e por quais regras essa conclusão aconteceu. Uma atividade pode ter nota sem usar conclusão, pode ter conclusão sem nota e pode combinar os dois, por exemplo exigindo que o estudante receba uma nota para concluir.

Essa separação evita um erro muito comum em plugins próprios, que é criar uma coluna `completed` e outra `grade` na tabela do módulo e começar a tratar aquilo como se o Moodle não possuísse Gradebook e Completion API. No começo parece prático porque toda regra está dentro do plugin, mas o professor não vê a nota corretamente no livro, a conclusão não aparece na página do curso, Availability API não consegue usar o estado, backup e restore ficam inconsistentes e qualquer alteração feita no Gradebook deixa o plugin com uma verdade paralela.

Neste capítulo vamos continuar usando o `mod_checkpoint` criado em Módulos de Atividade. Agora ele receberá integração completa com o Gradebook e duas regras customizadas de conclusão, uma exigindo que o estudante envie uma resposta e outra exigindo que essa resposta receba feedback do professor. Com isso conseguimos acompanhar o ciclo inteiro, desde a criação do grade item até a atualização da conclusão quando a resposta é enviada, editada, avaliada ou perde uma condição que antes estava satisfeita.

## Gradebook não é a tabela de notas do seu plugin

Um módulo pode possuir tabelas próprias para tentativas, respostas, avaliações ou pontuações internas, mas o Gradebook é a camada oficial de notas do curso. Isso significa que o plugin pode guardar dados necessários para calcular uma nota, porém a nota que deve aparecer no livro precisa ser enviada pela Gradebook API.

No nosso `mod_checkpoint`, a tabela `checkpoint_answers` pode guardar a avaliação feita pelo professor porque esse registro também pertence ao domínio da atividade, mas depois que a nota é definida ela precisa ser publicada no Gradebook. Não existe problema em persistir a origem da nota no plugin, o problema é acreditar que o Moodle vai procurar essa coluna sozinho.

## A arquitetura do Gradebook

A arquitetura do Gradebook separa o que está sendo avaliado das notas individuais recebidas pelos usuários. Em termos simples, `{grade_items}` representa colunas do livro de notas e `{grade_grades}` representa as notas dos usuários em cada uma dessas colunas.

Uma atividade normalmente cria um grade item. Se o `mod_checkpoint` vale 100 pontos, o Gradebook pode ter um item chamado "Checkpoint da Unidade 3" e cada estudante terá um registro associado àquele item quando receber uma nota.

Essa separação permite que configuração do item, como máximo, mínimo, escala e categoria, seja tratada uma vez, enquanto notas individuais ficam associadas por usuário.

## `grade_items`

A tabela `{grade_items}` contém a definição do item de nota. Entre os campos relevantes aparecem curso, nome do item, tipo, módulo, instância, número do item, tipo de nota, valor mínimo, valor máximo, escala, categoria, cálculo, visibilidade e várias outras propriedades utilizadas pelo Gradebook.

Para um activity module comum, os campos conceituais mais importantes são:

```
itemtype     = mod
itemmodule   = checkpoint
iteminstance = checkpoint.id
itemnumber   = 0
```

O `itemnumber` permite que uma atividade possua mais de um item de nota, embora a maioria dos módulos simples utilize apenas zero. Se o plugin possui nota principal e outra nota independente, ele pode trabalhar com múltiplos itens, mas isso aumenta bastante o contrato de atualização e precisa ser uma necessidade real.

## `grade_grades`

A tabela `{grade_grades}` guarda uma linha por usuário e grade item. Ela possui valores como `rawgrade`, `finalgrade`, flags de override, bloqueio, ocultação e outras informações processadas pelo Gradebook.

Não use essa tabela como se fosse uma tabela comum do plugin. A presença de `rawgrade` e `finalgrade` costuma tentar o desenvolvedor a fazer um `update_record()`, mas isso ignora regrade, overrides, histórico e cálculos.

Se a nota pertence à atividade, a atividade informa o valor usando a API e deixa o Gradebook decidir como aquilo se transforma no estado final.

## `rawgrade` e `finalgrade`

`rawgrade` representa o valor bruto fornecido pela fonte da nota, enquanto `finalgrade` é o valor final depois que o Gradebook aplica transformações, cálculos e outros mecanismos do curso.

Uma atividade não deveria escrever `finalgrade` diretamente. Ela informa o valor bruto correspondente ao que calculou e o Gradebook cuida do restante.

Essa diferença fica especialmente importante quando o professor usa fatores, offset, cálculo, categoria ou alguma outra configuração no livro. O plugin não deveria tentar recalcular essas coisas por fora.

## Override manual

O professor pode sobrescrever uma nota manualmente no Gradebook. Quando isso acontece, a atividade não deveria simplesmente atropelar o valor toda vez que chama `grade_update()` como se a interface de notas não existisse.

O Gradebook conhece o estado de override e preserva o comportamento esperado. Esse é mais um motivo para utilizar a API em vez de escrever diretamente nas tabelas.

Se o plugin precisa informar ao professor que existe uma nota sobrescrita, consulte o estado pela API ou pelos objetos de grade adequados, mas não tente desmarcar override silenciosamente porque a atividade recalculou uma pontuação.

## Grade categories

Itens de nota podem pertencer a categorias do Gradebook. Categorias agrupam avaliações e participam de agregações, pesos e cálculos do curso.

O plugin normalmente não deveria criar uma categoria própria apenas porque quer "organizar" a coluna. O professor ou a configuração do curso pode mover o item para a categoria desejada.

Se uma solução institucional realmente precisa criar categorias automaticamente, faça isso conscientemente com a Gradebook API e entenda o impacto em cálculo, pesos e configuração do professor. Um módulo simples normalmente só cria seu próprio item.

## `FEATURE_GRADE_HAS_GRADE`

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

## O campo `grade` na atividade

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

## `grade_update()`

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

## Criando o grade item

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

## Criando o grade item no `add_instance()`

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

## Atualizando o grade item no `update_instance()`

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

## Alterar nota máxima depois que existem notas

Mudar `grademax` em uma atividade que já possui notas precisa ser tratado com cuidado. O Gradebook possui mecanismos para trabalhar com escalonamento e regrade, mas a atividade precisa entender o significado pedagógico da mudança.

Se um professor muda de 100 para 20, ele quer converter os valores mantendo percentual ou quer reinterpretar as notas existentes? Nem sempre essas duas coisas significam a mesma coisa.

Não implemente uma divisão manual em todas as notas apenas porque o máximo mudou. Verifique o comportamento do Gradebook e a API disponível para a versão suportada.

## Atualizando uma nota

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

## Atualizando várias notas

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

## `rawgrade = null`

`rawgrade = null` significa que o usuário está sem nota. Isso é diferente de nota zero.

```php
$grade = [
    'userid' => $userid,
    'rawgrade' => null,
];
```

Zero é uma nota válida e pode representar reprovação. `null` representa ausência de avaliação.

Essa diferença parece óbvia, mas plugins que usam `empty()` de forma indiscriminada costumam transformar zero em ausência de nota e geram resultados incorretos.

## Omitir um campo não é o mesmo que enviar `null`

Na Gradebook API, uma propriedade ausente normalmente significa "não altere esse valor", enquanto alguns campos explicitamente enviados como `null` possuem semântica própria.

Isso é importante em atualizações parciais. Se você não pretende tocar no feedback existente, não monte um array com `feedback => null` por reflexo.

Defina somente o que a operação realmente está alterando.

## Feedback

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

## Escalas

Quando a atividade usa uma escala, `gradetype` deve ser `GRADE_TYPE_SCALE` e `scaleid` identifica a escala.

Em vários módulos a convenção é armazenar `grade = -$scaleid`, daí a conversão:

```php
$itemdetails['gradetype'] = GRADE_TYPE_SCALE;
$itemdetails['scaleid'] = -$checkpoint->grade;
```

Escala não é apenas nota numérica com labels. A ordem e o significado dos itens pertencem à escala, portanto qualquer conversão interna precisa ser feita com cuidado.

## Nota mínima e nota máxima

Em nota numérica, `grademin` e `grademax` definem o intervalo aceito pelo item.

```
$itemdetails['gradetype'] = GRADE_TYPE_VALUE;
$itemdetails['grademin'] = 0;
$itemdetails['grademax'] = 100;
```

A atividade deve garantir que o valor bruto enviado faça sentido dentro desse intervalo. Se sua lógica interna calcula 132 em uma atividade de 100 pontos, não confie no Gradebook como lugar para corrigir um algoritmo quebrado.

## Nota de aprovação

O grade item pode possuir `gradepass`, e essa configuração pode participar de Completion e relatórios. Em muitos casos o professor configura isso no Gradebook ou por elementos do próprio formulário da atividade.

Não confunda nota máxima com nota de aprovação. Uma atividade de 100 pontos pode exigir 60 para aprovação e ainda assim registrar notas abaixo disso normalmente.

Se a conclusão estiver configurada para exigir nota de aprovação, o estado de completion pode distinguir sucesso e falha conforme as regras do core.

## `finalgrade`

A nota final calculada pode ser diferente do valor bruto enviado pelo módulo. O Gradebook pode aplicar transformações, cálculos, overrides e agregações.

Quando o plugin precisa exibir a nota oficial do curso, não assuma que sua tabela interna continua sendo a melhor fonte. Dependendo do contexto, consulte o Gradebook ou utilize as APIs que devolvem a nota final.

Quando o plugin precisa recalcular a origem da nota, aí a tabela própria continua sendo a fonte para reconstruir o `rawgrade`.

## `grade_item`

A classe `grade_item` representa um item do Gradebook e oferece métodos para carregar configuração, consultar grades, verificar overrides, trabalhar com visibilidade e disparar regrade.

Ela é útil quando você precisa manipular detalhes do item além de uma simples publicação por `grade_update()`, mas não transforme toda operação em acesso direto ao objeto se a função de alto nível já resolve.

A regra geral continua sendo preferir a API mais alta que atende seu caso e descer de nível apenas quando existe necessidade real.

## `grade_grade`

`grade_grade` representa a nota de um usuário para determinado item. Ela expõe informações como `rawgrade`, `finalgrade`, override e lock.

É uma classe útil para leitura e para fluxos internos do Gradebook, mas activity modules normalmente devem continuar enviando suas notas por `grade_update()` em vez de persistir `grade_grade` manualmente.

A existência de uma classe de ORM não transforma a tabela em API de gravação do módulo.

## Notas bloqueadas

O Gradebook pode bloquear notas ou itens. Se uma nota foi bloqueada, uma atividade não deveria tentar contornar isso escrevendo diretamente no banco.

O resultado de `grade_update()` e o estado do item precisam ser respeitados. Se existe uma ação administrativa que desbloqueia, ela pertence ao fluxo do Gradebook e à autorização correspondente.

## Regrade

Regrade é o processo de recalcular notas finais quando alguma dependência muda. Alterar máximo, fórmula, categoria ou outros elementos pode fazer o Gradebook marcar itens como necessitando atualização.

O módulo não deve sair percorrendo `{grade_grades}` recalculando `finalgrade`. O core possui `grade_regrade_final_grades()` e mecanismos internos para respeitar a ordem de dependências entre itens.

Quando sua atividade muda a origem das notas, envie novamente os valores brutos. O Gradebook resolve o que pertence ao livro.

## `checkpoint_get_user_grades()`

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

## `checkpoint_update_grades()`

Outro callback comum é responsável por reenviar notas ao Gradebook:

```php
function checkpoint_update_grades($checkpoint, $userid = 0, $nullifnone = true) {
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

## Por que a atividade precisa conseguir reconstruir a nota

Se a única cópia da nota estivesse em `{grade_grades}`, o módulo perderia capacidade de recomputar quando suas regras mudassem. Por isso a atividade geralmente mantém a informação de origem ou os dados a partir dos quais a nota pode ser recalculada.

No `checkpoint`, a avaliação salva em `checkpoint_answers.grade` é o dado do domínio. O Gradebook recebe a projeção oficial dessa nota.

Essa é a mesma ideia de outras partes do Moodle: evite transformar uma projeção em única fonte de verdade quando o domínio que a produz pertence ao plugin.

## Excluindo o grade item

Quando uma atividade deixa de possuir nota ou é excluída, o grade item precisa ser removido pelo contrato do Gradebook.

Uma implementação pode utilizar `grade_update()` com a propriedade `deleted` nos detalhes do item, conforme o fluxo da versão suportada. O importante é não apagar diretamente de `{grade_items}` e `{grade_grades}`.

Também não remova notas de usuários apenas porque o professor alterou temporariamente uma configuração. Defina se a atividade deixou de ser avaliativa ou se a nota apenas está oculta.

## Activity Module e Gradebook

A integração completa geralmente passa por quatro momentos. Criação da instância cria o grade item, edição atualiza sua configuração, avaliação envia notas e exclusão remove ou marca o item conforme a API.

Esse ciclo deve permanecer coerente com backup e restore. Uma atividade restaurada em outro curso recebe um novo item relacionado à nova instância, não uma cópia literal do ID antigo do Gradebook.

## Advanced Grading não é Gradebook

Rubricas, guias de avaliação e outros métodos avançados utilizam a Advanced Grading API. Eles ajudam o professor a produzir uma nota, mas a nota final ainda vai para o Gradebook.

Não confunda a interface utilizada para calcular a avaliação com o lugar onde a nota oficial do curso é armazenada e agregada.

Essa distinção vai ser importante se o `checkpoint` crescer e passar a utilizar rubrica, porque o item do Gradebook continua existindo do mesmo jeito.

## Completion

## O que é Activity Completion

Activity Completion representa o estado de conclusão de uma atividade para um usuário. No Moodle 3.5 o professor pode utilizar marcação manual, conclusão por visualização, conclusão por nota e regras específicas fornecidas pelo próprio módulo.

Completion não é a mesma coisa que disponibilidade e também não é a mesma coisa que nota. Uma atividade pode estar concluída sem nota, pode possuir nota e continuar incompleta ou pode servir de condição para liberar outra atividade através das regras de acesso do curso.

## Declarando suporte em `supports()`

Um módulo informa os recursos de completion em sua função `modulename_supports()` de `lib.php`.

```php
function checkpoint_supports($feature) {
    switch ($feature) {
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return true;
        case FEATURE_COMPLETION_HAS_RULES:
            return true;
        case FEATURE_GRADE_HAS_GRADE:
            return true;
        default:
            return null;
    }
}
```

Use somente as features que a atividade realmente implementa.

## Conclusão por visualização

Quando o módulo declara `FEATURE_COMPLETION_TRACKS_VIEWS`, uma visualização válida pode ser registrada com `completion_info`.

```php
$completion = new completion_info($course);
$completion->set_module_viewed($cm);
```

Faça isso somente depois de validar que o usuário realmente pode acessar a atividade.

## Conclusão por nota

Quando o módulo oferece nota através do Gradebook e declara `FEATURE_GRADE_HAS_GRADE`, o Moodle pode utilizar a existência da nota como condição de conclusão. O plugin não precisa duplicar essa regra em uma condição própria.

Zero é nota. Ausência de nota deve continuar sendo representada como ausência de nota, não como zero.

## Regras customizadas no Moodle 3.5

No Moodle 3.5 regras customizadas são implementadas pelo contrato clássico dos módulos. O formulário da atividade adiciona os campos de configuração através de `add_completion_rules()` e informa se alguma regra está ativa com `completion_rule_enabled()`.

Exemplo simplificado:

```php
public function add_completion_rules() {
    $mform = $this->_form;

    $mform->addElement('checkbox', 'completionsubmit', '',
        get_string('completionsubmit', 'checkpoint'));
    $mform->addElement('checkbox', 'completionfeedback', '',
        get_string('completionfeedback', 'checkpoint'));

    return array('completionsubmit', 'completionfeedback');
}

public function completion_rule_enabled($data) {
    return !empty($data['completionsubmit']) ||
        !empty($data['completionfeedback']);
}
```



## `checkpoint_get_completion_state()`

O cálculo das regras customizadas é feito por uma função no `lib.php` com o nome do módulo seguido de `_get_completion_state()`.

```php
function checkpoint_get_completion_state($course, $cm, $userid, $type) {
    global $DB;

    $checkpoint = $DB->get_record('checkpoint', array('id' => $cm->instance),
        'id, completionsubmit, completionfeedback', MUST_EXIST);

    $conditions = array();

    if (!empty($checkpoint->completionsubmit)) {
        $conditions[] = $DB->record_exists('checkpoint_answers', array(
            'checkpointid' => $checkpoint->id,
            'userid' => $userid,
        ));
    }

    if (!empty($checkpoint->completionfeedback)) {
        $conditions[] = $DB->record_exists_select('checkpoint_answers',
            'checkpointid = :checkpointid AND userid = :userid AND feedback IS NOT NULL',
            array('checkpointid' => $checkpoint->id, 'userid' => $userid));
    }

    if (!$conditions) {
        return $type;
    }

    if ($type == COMPLETION_AND) {
        return !in_array(false, $conditions, true);
    }

    return in_array(true, $conditions, true);
}
```

O parâmetro `$userid` é o usuário cuja conclusão está sendo calculada; não use `$USER` no lugar dele, porque relatórios e outros fluxos podem calcular o estado de outra pessoa.

## Atualizando o estado

Quando um fato que participa da conclusão muda, use `completion_info` para pedir atualização do estado em vez de escrever diretamente em `{course_modules_completion}`.

```php
$completion = new completion_info($course);
$completion->update_state($cm, COMPLETION_UNKNOWN, $userid);
```

Isso vale tanto para o caminho que torna a atividade completa quanto para o caminho que pode deixá-la incompleta novamente.

## Completion e Gradebook

Gradebook e Completion se encontram, mas continuam sendo subsistemas diferentes. A atividade publica notas pela Gradebook API, enquanto a conclusão usa as regras configuradas na atividade e o estado oficial mantido pelo core.

Não grave diretamente em `{grade_grades}` nem em `{course_modules_completion}`. O fato de as tabelas serem visíveis no banco não transforma detalhes internos em API pública.

## Backup e restore

Campos como `completionsubmit` e `completionfeedback` pertencem à configuração da atividade e precisam entrar no backup e restore junto da instância. Os estados de conclusão dos usuários são tratados pelo mecanismo de backup do curso conforme as opções escolhidas; o módulo não deve inventar uma cópia paralela desse estado.

## Testes

Teste a nota zero, ausência de nota, atualização de grade item, conclusão por visualização, cada regra customizada isoladamente, as regras combinadas e um usuário diferente do usuário atualmente logado. Também teste backup e restore da configuração das regras.

## Exercício final do capítulo

Evolua `mod_checkpoint` para publicar notas no Gradebook e oferecer duas regras de conclusão: envio da resposta e recebimento de feedback. Implemente os campos no `mod_form.php`, declare `FEATURE_COMPLETION_HAS_RULES`, implemente `checkpoint_get_completion_state()` e peça atualização do estado quando resposta ou feedback mudar.

## O que precisa ficar deste capítulo

No Moodle 3.5, Gradebook deve ser integrado por suas APIs e a conclusão customizada de módulos usa `add_completion_rules()`, `completion_rule_enabled()` e o callback `modulename_get_completion_state()`.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
