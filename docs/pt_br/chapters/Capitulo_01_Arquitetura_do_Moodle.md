{% raw %}

# 1 ARQUITETURA DO MOODLE

![Arquitetura do Moodle](image/cap01-arquitetura-moodle.png)

Antes de criar um plugin, alterar uma página ou tentar descobrir por que alguma coisa funciona no seu Moodle e quebra no Moodle do cliente, vale entender o caminho que o sistema percorre até entregar uma página pronta ao navegador. Parece básico, afinal estamos falando de uma aplicação PHP, mas é justamente nesse ponto que começam muitas soluções estranhas, como incluir arquivo na mão porque a classe "não carregou", consultar uma tabela diretamente porque parecia mais rápido, colocar uma configuração qualquer dentro de `$CFG` ou criar um endpoint que funciona sem contexto e sem verificar quem está acessando.

Vamos começar por uma URL comum, como `https://ead.exemplo.com/mod/forum/view.php?id=42`. Quando você digita isso no navegador, o Moodle ainda não recebeu nada, `$DB` não existe, `$USER` não foi carregado e nem sequer há garantia de que o PHP será executado, porque antes de tudo existe um servidor web decidindo o que fazer com aquela requisição. A partir desse ponto vamos acompanhar a execução até o HTML final e, no caminho, entender onde entram `config.php`, `lib/setup.php`, `$CFG`, as globais, os contextos, o Moodledata, o sistema de componentes, o autoloading e o Routing Engine das versões modernas.

O objetivo deste capítulo não é decorar uma árvore de diretórios, pois isso você resolve com um `find`, com a busca da IDE ou olhando o código, e sim entender o motivo de cada coisa existir onde existe. Quando esse mapa fica claro, ler o core deixa de parecer uma arqueologia de vinte anos de PHP e passa a fazer bastante sentido, inclusive nas partes antigas que ainda convivem com APIs modernas.

## 1.1 Como uma requisição chega ao Moodle

Abra no navegador `https://ead.exemplo.com/mod/forum/view.php?id=42`. A primeira reação de quem está começando costuma ser imaginar que o Moodle recebe essa URL, encontra o fórum de id 42 e monta a página, mas há um pedaço importante antes disso, pois quem recebe a conexão é o Apache, Nginx ou outro servidor web configurado para aquele domínio.

O servidor analisa o host solicitado, o caminho `/mod/forum/view.php`, as regras de reescrita de URL, a configuração do PHP e o diretório que foi definido como raiz pública. Se o caminho aponta para um arquivo PHP que pode ser executado, a requisição normalmente segue para o PHP-FPM ou outro handler equivalente, e somente nesse momento o script começa a rodar. Isso explica uma quantidade razoável de problemas que parecem ser do Moodle e não são, como `404` antes de qualquer código ser executado, download do arquivo PHP em vez da execução, `403` provocado pelo servidor, erro de `DocumentRoot` e regras de `rewrite` que mandam a requisição para o lugar errado.

Quando o PHP finalmente começa a executar `mod/forum/view.php`, ainda temos apenas PHP puro. O script precisa carregar o ambiente do Moodle e é por isso que praticamente todo endpoint tradicional começa chegando ao `config.php`. Esse arquivo inicia a sequência que prepara banco, cache, sessão, usuário, componentes, autoloading e as estruturas que as APIs do Moodle esperam encontrar prontas.

Aqui já aparece uma regra prática importante. Se uma página do seu plugin usa `$DB`, `get_string()`, `require_login()`, `moodle_url` ou qualquer classe do core antes de incluir o `config.php`, a página está invertendo a ordem natural das coisas. Pode até existir uma gambiarra que faça funcionar em determinado cenário, mas você estará tentando usar o Moodle antes de inicializar o Moodle, e isso normalmente termina em código difícil de manter.

Nas versões modernas existe ainda o Routing Engine, portanto nem toda URL precisa apontar diretamente para um arquivo PHP existente. Uma rota pode ser resolvida pelo mecanismo de roteamento e terminar em uma classe controladora, enquanto os endpoints tradicionais continuam funcionando por compatibilidade e porque uma parte enorme do core ainda usa esse modelo. Durante bastante tempo você vai encontrar os dois estilos no mesmo Moodle e precisa saber ler ambos sem assumir que um substituiu completamente o outro.

## 1.2 `config.php` e inicialização do ambiente

Se você copiar o código do Moodle para duas máquinas diferentes, o conjunto de arquivos pode ser exatamente o mesmo e, ainda assim, cada instalação apontar para banco, domínio e Moodledata diferentes. Quem faz essa ligação entre o código genérico e uma instalação concreta é o `config.php`.

É nele que aparecem informações que o Moodle precisa conhecer cedo demais para buscar no próprio banco, como o tipo de SGBD, host, nome da base, usuário, senha, prefixo das tabelas, `$CFG->wwwroot` e `$CFG->dataroot`. Também podem existir configurações de infraestrutura, proxy, caminhos específicos, cache e outras opções que precisam estar disponíveis antes de a aplicação conseguir carregar o restante da configuração persistida.

Isso é diferente das configurações administrativas normais. Quando você altera algo em Administração do site, grande parte dessas opções vai para `config` ou `config_plugins` no banco e depois é carregada pelo bootstrap, enquanto o `config.php` continua reservado principalmente ao que precisa existir antes desse acesso ou ao que o administrador quer fixar no nível da infraestrutura. Colocar todo tipo de configuração funcional ali porque "é mais fácil" funciona contra a arquitetura do Moodle e dificulta manutenção, migração e até suporte em ambientes diferentes.

No final do arquivo há o ponto que realmente coloca o Moodle em movimento, pois o `config.php` conduz ao setup central. Você não deveria copiar esse processo para o seu plugin nem tentar incluir manualmente dez bibliotecas do core para montar um "bootstrap menor", porque o Moodle tem uma ordem de inicialização e várias APIs assumem que essa ordem foi respeitada.

A partir do Moodle 5.1 surgiu ainda uma diferença física importante entre a raiz da instalação e a parte publicada pelo servidor web. O `config.php` pode ficar fora do diretório `public/`, enquanto o `DocumentRoot` aponta para `public/`, o que melhora a separação entre código interno e conteúdo acessível pela web, mas também quebra uma quantidade enorme de tutorial antigo que ensinava simplesmente a jogar a pasta inteira do Moodle dentro do `public_html` e pronto.

## 1.3 Entendendo o `$CFG`

Depois que o Moodle está inicializado, você começa a encontrar `$CFG` em todos os cantos do código e é fácil concluir que ele é apenas o objeto criado pelo `config.php`. Não é bem assim. O `config.php` começa a preencher `$CFG`, mas o processo de inicialização acrescenta informações calculadas e carrega configurações globais persistidas, portanto o objeto que você usa durante uma página já representa uma visão muito mais completa do ambiente.

É comum acessar propriedades como `$CFG->wwwroot`, `$CFG->dirroot`, `$CFG->dataroot`, `$CFG->libdir` e várias opções globais. Em código antigo também há muitos acessos diretos a propriedades configuradas no banco, porque esse era o padrão durante anos, mas em código de plugin moderno você deve preferir `get_config()` quando estiver lidando com configuração do próprio componente. Isso deixa explícito de onde o dado vem e evita transformar `$CFG` em uma sacola onde todo mundo coloca alguma coisa.

Aliás, essa sacola é uma tentação frequente. Você tem `$CFG` global em praticamente todo lugar, precisa compartilhar um valor entre duas partes do código e pensa "vou guardar aqui `$CFG->meuvalor`". Não faça isso. O objeto pertence ao core, nomes podem ganhar significado no futuro e quem encontrar aquela propriedade depois vai pressupor que ela veio da configuração oficial do Moodle, quando na verdade foi criada no meio de uma requisição por algum plugin.

Outro ponto que passou a merecer atenção a partir da reorganização iniciada no Moodle 5.1 é a diferença entre a raiz da instalação e o diretório público. Existe uma nova referência para a raiz real da instalação, enquanto `$CFG->dirroot` continua representando a raiz do código Moodle que interessa à execução tradicional. Não tente reconstruir esses caminhos usando `dirname(dirname(...))` porque "sempre funcionou". Quando o core expõe o caminho correto, use o caminho correto e deixe a estrutura física evoluir sem obrigar seu plugin a adivinhar onde ele foi instalado.

## 1.4 O que acontece em `lib/setup.php`

