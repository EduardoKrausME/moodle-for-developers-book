# 23 PRIVACY API E GDPR

Quando a Privacy API apareceu no Moodle, muita gente tratou o assunto como mais uma exigência burocrática: criar `classes/privacy/provider.php`, implementar uma interface e fazer o Plugin Validate parar de reclamar. Esse é provavelmente o pior jeito de pensar o problema, porque a Privacy API não existe para satisfazer o validator, ela existe para obrigar o plugin a responder perguntas que deveriam fazer parte do projeto desde o início: quais dados pessoais ele armazena, por que armazena, em quais contextos esses dados existem, como um usuário pode receber uma cópia do que pertence a ele e o que deve acontecer quando existe uma solicitação de exclusão.

Em um plugin pequeno isso parece simples. Uma tabela tem `userid`, então exportamos aquela linha e apagamos quando solicitado. Em um plugin real, porém, os dados podem estar espalhados em tabelas próprias, File API, preferências, tags, comentários, ratings, logs, serviços externos e subplugins. Algumas informações precisam ser apagadas, outras precisam ser anonimizadas porque fazem parte de uma estrutura compartilhada e outras nem pertencem diretamente ao plugin, embora tenham sido criadas por ele em um subsistema do core.

Neste capítulo vamos trabalhar com um exemplo chamado `mod_reflection`, uma atividade em que o aluno escreve uma reflexão, pode anexar arquivos e possui uma preferência individual de exibição. A atividade também envia opcionalmente uma cópia do texto para um serviço externo de análise. Esse exemplo permite passar por praticamente todos os problemas importantes: metadata, context list, user list, export, deletion, files, preferences, external locations e responsabilidade entre componentes.

A parte jurídica do GDPR e da LGPD não será tratada como parecer legal. O objetivo aqui é técnico: entender o que o Moodle espera que um plugin consiga descrever e executar. A instituição continua responsável por definir base legal, retenção, finalidade e políticas, enquanto o plugin precisa fornecer mecanismos corretos para que essas políticas possam ser aplicadas.

## 23.1 Por que a Privacy API existe

A Privacy API foi criada para padronizar duas famílias de problema. A primeira é descrever que tipo de dado pessoal um componente processa. A segunda é permitir que ferramentas administrativas executem solicitações relacionadas a esses dados, como exportação e exclusão.

Sem uma API comum, cada plugin teria que inventar sua própria página de exportação, sua própria rotina de exclusão e sua própria forma de explicar o que armazena. Isso seria impraticável em uma instalação com centenas de componentes.

O Moodle, portanto, cria um contrato. Cada componente informa o que guarda e implementa os providers necessários. O `core_privacy` coordena esses providers e ferramentas como `tool_dataprivacy` conseguem trabalhar com o conjunto inteiro sem conhecer internamente cada plugin.

## 23.2 Privacy API não é política de privacidade

Implementar Privacy API não significa que o site ficou automaticamente em conformidade com GDPR, LGPD ou qualquer outra legislação. A API fornece mecanismos técnicos, mas não decide finalidade, base legal, período de retenção ou obrigações contratuais.

Se a instituição decidiu manter registros de avaliação por cinco anos, o plugin precisa ser capaz de identificar esses dados e participar do processo correto, mas não é o provider que inventa esse prazo.

Da mesma forma, uma exclusão solicitada pode esbarrar em regras institucionais ou legais que exigem preservar determinada evidência. A Privacy API fornece ferramentas de exportação e remoção, enquanto a decisão de quando uma solicitação pode ser aprovada pertence ao processo institucional.

## 23.3 Todo plugin precisa ser auditado

A ideia mais importante é esta: mesmo um plugin que não armazena dados pessoais precisa declarar isso conscientemente.

Não basta simplesmente não criar `provider.php`. A ausência do provider não diz se o desenvolvedor auditou o componente ou esqueceu a Privacy API. Por isso existe `null_provider`, que representa explicitamente a conclusão de que aquele plugin não armazena, processa ou envia dados pessoais que precisem ser declarados por ele.

O provider é, portanto, também uma evidência de revisão arquitetural.

## 23.4 Onde o provider fica

A implementação padrão fica em:

```
classes/privacy/provider.php
```

Para `mod_reflection`, o namespace será:

```
namespace mod_reflection\privacy;
```

A classe precisa se chamar `provider` porque o privacy manager descobre a implementação por essa convenção.

## 23.5 Metadata provider e request providers

A arquitetura se divide em dois grupos principais. O metadata provider descreve dados processados pelo componente. Os request providers permitem encontrar, exportar e apagar dados.

Um plugin que armazena dados pessoais normalmente implementa:

```
\core_privacy\local\metadata\provider
\core_privacy\local\request\plugin\provider
\core_privacy\local\request\core_userlist_provider
```

Dependendo do caso também pode implementar provider de user preferences ou contratos específicos definidos por subplugin parents e subsistemas.

## 23.6 `metadata\provider`

O metadata provider possui um método central:

```php
public static function get_metadata(collection $collection): collection
```

Ele não exporta dados e não apaga nada. Seu papel é descrever o que o componente armazena ou processa.

Isso é mais importante do que parece porque essa descrição alimenta relatórios de privacidade e documentação administrativa. Um campo `ipaddress` que não é declarado continua sendo dado pessoal, só que agora o plugin também está documentado de forma incorreta.

## 23.7 O que é dado pessoal para o plugin

Não procure apenas campos chamados `userid`, `email` ou `name`. Dados pessoais podem aparecer de muitas formas.

Uma resposta escrita por um aluno é obviamente conteúdo pessoal. Um endereço IP pode identificar ou ajudar a identificar uma pessoa. Um timestamp associado a um usuário revela atividade. Um identificador externo pode permitir correlação com outro sistema. Preferências de interface, mensagens, logs e arquivos também podem fazer parte do conjunto.

