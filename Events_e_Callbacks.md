# EVENTS E CALLBACKS

Se você trabalha com Moodle há algum tempo, provavelmente já abriu um `lib.php` procurando uma função com nome grande e também encontrou um `db/events.php` registrando um observer. No Moodle 3.5 esses são dois mecanismos importantes de extensão, mas eles resolvem problemas diferentes e não devem ser tratados como sinônimos.

Um Event representa algo que aconteceu e permite que outros componentes reajam sem acoplamento direto. Um callback é uma convenção em que o core sabe procurar uma função conhecida no plugin e chamá-la em um ponto específico. Essa diferença é suficiente para decidir grande parte da arquitetura: Event é comunicação de fato ocorrido, enquanto callback é um contrato de extensão definido por quem faz a chamada.

## Diferença entre Event e callback

Uma forma prática de separar os dois é pensar em intenção. Event responde melhor à frase "isso aconteceu". Callback responde à frase "o Moodle sabe que alguns plugins podem implementar esta função e, se ela existir, vai chamá-la". Essa diferença de intenção é mais importante do que a diferença sintática entre `trigger()` e uma função em `lib.php`.

Imagine que uma atividade terminou de salvar uma tentativa. Disparar um Event informando que a tentativa foi submetida faz sentido porque o fato aconteceu e outros componentes podem registrar auditoria ou sincronizar uma integração. Já um callback como `extend_navigation()` existe porque o Moodle definiu uma convenção para que plugins participem da montagem da navegação.

Eventos não devem ser tratados como objetos mutáveis usados para alterar a operação que já ocorreu. Callbacks, por sua vez, seguem o contrato específico do ponto de extensão e podem receber parâmetros, retornar valores ou alterar estruturas quando aquela API documentar esse comportamento.

## O que é um callback Moodle

Callback no Moodle não é uma classe especial e nem uma interface única. Historicamente é uma função ou método que o core sabe procurar pelo nome e chamar em determinado momento. Em muitos casos antigos a convenção é `frankenstyle_callbackname()`, como uma função de um módulo ou plugin local colocada em `lib.php`. O ponto importante é que quem define o contrato é o código que chama o callback, não o plugin que o implementa.

Isso significa que você não inventa `local_meuplugin_quando_eu_quiser()` e espera que o Moodle descubra magicamente. Precisa existir no core ou em outro componente um ponto que procure exatamente aquele callback, geralmente por APIs como `get_plugins_with_function()`, `plugin_callback()` ou `component_callback()`. Quando a função é encontrada, o Moodle chama com os parâmetros definidos pelo contrato daquele ponto de extensão.

Callbacks continuam existindo porque fazem parte de APIs antigas e alguns tipos de plugin ainda dependem de callbacks obrigatórios, especialmente Activity Modules. Então a mensagem deste capítulo não é 'callback é proibido'. A mensagem é outra. Não invente callback novo por hábito. Use apenas os pontos de extensão que o Moodle 3.5 realmente oferece e prefira Events quando o problema for reagir a um fato já ocorrido.

## Callbacks históricos em lib.php


É por isso que você ainda encontra plugins com centenas ou milhares de linhas em `lib.php`. Ali aparecem callbacks de navegação, renderização, curso, módulo, usuário, arquivo, cron legado e integrações específicas, tudo misturado porque cada API histórica foi adicionando sua própria função conhecida. O problema não é apenas estética. Funções globais são mais difíceis de organizar, testar e tipar, além de aumentarem o custo de carregar um arquivo que possui importância especial no ciclo de execução do Moodle.

Em código novo, `lib.php` deve ser visto como ponto de compatibilidade e contrato, não como o lugar onde toda lógica do plugin mora. Se um callback antigo é obrigatório, mantenha a função fina e encaminhe o trabalho para uma classe. Quando um callback é obrigatório, mantenha a função fina e encaminhe a regra para uma classe autoloaded.

## Por que lib.php deve ficar pequeno

em Primeiro Plugin Corretamente eu já tratei `lib.php` como um arquivo que não deveria virar depósito de regra de negócio, e aqui aparece um motivo ainda mais concreto. Callbacks podem ser descobertos e executados em muitos fluxos diferentes, então uma função pesada em `lib.php` costuma esconder custo de banco, chamada externa ou preparação de dados em um ponto que ninguém imagina olhando para a página atual.

Uma função de callback com dez linhas que valida parâmetros e chama `\local_meuplugin\service\alguma_coisa` é muito mais fácil de entender do que trezentas linhas de regra procedural. A classe chamada pode receber dependências, ser testada isoladamente e evoluir sem transformar `lib.php` em um mapa arqueológico das últimas dez versões do plugin.



## Events API

