# APIS TRANSVERSAIS ESSENCIAIS

Chega uma hora em que o plugin já sabe gravar dados, mostrar uma interface, receber formulário, proteger uma ação e executar processamento em segundo plano, mas mesmo assim ainda aparecem dezenas de pequenas necessidades que, quando são resolvidas na mão, deixam o código estranho. O administrador quer uma configuração, o usuário quer escolher uma preferência, uma página precisa entrar na navegação, uma integração precisa mandar uma notificação, um prazo precisa aparecer no calendário, um relatório precisa respeitar grupos, um registro precisa ficar pesquisável na busca global e um resultado grande precisa ser exportado para CSV ou Excel. Nenhuma dessas coisas parece grande o suficiente para ganhar um capítulo próprio, porém juntas elas aparecem em quase todo plugin Moodle que deixa de ser exemplo de curso e começa a ser usado de verdade.

Este é justamente o motivo deste capítulo existir. Eu vejo muito plugin com tabela própria para guardar preferência de usuário, função inventada para montar URL, envio de e-mail direto com `email_to_user()` quando na verdade aquilo deveria passar pela Message API, CSV inteiro montado em memória e depois despejado de uma vez, navegação alterada com HTML ou JavaScript, além de campos de configuração consultados por SQL direto. Quase sempre o desenvolvedor não fez isso porque queria complicar, fez porque conhecia a linguagem PHP, mas ainda não conhecia a API transversal que o Moodle já oferece para aquele problema.

A partir daqui a pergunta deixa de ser apenas "como faço isto em PHP?" e passa a ser "qual parte do Moodle já é responsável por isto?". Essa mudança parece pequena, mas é o que faz um plugin conviver bem com idioma, tema, permissões, preferências, múltiplos canais de mensagem, calendário, grupos, busca global, exportação e administração do site sem tentar construir um segundo Moodle dentro do primeiro.

## O que eu estou chamando de API transversal

Chamo de API transversal aquela que não pertence a um único tipo de plugin e nem a uma única camada da aplicação. A Files API aparece em muitos componentes, mas é um assunto grande o suficiente para ter recebido o capítulo anterior. Já Config, String, URL, Page, Navigation, Message, Calendar, Groups, Preferences, Tags, Search e Dataformat são ferramentas que atravessam várias partes do sistema e normalmente entram como apoio de outra funcionalidade.

Um `mod`, um `local`, um `tool`, um `block`, um `report` ou um `enrol` podem precisar das mesmas funções de configuração, strings, mensagens e exportação, por isso conhecer essas APIs reduz muito aquela sensação de que cada tipo de plugin é um mundo completamente diferente. O contrato muda, o contexto muda, a tela muda, mas várias ferramentas continuam sendo exatamente as mesmas.

## Config API

Configuração é uma das coisas mais simples de fazer errado porque aparentemente basta criar uma tabela com chave e valor. O problema é que o Moodle já possui infraestrutura para configuração global e configuração por componente, com cache, integração com a administração e um contrato conhecido por todo o core, então criar uma tabela `meuplugin_config` para guardar `apikey`, `enabled`, `endpoint` e `timeout` normalmente significa manter uma infraestrutura que já existia.

A função central para leitura é `get_config()`, enquanto `set_config()` e `unset_config()` fazem alteração e remoção. A diferença importante é entender se a configuração pertence ao site como um todo ou a um componente específico, porque isto define onde ela fica e como ela deve ser lida.

```php
$enabled = get_config('tool_courseaudit', 'enabled');
$endpoint = get_config('tool_courseaudit', 'endpoint');
```

Quando o segundo argumento é omitido, `get_config()` pode devolver o conjunto de configurações daquele componente, o que é útil em alguns cenários, mas eu evitaria buscar tudo quando o código precisa de apenas um valor, principalmente em trechos executados muitas vezes.

```php
$config = get_config('tool_courseaudit');

if (!empty($config->enabled)) {
    // Continua o processamento.
}
```

## Configuração global e configuração do plugin

O Moodle historicamente possui configuração global armazenada na tabela `config` e configuração de componentes na tabela `config_plugins`. Isto não quer dizer que você deva consultar essas tabelas diretamente. A API existe justamente para esconder detalhes de armazenamento, cuidar do cache e manter a forma de acesso consistente.

Configuração global faz sentido para valores realmente pertencentes ao core ou à instalação como um todo. Para código de plugin, a regra prática é simples, se a configuração é do plugin, use o nome do componente.

