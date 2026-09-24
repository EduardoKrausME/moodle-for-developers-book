{% raw %}

# 26 BEHAT

No capítulo anterior trabalhamos com PHPUnit e vimos uma verdade importante: a maior parte da regra de negócio do plugin deve ser testada sem abrir navegador. Isso deixa a suíte rápida, previsível e boa para encontrar regressões em classes, banco, capabilities, Events, Hooks, Tasks, Web Services, Privacy e praticamente qualquer outra API do Moodle. Só que existe uma categoria de problema que PHPUnit não enxerga bem, porque o erro não está em uma função isolada, está na jornada inteira que o usuário executa pela interface.

O professor abre o curso, ativa edição, adiciona uma atividade, preenche o formulário, salva, entra no relatório, abre um modal, altera um filtro e espera um componente JavaScript atualizar a tabela. Depois o aluno entra com outra conta, acessa a mesma atividade, responde, salva, recebe uma notificação e o professor volta para enxergar o novo estado. Podemos testar cada serviço PHP separadamente, mas ainda sobra uma pergunta bastante prática: o produto realmente funciona quando alguém usa o Moodle como uma pessoa normal?

É aí que entra o Behat. Ele executa testes de aceitação descrevendo jornadas em Gherkin e interagindo com uma instalação Moodle preparada exclusivamente para testes. Dependendo do cenário, a interação pode acontecer sem JavaScript ou por um navegador real controlado via WebDriver. O objetivo não é substituir PHPUnit e muito menos automatizar cada clique existente no sistema, mas proteger fluxos críticos em que várias camadas precisam funcionar juntas.

Neste capítulo vamos continuar usando `mod_checkpoint` como exemplo. O plugin já possui formulário de configuração, página do aluno, resposta, nota e completion, então ele é um bom laboratório para testar a experiência completa de professor e estudante. A preocupação central será escrever cenários legíveis e estáveis, evitando aquela suíte de Behat que leva quarenta minutos, quebra quando alguém muda um texto de botão e passa mais tempo sendo consertada do que encontrando bugs.

## 26.1 PHPUnit versus Behat

PHPUnit testa código PHP diretamente, enquanto Behat testa comportamento observável pela interface. A diferença parece simples, mas muda completamente o tipo de pergunta que cada ferramenta responde.

Se quero saber se `response_service::submit()` rejeita uma resposta vazia, uso PHPUnit. Se quero saber se o aluno vê a mensagem correta depois de enviar uma resposta válida pelo formulário, Behat pode ser mais adequado. Se quero testar vinte combinações de regras de completion, PHPUnit é melhor; se quero garantir que o professor ativa a regra pelo formulário e o aluno realmente enxerga a atividade concluída depois da ação, Behat fecha a jornada.

A pior estratégia é usar Behat para tudo, porque navegador é caro. Cada cenário precisa preparar dados, abrir páginas, localizar elementos, aguardar JavaScript e depois limpar o ambiente. Um teste PHP equivalente pode terminar em milissegundos.

## 26.2 Unitário, integração e aceitação

A classificação não precisa virar discussão acadêmica, mas ajuda a escolher ferramenta. Um teste unitário isola uma pequena unidade de comportamento. Um teste de integração verifica como várias partes trabalham juntas, normalmente incluindo banco e APIs do Moodle. Um teste de aceitação olha o sistema de fora e verifica se o comportamento esperado está disponível para o usuário.

Na prática, Moodle usa PHPUnit para uma mistura de testes unitários e de integração, enquanto Behat ocupa principalmente a camada de aceitação.

O importante não é o nome da categoria, mas evitar testar a mesma regra pesada três vezes em níveis diferentes sem motivo. Teste o detalhe onde ele é mais barato e deixe para Behat apenas o que realmente depende da jornada.

## 26.3 O que Behat faz no Moodle

Behat lê arquivos `.feature`, interpreta cenários escritos em Gherkin e procura step definitions que correspondam a cada frase. Esses steps executam ações no ambiente Moodle, muitas vezes por meio de Mink e WebDriver, simulando navegação, cliques, preenchimento de campos e verificações.

O Moodle amplia Behat com uma integração própria que descobre features e steps de múltiplos componentes, prepara um site de testes separado, registra falhas de PHP, `debugging()` e exceptions, e oferece uma quantidade grande de steps comuns para que cada plugin não precise automatizar o navegador do zero.

Essa integração é importante porque o valor não está em saber Selenium. O valor está em descrever uma ação como "I log in as student1" ou "I press Save changes" e deixar o framework cuidar da interação concreta.

## 26.4 O ambiente Behat é outro Moodle

Assim como PHPUnit usa banco e dataroot próprios, Behat também precisa de ambiente separado. Em `config.php`, normalmente aparecem configurações como:

```php
$CFG->behat_wwwroot = 'http://127.0.0.1:8000';
$CFG->behat_prefix = 'bht_';
$CFG->behat_dataroot = '/var/moodledata_behat';
```

Também é possível definir conexão de banco própria com `behat_dbname`, `behat_dbuser`, `behat_dbpass` e `behat_dbhost`.

Nunca aponte Behat para o banco de produção. O ambiente é recriado e alterado agressivamente durante a suíte, porque cada cenário precisa começar em estado previsível.

## 26.5 `behat_wwwroot`

O `behat_wwwroot` precisa ser uma URL real alcançável pelo navegador utilizado no teste. Isso é diferente de PHPUnit, que não precisa abrir o site em um browser.

Se você usa container, VM ou Selenium remoto, tenha cuidado com `localhost`. `localhost` visto pelo PHP, pelo browser e pelo host pode representar máquinas diferentes. Esse é um dos motivos pelos quais ambientes de teste funcionam no notebook e quebram imediatamente no CI.

A URL também serve como proteção, porque o Moodle entra em modo Behat apenas quando o ambiente está devidamente habilitado e acessado pelo endereço específico de testes.

## 26.6 `behat_dataroot` e `behat_prefix`

O dataroot deve ser exclusivo do ambiente de aceitação, assim como o prefixo ou o banco utilizado. Não compartilhe `moodledata` com o ambiente principal esperando que os testes "não mexam em arquivo".

