{% raw %}

# 17 MÓDULOS DE ATIVIDADE

Se existe um tipo de plugin em que o Moodle deixa de parecer um conjunto de páginas PHP e passa a mostrar a arquitetura completa da plataforma, esse tipo é o módulo de atividade. Um `mod` não é apenas um plugin que coloca um item dentro do curso, porque a partir do momento em que a atividade aparece no seletor do professor ela passa a participar de uma série de contratos do Moodle, como contexto próprio, visibilidade, disponibilidade, grupos, calendário, notas, conclusão, arquivos, backup, restauração, duplicação, eventos e navegação. É justamente por isso que um módulo simples pode começar com poucas centenas de linhas e crescer rápido quando passa a conversar corretamente com o restante da plataforma.

É comum o primeiro contato com um `mod` acontecer de forma enganosa. O desenvolvedor cria `mod/minhaatividade`, coloca um `view.php`, grava um registro em uma tabela e vê o link aparecendo dentro do curso, então parece que o trabalho terminou. Na prática, o que foi feito foi apenas a parte visível, porque o Moodle já criou um registro em `course_modules`, colocou esse registro em uma seção do curso, definiu contexto, passou a considerar disponibilidade, passou a expor a atividade para backup e provavelmente abriu espaço para grupos, conclusão e gradebook. Se o plugin ignora essas relações, ele até pode funcionar no cenário de teste, mas começa a apresentar inconsistências quando o professor duplica a atividade, restaura o curso em outro ambiente, muda a seção, ativa grupos ou configura uma condição de conclusão.

Neste capítulo vamos construir a visão de um módulo de atividade a partir dessas relações, sempre separando o que pertence à tabela da atividade, o que pertence ao `course_modules` e o que pertence a outros subsistemas do Moodle. A ideia não é decorar callbacks, mas entender por que cada um existe e qual problema ele resolve.

## 17.1 O que é um módulo de atividade

Um módulo de atividade é um plugin do tipo `mod`, instalado dentro de `mod/` ou, nas instalações Moodle 5.1 em diante com o novo diretório público, dentro da árvore pública correspondente. O nome Frankenstyle segue o formato `mod_nome`, então uma atividade chamada `confidence` será identificada como `mod_confidence` e normalmente terá sua pasta em `mod/confidence`.

O ponto principal é que uma instância de um módulo passa a existir dentro de um curso. Isso parece uma definição simples, mas muda quase tudo em relação a um plugin `local`, porque a instância ganha um `course module`, fica associada a uma seção, pode ser escondida, movida, duplicada, ter restrições de acesso, grupos e conclusão, além de poder participar do gradebook e do calendário. O Moodle não trata a atividade apenas como um registro da tabela do plugin, ele trata a atividade como uma entidade do curso.

Por isso eu gosto de resumir um `mod` da seguinte forma: a tabela do plugin guarda o que é específico da atividade, enquanto o Moodle guarda tudo aquilo que é comum a qualquer atividade. Se você tenta colocar dentro da sua tabela informações que o Moodle já mantém em `course_modules`, `course_sections`, gradebook, completion ou calendar, começa a duplicar estado e cedo ou tarde um lado fica diferente do outro.

## 17.2 Quando um `mod` é a escolha correta

Use um módulo quando o professor realmente precisa adicionar uma instância ao curso e o aluno ou professor precisa interagir com aquela instância como parte da estrutura didática. Um questionário, fórum, livro, tarefa, enquete ou atividade de confiança faz sentido como `mod` porque cada instância pertence a um curso, fica em uma seção, tem nome próprio e pode possuir configuração diferente de outra instância.

O erro aparece quando o desenvolvedor escolhe `mod` apenas porque quer ter uma página acessada pelo aluno. Se a funcionalidade é global, administrativa ou independe de uma instância colocada em uma seção, talvez um `local`, `tool`, `report` ou outro tipo represente melhor o problema. Do outro lado, tentar transformar uma atividade didática em `local` também costuma exigir que o desenvolvedor reconstrua manualmente tudo o que o Moodle já entrega para `mod`, como seletor de atividades, duplicação, disponibilidade e conclusão.

Aqui vale retomar uma distinção que já apareceu no começo do livro. O código específico de uma atividade normalmente só existe porque aquela instância foi criada no curso, mas um plugin `mod` também pode reagir a eventos disparados por outras atividades, desde que isso faça sentido arquiteturalmente e a dependência seja tratada corretamente. O fato de o plugin ser `mod` não significa que o PHP dele só pode rodar quando alguém abre o próprio `view.php`.

## 17.3 Anatomia de um módulo

Uma estrutura real de atividade pode ficar parecida com esta:

```
mod/example/
├── backup/
│   └── moodle2/
├── classes/
│   ├── event/
│   ├── output/
│   └── form/
├── db/
│   ├── access.php
│   ├── install.xml
│   └── upgrade.php
├── lang/
│   ├── en/
│   │   └── example.php
│   └── pt_br/
│       └── example.php
├── pix/
│   └── icon.svg
├── templates/
├── index.php
├── lib.php
├── mod_form.php
├── version.php
└── view.php
```

Essa estrutura não é uma lista de arquivos obrigatórios para todo módulo, porque o conteúdo exato depende das funcionalidades utilizadas, mas há alguns pontos que praticamente definem o tipo. `lib.php` contém os callbacks esperados pelo core, `mod_form.php` ou sua variante em `classes/mod_form.php` define o formulário de criação e edição, `view.php` é a entrada padrão da instância, a tabela principal guarda os dados específicos da atividade e `db/access.php` normalmente define pelo menos as capabilities de adicionar e visualizar a atividade.

Quando o módulo cresce, aparecem arquivos de backup, classes de evento, output, formulários adicionais, tasks, Web Services e outras partes que já estudamos. O importante é que essas partes continuam obedecendo às mesmas APIs, a atividade não ganha autorização para inventar uma arquitetura paralela só porque é um `mod`.

## 17.4 A tabela principal do módulo

O Moodle exige que o módulo tenha uma tabela principal com o mesmo nome curto da atividade. Se o plugin é `mod_confidence`, a tabela principal é `{confidence}`. Essa tabela representa a instância e é nela que normalmente ficam as configurações próprias daquela atividade.

Os campos básicos esperados são `id`, `course`, `name`, `timemodified`, `intro` e `introformat`. O campo `id` é a chave primária, `course` referencia o curso, `name` guarda o nome informado pelo professor, `timemodified` registra a última alteração da instância, enquanto `intro` e `introformat` formam o par padrão utilizado para a descrição da atividade quando o módulo declara suporte a `FEATURE_MOD_INTRO`.

