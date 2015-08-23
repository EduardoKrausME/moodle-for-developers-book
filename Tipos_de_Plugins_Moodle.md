# TIPOS DE PLUGINS MOODLE

Antes de escrever o primeiro `version.php`, existe uma decisão que costuma definir se o plugin vai envelhecer bem ou se daqui a dois anos alguém vai abrir o código e perguntar por que tudo foi colocado dentro de `local/`. Essa decisão é escolher o tipo correto de plugin. Parece um detalhe de organização porque, olhando de fora, todos acabam sendo pastas com PHP, classes, strings, banco de dados e alguma interface, mas no Moodle o tipo do plugin informa ao core qual papel aquele componente exerce, quando ele deve ser carregado, quais callbacks ou APIs fazem sentido, onde ele aparece na administração e quais contratos específicos precisa cumprir.

É muito tentador começar por `local` porque ele aceita praticamente qualquer coisa e permite colocar páginas próprias, tabelas, tasks, web services, events e integrações sem que o Moodle reclame. O problema é justamente esse. Quando uma ferramenta aceita qualquer coisa, ela também facilita usar a ferramenta errada. Se você quer criar uma atividade que o professor adiciona ao curso, um `local` não vira uma atividade só porque você criou uma tabela com `courseid`; se quer alterar a forma como o curso é apresentado, um `local` não vira `format`; se quer autenticar usuários contra um sistema externo, uma página de login dentro de `local` não substitui um `auth`; se quer controlar matrícula, não faz sentido reinventar `user_enrolments` quando existe um tipo de plugin cuja responsabilidade é exatamente essa.

Neste capítulo vamos olhar para os tipos de plugin como pontos de extensão arquiteturais. A pergunta não será apenas "onde coloco os arquivos?", mas "qual parte do Moodle estou realmente estendendo?". Essa diferença parece teórica até aparecer o primeiro backup que não leva seus dados, a primeira tela de permissões impossível de organizar, o primeiro upgrade que depende de gambiarras ou o primeiro administrador que instala seu plugin esperando um comportamento que aquele tipo nunca prometeu entregar.

## O que é um tipo de plugin

Um tipo de plugin é uma categoria reconhecida pelo Moodle que define onde um conjunto de componentes deve existir e qual função esses componentes exercem dentro da plataforma. `mod`, `block`, `local`, `tool`, `auth`, `enrol`, `qtype` e `theme` não são apenas prefixos para formar um Frankenstyle bonito, eles representam contratos diferentes entre o plugin e o core.

Quando você cria `mod_exemplo`, o Moodle entende que está diante de uma atividade ou recurso de curso, portanto existe uma série de expectativas relacionadas a course module, criação de instância, exclusão, suporte a recursos, backup, restore, visibilidade e integração com o curso. Quando cria `auth_exemplo`, o Moodle não espera uma atividade e sim um mecanismo de autenticação que participe do fluxo de identificação do usuário. Em `enrol_exemplo`, a expectativa muda novamente porque o plugin passa a trabalhar com instâncias de matrícula e vínculos entre usuário e curso. A pasta pode continuar contendo `classes/`, `lang/`, `db/` e `version.php`, mas o papel arquitetural mudou completamente.

Isso explica por que copiar a estrutura de um plugin qualquer e trocar o nome quase nunca é uma boa forma de aprender. Você pode copiar um `local`, fazê-lo instalar e concluir que entendeu desenvolvimento Moodle, mas ainda não aprendeu qual problema cada tipo resolve. É parecido com aprender orientação a objetos criando uma classe chamada `Utils` e colocando tudo dentro dela. Funciona por algum tempo, só não quer dizer que a arquitetura esteja correta.

O tipo também participa do nome completo do componente. Um plugin chamado `supervideo` dentro de `mod/` será `mod_supervideo`, enquanto um plugin chamado `supervideo` dentro de `local/` será `local_supervideo`. Isso afeta namespaces, strings de idioma, capabilities, configurações, eventos, templates, cache definitions e praticamente qualquer API que identifique o componente pelo Frankenstyle, portanto mudar o tipo depois que o plugin já está em produção não é simplesmente mover uma pasta.

## Como o Moodle descobre os tipos de plugins

O Moodle não percorre o disco inteiro tentando adivinhar quais diretórios parecem plugins. Existe um mapa conhecido pelo core que informa quais tipos são válidos e onde cada tipo deve ser procurado, e a partir desse mapa o componente `core_component` consegue descobrir os plugins instalados, resolver caminhos, montar caches de componentes e responder perguntas como "quais plugins do tipo `auth` existem neste site?".

Isso faz diferença quando você está depurando um plugin que simplesmente não aparece. Se criou `/qualquercoisa/meuplugin`, adicionou um `version.php` impecável e o Moodle ignora a pasta, o problema não está necessariamente no `version.php`; talvez aquele diretório não corresponda a nenhum tipo reconhecido. O Moodle não considera uma pasta plugin apenas porque ela contém arquivos parecidos com os de outro plugin.

Em código, duas classes aparecem com frequência quando você quer investigar isso. `core_component` trabalha com descoberta e localização de componentes, enquanto `core_plugin_manager` adiciona uma camada orientada ao gerenciamento de plugins, versões, dependências, instalação e informações específicas de cada tipo. Em uma investigação real eu começaria pelo segundo quando quero responder algo como "o Moodle reconheceu meu plugin?" e iria ao primeiro quando quero entender caminhos, tipos, subplugins e resolução de componentes.