A pergunta correta não é "esta coluna se chama userid?", mas "este dado está relacionado a uma pessoa identificada ou identificável dentro do contexto em que o plugin opera?".

## 23.8 A tabela do exemplo

Imagine que `mod_reflection` possua uma tabela:

```
reflection_entries
    id
    reflectionid
    userid
    text
    textformat
    ipaddress
    timecreated
    timemodified
```

Todos esses campos participam do dado do usuário em alguma medida. Até `reflectionid` importa porque explica em qual atividade a entrada foi criada.

No metadata provider podemos declarar:

```php
$collection->add_database_table(
    'reflection_entries',
    [
        'reflectionid' => 'privacy:metadata:reflection_entries:reflectionid',
        'userid' => 'privacy:metadata:reflection_entries:userid',
        'text' => 'privacy:metadata:reflection_entries:text',
        'ipaddress' => 'privacy:metadata:reflection_entries:ipaddress',
        'timecreated' => 'privacy:metadata:reflection_entries:timecreated',
        'timemodified' => 'privacy:metadata:reflection_entries:timemodified',
    ],
    'privacy:metadata:reflection_entries'
);
```

## 23.9 Descrições ficam em strings de idioma

O metadata não deveria carregar textos explicativos hardcoded. Cada campo e cada estrutura devem apontar para strings do componente.

```
$string['privacy:metadata:reflection_entries'] =
    'Stores reflections submitted by users.';
$string['privacy:metadata:reflection_entries:ipaddress'] =
    'The IP address recorded when the reflection was submitted.';
```

Isso permite que a descrição também seja traduzida e apareça corretamente nas ferramentas administrativas.

## 23.10 Não declare a tabela inteira por preguiça

`add_database_table()` espera os campos que possuem significado de privacidade, não um dump do `install.xml`.

Se uma coluna é apenas uma chave técnica interna sem relação informativa com o usuário, talvez não precise de uma descrição individual. Em contrapartida, esconder um campo sensível porque ele "é só técnico" é um erro.

Use o metadata para documentar o modelo de dados que interessa à privacidade, não para copiar schema mecanicamente.

## 23.11 Dados armazenados em subsistemas do Moodle

Um plugin pode não possuir uma tabela própria para determinado dado e ainda assim ser responsável por declarar que utiliza um subsistema do core.

Exemplos incluem files, tags, ratings e outros subsistemas que possuem seus próprios privacy providers.

A collection atual possui `add_subsystem_link()` para registrar essa relação:

```php
$collection->add_subsystem_link(
    'core_files',
    [],
    'privacy:metadata:core_files'
);
```

O nome exato do subsistema deve seguir o contrato daquele recurso. Não invente um identificador só porque parece descritivo.

## 23.12 `add_subsystem_link()` e o método legado

Código antigo ainda pode usar `link_subsystem()`, mas a implementação atual da collection marca esse método como legado e recomenda `add_subsystem_link()`.

Essa diferença vale registrar porque muitos exemplos de Privacy API foram escritos em 2018 e continuam circulando. O conceito continua válido, mas a API evoluiu.

No código novo, prefira o método atual.

## 23.13 User preferences

Preferências do usuário também são dados que precisam ser descritos quando persistidas.

Se `mod_reflection` guardar:

```
set_user_preference('mod_reflection_compactview', 1);
```

O metadata precisa incluir:

```php
$collection->add_user_preference(
    'mod_reflection_compactview',
    'privacy:metadata:preference:compactview'
);
```

E, se a preferência for exportável como preferência global, o plugin deve implementar o provider correspondente.

## 23.14 Sessão não é persistência de longo prazo

A documentação do privacy subsystem faz uma distinção útil. Dados mantidos apenas na sessão não precisam ser exportados como armazenamento permanente do plugin, porque a sessão é temporária e não está disponível ao processo de exportação executado depois.

Isso não significa que qualquer coisa pode ser colocada na sessão sem preocupação de segurança. Significa apenas que o contrato de Subject Access Request não trata a sessão temporária como armazenamento persistente do componente.

## 23.15 Dados enviados para serviço externo

Nosso `mod_reflection` pode opcionalmente enviar o texto da reflexão para um serviço de análise externo. Mesmo que o plugin não mantenha localmente uma cópia adicional dessa transmissão, ele processa dados pessoais e precisa declarar o destino externo.

A API atual oferece `add_external_location_link()`:

```php
$collection->add_external_location_link(
    'reflectionanalysis',
    [
        'userid' => 'privacy:metadata:external:userid',
        'text' => 'privacy:metadata:external:text',
    ],
    'privacy:metadata:external'
);
```

Isso informa que determinados dados podem sair do Moodle por responsabilidade daquele componente.

## 23.16 `link_external_location()` é legado

Assim como aconteceu com subsystems, existe um método histórico `link_external_location()`. A implementação atual da collection recomenda `add_external_location_link()`.

Quem mantém plugin antigo não precisa sair renomeando sem testar branches suportadas, mas em código novo a API mais recente deve ser preferida.

## 23.17 Enviar para fora e não conseguir buscar depois

Um caso desconfortável acontece quando o plugin envia dados a uma API externa, mas aquela API não oferece endpoint para recuperar ou apagar individualmente o conteúdo.

A Privacy API não pode fabricar uma capacidade que o serviço externo não possui. O plugin deve declarar o envio e implementar seu provider de request de maneira coerente com o que consegue fazer, enquanto a instituição precisa conhecer essa limitação ao aprovar o uso do serviço.

Esse é justamente um motivo para pensar em privacidade antes de contratar e integrar uma API, e não depois.

## 23.18 `null_provider`

Plugins que realmente não armazenam nem enviam dados pessoais podem implementar:

```
class provider implements
    \core_privacy\local\metadata\null_provider {

    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
```

A string deve explicar por que o plugin não armazena dados pessoais.

