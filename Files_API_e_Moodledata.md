# Files API e Moodledata

Se você abrir o moodledata de uma instalação e entrar em filedir esperando encontrar uma estrutura parecida com cursos, atividades, usuários e nomes de arquivos, a primeira impressão costuma ser que alguma coisa deu errado. Em vez de pastas com nomes compreensíveis aparecem diretórios como 08/13 e, dentro deles, arquivos chamados 081371cb102fa559e81993fddc230c79205232ce. Não existe relatorio-final.pdf, foto-do-perfil.jpg nem material-aula-3.zip. Existe uma coleção de hashes que, olhando apenas para o disco, parece não ter relação nenhuma com o que o usuário vê no Moodle.

Isso não é desorganização e muito menos uma escolha estética estranha. É justamente o contrário. O Moodle separa a identidade lógica de um arquivo da forma física como o conteúdo é armazenado, e essa separação permite deduplicação, controle de acesso por componente, backup e restore consistentes, nomes Unicode, armazenamento alternativo e até object storage sem obrigar cada plugin a conhecer a infraestrutura onde os bytes realmente estão. Quando você entende essa arquitetura, Files API deixa de parecer uma camada burocrática em volta de file_put_contents() e passa a fazer bastante sentido.

O erro clássico de quem chega ao Moodle vindo de uma aplicação PHP mais simples é pensar em arquivos como caminhos. O código recebe um upload, escolhe uma pasta e grava alguma coisa em /uploads/usuario/arquivo.pdf. Funciona até o dia em que aparecem permissões, renomeações, cópias, backup de curso, cluster com mais de um servidor, deduplicação, restore em outro site, armazenamento em S3 e a necessidade de saber se aquele arquivo pertence ao fórum 14, ao usuário 32 ou ao material do curso 7. O Files API existe para tirar essa responsabilidade de cada plugin e centralizar a relação entre conteúdo, metadados e acesso.

Neste capítulo eu vou usar um exemplo recorrente chamado mod_biblioteca, uma atividade fictícia que possui documentos privados por registro. O nome é irrelevante, mas o problema é real porque precisamos criar arquivos, listar arquivos, permitir edição, trabalhar com draft areas, gerar URLs e impedir que um aluno altere o endereço e baixe o documento de outro registro. Quando esse fluxo estiver claro, praticamente todo o restante do Files API fica muito mais previsível.

## Moodledata

em Arquitetura do Moodle nós já vimos que `$CFG->dataroot` aponta para o diretório de dados da instalação e que esse diretório não pode ser publicado diretamente pelo servidor web. Aqui precisamos ir além, porque moodledata não é simplesmente "a pasta onde ficam os uploads". Ele reúne áreas com naturezas completamente diferentes, algumas permanentes e outras descartáveis, algumas compartilhadas em cluster e outras adequadas para armazenamento local por nó.

O diretório `filedir` guarda o conteúdo dos arquivos controlados pelo Files API quando o Moodle usa o filesystem padrão. Já `temp`, `cache`, `localcache`, `sessions`, `trashdir` e outras áreas possuem finalidades específicas e não seguem exatamente a mesma lógica. Isso importa porque colocar tudo no mesmo pacote mental chamado "arquivos do Moodle" leva a decisões ruins, como sincronizar `localcache` entre servidores ou tratar `temp` como se fosse conteúdo permanente.

Outro detalhe importante é que o Files API não gerencia absolutamente tudo dentro de `$CFG->dataroot`. A documentação interna do Moodle separa claramente o conteúdo do site, que passa pelo File Storage e pelo File System, de diretórios internos usados pelo próprio sistema. Em outras palavras, `moodledata/filedir` é parte da arquitetura do Files API, enquanto várias outras pastas do dataroot existem para cache, sessão, processamento temporário ou componentes internos.

## filedir

`filedir` é o pool físico padrão onde o Moodle guarda os bytes dos arquivos permanentes controlados pelo Files API. A palavra pool é útil porque um mesmo conteúdo pode ser utilizado em vários lugares do Moodle sem precisar existir várias vezes no disco. O que diferencia esses usos não é uma segunda cópia física, mas registros distintos na tabela `files`.

Se o hash de conteúdo de um arquivo for `081371cb102fa559e81993fddc230c79205232ce`, o backend padrão usa os primeiros quatro caracteres para distribuir o arquivo em diretórios e chega a algo parecido com `moodledata/filedir/08/13/081371cb102fa559e81993fddc230c79205232ce`. Isso evita despejar milhões de objetos em uma única pasta e mantém o nome físico diretamente relacionado ao conteúdo.

A partir desse ponto surge uma regra que vale repetir várias vezes neste capítulo: o nome que o usuário vê não é o nome físico do objeto no `filedir`. O nome visível está nos metadados do Files API, enquanto o conteúdo físico é identificado pelo `contenthash`. Se você tentar encontrar `trabalho-final.pdf` usando `find` dentro de `filedir`, está procurando a coisa certa no lugar errado.

## Por que não alterar manualmente filedir

Entrar em `moodledata/filedir`, copiar um arquivo para lá e esperar que ele apareça no Moodle não funciona porque o File System guarda bytes, mas quem dá identidade lógica ao arquivo é o File Storage. Sem o registro correspondente em `{files}`, o Moodle não sabe o contexto, componente, filearea, itemid, caminho virtual, nome, MIME type, autor nem a relação daquele conteúdo com o restante do sistema.

