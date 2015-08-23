# QUALIDADE DE CÓDIGO DESDE O INÍCIO

Existe uma maneira bastante eficiente de criar dívida técnica em um curso de desenvolvimento Moodle, ensinar durante vinte capítulos que o importante é fazer funcionar e deixar Coding Style, organização e ferramentas de qualidade para o final. O aluno aprende a resolver tudo com funções globais, copia padrões antigos do core, cria classes que fazem cinco coisas ao mesmo tempo e, quando finalmente chega ao capítulo de qualidade, precisa desaprender metade do que praticou. Eu prefiro inverter essa lógica. Se você vai escrever um plugin hoje, já deve escrever como espera manter esse plugin daqui a três anos.

Isso não significa transformar cada arquivo em uma demonstração de perfeccionismo ou gastar meia hora discutindo se uma variável poderia ter um nome dois caracteres menor. Qualidade de código é outra coisa. É conseguir abrir um arquivo sem precisar decifrar a intenção do autor, alterar uma regra sem quebrar quatro partes aparentemente desconectadas, trocar uma API deprecated sem procurar por cinquenta chamadas escondidas e deixar ferramentas automáticas encontrarem problemas simples antes que eles cheguem ao code review. Em produção, legibilidade não é estética. Legibilidade reduz erro, tempo de suporte e custo de manutenção.

O Moodle ajuda bastante nisso porque possui convenções fortes e ferramentas capazes de verificar muitas delas. O problema aparece quando tratamos essas regras como uma prova escolar e o objetivo passa a ser "zerar o checker". Uma linha pode passar no PHPCS e continuar sendo uma péssima decisão de arquitetura, enquanto outra pode gerar um aviso que merece ser entendido antes de ser corrigido. Este capítulo vai trabalhar exatamente essa diferença, porque ferramenta boa não substitui raciocínio, apenas torna o raciocínio menos desperdiçado com problemas repetitivos.

## Moodle Coding Style

O Moodle Coding Style é o conjunto de regras que define como o código deve ser escrito e organizado para permanecer consistente com o restante do ecossistema. No Moodle 3.5 existem convenções próprias para nomes de classes, variáveis, namespaces, arquivos, documentação, globals, SQL, indentação e vários outros detalhes, portanto o padrão do projeto deve ser tratado como contrato do ecossistema e não como preferência pessoal de formatação.

A razão prática para existir um padrão não é fazer todo mundo programar do mesmo jeito por gosto. Imagine receber um plugin com trinta mil linhas escrito por cinco pessoas, em que uma usa camelCase, outra usa snake_case, uma coloca duas classes no mesmo arquivo, outra cria nomes de namespace arbitrários e a terceira resolve tudo em funções globais. O código pode até executar, mas cada arquivo exige uma pequena mudança mental antes de ser entendido. Quando as regras são previsíveis, você para de gastar atenção com formato e começa a gastar atenção com comportamento, que é exatamente onde a revisão de código deveria estar concentrada.

Há ainda um detalhe importante para quem aprende olhando o core. Nem todo código que existe dentro do Moodle representa o padrão recomendado para código novo. O projeto já acumula mais de quinze anos de compatibilidade e APIs históricas, então copiar uma construção apenas porque ela aparece em algum arquivo do core pode significar copiar legado. Antes de reproduzir um padrão estranho, confira a documentação de desenvolvimento do Moodle 3.5 e observe como componentes recentes da própria branch resolvem o mesmo problema.

## Estrutura de um arquivo PHP Moodle

Um arquivo PHP moderno de plugin tende a ser bastante previsível. Começa com `<?php`, não fecha a tag PHP no final, possui o cabeçalho de licença quando aplicável, declara namespace quando é uma classe autoloaded, importa classes necessárias, documenta o artefato e contém apenas a responsabilidade daquele arquivo. Em scripts com execução direta ou arquivos que podem produzir efeito colateral, também é comum encontrar a proteção `defined('MOODLE_INTERNAL') || die();`, mas ela não deve ser copiada mecanicamente para qualquer arquivo sem entender a razão.

Uma classe simples poderia ter esta forma.

```php
<?php

// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_catalogsync;

/**
 * Synchronises one catalogue item.
 *
 * @package    local_catalogsync
 * @copyright  2018 Eduardo Kraus
 * @license    https://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
final class item_sync {
    public function execute($itemid) {
        // Synchronisation logic.
    }
}
```