Um schema inicial poderia ser imaginado assim:

```
example
    id
    course
    name
    intro
    introformat
    timemodified
    allowchange
    showresults
```

Os dois últimos campos seriam específicos do nosso exemplo. É exatamente essa separação que interessa, porque `course` e `name` participam do contrato do módulo, enquanto `allowchange` e `showresults` representam comportamento exclusivo da atividade.

## 17.5 O campo `course`

`course` guarda o ID do curso ao qual a instância pertence, mas isso não significa que esse campo substitui `course_modules.course`. Os dois registros existem em níveis diferentes da arquitetura e o core cuida da associação entre eles durante criação, atualização, duplicação e restauração.

No código da atividade, o valor continua sendo útil para consultas e validações, mas quando você já possui `$cm` e `$course`, não faz sentido buscar tudo novamente apenas porque existe um `course` na tabela do plugin. Esse é um daqueles detalhes pequenos que, repetidos em milhares de requisições, viram consultas desnecessárias.

## 17.6 O campo `name`

`name` é o nome da instância que aparece na página do curso e em diferentes interfaces do Moodle. Ele deve ser tratado como conteúdo fornecido pelo usuário, então na saída normalmente passa por `format_string()` dentro do contexto apropriado.

É tentador criar outro campo como `title` e começar a decidir em cada página se mostra `name` ou `title`, mas isso só é justificável se forem conceitos realmente diferentes. Se é apenas o nome da atividade, use o campo esperado pelo Moodle.

## 17.7 `intro` e `introformat`

`intro` não é apenas um textarea qualquer. Ele normalmente recebe conteúdo de editor e por isso precisa caminhar junto de `introformat`, permitindo que o Moodle saiba como aquele conteúdo deve ser processado. Quando o módulo declara `FEATURE_MOD_INTRO`, o formulário padrão consegue integrar a descrição ao comportamento normal das atividades e, dependendo das opções suportadas, o professor pode inclusive decidir se a descrição aparece na página do curso.

Na saída, não faça `echo $instance->intro`. O correto é usar as APIs de formatação, porque o texto pode possuir filtros, arquivos embutidos, regras de segurança e formato associado.

## 17.8 `timemodified`

`timemodified` costuma ser atualizado no `add_instance()` e no `update_instance()`. Não tente transformar esse campo em um histórico, porque ele representa apenas o momento mais recente de alteração daquela instância. Se o plugin precisa de auditoria, crie eventos adequados ou uma estrutura específica, mas não sobrecarregue um timestamp simples com responsabilidades que ele não possui.

## 17.9 A relação entre a tabela do plugin e `course_modules`

Esse é um dos pontos mais importantes do capítulo. Quando o professor cria uma atividade, o Moodle não grava apenas `{example}`. Ele também mantém um registro em `{course_modules}`, e esse registro é o elo entre a instância do plugin e a estrutura do curso.

Pense assim:

```
course_modules.id = CMID
course_modules.course = curso
course_modules.module = tipo do módulo
course_modules.instance = example.id
course_modules.section = seção do curso
```

O `id` recebido em `view.php` normalmente é o `cmid`, não o ID da tabela `{example}`. Essa distinção explica uma quantidade enorme de bugs em módulos iniciantes, porque o desenvolvedor recebe `id=37`, consulta `{example}` com `id=37` e por acaso funciona no ambiente de desenvolvimento enquanto os IDs coincidem, até o dia em que deixam de coincidir.

## 17.10 `course_module`, `course_modules` e `cm_info`

O nome parecido das estruturas ajuda a confundir. `{course_modules}` é a tabela persistida no banco, enquanto `cm_info` é a representação otimizada que o Moodle utiliza ao trabalhar com informações das atividades dentro do curso. Em código moderno, quando você precisa navegar pelas atividades do curso, visibilidade, disponibilidade ou metadados utilizados na renderização, frequentemente trabalhar com `get_fast_modinfo()` e objetos `cm_info` é mais adequado do que consultar `{course_modules}` manualmente.

Isso é importante porque `cm_info` não representa apenas colunas da tabela. Ele reúne estado calculado, cache e informações de outros subsistemas. Se o seu código faz uma consulta SQL enorme para reconstruir algo que `get_fast_modinfo()` já entrega, é bom parar e verificar se não está duplicando lógica do core.

## 17.11 O `lib.php` de uma atividade é especial

No Capítulo 3 nós insistimos que `lib.php` deve ser pequeno, e aqui a regra continua valendo, embora módulos ainda dependam de vários callbacks globais que o core chama pelo nome. A documentação atual trata `lib.php` como uma ponte legada entre o core e o plugin, então o objetivo não é colocar a aplicação inteira ali, mas apenas implementar os callbacks esperados e encaminhar o trabalho para classes quando a lógica crescer.

Um `lib.php` saudável pode ter `example_add_instance()`, `example_update_instance()`, `example_delete_instance()`, `example_supports()` e alguns callbacks específicos das APIs utilizadas. O que ele não deveria virar é uma classe de serviço disfarçada com duas mil linhas de regra de negócio.

## 17.12 Os callbacks obrigatórios

Para um módulo de atividade, três funções são fundamentais:

```php
function example_add_instance($data, $mform = null): int;
function example_update_instance($data, $mform): bool;
function example_delete_instance($id): bool;
```

Esses callbacks formam o ciclo básico da instância. O primeiro cria, o segundo atualiza e o terceiro remove. A simplicidade da assinatura esconde uma responsabilidade grande, porque neles o módulo precisa manter sua tabela e tudo aquilo que estiver diretamente ligado à criação, edição ou exclusão da instância.

## 17.13 `add_instance()`

`example_add_instance()` recebe os dados já processados pelo fluxo padrão do formulário e deve inserir a instância na tabela principal, além de preparar estruturas que dependam da existência daquela instância.

Um exemplo simples seria:

```php
function example_add_instance($data, $mform = null): int {
    global $DB;

    $data->timemodified = time();
    return $DB->insert_record('example', $data);
}
```

Em uma atividade real, talvez seja necessário salvar arquivos de editor, criar item de nota, eventos de calendário ou dados auxiliares. O cuidado é não esconder uma sequência gigantesca dentro do callback. O callback pode coordenar o fluxo e chamar serviços do plugin, mantendo `lib.php` compreensível.

## 17.14 O ID retornado por `add_instance()`

O retorno do callback é o ID do registro da tabela principal da atividade, não o `cmid`. O core utiliza esse valor para fechar a associação em `course_modules.instance`.