Se você abrir `lib/setup.php` pela primeira vez e tentar ler de cima a baixo como quem lê um controller pequeno, provavelmente vai desistir cedo, e com razão, porque aquele arquivo faz parte do coração do bootstrap e carrega decisões acumuladas durante muitos anos de Moodle. O importante no início não é decorar cada linha, mas entender o que você recebe depois que ele termina.

É durante esse processo que o Moodle prepara as bibliotecas essenciais, configura tratamento de erros, registra autoloaders, inicializa a camada de banco, prepara cache, sessão e usuário, carrega a configuração necessária e cria o ambiente no qual as demais APIs passam a ser confiáveis. Em outras palavras, antes do bootstrap você está no PHP e depois dele você está dentro do Moodle.

Essa diferença fica fácil de perceber com um teste simples. Crie um PHP vazio fora do fluxo normal e tente executar `$DB->get_record(...)`. Não existe `$DB`. Tente chamar `get_string()`. A função pode nem estar disponível. Inclua corretamente o `config.php` e a situação muda, porque o setup montou o ambiente no qual essas estruturas fazem sentido.

Nas versões com a nova organização de diretórios há ainda uma camada de compatibilidade para preservar caminhos antigos durante a transição. Isso é um detalhe interno do core e justamente por isso não deveria virar responsabilidade do plugin. Seu código deve entrar pelo `config.php` ou pelas APIs previstas para aquele tipo de execução e deixar o Moodle cuidar da própria inicialização.

Uma dica que economiza tempo quando você está investigando problema de bootstrap é usar a IDE para seguir o `require` a partir do `config.php` e observar em que momento determinada global ou constante passa a existir. É muito mais produtivo do que sair adicionando `require_once` até o erro desaparecer, porque fazer o erro sumir não significa que a aplicação foi inicializada corretamente.

## 1.5 As globais `$DB`, `$PAGE`, `$OUTPUT`, `$USER`, `$COURSE`

Moodle moderno usa classes, namespaces, injeção de dependência em algumas áreas e uma quantidade cada vez maior de serviços, mas ainda convive com globais muito importantes, e tentar fingir que elas não existem só porque "global é feio" não ajuda. O caminho melhor é entender o papel de cada uma e não usá-las como se fossem intercambiáveis.

```php
$DB é a porta principal para a DML API, portanto consultas, inserções, alterações e exclusões no banco passam por ele em vez de uma conexão PDO criada pelo plugin. $USER representa o usuário corrente já carregado para aquela execução, enquanto $COURSE representa o curso corrente conhecido pela página e nem sempre será o curso que você imaginou apenas porque recebeu um courseid por parâmetro.
$PAGE guarda o estado da página que está sendo preparada. Nele entram URL canônica, contexto, layout, título, heading, course module, curso, requisitos JavaScript e outras informações que o renderer e o tema precisam para montar a resposta corretamente. $OUTPUT, por sua vez, é o renderer principal associado à página e ao tema corrente, portanto é nele que você encontra header(), footer(), notificações e métodos de saída do core.
```

Um erro clássico é tratar essas globais como armazenamento genérico. Você carrega um curso e sobrescreve `$COURSE` apenas porque quer facilitar três linhas abaixo, altera alguma propriedade de `$USER` sem persistir corretamente ou usa `$OUTPUT` antes de preparar `$PAGE`. Esse tipo de atalho funciona até encontrar uma página mais complexa, um tema diferente ou uma chamada AJAX que não segue exatamente o mesmo fluxo.

Use as globais para aquilo que elas representam e, quando estiver escrevendo classes de domínio, serviços ou código testável, prefira receber dependências e dados explicitamente sempre que possível. O fato de existir uma global acessível não significa que toda classe deva depender dela.

## 1.6 O ciclo de vida de uma página Moodle

Uma página Moodle tradicional normalmente segue uma sequência que você vai reconhecer depois de olhar meia dúzia de arquivos do core. Primeiro vem o `config.php`, depois os parâmetros são lidos, os registros necessários são carregados, o acesso é validado, `$PAGE` é configurado e somente então a saída começa.

Imagine uma página do plugin local_exemplo que realmente pertence a um curso. Um fluxo razoável seria carregar o ambiente, obter courseid com required_param(), buscar o curso com a API adequada, executar require_login($course), definir URL, título e heading e só depois chamar $OUTPUT->header(). Repare que, ao receber o curso, require_login() não faz apenas a autenticação, pois ele também prepara $PAGE para trabalhar naquele curso; por isso não precisamos repetir $PAGE->set_context(context_course::instance(...)) apenas para chegar ao mesmo contexto que já foi estabelecido pelo próprio fluxo.

Se você chama o header antes de decidir que o usuário não tem acesso, por exemplo, pode terminar tentando redirecionar ou lançar uma exceção depois que parte da resposta já foi enviada. Se configura a URL errada, paginação, navegação, redirects e formulários podem carregar uma referência incorreta da página. Se esquece o contexto, capabilities e outros componentes podem operar sobre uma suposição diferente da sua.

Uma estrutura mínima costuma se parecer com isto

```php
require_once(__DIR__ . '/../../config.php');

$courseid = required_param('courseid', PARAM_INT);
$course = get_course($courseid);

require_login($course);

$context = context_course::instance($course->id);
$PAGE->set_url(new moodle_url('/local/exemplo/index.php', ['courseid' => $course->id]));
$PAGE->set_title(get_string('pluginname', 'local_exemplo'));
$PAGE->set_heading($course->fullname);

echo $OUTPUT->header();
// Conteudo da pagina.
echo $OUTPUT->footer();
```

Esse exemplo não resolve todo problema e nem deveria virar um template copiado sem pensar, mas mostra uma coisa importante, pois a página é preparada antes de ser renderizada. Quando você entende essa sequência, fica muito mais fácil perceber por que determinados erros aparecem somente depois que o tema entra em ação ou por que uma capability precisa ser verificada depois de definir o contexto correto.

## 1.7 `require_once(__DIR__ . '/../../config.php')`

Esse `require_once` aparece tanto em plugin Moodle que muita gente copia sem pensar no que ele faz. Vale pensar, porque ele define a fronteira entre o script PHP isolado e a aplicação Moodle inicializada.

O uso de `__DIR__` é importante porque aponta para o diretório do próprio arquivo em execução, e não para o diretório de trabalho atual do processo. Se você usa algo como `require '../../config.php'`, o caminho pode depender de como aquele script foi chamado e de mudanças no ambiente, enquanto `__DIR__` torna a referência previsível a partir da posição real do arquivo.

A quantidade de `../` depende do tipo e da localização do plugin. Um `local/exemplo/index.php` tradicional usa um caminho diferente de um script dentro de `admin/tool/exemplo/cli/`, portanto não existe valor universal para copiar. Em scripts CLI você ainda encontrará o mesmo princípio, mas o arquivo pode estar vários níveis abaixo e precisa subir até a raiz esperada.

Também não é uma boa ideia incluir `config.php` dentro de toda classe só para garantir que o Moodle esteja carregado. Classes autoloaded devem ser utilizadas dentro de um fluxo já inicializado e não iniciar o Moodle por conta própria, porque isso cria dependência oculta e complica testes, CLI, tarefas e outras formas de execução.

Pense no `config.php` como entrada da aplicação, não como uma biblioteca utilitária. Endpoint web e alguns scripts executáveis precisam iniciar o ambiente; classe de serviço não.

## 1.8 `require_login()`

```php
require_login() parece apenas uma função para verificar se o usuário está autenticado, mas ela participa de uma decisão maior, pois pode trabalhar com curso, course module e regras relacionadas ao acesso. Por isso usar require_login() sem pensar no contexto da página pode deixar o código aparentemente protegido e ainda assim não validar exatamente aquilo que você precisava.
```

Em uma página vinculada a um curso, normalmente faz sentido passar o curso. Em uma página de atividade você frequentemente tem também o course module, e isso permite ao Moodle aplicar regras relacionadas à disponibilidade e ao acesso daquela atividade. Já em uma página administrativa global a situação é outra, pois você pode exigir login no site e depois validar uma capability em `context_system`.

Outro erro comum é usar `require_login()` como se ele substituísse autorização. Usuário autenticado não significa usuário autorizado. Um aluno pode estar logado e matriculado no curso, mas isso não significa que pode editar uma configuração, ler relatório de outro aluno ou excluir um registro. Depois de estabelecer que existe uma sessão válida, você ainda precisa aplicar capabilities e regras de propriedade no contexto adequado.

Também é perigoso fazer a verificação manual usando apenas `$USER->id`. Algo como `if ($USER->id)`, além de ignorar particularidades da sessão, não expressa a intenção real da página e não aplica o fluxo previsto pelo Moodle. Use a API existente e deixe as exceções de autenticação para os casos em que realmente há motivo técnico para isso.

