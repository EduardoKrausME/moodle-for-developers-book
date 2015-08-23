# PROJETO FINAL

Chegar ao último capítulo de um livro sobre desenvolvimento de plugins Moodle e terminar criando mais uma classe isolada seria desperdiçar tudo o que foi construído até aqui. O projeto final precisa fazer o contrário, ele deve obrigar você a tomar decisões que parecem pequenas quando cada API é estudada separadamente, mas que passam a depender umas das outras quando o plugin vira um produto de verdade.

Por isso este capítulo não apresenta uma API nova. Tudo o que vamos usar já apareceu antes, e essa é justamente a proposta. O desafio agora é escolher o tipo de plugin correto, desenhar o banco sem criar dependências frágeis, definir capabilities coerentes, separar interface de regra de negócio, usar Gradebook e Completion sem duplicar estado, integrar Files API, Events, Tasks, Cache, Web Services, Backup e testes, fechar CI, gerar o ZIP e provar que o pacote sobrevive a instalação limpa, upgrade e restauração em outra instalação.

O projeto será o `mod_checkpoint`, que apareceu em vários capítulos como exemplo parcial. Agora ele deixa de ser exemplo e vira uma atividade completa. O professor cria um checkpoint dentro do curso, informa instruções, data limite e valor da atividade, o aluno envia uma evidência em texto e opcionalmente um arquivo, o professor avalia, registra feedback e nota, e o Moodle atualiza Gradebook e Completion. O plugin também oferece uma pequena visão de acompanhamento, notificação assíncrona, consulta por Web Service, backup/restore e uma suíte de testes suficiente para impedir que uma alteração simples destrua o fluxo principal.

A regra mais importante deste capítulo é simples. Não adicione uma API apenas para poder dizer que ela foi usada. Events, cache, task ou Web Service só entram se existir uma responsabilidade real para eles. Um projeto final bom demonstra que você sabe usar as APIs do Moodle, mas demonstra também que sabe quando não usar cada uma.

## O objetivo do projeto

O `mod_checkpoint` representa uma atividade de verificação de entrega. Ele pode ser usado para um marco de projeto, uma evidência de participação, um documento simples, uma etapa de estágio, uma entrega prática ou qualquer situação em que o aluno precise registrar que chegou a determinado ponto e o professor precise avaliar essa entrega.

A atividade precisa ser simples para o aluno, previsível para o professor e integrada ao curso. O aluno não deveria aprender uma nova plataforma dentro do Moodle apenas para enviar uma evidência, e o professor não deveria abrir cinco relatórios diferentes para descobrir quem enviou, quem está atrasado e quem já foi avaliado.

## A especificação funcional vem antes do código

Antes de criar a pasta `mod/checkpoint`, escreva o que o produto faz. Uma especificação curta para esta versão pode ser:

```
Professor
    cria a atividade
    define instruções e data limite
    define valor da atividade
    escolhe se aceita texto, arquivo ou ambos
    visualiza entregas pendentes
    avalia entrega
    registra nota e feedback
    pode reabrir uma entrega

Aluno
    abre a atividade
    visualiza instruções e prazo
    envia texto e/ou arquivo
    visualiza estado da entrega
    visualiza feedback e nota quando liberados

Sistema
    registra eventos relevantes
    atualiza Gradebook
    atualiza Completion
    envia notificação após avaliação
    oferece consulta de estado por Web Service
    participa de backup e restore
```

Isso já é suficiente para começar a arquitetura. Se a especificação muda toda vez que um arquivo é aberto, o problema ainda não está claro o bastante para o código.

## Critérios de aceitação

A especificação descreve intenção, enquanto critérios de aceitação permitem verificar se o produto terminou. Para este projeto, alguns critérios são obrigatórios.

Um aluno matriculado e com capability de envio consegue criar sua primeira entrega, alterar a entrega enquanto ela estiver aberta e não consegue avaliar a própria entrega. Um professor com capability de avaliação consegue listar entregas do contexto correto, registrar nota e feedback, enquanto um professor sem permissão naquele curso não consegue acessar a tela por URL direta.


## Escolhendo o tipo correto de plugin

Este projeto é um `mod`, e não um `local`, porque a funcionalidade precisa existir como atividade do curso, possuir `course_module`, contexto de módulo, participação em conclusão, Gradebook, backup de atividade e acesso direto pelo aluno dentro da seção do curso.

É exatamente aqui que vale lembrar a provocação feita no começo do livro sobre usar `local` para quase tudo. `local` é excelente quando o comportamento é institucional, transversal ou não precisa de uma instância dentro do curso. Neste caso, porém, o objeto pedagógico precisa aparecer no curso, então transformar isso em `local` criaria trabalho extra para imitar coisas que `mod` já resolve nativamente.

## O nome do componente

O Frankenstyle component será:

```
mod_checkpoint
```

A pasta será:

```
mod/checkpoint
```

