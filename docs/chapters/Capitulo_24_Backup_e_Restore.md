{% raw %}

# 24 BACKUP E RESTORE - `backup/moodle2`

Backup e restore é um daqueles subsistemas do Moodle que costuma ser ignorado enquanto o plugin ainda está sendo desenvolvido e só recebe atenção quando alguém duplica uma atividade, importa um curso para outra turma ou tenta restaurar um `.mbz` em outra instalação. O problema é que, nesse momento, já não estamos lidando apenas com uma tabela que precisa ser copiada. O Moodle precisa transportar uma estrutura inteira entre contextos diferentes, recriar registros com novos IDs, remapear usuários, cursos, grupos e arquivos, respeitar a opção de incluir ou não dados de usuários e ainda reconstruir links internos que antes apontavam para outra instalação.

É por isso que backup não deveria ser tratado como uma função `export()` que gera um ZIP. O Moodle possui um mecanismo próprio, baseado em plan, task e step, que descreve o que entra no backup, em que hierarquia os dados serão serializados e como cada referência será reconstruída no restore. Quando um plugin participa corretamente dessa arquitetura, backup de curso, importação, duplicação de atividade e restauração em outro site passam a usar o mesmo contrato. Quando o plugin ignora essa arquitetura, normalmente aparece uma coleção de exceções, como duplicação que perde anexos, restore que aponta para usuários errados ou dados filhos que continuam referenciando a instância antiga.

Neste capítulo vamos evoluir o `mod_checkpoint` dos capítulos anteriores, agora assumindo que ele possui configuração, respostas de alunos, arquivos anexados, notas e uma estrutura filha de critérios. A atividade será usada para explicar o caminho completo, desde `define_structure()` até `after_execute()`, incluindo `backup_nested_element`, `annotate_ids()`, `annotate_files()`, mappings de restore, dados dependentes de usuário, codificação de links e subplugins. No fim, o objetivo é simples de dizer e trabalhoso de garantir: fazer backup no site A, restaurar no site B e continuar com a mesma atividade do ponto de vista funcional, mesmo que todos os IDs internos tenham mudado.

## 24.1 O que realmente existe dentro de um `.mbz`

Um arquivo `.mbz` não é um dump SQL do curso. Ele é um pacote criado pelo subsistema de backup contendo uma representação estruturada dos dados, metadados do backup, XMLs das atividades e seções, informações de arquivos e o conteúdo físico necessário para reconstrução.

Isso explica por que abrir um `.mbz` e procurar a tabela do plugin não funciona como alguém acostumado com backup de banco poderia imaginar. O Moodle não transporta registros crus, ele transporta uma estrutura que será interpretada por um restore plan.

Em uma activity module, por exemplo, é comum existir um XML específico da atividade dentro da estrutura do backup. Para `mod_checkpoint`, poderíamos ter um `checkpoint.xml` contendo a instância, seus critérios e respostas permitidas pelas configurações do backup. Os arquivos não são simplesmente colocados dentro desse XML, porque a Files API possui seu próprio mecanismo de representação e recuperação.

## 24.2 Backup de curso não é backup do site

O mecanismo estudado aqui é o backup de cursos e partes de cursos. Ele serve para transportar atividades, blocos, formatos, dados de usuários quando habilitados e outros componentes que se conectam ao plano de backup.

Isso é diferente de uma cópia completa do Moodle, com banco inteiro, `moodledata`, `config.php`, plugins instalados e configurações globais. Um `.mbz` não é estratégia de disaster recovery do servidor.

Essa diferença fica especialmente importante para plugins `local`, admin tools e integrações institucionais. Nem todo dado global faz sentido dentro de backup de curso. A existência de suporte técnico a pontos de conexão de backup não significa que qualquer tabela global deva ser inserida no `.mbz`.

## 24.3 Backup plan

O processo começa com um backup plan. Ele representa o plano completo que será executado para criar o backup solicitado.

O plan conhece settings gerais, curso, atividades selecionadas, inclusão de usuários e as tasks que precisam ser executadas. Um plugin normalmente não cria o plan diretamente, ele entra no plan por meio dos pontos de extensão fornecidos pelo core para seu tipo.

Essa visão é importante porque evita pensar que `backup_checkpoint_activity_task` é um processo isolado. Ela é uma task dentro de um plano maior que também processa curso, seções, roles, usuários, arquivos e outros componentes.

## 24.4 Backup task

Uma task é uma unidade maior de trabalho dentro do plan. Em activity modules, cada instância selecionada recebe uma activity task específica.

Para `mod_checkpoint`, a classe será algo como:

```
class backup_checkpoint_activity_task extends backup_activity_task {
    // ...
}
```

A task define settings específicos quando necessário, adiciona steps e também pode participar de encoding de links. Em módulos simples existe normalmente uma única structure step, mas plugins grandes podem possuir várias etapas porque nem tudo precisa ser gerado pelo mesmo XML ou no mesmo momento.

## 24.5 Backup step

Step é a unidade efetiva de execução dentro da task. Para a maioria das atividades, a parte central é uma `backup_activity_structure_step`, responsável por produzir a estrutura XML com os dados do plugin.

```
class backup_checkpoint_activity_structure_step
        extends backup_activity_structure_step {

    protected function define_structure() {
        // Estrutura do backup.
    }
}
```

É dentro de `define_structure()` que o desenvolvedor descreve elementos, relações, fontes de dados, IDs referenciados e file areas.

## 24.6 Estrutura de arquivos para uma activity module

No plugin, os arquivos ficam em:

```
mod/checkpoint/
    backup/
        moodle2/
            backup_checkpoint_activity_task.class.php
            backup_checkpoint_stepslib.php
            restore_checkpoint_activity_task.class.php
            restore_checkpoint_stepslib.php
```

No Moodle 5.1, quando o código público está sob `public/`, o caminho físico naturalmente acompanha a nova raiz pública, mas do ponto de vista do plugin a estrutura continua sendo `backup/moodle2/` dentro do componente.

O nome `moodle2` é histórico e continua sendo utilizado no mecanismo atual. Não troque para `moodle5` porque a versão da plataforma mudou.

## 24.7 A task de backup

Uma task simples pode ser escrita assim:

```php
class backup_checkpoint_activity_task extends backup_activity_task {
    protected function define_my_settings() {
    }

    protected function define_my_steps() {
        $this->add_step(
            new backup_checkpoint_activity_structure_step(
                'checkpoint_structure',
                'checkpoint.xml'
            )
        );
    }

    public static function encode_content_links($content) {
        return $content;
    }
}
```