Behat pode criar uploads, caches, sessões e outros dados enquanto reproduz jornadas reais. Isolamento aqui não é luxo, é condição mínima para executar a suíte com segurança.

## 26.7 Inicializando o ambiente

Depois de configurar o ambiente, execute o utilitário de inicialização:

```
php admin/tool/behat/cli/init.php
```

Em Moodle 5.1, com a reorganização da árvore pública, o caminho físico normalmente será:

```
php public/admin/tool/behat/cli/init.php
```

O utilitário instala ou atualiza dependências necessárias, prepara o site de teste, descobre features e step definitions e gera a configuração Behat utilizada pela suíte.

## 26.8 O erro de `$CFG->behat_* precisa ser definido`

Se você executar os utilitários antes de configurar o ambiente, receberá mensagem informando que `behat_dataroot`, `behat_prefix` e `behat_wwwroot` precisam existir no `config.php`.

Isso não é problema do Selenium nem do plugin. O Moodle simplesmente se recusa a preparar um ambiente de aceitação sem saber onde ficam banco, arquivos e URL de teste.

Corrija a configuração primeiro, depois rode `init.php`. Não tente editar scripts do core para passar pela validação.

## 26.9 Executando a suíte

Depois da inicialização, uma forma atual de rodar Behat é:

```
php admin/tool/behat/cli/run.php
```

No Moodle 5.1:

```
php public/admin/tool/behat/cli/run.php
```

Durante desenvolvimento, quase nunca faz sentido executar tudo. Filtre por tag, feature ou cenário específico para diminuir o ciclo de feedback.

## 26.10 Rodando por tag

Se o plugin usa uma tag própria, você pode rodar apenas seus cenários:

```
php public/admin/tool/behat/cli/run.php --tags="@mod_checkpoint"
```

Tags são extremamente úteis no CI e durante desenvolvimento, mas não devem virar uma taxonomia impossível com vinte tags por cenário. Use tags que realmente servem para seleção de suíte ou requisitos técnicos.

## 26.11 Rodando uma feature específica

O wrapper atual também permite apontar uma feature específica, o que é ótimo enquanto você está escrevendo ou depurando um único arquivo.

```
php public/admin/tool/behat/cli/run.php \
    --feature="/caminho/absoluto/mod/checkpoint/tests/behat/student_submit.feature"
```

Isso evita esperar cenários que não têm relação com a mudança atual.

## 26.12 Arquivos `.feature`

Features de plugin normalmente ficam em:

```
mod/checkpoint/tests/behat/
```

Por exemplo:

```
mod/checkpoint/tests/behat/student_submit.feature
mod/checkpoint/tests/behat/teacher_grade.feature
```

O arquivo deve representar uma funcionalidade coerente, não uma coleção aleatória de passos que por acaso usam o mesmo plugin.

## 26.13 Feature

A feature descreve uma capacidade de alto nível.

```
@mod_checkpoint
Feature: Students submit checkpoint responses
  In order to reflect on the activity
  As a student
  I need to submit a response to a checkpoint
```

A descrição não executa nada, mas ajuda a explicar propósito. Não escreva uma feature como "Testing submit.php" porque usuário não sabe o que `submit.php` significa.

## 26.14 Scenario

Cada scenario descreve um comportamento observável completo.

```
Scenario: Student submits a valid response
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | student1 | Student | One | student1@example.com |
  When I log in as "student1"
  Then I should see "Dashboard"
```

Um bom cenário possui começo, ação e resultado claro. Se o scenario faz matrícula, responde atividade, avalia, muda configuração, exporta CSV e testa backup, provavelmente está tentando proteger jornadas demais de uma vez.

## 26.15 Given, When e Then

Gherkin organiza a narrativa em três momentos. `Given` prepara estado, `When` executa a ação central e `Then` verifica o resultado.

A documentação do Moodle recomenda que cada cenário use um único início de `Given`, `When` e `Then`, continuando os passos relacionados com `And` ou `But`.

Isso evita cenários que parecem um script procedural interminável. A semântica ajuda qualquer pessoa a entender o que está sendo preparado, qual comportamento está sob teste e qual é a expectativa.

## 26.16 And e But

`And` e `But` não possuem comportamento mágico diferente. Eles herdam o contexto narrativo do passo anterior.

```
Given I am on the "Course 1" course page logged in as "teacher1"
And I turn editing mode on
When I add a "Checkpoint" activity to course "Course 1" section "1"
And I set the following fields to these values:
  | Name | Reflection 1 |
Then I should see "Reflection 1"
But I should not see "Configuration error"
```

Use-os para legibilidade, não para esconder várias fases diferentes dentro do mesmo scenario.

## 26.17 Background

Quando vários cenários compartilham preparação, use `Background`.

```
Background:
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | teacher1 | Teacher | One | teacher1@example.com |
    | student1 | Student | One | student1@example.com |
  And the following "courses" exist:
    | fullname | shortname |
    | Course 1 | C1 |
  And the following "course enrolments" exist:
    | user | course | role |
    | teacher1 | C1 | editingteacher |
    | student1 | C1 | student |
```

O Background deve conter preparação realmente comum. Se ele cria vinte objetos usados por apenas um cenário, está escondendo dependências em vez de reduzir repetição.

## 26.18 Scenario Outline

`Scenario Outline` permite executar o mesmo fluxo com combinações de valores.

```html
Scenario Outline: Response validation
  Given I am logged in as "student1"
  When I submit "<response>" to the checkpoint
  Then I should see "<message>"

  Examples:
    | response | message |
    | Yes      | Response saved |
    | No       | Response saved |
```

É útil para variações pequenas de uma mesma jornada. Se cada exemplo exige uma lógica completamente diferente, provavelmente são scenarios separados.

## 26.19 Não transforme Behat em tabela de casos unitários

Scenario Outline pode seduzir o desenvolvedor a colocar cinquenta combinações de entrada. Esse é exatamente o tipo de coisa que PHPUnit faz melhor e mais rápido.

Em Behat, use poucos casos representativos para garantir que interface e integração estão corretas. As bordas matemáticas, validações detalhadas e combinações exaustivas ficam na camada PHP.

## 26.20 Data generators do Behat