Essa diferença precisa estar muito clara, porque no mesmo fluxo você pode ter o campo `coursemodule` recebido em `$data`, o campo `course`, o ID recém-criado da atividade e posteriormente o `cmid`, todos representando coisas diferentes. Nomear variáveis como `$id` para tudo é uma boa forma de produzir bug que demora horas para ser entendido.

## 17.15 `update_instance()` e o campo `instance`

No fluxo de edição, o Moodle disponibiliza o ID da instância em `$data->instance`, por isso é comum converter esse valor para o campo `id` antes de chamar `$DB->update_record()`.

```php
function example_update_instance($data, $mform): bool {
    global $DB;

    $data->id = $data->instance;
    $data->timemodified = time();
    return $DB->update_record('example', $data);
}
```

Esse callback também é o lugar natural para sincronizar estruturas derivadas da configuração, como item de nota e eventos de calendário, mas novamente vale separar coordenação de regra de negócio.

## 17.16 `delete_instance()` não significa apenas apagar uma linha

Quando a atividade é removida do curso, `example_delete_instance()` precisa eliminar os dados pertencentes àquela instância. Se existem tabelas filhas, arquivos próprios, grades internas ou estruturas externas controladas pelo plugin, é aqui que você precisa pensar na limpeza.

```php
function example_delete_instance($id): bool {
    global $DB;

    if (!$instance = $DB->get_record('example', ['id' => $id])) {
        return false;
    }

    $DB->delete_records('example_answers', ['exampleid' => $id]);
    $DB->delete_records('example', ['id' => $id]);

    return true;
}
```

Não saia apagando registros de tabelas do core manualmente. O Moodle cuida das estruturas gerais do course module; o plugin cuida do que pertence ao plugin. Essa fronteira evita exclusões inconsistentes.

## 17.17 `supports()` é o contrato de capacidades técnicas do módulo

`example_supports()` responde ao core quais funcionalidades o módulo sabe integrar. Não confunda isso com capability de usuário. `FEATURE_GROUPS` não diz quem pode usar grupos, diz que o módulo sabe funcionar com grupos. `FEATURE_COMPLETION_TRACKS_VIEWS` não dá permissão para concluir, diz que o módulo entende conclusão baseada em visualização.

Um exemplo moderno pode ficar assim:

```php
function example_supports(string $feature): bool|string|null {
    return match ($feature) {
        FEATURE_GROUPS => true,
        FEATURE_GROUPINGS => true,
        FEATURE_MOD_INTRO => true,
        FEATURE_COMPLETION_TRACKS_VIEWS => true,
        FEATURE_GRADE_HAS_GRADE => true,
        FEATURE_BACKUP_MOODLE2 => true,
        FEATURE_SHOW_DESCRIPTION => true,
        FEATURE_MOD_PURPOSE => MOD_PURPOSE_ASSESSMENT,
        default => null,
    };
}
```

O detalhe do `default => null` é importante. Retornar `false` para algo desconhecido e retornar `null` não têm necessariamente o mesmo significado para todo consumidor, então siga o contrato da feature específica.

## 17.18 `FEATURE_MOD_PURPOSE`

O propósito informa ao Moodle em que categoria a atividade deve aparecer e também participa da apresentação do seletor de atividades. No Moodle 5.1 esse contrato ganhou mais importância, com `FEATURE_MOD_PURPOSE` como propósito principal e `FEATURE_MOD_OTHERPURPOSE` opcional como propósito secundário.

Os propósitos atualmente incluem administração, avaliação, colaboração, comunicação, conteúdo interativo, recursos e outros. Escolher `MOD_PURPOSE_ASSESSMENT` só porque a atividade tem uma nota é simplificar demais. O propósito deveria representar a função principal da atividade no curso, não uma característica secundária.

## 17.19 `FEATURE_MOD_OTHERPURPOSE`

A partir do Moodle 5.1, uma atividade pode declarar um segundo propósito quando isso realmente ajuda a classificá-la. Uma atividade de discussão que também é fortemente orientada a comunicação poderia ter colaboração como propósito principal e comunicação como secundário, por exemplo.

Se o plugin suporta branches anteriores ao 5.1, essa é uma área em que a compatibilidade precisa ser planejada. O Capítulo 29 vai aprofundar estratégias de compatibilidade, mas desde já vale a regra de não copiar uma constante nova para código que promete rodar em uma versão onde ela não existe sem qualquer proteção.

## 17.20 Outras `FEATURE_*`

Algumas features frequentes em módulos são `FEATURE_GROUPS`, `FEATURE_GROUPINGS`, `FEATURE_MOD_INTRO`, `FEATURE_SHOW_DESCRIPTION`, `FEATURE_COMPLETION_TRACKS_VIEWS`, `FEATURE_COMPLETION_HAS_RULES`, `FEATURE_GRADE_HAS_GRADE`, `FEATURE_GRADE_OUTCOMES`, `FEATURE_BACKUP_MOODLE2` e `FEATURE_QUICKCREATE`.

Não declare suporte só para fazer a opção aparecer na interface. Quando você retorna `true`, está dizendo ao core que o módulo implementa o comportamento esperado. Se declara grupos e depois ignora completamente o group mode na listagem de dados, a interface promete uma coisa e a regra de acesso entrega outra.

## 17.21 O formulário da atividade

O formulário de criação e edição de uma atividade é um caso especial da Forms API estudada no Capítulo 7. A classe precisa se chamar `mod_example_mod_form` e estender `moodleform_mod`.

Historicamente essa classe ficava em `mod/example/mod_form.php`, e esse caminho continua sendo amplamente utilizado. A documentação atual também permite, nas condições suportadas pelo core, localizar a classe em `mod/example/classes/mod_form.php`, mas o nome da classe continua obedecendo ao contrato histórico `mod_[modname]_mod_form`.

Esse é um bom exemplo de transição gradual do Moodle. Nem tudo que é antigo pode simplesmente ser renomeado para um namespace moderno, porque o core ainda precisa descobrir a classe por convenção durante o fluxo de edição da atividade.

## 17.22 `moodleform_mod`

`moodleform_mod` especializa `moodleform` para o contexto de atividades. Ela não serve apenas para ganhar dois botões padrão, porque integra o formulário a elementos que pertencem ao course module, como disponibilidade, grupos, conclusão, tags e outros recursos habilitados no site.

Por isso criar um formulário comum e tentar recriar manualmente essas opções seria um retrocesso. Quando a tela é realmente o formulário de configuração da atividade, use `moodleform_mod`.

## 17.23 `definition()`

A estrutura continua parecida com outros formulários Moodle:

```php
class mod_example_mod_form extends moodleform_mod {
    public function definition(): void {
        $mform = $this->_form;

        $mform->addElement('text', 'name', get_string('name'), ['size' => 64]);
        $mform->setType('name', PARAM_TEXT);
        $mform->addRule('name', null, 'required', null, 'client');

        $this->standard_intro_elements();
        $this->standard_coursemodule_elements();
        $this->add_action_buttons();
    }
}
```

O ponto importante é a ordem. Primeiro entram os campos específicos do módulo e os elementos de introdução quando utilizados, depois os elementos padrão do course module e por fim as ações. Isso preserva a experiência que o professor já conhece de outras atividades.

## 17.24 `standard_intro_elements()`

Quando o módulo utiliza `intro` e `introformat`, essa função evita que cada atividade reconstrua o mesmo editor manualmente. Além da consistência visual, você reduz a chance de esquecer detalhes de processamento e arquivos associados ao editor.

Se a atividade não usa introdução, não adicione os campos apenas porque aparecem em quase todos os exemplos. Primeiro decida o contrato do módulo, depois declare as features coerentes e então construa o formulário.

## 17.25 `standard_coursemodule_elements()`

Essa chamada injeta os elementos padrão que pertencem ao relacionamento da atividade com o curso. É aí que aparecem recursos como disponibilidade, grupos, conclusão e outros controles conforme a configuração do site e o suporte declarado pelo módulo.

O desenvolvedor não deveria duplicar campos de `visible`, `groupmode` ou disponibilidade dentro da tabela principal só porque quer exibi-los no form. O core já possui lugar e fluxo para essas informações.

## 17.26 `add_action_buttons()`

Os botões de salvar e cancelar parecem a parte menos interessante do formulário, mas até eles participam do comportamento esperado pelo Moodle. Evite inventar um rodapé completamente diferente para um formulário que deveria seguir o fluxo padrão de edição de atividade.

Interfaces especiais podem existir, mas o formulário principal de criação e edição ganha muito quando parece e se comporta como o resto da plataforma.

## 17.27 `defaults_preprocessing()`

Quando os dados persistidos não correspondem exatamente ao formato esperado por um elemento do formulário, `defaults_preprocessing()` permite ajustar os valores antes de preencher a edição.

Isso evita uma gambiarra comum de mudar o formato salvo no banco apenas para facilitar a interface. Persistência e representação de formulário não precisam ser idênticas, desde que a conversão seja explícita e previsível.

## 17.28 O que não colocar em `mod_form.php`

Evite consultas pesadas, chamadas externas, mutações de dados e regras de negócio extensas dentro da definição do formulário. O formulário pode precisar carregar opções, mas isso não autoriza transformar `definition()` em um serviço de integração.

Lembre do custo operacional: toda vez que o professor abre a edição da atividade, esse código roda. Se para construir um select você chama uma API externa sem cache e sem timeout adequado, a tela de configuração inteira passa a depender daquele serviço.

## 17.29 `view.php`

`view.php` é a entrada padrão para visualizar uma instância. O parâmetro convencional `id` é o `cmid`, e a partir dele você obtém curso, course module e registro específico da atividade.

Uma base moderna pode começar assim:

```php
require('../../config.php');

$id = required_param('id', PARAM_INT);

[$course, $cm] = get_course_and_cm_from_cmid($id, 'example');
$instance = $DB->get_record('example', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

Esse fluxo é muito melhor do que receber um ID da instância e depois tentar descobrir manualmente curso e contexto. O `cmid` é justamente a chave que conecta a página à estrutura do curso.

## 17.30 `require_login($course, true, $cm)`

Passar o course module para `require_login()` permite que o Moodle aplique verificações ligadas ao acesso à atividade, incluindo disponibilidade. Isso é relevante porque uma atividade pode estar visível no curso, mas ainda indisponível para aquele usuário por causa de data, nota, conclusão de outra atividade ou combinação de condições.

Recriar essas condições manualmente em `view.php` seria uma péssima ideia. Deixe o core aplicar aquilo que pertence ao core e trate apenas as regras adicionais do plugin.

## 17.31 Contexto de módulo

Cada instância possui um `context_module`. Capabilities que controlam ações internas da atividade normalmente devem ser verificadas nesse contexto.

```php
$context = context_module::instance($cm->id);
require_capability('mod/example:view', $context);
```

Não use `context_course` só porque a atividade pertence ao curso. Se a permissão é sobre aquela instância, o contexto mais específico geralmente é o módulo. Isso permite overrides de permissionamento em uma atividade sem alterar todas as outras.

## 17.32 `$PAGE` dentro da atividade

Depois de resolver curso, course module e contexto, configure a página com a URL correta, título e heading. Evite montar HTML antes de preparar o contexto da página, porque navegação, tema, breadcrumb e várias integrações dependem desse estado.

```php
$PAGE->set_url(new moodle_url('/mod/example/view.php', ['id' => $cm->id]));
$PAGE->set_title(format_string($instance->name));
$PAGE->set_heading(format_string($course->fullname));
```

A partir daí, use Output API e Mustache como estudamos no Capítulo 6, sem criar `renderer.php` apenas para repassar um template.

## 17.33 Marcar visualização para conclusão

Se o módulo declara `FEATURE_COMPLETION_TRACKS_VIEWS`, uma visualização válida deve informar isso ao sistema de completion.

```php
$completion = new completion_info($course);
$completion->set_module_viewed($cm);
```

A documentação recomenda fazer isso antes de imprimir o cabeçalho para que mudanças de disponibilidade dependentes daquela conclusão possam refletir corretamente na mesma navegação. Não marque visualização antes de validar acesso, porque uma tentativa negada de abrir a atividade não deveria virar conclusão.

## 17.34 Evento `course_module_viewed`

Além de completion, uma atividade normalmente dispara evento de visualização. O evento serve para log, analytics e integrações que observam o que aconteceu.

Não confunda marcar completion com disparar evento. São subsistemas diferentes e podem ser necessários ao mesmo tempo. O evento registra o fato, enquanto completion altera o estado de progresso segundo as regras configuradas.

## 17.35 `index.php`

Historicamente cada módulo implementava uma página listando todas as instâncias daquele tipo dentro de um curso. Desde Moodle 5.0, o core oferece uma visão consolidada de atividades e activityoverviewbase::redirect_to_overview_page() para que mod/example/index.php leve o usuário a essa página, portanto o index.php antigo deixa de ser o lugar em que cada módulo precisa reinventar sua própria listagem.

Isso é um bom exemplo de API que mudou com o tempo. Se você encontra um plugin antigo com uma tabela enorme em `index.php`, não presuma que precisa copiar o padrão. Verifique o comportamento atual do core e a versão mínima que o plugin suporta.

### 17.35.1 Activity Overview é uma integração do módulo, não apenas um redirect

Redirecionar index.php resolve a navegação, mas um módulo Moodle 5.0 pode participar de verdade da nova página Activities oferecendo dados próprios. Para isso existe a classe mod_PLUGINNAME\courseformat\overview, localizada em classes/courseformat/overview.php e derivada de \core_courseformat\activityoverviewbase.

Mesmo sem implementar campos extras, a classe base já permite que o core apresente informações comuns, como nome e completion quando aplicável. O plugin só deve acrescentar o que pertence ao seu domínio, como prazo, estado de submissão ou uma ação principal.

### 17.35.2 Estrutura mínima de classes/courseformat/overview.php

```
namespace mod_example\courseformat;