`define_my_settings()` fica vazio quando a atividade não precisa acrescentar settings específicos ao plano. `define_my_steps()` adiciona a step que produzirá `checkpoint.xml`.

## 24.8 `backup_activity_structure_step`

A classe base já entende que estamos trabalhando com uma activity e fornece helpers importantes, principalmente `prepare_activity_structure()`.

Esse helper envolve a estrutura específica do plugin na estrutura padrão que o Moodle espera para uma atividade, por isso o retorno normalmente não é simplesmente o elemento raiz que você criou.

```php
return $this->prepare_activity_structure($checkpoint);
```

Ignorar essa preparação pode produzir uma estrutura que parece correta isoladamente, mas não se conecta ao restante do backup do course module.

## 24.9 `backup_nested_element`

`backup_nested_element` representa um nó da árvore XML que será gerada. Você informa o nome do elemento, os campos usados como identificadores e os campos que serão serializados.

```php
$checkpoint = new backup_nested_element(
    'checkpoint',
    ['id'],
    [
        'name',
        'intro',
        'introformat',
        'questiontext',
        'questionformat',
        'grade',
        'timeopen',
        'timeclose',
        'timemodified',
    ]
);
```

O primeiro array contém atributos de identificação, normalmente `id`. O segundo contém os dados que serão exportados.

## 24.10 `backup_nested_element` não é uma tabela

O nome do elemento não precisa ser igual ao nome da tabela, embora frequentemente seja. O elemento representa a estrutura serializada, não uma instrução de `SELECT` automática.

Você pode chamar o elemento de `response`, mas buscar dados de `checkpoint_answers`. Também pode juntar colunas derivadas ou usar SQL customizado. Essa separação é útil quando o schema interno muda e você quer manter um formato de backup estável.

## 24.11 Hierarquia de elementos

Se uma atividade possui critérios e respostas, a árvore pode ficar assim:

```
checkpoint
    criteria
        criterion
    responses
        response
```

No código:

```php
$criteria = new backup_nested_element('criteria');
$criterion = new backup_nested_element(
    'criterion',
    ['id'],
    ['type', 'value', 'sortorder']
);

$responses = new backup_nested_element('responses');
$response = new backup_nested_element(
    'response',
    ['id'],
    ['userid', 'answertext', 'answerformat', 'grade', 'timemodified']
);

$checkpoint->add_child($criteria);
$criteria->add_child($criterion);

$checkpoint->add_child($responses);
$responses->add_child($response);
```

A hierarquia não é apenas estética. Ela determina contexto de dados, parent IDs e ordem de processamento no restore.

## 24.12 `set_source_table()`

A forma mais simples de ligar um elemento a dados é `set_source_table()`.

```php
$checkpoint->set_source_table(
    'checkpoint',
    ['id' => backup::VAR_ACTIVITYID]
);
```

`backup::VAR_ACTIVITYID` representa o ID da instância atual da activity sendo processada. Isso evita receber o ID manualmente da URL ou da configuração do plugin.

Para elementos filhos, normalmente usamos o ID do elemento pai:

```php
$criterion->set_source_table(
    'checkpoint_criteria',
    ['checkpointid' => backup::VAR_PARENTID]
);
```

## 24.13 `backup::VAR_PARENTID`

`VAR_PARENTID` permite que a fonte de um elemento dependa do registro que está sendo processado no nível imediatamente superior da árvore.

Isso é extremamente útil em estruturas aninhadas. O mesmo `criterion` pode ser executado para cada checkpoint pai sem o desenvolvedor montar loops manuais.

O backup engine percorre a árvore e resolve as variáveis durante a execução.

## 24.14 `set_source_sql()`

Quando uma tabela simples não resolve, você pode usar SQL parametrizado:

```php
$response->set_source_sql(
    "SELECT r.*
       FROM {checkpoint_answers} r
      WHERE r.checkpointid = :checkpointid",
    ['checkpointid' => backup::VAR_PARENTID]
);
```

Use SQL quando realmente existe necessidade de join, filtro ou estrutura derivada. Não transforme todo elemento em SQL customizado se `set_source_table()` resolve de maneira mais legível.

## 24.15 Dados de usuário e `$userinfo`

Backup pode ser executado com ou sem dados de usuários. Essa configuração precisa ser respeitada pelo plugin.

```php
$userinfo = $this->get_setting_value('userinfo');
```

Critérios definidos pelo professor fazem parte da estrutura da atividade e normalmente entram sempre. Respostas dos alunos são dados de usuário e devem entrar apenas quando `$userinfo` estiver habilitado.

```php
if ($userinfo) {
    $response->set_source_table(
        'checkpoint_answers',
        ['checkpointid' => backup::VAR_PARENTID]
    );
}
```

Não ignore essa opção, porque o administrador pode estar criando um backup apenas da estrutura do curso sem dados pessoais.

## 24.16 Estrutura sem dados de usuário

Mesmo quando `$userinfo` está desativado, o elemento `responses` pode continuar existindo na estrutura, mas sem fonte de dados, ou você pode organizar a definição de modo que nenhum registro seja gerado.

O importante é o resultado funcional: restaurar a activity sem usuários precisa recriar configuração e conteúdo do professor, mas não respostas, avaliações individuais, logs privados ou outras informações dos participantes.

## 24.17 `annotate_ids()`

Um dos problemas centrais do restore é que IDs não são universais. O usuário `15` no site A pode ser outra pessoa no site B. O grupo `4` pode nem existir no destino.

Quando um campo referencia um objeto que precisa ser remapeado, anote essa relação:

```php
$response->annotate_ids('user', 'userid');
```

Isso informa ao backup que `response.userid` representa um usuário e permite ao restore trabalhar com o mapping correspondente.

## 24.18 Anotar IDs não muda o valor no backup

`annotate_ids()` não substitui imediatamente o ID por outro. Ele registra a dependência para que o mecanismo de backup/restore saiba que aquela referência precisa de tratamento.

A tradução final acontece no restore quando o novo ambiente já conhece o mapping entre o ID antigo e o novo.

Essa distinção explica por que simplesmente exportar `userid = 15` e inserir `15` no destino é errado.

## 24.19 Outras referências anotáveis

Além de usuários, plugins podem referenciar grupos, course modules, questões e outros objetos que o restore conhece.