Também vale separar duas coisas que parecem iguais no começo. O Moodle conhece tipos de plugins de alto nível, como `mod`, `local` e `theme`, mas alguns plugins podem definir tipos de subplugins próprios. Assignment, Quiz, editores e ferramentas administrativas são bons exemplos de componentes que podem hospedar extensões abaixo deles, portanto a árvore final de componentes não vem apenas de um arquivo central, ela é complementada por declarações dos componentes que suportam subplugins.

## `lib/classes/component.php`

No Moodle 3.5, a descoberta dos tipos de plugin é implementada por `core_component`, em `lib/classes/component.php`. O método que monta os tipos conhecidos associa nomes como `mod`, `auth`, `enrol`, `block`, `filter`, `format`, `dataformat`, `qtype`, `qbehaviour`, `qformat`, `tool` e `local` aos diretórios correspondentes.

Quando você quiser confirmar um tipo de plugin, olhe a implementação de `core_component` e a árvore da própria instalação. Isso é mais confiável do que assumir que qualquer diretório com `version.php` será descoberto pelo Moodle.
## Como escolher corretamente o tipo de plugin

Uma forma simples de escolher o tipo correto é parar de perguntar "qual tipo me deixa fazer isso?" e perguntar "qual parte do Moodle é dona desse comportamento?". Se o comportamento pertence ao curso como uma atividade adicionada pelo professor, comece investigando `mod`; se pertence ao mecanismo de autenticação, `auth`; se controla quem entra em um curso, `enrol`; se define como um curso é organizado visual e estruturalmente, `format`; se transforma texto durante a renderização, `filter`; se adiciona uma condição do tipo "somente após determinada data" ou "somente se a nota for maior que X", `availability`.

Outra pergunta útil é imaginar onde o administrador ou professor espera encontrar a funcionalidade sem ter lido sua documentação. Se você entrega um relatório institucional, faz sentido ele aparecer na área de relatórios e obedecer ao modelo de um `report`; se entrega uma ferramenta de manutenção que altera dados do site, reprocessa registros ou oferece rotinas administrativas, `tool` comunica melhor a intenção; se entrega um componente de apresentação que pode ser adicionado a regiões da página, `block` é muito mais natural do que inventar HTML em callbacks globais.

Também observe o ciclo de vida. Uma atividade possui instâncias dentro de cursos, um método de matrícula possui instâncias de enrolment por curso, um block pode possuir instâncias em diferentes contextos e um theme possui configuração e herança visual, mas não instâncias da mesma natureza. Escolher o tipo errado normalmente significa que você terá de recriar por conta própria exatamente o ciclo de vida que o tipo correto já oferecia.

Há casos em que mais de um tipo parece plausível. Um dashboard administrativo pode ser `report`, `tool` ou `local`, dependendo do que realmente faz. Se apenas consulta e apresenta dados, `report` costuma ser o encaixe mais natural; se executa manutenção e operações administrativas, `tool`; se é uma aplicação institucional maior, com páginas para diferentes perfis, integrações e responsabilidades que não cabem em um contrato mais específico, `local` pode ser adequado. O nome da tela não decide o tipo, a responsabilidade decide.

## Quando NÃO criar um `local`

A documentação do Moodle deixa claro que a recomendação é usar um tipo padrão quando ele existe e recorrer a `local` quando a funcionalidade não se encaixa adequadamente nos outros tipos. Essa frase deveria estar colada no monitor de quem começa a desenvolver para Moodle porque `local` é provavelmente o tipo mais abusado do ecossistema.

Imagine que você precisa criar uma atividade em que o professor publica uma pergunta e os estudantes respondem. É possível fazer tudo em `local`: criar tabelas, uma página `view.php`, um formulário, capability, navegação e até uma coluna `courseid`. Só que o Moodle continuará sem enxergar aquilo como atividade. Você não terá um `course_module` natural, não aparecerá corretamente no activity chooser, não herdará o fluxo padrão de duplicação, completion, grupos, disponibilidade, backup da atividade e outras integrações que o tipo `mod` já conhece.

O mesmo vale para autenticação. Você pode criar um endpoint em `local_meulogin`, consultar uma API externa e chamar funções para criar o usuário, mas se a intenção é participar do fluxo de autenticação, existe `auth` exatamente para isso. Ao contornar o tipo correto você começa a acumular exceções, redirecionamentos, páginas paralelas e condições especiais, e no final gastou mais código para implementar uma versão incompleta de uma API que já existia.

Eu uso `local` quando estou construindo algo realmente transversal ou institucional que não possui um ponto de extensão mais específico, como uma integração que consome eventos do Moodle e envia dados para um ERP, uma aplicação de administração própria, um conjunto de web services institucionais ou uma camada que coordena diferentes componentes. Mesmo nesses casos vale perguntar se parte do problema deveria ser dividida em outros plugins, porque um `local` de cinquenta mil linhas que autentica, matricula, apresenta blocos, cria relatórios e altera curso não é versátil, é apenas monolítico.

## Mas Kraus, você só cria plugin `local` pra quase tudo

