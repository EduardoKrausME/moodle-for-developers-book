{% raw %}

# 5 BANCO DE DADOS E XMLDB

Banco de dados é uma das partes em que um plugin Moodle consegue parecer correto durante meses e ainda assim estar construído sobre decisões ruins. Você abre a tela, salva um registro, consulta outro, tudo responde rápido na instalação de desenvolvimento e a sensação é de que está resolvido. Depois o plugin chega a um ambiente com milhões de registros, PostgreSQL em vez de MariaDB, duas tarefas concorrentes e um upgrade vindo de uma versão antiga, então aparecem duplicidades, deadlocks, consultas lentas e aquela frase clássica de suporte, "aqui sempre funcionou".

O Moodle já resolveu boa parte desses problemas na camada de banco, mas para aproveitar isso precisamos aceitar uma regra simples. O banco do Moodle não é um MySQL com tabelas chamadas `mdl_*`. Ele é uma abstração que precisa funcionar em bancos diferentes, sobreviver a upgrades, respeitar convenções de schema e continuar previsível quando o volume cresce. Se você escreve pensando diretamente em MySQL, em pouco tempo passa a lutar contra a plataforma em vez de usar a plataforma.

Neste capítulo vamos trabalhar em duas camadas. A primeira é DML, usada para consultar e modificar dados, enquanto a segunda é DDL, usada para alterar estrutura. Em seguida entra XMLDB, que descreve o schema de maneira independente do banco, e finalmente upgrade, transações, Persistent API e os problemas de escala que aparecem quando uma consulta que parecia pequena deixa de ser pequena.

## 5.1 Moodle DML API

DML significa Data Manipulation Language e, no contexto do Moodle, representa a API usada para ler, inserir, atualizar e remover dados. Na prática é a camada que você utiliza quase todos os dias, porque qualquer plugin que persista estado acaba chamando `$DB->get_record()`, `$DB->insert_record()` ou algum método semelhante.

A documentação do Moodle recomenda usar exclusivamente a DML API para manipular o banco da própria instalação, e a razão vai muito além de preferência de estilo. A API conhece o driver configurado, transforma parâmetros conforme o banco, aplica prefixo de tabela, padroniza retorno, oferece paginação e fornece funções auxiliares para trechos de SQL que variam entre PostgreSQL, MySQL, MariaDB e SQL Server. Quando você ignora isso e abre uma conexão própria, perde justamente a camada que torna o plugin portável.

É importante entender o limite da abstração. DML não significa que você nunca escreverá SQL. Consultas simples são resolvidas pelos métodos de tabela, mas relatórios, agregações e joins frequentemente precisam de `get_records_sql()` ou recordsets SQL. O objetivo não é esconder SQL e sim escrever SQL compatível com a camada do Moodle, parametrizado e sem amarrar o plugin a um banco específico.

## 5.2 Moodle DDL API

DDL significa Data Definition Language e cuida da estrutura do banco, portanto estamos falando de criar tabela, adicionar campo, remover índice, renomear coluna e outras mudanças de schema. No Moodle você não deveria disparar `ALTER TABLE` manualmente dentro de um plugin, porque a DDL API existe justamente para transformar uma definição neutra na instrução correta para o banco utilizado.

A diferença entre DML e DDL precisa ficar muito clara. DML mexe nos dados existentes e aparece em páginas, tasks, serviços e regras de negócio, enquanto DDL mexe na estrutura e deve ficar restrita ao ciclo de instalação e upgrade. Se uma página acessada por usuário resolve verificar se uma coluna existe e criar a coluna na hora, o problema não é apenas desempenho. Você colocou evolução de schema dentro de uma requisição de aplicação, onde concorrência e permissões de banco podem produzir resultados bastante desagradáveis.

No código de upgrade, a DDL é acessada normalmente por `$DB->get_manager()`, que devolve o database manager adequado ao driver atual. É ele que recebe objetos XMLDB como `xmldb_table`, `xmldb_field`, `xmldb_key` e `xmldb_index` e executa a mudança de forma compatível.

## 5.3 A global `$DB`

```php
$DB é uma das globais que você mais encontrará em desenvolvimento Moodle. Ela é criada durante o bootstrap e contém uma instância de moodle_database adequada ao driver configurado em config.php. Isso significa que o mesmo código de plugin pode chamar $DB->get_record() em uma instalação PostgreSQL e em outra MariaDB sem saber qual implementação concreta está por baixo.
```

Quando precisar usar a global dentro de uma função ou método que não a recebe por dependência, declare explicitamente.

```php
global $DB;

$course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
```

Não transforme isso em licença para acessar `$DB` em qualquer lugar sem pensar. Classes de domínio e serviços ficam mais testáveis quando o acesso ao banco é concentrado em pontos previsíveis, principalmente em projetos maiores. Moodle historicamente expõe `$DB` como global e isso é normal, mas ainda podemos organizar responsabilidade em vez de espalhar query por template, formulário, callback e event observer.

Outro detalhe importante é que o nome de tabela passado aos métodos não recebe `mdl_`. Você usa `course`, `user`, `local_meuplugin_item` e deixa o Moodle trabalhar com o prefixo configurado na instalação.

## 5.4 Por que não usar `mysqli`, PDO próprio ou conexão externa com o banco do Moodle

A primeira resposta costuma ser "porque o Moodle já tem `$DB`", mas isso ainda é pouco. Se você abrir um `mysqli_connect()` próprio usando os dados de `config.php`, criou uma segunda conexão, amarrou o código ao ecossistema MySQL e passou a ignorar tratamento de prefixo, drivers, logging e convenções que o Moodle aplica na camada de banco. O código pode funcionar perfeitamente no seu servidor e quebrar no primeiro cliente que utiliza PostgreSQL.

PDO próprio sofre problema semelhante. PDO é uma boa tecnologia, mas não é a API do banco interno do Moodle. A discussão não é se PDO é melhor ou pior, e sim se o plugin deve contornar a infraestrutura que o sistema oferece. Para acessar uma base externa que pertence a outro sistema, pode existir justificativa para uma conexão separada ou API específica, porém isso é outra integração. Para o banco do Moodle, use `$DB`.

Há ainda um problema de transação. Uma conexão externa aberta pelo plugin não participa automaticamente das delegated transactions que o Moodle controla na conexão principal. Você pode acreditar que duas alterações são atômicas, lançar exceção e descobrir que metade foi revertida e metade ficou persistida porque estavam em conexões diferentes.

```php
5.5 $DB->get_record()
```

`get_record()` é a escolha natural quando você espera um único registro e consegue descrevê-lo por condições simples de igualdade. Um caso típico é carregar uma configuração própria pelo `id`, por `userid` e `courseid`, ou por outra combinação que deveria identificar no máximo uma linha.

```php
$record = $DB->get_record(
    'local_catalogsync_item',
    ['id' => $itemid],
    'id, courseid, externalid, status',
    MUST_EXIST,
);
```

Repare que eu não pedi `*` sem necessidade. Em muitos casos isso não fará diferença perceptível, mas selecionar apenas os campos usados deixa a intenção clara e pode reduzir transferência e memória quando existem colunas grandes. Não precisamos transformar isso em obsessão, porém também não existe motivo para carregar um campo `payload` de alguns megabytes em uma tela que só precisa de `id` e `status`.