O componente continua sendo `mod_checkpoint`, e a regra de negócio nunca deve depender de montar caminhos físicos na mão.

## Estrutura inicial de diretórios

Uma estrutura de produção para a primeira versão pode ser:

```
mod/checkpoint/
    amd/
        src/
            dashboard.js
    backup/
        moodle2/
            backup_checkpoint_activity_task.class.php
            backup_checkpoint_stepslib.php
            restore_checkpoint_activity_task.class.php
            restore_checkpoint_stepslib.php
    classes/
        event/
            submission_created.php
            submission_graded.php
        form/
            submission_form.php
            grade_form.php
        output/
            student_status.php
        task/
            send_grade_notification.php
        local/
            manager.php
    db/
        access.php
        caches.php
        install.xml
        services.php
        tasks.php
        upgrade.php
    lang/
        en/
            checkpoint.php
        pt_br/
            checkpoint.php
    templates/
        student_status.mustache
    tests/
        behat/
            checkpoint.feature
        generator/
            lib.php
        manager_test.php
    externallib.php
    index.php
    lib.php
    mod_form.php
    settings.php
    version.php
    view.php
```

Essa árvore não é um objetivo em si. Cada diretório existe porque há uma responsabilidade concreta atrás dele.

## O modelo de dados

O projeto precisa de uma tabela para a configuração da atividade e outra para a entrega do aluno. A tabela principal `checkpoint` acompanha o padrão de activity modules e a segunda tabela armazena estado por usuário.

Uma modelagem inicial pode ser:

```
checkpoint
    id
    course
    name
    intro
    introformat
    duedate
    grade
    allowtext
    allowfile
    completionsubmit
    completiongrade
    timecreated
    timemodified

checkpoint_submission
    id
    checkpointid
    userid
    status
    submissiontext
    submissionformat
    grade
    feedback
    feedbackformat
    graderid
    timecreated
    timemodified
    timegraded
```

Não coloque nome do aluno, email ou nome do curso na segunda tabela. Guarde IDs e obtenha os demais dados das entidades corretas.

## Índices e unicidade

A regra de negócio desta versão diz que cada usuário possui uma entrega atual por checkpoint. Isso precisa aparecer no banco.

```
UNIQUE(checkpointid, userid)
INDEX(checkpointid, status)
INDEX(userid)
INDEX(graderid)
```


## Não invente uma tabela para cada estado

Pendente, enviado, avaliado e reaberto são estados da mesma entrega, não quatro entidades. Criar `checkpoint_pending`, `checkpoint_graded` e `checkpoint_reopened` transformaria transições simples em movimentação física de linhas.

Uma coluna `status` com constantes bem definidas é mais previsível.

```
final class submission_status {
    public const DRAFT = 'draft';
    public const SUBMITTED = 'submitted';
    public const GRADED = 'graded';
    public const REOPENED = 'reopened';
}
```

## `version.php`

A versão do plugin precisa refletir a política de compatibilidade definida em Compatibilidade e Manutenção entre Versões.

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'mod_checkpoint';
$plugin->version = 2018051700;
$plugin->requires = 2018051700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

Não copie números de exemplo para produção sem validar a branch real que será suportada.

## Upgrade path desde o primeiro release

Mesmo a versão 1.0 precisa nascer pensando no 1.1. Se amanhã surgir `feedbackfiles`, `latepolicy` ou uma nova coluna, a mudança deverá entrar em `db/upgrade.php` com savepoint correto.

O erro comum é tratar `install.xml` como schema vivo e editar apenas ele depois que o plugin já foi distribuído. Isso corrige instalação limpa e quebra upgrade de quem já está usando o plugin.

## `settings.php`

Configuração global só deve guardar o que realmente vale para todas as instâncias. Neste projeto podemos ter um limite padrão de arquivo e uma configuração global para notificação após avaliação.

```php
$settings->add(new admin_setting_configcheckbox(
    'mod_checkpoint/notifygrade',
    get_string('notifygrade', 'mod_checkpoint'),
    get_string('notifygrade_desc', 'mod_checkpoint'),
    1
));
```

Não coloque data limite, nota máxima ou instruções em settings globais, porque esses dados pertencem à instância da atividade.

## Capabilities

Uma primeira versão pode trabalhar com:

```
mod/checkpoint:addinstance
mod/checkpoint:view
mod/checkpoint:submit
mod/checkpoint:grade
mod/checkpoint:manage
```

`submit` pertence ao estudante, `grade` ao professor e `manage` fica para operações administrativas da atividade. Não use `is_siteadmin()` para substituir autorização.

## O contexto correto

Quase tudo neste plugin opera em `context_module`.

```php
$cm = get_coursemodule_from_id('checkpoint', $id, 0, false, MUST_EXIST);
$context = context_module::instance($cm->id);

require_login($cm->course, false, $cm);
require_capability('mod/checkpoint:view', $context);
```

A capability precisa ser verificada no contexto onde a ação realmente acontece. Verificar no contexto do sistema porque é mais fácil é uma forma clássica de abrir permissões demais.