### 1.8.1 require_login() sem curso não transforma a página em página de curso

Quando você chama require_login() sem argumento, o objetivo principal é garantir uma sessão autenticada e executar o fluxo geral de login do Moodle, incluindo verificações relacionadas à sessão, políticas e preparação do usuário. Nesse caminho o core usa o site como referência para várias verificações, mas deliberadamente não chama $PAGE->set_course() apenas por causa do login. O próprio comentário dentro de moodlelib.php deixa isso claro, porque require_login() pode ser chamado em momentos diferentes da requisição e não deve trocar o curso global quando nenhum curso foi informado.

Isso explica por que uma ferramenta global costuma começar com require_login() e depois define context_system::instance() no $PAGE ou usa um helper administrativo apropriado. A página continua sendo uma página global do plugin, e não uma página pertencente a determinado curso só porque o usuário está autenticado.

```php
require_once(__DIR__ . '/../../config.php');

require_login();

$context = context_system::instance();
$PAGE->set_context($context);
$PAGE->set_url(new moodle_url('/local/exemplo/index.php'));
```

### 1.8.2 O que muda quando usamos require_login($course)

A diferença começa logo no argumento. require_login($course) não recebe o curso apenas para consultar matrícula e decidir se o usuário pode entrar. Depois que as verificações de acesso terminam com sucesso, a implementação atual do core chama $PAGE->set_course($course). É aqui que a página muda de identidade dentro do Moodle, porque set_course() grava o curso em $PAGE->course, atualiza a global $COURSE, ajusta locale, define context_course quando o contexto ainda não foi estabelecido e notifica o formato do curso para que ele prepare a página.

Essa é a razão pela qual uma página de local plugin pode parecer "virar uma página do curso" apenas porque você trocou require_login() por require_login($course). Não é o PHP mudando um detalhe cosmético e também não é o tema adivinhando pelo parâmetro courseid; você pediu ao Moodle para declarar que aquela página pertence ao curso, e a Page API passa a carregar essa informação para tudo que vier depois.

```php
// A página exige apenas autenticação no site.
require_login();

// A página passa a pertencer ao curso informado.
require_login($course);
```

### 1.8.3 Por que a navegação e a aparência mudam

O $OUTPUT->header() é construído a partir do estado acumulado em $PAGE. Quando $PAGE->course e $PAGE->context apontam para um curso, a navegação consegue montar caminhos e elementos relacionados àquele curso, o formato do curso já recebeu page_set_course(), classes de body relacionadas ao formato podem ser adicionadas e a seleção de tema e outras decisões de apresentação passam a considerar o curso corrente. Então a diferença visual aparece no header, na navegação, em regiões e em elementos que nem sequer estão no arquivo PHP do seu plugin.

Existe uma distinção importante aqui. Passar somente $course não significa que require_login() tenha chamado $PAGE->set_pagelayout("incourse"). O que ele faz é set_course(), e isso já é suficiente para alterar bastante o ambiente da página. Quando também passamos um $cm, o fluxo chama $PAGE->set_cm($cm, $course) e o próprio require_login() define o layout como incourse. Em outras palavras, com course module a associação visual com o curso é ainda mais explícita.

### 1.8.4 require_login($course, false) e o segundo parâmetro que muita gente interpreta errado

O segundo parâmetro não significa "não usar o curso na renderização" e também não desliga a alteração de $PAGE. Ele se chama $autologinguest e controla se o Moodle pode realizar login automático como guest quando essa configuração estiver habilitada no site. Portanto require_login($course, false) continua sendo uma chamada vinculada ao curso, continua validando o acesso ao curso e continua preparando $PAGE com aquele curso quando o acesso é permitido.

```php
// Curso com comportamento padrão de autologin de guest.
require_login($course);

// Curso, mas sem permitir autologin automático de guest.
require_login($course, false);
```

Essa diferença é especialmente útil em telas nas quais guest não faz sentido, mas não use false como tentativa de "manter a página neutra" visualmente, porque ele não serve para isso.

### 1.8.5 Quando também existe $cm

Em uma página ligada a uma atividade, informar o course module permite ao core validar a relação entre o módulo e o curso, transformar o registro em cm_info quando necessário, aplicar regras de visibilidade e disponibilidade e preparar $PAGE com $PAGE->set_cm(). set_cm() garante que o curso correto esteja em $PAGE, troca o contexto para context_module na situação normal e avisa o formato de curso por meio de page_set_cm(). Depois disso require_login() usa o layout incourse, salvo se a página mudar o layout de forma consciente antes da saída.

```php
$cm = get_coursemodule_from_id('example', $id, 0, false, MUST_EXIST);
$course = get_course($cm->course);

require_login($course, false, $cm);

$context = context_module::instance($cm->id);
```

Isso também mostra por que não faz sentido passar um $cm de um curso e um $course de outro. O core trata essa inconsistência como erro de programação, porque o course module não é apenas decoração para montar breadcrumb; ele faz parte da identidade e da regra de acesso daquele recurso.

### 1.8.6 Não remova o curso de require_login() apenas para "consertar" o layout

Depois de perceber que require_login($course) muda a página, a tentação é trocar a chamada por require_login() e manter todo o restante igual. Isso pode ser correto em uma ferramenta realmente global, mas pode ser um erro sério em uma página cujo acesso depende de o usuário poder entrar naquele curso, porque você remove junto as verificações de matrícula, acesso temporário de guest, curso oculto e outras decisões que pertencem ao fluxo de acesso.

Se a página pertence ao curso, normalmente é coerente que $PAGE saiba disso. Se você precisa de um layout diferente, escolha o layout de forma explícita com $PAGE->set_pagelayout() antes do header e entenda que navegação, contexto e curso corrente continuarão sendo os do curso. Se a página não pertence ao curso e usa apenas um curso como filtro de relatório, então talvez o desenho correto seja require_login() global, uma capability no contexto adequado e validações específicas sobre os cursos consultados. A pergunta não é "qual chamada deixa a tela mais bonita?", mas "qual recurso esta página realmente representa e qual regra de acesso deve ser aplicada?".

```php
1.9 $PAGE->set_context()
```

Se existe uma decisão que muita página de plugin deixa para o Moodle adivinhar porque "funcionou mesmo sem ela", é o contexto de $PAGE. Só que existe uma nuance importante: quando você chama require_login($course) em uma página que ainda não teve o contexto definido, o próprio Moodle chama $PAGE->set_course($course), e set_course() define context_course automaticamente. Portanto, repetir imediatamente $PAGE->set_context(context_course::instance($course->id)) costuma ser redundante. O problema aparece nas páginas em que não há curso, em páginas que trabalham com outro nível de contexto ou quando o código definiu um contexto antes; nesses casos você precisa decidir conscientemente qual contexto representa a página.

Uma página que administra um curso normalmente usa `context_course::instance($courseid)`, enquanto uma página específica de atividade usa `context_module`. Uma configuração de site pode trabalhar em `context_system` e uma funcionalidade relacionada diretamente ao perfil de um usuário pode usar `context_user`, sempre dependendo do que está sendo protegido e não simplesmente do parâmetro mais fácil que chegou na URL.

Quando o Moodle consegue inferir parte dessas informações, como acontece após require_login($course) ou require_login($course, false, $cm), isso é comportamento previsto da API e pode ser usado. O erro é depender de inferência onde ela não existe, ou mudar o contexto depois de outras APIs já terem começado a usá-lo. Uma página global, uma página de usuário, um bloco ou uma tela que represente outra entidade pode precisar de $PAGE->set_context() explícito, e o contexto escolhido deve corresponder àquilo que a página realmente representa.

Defina o contexto conscientemente. Mais adiante veremos capabilities com mais profundidade, mas desde já guarde esta relação, pois uma permissão sem contexto é praticamente uma pergunta incompleta. "O usuário pode editar?" Editar o quê e onde? O contexto responde esse "onde".

```php
1.10 $PAGE->set_url()
$PAGE->set_url() não serve apenas para informar ao Moodle qual URL apareceu no navegador. Ele define a URL canônica que a página considera como sendo sua, com os parâmetros necessários para representar aquele estado, e essa informação pode ser usada por navegação, paginação, retorno de formulários e outras partes da interface.
```

Um erro frequente é passar somente o caminho e esquecer um parâmetro essencial, como `courseid`, `id` ou um filtro que define a página atual. A tela abre normalmente, mas quando o usuário pagina uma tabela, retorna de um formulário ou aciona algum elemento que reutiliza `$PAGE->url`, parte do estado desaparece.