```
set_config('endpoint', 'https://api.exemplo.com', 'tool_courseaudit');
set_config('timeout', 15, 'tool_courseaudit');
```

No banco, isto irá para `config_plugins`, mas o plugin não deveria depender desse detalhe para funcionar.

## Por que não consultar `config_plugins` com `$DB`

Eu sei que a consulta é fácil.

```php
$record = $DB->get_record('config_plugins', [
    'plugin' => 'tool_courseaudit',
    'name' => 'endpoint',
]);
```

Só que isso pula a API, ignora a estratégia de cache e cria dependência desnecessária com a implementação interna. Se amanhã o Moodle alterar alguma parte desse fluxo, o código que chamou `get_config()` está protegido pela API, enquanto a consulta direta depende da estrutura exata da tabela.

Este é um padrão que vai se repetir neste capítulo inteiro. Quando existe API pública para a função, consultar a tabela interna costuma ser sinal de que você está descendo uma camada sem necessidade.

## `set_config()` não substitui `settings.php`

`set_config()` grava configuração, mas isto não significa que você deva criar uma página administrativa própria apenas para chamar essa função. Quando a configuração pertence à administração normal do plugin, `settings.php` continua sendo o lugar natural para declarar os campos, porque o Moodle cuida do formulário, permissões administrativas, persistência e consistência visual.

A API de configuração aparece depois, na leitura do valor e também em situações nas quais o próprio sistema altera uma configuração por código. O erro é transformar `set_config()` em desculpa para recriar a interface de administração inteira.

## `unset_config()` e a diferença entre vazio e inexistente

Às vezes o valor vazio e a ausência do valor significam coisas diferentes. Se o plugin usa um padrão quando a configuração não existe, gravar string vazia pode impedir esse comportamento e produzir um resultado diferente de remover a configuração.

```
unset_config('endpoint', 'tool_courseaudit');
```

A partir daí `get_config()` não encontrará o valor e o código pode aplicar seu padrão conscientemente. Isto fica particularmente importante quando uma configuração foi descontinuada, mudou de nome ou passou a ser calculada.

## String API

Nunca trate texto de interface como detalhe cosmético. Em Moodle, string é parte da arquitetura porque idioma, customização e tradução dependem dela, então escrever texto diretamente no PHP, no Mustache ou no JavaScript cria dívida técnica mesmo que o site hoje use apenas português.

O básico é conhecido.

```php
$title = get_string('pluginname', 'tool_courseaudit');
```

E no arquivo `lang/en/tool_courseaudit.php` ou no pacote de idioma correspondente existe a definição.

```
$string['pluginname'] = 'Course audit';
```

Em português o pacote de idioma pode fornecer sua própria tradução sem tocar no código do plugin.

## Não coloque lógica em arquivo de idioma

Arquivo de idioma deve ser simples. Ele não é `config.php`, não é `lib.php` e não é um lugar onde você calcula valores, inclui classes ou consulta banco. Esses arquivos são carregados muitas vezes pelo subsistema de strings e precisam permanecer previsíveis.

```
$string['reporttitle'] = 'Relatório de auditoria';
$string['nothingfound'] = 'Nenhum registro encontrado';
```

Se a string depende de um valor, use placeholder em vez de concatenar partes traduzidas.

## Placeholders com `$a`

Quando existe um valor variável, o Moodle permite usar `$a`. Para um único valor, ele pode ser escalar.

```
$string['recordsfound'] = '{$a} registros encontrados';
```

E a chamada fica assim.

```php
$message = get_string('recordsfound', 'tool_courseaudit', $count);
```

Quando existem vários valores, passe um objeto.

```php
$string['syncsummary'] = 'Foram importados {$a->created} registros e atualizados {$a->updated}.';
$a = (object) [
    'created' => $created,
    'updated' => $updated,
];

$message = get_string('syncsummary', 'tool_courseaudit', $a);
```

Isto é muito melhor do que montar a frase com concatenação, porque cada idioma pode reorganizar a posição dos elementos.

## Plural não é simplesmente colocar "s"

Português às vezes permite improvisar com "registro(s)", mas isso já fica feio e não resolve idiomas que têm regras de plural diferentes. O Moodle possui mecanismos e padrões de strings que permitem estruturar melhor esse tipo de texto, mas a regra mais importante para o desenvolvedor é não presumir que pluralização universal se resume a concatenar uma letra.