## `mod_form.php`

O formulário de configuração da atividade deve conter apenas propriedades da instância.

```php
class mod_checkpoint_mod_form extends moodleform_mod {
    public function definition() {
        $mform = $this->_form;

        $mform->addElement('text', 'name', get_string('checkpointname', 'mod_checkpoint'));
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        $this->standard_intro_elements();

        $mform->addElement('date_time_selector', 'duedate', get_string('duedate', 'mod_checkpoint'), [
            'optional' => true,
        ]);

        $mform->addElement('checkbox', 'allowtext', get_string('allowtext', 'mod_checkpoint'));
        $mform->addElement('checkbox', 'allowfile', get_string('allowfile', 'mod_checkpoint'));

        $this->standard_grading_coursemodule_elements();
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
```

## Validando configuração

Se texto e arquivo forem ambos desativados, o aluno não terá o que enviar. Essa regra pertence à validação do formulário.

```php
public function validation($data, $files) {
    $errors = parent::validation($data, $files);

    if (empty($data['allowtext']) && empty($data['allowfile'])) {
        $errors['allowtext'] = get_string('error:nosubmissiontype', 'mod_checkpoint');
    }

    return $errors;
}
```

Validação de formulário não substitui autorização no endpoint que processa a ação.

## Os callbacks de instância

`checkpoint_add_instance()`, `checkpoint_update_instance()` e `checkpoint_delete_instance()` continuam sendo parte do contrato de um activity module.

O ideal é manter esses callbacks pequenos e transferir regra para classes testáveis.

```php
function checkpoint_add_instance(stdClass $data, $mform = null) {
    return \mod_checkpoint\local\manager::create_instance($data);
}
```

## Uma classe de serviço para regra de negócio

A classe `manager` centraliza as transições importantes.

```php
namespace mod_checkpoint\local;

final class manager {
    public static function submit(int $checkpointid, int $userid, array $data): int {
        // Validar, persistir, arquivos, event e completion.
    }

    public static function grade(int $submissionid, int $graderid, float $grade, string $feedback) {
        // Persistir avaliação, Gradebook, event e task.
    }

    public static function reopen(int $submissionid) {
        // Alterar estado e invalidar dados derivados.
    }
}
```

Isso permite testar regra sem precisar dirigir toda a interface em cada teste.

## Transações

Enviar uma entrega pode envolver tabela, Files API, Event e Completion. A transação deve proteger apenas o que é transacional no banco e não pode ficar aberta durante chamada externa lenta.

```php
$transaction = $DB->start_delegated_transaction();

// Alterações de banco relacionadas.

$transaction->allow_commit();
```

Depois do commit, dispare o que não deve manter lock aberto, especialmente integrações e notificações assíncronas.

## Formulário de submissão

O aluno precisa de um Moodle form próprio, separado do `mod_form`.

```php
namespace mod_checkpoint\form;

class submission_form extends \moodleform {
    public function definition() {
        $mform = $this->_form;

        $mform->addElement('editor', 'submissiontext', get_string('submissiontext', 'mod_checkpoint'));
        $mform->setType('submissiontext', PARAM_RAW);

        $mform->addElement('filemanager', 'evidence_filemanager', get_string('evidence', 'mod_checkpoint'));
        $mform->addElement('submit', 'submitbutton', get_string('submit'));
    }
}
```

A presença dos campos pode ser condicionada à configuração da instância.

## Draft area e Files API

Arquivo de evidência deve passar pelo fluxo normal de draft file area.

```
file_prepare_standard_filemanager(
    $data,
    'evidence',
    $options,
    $context,
    'mod_checkpoint',
    'evidence',
    $submissionid
);
```

Na gravação use `file_postupdate_standard_filemanager()`. Não mova arquivo manualmente para moodledata.

## File area e itemid

A file area será `evidence` e o `itemid` será o ID da entrega.

```
contextid = contexto do módulo
component = mod_checkpoint
filearea = evidence
itemid = checkpoint_submission.id
```

Essa escolha torna backup, restore, pluginfile e exclusão muito mais previsíveis.

## `pluginfile()`

Servir o arquivo exige autenticação e autorização.

```php
function checkpoint_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    require_login($course, true, $cm);

    if ($context->contextlevel !== CONTEXT_MODULE || $filearea !== 'evidence') {
        return false;
    }

    // Validar itemid, dono da entrega ou capability de avaliação.
    // Localizar stored_file e chamar send_stored_file().
}
```

Nunca trate conhecimento da URL como permissão de acesso.

## Quem pode ver a evidência

O aluno pode ver a própria evidência. Um usuário com `mod/checkpoint:grade` no contexto do módulo pode ver evidências que precisa avaliar.

Essa regra precisa ser testada explicitamente, porque `pluginfile()` é um dos pontos em que IDOR aparece com facilidade quando o código valida apenas se o arquivo existe.

## Página do aluno