Também não faz sentido colocar parâmetros temporários ou sensíveis apenas porque estavam na requisição. A URL deve representar a página, e não copiar cegamente `$_GET`. Além disso, use `moodle_url` para construir URLs em vez de concatenar strings, pois a classe conhece encoding, parâmetros e os padrões utilizados pelo core.

Uma forma simples de avaliar se sua URL está correta é imaginar que você copiaria aquele endereço e abriria em outra aba para chegar ao mesmo estado da página. Se falta informação essencial ou sobra lixo transitório, vale revisar.

```php
1.11 $PAGE->set_title() e $PAGE->set_heading()
```

Título e heading parecem a mesma coisa quando o tema mostra os dois com texto parecido, mas representam papéis diferentes. `set_title()` define o título da página, incluindo aquilo que normalmente aparece na aba do navegador e em metadados, enquanto `set_heading()` define o heading principal usado pelo layout e pelo tema.

Em uma página de curso, por exemplo, o heading pode ser o nome do curso e o title pode representar a funcionalidade atual. Em uma ferramenta administrativa, os dois podem acabar iguais e não há problema, mas isso deve ser uma escolha e não o resultado de copiar duas linhas sem pensar.

Use strings de idioma com `get_string()` e evite colocar texto fixo em português direto no código, mesmo que o plugin seja inicialmente usado apenas no Brasil. Esse assunto volta no capítulo de estrutura de plugin, mas vale adiantar porque título de página é um dos primeiros lugares em que o hardcode aparece.

Outra coisa que ajuda é observar páginas semelhantes do core. Se você está criando uma tela administrativa, veja como uma ferramenta administrativa oficial define title e heading; se está criando algo dentro de curso, procure uma página com o mesmo tipo de navegação. Copiar arquitetura boa do core é muito melhor do que inventar convenção particular e depois lutar contra o tema.

```php
1.12 $OUTPUT->header() e $OUTPUT->footer()
```

Quando você chama `echo $OUTPUT->header()`, o Moodle não imprime apenas uma tag `<header>`. Nesse momento entra em cena o sistema de output, o tema corrente, o layout escolhido em `$PAGE`, a navegação, os requisitos de página e uma quantidade significativa de estrutura que envolve seu conteúdo.

É por isso que você precisa terminar a preparação da página antes de chamar o header. Depois que a resposta começou a sair, algumas decisões ficam tarde demais e um redirect, alteração de header HTTP ou configuração de layout pode não funcionar como esperado.

No outro extremo está `$OUTPUT->footer()`, que fecha o layout e permite que o tema conclua a página corretamente. Esquecer o footer não é apenas deixar um `</div>` faltando, pois scripts, elementos finais e comportamento do tema podem depender dessa etapa.

Outra prática ruim é usar o intervalo entre header e footer como desculpa para despejar centenas de `echo '<div...'` dentro do PHP. O fato de funcionar não significa que seja a arquitetura recomendada. Nos capítulos de Output API e Mustache veremos como separar preparação de dados e apresentação, mas já vale guardar que `$OUTPUT` é a entrada para o sistema de rendering, não um incentivo para misturar HTML com regra de negócio.

## 1.13 Estrutura de diretórios do Moodle

Quando você abre a raiz do Moodle pela primeira vez encontra `admin`, `course`, `lib`, `mod`, `blocks`, `local`, `theme`, `user`, `question`, `grade` e uma série de outros diretórios, e a sensação inicial é que houve pouca preocupação em esconder a idade do projeto. De fato há áreas históricas, mas existe bastante lógica nessa organização quando você passa a olhar por responsabilidade e por tipo de componente.

Diretórios como `mod`, `blocks`, `local`, `theme`, `auth` e `enrol` agrupam tipos de plugins, enquanto outros como `course`, `user`, `grade` e `question` pertencem a subsistemas do core. `lib` concentra bibliotecas centrais e estruturas históricas compartilhadas, e `admin` reúne administração e ferramentas que fazem parte do core ou do tipo `tool`.

O erro que eu evitaria é memorizar caminho como regra eterna. A reorganização do Moodle 5.1 já mostrou por que isso não é uma boa estratégia, pois grande parte do código web passou para `public/`. Seu plugin deve usar APIs de descoberta e variáveis como `$CFG->dirroot` quando precisa localizar algo conhecido, em vez de assumir uma topologia completa montada com `dirname()`.

Outra coisa importante é não confundir organização física com API pública. Só porque você encontrou uma função útil em algum arquivo dentro de `lib/` não significa que aquele arquivo seja uma interface estável para ser incluída diretamente, e só porque uma classe é pública no PHP não significa necessariamente que o Moodle garante compatibilidade eterna. Leia documentação, PHPDoc e `upgrade.txt` antes de depender de detalhes internos.

## 1.14 A mudança para o diretório `public/` a partir do Moodle 5.1 e como isso tornou a hospedagem mais complexa para iniciantes

Durante muitos anos a instalação típica era fácil de explicar. Você baixava o Moodle, apontava o domínio para aquela pasta, colocava o Moodledata fora dela e seguia a vida. O Moodle 5.1 começou a mudar essa organização ao colocar a maior parte do conteúdo acessível pela web dentro de `public/`, e a configuração recomendada passou a apontar o `DocumentRoot` para essa pasta.

Do ponto de vista arquitetural a mudança é boa, porque permite manter `config.php`, dependências e ferramentas fora da área que o servidor web pode entregar diretamente. Isso reduz risco de exposição causado por configuração ruim e dá ao projeto liberdade para organizar dependências que não precisam ser públicas. O problema é que segurança bem feita nem sempre combina com hospedagem compartilhada barata, e é aí que o iniciante sente a mudança.

Em uma VPS com Nginx você altera `root /var/www/moodle/public;`, ajusta o restante da configuração e acabou. Em muitos painéis de hospedagem o domínio nasce preso a uma pasta como `public_html`, e o usuário nem sequer tem permissão para apontá-lo a um subdiretório fora daquela estrutura. A instalação passa a exigir entendimento de document root, caminho real e separação entre raiz da aplicação e raiz pública, conceitos que antes o Moodle conseguia esconder de muita gente.

Há ainda um detalhe que costuma gerar erro. O fato de existir fisicamente uma pasta `public/` não significa que a URL deve virar `https://ead.exemplo.com/public`. Se o servidor está configurado corretamente, o navegador continua acessando `https://ead.exemplo.com` e o mapeamento para `public/` acontece internamente no servidor web. Colocar `/public` em `$CFG->wwwroot` é sinal de que a raiz pública provavelmente foi configurada de maneira errada.

Essa mudança também afeta scripts de implantação, backup, automações e documentação antiga que assumiam que plugin e raiz da instalação estavam sempre no mesmo nível. Não trate isso como uma curiosidade da versão 5.1, porque é uma mudança que prepara o Moodle para continuar reorganizando o código no futuro.

## 1.15 Web root e por que arquivos internos não devem ficar diretamente expostos

Web root é a pasta a partir da qual o servidor web resolve os caminhos públicos. Se o web root aponta para `/var/www/site/public`, um arquivo `/var/www/site/public/teste.txt` pode potencialmente ser acessado pela URL `/teste.txt`, enquanto um arquivo `/var/www/site/config.php` fica fora dessa árvore e não deveria ser entregue diretamente pelo servidor.

Essa separação parece uma precaução exagerada até o dia em que alguém deixa `backup.zip`, `.env`, arquivo de configuração antigo ou dependência interna dentro da pasta pública e um scanner encontra. Segurança não pode depender de "ninguém vai adivinhar esse nome". Se o navegador não precisa acessar diretamente um arquivo, existe uma boa razão para mantê-lo fora da área publicada ou protegê-lo por uma camada que faça autorização.

O Moodledata é o exemplo mais importante. Um PDF enviado por aluno, uma atividade entregue, uma imagem privada ou qualquer outro arquivo controlado pelo Moodle não deve virar um caminho físico público como `/uploads/aluno123/trabalho.pdf`. O acesso precisa passar pelo Moodle, que conhece usuário, contexto, componente e regras de acesso antes de transmitir o conteúdo.

É justamente por isso que o File API existe e por isso mexer diretamente em `filedir` é uma péssima ideia, assunto que será aprofundado em outro capítulo. Por enquanto o ponto arquitetural é simples. O servidor web entrega o que é público e o Moodle decide o acesso ao que é protegido, e misturar essas duas responsabilidades cria falhas difíceis de corrigir depois.

