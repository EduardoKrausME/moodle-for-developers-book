# PRIMEIRO PLUGIN CORRETAMENTE

Criar um plugin Moodle que instala é relativamente fácil. Criar um plugin que continua compreensível depois de dois anos, passa por upgrades sem susto, não espalha lógica em arquivos globais e não obriga o próximo desenvolvedor a descobrir regras escondidas já é outra história. O problema é que os dois plugins podem parecer iguais no primeiro dia. Ambos possuem um `version.php`, ambos aparecem na administração e ambos talvez exibam uma página que funciona. A diferença aparece depois, quando o projeto cresce e aquilo que parecia apenas uma pasta com alguns arquivos começa a depender de eventos, permissões, tarefas agendadas, integrações, cache, web services, backup e compatibilidade entre versões.

Por isso este capítulo não vai começar pelo clássico "crie uma pasta em `local/` e coloque um `index.php` dentro". Depois do capítulo anterior já sabemos que o tipo do plugin é uma decisão de arquitetura, então agora podemos olhar para o segundo problema, que é organizar corretamente um componente depois que o tipo já foi escolhido. O Moodle possui convenções muito fortes para isso e, quando seguimos essas convenções, grande parte da infraestrutura vem praticamente de graça. Quando ignoramos, começamos a recriar mecanismos que o core já oferece e o código vai ficando cada vez mais difícil de manter.

Os assuntos maiores aparecem aqui como um mapa. Banco de dados, Events, callbacks, Tasks, Web Services e Backup terão capítulos próprios, portanto não faria sentido transformar este capítulo em uma versão resumida de todos eles. O que precisamos agora é entender onde cada peça mora, quando ela é carregada e qual responsabilidade deve assumir, porque a primeira habilidade de quem desenvolve bem para Moodle não é decorar funções e sim saber onde procurar e onde colocar cada coisa.

## O que é um plugin Moodle

Um plugin Moodle é um componente instalável que participa da arquitetura do sistema através de um tipo reconhecido pelo core e de um nome próprio dentro daquele tipo. Ele não é simplesmente uma pasta de PHP colocada em algum lugar da aplicação. Quando o Moodle reconhece `tool_catalogsync`, por exemplo, ele sabe que existe um componente do tipo `tool` chamado `catalogsync`, consegue localizar seus arquivos, carregar classes automaticamente, encontrar strings de idioma, identificar configurações, executar passos de upgrade e descobrir declarações feitas em arquivos como `db/tasks.php`, `db/events.php` ou `db/services.php`.

Essa identificação percorre praticamente todas as APIs modernas. Uma capability poderia ser `tool/catalogsync:manage`, uma string viria de `tool_catalogsync`, um template poderia ser `tool_catalogsync/status`, uma classe começaria com o namespace `tool_catalogsync`, uma definição de cache pertenceria ao componente `tool_catalogsync` e uma configuração seria armazenada sob esse mesmo componente. O nome não é decoração, ele é a identidade técnica do plugin.

Isso muda a forma como você deve pensar a estrutura. Em uma aplicação PHP comum talvez seja tentador criar uma pasta `src`, outra `helpers`, uma terceira `includes` e organizar tudo conforme preferências pessoais. No Moodle parte dessa liberdade existe, mas dentro de regras muito claras. O core espera determinados arquivos em determinados lugares e o autoloader espera classes dentro de `classes/`. Trabalhar contra essas convenções não deixa o projeto mais autoral, apenas faz você perder recursos automáticos e criar trabalho desnecessário.

## Estrutura mínima de um plugin

A estrutura mínima depende do tipo de plugin, porque alguns tipos exigem arquivos específicos que outros não exigem. Ainda assim, quase todo plugin novo começa com duas coisas que você pode tratar como fundamentais, `version.php` e o arquivo de idioma em inglês. Dependendo do tipo, haverá também um `lib.php` obrigatório ou callbacks específicos, mas isso já é uma exigência do contrato daquele tipo e não uma regra universal para todos os plugins.

Um esqueleto genérico poderia começar assim.

```
pluginname/
|-- classes/
|-- lang/
|   `-- en/
|       `-- plugintype_pluginname.php
`-- version.php
```

Parece pouco porque realmente é pouco. Um plugin não precisa nascer com quinze diretórios vazios copiados de outro projeto. Se ainda não existe banco de dados, não há motivo para criar `db/install.xml`; se não existem tarefas, `db/tasks.php` não precisa existir; se o plugin não envia mensagens, `db/messages.php` só cria ruído; se não existe JavaScript, criar `amd/src/` antecipadamente não melhora nada.

Essa é uma regra simples que economiza bastante confusão, crie a estrutura quando a responsabilidade aparecer. O Moodle descobre muitos recursos pela presença de arquivos convencionais e, por isso, arquivos vazios ou copiados sem necessidade podem levar quem lê o código a procurar funcionalidades que na prática não existem.

## Nome correto do diretório

O nome físico do diretório é a parte curta do plugin e precisa estar no diretório correspondente ao tipo escolhido. Se criamos `tool_catalogsync`, a pasta se chama `catalogsync` e fica dentro do diretório de admin tools. Para `tool_catalogsync`, a pasta é `admin/tool/catalogsync` na raiz da instalação.

O detalhe importante é que `tool_catalogsync` não deve virar o nome da pasta. O tipo já está representado pelo caminho e o Moodle monta o Frankenstyle combinando o tipo conhecido com o nome da pasta. Para `mod_supervideo`, por exemplo, a pasta é `supervideo` dentro de `mod`; para `auth_meuauth`, a pasta é `meuauth` dentro de `auth`; para `local_integracao`, a pasta é `integracao` dentro de `local`.

Use nomes em minúsculas e siga as regras do tipo. Evite inventar separadores, espaços, letras maiúsculas ou nomes enormes sem necessidade. Além de o nome aparecer em vários identificadores, ele também influencia nomes de tabelas, capabilities, funções de callback e outros elementos que podem ter restrições próprias. Renomear um plugin depois que ele já possui dados, integrações e instalações em produção é muito mais trabalhoso do que escolher bem no começo.

## Frankenstyle do componente

Frankenstyle é o nome completo do componente no formato `tipo_nome`. No nosso exemplo, o tipo é `tool`, o nome curto é `catalogsync` e o componente passa a ser `tool_catalogsync`. Essa forma aparece em todo o Moodle e precisa ser consistente, porque o sistema usa o componente como chave para localizar recursos.

Dentro de `version.php` teremos `$plugin->component = 'tool_catalogsync'`, o namespace base será `tool_catalogsync`, o arquivo de idioma será `lang/en/tool_catalogsync.php`, templates serão chamados como `tool_catalogsync/nome`, configurações do plugin pertencem ao componente `tool_catalogsync` e várias APIs pedem exatamente esse identificador.

Algumas famílias de plugins usam pequenas variações de caminho e nome por razões históricas, mas a ideia continua a mesma. Você não deveria adivinhar o Frankenstyle olhando apenas para o nome comercial do plugin. A fonte confiável é o tipo escolhido, a localização reconhecida pelo Moodle e as regras específicas daquele tipo.

Quando alguma coisa parece não carregar, a primeira verificação deveria ser banal e, justamente por isso, costuma ser esquecida. Compare o caminho físico, o `$plugin->component`, o namespace e o nome do arquivo de idioma. Um único caractere diferente é suficiente para criar erros que parecem misteriosos até alguém perceber que o plugin se chama de três formas distintas dentro do próprio código.

## O que é `version.php`

`version.php` é o arquivo de metadados do plugin. O Moodle o utiliza para saber qual componente está no disco, qual versão está instalada no código, de qual versão do Moodle ele depende, qual nível de maturidade possui e se depende de outros plugins.

Ele é lido em caminhos importantes de instalação, upgrade e descoberta de componentes, então deve ser simples e previsível. Não pense nele como um arquivo de bootstrap do seu plugin. Ele não existe para carregar classes, executar consultas, verificar configurações ou inicializar serviços. É um arquivo de declaração de metadados.

Um exemplo reduzido poderia ser este.

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'tool_catalogsync';
$plugin->version = 2018051700;
$plugin->requires = 2018051700;
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '1.0.0';
```