O caminho inverso é ainda pior. Se você localizar um hash em `filedir` e simplesmente apagá-lo, pode quebrar vários usos de uma vez, pois o mesmo `contenthash` pode estar referenciado por diversos registros. A deduplicação que economiza espaço também significa que o arquivo físico não pertence exclusivamente à linha que você estava olhando.

E editar o conteúdo no lugar é uma ideia particularmente ruim. O nome físico é o SHA1 do conteúdo, então trocar os bytes sem mudar o nome quebra a própria invariável do storage. Agora o banco continua dizendo que aquele arquivo possui determinado `contenthash`, mas o conteúdo já não corresponde ao hash. A documentação do core inclusive mostra que, no backend padrão, você pode usar `sha1sum` para validar corrupção comparando o hash calculado com o nome físico. Se você editar o arquivo manualmente, acabou de fabricar uma corrupção.

## A tabela files e o famoso mdl_files

Em instalações com o prefixo padrão você verá a tabela como `mdl_files`, mas dentro do código do plugin não escreva esse nome. O correto continua sendo `{files}`, permitindo que a DML API aplique o prefixo configurado na instalação. Eu uso `mdl_files` aqui apenas porque é assim que muita gente encontra a tabela quando abre o banco pela primeira vez.

A tabela `files` possui uma linha para cada uso lógico de um arquivo. Essa frase é importante. Não é uma linha para cada conteúdo físico armazenado e também não é uma tabela que apenas aponta para uma pasta. Uma mesma imagem utilizada como avatar e também dentro de um post pode produzir dois registros distintos, com `contextid`, `component`, `filearea`, `itemid`, `filepath` e `filename` diferentes, enquanto os dois registros compartilham o mesmo `contenthash` e, consequentemente, o mesmo conteúdo físico.

Isso explica por que consultar apenas `contenthash` para descobrir "de quem é o arquivo" não faz sentido. O contenthash responde qual é o conteúdo, não qual é o uso. A identidade lógica está no conjunto de campos que localiza o arquivo dentro de uma file area.

## O que realmente existe em files

Quando você olha a tabela `files`, encontra campos relacionados à identidade lógica, ao conteúdo e a metadados auxiliares. Os que mais aparecem no desenvolvimento de plugins são `contextid`, `component`, `filearea`, `itemid`, `filepath`, `filename`, `contenthash`, `pathnamehash`, `filesize`, `mimetype`, `timecreated`, `timemodified`, `userid`, `author`, `license`, `source`, `sortorder` e informações relacionadas a referências externas.

Não significa que seu plugin deva montar INSERT manual nessa tabela. Quase sempre isso é um erro. O Files API calcula hashes, normaliza caminhos, cria entradas de diretório, trata referências e conversa com o backend físico. O fato de entendermos a tabela é importante para diagnosticar e compreender a arquitetura, não para ignorar `file_storage` e escrever diretamente no banco.

Uma regra prática boa é esta: consultar `{files}` para diagnóstico pode ser útil, mas criar, mover, copiar ou excluir arquivos deve passar pelas APIs próprias. Se você se pega escrevendo `INSERT INTO {files}`, pare e procure primeiro o método correspondente em `file_storage`.

## contenthash

`contenthash` identifica o conteúdo do arquivo. No filesystem padrão, o Moodle calcula SHA1 sobre os bytes e usa esse valor como chave física do objeto. Dois arquivos com exatamente o mesmo conteúdo produzem o mesmo `contenthash`, mesmo que tenham nomes diferentes, pertençam a usuários diferentes e estejam em fileareas completamente distintas.

É daí que vem a deduplicação. Se professor A envia `apostila.pdf` e professor B envia `material.pdf`, mas os dois arquivos possuem bytes idênticos, o File Storage pode criar dois registros lógicos enquanto o File System mantém uma única cópia do conteúdo. Para a aplicação existem dois arquivos, para o storage existe um objeto físico compartilhado.

Não confunda isso com uma função de autorização. Saber o hash não concede direito de acesso e não substitui contexto, capability ou as regras do callback `pluginfile()`. O contenthash é uma identidade do conteúdo dentro da camada de storage, não um token secreto.

## pathnamehash

Se `contenthash` responde "qual conteúdo é este?", `pathnamehash` responde "qual arquivo lógico é este?". O core calcula SHA1 sobre uma string construída a partir de `contextid`, `component`, `filearea`, `itemid`, `filepath` e `filename`. Na implementação atual, a forma é equivalente a `sha1("/$contextid/$component/$filearea/$itemid" . $filepath . $filename)`.

Isso torna o `pathnamehash` uma forma eficiente de localizar uma identidade completa sem precisar comparar cada coluna separadamente. O método `file_storage::get_file()` recebe os campos legíveis, calcula o pathnamehash e internamente consegue localizar o registro correspondente.

Também explica por que alterar manualmente `component`, `filearea`, `filepath` ou `filename` no banco e esquecer de recalcular `pathnamehash` quebra a consistência. Mais uma vez, é exatamente o tipo de problema que desaparece quando você usa a API em vez de editar `{files}` diretamente.

## Deduplicação

A deduplicação do Moodle acontece por conteúdo, não por nome. Essa escolha é muito mais poderosa do que parece porque nomes são metadados de apresentação e podem mudar sem exigir uma nova cópia dos bytes. O professor pode renomear `aula.pdf` para `material-semana-1.pdf` e o `contenthash` continuar exatamente o mesmo.

Na prática isso reduz bastante o custo de cópias internas. Operações como duplicação de conteúdo, áreas de rascunho e reutilização podem criar novas referências lógicas sem necessariamente duplicar os bytes em armazenamento. Em ambientes grandes essa diferença deixa de ser detalhe arquitetural e começa a representar disco, tráfego e tempo de processamento.