E alguém que acompanha meus plugins provavelmente chegou até aqui pensando exatamente isso. "Mas Kraus, você acabou de passar várias páginas dizendo que `local` não é resposta para tudo e, quando eu olho seus projetos, tem `local` para todo lado." Sim, tem mesmo, e a diferença está no motivo pelo qual o tipo foi escolhido, porque usar muito `local` por trabalhar com integrações e funcionalidades transversais é uma coisa, enquanto usar `local` porque é o único tipo de plugin que você conhece é outra completamente diferente.

Boa parte das soluções que desenvolvo não pertence a uma única atividade, não é somente matrícula, não é somente autenticação e também não é apenas um relatório. São integrações institucionais, hubs administrativos, automações, sincronizações, serviços que escutam eventos e componentes que precisam acompanhar várias partes do Moodle ao mesmo tempo, então nesses casos `local` não é um atalho, ele pode ser justamente o componente que melhor representa uma responsabilidade transversal.

Um exemplo ajuda bastante. Quando crio um `mod`, existe uma atividade concreta dentro do curso. O professor adiciona aquela atividade, o Moodle cria a instância e o respectivo `course_module`, e a experiência principal daquele plugin gira em torno dessas instâncias. Quando o aluno entra em `mod/meuplugin/view.php`, estou dentro da minha atividade, tenho o `cm`, o curso, a instância e o contexto, portanto consigo executar a lógica própria daquele recurso com todas as informações que o Moodle já preparou para mim.

É nesse sentido que eu costumo dizer que, com um `mod`, eu "tenho o plugin" quando o aluno abre aquela atividade. Não significa que o PHP do módulo seja incapaz de executar em qualquer outro momento, porque um activity module instalado também pode registrar observers de eventos, tasks, callbacks e outros pontos de integração. Significa que o fluxo natural e a responsabilidade principal daquele tipo estão ligados às instâncias do próprio módulo.

Agora imagine que o requisito seja diferente. Eu preciso executar determinada lógica quando o aluno acessa qualquer atividade do Moodle, seja Quiz, Assignment, Fórum, SCORM, Page ou um módulo de terceiro. Nesse cenário não posso depender de o estudante abrir o meu `view.php`, porque ele pode passar o curso inteiro sem entrar em nenhuma instância do meu módulo e, mesmo assim, meu código precisa saber que outra atividade foi acessada.

Tecnicamente um `mod` também pode ouvir eventos de outros componentes. Um plugin instalado pode registrar observers em `db/events.php` e, quando um evento compatível for disparado, receber o objeto do evento e trabalhar com as informações disponíveis nele, como `contextid`, `courseid`, `userid`, `objectid`, `relateduserid` e dados presentes em `other`, lembrando que o conjunto exato depende do evento que foi disparado. Portanto, se a única pergunta fosse "é possível fazer isso dentro de um `mod`?", a resposta seria sim.

E essas informações permitem controlar bastante coisa. Posso verificar de qual curso veio o evento, qual usuário estava envolvido, qual contexto disparou a ação e qual objeto foi acessado, depois cruzo isso com configurações próprias para decidir se devo executar alguma lógica ou simplesmente retornar. Se preciso ativar a funcionalidade apenas para determinados cursos, perfis ou tipos de atividade, tenho dados suficientes para construir essa decisão sem colocar código dentro de cada módulo existente no Moodle.

Mas aqui aparece novamente a diferença entre conseguir fazer e escolher o tipo certo. Se eu criei `mod_meuplugin` apenas porque precisava de um lugar para registrar um observer que acompanha Quiz, Assignment, Fórum e qualquer outra atividade, então estou usando um tipo que representa uma atividade para implementar uma funcionalidade que não é uma atividade. O código pode funcionar perfeitamente e mesmo assim a arquitetura estar contando uma história errada para quem abrir o projeto depois.

Quando esse acompanhamento é realmente transversal, um `local` costuma expressar melhor a intenção. Ele pode ouvir os mesmos eventos e utilizar callbacks quando houver um ponto adequado, manter settings, executar tasks, expor Web Services e guardar regras próprias sem fingir que existe uma atividade pedagógica apenas para justificar a pasta em que o código foi colocado.

Agora mude novamente o problema. O professor precisa adicionar ao curso uma atividade chamada "Nível de confiança", configurar uma pergunta, permitir que os estudantes respondam e depois acompanhar os resultados. Eu poderia criar `local_confidence`, guardar `courseid` na tabela, montar uma página própria e colocar um link no curso. Funcionaria, mas seria a solução errada porque aquilo é claramente uma atividade e eu quero que o Moodle a trate como atividade, com `course_modules`, activity chooser, grupos, disponibilidade, completion, backup, restore e duplicação.

Nesse caso eu criaria `mod_confidence`, mesmo que fosse mais rápido pegar a estrutura de algum `local` que já tenho pronta. É justamente aqui que experiência pode virar vício, porque depois de criar muitos plugins `local` você já possui classes, CI, settings, banco e padrões que conhece de cabeça, então aparece um problema novo e a primeira reação é começar pelo tipo que você domina.

É o velho problema de quem tem um martelo e começa a descobrir uma quantidade surpreendente de pregos pelo mundo. O fato de eu conseguir resolver praticamente qualquer problema com um `local` não significa que deveria fazer isso, da mesma forma que eu poderia abrir uma conexão PDO e consultar diretamente as tabelas do Moodle e nem por isso seria uma boa decisão.