Os números acima são exemplos e precisam ser ajustados à realidade do projeto e da versão mínima do Moodle exigida. O importante agora é entender que cada propriedade resolve um problema diferente, e misturar esses significados costuma gerar estratégias de versão difíceis de manter.

## `$plugin->component`

```php
$plugin->component declara o Frankenstyle completo do plugin e deve corresponder exatamente ao local onde o componente foi instalado. Para o nosso exemplo, tool_catalogsync precisa estar no diretório que o Moodle reconhece como admin tool e dentro de uma pasta chamada catalogsync.
```

O Moodle usa essa informação para validação e diagnóstico durante instalação e upgrade. Se você copiar `version.php` de outro plugin e esquecer de alterar o componente, pode receber erro antes mesmo de chegar à lógica que está tentando testar. Isso é bom, porque impede que um pacote seja instalado com uma identidade diferente daquela que seus outros arquivos pressupõem.

Não monte esse valor dinamicamente. O componente é uma identidade estática do código e deve ser evidente para quem abre o arquivo. Se o nome mudou, isso não é uma mudança comum de configuração, é uma migração de componente e precisa ser tratada como tal.

## `$plugin->version`

```php
$plugin->version é a versão técnica utilizada pelo mecanismo de upgrade. A convenção mais comum segue o formato baseado em data YYYYMMDDXX, em que os últimos dois dígitos permitem múltiplas revisões no mesmo dia. Assim, `2018051700` pode representar a primeira versão técnica publicada em 17 de maio de 2018 e `2018051701` uma revisão posterior daquele mesmo conjunto de mudanças.
```

Esse número não é o mesmo que a versão comercial mostrada ao usuário. Se você quer chamar a versão de `1.4.2`, isso pertence a `$plugin->release`; o valor de `$plugin->version` precisa ser monotonicamente crescente porque é ele que o Moodle compara com a versão registrada no banco para decidir se existe upgrade a executar.

Um erro clássico acontece quando alguém volta o número porque percebeu que digitou uma data errada. Em ambiente de desenvolvimento limpo talvez pareça funcionar, mas instalações que já registraram um número maior não executarão um upgrade para uma versão menor. Depois que uma versão foi distribuída, trate o número como histórico imutável e avance a partir dele.

Outro erro é alterar `db/upgrade.php`, `db/services.php`, `db/tasks.php`, `db/access.php` ou outras declarações que dependem de upgrade e esquecer de incrementar `$plugin->version`. O arquivo mudou no Git, mas o Moodle não tem motivo para reprocessar aquela configuração. Quando algo "não atualiza" depois de uma mudança estrutural, confira a versão antes de procurar fantasmas no cache.

## `$plugin->requires`

```php
$plugin->requires = 2018051700;
```

`$plugin->requires` define a versão mínima do core necessária para o plugin funcionar. O valor utiliza o número técnico da versão do Moodle, não o número amigável como 3.5. Se o plugin usa uma API introduzida em determinada release, essa propriedade é a barreira que impede a instalação em uma versão anterior onde o código inevitavelmente quebraria.

Escolher esse valor exige honestidade. Se o plugin usa uma API que não existe no Moodle 3.5, declarar `$plugin->requires = 2018051700` não o torna compatível; a instalação apenas descobrirá o problema tarde demais.

Por outro lado, também não faz sentido aumentar `requires` a cada release sem necessidade. Se o código realmente funciona nas branches anteriores que você decidiu suportar, mantenha a versão mínima coerente e confirme isso com testes. Compatibilidade deve ser resultado de código e CI, não de otimismo no `version.php`.

## `$plugin->maturity`

```php
$plugin->maturity comunica o nível de estabilidade da versão e normalmente utiliza MATURITY_ALPHA, MATURITY_BETA, MATURITY_RC ou MATURITY_STABLE. Isso influencia inclusive notificações de atualização, porque administradores podem configurar quais níveis de maturidade desejam considerar.
```

Não trate `MATURITY_STABLE` como enfeite obrigatório. Se a versão ainda está em experimentação, possui migrações que não foram testadas ou depende de uma API que você acabou de integrar, chamar de estável não muda a qualidade do código, apenas remove um aviso útil para quem instala.

Da mesma forma, manter eternamente `MATURITY_BETA` para evitar responsabilidade também não ajuda. Maturidade deve refletir o estágio real daquela release e pode evoluir junto com o projeto.

## `$plugin->release`

```php
$plugin->release é o identificador legível da versão. Aqui você pode usar uma convenção como 1.0.0, 2.3.1 ou outra nomenclatura que faça sentido para o produto. É o valor que humanos tendem a reconhecer com mais facilidade e que pode acompanhar releases e tags do repositório.
```

Não confunda essa propriedade com o gatilho de upgrade. O Moodle não decide executar `db/upgrade.php` comparando `1.0.0` com `1.0.1`; ele olha para `$plugin->version`. Você pode alterar apenas `release` e descobrir que nada acontece no banco, porque tecnicamente não houve incremento da versão de instalação.

Uma estratégia saudável é manter os dois valores com funções diferentes e previsíveis. `$plugin->version` resolve ordenação técnica e upgrade, enquanto `$plugin->release` resolve comunicação da release. Quando tentamos fazer um único número cumprir os dois papéis, geralmente acabamos com convenções difíceis de explicar.

## `$plugin->dependencies`

```php
$plugin->dependencies declara dependências de outros plugins e suas versões mínimas. Isso é útil quando seu componente realmente precisa de outro para funcionar e não consegue oferecer comportamento aceitável sem ele.
$plugin->dependencies = [
    'mod_forum' => 2018051400,
    'local_baseinstitution' => 2018050100,
];
```

A declaração evita instalações incompletas e torna a relação explícita para o Plugin manager. Se `tool_catalogsync` chama classes públicas de `local_baseinstitution`, por exemplo, esconder essa dependência dentro de um `class_exists()` espalhado pelo código só torna a falha mais difícil de diagnosticar.

