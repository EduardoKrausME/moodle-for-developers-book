# SEGURANÇA OFENSIVA APLICADA

Até aqui nós tratamos segurança quase sempre pelo lado de quem está construindo o plugin corretamente. Usamos `required_param()`, capabilities, contexts, `require_login()`, `require_sesskey()`, DML com placeholders, Output API, File API e vários outros contratos do Moodle porque eles evitam classes inteiras de problema. Neste capítulo vamos inverter a perspectiva. Em vez de começar perguntando "qual API devo usar?", vamos olhar um plugin como quem está tentando quebrá-lo e perguntar onde o dado entra, em qual momento ele muda de confiança, quais decisões de autorização são tomadas, quais arquivos podem ser alcançados, quais endpoints existem e o que acontece quando alguém envia valores que a interface nunca enviaria.

Isso não significa transformar o desenvolvimento de Moodle em pentest genérico nem ensinar exploração contra instalações de terceiros. Todos os laboratórios daqui devem ser executados em ambiente de desenvolvimento controlado, com um plugin deliberadamente vulnerável e dados de teste. A ideia é aprender a encontrar falhas no próprio código antes que outra pessoa encontre em produção, porque uma revisão de segurança eficiente depende menos de decorar nomes como XSS, IDOR e SSRF e mais de acompanhar o fluxo de confiança de uma requisição até a operação que ela executa.

Nos exemplos vamos usar um plugin fictício chamado `local_vulnlab`. Ele terá páginas, AJAX, External Functions, arquivos, webhook, task e alguns endpoints propositadamente mal escritos. Em cada laboratório veremos primeiro o defeito, depois uma forma segura de comprovar que ele existe e, por fim, o patch. O objetivo do capítulo não é produzir exploits reutilizáveis, é treinar o olhar de revisão e transformar os problemas encontrados em correções objetivas.

## Segurança ofensiva aplicada ao desenvolvimento

Segurança ofensiva, neste contexto, significa revisar o plugin como se você não confiasse em nenhuma suposição feita pela interface. Se o formulário envia `courseid=42`, você tenta `courseid=43`. Se a tela esconde um botão para o aluno, você chama diretamente o endpoint. Se o AJAX espera `userid` do usuário atual, você troca o valor. Se uma página carrega um arquivo chamado `report.php`, você pergunta se consegue pedir `../../config.php` ou outro caminho inesperado.

A diferença para uma revisão puramente defensiva é que você não se contenta em ver `require_capability()` no arquivo e marcar o checklist como concluído. Você tenta descobrir se a capability está no contexto certo, se o objeto validado realmente pertence ao contexto, se existe outro endpoint que faz a mesma operação sem a checagem e se uma chamada concorrente consegue quebrar a regra.

## O laboratório precisa ser descartável

Não faça os testes deste capítulo em produção nem em ambiente contendo dados reais. Use uma instalação local ou uma instância de desenvolvimento isolada, com usuários, cursos e arquivos fictícios.

Uma estrutura simples pode ter:

```
Moodle de desenvolvimento
    |
    +-- admin de teste
    +-- professor de teste
    +-- aluno A
    +-- aluno B
    +-- curso A
    +-- curso B
    +-- local_vulnlab
```

Isso permite testar troca de identidade, contexto e propriedade sem risco de afetar usuários reais.

## O objetivo não é "achar CVE"

Uma boa revisão de plugin não começa tentando encaixar o código em uma sigla de vulnerabilidade. Começa entendendo a funcionalidade.

Se existe uma página que baixa relatórios, a pergunta inicial é "quem deveria conseguir baixar qual relatório?". Se existe um webhook, a pergunta é "como o servidor sabe quem enviou esta mensagem?". Se existe uma task que consome fila, a pergunta é "o que acontece se duas execuções pegarem o mesmo item?".

Depois que o problema é entendido, o nome técnico ajuda a comunicar e classificar, mas não deve substituir o raciocínio.

## Metodologia de revisão

Eu costumo dividir uma revisão manual em seis movimentos que se repetem durante o plugin inteiro. Primeiro descubro todas as entradas, depois todas as saídas, em seguida as decisões de autenticação e autorização, depois os pontos de acesso a arquivos, depois as integrações externas e, por fim, os fluxos assíncronos e concorrentes.

Isso cria uma lista concreta de lugares para revisar, em vez de abrir arquivos aleatoriamente procurando por algo que "pareça inseguro".

## Attack surface

Attack surface é o conjunto de lugares pelos quais alguém consegue influenciar o comportamento do plugin. Em Moodle isso inclui muito mais do que páginas PHP acessíveis pelo navegador.

Procure por:

```
*.php acessíveis por URL
externallib.php
db/services.php
classes/ajax/
pluginfile()
webhooks
callbacks de auth/enrol
cron e tasks
CLI
upload de arquivos
importações
parâmetros de URL
forms
JSON recebido
configurações administrativas
Events e callbacks consumidos
mensagens de fila
conteúdo vindo de APIs externas
```

Um plugin pequeno pode ter uma superfície maior do que parece se expõe várias dessas entradas.

## Faça um inventário antes de testar

Antes de tocar no código, monte uma tabela mental ou escrita com endpoint, contexto esperado, usuário autorizado, dados recebidos e efeito produzido.

Por exemplo:

```
/download.php
    contexto: course
    capability: local/vulnlab:download
    recebe: fileid
    efeito: entrega arquivo

/externallib.php :: delete_item()
    contexto: module
    capability: local/vulnlab:manage
    recebe: itemid
    efeito: apaga registro
```

Quando isso não pode ser explicado facilmente, já existe uma chance de o design estar misturando responsabilidades.

## Identifique entradas

Entrada não é apenas `$_POST`. Considere tudo que chega ao plugin vindo de fora da função atual.

Entradas típicas incluem:

```php
required_param() / optional_param()
Moodle forms
External Functions
AJAX
CLI options
HTTP headers
uploaded files
webhook payloads
settings
records vindos de APIs externas
Events recebidos
custom data de tasks
cookies
sessão
```

Algumas entradas já passaram por validação de tipo, mas isso não significa que passaram por validação de autorização ou propriedade.

## Tipo válido não significa objeto autorizado

`PARAM_INT` garante que `itemid` seja inteiro, mas não garante que o item pertença ao curso atual nem que o usuário possa acessá-lo.

Este código valida tipo:

```php
$itemid = required_param('itemid', PARAM_INT);
$item = $DB->get_record('local_vulnlab_item', ['id' => $itemid], '*', MUST_EXIST);
```

Ainda falta validar contexto, capability e vínculo entre `$item` e o objeto que o usuário deveria estar manipulando.

## Identifique saídas

Toda saída é um lugar em que dados podem escapar do nível de confiança esperado. Isso inclui HTML, JSON, arquivo, CSV, email, log, exception, mensagem, JavaScript e resposta de Web Service.

Uma revisão de XSS olha HTML, mas uma revisão de privacidade também olha CSV e logs. Uma revisão de segredo olha headers, exceptions e debugging. Não limite "output" ao que aparece visualmente no navegador.

## Identifique decisões de autorização

Procure por:

```php
require_login()
require_course_login()
require_capability()
has_capability()
validate_context()
is_enrolled()
groups_*()
ownership checks
```

Depois pergunte se cada decisão ocorre antes do dado sensível ser lido ou alterado e se ela está no contexto mais específico possível.

## Identifique arquivos expostos

Procure por qualquer operação que aceite filename, filepath, itemid ou ID de arquivo. Depois identifique se o plugin usa File API ou se acessa filesystem diretamente.

Sinais de alerta:

```php
file_get_contents($path)
readfile($path)
include($path)
require($path)
unlink($path)
move_uploaded_file(...)
fopen(...)
```

Essas funções não são vulnerabilidades por si só, mas merecem revisão quando o caminho depende de entrada externa.

## Identifique endpoints

Faça busca por arquivos PHP que não sejam apenas classes, por `db/services.php`, métodos External, callbacks AJAX, `pluginfile()` e rotas próprias.

É comum corrigir a página principal e esquecer um endpoint secundário que chama a mesma operação sem os mesmos controles.

## Revisão orientada a fluxo

Depois do inventário, escolha uma funcionalidade e acompanhe o dado até o fim. Por exemplo, "apagar relatório".

```php
request
 -> required_param('id')
 -> load record
 -> resolve context
 -> require_login
 -> require_capability
 -> require_sesskey
 -> delete
 -> event
 -> redirect
```

Se a sequência estiver invertida ou faltar uma etapa, você encontrou um ponto de revisão concreto.

## Laboratório de SQL Injection

Considere este código vulnerável:

```php
$search = optional_param('search', '', PARAM_RAW);

$sql = "SELECT *
          FROM {local_vulnlab_item}
         WHERE name LIKE '%{$search}%'";

$records = $DB->get_records_sql($sql);
```

O problema não é `PARAM_RAW` sozinho. O problema é concatenar dado controlável dentro do SQL.

## Como comprovar SQL Injection com segurança

No laboratório, não tente extrair dados reais nem criar payload sofisticado. Basta usar uma entrada contendo aspas ou metacaracteres e observar se a consulta quebra ou muda de comportamento.

Um teste defensivo ainda melhor é escrever PHPUnit garantindo que valores contendo aspas sejam tratados como texto literal e não mudem a estrutura da consulta.

## Patch de SQL Injection

Use placeholders:

```php
$search = optional_param('search', '', PARAM_RAW_TRIMMED);

$sql = "SELECT *
          FROM {local_vulnlab_item}
         WHERE " . $DB->sql_like('name', ':search', false);

$params = [
    'search' => '%' . $DB->sql_like_escape($search) . '%',
];

$records = $DB->get_records_sql($sql, $params);
```

A regra prática continua simples: valores entram como parâmetros, não como fragmentos de SQL.

## Não tente corrigir SQL Injection com `addslashes()`

Escapar aspas manualmente não é substituto de bound parameters. Além de depender do banco, você começa a manter duas linguagens ao mesmo tempo e aumenta a chance de uma condição futura concatenar outro valor sem tratamento.

DML do Moodle já existe para resolver isso de forma portável.

## Stored XSS

Stored XSS acontece quando conteúdo malicioso é persistido e executado mais tarde para outro usuário.

Código vulnerável:

```php
$record->title = required_param('title', PARAM_RAW);
$DB->insert_record('local_vulnlab_item', $record);

// Em outra página.
echo $record->title;
```

A gravação não precisa necessariamente remover todos os caracteres especiais, mas a saída precisa respeitar o tipo de conteúdo.

## Como testar Stored XSS

Em laboratório, salve conteúdo que contenha marcação HTML inofensiva que permita perceber se o browser interpretou ou exibiu literalmente. O objetivo é comprovar que a saída está sem escaping, não executar ação contra terceiros.

Depois teste a mesma entrada nos diferentes lugares em que o valor aparece, porque é comum a lista escapar corretamente e a página de detalhes não escapar.

## Patch de Stored XSS

Se `title` é texto simples:

```php
echo s($record->title);
```

Ou em Mustache:

```mustache
<h3>{{title}}</h3>
Mustache faz escaping por padrão. Não troque para {{{title}}} sem necessidade real.
```

## `format_string()` não é `s()` com outro nome

Use `format_string()` quando o campo é um label que pode ter filtros e conteúdo mínimo esperado pelo Moodle, como nomes de curso ou atividade.

Para texto simples arbitrário, `s()` ou escaping natural do Mustache é mais direto. Para HTML rico, use `format_text()` com o formato e contexto corretos.

## Reflected XSS

Reflected XSS não precisa persistir no banco. A entrada volta imediatamente na resposta.

