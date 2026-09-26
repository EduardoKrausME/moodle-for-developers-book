{% raw %}

# 30 PROJETO FINAL

Chegar ao último capítulo de um livro sobre desenvolvimento de plugins Moodle e terminar criando mais uma classe isolada seria desperdiçar tudo o que foi construído até aqui. O projeto final precisa fazer o contrário, ele deve obrigar você a tomar decisões que parecem pequenas quando cada API é estudada separadamente, mas que passam a depender umas das outras quando o plugin vira um produto de verdade.

Por isso este capítulo não apresenta uma API nova. Tudo o que vamos usar já apareceu antes, e essa é justamente a proposta. O desafio agora é escolher o tipo de plugin correto, desenhar o banco sem criar dependências frágeis, definir capabilities coerentes, separar interface de regra de negócio, usar Gradebook e Completion sem duplicar estado, integrar Files API, Events, Tasks, Cache, Web Services, Privacy, Backup e testes, fechar CI, gerar o ZIP e provar que o pacote sobrevive a instalação limpa, upgrade e restauração em outra instalação.

O projeto será o `mod_checkpoint`, que apareceu em vários capítulos como exemplo parcial. Agora ele deixa de ser exemplo e vira uma atividade completa. O professor cria um checkpoint dentro do curso, informa instruções, data limite e valor da atividade, o aluno envia uma evidência em texto e opcionalmente um arquivo, o professor avalia, registra feedback e nota, e o Moodle atualiza Gradebook e Completion. O plugin também oferece uma pequena visão de acompanhamento, notificação assíncrona, consulta por Web Service, exportação e exclusão de dados pessoais, backup/restore e uma suíte de testes suficiente para impedir que uma alteração simples destrua o fluxo principal.

A regra mais importante deste capítulo é simples. Não adicione uma API apenas para poder dizer que ela foi usada. Hooks, subplugins, cache, task ou Web Service só entram se existir uma responsabilidade real para eles. Um projeto final bom demonstra que você sabe usar as APIs do Moodle, mas demonstra também que sabe quando não usar cada uma.

## 30.1 O objetivo do projeto

O `mod_checkpoint` representa uma atividade de verificação de entrega. Ele pode ser usado para um marco de projeto, uma evidência de participação, um documento simples, uma etapa de estágio, uma entrega prática ou qualquer situação em que o aluno precise registrar que chegou a determinado ponto e o professor precise avaliar essa entrega.

A atividade precisa ser simples para o aluno, previsível para o professor e integrada ao curso. O aluno não deveria aprender uma nova plataforma dentro do Moodle apenas para enviar uma evidência, e o professor não deveria abrir cinco relatórios diferentes para descobrir quem enviou, quem está atrasado e quem já foi avaliado.

## 30.2 A especificação funcional vem antes do código

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
    participa de Privacy API
    participa de backup e restore
```

Isso já é suficiente para começar a arquitetura. Se a especificação muda toda vez que um arquivo é aberto, o problema ainda não está claro o bastante para o código.

## 30.3 Critérios de aceitação

A especificação descreve intenção, enquanto critérios de aceitação permitem verificar se o produto terminou. Para este projeto, alguns critérios são obrigatórios.

Um aluno matriculado e com capability de envio consegue criar sua primeira entrega, alterar a entrega enquanto ela estiver aberta e não consegue avaliar a própria entrega. Um professor com capability de avaliação consegue listar entregas do contexto correto, registrar nota e feedback, enquanto um professor sem permissão naquele curso não consegue acessar a tela por URL direta.

A nota precisa aparecer no Gradebook, a conclusão precisa acompanhar as regras configuradas, o arquivo enviado precisa sobreviver a backup e restore, e o usuário precisa conseguir exportar e apagar seus dados pessoais conforme a Privacy API.

## 30.4 Escolhendo o tipo correto de plugin

Este projeto é um `mod`, e não um `local`, porque a funcionalidade precisa existir como atividade do curso, possuir `course_module`, contexto de módulo, participação em conclusão, Gradebook, backup de atividade e acesso direto pelo aluno dentro da seção do curso.

É exatamente aqui que vale lembrar a provocação feita no começo do livro sobre usar `local` para quase tudo. `local` é excelente quando o comportamento é institucional, transversal ou não precisa de uma instância dentro do curso. Neste caso, porém, o objeto pedagógico precisa aparecer no curso, então transformar isso em `local` criaria trabalho extra para imitar coisas que `mod` já resolve nativamente.

## 30.5 O nome do componente

O Frankenstyle component será:

```
mod_checkpoint
```

A pasta será:

```
public/mod/checkpoint
```

Em instalações anteriores à reorganização com diretório público, o caminho físico pode aparecer como `mod/checkpoint`, mas o componente continua sendo `mod_checkpoint`. Regra de negócio nunca deve depender de montar o caminho físico na mão.

## 30.6 Estrutura inicial de diretórios

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
        completion/
            custom_completion.php
        event/
            submission_created.php
            submission_graded.php
        external/
            get_status.php
        form/
            submission_form.php
            grade_form.php
        output/
            student_status.php
        privacy/
            provider.php
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
        privacy_provider_test.php
    index.php
    lib.php
    mod_form.php
    settings.php
    version.php
    view.php
```

Essa árvore não é um objetivo em si. Cada diretório precisa existir porque há uma responsabilidade concreta atrás dele.

## 30.7 O modelo de dados

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

## 30.8 Índices e unicidade

A regra de negócio desta versão diz que cada usuário possui uma entrega atual por checkpoint. Isso precisa aparecer no banco.

```
UNIQUE(checkpointid, userid)
INDEX(checkpointid, status)
INDEX(userid)
INDEX(graderid)
```

O índice por status ajuda a tela do professor, que normalmente consulta entregas pendentes por atividade. O índice por usuário ajuda consultas pessoais e Privacy API.

## 30.9 Não invente uma tabela para cada estado

Pendente, enviado, avaliado e reaberto são estados da mesma entrega, não quatro entidades. Criar `checkpoint_pending`, `checkpoint_graded` e `checkpoint_reopened` transformaria transições simples em movimentação física de linhas.

Uma coluna `status` com constantes bem definidas é mais previsível.

```php
/**
 * Centraliza os estados permitidos para uma entrega.
 */
final class submission_status {
    // Representa uma entrega ainda não enviada pelo aluno.
    public const DRAFT = 'draft';

    // Representa uma entrega formalmente enviada para avaliação.
    public const SUBMITTED = 'submitted';

    // Representa uma entrega que já recebeu avaliação.
    public const GRADED = 'graded';

    // Representa uma entrega devolvida ao aluno para nova edição.
    public const REOPENED = 'reopened';
}
```

## 30.10 `version.php`

A versão do plugin precisa refletir a política de compatibilidade definida no Capítulo 29.

