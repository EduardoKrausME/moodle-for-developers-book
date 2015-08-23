# Segurança

Segurança em plugin Moodle costuma ser ensinada como uma lista de funções que você deve lembrar de chamar: `require_login()`, `require_capability()`, `require_sesskey()`, `required_param()` e mais algumas. O problema é que decorar essas funções não torna o código seguro, porque quase toda vulnerabilidade interessante aparece justamente quando a função certa foi chamada no lugar errado, no contexto errado ou protegendo uma decisão diferente daquela que realmente precisava ser protegida.

Imagine uma página que recebe `courseid=10`, chama `require_login()`, verifica `moodle/course:update` no curso 10 e depois atualiza um registro cujo `id=875` também veio da URL. Parece protegido, mas ainda existe uma pergunta que não foi respondida: o registro 875 pertence ao curso 10? Se não pertence, o usuário pode ter permissão perfeita no curso 10 e mesmo assim alterar alguma coisa do curso 22. Esse é o tipo de falha que não aparece quando segurança é tratada como checklist de funções, porque o problema não está na ausência de autenticação nem na ausência de capability, mas na relação entre o dado recebido e o recurso real que está sendo manipulado.

É por isso que eu prefiro olhar segurança no Moodle como uma sequência de perguntas. Quem está fazendo a requisição? Em qual contexto essa ação acontece? O usuário possui a capability necessária naquele contexto? O objeto que será lido ou alterado pertence realmente àquele contexto? A requisição veio pelo método esperado e possui proteção contra CSRF? Os parâmetros recebidos possuem o tipo e o formato esperados? O conteúdo será exibido de forma segura? O código pode acessar arquivos, URLs ou dados que o usuário não deveria controlar? Quando essas perguntas são respondidas na ordem correta, `require_login()`, capabilities, `sesskey`, Parameter API, Output API e File API deixam de ser remendos independentes e passam a fazer parte do mesmo modelo.

## Modelo de segurança do Moodle

O Moodle trabalha com várias camadas de segurança que se complementam. A primeira identifica o usuário e estabelece a sessão, a segunda determina o que esse usuário pode fazer por meio de contexts, roles e capabilities, enquanto outras camadas cuidam da integridade da requisição, da validação da entrada, da saída para o navegador, do acesso a arquivos, das chamadas externas e do isolamento entre objetos do sistema.

Isso significa que não existe uma função mágica chamada `secure_page()`. Uma página pode estar perfeitamente autenticada e continuar vulnerável a IDOR, pode verificar uma capability e continuar vulnerável a CSRF, pode usar `required_param()` e continuar vulnerável a SQL Injection se concatenar o valor em uma parte estrutural do SQL, da mesma forma que pode renderizar tudo em Mustache e ainda criar XSS se usar `{{{conteudo}}}` com HTML não confiável.

O Moodle também parte de uma ideia importante: cada componente é responsável pela própria superfície de ataque. Um único endpoint inseguro em um plugin instalado em milhares de sites pode expor dados, arquivos, tokens ou ações administrativas, portanto o fato de o core ser maduro não protege automaticamente o código de terceiros. O plugin participa do mesmo processo, da mesma sessão e geralmente possui acesso às mesmas APIs e ao mesmo banco, então uma falha pequena pode ter consequência muito maior do que o tamanho do arquivo onde ela apareceu.

## Authentication versus Authorization

Authentication responde "quem é você?" e authorization responde "o que você pode fazer aqui?". Parece uma diferença óbvia, mas uma quantidade surpreendente de código mistura as duas coisas e assume que `require_login()` já protegeu a operação inteira.

Quando `require_login()` termina com sucesso, sabemos que existe um usuário autenticado e que o fluxo de acesso ao curso ou atividade, quando informado, foi respeitado. Ainda não sabemos se esse usuário pode editar uma configuração, visualizar dados de outra pessoa, excluir um registro, baixar determinado arquivo ou executar uma operação administrativa. Essas decisões pertencem à autorização e normalmente serão expressas com capabilities no contexto correto, combinadas com regras de propriedade e de relacionamento do objeto.

O erro clássico é escrever uma página administrativa com `require_login()` e considerar o trabalho concluído. Qualquer estudante autenticado também passa por `require_login()`, então a página agora está protegida contra usuário anônimo, mas pode continuar aberta para praticamente todos os usuários do site. Em segurança, reduzir a população de atacantes de "internet inteira" para "todos os usuários autenticados" não é exatamente uma vitória quando a ação era exclusiva de gestores.

## `require_login()`

Em scripts web tradicionais, `require_login()` deve aparecer cedo, antes de qualquer saída e antes de carregar dados que o usuário não deveria sequer saber que existem. A função pode receber curso e course module, e isso é importante porque o Moodle não trata login apenas como presença de sessão. Quando você informa o curso e a atividade, o core consegue aplicar regras de acesso, matrícula, visibilidade e outros comportamentos relacionados àquele recurso.

Uma página de Activity Module normalmente resolve o cm, o curso e então exige login naquele recurso. Em uma página de plugin local, porém, o tipo do plugin não decide se a chamada correta é require_login() ou require_login($course); quem decide é o escopo real da página. Uma ferramenta global pode exigir apenas login no site, enquanto uma tela do mesmo local plugin que pertence a um curso deve informar o curso para que o Moodle aplique o fluxo de acesso correspondente.

```php
require_once(__DIR__ . '/../../config.php');

$id = required_param('id', PARAM_INT);
$cm = get_coursemodule_from_id('example', $id, 0, false, MUST_EXIST);
$course = get_course($cm->course);

require_login($course, true, $cm);

$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

Perceba a ordem. Primeiro o identificador é normalizado, depois o Moodle localiza os objetos reais, em seguida valida o acesso ao curso e à atividade e só então verifica a capability no contexto que representa exatamente aquele módulo. Receber `courseid` e `contextid` separadamente do navegador para evitar essas consultas pode parecer uma otimização, mas você está trocando uma resolução confiável por dois valores controlados pelo cliente.

### require_login() e require_login($course) não são equivalentes

Do ponto de vista de segurança, require_login() sem curso confirma a autenticação e executa o fluxo geral de sessão, mas não afirma que o usuário pode entrar em qualquer curso escolhido depois. Já require_login($course) acrescenta a semântica de acesso àquele curso, incluindo as decisões de matrícula, acesso de guest, visibilidade e outras regras aplicadas pelo core. Trocar uma forma pela outra só para alterar a aparência da tela muda também a regra de acesso, e esse é exatamente o tipo de "ajuste visual" que termina virando vulnerabilidade.

Existe ainda um efeito arquitetural importante, porque, quando o acesso é concedido, require_login($course) chama $PAGE->set_course($course). Isso atualiza $PAGE->course e a global $COURSE, define context_course quando o contexto ainda não foi estabelecido, prepara locale e integra a página ao formato do curso. Portanto a mesma chamada que decide acesso também muda o estado da Page API, o que explica por que navegação e renderização passam a se comportar como parte do curso.

### Passar o curso é uma decisão de acesso, não uma técnica de breadcrumb

Eu evitaria completamente a ideia de passar $course para require_login() apenas porque você quer um breadcrumb do curso. O argumento existe primeiro porque a página está vinculada àquele curso e precisa respeitar as regras de acesso dele; a navegação coerente vem como consequência de $PAGE saber onde está. Da mesma forma, não retire o curso apenas porque o tema ficou com aparência de página interna do curso, pois a consequência não é apenas estética.

Se uma ferramenta é global e apenas filtra dados por courseid, você pode ter require_login() no site e depois verificar capabilities e relações para cada curso consultado. Se a página representa uma operação dentro de um curso, require_login($course) é normalmente o fluxo certo. Em ambos os casos a decisão precisa nascer do modelo de acesso, e não da aparência que o header ganhou.

### O que o segundo parâmetro realmente controla

O segundo parâmetro de require_login() é $autologinguest. require_login($course, false) não quer dizer "faça login no curso sem mudar o $PAGE" e não significa "não renderize como curso"; significa apenas que o Moodle não deve usar o mecanismo de autologin como guest nessa chamada. O curso continua sendo validado e, quando o acesso é concedido, continua sendo definido em $PAGE.

```php
// Ferramenta global.
require_login();

