{% raw %}

# 18 PLUGINS DE MATRÍCULA

Quando um sistema externo diz que determinado aluno comprou um curso, assinou um contrato, entrou em uma turma ou perdeu o direito de acesso, o primeiro impulso de muita gente é criar um plugin `local`, inserir alguma coisa em `user_enrolments` e depois atribuir o papel de estudante. Isso pode até parecer simples no primeiro teste, mas é exatamente o tipo de atalho que ignora a arquitetura do Moodle, porque matrícula não é apenas uma linha que libera a entrada no curso, ela possui origem, instância, status, datas, relação com papéis, expiração, sincronização, eventos, backup e regras próprias de cada método.

O Moodle possui um tipo de plugin específico para isso, o `enrol`. Um plugin de matrícula não serve apenas para criar matrículas, ele representa a forma pela qual aquelas matrículas são controladas. A diferença é importante porque um aluno pode estar matriculado manualmente, outro por coorte, outro por banco externo, outro por pagamento e outro por uma integração institucional, todos no mesmo curso, cada um pertencendo a uma instância de método diferente e obedecendo regras diferentes para suspensão, remoção, duração e edição.

Neste capítulo vamos trabalhar com um exemplo chamado `enrol_contractsync`, imaginando uma instituição em que um ERP mantém os contratos acadêmicos e o Moodle deve refletir esse estado. Se o contrato estiver ativo, a matrícula precisa estar ativa; se estiver temporariamente bloqueado, talvez a matrícula deva ser suspensa; se for cancelado, a instituição precisa decidir se remove a matrícula ou apenas a suspende para preservar histórico. Esse cenário ajuda a entender por que gravar diretamente nas tabelas não é o mesmo que implementar corretamente um método de matrícula.

## 18.1 O que é um plugin de matrícula

Um plugin de matrícula é um plugin do tipo `enrol`, normalmente instalado em `enrol/nome` e identificado pelo componente `enrol_nome`. Seu objetivo é definir como usuários passam a estar matriculados em cursos e como essa relação será mantida ao longo do tempo.

A palavra importante aqui é "como". O Moodle já possui a infraestrutura geral de matrícula, com as tabelas `{enrol}` e `{user_enrolments}`, mas cada método decide de onde vem a autorização, se existe interação do usuário, se o professor pode alterar a matrícula manualmente, se existe sincronização externa, quais datas devem ser utilizadas e o que acontece quando a origem deixa de considerar o usuário válido.

Por isso, o plugin `enrol` não é apenas uma tela. Ele é o proprietário lógico das matrículas que criou por meio das suas instâncias.

## 18.2 Quando escolher `enrol` em vez de `local`

Se o problema principal é controlar quem está matriculado em quais cursos, `enrol` deve ser a primeira opção analisada. Um `local` pode observar eventos, oferecer relatórios ou conversar com sistemas externos, mas se ele passa a criar e remover matrículas como regra central da funcionalidade, geralmente está assumindo uma responsabilidade que já possui um plugin type próprio.

Um ERP que informa inscrições em cursos, uma regra institucional baseada em contratos, uma associação entre produtos e cursos, uma fonte LDAP, um banco acadêmico ou um mecanismo de pagamento podem justificar um plugin `enrol`, desde que a relação principal realmente seja uma matrícula de curso.

Se o sistema apenas precisa executar uma ação depois que uma matrícula ocorre, talvez um observer em outro tipo de plugin seja suficiente. Se precisa autenticar o usuário, o tipo correto provavelmente é `auth`. Se precisa vender e controlar planos que abrangem muitos serviços além da matrícula, talvez exista uma camada institucional maior, mas ainda assim a criação da matrícula deveria chegar ao Moodle pela Enrolment API.

## 18.3 Estrutura básica

Um plugin mínimo pode começar assim:

```
enrol/contractsync/
    db/
        access.php
    lang/
        en/
            enrol_contractsync.php
        pt_br/
            enrol_contractsync.php
    lib.php
    settings.php
    version.php
```

Dependendo do projeto, entram `classes/task/`, `db/tasks.php`, tabelas próprias, serviços, eventos, formulários, privacy provider e arquivos de backup. Diferentemente de vários plugins modernos em que a classe principal fica em `classes/`, o contrato histórico do tipo `enrol` ainda exige a classe base do plugin em `lib.php`.

## 18.4 A classe `enrol_plugin`

Todo método de matrícula deriva de `enrol_plugin`. Para o nosso exemplo:

```
class enrol_contractsync_plugin extends enrol_plugin {
}
```

Essa classe base, definida pelo core, concentra os contratos usados pelo Moodle para criar instâncias, matricular, suspender, remover, editar e sincronizar usuários. O plugin não deve reimplementar o mecanismo geral das tabelas de matrícula, ele deve sobrescrever apenas os pontos necessários ao seu fluxo e delegar ao `parent` quando estiver usando a implementação padrão.

Isso é parecido com o que vimos em outros tipos de plugin, mas aqui é ainda mais importante, porque `enrol_user()` não grava apenas um registro isolado. Ele coordena matrícula, papel atribuído pelo método, eventos e outras consequências esperadas pela plataforma.

## 18.5 Plugin e instância não são a mesma coisa

`enrol_contractsync` é o plugin instalado no site inteiro, enquanto uma instância é uma configuração daquele método dentro de um curso específico. Um mesmo curso pode ter uma instância de matrícula manual, uma de autoinscrição, uma de coorte e uma do nosso `contractsync` ao mesmo tempo.