```php
<?php

// Impede a execução direta do arquivo fora do bootstrap do Moodle.
defined('MOODLE_INTERNAL') || die();

// Declara os metadados usados pelo Moodle durante instalação e upgrade.
$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

Não copie números de exemplo para produção sem validar a branch real que será suportada.

## 30.11 Upgrade path desde o primeiro release

Mesmo a versão 1.0 precisa nascer pensando no 1.1. Se amanhã surgir `feedbackfiles`, `latepolicy` ou uma nova coluna, a mudança deverá entrar em `db/upgrade.php` com savepoint correto.

O erro comum é tratar `install.xml` como schema vivo e editar apenas ele depois que o plugin já foi distribuído. Isso corrige instalação limpa e quebra upgrade de quem já está usando o plugin.

## 30.12 `settings.php`

Configuração global só deve guardar o que realmente vale para todas as instâncias. Neste projeto podemos ter um limite padrão de arquivo e uma configuração global para notificação após avaliação.

```php
// Adiciona uma configuração administrativa global para habilitar notificações após a avaliação.
$settings->add(new admin_setting_configcheckbox(
    'mod_checkpoint/notifygrade',
    get_string('notifygrade', 'mod_checkpoint'),
    get_string('notifygrade_desc', 'mod_checkpoint'),
    1
));
```

Não coloque data limite, nota máxima ou instruções em settings globais, porque esses dados pertencem à instância da atividade.

## 30.13 Capabilities

Uma primeira versão pode trabalhar com:

```
mod/checkpoint:addinstance
mod/checkpoint:view
mod/checkpoint:submit
mod/checkpoint:grade
mod/checkpoint:manage
```

`submit` pertence ao estudante, `grade` ao professor e `manage` fica para operações administrativas da atividade. Não use `is_siteadmin()` para substituir autorização.

## 30.14 O contexto correto

Quase tudo neste plugin opera em `context_module`.

```php
// Carrega o course module e falha imediatamente se o ID não existir.
$cm = get_coursemodule_from_id('checkpoint', $id, 0, false, MUST_EXIST);

// Resolve o contexto do módulo, que é o contexto correto para as capabilities da atividade.
$context = context_module::instance($cm->id);

// Exige login no curso e valida a permissão de visualização dentro do módulo.
require_login($cm->course, false, $cm);
require_capability('mod/checkpoint:view', $context);
```

A capability precisa ser verificada no contexto onde a ação realmente acontece. Verificar no contexto do sistema porque é mais fácil é uma forma clássica de abrir permissões demais.

## 30.15 `mod_form.php`

O formulário de configuração da atividade deve conter apenas propriedades da instância.

```php
/**
 * Formulário de configuração de uma instância do Checkpoint.
 */