O tipo da annotation precisa corresponder ao mapping utilizado pelo subsistema. Não invente nomes arbitrários sem verificar como o objeto será mapeado no restore.

Quando a referência pertence a uma entidade própria do plugin, normalmente você cria um mapping próprio durante o processamento do restore.

## 24.20 `annotate_files()`

Arquivos armazenados pela Files API não precisam ser copiados manualmente para dentro do XML. A estrutura anota a file area:

```php
$checkpoint->annotate_files('mod_checkpoint', 'intro', null);
$checkpoint->annotate_files('mod_checkpoint', 'attachments', null);
```

O terceiro argumento representa a origem do `itemid`. `null` é adequado quando a file area não depende de um itemid específico, como várias áreas associadas diretamente ao contexto da activity.

## 24.21 File area com `itemid`

Se cada resposta possui anexos e o `itemid` da file area é o ID da resposta, anote o campo correspondente:

```php
$response->annotate_files(
    'mod_checkpoint',
    'response_attachment',
    'id'
);
```

Nesse caso o restore precisa também possuir mapping entre o ID antigo da resposta e o novo ID, para que os arquivos sejam recolocados no item correto.

## 24.22 O erro de copiar caminho físico

Nunca tente incluir `/moodledata/filedir/...` diretamente no backup da atividade. A Files API já abstrai o armazenamento e o Moodle pode estar usando object storage, filesystem alternativo ou outra implementação.

Backup trabalha com file records e conteúdo por meio do subsystem de arquivos. O plugin informa component, filearea e itemid, e o core cuida do transporte.

## 24.23 `prepare_activity_structure()`

Depois de montar árvore, sources e annotations, a estrutura deve ser retornada assim:

```php
return $this->prepare_activity_structure($checkpoint);
```

Esse helper adiciona a estrutura padrão exigida pela activity e também permite integração com subplugins e outras partes do plan.

Copiar exemplo de backup de plugin de outro tipo e retornar o elemento cru é um erro comum quando o desenvolvedor não percebe que activity modules possuem uma base especializada.

## 24.24 Um `define_structure()` completo

Para nosso exemplo:

```php
protected function define_structure() {
    $userinfo = $this->get_setting_value('userinfo');

    $checkpoint = new backup_nested_element(
        'checkpoint',
        ['id'],
        ['name', 'intro', 'introformat', 'questiontext', 'questionformat',
         'grade', 'timeopen', 'timeclose', 'timemodified']
    );

    $criteria = new backup_nested_element('criteria');
    $criterion = new backup_nested_element(
        'criterion',
        ['id'],
        ['type', 'value', 'sortorder']
    );

    $responses = new backup_nested_element('responses');
    $response = new backup_nested_element(
        'response',
        ['id'],
        ['userid', 'answertext', 'answerformat', 'grade', 'timemodified']
    );

    $checkpoint->add_child($criteria);
    $criteria->add_child($criterion);
    $checkpoint->add_child($responses);
    $responses->add_child($response);

    $checkpoint->set_source_table(
        'checkpoint',
        ['id' => backup::VAR_ACTIVITYID]
    );

    $criterion->set_source_table(
        'checkpoint_criteria',
        ['checkpointid' => backup::VAR_PARENTID]
    );

    if ($userinfo) {
        $response->set_source_table(
            'checkpoint_answers',
            ['checkpointid' => backup::VAR_PARENTID]
        );
    }

    $response->annotate_ids('user', 'userid');

    $checkpoint->annotate_files('mod_checkpoint', 'intro', null);
    $response->annotate_files(
        'mod_checkpoint',
        'response_attachment',
        'id'
    );

    return $this->prepare_activity_structure($checkpoint);
}
```

Esse código já mostra quase toda a filosofia do backup, porque você descreve árvore e dependências em vez de escrever um export procedural linha por linha.

## 24.25 O XML gerado

Conceitualmente, o resultado será próximo de:

```html
<checkpoint id="42">
    <name>Checkpoint semanal</name>
    <grade>10</grade>
    <criteria>
        <criterion id="8">
            <type>submitted</type>
            <value>1</value>
        </criterion>
    </criteria>
    <responses>
        <response id="101">
            <userid>15</userid>
            <answertext>Minha resposta</answertext>
        </response>
    </responses>
</checkpoint>
```

Não tente produzir esse XML manualmente. O engine faz isso a partir dos nested elements e suas fontes.

## 24.26 Backup task com múltiplos steps

Nem toda activity cabe em uma única structure step. O Quiz é um exemplo conhecido de task mais complexa porque precisa lidar com questões e estruturas adicionais além da configuração principal.

Você pode adicionar mais de um step:

```php
protected function define_my_steps() {
    $this->add_step(new backup_checkpoint_activity_structure_step(
        'checkpoint_structure',
        'checkpoint.xml'
    ));

    $this->add_step(new backup_checkpoint_extra_step(
        'checkpoint_extra'
    ));
}
```

Só faça isso quando existe uma responsabilidade realmente separada. Dividir uma estrutura pequena em cinco steps não torna o backup mais profissional.

## 24.27 Restore plan

Restore funciona com arquitetura espelhada. Existe um restore plan que contém tasks e steps responsáveis por interpretar a estrutura do backup e reconstruir o curso no destino.

O restore não pode simplesmente inserir o XML como registros, porque precisa remapear IDs, criar novos contexts, reconstruir course modules, restaurar files e ajustar referências internas.

Por isso a ordem de processamento é essencial.

## 24.28 Restore task da atividade

A task de restore normalmente estende `restore_activity_task`:

```php
class restore_checkpoint_activity_task extends restore_activity_task {
    protected function define_my_settings() {
    }

    protected function define_my_steps() {
        $this->add_step(
            new restore_checkpoint_activity_structure_step(
                'checkpoint_structure',
                'checkpoint.xml'
            )
        );
    }
}
```

Assim como no backup, a task coordena as steps específicas da activity.

## 24.29 `restore_activity_structure_step`

A structure step de restore declara os caminhos XML que sabe processar:

```php
class restore_checkpoint_activity_structure_step
        extends restore_activity_structure_step {

    protected function define_structure() {
        $paths = [];
        $paths[] = new restore_path_element(
            'checkpoint',
            '/activity/checkpoint'
        );

        return $this->prepare_activity_structure($paths);
    }
}
```

Quando existem filhos, cada caminho também é declarado.

## 24.30 `restore_path_element`

Um `restore_path_element` liga um nome lógico a um caminho dentro do XML.