`view.php` deve resolver contexto, permissões e dados, mas não montar uma parede de HTML.

A página pode preparar um objeto de output:

```php
$status = new \mod_checkpoint\output\student_status(
    $checkpoint,
    $submission,
    $canedit
);

echo $OUTPUT->render($status);
```

A apresentação fica no template.

## Output class

A classe de output transforma domínio em dados simples para Mustache e usa sintaxe compatível com PHP 7.0:

```php
namespace mod_checkpoint\output;

defined('MOODLE_INTERNAL') || die();

class student_status implements \renderable, \templatable {
    private $checkpoint;
    private $submission;
    private $canedit;

    public function __construct($checkpoint, $submission, $canedit) {
        $this->checkpoint = $checkpoint;
        $this->submission = $submission;
        $this->canedit = $canedit;
    }

    public function export_for_template(\renderer_base $output) {
        return [
            'name' => format_string($this->checkpoint->name),
            'has_submission' => !empty($this->submission),
            'can_edit' => $this->canedit,
        ];
    }
}
```

## Mustache

O template não deveria descobrir regra de negócio. Ele apenas apresenta o estado recebido.

```mustache
<div class="mod-checkpoint-status">
    <h3>{{name}}</h3>

    {{#has_submission}}
        <div class="alert alert-info">{{#str}}submitted, mod_checkpoint{{/str}}</div>
    {{/has_submission}}

    {{#can_edit}}
        <a class="btn btn-primary" href="{{editurl}}">{{#str}}editsubmission, mod_checkpoint{{/str}}</a>
    {{/can_edit}}
</div>
```

## A tela do professor

O professor precisa enxergar a fila, não todos os detalhes de todos os alunos ao mesmo tempo. Uma tabela paginada com nome, estado, data de envio, atraso e ação de avaliar é suficiente para a primeira versão.

Essa tela deve consultar apenas usuários relevantes e apenas colunas necessárias. Não carregue todos os arquivos de todas as entregas para montar uma listagem de status.

## AJAX só onde melhora a experiência

O dashboard pode atualizar contadores de pendentes, avaliados e atrasados sem recarregar a página inteira. Esse é um uso razoável de AJAX.

Não transforme a primeira versão em SPA apenas porque o curso apresentou JavaScript moderno.

## AMD para o dashboard

No Moodle 3.5, o dashboard usa um módulo AMD em `amd/src/dashboard.js`:

```javascript
define(['core/ajax'], function(Ajax) {
    return {
        init: function(cmid) {
            Ajax.call([{
                methodname: 'mod_checkpoint_get_status',
                args: {cmid: cmid},
                done: function(data) {
                    var node = document.querySelector('[data-checkpoint-pending]');
                    if (node) {
                        node.textContent = data.pending;
                    }
                }
            }]);
        }
    };
});
```

O JavaScript não decide se o usuário pode ver a informação. A External Function continua validando contexto e capability.

## External Function para estado

No Moodle 3.5, a função externa fica em `externallib.php`, estende `external_api` e declara parâmetros e retorno explicitamente:

```php
require_once($CFG->libdir . '/externallib.php');

class mod_checkpoint_external extends external_api {
    public static function get_status_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module ID'),
        ]);
    }

    public static function get_status($cmid) {
        $params = self::validate_parameters(self::get_status_parameters(), [
            'cmid' => $cmid,
        ]);
        $cm = get_coursemodule_from_id('checkpoint', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/checkpoint:grade', $context);

        return checkpoint_count_states($cm->instance);
    }

    public static function get_status_returns() {
        return new external_single_structure([
            'pending' => new external_value(PARAM_INT, 'Pending submissions'),
        ]);
    }
}
```

## Web Service para integração externa

O mesmo componente pode expor uma função que devolve o estado da própria entrega para o app móvel ou outro cliente autorizado.

Não reutilize automaticamente a função de dashboard do professor, porque o escopo e a autorização são diferentes. Uma API boa começa pelo caso de uso e pelo princípio do menor privilégio.

## Events

Dois Events representam fatos relevantes:

```
mod_checkpoint\event\submission_created
mod_checkpoint\event\submission_graded
```

O Event é disparado depois que a alteração principal aconteceu. Ele não deve ser usado como substituto obscuro para chamar a próxima função do fluxo.

## Event de envio

Depois de gravar a entrega:

```php
$event = \mod_checkpoint\event\submission_created::create([
    'context' => $context,
    'objectid' => $submission->id,
    'relateduserid' => $userid,
    'other' => [
        'checkpointid' => $checkpoint->id,
    ],
]);
$event->trigger();
```

O `objectid` representa a entidade principal do evento, e `relateduserid` identifica o usuário relacionado sem inventar campos paralelos.

## Adhoc Task para notificação de avaliação

Enviar notificação depois da avaliação não precisa prender o request do professor. Uma Adhoc Task recebe apenas identificadores estáveis.