## 1.16 Frankenstyle

Você vai encontrar nomes como `mod_forum`, `local_meuplugin`, `block_html` e `tool_task` por todo o Moodle. Essa convenção recebe o nome de Frankenstyle e junta o tipo do componente com o nome do plugin, normalmente separados por underscore.

A utilidade disso aparece quando o projeto tem centenas de componentes. `forum` sozinho poderia significar diretório, tabela, classe ou qualquer outra coisa, enquanto `mod_forum` deixa claro que estamos falando do componente do tipo activity module chamado `forum`. O mesmo nome reaparece em namespaces, `@package`, templates, configuração, eventos, strings e várias APIs, criando uma identidade única para aquele componente.

Se você criou `local/relatorios`, o componente é `local_relatorios`. Não invente `relatorios`, `local\relatorios` ou algum prefixo de empresa só porque parece mais organizado. O Moodle usa convenções para descobrir código e ferramentas de validação também esperam essas convenções.

Capabilities são um caso visualmente diferente, pois usam barra, como `mod/forum:replypost`, mas continuam expressando o mesmo componente. No banco e em várias APIs você verá o Frankenstyle completo com underscore, e em namespaces a raiz também corresponde ao componente, como `namespace local_relatorios;`.

Depois de algum tempo você começa a ler o nome e já sabe onde procurar. Viu `qtype_multichoice`, pense em tipo de questão; viu `tool_task`, pense em ferramenta administrativa; viu `core_message`, pense no subsistema de mensagens. Parece detalhe de nomenclatura, mas ajuda bastante a navegar em um código do tamanho do Moodle.

## 1.17 Componentes e subsistemas

No Moodle, plugin não é sinônimo de componente, porque o conceito de componente também é usado para identificar partes do próprio core. Um plugin instalado é um componente, mas subsistemas como `core_message`, `core_cache`, `core_question` e `core_user` também possuem identidade própria para fins de classes, strings, documentação e descoberta.

Isso importa porque o core não deveria sair varrendo diretórios aleatoriamente toda vez que precisa descobrir plugins. Existe uma API de componentes que conhece tipos, subsistemas, caminhos e caches relacionados a essa descoberta. Quando seu código precisa saber quais plugins de determinado tipo existem, procure a API correspondente em vez de implementar um `glob()` e torcer para que a estrutura nunca mude.

Também ajuda muito na leitura do código. Ao encontrar uma classe `\core_message\...` você sabe que ela pertence ao subsistema de mensagens, enquanto `\mod_forum\...` pertence ao plugin de fórum. Quando aparece um evento, template ou string com esse componente, a origem fica previsível.

A recomendação prática é começar a pensar em Moodle por componentes e APIs, não apenas por pastas. Pasta pode mudar, compatibilidade pode criar caminhos intermediários e um subsistema pode ocupar mais de um diretório, mas o componente continua sendo a identidade lógica que o Moodle reconhece.

## 1.18 `core`, `mod`, `local`, `block`, `tool` e demais componentes

`core` identifica o núcleo e seus subsistemas, enquanto prefixos como `mod`, `local`, `block` e `tool` indicam tipos de plugins. Só que a lista não para nem perto desses quatro, e entender isso desde o começo evita aquele vício de criar `local` para qualquer problema simplesmente porque é o tipo mais fácil de começar.

`mod` representa atividades, `block` representa blocos, `tool` representa ferramentas administrativas e `local` existe para funcionalidades que realmente não se encaixam melhor em um tipo específico. Além deles há `auth`, `enrol`, `theme`, `report`, `format`, `filter`, `repository`, `availability`, `qtype`, `qbank`, `qbehaviour`, `gradereport` e vários outros pontos de extensão.

O tipo não muda apenas a pasta. Ele define expectativas arquiteturais. Um `mod` participa do curso, pode ter instância, completion, gradebook, backup e uma série de callbacks próprios; um `auth` participa do processo de autenticação; um `enrol` trabalha com matrícula; um `qtype` entra no Question Engine. Criar um `local` que reimplementa tudo isso manualmente é como comprar uma chave de fenda e decidir que todo parafuso da oficina agora precisa ter o mesmo formato.

No próximo capítulo vamos entrar nos tipos de plugin com calma, mas já faça este exercício quando surgir uma demanda. Antes de perguntar "como faço isso em um local?", pergunte "qual parte do Moodle é responsável por esse problema?". A resposta costuma levar ao tipo certo.

## 1.19 Namespaces

Namespaces resolvem colisões de nomes no PHP e, dentro do Moodle, também participam diretamente do autoloading. Se o seu componente é `local_relatorios`, a raiz natural das novas classes será `local_relatorios`, portanto uma classe de serviço poderia estar em `\local_relatorios\service\report_builder`.

A relação com o caminho é previsível. Um arquivo `local/relatorios/classes/service/report_builder.php` contém a classe `report_builder` dentro do namespace `local_relatorios\service`. Quando o PHP encontra essa classe e ela ainda não foi carregada, o autoloader do Moodle consegue transformar o nome em um caminho e localizar o arquivo.

Isso elimina aquele padrão antigo de encher o topo de uma página com `require_once($CFG->dirroot . '/local/relatorios/classes/...')`. Se a classe está no lugar e namespace corretos, você referencia a classe e deixa o autoloader trabalhar.

Use `use` para importar nomes longos quando isso melhora a leitura, mas lembre que `use` não executa um include por si só, pois ele apenas cria um alias no arquivo. O carregamento acontece quando a classe precisa ser resolvida.

Também não crie uma árvore de namespace com oito níveis apenas porque outro framework faz assim. Moodle possui diretórios e namespaces com significado especial, como `event`, `task`, `external`, `output` e `privacy`, portanto organização boa aqui é aquela que respeita a plataforma e deixa a responsabilidade da classe evidente, e não a que produz o caminho mais sofisticado.

## 1.20 Autoloading

Autoloading é uma dessas coisas que você sente falta somente depois que conhece. Em código PHP antigo era normal começar cada arquivo com uma pequena coleção de `require_once`, um para a classe A, outro para a B, mais um para uma biblioteca que por sua vez incluía outras três, e quando alguma pasta mudava começava a brincadeira de descobrir quem ainda apontava para o caminho anterior.

No Moodle moderno, classes colocadas nos locais esperados podem ser carregadas automaticamente. Quando o PHP encontra `new \local_relatorios\service\report_builder()` e a classe ainda não existe na memória, o autoloader registrado durante o bootstrap analisa o nome, identifica o componente `local_relatorios`, converte o restante do namespace para o caminho sob `classes/` e inclui o arquivo correspondente.

Isso depende de convenção. Se o arquivo se chama `ReportBuilder.php`, está em uma pasta inventada como `class/Services/` e declara outro namespace, não adianta culpar o autoloader. O Moodle não procura classes tentando todas as combinações possíveis, pois justamente a previsibilidade é o que torna esse mecanismo rápido e confiável.

Também vale separar autoloading de descoberta de arquivos legados. Ainda existem bibliotecas que precisam ser incluídas explicitamente porque nasceram antes do modelo atual ou porque fazem parte de APIs com carregamento específico, mas isso não é justificativa para escrever novas classes seguindo o mesmo padrão. Código novo deve aproveitar a infraestrutura moderna sempre que a API permitir.

Quando uma classe não carrega, faça três verificações antes de adicionar qualquer `require_once` por desespero. Confira o Frankenstyle do componente, confira o namespace declarado e confira se o caminho sob `classes/` corresponde exatamente ao restante do nome. Na maioria das vezes o problema está em uma dessas três coisas e não no autoloader.

## 1.21 Diretório `classes/`

O diretório `classes/` é onde o código orientado a objetos autoloaded do componente deve viver. Isso parece uma frase simples, mas muda bastante a organização de um plugin quando você leva a regra a sério, porque deixa de espalhar classe em `lib.php`, `locallib.php`, `helpers.php`, `functions.php` e outros nomes criativos que aparecem quando o projeto cresce sem uma arquitetura definida.

Dentro de `classes/` você pode criar subdiretórios que representem responsabilidades reais. `classes/service/`, `classes/output/`, `classes/task/`, `classes/event/` e `classes/external/` são exemplos comuns, sendo que alguns deles possuem significado especial para APIs do Moodle. O caminho precisa acompanhar o namespace e o nome do arquivo acompanha o nome da classe conforme as regras de coding style.