// Página pertencente ao curso, permitindo o comportamento padrão de guest.
require_login($course);

// Página pertencente ao curso, sem autologin de guest.
require_login($course, false);
```

### Quando passamos o course module

Com o terceiro parâmetro, a verificação fica ainda mais específica. require_login($course, false, $cm) valida se course e cm correspondem, usa cm_info para trabalhar com as regras de acesso da atividade, verifica visibilidade e disponibilidade e, quando o acesso é concedido, prepara $PAGE com set_cm(). Nesse fluxo o contexto normal passa a ser context_module e o layout é definido como incourse, o que faz sentido porque agora não estamos apenas dentro de um curso, mas dentro de uma atividade concreta.

Isso é particularmente importante para segurança porque uma atividade pode estar oculta, restrita por availability ou em estado que não deveria ser acessível àquele usuário. Fazer apenas require_login($course) e depois carregar qualquer course_modules.id recebido da URL deixa você responsável por repetir regras que o core já sabe aplicar, e repetir regra de acesso na mão é um jeito eficiente de esquecer justamente a exceção que aparece em produção.

### require_login() continua não sendo require_capability()

Mesmo quando você passa curso e cm, require_login() responde se o usuário pode chegar naquele recurso dentro do fluxo geral de acesso; ele não responde se o usuário pode executar a ação específica que seu plugin inventou. Um aluno pode abrir uma atividade e não poder editar sua configuração, um professor pode visualizar um relatório e não poder alterar a configuração global do plugin, e um usuário matriculado pode acessar o curso sem ter direito de consultar dados de outro usuário.

```php
require_login($course, false, $cm);

$context = context_module::instance($cm->id);
require_capability('mod/example:manage', $context);
```

Além disso, capability ainda pode não ser suficiente quando existe propriedade do registro. Se o endpoint recebe noteid, submissionid, attemptid ou qualquer objeto semelhante, você precisa carregar o registro e provar que ele pertence ao curso, atividade, usuário ou grupo que já foi autorizado. É por isso que as seções posteriores sobre IDOR e propriedade do registro são continuação direta desta discussão, e não outro assunto isolado.

### Três padrões que evitam confusão

Uma página administrativa global costuma autenticar no site, trabalhar em context_system e exigir uma capability global. Uma página de curso carrega o curso real, chama require_login($course), cria ou reutiliza context_course e exige a capability daquele curso. Uma página de atividade resolve cm e course a partir de uma relação confiável, chama require_login($course, false, $cm), trabalha em context_module e só então aplica a capability específica.

```php
// Global.
require_login();
$context = context_system::instance();
require_capability('local/example:manage', $context);

// Curso.
$course = get_course($courseid);
require_login($course);
$context = context_course::instance($course->id);
require_capability('local/example:viewcourse', $context);