O exemplo é pequeno de propósito. Não existe `require_once` para carregar a classe, não existe fechamento `?>`, não existe código executando fora da classe e o nome do arquivo deveria acompanhar a regra de autoload, neste caso `classes/item_sync.php`. Quando essa estrutura vira hábito, você consegue abrir um plugin desconhecido e localizar rapidamente o que procura, porque os arquivos deixam de ser recipientes genéricos e passam a representar contratos previsíveis.

Outro cuidado é não misturar "arquivo PHP" com "página PHP". Um `index.php` acessado pelo navegador terá bootstrap, parâmetros, contexto, autorização, preparação de `$PAGE` e saída, enquanto uma classe em `classes/` não deveria começar a fazer essas coisas no escopo global. Se você abre uma classe e encontra `require_login()` executando antes da declaração da classe, alguma responsabilidade foi parar no lugar errado.

## Cabeçalho GPL

Plugins distribuídos para Moodle normalmente utilizam a GNU GPL v3 ou posterior e os arquivos do projeto devem carregar o cabeçalho de licença compatível com essa distribuição. O cabeçalho não é um comentário decorativo que copiamos porque o validator reclama. Ele informa as condições sob as quais aquele código pode ser redistribuído e modificado, além de deixar claro para ferramentas e revisores qual licença rege o arquivo.

No dia a dia, o erro mais comum não é esquecer completamente a licença, mas copiar um cabeçalho antigo com copyright de outra pessoa, ano errado ou URL diferente sem perceber. Isso acontece bastante quando alguém cria o plugin duplicando uma pasta existente e começa a renomear arquivos. O plugin funciona, mas agora dezenas de arquivos dizem que foram escritos por um autor que nunca viu aquele projeto. Ferramentas podem apontar parte desse problema, porém a revisão humana ainda precisa verificar se a informação faz sentido.

Também não precisa inventar uma variação própria do texto. Use o padrão praticado pelo Moodle e mantenha consistência entre os arquivos. Em arquivos que contêm apenas um artefato documentado, como uma classe, a documentação específica do arquivo pode ser opcional, mas `@package`, copyright e licença precisam continuar representados corretamente no docblock apropriado.

## PHPDoc

PHPDoc serve para explicar o contrato que o código sozinho não consegue comunicar com clareza e para alimentar IDEs, geradores de documentação e ferramentas de análise. O problema é que muita gente aprendeu a escrever PHPDoc como uma repetição automática da assinatura, então encontramos comentários como "Gets the name" sobre um método chamado `get_name()`, seguido por `@return string The name`. Isso ocupa espaço e não acrescenta praticamente nada.

Um bom docblock explica intenção, restrições, formato de dados, efeitos relevantes e situações que não ficam óbvias apenas olhando os tipos. Se um método recebe um `courseid` e só funciona para cursos visíveis ao usuário atual, isso é parte importante do contrato. Se lança uma exceção quando uma integração externa retorna estado inválido, documentar ajuda. Se o parâmetro é `int $courseid`, escrever apenas "Course id" no `@param` talvez seja obrigatório em determinado contexto de documentação, mas não substitui uma descrição realmente útil quando há regras adicionais.

PHPDoc não deve apenas repetir o nome do método. Use comentários para explicar contrato, efeitos, exceções, permissões e formatos que não ficam claros olhando a assinatura; em callbacks do Moodle, respeite exatamente a assinatura esperada pela API.

## @package

`@package` identifica o componente Frankenstyle ao qual o artefato pertence. Em um plugin `local_catalogsync`, o valor correto é `local_catalogsync`; em `mod_supervideo`, seria `mod_supervideo`. Parece simples, mas é outro lugar em que cópia e cola cria inconsistência fácil. Se você duplicar uma classe de `local_oldplugin` e esquecer de alterar o package, o código pode executar normalmente, porém a documentação e ferramentas passam a enxergar aquele arquivo como pertencente ao componente errado.

O interessante é perceber que `@package` não é nome comercial e não é caminho físico escrito livremente. Ele representa a mesma identidade técnica discutida nos capítulos anteriores, a mesma que aparece em `version.php`, namespaces, strings, templates e várias APIs. Quando esses nomes divergem, não estamos diante de um detalhe estético e sim de um componente que está descrevendo a si próprio de formas diferentes.

Não tente usar `@subpackage` para inventar uma segunda árvore de componentes. Se precisa organizar implementação interna, use namespaces de acordo com as regras do Moodle. O package continua sendo o componente principal.

## Namespaces corretos