O quarto argumento define a strictness. Se a ausência é comportamento normal, `IGNORE_MISSING` pode ser suficiente; se o registro precisa existir para a operação continuar, `MUST_EXIST` evita aquele padrão em que você recebe `false`, esquece de verificar e descobre o problema três linhas depois com um acesso a propriedade inexistente.

```php
5.6 $DB->get_records()
```

`get_records()` retorna vários registros de uma única tabela e funciona muito bem quando as condições são simples. Você pode filtrar, ordenar, escolher campos e aplicar limite sem escrever SQL completo.

```php
$items = $DB->get_records(
    'local_catalogsync_item',
    ['courseid' => $courseid, 'status' => 'pending'],
    'timecreated ASC',
    'id, externalid, timecreated',
    0,
    100,
);
```

Um detalhe que costuma passar despercebido é que o array retornado normalmente usa o primeiro campo selecionado como chave, e esse campo deve produzir valores únicos se você não quiser sobrescrever registros no resultado. Por isso é comum colocar `id` como primeiro campo. Se escrever uma consulta em que o primeiro campo se repete, o resultado pode ter menos elementos do que o SQL retornou e o bug parece inexplicável até você lembrar como a DML indexa os registros.

Também não use `get_records()` para carregar "tudo" de uma tabela enorme e depois filtrar em PHP. Se a condição pode ser resolvida no banco, deixe o banco resolver. Rede, memória e CPU do PHP são péssimos lugares para imitar um `WHERE` que o SGBD faria melhor.

```php
5.7 $DB->get_record_sql()
```

Quando você precisa de join, função agregada ou outra construção que não cabe nos métodos simples, `get_record_sql()` permite escrever SQL e ainda manter parâmetros e abstrações do Moodle. O contrato continua sendo o mesmo, você espera uma única linha.

```php
$sql = "SELECT c.id, c.fullname, COUNT(ue.id) AS enrolments
          FROM {course} c
          JOIN {enrol} e ON e.courseid = c.id
          JOIN {user_enrolments} ue ON ue.enrolid = e.id
         WHERE c.id = :courseid
      GROUP BY c.id, c.fullname";

$record = $DB->get_record_sql($sql, ['courseid' => $courseid], MUST_EXIST);
```

SQL livre não significa SQL livre das regras do Moodle. Tabelas continuam entre chaves, valores continuam parametrizados e funções específicas do banco devem ser evitadas ou substituídas pelos helpers da DML. Esse é o ponto em que muita gente diz "precisei usar SQL, então agora posso escrever como faria no phpMyAdmin". Não pode, se a intenção é manter compatibilidade.

Se a consulta puder retornar várias linhas, não use `get_record_sql()` esperando que ele simplesmente pegue a primeira. Ajuste o SQL ou use a API correta, porque retorno múltiplo onde o código esperava unicidade geralmente revela problema de modelagem ou condição incompleta.

```php
5.8 $DB->get_records_sql()
```

`get_records_sql()` é uma das funções mais usadas em relatórios e consultas mais elaboradas. Ela retorna um conjunto de registros carregado em memória e aceita `limitfrom` e `limitnum`, portanto pode ser usada com paginação.

```php
$sql = "SELECT i.id, i.courseid, i.status, i.timemodified
          FROM {local_catalogsync_item} i
         WHERE i.status = :status
      ORDER BY i.timemodified DESC, i.id DESC";

$records = $DB->get_records_sql(
    $sql,
    ['status' => 'pending'],
    $offset,
    $pagesize,
);
```

Observe a ordenação com um segundo critério estável. Se `timemodified` empatar para vários registros e você pagina apenas por ele, páginas consecutivas podem trocar itens de posição dependendo do plano de execução. Adicionar um campo único como `id` torna o resultado determinístico.

A armadilha é usar esse método para consulta gigantesca porque ele é conveniente. Se o resultado pode chegar a centenas de milhares de registros, carregar tudo em array cria pressão de memória desnecessária. É aí que entra recordset.

```php
5.9 $DB->get_recordset()
```

`get_recordset()` trabalha com condições simples de tabela como `get_records()`, mas não carrega todo o resultado de uma vez em um array. Ele devolve um `moodle_recordset` que você percorre gradualmente, mantendo consumo de memória muito menor.

```php
$rs = $DB->get_recordset(
    'local_catalogsync_item',
    ['status' => 'pending'],
    'id ASC',
    'id, courseid, externalid',
);

foreach ($rs as $record) {
    // Process one record at a time.
}

$rs->close();
```

A diferença parece pequena no código e enorme em produção. Dez mil objetos `stdClass` em memória podem ser aceitáveis em uma task, enquanto alguns milhões provavelmente não são. O recordset permite streaming de leitura pelo driver e deixa o PHP trabalhar em lotes lógicos menores.

Feche o recordset quando terminar, principalmente se sair do loop antes do fim. Não dependa do destrutor para liberar recursos em um processo longo de cron.

```php
5.10 $DB->get_recordset_sql()
```

`get_recordset_sql()` combina SQL livre com leitura incremental. É a ferramenta certa quando a consulta precisa de joins ou agregações, mas o conjunto retornado pode ser grande demais para um array.

```php
$sql = "SELECT i.id, i.courseid, c.fullname
          FROM {local_catalogsync_item} i
          JOIN {course} c ON c.id = i.courseid
         WHERE i.status = :status
      ORDER BY i.id";

$rs = $DB->get_recordset_sql($sql, ['status' => 'pending']);

try {
    foreach ($rs as $record) {
        // Process the record.
    }
} finally {
    $rs->close();
}
```

O `finally` é interessante em rotinas maiores porque garante fechamento mesmo se o processamento lançar exceção. Isso não é sempre necessário em scripts pequenos, mas deixa a intenção explícita em tasks que podem ficar vários minutos executando.

Recordset reduz memória, mas não torna uma query ruim em query boa. Se o SQL faz full scan de uma tabela enorme por falta de índice, você apenas vai sofrer de forma mais econômica em memória. Performance começa no plano de execução e no schema, não no tipo de retorno PHP.

## 5.11 Quando usar recordset

Use recordset quando o conjunto de dados pode crescer bastante e você consegue processar cada linha sem precisar manter todas simultaneamente. Exportação CSV, sincronização, recalculo de registros, limpeza de dados e tasks de manutenção são casos clássicos.

Não use recordset se a operação precisa voltar várias vezes ao mesmo conjunto, ordenar novamente em PHP ou correlacionar cada registro com todos os anteriores. Nesse cenário você pode acabar fazendo consultas repetidas ou criando estruturas auxiliares que anulam o ganho. Às vezes é melhor paginar explicitamente, usar uma tabela temporária suportada pela API adequada ou reformular a consulta.

Também tome cuidado com processamento demorado dentro do mesmo cursor. Alguns bancos e drivers mantêm recursos associados ao resultado, então um loop que faz uma chamada HTTP de trinta segundos para cada registro pode segurar o recordset aberto por horas. Em integrações externas, normalmente é melhor buscar IDs em lote, fechar a leitura e delegar o trabalho pesado para tasks menores.

```php
5.12 $DB->insert_record()
```

`insert_record()` recebe um objeto ou estrutura equivalente com os campos que serão inseridos e, normalmente, retorna o novo `id`. Você não informa o campo autoincremento quando quer que o banco o gere.