A Events API usada pelo Moodle 3.5 foi consolidada quando os eventos do core migraram para a nova API no Moodle 2.7. Ela serve tanto para comunicação entre componentes quanto para sustentar o sistema de logs. Isso é importante porque um Event bem desenhado não é apenas um 'callback com classe', ele entra em uma infraestrutura que sabe registrar o que aconteceu, associar contexto, usuário, objeto e produzir informação auditável.

O uso mais natural de Event aparece depois de uma ação significativa. Um registro foi criado, uma tentativa foi enviada, um arquivo foi atualizado, um curso foi visualizado, uma matrícula mudou. Você representa esse fato com uma classe de evento, cria a instância com os dados necessários e chama `trigger()`. A partir daí o Moodle registra o evento conforme sua infraestrutura de logging e chama observers interessados.

Por isso eu evitaria usar Events como mecanismo para alterar o fluxo principal. A própria política de desenvolvimento do Moodle deixa claro que observers são notificados do que ocorreu e podem agir sobre a informação recebida, mas não devem modificar o dado do evento nem impedir a ação original. Se você precisa alterar o fluxo antes da decisão ser finalizada, procure uma API específica ou um callback documentado para aquele ponto.

## O que é um evento

Um evento é um objeto que representa algo relevante que aconteceu no sistema. Ele carrega identidade do tipo de evento, contexto, usuário, curso quando aplicável, objeto relacionado, nível educacional, natureza CRUD e dados adicionais. Essa estrutura permite que o Moodle não dependa de textos soltos para entender o que ocorreu.

Pense em `\core\event\course_viewed`. A classe informa que um curso foi visualizado, define `crud` como leitura e usa contexto de curso. O log consegue registrar quem visualizou, qual curso estava envolvido, em qual contexto ocorreu e ainda produzir uma descrição legível. Um plugin pode observar esse evento sem precisar alterar o código que renderiza o curso.

O ponto forte é o desacoplamento. Quem dispara o evento não precisa saber quem vai reagir. Quem observa conhece o contrato público daquele evento e recebe uma instância tipada. Isso permite integrações sem enfiar `require_once()` de um plugin dentro de outro e sem editar core.

## Diretório classes/event

Eventos próprios do plugin ficam normalmente em `classes/event/`, respeitando autoload e namespace do componente. Um plugin `local_integracao` pode ter `classes/event/processamento_concluido.php`, cuja classe será `\local_integracao\event\processamento_concluido`. O nome da classe descreve o fato, normalmente no passado, porque o evento representa algo que aconteceu e não um comando para alguém executar.

Essa convenção ajuda tanto leitura quanto descoberta. Ao abrir um plugin e encontrar `classes/event/`, você sabe que ali estão fatos publicados por aquele componente. Não misture observers nessa mesma pasta apenas porque ambos tratam de eventos. A classe do Event define o contrato do fato, enquanto o código observer pode ficar em uma classe de callback ou observer organizada conforme a arquitetura do plugin.

## Criando um evento

Uma classe de Event normalmente estende `\core\event\base` e implementa `init()` para configurar características fundamentais. Em código novo, você deve definir pelo menos a natureza CRUD adequada e o nível educacional quando fizer sentido, além de `objecttable` quando o `objectid` aponta para uma tabela específica. Depois implemente `get_name()` e `get_description()` e, quando houver URL natural para o fato, `get_url()`.

Evite transformar o Event em DTO genérico com vinte campos aleatórios dentro de `other`. O desenho do evento deve ser estável e semanticamente claro, porque outros plugins podem passar a observar esse contrato. Se amanhã você muda a estrutura arbitrariamente, cria dependência quebrada fora do seu próprio componente.

```php
<?php
namespace local_integracao\event;

final class registro_processado extends \core\event\base {
    protected function init() {
        $this->data['crud'] = 'u';
        $this->data['edulevel'] = self::LEVEL_OTHER;
        $this->data['objecttable'] = 'local_integracao_item';
    }

    public static function get_name(): string {
        return get_string('eventregistroprocessado', 'local_integracao');
    }

    public function get_description(): string {
        return "The user with id '{$this->userid}' processed the record " .
            "with id '{$this->objectid}'.";
    }
}
```

## create()

Você não instancia um Event do Moodle com `new` e começa a preencher propriedades manualmente. O padrão é usar o método estático `create()` herdado da classe base e fornecer os dados do evento em um array. Esse método valida e prepara a estrutura interna necessária para o funcionamento consistente da API.

O mínimo quase sempre inclui `context`. Dependendo do evento, entram `objectid`, `relateduserid` e `other`. O contexto merece atenção especial porque ele não é decoração para o log. Ele posiciona o fato dentro da árvore de contextos do Moodle e influencia informações derivadas como curso e nível de contexto.

```php
$event = \local_integracao\event\registro_processado::create([
    'context' => $context,
    'objectid' => $record->id,
    'relateduserid' => $record->userid,
    'other' => [
        'source' => 'import',
    ],
]);
```