Mas deduplicação também é um motivo adicional para nunca tratar o objeto de `filedir` como propriedade exclusiva do seu plugin. Seu registro pode desaparecer e o conteúdo físico permanecer porque outra referência continua usando o mesmo hash, ou o conteúdo físico pode ser removido somente quando nenhuma referência válida continuar dependendo dele.

## contextid

`contextid` conecta o arquivo ao modelo de contextos do Moodle. Uma imagem de perfil normalmente vive em um contexto de usuário, um arquivo de Activity Module costuma viver em `context_module`, enquanto arquivos associados a uma configuração global podem estar em `context_system`. Essa escolha não deve ser feita apenas pelo lugar onde fica mais fácil obter um número, porque contexto influencia autorização, backup, restore e o ciclo de vida daquele conteúdo.

No nosso `mod_biblioteca`, documentos pertencentes a uma instância específica da atividade deveriam normalmente usar o contexto do módulo. Isso significa que, ao duplicar ou restaurar a atividade, o Moodle possui informação suficiente para relacionar aqueles arquivos ao componente correto. Guardar tudo no contexto de sistema porque "fica mais simples" é o equivalente em Files API a usar `context_system` para todas as capabilities: funciona até começar a colidir com o restante da arquitetura.

## component

`component` é o Frankenstyle do componente dono da filearea, por exemplo `mod_biblioteca`, `local_meuplugin`, `block_exemplo` ou `user`. Um componente deve tratar suas próprias fileareas e, se precisar trabalhar com arquivos de outro componente, deve usar a API oferecida por ele em vez de vasculhar diretamente o storage alheio.

Essa regra evita acoplamento invisível. Se `local_relatorio` começa a buscar diretamente arquivos internos de `mod_assign` usando component e filearea que observou no banco, o código passa a depender de detalhes de implementação do Assignment. Pode funcionar hoje e quebrar quando o outro componente alterar sua organização ou suas regras de autorização.

## filearea

`filearea` separa finalidades diferentes dentro do mesmo componente. Um plugin pode ter, por exemplo, `attachment`, `content`, `certificate`, `evidence` e `thumbnail`, cada uma representando um contrato funcional próprio. O nome não é apenas uma pasta bonita e não existe uma tabela separada cadastrando todas as áreas possíveis. Elas surgem implicitamente pelos registros existentes e pelos callbacks que o plugin implementa.

Prefira nomes simples e estáveis, porque filearea costuma aparecer em backup, restore, `pluginfile()`, forms e URLs. Trocar o nome depois de o plugin estar em produção exige migração real dos registros e possivelmente atualização de conteúdo que referencia `@@PLUGINFILE@@`. É uma decisão pequena que ganha peso com o tempo.

## itemid

`itemid` permite que uma mesma filearea tenha subconjuntos independentes. Se o plugin possui um documento por registro da tabela `biblioteca_item`, o `itemid` pode ser o id desse registro. Assim todos os arquivos continuam no mesmo contexto, component e filearea, mas cada objeto da regra de negócio ganha seu próprio recipiente lógico.

Quando existe apenas um conjunto de arquivos por contexto e filearea, usar `0` é comum. Não existe mérito em inventar itemid diferente sem necessidade, mas também não use `0` quando você realmente precisa separar objetos. Se dezenas de registros compartilham a mesma área sem distinção, fica muito mais difícil apagar arquivos de um único registro ou validar propriedade no `pluginfile()`.

## filepath

`filepath` é um caminho virtual e deve começar e terminar com `/`. O caminho raiz é simplesmente `/`, enquanto um arquivo dentro de uma estrutura lógica pode usar algo como `/2018/documentos/`. Isso não quer dizer que exista uma pasta física `2018/documentos` dentro de `filedir`. O caminho pertence à identidade lógica do arquivo.

Diretórios também são representados dentro do Files API, e registros cujo `filename` é `.` representam diretórios. Normalmente você não precisa criar esses registros manualmente, pois o storage cuida disso conforme os arquivos são adicionados.

## filename

`filename` é o nome que faz sentido para a aplicação e para o usuário, não o nome do objeto físico. Ele pode conter Unicode e ser completamente diferente do hash usado no storage. Essa abstração permite que o File System continue simples e previsível enquanto a camada lógica mantém nomes amigáveis.

Ao receber nomes externos, continue usando as APIs e validações apropriadas. Não pegue um filename de request e concatene em caminho de disco, porque aí você abandona justamente as garantias que o Files API oferece e reabre problemas de path traversal e inconsistência entre metadados e conteúdo.

## File areas

Uma file area pode ser entendida como um bucket virtual identificado principalmente por `contextid`, `component`, `filearea` e `itemid`. Dentro desse bucket existem `filepath` e `filename`, formando a estrutura que o usuário percebe. Essa imagem mental é muito melhor do que pensar em diretórios físicos, porque continua válida mesmo quando não existe disco local algum.

No `mod_biblioteca`, por exemplo, poderíamos ter `contextid=381`, `component=mod_biblioteca`, `filearea=document`, `itemid=72`, `filepath=/` e `filename=contrato.pdf`. O arquivo físico pode estar em `moodledata/filedir`, S3, DigitalOcean Spaces ou outro backend. Para o plugin, a identidade continua a mesma.

## get_file_storage()