Uma classe `\local_exemplo\service\sync_manager`, por exemplo, normalmente ficará em `local/exemplo/classes/service/sync_manager.php`. Não é necessário registrar esse arquivo em algum mapa manual e nem incluí-lo antes de usar, pois o nome já contém informação suficiente para o Moodle localizá-lo.

Essa organização também melhora teste e manutenção. Quando lógica de negócio está em classes pequenas e previsíveis, você consegue reutilizá-la em página web, task, CLI ou external function sem copiar código. Quando tudo está dentro de `index.php`, qualquer nova forma de execução obriga a duplicar partes ou carregar arquivo que foi escrito pensando em HTML, sessão e redirect.

Não transforme `classes/` em um depósito desorganizado apenas porque agora o autoload funciona. Se começa a surgir `utils.php` com cinquenta métodos estáticos sem relação entre si, você apenas trocou a bagunça de lugar. A convenção resolve localização, mas responsabilidade ainda é decisão de arquitetura.

## 1.22 Contextos do Moodle

Contexto é um dos conceitos que mais confundem quem chega ao Moodle vindo de aplicações PHP comuns, porque não basta perguntar se o usuário tem uma permissão, você também precisa dizer onde essa permissão está sendo avaliada. Um professor pode editar atividades no curso A e ser apenas aluno no curso B, enquanto um administrador pode ter poderes no sistema inteiro. A capability pode até ter o mesmo nome, mas o resultado depende do contexto.

O Moodle organiza esses contextos em uma hierarquia. No topo está o sistema, abaixo surgem categorias, cursos, módulos e outros níveis, e essa árvore permite que atribuições de papel e permissões sejam herdadas ou sobrescritas em pontos específicos. É por isso que uma role atribuída em uma categoria pode afetar cursos abaixo dela sem que você precise criar uma linha de permissão em cada curso.

Quando você chama `has_capability()` ou `require_capability()`, precisa fornecer um objeto de contexto. Se escolher o contexto errado, a pergunta muda. Verificar `moodle/course:update` no `context_system` não é a mesma coisa que verificar no `context_course` de um curso específico, mesmo que o nome da capability seja idêntico.

Esse detalhe é fonte de falhas de segurança reais. Um plugin recebe `courseid=10`, mas valida a capability no sistema porque era mais fácil obter `context_system::instance()`. O desenvolvedor acredita que protegeu a página, só que protegeu uma ação diferente daquela que a página realmente executa. No capítulo de segurança isso volta com mais força, mas arquitetura e segurança já se encontram aqui.

Uma boa regra é definir primeiro qual objeto ou área está sendo protegida e somente depois escolher o contexto. Não comece pelo contexto mais conveniente.

## 1.23 `context_system`

`context_system` representa o nível mais alto da árvore de contextos. Ele faz sentido quando a ação é realmente global, como administrar uma configuração que afeta o site inteiro, acessar determinada ferramenta administrativa ou executar uma operação que não pertence a um curso, usuário ou atividade específica.

Você obtém a instância com `context_system::instance()`, e como existe apenas um contexto desse tipo na instalação, não há id de curso ou módulo para informar. Justamente por isso ele é tão tentador. Quando o desenvolvedor não sabe qual contexto usar, chama o de sistema porque está sempre disponível e a página para de reclamar.

Só que isso pode deixar a regra de acesso errada. Se você cria uma página que altera uma informação dentro de um curso, exigir uma capability global pode bloquear professores que deveriam ter acesso ou, em outro desenho de permissões, conceder acesso com base em uma capacidade ampla demais. O contexto deve refletir a ação e não servir como curinga.

Há casos em plugins `local` nos quais `context_system` é totalmente correto, principalmente para configuração administrativa global. O problema não é usar esse contexto, e sim usá-lo sem conseguir explicar por que a operação é global.

## 1.24 `context_coursecat`

Categorias de cursos também possuem contexto próprio. Isso permite administrar permissões e responsabilidades em um nível intermediário entre sistema e curso, algo bastante útil em instituições grandes onde uma pessoa administra uma faculdade, unidade, departamento ou área sem receber poderes sobre todo o Moodle.

A instância pode ser obtida a partir do id da categoria e entra em ações que realmente pertencem àquela categoria. Se um plugin cria um painel para coordenadores gerenciarem cursos de uma determinada categoria, por exemplo, avaliar uma capability em `context_coursecat` pode ser mais correto do que exigir permissão global ou repetir a mesma atribuição em cada curso.

Como categorias podem ser aninhadas, a árvore de contexto acompanha essa organização e permissões atribuídas em uma categoria superior podem influenciar descendentes. É aí que o modelo do Moodle mostra uma vantagem importante, porque você consegue representar estruturas organizacionais sem codificar listas de ids de curso dentro do plugin.

Evite, portanto, tabelas particulares como `meuplugin_coordenadores_categoria` apenas para reinventar algo que roles e contextos já resolvem, a menos que sua regra de negócio seja realmente diferente da autorização padrão do Moodle.

## 1.25 `context_course`

`context_course` é provavelmente um dos contextos que você mais vai usar em plugins ligados ao ensino. Ele representa um curso específico e é o lugar natural para validar ações que afetam o curso como um todo, seus participantes ou dados cuja propriedade é daquele espaço educacional.

A instância normalmente vem de `context_course::instance($courseid)`. A partir dela você pode verificar capabilities, trabalhar com arquivos em áreas relacionadas ao curso e passar o contexto para APIs que precisam entender onde a operação está acontecendo.

Imagine um relatório de participação disponível para professores. Receber `courseid` pela URL não prova que o usuário pode visualizar aquele curso e muito menos que pode acessar o relatório. O fluxo deve carregar o curso, estabelecer login e depois verificar a capability no `context_course` correspondente.

Também não confunda o id do curso com id do contexto. São registros diferentes, embora exista uma relação entre eles. Guardar `courseid` em um campo chamado `contextid` ou usar um no lugar do outro pode funcionar em banco de teste por coincidência e falhar de maneira bem desagradável depois.

Quando a ação desce para uma atividade específica, porém, o contexto do curso pode já ser amplo demais, e é aí que entra `context_module`.

## 1.26 `context_module`

Cada atividade ou recurso inserido no curso possui um course module, conhecido no código como `cm`, e existe um contexto associado a essa instância. `context_module` representa justamente esse nível.

Se você está protegendo uma ação sobre uma atividade específica, como editar uma tentativa, visualizar dados privados daquela atividade ou executar uma operação definida pelo plugin, normalmente a capability deve ser avaliada no contexto do módulo e não apenas no curso. Isso permite que restrições e atribuições específicas naquela atividade sejam respeitadas.

Para obter o contexto você pode usar `context_module::instance($cmid)`, mas frequentemente já terá o `$cm` carregado por funções do core. O importante é não confundir o id da instância da atividade com `cmid`. Em um `mod_quiz`, por exemplo, o id do quiz na tabela própria e o id em `course_modules` são coisas diferentes.

Essa confusão aparece bastante em URLs e é uma boa razão para usar APIs como `get_coursemodule_from_id()` ou funções específicas do módulo em vez de montar consultas improvisadas. Quando você entende a diferença entre instância, course module, curso e contexto, uma boa parte do código de `view.php` começa a ficar muito menos misteriosa.

## 1.27 `context_user`

`context_user` representa um usuário específico e aparece em operações ligadas diretamente ao espaço ou aos dados daquele usuário. O detalhe importante é que contexto do usuário não significa automaticamente "o próprio usuário", pois uma capability pode ser avaliada nesse contexto para decidir se outra pessoa tem permissão de realizar determinada ação sobre ele.

Isso exige cuidado com regras de propriedade. Às vezes a autorização correta é uma combinação entre capability e identidade. O usuário pode editar determinado dado se for o dono ou se possuir uma capability administrativa adequada. Verificar apenas `$USER->id == $userid` pode ignorar administradores legítimos, enquanto verificar apenas uma capability pode permitir que alguém veja dados de outra pessoa quando a regra previa acesso somente ao próprio conteúdo.

Também não use `context_user` como substituto genérico para qualquer página que tenha `userid` na URL. Se o dado pertence a um curso e apenas está filtrado por usuário, o contexto principal talvez continue sendo o curso. O contexto deve representar a área protegida, não necessariamente cada parâmetro da requisição.

## 1.28 Relação entre contexto, capability e acesso

Capability responde o que pode ser feito, contexto responde onde aquela capacidade está sendo avaliada e role participa da forma como essa permissão chega ao usuário. Os três conceitos se cruzam, mas não são sinônimos.