```php
$record = (object) [
    'courseid' => $courseid,
    'externalid' => $externalid,
    'status' => 'pending',
    'timecreated' => time(),
    'timemodified' => time(),
];

$record->id = $DB->insert_record('local_catalogsync_item', $record);
```

Não use o retorno como se todos os inserts do sistema obrigatoriamente tivessem ID numérico, porque existem tabelas especiais e operações de bulk insert em que o contrato pode variar. Para tabelas normais de plugin com `id` primário autoincremental, esse é o padrão esperado.

Validação de regra de negócio precisa acontecer antes. O banco garante tipos e constraints que foram declaradas, mas não sabe que um `externalid` deveria pertencer ao mesmo curso do usuário atual ou que determinado status não pode voltar de `completed` para `pending`.

```php
5.13 $DB->update_record()
```

`update_record()` atualiza um registro usando o campo `id` como identidade. O objeto precisa conter `id` e os campos que serão gravados.

```php
$record = (object) [
    'id' => $itemid,
    'status' => 'completed',
    'timemodified' => time(),
];

$DB->update_record('local_catalogsync_item', $record);
```

Isso permite atualização parcial e evita carregar o registro inteiro só para trocar dois campos. Ainda assim, quando a atualização depende do estado anterior, talvez seja necessário ler primeiro e validar transição. Não transforme `update_record()` em uma forma de ignorar regra de domínio.

Em cenários de concorrência, o padrão "leio, altero, salvo" pode sofrer lost update se duas execuções trabalham sobre o mesmo registro. Dependendo do caso, use locks, transação ou uma atualização condicional desenhada para o estado esperado. O capítulo de tasks vai aprofundar concorrência, mas banco de dados é onde ela se materializa.

```php
5.14 $DB->delete_records()
```

`delete_records()` remove linhas por condições simples. Ele é direto e perigoso exatamente pela mesma razão.

```php
$DB->delete_records('local_catalogsync_item', ['courseid' => $courseid]);
```

Antes de executar uma exclusão ampla, pense nas dependências. O Moodle não recomenda depender de cascade em foreign keys como substituto da lógica de aplicação, e arquivos da Files API, eventos de calendário, grades e outros dados relacionados frequentemente exigem limpeza através das APIs correspondentes. Apagar uma linha principal sem limpar o restante pode deixar lixo lógico que o banco não enxerga.

Quando a condição precisa de SQL mais complexo, existem outros métodos como `delete_records_select()`. O cuidado continua sendo parametrizar e deixar claro qual universo de dados será removido. Uma exclusão sem condição em código de plugin deveria chamar atenção em qualquer code review.

```php
5.15 $DB->set_field()
```

`set_field()` é útil quando você precisa alterar um único campo para registros que atendem condições simples. Em vez de montar objeto e chamar `update_record()`, você expressa diretamente a intenção.

```php
$DB->set_field(
    'local_catalogsync_item',
    'status',
    'cancelled',
    ['courseid' => $courseid, 'status' => 'pending'],
);
```

A vantagem é especialmente clara em atualizações em massa. Não faz sentido carregar mil registros em PHP apenas para trocar `status` de todos. O banco consegue realizar isso em uma única operação.

O cuidado é o mesmo de toda atualização em massa, side effects externos não acontecem automaticamente. Se mudar status deveria disparar evento, recalcular cache ou chamar outra API, `set_field()` não sabe disso. A função é de persistência, não de regra de negócio.

```php
5.16 $DB->count_records()
```

`count_records()` conta linhas que correspondem a condições simples e é melhor do que buscar os registros para depois usar `count()` em PHP.

```php
$total = $DB->count_records(
    'local_catalogsync_item',
    ['courseid' => $courseid, 'status' => 'pending'],
);
```

Parece óbvio, mas esse erro aparece bastante em telas de relatório. O desenvolvedor já precisava mostrar dez registros e também o total, então carrega todos para descobrir quantidade e depois corta com `array_slice()`. Isso funciona com duzentas linhas e vira desperdício com duzentas mil.

Para condições complexas existem variantes como `count_records_sql()` e `count_records_select()`. De novo, o objetivo é mandar ao banco exatamente o trabalho que ele foi projetado para fazer.

```php
5.17 $DB->record_exists()
```

Quando você só quer saber se existe pelo menos um registro, use `record_exists()` em vez de carregar uma linha inteira.

```php
$exists = $DB->record_exists('local_catalogsync_item', [
    'courseid' => $courseid,
    'externalid' => $externalid,
]);
```

A diferença parece pequena, mas comunica intenção e permite ao driver executar uma verificação adequada. Também evita aquela construção em que o desenvolvedor usa `get_record()` apenas para transformar o retorno em boolean.

Só não use `record_exists()` como garantia de unicidade em cenário concorrente. Fazer "se não existe, insere" em duas requisições simultâneas pode produzir duplicata se a regra não estiver protegida por índice único ou lock. A regra que precisa ser impossível de violar deve existir também no schema.

## 5.18 SQL parametrizado

Parametrização separa estrutura da consulta e valores. Em vez de concatenar dados dentro do SQL, você escreve placeholders e fornece os valores em array.

```php
$sql = "SELECT id, courseid, status
          FROM {local_catalogsync_item}
         WHERE courseid = :courseid
           AND status = :status";

$params = [
    'courseid' => $courseid,
    'status' => $status,
];

$records = $DB->get_records_sql($sql, $params);
```

Isso protege contra SQL Injection quando utilizado corretamente e também delega ao driver detalhes de quoting e tipo. Não é apenas segurança. Datas, strings, inteiros, Unicode e valores especiais deixam de depender de uma tentativa manual de montar sintaxe válida.

Parâmetro representa valor, não identificador SQL. Você não pode parametrizar nome de tabela, nome de coluna ou direção `ASC` e `DESC` da mesma forma. Quando essas partes são dinâmicas, precisam ser escolhidas a partir de allowlist controlada pelo servidor.

## 5.19 Named parameters

Named parameters usam nomes como `:courseid` e tornam consultas grandes muito mais legíveis. O array de parâmetros usa as mesmas chaves, sem os dois pontos.

```php
$sql = "SELECT id
          FROM {local_catalogsync_item}
         WHERE courseid = :courseid
           AND timemodified >= :since";

$params = [
    'courseid' => $courseid,
    'since' => $since,
];
```

Use nomes descritivos. `:p1`, `:p2` e `:p3` funcionam, mas eliminam boa parte da vantagem. Em consultas que repetem semanticamente o mesmo valor em mais de um ponto, não assuma que pode repetir o mesmo placeholder indefinidamente em todos os drivers. A forma mais segura em SQL complexo é usar nomes distintos quando o placeholder aparece em posições diferentes.

Named params também combinam bem com `get_in_or_equal()` quando você solicita `SQL_PARAMS_NAMED`, porque o Moodle gera nomes únicos para a lista.

## 5.20 Question marks

A DML também suporta parâmetros posicionais com `?`. Eles são úteis em consultas curtas, embora fiquem menos legíveis à medida que a quantidade cresce.

```php
$sql = "SELECT id
          FROM {local_catalogsync_item}
         WHERE courseid = ?
           AND status = ?";

$records = $DB->get_records_sql($sql, [$courseid, $status]);
```