Quando a experiência exigir uma frase realmente natural, separe strings adequadas ou use a abordagem recomendada para a versão do Moodle suportada pelo projeto, evitando lógica linguística escondida no PHP.

## Strings no Mustache

No template não há motivo para preparar toda string estática no PHP apenas para repassá-la ao Mustache. O helper `str` existe justamente para isso.

```mustache
<h2>{{#str}} reporttitle, tool_courseaudit {{/str}}</h2>
```

Quando a string possui placeholder simples, o helper também aceita argumento.

```mustache
{{#str}} backto, core, {{coursename}} {{/str}}
```

O importante é não começar a misturar regra de negócio dentro do template só porque o helper existe. String é apresentação, regra continua fora.

## Strings no JavaScript

No Moodle 3.5, JavaScript novo usa módulos AMD. Para buscar strings, use `core/str`, que retorna uma Promise compatível com a infraestrutura JavaScript dessa versão.

```javascript
define(['core/str'], function(Str) {
    return {
        init: function() {
            Str.get_string('confirmdelete', 'tool_courseaudit').then(function(label) {
                // Use label in the interface.
                return label;
            });
        }
    };
});
```

Não copie traduções para atributos HTML nem crie um arquivo JavaScript por idioma. A origem continua sendo o language pack do componente.

## URL API e `moodle_url`

URL parece fácil até aparecer `$CFG->wwwroot`, parâmetros, encoding, `sesskey`, fragmento e mudança de estrutura. A classe `moodle_url` existe para que o plugin trabalhe com URL como objeto e não como string montada na unha.

```php
$url = new moodle_url('/admin/tool/courseaudit/view.php', [
    'id' => $courseid,
    'page' => 2,
]);
```

Quando você precisa imprimir a URL, o objeto sabe convertê-la corretamente.

```php
echo $url->out(false);
```

Na maior parte das APIs do Moodle você pode passar o próprio objeto sem converter.

## Por que não montar URL por concatenação

Isto funciona até o dia em que não funciona.

```php
$url = $CFG->wwwroot . '/admin/tool/courseaudit/view.php?id=' . $courseid . '&page=' . $page;
```

Além de feio, esse padrão empurra encoding, parâmetros opcionais e manutenção para o desenvolvedor. Com `moodle_url`, alterar, remover ou acrescentar parâmetros fica explícito.

```php
$url->param('sort', 'name');
$url->remove_params('page');
```

Você deixa de manipular texto e passa a manipular uma URL.

## `$PAGE` não serve apenas para definir título

em Output API e Mustache já passamos por `$PAGE` por causa da interface, mas ele é mais importante do que parece. O objeto `moodle_page` representa o contexto da página atual e concentra URL, context, layout, título, heading, navegação e requisitos de frontend.

Uma página Moodle minimamente bem montada normalmente define contexto e URL de forma consciente.

```php
require_login();

$context = context_system::instance();
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/admin/tool/courseaudit/index.php'));
$PAGE->set_title(get_string('pluginname', 'tool_courseaudit'));
$PAGE->set_heading(get_string('pluginname', 'tool_courseaudit'));
```

Quando o contexto é de curso, módulo ou usuário, use o contexto correto. Não coloque `context_system` em tudo apenas porque ele é fácil de obter.

## URL canônica da página

```php
$PAGE->set_url() não é detalhe visual. A URL da página é usada por diferentes partes do Moodle, inclusive navegação e componentes que precisam saber qual é a página atual, então deixar $PAGE sem URL correta pode gerar comportamento estranho que parece não ter relação com o código.
```

Além disso, a URL deve representar a página atual com os parâmetros que realmente identificam aquele estado. Parâmetro puramente transitório nem sempre precisa fazer parte dela.

## `redirect()`

Quando a operação terminou e a resposta correta é levar o usuário a outra página, use `redirect()` em vez de construir cabeçalho HTTP manual.

```php
redirect(
    new moodle_url('/admin/tool/courseaudit/index.php'),
    get_string('changessaved'),
    null,
    \core\output\notification::NOTIFY_SUCCESS
);
```

Isto integra a mensagem e o redirecionamento ao fluxo do Moodle. Não é necessário fazer `header('Location: ...')` e `exit` como se você estivesse em um PHP isolado.

## Navigation API