Também não declare dependência por comodidade. Se a integração com outro componente é opcional e o plugin funciona plenamente sem ela, talvez seja melhor detectar a presença do componente e habilitar aquela integração somente quando disponível. Dependência obrigatória deve representar uma necessidade arquitetural real.

## Por que `version.php` não deve executar lógica

No Moodle 3.5, trate `version.php` como arquivo de dados e não coloque inclusões ou efeitos colaterais ali. Isso existe por performance e por previsibilidade, porque o core pode ler arquivos de versão em momentos nos quais você não esperava executar lógica de negócio e pode fazer isso para vários componentes.

Imagine colocar em `version.php` uma consulta para descobrir um recurso externo, um `require_once` para carregar uma biblioteca ou uma chamada que depende de sessão. O arquivo deixa de responder apenas "quem é este plugin?" e passa a depender do estado de toda a aplicação. Agora uma simples tela de verificação de plugins pode falhar porque uma API externa ficou indisponível. Isso não é flexibilidade, é acoplamento no pior ponto possível.


## O que é `lib.php`

`lib.php` é um arquivo histórico que funciona como ponte entre o core e callbacks globais do plugin. Muitos tipos ainda exigem funções específicas nesse arquivo porque parte do contrato nasceu antes do sistema moderno de namespaces e autoloading. Activity Modules são um exemplo claro, pois ainda existem callbacks obrigatórios relacionados à criação, atualização e remoção de instâncias.

O problema começa quando tratamos `lib.php` como biblioteca geral do plugin. Como o nome sugere "library", muita gente coloca ali consultas, classes improvisadas, funções utilitárias, formatação, chamadas HTTP e qualquer trecho compartilhado. Em plugins antigos você encontrará bastante disso, mas usar código legado como argumento para repetir arquitetura antiga é uma excelente forma de produzir mais legado.

Hoje a regra prática é simples. Se o Moodle exige um callback global, ele fica em `lib.php`; a lógica que o callback precisa executar deve ser delegada para classes autoloaded sempre que possível. Assim o arquivo continua pequeno e o comportamento real fica em código organizado, testável e carregado apenas quando necessário.

## Por que `lib.php` é considerado legado

A própria documentação de arquivos comuns classifica `lib.php` como legado. Isso não significa que o arquivo foi removido ou que todos os seus usos estão errados. Significa que ele pertence a uma arquitetura anterior e, para código novo, deve ser utilizado somente nos pontos em que o contrato do Moodle ainda depende dele.

Existe uma razão de performance além da organização. O Moodle pode carregar `lib.php` de vários plugins de um mesmo tipo em determinadas operações. Se cada arquivo possui centenas de linhas e inicializa estruturas desnecessárias, você paga esse custo mesmo quando a funcionalidade concreta daquele plugin não será usada na requisição.

Classes autoloaded resolvem exatamente esse problema. Elas ficam no disco até serem necessárias e o autoloader sabe como localizá-las sem você encher arquivos globais de `require_once`. Por isso "funciona dentro de lib.php" não é um argumento suficiente. A pergunta correta é se aquilo precisa ser um callback global ou se só está ali porque era o lugar mais fácil de colar o código.

## O que ainda deve permanecer em `lib.php`

Devem permanecer em `lib.php` os callbacks que o tipo de plugin ou alguma API ainda procura como função global e que não possuem um substituto moderno adequado. Em um `mod`, por exemplo, callbacks como `[modname]_add_instance()`, `[modname]_update_instance()` e `[modname]_delete_instance()` continuam fazendo parte do contrato da atividade. Outros tipos possuem seus próprios pontos de integração e precisam ser consultados na documentação específica.

Mesmo nesses casos o callback pode ser fino. Ele recebe os dados, adapta o formato necessário e chama uma classe que concentra a regra real. Se excluir uma atividade exige remover integrações, atualizar registros relacionados e gerar eventos, você não precisa colocar tudo em uma função global de cem linhas só porque o ponto de entrada é global.

Também existem callbacks que o core procura diretamente em `lib.php`. Antes de mover qualquer função apenas porque o arquivo parece antigo, descubra como o Moodle a encontra; remover um callback que o core chama quebra a integração.

## O que NÃO colocar em `lib.php`

Não coloque regras de negócio gerais, acesso a banco usado por várias páginas, wrappers HTTP, helpers genéricos, manipulação de arquivos, construção de HTML ou funções que só existem porque você queria reaproveitar vinte linhas em dois lugares. Tudo isso pode viver em classes com responsabilidade definida.

Evite também código executado no escopo global. Um `lib.php` não deveria fazer consulta simplesmente por ter sido incluído, nem alterar estado, nem verificar permissões para uma página específica. Lembre que o core pode carregar o arquivo em contextos diferentes daquele que você tinha em mente quando escreveu a lógica.

Outro sinal de problema é uma sequência de funções com nomes como `tool_catalogsync_get_data()`, `tool_catalogsync_process_data()`, `tool_catalogsync_format_data()`, `tool_catalogsync_send_data()` e `tool_catalogsync_log_data()`. O prefixo faz as funções obedecerem uma convenção global, mas não cria arquitetura. Se todas representam um domínio coerente, provavelmente você já tem uma classe querendo nascer.

## Porque é errado criar um novo `locallib.php`

Aqui vale uma precisão importante. `locallib.php` é comum em componentes do core e em muitos plugins, principalmente para funções internas que não fazem parte da API pública do componente. Quando a lógica representa uma responsabilidade própria, porém, prefira classes autoloaded em `classes/` em vez de transformar `locallib.php` em um arquivo gigantesco de funções sem organização.

Historicamente `locallib.php` servia para funções internas que não precisavam morar em `lib.php`. Era melhor do que encher o arquivo global, mas continuava sendo uma biblioteca de funções e continuava exigindo inclusão manual. Hoje temos namespaces, autoloading e uma estrutura de classes muito mais clara, então criar um novo `locallib.php` costuma significar começar um projeto moderno com uma solução que já nasceu como compatibilidade histórica.

Existe ainda um problema de crescimento. No começo o arquivo tem três funções. Depois aparecem quinze, cada uma chamando a outra, algumas mexem em banco, outras formatam saída e outra faz HTTP. Como não há fronteira explícita de responsabilidade, `locallib.php` vira aquela gaveta da cozinha onde tudo cabe e nada é encontrado rapidamente. Uma classe pequena com um nome específico força você a responder uma pergunta útil, "o que este código realmente faz?".

Portanto, "errado" aqui não significa que o Moodle vai rejeitar seu plugin apenas por encontrar o arquivo. Significa que, para código novo, você está escolhendo conscientemente uma estrutura legada quando já existe uma alternativa melhor e recomendada.

## Migrando lógica de `lib.php` e `locallib.php` para classes

A migração não precisa ser uma reescrita heroica. Comece identificando grupos de funções que tratam do mesmo domínio e transforme esses grupos em classes pequenas. Se o plugin sincroniza catálogo, talvez exista uma classe `sync_manager`; se conversa com uma API externa, uma classe `client`; se normaliza registros recebidos, uma classe `mapper`; se persiste entidades próprias, talvez uma camada específica de repository ou Persistent API faça sentido.