`get_file_storage()` entrega a instância de `file_storage`, que é a porta de entrada para a maior parte das operações de baixo nível. Você usa esse objeto para criar arquivos, localizar arquivos, listar áreas, copiar conteúdos e remover registros sem conhecer onde os bytes estão guardados.

É exatamente por isso que vale desconfiar de código que pula essa camada. Se o objetivo é manipular um arquivo que pertence ao conteúdo do Moodle e a primeira coisa que aparece é `$CFG->dataroot . '/filedir/'`, normalmente a arquitetura já começou errada.

```php
$fs = get_file_storage();

$file = $fs->get_file(
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    '/',
    'contrato.pdf'
);
```

## stored_file

Os métodos de leitura do File Storage devolvem objetos `stored_file`. Pense nele como a representação de um arquivo lógico já conhecido pelo Moodle. O objeto expõe metadados como filename, filepath, mimetype, tamanho, contextid, component, filearea, itemid, contenthash e também operações como leitura de conteúdo, cópia, exclusão e obtenção de handles.

O `stored_file` é uma abstração especialmente importante em backend alternativo. Seu código pode chamar `$file->get_content()` ou entregar o objeto para `send_stored_file()` sem saber se o backend está lendo um arquivo local, recuperando um objeto remoto ou utilizando outra estratégia. Essa ignorância é uma qualidade arquitetural, não uma limitação.

## create_file_from_string()

Quando o conteúdo nasce dentro do próprio plugin, `create_file_from_string()` é uma forma natural de colocá-lo no File Storage. Um relatório gerado em CSV, um JSON de exportação ou um texto produzido pelo sistema podem ser salvos sem criar primeiro um arquivo temporário só para depois importá-lo.

O ponto importante é preparar corretamente o `filerecord`. Os campos que identificam a filearea não são detalhes decorativos. Eles determinam onde o arquivo existirá logicamente e como será recuperado depois.

```php
$fs = get_file_storage();

$filerecord = [
    'contextid' => $context->id,
    'component' => 'mod_biblioteca',
    'filearea' => 'export',
    'itemid' => $item->id,
    'filepath' => '/',
    'filename' => 'exportacao.csv',
];

$file = $fs->create_file_from_string($filerecord, $csv);
```

## create_file_from_pathname()

`create_file_from_pathname()` é útil quando o conteúdo já existe em um arquivo real, normalmente temporário, criado por outra etapa de processamento. O Files API lê esse pathname, calcula os metadados necessários e incorpora o conteúdo ao storage.

O pathname de origem pode desaparecer depois, porque o arquivo permanente agora pertence ao File Storage. Não use esse método como desculpa para criar uma segunda árvore permanente paralela ao Files API. A pasta temporária é uma etapa de processamento, não o novo lar definitivo do arquivo.

```php
$file = $fs->create_file_from_pathname(
    $filerecord,
    $CFG->tempdir . '/biblioteca/relatorio.pdf'
);
```

## create_file_from_storedfile()

Quando a origem já é outro `stored_file`, use `create_file_from_storedfile()`. Esse método é especialmente interessante porque pode criar uma nova identidade lógica apontando para o mesmo conteúdo sem obrigar seu código a baixar e regravar bytes desnecessariamente.

É comum em cópias internas, clonagem de registros e movimentação entre áreas. Em vez de `$origem->get_content()` seguido de `create_file_from_string()`, deixe o File Storage fazer a operação no nível correto.

```php
$novo = $fs->create_file_from_storedfile(
    [
        'contextid' => $context->id,
        'component' => 'mod_biblioteca',
        'filearea' => 'archive',
        'itemid' => $item->id,
        'filepath' => '/',
        'filename' => $origem->get_filename(),
    ],
    $origem
);
```

## get_file()

`get_file()` é a busca direta pela identidade lógica completa. Você informa contexto, componente, filearea, itemid, filepath e filename, e recebe um `stored_file` ou `false`. É o método que normalmente aparece dentro de callbacks `pluginfile()` depois que o plugin já validou qual registro o usuário pode acessar.

Repare que essa API obriga o código a ser explícito. Isso é bom. Uma consulta que só recebe filename seria ambígua demais, enquanto o conjunto completo liga o arquivo ao objeto correto e reduz a chance de servir conteúdo de outra área por acidente.

## get_area_files()

`get_area_files()` devolve os arquivos de uma filearea e pode limitar pelo itemid. É útil quando você precisa montar uma listagem, verificar se determinada área possui conteúdo ou processar os arquivos de um registro.

Existe um detalhe que costuma pegar quem está começando: o método pode incluir registros de diretório, portanto em vários casos você vai passar `false` em `includedirs` quando deseja somente arquivos. Também pense em volume. Buscar milhares de `stored_file` de uma vez só para descobrir se existe pelo menos um é desperdício. Use a API mais adequada para a pergunta que você realmente precisa responder.

```php
$files = $fs->get_area_files(
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    'filename ASC',
    false
);
```

## Diretórios virtuais

Pastas apresentadas no filemanager não correspondem necessariamente a diretórios físicos. Elas fazem parte do namespace lógico definido por `filepath`. Isso permite que a mesma organização continue funcionando em um backend que nem sequer possui conceito de pasta da mesma maneira que um filesystem POSIX.

Essa é outra razão para não chamar `is_dir()` ou `scandir()` em `filedir`. Você estaria olhando a organização física do pool, que foi criada para o storage, enquanto o usuário e o plugin trabalham com uma hierarquia lógica completamente diferente.

## Filepicker