```php
$q = optional_param('q', '', PARAM_RAW);
echo '<p>Busca por: ' . $q . '</p>';
```

O patch é o mesmo princípio:

```php
echo html_writer::tag('p', 'Busca por: ' . s($q));
```

Ou, melhor ainda, mande o valor para template e deixe o escaping padrão cuidar da saída.

## XSS em JavaScript

Um erro comum é escapar HTML e depois inserir o mesmo valor dentro de JavaScript inline:

```html
echo '<script>window.itemname = "' . $name . '";</script>';
```

O contexto mudou, então o escaping anterior não serve. Evite JavaScript inline e passe dados usando as APIs próprias do Moodle ou inicialização de módulos JS com dados serializados corretamente.

## Triple Mustache é um ponto de revisão

Toda ocorrência de:

```mustache
{{{html}}}
```

merece pergunta imediata: quem produziu esse HTML e por que ele já é seguro?

Às vezes o valor veio de `format_text()` e triple Mustache é correto. Outras vezes alguém recebeu `PARAM_RAW` e decidiu que "precisa renderizar HTML". A diferença é enorme.

## CSRF

Cross-Site Request Forgery acontece quando o navegador autenticado do usuário é induzido a executar uma ação que ele não pretendia.

Código vulnerável:

```php
$id = required_param('delete', PARAM_INT);
require_login();
require_capability('local/vulnlab:manage', context_system::instance());
$DB->delete_records('local_vulnlab_item', ['id' => $id]);
```

O usuário pode estar autenticado e autorizado, mas a intenção daquela requisição não foi comprovada.

## Patch de CSRF

Para ação de escrita iniciada pela interface, use POST quando apropriado e valide sesskey:

```php
$id = required_param('delete', PARAM_INT);
require_login();
$context = context_system::instance();
require_capability('local/vulnlab:manage', $context);
require_sesskey();

$DB->delete_records('local_vulnlab_item', ['id' => $id]);
```

A ordem pode variar conforme o fluxo, mas a ação não deve acontecer sem a validação necessária.

## `sesskey` não substitui capability

Se um aluno autenticado consegue obter o próprio `sesskey`, então uma página que verifica somente `require_sesskey()` continua vulnerável a autorização indevida.

Sesskey prova intenção dentro da sessão. Capability prova permissão. São controles diferentes.

## GET que altera estado

Uma URL como:

```
/local/vulnlab/delete.php?id=12&sesskey=...
```

pode existir em fluxos antigos, mas para novas operações relevantes prefira POST. GET deve ser usado para leitura sempre que possível, porque URLs vazam para histórico, logs, compartilhamento e referrer com muito mais facilidade.

## IDOR

IDOR aparece quando o servidor confia no identificador recebido sem verificar se o usuário pode acessar aquele objeto.

```php
$reportid = required_param('reportid', PARAM_INT);
$report = $DB->get_record('local_vulnlab_report', ['id' => $reportid], '*', MUST_EXIST);

require_login();
echo $report->content;
```

Trocar `reportid` pode entregar relatório de outro curso ou usuário.

## Patch de IDOR

Carregue o objeto, derive seu contexto real e valide acesso nesse contexto:

```php
$reportid = required_param('reportid', PARAM_INT);
$report = $DB->get_record('local_vulnlab_report', ['id' => $reportid], '*', MUST_EXIST);

$context = context_course::instance($report->courseid);
require_login(get_course($report->courseid));
require_capability('local/vulnlab:viewreport', $context);
```

Se o relatório pertence a um usuário específico, ainda pode ser necessário validar ownership.

## Capability bypass

Capability bypass acontece quando existe uma rota alternativa que chega à operação sem a mesma checagem.

Por exemplo, `view.php` verifica `local/vulnlab:manage`, mas `ajax.php` chama a mesma classe diretamente sem verificar capability.

A correção não é duplicar cinco `require_capability()` aleatórios. Coloque a regra de autorização em uma camada que todas as entradas obrigatoriamente atravessam ou garanta que cada boundary valide explicitamente antes de chamar a lógica interna.

## Context confusion

Context confusion aparece quando a capability é correta, mas verificada no contexto errado.

```php
$context = context_system::instance();
require_capability('local/vulnlab:manageitems', $context);
```

Se a operação altera um item pertencente ao curso 42, o contexto de sistema pode tornar a regra mais ampla do que deveria.

## Patch de context confusion

Derive o contexto do objeto:

```php
$item = $DB->get_record('local_vulnlab_item', ['id' => $itemid], '*', MUST_EXIST);
$context = context_course::instance($item->courseid);
require_capability('local/vulnlab:manageitems', $context);
```

Não aceite `contextid` do cliente e use esse valor como prova de onde o objeto vive.

## Manipulação de `contextid`

Código inseguro:

```php
$contextid = required_param('contextid', PARAM_INT);
$context = context::instance_by_id($contextid);
require_capability('local/vulnlab:manage', $context);

$itemid = required_param('itemid', PARAM_INT);
$DB->delete_records('local_vulnlab_item', ['id' => $itemid]);
```

O usuário pode enviar um contexto em que possui capability e um item pertencente a outro contexto.

## Derive contexto, não aceite como verdade

Quando existe um objeto primário, carregue o objeto e derive o contexto dele. `contextid` pode até ser recebido para otimização ou roteamento, mas precisa ser comparado com a relação real do objeto antes de qualquer autorização.

Esse padrão vale para `courseid`, `cmid`, `userid`, `groupid` e outros IDs que parecem inofensivos.

## Manipulação de `userid`

Um endpoint que atualiza preferência do usuário pode fazer:

```php
$userid = required_param('userid', PARAM_INT);
$value = required_param('value', PARAM_BOOL);
set_user_preference('vulnlab_option', $value, $userid);
```

Se qualquer usuário autenticado chama isso, ele pode alterar preferência de outra pessoa.