```php
$task = new \mod_checkpoint\task\send_grade_notification();
$task->set_custom_data([
    'submissionid' => $submission->id,
]);
\core\task\manager::queue_adhoc_task($task);
```

Não serialize objetos inteiros no custom data.

## Idempotência da task

A task pode executar mais de uma vez por retry. O plugin precisa impedir notificações duplicadas, por exemplo com um timestamp `notificationtime` ou tabela de outbox, caso essa garantia seja importante para o produto.

"A task normalmente roda uma vez" não é uma política de consistência.

## Scheduled Task é necessária?

Para a primeira versão, uma Scheduled Task pode verificar entregas vencidas e atualizar um cache de indicadores, mas isso só faz sentido se houver processamento que não depende de uma ação imediata do usuário.

Se o status de atraso pode ser calculado com `duedate < time()` sem persistir nada, uma task apenas para trocar `submitted` por `late` seria estado duplicado. Neste projeto preferimos derivar atraso e evitar essa task.

## Cache

O dashboard do professor pode ter um cache pequeno para contadores por atividade, principalmente em turmas grandes.

```php
$cache = cache::make('mod_checkpoint', 'summary');
$key = 'checkpoint:' . $checkpointid;
$summary = $cache->get($key);
```

Cache é otimização. A tabela de entregas continua sendo a fonte de verdade.

## Invalidação do cache

Sempre que houver submit, grade, reopen ou exclusão de entrega, invalide o resumo daquela atividade.

Uma cache incorreta é pior que uma consulta um pouco mais lenta, porque apresenta informação falsa com aparência de verdade.

## `db/caches.php`

A definição pode ser simples:

```php
$definitions = [
    'summary' => [
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Não escolha TTL como solução para invalidação que o próprio código consegue fazer deterministicamente.

## Gradebook

A atividade possui um item de nota. `checkpoint_grade_item_update()` cria ou atualiza esse item usando `grade_update()`.

```php
$params = [
    'itemname' => $checkpoint->name,
    'gradetype' => GRADE_TYPE_VALUE,
    'grademin' => 0,
    'grademax' => $checkpoint->grade,
];

grade_update(
    'mod/checkpoint',
    $checkpoint->course,
    'mod',
    'checkpoint',
    $checkpoint->id,
    0,
    null,
    $params
);
```

## Atualizando a nota do usuário

Ao avaliar:

```php
$grade = [
    'userid' => $submission->userid,
    'rawgrade' => $submission->grade,
];

checkpoint_grade_item_update($checkpoint, $grade);
```

A nota não deve ser escrita diretamente em `grade_grades`.

## Gradebook não é a tabela da avaliação

`checkpoint_submission.grade` guarda a nota de domínio da atividade, enquanto Gradebook recebe a projeção oficial usada pelo curso.

Isso permite reconstruir o Gradebook por `checkpoint_update_grades()` caso seja necessário, sem perder a origem da avaliação.

## Completion

A atividade pode oferecer duas regras customizadas:

```
completionsubmit
completiongrade
```

A primeira verifica se existe entrega enviada. A segunda verifica se a entrega foi avaliada conforme a regra definida.

## `checkpoint_get_completion_state()`

Em Moodle 3.5, regras customizadas de conclusão são declaradas no formulário da atividade e avaliadas pelo callback do módulo em `lib.php`.

```php
function checkpoint_supports($feature) {
    switch ($feature) {
        case FEATURE_COMPLETION_HAS_RULES:
        case FEATURE_COMPLETION_TRACKS_VIEWS:
            return true;
        default:
            return null;
    }
}

function checkpoint_get_completion_state($course, $cm, $userid, $type) {
    global $DB;

    $submission = $DB->get_record('checkpoint_submission', [
        'checkpointid' => $cm->instance,
        'userid' => $userid,
    ]);

    $complete = !empty($submission) && $submission->status === 'submitted';
    return $complete;
}
```

Se houver duas regras customizadas, a função combina os estados respeitando `$type`, enquanto `mod_form.php` implementa `add_completion_rules()` e `completion_rule_enabled()`.

## Completion não deve duplicar Gradebook

Se a regra é "concluir quando receber nota", use a informação de avaliação já existente e as APIs de Completion. Não crie outra tabela `checkpoint_completion` apenas para repetir o mesmo fato.

Quanto mais estados duplicados existem, mais difícil fica explicar por que um aluno aparece aprovado em uma tela e incompleto em outra.


## Backup

O backup da atividade precisa incluir configuração e, quando `userinfo` estiver habilitado, entregas dos usuários.

```php
$checkpoint = new backup_nested_element('checkpoint', ['id'], [
    'name', 'intro', 'introformat', 'duedate', 'grade',
    'allowtext', 'allowfile', 'completionsubmit', 'completiongrade'
]);