class mod_checkpoint_mod_form extends moodleform_mod {
    /**
     * Define os campos específicos e os elementos padrão da atividade.
     *
     * @return void
     */
    public function definition() {
        // Obtém a instância do formulário Moodle mantida pela classe base.
        $mform = $this->_form;

        // Define o nome obrigatório da atividade e aplica o tipo de parâmetro adequado.
        $mform->addElement('text', 'name', get_string('checkpointname', 'mod_checkpoint'));
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        // Inclui os campos padrão de introdução da atividade.
        $this->standard_intro_elements();

        // Permite configurar um prazo opcional para a entrega.
        $mform->addElement('date_time_selector', 'duedate', get_string('duedate', 'mod_checkpoint'), [
            'optional' => true,
        ]);

        // Define quais formatos de evidência poderão ser enviados pelo aluno.
        $mform->addElement('checkbox', 'allowtext', get_string('allowtext', 'mod_checkpoint'));
        $mform->addElement('checkbox', 'allowfile', get_string('allowfile', 'mod_checkpoint'));

        // Acrescenta nota, configurações comuns do módulo e os botões de ação.
        $this->standard_grading_coursemodule_elements();
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
```

## 30.16 Validando configuração

Se texto e arquivo forem ambos desativados, o aluno não terá o que enviar. Essa regra pertence à validação do formulário.

```php
/**
 * Valida as combinações de configuração da atividade.
 *
 * @param array $data Dados submetidos pelo formulário.
 * @param array $files Arquivos submetidos pelo formulário.
 * @return array Erros encontrados, indexados pelo nome do campo.
 */
public function validation($data, $files) {
    // Preserva primeiro as validações fornecidas pela implementação padrão do Moodle.
    $errors = parent::validation($data, $files);

    // Impede uma atividade em que nenhum tipo de entrega esteja habilitado.
    if (empty($data['allowtext']) && empty($data['allowfile'])) {
        $errors['allowtext'] = get_string('error:nosubmissiontype', 'mod_checkpoint');
    }

    // Retorna todos os erros para que o Moodle os associe aos campos do formulário.
    return $errors;
}
```

Validação de formulário não substitui autorização no endpoint que processa a ação.

## 30.17 Os callbacks de instância

`checkpoint_add_instance()`, `checkpoint_update_instance()` e `checkpoint_delete_instance()` continuam sendo parte do contrato de um activity module.

O ideal é manter esses callbacks pequenos e transferir regra para classes testáveis.

```php
/**
 * Cria uma nova instância da atividade.
 *
 * @param stdClass $data Dados validados da instância.
 * @param moodleform_mod|null $mform Formulário usado na criação, quando disponível.
 * @return int ID da nova instância.
 */
function checkpoint_add_instance(stdClass $data, ?moodleform_mod $mform = null): int {
    // Obtém o serviço pelo container para manter as dependências centralizadas no manager.
    $manager = \core\di::get(\mod_checkpoint\local\manager::class);

    // Delega a persistência e as regras de criação à camada de serviço.
    return $manager->create_instance($data);
}
```

## 30.18 Uma classe de serviço para regra de negócio

A classe manager centraliza as transições importantes, mas agora ela também aplica o modelo de Dependency Injection estudado no Capítulo 4. Em vez de métodos estáticos puxando globais em qualquer ponto, a classe declara no construtor os recursos que realmente utiliza.

```php
namespace mod_checkpoint\local;

/**
 * Centraliza as regras de negócio e as transições de estado do Checkpoint.
 */
final class manager {
    /**
     * Cria o serviço com dependências explícitas e substituíveis em testes.
     *
     * @param \moodle_database $db Camada de acesso ao banco de dados.
     * @param \core\clock $clock Relógio usado nas regras dependentes de tempo.
     */
    public function __construct(
        private readonly \moodle_database $db,
        private readonly \core\clock $clock,
    ) {
    }

    /**
     * Registra ou atualiza a entrega de um aluno.
     *
     * @param int $checkpointid ID da atividade.
     * @param int $userid ID do aluno.
     * @param array $data Dados da entrega.
     * @return int ID da entrega persistida.
     */
    public function submit(int $checkpointid, int $userid, array $data): int {
        // Usa o relógio injetado para manter regras de tempo determinísticas nos testes.
        $now = $this->clock->time();

        // Valida a entrega, persiste os dados, processa arquivos e atualiza os estados derivados.
    }

    /**
     * Avalia uma entrega e publica os efeitos derivados da avaliação.
     *
     * @param int $submissionid ID da entrega.
     * @param int $graderid ID do avaliador.
     * @param float $grade Nota atribuída.
     * @param string $feedback Feedback textual da avaliação.
     * @return void
     */
    public function grade(int $submissionid, int $graderid, float $grade, string $feedback): void {
        // Captura o instante da avaliação a partir da mesma fonte de tempo usada pelo domínio.
        $now = $this->clock->time();

        // Persiste a avaliação e sincroniza Gradebook, evento e notificação assíncrona.
    }

    /**
     * Reabre uma entrega previamente enviada ou avaliada.
     *
     * @param int $submissionid ID da entrega.
     * @return void
     */
    public function reopen(int $submissionid): void {
        // Altera o estado da entrega e invalida qualquer dado derivado que não continue válido.
    }
}
```

O banco e o relógio deixam de ser dependências invisíveis. Isso permite que uma regra de prazo use sempre o mesmo clock, que PHPUnit controle o tempo quando necessário e que a classe seja obtida pelo container em callbacks ou pontos de entrada sem transformar \core\di::get() em chamada espalhada dentro de cada método.

### 30.18.1 \core\clock no prazo da atividade

O checkpoint possui data limite, portanto tempo faz parte do domínio e precisa ser testável. Em vez de comparar duedate com time() em vários arquivos, concentre a regra em serviço e use $this->clock->time(). Um teste consegue então simular antes, exatamente no limite e depois do prazo sem esperar o relógio real avançar.

```php
/**
 * Verifica se a atividade já ultrapassou a data limite.
 *
 * @param \stdClass $checkpoint Registro da atividade.
 * @return bool Verdadeiro quando existe prazo e ele já foi ultrapassado.
 */
private function is_late(\stdClass $checkpoint): bool {
    // Considera atraso apenas quando a atividade possui data limite configurada.
    return $checkpoint->duedate > 0
        && $this->clock->time() > $checkpoint->duedate;
}
```

## 30.19 Transações

Enviar uma entrega pode envolver tabela, Files API, Event e Completion. A transação deve proteger apenas o que é transacional no banco e não pode ficar aberta durante chamada externa lenta.

```php
// Abre uma transação apenas para o conjunto de alterações que precisa ser atômico.
$transaction = $DB->start_delegated_transaction();

// Executa aqui as alterações de banco que devem confirmar ou falhar em conjunto.

// Confirma a transação antes de iniciar operações externas ou potencialmente lentas.
$transaction->allow_commit();
```

Depois do commit, dispare o que não deve manter lock aberto, especialmente integrações e notificações assíncronas.

## 30.20 Formulário de submissão

O aluno precisa de um Moodle form próprio, separado do `mod_form`.

```php
namespace mod_checkpoint\form;

/**
 * Formulário usado pelo aluno para enviar a evidência do Checkpoint.
 */
class submission_form extends \moodleform {
    /**
     * Define os campos disponíveis para a submissão.
     *
     * @return void
     */
    public function definition() {
        // Obtém o objeto de formulário fornecido pela classe base.
        $mform = $this->_form;

        // Adiciona o editor de texto para a evidência textual.
        $mform->addElement('editor', 'submissiontext', get_string('submissiontext', 'mod_checkpoint'));
        $mform->setType('submissiontext', PARAM_RAW);

        // Adiciona a área de arquivo e o botão que conclui o envio.
        $mform->addElement('filemanager', 'evidence_filemanager', get_string('evidence', 'mod_checkpoint'));
        $mform->addElement('submit', 'submitbutton', get_string('submit'));
    }
}
```

A presença dos campos pode ser condicionada à configuração da instância.

## 30.21 Draft area e Files API

Arquivo de evidência deve passar pelo fluxo normal de draft file area.

```php
// Prepara a draft area com os arquivos já associados à submissão atual.
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

## 30.22 File area e itemid

A file area será `evidence` e o `itemid` será o ID da entrega.

```
contextid = contexto do módulo
component = mod_checkpoint
filearea = evidence
itemid = checkpoint_submission.id
```

Essa escolha torna backup, restore, pluginfile e exclusão muito mais previsíveis.

## 30.23 `pluginfile()`

Servir o arquivo exige autenticação e autorização.

```php
/**
 * Entrega arquivos protegidos armazenados na file area da atividade.
 *
 * @param stdClass $course Registro do curso.
 * @param stdClass $cm Registro do course module.
 * @param context $context Contexto associado ao arquivo.
 * @param string $filearea Nome da file area solicitada.
 * @param array $args Argumentos restantes da URL do arquivo.
 * @param bool $forcedownload Indica se o navegador deve baixar o arquivo.
 * @param array $options Opções adicionais de entrega.
 * @return bool Retorna false quando o arquivo não pode ser servido.
 */
function checkpoint_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    // Garante que o acesso ao arquivo ocorra dentro de uma sessão autenticada no curso.
    require_login($course, true, $cm);

    // Rejeita qualquer contexto ou file area que não pertença à evidência do módulo.
    if ($context->contextlevel !== CONTEXT_MODULE || $filearea !== 'evidence') {
        return false;
    }

    // Valida o itemid e confirma que o usuário é dono da entrega ou possui capability de avaliação.
    // Localiza o stored_file autorizado e encerra a resposta com send_stored_file().
}
```

Nunca trate conhecimento da URL como permissão de acesso.

## 30.24 Quem pode ver a evidência

O aluno pode ver a própria evidência. Um usuário com `mod/checkpoint:grade` no contexto do módulo pode ver evidências que precisa avaliar.

Essa regra precisa ser testada explicitamente, porque `pluginfile()` é um dos pontos em que IDOR aparece com facilidade quando o código valida apenas se o arquivo existe.

## 30.25 Página do aluno

`view.php` deve resolver contexto, permissões e dados, mas não montar uma parede de HTML.

A página pode preparar um objeto de output:

```php
// Monta o objeto de output com os dados de domínio já preparados para apresentação.
$status = new \mod_checkpoint\output\student_status(
    checkpoint: $checkpoint,
    submission: $submission,
    canedit: $canedit,
);

// Entrega a renderização ao renderer do Moodle em vez de produzir HTML manualmente.
echo $OUTPUT->render($status);
```

A apresentação fica no template.

## 30.26 Output class

A classe de output transforma domínio em dados simples para Mustache.

```php
namespace mod_checkpoint\output;

/**
 * Prepara o estado do aluno para renderização pelo template Mustache.
 */
final class student_status implements \renderable, \templatable {
    /**
     * Cria o objeto de output com os dados necessários para a interface.
     *
     * @param \stdClass $checkpoint Registro da atividade.
     * @param \stdClass|null $submission Entrega atual do aluno, quando existente.
     * @param bool $canedit Indica se a entrega ainda pode ser editada.
     */
    public function __construct(
        private readonly \stdClass $checkpoint,
        private readonly ?\stdClass $submission,
        private readonly bool $canedit,
    ) {
    }

    /**
     * Exporta dados simples para consumo pelo template Mustache.
     *
     * @param \renderer_base $output Renderer ativo do Moodle.
     * @return array Dados normalizados para o template.
     */
    public function export_for_template(\renderer_base $output): array {
        // Formata os valores antes de expô-los ao template.
        return [
            'name' => format_string($this->checkpoint->name),
            'has_submission' => $this->submission !== null,
            'can_edit' => $this->canedit,
        ];
    }
}
```

## 30.27 Mustache

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

## 30.28 A tela do professor

O professor precisa enxergar a fila, não todos os detalhes de todos os alunos ao mesmo tempo. Uma tabela paginada com nome, estado, data de envio, atraso e ação de avaliar é suficiente para a primeira versão.

Essa tela deve consultar apenas usuários relevantes e apenas colunas necessárias. Não carregue todos os arquivos de todas as entregas para montar uma listagem de status.

### 30.28.1 Activity Overview do Moodle 5.0

O mod_checkpoint não precisa manter uma página index.php própria listando todas as instâncias. Como o projeto final é voltado ao Moodle 5.0, ele participa da página Activities por meio de classes/courseformat/overview.php e deixa index.php redirecionar para a visão consolidada do curso.

```php
namespace mod_checkpoint\courseformat;

use core_courseformat\activityoverviewbase;
use core_courseformat\local\overview\overviewitem;
use core_calendar\output\humandate;

/**
 * Integra o Checkpoint à visão geral de atividades do curso.
 */
final class overview extends activityoverviewbase {
    /**
     * Cria a integração com acesso ao banco e ao relógio do Moodle.
     *
     * @param \cm_info $cm Informações do course module.
     * @param \moodle_database $db Camada de acesso ao banco de dados.
     * @param \core\clock $clock Relógio usado pelas regras temporais.
     */
    public function __construct(
        \cm_info $cm,
        private readonly \moodle_database $db,
        private readonly \core\clock $clock,
    ) {
        // Inicializa o contrato comum das integrações de Activity Overview.
        parent::__construct($cm);
    }

    /**
     * Retorna a data limite formatada para a visão geral de atividades.
     *
     * @return overviewitem|null Item de overview com a data limite.
     */
    #[\Override]
    public function get_due_date_overview(): ?overviewitem {
        // Busca somente os campos necessários para montar o item de prazo.
        $checkpoint = $this->db->get_record(
            'checkpoint',
            ['id' => $this->cm->instance],
            'id, duedate',
            MUST_EXIST,
        );

        // Converte o timestamp em uma representação própria da interface do Moodle.
        return new overviewitem(
            name: get_string('duedate'),
            value: $checkpoint->duedate ?: null,
            content: $checkpoint->duedate
                ? humandate::create_from_timestamp($checkpoint->duedate)
                : '-',
        );
    }
}
```

A versão completa pode acrescentar get_extra_overview_items() para mostrar estado da entrega e get_actions_overview() para levar o aluno à submissão ou o professor à fila de avaliação. A classe já recebe DB e clock por DI, portanto não precisa voltar a globals apenas porque foi carregada pelo course format.

### 30.28.2 index.php vira compatibilidade de navegação

```php
// Carrega o bootstrap do Moodle antes de acessar parâmetros ou APIs da plataforma.
require_once(__DIR__ . '/../../config.php');

// Lê e valida o ID do curso recebido pela requisição.
$courseid = required_param('id', PARAM_INT);

// Redireciona para a página padrão de overview filtrada pela atividade Checkpoint.
\core_courseformat\activityoverviewbase::redirect_to_overview_page(
    $courseid,
    'checkpoint',
);
```

Isso fecha uma diferença importante entre "atividade que abre" e "atividade integrada ao Moodle 5.0". A primeira possui view.php e mod_form; a segunda também conversa com os fluxos de curso que o usuário já utiliza para enxergar prazos, completion, notas e ações das demais atividades.

## 30.29 AJAX só onde melhora a experiência

O dashboard pode atualizar contadores de pendentes, avaliados e atrasados sem recarregar a página inteira. Esse é um uso razoável de AJAX.

Não transforme a primeira versão em SPA apenas porque o curso apresentou JavaScript moderno.

## 30.30 ESM para o dashboard

Um módulo simples pode pedir os contadores atualizados e trocar apenas os números.

```
import Ajax from 'core/ajax';

export const init = (cmid) => {
    const refresh = async() => {
        const [data] = await Ajax.call([{
            methodname: 'mod_checkpoint_get_status',
            args: {cmid},
        }]);

        document.querySelector('[data-checkpoint-pending]').textContent = data.pending;
    };

    refresh();
};
```

O JS não decide se o usuário pode ver a informação. A External Function continua validando contexto e capability.

## 30.31 External Function para estado

A função externa deve declarar parâmetros, validar contexto e devolver uma estrutura pequena.

```php
/**
 * Retorna os totais de estados do Checkpoint para consumidores externos autorizados.
 *
 * @param int $cmid ID do course module.
 * @return array Contadores agrupados por estado.
 */
public static function execute(int $cmid): array {
    global $DB;

    // Resolve o course module e seu contexto a partir do identificador recebido.
    $cm = get_coursemodule_from_id('checkpoint', $cmid, 0, false, MUST_EXIST);
    $context = context_module::instance($cm->id);

    // Valida o contexto da External Function e exige permissão de avaliação.
    self::validate_context($context);
    require_capability('mod/checkpoint:grade', $context);

    // Retorna somente os dados permitidos pelo contrato externo.
    return self::count_states($cm->instance);
}
```

## 30.32 Web Service para integração externa

O mesmo componente pode expor uma função que devolve o estado da própria entrega para o app móvel ou outro cliente autorizado.

Não reutilize automaticamente a função de dashboard do professor, porque o escopo e a autorização são diferentes. Uma API boa começa pelo caso de uso e pelo princípio do menor privilégio.

## 30.33 Events

Dois Events representam fatos relevantes:

```
mod_checkpoint\event\submission_created
mod_checkpoint\event\submission_graded
```

O Event é disparado depois que a alteração principal aconteceu. Ele não deve ser usado como substituto obscuro para chamar a próxima função do fluxo.

## 30.34 Event de envio

Depois de gravar a entrega:

```php
// Cria o evento com o contexto, a entrega afetada e o usuário relacionado.
$event = \mod_checkpoint\event\submission_created::create([
    'context' => $context,
    'objectid' => $submission->id,
    'relateduserid' => $userid,
    'other' => [
        'checkpointid' => $checkpoint->id,
    ],
]);

// Dispara o evento somente depois de preencher todos os dados exigidos pelo contrato.
$event->trigger();
```

O `objectid` representa a entidade principal do evento, e `relateduserid` identifica o usuário relacionado sem inventar campos paralelos.

## 30.35 Hooks entram ou não entram?

Nesta primeira versão, não existe necessidade real de um Hook customizado. O plugin possui Events para fatos ocorridos e classes internas para seu fluxo principal.

Adicionar `before_submission_save` apenas para marcar a caixa "usamos Hooks" aumentaria a API pública sem existir consumidor real. A decisão correta aqui é não criar Hook customizado na versão 1.0.

Se no futuro terceiros precisarem alterar validação antes do envio, aí sim o contrato pode ser desenhado conscientemente.

## 30.36 Adhoc Task para notificação de avaliação

Enviar notificação depois da avaliação não precisa prender o request do professor. Uma Adhoc Task recebe apenas identificadores estáveis.

```php
// Cria a Adhoc Task responsável por enviar a notificação fora da requisição principal.
$task = new \mod_checkpoint\task\send_grade_notification();

// Passa apenas identificadores suficientes para a task reconstruir o contexto necessário.
$task->set_custom_data([
    'submissionid' => $submission->id,
]);

// Coloca a task na fila para execução assíncrona pelo cron.
\core\task\manager::queue_adhoc_task($task);
```

Não serialize objetos inteiros no custom data.

## 30.37 Idempotência da task

A task pode executar mais de uma vez por retry. O plugin precisa impedir notificações duplicadas, por exemplo com um timestamp `notificationtime` ou tabela de outbox, caso essa garantia seja importante para o produto.

"A task normalmente roda uma vez" não é uma política de consistência.

## 30.38 Scheduled Task é necessária?

Para a primeira versão, uma Scheduled Task pode verificar entregas vencidas e atualizar um cache de indicadores, mas isso só faz sentido se houver processamento que não depende de uma ação imediata do usuário.

Se o status de atraso pode ser calculado com `duedate < time()` sem persistir nada, uma task apenas para trocar `submitted` por `late` seria estado duplicado. Neste projeto preferimos derivar atraso e evitar essa task.

## 30.39 Cache

O dashboard do professor pode ter um cache pequeno para contadores por atividade, principalmente em turmas grandes.

```php
// Obtém a definição de cache declarada pelo plugin.
$cache = cache::make('mod_checkpoint', 'summary');

// Usa uma chave estável por atividade para evitar colisões entre checkpoints.
$key = 'checkpoint:' . $checkpointid;

// Tenta reutilizar o resumo já calculado antes de consultar ou recomputar os dados.
$summary = $cache->get($key);
```

Cache é otimização. A tabela de entregas continua sendo a fonte de verdade.

## 30.40 Invalidação do cache

Sempre que houver submit, grade, reopen ou exclusão de entrega, invalide o resumo daquela atividade.

Uma cache incorreta é pior que uma consulta um pouco mais lenta, porque apresenta informação falsa com aparência de verdade.

## 30.41 `db/caches.php`

A definição pode ser simples:

```php
// Declara os caches próprios do componente em db/caches.php.
$definitions = [
    'summary' => [
        // Usa cache de aplicação porque o resumo não pertence a uma sessão específica.
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Não escolha TTL como solução para invalidação que o próprio código consegue fazer deterministicamente.

## 30.42 Gradebook

A atividade possui um item de nota. `checkpoint_grade_item_update()` cria ou atualiza esse item usando `grade_update()`.

```php
// Define a configuração do item de nota que será publicado no Gradebook.
$params = [
    'itemname' => $checkpoint->name,
    'gradetype' => GRADE_TYPE_VALUE,
    'grademin' => 0,
    'grademax' => $checkpoint->grade,
];

// Cria ou atualiza o item de nota associado à instância da atividade.
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

## 30.43 Atualizando a nota do usuário

Ao avaliar:

```php
// Converte a avaliação interna para o formato esperado pela Gradebook API.
$grade = [
    'userid' => $submission->userid,
    'rawgrade' => $submission->grade,
];

// Publica a nota do aluno no item correspondente à atividade.
checkpoint_grade_item_update($checkpoint, $grade);
```

A nota não deve ser escrita diretamente em `grade_grades`.

## 30.44 Gradebook não é a tabela da avaliação

`checkpoint_submission.grade` guarda a nota de domínio da atividade, enquanto Gradebook recebe a projeção oficial usada pelo curso.

Isso permite reconstruir o Gradebook por `checkpoint_update_grades()` caso seja necessário, sem perder a origem da avaliação.

## 30.45 Completion

A atividade pode oferecer duas regras customizadas:

```
completionsubmit
completiongrade
```

A primeira verifica se existe entrega enviada. A segunda verifica se a entrega foi avaliada conforme a regra definida.

## 30.46 `custom_completion`

```php
namespace mod_checkpoint\completion;

/**
 * Implementa as regras customizadas de conclusão da atividade.
 */
final class custom_completion extends \core_completion\activity_custom_completion {
    /**
     * Lista as regras customizadas disponibilizadas pelo plugin.
     *
     * @return array Nomes das regras de conclusão.
     */
    public static function get_defined_custom_rules(): array {
        // Mantém os nomes alinhados aos campos configurados no formulário da atividade.
        return [
            'completionsubmit',
            'completiongrade',
        ];
    }

    /**
     * Calcula o estado de uma regra customizada específica.
     *
     * @param string $rule Nome da regra solicitada.
     * @return int Estado de conclusão reconhecido pela Completion API.
     */
    public function get_state(string $rule): int {
        // Rejeita nomes desconhecidos antes de consultar qualquer estado da atividade.
        $this->validate_rule($rule);

        // Encaminha cada regra para o cálculo especializado correspondente.
        return match ($rule) {
            'completionsubmit' => $this->get_submit_state(),
            'completiongrade' => $this->get_grade_state(),
        };
    }
}
```

## 30.47 Completion não deve duplicar Gradebook

Se a regra é "concluir quando receber nota", use a informação de avaliação já existente e as APIs de Completion. Não crie outra tabela `checkpoint_completion` apenas para repetir o mesmo fato.

Quanto mais estados duplicados existem, mais difícil fica explicar por que um aluno aparece aprovado em uma tela e incompleto em outra.

## 30.48 Privacy API

O plugin guarda texto de entrega, arquivo, nota, feedback, timestamps e IDs de usuário. Portanto ele é claramente um provider de dados pessoais.

Não existe justificativa para `null_provider`.

## 30.49 Metadata

O provider deve declarar a tabela de entregas e as file areas relevantes.

```php
// Declara quais dados pessoais são armazenados na tabela de submissões.
$items->add_database_table(
    'checkpoint_submission',
    [
        'userid' => 'privacy:metadata:submission:userid',
        'submissiontext' => 'privacy:metadata:submission:text',
        'grade' => 'privacy:metadata:submission:grade',
        'feedback' => 'privacy:metadata:submission:feedback',
        'graderid' => 'privacy:metadata:submission:graderid',
    ],
    'privacy:metadata:submission'
);
```

## 30.50 Export

A exportação precisa apresentar dados no contexto do módulo e incluir arquivos de evidência pertencentes ao usuário.

Não exporte apenas IDs crus quando existe uma representação mais útil e segura para a pessoa que recebe o pacote.

## 30.51 Exclusão

Ao excluir dados do usuário, a decisão depende da política do produto. Se a entrega pode ser removida, apague também os arquivos da file area e invalide Gradebook/Completion quando necessário.

Se alguma informação precisar ser preservada por uma obrigação institucional, isso precisa ser tratado por política e desenho de dados, não por simplesmente ignorar a solicitação da Privacy API.

## 30.52 Backup

O backup da atividade precisa incluir configuração e, quando `userinfo` estiver habilitado, entregas dos usuários.

```php
// Define o elemento raiz que representa a instância da atividade no backup.
$checkpoint = new backup_nested_element('checkpoint', ['id'], [
    'name', 'intro', 'introformat', 'duedate', 'grade',
    'allowtext', 'allowfile', 'completionsubmit', 'completiongrade'
]);

// Cria o contêiner e o elemento repetível das entregas vinculadas à atividade.
$submissions = new backup_nested_element('submissions');
$submission = new backup_nested_element('submission', ['id'], [
    'userid', 'status', 'submissiontext', 'submissionformat',
    'grade', 'feedback', 'feedbackformat', 'graderid',
    'timecreated', 'timemodified', 'timegraded'
]);
```

## 30.53 Annotating IDs

Usuários e avaliadores precisam ser anotados.

```php
// Marca o autor da entrega para que o Backup API remapeie o usuário no restore.
$submission->annotate_ids('user', 'userid');

// Marca também o avaliador porque seu ID pode mudar na instalação de destino.
$submission->annotate_ids('user', 'graderid');
```

No restore esses IDs não podem ser reutilizados diretamente.

## 30.54 Annotating files

```php
// Inclui os arquivos usados pelo campo intro da instância da atividade.
$checkpoint->annotate_files('mod_checkpoint', 'intro', null);

// Inclui os arquivos de evidência usando o ID da submissão como itemid.
$submission->annotate_files('mod_checkpoint', 'evidence', 'id');
```

O `itemid` da evidência é o ID da submissão antiga no backup e precisa ser remapeado para o ID novo no restore.

## 30.55 Restore

No `process_checkpoint()` crie a nova instância e chame `apply_activity_instance()`. No `process_submission()` mapeie `userid` e `graderid`, insira a linha nova e registre o mapping da submissão.

Depois, em `after_execute()`, restaure os arquivos usando esse mapping.

## 30.56 Backup precisa ser testado em outra instalação

Restaurar no mesmo banco pode esconder dependências acidentais de IDs. O teste real é produzir um `.mbz`, levar para outra instalação e verificar se curso, atividade, entrega, arquivos, usuários mapeados e notas se comportam corretamente.

Esse teste faz parte do aceite do projeto final.

## 30.57 Subplugin faria sentido aqui?

Para esta versão, não. A atividade possui um único modelo de entrega e um único fluxo de avaliação.

Criar `checkpointsubmission_text`, `checkpointsubmission_file` e `checkpointfeedback_comments` apenas para imitar Assignment adicionaria complexidade sem necessidade real. Se o produto evoluir para dezenas de tipos de evidência instaláveis independentemente, aí um subplugin type pode se justificar.

Saber não criar subplugin é parte do domínio de subplugins.

## 30.58 APIs transversais necessárias

Além das APIs principais, o projeto usa DML, Access, Context, Forms, Output, Strings, URLs, Files, Gradebook, Completion, Events, Tasks, Cache, External Functions, Privacy, Backup e Testing.

Não existe ganho em listar cada uma no README como selo de complexidade. A documentação deve explicar onde cada responsabilidade vive.

## 30.59 Segurança desde o fluxo principal

Todo endpoint começa com contexto e autorização. Todo ID recebido do usuário é tratado como não confiável. Toda saída de texto passa pela função adequada, toda ação mutável por formulário valida `sesskey` quando o mecanismo não fizer isso automaticamente, e arquivos passam por `pluginfile()` com autorização real.

Segurança não entra no final como auditoria cosmética.

## 30.60 IDOR no projeto final

Um teste obrigatório é tentar abrir a evidência de outro aluno alterando apenas `itemid` ou parâmetro de submission.

O endpoint precisa negar o acesso mesmo que ambos os IDs existam. Esse teste conecta diretamente o projeto final ao Capítulo 28.

## 30.61 CSRF

Ações como reabrir entrega e excluir avaliação não devem ser links GET que alteram estado.

Use formulário ou valide `require_sesskey()` em endpoints de ação apropriados.

## 30.62 SQL Injection

Nenhuma consulta recebe SQL montado com parâmetro bruto.

```php
// Filtra pela atividade e pelo estado usando parâmetros estruturados, sem concatenar SQL.
$DB->get_records('checkpoint_submission', [
    'checkpointid' => $checkpointid,
    'status' => submission_status::SUBMITTED,
]);
```

Quando SQL customizado for necessário, use placeholders.

## 30.63 XSS

Texto de submissão pode conter conteúdo rico se o produto permitir editor. Isso não significa imprimir o valor cru.

Use o formato armazenado, Files API e funções de renderização adequadas. Nome de atividade passa por `format_string()`.

## 30.64 Performance da listagem do professor

A tabela não precisa consultar usuário por usuário dentro do loop. Faça uma consulta que traga os campos necessários ou carregue usuários em lote.

N+1 em uma turma de 30 alunos pode parecer invisível e virar problema em uma turma de 30 mil.

## 30.65 Paginação

A fila do professor deve ser paginada. Nunca use `get_records()` sem limite apenas porque o ambiente de desenvolvimento tem poucos alunos.

A tela deve filtrar por estado e, se necessário, por nome usando consultas que continuem indexáveis.

## 30.66 Locks

Se o mesmo aluno submete duas requisições quase simultâneas, a restrição única já impede duas linhas, mas o fluxo de atualização de arquivo e status ainda pode exigir lock se houver risco de corrida em operações compostas.

Não use lock por padrão em tudo, mas saiba identificar transições que precisam ser serializadas.

## 30.67 Logging e observabilidade

Events registram fatos de domínio relevantes. Erros operacionais de task ou integração devem ser registrados de forma útil para administração, sem vazar token, senha ou conteúdo sensível.

Uma mensagem "erro ao enviar" sem submission ID, activity ID ou exceção útil não ajuda a operar o sistema.

## 30.68 PHPUnit da regra de submissão

Um primeiro teste cria curso, aluno, atividade e envia a entrega pela classe de serviço.

```php
/**
 * Testes da camada de serviço responsável pelas entregas do Checkpoint.
 */
final class manager_test extends \advanced_testcase {
    /**
     * Confirma que um aluno matriculado consegue registrar uma entrega.
     *
     * @return void
     */
    public function test_student_can_submit(): void {
        // Isola as alterações feitas no banco durante este teste.
        $this->resetAfterTest();

        // Cria o curso, o aluno matriculado e uma instância real da atividade.
        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $checkpoint = $this->getDataGenerator()
            ->get_plugin_generator('mod_checkpoint')
            ->create_instance(['course' => $course->id]);

        // Executa a ação autenticada como o aluno que fará a entrega.
        $this->setUser($student);

        // Obtém o serviço pelo mesmo container utilizado pelo código de produção.
        $manager = \core\di::get(\mod_checkpoint\local\manager::class);
        $id = $manager->submit(
            $checkpoint->id,
            $student->id,
            ['submissiontext' => 'Minha evidência']
        );

        // Confirma que a camada de serviço retornou um identificador persistido válido.
        $this->assertGreaterThan(0, $id);
    }
}
```

## 30.69 Generator próprio

O generator evita repetir setup de instância em todos os testes.

```php
/**
 * Generator de testes para criar instâncias do módulo Checkpoint.
 */
class mod_checkpoint_generator extends testing_module_generator {
    /**
     * Cria uma instância com valores padrão adequados aos testes.
     *
     * @param stdClass|array|null $record Dados que sobrescrevem os padrões.
     * @param array|null $options Opções adicionais do generator.
     * @return stdClass Registro criado para a atividade.
     */
    public function create_instance($record = null, array $options = null) {
        // Normaliza o registro para permitir a composição simples com os valores padrão.
        $record = (array)$record;

        // Define somente defaults úteis para reduzir repetição no setup dos testes.
        $record += [
            'name' => 'Checkpoint de teste',
            'grade' => 100,
            'allowtext' => 1,
            'allowfile' => 1,
        ];

        // Delega a criação efetiva da atividade ao generator padrão de módulos.
        return parent::create_instance($record, $options);
    }
}
```

## 30.70 Teste negativo de capability

O teste mais importante muitas vezes é o que deve falhar.

Crie um usuário sem `mod/checkpoint:grade`, tente avaliar uma submissão e confirme a exceção de capability. Depois remova temporariamente o `require_capability()` e veja o teste quebrar.

## 30.71 Testando Events

Use o sink de eventos, execute a ação e confirme tipo, objectid, relateduserid e contexto.

Não teste apenas que "algum evento" foi disparado.

## 30.72 Testando Gradebook

Depois de avaliar, consulte a API de notas e confirme o valor publicado. Também teste atualização da nota e reconstrução por `checkpoint_update_grades()`.

Isso detecta regressões em que a tabela interna muda, mas o Gradebook deixa de acompanhar.

## 30.73 Testando Completion

Crie cenários com e sem entrega e com avaliação presente ou ausente. Teste cada regra customizada de forma independente.

A conclusão precisa responder ao estado real, não à ordem em que os testes rodaram.

## 30.74 Testando Privacy

O provider precisa ter teste de metadata, contextos do usuário, export e delete.

Depois da exclusão, confirme banco e files. Não aceite um teste que só chama o método e verifica que nenhuma exception foi lançada.

## 30.75 Testando task

Execute a Adhoc Task diretamente com custom data conhecido e use sink de mensagens para confirmar a notificação.

Rode a task novamente e confirme o comportamento idempotente definido pelo produto.

## 30.76 Behat do fluxo do professor

Um cenário deve criar curso, professor, aluno e atividade, fazer login como professor e confirmar que a fila mostra a entrega pendente.

Depois o professor abre a avaliação, informa nota e feedback e salva.

## 30.77 Behat do fluxo do aluno

O aluno entra na atividade, envia evidência, recebe estado de envio e depois visualiza nota e feedback após a avaliação.

Esse cenário não substitui PHPUnit, mas confirma a integração de UI, permissões, formulário e navegação.

## 30.78 Cenário negativo no Behat

Também vale confirmar que um aluno não vê o botão de avaliação e não consegue navegar para a tela administrativa por uma rota exposta na interface.

Autorização real continua sendo testada em PHPUnit, mas a UI não deve oferecer ações impossíveis ao perfil errado.

## 30.79 Coding Style

Antes de release, rode Code Checker ou o conjunto de checks adotado pelo projeto. Não deixe Coding Style para uma limpeza gigante no final de meses de desenvolvimento.

CI deve impedir que uma nova regressão de estilo entre na branch principal.

## 30.80 Plugin Validate

O Plugin Validate ajuda a encontrar problemas de estrutura, metadata e práticas esperadas no ecossistema Moodle.

Passar nele não significa que o plugin está correto, seguro ou rápido. É uma camada da validação, não a certificação do produto.

Também é importante não transformar toda mensagem do validador em regra obrigatória do Moodle. Um exemplo concreto é a recomendação de colocar classes internas do componente em `classes/local/`. Essa pasta **não é obrigatória**. A documentação oficial de Coding Style diz que apenas o primeiro nível do namespace é obrigatório e que `\\local` pode ser usado no segundo nível quando o mantenedor quiser organizar as classes em namespaces adicionais; o próprio texto observa que, para a maioria dos componentes, manter as classes diretamente no namespace raiz do plugin é suficiente.

Portanto, uma classe própria do plugin pode perfeitamente ficar, por exemplo, em `classes/manager.php` com namespace `mod_checkpoint`, sem ser movida artificialmente para `classes/local/manager.php` apenas para satisfazer uma recomendação automática. Se o validador apontar a ausência de `classes/local/` como problema mesmo quando a estrutura utilizada é válida, essa é uma regra que **não precisa ser seguida**. Não altere uma arquitetura correta apenas para fazer desaparecer um aviso que não corresponde a uma exigência da plataforma.

Essa divergência já apareceu no processo oficial de revisão de plugins, como pode ser visto no CONTRIB-9824:

https://moodle.atlassian.net/browse/CONTRIB-9824

A referência normativa para decidir a estrutura continua sendo o Coding Style do Moodle, especialmente as regras de namespaces, e não a interpretação isolada de uma ferramenta de validação:

https://moodledev.io/general/development/policies/codingstyle

## 30.81 PHPDoc

Documente API pública, classes de extensão, métodos cujo contrato não seja óbvio e estruturas relevantes.

Não use PHPDoc para repetir literalmente o nome do método em inglês diferente. Documentação precisa adicionar contexto.

## 30.82 CI

A pipeline precisa executar pelo menos lint, Coding Style, Plugin Validate, PHPUnit e os Behat essenciais nas combinações suportadas definidas pelo projeto.

Não crie uma matrix impossível de manter. Escolha combinações que cubram as bordas da faixa de suporte e uma combinação principal usada no desenvolvimento diário.

## 30.83 Instalação limpa na CI

Uma job precisa instalar o plugin do zero. Isso detecta erro em `install.xml`, dependência ausente, string faltando, classe que só existia no ambiente do desenvolvedor e arquivo que não entrou no repositório.

O fato de upgrade funcionar não prova instalação limpa.

## 30.84 Upgrade na CI

Outra job pode instalar um fixture da versão anterior, carregar o banco esperado e então executar upgrade para a branch atual.

O importante é testar caminho real de versão anterior para versão nova, não apenas chamar `upgrade.php` vazio.

## 30.85 Build de JavaScript

Se `amd/src/dashboard.js` existe, o release precisa conter os artefatos necessários para o ambiente de produção conforme a política do Moodle e do projeto.

Não dependa de o administrador rodar Grunt depois de instalar um ZIP de Marketplace.

## 30.86 O ZIP final

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

## 30.87 Teste o ZIP, não apenas o checkout

Uma das validações finais é criar o ZIP exatamente como será distribuído, instalar esse ZIP em ambiente limpo e executar o smoke test.

Isso encontra o tipo de erro mais irritante de release, em que o repositório funciona mas o pacote publicado esqueceu um arquivo essencial.

## 30.88 Revisão de segurança

Faça uma passada específica pensando como atacante.

Liste endpoints, parâmetros de IDs, arquivos, External Functions, ações mutáveis, outputs de usuário, callbacks, Tasks e qualquer integração externa. Para cada um pergunte quem pode chamar, de qual contexto, com quais dados e qual impacto existe se o request for repetido ou adulterado.

## 30.89 Revisão de performance

Ative debugging de desenvolvimento e observe consultas nas páginas principais. Teste turma pequena e volume artificialmente maior.

Procure N+1, loops que chamam API cara, cache sem necessidade, queries sem índice, carregamento de files desnecessário e tasks que percorrem a instalação inteira a cada execução.

## 30.90 Code review

Um bom code review não pergunta apenas se o código funciona. Ele pergunta se a responsabilidade está no lugar certo, se o contrato é claro, se a autorização é explícita, se existe duplicação de estado e se a mudança será compreensível daqui a dois anos.

Para o projeto final, faça o review como se o autor fosse outra pessoa.

## 30.91 Checklist de instalação limpa

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

## 30.92 Checklist de upgrade

Comece com a versão anterior real do plugin, crie dados representativos, depois instale a versão nova.

Verifique schema, dados antigos, configuração, Gradebook, Completion, arquivos, Tasks e páginas principais. Um upgrade que termina sem exception ainda pode ter perdido informação.

## 30.93 Checklist de backup e restore

Crie curso com atividade, duas entregas, um arquivo e uma avaliação. Gere backup com user data e restaure em outra instalação.

Confirme nova instância, mappings de usuários, arquivos, notas, conclusão e ausência de referências ao course module antigo.

## 30.94 Documentação técnica

O projeto deve terminar com uma documentação curta, mas suficiente para manutenção.

Ela precisa explicar objetivo, versões Moodle suportadas, requisitos, estrutura principal, tabelas, capabilities, Tasks, file areas, External Functions, processo de build, testes, backup/restore e procedimento de release.

## 30.95 README não substitui documentação de código

README explica o produto e o processo de instalação/manutenção. PHPDoc explica contratos no código. Comentários explicam decisões locais que não são óbvias.

Colocar tudo em um README gigante não melhora manutenção.

## 30.96 Changelog

Registre mudanças que interessam a quem instala e atualiza.

```
1.0.0
- Primeira versão estável
- Entrega de texto e arquivo
- Avaliação com nota e feedback
- Gradebook e Completion
- Privacy API
- Backup e restore
- PHPUnit e Behat
```

## 30.97 Critério de pronto

O projeto não está pronto quando a tela "parece funcionar". Ele está pronto quando o pacote distribuível reproduz o fluxo em ambiente limpo, passa nos testes automatizados, possui upgrade testado, restaura em outra instalação e não contém pendência conhecida de segurança que invalide o uso pretendido.

Essa definição é mais trabalhosa, mas também é a diferença entre código de demonstração e plugin profissional.

## 30.98 O que não entrou na primeira versão

Não criamos subplugins, Hook customizado, Scheduled Task de atraso, analytics próprio, relatório BI ou integração com ERP. Isso foi decisão, não esquecimento.

Cada uma dessas peças pode aparecer quando o produto tiver um caso de uso concreto. O projeto final não precisa provar maturidade pela quantidade de diretórios.

## 30.99 Evoluindo sem destruir a arquitetura

Quando a próxima demanda chegar, pergunte primeiro em qual responsabilidade ela pertence. Um segundo tipo de evidência pode continuar sendo apenas mais um campo, ou pode justificar subplugin se virar ecossistema. Uma integração externa pode ser uma External Function, um observer, uma task ou um conector independente dependendo da direção do fluxo.

A arquitetura boa não prevê todas as funcionalidades futuras, mas deixa claro onde decidir quando elas aparecem.

## 30.100 Exercício final

Implemente o `mod_checkpoint` completo e entregue um ZIP instalável. Não vale apenas produzir arquivos isolados, e também não vale considerar o exercício concluído porque a atividade abriu uma vez.

Comece pela especificação funcional deste capítulo e adapte somente o que for necessário para seu cenário. Implemente banco, upgrade path, settings, capabilities, contextos, mod_form, formulário de submissão, Files API, Output, Mustache, ESM, AJAX, Gradebook, Completion, Events, Adhoc Task, Cache, External Functions, Privacy e Backup/Restore. Faça a regra principal passar por serviços com Dependency Injection, use \core\clock nas decisões de prazo e implemente a integração com a Activity Overview do Moodle 5.0 em classes/courseformat/overview.php. Hooks e subplugins devem permanecer fora enquanto não houver um caso de uso que justifique sua existência.

Crie PHPUnit para regra de envio, autorização, Gradebook, Completion, Events, Privacy e task. Crie Behat para o fluxo completo professor-aluno. Rode Coding Style, Plugin Validate e a pipeline de CI. Faça revisão ofensiva procurando IDOR, CSRF, XSS, SQL Injection, acesso indevido a arquivos e falhas de capability. Faça revisão de performance com volume artificialmente maior que o usado durante desenvolvimento.

Depois gere o ZIP final e faça três provas independentes. A primeira é instalar em uma instalação Moodle limpa. A segunda é atualizar uma instalação contendo a versão anterior e dados reais de teste. A terceira é gerar backup de um curso, mover o `.mbz` para outra instalação e restaurar. Documente qualquer diferença encontrada e corrija o plugin antes de gerar o release final.

O objetivo não é terminar com o maior plugin do livro. O objetivo é terminar com um plugin que você entende inteiro, do primeiro requisito ao último teste, e que outra pessoa consegue instalar, auditar, manter e atualizar sem depender da sua memória sobre como ele deveria funcionar.

## Referências técnicas consultadas

* MOODLE. Moodle Developer Resources. Dependency Injection, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/di
* MOODLE. Moodle Developer Resources. Course overview integration, Moodle 5.0. https://moodledev.io/docs/5.0/apis/plugintypes/mod/courseoverview
* MOODLE. Moodle 5.0 developer update. Bootstrap 5, Activity overview e PHPUnit 11.4. https://moodledev.io/docs/5.0/devupdate
* MOODLE. Moodle Developer Resources. Activity modules. Disponível em: https://moodledev.io/docs/5.0/apis/plugintypes/mod. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Access API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/access. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Forms API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/form. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Files API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/files. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Output API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/output. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Gradebook API. Disponível em: https://moodledev.io/docs/5.0/apis/core/grade. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Activity completion API. Disponível em: https://moodledev.io/docs/5.0/apis/core/activitycompletion. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Privacy API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/privacy. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Backup API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/backup. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit. Disponível em: https://moodledev.io/general/development/tools/phpunit. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Behat. Disponível em: https://moodledev.io/general/development/tools/behat. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Coding style. Disponível em: https://moodledev.io/general/development/policies/codingstyle. Acesso em: 24 set. 2026.

{% endraw %}