Mudar a navegação do Moodle não significa editar template do tema, inserir link com JavaScript ou modificar core. Existe Navigation API e existem callbacks específicos para estender a árvore de navegação conforme o contexto.

Dependendo do tipo de plugin e do local desejado, o callback muda, mas a ideia é a mesma, você recebe a estrutura de navegação e acrescenta o nó no ponto apropriado.

## `$PAGE->navbar`

A breadcrumb da página pode ser complementada com `$PAGE->navbar` quando a rota atual exige níveis que o Moodle não consegue inferir sozinho.

```php
$PAGE->navbar->add(
    get_string('reports', 'tool_courseaudit'),
    new moodle_url('/admin/tool/courseaudit/index.php')
);
$PAGE->navbar->add(get_string('details', 'tool_courseaudit'));
```

O erro comum é reconstruir breadcrumb inteira manualmente no HTML. Se a navegação é parte do sistema, alimente a estrutura do sistema.

## Navegação administrativa

Para páginas administrativas, `settings.php` e a árvore de administração geralmente são a solução mais natural. Você registra a página, configura capability e o Moodle coloca a entrada na estrutura administrativa sem precisar editar nenhum arquivo do core.

```php
$ADMIN->add('reports', new admin_externalpage(
    'tool_courseaudit',
    get_string('pluginname', 'tool_courseaudit'),
    new moodle_url('/admin/tool/courseaudit/index.php'),
    'tool/courseaudit:view'
));
```

Isto já mostra uma vantagem clara de respeitar a API. O link aparece ou desaparece conforme permissões e árvore administrativa em vez de depender de uma alteração visual específica de tema.

## Não coloque tudo no menu principal

Adicionar link em navegação não significa que ele deva aparecer na área mais visível possível. O Moodle deliberadamente restringe alguns espaços de navegação para não transformar a interface em uma coleção de atalhos de plugin.

Antes de forçar um item na navegação principal, pergunte se ele pertence ali para todos os usuários e em todas as páginas. Muitas vezes a página deveria estar dentro do curso, das preferências do usuário, de um relatório ou da administração. A API deixa você adicionar o link, mas arquitetura de navegação continua sendo uma decisão de UX.

## Message API

Quando o plugin precisa avisar uma pessoa, a primeira pergunta não deveria ser "como mando um e-mail?". No Moodle, mensagem é uma abstração acima do canal. O usuário pode receber pela interface, e-mail ou outro processador disponível, dependendo das preferências e da configuração do site.

É por isso que, quando a intenção é enviar uma notificação do sistema, usar diretamente `email_to_user()` pode ser uma escolha pobre. Você está escolhendo o canal no código em vez de deixar o subsistema de mensagens fazer isso.

## `db/messages.php`

Antes de enviar mensagens, o componente declara os message providers que oferece. Isto acontece em `db/messages.php`.

```php
$messageproviders = [
    'syncfinished' => [
        'capability' => 'tool/courseaudit:receivenotification',
    ],
];
```

O nome do provider vira parte do contrato da mensagem, então escolha algo estável e relacionado à finalidade, não ao canal.

## `\core\message\message`

Para enviar, crie um objeto `\core\message\message` e preencha os dados exigidos.

```php
$message = new \core\message\message();
$message->component = 'tool_courseaudit';
$message->name = 'syncfinished';
$message->userfrom = core_user::get_noreply_user();
$message->userto = $user;
$message->subject = get_string('syncfinishedsubject', 'tool_courseaudit');
$message->fullmessage = get_string('syncfinishedtext', 'tool_courseaudit', $a);
$message->fullmessageformat = FORMAT_PLAIN;
$message->fullmessagehtml = get_string('syncfinishedhtml', 'tool_courseaudit', $a);
$message->smallmessage = get_string('syncfinishedshort', 'tool_courseaudit', $a);
$message->notification = 1;

message_send($message);
```

Observe que existem representações diferentes da mesma comunicação, porque o canal que entrega uma mensagem curta dentro do aplicativo não necessariamente usa o mesmo conteúdo do e-mail completo.

## `subject`, `fullmessage`, HTML e `smallmessage`

Não use o mesmo texto em todos os campos por preguiça. `subject` precisa funcionar como assunto, `fullmessage` como alternativa textual completa, `fullmessagehtml` como conteúdo rico quando o processador suporta HTML e `smallmessage` como resumo curto.

Em notificações importantes, isto muda bastante a qualidade do resultado. Uma mensagem que fica ótima em e-mail pode ficar horrível em push se o campo curto tiver 900 caracteres.