Namespaces formais são obrigatórios para novas classes Moodle, salvo os pontos legados em que uma API ainda exige classe global ou outra convenção histórica. Para um plugin `local_catalogsync`, o namespace base é `local_catalogsync`, e qualquer organização adicional precisa partir desse primeiro nível. Você não escolhe `Eduardo\CatalogSync` porque fica bonito, nem coloca `App\Services` porque está acostumado com outro framework. No Moodle, o primeiro nível é a identidade do componente.

```
namespace local_catalogsync;

final class synchroniser {
}
```

Se a classe implementa uma API conhecida, o segundo nível costuma representar essa API. Eventos ficam em `event`, tasks em `task`, classes externas em `external`, output em `output` e assim por diante. Para classes internas que não pertencem a uma API padronizada, o Moodle reserva o segundo nível `local`, assunto que veremos mais adiante.

O namespace também precisa combinar com o caminho. `local_catalogsync\local\sync\manager` deveria estar em `classes/local/sync/manager.php`. Se você move a classe para `classes/service/manager.php` mas mantém um namespace que não corresponde às regras esperadas, o autoloader não vai adivinhar sua intenção. A vantagem da convenção é justamente não depender de configuração manual para cada classe.

## Regras de autoload

O autoload do Moodle elimina a necessidade de espalhar `require_once` pelo plugin para classes modernas. O sistema conhece a relação entre o componente, o diretório `classes/`, o namespace e o nome da classe, então consegue carregar o arquivo quando a classe é utilizada. Para isso funcionar, você precisa cumprir o contrato, e não "quase" cumprir.

Considere esta classe.

```
namespace local_catalogsync\local\queue;

final class dispatcher {
}
```

O caminho esperado é `local/catalogsync/classes/local/queue/dispatcher.php`. O arquivo deve usar o nome da classe em minúsculas conforme as convenções do Moodle. Se você colocar `Dispatcher.php`, criar uma pasta `Services` ou inventar uma configuração PSR-4 particular para aquele plugin, começou a disputar com uma infraestrutura que já resolvia o problema.

Autoload também muda a forma de pensar dependências. Em vez de abrir um `lib.php` e incluir cinco arquivos para garantir que tudo esteja disponível, deixe cada classe ser carregada quando for necessária. Isso reduz custo de bootstrap e torna as relações mais claras. `require_once` continua existindo para bibliotecas legadas e APIs antigas fora do mecanismo autoloaded, mas deveria chamar sua atenção quando aparece entre duas classes modernas do próprio plugin.

## Tipagem de parâmetros

O Moodle 3.5 precisa conviver com PHP 7.0, então não escreva exemplos que dependam de sintaxe posterior. Type hints que já existem no PHP suportado podem ser úteis em classes internas, mas não altere a assinatura de callbacks do Moodle nem force tipagem onde o contrato do core é mais amplo.

```php
public function sync($courseid, $force = false) {
    $courseid = (int)$courseid;
    // Validação de domínio e sincronização.
}
```

A validação continua necessária mesmo quando um parâmetro é tipado, porque saber que algo é inteiro não prova que o curso existe nem que o usuário possui acesso.

## Tipagem de retorno

Em APIs públicas do plugin, documente claramente o retorno com PHPDoc e mantenha o comportamento consistente. No Moodle 3.5 você encontrará muitos contratos históricos sem declaração de tipo de retorno, portanto copiar uma assinatura mais restritiva pode quebrar herança ou callbacks.

```php
/**
 * Finds an item.
 *
 * @param int $id
 * @return item|false
 */
public function find($id) {
    // ...
}
```

O importante é não fazer um método retornar objeto em um caso, `false` em outro e `null` em um terceiro sem que o contrato deixe isso explícito.

## Visibility

Métodos e propriedades de classes devem declarar visibilidade explicitamente. `public`, `protected` e `private` não servem apenas para agradar o parser ou o checker, eles definem o espaço de manutenção da classe. Tudo que você torna público pode acabar sendo utilizado por outro componente, por um teste, por uma extensão institucional ou até por código seu que começa a depender de um detalhe que deveria permanecer interno.

Use `public` para aquilo que constitui o contrato da classe, `protected` quando subclasses legitimamente precisam participar da implementação e `private` quando o detalhe pertence somente à própria classe. O erro frequente é declarar tudo como `public` "porque facilita". Facilita hoje, mas dificulta amanhã, porque mudar uma propriedade pública pode quebrar qualquer chamador que tenha resolvido acessá-la diretamente.