Isso é uma declaração forte. Não use `null_provider` como atalho para evitar implementar o resto.

## 23.19 Quando `null_provider` não pode ser usado

A documentação é bem clara em alguns critérios. Um plugin não deve usar null provider se possui tabelas com dados de usuário, preferências persistentes ou envia dados para localização externa.

Também precisa considerar subsistemas. Um plugin que usa Comments API ou outro subsystem para criar dados pessoais pode ter responsabilidades mesmo que sua própria tabela esteja vazia.

A ausência de `userid` em `install.xml` não prova que o plugin é null.

## 23.20 Um exemplo legítimo de null provider

Um bloco que apenas lê dados de calendário existentes e os apresenta sem armazenar preferências próprias, sem enviar dados para fora e sem criar registros em outro subsystem pode ser um candidato legítimo.

O bloco de calendário mensal do core usa exatamente esse modelo e implementa apenas `null_provider` com uma razão explicativa.

## 23.21 Metadata não substitui exportação

Depois de descrever os dados, ainda precisamos fazer o Moodle encontrá-los e exportá-los. É aí que entra o request provider.

O metadata diz "eu armazeno reflexões com userid, texto, IP e timestamps". O request provider responde "estas reflexões do usuário 123 estão nos contextos X e Y, e aqui está a representação exportável de cada uma".

São responsabilidades diferentes.

## 23.22 `plugin\provider`

O provider padrão para plugins que armazenam dados implementa:

```
\core_privacy\local\request\plugin\provider
```

Esse contrato exige métodos relacionados a localização, exportação e exclusão do usuário.

Em plugins atuais também é comum implementar `core_userlist_provider`, porque ferramentas de retenção precisam descobrir quais usuários possuem dados em um contexto específico.

## 23.23 `get_contexts_for_userid()`

O primeiro problema é descobrir em quais contexts o plugin possui dados de um usuário.

A assinatura é:

```php
public static function get_contexts_for_userid(int $userid): contextlist
```

Para uma activity module, normalmente queremos contextos de módulo onde aquele usuário possui registros.

## 23.24 Por que a API retorna contextos

A Privacy API organiza a exportação e exclusão em torno do context tree. Isso permite que uma solicitação seja aprovada ou rejeitada para determinados contextos e ajuda a relacionar dado com curso, atividade, usuário ou sistema.

Se um aluno escreveu reflexões em cinco atividades, o provider pode retornar cinco `context_module` distintos. O privacy manager decide quais contextos serão aprovados para a próxima etapa.

## 23.25 `contextlist`

O método cria um `contextlist` e adiciona os contextos encontrados.

```php
$contextlist = new contextlist();
$contextlist->add_from_sql($sql, $params);
return $contextlist;
```

A API é desenhada para receber SQL que retorna `contextid`, evitando carregar uma quantidade enorme de objetos apenas para descobrir IDs.

## 23.26 Faça a busca no banco, não em loop PHP

Uma implementação ruim buscaria todas as reflexões do usuário, depois para cada uma carregaria activity, course module e context separadamente.

Isso cria N+1 justamente em uma operação que pode percorrer anos de dados históricos.

Prefira uma query que una `{context}`, `{course_modules}`, tabela principal da atividade e a tabela de dados do usuário, retornando diretamente os context IDs relevantes.

## 23.27 Exemplo de context list

Para `mod_reflection`:

```php
$sql = "SELECT ctx.id
          FROM {context} ctx
          JOIN {course_modules} cm
            ON cm.id = ctx.instanceid
           AND ctx.contextlevel = :contextlevel
          JOIN {modules} m
            ON m.id = cm.module
           AND m.name = :modname
          JOIN {reflection} r
            ON r.id = cm.instance
          JOIN {reflection_entries} re
            ON re.reflectionid = r.id
         WHERE re.userid = :userid";

$params = [
    'contextlevel' => CONTEXT_MODULE,
    'modname' => 'reflection',
    'userid' => $userid,
];

$contextlist = new contextlist();
$contextlist->add_from_sql($sql, $params);
return $contextlist;
```

O objetivo da query é apenas descobrir contextos, não exportar o conteúdo inteiro.

## 23.28 Um usuário pode aparecer por mais de um caminho

Talvez o plugin tenha reflexão criada pelo usuário, avaliação feita pelo professor e menções a usuários. Cada uma dessas relações pode significar dado pessoal em contextos diferentes.

`contextlist` permite adicionar mais de uma query. Isso é melhor do que criar uma SQL monstruosa com `UNION` apenas por estética.

O importante é que todo caminho real de dado seja coberto.

## 23.29 `core_userlist_provider`

A operação inversa também é necessária. Em vez de perguntar "em quais contextos este usuário possui dados?", o Moodle pergunta "quais usuários possuem dados neste contexto?".

O componente implementa:

```
\core_privacy\local\request\core_userlist_provider
```

E fornece:

```php
public static function get_users_in_context(userlist $userlist): void
```

## 23.30 Por que user list existe

Ferramentas de retenção podem querer apagar dados de todos os usuários de determinada atividade ou processar apenas usuários aprovados segundo uma política.

Sem user list, o core teria que conhecer o schema interno do plugin para descobrir quem aparece em uma instância.

O provider transforma essa informação em um contrato comum.

## 23.31 `get_users_in_context()`

Primeiro valide se o tipo de contexto faz sentido:

```php
$context = $userlist->get_context();

if (!$context instanceof \context_module) {
    return;
}
```

Depois adicione IDs com `add_from_sql()`:

```php
$userlist->add_from_sql('userid', $sql, $params);
```

A query deve retornar apenas usuários daquele contexto, sem incluir subcontexts por acidente.

## 23.32 Contexto errado é um bug de privacidade

Imagine que o plugin recebe um `context_course` e simplesmente devolve todos os usuários com dados em qualquer atividade daquele curso, embora sua implementação tenha sido registrada para module contexts.