Os steps de setup permitem criar dados diretamente sem precisar navegar pela interface para preparar tudo. Isso economiza muito tempo.

```
Given the following "users" exist:
  | username | firstname | lastname | email |
  | teacher1 | Teacher | One | teacher1@example.com |
```

A mesma ideia vale para cursos, matrículas, grupos, atividades e entidades suportadas pelos generators.

## 26.21 Não crie dados de setup clicando pela interface

Se o objetivo do cenário é testar submissão do aluno, não gaste quinze passos entrando como administrador, criando curso, criando usuário, matriculando e configurando atividade por telas.

Use generators para tudo que não faz parte do comportamento em teste. A interface só deve ser usada para o trecho cuja experiência você realmente quer validar.

Essa escolha deixa a suíte muito mais rápida e reduz fragilidade.

## 26.22 Generator próprio do plugin para Behat

Quando o plugin possui entidades que aparecem em muitos cenários, pode valer criar suporte de generator para que Gherkin consiga prepará-las diretamente.

A ideia é semelhante ao generator de PHPUnit, mas integrado à infraestrutura Behat. Em vez de repetir steps de interface para criar cada objeto, você declara tabelas de dados no cenário e deixa o generator montar o estado.

Isso é especialmente útil para atividades com respostas, tentativas, regras ou registros auxiliares que seriam caros de criar por UI.

## 26.23 Login

O Moodle já fornece steps de login.

```
When I log in as "student1"
```

Ou steps que já navegam para uma página autenticado como usuário específico.

Evite criar um custom step `I login using checkpoint credentials` se a autenticação é padrão. Custom step deve existir porque o domínio do plugin precisa de uma abstração nova, não porque você prefere outra frase.

## 26.24 Logout e troca de usuário

Jornadas completas muitas vezes precisam alternar professor e aluno. Faça logout entre identidades e mantenha a transição explícita no cenário.

Não tente alterar sessão diretamente dentro de custom step apenas para economizar cliques se o comportamento de login faz parte da jornada. Ao mesmo tempo, não teste a tela de login repetidamente em cada scenario se ela não é o foco.

## 26.25 Navegação

Use steps de navegação sem depender de URL interna sempre que a navegação fizer parte da experiência.

```
And I am on the "Course 1" course page
```

Se o objetivo é testar uma página específica e o caminho de navegação não é importante, um helper que leva diretamente à página pode ser mais robusto. O teste precisa proteger comportamento, não necessariamente cada clique intermediário.

## 26.26 Testar breadcrumb não é testar navegação inteira

É comum confundir "o usuário consegue chegar aqui" com "o breadcrumb tem exatamente estes textos". Breadcrumb pode mudar por tema ou reorganização do core sem quebrar a funcionalidade.

Se o requisito é que a página esteja acessível pelo menu, teste a navegação necessária. Se o requisito é apenas abrir a página e usar a função, não acople o cenário a detalhes decorativos.

## 26.27 Formulários

Moodle possui steps para preencher campos, marcar checkboxes, selecionar opções e enviar formulários.

```
And I set the following fields to these values:
  | Name | Checkpoint 1 |
  | Question | What did you learn? |
And I press "Save and display"
```

Prefira labels visíveis e estáveis que o usuário realmente enxerga. Selecionar campo por CSS gerado deveria ser último recurso.

## 26.28 Tabelas Gherkin

Tabelas deixam configuração e expectativas mais legíveis.

```
And I set the following fields to these values:
  | Allow changes | 1 |
  | Maximum grade | 10 |
```

Elas também são usadas por generators e custom steps para representar conjuntos de registros.

Não crie uma tabela com quarenta colunas apenas porque é possível. Muitas vezes isso é sinal de fixture grande demais para aquele cenário.

## 26.29 Tabelas HTML

Para validar uma tabela renderizada, prefira steps que expressem conteúdo e relação visual em vez de XPath enorme.

Você pode verificar se uma linha contém determinados valores ou se um texto aparece dentro de uma região específica.

O teste deveria continuar válido se o componente ganha uma coluna nova ou muda uma classe CSS que não faz parte do requisito.

## 26.30 Modal

Moodle usa modais em várias interfaces modernas. Cenários `@javascript` podem abrir o modal, interagir com seus campos e confirmar ou cancelar ações.

O cuidado principal é escopo. Se a mesma palavra "Delete" aparece na página e no modal, um step genérico pode clicar no elemento errado. Restrinja a ação ao modal ou a uma região identificável.

## 26.31 Selectors

Behat e Mink trabalham com diferentes selectors, como texto, link, button, field, CSS e XPath. No Moodle, prefira seletores semânticos e steps existentes.

Uma prioridade prática é:

```
texto/label acessível
nome de botão ou link
região identificável
CSS estável do componente
XPath somente quando necessário
```

XPath baseado em posição, como `div[3]/div[2]/span[1]`, é praticamente um pedido para quebrar na próxima alteração de layout.

## 26.32 Test IDs

Em interfaces complexas, pode fazer sentido adicionar identificadores de teste estáveis, desde que a política do projeto aceite isso e eles não virem dependência visual desnecessária.

O melhor selector é aquele ligado à semântica da interface. Se nenhum selector semântico consegue identificar um controle sem depender da estrutura inteira do DOM, talvez a própria marcação de acessibilidade também precise melhorar.

## 26.33 Gherkin deve ser legível por alguém que não viu o DOM

Um cenário como:

```html
When I click on "[data-region='checkpoint-answer'] button:nth-child(2)" "css_element"
```

pode funcionar, mas perdeu o principal benefício de Behat. Quem lê não sabe o que o usuário fez.

Sempre que possível, a frase deve dizer algo como:

```
When I press "Submit response"
```

ou um custom step de domínio realmente significativo.

## 26.34 `@javascript`

Cenários que dependem de JavaScript precisam da tag `@javascript`.

```
@mod_checkpoint @javascript
Feature: Checkpoint modal actions
```

Isso faz o teste usar um navegador e driver capazes de executar JavaScript. Sem a tag, cenários simples podem rodar de forma mais leve e rápida.

Não marque toda feature como `@javascript` por costume. Se o cenário funciona sem JavaScript e não está testando comportamento JS, deixe-o mais barato.

## 26.35 Testes sem JavaScript