Também não use getters e setters de forma automática como se encapsulamento fosse criar dois métodos para cada propriedade. Se uma alteração exige validação, prefira um método específico de domínio a um `set_status()` genérico; visibilidade deve refletir desenho, não ritual.

## final

`final` comunica que uma classe ou método não foi projetado para extensão. Isso pode ser bastante útil em serviços internos, value objects, handlers e outras classes em que herança não faz parte do contrato. Ao marcar como final, você ganha liberdade para alterar detalhes internos sem precisar imaginar subclasses desconhecidas dependendo deles.

```php
final class token_generator {
    public function generate(int $userid): string {
        // ...
    }
}
```

Não marque tudo como final por ideologia. Moodle possui APIs baseadas em herança, como formulários, tasks especializadas e várias classes de plugin, então impedir extensão em uma classe que existe justamente para ser estendida é contraditório. O bom uso de `final` começa com uma pergunta simples, "eu estou oferecendo herança como API?". Se a resposta é não, final pode deixar isso explícito; se a resposta é sim, você precisa pensar quais métodos serão parte do contrato de extensão.

Em projetos grandes, `final` também ajuda o analisador estático e o leitor a entender que composição deve ser preferida naquele ponto. O ganho não é velocidade do PHP, é redução do espaço de possibilidades que precisamos considerar ao modificar a classe.

## Classes pequenas e responsabilidade única

"Classe pequena" não significa uma meta arbitrária de cinquenta linhas. Uma classe pode ter duzentas linhas e ainda possuir uma responsabilidade coerente, enquanto outra com trinta pode misturar autorização, SQL, HTTP e HTML. O critério mais útil é observar quantos motivos diferentes fariam aquela classe mudar.

Imagine `course_sync_manager`. Se ela busca cursos no banco, chama uma API externa, transforma payload, salva logs, envia mensagens e renderiza uma tabela de status, qualquer alteração em seis áreas diferentes pode obrigar a editar o mesmo arquivo. Além de difícil de testar, a classe passa a conhecer detalhes demais. Uma divisão melhor poderia separar gateway externo, repositório, serviço de sincronização e objeto de resultado, deixando cada peça com um motivo mais claro para mudar.

Isso não significa criar uma classe por método. Fragmentação exagerada também atrapalha, principalmente quando precisamos abrir dez arquivos para entender uma operação simples. O objetivo é encontrar fronteiras que representam responsabilidades reais. Quando um nome de classe começa a usar "and", quando o construtor recebe serviços de domínios muito diferentes ou quando metade dos métodos não usa as mesmas dependências que a outra metade, existem sinais fortes de que a classe está fazendo coisas demais.

## Por que não criar classes utils gigantes

Toda base de código parece produzir cedo ou tarde uma `utils`, `helper`, `functions` ou `common`. No começo ela tem dois métodos inocentes, depois recebe formatação de data, busca de usuário, chamada HTTP, conversão de arquivo, verificação de capability e qualquer outra coisa que não encontrou casa imediatamente. Alguns meses depois existe uma classe com mil linhas que todos importam e ninguém quer alterar.

O problema de `utils` não é o nome em si, é a ausência de domínio. Uma classe chamada `course_name_formatter` diz exatamente o que faz. `external_catalog_client` define uma fronteira. `sync_result` representa um conceito. `utils` apenas informa que existe código ali dentro. Quando tudo pode entrar, nada tem uma responsabilidade clara.

Além disso, helpers gigantes criam acoplamento transversal. Um método simples que formata uma string passa a depender da mesma classe que conhece `$DB`, cURL e configurações globais, o que dificulta testes e reaproveitamento. Se você perceber que está prestes a adicionar o décimo método sem relação direta com os anteriores em `utils`, não pergunte apenas onde colocar o método, pergunte qual conceito ele representa.

## API pública versus implementação interna

Dentro de um plugin existe código que você pretende oferecer como contrato estável e código que serve apenas para implementar o próprio componente. Misturar essas duas categorias torna evolução muito mais difícil. Se outro plugin passa a depender diretamente de uma classe interna e você a refatora, uma mudança que deveria ser privada vira breaking change.

Uma API pública precisa ser deliberada. Nome, tipos, exceções, efeitos e estabilidade importam porque chamadores externos podem depender disso. Implementação interna pode mudar com mais liberdade desde que preserve o comportamento público. Essa diferença é a mesma que existe em qualquer biblioteca bem organizada, mas no Moodle temos convenções de namespace que ajudam a sinalizar a intenção.