## trigger()

Depois de criar o Event e terminar a ação que ele representa, chame `trigger()`. A ordem importa. Se o evento se chama `registro_processado`, não faz sentido dispará-lo antes de concluir o processamento e depois descobrir que a operação falhou. Event não deveria anunciar uma realidade que ainda pode ser revertida por uma validação comum do próprio fluxo.

Também evite disparar o mesmo evento em três camadas diferentes apenas porque todas passam pelo mesmo código. Escolha o ponto em que o fato realmente se torna verdadeiro. Eventos duplicados poluem logs, fazem observers executar duas vezes e criam bugs que parecem concorrência quando na verdade o problema é desenho do trigger.

```php
// A operação principal foi concluída.
$DB->update_record('local_integracao_item', $record);

$event->trigger();
```

## Contexto do evento

O contexto responde onde aquela ação aconteceu do ponto de vista de autorização e organização do Moodle. Um evento de atividade normalmente usa `context_module`, um evento de curso usa `context_course`, enquanto eventos globais podem usar `context_system`. Colocar tudo em contexto de sistema porque é mais fácil empobrece o log e pode quebrar suposições de observers.

Se o evento pertence a um registro associado a uma atividade, não escolha contexto pelo lugar onde seu código está executando, escolha pelo objeto do domínio. Uma task pode estar rodando via CLI e ainda assim disparar evento cujo contexto correto é o módulo relacionado ao registro processado. O ambiente de execução e o contexto semântico são coisas diferentes.

## Object ID

`objectid` identifica o objeto principal ao qual o evento se refere. Quando sua classe define `objecttable`, esse id ganha uma relação clara com a tabela indicada. Em um evento `registro_processado`, por exemplo, o `objectid` pode apontar para a linha de `{local_integracao_item}` que foi processada.

Não use `objectid` para guardar qualquer número conveniente. Se o evento se refere a um registro A e você coloca o id de B porque estava mais fácil no momento do trigger, observers e relatórios passam a interpretar o contrato de forma errada. Event é API pública e consistência semântica vale mais do que economizar duas linhas.

## Related user

`relateduserid` existe para situações em que existe outro usuário relevante além de quem executou a ação. Imagine um administrador suspendendo uma matrícula de um aluno. O `userid` do Event pode ser o administrador que realizou a operação, enquanto `relateduserid` aponta para o aluno afetado. Essa distinção é importante para logs e observers.

Um erro comum é sobrescrever mentalmente `userid` com 'usuário sobre quem estou falando'. Nem sempre. `userid` normalmente representa o ator do evento, enquanto `relateduserid` permite registrar a pessoa relacionada ao fato. Antes de preencher, leia a semântica do evento e pergunte quem fez e quem foi afetado.

## Other data

`other` serve para dados adicionais que pertencem ao contrato do Event e não cabem nos campos padronizados. Isso não significa jogar ali um dump do registro inteiro. Tudo que entra em `other` aumenta a superfície pública do evento e pode aparecer em logs ou ser consumido por observers, então escolha informações estáveis, necessárias e sem exposição desnecessária de dados sensíveis.

Documente a estrutura em PHPDoc e valide quando necessário. Se o observer depende de `other['source']`, esse campo precisa ter significado previsível. Trocar silenciosamente `source` por `origin` em uma versão futura é quebra de API para quem observa o evento.

## CRUD events

Eventos carregam uma classificação CRUD com valores de criação, leitura, atualização e exclusão. Não é um detalhe cosmético. Essa informação permite classificar a natureza da operação e ajuda ferramentas que analisam eventos. Um curso visualizado é leitura, um registro criado é criação e uma preferência modificada é atualização.

Nem todo evento encaixa perfeitamente em uma tabela mental simplista, mas isso não é motivo para escolher qualquer letra. Pense no efeito principal que o evento representa sobre o recurso e consulte eventos semelhantes do core quando houver dúvida. A consistência com o ecossistema vale mais do que uma interpretação criativa local.

## Snapshots e estado anterior

Em alguns eventos, especialmente quando um objeto será alterado ou removido, pode ser útil adicionar snapshot do registro para que o evento preserve informação relevante mesmo depois que a linha original mudou ou deixou de existir. A Events API possui suporte para snapshots exatamente porque observers e logs podem precisar entender o objeto em um momento específico.

Não confunda snapshot com desculpa para carregar tudo sempre. Grandes objetos copiados em todo Event aumentam custo e podem levar dados desnecessários ao sistema de logging. Use quando o contrato realmente precisa preservar estado e prefira o mínimo necessário para explicar o fato.

## Observers

Observer é o código que reage a um Event. Ele não precisa estar no componente que criou o Event e essa é justamente a utilidade do mecanismo. Um plugin local pode observar evento de curso, um módulo pode observar evento de outro subsistema quando existe justificativa arquitetural e uma integração pode escutar criação de usuário sem editar o código do cadastro.