## Notificação versus mensagem pessoal

O campo `notification` diferencia comunicação de sistema e mensagem pessoal. Se o plugin informa que um processamento terminou, um prazo mudou ou um relatório ficou pronto, normalmente estamos falando de notificação. Não marque tudo como comunicação pessoal apenas porque vai para uma pessoa específica.

Além da semântica, esse tipo de informação pode influenciar comportamento dos processadores e preferências, então não trate o campo como decoração.

## Preferências de mensagem pertencem ao usuário

Um dos motivos para usar Message API é justamente respeitar preferências. O usuário pode querer determinados tipos de mensagem em determinados processadores, e o administrador também pode definir defaults e restrições.

Se você envia e-mail por fora, você ignora essa camada e passa a ter dois sistemas de notificação concorrendo dentro do mesmo Moodle.

## Calendar API

Se o plugin possui datas relevantes para o usuário, pense se aquilo deveria aparecer no calendário. Prazo de entrega, data limite, janela de ação ou evento institucional são exemplos óbvios. O benefício de usar Calendar API é que o evento passa a fazer parte da experiência normal do Moodle em vez de existir apenas na tela do seu plugin.

Um evento pode ser criado por meio da classe `calendar_event`.

```php
$event = new stdClass();
$event->name = get_string('auditdeadline', 'tool_courseaudit');
$event->description = get_string('auditdeadlinedescription', 'tool_courseaudit');
$event->format = FORMAT_HTML;
$event->courseid = $courseid;
$event->groupid = 0;
$event->userid = 0;
$event->modulename = '';
$event->instance = 0;
$event->eventtype = 'deadline';
$event->timestart = $deadline;
$event->timeduration = 0;
$event->visible = 1;

calendar_event::create($event);
```

A estrutura real varia conforme o tipo de evento e o componente, então não copie campos cegamente. Entenda quem é dono do evento e qual entidade ele representa.

## Atualizar e excluir evento

Se a data do seu objeto muda, o calendário também precisa mudar. Não crie um novo evento toda vez, senão em pouco tempo o usuário terá três prazos para a mesma coisa.

Guarde a relação necessária entre o objeto do plugin e o evento, recupere o evento existente e atualize. Da mesma forma, quando o registro que originou o evento é removido, o evento correspondente deve ser removido.

A lição é simples, calendário é projeção de um dado do domínio. Se o domínio mudou, a projeção precisa acompanhar.

## Action events

Desde versões antigas do Moodle 3.x, eventos podem ter uma ação associada e aparecer em componentes como o Dashboard. Isto é diferente de simplesmente colocar uma data no calendário. Um action event representa algo que o usuário precisa fazer e pode ter uma URL que leva diretamente à ação.

Se o plugin cria uma pendência real, vale entender a API de action events em vez de criar um bloco próprio só para listar prazos que o Moodle já consegue apresentar no fluxo padrão.

## Groups API

Grupo no Moodle não é apenas uma tabela com usuários agrupados. Existe group mode, agrupamentos, visibilidade e comportamento dependente de curso e atividade, então filtrar registros apenas por `groups_members` costuma ser insuficiente quando a intenção é reproduzir a regra do Moodle.

O primeiro cuidado é entender a diferença entre grupos e groupings. Um grupo é uma coleção de usuários. Um grouping reúne grupos e pode restringir quais grupos são considerados por determinada atividade.

## `groups_get_activity_group()`

Quando você está dentro do contexto de uma atividade e precisa respeitar o grupo selecionado na interface, funções como `groups_get_activity_group()` evitam reinventar a regra de seleção.

```php
$groupid = groups_get_activity_group($cm, true);
```

A partir daí o relatório ou listagem pode aplicar o filtro coerente com a atividade e com o usuário atual.

## Group mode

Os modos principais são sem grupos, grupos separados e grupos visíveis. A diferença não é estética. Em grupos separados, um usuário normalmente não pode enxergar dados de outro grupo sem capability apropriada, enquanto em grupos visíveis ele pode enxergar os outros grupos mesmo que a interação tenha restrições.

Se o plugin oferece relatório, atividade ou tela com participantes, precisa verificar o group mode antes de decidir quem aparece. Um `WHERE groupid = ...` solto não substitui essa análise.

## Agrupamentos e atividade