Testes sem `@javascript` continuam úteis para fluxos tradicionais, validação básica, páginas simples e detecção de exceptions.

Eles são mais rápidos e menos dependentes de timing de frontend. Uma suíte equilibrada usa JavaScript onde a aplicação exige, não como padrão universal.

## 26.36 WebDriver

O WebDriver é o protocolo usado para controlar navegadores modernos. Selenium pode fornecer o servidor que recebe comandos de automação e conversa com Chrome, Firefox e outros browsers.

Do ponto de vista do autor do `.feature`, idealmente esse detalhe fica escondido. Você escreve ação de usuário e o driver se encarrega de clicar, digitar e consultar o DOM.

Mesmo assim, entender essa camada ajuda a diagnosticar falhas de conexão, navegador incompatível e diferenças de execução no CI.

## 26.37 Selenium

Selenium continua sendo uma opção comum e recomendada no ecossistema Moodle para executar cenários JavaScript. Ele precisa estar acessível pelo ambiente Behat e compatível com o navegador usado.

Não presuma que uma versão de Selenium ou browser que funciona com Moodle 4.5 necessariamente continuará funcionando da mesma forma em outra branch anos depois. CI precisa controlar versões e atualizar combinações de forma consciente.

## 26.38 Chrome e Firefox

Rodar tudo em todos os browsers pode ser caro. Muitos projetos executam a suíte principal em um navegador e mantêm uma matriz menor de cenários críticos em outro.

O objetivo é detectar dependências indevidas de browser sem multiplicar o tempo de pipeline por quatro.

Quando o plugin usa JavaScript muito específico, cross-browser ganha mais importância do que em uma interface predominantemente server-side.

## 26.39 `behat.yml`

Behat gera uma configuração que descreve suites, contexts, drivers e parâmetros de execução. Em Moodle você normalmente não edita o `behat.yml` gerado manualmente como arquivo permanente, porque o ambiente é reconstruído a partir da configuração e dos componentes instalados.

Customizações devem entrar pelos mecanismos suportados em `config.php`, como `behat_config` e perfis adicionais, para que a inicialização consiga reproduzir o ambiente.

## 26.40 Perfis

Perfis permitem definir configurações diferentes de navegador ou ambiente. Isso é útil para Chrome, Firefox, execução remota e combinações específicas de capacidades.

O wrapper atual aceita `--profile` durante execução.

```
php public/admin/tool/behat/cli/run.php --profile=chrome
```

Mantenha esses perfis versionados na configuração do ambiente de desenvolvimento ou CI, não como uma configuração manual esquecida na máquina de uma pessoa.

## 26.41 Tags

Além de `@javascript`, tags podem agrupar features por componente, funcionalidade ou necessidade de ambiente.

```
@mod_checkpoint @javascript
Feature: Grading checkpoint submissions
```

Uma tag no cabeçalho da feature vale para todos os cenários dela. Não repita em cada scenario sem necessidade.

## 26.42 Tags de exclusão

Também é possível rodar uma suíte excluindo categorias, por exemplo testes lentos ou dependentes de determinado recurso.

Isso pode ser útil em pipelines rápidos, mas tenha cuidado para não criar uma "suíte oficial" que nunca executa metade dos testes porque todos os cenários inconvenientes foram marcados como opcionais.

## 26.43 Custom steps

Se a linguagem disponível não consegue expressar uma ação de domínio de forma clara e reutilizável, crie um custom step.

Um plugin pode ter arquivo dentro de:

```
mod/checkpoint/tests/behat/behat_mod_checkpoint.php
```

A classe define métodos reconhecidos pelo framework por atributos ou pela forma suportada na branch do Moodle em questão.

Antes de criar, pesquise os steps disponíveis. O Moodle já possui muitos e duplicar step existente aumenta manutenção sem ganho.

## 26.44 Um custom step deve representar domínio

Um bom custom step poderia ser:

```
Given the student "student1" has submitted "I learned about caching" to checkpoint "Reflection 1"
```

Esse step prepara um estado de domínio usado por vários cenários de avaliação.

Um step ruim seria:

```
When I click the third blue button inside the second card
```

Isso não representa domínio, apenas esconde um selector frágil dentro de PHP.

## 26.45 Step de setup versus step de interface

Custom step de `Given` pode criar estado diretamente usando APIs e generators, sem navegar pela UI. Isso é desejável quando o estado não é a parte testada.

Já um `When` que representa a ação do usuário deve normalmente interagir com a interface real. Se o cenário diz "When I submit the response" e o step simplesmente grava a linha no banco, o teste está mentindo sobre o comportamento que protege.

## 26.46 Não coloque assertion escondida em todo step

Um step de ação deve agir e um step de verificação deve verificar. Misturar assertions internas em steps de navegação pode fazer um cenário falhar por um motivo que não aparece na frase Gherkin.

Existem verificações técnicas inevitáveis, como confirmar que o elemento existe antes de clicar, mas o requisito de negócio deveria estar explicitamente no `Then`.

## 26.47 Page interaction

Custom steps herdam helpers de contexto Behat e podem localizar elementos, navegar, clicar, esperar e verificar estado do DOM.

Antes de chamar APIs de WebDriver diretamente, veja o que `behat_base` e os contexts do Moodle já oferecem. Essas abstrações tratam selectors, exceções e espera de maneira mais consistente com o restante da suíte.

Quanto mais seu step conversa diretamente com Selenium, mais ele se torna dependente de detalhes de infraestrutura.

## 26.48 Esperas assíncronas

O problema clássico de Behat com JavaScript é timing. O teste clica, o AJAX começa, e a assertion roda antes de a interface terminar de atualizar.

A solução correta não é colocar `sleep(5)` em todo lugar. Use steps e helpers que aguardam a condição real, como desaparecimento de loading, presença de elemento, conclusão de pending JS ou mudança específica do DOM.

Esperar condição é previsível; esperar tempo é apostar.

## 26.49 Por que `sleep()` deixa teste lento e ainda frágil

Se o AJAX termina em 200 ms, um sleep de 5 segundos desperdiça 4,8 segundos em toda execução. Se o CI estiver lento e levar 6 segundos, o teste quebra mesmo depois da espera.