Isso pode fazer uma rotina de exclusão apagar mais dados do que deveria.

Privacy API precisa da mesma disciplina de contextos que Access API. Não escolha contexto pela conveniência da query.

## 23.33 `approved_contextlist`

Depois que os contextos são encontrados, o manager não chama export e deletion com a lista original diretamente. Ele entrega um `approved_contextlist`.

Isso é fundamental porque a descoberta pode encontrar dados em dez contextos, mas a solicitação administrativa pode ter aprovado apenas três.

Seu provider deve operar somente sobre os contextos aprovados.

## 23.34 `export_user_data()`

O método recebe a lista aprovada:

```php
public static function export_user_data(
    approved_contextlist $contextlist
): void
```

Primeiro obtenha o usuário:

```php
$user = $contextlist->get_user();
```

Depois carregue somente dados daquele usuário e dos contextos autorizados.

## 23.35 Não exporte o banco bruto

O objetivo não é criar um CSV com `SELECT * FROM reflection_entries`. A exportação deve ser compreensível e contextualizada.

IDs internos podem ser úteis em alguns casos, mas não deveriam substituir nomes e informações que façam sentido para uma pessoa lendo o pacote de dados.

Converta timestamps para representação humana, estruture os registros e inclua contexto suficiente para explicar o que cada informação significa.

## 23.36 `writer`

A exportação utiliza `writer`:

```
use core_privacy\local\request\writer;
```

Para um contexto:

```php
writer::with_context($context)
    ->export_data($subcontext, $data);
```

O writer organiza os dados no formato de exportação utilizado pelo privacy subsystem.

## 23.37 Subcontext

Dentro de um mesmo context podem existir vários registros. O subcontext cria uma hierarquia lógica.

Por exemplo:

```php
$subcontext = [
    get_string('reflections', 'mod_reflection'),
    $entry->id,
];
```

Depois:

```php
writer::with_context($context)
    ->export_data($subcontext, $data);
```

A estrutura deve ser estável e compreensível, não um caminho aleatório baseado em índices de loop.

## 23.38 Transformando timestamps

Privacy API possui helpers de transformação para deixar dados mais legíveis. Em vez de exportar apenas `1727105902`, transforme a data.

```php
use core_privacy\local\request\transform;

$data->timecreated = transform::datetime($entry->timecreated);
```

O valor técnico pode continuar existindo se necessário, mas a exportação deveria ser voltada a pessoas, não somente a desenvolvedores.

## 23.39 Exportando texto com arquivos embutidos

Se o texto usa editor Moodle e `@@PLUGINFILE@@`, não exporte a string crua sem reescrever URLs.

O writer possui mecanismos para reescrever file URLs no contexto de exportação e depois exportar os arquivos da área correspondente.

Isso garante que a exportação seja autocontida e não dependa de uma URL protegida do Moodle que talvez deixe de existir.

## 23.40 Exportando files

Depois de exportar os dados você pode exportar uma file area:

```php
writer::with_context($context)
    ->export_area_files(
        $subcontext,
        'mod_reflection',
        'attachment',
        $entry->id
    );
```

Isso respeita o File API e associa os arquivos ao local correspondente no pacote de privacidade.

## 23.41 Files também são dados pessoais

Um PDF enviado por um aluno pode conter nome, matrícula, assinatura ou qualquer outro conteúdo sensível. O fato de `mdl_files` pertencer ao core não elimina a responsabilidade do plugin de indicar corretamente quais file areas representam dados daquele usuário.

A Privacy API do componente precisa saber como aquele arquivo se relaciona com o registro exportado e com a exclusão.

## 23.42 Exportando metadata adicional

Em alguns casos é útil exportar metadata que não faz sentido misturado ao objeto principal.

O writer oferece `export_metadata()` para esse tipo de estrutura.

Isso pode ser útil para registrar, por exemplo, primeira visualização, origem de um estado ou informação complementar que explica o dado principal.

## 23.43 User preferences

Se o plugin possui preferências site-wide, implemente:

```
\core_privacy\local\request\user_preference_provider
```

E o método:

```php
public static function export_user_preferences(int $userid): void
```

A preferência é exportada com:

```php
writer::export_user_preference(
    'mod_reflection',
    'mod_reflection_compactview',
    (string)$value,
    get_string('privacy:preference:compactview', 'mod_reflection')
);
```

## 23.44 Preferência global e preferência contextual

Uma preferência global do usuário pode ser exportada pelo provider de preferências. Se o significado daquela preferência depende de uma instância específica, a documentação do privacy subsystem recomenda tratá-la junto aos contexts correspondentes.

Não force tudo em `export_user_preferences()` apenas porque o dado veio de User Preferences API.

A estrutura de exportação deveria preservar o significado do dado.

## 23.45 Delete para todos no contexto

O provider precisa implementar:

```php
public static function delete_data_for_all_users_in_context(
    \context $context
): void
```

Esse método é usado quando todos os dados pessoais de um componente naquele contexto precisam ser removidos.

Valide o tipo do contexto antes de qualquer operação.

## 23.46 Exemplo de exclusão por activity context

```php
if (!$context instanceof \context_module) {
    return;
}

$cm = get_coursemodule_from_id('reflection', $context->instanceid);
if (!$cm) {
    return;
}

$DB->delete_records('reflection_entries', [
    'reflectionid' => $cm->instance,
]);
```

Se existirem files, ratings, tags ou outros subsystems, eles também precisam ser tratados pelo contrato apropriado.

## 23.47 Não apague o que pertence à estrutura da atividade

Excluir dados pessoais de usuários não significa excluir a atividade inteira.

`mod_reflection` pode continuar existindo com seu nome, configuração e texto de instrução, enquanto entradas dos estudantes são removidas.

A implementação precisa distinguir dados da configuração da instância e dados pessoais gerados por participantes.