O `filepicker` é adequado quando o formulário precisa receber um arquivo de forma pontual. Ele integra a seleção com os repositories disponíveis no Moodle e coloca o arquivo na draft area do usuário. O arquivo ainda não está na filearea permanente do seu plugin nesse momento.

Essa diferença entre selecionar e salvar é fundamental. O componente de formulário cuida da experiência de upload, mas a sua regra de negócio continua responsável por mover ou salvar o conteúdo da draft area para o destino definitivo no momento certo.

## Filemanager

O `filemanager` trabalha melhor quando o usuário precisa administrar um conjunto de arquivos, inclusive adicionando, removendo e reorganizando conteúdo. Assim como no filepicker, a edição acontece sobre uma draft area e só depois é consolidada na área permanente.

em Forms API vimos os elementos de formulário. Aqui a parte importante é entender o que existe por trás deles. Quando você abre um registro já salvo para edição, o Moodle não entrega a filearea permanente diretamente para o navegador modificar. Ele prepara uma cópia lógica em uma área de rascunho do usuário, o usuário trabalha ali e, no submit, o conjunto resultante é sincronizado de volta.

## Draft areas

Draft area é uma filearea temporária no componente `user`, normalmente no contexto do usuário, usada enquanto ele está editando conteúdo. Cada rascunho recebe um `itemid` que identifica aquele conjunto temporário. Isso resolve problemas importantes porque o usuário pode adicionar e remover arquivos antes de confirmar a alteração sem mexer imediatamente no conteúdo oficial.

Também melhora segurança e isolamento. Um arquivo enviado durante a edição não deveria aparecer automaticamente para outros usuários antes de o registro ser salvo e antes de as regras de negócio validarem a operação. Enquanto está em draft, o conteúdo pertence ao fluxo de edição daquele usuário.

Não trate draft como armazenamento permanente. Áreas temporárias são limpas pelo Moodle e fazem parte de um ciclo de edição. Se o seu plugin salva apenas o draftitemid no banco e nunca chama a etapa de consolidação, mais cedo ou mais tarde você vai descobrir que persistiu uma referência para algo que não era permanente.

## file_prepare_draft_area()

Ao editar um registro existente, você normalmente precisa copiar os arquivos permanentes para uma draft area. `file_prepare_draft_area()` faz esse trabalho e também participa da reescrita de URLs quando estamos lidando com conteúdo de editor.

O fluxo típico começa obtendo um draftitemid, preparando a área com os arquivos existentes e colocando esse id no campo que será usado pelo form. O usuário vê uma cópia editável do estado atual, não o storage permanente sendo manipulado diretamente.

```php
$draftitemid = file_get_submitted_draft_itemid('documents');

file_prepare_draft_area(
    $draftitemid,
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    [
        'subdirs' => false,
        'maxfiles' => 20,
    ]
);

$item->documents = $draftitemid;
```

## file_save_draft_area_files()

Depois do submit validado, `file_save_draft_area_files()` leva o conjunto final da draft area para a filearea permanente. Isso inclui arquivos novos, arquivos removidos e alterações feitas pelo usuário dentro das regras configuradas para aquela área.

A ordem da sua regra de negócio importa. Em muitos casos você precisa primeiro inserir o registro no banco para descobrir o `itemid` permanente e só então salvar os arquivos. É por isso que formulários com filemanager frequentemente possuem uma pequena diferença entre fluxo de criação e fluxo de edição.

```php
file_save_draft_area_files(
    $data->documents,
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    [
        'subdirs' => false,
        'maxfiles' => 20,
    ]
);
```

## Editor e @@PLUGINFILE@@

Editor HTML traz um problema a mais porque o texto salvo no banco pode conter imagens e outros arquivos embutidos. Guardar a URL absoluta completa do site seria péssimo para backup, restore, mudança de domínio e cópia entre ambientes. O Moodle resolve isso armazenando referências relativas que começam com `@@PLUGINFILE@@`.

Imagine que o professor insere uma imagem dentro da descrição. Durante a edição ele precisa de uma URL real de `draftfile.php` para enxergar a imagem, mas quando o conteúdo é persistido o endereço é transformado em algo como `@@PLUGINFILE@@/diagramas/fluxo.png`. Esse texto pode viajar para outro domínio sem carregar o hostname antigo junto.

Quando o conteúdo será exibido, o placeholder volta a ser uma URL servível de `pluginfile.php`. Essa ida e volta parece trabalhosa até você pensar no que aconteceria se milhares de conteúdos guardassem URLs absolutas e o site mudasse de endereço.

## file_rewrite_pluginfile_urls()

`file_rewrite_pluginfile_urls()` transforma os placeholders de conteúdo armazenado em URLs reais que o navegador pode requisitar. Para isso você informa a base de serviço, o contexto, component, filearea e itemid correspondentes.

Não faça `str_replace('@@PLUGINFILE@@', ...)` manual. O helper conhece as regras de codificação e os formatos de URL utilizados pelo Moodle, além de manter seu código alinhado com o restante do sistema.

```php
$text = file_rewrite_pluginfile_urls(
    $item->description,
    'pluginfile.php',
    $context->id,
    'mod_biblioteca',
    'description',
    $item->id
);
```

## pluginfile.php

`pluginfile.php` é um dos pontos centrais do Files API porque ele impede que arquivos protegidos precisem ficar publicamente acessíveis no web root. O navegador requisita uma URL controlada pelo Moodle, o core interpreta contexto, componente, filearea e argumentos e então delega ao componente responsável a decisão final de servir ou negar o arquivo.