```php
$paths[] = new restore_path_element(
    'criterion',
    '/activity/checkpoint/criteria/criterion'
);
```

O nome `criterion` é importante porque o framework procura automaticamente um método `process_criterion()` quando encontra esse elemento.

## 24.31 `process_*()`

A convenção é direta:

```
checkpoint -> process_checkpoint()
criterion  -> process_criterion()
response   -> process_response()
```

Isso permite que a estrutura seja declarada de forma legível e que o código de persistência fique dividido pelo tipo de elemento restaurado.

## 24.32 Restaurando a instância principal

O elemento raiz normalmente é processado assim:

```php
protected function process_checkpoint($data) {
    global $DB;

    $data = (object)$data;
    $oldid = $data->id;

    $data->course = $this->get_courseid();
    $data->timemodified = time();

    $newid = $DB->insert_record('checkpoint', $data);

    $this->apply_activity_instance($newid);
}
```

O detalhe mais importante é `apply_activity_instance()`.

## 24.33 `apply_activity_instance()`

Depois de inserir o registro principal da activity, o restore precisa saber qual é a nova instância criada para associá-la ao novo course module.

```php
$this->apply_activity_instance($newid);
```

Essa chamada deve acontecer imediatamente depois da criação do registro principal, seguindo o contrato da activity restore step.

Esquecer isso costuma resultar em activity criada de forma incompleta ou em erros posteriores do restore.

## 24.34 Old ID e new ID

No restore quase todo elemento possui dois IDs conceituais. O `oldid` veio do site de origem e o `newid` foi criado no site de destino.

```php
$oldid = $data->id;
$newid = $DB->insert_record('checkpoint_criteria', $data);
```

O restore precisa guardar essa relação quando outros registros ou arquivos dependem dela.

## 24.35 `set_mapping()`

Mappings próprios são registrados com `set_mapping()`:

```php
$this->set_mapping('checkpoint_criterion', $oldid, $newid);
```

Agora qualquer elemento processado depois pode traduzir uma referência antiga para o novo registro correspondente.

O primeiro argumento é o nome lógico do mapping, e ele precisa ser usado de forma consistente no resto do restore.

## 24.36 Restaurando elementos filhos

Critérios podem ser recriados assim:

```php
protected function process_criterion($data) {
    global $DB;

    $data = (object)$data;
    $oldid = $data->id;

    $data->checkpointid = $this->get_new_parentid('checkpoint');

    $newid = $DB->insert_record('checkpoint_criteria', $data);
    $this->set_mapping('checkpoint_criterion', $oldid, $newid);
}
```

O parent ID do backup não deve ser usado diretamente, porque a nova instância possui outro ID.

## 24.37 `get_new_parentid()`

Quando o elemento está dentro de outro elemento da estrutura, o framework mantém informação sobre o parent que está sendo restaurado.

```php
$data->checkpointid = $this->get_new_parentid('checkpoint');
```

Isso evita ter que criar mapping manual para cada relação pai-filho quando a hierarquia já expressa a dependência.

## 24.38 `get_mappingid()`

Quando você precisa traduzir outro ID que foi anotado ou mapeado, use `get_mappingid()`:

```php
$data->userid = $this->get_mappingid('user', $data->userid);
```

O resultado é o ID do usuário correspondente no destino. Se não existe mapping, o comportamento precisa ser tratado conforme o tipo de dado e o contrato do restore.

## 24.39 Usuário que não existe no destino

Nem todo restore inclui criação ou correspondência de todos os usuários. Se uma resposta depende de um usuário que não foi restaurado, o plugin precisa respeitar o comportamento do processo.

Não invente um usuário `0`, não mantenha o ID antigo e não atribua a resposta ao usuário atual. Use os mappings fornecidos pelo restore e defina como a entidade deve se comportar quando o dono não está disponível.

## 24.40 Restaurando respostas de usuários

Um exemplo:

```php
protected function process_response($data) {
    global $DB;

    $data = (object)$data;
    $oldid = $data->id;

    $data->checkpointid = $this->get_new_parentid('checkpoint');
    $data->userid = $this->get_mappingid('user', $data->userid);

    if (!$data->userid) {
        return;
    }

    $newid = $DB->insert_record('checkpoint_answers', $data);

    $this->set_mapping(
        'checkpoint_response',
        $oldid,
        $newid,
        true
    );
}
```

O quarto parâmetro `true` é usado quando o mapping precisa participar de file mappings, por exemplo para file areas cujo itemid é aquele registro.

## 24.41 Restore mappings são a espinha dorsal

Muitos bugs de restore são, na prática, bugs de mapping. O dado principal é recriado corretamente, mas um filho continua apontando para o ID antigo; o arquivo restaura, mas no itemid errado; uma referência para outra activity é mantida como número cru.

Durante revisão, procure qualquer coluna terminada em `id` e pergunte se ela é local ao registro ou referência a uma entidade que mudará no destino.

## 24.42 Restaurando files

Files anotados no backup precisam ser adicionados durante o restore:

```php
protected function after_execute() {
    $this->add_related_files('mod_checkpoint', 'intro', null);
    $this->add_related_files('mod_checkpoint', 'attachments', null);
}
```

Para file areas associadas a item IDs mapeados:

```php
$this->add_related_files(
    'mod_checkpoint',
    'response_attachment',
    'checkpoint_response'
);
```

O terceiro argumento nesse contexto informa qual mapping deve ser usado para o itemid.

## 24.43 `after_execute()`

`after_execute()` roda depois que os elementos da estrutura foram processados. Esse momento é ideal para files porque os mappings necessários já foram criados.

Também pode ser útil para pequenos ajustes que dependem da estrutura inteira estar disponível, mas não transforme `after_execute()` em uma segunda fase de restore genérica para tudo. Quanto mais cedo uma relação puder ser reconstruída corretamente no `process_*()`, mais claro fica o fluxo.

## 24.44 File areas e mappings

Suponha que no site A a resposta `101` possui arquivo com `itemid = 101`. No site B a mesma resposta virou `389`.

Se o restore apenas recriar o file record com itemid antigo, o arquivo existirá mas ficará desconectado da resposta. O mapping `checkpoint_response` é o elo que informa ao Files API que `101` agora significa `389`.

Esse é um dos motivos para não testar backup apenas verificando se a activity aparece. Abra anexos restaurados.

## 24.45 Conteúdo dependente do usuário

Além de decidir se um elemento entra quando `$userinfo` está ativo, você precisa olhar para tudo que depende do usuário. Respostas, tentativas, feedback individual, timestamps de participação e arquivos enviados por estudantes normalmente são user data.