O callback global continua existindo quando necessário, mas delega.

```php
function tool_catalogsync_some_legacy_callback($data) {
    $manager = new \tool_catalogsync\sync_manager();
    $manager->process($data);
}
```

O exemplo é propositalmente simples. Em um projeto real talvez você use injeção de dependência, factories ou uma API de componente mais bem definida, assuntos que veremos quando a arquitetura ficar maior. O ganho inicial já aparece porque a lógica sai do espaço global, passa a ser autoloaded e pode ser testada de maneira muito mais isolada.

Ao migrar, não crie uma classe chamada `utils` apenas para transportar o problema de lugar. Uma `utils` com cinquenta métodos estáticos é um `locallib.php` usando roupa nova. O objetivo não é cumprir uma estética de orientação a objetos, é separar responsabilidades de forma que nomes e dependências expliquem o sistema.

## `settings.php`

`settings.php` declara configurações administrativas do plugin e normalmente é processado durante a construção da árvore de administração. É aqui que você adiciona campos como URLs de integração, chaves configuráveis, limites, flags de comportamento e outras opções que pertencem à configuração global do componente.

Um exemplo simples poderia ser assim.

```php
$settings->add(new admin_setting_configtext(
    'tool_catalogsync/endpoint',
    get_string('endpoint', 'tool_catalogsync'),
    get_string('endpoint_help', 'tool_catalogsync'),
    '',
    PARAM_URL
));
```

A configuração possui nome completo `tool_catalogsync/endpoint`, o que permite ao Moodle armazená-la na tabela `config_plugins` associada ao componente. Em runtime, você poderia recuperá-la com `get_config('tool_catalogsync', 'endpoint')`.

Não confunda `settings.php` com uma página genérica de administração. Ele descreve settings que participam da infraestrutura de configurações do Moodle. Se você precisa de um painel complexo, tabela dinâmica, importador ou fluxo operacional, provavelmente deve criar uma página própria e apenas usar `settings.php` para registrar a entrada de navegação ou opções realmente configuráveis.

## `config_plugins`

Configurações específicas de componentes são armazenadas em `config_plugins`, enquanto configurações globais do core usam a estrutura geral de config. Você não deveria escrever SQL direto nessa tabela para salvar uma opção do plugin. Use `get_config()`, `set_config()` e `unset_config()` porque essas funções encapsulam a API e evitam dependência desnecessária da estrutura interna.

```php
$endpoint = get_config('tool_catalogsync', 'endpoint');
set_config('lastsync', time(), 'tool_catalogsync');
unset_config('legacyoption', 'tool_catalogsync');
```

Repare que uma coisa é uma opção que o administrador edita, outra é um estado interno pequeno que o plugin também decide armazenar como configuração. Ambos podem usar Config API, mas não transforme `config_plugins` em banco de dados improvisado. Se você começa a armazenar centenas de registros numerados em chaves como `item_1`, `item_2`, `item_3`, já passou do ponto em que uma tabela própria seria mais adequada.

Configuração funciona bem para valores discretos e relativamente pequenos que descrevem comportamento do componente. Dados de negócio, históricos, filas e relações pertencem ao banco modelado para isso.

## Cuidados com consultas dentro de `settings.php`

Este é um detalhe pequeno no código e grande em produção. `settings.php` pode ser incluído em situações nas quais a tela de configuração nem será exibida, portanto executar consultas incondicionais nesse arquivo significa adicionar custo a fluxos que talvez nunca usem o resultado.

Imagine montar um `select` buscando dez mil cursos toda vez que a árvore administrativa é construída. Em um ambiente pequeno você não percebe, em produção o menu administrativo vira responsável por uma consulta cara que aparece em requisições aparentemente não relacionadas. Por isso `settings.php` deve ser barato e previsível; se uma configuração precisa consultar muitos dados, desenhe o carregamento com cuidado em vez de fazer a consulta incondicionalmente a cada construção da administração.

A mesma ideia vale para chamadas externas. Não consulte ERP, API de pagamento ou serviço de vídeo durante o include de `settings.php`. Se precisa validar uma configuração, faça isso quando o valor for salvo ou em uma ação explícita. Configuração administrativa não deve transformar a montagem de navegação em teste de disponibilidade de sistemas externos.

## Diretório `classes/`

`classes/` é onde mora a maior parte do PHP moderno do plugin. O Moodle possui autoloading baseado em convenção e consegue carregar classes do namespace do componente sem que você precise espalhar `require_once` pelo projeto.


O ganho do autoloading vai além de remover includes. Ele torna a localização previsível. Se você vê `\tool_catalogsync\service\catalog_sync`, já sabe que a classe está dentro de `classes/service/`. Se vê `\tool_catalogsync\task\sync_catalog`, sabe onde procurar a tarefa. Essa previsibilidade vale muito quando você entra em um plugin que nunca viu antes.

Evite usar `classes/` como uma pasta onde tudo fica diretamente na raiz. Namespaces internos ajudam a comunicar intenção, mas também não invente cinco níveis de subpastas apenas para parecer organizado. Estrutura boa reduz esforço de navegação, não aumenta.

## Diretório `lang/`

`lang/` contém as strings traduzíveis do componente. O Moodle separa texto de interface do código e utiliza `get_string()` e mecanismos equivalentes em templates para carregar a tradução adequada ao idioma do usuário.

A estrutura convencional possui uma pasta por idioma e um arquivo com o nome do componente. Para nosso exemplo, `lang/en/tool_catalogsync.php` contém o inglês e uma tradução brasileira poderia existir em `lang/pt_br/tool_catalogsync.php` durante desenvolvimento ou distribuição, embora traduções oficiais de plugins publicados também possam seguir o fluxo de pacotes de idioma do Moodle.

Não escreva textos de interface diretamente no PHP só porque são pequenos. Hoje é "Salvar", amanhã aparece na aplicação móvel, em uma mensagem, em um teste ou em outro idioma. Quando você centraliza strings desde o começo, o custo de internacionalização praticamente desaparece.

## `lang/en/componente.php`

Todo plugin deve possuir ao menos o idioma inglês. O arquivo precisa usar o Frankenstyle correto e definir as strings esperadas pelo tipo, incluindo normalmente `pluginname`.

```php
<?php

$string['pluginname'] = 'Catalog synchronisation';
$string['endpoint'] = 'Service endpoint';
$string['endpoint_help'] = 'URL used to synchronise the external catalogue.';
```

Se o componente for `tool_catalogsync`, o arquivo deve se chamar `tool_catalogsync.php`. Uma diferença aparentemente inocente como `catalogsync.php` pode fazer você procurar por erro em cache quando o problema é simplesmente o arquivo não seguir a convenção.

Strings possuem regras próprias para placeholders, ajuda contextual e outros recursos que veremos em capítulo posterior, mas a disciplina começa aqui. Texto exibido ao usuário pertence ao sistema de idiomas, não a concatenações espalhadas por controllers e templates.

## Por que o inglês deve existir mesmo em plugin brasileiro