## Patch de `userid`

Se a ação é sempre sobre o usuário atual, nem aceite o parâmetro:

```php
global $USER;
$value = required_param('value', PARAM_BOOL);
set_user_preference('vulnlab_option', $value, $USER->id);
```

Se administradores podem agir sobre terceiros, modele a capability e o contexto explicitamente.

## Manipulação de `courseid`

Receber `courseid` e chamar `require_login($course)` é bom, mas ainda é preciso verificar se os objetos manipulados pertencem ao mesmo curso.

Um erro comum é carregar `courseid=10`, passar toda a autorização no curso 10 e depois atualizar `itemid=900` que pertence ao curso 11.

Valide a relação entre os IDs antes da mutação.

## LFI

Local File Inclusion acontece quando entrada externa influencia diretamente um `include` ou `require`.

Exemplo deliberadamente vulnerável:

```php
$page = required_param('page', PARAM_RAW);
require(__DIR__ . '/pages/' . $page . '.php');
```

Mesmo que o desenvolvedor espere `page=dashboard`, o servidor não pode depender dessa expectativa.

## Patch de LFI com allowlist

Quando realmente existe um conjunto finito de páginas, mapeie valores lógicos para arquivos fixos:

```php
$page = required_param('page', PARAM_ALPHA);

$allowed = [
    'dashboard' => __DIR__ . '/pages/dashboard.php',
    'summary' => __DIR__ . '/pages/summary.php',
];

if (!isset($allowed[$page])) {
    throw new moodle_exception('invalidpage', 'local_vulnlab');
}

require($allowed[$page]);
```

Melhor ainda, organize o comportamento em classes e roteamento interno sem includes dinâmicos.

## `basename()` não resolve todo problema de include

Aplicar `basename()` pode reduzir alguns caminhos, mas não responde se aquele arquivo deveria ser carregável, se a extensão é permitida e se um arquivo inesperado foi colocado no diretório.

Para conjuntos finitos, allowlist é mais forte e mais fácil de revisar.

## Path traversal

Path traversal acontece quando um usuário consegue sair do diretório esperado usando componentes de caminho.

```php
$file = required_param('file', PARAM_RAW);
$path = $CFG->dataroot . '/local_vulnlab/' . $file;
readfile($path);
```

O erro fundamental é expor caminho físico como parte da API.

## Patch de path traversal

No Moodle, a resposta normalmente é não trabalhar com caminho físico de `moodledata`. Use File API e identifique arquivos por contexto, component, filearea, itemid, filepath e filename.

Quando um recurso externo ao File API realmente precisa de filesystem, use identificadores controlados e resolva o caminho no servidor sem aceitar segmentos arbitrários do cliente.

## File disclosure

File disclosure não exige traversal. Um plugin pode usar File API corretamente e ainda entregar um arquivo privado para a pessoa errada.

Exemplo:

```php
$fileid = required_param('fileid', PARAM_INT);
$file = get_file_storage()->get_file_by_id($fileid);

send_stored_file($file);
```

O arquivo existe, mas não houve qualquer autorização.

## Patch de file disclosure

Antes de servir, derive o contexto e valide a relação:

```php
$file = get_file_storage()->get_file_by_id($fileid);
if (!$file) {
    send_file_not_found();
}

$context = context::instance_by_id($file->get_contextid());
require_login();
require_capability('local/vulnlab:viewfiles', $context);
```

Dependendo da filearea, valide também itemid e ownership do registro associado.

## `pluginfile()` vulnerável

Um callback vulnerável costuma parecer assim:

```php
function local_vulnlab_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    $fs = get_file_storage();
    $filename = array_pop($args);
    $filepath = '/' . implode('/', $args) . '/';

    $file = $fs->get_file(
        $context->id,
        'local_vulnlab',
        $filearea,
        0,
        $filepath,
        $filename
    );

    send_stored_file($file);
}
```

Ele confia em contexto, filearea e autorização sem qualquer verificação.

## Patch de `pluginfile()`

Valide o contexto esperado, login, capability, filearea e itemid antes de localizar o arquivo.

```php
if ($context->contextlevel !== CONTEXT_COURSE) {
    return false;
}

require_login($course);
require_capability('local/vulnlab:viewfiles', $context);

if ($filearea !== 'reports') {
    return false;
}
```

Depois resolva o registro relacionado e confirme que o `itemid` realmente pertence àquele contexto.

## Upload inseguro

Upload inseguro não é apenas aceitar `.php`. Pode envolver tamanho ilimitado, extensão inesperada, conteúdo ativo, ownership incorreto, armazenamento em diretório público ou servir o arquivo inline quando deveria ser download.

No Moodle, use Files API e os controles dos componentes de formulário, mas ainda defina `accepted_types`, tamanho e regra de acesso coerentes.

## Não confie apenas na extensão

`document.pdf` não prova que o conteúdo é um PDF válido, e `image.jpg` pode carregar conteúdo inesperado. Dependendo da funcionalidade, MIME detection e processamento adicional podem ser necessários.

Não tente construir antivírus caseiro. Defina o que o recurso realmente precisa aceitar e restrinja o restante.

## SVG merece atenção

SVG é um formato ativo e pode carregar recursos e comportamentos que outros formatos de imagem não possuem. Se usuários não confiáveis podem enviar arquivos que depois serão exibidos inline, avalie cuidadosamente se SVG deve ser aceito.

O princípio da documentação de segurança do Moodle continua válido: conteúdo enviado por usuários não confiáveis precisa ser servido de maneira que não ganhe execução inesperada no domínio da aplicação.

## Endpoint AJAX inseguro

Um endpoint AJAX pode parecer "interno" porque somente o JavaScript do plugin conhece a URL, mas isso não cria proteção.

Código vulnerável:

```php
require('../../config.php');

$id = required_param('id', PARAM_INT);
$value = required_param('value', PARAM_TEXT);

$DB->set_field('local_vulnlab_item', 'value', $value, ['id' => $id]);

echo json_encode(['ok' => true]);
```

Qualquer pessoa que descubra a URL pode chamá-la.

## Patch de AJAX tradicional

A página precisa ter os mesmos controles de qualquer endpoint de escrita:

```php
require_login();
require_sesskey();

$item = $DB->get_record('local_vulnlab_item', ['id' => $id], '*', MUST_EXIST);
$context = context_course::instance($item->courseid);
require_capability('local/vulnlab:manageitems', $context);
```

Depois retorne JSON pelo mecanismo apropriado e não exponha detalhes internos de exceptions.

## External Function insegura

Uma função externa vulnerável pode receber IDs e alterar dados sem validar contexto e capability:

```php
public static function update_item($itemid, $value) {
    global $DB;

    $DB->set_field('local_vulnlab_item', 'value', $value, ['id' => $itemid]);
    return ['status' => true];
}
```

A assinatura por si só não protege nada.

## Patch de External Function

No Moodle 3.5 o fluxo correto começa em `externallib.php`, com a declaração de parâmetros, depois validação de contexto e capability:

```php
public static function update_item_parameters() {
    return new external_function_parameters([
        'itemid' => new external_value(PARAM_INT, 'Item ID'),
        'value' => new external_value(PARAM_TEXT, 'New value'),
    ]);
}

public static function update_item($itemid, $value) {
    global $DB;

    $params = self::validate_parameters(self::update_item_parameters(), [
        'itemid' => $itemid,
        'value' => $value,
    ]);

    $item = $DB->get_record('local_vulnlab_item', ['id' => $params['itemid']], '*', MUST_EXIST);
    $context = context_course::instance($item->courseid);
    self::validate_context($context);
    require_capability('local/vulnlab:manageitems', $context);

    $DB->set_field('local_vulnlab_item', 'value', $params['value'], ['id' => $item->id]);
    return ['status' => true];
}
```

`db/services.php` apenas publica a função; autorização continua dentro dela.

## `db/services.php` não protege a função

A capability declarada em `db/services.php` ajuda na configuração e documentação do serviço, mas não substitui a verificação dentro de `execute()`.

O endpoint continua precisando validar contexto e capability na execução real.

## Sesskey ausente em ação administrativa

Páginas administrativas frequentemente recebem atenção demais em capability e pouca em CSRF, porque o desenvolvedor pensa "só admin acessa".

Na verdade isso aumenta o impacto de um CSRF. Um link externo capaz de induzir um administrador autenticado a excluir dados pode ser muito mais grave do que a mesma ação em uma conta comum.

## Capability no contexto errado

Um patch que adiciona `require_capability()` pode continuar vulnerável se escolher contexto amplo.

```php
require_capability(
    'local/vulnlab:manageitems',
    context_system::instance()
);
```

Se a capability foi desenhada para curso, o correto é validar o curso do objeto. Segurança não é presença de uma função, é correspondência entre decisão e recurso protegido.

## SSRF

Server-Side Request Forgery aparece quando o servidor faz requisição para uma URL controlada pelo usuário ou por uma configuração não confiável.

```php
$url = required_param('url', PARAM_URL);
$curl = new curl();
$content = $curl->get($url);
```

`PARAM_URL` valida formato de URL, mas não prova que o destino é permitido.

## O risco de SSRF no Moodle

O servidor Moodle pode alcançar redes que o navegador do usuário não alcança, como hosts internos, metadata services, painéis administrativos e serviços protegidos por firewall.

Por isso "o servidor só está fazendo GET" não é argumento de segurança.

## Patch de SSRF com destinos controlados

Quando a integração conhece os hosts permitidos, use allowlist de hostname e esquema:

```php
$parts = parse_url($url);

$allowedhosts = [
    'api.example.edu',
    'files.example.edu',
];

if (($parts['scheme'] ?? '') !== 'https'
        || !in_array($parts['host'] ?? '', $allowedhosts, true)) {
    throw new moodle_exception('invaliddestination', 'local_vulnlab');
}
```

Integrações abertas precisam de defesa mais completa, inclusive contra resolução DNS para redes internas.

## Redirect pode reabrir SSRF

Mesmo que o hostname inicial esteja permitido, o servidor remoto pode responder com redirect para outro destino. Se a biblioteca segue redirects automaticamente, a allowlist inicial pode ser contornada.

Revise comportamento de redirects e valide o destino efetivo conforme a necessidade da integração.

## Webhook sem validação

Webhook vulnerável:

```php
$payload = file_get_contents('php://input');
$data = json_decode($payload);

process_payment($data->orderid);
```

Qualquer pessoa capaz de alcançar a URL pode fabricar o payload.

## Assinatura de webhook

O endpoint precisa validar autenticidade conforme o protocolo do provedor, normalmente com assinatura HMAC, secret compartilhado ou assinatura assimétrica.

Uma verificação genérica pode seguir:

```php
$received = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $received)) {
    throw new moodle_exception('invalidsignature', 'local_vulnlab');
}
```

Em código real siga exatamente o algoritmo, canonicalização, timestamp e headers definidos pelo provedor.

## Replay de webhook

Assinatura válida não impede replay se a mesma mensagem puder ser enviada várias vezes e produzir efeito repetido.

Use identificador único de evento ou transação e torne o processamento idempotente. Se o provedor oferece timestamp, valide janela temporal conforme o contrato.

## Exposição de token

Tokens aparecem em lugares inesperados: query string, exception, log, screenshot, `var_dump`, payload de debugging ou retorno JSON.

Evite URLs como:

```
/callback.php?token=super-secret-token
```

quando o protocolo permite header ou corpo, porque query string costuma ser registrada em vários níveis da infraestrutura.

## Não logue o request inteiro

Durante debugging é tentador fazer:

```
error_log(json_encode($_SERVER));
```