Configuração da activity, pergunta criada pelo professor e critérios de conclusão normalmente fazem parte da estrutura da activity, embora o autor original possa existir como metadata em alguns casos.

A classificação precisa acompanhar o significado do dado, não apenas a presença de uma coluna `userid`.

## 24.46 Gradebook no backup

Activity modules que integram gradebook normalmente não devem tentar exportar diretamente as tabelas internas do Gradebook. A infraestrutura de backup do curso já conhece grade items e grades.

O plugin precisa garantir que seu próprio estado restaurado seja consistente com a forma como o gradebook será reconstruído e que os callbacks de nota funcionem depois do restore.

Se existe dado interno usado para calcular a nota, esse dado pode pertencer ao backup do plugin. A nota oficial do gradebook continua pertencendo ao subsystem apropriado.

## 24.47 Completion no backup

Configuração de completion vive associada ao course module e é tratada pelo core. O plugin não deveria duplicar flags de completion dentro do XML da activity apenas para "garantir" que elas voltem.

O que pertence ao plugin são campos próprios que sustentam regras customizadas, por exemplo `requirefeedback = 1`. Esses campos precisam ser transportados porque fazem parte da configuração da activity.

## 24.48 Grupos e groupings

Se dados próprios do plugin guardam `groupid` ou `groupingid`, essas referências precisam de annotations e mappings adequados.

Não copie um `groupid` cru para o restore. Mesmo que o curso restaurado contenha grupos equivalentes, os IDs físicos serão diferentes.

## 24.49 Links internos no conteúdo

Textos HTML podem conter links absolutos para páginas do Moodle, por exemplo:

```
https://origem.exemplo/mod/checkpoint/view.php?id=123
```

Se esse conteúdo for restaurado em outro domínio e o link continuar igual, ele apontará para o site antigo.

Por isso o backup possui mecanismo de encoding de links e o restore possui regras de decoding.

## 24.50 `encode_content_links()`

A activity task pode substituir links por tokens transportáveis:

```php
public static function encode_content_links($content) {
    global $CFG;

    $base = preg_quote($CFG->wwwroot, '/');

    $search = "/({$base}\/mod\/checkpoint\/view.php\?id=)([0-9]+)/";

    return preg_replace(
        $search,
        '$@CHECKPOINTVIEWBYID*$2@$',
        $content
    );
}
```

Não é necessário codificar URLs que não pertencem ao componente ou que já são tratadas por outro subsystem.

## 24.51 Decode de conteúdo

No restore task, `define_decode_contents()` informa quais campos precisam ter tokens decodificados:

```
public static function define_decode_contents() {
    return [
        new restore_decode_content(
            'checkpoint',
            ['intro', 'questiontext'],
            'checkpoint'
        ),
    ];
}
```

A regra precisa apontar para os campos em que esses links podem existir.

## 24.52 `define_decode_rules()`

Depois definimos como o token volta a ser uma URL no destino:

```
public static function define_decode_rules() {
    return [
        new restore_decode_rule(
            'CHECKPOINTVIEWBYID',
            '/mod/checkpoint/view.php?id=$1',
            'course_module'
        ),
    ];
}
```

O mapping `course_module` permite substituir o antigo cmid pelo novo.

## 24.53 Links codificados são diferentes de files

`@@PLUGINFILE@@` e URLs internas de activity resolvem problemas diferentes. Files embutidos usam a Files API e seu próprio processo de restore, enquanto links para páginas do Moodle podem precisar de encode/decode rules.

Misturar os dois conceitos costuma resultar em regex tentando corrigir URL de arquivo que o core já deveria tratar.

## 24.54 Mudança de domínio

Um bom teste de restore não deveria usar apenas o mesmo hostname. Se possível, restaure o backup em uma instalação com URL diferente.

Isso expõe links absolutos esquecidos, referências externas indevidas e dependências ocultas do `$CFG->wwwroot` antigo.

## 24.55 Backup de subplugins

Quando uma activity possui subplugins, o pai precisa oferecer pontos de integração para que cada filho inclua sua parte na estrutura.

O mecanismo de backup possui helpers como `add_subplugin_structure()`, usados por plugins extensíveis como Assignment, Quiz e Workshop.

A ideia é a mesma do Capítulo 20: o pai conhece o tipo de subplugin e oferece connection points, mas não deve conhecer os dados específicos de cada filho.

## 24.56 `add_subplugin_structure()`

Conceitualmente, o pai adiciona estruturas fornecidas pelos subplugins em determinado ponto da árvore.

Em vez de escrever:

```php
if ($plugin === 'meufilho') {
    // Exporta dados específicos.
}
```

Ele delega ao mecanismo de subplugin backup e cada implementação descreve seu próprio conteúdo.

Isso preserva a extensibilidade também durante backup/restore, que é justamente onde arquiteturas modulares costumam quebrar quando o host foi desenhado apenas para runtime.

## 24.57 Restore de subplugins

No restore acontece o inverso. O host fornece os connection points e cada subplugin processa seus paths, mappings e files.

Se um subplugin está ausente no destino, o comportamento precisa seguir o contrato do host e do restore. Não é aceitável produzir fatal error apenas porque um componente opcional do site A não existe no site B.

Dependendo do tipo, o restore pode alertar, ignorar aquela parte ou exigir instalação do componente antes de prosseguir.

## 24.58 Activity modules

Activity modules possuem o caminho mais conhecido de backup. Eles utilizam `backup_activity_task`, `backup_activity_structure_step`, `restore_activity_task` e `restore_activity_structure_step`.

Quando a activity declara `FEATURE_BACKUP_MOODLE2`, está dizendo ao core que implementa esse mecanismo.

Não declare a feature e deixe arquivos pela metade, porque duplicação e importação podem oferecer opções que terminarão em erro.

## 24.59 Blocks

Blocks também possuem suporte específico dentro do backup de curso. Configuração de instância pode ser transportada pelo mecanismo de blocks, e dados adicionais exigem participação adequada da API.

O que discutimos no Capítulo 16 continua valendo: tabela própria de um block não entra no backup apenas porque contém `blockinstanceid`.

## 24.60 Local plugins

Local plugins possuem uma classe especializada, `backup_local_plugin`, justamente porque alguns podem anexar dados a pontos do backup de curso.