Uma atividade pode estar vinculada a um grouping específico. Isto significa que nem todo grupo do curso é necessariamente relevante naquele contexto. Plugins de atividade que ignoram grouping acabam mostrando opções que o professor não esperava ou misturando alunos que deveriam estar fora daquele fluxo.

Por isso eu sempre volto ao mesmo ponto, use a API que entende a regra do Moodle em vez de reconstruir a regra a partir de tabelas.

## Logs e eventos

Se o plugin precisa registrar ações importantes de usuário, a base moderna de logging do Moodle são os Events. Quando uma ação relevante acontece, o componente dispara um evento que pode ser consumido pelo logstore padrão, por observers e por outros mecanismos do ecossistema.

Isto não significa que toda linha de debug deva virar Event. Log de auditoria funcional e debug técnico são coisas diferentes. Um evento como "relatório exportado", "configuração alterada" ou "registro aprovado" pode fazer sentido; uma variável intermediária de uma tentativa de API externa não precisa virar evento de negócio.

## Standard log

O Standard log é o armazenamento padrão de eventos utilizado pelo Moodle em muitas instalações. Como desenvolvedor de plugin, você normalmente não deve escrever diretamente na tabela de log. Dispare eventos adequados e deixe o subsistema de logging registrar de acordo com a configuração do site.

Esse desacoplamento é importante porque Moodle suporta diferentes logstores e configurações. Se você grava direto na tabela, seu código presume uma implementação que não deveria ser responsabilidade do plugin.

## Consultando logs

Às vezes o próprio plugin precisa exibir histórico, mas antes de consultar a tabela física do log padrão, verifique as APIs e managers disponíveis para leitura. O site pode não estar usando apenas aquele store, a retenção pode variar e a estrutura interna não é um contrato para seu plugin.

Se o histórico é uma função central do seu domínio e precisa existir independentemente dos logstores, talvez você realmente precise de uma tabela própria de histórico. O que não faz sentido é criar tabela própria apenas para duplicar todos os eventos que o Moodle já registra.

## Quando criar uma tabela de histórico própria

Existe diferença entre "quero saber que o usuário abriu a página" e "preciso manter a trilha legal de todas as versões aprovadas de um documento por cinco anos". O primeiro é claramente logging. O segundo pode ser parte do modelo de negócio e exigir persistência própria com regras de retenção, imutabilidade e consulta.

Não use Event como banco de domínio, mas também não crie banco de domínio para substituir o Event API. A decisão depende do significado e da garantia que o dado precisa ter.

## User Preferences API

Preferência do usuário é diferente de configuração do plugin. Configuração normalmente define como o sistema funciona para todos ou para um componente. Preferência define como uma pessoa escolheu usar uma funcionalidade.

Exemplos simples incluem modo compacto, aba padrão, painel recolhido, ordenação preferida ou opção de mostrar determinada informação.

```php
set_user_preference('tool_courseaudit_compact', 1);
$compact = get_user_preferences('tool_courseaudit_compact', 0);
```

## Não crie tabela para cada preferência

Uma tabela `tool_courseaudit_userprefs` com colunas como `userid`, `compact`, `showhelp`, `defaulttab` provavelmente é desperdício se os dados são apenas preferências simples. A Preference API já resolve armazenamento para usuários autenticados e também lida com sessão quando necessário.

Além disso, a documentação recomenda evitar armazenar o valor padrão para todo mundo. Se o padrão é zero, você pode simplesmente usar zero como fallback e gravar somente quem escolheu algo diferente.

## Preferência não é lugar para dado de negócio

A facilidade da API pode tentar você a guardar qualquer coisa ali. Não faça isso. Resultado de processamento, autorização, saldo, matrícula, progresso acadêmico ou estado crítico de workflow não são preferência. Preferência é escolha do usuário sobre comportamento ou apresentação.

Se perder aquele valor compromete integridade do negócio, provavelmente você escolheu o lugar errado.

## Tags API

Tags são úteis quando o usuário ou o sistema precisa classificar objetos por rótulos reutilizáveis e depois encontrar objetos relacionados. O Moodle possui Tag API para criar áreas tagueáveis, relacionar tags a itens e pesquisar por essas relações.

Uma tag e uma instância de tag não são a mesma coisa. A tag é o rótulo, enquanto a instância representa a associação daquele rótulo com um objeto específico. Esta diferença importa principalmente na remoção e na manutenção.

## Definindo uma tag area