Não misture named parameters e question marks na mesma consulta. Escolha um estilo por SQL. Em código de plugin eu normalmente prefiro named params porque a consulta continua entendível quando recebe novos filtros, mas existem casos simples em que positional não traz problema.

Se mudar a ordem do SQL com `?`, revise também a ordem do array. Esse é exatamente o tipo de erro que named params evita.

## 5.21 Por que concatenar valores em SQL é errado

Considere isto.

```php
$sql = "SELECT *
          FROM {user}
         WHERE email = '" . $email . "'";
```

O problema mais grave é SQL Injection, mas não é o único. Aspas, encoding e tipos passam a depender da concatenação manual, então até um valor legítimo com apóstrofo pode quebrar a consulta. Se alguém tentar "corrigir" aplicando `addslashes()`, apenas criou uma versão caseira e incompleta de um problema que o driver já sabe resolver.

Também não faça concatenação depois de `clean_param()` acreditando que a sanitização substitui parametrização. Limpeza de entrada e binding SQL resolvem problemas diferentes. `PARAM_TEXT` não é um escape SQL e não deve ser usado como um.

A exceção legítima são fragmentos estruturais controlados pela aplicação, como um nome de coluna escolhido de uma lista fixa. Mesmo nesses casos, o valor vindo do cliente nunca deve ser concatenado diretamente.

## 5.22 Prefixo `{tabela}`

Em SQL escrito manualmente, use chaves para referenciar tabelas Moodle.

```
SELECT u.id, u.firstname, u.lastname
  FROM {user} u
 WHERE u.deleted = 0
```

O driver substitui `{user}` pelo nome físico com o prefixo configurado, que pode ser `mdl_user`, `moodle_user` ou outro. Se você escreve `mdl_user` diretamente, o plugin deixa de funcionar em qualquer instalação com prefixo diferente.

Nos métodos como `get_record('user', ...)`, não usamos chaves porque o nome é passado separadamente. Chaves pertencem ao SQL textual.

Não use o prefixo para tentar acessar tabela de outra instalação compartilhando o mesmo servidor. Se precisa integrar dois Moodles, trate isso como integração entre sistemas, não como atalho por tabela.

## 5.23 SQL cross-DB

Código Moodle deve assumir que o banco pode ser diferente do seu ambiente de desenvolvimento. Isso muda desde sintaxe de concatenação até comportamento de comparação textual, funções de data e exigências de `GROUP BY`.

A estratégia é simples. Escreva SQL ANSI sempre que possível e use os helpers da DML quando uma operação varia entre bancos. Se precisar de uma função que só existe em MySQL, pare antes de colocá-la no plugin e procure se `$DB` oferece equivalente.

Teste em mais de um banco quando o plugin tem consultas complexas ou será distribuído amplamente. Uma pipeline com MariaDB e PostgreSQL encontra cedo uma categoria de erro que costuma aparecer somente no cliente mais inconveniente possível.

## 5.24 Diferenças relevantes entre PostgreSQL e MySQL/MariaDB

MySQL historicamente tolerou construções que PostgreSQL rejeita, principalmente em agrupamentos e conversões implícitas. Uma consulta com `GROUP BY` incompleto pode parecer normal em determinado modo do MySQL e falhar em PostgreSQL porque existem colunas selecionadas sem agregação nem agrupamento adequado.

Comparação de texto também merece atenção. Collation, case sensitivity e accent sensitivity podem produzir resultados diferentes, por isso o Moodle fornece helpers como `sql_like()` e `sql_equal()` para cenários em que o comportamento precisa ser controlado.

Outro ponto é conversão implícita. Não escreva SQL dependendo de uma string numérica ser tratada como inteiro ou de boolean ser representado exatamente como você imagina. Passe valores com tipos coerentes e deixe a camada do banco fazer o trabalho previsto.

Isso não quer dizer escrever o SQL mais limitado possível. PostgreSQL e MySQL têm recursos excelentes, mas um plugin Moodle genérico precisa escolher se quer portabilidade ou se existe uma justificativa explícita para restringir banco suportado, o que raramente faz sentido para plugins distribuídos.

```php
5.25 $DB->sql_like()
```

`sql_like()` gera a expressão adequada para comparação `LIKE` considerando diferenças entre bancos e opções de sensibilidade.

```php
$likesql = $DB->sql_like('u.email', ':email', false);

$sql = "SELECT u.id, u.email
          FROM {user} u
         WHERE {$likesql}";

$params = ['email' => '%' . $search . '%'];
```

Se o texto de busca vem do usuário, lembre que `%` e `_` têm significado dentro de LIKE. A DML possui mecanismos de escape que devem ser usados de acordo com a operação, em vez de montar padrão ingenuamente e aceitar curingas quando não eram desejados.

A opção de case sensitivity também merece decisão consciente. Não escolha `false` só porque "busca fica melhor" sem saber se o domínio realmente quer comparação case-insensitive.

```php
5.26 $DB->sql_concat()
```

Concatenar colunas de texto varia entre bancos. MySQL usa `CONCAT()`, PostgreSQL aceita operador `||` e outros bancos têm suas particularidades, então `$DB->sql_concat()` existe para produzir a expressão correta.

```php
$fullname = $DB->sql_concat('u.firstname', "' '", 'u.lastname');

$sql = "SELECT u.id, {$fullname} AS fullname
          FROM {user} u";
```

Antes de concatenar nome de usuário manualmente, lembre que Moodle possui APIs para fullname e preferências de exibição. O exemplo serve para mostrar o helper, não para sugerir reinventar uma API existente.

Isso vale para vários helpers SQL. Saber que a função existe não significa que devemos usá-la sempre; primeiro procure uma API de nível mais alto que já represente o conceito.

```php
5.27 $DB->sql_compare_text()
```

Alguns bancos tratam campos de texto longo de maneira diferente quando usados em comparação, ordenação ou agrupamento. `sql_compare_text()` permite obter uma expressão comparável de forma portável quando realmente precisamos operar sobre esse tipo de campo.

O melhor conselho aqui é não transformar TEXT em chave de relacionamento ou filtro frequente. Se uma coluna participa constantemente de busca exata, talvez o modelo de dados esteja pedindo um campo curto indexável separado. Helpers resolvem compatibilidade, mas não corrigem modelagem inadequada.

Também pense no custo. Comparar grandes campos de texto em massa pode impedir uso eficiente de índices e obrigar o banco a trabalhar muito mais do que uma chave curta faria.

```php
5.28 $DB->get_in_or_equal()
```

Construir `IN (...)` dinamicamente parece simples até a lista ter tamanho variável, ficar vazia ou precisar funcionar com placeholders corretos. `get_in_or_equal()` resolve essa montagem.

```php
$courseids = [10, 20, 30];
[$insql, $params] = $DB->get_in_or_equal(
    $courseids,
    SQL_PARAMS_NAMED,
    'courseid',
);

$sql = "SELECT id, fullname
          FROM {course}
         WHERE id {$insql}";

$courses = $DB->get_records_sql($sql, $params);
```

A função também consegue gerar condição de desigualdade quando necessário. Preste atenção ao comportamento com lista vazia e defina explicitamente o que deveria acontecer, porque "nenhum ID selecionado" pode significar retornar nada ou não aplicar filtro, e essas duas decisões são completamente diferentes.