Isso pode incluir Authorization, cookies, tokens e outros segredos.

Registre somente campos necessários, com redaction explícita para qualquer credencial.

## Race condition

Race condition aparece quando duas requisições corretas individualmente produzem resultado incorreto quando executadas ao mesmo tempo.

Exemplo:

```php
if (!$DB->record_exists('local_vulnlab_claim', ['itemid' => $itemid])) {
    $DB->insert_record('local_vulnlab_claim', [
        'itemid' => $itemid,
        'userid' => $USER->id,
    ]);
}
```

Duas requisições podem passar pelo `record_exists()` antes de qualquer insert.

## Corrigindo race condition

Dependendo do problema, use unique index, transação, Lock API ou combinação desses mecanismos.

Para exclusividade lógica simples, uma constraint de banco costuma ser a última linha de defesa mais confiável. Para fluxo maior que envolve várias operações, lock pode ser necessário.

## Lock sem timeout vira outro problema

Não use lock infinito. Defina timeout coerente, trate falha em adquirir e libere em `finally` quando necessário.

Uma solução de concorrência que trava todo o cron por horas apenas trocou um bug por outro.

## Task duplicada

Adhoc Tasks podem ser enfileiradas duas vezes por retries, chamadas concorrentes ou lógica de aplicação.

Se executar duas vezes causa cobrança duplicada, mensagem duplicada ou alteração destrutiva, o problema está no design da operação, não apenas no scheduler.

## Idempotência em task

Use uma chave de negócio e registre estado de processamento:

```
external_event_id = evt_9348
status = processed
```

Na execução, se o evento já foi concluído, termine sem repetir o efeito.

Não use apenas o ID da adhoc task como deduplicação, porque uma nova task pode representar o mesmo evento externo.

## Download sem autorização

Uma página pode proteger a tela que lista documentos e esquecer o download direto.

```php
$id = required_param('id', PARAM_INT);
$file = repository::get_file($id);
send_file($file->path, $file->name);
```

A URL do download é um endpoint independente e precisa refazer autorização.

## Autorização na fronteira

Não confie em "ninguém conhece esta URL" nem em "o link só aparece para professor". A fronteira HTTP precisa ser segura sozinha.

Esse princípio vale para download, export CSV, PDF, preview, thumbnail, AJAX, WS e qualquer script que possa ser chamado diretamente.

## `unserialize()` com entrada não confiável

Se o plugin usa `unserialize()` em conteúdo controlável, marque para revisão imediata. Object injection pode criar efeitos inesperados dependendo das classes disponíveis.

Para dados estruturados simples, JSON costuma ser opção mais segura e interoperável:

```php
$data = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
```

Mesmo depois disso valide a estrutura esperada.

## Dynamic call inseguro

Padrões como:

```php
$callback = required_param('callback', PARAM_RAW);
call_user_func($callback, $data);
```

permitem que entrada decida qual código executar. Em arquitetura de plugins, prefira mapeamento explícito de ações para classes ou métodos conhecidos.

## Open redirect

Se a página recebe `returnurl` e redireciona diretamente:

```php
redirect(required_param('returnurl', PARAM_URL));
```

o usuário pode ser levado para domínio externo depois de passar por uma URL Moodle confiável.

Quando o destino deve ser interno, valide que pertence ao próprio site ou use rotas construídas pelo servidor.

## CSV Injection

Exports CSV podem ser perigosos quando células controladas por usuário começam com caracteres interpretados como fórmula por planilhas.

Se o plugin exporta dados que depois serão abertos em Excel ou software equivalente, avalie neutralização de fórmulas conforme a política do projeto e a biblioteca utilizada.

Segurança de output depende do consumidor, não apenas do formato do arquivo.

## Header injection

Nome de arquivo ou texto vindo do usuário não deveria ser concatenado diretamente em headers HTTP.

Use APIs de envio de arquivo e funções do Moodle que tratem filename e content disposition corretamente em vez de construir `Content-Disposition` manualmente.

## Email injection e templates

Se um plugin envia email, não aceite endereço, assunto ou headers arbitrários de usuário e repasse para biblioteca de mail sem validação.

Use objetos de usuário, Message API e funções existentes. Para corpo HTML, aplique o mesmo raciocínio de conteúdo confiável e escaping.

## Command injection

Chamadas shell merecem revisão forte:

```
exec('convert ' . $filename . ' output.png');
```

Se `$filename` for controlável, metacaracteres podem alterar o comando.

Evite shell quando existe biblioteca PHP. Se realmente precisar, use argumentos escapados corretamente e nunca monte comando com concatenação ingênua.

## `PARAM_FILE` não torna shell seguro

`PARAM_FILE` reduz caracteres permitidos para nomes de arquivo, mas isso não é uma política universal para qualquer comando e não elimina a necessidade de escapar argumentos.

Filtros de entrada não substituem escaping específico do contexto de saída.

## Informação sensível em exception

Nunca faça:

```php
throw new moodle_exception(
    'apierror',
    'local_vulnlab',
    '',
    null,
    'Token=' . $token . ' response=' . $rawresponse
);
```

Mesmo informações destinadas a debugging podem chegar a logs ou interfaces administrativas. Registre contexto suficiente para diagnosticar sem incluir segredo.

## Debug mode não é licença para vazar secret

Desenvolvimento com `DEBUG_DEVELOPER` mostra muito mais informação, mas o código ainda deve assumir que logs e screenshots podem ser compartilhados.

Secrets não deveriam estar em stack, payload de exception ou objeto despejado.

## Capability risk bits

Ao criar capabilities que permitem conteúdo HTML não filtrado, upload, configuração sensível ou ações que podem gerar spam, use os risk bits apropriados em `db/access.php`.

Isso não protege a operação sozinho, mas ajuda administradores a entender o risco ao conceder a capability.

## Grupos como fronteira de dados