Também é possível, dependendo do método, ter mais de uma instância do mesmo plugin no mesmo curso. Isso é útil quando cada instância representa uma origem ou regra diferente, mas exige que o plugin consiga distinguir com clareza qual instância é responsável por cada matrícula.

Essa separação explica por que o método `enrol_user()` recebe um objeto `$instance`. O usuário não é matriculado simplesmente "pelo plugin", ele é matriculado por uma instância daquele plugin em determinado curso.

## 18.6 A tabela `{enrol}`

A tabela `{enrol}` armazena as instâncias dos métodos de matrícula. Entre os campos importantes estão o curso, o nome do método, status, papel padrão e campos genéricos de configuração como `customint*`, `customchar*`, `customtext*` e `customdec*`.

Isso significa que o plugin não precisa criar uma tabela própria apenas para guardar duas ou três configurações simples da instância, embora tabelas próprias continuem fazendo sentido quando existe um modelo de dados maior, como histórico de sincronização, mapeamentos externos ou filas de integração.

No nosso exemplo, uma instância poderia guardar em `customchar1` o código externo da turma no ERP e em `customint1` a política escolhida para usuários removidos da origem. O nome do campo genérico é pouco expressivo, então o código precisa centralizar essa interpretação em constantes ou métodos, evitando `customint3` espalhado pelo projeto sem ninguém lembrar o que ele significa.

## 18.7 A tabela `{user_enrolments}`

A tabela `{user_enrolments}` representa a relação entre um usuário e uma instância de matrícula. Ela não liga diretamente o usuário ao curso, porque o curso já está ligado à instância na tabela `{enrol}`.

A relação simplificada é:

```
course
   |
   +-- enrol
          |
          +-- user_enrolments
                  |
                  +-- user
```

Isso permite que o Moodle saiba não apenas que o usuário está no curso, mas também qual método controla aquela matrícula. Essa informação é fundamental quando existem vários métodos ativos e quando apenas um deles deve ser sincronizado ou removido.

## 18.8 Matrícula e atribuição de papel são conceitos diferentes

Este é o ponto que precisa ficar mais claro do que qualquer outro neste capítulo. Estar matriculado não significa simplesmente ter o papel de estudante, e ter um papel no contexto do curso não significa necessariamente estar matriculado.

`{user_enrolments}` guarda a relação de matrícula, com status e datas. As atribuições de papel ficam em `{role_assignments}` e são relacionadas a um contexto. Um plugin de matrícula normalmente cria uma matrícula e atribui um papel no contexto do curso, mas são operações conceitualmente distintas.

Por isso é errado procurar "os alunos do curso" apenas em `role_assignments`, assim como é errado concluir que qualquer usuário matriculado necessariamente possui o papel que você espera. A própria documentação do Moodle ressalta que é possível estar matriculado sem papel e possuir papel sem matrícula.

## 18.9 É possível ter papel sem matrícula

Administradores, managers e customizações institucionais deixam isso bem evidente. Um usuário pode possuir uma atribuição de papel em determinado contexto e ainda assim não possuir um registro em `user_enrolments` relacionado àquele curso.

Esse detalhe aparece em verificações como `is_enrolled()`, em listagens de participantes, em atividades que exigem participação e no gradebook. Capability e matrícula respondem perguntas diferentes. A capability diz o que o usuário pode fazer naquele contexto, enquanto a matrícula representa a participação formal controlada por um método de enrolment.

Se o seu requisito é "somente participantes matriculados podem enviar", verificar apenas `has_capability()` pode ser insuficiente.

## 18.10 Como o Moodle decide se uma matrícula está ativa

Ter uma linha em `{user_enrolments}` não basta para considerar a matrícula ativa. O Moodle combina diferentes estados, porque a matrícula pode ainda não ter começado, pode ter terminado, pode estar suspensa, a instância pode estar desativada ou até o plugin pode estar desabilitado no site.

De forma prática, entram nessa decisão o registro da matrícula, `timestart`, `timeend`, o status do usuário, o status da instância e o estado geral do plugin. Isso evita que cada plugin invente uma coluna `active` própria sem respeitar datas e configuração do método.

## 18.11 Status da instância

A instância em `{enrol}` possui seu próprio status. Uma instância desabilitada continua existindo, mas deixa de oferecer matrícula ativa por aquele método.

É diferente de suspender um usuário específico. Se uma instância que representa a turma `ERP-2026-03` for desabilitada, o problema é a origem inteira naquele curso; se apenas um contrato foi bloqueado, o status deveria ser alterado no `user_enrolments` daquele usuário.

Essa distinção ajuda a evitar soluções como suspender centenas de usuários quando na verdade a regra era apenas desativar temporariamente uma instância.

## 18.12 `ENROL_USER_ACTIVE` e `ENROL_USER_SUSPENDED`

O status da matrícula do usuário normalmente utiliza `ENROL_USER_ACTIVE` ou `ENROL_USER_SUSPENDED`. Suspender mantém a relação de matrícula, mas impede a participação normal daquele usuário por aquela matrícula.

Suspensão é muito útil em integrações acadêmicas. Imagine um aluno com pendência financeira temporária. Se a política institucional exige preservar histórico e retornar o acesso quando a situação for regularizada, suspender pode representar melhor o estado do que remover completamente a matrícula.