A grande consequência é que o bucket ou disco onde os bytes estão guardados não define sozinho quem pode ler o conteúdo. A autorização pertence à aplicação. Um arquivo privado pode continuar privado porque o callback verifica login, contexto, capability, propriedade, grupos, visibilidade e qualquer regra específica antes de chamar `send_stored_file()`.

## Callback [component]_pluginfile()

Para fileareas próprias de um plugin, o componente normalmente implementa `[component]_pluginfile()` em `lib.php`. Esse é um daqueles callbacks que continuam legitimamente em `lib.php`, porque o core precisa localizá-lo por convenção. O fato de defendermos `lib.php` pequeno em Primeiro Plugin Corretamente não significa esconder callbacks obrigatórios em classes onde o Moodle não vai encontrá-los.

O callback recebe contexto, filearea, argumentos do caminho e outras informações, mas não deve confiar nesses valores apenas porque foram montados por `moodle_url::make_pluginfile_url()`. URL é controlável pelo cliente. Você precisa reconstruir a relação com o registro real e validar acesso de novo.

## Controle de acesso no pluginfile()

O erro mais perigoso em `pluginfile()` é usar a existência do arquivo como autorização. Encontrar um registro em `file_storage` prova que o arquivo existe, não que o usuário atual pode vê-lo. O callback precisa responder primeiro se aquela pessoa pode acessar o objeto da regra de negócio ao qual o itemid se refere.

No nosso exemplo, não basta receber `itemid=72` e buscar a área document 72. Primeiro carregamos o registro 72 do plugin, confirmamos que ele pertence àquela instância da atividade, aplicamos `require_login()` no curso e cm correspondentes e verificamos a capability ou a regra de visibilidade. Só depois buscamos o arquivo.

```php
function mod_biblioteca_pluginfile(
    $course,
    $cm,
    $context,
    string $filearea,
    array $args,
    bool $forcedownload,
    array $options = []
): bool {
    global $DB;

    if ($context->contextlevel !== CONTEXT_MODULE) {
        return false;
    }

    if ($filearea !== 'document') {
        return false;
    }

    require_login($course, true, $cm);
    require_capability('mod/biblioteca:view', $context);

    $itemid = (int) array_shift($args);
    $item = $DB->get_record('biblioteca_item', ['id' => $itemid], '*', MUST_EXIST);

    if ((int) $item->bibliotecaid !== (int) $cm->instance) {
        return false;
    }

    $filename = array_pop($args);
    $filepath = empty($args) ? '/' : '/' . implode('/', $args) . '/';

    $fs = get_file_storage();
    $file = $fs->get_file(
        $context->id,
        'mod_biblioteca',
        'document',
        $itemid,
        $filepath,
        $filename
    );

    if (!$file || $file->is_directory()) {
        return false;
    }

    send_stored_file($file, DAY_SECS, 0, true, $options);
}
```

## send_stored_file()

Depois de todas as verificações, `send_stored_file()` cuida da entrega do conteúdo e de detalhes relacionados a cache, range requests e headers. Evite reinventar streaming com `readfile()` se o arquivo está no Files API. Além de duplicar trabalho do core, você pode quebrar backends alternativos que não possuem pathname local disponível do jeito que seu código imagina.

O parâmetro de forcedownload merece decisão consciente. Conteúdo confiável que precisa ser exibido inline, como uma imagem gerenciada pelo plugin, pode usar comportamento diferente de arquivo enviado por estudante que não deveria ser interpretado pelo navegador no mesmo contexto do site. Segurança de conteúdo não termina quando a capability passou.

## URLs de arquivo

A URL de um arquivo Moodle representa a identidade lógica necessária para chegar ao callback. Por isso você verá contextid, component, filearea, itemid e caminho incorporados na rota de `pluginfile.php`. Isso não significa que a URL revele o caminho físico do objeto, porque essa informação simplesmente não faz parte do contrato público.

Também não confunda URL difícil de adivinhar com autorização. Mesmo que o itemid seja grande ou o filename seja incomum, o callback continua precisando validar o usuário. Segurança por obscuridade em URL protegida costuma durar até alguém abrir o Network do navegador.

## moodle_url::make_pluginfile_url()

Use `moodle_url::make_pluginfile_url()` quando você possui um `stored_file` ou conhece os campos que identificam o arquivo. O helper monta a URL de acordo com as convenções do Moodle e evita concatenação manual com barra, encode e itemid.

Existe inclusive a possibilidade de omitir itemid usando `null` em áreas que não precisam dele, mas essa decisão precisa ser consistente com a forma como o callback interpreta os argumentos. Não altere a estrutura da URL de um lado e espere que o outro adivinhe.

```php
$url = moodle_url::make_pluginfile_url(
    $file->get_contextid(),
    $file->get_component(),
    $file->get_filearea(),
    $file->get_itemid(),
    $file->get_filepath(),
    $file->get_filename(),
    true
);
```

## Arquivos temporários

Nem todo arquivo que aparece durante um processamento precisa entrar no File Storage. Se você está convertendo vídeo, gerando PDF, descompactando um pacote ou preparando uma importação, pode existir uma fase temporária em disco. O importante é não confundir esse artefato intermediário com o arquivo final pertencente ao conteúdo do Moodle.

Use diretórios temporários apropriados, nomes imprevisíveis e limpeza garantida, depois entregue o resultado definitivo ao Files API quando ele realmente fizer parte do conteúdo do site. Em cluster, lembre que `$CFG->tempdir` pode precisar ser compartilhado dependendo do fluxo, enquanto diretórios locais só funcionam quando o mesmo processo ou nó conclui toda a operação.

## trashdir