Em atividades com grupos separados, autorização não termina em `require_capability()`. Um aluno pode possuir capability de usar a atividade e ainda não poder enxergar registros de outro grupo.

Use Groups API e trate `moodle/site:accessallgroups` quando aplicável. SQL manual baseado apenas em `userid` costuma esquecer essas regras.

## Curso visível não significa atividade acessível

Uma atividade pode estar oculta ou indisponível por Availability API. Passar `courseid` e fazer `require_login($course)` pode ser insuficiente para endpoints da atividade.

Quando existe `$cm`, use o fluxo de login e contexto de módulo que considera aquele course module.

## Teste com usuário mínimo

Muitos bugs de autorização não aparecem quando você testa como admin, porque administrador atravessa praticamente tudo.

Para revisão ofensiva use um aluno com o mínimo de permissões e depois adicione papéis ou overrides conforme necessário. O princípio é descobrir o que um usuário comum consegue fazer fora da interface esperada.

## Teste horizontal e vertical

Escalada horizontal significa acessar dados de outro usuário no mesmo nível, como aluno A lendo resposta do aluno B. Escalada vertical significa executar ação de papel superior, como aluno chamando endpoint de professor.

Toda funcionalidade que recebe `userid` ou ID de objeto de usuário merece os dois testes.

## Teste cross-course

Crie dois cursos e repita IDs de negócio semelhantes. Muitas falhas aparecem quando o código verifica capability no curso A e aceita objeto do curso B.

Esse teste é particularmente importante para plugins `local` que agregam informações de muitos cursos.

## Teste sem JavaScript

Se o botão é escondido via JavaScript ou o frontend impede determinada opção, chame a requisição manualmente no próprio ambiente de teste ou escreva PHPUnit para a função interna.

Controle de interface nunca deve ser a única barreira.

## Teste parâmetros extras e ausentes

Não teste apenas valores diferentes. Remova campos, envie arrays onde era esperado scalar quando o boundary permitir, repita parâmetros e use valores no limite.

External API e Forms API ajudam bastante, mas endpoint manual pode ter suposições frágeis.

## Teste estado inesperado

Tente agir sobre registro já removido, item suspenso, atividade invisível, usuário desmatriculado, course module deletado e task já processada.

Falhas de segurança e consistência aparecem muito em estados intermediários, não no caminho feliz.

## Automatize regressões de segurança

Quando encontrar uma falha, escreva teste que falha antes do patch e passa depois. Isso transforma uma descoberta pontual em proteção permanente.

Um IDOR corrigido merece teste com usuário A tentando acessar item de B. Um CSRF corrigido merece teste do método interno com validação apropriada onde for possível. Uma capability corrigida merece cenário negativo explícito.

## PHPUnit para autorização

Um teste de serviço pode criar dois cursos, dois alunos e um item por curso, depois executar a operação como aluno A tentando usar o ID do curso B.

O resultado esperado deve ser exception de capability, access exception ou ausência de dado, conforme o contrato.

O importante é provar o comportamento negativo, não apenas o sucesso.

## Behat para interface de segurança

Behat não é ferramenta principal para testar todas as vulnerabilidades, mas é útil para garantir que ações perigosas não aparecem para papéis indevidos e que fluxos legítimos continuam funcionando depois do patch.

Combine Behat para interface com PHPUnit para autorização interna e regras de domínio.

## Static analysis e grep ajudam, mas não substituem revisão

Buscas por padrões são excelentes para levantar candidatos:

```php
$_GET
$_POST
$_REQUEST
PARAM_RAW
include(
require(
readfile(
file_get_contents(
exec(
shell_exec(
unserialize(
call_user_func(
->get_records_sql(
{{{
```

Mas cada ocorrência precisa de contexto. `PARAM_RAW` é correto em alguns campos; `file_get_contents()` é seguro em caminhos fixos; triple Mustache pode receber HTML já sanitizado.

## Plugin Validate não é scanner de segurança completo

Ferramentas de validação encontram estrutura, Coding Style e vários padrões ruins, mas não conhecem a regra de negócio que diz que o aluno A nunca pode ler o registro do aluno B.

Segurança precisa de ferramentas e revisão humana, porque ownership e contexto dependem do significado dos dados.

## Revisão de endpoints externos

Para cada External Function, confira esta ordem mental:

```
validate_parameters
load object
resolve most specific context
validate_context
require_capability
validate ownership/relationship
perform operation
return only required fields
```

Se a função trabalha com vários contextos, valide cada contexto antes de produzir dados daquele contexto.

## Revisão de páginas PHP

Para páginas normais:

```
require config.php
read parameters with PARAM_*
load course/cm/object
require_login or require_course_login
resolve context
require_capability
require_sesskey for state change
perform operation
render/redirect
```

A ordem pode variar um pouco, mas qualquer dado sensível lido antes de autenticação e autorização merece revisão.

## Revisão de downloads

Checklist curto:

```
arquivo existe?
contexto é o esperado?
usuário está autenticado?
capability correta?
itemid pertence ao objeto?
ownership/grupo correto?
filearea permitida?
forcedownload apropriado?
```

Se qualquer resposta depende do fato de a URL ter sido gerada por uma tela protegida, o download ainda está fraco.

## Revisão de integrações HTTP

Para chamadas externas, verifique destino, TLS, timeout, redirect, secrets, logs, dados pessoais e resposta inesperada.

Para callbacks recebidos, verifique assinatura, replay, idempotência, tamanho de payload e origem lógica da transação.

## Revisão de tasks

Pergunte se duas tasks podem processar o mesmo objeto, se retry repete efeito, se existe lock quando necessário e se custom data pode apontar para objeto que não existe mais.

Também confira se a task confia em IDs serializados meses antes sem revalidar o estado atual.

## Como escrever o relatório

Uma boa descoberta precisa ser reproduzível. Registre componente, arquivo, endpoint, pré-condição, usuário necessário, passos de reprodução em ambiente de teste, impacto, causa e patch sugerido.