Para listas enormes, `IN` também deixa de ser automaticamente a melhor opção. Pode ser necessário trabalhar em lotes ou rever estratégia.

## 5.29 NULL corretamente

`NULL` em SQL significa ausência de valor e não se comporta como string vazia, zero ou false. Em SQL textual, comparação correta é `IS NULL` ou `IS NOT NULL`, não `= NULL`.

```
SELECT id
  FROM {local_catalogsync_item}
 WHERE lasterror IS NULL
```

Ao modelar o schema, decida se ausência é realmente parte do domínio. Campos que deveriam sempre ter valor não precisam aceitar NULL "por garantia". Quanto mais estados inválidos o banco aceita, mais validação fica espalhada no PHP.

Também evite usar `NULL`, string vazia e zero para representar três versões acidentais da mesma coisa. Escolha uma semântica e mantenha-a consistente entre schema e código.

## 5.30 Ordenação

Resultado SQL sem `ORDER BY` não possui ordem garantida. Às vezes parece vir por `id` durante anos e, depois de um índice novo ou mudança de plano, aparece diferente. Se a ordem importa para comportamento ou interface, declare.

Em paginação, use ordenação determinística com critério de desempate. `ORDER BY timemodified DESC, id DESC` é muito mais seguro do que depender apenas de um timestamp que vários registros podem compartilhar.

Não monte o nome do campo diretamente a partir de `$_GET['sort']`. Crie um mapa de opções permitidas.

```php
$allowed = [
    'name' => 'c.fullname',
    'time' => 'c.timemodified',
];

$sortfield = $allowed[$requested] ?? 'c.fullname';
$sql .= " ORDER BY {$sortfield} ASC";
```

Parâmetros SQL não substituem identificadores, então allowlist é a proteção adequada nesse caso.

## 5.31 Paginação

Paginar não é carregar tudo e cortar array. Use `limitfrom` e `limitnum` nos métodos DML ou componentes como tablelib que já cuidam do fluxo de interface.

```php
$records = $DB->get_records_sql($sql, $params, $page * $pagesize, $pagesize);
```

Para exibir total de páginas, normalmente haverá uma segunda consulta de contagem. Isso é preferível a carregar todas as linhas só para saber quantas existem.

Em offsets muito altos, alguns bancos podem gastar bastante trabalho descartando linhas anteriores. Em relatórios extremamente grandes, paginação por cursor ou por chave pode ser mais eficiente, embora a interface Moodle tradicional muitas vezes use offset. O importante é medir quando o volume deixa de ser trivial.

## 5.32 `IGNORE_MISSING`

`IGNORE_MISSING` informa que ausência de registro é aceitável e normalmente faz os métodos de registro único retornarem `false` quando nada é encontrado.

```php
$record = $DB->get_record(
    'local_catalogsync_item',
    ['id' => $itemid],
    '*',
    IGNORE_MISSING,
);

if (!$record) {
    // Absence is expected here.
}
```

Use quando realmente existe um fluxo normal de "pode não existir", como procurar configuração opcional antes de criar. Se a ausência é erro de integridade, usar `IGNORE_MISSING` e depois espalhar checks pode esconder a origem do problema.

Escolher strictness é uma forma de documentar contrato. Faça isso conscientemente.

## 5.33 `MUST_EXIST`

`MUST_EXIST` é apropriado quando continuar sem o registro não faz sentido. A DML lança exceção e o erro ocorre no ponto em que a suposição foi violada.

```php
$user = $DB->get_record('user', ['id' => $userid], '*', MUST_EXIST);
```

Isso é melhor do que carregar com `IGNORE_MISSING`, esquecer de verificar e receber um erro genérico ao acessar `$user->id`. O stack trace aponta para a consulta e deixa claro que a entidade esperada não existia.

Não use `MUST_EXIST` para entradas controladas pelo usuário quando ausência deveria virar mensagem funcional. Nesse caso você pode querer detectar e tratar. A questão é separar erro esperado de invariantes do sistema.

## 5.34 XMLDB

XMLDB é a camada usada pelo Moodle para descrever estrutura de banco sem escrever DDL específico de um SGBD. O `install.xml` do plugin declara tabelas, campos, chaves e índices em um formato que o instalador consegue traduzir para PostgreSQL, MariaDB, MySQL e os demais bancos suportados.

O nome XMLDB faz algumas pessoas imaginarem que o Moodle usa XML como banco, o que não tem nada a ver. O XML é apenas uma representação do schema. Em runtime, os dados continuam no banco relacional configurado.

Essa definição neutra é também a razão pela qual você não deveria editar `install.xml` como um XML qualquer. O Moodle possui XMLDB Editor para manter o arquivo com estrutura e ordenação esperadas, além de gerar código PHP de upgrade compatível.

## 5.35 XMLDB Editor

O XMLDB Editor fica nas ferramentas de desenvolvimento da administração e permite criar ou carregar o `install.xml` de um componente, editar tabelas e gerar trechos de upgrade.

A prática correta para mudar schema é abrir o editor, alterar a definição, salvar o `install.xml` atualizado e usar a opção de geração de código PHP para a mudança correspondente. Isso reduz muito a chance de escrever manualmente um `xmldb_field` com atributos diferentes do schema final.

Existe uma tentação enorme de abrir `install.xml` no editor de texto, duplicar uma tag e ajustar nomes. Pode funcionar, mas você está assumindo responsabilidade por detalhes que a ferramenta já conhece. Em um livro de desenvolvimento Moodle, ensinar XMLDB sem ensinar o Editor seria ensinar metade do processo.

## 5.36 `install.xml`

`db/install.xml` representa o estado atual completo do schema do plugin para uma instalação nova. Ele não é um histórico de mudanças.

Se a versão atual possui tabela com cinco campos, `install.xml` precisa descrever os cinco, mesmo que dois tenham sido adicionados em upgrades anos depois. Uma instalação nova não executa todos os upgrades históricos para montar a tabela passo a passo; ela cria diretamente o schema atual a partir do XML.

Esse detalhe gera um dos erros clássicos de plugin. O desenvolvedor adiciona campo em `upgrade.php`, testa upgrade e esquece de atualizar `install.xml`. Sites antigos atualizam corretamente, mas uma instalação limpa recebe schema diferente. O inverso também acontece, o campo entra em `install.xml`, mas não existe upgrade, então instalações novas funcionam e antigas quebram.

A regra é simples. O resultado final de executar todos os upgrades sobre uma versão antiga precisa equivaler ao `install.xml` atual.

## 5.37 Campos

Cada campo em XMLDB precisa de nome, tipo, tamanho ou precisão quando aplicável, nulabilidade, sequência e valor padrão conforme o caso. Nome de campo deve ser estável porque renomear depois exige migração de schema e pode impactar APIs externas ou relatórios.

Não coloque o nome do plugin inteiro em cada coluna só porque a tabela já tem prefixo longo. Dentro de `local_catalogsync_item`, campos como `courseid`, `externalid`, `status`, `timecreated` e `timemodified` já são claros. Repetir `catalogsync_externalid` em todas as colunas só aumenta ruído.

Campos de referência ao core normalmente terminam com `id`, mas isso não cria foreign key automaticamente. É uma convenção semântica que ajuda código e schema a permanecer legíveis.