Quando arquivos deixam de ser referenciados, o Moodle pode movê-los para uma área de lixeira antes da remoção definitiva, de acordo com o funcionamento do filesystem e das tarefas de limpeza. `trashdir` não é uma filearea do seu plugin e não deve ser usado como mecanismo de recuperação de negócio.

Se sua aplicação precisa de lixeira funcional, versionamento ou restauração de documentos pelo usuário, modele isso na regra de negócio. Confiar na existência temporária de conteúdo dentro de `trashdir` é depender de detalhe operacional que pode ser limpo sem considerar a semântica do seu plugin.

## Alternative File Systems

A arquitetura do File System permite trocar a camada física por outra implementação. O plugin continua vendo `file_storage` e `stored_file`, enquanto o backend pode buscar e gravar conteúdo em armazenamento remoto. Essa é uma das melhores provas de que acessar `filedir` diretamente é erro arquitetural: `filedir` pode deixar de ser o lugar onde o conteúdo está.

O mecanismo é configurado antes do bootstrap por meio de `$CFG->alternative_file_system_class`. A classe escolhida implementa a estratégia de storage usada pelo core. A partir desse momento, código bem escrito continua funcionando sem alteração porque nunca assumiu que `stored_file` correspondia a um pathname local.

## Armazenamento local versus object storage

Disco local é simples, rápido e barato em instalações pequenas, principalmente quando existe um único servidor e o volume cabe confortavelmente no storage da máquina. O problema aparece quando o site cresce, entra em cluster ou começa a carregar centenas de gigabytes ou terabytes de conteúdo. Aumentar disco de VM, replicar storage entre nós e planejar recuperação passa a fazer parte da rotina operacional.

Object storage como S3, DigitalOcean Spaces e serviços compatíveis separa capacidade de armazenamento da vida útil do servidor web. Isso facilita escalar espaço, reconstruir nós, usar políticas de durabilidade e, em algumas arquiteturas, entregar determinados conteúdos por CDN ou URLs assinadas. Não é automaticamente mais rápido em qualquer cenário, porque latência, custo de requests e padrões de acesso importam, mas muda completamente a forma de operar uma instalação grande.

Também existe uma diferença entre mover o `dataroot` inteiro para um filesystem de rede e usar um Alternative File System especificamente para o conteúdo do Files API. `cache`, `localcache`, `temp`, sessões e outros diretórios possuem características diferentes e não deveriam ser empurrados todos para object storage como se fossem equivalentes a `filedir`.

## Implementando um Alternative File System no Moodle 3.5

O Moodle 3.5 já permite substituir a implementação física usada pelo Files API por meio de `$CFG->alternative_file_system_class`. Isso não significa que o core entregue um backend S3 pronto, mas fornece o ponto de extensão para uma implementação própria ou um plugin compatível assumir essa responsabilidade.

A configuração acontece no `config.php`, antes de o bootstrap terminar, porque o File System é uma dependência estrutural usada por `file_storage`.

```php
$CFG->alternative_file_system_class = '\local_filestorage\file_system';

require_once(__DIR__ . '/lib/setup.php');
```

A classe configurada precisa respeitar o contrato de `file_system`. A partir daí, componentes comuns continuam chamando `get_file_storage()`, trabalhando com `stored_file` e usando fileareas normalmente; eles não deveriam saber se o conteúdo termina no `filedir`, em storage remoto ou em outra implementação.

Essa separação também deixa claro onde pertencem credenciais, endpoints e detalhes de infraestrutura. Um módulo de atividade não deveria conhecer access key, bucket ou URL de um serviço de object storage, porque essa decisão pertence à implementação do File System, não à regra de negócio da atividade.

### Migração e contenthash

Qualquer migração entre o `filedir` padrão e outro backend precisa respeitar o modelo de `contenthash` do Moodle. A tabela `{files}` contém as identidades lógicas, enquanto o conteúdo físico é deduplicado pelo hash, portanto copiar cada linha como se representasse um arquivo físico independente desperdiça espaço e pode produzir inconsistências.

Em uma migração grande, trabalhe com lotes, registre progresso e valide se os hashes referenciados pelo Moodle realmente existem no destino antes de desativar o backend anterior. Também mantenha estratégia de retorno e backup, porque mudança de armazenamento é operação de infraestrutura, não simples alteração cosmética de configuração.

### Object storage não substitui todo o moodledata

Mesmo quando o pool permanente de arquivos usa um backend remoto, `temp`, `localcache`, sessões e outros diretórios possuem semânticas diferentes. Não empurre todo o `$CFG->dataroot` para object storage apenas porque o Files API aceita uma implementação alternativa. Cada área tem requisitos próprios de latência, compartilhamento, locking e ciclo de vida.

### Custos e limites

Object storage pode facilitar crescimento de capacidade e uso em cluster, mas adiciona latência de rede, custo por operação, eventual egress e dependência do provedor. Muitos arquivos pequenos ou fluxos que leem o mesmo conteúdo repetidamente podem se comportar de forma diferente de um SSD local, portanto a decisão precisa ser medida no ambiente real.

O principal ganho arquitetural continua sendo a transparência: se seu componente usa as APIs oficiais, trocar o backend físico não deveria exigir um `if ($uses3)` espalhado pelo código. Se a troca quebra o plugin, investigue onde ele escapou da abstração e passou a depender do pathname físico.

## Por que seu plugin não deve assumir que o arquivo físico está no disco local