Evite relatório que diz apenas "IDOR crítico". Explique qual objeto pode ser lido, por quem e por que a autorização atual falha.

## Severidade sem teatro

Nem toda falha é crítica. Um XSS disponível apenas para administrador com capability marcada `RISK_XSS` pode representar risco muito diferente de um XSS armazenado por aluno que executa para professor.

Contexto, privilégios necessários, impacto e alcance importam mais do que escolher a palavra mais alarmante.

## Divulgação responsável

Quando a vulnerabilidade está em plugin de terceiro ou no core, não publique exploit antes de dar oportunidade razoável de correção. O processo de segurança do Moodle existe justamente para evitar que detalhes de falhas ainda não corrigidas sejam expostos antes dos releases de segurança.

Para seu próprio plugin privado, registre internamente e controle quem recebe o patch enquanto a atualização não foi distribuída.

## Não corrija vulnerabilidade com obscuridade

Renomear `download.php` para `d93f2.php` não é patch. Remover link do menu não é patch. Minificar JavaScript não é patch. Esconder ID em Base64 não é patch.

Corrija autenticação, autorização, validação, escaping ou concorrência no ponto correto.

## Defesa em profundidade

Algumas falhas merecem mais de uma barreira. Uma operação de exclusão pode ter capability, ownership, sesskey, confirmação e transação. Um webhook pode ter TLS, assinatura, timestamp e idempotência.

Nenhuma dessas camadas autoriza retirar as outras quando elas protegem ameaças diferentes.

## Projeto do laboratório `local_vulnlab`

O plugin deliberadamente vulnerável pode ter esta estrutura:

```
local/vulnlab/
    classes/
        external/
            update_item.php
        task/
            process_queue.php
    db/
        access.php
        services.php
    lang/
        pt_br/
            local_vulnlab.php
    files/
    delete.php
    download.php
    include.php
    search.php
    webhook.php
    lib.php
    version.php
```

Cada arquivo deve conter uma falha conhecida e uma versão corrigida no branch de patch do exercício.

## Não misture todas as falhas no mesmo endpoint

Se `download.php` tiver IDOR, path traversal, XSS e CSRF ao mesmo tempo, o laboratório vira confuso. Uma vulnerabilidade por fluxo principal facilita entender causa, teste e correção.

Depois de aprender isoladamente, aí sim vale auditar um plugin em que os problemas aparecem misturados de forma realista.

## Branch vulnerável e branch corrigida

Use Git para manter:

```
vulnlab-vulnerable
vulnlab-fixed
```

O diff entre as branches vira material didático. O aluno pode revisar a vulnerável sem receber imediatamente a resposta e depois comparar o patch.

## Exercício final - auditoria

Receba uma versão deliberadamente vulnerável de `local_vulnlab` sem lista das falhas. Sua primeira tarefa é mapear toda a superfície de ataque, classificando páginas, External Functions, arquivos, webhook e task.

Depois crie uma tabela com:

```
ID
local
tipo de falha
pré-condição
usuário mínimo necessário
impacto
passos de reprodução
causa
patch
regressão automatizada
```

Não comece corrigindo enquanto ainda está descobrindo, porque mudanças prematuras podem esconder outras falhas relacionadas.

## Exercício final - falhas mínimas esperadas

O laboratório deve conter, no mínimo, problemas equivalentes a:

```
SQL Injection
Stored XSS
Reflected XSS
CSRF
IDOR
capability bypass
context confusion
LFI
path traversal
file disclosure
upload inseguro
AJAX inseguro
External Function insegura
contextid manipulável
userid manipulável
courseid manipulável
sesskey ausente
capability no contexto errado
SSRF
webhook sem validação
exposição de token
race condition
task duplicada
download sem autorização
pluginfile vulnerável
```

A implementação exata pode variar para que o exercício não vire apenas busca por nomes conhecidos.

## Exercício final - patch

Para cada problema, entregue um commit separado sempre que isso fizer sentido. O patch deve usar APIs do Moodle em vez de filtros improvisados.

Exemplos de correção esperada:

```
SQLi -> placeholders/DML
XSS -> Output API/escaping/format_text
CSRF -> POST + sesskey
IDOR -> ownership + contexto real
LFI -> allowlist ou remoção de include dinâmico
files -> File API + autorização
External -> validate_parameters + validate_context + capability
SSRF -> destinos controlados
race -> constraint/Lock API/idempotência
```

## Exercício final - testes de regressão

O trabalho não termina no patch. Escreva PHPUnit ou Behat para pelo menos as falhas de autorização, contexto e concorrência que puderem ser automatizadas.

Uma correção sem regressão automatizada pode desaparecer alguns meses depois durante uma refatoração aparentemente inocente.

## Exercício final - revisão cruzada

Depois de corrigir, entregue o plugin a outra pessoa sem explicar os patches e peça uma nova revisão. Se ela reencontrar o mesmo problema por outra rota, a correção estava localizada demais.

Esse passo também ajuda a descobrir suposições que o autor do patch continua fazendo sem perceber.

## O que este capítulo deve mudar na forma de programar

Depois de praticar estes laboratórios, a meta não é ficar paranoico com todo `PARAM_RAW`. A meta é desenvolver o hábito de seguir confiança e autorização pelo fluxo inteiro.

Sempre que você escrever um endpoint novo, pergunte de onde veio o ID, quem controla o valor, de qual contexto o objeto realmente pertence, quem pode executar a ação, se a ação precisa de sesskey, como o output será interpretado, se algum arquivo pode escapar da área prevista e o que acontece quando duas requisições chegam ao mesmo tempo.

Quando essas perguntas entram no desenvolvimento antes do code review, a maior parte das vulnerabilidades deste capítulo deixa de parecer uma lista de ataques e passa a ser apenas uma coleção de erros arquiteturais que você já sabe reconhecer.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