Também não assuma que "public" em PHP significa automaticamente "API pública do plugin". `public` define visibilidade da linguagem, enquanto estabilidade de API é uma decisão arquitetural. Uma classe pode precisar de método public para colaborar com outra classe interna e ainda assim não ser um ponto suportado para terceiros. Documentação, namespace, design e, quando aplicável, contratos explícitos ajudam a evitar essa confusão.

## Namespace local

Aqui existe uma confusão de nomes que merece atenção. O namespace `local` dentro de um componente não é a mesma coisa que um plugin do tipo `local`. Um plugin `mod_supervideo` pode perfeitamente possuir classes em `mod_supervideo\local\...`, e isso não transforma a atividade em plugin local.

O segundo nível `local` é reservado para implementação interna do componente quando você precisa organizar classes que não pertencem a uma API Moodle específica. Um exemplo poderia ser `local_catalogsync\local\mapping\resolver`. Essa classe fica em `classes/local/mapping/resolver.php` e sinaliza que pertence à implementação do próprio plugin.

```
namespace local_catalogsync\local\mapping;

final class resolver {
}
```

Esse namespace é útil justamente para separar contrato de detalhes. Se outro plugin começa a importar classes de `\local\` como se fossem API estável, vale questionar essa dependência. Às vezes é inevitável em um ecossistema institucional, mas nesse caso talvez seja hora de definir uma interface pública apropriada em vez de depender de detalhes internos.

## Nível de namespace permitido

As regras do Moodle dividem namespaces em níveis. O primeiro nível é o componente completo, como `local_catalogsync` ou `mod_forum`. O segundo nível, quando usado, deve representar uma API reconhecida, como `event`, `task`, `output`, `external`, ou então `local` para organização interna. A partir do terceiro nível existe mais liberdade para organizar o domínio do plugin.

Isso significa que `local_catalogsync\service` pode parecer natural para quem vem de outro framework, mas você precisa verificar se `service` é um segundo nível permitido segundo as convenções do Moodle. Em muitos casos, uma organização interna coerente seria `local_catalogsync\local\service`. Já `local_catalogsync\task` faz sentido porque `task` representa uma API conhecida e o core espera encontrar classes desse tipo ali.

A regra evita que cada plugin crie um vocabulário diferente exatamente no ponto em que o Moodle usa namespaces para organizar APIs. Depois do terceiro nível, você pode criar algo como `local_catalogsync\local\sync\strategy` sem competir com nomes reservados para APIs do core.

## Deprecated API

API deprecated é código que ainda existe por compatibilidade, mas já possui substituto ou caminho de remoção definido. O erro mais perigoso é tratar aviso de deprecated como "não é erro, então posso ignorar". É verdade que a aplicação pode continuar funcionando hoje, porém o aviso está dizendo que sua próxima atualização pode ser mais cara se você continuar construindo em cima daquele ponto.

Quando encontrar uma chamada deprecated, não faça substituição cega pelo primeiro nome sugerido. Leia a documentação, o `upgrade.txt` correspondente e, quando necessário, o código do core. Às vezes a nova API muda apenas o nome, mas em outros casos muda o modelo de dados, o contexto, o retorno ou a responsabilidade. Trocar uma chamada sem entender a nova semântica pode silenciar o warning e introduzir um bug.

Também existem situações em que você mantém compatibilidade com mais de uma branch do Moodle. Nesse caso, a solução pode exigir uma camada de compatibilidade controlada ou branches diferentes do plugin. O que não funciona bem é espalhar verificações de versão e `function_exists()` por toda a base. Compatibilidade deve ter estratégia, não improviso em cada arquivo.

## debugging()

`debugging()` é uma ferramenta do Moodle para registrar mensagens de diagnóstico respeitando a infraestrutura de debug da plataforma. Em código de plugin, ela é preferível a `echo`, `var_dump()` e outras saídas improvisadas quando você precisa sinalizar uma condição inesperada sem necessariamente interromper a execução.

```php
if ($legacyvalue !== null) {
    debugging(
        'The legacy configuration value is still in use.',
        DEBUG_DEVELOPER
    );
}
```

O segundo argumento permite indicar o nível em que a mensagem deve aparecer. `DEBUG_DEVELOPER` é especialmente útil para alertas relevantes durante desenvolvimento que não precisam ser expostos a usuários finais em produção.

Mas não transforme `debugging()` em log de aplicação. Mensagem de depuração, evento de auditoria, log operacional e erro de integração são coisas diferentes. Se você precisa registrar cada sincronização concluída durante anos, provavelmente existe uma estratégia de logging ou evento mais adequada. `debugging()` serve para ajudar desenvolvedores a perceber condições que merecem atenção durante execução e testes.

## Developer debugging

Ativar o nível de debug para desenvolvedor em um ambiente de desenvolvimento muda completamente a experiência de escrever plugin. Warnings, notices, mensagens de depreciação e diagnósticos que em produção ficam escondidos passam a aparecer, e isso permite corrigir problemas enquanto ainda são baratos.

Desenvolver com debug desligado é parecido com dirigir removendo as luzes do painel porque elas incomodam. O sistema parece mais tranquilo, mas você apenas deixou de ver sinais que já existiam. Um acesso a propriedade inexistente, uma string faltando, uma assinatura incompatível ou uma chamada deprecated pode ficar silenciosa até chegar em uma situação mais difícil de reproduzir.

Naturalmente, ambiente de produção não deve despejar detalhes técnicos na tela do usuário. O nível de debug e a exibição precisam respeitar segurança e operação. A recomendação aqui é manter ambiente de desenvolvimento realmente configurado como desenvolvimento, com `debugdeveloper` ativo, e não usar a produção como laboratório porque "lá aparece o erro de verdade".

## Moodle Code Checker

Moodle Code Checker é uma ferramenta voltada a verificar conformidade com os padrões de código da plataforma. Ele utiliza PHP_CodeSniffer e regras específicas do Moodle para identificar nomes incorretos, formatação, documentação, padrões proibidos e várias outras inconsistências que seriam cansativas de encontrar manualmente em toda revisão.

O melhor uso é executar cedo e com frequência. Se você deixa para rodar no final de uma feature de cinco mil linhas, recebe uma parede de avisos e começa a corrigir tudo mecanicamente. Quando o checker participa do ciclo diário, cada problema aparece próximo da mudança que o introduziu e a correção costuma ser óbvia.

Também é importante entender que o Code Checker verifica aquilo que consegue formalizar. Ele pode dizer que a variável segue o padrão de nome, mas não sabe necessariamente que ela representa o conceito errado. Pode aceitar uma classe `utils` perfeitamente formatada com mil linhas. Qualidade arquitetural continua sendo responsabilidade do desenvolvedor e do review.

## PHP_CodeSniffer

PHP_CodeSniffer, normalmente chamado de PHPCS, é a infraestrutura que analisa tokens do código PHP e aplica um conjunto de sniffs. O Moodle mantém seu padrão e ferramentas em cima desse mecanismo, então entender o básico ajuda bastante quando um erro parece enigmático.

Ao executar PHPCS, a mensagem normalmente informa arquivo, linha, coluna, regra e descrição. Não leia apenas a descrição. O nome do sniff pode indicar exatamente qual política foi violada e permite pesquisar a documentação ou o próprio código da regra quando necessário. Isso é especialmente útil em casos em que a mensagem curta não explica toda a motivação.

Em alguns problemas existe correção automática por PHPCBF, mas use com critério. Ajustar espaço, indentação ou quebra de linha é uma ótima tarefa para automação; reestruturar semântica, renomear API pública ou decidir tipo de retorno não deveria ser delegado cegamente. Se a ferramenta oferece autofix, revise o diff como revisaria qualquer alteração de código.

## Moodle Coding Standard

O Moodle Coding Standard é o conjunto de regras PHPCS que materializa boa parte do Coding Style. Em um ambiente moderno, você pode instalar o padrão via Composer e executar `phpcs` diretamente sobre o plugin, integrando a verificação ao editor, pre-commit ou CI.

A vantagem de usar o standard oficial é eliminar configurações pessoais divergentes. Não faz sentido um desenvolvedor formatar segundo uma regra local e o pipeline usar outra. O mesmo código deve ser avaliado da mesma maneira na máquina de quem desenvolve e no servidor de integração.

Também vale controlar a versão das ferramentas. Atualizar o standard pode introduzir novos sniffs ou tornar regras existentes mais rigorosas, então uma pipeline reproduzível precisa instalar versões conhecidas, principalmente quando mantém branches de Moodle diferentes. "Na minha máquina passou" costuma ser menos um mistério e mais duas máquinas usando ferramentas diferentes.

## ESLint

No Moodle 3.5, JavaScript novo deve preferir módulos AMD em `amd/src/`. ESLint cumpre para JavaScript um papel semelhante ao PHPCS, verificando sintaxe, padrões e estilo antes que pequenos problemas cheguem ao navegador.

Isso é importante porque JavaScript tem uma capacidade impressionante de aceitar construções que parecem funcionar até uma combinação específica de dados acontecer. Variável não utilizada, referência indefinida, promise mal tratada e vários padrões de estilo podem ser detectados sem abrir a página no navegador.

Não trate JavaScript como parte secundária do plugin que pode seguir qualquer padrão porque "é só frontend". Um erro em um módulo AMD pode impedir a inicialização de toda uma interface, quebrar modal, chamadas AJAX ou acessibilidade. Se PHP passa por validação rigorosa e JavaScript é enviado sem lint, a qualidade do componente continua desequilibrada.

## Grunt

Grunt continua fazendo parte do fluxo de desenvolvimento do Moodle para tarefas relacionadas a JavaScript, lint e construção de determinados artefatos. No Moodle 3.5, Grunt faz parte do fluxo de desenvolvimento JavaScript e deve ser executado com a versão de Node suportada pela branch.

Ao alterar arquivos de JavaScript, SCSS ou outros recursos que participam dessas tarefas, executar o comando apropriado evita descobrir no CI que um arquivo compilado ficou desatualizado ou que o lint falha. Moodle Plugin CI consegue executar tarefas Grunt relevantes para o plugin e isso reduz a diferença entre validação local e pipeline.

Não versione resultados gerados sem entender o que a branch espera. Em algumas áreas o Moodle mantém artefatos compilados no repositório, em outras a estratégia pode mudar. A fonte continua sendo a documentação da versão e o padrão praticado pelo core, não uma receita antiga encontrada em um blog de cinco anos atrás.

## Mustache lint

Templates Mustache parecem simples porque grande parte deles é HTML com placeholders, mas também podem acumular problemas de estrutura, JavaScript inline indevido, marcação inválida e padrões que as ferramentas do Moodle conseguem detectar. O lint específico de Mustache faz parte justamente dessa camada.

Se um template não passa no lint, não resolva removendo estrutura ou escapando conteúdo aleatoriamente até a ferramenta parar de reclamar. Entenda se o problema é HTML inválido, atributo incorreto, uso inadequado de helper ou outro contrato do template. Mustache está na fronteira entre dados preparados no PHP e apresentação, então erros ali frequentemente indicam que alguma responsabilidade está atravessando essa fronteira de forma ruim.

No capítulo de Output API veremos essa separação com profundidade. Por enquanto, a regra é simples. Template também é código de produção e merece validação automatizada, inclusive porque problemas de HTML e acessibilidade podem não aparecer imediatamente em um teste manual rápido.

## Plugin Validate

A validação de plugin verifica estrutura e convenções que vão além de simples formatação PHP. Dependendo da ferramenta e do fluxo utilizado, ela consegue detectar problemas em metadados, arquivos obrigatórios, versionamento, definições conhecidas e outros pontos específicos do ecossistema Moodle.

Moodle Plugin CI possui uma etapa `validate` justamente para executar validações leves sobre a estrutura e código do plugin. Para quem publica no diretório de plugins ou mantém distribuição automatizada, validar antes de gerar a release evita descobrir problemas somente durante submissão ou instalação em outro ambiente.

Não confunda Validate com testes funcionais. Um plugin pode ter todos os arquivos esperados, metadados corretos e zero erro estrutural, mas salvar nota errada, permitir acesso indevido ou perder dados durante upgrade. Validação responde "este pacote respeita uma série de contratos?", enquanto testes e revisão precisam responder "o comportamento está correto?".

## Code review

Code review não deveria ser uma pessoa rodando mentalmente o PHPCS. Se a máquina consegue verificar indentação, nome de arquivo e trailing whitespace, deixe a máquina fazer isso. O revisor precisa gastar tempo em decisões que dependem de contexto, como autorização, fronteiras de responsabilidade, compatibilidade, performance, clareza de API, tratamento de erros e comportamento em cenários extremos.

Um review bom começa entendendo o problema que a mudança resolve. Sem isso, é fácil discutir detalhes locais e ignorar que a solução inteira foi colocada no tipo de plugin errado ou duplicou uma API já existente no Moodle. Depois, olhe o fluxo de dados. De onde entram parâmetros, onde são validados, em qual contexto a capability é verificada, quais tabelas são lidas, que side effects acontecem e o que ocorre se uma etapa falhar.

Também revise pensando na próxima mudança, não apenas na feature atual. Se amanhã precisarmos adicionar um segundo provedor externo, essa classe permite extensão razoável ou tudo está hardcoded? Se uma chamada ficar lenta, conseguimos mover para task sem reescrever metade do plugin? Se a API mudar, existe uma fronteira clara para adaptação? Essas perguntas distinguem revisão arquitetural de correção cosmética.

## Como ler os erros das ferramentas sem simplesmente fazer passar

Quando uma ferramenta aponta erro, existem três perguntas melhores do que "como faço isso sumir?". A primeira é qual regra foi violada. A segunda é por que essa regra existe. A terceira é se a correção sugerida preserva ou melhora a intenção do código. Essa sequência evita a prática terrível de alterar coisas aleatoriamente até a pipeline ficar verde.

Imagine um checker dizendo que o nome de uma classe não segue a convenção. Você poderia adicionar ignore, desabilitar o sniff ou renomear. Antes de escolher, descubra se a classe implementa uma API legada que exige aquele nome. Se sim, a exceção pode ser legítima; se não, provavelmente o nome está errado. O erro não é apenas uma ordem, é uma pista para investigar o contrato.

O mesmo vale para complexidade e análise estática. Se a ferramenta aponta que um valor pode ser `null`, colocar `/** @var object $value */` acima da linha pode calar o analisador, mas não torna o valor não nulo em runtime. Às vezes o correto é validar e lançar exceção, às vezes aceitar `null`, às vezes corrigir a origem. Silenciar o diagnóstico sem resolver a condição apenas troca um erro visível por uma falsa sensação de segurança.

Também evite a obsessão por zero warning fora de contexto. Um warning pode existir porque uma API legada força assinatura diferente ou porque uma biblioteca de terceiro não segue o padrão Moodle. Nesse caso, a supressão deve ser pequena, documentada e localizada. Desligar uma regra para o plugin inteiro porque uma linha legítima incomodou é usar uma marreta para ajustar um parafuso.

## Exercício - receber um plugin funcional, mas mal escrito, e refatorá-lo

O exercício deste capítulo parte de um plugin que funciona. Essa parte é importante, porque refatoração não é consertar um sistema quebrado e sim melhorar estrutura preservando comportamento. O plugin recebe um `courseid`, consulta dados do curso, chama uma API externa, salva o resultado em uma tabela própria e mostra uma página de status. Tudo está concentrado em `lib.php` e `index.php`, com funções globais, SQL montado por concatenação, HTML dentro do PHP e uma classe `utils` com métodos que fazem coisas sem relação entre si.

Antes de alterar, rode o plugin e registre o comportamento esperado. Depois execute Code Checker, PHPCS, validação do plugin e, se o projeto possuir JavaScript ou Mustache, as verificações correspondentes. Guarde os resultados. O objetivo não é começar corrigindo cada linha vermelha, porque isso faria você gastar tempo formatando código que talvez seja removido durante a refatoração.

Primeiro identifique responsabilidades. Separe acesso ao serviço externo, persistência, regra de sincronização e preparação da saída. Mova classes para `classes/`, aplique namespaces corretos e autoload, use type hints compatíveis com PHP 7.0 onde o contrato permitir e reduza `lib.php` aos callbacks que precisam continuar globais.

Depois faça a segunda rodada de ferramentas. Agora os erros de estilo estão sendo aplicados sobre a arquitetura que pretende permanecer. Corrija cada grupo entendendo a regra, execute os testes de comportamento novamente e compare o resultado com a versão inicial. Se alguma "melhoria" mudou comportamento sem necessidade, a refatoração falhou naquele ponto.

Por fim, faça um code review como se o plugin fosse de outra pessoa. Procure API pública acidental, classes internas fora de `local`, dependências escondidas, parâmetros sem tipo justificável, propriedades públicas desnecessárias, suppressions amplas e comentários que explicam código confuso em vez de simplificá-lo. O resultado esperado não é apenas um relatório com zero erro, mas um plugin em que a próxima pessoa consegue localizar cada responsabilidade e alterar uma delas sem precisar entender todas as outras.

Esse exercício fecha uma ideia que vai acompanhar o restante do livro. Qualidade não é uma etapa de acabamento aplicada depois que a funcionalidade ficou pronta. Ela começa no primeiro arquivo, porque cada decisão de nome, namespace, tipo, dependência e responsabilidade define quanto trabalho teremos quando o plugin inevitavelmente precisar mudar.