// Atividade.
$cm = get_coursemodule_from_id('example', $id, 0, false, MUST_EXIST);
$course = get_course($cm->course);
require_login($course, false, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

Esses padrões não existem para decorar três receitas, mas para deixar clara a correspondência entre recurso, contexto e autorização. Quando essa correspondência está certa, o código costuma ficar simples; quando ela está errada, começam as tentativas de compensar com if em $USER, contextid vindo do navegador, role hardcoded e outras soluções que parecem funcionar até alguém acessar o endpoint por um caminho que você não testou.

## Contextos - retomada de Arquitetura do Moodle

Contexto não é uma formalidade colocada ao redor da capability. Ele é parte da própria pergunta de autorização. `moodle/course:update` no contexto de um curso não significa a mesma coisa que uma permissão administrativa no sistema, e uma capability em `context_module` não deveria ser verificada em `context_system` apenas porque o usuário também possui algum papel mais amplo.

O Moodle organiza contexts em uma árvore, com sistema no topo e contextos de categoria, curso, módulo, usuário e bloco em posições específicas. As permissões podem ser herdadas ao longo dessa árvore, por isso uma decisão tomada no contexto errado pode abrir acesso muito mais amplo do que você imaginava ou, no sentido contrário, negar uma ação legítima.

Quando estiver em dúvida, pergunte qual objeto está sendo protegido. Se a ação altera uma instância de atividade, o ponto natural costuma ser `context_module`; se altera configuração do curso, `context_course`; se manipula perfil de um usuário, pode existir um `context_user`; se é configuração global da instalação, o contexto provavelmente será o sistema. Escolher `context_system` só porque é fácil obtê-lo é uma forma elegante de esconder uma decisão ruim em código perfeitamente válido.

## Roles

Role é um conjunto de permissões que pode ser atribuído em determinado contexto, mas plugin não deveria programar autorização pensando em nomes de papéis como "student", "teacher" ou "manager". Uma instituição pode criar papéis próprios, alterar permissões dos archetypes, duplicar um papel ou combinar atribuições de maneiras que seu código nunca imaginou.

Por isso, código como este deveria levantar suspeita.

```php
if (is_siteadmin() || user_has_role_assignment($USER->id, $teacherroleid)) {
    // Pode editar.
}
```

A pergunta correta não é "o usuário é professor?", mas "o usuário pode executar esta ação neste contexto?". Essa diferença permite que o administrador configure o site segundo a realidade institucional sem exigir que o plugin conheça a estrutura organizacional.

Existem exceções em que você realmente precisa trabalhar com roles, principalmente em funcionalidades administrativas ou enrolment, mas isso é diferente de usar role como substituto de capability para proteger uma página. O próprio Moodle recomenda pensar em capability do usuário naquele contexto, e não em qual papel recebeu aquela capability.

## Capabilities

Capability representa uma ação que pode ser permitida ou negada em um contexto. Bons nomes descrevem a ação, não o perfil do usuário. `local_catalog:manageitems`, `mod_example:grade` e `tool_sync:run` comunicam o que está sendo autorizado, enquanto nomes como `local_catalog:teacher` misturam autorização com um papel institucional que pode nem existir em outro site.

A capability também deveria ter granularidade coerente com o risco. Criar uma única `local_plugin:manage` e usá-la para visualizar dados, editar configurações, excluir registros e exportar informações pode ser suficiente em um plugin minúsculo, mas começa a limitar a administração quando surgem usuários que deveriam executar apenas parte dessas ações.

Não precisa cair no extremo oposto e criar uma capability por botão. A pergunta é se as ações possuem públicos, riscos ou responsabilidades diferentes o bastante para justificarem controles independentes. Segurança boa também precisa ser administrável, porque vinte capabilities que ninguém entende serão configuradas por tentativa e erro.

## `db/access.php`

As capabilities do plugin são declaradas em `db/access.php`. É ali que você informa o tipo da capability, o nível de contexto, riscos associados e permissões padrão para archetypes. Esse arquivo não executa autorização durante cada requisição, ele descreve as capacidades que o Access API instala e mantém.

```php
$capabilities = [
    'local_catalog:manageitems' => [
        'riskbitmask' => RISK_DATALOSS,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
```

`riskbitmask` merece atenção porque comunica riscos inerentes à capability, como escrita, perda de dados, spam, XSS ou configuração. Isso ajuda auditoria e administração, mas não substitui proteção no código. Declarar `RISK_DATALOSS` não impede ninguém de apagar nada, da mesma forma que declarar `RISK_XSS` não sanitiza automaticamente o HTML recebido.

Também tome cuidado ao escolher archetypes. Permitir uma capability por padrão para `teacher` ou `student` é uma decisão de produto, não uma conveniência para facilitar teste local. Depois que o plugin chega a instalações reais, esse default influencia milhares de contextos e pode ser mais permissivo do que você pretendia.

## `has_capability()`

`has_capability()` responde com booleano e é útil quando a interface ou o fluxo realmente possui caminhos alternativos. Você pode, por exemplo, exibir um botão de edição apenas para quem possui permissão, mantendo a mesma página disponível para leitura.

```php
$canedit = has_capability('local_catalog:manageitems', $context);

if ($canedit) {
    $buttons[] = $editbutton;
}
```

O ponto importante é lembrar que esconder o botão não protege a ação. O endpoint que processa a edição precisa verificar a capability novamente, porque qualquer usuário pode construir a requisição manualmente. Interface é conveniência, autorização acontece no servidor.

Quando uma ação inteira exige uma capability e não existe caminho alternativo, `require_capability()` costuma comunicar melhor a intenção, porque o código falha imediatamente em vez de carregar uma variável booleana por várias camadas até alguém lembrar de verificá-la.

## `require_capability()`

```php
require_capability() é apropriada quando a requisição não faz sentido sem determinada permissão. Ela interrompe o fluxo se o usuário não possuir a capability e evita o padrão perigoso de executar alguma coisa antes de chegar ao if de autorização.
$context = context_course::instance($courseid);
require_capability('local_catalog:manageitems', $context);
```

Coloque a verificação antes de consultar ou preparar dados sensíveis. Às vezes o desenvolvedor carrega uma lista completa de usuários, calcula relatórios e só antes do `echo` chama `require_capability()`. A página pode não mostrar a resposta, mas você já executou trabalho desnecessário e talvez tenha disparado efeitos colaterais, logs ou chamadas externas antes de descobrir que a pessoa não deveria estar ali.

Também não capture a exceção de `require_capability()` para continuar a execução silenciosamente. Se ausência de permissão é uma condição esperada que leva a outro caminho, use `has_capability()` de forma explícita; se é proibido prosseguir, deixe o mecanismo de acesso fazer o trabalho para o qual foi criado.

## Capability no contexto correto

A mesma capability pode produzir resultado diferente conforme o contexto, portanto verificar a permissão correta no contexto errado continua sendo bug de autorização. Isso aparece bastante quando uma página recebe `courseid`, `cmid` e `contextid` e usa o primeiro contexto que parecer conveniente.

Considere um professor com permissão de editar atividades no curso A, mas sem acesso equivalente no curso B. Se a página carrega um registro do curso B, porém verifica capability no contexto do curso A recebido separadamente, a autorização foi feita sobre um recurso e a operação sobre outro.

Uma prática segura é derivar o contexto do objeto real que será manipulado. Se você recebeu um `itemid`, carregue o item, descubra qual curso ou módulo ele pertence e então crie o contexto a partir desse relacionamento. Isso custa algumas linhas e, em troca, elimina uma classe inteira de inconsistências entre parâmetros que vieram do navegador.

## Capability versus propriedade do registro

Capability responde se o usuário pode executar uma classe de ações, mas algumas regras dependem da relação entre o usuário e o registro. Imagine uma ferramenta em que estudantes podem editar a própria anotação e professores podem editar qualquer anotação do curso. A capability `local_notes:editown` não prova que a anotação carregada pertence ao usuário atual.

```php
$note = $DB->get_record('local_notes', ['id' => $id], '*', MUST_EXIST);
$context = context_course::instance($note->courseid);

require_login($note->courseid);

$caneditall = has_capability('local_notes:editall', $context);
$caneditown = has_capability('local_notes:editown', $context)
    && (int)$note->userid === (int)$USER->id;

if (!$caneditall && !$caneditown) {
    throw new required_capability_exception(
        $context,
        'local_notes:editown',
        'nopermissions',
        ''
    );
}
```

A comparação de `userid` não substitui capability e a capability não substitui a comparação de propriedade. São duas perguntas diferentes e ambas podem ser necessárias.

## IDOR

IDOR, ou Insecure Direct Object Reference, acontece quando o sistema expõe um identificador de objeto e confia que o usuário só pedirá objetos que deveria acessar. É aquele bug clássico em que `/view.php?id=100` funciona, então alguém troca para `id=101` e descobre o registro de outra pessoa.

No Moodle, IDOR aparece muito em `userid`, `courseid`, `submissionid`, `attemptid`, IDs de relatórios, arquivos e registros de plugins locais. Usar `PARAM_INT` impede que o valor deixe de ser inteiro, mas não responde se o usuário pode acessar o objeto apontado por aquele inteiro.

A correção é sempre relacional. Carregue o registro, derive contexto e relacionamentos a partir dele e aplique autorização sobre o recurso real. Se o ID é de uma submissão, descubra de qual atividade e usuário ela é; se é de um arquivo, verifique a file area, itemid e contexto; se é uma tentativa, confirme que ela pertence ao quiz e ao usuário esperados. Segurança não está no formato do ID, está no vínculo entre ID, objeto, contexto e pessoa.

## `sesskey`

Apesar do nome, `sesskey` não é o ID da sessão do Moodle. Ele funciona como token contra CSRF e é associado à sessão autenticada. A confusão é comum inclusive em relatórios de pentest, que às vezes tratam o parâmetro como se fosse um segredo equivalente ao cookie de sessão.

O token existe para provar que uma ação foi originada a partir de uma interação que conhece o estado da sessão, dificultando que outro site force o navegador autenticado a executar uma alteração. Isso é especialmente importante porque cookies são enviados automaticamente pelo navegador para o domínio do Moodle, mesmo quando a requisição foi provocada por uma página maliciosa em outro domínio.

Você obtém o valor com `sesskey()` quando precisa compor uma ação manualmente, mas Forms API e vários componentes do core já cuidam da inclusão do token. O importante não é espalhar `sesskey` em toda URL, e sim exigir o token nas operações que alteram estado e preferir POST para essas alterações.

## `require_sesskey()`

Quando uma ação mutável não está passando por um fluxo que já valida CSRF, use `require_sesskey()` antes de alterar qualquer estado. Isso inclui exclusão, criação, mudança de configuração, processamento disparado por botão e outras operações que não deveriam acontecer apenas porque o navegador abriu uma URL.

```php
$id = required_param('id', PARAM_INT);
require_login();
require_capability('local_catalog:manageitems', context_system::instance());
require_sesskey();

$DB->delete_records('local_catalog', ['id' => $id]);
```

Esse código ainda precisa garantir que o registro `id` é aquele que o usuário pode excluir e idealmente deveria receber a alteração por POST, mas `require_sesskey()` fecha a parte de CSRF. Não use o token para substituir capability e não use capability para substituir o token, porque um administrador enganado por uma página externa continua sendo administrador e terá todas as capabilities necessárias para executar a ação.

## CSRF

Cross-Site Request Forgery explora exatamente o fato de o navegador carregar a autenticação do usuário automaticamente. Se uma ação perigosa puder ser executada apenas acessando uma URL, um atacante pode induzir alguém autenticado a abrir essa URL por link, imagem, iframe ou outra técnica, e a requisição chegará ao Moodle com os cookies legítimos daquela pessoa.

É por isso que GET deve representar leitura e POST deve representar alteração. Existem partes históricas do Moodle que ainda usam links de ação com `sesskey`, mas código novo deveria evitar transformar exclusão, aprovação ou execução administrativa em navegação comum.

Forms API já integra proteção CSRF no fluxo normal, porém isso não libera o backend de outras verificações. Uma submissão com `sesskey` válido pode ter sido feita pelo próprio usuário mal-intencionado, então capability, propriedade do registro e validação dos parâmetros continuam necessárias.

## XSS

Cross-Site Scripting acontece quando conteúdo controlado por usuário chega ao navegador como código executável em vez de dados. Moodle é particularmente sensível a XSS porque permite conteúdo rico em várias áreas, possui usuários com níveis de privilégio diferentes e mantém sessões longas em um ambiente onde professores e administradores consomem conteúdo criado por outras pessoas.

Não pense em XSS apenas como `<script>alert(1)</script>`. O problema real é execução no contexto do domínio do Moodle, o que pode permitir ações com a sessão do usuário, leitura de dados disponíveis naquela página e manipulação da interface. O payload muda conforme o ponto de saída, mas a causa quase sempre é a mesma: dado não confiável foi colocado em um contexto de HTML, atributo, URL ou JavaScript sem o tratamento correto.

A defesa começa escolhendo a API de saída certa e preservando a distinção entre texto simples e conteúdo rico. Escapar tudo cegamente pode quebrar conteúdo legítimo, enquanto marcar tudo como HTML confiável transforma o navegador em interpretador de entrada do usuário.

## Stored XSS

Stored XSS é o cenário mais perigoso porque o payload fica persistido e pode atingir outras pessoas depois. Um estudante salva conteúdo malicioso em um campo, o dado entra no banco sem executar nada e horas depois um professor abre um relatório que imprime aquele valor cru. O problema não estava necessariamente na tela de cadastro, mas no ponto em que o conteúdo armazenado foi renderizado sem considerar sua origem.

Isso também mostra por que "está vindo do banco" não significa "é confiável". Banco é armazenamento, não sanitizador. Dados gravados por usuário, importação, webhook, arquivo ou integração continuam carregando o nível de confiança da origem, mesmo depois de atravessarem cinco tabelas.

Em code review, sempre que eu vejo `echo $record->name`, `{{{name}}}` ou concatenação direta de campos em HTML, a pergunta é de onde aquele valor veio originalmente e qual formatação ele deveria aceitar. Se o campo é nome simples, escape como texto; se é conteúdo rico, processe com a API adequada e o formato correto.

## Reflected XSS

Reflected XSS não precisa persistir no banco. A aplicação recebe um parâmetro e o devolve imediatamente na resposta sem escaping, por exemplo uma busca que imprime o termo pesquisado no título da página.

```php
$q = optional_param('q', '', PARAM_TEXT);
echo '<h2>Resultados para ' . $q . '</h2>';
```

Mesmo que `PARAM_TEXT` faça limpeza de entrada, ele não deve ser entendido como substituto universal de escaping de saída. Entrada e saída são fronteiras diferentes. O valor deve ser validado conforme o domínio quando entra e renderizado conforme o contexto onde sai.

Uma versão mais segura usa as APIs de output, Mustache ou escaping explícito adequado ao caso. Essa separação também melhora manutenção, porque você não precisa adivinhar se determinado valor já chegou "escapado" do banco ou se alguém aplicou `htmlspecialchars()` em algum lugar cinco métodos atrás.

## Mustache e escaping

Mustache ajuda muito porque `{{variavel}}` escapa HTML automaticamente, então texto fornecido ao template tende a ser tratado como texto. Isso reduz XSS acidental em comparação com HTML concatenado em PHP, mas a proteção depende de você não furar o mecanismo sem entender o motivo.

```mustache
{{{variavel}}} representa saída não escapada e deveria chamar atenção em qualquer revisão. Ela é necessária em alguns casos, por exemplo quando o PHP já produziu HTML confiável por uma API do Moodle, mas não deveria ser aplicada a um campo porque "o HTML não apareceu". Se o conteúdo é texto, use chaves duplas; se é HTML rico, prepare corretamente no PHP e deixe claro no nome da variável que aquilo contém HTML pronto para saída.
```

Outro erro é montar pedaços de HTML em strings vindas do banco e entregá-los ao template como se fossem componentes. Mustache funciona melhor quando recebe dados estruturados e a marcação fica no próprio template, porque assim a fronteira entre dado e HTML permanece visível.

## `format_string()`

`format_string()` é adequada para strings curtas que podem conter recursos de formatação limitada do Moodle, como filtros e multilang, e aparece com frequência em nomes de curso, atividade e outros títulos. Ela não é uma versão menor de `format_text()` escolhida apenas por preferência.

Quando você exibe um nome armazenado pelo Moodle, `format_string()` costuma ser melhor do que `s()` porque preserva comportamentos esperados da plataforma. Ao mesmo tempo, ela não deve ser usada para conteúdo longo com HTML rico, imagens incorporadas ou formatos de texto completos.

Também pense no contexto e nas opções de filtragem. Formatação pode depender de curso, idioma e filtros ativos, portanto produzir uma string formatada fora do contexto correto pode gerar resultado diferente do que o usuário veria na página normal.

## `format_text()`

`format_text()` é a ferramenta principal para conteúdo rico acompanhado de um formato, como `FORMAT_HTML`, `FORMAT_MARKDOWN` ou outros formatos reconhecidos pelo Moodle. Ela aplica o pipeline de formatação, filtros e limpeza conforme as opções e permissões envolvidas.

O padrão perigoso é armazenar HTML e depois fazer `echo $html` porque "foi salvo pelo editor do Moodle". Mesmo conteúdo vindo de editor precisa ser exibido de acordo com o formato e com a política de segurança da plataforma, especialmente porque algumas capabilities podem permitir conteúdo com risco XSS enquanto outras não.

Use `noclean` apenas quando você realmente sabe que o autor daquele conteúdo possuía uma capability que permite o risco correspondente e que o fluxo inteiro preserva essa garantia. `noclean => true` usado para "corrigir" um iframe que desapareceu é uma das formas mais rápidas de transformar problema de formatação em vulnerabilidade.

## `s()`

`s()` escapa texto para uso em HTML e é útil quando você está em um ponto onde precisa produzir texto simples com segurança. Em código moderno com Mustache, boa parte desse trabalho acontece automaticamente no template, mas `s()` ainda aparece em APIs e em trechos de HTML gerados no PHP.

```php
echo html_writer::tag('span', s($record->name));
```

Não aplique `s()` em conteúdo que já deveria ser HTML rico, porque você vai exibir as tags como texto e alguém provavelmente "resolverá" o problema retirando escaping de tudo. Escolher a função correta começa definindo o tipo de conteúdo no domínio, não testando até a tela ficar bonita.

Também evite double escaping. Se você entrega um valor já escapado para `{{variavel}}`, Mustache escapará novamente e entidades aparecerão para o usuário. A arquitetura mais simples é manter dados crus internamente e aplicar escaping na última fronteira antes da saída.

## SQL Injection

SQL Injection acontece quando entrada controlável altera a estrutura da consulta em vez de permanecer como valor. No Moodle 3.5, a maior parte das operações comuns pode ser feita com DML API sem escrever SQL, e quando SQL manual é necessário existem placeholders justamente para separar comando e dados.

```php
$sql = 'SELECT *
          FROM {local_catalog}
         WHERE courseid = :courseid
           AND status = :status';

$records = $DB->get_records_sql($sql, [
    'courseid' => $courseid,
    'status' => $status,
]);
```

O prefixo `{tabela}` resolve portabilidade de nome, enquanto os parâmetros evitam concatenar valores. Essa disciplina também lida corretamente com aspas e caracteres especiais sem você inventar escaping manual.

Nunca use `addslashes()` como mecanismo de segurança para SQL novo em Moodle. O problema não é "escapar aspas até funcionar", mas garantir que valor nunca seja interpretado como parte da sintaxe.

## Por que a DML API não resolve SQL Injection se for utilizada incorretamente

Usar `$DB` não imuniza a consulta. A DML API oferece mecanismos seguros, mas você ainda pode construir SQL vulnerável antes de entregá-lo ao método.

```php
$sql = "SELECT * FROM {local_catalog} WHERE name = '$name'";
$records = $DB->get_records_sql($sql);
```

Isso continua errado mesmo usando `$DB->get_records_sql()`. O método não consegue separar dado de sintaxe porque você já misturou os dois na string.

Outro caso mais sutil é ordenação dinâmica. Placeholders representam valores, não nomes de coluna nem palavras-chave SQL, portanto algo como `ORDER BY :sort` não resolve. Se o usuário escolhe ordenação, use uma allowlist que mapeia valores conhecidos para fragmentos SQL definidos pelo desenvolvedor.

```php
$sortoptions = [
    'name' => 'name ASC',
    'created' => 'timecreated DESC',
];

$sortkey = optional_param('sort', 'name', PARAM_ALPHA);
$sort = $sortoptions[$sortkey] ?? $sortoptions['name'];

$sql = "SELECT * FROM {local_catalog} ORDER BY $sort";
```

Aqui a parte estrutural nunca vem diretamente do usuário. Ele escolhe uma chave e o servidor decide qual SQL corresponde a ela.

## `required_param()`

`required_param()` lê um parâmetro obrigatório e aplica o tipo `PARAM_*` informado. Se o parâmetro não existir ou não puder ser aceito conforme o tipo, a requisição falha antes de seu código continuar com um valor inesperado.

```php
$id = required_param('id', PARAM_INT);
```

Agrupar a leitura dos parâmetros perto do início do script melhora revisão de segurança porque fica fácil enxergar a superfície de entrada daquela página. Também evita acessar `$_GET`, `$_POST` e `$_REQUEST` diretamente, o que contorna o padrão do Moodle e torna limpeza inconsistente.

Porém não transforme `required_param()` em autorização. `id=42` ser um inteiro válido significa apenas que você recebeu um inteiro, não que o usuário atual pode ler ou editar o registro 42.

## `optional_param()`

`optional_param()` funciona para valores opcionais e exige um default. A escolha do default precisa ser pensada porque ele passa a fazer parte do comportamento da página quando o cliente não envia o parâmetro.

```php
$page = optional_param('page', 0, PARAM_INT);
$search = optional_param('search', '', PARAM_TEXT);
```

Evite defaults que ampliam acesso. Se `courseid` ausente faz o código assumir contexto de sistema, você transformou a ausência de um parâmetro em privilégio maior. Default seguro normalmente reduz escopo ou representa comportamento neutro.

Assim como em `required_param()`, a limpeza é apenas uma etapa. Depois dela vêm validação de domínio, existência do objeto, relacionamento e autorização.

## `clean_param()`

`clean_param()` é útil quando você já possui um valor e precisa normalizá-lo segundo um tipo `PARAM_*`, por exemplo dados vindos de uma estrutura que não passou diretamente pela Parameter API. Ela não deveria ser usada para recriar manualmente `required_param()` ou `optional_param()` em todo endpoint.

Também tome cuidado ao limpar um dado tarde demais. Se você usou o valor para construir caminho, nome de arquivo, consulta ou URL e só depois chamou `clean_param()`, a fronteira perigosa já foi atravessada. Valide antes do primeiro uso sensível.

Quando o dado vem de APIs externas, webhook ou arquivo importado, aplique o mesmo princípio de desconfiança. "Não veio do usuário" não significa confiável; veio de fora do processo e pode estar comprometido, malformado ou simplesmente diferente do contrato esperado.

## `PARAM_INT`

`PARAM_INT` é apropriado para inteiros e IDs numéricos, mas novamente o tipo não carrega semântica de segurança. Um `userid` limpo com `PARAM_INT` pode apontar para qualquer usuário do site.

Use-o para garantir formato e depois aplique as regras do domínio. Se o valor precisa ser positivo, pertencer a determinado curso ou representar um registro existente, isso é validação adicional.

Também não use cast silencioso como substituto quando erro deveria ser rejeitado. Transformar qualquer entrada em `(int)` pode converter lixo em `0` e fazer o código seguir por um caminho inesperado, enquanto a Parameter API comunica melhor a expectativa da interface.

## `PARAM_TEXT`

`PARAM_TEXT` limpa texto genérico e é adequado para muitos campos simples, mas não significa "texto seguro para qualquer lugar". O mesmo valor pode depois ser usado em HTML, SQL, CSV, cabeçalho HTTP ou log, e cada saída tem regras próprias.

Pense nele como validação de entrada, não como encoding universal. Se o valor vai para Mustache, deixe o template escapar; se vai para SQL, use placeholder; se vai para uma URL, use `moodle_url`; se vai para CSV, utilize a API de dataformat ou encoding apropriado.

Essa separação evita a tentação de salvar texto já transformado para um contexto específico. Dado armazenado deveria continuar representando o dado, e não a forma como uma tela específica resolveu exibi-lo.

## `PARAM_ALPHANUMEXT`

`PARAM_ALPHANUMEXT` aceita um conjunto restrito de caracteres alfanuméricos com alguns separadores extras e pode ser útil para identificadores técnicos, códigos ou chaves onde espaços e pontuação arbitrária não fazem sentido.

A vantagem de um tipo restritivo é documentar melhor o contrato. Se um identificador só deveria conter letras, números, underscore e hífen, aceitar texto arbitrário para depois tentar proteger cada uso aumenta a superfície desnecessariamente.

Por outro lado, não force `PARAM_ALPHANUMEXT` em conteúdo humano apenas porque parece mais seguro. Nomes, títulos e textos reais precisam de Unicode e pontuação. Segurança não é destruir dados válidos até sobrar apenas ASCII, e sim validar de acordo com o significado real do campo.

## `PARAM_RAW`

`PARAM_RAW` praticamente não faz limpeza de conteúdo e existe porque alguns fluxos realmente precisam receber dados que seriam alterados por filtros mais restritivos, como estruturas que serão processadas por outra API específica. Ele não é o tipo padrão para quando você não sabe qual `PARAM_*` usar.

Se você escolheu `PARAM_RAW`, deveria conseguir explicar qual componente fará a validação posterior e por que os tipos mais específicos não servem. Caso a resposta seja "porque senão meu HTML some", provavelmente você está empurrando a responsabilidade para frente sem saber onde ela será resolvida.

Em revisão de segurança, cada `PARAM_RAW` merece investigação. Não necessariamente é bug, mas é um ponto onde o código declara explicitamente que aceita entrada praticamente bruta.

## Quando `PARAM_RAW` é perigoso

O perigo aparece quando o valor bruto atravessa outras fronteiras sem tratamento. `PARAM_RAW` seguido de `echo`, concatenação SQL, construção de caminho ou inclusão de arquivo é um sinal forte de vulnerabilidade.

Também é perigoso quando o desenvolvedor acredita que capability alta justifica aceitar qualquer coisa. Administradores podem ser plenamente confiáveis em algumas configurações do Moodle, mas plugins também são usados por managers, professores e integrações, e capabilities podem ser reconfiguradas. Além disso, conteúdo armazenado por um usuário privilegiado pode ser exibido para muitos outros.

Se o dado é JSON, valide JSON e a estrutura esperada; se é HTML rico, passe pelo fluxo de texto formatado; se é uma URL, use validação e política de destino; se é nome de arquivo, não aceite caminho inteiro. `PARAM_RAW` só remove uma etapa, ele não remove a obrigação de definir o contrato.

## Path traversal

Path traversal acontece quando entrada controlável interfere no caminho do filesystem, normalmente usando sequências como `../` para sair do diretório previsto. Em plugin Moodle, o problema costuma nascer quando alguém tenta trabalhar com arquivos físicos diretamente em vez de usar File API.

```php
$filename = required_param('file', PARAM_RAW);
$path = $CFG->dataroot . '/local_catalog/' . $filename;
readfile($path);
```

Além de ignorar File API, esse padrão transforma o nome recebido em parte de um caminho real. Limpar `../` com `str_replace()` não é uma arquitetura confiável porque existem normalizações, encodings e variações de plataforma que você provavelmente não quer reinventar.

Quando o arquivo faz parte do conteúdo Moodle, use `stored_file`, file areas e `pluginfile()`. Quando realmente precisar manipular arquivo temporário ou técnico, mantenha o diretório base controlado pelo servidor, gere nomes próprios e nunca aceite caminho arbitrário do cliente.

## LFI

Local File Inclusion ocorre quando entrada controlável determina qual arquivo local será incluído ou executado. Em PHP, padrões como `require($page . '.php')`, `include($file)` ou `require_once($path)` com partes vindas da requisição são extremamente perigosos.

O problema fica pior quando a aplicação possui arquivos que nunca deveriam ser executados diretamente, configurações, caches ou uploads com conteúdo inesperado. Uma validação baseada apenas em extensão pode ser contornada se o fluxo inteiro não estiver fechado.

Se você precisa selecionar uma implementação, use allowlist ou mapeamento para classes conhecidas, não nome de arquivo vindo do navegador.

```php
$handlers = [
    'csv' => \local_catalog\import\csv_handler::class,
    'json' => \local_catalog\import\json_handler::class,
];

$type = required_param('type', PARAM_ALPHA);
$class = $handlers[$type] ?? null;

if ($class === null) {
    throw new invalid_parameter_exception('Invalid import type');
}
```

Aqui o cliente escolhe uma chave limitada e o servidor escolhe a classe real.

## RFI

Remote File Inclusion é a versão em que código remoto pode ser incluído ou interpretado como parte da aplicação. Configurações modernas de PHP reduzem alguns vetores históricos, mas o princípio continua válido: nunca deixe o cliente decidir um caminho de include, template PHP ou código a ser carregado.

Também não invente sistemas de plugin internos que baixam um arquivo PHP de uma URL e o executam. Se sua funcionalidade precisa instalar código, isso entra em uma área de altíssimo risco e deveria passar pelos mecanismos de administração, validação de pacote, permissões e processos de deployment apropriados.

A fronteira entre "conteúdo" e "código" precisa ser rígida. Um arquivo enviado por usuário pode ser imagem, documento ou dado, mas não deveria virar uma unidade executável porque possui extensão `.php` ou porque alguém decidiu incluí-lo dinamicamente.

## File disclosure

File disclosure ocorre quando o sistema entrega um arquivo que existe e talvez seja legítimo, mas para uma pessoa que não deveria acessá-lo. Esse problema é muito mais comum em Moodle do que um LFI clássico porque plugins lidam com materiais de curso, anexos, certificados, evidências e documentos pessoais.

A falha normalmente está na autorização, não na leitura física. O plugin localiza o arquivo corretamente por `contenthash`, `itemid` ou nome, mas não confirma que o usuário tem acesso ao curso, à atividade, ao registro ou à pessoa associada àquele arquivo.

É por isso que `pluginfile()` não deve ser um simples `get_file()` seguido de `send_stored_file()`. O callback existe justamente como ponto de decisão de acesso antes de entregar os bytes.

## Uploaded files

Upload deve ser tratado como entrada não confiável, mesmo quando veio pelo Filepicker do Moodle. O usuário controla o conteúdo do arquivo e, em muitos casos, o nome e o tipo informado pelo cliente.

Use File API para armazenamento e considere limites de tamanho, file area, quantidade de arquivos e finalidade. Se o plugin processa o conteúdo, o risco aumenta. Um CSV pode ter milhões de linhas, uma imagem pode ser construída para explorar uma biblioteca vulnerável, um ZIP pode expandir para tamanho enorme e um documento pode conter estruturas inesperadas.

Validação de upload não termina na extensão. Também pense em quem poderá baixar o arquivo depois, se ele será mostrado inline, se o navegador pode interpretar o MIME como conteúdo ativo e se algum processo de backend executará ferramentas externas sobre ele.

## MIME type versus extensão

Extensão é parte do nome e pode ser alterada livremente. MIME enviado pelo navegador também não é prova absoluta do conteúdo. Se a segurança depende de saber o tipo real, você precisa combinar políticas da File API com detecção adequada e, quando necessário, inspecionar o conteúdo usando bibliotecas confiáveis.

Renomear `payload.html` para `foto.jpg` não transforma HTML em JPEG. Da mesma forma, confiar apenas em `$_FILES['type']` significa aceitar uma declaração do cliente como se fosse análise do servidor.

Para muitos fluxos Moodle você não precisa reinventar esse processo, porque a infraestrutura de arquivos já trabalha com metadados e serve conteúdo através de endpoints controlados. O erro começa quando o plugin salva upload diretamente em uma pasta pública e deixa o servidor web decidir como aquilo será interpretado.

## Segurança de `pluginfile()`

`pluginfile.php` autentica e encaminha a requisição para o componente, mas a decisão final de acesso continua sendo responsabilidade do callback `[component]_pluginfile()`. A documentação do Moodle deixa isso explícito: o componente precisa validar contexto, file area, argumentos e permissões antes de localizar e servir o arquivo.

Um callback saudável começa rejeitando contextos e áreas que não pertencem ao contrato do plugin, depois estabelece login, capability e relacionamento do `itemid` com o objeto correspondente.

```php
function local_catalog_pluginfile(
    $course,
    $cm,
    $context,
    string $filearea,
    array $args,
    bool $forcedownload,
    array $options = []
): bool {
    if ($context->contextlevel !== CONTEXT_SYSTEM) {
        return false;
    }

    if ($filearea !== 'privatefiles') {
        return false;
    }

    require_login();
    require_capability('local_catalog:viewprivatefiles', $context);

    $itemid = (int)array_shift($args);
    // Carregar o registro associado e validar regras adicionais.

    // Localizar stored_file e chamar send_stored_file() somente depois.
}
```

Não use a obscuridade da URL como proteção. `itemid`, caminho e filename podem ser descobertos, compartilhados ou alterados, então a segurança precisa estar no servidor em cada requisição.

## Web Service authorization - aprofundado em Web Services e Integrações

External Functions possuem fluxo próprio. Em uma função externa você não deveria copiar o padrão de uma página web e chamar `require_login()` ou manipular `$PAGE->set_context()`. A API externa exige validação dos parâmetros e do contexto com os mecanismos próprios, além das capabilities necessárias.

O fluxo típico é `validate_parameters()`, resolução do contexto real, `validate_context()` e depois `require_capability()` ou outra regra de autorização. Web Services e Integrações entra em detalhes sobre estruturas de parâmetros, retornos, serviços e tokens, mas a regra de segurança precisa aparecer desde já: uma função estar registrada em `db/services.php` não significa que ela pode confiar no chamador.

Também lembre que Web Services podem ser chamados por integrações, aplicativo móvel e AJAX, então qualquer parâmetro como `userid` ou `courseid` precisa ser tratado da mesma forma que um parâmetro de URL comum. O protocolo muda, a confiança não.

## AJAX authorization

No Moodle 3.5, o caminho preferido para AJAX é `core/ajax` chamando External Functions marcadas para AJAX. Isso é útil porque você reaproveita o contrato de parâmetros e retorno da External API, mas não significa que a chamada ficou automaticamente autorizada.

A função externa ainda precisa validar contexto, capability, relacionamento dos objetos e qualquer regra de propriedade. O JavaScript esconder um botão não protege o backend e o fato de `core/ajax` incluir infraestrutura do Moodle não transforma parâmetros do navegador em dados confiáveis.

Evite criar `ajax.php` solto que lê `$_POST`, faz uma query e devolve JSON. Além de repetir parsing, autenticação e tratamento de erro, você cria mais um endpoint que precisa ser auditado manualmente e tende a ficar diferente dos padrões do core.

## `contextid` vindo do cliente

Receber `contextid` do cliente pode ser conveniente, principalmente em componentes reutilizáveis, mas o contexto não deve ser aceito como prova de onde o objeto vive. Um atacante pode trocar o ID por um contexto em que possui mais permissões.

Se a operação recebe também `itemid`, prefira carregar o item, descobrir seu curso ou módulo e derivar o contexto. Quando `contextid` for realmente parte do contrato, valide que o contexto corresponde ao tipo esperado e ao objeto que está sendo manipulado.

```php
$record = $DB->get_record('local_catalog', ['id' => $id], '*', MUST_EXIST);
$context = context_course::instance($record->courseid);
```

Essa abordagem remove a necessidade de confiar em dois parâmetros que podem divergir. O navegador informa qual objeto deseja acessar; o servidor descobre a autoridade aplicável a partir do próprio objeto.

## `userid` vindo do cliente

`userid` é um dos parâmetros mais perigosos de aceitar sem contexto porque quase toda instalação Moodle possui dados que mudam conforme o usuário. Um relatório, certificado, anotação, arquivo ou configuração pessoal pode virar IDOR simplesmente trocando o ID na requisição.

Quando a operação deveria agir sobre o usuário atual, muitas vezes você nem precisa receber `userid`. Use `$USER->id` no servidor. Se professores podem operar sobre outros usuários, receba o ID, mas valide capability apropriada no contexto e confirme que o usuário alvo pertence ao escopo esperado, como matrícula no curso ou participação no grupo correto.

Quanto menos autoridade o cliente puder declarar sobre si mesmo, melhor. Um formulário que envia `userid` escondido para dizer quem é o dono de um novo registro está permitindo que o navegador escolha o proprietário; na maioria dos casos o backend já sabe essa resposta pela sessão.

## SSRF

Server-Side Request Forgery acontece quando o servidor faz uma requisição HTTP para um destino influenciado pelo usuário. Isso é perigoso porque o servidor pode alcançar endereços que o navegador do atacante não alcança, como serviços internos, metadata endpoints de cloud, painéis privados e hosts liberados por firewall.

Um recurso aparentemente inocente como "importar imagem por URL" pode virar SSRF se aceitar qualquer destino. Bloquear apenas `localhost` não basta, porque existem IPs privados, IPv6, DNS que resolve para rede interna, redirects e várias formas de representar endereços.

Moodle possui histórico de correções nessa área e mantém mecanismos de segurança associados ao cliente cURL. Não contorne esses mecanismos criando `file_get_contents($url)` ou instanciando uma biblioteca HTTP paralela apenas porque parece mais simples.

## Moodle Curl API para chamadas externas

Para chamadas HTTP externas, use a infraestrutura do Moodle e respeite as políticas de hosts bloqueados, proxy, certificados, timeout e segurança disponíveis na instalação. Além de padronizar comportamento, isso permite que administradores controlem rede sem seu plugin implementar uma pilha própria.

```php
require_once($CFG->libdir . '/filelib.php');

$curl = new curl();
$response = $curl->get($url, [], [
    'CURLOPT_TIMEOUT' => 15,
]);
```

O exemplo é apenas o começo. Se `$url` vem do usuário, você ainda precisa limitar destinos segundo o caso de uso e usar os recursos de segurança apropriados, porque uma API HTTP não decide sozinha quais URLs fazem sentido para seu produto.

Defina timeouts. Uma chamada sem limite pode prender workers PHP e transformar indisponibilidade de um serviço externo em indisponibilidade do Moodle. Em integrações importantes, combine isso com Task API, retry controlado e idempotência, assuntos aprofundados em Cron, Tasks e Processamento Assíncrono e em Web Services e Integrações.

## Secrets e tokens

API keys, client secrets, senhas e tokens de acesso são credenciais e devem ser tratados como tal. Eles não pertencem a templates, JavaScript, URLs públicas, logs ou mensagens de erro.

Quando o segredo precisa ser configurado pelo administrador, utilize a Config API e uma tela de configuração protegida, considerando mecanismos adicionais de deployment quando a organização exige segredo fora do banco. Alguns ambientes preferem definir valores por `config.php`, variáveis de ambiente ou secret managers de infraestrutura para impedir alteração pela interface e reduzir exposição.

Também diferencie token de integração, token de usuário e `sesskey`. Cada um tem finalidade e impacto diferentes. Mostrar um token de Web Service numa tela porque "o usuário já está logado" pode permitir que ele seja copiado, capturado em screenshot, extensão de navegador ou log de frontend.

## Por que não guardar senha/API key em código-fonte

Credencial em código-fonte vaza de maneiras surpreendentemente eficientes. Ela entra no Git, aparece em forks, backups, logs de CI, ZIP de release e cópias antigas mesmo depois que você remove a linha do branch atual.

```php
$apikey = 'sk-producao-super-secreta';
```

Além do vazamento, isso torna rotação difícil. Cada mudança exige alterar código e fazer deploy, enquanto configuração separada permite trocar segredo sem criar nova release do plugin.

Se uma credencial já entrou em repositório, removê-la do arquivo não é suficiente. Considere-a comprometida e rotacione no provedor, porque o histórico pode continuar acessível. O segredo não precisa ser "descoberto por hacker"; basta alguém ter acesso legítimo ao repositório em um momento em que não deveria possuir acesso ao ambiente de produção.

## Logs sem exposição de informações sensíveis

Log ajuda a investigar falhas e segurança, mas também pode criar um banco paralelo de dados sensíveis. Não registre senha, token, cookie, `Authorization` header, conteúdo integral de requisição ou dados pessoais sem necessidade clara.

Um padrão comum em integrações é gravar request e response completos para facilitar debug. Em desenvolvimento parece maravilhoso, até o response trazer CPF, e-mail, token renovado ou dados financeiros e tudo ficar armazenado indefinidamente em uma tabela que quase ninguém protegeu.

Prefira registrar identificadores, status, duração, endpoint lógico, código de erro e informações suficientes para correlação. Quando precisar de payload para diagnóstico, masque segredos e defina retenção. `mtrace()` de task também deve seguir a mesma disciplina, porque saída de cron pode acabar em arquivos de log externos ao Moodle.

## Forum - Capability é suficiente para proteger uma página?

A resposta curta é não, mas o motivo importa mais do que a resposta. Capability resolve autorização de uma ação em um contexto, enquanto uma página segura também precisa autenticar o usuário quando aplicável, verificar se o objeto pertence ao contexto, validar propriedade, proteger mudanças com CSRF, limpar entrada, escapar saída e impedir acesso indevido a arquivos ou serviços externos.

Considere esta página.

```php
require_login();

$context = context_course::instance(required_param('courseid', PARAM_INT));
require_capability('local_notes:edit', $context);

$id = required_param('id', PARAM_INT);
$text = required_param('text', PARAM_RAW);

$DB->set_field('local_notes', 'text', $text, ['id' => $id]);
```

Existe capability, mas ainda temos vários problemas. O registro `id` pode pertencer a outro curso, a alteração não exige `sesskey`, o código aceita conteúdo bruto e ainda não sabemos como esse conteúdo será exibido. Se a capability permite editar apenas a própria anotação, também falta conferir propriedade.

Uma versão melhor começa pelo objeto.

```php
require_login();

$id = required_param('id', PARAM_INT);
$record = $DB->get_record('local_notes', ['id' => $id], '*', MUST_EXIST);
$context = context_course::instance($record->courseid);

require_capability('local_notes:edit', $context);
require_sesskey();

if ((int)$record->userid !== (int)$USER->id
        && !has_capability('local_notes:editall', $context)) {
    throw new moodle_exception('nopermissions', 'error');
}

$text = required_param('text', PARAM_RAW);
// O conteúdo será processado segundo o formato aceito pelo recurso.

$record->text = $text;
$record->timemodified = time();
$DB->update_record('local_notes', $record);
```

Ainda precisaríamos definir o contrato do conteúdo e sua saída, mas a autorização agora está conectada ao registro real. Esse é o raciocínio que deveria ficar depois deste capítulo: segurança não é adicionar uma função no topo da página, é garantir que todas as fronteiras concordem sobre qual objeto está sendo manipulado, por quem e sob quais regras.

## Uma ordem prática para revisar segurança

Quando reviso um endpoint Moodle, eu prefiro seguir uma ordem previsível em vez de procurar vulnerabilidades pelo nome. Primeiro identifico todas as entradas: parâmetros, JSON, arquivos, headers, dados de integração e valores de sessão. Depois descubro quais objetos essas entradas selecionam e de onde vem o contexto real. Em seguida verifico autenticação, capability, propriedade e relacionamento, então procuro alterações de estado sem `sesskey` ou método adequado, e só depois sigo para SQL, HTML, arquivos, chamadas HTTP, secrets e logs.

Essa ordem ajuda porque vulnerabilidades costumam se esconder na conexão entre duas partes. Um `contextid` isolado parece válido, um `itemid` isolado também, mas juntos podem apontar para recursos diferentes. Um `userid` limpo é apenas inteiro, mas combinado com uma exportação sem capability vira vazamento. Um arquivo armazenado corretamente continua privado somente enquanto `pluginfile()` mantiver a mesma regra de acesso do objeto ao qual ele pertence.

Ferramentas automáticas são úteis, mas não conseguem compreender toda regra de negócio. Um scanner encontra `PARAM_RAW`, talvez encontre SQL concatenado e alguns pontos de XSS, porém dificilmente sabe que `submissionid=42` pertence ao curso 9 enquanto você validou capability no curso 7. É justamente aí que code review humano, testes com usuários de permissões diferentes e leitura do fluxo completo continuam essenciais.

Também vale acompanhar as security releases do Moodle. Falhas reais corrigidas no core são excelentes material de estudo porque mostram padrões que também aparecem em plugins: capability ausente, grupo pertencendo ao curso errado, Web Service expondo perfil, SQL Injection, XSS, SSRF e CSRF continuam surgindo em código moderno. Segurança não é uma fase que o ecossistema "já resolveu"; é uma propriedade que precisa ser reconstruída em cada novo fluxo.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