$submissions = new backup_nested_element('submissions');
$submission = new backup_nested_element('submission', ['id'], [
    'userid', 'status', 'submissiontext', 'submissionformat',
    'grade', 'feedback', 'feedbackformat', 'graderid',
    'timecreated', 'timemodified', 'timegraded'
]);
```

## Annotating IDs

Usuários e avaliadores precisam ser anotados.

```php
$submission->annotate_ids('user', 'userid');
$submission->annotate_ids('user', 'graderid');
```

No restore esses IDs não podem ser reutilizados diretamente.

## Annotating files

```php
$checkpoint->annotate_files('mod_checkpoint', 'intro', null);
$submission->annotate_files('mod_checkpoint', 'evidence', 'id');
```

O `itemid` da evidência é o ID da submissão antiga no backup e precisa ser remapeado para o ID novo no restore.

## Restore

No `process_checkpoint()` crie a nova instância e chame `apply_activity_instance()`. No `process_submission()` mapeie `userid` e `graderid`, insira a linha nova e registre o mapping da submissão.

Depois, em `after_execute()`, restaure os arquivos usando esse mapping.

## Backup precisa ser testado em outra instalação

Restaurar no mesmo banco pode esconder dependências acidentais de IDs. O teste real é produzir um `.mbz`, levar para outra instalação e verificar se curso, atividade, entrega, arquivos, usuários mapeados e notas se comportam corretamente.

Esse teste faz parte do aceite do projeto final.

## Subplugin faria sentido aqui?

Para esta versão, não. A atividade possui um único modelo de entrega e um único fluxo de avaliação.

Criar `checkpointsubmission_text`, `checkpointsubmission_file` e `checkpointfeedback_comments` apenas para imitar Assignment adicionaria complexidade sem necessidade real. Se o produto evoluir para dezenas de tipos de evidência instaláveis independentemente, aí um subplugin type pode se justificar.

## APIs transversais necessárias


Não existe ganho em listar cada uma no README como selo de complexidade. A documentação deve explicar onde cada responsabilidade vive.

## Segurança desde o fluxo principal

Todo endpoint começa com contexto e autorização. Todo ID recebido do usuário é tratado como não confiável. Toda saída de texto passa pela função adequada, toda ação mutável por formulário valida `sesskey` quando o mecanismo não fizer isso automaticamente, e arquivos passam por `pluginfile()` com autorização real.

Segurança não entra no final como auditoria cosmética.

## IDOR no projeto final

Um teste obrigatório é tentar abrir a evidência de outro aluno alterando apenas `itemid` ou parâmetro de submission.

O endpoint precisa negar o acesso mesmo que ambos os IDs existam. Esse teste conecta diretamente o projeto final a Segurança Ofensiva Aplicada.

## CSRF

Ações como reabrir entrega e excluir avaliação não devem ser links GET que alteram estado.

Use formulário ou valide `require_sesskey()` em endpoints de ação apropriados.

## SQL Injection

Nenhuma consulta recebe SQL montado com parâmetro bruto.

```php
$DB->get_records('checkpoint_submission', [
    'checkpointid' => $checkpointid,
    'status' => submission_status::SUBMITTED,
]);
```

Quando SQL customizado for necessário, use placeholders.

## XSS

Texto de submissão pode conter conteúdo rico se o produto permitir editor. Isso não significa imprimir o valor cru.

Use o formato armazenado, Files API e funções de renderização adequadas. Nome de atividade passa por `format_string()`.

## Performance da listagem do professor

A tabela não precisa consultar usuário por usuário dentro do loop. Faça uma consulta que traga os campos necessários ou carregue usuários em lote.

N+1 em uma turma de 30 alunos pode parecer invisível e virar problema em uma turma de 30 mil.

## Paginação

A fila do professor deve ser paginada. Nunca use `get_records()` sem limite apenas porque o ambiente de desenvolvimento tem poucos alunos.

A tela deve filtrar por estado e, se necessário, por nome usando consultas que continuem indexáveis.

## Locks

Se o mesmo aluno submete duas requisições quase simultâneas, a restrição única já impede duas linhas, mas o fluxo de atualização de arquivo e status ainda pode exigir lock se houver risco de corrida em operações compostas.

Não use lock por padrão em tudo, mas saiba identificar transições que precisam ser serializadas.

## Logging e observabilidade

Events registram fatos de domínio relevantes. Erros operacionais de task ou integração devem ser registrados de forma útil para administração, sem vazar token, senha ou conteúdo sensível.

Uma mensagem "erro ao enviar" sem submission ID, activity ID ou exceção útil não ajuda a operar o sistema.

## PHPUnit da regra de submissão

Um primeiro teste cria curso, aluno, atividade e envia a entrega pela classe de serviço.

```php
final class manager_test extends \advanced_testcase {
    public function test_student_can_submit() {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $checkpoint = $this->getDataGenerator()
            ->get_plugin_generator('mod_checkpoint')
            ->create_instance(['course' => $course->id]);

        $this->setUser($student);

        $id = \mod_checkpoint\local\manager::submit(
            $checkpoint->id,
            $student->id,
            ['submissiontext' => 'Minha evidência']
        );

        $this->assertGreaterThan(0, $id);
    }
}
```

## Generator próprio

O generator evita repetir setup de instância em todos os testes.

```php
class mod_checkpoint_generator extends testing_module_generator {
    public function create_instance($record = null, array $options = null) {
        $record = (array)$record;
        $record += [
            'name' => 'Checkpoint de teste',
            'grade' => 100,
            'allowtext' => 1,
            'allowfile' => 1,
        ];

        return parent::create_instance($record, $options);
    }
}
```

## Teste negativo de capability

O teste mais importante muitas vezes é o que deve falhar.

Crie um usuário sem `mod/checkpoint:grade`, tente avaliar uma submissão e confirme a exceção de capability. Depois remova temporariamente o `require_capability()` e veja o teste quebrar.

## Testando Events

Use o sink de eventos, execute a ação e confirme tipo, objectid, relateduserid e contexto.

Não teste apenas que "algum evento" foi disparado.

## Testando Gradebook

Depois de avaliar, consulte a API de notas e confirme o valor publicado. Também teste atualização da nota e reconstrução por `checkpoint_update_grades()`.

Isso detecta regressões em que a tabela interna muda, mas o Gradebook deixa de acompanhar.

## Testando Completion

Crie cenários com e sem entrega e com avaliação presente ou ausente. Teste cada regra customizada de forma independente.

A conclusão precisa responder ao estado real, não à ordem em que os testes rodaram.


## Testando task

Execute a Adhoc Task diretamente com custom data conhecido e use sink de mensagens para confirmar a notificação.

Rode a task novamente e confirme o comportamento idempotente definido pelo produto.

## Behat do fluxo do professor

Um cenário deve criar curso, professor, aluno e atividade, fazer login como professor e confirmar que a fila mostra a entrega pendente.

Depois o professor abre a avaliação, informa nota e feedback e salva.

## Behat do fluxo do aluno

O aluno entra na atividade, envia evidência, recebe estado de envio e depois visualiza nota e feedback após a avaliação.

Esse cenário não substitui PHPUnit, mas confirma a integração de UI, permissões, formulário e navegação.

## Cenário negativo no Behat

Também vale confirmar que um aluno não vê o botão de avaliação e não consegue navegar para a tela administrativa por uma rota exposta na interface.

Autorização real continua sendo testada em PHPUnit, mas a UI não deve oferecer ações impossíveis ao perfil errado.

## Coding Style

Antes de release, rode Code Checker ou o conjunto de checks adotado pelo projeto. Não deixe Coding Style para uma limpeza gigante no final de meses de desenvolvimento.

CI deve impedir que uma nova regressão de estilo entre na branch principal.

## Plugin Validate

O Plugin Validate ajuda a encontrar problemas de estrutura, metadata e práticas esperadas no ecossistema Moodle.

Passar nele não significa que o plugin está correto, seguro ou rápido. É uma camada da validação, não a certificação do produto.

## PHPDoc

Documente API pública, classes de extensão, métodos cujo contrato não seja óbvio e estruturas relevantes.

Não use PHPDoc para repetir literalmente o nome do método em inglês diferente. Documentação precisa adicionar contexto.

## CI

A pipeline precisa executar pelo menos lint, Coding Style, Plugin Validate, PHPUnit e os Behat essenciais nas combinações suportadas definidas pelo projeto.

Não crie uma matrix impossível de manter. Escolha combinações que cubram as bordas da faixa de suporte e uma combinação principal usada no desenvolvimento diário.

## Instalação limpa na CI

Uma job precisa instalar o plugin do zero. Isso detecta erro em `install.xml`, dependência ausente, string faltando, classe que só existia no ambiente do desenvolvedor e arquivo que não entrou no repositório.

O fato de upgrade funcionar não prova instalação limpa.

## Upgrade na CI

Outra job pode instalar um fixture da versão anterior, carregar o banco esperado e então executar upgrade para a branch atual.

O importante é testar caminho real de versão anterior para versão nova, não apenas chamar `upgrade.php` vazio.

## Build de JavaScript

Se `amd/src/dashboard.js` existe, o release precisa conter os artefatos necessários para o ambiente de produção conforme a política do Moodle e do projeto.

Não dependa de o administrador rodar Grunt depois de instalar um ZIP do diretório de plugins.

## O ZIP final

O ZIP deve conter a pasta correta na raiz.

```
checkpoint/
    version.php
    lib.php
    mod_form.php
    classes/
    db/
    lang/
    templates/
    amd/
    backup/
    tests/