Às vezes a dependência de disco local aparece de maneira disfarçada. O desenvolvedor obtém um `stored_file`, chama alguma função que retorna pathname temporário e passa esse caminho para uma biblioteca externa, ou pior, tenta reconstruir `filedir/aa/bb/hash` manualmente porque conhece a organização padrão. O código funciona no notebook e em um servidor tradicional, então passa despercebido até o primeiro ambiente com Alternative File System.

Quando uma biblioteca exige pathname real, trate isso como uma fronteira de integração. Materialize uma cópia temporária controlada, processe o arquivo e remova o temporário depois. Não transforme uma exigência da biblioteca externa em uma suposição permanente de que o storage inteiro é local.

Esse cuidado também ajuda testes. Um serviço que recebe `stored_file` ou conteúdo abstrato é muito mais fácil de testar do que uma classe cheia de caminhos montados com `$CFG->dataroot`.

## Files API, backup e restore

A ligação entre contexto, component, filearea e itemid é uma das razões pelas quais o Moodle consegue participar de backup e restore de forma consistente. em Backup e Restore nós veremos a anotação de fileareas em detalhes, mas vale guardar desde já que arquivos não vivem isolados da estrutura do componente.

Se você inventa uma pasta própria fora do Files API para guardar documentos de uma atividade, o backup padrão não sabe automaticamente o que fazer com ela. Agora você precisa escrever mecanismos paralelos de cópia, restore, limpeza e migração. A gambiarra de cinco linhas na hora do upload vira dívida em todos os ciclos de vida seguintes.

## Files API e segurança

O Files API não substitui autorização, mas fornece o lugar correto para aplicá-la. O arquivo fica fora do web root, a URL passa por `pluginfile.php` e o componente recebe a oportunidade de decidir se o usuário pode acessar aquele recurso. É uma arquitetura muito melhor do que colocar conteúdo em `/uploads` e tentar proteger com nome aleatório.

Por outro lado, um `pluginfile()` mal implementado destrói essa vantagem. Se o callback apenas monta `get_file()` com argumentos recebidos e envia o resultado, ele pode criar IDOR de arquivos mesmo que a filearea esteja perfeitamente organizada. Contexto e capability precisam ser relacionados ao registro real, exatamente como vimos em Segurança.

## Erros que aparecem em produção

Alguns erros se repetem com tanta frequência que vale reconhecê-los pelo cheiro. O primeiro é gravar upload em pasta própria dentro de moodledata. O segundo é guardar pathname físico no banco. O terceiro é consultar `{files}` e manipular linhas diretamente. O quarto é deixar draftitemid como referência permanente. O quinto é gerar URL de arquivo por concatenação. O sexto é implementar `pluginfile()` sem validar o objeto ao qual o itemid pertence.

Existe ainda um sétimo erro mais traiçoeiro: escrever tudo certo no Files API, mas depois, em uma integração específica, assumir que `$file->get_contenthash()` pode ser transformado em pathname de `filedir`. Esse detalhe acopla o plugin ao backend padrão e normalmente só é descoberto na migração para object storage, quando a instalação já está grande demais para uma correção tranquila.

## Exercício - biblioteca privada de arquivos com controle de acesso

Para fechar o capítulo, crie uma biblioteca privada dentro de um plugin em que cada registro pertença a um curso e possua vários documentos. O formulário deve usar filemanager, preparar arquivos existentes em draft durante a edição e salvar o conjunto definitivo após o submit. Cada registro deve usar seu próprio id como `itemid`, e a filearea pode se chamar `document`.

Depois implemente a listagem usando `get_area_files()` e gere URLs com `moodle_url::make_pluginfile_url()`. O callback `pluginfile()` deve validar o contexto do módulo, login no curso, capability de visualização e, principalmente, confirmar que o itemid recebido pertence à instância atual antes de localizar o `stored_file`. Tente alterar manualmente itemid e filename na URL e confirme que o acesso indevido falha.

Por último, revise o código procurando qualquer referência a `moodledata/filedir`, qualquer pathname salvo no banco e qualquer uso de `file_get_contents()` sobre caminho físico permanente. O exercício só está concluído quando o plugin continua arquiteturalmente correto mesmo que amanhã `$CFG->alternative_file_system_class` passe a apontar para um backend S3.

## O modelo mental que precisa ficar

Depois de trabalhar com Files API por algum tempo, o modelo mental mais útil é simples. O arquivo do Moodle não é um pathname. Ele é uma identidade lógica formada por contexto, componente, área, item, caminho e nome, ligada a um conteúdo identificado por hash e armazenado por um backend que o plugin não precisa conhecer. Quando você pensa assim, `filedir`, S3 e Spaces viram detalhes da infraestrutura, enquanto o código continua operando sobre `file_storage` e `stored_file`.

Essa separação é o que permite ao Moodle deduplicar conteúdo, proteger downloads, mover dados entre ambientes, participar de backup e restore e trocar o backend físico sem reescrever cada plugin. Pode parecer mais trabalhoso do que `move_uploaded_file()` nas primeiras cinquenta linhas, mas é muito menos trabalhoso do que manter durante anos uma segunda infraestrutura de arquivos inventada dentro do seu componente.

Se eu pudesse resumir este capítulo em uma única regra seria esta: quando o arquivo faz parte do conteúdo do Moodle, deixe o Moodle ser dono dele. Use o Files API, descreva corretamente onde aquele arquivo pertence e mantenha seu plugin longe do caminho físico. O dia em que a instalação sair de um servidor único para um cluster ou trocar disco local por object storage é quando essa decisão deixa de parecer preciosismo e começa a parecer óbvia.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