Plugins que permitem tags precisam declarar a área apropriada em vez de simplesmente gravar nomes separados por vírgula em uma coluna. A API consegue integrar o objeto ao ecossistema de tags do Moodle e aos mecanismos administrativos existentes.

Quando o requisito é apenas uma categoria fixa definida pelo sistema, talvez tag nem seja a abstração correta. Tag funciona melhor quando existe classificação flexível e potencialmente reutilizável.

## Search API e Global Search

Se o plugin guarda conteúdo relevante, ele pode participar da busca global do Moodle. Isto é muito melhor do que criar uma busca própria para cada componente e obrigar o usuário a lembrar onde o conteúdo está.

A Search API trabalha com search areas. Cada área define que tipo de item pode ser indexado, como o item é convertido em documento pesquisável, como a permissão é validada e como o resultado leva o usuário de volta ao conteúdo.

## Search area

Uma área de busca normalmente vive em namespace específico do componente e herda das classes apropriadas do subsistema. A implementação precisa fornecer ao Moodle os documentos e a lógica de acesso.

O ponto mais importante é que indexar conteúdo não significa torná-lo público. A área de busca precisa respeitar contexto, capabilities e visibilidade no momento correto, porque resultado de busca também é uma forma de acesso a informação.

## Indexação não acontece a cada pesquisa

Busca global não deveria fazer `SELECT` em todas as tabelas de todos os plugins toda vez que o usuário digita algo. O sistema trabalha com índice, e o plugin participa do processo de indexação fornecendo documentos novos ou alterados.

Isto explica por que mudanças no modelo de dados precisam considerar atualização do índice. Se seu registro mudou mas o mecanismo de indexação não consegue identificar a mudança, o usuário pode continuar encontrando conteúdo antigo.

## Conteúdo indexado precisa ser suficiente, mas não excessivo

Não coloque o registro inteiro serializado no índice só porque é possível. Escolha título, conteúdo textual e metadados que realmente ajudam a localizar o objeto. Informações secretas, tokens, campos administrativos ou dados que o usuário nunca deveria pesquisar não pertencem ao documento indexado.

A busca é uma superfície de exposição e deve receber o mesmo cuidado de qualquer listagem.

## Dataformat API

Exportar dados parece uma tarefa banal até o relatório ter 300 mil linhas. O código ingênuo costuma montar um array gigantesco, converter tudo para CSV em memória e só depois iniciar o download, então um recurso que funcionava no ambiente de desenvolvimento morre em produção com falta de memória ou timeout.

A Dataformat API existe para padronizar exportação e permitir formatos suportados pelo Moodle, trabalhando de forma adequada com streaming quando possível.

## CSV, Excel e formatos disponíveis

Em vez de codificar um exportador por extensão, o plugin pode trabalhar com a infraestrutura de data formats oferecida pelo Moodle. Assim o mesmo relatório pode ser enviado em CSV, Excel ou outros formatos disponíveis no site sem duplicar toda lógica de geração.

O dado do relatório continua sendo responsabilidade do plugin. O formato de saída não deveria obrigar você a reescrever a consulta.

## Exportação grande precisa ser incremental

Se você usa `$DB->get_records()` para buscar 500 mil registros e depois cria uma matriz completa em PHP, o problema já aconteceu antes mesmo da primeira célula ser escrita. Para exportação grande, combine recordset ou paginação com escrita incremental.

```php
$recordset = $DB->get_recordset_sql($sql, $params);

foreach ($recordset as $record) {
    // Converte apenas a linha atual para o formato de exportação.
}

$recordset->close();
```

A Dataformat API pode receber os dados progressivamente, e a consulta também precisa ser desenhada para isto.

## Não exporte dado que o usuário não poderia ver na tela

Exportação não é uma rota alternativa para escapar de capability, group mode ou filtros. Antes de escrever cada conjunto de dados, aplique as mesmas regras de autorização que seriam usadas em uma listagem normal.

Eu já encontrei sistemas em que a tela mostrava apenas os dados do professor, mas o botão CSV exportava tudo porque o desenvolvedor criou uma consulta separada e esqueceu o filtro. A vulnerabilidade não estava no CSV, estava na duplicação da regra de acesso.

## Nome e encoding do arquivo

Não monte cabeçalhos HTTP manualmente sem necessidade e não assuma que todo valor pode virar nome de arquivo. Use as APIs de download e dataformat do Moodle, escolha nome seguro e previsível e deixe o subsistema cuidar da resposta.