Também não precisamos cair no extremo oposto. Se estou construindo uma aplicação institucional grande que reúne integrações, processos administrativos, relatórios, automações e regras que atravessam vários subsistemas, dividir artificialmente cada tela em um tipo diferente apenas para poder dizer que usei muitos plugin types pode aumentar a complexidade sem produzir benefício algum. Arquitetura não é concurso para ver quem usa mais tipos de plugin.

A pergunta continua sendo a mesma. Qual componente do Moodle é realmente dono desse comportamento? Se existe um tipo específico que representa bem o problema e oferece um ciclo de vida que eu precisaria reconstruir manualmente, uso esse tipo. Se a funcionalidade é genuinamente transversal e não pertence a nenhum desses subsistemas, `local` continua sendo uma escolha perfeitamente válida.

Então sim, eu crio muitos plugins `local` e provavelmente continuarei criando, mas existe uma diferença enorme entre "usei `local` porque analisei o problema e ele é transversal" e "usei `local` porque é o único tipo de plugin que sei criar". O primeiro é uma decisão de arquitetura, enquanto o segundo é uma limitação técnica disfarçada de decisão de arquitetura.

## Activity modules `mod`

Activity modules são os plugins que participam diretamente da experiência do curso como atividades ou recursos adicionados pelo professor. Fórum, Quiz, Assignment, Page, Book, URL, SCORM e várias outras funcionalidades que você vê no seletor de atividades são módulos do tipo `mod`, cada um com suas particularidades, mas todos integrados ao modelo de course modules.

Escolha `mod` quando a unidade principal da sua funcionalidade precisa existir como uma instância dentro de um curso. Isso significa que o professor adiciona aquela atividade, configura seus parâmetros, o Moodle cria um registro da instância e um `course_modules`, associa a atividade a uma seção do curso e passa a tratá-la como parte da estrutura pedagógica. A partir daí entram naturalmente recursos como visibilidade, grupos, conclusão, restrições de acesso, datas, eventos de calendário, backup, restore e integração com diferentes telas do curso.

Um erro comum é escolher `mod` apenas porque o plugin precisa aparecer no curso. Nem tudo que aparece no curso precisa ser atividade. Um painel lateral pode ser `block`, uma alteração na organização geral do curso pode ser `format`, uma condição de acesso pode ser `availability` e um relatório sobre o curso pode ser `report`. `mod` faz sentido quando existe uma entidade de atividade ou recurso que deve ser criada, configurada e gerenciada pelo curso.

Outro detalhe importante é que módulos possuem contratos específicos em `lib.php` e outros arquivos que não se aplicam a plugins genéricos. Funções de criação, atualização, exclusão e declaração de suporte a features ainda fazem parte dessa integração, portanto você não deve tratar `mod` como um `local` que por acaso fica dentro de `/mod`. Módulos de Atividade entra profundamente nessa arquitetura, mas aqui o ponto é entender por que o tipo existe.

## Blocks `block`

Blocks são componentes de interface que podem ser adicionados a regiões de páginas compatíveis, normalmente para mostrar informação contextual, atalhos, indicadores ou pequenas ferramentas. Eles possuem instâncias próprias e podem aparecer em contextos diferentes, como curso, dashboard ou outras páginas, conforme o que o plugin declara suportar.

Se você precisa mostrar "Últimos chamados", "Progresso do curso", "Atalhos do professor" ou uma pequena visão contextual que acompanha determinadas páginas, um block pode ser uma solução muito mais natural do que injetar HTML globalmente. O administrador ou usuário, dependendo da configuração, consegue adicionar, mover, ocultar e configurar a instância utilizando mecanismos que o Moodle já possui.

O erro clássico aqui é transformar block em aplicação inteira. Um block deve ser uma peça relativamente pequena de interface. Se ele precisa carregar uma tabela com vinte filtros, cinco abas, importação de arquivo e edição massiva, provavelmente o block deveria ser apenas uma porta de entrada para uma página própria de outro componente ou para uma parte mais adequada da arquitetura.

Também não confunda block com dashboard. Um dashboard complexo pode até conter blocks, mas o tipo `block` não existe para substituir qualquer página visual. O ciclo de vida, a configuração por instância e a dependência de regiões de block são justamente o que diferencia esse tipo.

## Local plugins `local`

`local` é o tipo genérico para customizações que não encontram um ponto de extensão melhor e por isso é extremamente útil quando usado com disciplina. Um plugin local pode ter páginas próprias, banco de dados, events, callbacks, tasks, web services, settings, capabilities, caches, classes, templates e praticamente todas as APIs transversais que veremos nos capítulos seguintes.

Há características históricas e arquiteturais que fazem `local` ser interessante para customizações institucionais. Esses plugins são processados por último em alguns fluxos de instalação e upgrade, podem adicionar configurações administrativas de forma bastante flexível e são candidatos naturais para consumidores de eventos que integram o Moodle com sistemas externos.

Um bom exemplo é uma integração acadêmica que recebe eventos de matrícula, conclusão e atualização de usuário, transforma os dados e envia para um sistema corporativo. Isso não é uma atividade, não é um método de matrícula por si só e não é um relatório, portanto um `local` pode funcionar como camada de integração. Outro exemplo é uma aplicação interna de suporte que reúne dados de diferentes áreas do Moodle e conversa com APIs externas sem pretender substituir um tipo específico.