## 23.48 Delete de um usuário

O método:

```php
public static function delete_data_for_user(
    approved_contextlist $contextlist
): void
```

recebe um usuário e os contexts autorizados.

O código deve apagar somente dados daquele usuário dentro desses contexts.

## 23.49 O perigo de esquecer o filtro de contexto

Isto seria gravíssimo:

```php
$DB->delete_records('reflection_entries', [
    'userid' => $userid,
]);
```

Se a solicitação aprovou apenas dois contexts, esse código apagaria reflexões do usuário em toda a instalação.

Sempre combine usuário com a instância ou com o conjunto de contexts aprovados.

## 23.50 `approved_userlist`

Para exclusão em lote de usuários dentro de um único context existe `approved_userlist`.

O provider implementa:

```php
public static function delete_data_for_users(
    approved_userlist $userlist
): void
```

Essa operação evita chamar delete individual milhares de vezes quando a política de retenção trabalha por contexto.

## 23.51 Delete em lote precisa continuar restrito ao context

Obtenha os user IDs aprovados:

```php
$userids = $userlist->get_userids();
```

E combine-os com a instância pertencente ao context.

Use `$DB->get_in_or_equal()` e SQL parametrizado, nunca concatene uma lista arbitrária recebida do objeto.

## 23.52 Apagar versus anonimizar

Nem todo dado pode simplesmente desaparecer sem quebrar estrutura compartilhada. Um post que recebeu respostas, por exemplo, pode precisar continuar existindo, mas ter autoria e conteúdo tratados de maneira específica.

A decisão depende do modelo do plugin. Privacy API não obriga toda operação a ser `DELETE FROM`.

Você pode substituir conteúdo, remover referência ao usuário ou manter uma estrutura mínima quando isso for necessário para preservar consistência, desde que o resultado cumpra a finalidade de exclusão definida pela instituição.

## 23.53 Conteúdo criado pelo usuário e conteúdo sobre o usuário

Uma reflexão escrita pelo aluno é conteúdo criado por ele. Uma avaliação escrita pelo professor sobre o aluno é dado pessoal do aluno e também criação do professor.

Esse tipo de sobreposição exige cuidado na exportação e na exclusão. Uma solicitação de um usuário pode precisar incluir conteúdo que outra pessoa escreveu sobre ele, dependendo da política e do modelo de dados.

Não limite a busca a colunas `userid` se existem campos como `targetuserid`, `reviewerid` ou relacionamentos indiretos.

## 23.54 Logs

O Moodle possui sistema de logs próprio e Events API. Se o plugin dispara events, o log padrão pode conter dados relacionados ao usuário.

Em muitos casos o componente não precisa duplicar exportação e deletion dos logs, porque o subsystem responsável possui seu próprio privacy provider.

Mas o plugin deve declarar uso do subsystem quando o contrato exigir e evitar criar uma segunda tabela de log com a mesma informação sem estratégia de privacidade.

## 23.55 Não use uma tabela de log como desculpa para retenção eterna

Se o plugin cria `local_plugin_log` com userid, IP, payload completo e response body, aquela tabela é responsabilidade direta do plugin.

Ela precisa aparecer no metadata, entrar em exportação quando aplicável, participar da exclusão e ter política de retenção coerente.

"É só log técnico" não transforma dados pessoais em dados anônimos.

## 23.56 Payloads externos

Integrações costumam gravar JSON completo para facilitar debugging. Esse JSON pode conter nome, email, documento, telefone, notas e outros dados pessoais que nem aparecem como colunas explícitas.

Privacy review precisa olhar conteúdo semiestruturado também.

Se você não precisa guardar o payload inteiro, não guarde. Logging mínimo reduz tanto risco de segurança quanto trabalho de privacidade.

## 23.57 External locations

Quando um plugin envia dados a terceiro, o metadata precisa explicar quais campos são enviados e com qual finalidade.

Isso é especialmente importante para IA, antivírus, plágio, videoconferência, analytics e gateways que recebem identificadores de usuário ou conteúdo criado por ele.

A Privacy API não substitui contrato com o fornecedor, mas pelo menos torna o fluxo técnico visível dentro do Moodle.

## 23.58 Apagando dados em serviço externo

Se a API externa oferece operação de exclusão, o plugin pode chamar essa operação durante o fluxo apropriado, desde que isso seja seguro e previsível.

Mas pense em confiabilidade. A Privacy API não deveria marcar uma exclusão como concluída localmente e esquecer uma falha remota silenciosa.

Dependendo do serviço, pode ser necessário registrar uma tarefa de remoção, repetir falhas transitórias e fornecer observabilidade para o administrador.

## 23.59 Exclusão externa assíncrona

Uma remoção remota pode demorar ou depender de rate limit. Adhoc Task pode ser útil, mas a instituição precisa entender que a solicitação passa a ter estado pendente.

Não esconda processamento assíncrono atrás de um método que retorna imediatamente sem qualquer rastreabilidade.

A arquitetura precisa ligar a solicitação de privacidade à conclusão real do trabalho externo.

## 23.60 Subplugins

O Capítulo 20 mostrou que subplugins são componentes independentes. Privacy API respeita essa separação.

Se `assignsubmission_custom` possui tabela própria com conteúdo de usuário, não é suficiente o `mod_assign` declarar genericamente "possui submissões". O parent define um contrato de privacy para seus subplugins e cada filho participa segundo esse contrato.

## 23.61 Provider de subplugin

A documentação do privacy subsystem prevê interfaces específicas para subplugins, baseadas em `subplugin_provider`.

O parent define como vai consultar os filhos. Isso é necessário porque context, subcontext e lifecycle normalmente pertencem ao pai, enquanto o filho conhece seus dados específicos.

Esse modelo evita que cada subplugin tente descobrir sozinho toda a estrutura do parent.