O inglês é o idioma base exigido para plugins Moodle. Mesmo que o projeto seja utilizado apenas no Brasil, `lang/en/` deve existir. Isso não significa obrigar o usuário brasileiro a usar inglês, mas fornecer ao Moodle uma base consistente e compatível com o ecossistema.

Existe também uma razão prática. O plugin pode ser instalado em um ambiente onde `pt_br` não está disponível, pode ser publicado no diretório de plugins, pode ser analisado por ferramentas de validação e pode receber contribuição de pessoas fora da instituição original. Ter o inglês como base evita transformar o idioma local em dependência técnica do componente.

Para quem desenvolve em português, uma boa prática é escrever as duas versões enquanto o contexto ainda está fresco. Deixar tradução para o final costuma produzir arquivos incompletos ou strings que já mudaram de significado durante o desenvolvimento.

## Diretório `pix/`

`pix/` guarda imagens e ícones pertencentes ao plugin e integrados ao mecanismo de pix do Moodle. O arquivo mais conhecido é o ícone do componente, especialmente em tipos que aparecem visualmente em seletores, listas ou navegação.

Não use `pix/` como uma pasta genérica de assets apenas porque contém imagens. O Moodle possui convenções próprias para ícones, temas podem interferir na apresentação e algumas APIs resolvem imagens pelo componente e nome do ícone. Quando você utiliza o mecanismo correto, o tema e o core conseguem participar da resolução em vez de você construir URL física manualmente.

Também evite depender de caminhos como `/local/meuplugin/pix/icon.svg` escritos diretamente no HTML. O Moodle já possui APIs para gerar URLs de recursos de forma segura e portável.

## `templates/` visão geral, aprofundado em Output API e Mustache

`templates/` contém templates Mustache usados pela Output API. O objetivo é separar a preparação dos dados da marcação HTML e evitar páginas em que PHP, consulta, regra de negócio e tags HTML aparecem misturados no mesmo arquivo.

Um template `templates/status.mustache` do nosso plugin pode ser renderizado como `tool_catalogsync/status`. A classe ou página prepara um contexto simples e o template decide como apresentar aquilo. em Output API e Mustache vamos entrar em `render_from_template()`, escaping, helpers, partials, classes de output e componentes visuais.

Por enquanto guarde apenas uma regra. Se você está concatenando dezenas de linhas de HTML dentro do PHP, provavelmente já passou da hora de criar um template. Mustache não resolve arquitetura sozinho, mas estabelece uma fronteira útil entre dados e apresentação.

## `amd/src/` visão geral, aprofundado em Output API e Mustache

`amd/src/` é a localização tradicional dos módulos JavaScript fonte em plugins Moodle. Durante o processo de build, o Grunt gera as versões distribuíveis em `amd/build/`, que são as utilizadas em produção.

No Moodle 3.5, JavaScript novo deve preferir módulos AMD em `amd/src/`, por isso vale aprender essa estrutura desde o primeiro plugin.

Não edite manualmente o arquivo de `amd/build/` como fonte principal. A origem deve continuar versionada em `amd/src/` e o build precisa ser reproduzível. Código gerado que não corresponde à fonte é uma maneira excelente de corrigir um bug hoje e fazê-lo reaparecer no próximo `grunt`.

## `cli/`

`cli/` é a convenção para scripts executados pela linha de comando. Eles servem para tarefas administrativas, importações, diagnósticos, reprocessamentos ou operações que não precisam de uma interface web e podem inclusive lidar melhor com processos longos.

Uma vantagem do CLI é evitar limites e particularidades da requisição HTTP, mas isso não transforma qualquer processo pesado em script manual. Se a tarefa precisa executar periodicamente, Scheduled Task é melhor; se precisa entrar numa fila após uma ação do usuário, Adhoc Task provavelmente é melhor. CLI faz sentido quando existe uma operação deliberada que um administrador ou processo externo executará por comando.

A pasta também facilita descoberta. Em vez de esconder scripts executáveis na raiz do plugin, quem mantém o sistema sabe que pode procurar em `cli/` por ferramentas operacionais.

## Como criar scripts CLI corretamente

Um script CLI deve declarar `CLI_SCRIPT` antes de carregar `config.php`, porque isso informa ao Moodle que a execução está fora do ambiente web. Também deve utilizar as funções de `clilib.php` para parâmetros, ajuda, códigos de saída e interação consistente.

```php
<?php

define('CLI_SCRIPT', true);

require(__DIR__ . '/../../../../../config.php');
require_once($CFG->libdir . '/clilib.php');

[$options, $unrecognized] = cli_get_params(
    [
        'help' => false,
        'force' => false,
    ],
    [
        'h' => 'help',
        'f' => 'force',
    ]
);
```

O caminho até `config.php` depende do tipo do plugin, portanto não copie cegamente a quantidade de `../` de outro componente. Use `__DIR__` para construir caminhos de forma previsível e não dependa do diretório atual do shell.

Também trate segurança. Um script CLI executado pelo usuário do servidor pode fazer operações muito poderosas, então valide argumentos, confirme estados importantes quando apropriado e produza mensagens que permitam auditoria. "Roda apenas no terminal" não significa "não precisa de validação".

## `tests/` visão geral, aprofundado PHPUnit e Behat

`tests/` contém os testes automatizados do plugin. PHPUnit cobre unidades e integrações no ambiente de testes do Moodle, enquanto arquivos `.feature` de Behat descrevem jornadas de interface e aceitação.

Neste ponto você não precisa dominar a infraestrutura, mas deveria se acostumar com a ideia de que testes fazem parte da estrutura do componente, não são uma atividade opcional que aparece no final quando alguém pergunta por cobertura. Quando uma regra importante nasce, é muito mais barato criar o teste junto do que tentar reconstruir todos os cenários meses depois.

PHPUnit e Behat vão aprofundar generators, `advanced_testcase`, reset de banco, mocks, Gherkin, Selenium e testes JavaScript. Aqui basta reconhecer que um plugin profissional costuma carregar sua própria suíte e que o diretório `tests/` não deve conter scripts manuais disfarçados de teste automatizado.

## `thirdpartylibs.xml`

`thirdpartylibs.xml` declara bibliotecas de terceiros distribuídas dentro do plugin. Ele informa localização, nome, versão e licença e ajuda as ferramentas do Moodle a reconhecerem código que não deve ser analisado como se tivesse sido escrito segundo o Coding Style do core.

```php
<?xml version="1.0"?>
<libraries>
    <library>
        <location>vendor/example/library/</location>
        <name>Example Library</name>
        <version>2.4.0</version>
        <license>MIT</license>
        <licenseversion></licenseversion>
    </library>
</libraries>
```

Não basta colocar uma pasta `vendor/` no ZIP e seguir em frente. Código de terceiros traz responsabilidade de licença, atualização e segurança. A documentação recomenda ainda um `readme_moodle.txt` com origem e instruções de atualização quando a biblioteca é incorporada ao componente.

## Quando declarar bibliotecas de terceiros

Declare bibliotecas cujo código é distribuído junto com o plugin e não é mantido pelo próprio projeto Moodle. Antes disso, confira se o core já fornece a dependência. Embutir uma segunda versão de uma biblioteca que o Moodle já carrega pode criar conflitos difíceis de diagnosticar e aumenta a superfície de manutenção.