Mas a decisão não é técnica apenas. Ela precisa refletir a política institucional, porque uma remoção pode ter consequências diferentes em relatórios, grupos, papéis e visualização de dados históricos.

## 18.13 `timestart` e `timeend`

Uma matrícula pode possuir início e fim. Esses campos permitem criar acesso futuro ou limitar a participação até determinada data sem precisar de uma task que ative e desative manualmente cada usuário no minuto exato.

```php
$timestart = strtotime('2026-10-01 00:00:00');
$timeend = strtotime('2026-12-31 23:59:59');
```

O erro comum é tratar `timeend` apenas como informação visual. Ele participa do estado efetivo da matrícula, então relatórios e integrações precisam entender que uma matrícula pode continuar registrada, mas já não estar ativa pelo critério temporal.

## 18.14 Obtendo o plugin com `enrol_get_plugin()`

Quando outro código precisa operar uma matrícula por meio de um método, o caminho correto é obter o plugin pela API:

```php
$plugin = enrol_get_plugin('contractsync');
```

Se o plugin existe, `$plugin` será uma instância de `enrol_contractsync_plugin`. A partir daí o código pode chamar os métodos públicos da Enrolment API em vez de alterar `{user_enrolments}` diretamente.

Essa abordagem preserva os contratos do plugin e permite que ele valide regras adicionais em métodos sobrescritos.

## 18.15 Obtendo instâncias com `enrol_get_instances()`

Para descobrir os métodos configurados em um curso, utilize `enrol_get_instances()`:

```php
$instances = enrol_get_instances($courseid, true);
```

O segundo parâmetro define se apenas instâncias habilitadas devem ser retornadas. Em uma integração é comum filtrar depois pelo campo `enrol`:

```php
foreach ($instances as $instance) {
    if ($instance->enrol !== 'contractsync') {
        continue;
    }

    // Esta instância pertence ao nosso método.
}
```

Não assuma que existe uma única instância por curso se o desenho do plugin permite várias.

## 18.16 Criando uma instância

O método `add_instance()` cria uma instância do enrolment dentro de um curso. Isso é diferente de matricular um usuário.

```php
$plugin = enrol_get_plugin('contractsync');

$instanceid = $plugin->add_instance($course, [
    'status' => ENROL_INSTANCE_ENABLED,
    'roleid' => $studentroleid,
    'customchar1' => 'ERP-TURMA-2026-03',
]);
```

Depois disso a instância existe e pode passar a controlar usuários. Em um plugin sincronizado, muitas vezes a instância é configurada por um administrador ou professor e uma task posterior traz os participantes.

## 18.17 Interface padrão de edição

O Moodle possui uma interface padrão para adicionar e editar instâncias de enrolment. Quando o plugin consegue encaixar seu fluxo nela, normalmente é melhor utilizá-la do que inventar páginas independentes para configurações que pertencem claramente à instância.

Métodos como `use_standard_editing_ui()`, `edit_instance_form()`, `edit_instance_validation()`, `can_add_instance()` e `add_instance()` permitem integrar o plugin à gestão de métodos de matrícula do curso.

A lógica é parecida com o que discutimos em Forms API: use o fluxo padrão quando ele atende o problema, porque isso reduz inconsistência de navegação, capability, validação e manutenção futura.

## 18.18 `can_add_instance()`

`can_add_instance()` responde se o usuário atual pode adicionar uma instância daquele método no curso. Isso não deve ser decidido apenas porque a pessoa consegue abrir uma URL.

Um plugin institucional pode exigir uma capability como `enrol/contractsync:config`, enquanto um plugin totalmente automático talvez nem permita que professores criem instâncias manualmente.

A interface precisa refletir a regra real do sistema, mas a proteção também deve existir no processamento, porque esconder um botão não é mecanismo de autorização.

## 18.19 `allow_enrol()`

`allow_enrol()` indica se outros códigos podem matricular manualmente usuários naquela instância utilizando o fluxo padrão. Em um método realmente manual isso faz sentido, mas em um método sincronizado com ERP pode ser perigoso.

Imagine que um professor matricule manualmente alguém na instância `contractsync` sem que exista contrato no ERP. Na próxima sincronização o plugin provavelmente removerá ou suspenderá esse usuário, o que gera uma experiência confusa. Por isso plugins controlados por fonte externa normalmente restringem edição manual.

## 18.20 `enrol_user()`

A operação central para criar uma matrícula é `enrol_user()`:

```php
$plugin->enrol_user(
    $instance,
    $userid,
    $roleid,
    $timestart,
    $timeend,
    ENROL_USER_ACTIVE
);
```

Esse método deve ser preferido em vez de inserir diretamente em `{user_enrolments}` e depois criar `role_assignments`. O core conhece as relações entre matrícula, papel e eventos, enquanto uma sequência manual tende a esquecer algum detalhe.

Um plugin pode sobrescrever `enrol_user()` para validar regras próprias e depois chamar `parent::enrol_user()`, mas não deveria duplicar internamente toda a implementação do core.

## 18.21 O papel informado em `enrol_user()`

O `roleid` representa o papel que aquela instância atribuirá ao usuário no contexto do curso. Em muitos casos será o papel estudante, mas isso não é obrigatório.

O campo `roleid` também pode existir na própria instância como papel padrão. A regra precisa ser clara, porque alternar papéis de forma inconsistente pode criar matrículas corretas com permissões erradas.