A regra prática continua sendo a mesma. Use `local` quando ele representar melhor o problema, não quando você estiver com preguiça de aprender a API específica. Parece uma provocação, mas é um problema real. Muitos plugins começam em `local` porque "é mais fácil" e passam anos carregando limitações que teriam desaparecido se o tipo correto fosse escolhido no primeiro dia.

## Admin tools `tool`

Plugins `tool` existem para ferramentas administrativas e de manutenção, normalmente acessíveis pela árvore de Administração do site e executadas em contexto de sistema. Eles nasceram justamente para evitar que utilitários administrativos fossem espalhados em diretórios genéricos ou fossem disfarçados de relatórios.

A diferença entre `tool` e `report` fica mais clara quando você pensa em ação versus observação. Um relatório normalmente lê e apresenta informação, eventualmente exporta, filtra e agrega dados. Uma ferramenta administrativa tende a executar operações, corrigir registros, migrar dados, verificar consistência, configurar processos, reprocessar filas ou oferecer uma interface de manutenção.

Imagine uma tela que procura cursos com inconsistências e apresenta uma lista. Se ela apenas informa, pode ser relatório. Se permite selecionar registros, corrigir referências, reconstruir dados e executar tarefas administrativas, `tool` passa a representar melhor o comportamento. Essa distinção também ajuda na leitura do código, pois quando alguém vê `tool_meucorretor` já entende que existe uma intenção administrativa forte.

`tool` também é um dos tipos que podem hospedar subplugins, algo importante para arquiteturas extensíveis e que veremos em Subplugins. Isso não significa que todo admin tool precise de subplugins, mas mostra que o tipo foi pensado para soluções administrativas que podem crescer de forma modular.

## Reports `report`

Plugins `report` existem para apresentar visões de dados do Moodle, normalmente voltadas a administradores ou usuários autorizados. Um relatório pode ter filtros, paginação, tabelas, gráficos e exportações, mas sua essência é transformar dados já existentes em informação útil, não criar um subsistema paralelo de negócio.

É comum ver relatórios implementados como `local` porque o desenvolvedor começou pela URL e não pelo papel do componente. Se o plugin é fundamentalmente uma tela de consulta com filtros por curso, usuário, período, status e exportação, `report` comunica a intenção melhor e se encaixa nas áreas de relatórios do Moodle.

Isso não quer dizer que um `report` não possa ter configurações, capabilities ou classes complexas, apenas significa que o tipo ajuda a organizar uma responsabilidade específica. Da mesma forma, se a tela começou como relatório mas passou a alterar centenas de registros, reprocessar estados e executar rotinas de manutenção, talvez você tenha atravessado a fronteira para `tool` e vale revisar a arquitetura.

Também existem relatórios especializados em outras famílias, como `gradereport`, que veremos mais adiante. O ponto é não colocar tudo que possui tabela HTML dentro de `report`; escolha o tipo pela área funcional que está sendo estendida.

## Course formats `format`

Course formats controlam como o conteúdo principal de um curso é organizado e apresentado. Tópicos, semanas e outros formatos determinam a estrutura visual e comportamental de `/course/view.php`, participam da navegação e podem adicionar opções próprias ao curso.

Use `format` quando a ideia não é adicionar uma atividade, mas mudar a forma como o conjunto de atividades e seções é estruturado. Um formato pode criar uma navegação por abas, organizar seções de maneira diferente, alterar a experiência de edição, definir regras de apresentação ou fornecer uma interface própria em torno do conteúdo do curso.

Um erro comum é tentar implementar isso com theme ou JavaScript global. O theme pode alterar aparência e parte da renderização, mas a semântica de organização do curso pertence ao course format. Se sua lógica precisa saber qual seção está ativa, como seções são apresentadas, como o índice do curso funciona e como o professor edita essa estrutura, `format` provavelmente está mais próximo do problema.

Course format é um tipo poderoso e, justamente por tocar uma área central da experiência, exige cuidado com compatibilidade entre versões. Mudanças no course format subsystem podem afetar renderização, classes de output e APIs relacionadas ao course index, portanto um formato bem mantido acompanha de perto os developer updates do Moodle.

## Themes `theme`

Themes controlam a camada visual e parte da estrutura de apresentação do Moodle. Eles trabalham com SCSS, templates, renderers, layouts, configuração visual, herança de outro theme e diversos mecanismos que permitem adaptar a interface sem alterar o core.

O erro mais perigoso é usar theme como depósito de regra de negócio. Como o theme está disponível em muitas páginas, parece conveniente colocar nele consulta de banco, integração com API, regra de acesso e comportamento institucional, mas isso cria dependência entre apresentação e negócio. Trocar o theme deveria mudar a aparência e eventualmente componentes de experiência, não desligar a integração acadêmica da instituição.

Outro problema aparece quando o desenvolvedor sobrescreve template ou renderer sem necessidade e passa a carregar uma cópia inteira de markup do core. Na versão seguinte, o core corrige acessibilidade, altera classes ou adiciona elementos, mas o override continua congelado. Theme é o tipo correto para customização visual, só não significa que todo problema visual exige copiar uma página inteira.

Quando uma funcionalidade pertence ao negócio e precisa funcionar independentemente do theme ativo, implemente-a no componente apropriado e deixe o theme decidir apenas como aquilo será apresentado quando houver um ponto de extensão adequado.

## Authentication `auth`