use core_courseformat\activityoverviewbase;

final class overview extends activityoverviewbase {
    // O core já fornece itens básicos; sobrescreva apenas o que o módulo precisa.
}
```

Não confunda essa classe com renderer de página. Ela é uma integração do activity module com o course format e entrega objetos de overview que o core pode apresentar, filtrar e reutilizar em outros contextos.

### 17.35.3 get_extra_overview_items()

Informações específicas entram por get_extra_overview_items(), que devolve um array de overviewitem indexado por shortname. O value participa de filtros e metadata, enquanto content é o conteúdo apresentado; quando a informação não se aplica ao usuário atual, retornar null é melhor do que expor uma coluna inútil ou calcular dados caros para todo mundo.

```php
use core_courseformat\local\overview\overviewitem;

#[\Override]
public function get_extra_overview_items(): array {
    return [
        'submitted' => new overviewitem(
            name: get_string('submitted', 'mod_example'),
            value: $this->has_submission(),
            content: $this->has_submission() ? get_string('yes') : get_string('no'),
        ),
    ];
}
```

### 17.35.4 Prazo e ação principal

A página possui pontos específicos para prazo e ação principal. Se o módulo tem data limite, implemente get_due_date_overview(); se existe uma ação útil, como abrir entregas pendentes ou responder a atividade, implemente get_actions_overview(). Isso evita jogar tudo em colunas genéricas e permite que o core reconheça semanticamente o papel daquele dado.

Não calcule prazo ou ação consultando tabelas de outros módulos manualmente. A overview class pertence ao próprio componente e deve usar as APIs internas dele, respeitando contexto e capabilities da mesma forma que uma página normal.

### 17.35.5 Dependency Injection dentro da Activity Overview

Um detalhe especialmente interessante do Moodle 5.0 é que a classe overview é carregada com Dependency Injection. O construtor precisa preservar cm_info esperado pela base, mas pode receber outras dependências, como moodle_database, um serviço do plugin ou \core\clock. Isso permite calcular prazo e estado sem voltar a esconder globais dentro da integração.

```php
public function __construct(
    \cm_info $cm,
    private readonly \moodle_database $db,
    private readonly \core\clock $clock,
) {
    parent::__construct($cm);
}
```

Aqui aparece na prática o motivo de Dependency Injection ter sido apresentada no Capítulo 4 antes de Hooks e módulos. A API não está adicionando cerimônia; está permitindo que um ponto de integração do core receba dependências testáveis sem transformar cada método em uma coleção de globals.

## 17.36 Seções do curso

Uma atividade pertence a uma seção do curso, mas a seção não é propriedade da tabela da atividade. A relação fica em `course_modules` e `course_sections`, gerenciada pelo subsistema de curso e pelo course format.

Se você precisa descobrir onde a atividade está, mover ou reorganizar módulos, use as APIs de curso apropriadas em vez de atualizar `course_modules.section` diretamente. Alterações manuais podem deixar caches e sequência de seções inconsistentes.

## 17.37 O seletor de atividades

Quando o professor ativa edição e pede para adicionar uma atividade ou recurso, o seu módulo entra no activity chooser. O nome, ícone, capabilities e propósito influenciam essa experiência.

A capability `mod/example:addinstance` controla quem pode criar a atividade, enquanto `FEATURE_MOD_PURPOSE` ajuda o Moodle a classificá-la. Em Moodle 5.1, o activity chooser também foi refatorado internamente e passou a utilizar novos atributos na renderização dos course formats, o que reforça um ponto importante: plugins de atividade deveriam depender do contrato público do chooser, não de detalhes de HTML do tema ou do formato.

## 17.38 Ícone da atividade

O módulo deve fornecer um ícone adequado, normalmente em `pix/icon.svg`. O Moodle aplica tratamento visual conforme o contexto e o propósito da atividade.

Não coloque texto dentro do ícone, não dependa de tamanho fixo e não tente simular cor final no próprio SVG se o core espera trabalhar com ícone compatível com o sistema visual. Também lembre que a cor de categoria do chooser não é uma decisão livre do SVG, pois o propósito declarado participa dessa apresentação.

## 17.39 Capabilities mínimas

Duas capabilities aparecem em praticamente todo módulo:

```
'mod/example:addinstance'
'mod/example:view'
```

`addinstance` normalmente usa `CONTEXT_COURSE`, porque a ação é adicionar uma nova atividade ao curso. `view` normalmente usa `CONTEXT_MODULE`, porque a permissão trata de uma instância específica.

Isso não impede capacidades adicionais como `mod/example:manage`, `mod/example:viewreports`, `mod/example:submit` ou `mod/example:grade`. O que importa é modelar ações reais e verificá-las no contexto correto.

## 17.40 Capability não substitui regra de negócio

Voltando ao Capítulo 8, mesmo dentro de um módulo não basta verificar uma capability genérica e assumir que qualquer registro enviado pelo cliente pertence à atividade atual. Se a URL recebe `answerid=900`, carregue a resposta e confirme que ela pertence a `$instance->id`, além de verificar a capability necessária.

Essa validação evita IDOR entre instâncias diferentes do mesmo módulo, que é um erro fácil de produzir quando todos os registros ficam em uma única tabela auxiliar.

## 17.41 Grupos

Se a atividade declara `FEATURE_GROUPS` ou `FEATURE_GROUPINGS`, a interface padrão permite configurar group mode e grouping. A partir daí, o plugin precisa respeitar essa configuração ao listar e aceitar dados.

```php
$groupmode = groups_get_activity_groupmode($cm);
$currentgroup = groups_get_activity_group($cm, true);
```

Para um professor com `moodle/site:accessallgroups`, o comportamento pode ser diferente do comportamento de um aluno. Em vez de inventar a própria interpretação de membership, use Groups API, porque ela já considera visibilidade e permissões.

## 17.42 No groups, separate groups e visible groups

`NOGROUPS` significa que a atividade não separa participantes por grupos. `SEPARATEGROUPS` normalmente limita interação e visualização ao grupo permitido, enquanto `VISIBLEGROUPS` permite enxergar outros grupos conforme a natureza da atividade.

Não trate visible groups como se fosse separate groups apenas porque a consulta SQL é mais fácil. O plugin precisa definir o comportamento que faça sentido para o recurso, sempre dentro do contrato de visibilidade do Moodle.

## 17.43 `groups_get_activity_allowed_groups()`

Quando você precisa descobrir quais grupos o usuário pode acessar naquela atividade, essa API é muito mais segura do que buscar memberships manualmente e esquecer `accessallgroups`, grouping ou regras de visibilidade.

A regra geral continua a mesma de capítulos anteriores: se a API do core já conhece o contexto, o usuário e a configuração da atividade, use essa API antes de tentar reconstruir tudo via SQL.

## 17.44 Eventos

Módulos são excelentes produtores de eventos porque representam ações didáticas concretas. Visualização, submissão, resposta alterada, avaliação realizada e tentativa finalizada são exemplos de fatos que podem merecer eventos próprios.

Os eventos devem representar algo que já aconteceu. Se você precisa permitir que outro componente interfira antes da operação, isso é discussão para Hook ou outra extensão, não para observer de um evento posterior.

## 17.45 Eventos CRUD da instância

Criação, atualização e exclusão da atividade já participam de fluxos conhecidos do Moodle. Quando criar eventos adicionais, evite duplicar fatos que o core já registra sem motivo.

Por outro lado, ações internas específicas do módulo merecem eventos próprios quando são relevantes para logs, relatórios, analytics ou auditoria. Um `mod_confidence`, por exemplo, poderia disparar evento quando o usuário registra ou altera seu nível de confiança.

## 17.46 Calendário

Se a atividade possui data de abertura, encerramento, entrega ou outro marco que faça sentido para o usuário, Calendar API permite criar eventos vinculados ao módulo.

O erro comum é criar o evento no `add_instance()` e esquecer de atualizá-lo no `update_instance()` ou removê-lo quando a data é desativada. Pense no calendário como estado derivado da configuração da atividade, então criação, edição e exclusão precisam permanecer sincronizadas.

## 17.47 Gradebook

Se a atividade atribui nota, não crie uma tabela própria e espere que o Moodle descubra essa nota. O plugin precisa integrar com Gradebook API e declarar suporte apropriado, normalmente incluindo `FEATURE_GRADE_HAS_GRADE`.

A atividade geralmente implementa callbacks como `example_grade_item_update()` e utiliza `grade_update()` para criar ou atualizar o item de nota. Quando existem notas de usuários, elas também precisam ser enviadas pelo contrato esperado pelo gradebook.

O Capítulo 21 vai aprofundar essa API, mas aqui a regra é simples: a tabela interna da atividade pode guardar detalhes necessários para calcular uma nota, porém a nota oficial visível no Moodle precisa chegar ao gradebook.

## 17.48 Não escrever diretamente em tabelas de notas

Nunca trate `{grade_items}` ou `{grade_grades}` como tabelas comuns do seu plugin. Há regras de cálculo, regrade, bloqueio, overrides e outras relações que você quebraria facilmente com um `update_record()` direto.

Use Gradebook API. Isso pode parecer mais trabalhoso na primeira implementação, mas evita uma categoria inteira de inconsistências que só aparecem quando o professor muda configuração de nota ou recalcula o curso.

## 17.49 Completion

Conclusão de atividade pode ser manual, por visualização, por nota ou por regras específicas do módulo. A atividade declara suporte através de `supports()` e implementa o comportamento correspondente.

Para completion por visualização, vimos `set_module_viewed()`. Para regras customizadas, o plugin precisa expor campos de configuração, informar as regras suportadas e atualizar estado quando o usuário alcança ou perde a condição, conforme o modelo da API.

## 17.50 Completion não é disponibilidade

Completion responde se a atividade foi concluída. Availability responde se o usuário pode acessar determinada atividade ou seção. Uma pode usar a outra como condição, mas são conceitos diferentes.

Isso importa porque muita lógica caseira mistura os dois conceitos em um campo chamado `status`. O Moodle já possui subsistemas específicos, então use cada um para o problema que ele resolve.

## 17.51 Arquivos em módulos

Um módulo pode possuir várias file areas, por exemplo arquivos da descrição, anexos da instância, arquivos enviados por usuários e materiais privados. Cada file area precisa de significado claro, itemid coerente e callback `pluginfile()` quando o conteúdo deve ser servido de forma controlada.

Não crie `uploads/` dentro de `mod/example`. Tudo o que aprendemos no Capítulo 9 continua valendo, inclusive a possibilidade de `filedir` estar em armazenamento alternativo.

## 17.52 `mod_example_pluginfile()`

O callback `pluginfile()` é a fronteira de autorização antes de entregar um arquivo privado do módulo. Um esqueleto poderia começar assim:

```php
function mod_example_pluginfile(
    $course,
    $cm,
    $context,
    $filearea,
    $args,
    $forcedownload,
    array $options = []
) {
    if ($context->contextlevel !== CONTEXT_MODULE) {
        return false;
    }

    require_login($course, true, $cm);
    require_capability('mod/example:view', $context);

    // Validar filearea, itemid e relação com a instância antes de obter o arquivo.
}
```

O mais importante está no comentário. Não use `send_stored_file()` antes de confirmar que aquele `itemid` realmente pertence à instância e que o usuário pode acessar aquele objeto específico.

## 17.53 Arquivos do editor da introdução

Quando `intro` aceita arquivos embutidos, o fluxo do editor precisa mover os arquivos da draft area para a file area definitiva e reescrever `@@PLUGINFILE@@` conforme o padrão das APIs de arquivo e form.

Não transforme o HTML salvo no banco em um conjunto de URLs absolutas para o `moodledata`, porque isso quebra restauração, mudança de domínio e armazenamento alternativo.

## 17.54 Backup e restore não são opcionais em um módulo sério

Tecnicamente você consegue instalar uma atividade sem implementar backup, mas do ponto de vista operacional isso costuma ser inaceitável. Professores esperam que backup de curso, importação, restauração e duplicação funcionem.

Quando o módulo declara `FEATURE_BACKUP_MOODLE2`, está dizendo que implementa esse contrato. Os arquivos ficam em `backup/moodle2/` e descrevem como os dados próprios da atividade entram no backup e como são recriados no destino.

## 17.55 Estrutura do backup da atividade

Uma implementação típica utiliza classes como:

```
backup_example_activity_task.class.php
backup_example_stepslib.php
restore_example_activity_task.class.php
restore_example_stepslib.php
```

A task organiza o trabalho e a step descreve a estrutura dos dados. Em backup, você cria `backup_nested_element`, liga elementos em hierarquia, define fontes e anota IDs ou file areas que precisam de tratamento especial.

Não vamos repetir o Capítulo 24 inteiro aqui, mas você precisa sair deste capítulo entendendo que dados auxiliares da atividade não entram magicamente no `.mbz` apenas porque possuem uma coluna `exampleid`.

## 17.56 IDs não podem ser restaurados como se fossem universais

Se sua tabela guarda `userid`, `groupid`, IDs de arquivos, IDs de outras atividades ou qualquer referência a registros que serão recriados no destino, o restore precisa mapear esses valores.

Copiar o ID antigo literalmente pode apontar para outra pessoa ou outro objeto no novo curso. O mecanismo de mappings do backup/restore existe justamente porque IDs de banco são locais à instalação e ao processo de restauração.

## 17.57 Duplicar atividade depende de backup e restore

Quando o professor usa a ação Duplicar, o Moodle não chama um mágico `clone()` da sua tabela. A duplicação utiliza a infraestrutura de backup e restore da atividade.

Por isso é comum um plugin parecer perfeito até o professor duplicar uma instância e descobrir que só a tabela principal veio, enquanto respostas, configurações filhas ou arquivos desapareceram. Testar duplicação deve fazer parte do checklist de qualquer módulo que armazena mais do que os campos básicos.

## 17.58 Backup sem dados de usuário

Backup de curso pode ser feito com ou sem informações de usuários. O módulo precisa classificar corretamente quais dados pertencem à configuração da atividade e quais são dados dos participantes.

Uma pergunta criada pelo professor pode ser parte da estrutura da atividade, enquanto uma resposta enviada por um estudante é dado de usuário. Se você ignora `$userinfo`, pode exportar dados pessoais quando o backup deveria conter apenas a estrutura.

## 17.59 `index.php`, backup e o ciclo completo

É útil perceber que os arquivos tradicionais de um `mod` não são independentes. `mod_form` cria configuração, `add_instance()` persiste, `view.php` apresenta, Events registram ações, gradebook recebe notas, completion recebe progresso, pluginfile entrega arquivos, Calendar mostra datas e backup transporta o conjunto para outro curso.

A qualidade do módulo aparece quando esses fluxos continuam coerentes depois de edição, duplicação, restauração e exclusão. Se cada parte foi implementada como uma ilha, a primeira operação fora do caminho feliz expõe a inconsistência.

## 17.60 Um projeto de exemplo

Vamos imaginar `mod_checkpoint`, uma atividade curta em que o professor cria um checkpoint com uma pergunta e o aluno registra uma resposta curta, podendo receber uma nota simples. A tabela principal poderia ser:

```
checkpoint
    id
    course
    name
    intro
    introformat
    questiontext
    questionformat
    grade
    timeopen
    timeclose
    timemodified