```

Não inclua `.git`, diretório de IDE, arquivos temporários, dumps, screenshots de teste ou dependências de desenvolvimento desnecessárias.

## Teste o ZIP, não apenas o checkout

Uma das validações finais é criar o ZIP exatamente como será distribuído, instalar esse ZIP em ambiente limpo e executar o smoke test.

Isso encontra o tipo de erro mais irritante de release, em que o repositório funciona mas o pacote publicado esqueceu um arquivo essencial.

## Revisão de segurança

Faça uma passada específica pensando como atacante.

Liste endpoints, parâmetros de IDs, arquivos, External Functions, ações mutáveis, outputs de usuário, callbacks, Tasks e qualquer integração externa. Para cada um pergunte quem pode chamar, de qual contexto, com quais dados e qual impacto existe se o request for repetido ou adulterado.

## Revisão de performance

Ative debugging de desenvolvimento e observe consultas nas páginas principais. Teste turma pequena e volume artificialmente maior.

Procure N+1, loops que chamam API cara, cache sem necessidade, queries sem índice, carregamento de files desnecessário e tasks que percorrem a instalação inteira a cada execução.

## Code review

Um bom code review não pergunta apenas se o código funciona. Ele pergunta se a responsabilidade está no lugar certo, se o contrato é claro, se a autorização é explícita, se existe duplicação de estado e se a mudança será compreensível daqui a dois anos.

Para o projeto final, faça o review como se o autor fosse outra pessoa.

## Checklist de instalação limpa

Em uma instalação vazia:

```
instalar o ZIP
executar upgrade do site
criar curso
criar checkpoint
matricular professor e aluno
aluno enviar evidência
professor avaliar
confirmar Gradebook
confirmar Completion
confirmar arquivo
confirmar notificação
```

Se o fluxo depende de uma configuração escondida que só existe no ambiente de desenvolvimento, o teste vai mostrar.

## Checklist de upgrade

Comece com a versão anterior real do plugin, crie dados representativos, depois instale a versão nova.

Verifique schema, dados antigos, configuração, Gradebook, Completion, arquivos, Tasks e páginas principais. Um upgrade que termina sem exception ainda pode ter perdido informação.

## Checklist de backup e restore

Crie curso com atividade, duas entregas, um arquivo e uma avaliação. Gere backup com user data e restaure em outra instalação.

Confirme nova instância, mappings de usuários, arquivos, notas, conclusão e ausência de referências ao course module antigo.

## Documentação técnica

O projeto deve terminar com uma documentação curta, mas suficiente para manutenção.

Ela precisa explicar objetivo, versões Moodle suportadas, requisitos, estrutura principal, tabelas, capabilities, Tasks, file areas, External Functions, processo de build, testes, backup/restore e procedimento de release.

## README não substitui documentação de código

README explica o produto e o processo de instalação/manutenção. PHPDoc explica contratos no código. Comentários explicam decisões locais que não são óbvias.

Colocar tudo em um README gigante não melhora manutenção.

## Changelog

Registre mudanças que interessam a quem instala e atualiza.

```
1.0.0
- Primeira versão estável
- Entrega de texto e arquivo
- Avaliação com nota e feedback
- Gradebook e Completion
- Backup e restore
- PHPUnit e Behat
```

## Critério de pronto

O projeto não está pronto quando a tela "parece funcionar". Ele está pronto quando o pacote distribuível reproduz o fluxo em ambiente limpo, passa nos testes automatizados, possui upgrade testado, restaura em outra instalação e não contém pendência conhecida de segurança que invalide o uso pretendido.

Essa definição é mais trabalhosa, mas também é a diferença entre código de demonstração e plugin profissional.

## O que não entrou na primeira versão

Não criamos Scheduled Task de atraso, analytics próprio, relatório BI ou integração com ERP. Isso foi decisão, não esquecimento.

Cada uma dessas peças pode aparecer quando o produto tiver um caso de uso concreto. O projeto final não precisa provar maturidade pela quantidade de diretórios.

## Evoluindo sem destruir a arquitetura

Quando a próxima demanda chegar, pergunte primeiro em qual responsabilidade ela pertence. Um segundo tipo de evidência pode continuar sendo apenas mais um campo, ou pode justificar subplugin se virar ecossistema. Uma integração externa pode ser uma External Function, um observer, uma task ou um conector independente dependendo da direção do fluxo.

A arquitetura boa não prevê todas as funcionalidades futuras, mas deixa claro onde decidir quando elas aparecem.

## Exercício final

Implemente o `mod_checkpoint` completo e entregue um ZIP instalável. Não vale apenas produzir arquivos isolados, e também não vale considerar o exercício concluído porque a atividade abriu uma vez.



Depois gere o ZIP final e faça três provas independentes. A primeira é instalar em uma instalação Moodle limpa. A segunda é atualizar uma instalação contendo a versão anterior e dados reais de teste. A terceira é gerar backup de um curso, mover o `.mbz` para outra instalação e restaurar. Documente qualquer diferença encontrada e corrija o plugin antes de gerar o release final.

O objetivo não é terminar com o maior plugin do livro. O objetivo é terminar com um plugin que você entende inteiro, do primeiro requisito ao último teste, e que outra pessoa consegue instalar, auditar, manter e atualizar sem depender da sua memória sobre como ele deveria funcionar.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