Plugins `auth` participam do processo de autenticação, ou seja, da forma como o Moodle verifica a identidade do usuário e relaciona a conta local com uma fonte de credenciais. LDAP e outros mecanismos de autenticação ajudam a entender a ideia, embora cada implementação tenha regras próprias.

Se sua instituição possui um serviço externo que valida usuário e senha, ou outro mecanismo que precisa participar do login, `auth` é a primeira família a investigar. Isso permite trabalhar dentro do fluxo esperado do Moodle em vez de criar uma tela paralela que autentica por fora e depois tenta fabricar uma sessão.

Autenticação não é matrícula. Um usuário pode estar autenticado no Moodle e ainda assim não estar matriculado em curso nenhum. Misturar os dois conceitos cria sistemas difíceis de manter, especialmente quando o desenvolvedor usa o sucesso do login como sinal para inscrever o usuário em dezenas de cursos. Se a regra envolve acesso ao curso, existe a API de enrolment e talvez um plugin `enrol` deva trabalhar junto.



## Enrolment `enrol`

Plugins `enrol` controlam métodos de matrícula em cursos. Eles trabalham com instâncias associadas ao curso e podem criar, atualizar, suspender ou remover vínculos de matrícula de acordo com uma regra específica, como autoinscrição, coorte, fonte externa, pagamento ou sincronização institucional.

A distinção entre enrolment e role assignment é fundamental. Estar matriculado significa possuir um vínculo de participação no curso, enquanto possuir uma role significa receber um conjunto de permissões em determinado contexto. Na prática os dois processos frequentemente acontecem juntos, mas arquiteturalmente são coisas diferentes e o Moodle mantém estruturas separadas para isso.

Se você recebe dados de um ERP dizendo que o aluno 123 está matriculado na disciplina X até determinada data, um plugin `enrol` pode representar muito bem essa regra porque o problema central é manter vínculos de matrícula sincronizados. Criar um `local` que manipula diretamente `user_enrolments` pode até funcionar, mas você perde parte da semântica e dos mecanismos de uma instância de método de matrícula.

em Plugins de Matrícula vamos entrar em detalhes como `enrol_user()`, suspensão, datas e roles, mas aqui basta guardar a pergunta principal. Se sua funcionalidade responde "quem participa deste curso e por quê?", investigue `enrol` antes de qualquer solução genérica.

## Filters `filter`

Filters transformam conteúdo antes da apresentação, normalmente quando texto passa pelas APIs de formatação do Moodle. O exemplo clássico é converter um padrão textual em outro conteúdo, transformar referências em links, renderizar fórmulas ou reconhecer marcações específicas.

Use `filter` quando o comportamento precisa acontecer sobre conteúdo formatado e de forma relativamente transparente para quem escreveu o texto. Se professores digitam uma marcação como `[produto:123]` e você quer transformar isso em um componente visual durante a renderização, um filter pode ser uma possibilidade, desde que a transformação realmente pertença à fase de filtragem.

Filters precisam ser tratados com cuidado de performance porque podem ser executados em muitos pedaços de texto ao longo de uma página. Uma consulta ao banco ou chamada HTTP feita ingenuamente para cada fragmento pode destruir o tempo de resposta. É um daqueles lugares em que um código aparentemente pequeno consegue ficar caro muito rápido.

Também não use filter como mecanismo universal de manipulação de HTML. Se a necessidade é alterar uma página específica ou renderizar um componente próprio, provavelmente existe uma API melhor. Filter faz sentido quando existe uma regra de transformação textual reutilizável dentro do pipeline de formatação.

## Repository `repository`

Repository plugins conectam o seletor de arquivos do Moodle a fontes externas ou formas alternativas de obter conteúdo. O objetivo é permitir que o usuário navegue, procure ou selecione arquivos em um repositório sem que cada atividade precise implementar sua própria integração.

Imagine que a instituição possui um acervo corporativo de documentos ou mídia. Se várias áreas do Moodle precisam selecionar arquivos desse acervo, implementar um `repository` pode ser mais coerente do que adicionar um botão personalizado em cada formulário. O repository participa da experiência padronizada de seleção de arquivos e entrega ao Moodle informações necessárias para trazer ou referenciar o conteúdo.

É importante diferenciar repository de armazenamento interno. A Files API continua responsável pela forma como o Moodle gerencia seus arquivos, enquanto repository é uma fonte de onde o usuário pode escolher conteúdo. Da mesma forma, Alternative File Systems tratam do backend físico de armazenamento dos arquivos já gerenciados pelo Moodle, o que é outro problema completamente diferente.

Essa separação evita uma confusão comum. Google Drive como fonte de seleção de documentos é um problema de repository; S3 ou object storage como backend do filedir é problema de File System API; e um link para vídeo externo pode ainda envolver media, filter ou plugin específico dependendo do comportamento desejado.

## Availability conditions `availability`

Availability conditions permitem criar regras adicionais de restrição de acesso para atividades e seções. O Moodle já possui condições como data, nota, grupo e conclusão, e esse tipo de plugin existe para adicionar novas condições que o professor consegue combinar com as demais.

Se você quer permitir acesso apenas quando o estudante possui determinado atributo, pertence a uma condição institucional específica ou satisfaz uma regra que não existe no core, um plugin `availability` costuma ser muito mais adequado do que esconder elementos manualmente em um theme ou bloquear acesso dentro de cada `view.php`.