Se a integração externa envia um perfil acadêmico, não aceite qualquer ID de papel recebido de fora. Faça mapeamento controlado e valide se o papel pode realmente ser atribuído naquele contexto.

## 18.22 `recovergrades`

Ao matricular novamente um usuário que já participou do curso, o Moodle pode recuperar histórico de notas removido em uma matrícula anterior, dependendo da política e do parâmetro `recovergrades`.

Esse é um exemplo de detalhe que seria facilmente perdido se o desenvolvedor tratasse matrícula como `INSERT INTO user_enrolments`. A API sabe que o ciclo de matrícula pode ter consequências em outras áreas e por isso expõe parâmetros específicos.

A decisão de recuperar notas deve seguir a regra institucional, não ser ativada automaticamente sem entender o que aconteceu na matrícula anterior.

## 18.23 Atualizando a matrícula com `update_user_enrol()`

Quando o usuário continua pertencendo à mesma instância, mas muda status ou período, não é necessário remover e criar novamente. Utilize `update_user_enrol()`:

```php
$plugin->update_user_enrol(
    $instance,
    $userid,
    $newstart,
    $newend,
    ENROL_USER_ACTIVE
);
```

Isso é particularmente importante em sincronizações, porque manter a mesma relação reduz efeitos colaterais e preserva o significado de "esta matrícula continua sendo controlada pela mesma origem".

## 18.24 Suspender em vez de remover

Suspender costuma ser a melhor escolha quando a relação acadêmica continua existindo, mas o acesso deve ser temporariamente bloqueado. Um contrato inadimplente, matrícula acadêmica trancada ou afastamento temporário podem entrar nessa categoria, dependendo da política da instituição.

```php
$plugin->update_user_enrol(
    $instance,
    $userid,
    null,
    null,
    ENROL_USER_SUSPENDED
);
```

Na prática você normalmente preserva as datas existentes em vez de passar `null` cegamente, porque a assinatura e o comportamento precisam ser conferidos na versão suportada. O exemplo serve para mostrar a intenção: atualizar o estado da matrícula, não reconstruí-la inteira.

## 18.25 Removendo com `unenrol_user()`

Quando a política realmente exige encerrar aquela matrícula, utilize:

```php
$plugin->unenrol_user($instance, $userid);
```

A remoção não significa apagar todas as contribuições feitas pelo usuário no curso. Posts de fórum, submissões e outros dados possuem regras próprias. O Moodle tenta preservar conteúdo que precisa continuar visível para outros participantes, enquanto dados de participação que não fazem mais sentido podem deixar de aparecer em algumas interfaces.

Por isso `unenrol_user()` é uma operação com consequência e não deve ser usada como se fosse simplesmente mudar uma flag.

## 18.26 Remover matrícula não é apagar o usuário

Parece óbvio, mas integrações ruins às vezes misturam esses conceitos. Desmatricular alguém de um curso não deve excluir sua conta, assim como excluir uma conta não deveria ser o mecanismo normal para retirar acesso a cursos.

Usuário, matrícula, papel e participação são camadas distintas. Quanto melhor o plugin respeita essas fronteiras, menos surpresas aparecem quando a mesma pessoa participa de muitos cursos por diferentes métodos.

## 18.27 `allow_unenrol()`

`allow_unenrol()` informa se operações externas podem remover todos os usuários daquela instância, por exemplo em alguns fluxos de reset ou gerenciamento.

Em um método sincronizado você pode decidir que ninguém deve remover manualmente matrículas controladas pelo ERP, porque a fonte de verdade seria quebrada. Em outros casos pode ser aceitável permitir a operação, desde que a capability correspondente também exista.

A resposta desse método precisa refletir propriedade do dado, não conveniência da interface.

## 18.28 `allow_unenrol_user()`

`allow_unenrol_user()` permite uma decisão mais específica para uma matrícula individual. Um padrão usado por alguns plugins é permitir remoção manual somente quando a matrícula já está suspensa.

Isso faz sentido porque o plugin pode dizer: enquanto a origem considera o usuário ativo, o professor não pode removê-lo; depois que a origem suspende a matrícula, uma limpeza manual pode ser permitida.

Essa lógica evita a disputa clássica em que um professor remove e a task externa recria alguns minutos depois.

## 18.29 `allow_manage()`

`allow_manage()` define se outros códigos podem alterar manualmente status e datas daquela matrícula. Plugins de sincronização geralmente retornam `false`, porque qualquer alteração manual seria revertida na próxima sincronização.

Se o ERP diz que a matrícula termina em 30 de novembro, permitir que o professor altere `timeend` para dezembro pode criar uma informação que dura apenas até o próximo cron. É melhor impedir a edição do que oferecer um formulário que mente para o usuário.

## 18.30 `roles_protected()`

O método `roles_protected()` controla se os papéis atribuídos pelo método de matrícula podem ser modificados por outros fluxos. Por padrão a proteção existe justamente porque aquele papel pode ser parte do contrato do enrolment.

Em um método externo, remover manualmente o papel estudante mas manter a matrícula pode deixar o usuário numa situação difícil de interpretar. Se a integração é a dona daquela atribuição, proteger o papel é coerente.

Se o projeto quer permitir que os papéis sejam administrados separadamente, isso precisa ser uma decisão explícita e testada.

## 18.31 Capabilities do plugin