O método observer recebe a instância do evento. A partir dela você acessa contexto, usuário, objectid, relateduserid e outros dados públicos. Se precisar buscar o registro relacionado, faça isso explicitamente e valide suas premissas, porque o Event não promete que toda entidade ainda exista para sempre, especialmente eventos de exclusão.

## db/events.php

Os observers são registrados em `db/events.php`. Esse arquivo declara qual classe de Event será observada e qual callable deve ser executado. O registro é cacheado, então durante desenvolvimento uma mudança pode exigir purge de caches ou incremento de versão conforme o caso. Não tente registrar observer dinamicamente em cada request, porque você estaria contornando a infraestrutura de descoberta do Moodle.

Mantenha o arquivo declarativo. Ele não é lugar para consulta no banco, chamada de API ou lógica condicional complexa. Assim como outros arquivos de `db/`, descreve configuração que o Moodle lê e cacheia.

```php
<?php
$observers = [
    [
        'eventname' => \core\event\course_viewed::class,
        'callback' => '\\local_integracao\\observer::course_viewed',
    ],
];
<?php
namespace local_integracao;

final class observer {
    public static function course_viewed(\core\event\course_viewed $event) {
        $courseid = $event->courseid;
        // Encaminhe a regra para uma classe própria quando houver trabalho real.
    }
}
```

## Observer não é callback de pré-processamento

Este ponto merece ser escrito em letras grandes no raciocínio, mesmo que não precise virar banner no livro. Observer de Event não é o lugar para dizer 'antes de salvar, altere este valor'. Quando o observer recebe o Event, a semântica é de algo que aconteceu e a política do Moodle reforça que observers não devem modificar os dados do evento nem impedir a ação original.

É possível tentar contornar isso observando um evento e fazendo outro update logo depois, mas você cria uma disputa entre o fluxo principal e uma reação posterior. Se a necessidade real é modificar algo antes da conclusão, procure uma API ou callback documentado para aquele ponto no Moodle 3.5.

## Performance e falhas em observers

Observers são executados no fluxo do Event e, portanto, trabalho pesado merece cuidado. Se cada visualização de curso dispara uma integração HTTP síncrona de dois segundos, você acabou de transformar uma página rápida em uma página dependente da latência de outro sistema. A solução normalmente é o observer registrar ou enfileirar o trabalho mínimo e delegar processamento pesado a uma adhoc task, assunto de Cron, Tasks e Processamento Assíncrono.

Também trate idempotência. Eventos podem ser disparados novamente em fluxos legítimos e sua integração não deveria criar duplicações porque presumiu que aquele observer rodaria uma única vez na história do universo. Se a operação externa possui chave natural, id próprio ou possibilidade de retry, modele isso desde o começo.

## Comunicação entre componentes

Events são uma ótima forma de comunicação quando o componente A quer anunciar um fato sem conhecer o componente B. Essa independência reduz acoplamento direto e permite instalar ou remover observers sem alterar quem dispara. É muito melhor do que `if (file_exists($CFG->dirroot . '/local/outroplugin/...')) require_once(...)`, que cria dependência implícita e espalha conhecimento entre componentes.

Mas desacoplamento não significa ausência de contrato. Se B depende semanticamente de um Event publicado por A, existe uma dependência de API mesmo sem `require_once`. Você precisa considerar estabilidade do evento, versão mínima e o que acontece quando A não está instalado. Arquitetura desacoplada não é arquitetura sem responsabilidade.

## Dependências entre plugins

Quando um plugin só enriquece comportamento se outro estiver presente, um observer pode ser opcional e simplesmente nunca receber nada quando o componente emissor não existe. Quando o plugin não funciona sem esse outro componente, declare dependência em `version.php` e não esconda uma dependência obrigatória atrás de um Event.



## Callbacks e Events no Moodle 3.5


Quando o Moodle já dispara um Event para o fato que interessa, prefira observar esse evento em vez de editar o core. Quando o ponto de extensão é um callback conhecido, implemente apenas o callback previsto pela API e mantenha a função pequena, encaminhando a regra para uma classe do plugin.

## Como escolher

Use Event quando a semântica for "isso aconteceu" e outro componente precisa reagir. Use callback quando o core do Moodle 3.5 procura deliberadamente uma função conhecida para permitir extensão naquele ponto. Não invente callbacks próprios esperando descoberta automática e não use Event para tentar alterar retroativamente uma operação que já terminou.

## Exercício

Crie um plugin `local_integracao` que observe `\core\event\course_viewed` em `db/events.php`, registre somente o mínimo necessário e delegue qualquer processamento pesado para uma task. Depois identifique um callback real do Moodle 3.5, implemente-o de forma fina em `lib.php` e compare os dois contratos.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