Verifique a licença. Plugins distribuídos no ecossistema Moodle precisam respeitar compatibilidade com GPLv3 e uma biblioteca incompatível não pode simplesmente ser empacotada junto porque tecnicamente funciona. Licenciamento faz parte da engenharia do pacote.

Também diferencie dependência de desenvolvimento de biblioteca entregue em runtime. Ferramentas usadas apenas para build ou CI não precisam necessariamente aparecer como biblioteca incorporada ao plugin. `thirdpartylibs.xml` descreve código de terceiros presente no componente distribuído.

## Arquivos de `db/`


Isso explica uma regra importante. Arquivos como `db/access.php`, `db/events.php`, `db/tasks.php` e semelhantes não devem virar bibliotecas com includes e lógica arbitrária. O core os processa em contextos próprios, muitos deles sensíveis a performance, instalação e upgrade. Pense neles como configuração em PHP, não como ponto de execução geral do plugin.

Outra consequência é que várias alterações em `db/` exigem incremento de `$plugin->version` e execução do upgrade para que o Moodle reprocesse e persista as novas declarações. Salvar o arquivo e limpar cache nem sempre é suficiente.

## `db/install.xml` visão geral, aprofundado em Banco de Dados e XMLDB

`db/install.xml` descreve o schema que uma instalação nova do plugin deve criar. Tabelas, campos, chaves e índices ficam representados no formato XMLDB do Moodle, que permite ao core gerar SQL compatível com os bancos suportados.

Não escreva esse arquivo à mão como se fosse um XML qualquer. O Moodle possui o XMLDB Editor exatamente para criar e alterar estruturas seguindo as regras de portabilidade. Ele também consegue gerar trechos de upgrade quando você modifica o schema.

em Banco de Dados e XMLDB vamos trabalhar com tipos, índices, foreign keys e mudanças de estrutura em detalhe. Agora basta guardar uma relação fundamental. `install.xml` precisa representar o estado final atual de uma instalação limpa, enquanto `upgrade.php` descreve o caminho necessário para levar instalações antigas até esse mesmo estado.

## `db/install.php`


Um exemplo seria inicializar algum dado que não pode ser expresso no XMLDB ou executar uma preparação específica que só faz sentido na primeira instalação. Mesmo assim, use com parcimônia. Configurações padrão muitas vezes podem ser declaradas de outras formas e inserir dados fixos sem necessidade pode complicar upgrades e reinstalações.

O ponto mais importante é que `install.php` não é executado durante upgrades. Se você adicionou uma ação ali hoje e espera que sites que instalaram o plugin seis meses atrás também a executem, isso não acontecerá. Para instalações existentes o caminho é `db/upgrade.php`.

## Diferença entre `install.xml` e `install.php`


Se você precisa criar tabela, campo, índice ou chave, a resposta é `install.xml`, não escrever `$DB->execute('CREATE TABLE...')` em `install.php`. Fazer DDL manual perde portabilidade e ignora a DDL API e XMLDB que existem justamente para lidar com diferentes bancos.

Se precisa criar um registro inicial que depende da tabela já existente, aí `install.php` pode ser apropriado. Mesmo nesse caso pense se o dado realmente precisa existir fisicamente ou se um valor default em runtime resolveria melhor.

## `db/upgrade.php` visão geral, aprofundado Banco de Dados e XMLDB e Compatibilidade e Manutenção entre Versões

`db/upgrade.php` descreve passos incrementais para instalações que já possuem uma versão anterior do plugin. O Moodle chama a função `xmldb_[tipo]_[nome]_upgrade()` e compara a versão instalada com os blocos condicionais para executar apenas o que ainda não foi aplicado.

É aqui que você adiciona campos, migra dados, remove configurações antigas e transforma estruturas existentes. Cada passo termina com um savepoint e o número de versão correspondente, permitindo ao Moodle registrar até onde chegou.

Não edite um passo de upgrade já distribuído como se fosse uma migration ainda não publicada. Se uma versão está em produção, aquele código faz parte do histórico. Mudanças novas devem receber número novo e novo bloco, caso contrário você cria comportamentos diferentes para sites que passaram pelo upgrade antes e depois da edição.

em Compatibilidade e Manutenção entre Versões vamos discutir branches e compatibilidade com muito mais cuidado, mas desde já trate `upgrade.php` como histórico de migração, não como fotografia do schema atual.

## `db/uninstall.php`


Não coloque nele uma tentativa manual de apagar todas as tabelas definidas em `install.xml`. O Moodle já conhece o schema do componente e cuida da remoção das estruturas próprias. Código de uninstall deve existir para aquilo que está fora desse fluxo padrão.

Também pense em dependências externas com cuidado. Se a desinstalação chama uma API remota e essa API está fora do ar, você quer realmente impedir que o administrador remova o plugin? Em muitos casos é melhor registrar a falha e permitir limpeza local do que tornar a instalação refém de um serviço externo.

## `db/access.php` visão geral, aprofundado em Segurança

`db/access.php` declara capabilities do plugin. Cada capability possui nome Frankenstyle, tipo de operação, nível de contexto esperado, riscos e archetypes padrão.

```php
$capabilities = [
    'tool/catalogsync:manage' => [
        'riskbitmask' => RISK_CONFIG,
        'captype' => 'write',
        'contextlevel' => CONTEXT_SYSTEM,
        'archetypes' => [
            'manager' => CAP_ALLOW,
        ],
    ],
];
```

Essa declaração não substitui a verificação de autorização. Ela apenas registra a capability e seus defaults. A página ou serviço ainda precisa chamar `require_capability()` ou `has_capability()` no contexto correto.

Como alterações de capabilities precisam ser processadas pelo sistema de upgrade, lembre de incrementar a versão do plugin quando modificar `db/access.php` de forma relevante.

## `db/events.php` visão geral, aprofundado em Events e Callbacks

`db/events.php` registra observers para eventos disparados pelo Moodle ou por outros componentes. O arquivo informa qual evento será observado e qual callback deve ser chamado.

```php
$observers = [
    [
        'eventname' => '\\core\\event\\course_created',
        'callback' => '\\tool_catalogsync\\observer::course_created',
    ],
];
```

A classe callback deveria permanecer autoloaded e conter apenas o necessário para reagir ao evento. Se o processamento é pesado, muitas vezes o observer deve apenas registrar o trabalho e enviar o restante para uma Adhoc Task, evitando transformar a ação original do usuário em um processo demorado.


## `db/tasks.php` visão geral, aprofundado em Cron, Tasks e Processamento Assíncrono

`db/tasks.php` declara Scheduled Tasks do plugin. O arquivo descreve a classe da tarefa, habilitação e frequência padrão, enquanto a lógica real fica em uma classe dentro de `classes/task/` que estende a base apropriada.

```php
$tasks = [
    [
        'classname' => '\\tool_catalogsync\\task\\sync_catalog',
        'blocking' => 0,
        'minute' => '*/15',
        'hour' => '*',
        'day' => '*',
        'month' => '*',
        'dayofweek' => '*',
    ],
];
```