Um enrolment plugin normalmente define capabilities no contexto de curso. Dependendo do fluxo podem aparecer:

```
enrol/contractsync:config
enrol/contractsync:enrol
enrol/contractsync:manage
enrol/contractsync:unenrol
enrol/contractsync:unenrolself
```

Não é obrigatório usar todas. Um sincronizador automático talvez precise apenas de `config`, enquanto um método manual pode expor `enrol`, `manage` e `unenrol`.

A capability sozinha também não substitui métodos como `allow_manage()`. Os dois mecanismos se complementam: um define se o plugin admite a operação, o outro define se aquele usuário possui permissão para executá-la.

## 18.32 Autoinscrição é outro fluxo

No `enrol_self`, o próprio usuário inicia a matrícula. Isso exige uma interface diferente de um sincronizador automático, porque o plugin precisa decidir se deve mostrar um link, apresentar formulário, validar chave, restrição de coorte ou outras condições.

Plugins interativos podem sobrescrever métodos como `show_enrolme_link()` e `enrol_page_hook()`. Isso mostra por que o mesmo plugin type atende fluxos muito diferentes, todos ligados pelo mesmo conceito de matrícula.

Não copie o `enrol_self` inteiro para criar um sincronizador externo. Escolha apenas os contratos que correspondem ao seu workflow.

## 18.33 Plugins totalmente automáticos

Um plugin como nosso `contractsync` pode não apresentar qualquer formulário ao aluno. A matrícula nasce porque uma fonte externa diz que ela deve existir.

Nesse caso a arquitetura normalmente combina uma instância por curso ou turma, uma task de sincronização, mapeamento com a chave externa e políticas claras de criação, atualização, suspensão e remoção.

O professor não precisa "clicar para sincronizar" se o processo é recorrente, embora uma ação manual administrativa possa existir para diagnóstico.

## 18.34 A fonte de verdade

Antes de escrever a task, defina quem manda. Se o ERP é a fonte de verdade, o Moodle não deveria permitir alterações que serão sobrescritas silenciosamente. Se o Moodle pode complementar os dados, separe claramente quais campos são locais e quais são externos.

Esse conceito resolve muitas decisões. Se o ERP controla início e fim, a task atualiza `timestart` e `timeend`. Se o professor pode estender a matrícula localmente, então a sincronização não pode simplesmente substituir `timeend` sempre que rodar.

Sem essa definição, o plugin vira uma disputa entre interfaces.

## 18.35 Estratégias quando o usuário desaparece da origem

O core define políticas que aparecem em vários plugins de sincronização. Entre elas estão remover, manter, suspender mantendo papéis e suspender removendo papéis.

Em termos conceituais:

```
UNENROL              remove a matrícula
KEEP                  mantém como está
SUSPEND               suspende e mantém os papéis
SUSPENDNOROLES        suspende e remove papéis controlados pela instância
```

As constantes reais do core começam com `ENROL_EXT_REMOVED_`. Use essas constantes em vez de números mágicos e explique a opção ao administrador, porque cada escolha altera a experiência do usuário e a visibilidade em relatórios.

## 18.36 Sincronização por Scheduled Task

Uma fonte externa com milhares de contratos não deveria ser consultada durante cada `require_login()`. O local natural é uma Scheduled Task:

```
enrol/contractsync/
    classes/
        task/
            sync_enrolments.php
    db/
        tasks.php
```

A task busca mudanças, resolve a instância correspondente, compara o estado externo com o Moodle e aplica somente o necessário.

Se o processo for grande, utilize as estratégias do Capítulo 11, como lotes, retomada, logs, lock e eventualmente adhoc tasks para dividir trabalho.

## 18.37 A task precisa ser idempotente

Se a task rodar duas vezes com os mesmos dados, o resultado deveria ser o mesmo. Isso significa não criar matrícula duplicada, não reenviar mensagem de boas-vindas toda vez e não gerar eventos artificiais sem mudança real.

Um fluxo típico é descobrir primeiro se já existe `{user_enrolments}` para aquele usuário e instância. Se existe, compare status e datas antes de chamar atualização. Se não existe, matricule.

Idempotência é especialmente importante porque cron pode falhar no meio, ser reexecutado, ter mais de um worker ou receber o mesmo registro externo novamente.

## 18.38 `sync_user_enrolments()`

A classe base possui um ponto de sincronização por usuário, usado pelo core em cenários específicos. Alguns métodos podem sobrescrever `sync_user_enrolments($user)` quando faz sentido recalcular as matrículas daquele usuário.

Isso não transforma login em lugar adequado para sincronizar um ERP inteiro. A própria infraestrutura precisa proteger frequência e custo. Se o processo envolve grandes consultas externas, prefira task programada e mantenha qualquer sincronização por usuário extremamente barata e bem controlada.

## 18.39 Sincronização incremental

Buscar todas as matrículas de todos os cursos a cada minuto pode funcionar com cem alunos e falhar com cem mil. Uma integração madura procura mudanças desde o último cursor, timestamp ou identificador processado.

Por exemplo, o ERP pode oferecer:

```
GET /enrolments?updated_after=2026-09-23T18:00:00
```

O plugin processa apenas alterações, registra o cursor com segurança e faz varreduras completas periódicas para corrigir divergências. Isso reduz carga sem assumir que nenhuma atualização foi perdida.

## 18.40 Lock e múltiplos workers