## 23.62 Subplugin não deve implementar só porque o validator pediu

Se um parent define uma interface de privacy, o filho precisa entender o contrato daquele parent. Copiar provider de outro subplugin e deixar métodos vazios pode fazer o componente parecer compatível sem realmente exportar ou apagar dados.

Revise tabelas, files, preferences e external locations de cada filho separadamente.

## 23.63 Plugins de subsistemas

Alguns plugin types são chamados principalmente por um subsystem, como plagiarism plugins. Nesses casos o subsystem pode definir seu próprio privacy contract.

A lógica é parecida com subplugins. O plugin não trabalha isoladamente e o parent ou subsystem conhece a estrutura onde o dado foi criado.

Antes de implementar provider genérico, verifique o contrato daquele tipo de plugin.

## 23.64 Files e Privacy

A File API já conhece context, component, filearea e itemid, mas não sabe automaticamente qual usuário tem direito a determinada exportação.

O plugin precisa ligar seus registros aos files corretos. Se a filearea `attachment` usa `itemid = entryid`, o provider deve localizar os entries daquele usuário e exportar ou apagar apenas os files associados.

Nunca apague toda a filearea do context em uma solicitação individual se existem arquivos de outros usuários nela.

## 23.65 Arquivos compartilhados

Se o mesmo arquivo é usado por vários usuários, o modelo precisa dizer quem é o proprietário lógico. Deduplicação física do File API não muda isso, porque stored files diferentes podem compartilhar o mesmo contenthash.

Privacidade trabalha com a referência lógica, não com apagar bytes arbitrariamente de `filedir`.

Por isso nunca manipule `filedir` diretamente em rotinas de privacy.

## 23.66 Privacy e Gradebook

Se o plugin envia notas ao Gradebook, o dado oficial da nota passa a ser gerenciado também pelo subsystem de grades. O plugin ainda precisa tratar seus dados internos de avaliação, se existirem, mas não deveria escrever uma segunda rotina que apaga `grade_grades` diretamente.

Use as APIs e os privacy contracts dos subsistemas responsáveis.

Isso mantém ownership claro.

## 23.67 Privacy e Question Engine

Uma atividade que usa Question Engine pode possuir tentativas e respostas armazenadas em tabelas do core question. O componente consumidor continua precisando participar da relação de privacy, porque é ele que sabe como o QUBA se relaciona com um usuário e um contexto de negócio.

Não presuma que `core_question` sozinho consegue adivinhar que determinado question usage pertence a uma tentativa específica da sua atividade.

Essa é outra situação em que componente e subsystem precisam cooperar.

## 23.68 Privacy e Events

Events podem levar dados para logs e observers. Disparar um evento não significa que você precisa exportar novamente a cópia do log em seu provider, mas os dados persistidos diretamente pelo plugin continuam sob sua responsabilidade.

Evite colocar dados sensíveis em `other` apenas porque é fácil. Logs costumam ter retenção longa e ampla visibilidade administrativa.

O melhor dado para privacidade é muitas vezes o dado que você nunca precisou armazenar.

## 23.69 Data minimisation aplicada ao código

Se você só precisa saber que uma ação aconteceu, talvez não precise guardar payload completo. Se precisa de correlação, talvez um ID seja suficiente. Se a informação serve apenas durante uma task, talvez não precise permanecer indefinidamente.

Privacy API não é apenas export/delete. Ela deveria influenciar o desenho antes da persistência.

Menos dados significam menos exposição, menos backup, menos índice, menos exportação e menos problema quando chega uma solicitação de exclusão.

## 23.70 Retenção

O Moodle possui ferramentas administrativas de data privacy e retenção que trabalham em conjunto com contexts e providers.

Seu plugin deve fornecer informação correta para que essas ferramentas consigam agir. Se `get_users_in_context()` esquece metade dos usuários, uma política de retenção pode nunca processar aqueles registros.

Se `delete_data_for_users()` ignora uma tabela auxiliar, o processo fica incompleto mesmo que a ferramenta administrativa indique sucesso.

## 23.71 Performance de `get_contexts_for_userid()`

Esses métodos podem ser executados em instalações enormes. Não faça queries que varrem tabelas inteiras sem índices coerentes.

Se `reflection_entries` é consultada por `userid` e `reflectionid`, pense nos índices desde o Capítulo 5. Privacy API não deveria ser a primeira vez em que você descobre que sua tabela de 40 milhões de linhas não possui índice em usuário.

Teste com volumes realistas.

## 23.72 Performance de user lists

`get_users_in_context()` também precisa escalar. Um contexto de curso pode conter dezenas de milhares de usuários e milhões de registros.

Retorne IDs por SQL direto ao `userlist`. Não monte arrays gigantes em PHP apenas para passá-los depois ao objeto.

As classes da API foram desenhadas justamente para evitar esse tipo de desperdício.

## 23.73 Recordsets na exportação

Se um usuário possui muitos dados, `get_records_sql()` pode carregar tudo em memória. Prefira recordset quando o volume pode ser grande e exporte em streaming lógico, fechando o recordset ao final.

O Forum do core faz isso em partes de sua exportação porque um usuário pode possuir milhares de posts.

A mesma disciplina vale para plugins institucionais.

## 23.74 Transações durante delete

Apagar dados de uma pessoa pode envolver várias tabelas relacionadas. Dependendo do modelo, delegated transaction ajuda a impedir exclusão parcial.

Mas não mantenha uma transação aberta enquanto chama API externa. Banco e rede possuem ciclos diferentes e uma chamada lenta pode prender locks desnecessariamente.

Separe exclusão local atômica e processamento externo com uma estratégia explícita.

## 23.75 Ordem de exclusão

Se existem tabelas filhas, respeite foreign keys e relações lógicas. Apague children primeiro quando necessário, files associados, referências de subsystems e por fim a entidade principal do usuário.