```

E uma tabela de respostas:

```
checkpoint_answers
    id
    checkpointid
    userid
    answertext
    answerformat
    grade
    timemodified
```

Agora observe quantas decisões surgem sem inventar nenhuma funcionalidade exótica. `checkpointid` precisa ser indexado, a resposta precisa pertencer à instância correta, grupos podem limitar relatórios, a nota precisa ir ao gradebook, datas podem ir ao calendário, respostas são dados de usuário no backup, arquivos embutidos precisam de File API, completion pode depender de envio ou nota e capabilities precisam separar responder de avaliar.

## 17.61 `lib.php` enxuto no projeto

O `lib.php` não precisa implementar tudo isso diretamente. Ele pode coordenar serviços:

```php
function checkpoint_add_instance($data, $mform = null): int {
    return \mod_checkpoint\local\instance_manager::create($data, $mform);
}

function checkpoint_update_instance($data, $mform): bool {
    return \mod_checkpoint\local\instance_manager::update($data, $mform);
}

function checkpoint_delete_instance($id): bool {
    return \mod_checkpoint\local\instance_manager::delete($id);
}
```

A namespace `local` dentro do componente, discutida no Capítulo 4, é adequada para implementação interna que não faz parte da API pública do plugin. Assim o core encontra os callbacks antigos que ainda exige, mas a regra de negócio continua em classes autoloaded.

## 17.62 `view.php` enxuto no projeto

O mesmo vale para `view.php`. Ele resolve request, segurança, contexto e delega a preparação dos dados para classes, depois envia um contexto simples para Mustache.

```php
$id = required_param('id', PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($id, 'checkpoint');
$checkpoint = $DB->get_record('checkpoint', ['id' => $cm->instance], '*', MUST_EXIST);

require_login($course, true, $cm);
$context = context_module::instance($cm->id);
require_capability('mod/checkpoint:view', $context);

$viewmodel = \mod_checkpoint\local\view_factory::for_user(
    $checkpoint,
    $cm,
    $USER->id
);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('mod_checkpoint/view', $viewmodel);
echo $OUTPUT->footer();
```

Note o que não está aqui. Não há cinquenta linhas de SQL, não há HTML concatenado, não há regra de grupo improvisada e não há chamada direta a `renderer.php` apenas para repassar o template.

## 17.63 Erro comum, usar o ID errado

Talvez o bug mais clássico de módulo seja misturar `cmid` com instance id. Evite nomes genéricos e torne a diferença explícita:

```php
$cmid = required_param('id', PARAM_INT);
[$course, $cm] = get_course_and_cm_from_cmid($cmid, 'checkpoint');
$checkpointid = $cm->instance;
```

Quando uma URL interna precisa apontar para `view.php`, normalmente ela usa `id => $cmid`. Quando você consulta a tabela principal, usa `$checkpointid`. Parece detalhe, mas escrever assim economiza muita confusão.

## 17.64 Erro comum, consultar `course_modules` manualmente para tudo

Há momentos em que SQL envolvendo `course_modules` é legítimo, principalmente em relatórios complexos, mas para o fluxo normal de uma atividade existem helpers e `get_fast_modinfo()` que já carregam regras, cache e contexto de uso.

Antes de escrever join com `modules`, `course_modules`, `course_sections` e a tabela do plugin, pergunte se o objetivo não é apenas obter o `$cm` de uma instância conhecida ou percorrer as atividades do curso. Se for, a API normalmente é melhor.

## 17.65 Erro comum, colocar todas as opções na tabela do plugin

Visibilidade, disponibilidade, group mode, grouping, completion e vários outros estados pertencem ao course module e subsistemas associados. Duplicar esses valores na tabela principal cria sincronização desnecessária.

Guarde ali apenas o que é específico da atividade. Essa disciplina deixa backup, edição e integração com o core muito mais previsíveis.

## 17.66 Erro comum, não testar exclusão

Desenvolvedor testa criar e editar porque são ações óbvias, mas esquece apagar. Depois a atividade deixa respostas órfãs, arquivos, eventos de calendário ou dados externos.

Um bom teste de `delete_instance()` cria a instância completa, adiciona dados filhos e arquivos quando aplicável, remove e verifica que o que pertence ao plugin foi limpo sem apagar dados compartilhados indevidamente.

## 17.67 Erro comum, ignorar duplicação

Se o módulo é usado por professores, duplicação não é detalhe. É parte do fluxo normal de autoria. Teste uma instância configurada com todos os recursos relevantes, duplique e confira campos, dados filhos que devem ser duplicados, arquivos, calendário, grade item e completion configuration.

Dados de usuário normalmente não devem aparecer numa duplicação comum de atividade da mesma forma que aparecem em um backup completo com usuários, então a estrutura precisa respeitar o contexto do processo.

## 17.68 Erro comum, usar renderer próprio por hábito

Como vimos no Capítulo 6, um módulo antigo pode possuir `renderer.php` e isso não significa que o arquivo seja proibido. O problema é criar um renderer novo apenas porque um tutorial de Moodle 2.x fazia isso.

Se sua página prepara dados e chama `render_from_template()`, não invente uma classe que apenas recebe o mesmo objeto e chama o mesmo template. Use Output API diretamente ou classes `templatable` quando houver ganho real. Renderer continua existindo no core e em APIs específicas, mas não deveria ser boilerplate automático de um novo módulo.

## 17.69 Erro comum, colocar regra de acesso só no menu

Esconder um botão não protege uma ação. Se o usuário não deveria avaliar, `grade.php`, uma external function ou uma ação AJAX precisa verificar capability e vínculo com a instância, independentemente de o botão estar invisível no Mustache.

A mesma regra vale para arquivos, relatórios e exportações. Segurança fica no servidor e no contexto correto.

## 17.70 Checklist mínimo antes de considerar o módulo pronto

Antes de chamar um módulo de pronto, crie uma instância, edite todos os campos, mova entre seções, esconda e mostre, teste disponibilidade, grupos, permissões, completion, notas quando aplicável, arquivos, exclusão, backup, restauração e duplicação. Depois repita o essencial com um aluno e um professor sem permissão administrativa.

Se o módulo possui JavaScript ou AJAX, teste também com erros de rede e submissão repetida. Se possui integração externa, desligue o serviço e veja como a atividade se comporta. Um `mod` vive dentro de um ecossistema, então o caminho feliz representa apenas uma parte do teste.

## 17.71 Exercício, criar uma atividade completa

Crie `mod_checkpoint` com uma pergunta definida pelo professor e uma resposta curta do aluno. O professor poderá escolher se a atividade vale nota, definir abertura e encerramento, ativar grupos e configurar conclusão por envio. O aluno verá a pergunta em `view.php`, enviará a resposta e poderá editá-la enquanto a atividade estiver aberta.

A implementação deve usar tabela principal com os campos padrão, tabela de respostas com índice em `checkpointid` e unicidade coerente para usuário e instância quando a regra exigir uma única resposta, `db/access.php` com capabilities separadas para visualizar, responder e avaliar, `moodleform_mod` para a configuração da atividade e Forms API para o formulário de resposta.

O módulo deve declarar as `FEATURE_*` realmente suportadas, respeitar group mode, disparar evento quando uma resposta for enviada, criar ou atualizar evento de calendário para a data de fechamento, integrar com Gradebook API se a nota estiver habilitada e atualizar completion quando a resposta válida for registrada.

Os arquivos de backup e restore precisam transportar a configuração e, quando `$userinfo` permitir, as respostas dos usuários. Depois de implementar, faça quatro testes manuais obrigatórios: backup e restore para outro curso, duplicação dentro do mesmo curso, exclusão da atividade com verificação de resíduos e acesso com aluno de um grupo diferente em `SEPARATEGROUPS`.

A parte mais importante do exercício não é ver uma tela funcionando. É conseguir afirmar que a atividade se comporta como uma atividade Moodle quando passa pelos fluxos que o professor já usa no restante da plataforma.

## 17.72 Fechando o capítulo

Módulo de atividade é onde várias decisões que estudamos separadamente começam a se encontrar. Banco, Forms API, Output API, segurança, Files API, Events, calendário, grupos, gradebook, completion e backup deixam de ser capítulos independentes e passam a formar um único objeto didático dentro do curso.

O padrão que vale guardar é simples. A tabela do plugin armazena o que pertence à atividade, `course_modules` e os subsistemas do core armazenam o que pertence ao Moodle, `lib.php` implementa apenas os callbacks que o core ainda exige, classes internas cuidam da regra de negócio e a interface usa APIs modernas sem reconstruir recursos que já existem. Quando essa separação é respeitada, duplicar, restaurar, mover e configurar a atividade deixam de ser surpresas e passam a ser apenas parte do comportamento normal da plataforma.

## Referências técnicas consultadas

* Moodle Developer Resources. Course overview integration, Moodle 5.0. https://moodledev.io/docs/5.0/apis/plugintypes/mod/courseoverview
* Moodle Developer Resources. Moodle 5.0 developer update, Activity overview page integration. https://moodledev.io/docs/5.0/devupdate
* Moodle Developer Resources. Activity modules. Documentação para Moodle 5.1. https://moodledev.io/docs/5.1/apis/plugintypes/mod
* Moodle Developer Resources. Form API usage. Documentação atual da Forms API e uso em Activity Modules. https://moodledev.io/docs/5.2/apis/subsystems/form/usage
* Moodle Developer Resources. Moodle 5.1 developer update. Alterações em Activity Modules, incluindo `FEATURE_MOD_OTHERPURPOSE`. https://moodledev.io/docs/5.1/devupdate
* Moodle Developer Resources. Activity completion API. Documentação da integração de módulos com conclusão. https://moodledev.io/docs/4.5/apis/core/activitycompletion
* Moodle Developer Resources. Groups API. Documentação de group modes e integração com atividades. https://moodledev.io/docs/5.0/apis/subsystems/group
* Moodle Developer Resources. Availability API. Controle de disponibilidade de atividades e seções. https://moodledev.io/docs/5.1/apis/subsystems/availability
* Moodle Developer Resources. Backup API. Estrutura de backup para activity modules. https://moodledev.io/docs/5.2/apis/subsystems/backup
* Moodle Developer Resources. Restore API. Restauração de dados de activity modules. https://moodledev.io/docs/5.0/apis/subsystems/backup/restore

{% endraw %}