Se duas execuções sincronizarem a mesma instância ao mesmo tempo, podem ocorrer corridas, mensagens duplicadas e atualizações conflitantes. Use Lock API quando houver risco real de concorrência.

O lock pode ser por instância, por curso ou por partição da integração, dependendo do volume. Um lock global simplifica, mas mata paralelismo; um lock granular exige mais desenho, mas escala melhor.

Não tente resolver isso com um campo `running = 1` sem expiração e sem atomicidade.

## 18.41 Cohorts e matrícula

Cohort é um agrupamento de usuários em um contexto, enquanto enrolment é participação em um curso. O plugin `enrol_cohort` conecta essas duas coisas ao sincronizar membros de uma coorte para uma instância de matrícula no curso.

Isso é diferente de "matricular os membros atuais da coorte uma vez". Na sincronização, quando a composição da coorte muda, a matrícula acompanha conforme a política do método.

Essa diferença precisa estar clara ao escolher entre uma ação pontual e um vínculo permanente.

## 18.42 Coorte não é turma de curso automaticamente

Muita instituição usa a palavra turma para tudo, mas o Moodle possui conceitos diferentes. Uma coorte pode existir em nível de sistema ou categoria, um grupo existe dentro de um curso e uma instância de enrolment conecta usuários ao curso.

Se a turma acadêmica externa corresponde a uma coorte, você pode usar `enrol_cohort`. Se ela precisa de regras específicas de contrato, calendário e origem, talvez um enrolment plugin próprio represente melhor o caso.

Não escolha a estrutura apenas pelo nome usado no ERP.

## 18.43 Sincronização com grupos

Alguns enrolment plugins também adicionam usuários a grupos do curso. Isso pode ser útil quando uma instância representa uma turma específica e os participantes precisam ficar separados dentro das atividades.

Mas grupo e matrícula também são conceitos diferentes. O plugin deve tratar a entrada no grupo como uma consequência controlada da instância, e a remoção precisa ser coerente com a política de desmatrícula e suspensão.

Se a instituição permite mover o aluno manualmente de grupo, decida se a próxima sincronização deve respeitar ou sobrescrever essa alteração.

## 18.44 Expiração de matrícula

Quando o plugin usa `timeend`, precisa pensar no que acontece depois da data. O core possui suporte para processamento de expirações e notificações em métodos que implementam esse comportamento.

Métodos como `process_expirations()` e `send_expiry_notifications()` existem porque expirar não é apenas perceber que o timestamp passou. Pode haver política para suspender, remover, avisar o usuário ou avisar responsáveis.

Não crie outra task paralela sem verificar primeiro o contrato que a Enrolment API já oferece.

## 18.45 Notificação de expiração

Uma instituição pode querer avisar o aluno alguns dias antes do fim da matrícula. Isso exige mais do que mandar e-mail quando `timeend < time()`, porque é preciso controlar janela de aviso, evitar duplicidade, respeitar configuração da instância e escolher o canal correto.

Se o método já utiliza o suporte de expiração do core, mantenha a lógica integrada a ele. Se precisa de uma regra institucional adicional, registre claramente quando a mensagem foi enviada ou derive a janela de maneira idempotente.

## 18.46 Integração com sistemas externos

Um enrolment plugin externo normalmente precisa mapear pelo menos três coisas: usuário, curso e instância/origem. O erro mais grave é confiar em IDs internos do Moodle como identificadores duráveis no sistema externo.

Prefira `idnumber`, campos controlados ou uma tabela explícita de mapeamento:

```
external_course_id -> courseid
external_user_id   -> userid
external_class_id  -> enrol_instance_id
```

Isso permite migrar ambientes, restaurar cursos e trabalhar com IDs internos diferentes sem quebrar a integração.

## 18.47 Nunca grave diretamente em `{user_enrolments}` para "ganhar tempo"

A tabela é visível, a estrutura parece simples e o `INSERT` funciona. Ainda assim, isso ignora o contrato do plugin, atribuição de papel, eventos, callbacks e outras consequências esperadas pelo Moodle.

O mesmo vale para `role_assignments`. Se a sua intenção é criar uma matrícula, use a Enrolment API. Acesso direto às tabelas pode ser necessário em relatórios e diagnósticos, mas não deve substituir a API para mutações normais.

Esse é um princípio que atravessa o livro inteiro: ler tabela interna pode ser aceitável em casos específicos, escrever por fora do contrato público normalmente é onde começam os bugs difíceis.

## 18.48 Matrícula por pagamento

Pagamento é um fluxo interativo em que o usuário adquire o direito de ser matriculado depois que uma cobrança é confirmada. O plugin de enrolment continua sendo responsável pela relação com o curso, mas o processamento financeiro não deveria ser reinventado dentro dele se a plataforma já possui a Payment API e gateways.

O enrolment define preço, moeda, instância e o que acontece após a confirmação, enquanto o gateway cuida da comunicação com o provedor de pagamento. Essa separação permite trocar PayPal, Pix, cartão ou outro gateway sem transformar cada método de matrícula em uma integração financeira completa.

## 18.49 Não confunda gateway de pagamento com método de matrícula

Um gateway responde "como cobrar". O enrolment responde "o que o pagamento libera". A diferença parece semântica até o dia em que o mesmo gateway precisa ser usado para outro tipo de compra ou o mesmo método de matrícula precisa aceitar outro provedor.