Uma página segura costuma combinar ainda outras regras. Você pode exigir `local/relatorio:view` no contexto do curso e, depois disso, verificar se o registro realmente pertence ao curso recebido. Isso porque capability não substitui validação de objeto e contexto não corrige um `id` manipulado pelo cliente.

Imagine uma URL `view.php?id=500&courseid=10`. O plugin valida que o usuário pode ver relatórios no curso 10, mas carrega o registro 500 sem conferir a qual curso ele pertence. Se o registro 500 for do curso 11, você criou um IDOR mesmo tendo chamado `require_capability()`. A capability estava certa, porém o objeto validado não era o objeto acessado.

É por isso que segurança no Moodle não se resume a espalhar `require_login()` e `require_capability()` pelo arquivo. Você precisa ligar usuário, contexto, capability e propriedade dos dados de maneira coerente.

Quando tiver dúvida, formule a regra em português antes do código. Algo como "o usuário precisa estar autenticado, ter permissão para visualizar este relatório neste curso e o relatório solicitado precisa pertencer a este mesmo curso". Depois implemente cada parte. Essa frase simples evita muita autorização incompleta.

## 1.29 `$CFG->dirroot`

```php
$CFG->dirroot aponta para a raiz do código Moodle relevante à aplicação e é usado quando você realmente precisa montar um caminho absoluto para algum arquivo conhecido. Em versões com a reorganização iniciada no Moodle 5.1, essa noção precisa ser lida junto com a separação entre raiz da instalação e diretório público.
```

Você vai encontrar código como

```php
require_once($CFG->dirroot . '/course/lib.php');
```

Esse padrão ainda existe porque nem toda API histórica foi convertida para classes autoloaded. O erro é transformar isso em padrão para qualquer classe nova do seu plugin. Se a classe está em `classes/`, referencie a classe e deixe o autoloading fazer o trabalho.

Também evite calcular a raiz com cadeias de `dirname(__DIR__)`. Isso prende o plugin à posição atual na árvore e começa a quebrar quando você move um script para outra subpasta ou quando a estrutura do Moodle evolui. `$CFG->dirroot` existe justamente para que o core forneça esse conhecimento.

Em resumo, use `dirroot` quando precisa de caminho de arquivo e a API realmente espera que você inclua algo manualmente. Para URL existe `$CFG->wwwroot` e `moodle_url`; misturar caminho físico com URL é outro erro clássico que normalmente aparece quando o código é migrado para um servidor diferente.

## 1.30 `$CFG->dataroot`

```php
$CFG->dataroot aponta para o Moodledata, a área de dados não pública da instalação. Isso inclui armazenamento de arquivos gerenciados, cache, sessões dependendo da configuração, temporários e outras estruturas que o Moodle precisa escrever durante a operação.
```

A primeira regra é que `dataroot` não deve apontar para uma pasta servida diretamente pela web. Se você consegue abrir `https://ead.exemplo.com/moodledata/...`, a instalação está conceitualmente errada mesmo que alguma regra de `.htaccess` tente remendar o problema.

A segunda regra é que conhecer `$CFG->dataroot` não autoriza seu plugin a sair criando caminhos dentro de `filedir` ou lendo arquivos pelo contenthash. Para arquivos gerenciados existe Files API, e ela abstrai justamente o armazenamento físico para que seu código continue funcionando com sistemas alternativos, object storage e outras estratégias.

Existem casos legítimos para diretórios temporários ou arquivos próprios, mas ainda assim procure APIs e locais apropriados antes de criar uma pasta nova diretamente na raiz do Moodledata. O fato de ser gravável não transforma o diretório em `/tmp` particular de cada plugin.

## 1.31 Moodledata

Moodledata é uma das partes mais importantes da instalação e, curiosamente, muitos desenvolvedores passam anos usando Moodle sem entender exatamente o que existe ali. Ele não é apenas a pasta onde ficam "os uploads". O Moodle usa esse espaço para dados persistentes e transitórios, arquivos gerenciados pela File API, caches, temporários, sessões em algumas configurações, lixeira de arquivos e outros dados de execução.

Quando um professor envia um PDF, o arquivo não fica normalmente em uma pasta com nome do curso e nome original esperando alguém acessar por caminho. A File API registra metadados no banco e guarda o conteúdo físico seguindo uma estrutura baseada em hash. Isso permite deduplicação e separa a identidade lógica do arquivo de sua localização física.

Essa abstração é importante porque o mesmo conteúdo pode aparecer em áreas diferentes sem precisar duplicar bytes, e porque a aplicação pode trocar a implementação do armazenamento sem obrigar cada plugin a aprender uma nova topologia. Se seu código depende de localizar `/moodledata/filedir/ab/cd/hash`, ele já começou errado.

Moodledata também precisa de permissões de escrita adequadas para o usuário que executa o PHP, mas não caia no atalho de aplicar `777` em tudo e chamar isso de solução. Permissão de sistema operacional faz parte da segurança da instalação e deve ser configurada de acordo com usuário, grupo e modelo de implantação.

Quando houver problema de arquivo, descubra primeiro se estamos falando de File API, temporário, cache, sessão ou outro subsistema. "Está no Moodledata" ainda é uma informação genérica demais para diagnosticar qualquer coisa.

## 1.32 `filedir`, `temp`, `cache`, `localcache`, `sessions` e `trashdir`

Dentro do Moodledata existem diretórios com funções muito diferentes e tratá-los todos como armazenamento comum é uma boa forma de criar plugin que funciona até o primeiro purge de cache.

`filedir` guarda o conteúdo físico dos arquivos gerenciados pela File API. É uma área persistente e não deve ser manipulada manualmente. `temp` recebe dados temporários utilizados em operações que podem ser descartadas depois, como etapas de backup, importação e processamento intermediário.

`cache` e `localcache` guardam dados de cache com características diferentes de compartilhamento e persistência, e o Moodle pode recriá-los. Se seu plugin grava um documento importante ali e perde quando o administrador purga caches, o problema não foi o administrador. Foi o plugin.

`sessions` pode ser utilizado quando a instalação armazena sessões em arquivos, embora ambientes maiores normalmente adotem outros handlers como Redis. Não faça suposição de que a sessão do usuário estará em um arquivo local, pois essa decisão pertence à infraestrutura.

`trashdir` participa da limpeza de arquivos e permite que conteúdos removidos aguardem o processo de descarte antes da exclusão física definitiva. Novamente, não existe razão para o plugin navegar ali procurando arquivo que "sumiu". A File API conhece o estado lógico e deve ser a interface utilizada.

A diferença entre esses diretórios mostra uma ideia que aparece várias vezes no Moodle. Você programa contra APIs e contratos, enquanto detalhes físicos ficam sob responsabilidade do core e da infraestrutura.

## 1.33 Por que Moodledata não pode ser servido diretamente pelo servidor web

Imagine que um aluno envie um trabalho chamado `trabalho-final.pdf`. Se esse arquivo pudesse ser acessado por uma URL física direta no Moodledata, bastaria descobrir ou prever o caminho para ignorar completamente login, matrícula, grupo, data de disponibilidade e qualquer capability que o Moodle pretendesse verificar.

É por isso que arquivos protegidos são servidos por endpoints do Moodle, tradicionalmente com URLs relacionadas a `pluginfile.php`. A requisição chega ao Moodle, o sistema identifica contexto, componente, filearea, item e arquivo, chama o callback apropriado quando necessário e somente então decide se o usuário pode receber o conteúdo.

Quando o Moodledata está dentro do web root, essa camada pode ser contornada. O Apache ou Nginx entrega o arquivo antes de o PHP ter chance de perguntar quem está acessando. Uma regra de bloqueio pode reduzir o risco, mas a arquitetura correta é manter o diretório fora da árvore pública e não depender de configuração adicional para proteger aquilo que nunca deveria estar exposto.

Essa separação também protege temporários, caches, dados de sessão e outros conteúdos que podem conter informação sensível. Não é apenas uma recomendação de instalação, é parte do modelo de segurança da plataforma.

## 1.34 Routing Engine das versões modernas do Moodle

Durante muitos anos era fácil reconhecer uma página Moodle olhando a URL, porque quase tudo terminava em `.php`. Você queria ver um fórum e ia para `mod/forum/view.php`, queria abrir um curso e encontrava `course/view.php`, e esse modelo ainda existe em grande parte do sistema.

A partir do Moodle 4.5 surgiu um Routing Engine baseado em infraestrutura moderna de roteamento, e o Moodle 5.1 deu ainda mais importância a essa camada ao reorganizar o código e preparar URLs que não precisam corresponder diretamente a um arquivo PHP. Rotas podem ser declaradas em classes, com atributos que descrevem caminho, parâmetros, método HTTP e outras informações.