CSV também traz detalhes como delimitador, escaping e encoding. Quanto menos disso estiver espalhado pelo seu código de negócio, melhor.

## Um exemplo transversal completo

Imagine um plugin de auditoria de cursos. O administrador configura se o recurso está habilitado e o prazo padrão pela Config API. O título vem da String API. A página usa `moodle_url` e `$PAGE`, entra na navegação administrativa pelo mecanismo correto e respeita capability. O professor escolhe se quer interface compacta e isto vira User Preference. Quando uma auditoria é finalizada, o plugin dispara um Event, agenda um Calendar event quando existe prazo e envia uma notificação pela Message API. O relatório respeita Groups API, os relatórios finalizados podem ser indexados pela Search API e os resultados podem ser exportados via Dataformat.

Nenhuma dessas APIs é o produto principal, mas juntas elas fazem o plugin parecer parte do Moodle em vez de um sistema PHP colado dentro dele.

## O erro de construir uma segunda plataforma dentro do Moodle

Quanto mais experiência o desenvolvedor tem fora do Moodle, maior pode ser a tentação de trazer tudo pronto da arquitetura anterior. Cria tabela de configuração, tabela de preferência, serviço de notificação próprio, cron próprio, breadcrumbs próprios, busca própria, exportação própria e menu próprio. Tecnicamente pode funcionar, só que em pouco tempo você tem duas plataformas compartilhando a mesma tela.

O usuário configura uma preferência no Moodle e outra no plugin, recebe notificações em dois lugares, encontra parte do conteúdo na busca global e outra parte em busca separada, enquanto o administrador precisa aprender uma segunda lógica de configuração.

A integração com as APIs transversais reduz esse atrito e também reduz código.

## API pública antes de tabela interna

Uma regra que vale guardar deste capítulo é esta, se existe uma API pública do Moodle para a operação, tente utilizá-la antes de consultar diretamente a tabela interna que sustenta aquela API. Isto vale para configuração, preferências, mensagens, calendário, tags, busca, grupos e logs.

Não é uma proibição absoluta de SQL. Há relatórios em que você realmente precisa consultar dados do core, mas para executar uma operação do subsistema, a API é normalmente o contrato correto.

## Exercício - transformar uma página isolada em uma página Moodle de verdade

Pegue uma página de relatório que hoje recebe parâmetros por GET, monta URL por concatenação, possui textos escritos diretamente no PHP, mostra breadcrumb em HTML, guarda preferência de ordenação em tabela própria, envia e-mail diretamente e gera CSV inteiro em memória. A tarefa é refatorar sem mudar o requisito funcional.

Primeiro substitua textos pela String API e URLs por `moodle_url`. Depois defina corretamente `$PAGE`, contexto e navegação. Mova preferências simples para User Preferences, transforme o e-mail de sistema em Message API com provider declarado e verifique se o evento ou prazo precisa de Calendar API. Se o relatório usa curso com grupos, passe a respeitar Group mode. Finalmente, reescreva a exportação para Dataformat e processamento incremental, garantindo que a consulta de exportação usa exatamente as mesmas regras de autorização da tela.

O resultado esperado não é apenas menos linhas de código. A página precisa passar a se comportar como parte do Moodle, acompanhando idioma, permissões, preferências, navegação, canais de mensagem e infraestrutura do site sem manter implementações paralelas.

## Fechando o capítulo

Estas APIs são fáceis de subestimar porque nenhuma delas, isoladamente, parece tão importante quanto banco, segurança ou Files API. Só que a qualidade de um plugin grande aparece justamente na soma das pequenas decisões. Um plugin que usa `get_config()`, strings corretamente, `moodle_url`, `$PAGE`, Navigation API, Message API, Calendar API, Groups API, Events, Preferences, Tags, Search e Dataformat não está apenas seguindo padrão, ele está delegando responsabilidades ao Moodle e reduzindo a quantidade de infraestrutura que precisa manter sozinho.

No próximo capítulo vamos aprofundar Web Services e integrações, e muita coisa vista aqui volta a aparecer. A configuração guarda endpoint e políticas, strings alimentam erros e interface, Message API pode avisar falhas, Tasks retiram trabalho pesado da requisição e Events registram o que aconteceu. Quando essas peças já estão claras, integração externa deixa de ser um bloco estranho anexado ao plugin e passa a usar os mesmos contratos que o restante do Moodle.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