## 5.38 Tipos

XMLDB possui tipos abstratos que são convertidos para tipos reais do banco. Para identificadores e inteiros usamos definições inteiras, textos curtos ficam em CHAR, textos grandes em TEXT e valores numéricos com casas decimais precisam ser modelados com precisão adequada ao domínio.

Evite escolher tipo pela maior capacidade disponível. Se `status` tem meia dúzia de valores pequenos, não precisa ser TEXT. Campos menores podem ser indexados e comparados de forma mais eficiente, além de documentarem melhor o domínio.

Valores monetários merecem atenção especial. Não use `float` por comodidade para dinheiro quando erros de ponto flutuante são inaceitáveis. Modele com precisão decimal apropriada ou unidade inteira menor conforme a necessidade do sistema.

Datas no Moodle normalmente aparecem como Unix timestamp em campos inteiros, como `timecreated`, `timemodified`, `timestart` e `timeend`. Siga as convenções da API que você integra em vez de inventar formato textual de data dentro de cada plugin.

## 5.39 Keys

Keys descrevem relações estruturais importantes. A tabela típica possui primary key em `id`, e XMLDB também permite declarar unique e foreign keys.

A chave primária identifica inequivocamente cada linha. Em plugins Moodle, o padrão dominante é um `id` inteiro autoincremental. Mesmo que o domínio tenha uma chave natural como `externalid`, geralmente é útil manter `id` como primary key e criar unique index para a regra natural quando necessário.

Isso simplifica referências internas e segue o padrão das APIs Moodle, que trabalham extensamente com IDs numéricos.

## 5.40 Foreign keys

Foreign key declara que um campo referencia a chave de outra tabela. Em XMLDB isso ajuda a documentar o relacionamento e permite que a estrutura seja compreendida por ferramentas, mesmo quando o comportamento físico pode variar conforme as políticas do Moodle e do banco.

Não use foreign key como desculpa para deixar regra de exclusão na mão do banco. O Moodle possui APIs de alto nível para remover cursos, usuários, atividades e arquivos, porque excluir a linha central envolve muito mais do que apagar registros relacionados. Cascade SQL não sabe enviar evento, limpar cache ou remover arquivo da Files API.

Para tabelas próprias, a foreign key continua valiosa como documentação e integridade, mas o desenho de lifecycle precisa permanecer na aplicação.

## 5.41 Índices

Índice é uma estrutura auxiliar que permite ao banco localizar linhas sem percorrer toda a tabela. Ele pode melhorar dramaticamente filtros, joins e ordenações, mas não é gratuito. Cada insert e update em colunas indexadas também precisa atualizar o índice e ele ocupa espaço.

O erro de iniciante é cair em um dos extremos, nenhum índice além da primary key ou índice em quase todos os campos. O correto é olhar as consultas reais. Se a aplicação busca frequentemente `WHERE courseid = ? AND status = ?`, um índice coerente com esse padrão pode fazer sentido. Se um campo só aparece em uma tela administrativa executada duas vezes por ano, talvez não mereça custo permanente.

Índice também não salva consulta que aplica função na coluna de modo que o banco não consiga usar a estrutura eficientemente. Performance precisa ser verificada com plano de execução.

## 5.42 Unique indexes

Unique index não existe apenas para performance, ele expressa uma regra que não pode ser violada. Se um usuário só pode ter uma configuração por curso, um índice único em `(userid, courseid)` transforma essa regra em garantia de banco.

Isso é especialmente importante em concorrência. O código pode verificar `record_exists()` e, antes de inserir, outra requisição inserir a mesma combinação. Sem constraint, as duas passam. Com unique index, uma delas falha e você pode tratar o conflito corretamente.

Não use unique em campo que aceita múltiplas formas de ausência sem entender como cada banco trata NULL em índices únicos. Modele a regra de maneira que a intenção seja portável.

## 5.43 Índices compostos

Índice composto contém mais de uma coluna e a ordem importa. Um índice `(courseid, status)` pode atender bem consultas filtrando `courseid` sozinho e `courseid + status`, mas não necessariamente uma consulta que filtra apenas `status`.

Isso acontece porque o banco organiza a estrutura seguindo a sequência das colunas. Escolha a ordem com base nos filtros e cardinalidade reais, não em ordem alfabética.

Também não crie dois índices compostos quase iguais por reflexo. Verifique se um já cobre a consulta do outro. Índices redundantes aumentam custo de escrita e manutenção sem necessariamente melhorar leitura.

## 5.44 Como escolher índices

Comece pelas consultas importantes e pelo volume. Veja filtros, joins, ordenações e cardinalidade. Depois use `EXPLAIN` no banco suportado durante análise de performance para confirmar se o plano utiliza o índice esperado.

Se a tabela tem quinhentas linhas, discutir micro otimização de índice provavelmente custa mais do que a consulta. Se tem cinco milhões, o mesmo detalhe pode separar uma página de 100 ms de outra que trava worker por segundos.

Evite "índice preventivo" em todo campo porque talvez um dia alguém filtre por ele. Schema também é código e precisa de motivação. Quando uma consulta nova se tornar relevante, medimos e evoluímos.

Em plugins distribuídos, lembre que o plano pode variar entre PostgreSQL e MariaDB. Teste nos bancos que sua matriz promete suportar quando a performance for crítica.

## 5.45 `upgrade.php`

`db/upgrade.php` contém as transformações necessárias para levar uma instalação existente de versões antigas até a versão atual. Ele é histórico executável e, por isso, não deve ser reescrito como se fosse apenas código atual.

```php
function xmldb_local_catalogsync_upgrade(int $oldversion): bool {
    global $DB;

    $dbman = $DB->get_manager();

    if ($oldversion < 2026092301) {
        // Upgrade step.
        upgrade_plugin_savepoint(true, 2026092301, 'local', 'catalogsync');
    }

    return true;
}
```

Cada bloco representa um marco. Quando um site vindo de versão antiga atualiza, Moodle executa os passos ainda não aplicados em ordem. Isso significa que apagar um bloco antigo porque "ninguém mais usa" pode quebrar justamente o cliente que ficou dois anos sem atualizar.

No capítulo 29 vamos trabalhar políticas de compatibilidade e limpeza histórica, mas por enquanto trate `upgrade.php` como migração acumulativa.

## 5.46 `xmldb_*_upgrade()`

O nome da função de upgrade segue o componente. Para `local_catalogsync`, usamos `xmldb_local_catalogsync_upgrade()`. Outros tipos seguem o Frankenstyle correspondente.

Essa função recebe `$oldversion`, que representa a versão anteriormente registrada em `config_plugins`. Os blocos `if ($oldversion < X)` precisam ser independentes, não `elseif`, porque uma instalação muito antiga pode precisar passar por vários passos na mesma execução.

```
if ($oldversion < 2026092301) {
    // Step A.
    upgrade_plugin_savepoint(true, 2026092301, 'local', 'catalogsync');
}

if ($oldversion < 2026092302) {
    // Step B.
    upgrade_plugin_savepoint(true, 2026092302, 'local', 'catalogsync');
}
```

Se você usar `elseif`, o primeiro passo pode impedir o segundo na mesma atualização. Parece detalhe pequeno e é o tipo de detalhe que só aparece quando alguém pula versões.