Isso muda a forma de pensar um endpoint. Em vez de o arquivo ser a URL, a URL passa a representar uma rota e uma classe recebe a requisição por meio do roteador. O ganho não é apenas estético. O mecanismo consegue aplicar middlewares, validação, resolução de parâmetros e documentação de forma mais estruturada.

Não interprete isso como autorização para converter todo `view.php` do seu plugin amanhã. O Moodle mantém compatibilidade e os pontos de integração disponíveis dependem da versão e do grupo de rota suportado. Antes de adotar uma rota, confira a documentação da branch que seu plugin suporta e veja exemplos reais no core daquela versão.

Essa última parte é importante. Copiar código do branch `main` e tentar instalar em Moodle 4.5 ou 5.0 pode produzir um plugin tecnicamente moderno e praticamente inutilizável para seus usuários.

## 1.35 URLs tradicionais versus rotas

Uma URL tradicional normalmente aponta para um script real, por exemplo `/local/exemplo/index.php?id=10`. O servidor encontra o arquivo, executa o PHP, o script carrega `config.php`, valida acesso, prepara `$PAGE` e produz uma resposta.

Em uma rota, o caminho pode não existir como arquivo. O servidor e a configuração de roteamento encaminham a requisição ao mecanismo central, que identifica qual definição corresponde àquele caminho e então chama o controller ou método relacionado.

Do ponto de vista de quem usa o sistema, uma URL como `/api/rest/v2/mod_example/example` pode parecer apenas um endereço mais limpo. Para o desenvolvedor, porém, ela carrega uma arquitetura diferente e você precisa localizar a classe de rota, atributos, parâmetros e middleware em vez de procurar um arquivo `example.php` naquele caminho físico.

Os dois modelos vão conviver por bastante tempo. Portanto, quando receber uma URL e quiser descobrir onde ela nasce, primeiro observe se termina em um endpoint PHP conhecido. Se não termina, procure no sistema de rotas e pesquise pelo path ou pelos atributos de rota no código.

Não force uma preferência ideológica. Arquivo PHP tradicional não virou automaticamente código ruim e rota não torna uma implementação boa por mágica. Use o mecanismo suportado e adequado à API que está construindo.

## 1.36 Como localizar uma API no código do Moodle

Uma das habilidades que mais acelera desenvolvimento Moodle não é conhecer todas as APIs, porque ninguém conhece, e sim saber encontrá-las. Quando surge uma dúvida como "qual é a forma correta de enviar uma mensagem?", "como crio um evento?" ou "como descubro os grupos desta atividade?", começar pelo Google pode ajudar, mas o próprio código do Moodle costuma dar respostas melhores e compatíveis com sua versão.

Eu normalmente começaria pela documentação da API e depois procuraria usos no core. Se você encontrou `message_send()`, por exemplo, pesquise chamadas reais e veja como o objeto é montado em plugins oficiais. Isso mostra não apenas a assinatura, mas quais campos são realmente necessários em situações semelhantes à sua.

A IDE é uma ferramenta essencial aqui. Use "Go to definition", "Find usages", busca por namespace e busca por nome de capability. Se a API usa uma interface, procure implementações. Se encontrou uma classe abstrata, procure quem estende. Se existe um método aparentemente interessante, veja quem o chama antes de concluir que foi feito para código externo.

Outra estratégia é procurar um plugin do core que resolva um problema parecido. Está criando uma task? Veja plugins que já possuem `classes/task/`. Está trabalhando com output? Procure um componente moderno com `classes/output/` e templates. Está criando uma página de gestão? Veja como ferramentas administrativas recentes organizam acesso e navegação.

O que eu evitaria é copiar um trecho de Stack Overflow de 2014 sem verificar se a API ainda existe. Moodle mantém compatibilidade por bastante tempo, portanto código velho frequentemente continua funcionando, o que é ainda mais perigoso, pois "funcionar" pode esconder uma API deprecated há anos.

## 1.37 Como ler `upgrade.txt`

Quando uma atualização de Moodle quebra seu plugin, muita gente começa procurando no fórum depois que o erro já aconteceu. Existe um arquivo que deveria ser consultado antes, o `upgrade.txt`, além das developer update notes da versão.

Esses arquivos registram mudanças relevantes para desenvolvedores, APIs deprecated, alterações de comportamento, remoções e instruções de migração. Não são romances e nem sempre explicam todo contexto, mas funcionam como um mapa das coisas que merecem revisão quando você sobe de branch.

A forma prática de usar é comparar a versão mínima que seu plugin suportava com a versão para a qual está migrando e ler as notas intermediárias, procurando especialmente os subsistemas que seu código utiliza. Se trabalha muito com Quiz, leia mudanças do Question Engine e Quiz; se tem JavaScript, procure alterações de módulos e frontend; se trabalha com renderer e temas, dê atenção a output e Bootstrap.

Depois disso, pesquise no seu código pelos símbolos citados. Se uma função foi deprecated, veja quantas chamadas existem e qual substituto o core recomenda. Não faça apenas um search and replace cego, pois muitas depreciações acontecem justamente porque a nova API possui um modelo diferente.

Também vale abrir o commit ou issue relacionado quando a nota é curta demais. Muitas vezes a discussão e os testes do core deixam claro o caso de uso que motivou a mudança e evitam uma migração feita pela metade.

## 1.38 Como usar a documentação PHPDoc do core

A documentação PHPDoc do Moodle é uma das melhores maneiras de entender classes e métodos específicos quando você já sabe aproximadamente o que procura. Ela mostra namespaces, herança, assinatura, parâmetros, retorno, depreciações e, em muitos casos, aponta o arquivo de origem onde aquela estrutura foi definida.

Não use apenas a busca por nome e pare na primeira classe parecida. Confira o componente, a versão da documentação e a herança. Existem nomes semelhantes em plugins diferentes e a documentação do branch `main` pode conter algo que ainda não existe na versão que seu cliente está usando.

Quando encontrar um método, leia também a classe pai e as interfaces. Às vezes o método interessante aparece herdado e a regra importante está documentada no contrato original. Em outros casos o PHPDoc é curto, mas o link para o source permite abrir a implementação e descobrir validações ou efeitos colaterais que não caberiam em uma descrição de duas linhas.

A documentação fica ainda mais útil quando combinada com "find usages" no código. PHPDoc diz o que a API promete, enquanto os usos do core mostram como os próprios desenvolvedores do Moodle aplicam essa promessa em situações reais. Os dois juntos são muito melhores do que copiar um exemplo isolado de blog sem saber para qual versão foi escrito.

Com o tempo você vai perceber que desenvolver para Moodle exige menos memória do que método. Você não precisa decorar centenas de funções, mas precisa saber reconhecer um componente, descobrir o contexto correto, localizar a API, verificar a documentação da sua versão e confirmar como o core usa aquilo. Essa é a base para os próximos capítulos, porque todo arquivo, classe, banco, formulário, evento ou web service que criarmos vai existir dentro desta arquitetura e não ao lado dela.

## Referências técnicas consultadas

* MOODLE. Moodle 5.1 release notes. Disponível em https://moodledev.io/general/releases/5.1. Acesso em 23 set. 2026.
* MOODLE. Code Restructure. Disponível em https://moodledev.io/docs/5.3/guides/restructure. Acesso em 23 set. 2026.
* MOODLE. Routing. Disponível em https://moodledev.io/docs/5.0/apis/subsystems/routing. Acesso em 23 set. 2026.
* MOODLE. Frankenstyle component names. Disponível em https://moodledev.io/general/development/policies/codingstyle/frankenstyle. Acesso em 23 set. 2026.
* MOODLE. File API. Disponível em https://moodledev.io/docs/5.1/apis/subsystems/files. Acesso em 23 set. 2026.
* MOODLE. Core APIs. Disponível em https://moodledev.io/docs/5.1/apis/core. Acesso em 23 set. 2026.
* MOODLE. Moodle PHP Documentation. Disponível em https://phpdoc.moodledev.io/main/. Acesso em 23 set. 2026.
* MOODLE. Implementação de require_login() em public/lib/moodlelib.php. Disponível em https://github.com/moodle/moodle/blob/main/public/lib/moodlelib.php. Acesso em 23 set. 2026.
* MOODLE. moodle_page::set_course() e moodle_page::set_cm() em public/lib/pagelib.php. Disponível em https://github.com/moodle/moodle/blob/main/public/lib/pagelib.php. Acesso em 23 set. 2026.

{% endraw %}