A vantagem é que a condição passa a participar do mecanismo oficial de disponibilidade. O professor configura a regra na interface esperada, o Moodle avalia a condição de forma padronizada e outras partes do sistema conseguem entender por que o item está ou não disponível.

Isso também ajuda na segurança e consistência, embora disponibilidade não substitua capability quando a questão é autorização. Uma condição de disponibilidade controla a regra pedagógica ou operacional de acesso ao item, enquanto capability responde se o usuário tem permissão para determinada ação. Misturar os dois conceitos costuma produzir páginas que desaparecem visualmente mas continuam acessíveis por URL.

## Question types `qtype`

`qtype` define tipos de questão que o Question Engine consegue utilizar. Multiple choice, true/false, short answer e vários outros tipos seguem esse modelo, cada um responsável pela estrutura da questão, respostas, avaliação, edição e comportamento necessário para que a engine consiga processá-la.

Crie um `qtype` quando a unidade que você está inventando é realmente um novo tipo de questão. Isso significa que professores poderão criar questões desse tipo no banco de questões e que essas questões poderão ser utilizadas em contextos compatíveis com o Question Engine, como Quiz e outros componentes que trabalham com question usages.

Um erro comum é criar um activity module só porque existe uma pergunta na tela. Se o problema é "preciso de uma nova forma de questão que deve funcionar dentro do Quiz", o ponto de extensão é `qtype`, não `mod`. O activity module faria você reconstruir tentativas, estados, respostas e avaliação que o Question Engine já oferece.

Nem toda extensão relacionada a questões precisa ser `qtype`. Se você quer mudar como uma questão se comporta durante a tentativa, existe `qbehaviour`; se quer importar ou exportar questões em outro formato, existe `qformat`. Para alterações de interface do banco de questões, no Moodle 3.5 normalmente trabalhamos com os pontos de extensão e callbacks disponíveis no próprio subsistema, sem um tipo de plugin dedicado para isso.

## Question behaviours `qbehaviour`

Question behaviours controlam a interação entre a questão e a tentativa. Eles determinam como respostas são submetidas, quando feedback aparece, como tentativas são processadas e como o estado da questão evolui conforme o estudante interage.

Isso é diferente do tipo da questão. Uma mesma questão pode ser respondida sob comportamentos diferentes, dependendo da configuração do Quiz ou da atividade que utiliza o Question Engine. Se você quer criar uma nova regra de interação, como um fluxo específico de validação ou submissão, o ponto de extensão está mais próximo de `qbehaviour` do que de `qtype`.

A distinção é importante porque tentar colocar comportamento de tentativa dentro do qtype cria acoplamento. O qtype deveria definir a lógica própria daquela espécie de questão, enquanto o behaviour organiza a dinâmica da tentativa de maneira reutilizável.

É uma área avançada e não costuma ser o primeiro plugin de ninguém, mas entender que ela existe impede soluções enormes para problemas que o Question Engine já separou arquiteturalmente.

## Question formats `qformat`

Question formats são plugins de importação e exportação de questões. Eles traduzem entre a representação do Moodle e formatos externos, como arquivos utilizados por outras ferramentas ou estruturas próprias de uma instituição.

Se a necessidade é receber um arquivo, interpretar perguntas e criar questões no banco, isso não significa automaticamente criar um `local` com upload. O upload pode fazer parte da interface, mas a lógica de traduzir um formato de questões pertence naturalmente a `qformat`, principalmente quando você quer que a funcionalidade apareça junto aos mecanismos oficiais de importação e exportação.

Um qformat bem implementado precisa lidar com mais do que texto e resposta correta. Dependendo dos tipos envolvidos, pode haver feedback, categorias, imagens, arquivos embutidos, configurações específicas e informações que precisam ser preservadas durante ida e volta.

A vantagem de usar o tipo correto é integrar a funcionalidade ao fluxo que professores já conhecem, em vez de criar uma segunda tela de importação que faz quase a mesma coisa e precisa manter sua própria lógica de navegação, permissões e tratamento de erros.

## Data formats

Plugins `dataformat` definem formatos de saída para exportação e download de dados. CSV, Excel e outras representações podem ser oferecidas por meio dessa camada, permitindo que tabelas e relatórios usem uma API comum em vez de cada plugin reinventar geração de arquivo.

Se você está criando um relatório e precisa exportar os mesmos dados em diferentes formatos, vale usar a Dataformat API em vez de escrever manualmente cabeçalhos HTTP, delimitadores CSV e bibliotecas de planilha em cada página. O ganho não é apenas reduzir código, mas integrar sua saída aos formatos que o site possui instalados.

Esse tipo é especialmente interessante em grandes resultados porque a API foi pensada para fluxo de dados e formatos de exportação. Criar uma string gigantesca em memória e só depois enviar ao navegador pode funcionar no ambiente de desenvolvimento e morrer quando o relatório chega a centenas de milhares de linhas.

em APIs Transversais Essenciais veremos Dataformat como API transversal, enquanto aqui importa reconhecer que os próprios formatos são plugins e podem ser ampliados.

## Message outputs

Plugins de saída de mensagens, com Frankenstyle `message`, representam destinos ou processadores pelos quais notificações e mensagens podem ser entregues. Email é o exemplo mais óbvio, mas a arquitetura permite outros canais.