Se o plugin `enrol` chama diretamente uma API de cartão, cria webhook próprio, armazena transação e ainda controla matrícula, ele começa a acumular responsabilidades. Em projetos institucionais maiores, separe cobrança, confirmação e enrolment por contratos bem definidos.

## 18.50 Pagamento confirmado deve ser idempotente

Webhooks financeiros podem chegar mais de uma vez. Nunca assuma que "pagamento aprovado" será entregue uma única vez.

Antes de matricular, valide se a transação já foi processada e se a matrícula já existe naquela instância. O segundo recebimento deve terminar com o mesmo estado, não criar outra matrícula, outra atribuição de papel ou outra mensagem de boas-vindas.

O princípio é o mesmo das tasks do Capítulo 11 e dos webhooks do Capítulo 14.

## 18.51 Eventos de matrícula

A Enrolment API dispara eventos relacionados ao ciclo de matrícula. Esses eventos são úteis para auditoria, integrações secundárias e funcionalidades que precisam reagir depois que algo aconteceu.

Se outro plugin precisa informar ao CRM que um aluno foi matriculado, observar o evento pode ser mais apropriado do que acoplar o CRM dentro de cada método de matrícula.

Mas lembre da regra do Capítulo 10: Event representa um fato ocorrido. Não use observer para tentar impedir uma matrícula que já deveria ter sido barrada pelo próprio método ou pela autorização anterior.

## 18.52 O observer não deve virar uma segunda fonte de matrícula

É possível observar evento e em seguida criar outra matrícula, o que pode ser legítimo em um fluxo bem definido, mas também pode criar cadeias difíceis de entender. Um enrolment gera evento, observer matricula em outro curso, novo evento dispara e outra regra roda.

Se existe uma regra institucional de cascata, documente a origem, evite loops e prefira uma camada explícita de orquestração. Eventos são excelentes para desacoplar, mas não devem esconder o modelo de negócio.

## 18.53 Backups precisam entender a origem da matrícula

Quando um curso é salvo em backup, as instâncias de enrolment fazem parte do contexto do curso e podem participar da restauração. O comportamento correto depende do método.

Uma matrícula manual pode ser restaurada de forma diferente de uma matrícula controlada por ERP. Se a origem externa continua sendo a fonte de verdade, restaurar usuários antigos como se ainda estivessem válidos pode ser errado.

Por isso o tipo `enrol` possui pontos próprios para backup e restore, e plugins mais complexos podem precisar implementar métodos específicos de restauração da instância e das matrículas dos usuários.

## 18.54 Restaurando instâncias

Durante restore, o Moodle precisa decidir se cria uma nova instância, reutiliza uma existente ou ignora determinado método. O plugin pode controlar esse comportamento quando o padrão não representa seu caso.

No `contractsync`, por exemplo, uma instância restaurada em um Moodle de homologação não deveria começar imediatamente a sincronizar com a turma de produção apenas porque `customchar1` manteve o identificador externo. Talvez seja necessário desabilitar a instância restaurada ou exigir remapeamento.

Esse é um problema real de arquitetura, não apenas de backup.

## 18.55 Restaurando matrículas de usuários

O restore também precisa decidir o que fazer com usuários que estavam matriculados pela instância original. Em um método externo, frequentemente faz sentido deixar a sincronização reconstruir o estado atual em vez de confiar cegamente no snapshot antigo.

Em outros casos, preservar a matrícula suspensa pode ser necessário para manter histórico. O plugin deve escolher conscientemente, utilizando os contratos de restore do enrolment em vez de manipular as tabelas depois que o backup terminou.

## 18.56 Papéis durante restore

Como matrícula e papel são separados, restore precisa considerar os dois. Se o método de matrícula controla o papel, o plugin deve preservar a relação correta entre a nova instância, o usuário restaurado e a atribuição gerenciada pelo componente.

É aqui que soluções manuais baseadas em SQL costumam se perder, porque o `itemid` da atribuição pode apontar para a instância antiga e os IDs mudam na restauração.

Backup e restore existem justamente para remapear identificadores internos com segurança.

## 18.57 `find_instance()` e criação de cursos por CSV

Plugins que conseguem identificar unicamente uma instância a partir de dados declarativos podem implementar `find_instance()`. Isso permite integração com fluxos como upload de cursos por CSV.

O método precisa conseguir distinguir uma instância sem ambiguidade. Em coorte, por exemplo, uma combinação de identificadores pode ser suficiente, mas em métodos mais complexos talvez não exista um conjunto de dados estável que identifique uma única instância.

Não implemente apenas para "suportar CSV" se duas instâncias podem responder ao mesmo conjunto de campos.

## 18.58 Segurança em plugins de matrícula

Matrícula muda acesso ao curso, por isso qualquer endpoint que crie, suspende ou remove usuários é uma operação de autorização sensível. Valide contexto de curso, capability, `sesskey` em ações de navegador e ownership da instância.

Em Web Services, use `validate_context()` e capabilities adequadas. Em tasks, não existe usuário interativo para autorizar a operação, então a confiança vem da configuração segura da integração, credenciais e regras internas do plugin.

Não aceite `courseid`, `userid`, `roleid` e `enrolid` do cliente e conclua que a combinação é válida apenas porque todos são inteiros.

## 18.59 Performance e grandes volumes