Com cem cenários, esses sleeps viram minutos inteiros de pipeline e ainda não garantem estabilidade.

Use sincronização com estado da aplicação.

## 26.50 `I wait` só para depuração

Durante diagnóstico pode ser útil pausar para observar a tela ou abrir DevTools. Isso não significa que a espera artificial deve permanecer no cenário final.

Se você precisou colocar espera para o teste passar, descubra qual estado real precisava ser aguardado e converta a pausa em um step semântico.

## 26.51 AJAX e loaders

Se o plugin possui um loader próprio, dê a ele marcação estável e estado acessível. Isso melhora tanto UX quanto testabilidade.

Um teste pode esperar o loader desaparecer antes de verificar a tabela. Melhor ainda, use padrões do core que já integram com o sistema de pending JS, reduzindo a necessidade de lógica Behat personalizada.

## 26.52 `core/ajax` e Behat

Quando seu frontend usa `core/ajax`, o framework Moodle consegue acompanhar boa parte do estado assíncrono. Mesmo assim, código customizado precisa resolver Promises corretamente e registrar pending activity quando apropriado.

Um JavaScript que dispara `fetch()` solto e nunca informa ao ecossistema que ainda existe trabalho assíncrono pode fazer a interface parecer pronta para o teste antes de realmente estar pronta.

Testabilidade frequentemente revela problemas reais de arquitetura frontend.

## 26.53 Modal e animações

Modais e animações também introduzem timing. Não clique em botão que ainda está em transição nem procure conteúdo antes de o modal estar visível.

Use steps que conheçam modal ou condições de visibilidade. Desabilitar todas as animações no código do plugin apenas para Behat é um cheiro ruim se o usuário real continua recebendo o comportamento diferente.

## 26.54 Preparação de dados

Dados de teste devem ser mínimos e explícitos. Para uma submissão de aluno, você provavelmente precisa de curso, professor, aluno, matrícula e atividade. Não precisa criar cinco categorias, quatro grupos e dois administradores se o cenário não usa nada disso.

Fixtures pequenas reduzem tempo e facilitam entender por que o cenário falhou.

## 26.55 IDs não devem aparecer no Gherkin sem necessidade

Prefira referências estáveis como shortname, username e nome da atividade em vez de IDs de banco.

```
Given I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
```

ID é detalhe de persistência e pode mudar conforme ordem dos generators.

## 26.56 Nomes únicos ajudam o teste

Se a página possui três atividades chamadas "Teste", localizar o elemento correto fica desnecessariamente difícil. Em fixtures Behat, use nomes claros como `Checkpoint 1`, `Checkpoint restricted` e `Checkpoint graded`.

Isso também deixa screenshots e falhas mais fáceis de ler.

## 26.57 Teste o usuário correto

Sempre deixe claro quem executa a ação. Um cenário pode passar como admin e falhar para professor porque admin ignora várias restrictions.

Se o requisito é do estudante, teste como estudante. Se é do editing teacher, use esse papel. Testar tudo como administrador é uma forma eficiente de esconder problemas de capability.

## 26.58 Teste negativo de permissão

Behat também é útil para provar que algo não aparece ou não pode ser acessado.

```
Then I should not see "Grade responses"
```

Mas esconder botão não é segurança completa. O endpoint ainda precisa de PHPUnit ou outro teste que prove autorização server-side. Use Behat para experiência visível e PHPUnit para a regra que realmente protege a ação.

## 26.59 Form identifiers estáveis

Labels e nomes de campos devem ser consistentes. Se o teste só consegue preencher um campo usando um selector obscuro, reveja o formulário.

Forms API geralmente produz labels e atributos adequados para automação e acessibilidade, então usar componentes padrão ajuda Behat sem trabalho adicional.

## 26.60 Testes de tabelas dinâmicas

Dynamic Tables e grids AJAX precisam ser testados com atenção a paginação, filtros e atualização assíncrona.

Não verifique toda a tabela célula por célula se o requisito é apenas que o novo registro apareça. Quanto mais específica a assertion sem necessidade, mais o teste quebra por mudanças cosméticas.

## 26.61 Filtros

Um cenário útil pode preparar dois registros, aplicar filtro e verificar que um aparece e outro não.

Esse formato testa o comportamento e evita depender da ordem completa da tabela.

## 26.62 Ordenação

Se ordenação é funcionalidade crítica, prepare dados que produzam ordem inequívoca e verifique os extremos ou a sequência necessária.

Não use dados que já entram naturalmente na ordem esperada, porque o teste passará mesmo se o clique no cabeçalho não fizer nada.

## 26.63 Filepicker e Filemanager

Uploads podem ser testados por Behat, mas são mais pesados. Use arquivos fixture pequenos dentro da área de testes do plugin.

Se você precisa testar apenas a regra que valida MIME ou processa o conteúdo, PHPUnit é melhor. Behat deve ficar para provar que o usuário consegue anexar e o arquivo aparece onde deveria.

## 26.64 Editor HTML

Editores ricos dependem de JavaScript e podem variar entre versões. Use os steps específicos disponíveis para editar conteúdo, em vez de tentar manipular o DOM interno do editor.

O teste deve afirmar o texto salvo ou a saída renderizada, não a estrutura de spans criada pelo editor.

## 26.65 Screenshots em falhas

Quando cenário JavaScript falha, o Moodle pode gerar screenshots e HTML da página na área de faildump. Esses artefatos são valiosíssimos porque mostram o estado real do navegador no momento da falha.

No CI, preserve faildumps como artifacts. Um log dizendo "element not found" é muito menos útil do que uma screenshot mostrando que o modal nem abriu.

## 26.66 `behat_faildump_path`

O caminho de faildump pode ser configurado para um local acessível no ambiente de desenvolvimento ou CI. Em Moodle Docker ele costuma ser exposto de forma conveniente para inspeção.

Não envie faildump automaticamente para local público. A página de teste pode conter nomes, emails e outros dados fixture que não precisam ficar publicados.

## 26.67 HTML dump

Além da screenshot, o HTML capturado ajuda quando o elemento existe, mas está invisível ou fora da região esperada.

Isso é muito melhor do que tentar adivinhar a partir da frase Gherkin. Olhe o estado real antes de adicionar mais um selector ou mais um `sleep()`.