O administrador pode alterar a frequência através da interface de tarefas agendadas, portanto não presuma em código que ela sempre rodará exatamente no intervalo default que você escreveu. Uma task boa deve ser idempotente e lidar com atrasos, falhas e execuções subsequentes.

Adhoc Tasks não são declaradas em `db/tasks.php`; elas são colocadas na fila por código. Veremos as duas abordagens com mais profundidade em Cron, Tasks e Processamento Assíncrono.

## `db/caches.php` visão geral, aprofundado em Cache e Performance

`db/caches.php` declara definições do Moodle Universal Cache. Você informa o nome da área e o modo de cache, podendo adicionar requisitos e características que permitem ao administrador mapear aquela definição para stores adequadas.

```php
$definitions = [
    'catalogmetadata' => [
        'mode' => cache_store::MODE_APPLICATION,
    ],
];
```

Depois disso o código usa a Cache API para obter a instância, em vez de conversar diretamente com Redis ou outra implementação. Essa separação é essencial porque o backend real é decisão de infraestrutura do site.

Não crie cache antes de saber o que invalida o dado. Cache sem estratégia de invalidação apenas transforma informação errada em informação errada mais rápida. Cache e Performance vai trabalhar exatamente esse ponto.

## `db/messages.php` visão geral, aprofundado em APIs Transversais Essenciais

`db/messages.php` declara os message providers produzidos pelo componente. Isso permite que o Moodle saiba quais categorias de mensagem o plugin pode enviar e apresente preferências adequadas ao usuário e ao administrador.

A declaração não envia mensagem. O envio acontece através da Message API, normalmente com `\core\message\message` e `message_send()`. O arquivo apenas registra os providers e suas capabilities associadas quando necessário.

Se seu plugin manda e mail diretamente com `mail()` porque "é só uma notificação", ele ignora preferências, outputs configurados e infraestrutura que o Moodle já possui. APIs Transversais Essenciais vai mostrar por que Message API é mais do que um wrapper de e mail.

## `db/services.php` visão geral, aprofundado em Web Services e Integrações

`db/services.php` registra funções externas e, quando necessário, serviços que agrupam essas funções. No Moodle 3.5 é comum manter a implementação em `externallib.php`, usando uma classe que estende `external_api` e métodos acompanhados por `*_parameters()` e `*_returns()`.

```php
$functions = [
    'tool_catalogsync_sync_now' => [
        'classname' => 'tool_catalogsync_external',
        'methodname' => 'sync_now',
        'classpath' => 'admin/tool/catalogsync/externallib.php',
        'description' => 'Synchronise the catalogue now.',
        'type' => 'write',
        'ajax' => true,
    ],
];
```

A função externa continua responsável por validar parâmetros, contexto e capability antes de delegar a regra de negócio para uma classe interna.

## Arquivos dependentes do tipo de plugin

Até aqui vimos arquivos que podem aparecer em muitos tipos. Agora entram arquivos cujo significado depende diretamente do contrato escolhido em Tipos de Plugins Moodle. Um Activity Module possui `mod_form.php` e normalmente `view.php`; um enrolment plugin pode precisar de uma classe específica em `lib.php`; um block trabalha com sua classe `block_nome`; um auth implementa outra base completamente diferente.

Isso é mais um motivo para não criar plugins copiando diretórios inteiros. Um arquivo obrigatório para `mod` pode não ter qualquer significado em `tool`, e um callback esperado em `enrol` pode ser irrelevante em `local`. A documentação do tipo deve ser lida junto da documentação de arquivos comuns.

Nos tópicos seguintes vamos olhar para alguns nomes que você encontrará com frequência, mas apenas como mapa. Os capítulos específicos entrarão na implementação correta.

## `mod_form.php` Activity Module, aprofundado em Módulos de Atividade

`mod_form.php` define o formulário utilizado para criar e editar uma instância de Activity Module. A classe estende `moodleform_mod` e trabalha com elementos padrões do curso, intro, grupos, conclusão e outras configurações compartilhadas pelas atividades.

Não confunda esse formulário com qualquer formulário usado dentro da atividade. Ele trata a configuração da instância no curso. Um formulário de resposta do aluno, por exemplo, pode usar Forms API em outra classe e seguir ciclo diferente.

Em um Activity Module do Moodle 3.5, o formulário de criação e edição fica em `mod_form.php`, na raiz do plugin, e a classe segue o contrato `mod_[modname]_mod_form`. Vamos trabalhar esse detalhe em Módulos de Atividade para não misturar regra específica de `mod` com estrutura genérica.

## `view.php` Activity Module, aprofundado em Módulos de Atividade

`view.php` é tradicionalmente a página principal aberta quando o usuário acessa uma instância da atividade através do curso. Ele recebe o course module id, carrega curso e instância, valida login, configura `$PAGE`, verifica capabilities e renderiza a interface correspondente.

O arquivo não deveria conter toda a aplicação. Pense nele como controller de entrada. Ele resolve contexto da requisição e chama classes que executam regras ou preparam saída. Um `view.php` de oitocentas linhas com SQL, HTML, upload e regras de negócio não fica aceitável apenas porque esse nome é esperado pelo Moodle.

Alguns módulos podem ainda controlar se possuem ou não link de visualização através de features específicas, portanto até a existência prática de `view.php` deve ser entendida dentro do contrato do módulo.

## `index.php` em tipos que possuem página de listagem

`index.php` historicamente representa uma página de listagem ou entrada dentro de vários tipos. Em Activity Modules, por exemplo, pode listar instâncias daquele módulo em um curso; em outros componentes pode servir como tela inicial do plugin.

Não existe uma regra universal dizendo que todo plugin precisa de `index.php`. Criar um arquivo vazio apenas para "completar a estrutura" não agrega nada. A presença depende do fluxo de navegação e das convenções do tipo.

Quando existir, trate `index.php` como qualquer endpoint web Moodle. Carregue `config.php`, valide parâmetros, login e capability, configure contexto e URL e só então produza output. Nome convencional não reduz requisitos de segurança.

## `edit.php`

`edit.php` é um nome convencional usado por muitos componentes para telas de edição, mas não é um arquivo mágico reconhecido universalmente pelo core. Seu comportamento depende do plugin que o implementa.

Isso parece detalhe, mas evita um erro comum. Alguns desenvolvedores olham para arquivos do core e imaginam que criar `edit.php` automaticamente conecta o plugin a uma API. Na maioria dos casos você está apenas escolhendo um nome previsível para um endpoint próprio.

O valor da convenção está na leitura. Se vejo `edit.php`, espero encontrar fluxo de edição; se vejo `manage.php`, espero gestão; se vejo `view.php`, espero visualização. Use nomes coerentes, mas não atribua ao nome poderes que pertencem ao código ou ao contrato do tipo.

## `manage.php`

`manage.php` segue a mesma lógica. É uma convenção comum para páginas de gerenciamento de listas, configurações operacionais ou entidades do plugin. Ele não substitui `settings.php` e também não possui contrato universal.