Não dependa de cascade invisível sem saber o que o schema realmente definiu.

E não apague registros compartilhados apenas porque um dos usuários relacionados está sendo removido.

## 23.76 Anonimização

Algumas estruturas precisam preservar agregados ou relações. Nesse caso a exclusão pode substituir autoria por um valor neutro e limpar campos pessoais.

Porém anonimização verdadeira é mais difícil do que colocar `userid = 0`. Se outros campos permitem reidentificação, o dado continua pessoal.

A implementação deve seguir a política real e não apenas mascarar o campo mais óbvio.

## 23.77 IP address

IP é um exemplo clássico de dado técnico tratado como se não fosse pessoal. Se você guarda IP associado a usuário e timestamp, declare, exporte e aplique retenção adequada.

E pergunte se precisa guardá-lo para sempre. Em muitos casos uma retenção curta já atende segurança operacional.

Não registre IP por hábito.

## 23.78 IDs externos

`externaluserid`, `customerid`, `documentid` e similares podem ser ainda mais sensíveis porque conectam Moodle a outros sistemas.

Eles precisam aparecer no metadata quando são dados pessoais ou facilitam identificação.

Evite exportar secrets ou tokens apenas porque estão na mesma tabela; credencial não é dado que deve aparecer em um pacote de Subject Access Request.

## 23.79 Tokens e secrets não entram na exportação do usuário

Um access token pertencente à integração pode ter relação com usuário, mas exportá-lo em texto claro seria uma vulnerabilidade.

Privacy export não significa despejar toda informação secreta existente no banco.

Descreva o dado corretamente, mas proteja credenciais e avalie se o usuário precisa de representação informativa em vez do valor do secret.

## 23.80 Testando metadata

Uma revisão simples começa comparando `install.xml`, Preferences API, File API e integrações externas com `get_metadata()`.

Para cada tabela, pergunte quais campos identificam ou descrevem pessoas. Para cada filearea, pergunte quem é o owner lógico. Para cada serviço externo, pergunte o que sai do Moodle.

Esse checklist encontra muita coisa antes de qualquer PHPUnit.

## 23.81 Testando context discovery

Crie dois cursos, duas instâncias e dois usuários. Insira dados cruzados e verifique se `get_contexts_for_userid()` retorna somente os contexts esperados para cada pessoa.

Inclua um usuário sem dados e um usuário com dados indiretos, se o plugin possuir esse conceito.

Teste também exclusão de uma das instâncias para garantir que context órfão não cause exception.

## 23.82 Testando user list

No mesmo fixture, chame `get_users_in_context()` e confira se todos os usuários relacionados aparecem e nenhum usuário de outra instância entra por engano.

Se o plugin possui autores e avaliadores, ambos podem precisar aparecer conforme a natureza dos dados.

Não teste somente o campo `userid` principal.

## 23.83 Testando export

A infraestrutura de PHPUnit permite trabalhar com o writer de privacy. O teste deve verificar que os dados exportados possuem conteúdo esperado e que files aparecem no caminho correto.

Não faça assertion apenas de que o método "não lançou exception". Isso prova quase nada.

Verifique estrutura, valores, transforms e separação por subcontext.

## 23.84 Testando delete individual

Crie dados de dois usuários no mesmo context, delete apenas um e confirme que o outro permanece intacto.

Depois repita com o mesmo usuário em dois contexts, aprove apenas um e confirme que o segundo permanece.

Esses dois testes encontram os erros mais perigosos de implementação de delete.

## 23.85 Testando delete de todos

Crie vários usuários em uma atividade e dados em outra atividade do mesmo curso. Execute `delete_data_for_all_users_in_context()` apenas na primeira.

O resultado correto é a primeira ficar limpa e a segunda intocada.

Se o seu SQL usa apenas `courseid`, o teste vai denunciar o problema imediatamente.

## 23.86 Testando delete em lote

Monte um `approved_userlist` com um subconjunto dos usuários daquele context e chame `delete_data_for_users()`.

Confirme que usuários não aprovados continuam com dados.

Essa função existe justamente para suportar políticas seletivas e precisa ser tão restritiva quanto a versão individual.

## 23.87 Utilities de desenvolvimento

A documentação do Moodle possui scripts auxiliares para verificar compliance e testar provider durante o desenvolvimento.

Eles são úteis para diagnosticar metadata ausente, interfaces implementadas e execução básica de export, mas a própria documentação deixa claro que não substituem PHPUnit.

Use utilitário para feedback rápido e testes automatizados para garantia real.

## 23.88 Plugin Validate não prova conformidade

Validator consegue perceber ausência de provider e alguns problemas estruturais, mas não consegue saber que sua query esqueceu uma tabela ou que `delete_data_for_user()` apaga dados de todos.

Privacy API é uma área em que code review e teste de domínio são indispensáveis.

Passar no checker é o início, não o fim.

## 23.89 O caso do `mod_reflection`

Vamos consolidar o exemplo. O plugin possui uma tabela de entradas, filearea `attachment`, uma preferência global e uma integração externa opcional.

O metadata declara tabela, preferência, File API/subsystem quando necessário e external location. O request provider localiza module contexts com entries do usuário, exporta texto e files, apaga entries por context e suporta user lists.

A preferência é exportada pelo provider apropriado, enquanto o serviço externo precisa ter política própria de exclusão e documentação do que foi enviado.

## 23.90 Esqueleto do provider

Uma classe pode começar assim:

```
namespace mod_reflection\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\approved_contextlist;
use core_privacy\local\request\approved_userlist;
use core_privacy\local\request\contextlist;
use core_privacy\local\request\userlist;

class provider implements
        \core_privacy\local\metadata\provider,
        \core_privacy\local\request\plugin\provider,
        \core_privacy\local\request\core_userlist_provider,
        \core_privacy\local\request\user_preference_provider {

    // get_metadata()
    // get_contexts_for_userid()
    // get_users_in_context()
    // export_user_data()
    // export_user_preferences()
    // delete_data_for_all_users_in_context()
    // delete_data_for_user()
    // delete_data_for_users()
}
```