## 26.68 Depuração com cenário único

Quando um cenário falha, rode apenas ele. Não execute a suite inteira a cada tentativa.

Você pode filtrar pela feature, tag ou nome do scenario conforme a opção suportada pelo runner Behat.

O ciclo ideal de correção é curto: reproduzir, observar, alterar, executar de novo.

## 26.69 `--rerun` e falhas anteriores

O runner atual do Moodle possui suporte para rerun de processos que falharam em execução anterior, inclusive em modo paralelo.

Isso é útil em suítes grandes, mas não use rerun para mascarar teste flaky. Se o teste passa só na segunda tentativa com frequência, existe uma corrida, dependência de estado ou problema de timing que precisa ser corrigido.

## 26.70 Auto-rerun não é solução para flakiness

Pipelines às vezes configuram retentativa automática para reduzir ruído de infraestrutura, porém uma suíte que depende disso perde credibilidade.

O teste deveria ser determinístico dentro das condições suportadas. Use retry apenas como mecanismo operacional adicional, não como parte da lógica do cenário.

## 26.71 Paralelismo

O Moodle suporta inicializar múltiplos ambientes Behat para execução paralela.

```
php public/admin/tool/behat/cli/init.php --parallel=4
```

Depois o runner distribui a execução conforme a configuração.

Paralelismo reduz o tempo total, mas aumenta consumo de banco, CPU, memória, navegador e filesystem. Quatro workers não garantem quatro vezes mais velocidade.

## 26.72 Teste precisa ser isolado para rodar em paralelo

Se dois scenarios dependem de um serviço externo compartilhado, arquivo fixo ou estado global fora do ambiente Moodle, paralelismo pode revelar condições de corrida.

Isso é positivo, porque o problema muitas vezes existe também em produção. Mas fixture Behat não deveria depender de recurso externo não isolado sem necessidade.

## 26.73 Não chamar serviços reais

Uma suíte de aceitação não deveria cobrar cartão, enviar email para cliente, publicar webhook de produção ou depender de ERP real.

Use ambientes fake, sandbox, stubs no backend ou configuração específica de teste. Behat precisa ser reprodutível e seguro para rodar no CI centenas de vezes.

## 26.74 Email

Se a jornada exige provar que determinada ação gera comunicação, muitas vezes PHPUnit com message sink testa a regra de envio melhor. Em Behat, teste apenas a consequência visível ao usuário quando isso faz parte do requisito, como uma notificação na interface.

Não abra uma conta Gmail real durante teste de plugin. Isso transforma sua suíte em automação de serviços terceiros, não em teste do Moodle.

## 26.75 Acessibilidade e Behat

Versões atuais do ambiente Behat também podem integrar verificações de acessibilidade, incluindo suporte a axe na inicialização do ambiente.

Isso não substitui revisão manual, teclado e leitor de tela, mas ajuda a detectar regressões básicas em interfaces testadas.

Se o plugin introduz UI nova, considere incluir acessibilidade no pipeline em vez de tratá-la como auditoria feita uma vez antes da publicação.

## 26.76 Steps existentes antes de steps customizados

A administração do Moodle possui uma área de Acceptance testing que lista steps disponíveis quando o ambiente Behat está preparado.

Consulte essa lista antes de criar step. É comum o desenvolvedor escrever cinquenta linhas de PHP para uma ação que já existe no core com nome ligeiramente diferente.

IDE com suporte a Gherkin também ajuda bastante a descobrir steps e evitar erros de digitação.

## 26.77 Nome do custom step

Quando criar step próprio, dê a ele linguagem que identifique o domínio do plugin. Isso evita colisão com steps genéricos de outros componentes.

Em vez de:

```
Given a response exists
```

prefira algo como:

```
Given the following checkpoint responses exist:
```

O nome continua legível e deixa clara a origem.

## 26.78 Não escrever step que chama step demais

É tentador criar `Given a complete checkpoint course exists` e esconder trinta steps internos. Isso diminui repetição, mas transforma o cenário numa caixa preta.

Crie abstrações no nível certo. Um step pode preparar uma entidade de domínio; não deveria esconder todo o mundo necessário para o teste sem que o leitor saiba quais precondições existem.

## 26.79 Steps compostos e manutenção

Quando um custom step chama outros steps, qualquer alteração na linguagem intermediária pode quebrar a composição. Muitas vezes é melhor usar APIs e generators diretamente para setup do que construir uma cadeia textual de steps.

Para ação real de navegador, use os helpers de contexto apropriados.

## 26.80 Cenários frágeis

Um cenário frágil falha por coisas que não representam regressão real. Texto de botão levemente alterado, ordem visual irrelevante, classe CSS interna, delay de animação ou conteúdo adicional na página podem quebrá-lo.

Cada assertion deve corresponder a um requisito. Se você não consegue explicar qual requisito é protegido por aquela linha, talvez ela não devesse existir.

## 26.81 Testar texto demais

`Then I should see` é fácil de usar e por isso pode ser usado demais. Uma página pode conter o texto esperado em outro lugar e o teste passar por engano.

Quando a localização importa, restrinja a região. Quando não importa, não invente selector mais complexo apenas para ser específico.

O nível de precisão deve acompanhar o requisito.

## 26.82 Testar CSS demais

Não teste cor, margem, classe Bootstrap ou estrutura de grid com Behat comum, salvo quando isso representa comportamento funcional e existe técnica apropriada.

Mudança de tema não deveria derrubar a suíte de regra de negócio. Para regressão visual existem ferramentas específicas e outra estratégia de teste.

## 26.83 Dados aleatórios deixam falha difícil de reproduzir

Generators podem criar valores automaticamente, mas cenários Behat se beneficiam de nomes previsíveis. Quando o teste falha e a screenshot mostra `Course 7a83f`, você perde tempo tentando entender qual objeto era aquele.

Use fixture determinística sempre que a legibilidade do cenário e do faildump importar.

## 26.84 Horário e datas

Testes com data podem ficar instáveis perto de meia-noite, mudança de timezone ou DST. Prefira datas relativas controladas pelo generator ou períodos com margem suficiente.