Se você quer integrar um novo canal de entrega ao sistema de mensagens do Moodle, como um serviço corporativo específico, a primeira pergunta deve ser se isso pertence a um message output. Assim o usuário e o administrador continuam trabalhando com preferências e provedores de mensagem do Moodle, enquanto seu plugin se concentra em entregar a notificação ao destino.

Isso é melhor do que espalhar chamadas HTTP dentro de cada plugin que precisa notificar alguém. Quando cada componente conversa diretamente com WhatsApp, SMS, Teams ou qualquer serviço externo, você perde centralização, preferências do usuário, consistência e capacidade de trocar o canal depois.

Não confunda message output com message provider. O provider é declarado pelo componente que produz determinada categoria de mensagem, enquanto o output é o canal que entrega. Essa distinção será aprofundada quando estudarmos Message API.

## Grade reports

Plugins `gradereport` estendem as formas de visualizar e trabalhar com notas no Gradebook. Grader report, user report e outras visualizações pertencem a essa família.

Se você precisa criar uma nova visão do livro de notas, com organização e interação próprias, `gradereport` é muito mais adequado do que um `report` genérico ou uma página em `local`. A diferença é que o plugin passa a viver dentro do domínio do Gradebook, utilizando suas estruturas, navegação e expectativas.

Isso não significa que todo relatório que mostra nota precise ser gradereport. Um relatório institucional que cruza notas com dados financeiros, evasão e indicadores de várias áreas pode continuar sendo `report` ou outra aplicação, enquanto uma nova forma de operar e visualizar o livro de notas pertence naturalmente ao Gradebook.

Gradebook e Completion vai tratar das APIs de nota e completion, mas aqui vale observar como o Moodle possui tipos especializados dentro de subsistemas grandes em vez de empurrar qualquer tela para um plugin genérico.

## Grade import

Plugins `gradeimport` adicionam formatos ou mecanismos para importar notas para o Gradebook. Eles trabalham no fluxo de entrada de dados e precisam transformar uma fonte externa em atualizações que respeitem a estrutura de itens e notas do Moodle.

Se uma instituição possui um arquivo específico de notas exportado por outro sistema, criar um grade import pode integrar esse formato à experiência normal de importação. Fazer upload em um `local` e atualizar `grade_grades` diretamente seria uma solução tecnicamente possível e arquiteturalmente péssima, porque tabelas do Gradebook não deveriam ser tratadas como uma planilha qualquer.

A API de notas possui regras de origem, recalculação, itens e estados que precisam ser respeitados. O tipo correto não elimina a necessidade de entender essas APIs, mas coloca a funcionalidade no lugar em que administradores e professores esperam encontrá-la.

## Grade export

Plugins `gradeexport` fazem o caminho contrário e oferecem formatos de exportação das notas. Eles integram novas representações ao fluxo de exportação do Gradebook e podem atender sistemas externos que exigem layout ou estrutura específica.

A decisão entre `gradeexport` e `dataformat` depende do problema. `dataformat` é uma infraestrutura geral para formatos de dados, enquanto `gradeexport` participa do domínio específico de exportação de notas, com contexto e fluxo próprios do Gradebook.

Se você precisa simplesmente oferecer CSV e XLSX em uma tabela administrativa, provavelmente Dataformat resolve. Se precisa criar uma exportação acadêmica específica das notas, integrada às telas e regras do livro de notas, investigue `gradeexport`.

Essa distinção entre "formato genérico" e "fluxo funcional específico" aparece várias vezes na arquitetura do Moodle e é uma boa forma de decidir entre plugin types que parecem sobrepostos.

## Advanced grading methods

Advanced grading methods usam o tipo `gradingform` e definem interfaces e lógica para formas estruturadas de avaliação, como rubric e marking guide. Eles não são plugins de nota genéricos, mas métodos utilizados por atividades que suportam avaliação avançada.

Se você quer criar um novo modelo de avaliação com critérios, níveis, pesos ou outra mecânica estruturada que possa ser usada por atividades compatíveis, `gradingform` é a família a estudar. Criar essa interface diretamente dentro de um `mod` pode prender a solução a uma única atividade e duplicar uma infraestrutura que já existe.

O grading method participa do processo de definição do formulário de avaliação e do preenchimento pelo avaliador, enquanto o Gradebook continua responsável pelo resultado final de nota. Separar essas responsabilidades permite que a mesma lógica de avaliação seja reutilizada em mais de um contexto quando suportado.

## User profile fields

Plugins `profilefield` definem novos tipos de campos personalizados de perfil do usuário. O Moodle já oferece tipos comuns, mas esse ponto de extensão permite criar campos com edição, validação e apresentação próprias.

Se a instituição precisa guardar um dado adicional de usuário com comportamento especial, como um identificador validado por algoritmo, uma seleção vinculada a fonte externa ou um valor composto, um profile field pode ser melhor do que criar uma tabela paralela e uma tela própria de edição.

Isso não significa que qualquer informação relacionada ao usuário deva virar campo de perfil. Dados operacionais, históricos e relacionamentos complexos provavelmente merecem tabelas do domínio do seu plugin. Profile fields funcionam melhor para atributos que conceitualmente pertencem ao perfil e que devem participar da experiência de edição e visualização desse perfil.

A pergunta útil é "isso é uma característica do usuário ou um registro de negócio relacionado ao usuário?". A primeira pode ser profile field; a segunda geralmente pede outro modelo.