Isso não significa que todo `local` deva entrar no `.mbz`. Se a tabela é global, representa configuração institucional ou uma integração independente do curso, colocar esses dados em cada backup seria conceitualmente errado.

Primeiro determine se o dado pertence ao curso, depois implemente o connection point correto.

## 24.61 Enrolment plugins

Enrolment possui suporte próprio porque instâncias de método e matrículas participam do curso.

O restore precisa decidir como recriar instâncias e matrículas, respeitando opções de usuários e políticas do método. Isso foi discutido no Capítulo 18 e aqui fica claro por que `enrol` não pode simplesmente exportar `user_enrolments` como tabela comum.

## 24.62 Course formats

Course formats também possuem classe especializada de backup plugin. Um formato pode guardar opções ou dados ligados à estrutura do curso e participar por connection points adequados.

Como o format controla apresentação e organização das seções, referências a seções restauradas precisam acompanhar os mappings do novo curso.

## 24.63 Admin tools

Admin tools possuem suporte específico com classes como `backup_tool_plugin` e `restore_tool_plugin` para pontos em que a ferramenta realmente possui dados de curso que precisam acompanhar o backup.

Novamente, não confunda disponibilidade de API com obrigação de exportar configuração global administrativa.

## 24.64 Themes e reports

A documentação do core também possui pontos específicos para themes e reports em contextos suportados pelo plano de backup.

Isso é importante para desmontar a ideia de que `backup/moodle2` pertence apenas a `mod`, mas também mostra por que não podemos generalizar dizendo que "qualquer plugin suporta backup automaticamente". Cada tipo precisa estar conectado ao plan por infraestrutura própria.

## 24.65 Question types e Question Engine

Questões são um caso mais complexo porque podem ser compartilhadas, versionadas e referenciadas por várias atividades. O Question Engine possui integração específica com backup para transportar question bank entries, versões, categorias, usages e referências quando necessário.

Um qtype implementa pontos próprios para seus options, answers e estruturas adicionais, em vez de tratar question tables como dados privados de uma activity.

O Capítulo 22 já mostrou por que copiar `question.id` cru entre instalações seria desastroso.

## 24.66 Advanced grading methods

Grading forms e outros subplugins também podem participar do backup pelos pontos disponibilizados pelo subsystem correspondente.

O padrão é o mesmo: o componente dono da estrutura cria o connection point e o subplugin descreve o que precisa transportar.

## 24.67 Erro comum com `backup_nested_element`

Um erro clássico é criar o elemento e esquecer de ligá-lo à árvore:

```php
$response = new backup_nested_element(...);
$response->set_source_table(...);
```

Mas nunca fazer:

```php
$responses->add_child($response);
```

O código parece completo, a source existe, porém o elemento não faz parte da estrutura retornada e não será exportado.

## 24.68 Erro `backup_nested_element`

Outro grupo de erros aparece quando o desenvolvedor tenta reutilizar o mesmo elemento em mais de um parent, cria nomes incompatíveis com paths de restore ou define fields que não existem na source.

Quando o erro cita `backup_nested_element`, não corrija por tentativa alterando arrays aleatoriamente. Volte para três perguntas: este elemento está ligado a qual parent, a source entrega exatamente os fields declarados e a árvore representa uma hierarquia válida?

## 24.69 Source e fields precisam bater

Se o nested element declara:

```
['userid', 'grade', 'timemodified']
```

mas o SQL retorna `user_id` em vez de `userid`, a estrutura não vai receber o dado esperado.

Aliases no SQL são perfeitamente válidos, mas precisam casar com o nome do campo declarado no elemento.

## 24.70 Não inclua IDs derivados desnecessários

Se `checkpointid` pode ser reconstruído pela relação de parent durante restore, muitas vezes não existe motivo para persistir esse campo no XML como informação de negócio.

Quanto menos IDs internos você transportar sem necessidade, menor o risco de reusar acidentalmente valores antigos.

## 24.71 Compatibilidade de versões

Backup também é formato de intercâmbio entre versões. Um plugin pode gerar backup em uma versão e restaurar em outra mais nova.

Por isso mudanças de schema precisam considerar restore de backups antigos. Se você adicionou um campo em 2.0, o `process_checkpoint()` deve saber lidar com XML de 1.5 que não possui esse campo.

Use defaults conscientes quando a informação não existia na versão antiga.

## 24.72 Restore de backup antigo

Um padrão comum:

```php
if (!isset($data->newsetting)) {
    $data->newsetting = 0;
}
```

Isso permite que a versão atual restaure backups criados antes da existência do setting.

Não exija que o backup antigo possua um campo que ele nunca poderia ter gerado.

## 24.73 Remover campo do plugin

Se um campo deixou de existir no schema atual, o restore pode simplesmente ignorar a informação antiga, desde que não exista necessidade de migração semântica.

Não mantenha coluna obsoleta no banco apenas porque backups antigos ainda carregam o valor.

A compatibilidade deve acontecer na camada de restore, não congelando o schema para sempre.

## 24.74 Migração durante restore

Às vezes um campo antigo precisa ser transformado para a estrutura nova. O `process_*()` é um bom lugar para converter o formato recebido antes de inserir.

Isso é diferente de `db/upgrade.php`. Upgrade transforma uma instalação existente; restore transforma um pacote de backup em dados novos na instalação atual.

## 24.75 Duplicação usa backup/restore

Quando o professor clica em Duplicar uma activity, o Moodle utiliza a infraestrutura de backup e restore.

Essa é uma das razões mais práticas para implementar backup cedo. Você não precisa esperar alguém migrar um curso para outro servidor para descobrir que está quebrado; o próprio fluxo diário de autoria pode depender disso.

## 24.76 Importação entre cursos

Importar atividades de outro curso também passa por essa infraestrutura. O destino pode ter courseid, sectionid, groupids e contextids completamente diferentes.

Se seu código depende de IDs absolutos persistidos em campos textuais ou JSON sem mappings, a importação tende a revelar o problema.

## 24.77 Dados externos não deveriam ser copiados cegamente

Uma activity pode guardar identificador de um recurso externo, como uma sala de videoconferência ou objeto em um ERP. Duplicar a atividade não significa necessariamente que o destino deve apontar para o mesmo recurso.

O plugin precisa decidir se o identificador é configuração transportável, se deve ser limpo no restore ou se deve disparar criação de um novo recurso externo.

Essa decisão é de domínio, e o backup é onde ela precisa ficar explícita.

## 24.78 Tokens e secrets