Se o requisito é exatamente fronteira temporal, provavelmente a regra principal merece PHPUnit com controle de tempo, deixando Behat apenas para um caso representativo.

## 26.85 Ordem dos cenários

Nunca dependa da ordem de execução. Cada scenario deve preparar seu próprio estado e funcionar sozinho.

Behat pode redistribuir cenários em execução paralela, então dependência oculta entre features aparece rapidamente.

Um cenário que só passa depois que outro criou configuração está errado.

## 26.86 Cenário pequeno não significa cenário artificial

Tente manter cada scenario focado, mas não quebre uma jornada natural em cinco testes que precisam repetir todo setup apenas para evitar quinze linhas.

O tamanho ideal é aquele em que existe uma ação central e uma consequência clara, sem misturar funcionalidades independentes.

## 26.87 Reuso sem perder legibilidade

Background, generators e custom steps ajudam a reduzir repetição. A meta não é alcançar zero repetição, mas manter o Gherkin compreensível.

Duas linhas repetidas em três cenários podem ser mais baratas do que uma abstração misteriosa com nome genérico.

## 26.88 O que não vale a pena testar com Behat

Não use Behat para algoritmo puro, validações combinatórias, SQL específico, todas as branches de uma task, formatação interna de payload, retorno de método ou exception de uma classe.

Esses testes ficam melhores em PHPUnit.

Também evite testar funcionalidade do próprio core sem relação específica com o plugin. Você não precisa provar em cada plugin que login, course creation e Forms API funcionam.

## 26.89 O que vale muito testar com Behat

Fluxos críticos do usuário, integração entre formulário e regra, permissões visíveis, modais, AJAX, filtros, mudanças de estado que precisam aparecer na UI, jornadas professor-aluno e regressões que historicamente quebraram em produção são excelentes candidatos.

Se um bug real custou horas de suporte e poderia ter sido reproduzido como jornada estável, ele provavelmente merece um scenario.

## 26.90 Behat e segurança

Behat é útil para confirmar que um usuário sem permissão não vê links ou não consegue chegar a determinado fluxo pela interface. Contudo, autorização server-side deve possuir testes de nível inferior também.

Uma UI escondida pode ser burlada por request manual, e Behat não deve ser a única prova de que `require_capability()` existe.

Combine os níveis em vez de escolher um só.

## 26.91 Behat e JavaScript customizado

Se o plugin possui ESM que inicializa modal, busca dados e atualiza DOM, Behat é uma das poucas formas de testar a composição inteira dentro do Moodle.

Escreva o JavaScript pensando em estado observável. Loading claro, mensagens de erro, elementos acessíveis e Promises corretamente resolvidas melhoram a experiência real e tornam o teste mais estável ao mesmo tempo.

## 26.92 Exemplo completo com `mod_checkpoint`

Vamos testar uma jornada professor-aluno. O professor cria uma atividade com nota e conclusão por envio. O aluno responde. Depois o professor abre o relatório, atribui nota e o aluno enxerga o feedback.

O cenário não precisa validar todas as regras internas, porque isso já está coberto por PHPUnit. Ele precisa provar que os componentes principais conversam corretamente pela interface.

## 26.93 Preparando a feature

Crie:

```
mod/checkpoint/tests/behat/teacher_student_journey.feature
```

Com tags:

```
@mod_checkpoint @javascript
Feature: Teacher and student use a checkpoint activity
  In order to support reflective activities
  As a teacher and student
  I need to create, submit and grade a checkpoint
```

## 26.94 Background do exemplo

```
Background:
  Given the following "users" exist:
    | username | firstname | lastname | email |
    | teacher1 | Teacher | One | teacher1@example.com |
    | student1 | Student | One | student1@example.com |
  And the following "courses" exist:
    | fullname | shortname |
    | Course 1 | C1 |
  And the following "course enrolments" exist:
    | user | course | role |
    | teacher1 | C1 | editingteacher |
    | student1 | C1 | student |
```

Ainda não criamos a atividade porque, neste scenario, criar pelo formulário faz parte do comportamento que queremos proteger.

## 26.95 Professor cria a atividade

```
Scenario: Teacher creates, student responds and teacher grades
  Given I am on the "Course 1" course page logged in as "teacher1"
  And I turn editing mode on
  When I add a "Checkpoint" activity to course "Course 1" section "1"
  And I set the following fields to these values:
    | Name | Reflection 1 |
    | Question | What was the most important concept? |
    | Maximum grade | 10 |
  And I press "Save and display"
  Then I should see "Reflection 1"
  And I should see "What was the most important concept?"
```

Dependendo dos steps disponíveis na branch, o fluxo de adicionar atividade pode utilizar uma frase ligeiramente diferente. Sempre consulte os steps gerados no seu ambiente.

## 26.96 Aluno responde

No mesmo scenario podemos trocar de usuário:

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
  And I set the field "Response" to "Cache without invalidation becomes a bug"
  And I press "Submit response"
  Then I should see "Response saved"
```

Se o formulário é JavaScript, mantenha `@javascript`. Se ele é submit tradicional e o restante do scenario não precisa de JS, talvez seja melhor dividir em scenarios e remover a tag onde não for necessária.

## 26.97 Professor avalia

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "teacher1"
  And I follow "Responses"
  Then I should see "Cache without invalidation becomes a bug"
  When I follow "Grade" in the "student1" "table_row"
  And I set the field "Grade" to "9"
  And I press "Save changes"
  Then I should see "Grade saved"
```

Aqui o selector `table_row` evita clicar no link de outro usuário se a tabela tiver mais registros.

## 26.98 Aluno vê o resultado

```
  When I log out
  And I am on the "Reflection 1" "checkpoint activity" page logged in as "student1"
  Then I should see "9"
  And I should see "Complete"
```

Esse final verifica a integração da jornada com nota e completion, sem repetir todos os testes internos de Gradebook e Completion já feitos no PHPUnit.

## 26.99 Separando cenários para manter diagnóstico bom

O exemplo anterior é útil didaticamente, mas em uma suíte real talvez eu separasse criação/configuração, submissão e avaliação em dois ou três scenarios dependendo do histórico de regressões.

Quando tudo está em um scenario muito longo, uma falha na criação impede descobrir se a submissão e o grading também continuam funcionando. Quando fragmentamos demais, pagamos setup repetido e perdemos a jornada integrada.