Sincronizar matrícula de uma universidade inteira pode envolver milhões de relações. O primeiro cuidado é não executar uma consulta por aluno dentro de um loop se uma consulta em lote resolve o mesmo problema.

Carregue o conjunto de matrículas existentes da instância, indexe por `userid`, compare em memória quando o volume permitir e processe em lotes. Em volumes maiores, use recordsets e particionamento.

Também evite chamadas externas por usuário. Se o ERP oferece lote, página ou stream de alterações, use isso. O custo de rede pode ser muito maior do que o custo do banco local.

## 18.60 Logs de sincronização

Uma task que apenas imprime "sync finished" é quase inútil quando alguém pergunta por que o aluno 48321 perdeu acesso. Registre informações suficientes para diagnosticar o fluxo sem expor dados sensíveis.

Um bom log pode indicar:

```
instância 87
curso 214
origem ERP-TURMA-2026-03
processados 1450
criados 12
reativados 4
suspensos 7
removidos 0
erros 2
```

Para investigação individual, mantenha um identificador de correlação ou uma tabela de auditoria se a instituição realmente precisa desse histórico.

## 18.61 Erros comuns

O primeiro erro é gravar diretamente em `{user_enrolments}`. O segundo é tratar papel como sinônimo de matrícula. O terceiro é permitir edição manual em uma instância que será sobrescrita pelo ERP. O quarto é usar `unenrol_user()` para qualquer ausência temporária quando a política deveria suspender. O quinto é sincronizar tudo no login. O sexto é processar toda a base em uma única transação ou request.

Outro erro frequente é não separar instância de plugin. O código busca "a instância do contractsync" e simplesmente pega a primeira, embora o curso possa ter mais de uma. Quando a arquitetura permite múltiplas instâncias, a chave externa precisa identificar qual delas controla aquela matrícula.

## 18.62 Um fluxo completo para `enrol_contractsync`

Vamos imaginar a sequência de uma sincronização madura. A task busca alterações no ERP desde o último cursor e encontra que o usuário externo `A9842` passou a ter contrato ativo na turma `T2026-03`. O plugin resolve `A9842` para um `userid`, resolve a turma para uma instância `enrol_contractsync`, procura a matrícula existente e não encontra.

Então chama:

```php
$plugin->enrol_user(
    $instance,
    $userid,
    $instance->roleid,
    $contract->timestart,
    $contract->timeend,
    ENROL_USER_ACTIVE
);
```

Alguns dias depois o contrato é bloqueado. A task encontra a mesma matrícula e chama `update_user_enrol()` para suspender. Quando o contrato volta ao estado regular, a mesma relação é reativada, sem remover e recriar a matrícula.

Se o contrato for encerrado definitivamente, o comportamento dependerá da configuração `External unenrol action`. Em uma instituição pode ser `SUSPEND`, em outra `UNENROL`, e o código não precisa ter essa política escondida em um `if` fixo.

## 18.63 O que pertence ao plugin e o que pertence ao core

O plugin decide de onde vem a verdade, como mapear a instância, qual política aplicar, quando sincronizar e quais configurações expor. O core deve continuar responsável por criar e atualizar a relação de matrícula, atribuir o papel pelo contrato da API, disparar eventos e manter a infraestrutura geral.

Essa separação é o que faz um enrolment plugin continuar compatível com o restante do Moodle. Quanto mais ele tenta substituir a Enrolment API por SQL próprio, mais ele se torna um sistema paralelo de matrícula dentro do Moodle.

## 18.64 Exercício - matrícula sincronizada com sistema externo

Crie um plugin `enrol_academicsync` que represente turmas vindas de um sistema acadêmico. Cada instância deve possuir um identificador externo, papel padrão, política para usuários removidos e opção de sincronização habilitada ou desabilitada.

Implemente uma Scheduled Task que leia uma fonte simulada, pode ser uma tabela própria ou um JSON de teste, e sincronize usuários em lotes. Se a matrícula não existe, crie pela Enrolment API; se existe e mudou o período, atualize; se o usuário foi bloqueado, suspenda; se desapareceu da origem, aplique a política configurada.

Adicione capabilities de configuração e gerenciamento, mas faça `allow_manage()` retornar `false` quando a instância estiver em modo de fonte externa autoritativa. Registre um resumo por execução, proteja a task com lock por instância e garanta que duas execuções consecutivas com a mesma entrada não alterem novamente os mesmos registros.

Depois teste quatro situações que muita implementação ignora: usuário com papel no curso mas sem matrícula, usuário matriculado sem o papel esperado, duas instâncias do plugin no mesmo curso e restore do curso em outra instalação onde o identificador externo não deve começar a sincronizar automaticamente.

Se o exercício funcionar somente no caso feliz em que cada curso possui uma instância, cada usuário possui exatamente um papel e a integração nunca falha, ele ainda não está pronto.

## REFERÊNCIAS

MOODLE. Enrolment plugins. Moodle Developer Resources, documentação 5.1. Disponível em: https://moodledev.io/docs/5.1/apis/plugintypes/enrol. Acesso em setembro de 2026.

MOODLE. Enrolment API. Moodle Developer Resources, documentação 5.0. Disponível em: https://moodledev.io/docs/5.0/apis/subsystems/enrol. Acesso em setembro de 2026.

MOODLE. Core enrolment implementation, `lib/enrollib.php`. Repositório oficial Moodle no GitHub. Acesso em setembro de 2026.


{% endraw %}
