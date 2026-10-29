# Prefácio

Quem começa a desenvolver para Moodle geralmente chega com uma demanda concreta: criar uma atividade, integrar um sistema, automatizar um processo ou acrescentar uma informação que a instituição precisa. À primeira vista, parece apenas mais um trabalho em PHP. Mas basta avançar um pouco para perceber que a dificuldade não está somente em escrever o código: está em entender como a mudança deve conviver com uma plataforma que já possui regras para cursos, usuários, permissões, arquivos, avaliações, eventos e uma enorme quantidade de outros recursos.

Foi trabalhando com essas situações que aprendi uma das lições mais importantes do desenvolvimento Moodle: **fazer funcionar é apenas o começo**.

Um plugin pode funcionar perfeitamente na máquina do desenvolvedor, passar por uma demonstração e até entrar em produção sem apresentar erros imediatos. O problema aparece depois, quando uma atualização altera um comportamento, uma instalação utiliza outro banco de dados, milhares de alunos executam a mesma operação ou uma auditoria revela que determinada ação ignorava as permissões do usuário. Muitas decisões ruins não provocam falhas no primeiro dia; elas simplesmente deixam uma conta para quem precisará manter o sistema no futuro.

O Moodle não é um conjunto de páginas PHP no qual podemos acrescentar arquivos e esperar que tudo se resolva. É uma plataforma madura, construída e transformada ao longo de muitos anos, com APIs, convenções, contratos e mecanismos próprios de extensão. Conhecer essas estruturas não significa decorar nomes de funções nem aceitar cada decisão do core sem questionamento. Significa compreender por que determinadas responsabilidades pertencem à plataforma e quais consequências surgem quando tentamos resolvê-las por fora.

Pense em algo aparentemente simples, como disponibilizar um arquivo a um aluno. Podemos criar uma pasta e gravar o documento diretamente no servidor, mas como ficam as permissões, os backups, a restauração do curso, o armazenamento externo e a privacidade? Podemos consultar tabelas diretamente para produzir um relatório, mas o que acontece quando o código depende de um banco específico ou ignora os contextos de acesso? Podemos executar uma tarefa demorada durante a abertura de uma página, mas como será a experiência quando centenas de pessoas acessarem o sistema ao mesmo tempo? As soluções rápidas costumam ser atraentes justamente porque escondem o restante do problema.

**Este livro nasceu da vontade de reunir o conhecimento que faz diferença nessas escolhas.** Não pretendo apresentar o Moodle como uma plataforma sem dificuldades, nem defender que exista uma única maneira correta de implementar qualquer funcionalidade. Quero mostrar como a arquitetura funciona, quais ferramentas ela oferece, onde estão seus limites e como tomar decisões que continuem fazendo sentido depois que a primeira versão do plugin estiver pronta.

Por isso, os capítulos combinam explicações, código e situações próximas da rotina de desenvolvimento. Começamos pela estrutura interna do Moodle e avançamos por plugins, banco de dados, interfaces, formulários, segurança, arquivos, eventos, tarefas, cache e integrações. Depois entramos em componentes mais específicos, como módulos de atividade, autenticação, matrícula, avaliações, backup e privacidade, sem deixar de lado testes, integração contínua, compatibilidade entre versões e o uso responsável de inteligência artificial. O objetivo não é percorrer uma lista de APIs, mas entender como essas peças se relacionam.

Você pode ler o livro do início ao fim, especialmente se estiver formando uma visão geral da plataforma, ou abrir diretamente o capítulo que corresponde ao problema que precisa resolver. Desenvolvedores experientes também encontrarão aqui oportunidades para revisitar práticas antigas, comparar alternativas e identificar decisões que funcionaram durante anos, mas já não são as melhores para um projeto novo.

Há uma ressalva importante: o Moodle evolui. APIs surgem, outras são descontinuadas, estruturas de diretórios mudam e comportamentos podem variar entre versões. Por isso, exemplos devem ser compreendidos, testados e confrontados com a documentação e com o código da versão utilizada. Copiar uma solução sem entender suas premissas pode produzir exatamente os problemas que este livro procura evitar.

Também não seria possível escrever sobre desenvolvimento Moodle sem reconhecer o valor do software livre e da comunidade que o mantém. Documentação, discussões, correções, revisões e contribuições públicas tornam possível aprender com problemas que outras pessoas já enfrentaram. Espero que este material ajude não apenas a criar soluções melhores, mas também a participar desse processo com mais segurança e consciência técnica.

Se, ao terminar a leitura, você passar a perguntar não apenas “qual código resolve isto?”, mas também “qual API já trata essa responsabilidade?”, “quem tem permissão para executar essa ação?”, “como isso se comporta em escala?” e “o que acontecerá na próxima atualização?”, então este livro terá cumprido seu papel.

Porque desenvolver para Moodle não é simplesmente fazer o sistema executar uma funcionalidade. É construir algo que continue confiável, compreensível e sustentável quando o projeto crescer, quando outra pessoa assumir o código e quando a plataforma seguir em frente.

**Eduardo Kraus**