O tamanho do provider pode crescer bastante. Separe helpers privados quando isso melhorar legibilidade, mas não espalhe a lógica de privacy em classes aleatórias sem necessidade.

## 23.91 Erro comum, usar null provider porque a tabela não tem `userid`

Imagine uma tabela com `entryid`, `externalid` e `ipaddress`, ligada a outra tabela que identifica o usuário. O dado continua pessoal mesmo sem `userid` direto.

Metadata precisa considerar relacionamentos, não apenas nomes de coluna.

Se você consegue chegar a uma pessoa por join, existe uma boa chance de aquele dado fazer parte da revisão de privacidade.

## 23.92 Erro comum, exportar somente a tabela principal

Plugins maduros costumam possuir comments, files, grades, tags, preferences e dados auxiliares. Exportar apenas a linha principal produz um pacote incompleto.

Faça um inventário de todas as APIs transversais usadas pelo componente.

Cada subsystem precisa ter ownership claro.

## 23.93 Erro comum, apagar files de todos

Uma implementação preguiçosa chama `delete_area_files($contextid, 'mod_reflection', 'attachment')` durante delete de um usuário.

Se a filearea contém anexos de vários entries, você acabou de apagar arquivos de todos.

Use itemid ou IDs específicos pertencentes ao usuário.

## 23.94 Erro comum, esquecer dados externos

A integração envia texto para um serviço externo, mas o provider declara somente a tabela local. A exportação do Moodle fica tecnicamente incompleta como documentação de processamento.

External location não é detalhe opcional. É parte do mapa de dados do componente.

## 23.95 Erro comum, confundir log com anonimato

Um log contendo `userid`, IP, URL e timestamp é dado pessoal. Mesmo que o campo message não tenha nome da pessoa, o relacionamento continua existindo.

Se o log serve apenas para debug, defina retenção curta e evite payload completo.

## 23.96 Erro comum, apagar mais contexts do que foram aprovados

Esse é o bug mais perigoso da implementação. O developer recebe `$userid` e executa delete global por usuário, ignorando o `approved_contextlist`.

Sempre trate a lista de contexts como boundary de autorização da operação.

O provider não decide ampliar a solicitação.

## 23.97 Exercício

Evolua `mod_reflection` para possuir uma tabela `reflection_entries`, editor de texto, anexos, preferência `mod_reflection_compactview` e integração opcional com um endpoint externo de análise.

Implemente `get_metadata()` declarando todos os campos pessoais da tabela, a preferência e a external location. Depois implemente `get_contexts_for_userid()` usando SQL que retorna contextos de módulo, `get_users_in_context()` e export completo com `writer`, incluindo timestamps transformados e files da entrada.

Implemente as três formas de deletion: todos os usuários de um context, um usuário nos contexts aprovados e vários usuários aprovados em um context. Em todos os casos escreva testes que provem que dados de outros contexts e de outros usuários não são removidos.

Adicione um teste em que duas pessoas possuem anexos na mesma atividade e confirme que excluir uma delas não apaga os files da outra. Adicione outro teste em que a integração externa está habilitada e confira se metadata declara corretamente os campos enviados.

Por fim, crie uma versão alternativa do plugin sem qualquer persistência de usuário, sem preferences, sem files e sem integração externa, e implemente `null_provider`. Explique por que a primeira versão jamais poderia utilizar `null_provider`, mesmo que removêssemos a coluna `userid` da tabela.

## 23.98 Fechando o capítulo

Privacy API não é uma formalidade isolada do restante da arquitetura. Ela revela se o plugin sabe quem é dono de cada dado, em qual contexto ele existe e quais subsistemas participam da persistência.

Quando o provider fica difícil de implementar, muitas vezes o problema não está na Privacy API, mas no modelo de dados. Uma tabela sem vínculo claro com context, payloads gigantes em logs, files sem itemid consistente e integrações externas sem identificador de correlação tornam privacy difícil porque já tornaram o sistema difícil de entender.

A melhor implementação começa antes de `provider.php`. Começa quando você decide guardar apenas o necessário, modela ownership, usa contextos corretamente e não duplica dados que já pertencem a subsistemas do Moodle. Depois disso, metadata, exportação e exclusão deixam de ser um remendo e passam a ser apenas outra visão coerente da mesma arquitetura.

## REFERÊNCIAS

MOODLE. Privacy API. Moodle Developer Resources. https://moodledev.io/docs/5.2/apis/subsystems/privacy. Acesso em 24 set. 2026.

MOODLE. Privacy API FAQ. Moodle Developer Resources. https://moodledev.io/docs/5.0/apis/subsystems/privacy/faq. Acesso em 24 set. 2026.

MOODLE. Privacy API utilities. Moodle Developer Resources. https://moodledev.io/docs/5.0/apis/subsystems/privacy/utils. Acesso em 24 set. 2026.

MOODLE. Core source: `core_privacy\local\metadata\collection`. https://github.com/moodle/moodle/blob/main/public/privacy/classes/local/metadata/collection.php. Acesso em 24 set. 2026.

MOODLE. Core source: `core_privacy\local\request\writer`. https://github.com/moodle/moodle/blob/main/public/privacy/classes/local/request/writer.php. Acesso em 24 set. 2026.

MOODLE. Core source: `mod_choice\privacy\provider`. https://github.com/moodle/moodle/blob/main/public/mod/choice/classes/privacy/provider.php. Acesso em 24 set. 2026.

MOODLE. Core source: `mod_forum\privacy\provider`. https://github.com/moodle/moodle/blob/main/public/mod/forum/classes/privacy/provider.php. Acesso em 24 set. 2026.