Token, senha e API key normalmente não pertencem a backup de curso. Se um campo sensível estiver na tabela da activity, não o inclua automaticamente no nested element apenas porque aparece no `install.xml`.

Avalie se o secret é global, se deve ser reconfigurado no destino e se a exportação criaria risco de segurança.

Backup funcional não significa copiar todo valor disponível.

## 24.79 Logs

Logs modernos são gerados por Events e normalmente o core possui regras próprias para restore de logs quando aplicável.

Uma activity não deveria criar uma tabela paralela de logs apenas para conseguir transportá-los. Se existe log de domínio essencial, trate como dado do plugin; se é auditoria técnica, provavelmente não precisa viajar com a atividade.

## 24.80 `define_restore_log_rules()`

Activities antigas ou fluxos que precisam restaurar logs podem definir regras:

```
public static function define_restore_log_rules() {
    return [
        new restore_log_rule(
            'checkpoint',
            'view',
            'view.php?id={course_module}',
            '{checkpoint}'
        ),
    ];
}
```

Em desenvolvimento atual, entenda primeiro se essa parte realmente é necessária para o plugin em vez de copiar regras históricas sem uso.

## 24.81 Teste de backup isolado da activity

Crie uma instância contendo tudo que o plugin suporta: intro com imagem, critérios, datas, arquivos, respostas de usuários, nota e configurações customizadas.

Gere um backup apenas daquela activity com user data habilitado e inspecione a restauração em outro curso.

Depois repita sem user data.

## 24.82 O que verificar depois do restore

Não basta verificar que o nome apareceu. Confirme:

```
configuração da instância
registros filhos
arquivos da intro
arquivos por resposta
mappings de usuários
grades
completion configuration
links internos
eventos de calendário quando aplicável
subplugins
permissões esperadas
```

Qualquer parte derivada da activity pode revelar um mapping ou cleanup esquecido.

## 24.83 Restore em outro site

O teste mais valioso é site A -> `.mbz` -> site B.

Use outra base, outro hostname e IDs diferentes. Se possível, crie usuários e cursos em ordem diferente para garantir que IDs antigos não coincidam por acaso.

Muitos plugins parecem restaurar corretamente no mesmo site apenas porque `userid = 15` continua sendo a mesma pessoa.

## 24.84 Teste sem o plugin instalado

Tente restaurar um backup que contém sua activity em um site onde o plugin não está instalado. Observe a mensagem do Moodle e entenda o comportamento.

Depois instale o plugin e repita. Isso ajuda a documentar dependências de restore para administradores.

## 24.85 Teste com versão mais nova do plugin

Gere um backup com versão antiga do plugin e restaure usando a versão atual.

Esse é o teste que valida compatibilidade real do formato e os defaults usados para campos adicionados depois.

Se cada release altera o XML sem considerar versões anteriores, backup se torna frágil exatamente quando mais é necessário.

## 24.86 PHPUnit para backup/restore

É possível automatizar boa parte desse fluxo. Um teste pode criar curso, usuário, activity e dados filhos, executar backup e restore e depois comparar o resultado.

Esse tipo de teste custa mais que um unit test simples, mas é extremamente valioso para plugins com estrutura complexa.

No Capítulo 25 vamos aprofundar a infraestrutura PHPUnit, porém vale desde já criar o código de produção de forma que o estado restaurado seja fácil de validar.

## 24.87 Não teste comparando IDs

Depois do restore os IDs devem mudar. Um teste que espera `newid === oldid` está validando exatamente a coisa errada.

Compare conteúdo e relações:

```
mesmo nome
mesmos critérios
mesmo número de respostas
usuário corretamente mapeado
arquivos presentes
links apontando para o novo cmid
```

## 24.88 Performance do backup

Backup pode processar volumes enormes, principalmente quando há dados de usuários. Não carregue milhões de respostas em um array PHP antes de gerar a estrutura.

O framework de backup e suas sources existem justamente para processar dados de forma controlada.

Evite queries N+1 em callbacks e sources desnecessariamente complexas.

## 24.89 Índices ainda importam

Uma source que filtra `checkpointid` em uma tabela de milhões de respostas precisa de índice coerente.

Backup não fica magicamente rápido porque roda no cron ou CLI. Uma consulta ruim executada centenas de vezes continua sendo ruim.

Os mesmos princípios do Capítulo 5 e do Capítulo 12 continuam valendo.

## 24.90 Memória

Não serializar tudo manualmente em arrays gigantes ajuda a manter uso de memória previsível.

Também tome cuidado em `after_execute()` para não buscar todos os mappings ou files de uma vez quando o subsystem já oferece métodos incrementais.

Backup de curso grande é um ótimo lugar para pequenas decisões de memória virarem falhas em produção.

## 24.91 Restore idempotente não significa executar duas vezes

Restore normalmente é um processo controlado e não foi desenhado para inserir a mesma estrutura repetidamente na mesma task. Mesmo assim, cada `process_*()` deve assumir que os IDs de origem não são confiáveis no destino e que toda relação passa por mapping.

Não use "já existe um registro com este ID" como estratégia de deduplicação.

## 24.92 Erros parciais

Se o restore falha no meio, o controller e o framework cuidam da operação geral. Não tente capturar qualquer exception dentro de `process_*()` e continuar silenciosamente.

Ignorar um erro de mapping pode gerar curso aparentemente restaurado, mas internamente corrompido.

Falhe com contexto suficiente quando a estrutura não pode ser reconstruída corretamente.

## 24.93 Diagnóstico de restore

Quando algo falha, identifique primeiro em que camada ocorreu:

```
plan
activity task
structure step
process_*()
mapping
files
decode de links
subplugin
```

Essa classificação reduz muito a tentativa aleatória de alterar XML, porque cada camada possui responsabilidades diferentes.

## 24.94 Não altere `.mbz` manualmente para corrigir plugin

Editar o XML de um backup pode ser útil para diagnóstico, mas não é correção do plugin.

Se o backup gerado está errado, corrija backup. Se o pacote antigo precisa de compatibilidade, corrija restore. Transformar arquivos manualmente não escala e não resolve duplicação nem futuras restaurações.

## 24.95 Exemplo de restore completo

Uma estrutura resumida para `restore_checkpoint_stepslib.php` poderia ficar assim:

```php
class restore_checkpoint_activity_structure_step
        extends restore_activity_structure_step {

    protected function define_structure() {
        $paths = [];

        $paths[] = new restore_path_element(
            'checkpoint',
            '/activity/checkpoint'
        );
        $paths[] = new restore_path_element(
            'criterion',
            '/activity/checkpoint/criteria/criterion'
        );
        $paths[] = new restore_path_element(
            'response',
            '/activity/checkpoint/responses/response'
        );

        return $this->prepare_activity_structure($paths);
    }

    protected function process_checkpoint($data) {
        global $DB;

        $data = (object)$data;
        $data->course = $this->get_courseid();

        $newid = $DB->insert_record('checkpoint', $data);
        $this->apply_activity_instance($newid);
    }

    protected function process_criterion($data) {
        global $DB;

        $data = (object)$data;
        $oldid = $data->id;
        $data->checkpointid = $this->get_new_parentid('checkpoint');

        $newid = $DB->insert_record('checkpoint_criteria', $data);
        $this->set_mapping('checkpoint_criterion', $oldid, $newid);
    }

    protected function process_response($data) {
        global $DB;

        $data = (object)$data;
        $oldid = $data->id;
        $data->checkpointid = $this->get_new_parentid('checkpoint');
        $data->userid = $this->get_mappingid('user', $data->userid);

        if (!$data->userid) {
            return;
        }

        $newid = $DB->insert_record('checkpoint_answers', $data);
        $this->set_mapping('checkpoint_response', $oldid, $newid, true);
    }

    protected function after_execute() {
        $this->add_related_files('mod_checkpoint', 'intro', null);
        $this->add_related_files(
            'mod_checkpoint',
            'response_attachment',
            'checkpoint_response'
        );
    }
}
```

O exemplo é pequeno o suficiente para leitura, mas já possui os pontos que normalmente separam um restore funcional de um restore apenas aparente.

## 24.96 O que eu procuro em code review

Quando reviso backup de um plugin, começo procurando tabelas próprias e classificando quais são configuração, dados filhos e dados de usuário. Depois procuro todos os campos que referenciam IDs externos à tabela e verifico annotations ou mappings. Em seguida olho file areas, links internos e subplugins.

No restore, verifico se o registro principal chama `apply_activity_instance()`, se filhos usam o novo parent, se mappings são criados antes de serem usados e se `after_execute()` restaura files com o mapping correto.

Por último testo duplicação, porque ela costuma revelar problema rapidamente.

## 24.97 Exercício - backup no site A e restore no site B

Evolua `mod_checkpoint` para possuir a tabela principal, pelo menos dois critérios de configuração, respostas de usuários e uma file area `response_attachment` cujo `itemid` é o ID da resposta.

Implemente `backup_checkpoint_activity_task`, `backup_checkpoint_activity_structure_step`, `restore_checkpoint_activity_task` e `restore_checkpoint_activity_structure_step`. Critérios devem entrar sempre; respostas e seus anexos somente quando user info estiver habilitado.

Anote `userid`, anote as file areas e crie mapping próprio para respostas. Adicione uma string HTML em `questiontext` contendo link para outra instância de `mod_checkpoint` e implemente encode/decode para que o link seja reescrito para o novo cmid no destino.

Depois faça quatro cenários. Primeiro backup e restore no mesmo curso por duplicação. Segundo backup do curso sem usuários. Terceiro backup completo do site A para site B com hostname e IDs diferentes. Quarto backup criado por uma versão anterior do plugin em que um novo campo de configuração ainda não existia.

O exercício só está concluído quando os anexos abrem, os usuários estão corretos, os links apontam para o destino, nenhuma resposta aparece no backup sem user data e a versão atual restaura o pacote antigo aplicando um default coerente.

## 24.98 O que precisa ficar deste capítulo

Backup e restore não são funcionalidades laterais de uma activity Moodle. Eles fazem parte do ciclo normal de autoria, porque duplicação e importação dependem da mesma infraestrutura.

A ideia principal é separar estrutura, dependências e identidade. `backup_nested_element` descreve a árvore, sources informam de onde vêm os dados, annotations registram referências que precisarão de tratamento, files são ligados pelas file areas e restore reconstrói tudo usando mappings em vez de confiar nos IDs antigos.

Também precisa ficar claro que `backup/moodle2` não pertence exclusivamente a activity modules, mas suporte de backup depende dos connection points disponibilizados para cada tipo de plugin. Criar uma pasta com esse nome não faz uma tabela global aparecer automaticamente em um `.mbz`.

Quando o backup foi bem implementado, o resultado mais importante é justamente não haver surpresa: o professor duplica, importa ou restaura e a atividade continua funcionando como se tivesse sido criada no destino, porque todos os IDs, files e referências foram reconstruídos pelo contrato correto.

## REFERÊNCIAS

MOODLE. Moodle Developer Resources. Backup API. Disponível em: https://moodledev.io/docs/5.2/apis/subsystems/backup. Acesso em: setembro de 2026.

MOODLE. Moodle Developer Resources. Restore API. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/backup/restore. Acesso em: setembro de 2026.

MOODLE. Moodle Developer Resources. Activity modules. Disponível em: https://moodledev.io/docs/5.1/apis/plugintypes/mod. Acesso em: setembro de 2026.

MOODLE. Moodle PHP Documentation. `backup_activity_task`. Disponível em: https://phpdoc.moodledev.io/main/d8/d39/classbackup__activity__task.html. Acesso em: setembro de 2026.

MOODLE. Moodle PHP Documentation. `backup_local_plugin`. Disponível em: https://phpdoc.moodledev.io/5.0/d8/de5/classbackup__local__plugin.html. Acesso em: setembro de 2026.

MOODLE. Moodle PHP Documentation. `backup_tool_plugin`. Disponível em: https://phpdoc.moodledev.io/5.0/dd/d5a/classbackup__tool__plugin.html. Acesso em: setembro de 2026.

MOODLE. Moodle source code. `mod/folder/backup/moodle2/backup_folder_activity_task.class.php`. Repositório oficial Moodle no GitHub. Acesso em: setembro de 2026.

MOODLE. Moodle source code. `mod/folder/backup/moodle2/backup_folder_stepslib.php`. Repositório oficial Moodle no GitHub. Acesso em: setembro de 2026.

MOODLE. Moodle source code. `mod/folder/backup/moodle2/restore_folder_activity_task.class.php`. Repositório oficial Moodle no GitHub. Acesso em: setembro de 2026.

MOODLE. Moodle source code. `mod/folder/backup/moodle2/restore_folder_stepslib.php`. Repositório oficial Moodle no GitHub. Acesso em: setembro de 2026.


{% endraw %}