Não existe número mágico, existe equilíbrio entre diagnóstico, tempo e cobertura.

## 26.100 Custom step para resposta existente

Para cenários de grading, a submissão pela interface talvez não seja o foco. Então podemos criar um step de setup:

```
Given the following checkpoint responses exist:
  | checkpoint | user | response |
  | Reflection 1 | student1 | Cache needs invalidation |
```

O step usa as APIs do plugin para criar a resposta diretamente. Assim a feature de grading começa no estado necessário sem repetir a jornada do estudante.

## 26.101 Screenshots devem ajudar, não substituir assertions

Screenshot é ferramenta de diagnóstico. Não considere o teste aprovado porque a imagem "parece certa" para uma pessoa no CI.

As assertions continuam sendo texto executável do requisito. Screenshot entra quando algo falha e precisamos entender o estado visual.

## 26.102 CI

No capítulo seguinte vamos aprofundar Git e CI, mas Behat precisa entrar no pipeline com estratégia. Suíte completa de aceitação pode ser pesada demais para cada commit pequeno, enquanto uma seleção de tags críticas pode rodar em pull requests e a suíte completa em jobs mais demorados.

O importante é não deixar Behat como comando que "alguém roda antes da release". Teste automatizado que depende de memória humana deixa de ser automatizado na prática.

## 26.103 Artifacts de CI

Quando um cenário falha, preserve logs, screenshots, HTML dumps e relatórios JUnit quando configurados. Isso evita precisar reproduzir localmente apenas para descobrir que a página mostrava um erro PHP evidente.

Artifacts também ajudam a comparar falhas intermitentes entre browsers e workers.

## 26.104 Tempo da suíte

Acompanhe o tempo de execução. Um cenário que leva dois minutos merece investigação, especialmente se grande parte do tempo é setup pela UI ou `sleep()`.

Performance de teste importa porque suíte lenta roda menos vezes. E teste que roda menos vezes encontra bug mais tarde.

## 26.105 Revisando um Behat em code review

Em revisão eu procuro algumas coisas imediatamente. O cenário testa comportamento ou detalhes de DOM? Usa generators para setup? Tem `@javascript` sem necessidade? Usa `sleep`? Depende de ordem? Faz chamada externa real? O nome explica a regra? Existe um step do core que já faria a mesma coisa? A assertion prova o requisito ou só confirma que a página contém algum texto genérico?

Um Behat bom deveria ser quase uma documentação executável da jornada.

## 26.106 Exercício final

Crie uma suíte Behat para `mod_checkpoint` com pelo menos quatro journeys independentes.

O primeiro scenario deve permitir que um professor crie uma atividade com nota e completion por envio. O segundo deve permitir que um aluno matriculado envie resposta e enxergue o estado de conclusão. O terceiro deve permitir que o professor avalie uma resposta já preparada por generator ou custom step e o aluno veja a nota depois. O quarto deve provar que um aluno de outro grupo não vê uma resposta que deveria estar protegida em `SEPARATEGROUPS`.

Use Background apenas para usuários, curso e matrículas realmente compartilhados. Não prepare a atividade pela interface nos cenários em que criação não é o foco. Adicione `@javascript` somente onde a UI realmente depende de JavaScript.

Depois provoque três regressões de propósito. Remova o botão de submissão do template, quebre a inicialização JavaScript do modal de grading e retire a verificação de grupo da listagem. A suíte deve detectar as três mudanças, mas a falha de autorização server-side também precisa continuar coberta por PHPUnit, porque esconder ou mostrar conteúdo no browser não é a única camada de segurança.

Por fim, rode a feature isolada, por tag e em execução paralela. Guarde os faildumps de uma falha provocada e identifique, pela screenshot e pelo HTML, qual estado da interface causou o erro. Se o diagnóstico exigir colocar `sleep(10)` até o teste passar, o exercício ainda não terminou.

## 26.107 Fechando o capítulo

Behat é valioso porque testa o Moodle no nível em que professores, alunos e administradores realmente trabalham. Ele encontra problemas que um teste PHP isolado não vê, como botão que não aparece, modal que não abre, JavaScript que não termina, campo com nome incorreto, filtro que não atualiza e jornada que exige uma permissão que a interface não respeitou.

Mas justamente por envolver browser e aplicação completa, é uma ferramenta cara. O segredo de uma boa suíte não é ter o maior número de cenários, mas escolher jornadas críticas, preparar estado com generators, usar selectors semânticos, evitar sleeps, reaproveitar steps do core e deixar detalhes de regra para PHPUnit. Quando essa divisão é respeitada, PHPUnit protege a lógica e Behat protege a experiência, e os dois juntos permitem alterar um plugin grande sem depender de uma maratona manual de cliques antes de cada release.

## Referências técnicas consultadas

* MOODLE. Moodle Developer Resources. Behat. Disponível em: https://moodledev.io/general/development/tools/behat. Acesso em setembro de 2026.
* MOODLE. Moodle Developer Resources. Writing acceptance tests. Disponível em: https://moodledev.io/general/development/tools/behat/writing. Acesso em setembro de 2026.
* MOODLE. Moodle Developer Resources. Running acceptance tests. Disponível em: https://moodledev.io/general/development/tools/behat/running. Acesso em setembro de 2026.
* MOODLE. Moodle source code. `config-dist.php`, seção Behat support. Disponível em: https://github.com/moodle/moodle/blob/main/config-dist.php. Acesso em setembro de 2026.
* MOODLE. Moodle source code. `admin/tool/behat/cli/init.php`. Disponível em: https://github.com/moodle/moodle/blob/main/public/admin/tool/behat/cli/init.php. Acesso em setembro de 2026.
* MOODLE. Moodle source code. `admin/tool/behat/cli/run.php`. Disponível em: https://github.com/moodle/moodle/blob/main/public/admin/tool/behat/cli/run.php. Acesso em setembro de 2026.
* MOODLEHQ. Moodle Docker. Exemplos de execução de Behat em ambiente de desenvolvimento. Disponível em: https://github.com/moodlehq/moodle-docker. Acesso em setembro de 2026.

{% endraw %}