## 5.47 Savepoints

Savepoint informa ao mecanismo de upgrade que um passo terminou com sucesso e registra a nova versão atingida. Para plugins usamos a função apropriada ao tipo, como `upgrade_plugin_savepoint()`.

O número do savepoint precisa corresponder ao marco de versão usado no bloco. Não coloque savepoint antes de terminar a alteração, porque uma falha posterior faria o Moodle acreditar que aquela etapa já foi concluída.

Ferramentas de validação conseguem encontrar vários erros de savepoint, e vale levar esses avisos a sério. Upgrade quebrado é um problema especialmente ruim porque pode deixar site indisponível no meio de uma janela de manutenção.

Também evite alterar número de um savepoint já lançado. Uma vez que release saiu, aquele número passou a fazer parte da história de atualização do plugin.

## 5.48 Mudança de schema

Para adicionar campo, índice ou tabela em versão existente, atualize primeiro o modelo no XMLDB Editor e gere o código de DDL para `upgrade.php`. O install.xml passa a representar o estado novo, enquanto o upgrade descreve como chegar até ele.

Um exemplo simplificado de campo novo seria criar `xmldb_table`, depois `xmldb_field`, testar se o campo ainda não existe e chamar `$dbman->add_field()`.

O teste de existência é importante para tornar o passo mais resistente em cenários de recuperação, embora não deva ser usado para esconder inconsistência aleatória. Se o schema chegou a um estado inesperado, precisamos entender por quê.

Mudanças destrutivas pedem cuidado extra. Remover coluna significa perder dados, então normalmente existe uma etapa anterior de migração, descontinuação e somente depois remoção, principalmente em plugins distribuídos.

## 5.49 Migração de dados

Nem todo upgrade é mudança de estrutura. Às vezes precisamos recalcular valores, preencher uma coluna nova ou converter representação antiga para nova. Isso é migração de dados e precisa ser escrita pensando em volume e tempo de indisponibilidade.

O pior padrão é buscar todos os registros com `get_records()`, montar objetos gigantes e atualizar um por um em uma instalação com milhões de linhas. Para migrações simples, uma operação SQL ou `set_field_select()` pode ser muito mais eficiente; para lógica complexa, use recordset e processe com cuidado.

Upgrade roda durante atualização e não é um bom lugar para chamadas externas, tarefas longas imprevisíveis ou dependência de serviços terceiros. Se a transformação puder ser adiada, considere marcar registros e concluir processamento em task após o site voltar, desde que o schema e o código sejam capazes de conviver com esse estado intermediário.

A compatibilidade durante migração precisa ser planejada. O novo código pode começar a executar imediatamente depois do upgrade, então não deixe dados em formato que ele não sabe interpretar.

## 5.50 `install.php`

`db/install.php` é executado somente na instalação inicial do plugin e permite realizar ações que não pertencem ao schema XML. Ele não substitui `install.xml`.

Pode servir para criar registros iniciais, configurar dados que dependem de APIs Moodle ou executar uma preparação que faça sentido apenas no primeiro install. Use com parcimônia, porque quanto mais lógica você coloca ali, mais precisa garantir que o mesmo estado final seja alcançado por upgrades em instalações antigas.

Se uma configuração padrão pode ser declarada em `settings.php` ou recuperada com default adequado, talvez não precise virar insert em `install.php`. Não crie estado persistido apenas para dizer algo que o código já sabe por padrão.

## 5.51 Diferença entre instalação nova e upgrade

Uma instalação nova usa o `install.xml` atual e depois executa o comportamento de instalação aplicável. Ela não reproduz a história inteira de `upgrade.php`.

Uma instalação existente já possui uma versão registrada e o Moodle executa apenas passos de upgrade posteriores a ela. Essa diferença é o motivo pelo qual precisamos testar os dois caminhos.

Imagine que adicionamos coluna `status`. Colocamos a coluna em `install.xml`, mas esquecemos `upgrade.php`. Instalação nova funciona. Site antigo não recebe campo. Se fizermos o contrário e só adicionarmos upgrade, site antigo funciona e instalação nova nasce sem a coluna.

CI e testes de instalação ajudam a detectar esse tipo de assimetria. O schema final precisa ser o mesmo independentemente do caminho usado para chegar à versão atual.

## 5.52 Delegated transactions

Moodle oferece delegated transactions por `$DB->start_delegated_transaction()`. Elas permitem agrupar alterações para que, se uma exceção ocorrer, o banco possa fazer rollback do conjunto.

```php
$transaction = $DB->start_delegated_transaction();

try {
    $orderid = $DB->insert_record('local_shop_order', $order);
    $DB->insert_records('local_shop_item', $items);

    $transaction->allow_commit();
} catch (Throwable $e) {
    $transaction->rollback($e);
}
```

Use transação para proteger consistência de alterações relacionadas, mas não como ferramenta de fluxo normal. A documentação do Moodle é explícita ao tratar rollback como proteção de emergência, não como um `if` sofisticado.

Também evite manter transação aberta durante chamadas HTTP, envio de mensagem ou qualquer operação externa lenta. Você pode segurar locks no banco enquanto espera um serviço que não participa do rollback.

## 5.53 Rollback

Rollback desfaz as mudanças da transação quando algo falha. Em Moodle, o padrão mais natural é deixar a exceção propagar ou chamar `rollback($e)` com a exceção capturada, porque a própria API precisa saber que a transação não pode ser commitada.

Não capture a exceção, faça rollback e depois continue como se nada tivesse acontecido se o estado esperado não foi alcançado. Isso transforma uma falha clara em dados ausentes mais adiante.

Rollback também não volta o mundo inteiro no tempo. Se durante a transação você enviou email, chamou webhook ou gravou arquivo fora de uma operação transacional compatível, esse side effect pode permanecer. É por isso que transações devem envolver principalmente estado de banco e que integrações externas precisam de desenho idempotente.

## 5.54 Transações aninhadas

As delegated transactions do Moodle permitem aninhamento lógico, mas o controle final pertence ao nível externo. Isso significa que uma camada interna pode trabalhar dentro de uma transação sem necessariamente ser dona do commit físico.

Se qualquer nível marcar rollback, a operação completa não poderá depois ser "salva" por uma camada externa. Já um `allow_commit()` interno não obriga o banco a commit imediatamente se existe uma transação externa aberta.

Esse comportamento é útil quando serviços compostos chamam operações menores que também precisam de proteção, mas não use aninhamento para esconder arquitetura confusa. Se ninguém sabe quem controla atomicidade, fica muito fácil manter locks além do necessário.

## 5.55 `\core\persistent`

`\core\persistent` oferece uma camada orientada a objeto sobre registros de tabela. Você define propriedades, validação e nome de tabela em uma classe e recebe operações como `create()`, `read()`, `save()` e `delete()`.

Uma classe simplificada pode parecer assim.

```
namespace local_catalogsync;

final class item extends \core\persistent {
    public const TABLE = 'local_catalogsync_item';

    protected static function define_properties(): array {
        return [
            'courseid' => [
                'type' => PARAM_INT,
            ],
            'externalid' => [
                'type' => PARAM_ALPHANUMEXT,
            ],
            'status' => [
                'type' => PARAM_ALPHANUMEXT,
                'default' => 'pending',
            ],
        ];
    }
}
```