Um plugin pode ter `manage.php` para permitir que um administrador gerencie integrações cadastradas enquanto `settings.php` contém apenas configurações globais como timeout e chave de API. Essa separação deixa clara a diferença entre configuração estática e dados operacionais.

Novamente, segurança e Page API continuam obrigatórias. Um nome administrativo não concede permissão automaticamente. Verifique contexto e capability explicitamente.

## `lib.php` com callbacks obrigatórios de determinados tipos

Alguns tipos ainda têm partes essenciais do contrato implementadas como métodos ou funções em `lib.php`. Activity Modules, enrolment plugins e outros componentes históricos possuem exemplos claros. Isso não contradiz a recomendação de manter `lib.php` pequeno, porque a regra é conservar ali somente o ponto de entrada que o core ainda procura.


Quando o callback obrigatório é grande, delegue para classes. Isso permite respeitar o contrato externo sem sacrificar a organização interna.

## `backup/moodle2/` visão geral, aprofundado em Backup e Restore

`backup/moodle2/` contém classes que permitem ao plugin participar do sistema de backup e restore. Activity Modules são o exemplo mais conhecido, mas o mecanismo possui pontos de integração para vários tipos.

O backup precisa saber quais dados pertencem ao componente, como eles se relacionam, quais IDs precisam ser anotados, quais arquivos devem ser incluídos e como tudo será reconstruído no destino. Não é uma simples cópia de tabelas.

em Backup e Restore veremos `backup_nested_element`, mappings, arquivos, duplicação de atividades. Aqui guarde apenas que qualquer plugin que armazena conteúdo transportável precisa investigar como participar corretamente desse ciclo, em vez de assumir que o backup do curso magicamente descobrirá suas tabelas.

## `classes/event/` aprofundado em Events e Callbacks

`classes/event/` contém classes de eventos próprios disparados pelo plugin. Elas normalmente estendem a infraestrutura de Events do Moodle e descrevem contexto, objectid, informações relacionadas e propriedades necessárias ao log e aos observers.

Não coloque observers nesse diretório apenas porque eles reagem a eventos. O diretório representa classes de eventos do componente, enquanto observers podem estar em outra classe apropriada e são registrados por `db/events.php`.

Essa separação parece pedante até um plugin crescer. Depois, distinguir "eventos que eu disparo" de "código que reage a eventos" torna a navegação muito mais clara.

## `classes/task/` aprofundado em Cron, Tasks e Processamento Assíncrono

`classes/task/` contém classes de Scheduled e Adhoc Tasks. Uma Scheduled Task declarada em `db/tasks.php` aponta para uma classe nesse namespace, enquanto uma Adhoc Task é criada e enfileirada por código.

A classe deve concentrar processamento que pode rodar fora da requisição original e precisa assumir que falhas acontecem. Não dependa da sessão do usuário que iniciou a ação, não guarde objetos complexos sem necessidade em custom data e pense em idempotência desde o começo.

Cron, Tasks e Processamento Assíncrono vai mostrar locks, retry, batching e concorrência, porque mover código para task sem pensar nesses detalhes só transfere o problema do navegador para o cron.

## `externallib.php` e funções externas, aprofundado em Web Services e Integrações

No Moodle 3.5 é comum implementar External Functions em `externallib.php`, usando uma classe como `local_exemplo_external` que estende `external_api`. Cada operação possui o método da função e os métodos correspondentes `*_parameters()` e `*_returns()`.

O `db/services.php` registra `classname`, `methodname` e, quando necessário, `classpath`. A lógica de negócio não deve morar inteira em `externallib.php`; a função externa valida parâmetros, contexto e permissões e então chama classes internas do componente.
## `classes/output/` aprofundado em Output API e Mustache

`classes/output/` contém classes voltadas à preparação de dados para apresentação, incluindo renderables, templatable e outros objetos usados pela Output API. É um bom lugar para transformar entidades e estado interno em um contexto simples que o Mustache consegue renderizar.

A regra mais valiosa é evitar que o template precise conhecer banco, capabilities ou detalhes de domínio. Ele recebe dados já preparados e se concentra na apresentação. Da mesma forma, a classe de output não deveria virar serviço de negócio apenas porque produz o array final.

em Output API e Mustache vamos trabalhar essa fronteira com exemplos completos e também discutir quando um renderer próprio ainda faz sentido. Por enquanto, reconheça `classes/output/` como parte de uma arquitetura em que HTML não precisa morar dentro de controllers PHP.

## Um mapa de plugin que cresce sem virar bagunça

Depois de tantos arquivos, é natural querer uma árvore completa. O risco é interpretar essa árvore como checklist e sair criando tudo de uma vez. Use o exemplo apenas como mapa de possibilidades para um admin tool que cresceu ao longo do tempo.

```
catalogsync/
|-- amd/
|   `-- src/
|       `-- status.js
|-- backup/
|   `-- moodle2/
|-- classes/
|   |-- external/
|   |   `-- sync_now.php
|   |-- output/
|   |   `-- status.php
|   |   `-- provider.php
|   |-- task/
|   |   `-- sync_catalog.php
|   |-- client.php
|   `-- sync_manager.php
|-- cli/
|   `-- sync.php
|-- db/
|   |-- access.php
|   |-- caches.php
|   |-- services.php
|   |-- tasks.php
|   `-- upgrade.php
|-- lang/
|   `-- en/
|       `-- tool_catalogsync.php
|-- templates/
|   `-- status.mustache
|-- tests/
|-- settings.php
|-- thirdpartylibs.xml
`-- version.php
```

Perceba o que não apareceu. Não criamos `locallib.php`, não inventamos `helpers.php`, não colocamos um `includes/` genérico e não criamos arquivo `db/` que o plugin não usa. A estrutura cresceu acompanhando responsabilidades concretas.

Esse é o padrão que vale levar para os próximos capítulos. Cada vez que uma funcionalidade nova aparecer, procure primeiro se o Moodle já possui uma API e um local convencional para ela. Se possui, use a convenção. Se não possui, crie uma classe interna com responsabilidade clara. O que devemos evitar é aquela arquitetura em que toda novidade vira mais uma função em `lib.php` ou mais um arquivo solto na raiz.

## O primeiro plugin corretamente começa antes da primeira tela

É comum sentir que o plugin só começou de verdade quando aparece uma página no navegador. Na prática ele começa antes, no momento em que o tipo é escolhido, o componente recebe um nome estável, o `version.php` declara compatibilidade de forma honesta e a estrutura passa a separar contrato com o core de implementação interna.


Se a base estiver errada, cada uma dessas APIs vira mais uma exceção. O desenvolvedor passa a perguntar "onde enfio isso?" e a resposta quase sempre acaba sendo `lib.php`, `locallib.php` ou algum arquivo `functions.php`. O Moodle funciona melhor quando você deixa o próprio framework responder onde cada responsabilidade mora.

No próximo capítulo entraremos em qualidade de código desde o início, porque estrutura correta sem Coding Style, tipagem, PHPDoc, análise estática e revisão ainda permite criar um plugin perfeitamente organizado em pastas e difícil de manter por dentro. A diferença é que agora teremos uma base onde essas regras fazem sentido.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