Persistent pode centralizar validação e contrato de uma entidade simples, reduzindo repetição de CRUD. Ele não transforma Moodle em ORM completo e não elimina necessidade de entender DML ou SQL.

Consultas com joins, agregações, relatórios e operações em massa continuam pertencendo à DML. Persistent é uma ferramenta de modelo, não um substituto universal para banco.

## 5.56 Quando usar Persistent API e quando não usar

Use Persistent quando você possui uma entidade relativamente bem definida, ligada principalmente a uma tabela, com propriedades e regras de validação que se beneficiam de uma representação orientada a objeto. Configurações complexas, entidades administrativas e objetos de domínio simples podem ficar bastante claros assim.

Não use porque "classe é mais moderna que `$DB`". Se sua operação é atualizar cem mil registros, instanciar cem mil persistents apenas para chamar `save()` provavelmente adiciona overhead sem vantagem. Se o caso é relatório com quatro joins, Persistent não vai substituir SQL de forma elegante.

Também evite esconder consultas importantes dentro de getters mágicos até ninguém mais saber quando o banco é acessado. Objetos precisam deixar custo previsível.

A pergunta correta não é "Persistent ou `$DB`?" como se fossem concorrentes. Persistent usa a camada de banco e resolve um nível diferente do problema. Escolha onde ele melhora clareza de domínio.

## 5.57 Grandes volumes de dados

Código que trabalha com grande volume precisa ser desenhado antes de ficar grande. A tabela com mil registros de hoje pode ter cinquenta milhões em três anos se o plugin grava eventos, tentativas, progresso ou telemetria.

Evite carregar tudo, use recordsets ou paginação, selecione campos necessários, crie índices orientados pelas consultas e mova trabalho pesado para task. Também pense em retenção. Se dados históricos não possuem valor indefinidamente, uma política de limpeza pode fazer mais pela performance do que qualquer micro otimização de PHP.

Tasks longas precisam ser retomáveis. Processar tudo em uma única transação ou depender de um offset gigante torna falhas caras. Um padrão robusto guarda último ID processado ou usa status de fila, trabalha em lotes e pode reexecutar sem duplicar side effects.

Volume também muda sua forma de depurar. Não teste apenas com vinte registros artificiais. Gere massa razoável, rode `EXPLAIN`, meça memória e observe tempo de execução antes de declarar uma implementação escalável.

## 5.58 Evitando N+1

N+1 acontece quando você faz uma consulta para carregar N registros e, dentro do loop, dispara outra consulta para cada um. O código é aparentemente inocente.

```php
$courses = $DB->get_records('course', null, '', 'id, fullname');

foreach ($courses as $course) {
    $total = $DB->count_records('local_catalogsync_item', [
        'courseid' => $course->id,
    ]);
}
```

Com dez cursos são onze queries. Com cinco mil cursos são cinco mil e uma. O banco passa mais tempo recebendo pequenas consultas e fazendo round trips do que executando o trabalho real.

Muitas vezes isso pode virar uma consulta agrupada.

```
SELECT courseid, COUNT(*) AS total
  FROM {local_catalogsync_item}
 GROUP BY courseid
```

Depois mapeamos os totais em memória por `courseid`. Em outros casos o melhor é um join. O princípio é observar a fronteira do loop. Se existe `$DB` dentro de foreach sobre conjunto potencialmente grande, pare e verifique se a consulta pode ser antecipada ou agregada.

Nem todo acesso dentro de loop é automaticamente problema. Se o loop tem três itens por definição, talvez seja irrelevante. N+1 é uma questão de cardinalidade e custo, não uma proibição sintática.

## 5.59 Exercício - criar e evoluir o schema do plugin

O exercício deste capítulo será construir o schema de um plugin de sincronização de catálogo e depois evoluí-lo como aconteceria em produção. A primeira versão terá uma tabela `local_catalogsync_item` com `id`, `courseid`, `externalid`, `status`, `timecreated` e `timemodified`. Crie o `install.xml` usando XMLDB Editor, defina primary key, foreign key para curso quando apropriado e um unique index que impeça o mesmo `externalid` de aparecer duas vezes para o mesmo curso.

Depois implemente operações de leitura e escrita. Crie um serviço que insere item, busca por `id` com `MUST_EXIST`, verifica existência pela chave natural, lista pendentes com paginação e fornece um recordset para processamento em massa. Nenhuma consulta deve concatenar valor vindo de parâmetro, e SQL textual precisa utilizar `{tabela}`.

Na segunda versão, adicione `lasterror` e `attempts`. Atualize `install.xml` para representar o estado final e gere os passos equivalentes em `upgrade.php`, cada um com savepoint correto. Em seguida simule uma instalação antiga sem os campos e execute upgrade. Depois instale o plugin do zero em outra base e compare o schema final. Os dois precisam ser equivalentes.

Na terceira versão, crie uma migração que converta um status antigo `error` para `failed`, mas faça isso pensando em um milhão de registros. Não carregue tudo em memória se uma operação de banco resolve. Se a regra exigir lógica mais complexa, use recordset e avalie tempo de upgrade. Documente por que escolheu uma estratégia.

Por fim, crie uma página de relatório que mostre cursos e quantidade de itens por status. Primeiro implemente de propósito a versão N+1, meça número de queries e tempo, depois substitua por agregação. Adicione massa de dados suficiente para a diferença aparecer. A ideia é terminar o exercício não apenas com um schema funcionando, mas entendendo como o mesmo código se comporta quando sai do banco vazio de desenvolvimento e encontra um ambiente real.

Banco de dados no Moodle não é uma coleção de métodos para decorar. A DML protege portabilidade e padroniza acesso, a DDL e XMLDB tornam o schema independente do SGBD, `upgrade.php` preserva a história de instalações existentes e transações ajudam a proteger consistência quando várias alterações precisam caminhar juntas. Quando essas peças são usadas como uma arquitetura e não como receitas isoladas, o plugin deixa de funcionar apenas no seu ambiente e passa a ter condições de sobreviver a versões, bancos e volumes diferentes.

## Referências técnicas consultadas

* MOODLE. Data manipulation API. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.0/apis/core/dml. Acesso em 23 set. 2026.
* MOODLE. Data definition API. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.2/apis/core/dml/ddl. Acesso em 23 set. 2026.
* MOODLE. Transactions. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.1/apis/core/dml/delegated-transactions. Acesso em 23 set. 2026.
* MOODLE. Plugin Upgrades. Moodle Developer Resources. Disponível em https://moodledev.io/docs/5.0/guides/upgrade. Acesso em 23 set. 2026.
* MOODLE. XMLDB editor. Moodle Developer Resources. Disponível em https://moodledev.io/general/development/tools/xmldb. Acesso em 23 set. 2026.
* MOODLE. Common files. Moodle Developer Resources. Disponível em https://moodledev.io/docs/4.5/apis/commonfiles. Acesso em 23 set. 2026.
* MOODLE. core\\persistent Class Reference. Moodle PHP Documentation. Disponível em https://phpdoc.moodledev.io/main/df/d9f/classcore_1_1persistent.html. Acesso em 23 set. 2026.
* MOODLE. Moodle 5.2. Moodle Developer Resources. Disponível em https://moodledev.io/general/releases/5.2. Acesso em 23 set. 2026.

{% endraw %}
