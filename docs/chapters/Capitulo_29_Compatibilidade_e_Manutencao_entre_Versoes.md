{% raw %}

# 29 COMPATIBILIDADE E MANUTENÇÃO ENTRE VERSÕES

Criar um plugin que funciona em uma versão do Moodle é uma tarefa. Manter o mesmo plugin funcionando por anos, atravessando mudanças de PHP, banco, JavaScript, APIs, estrutura de diretórios e políticas de depreciação, é outra completamente diferente. A diferença entre as duas aparece quando o plugin deixa de ser projeto pontual e passa a ser produto. A partir daí você não controla mais apenas o código que escreveu, porque precisa conviver com clientes em branches diferentes, upgrades em ritmos diferentes e instalações que nem sempre podem atualizar Moodle, PHP e banco ao mesmo tempo.

É nesse ponto que começam soluções perigosas. Um `if ($CFG->version >= ...)` aparece para corrigir uma incompatibilidade, depois outro `if` aparece em outro arquivo, depois um terceiro testa `class_exists()`, e em poucos meses ninguém mais sabe qual combinação foi realmente testada. O plugin continua "compatível" apenas porque nenhuma instalação importante quebrou ainda.

Neste capítulo vamos tratar compatibilidade como arquitetura e processo, não como remendo. O objetivo é mostrar como escolher uma faixa suportada, declarar isso corretamente em `version.php`, separar compatibilidade de branch, reconhecer APIs deprecated, usar feature detection quando ela é melhor que version detection, criar adapters e shims quando necessário, testar diferentes combinações em CI e decidir quando uma versão antiga precisa deixar de ser suportada.

O livro foi construído tendo Moodle 5.0 como referência principal, mas um plugin profissional dificilmente existe isolado nessa versão. Em setembro de 2026, Moodle 4.5 continua sendo a LTS em suporte de segurança, Moodle 5.1 e 5.2 ainda são linhas suportadas e Moodle 5.3 LTS está prestes a ser lançado. Isso torna o momento especialmente útil para discutir manutenção, porque o desenvolvedor precisa lidar ao mesmo tempo com uma LTS anterior, duas versões regulares e uma nova LTS chegando.

## 29.1 Compatibilidade precisa ser uma decisão explícita

Não escreva "compatível com Moodle 4.5 ou superior" apenas porque o plugin instalou em duas máquinas. Compatibilidade precisa responder pelo menos quatro perguntas.

Qual é a menor branch Moodle suportada? Qual é a maior branch testada? Quais versões de PHP e banco entram na matriz? E qual política será usada quando o core remover uma API que ainda é necessária na branch antiga?

Sem essas respostas, o projeto está apenas esperando usuários encontrarem combinações quebradas.

## 29.2 Suportado não significa apenas instalar

Um plugin pode instalar sem erro e ainda ser incompatível. A página principal pode abrir, mas backup falhar, uma task usar método removido, o JavaScript parar em Boost, Behat quebrar em outra branch ou um callback ter assinatura diferente.

Quando você declara suporte, a expectativa deveria incluir instalação limpa, upgrade, fluxos principais, Tasks, backup/restore quando aplicável, PHPUnit, Behat relevante e qualquer integração que represente o produto.

## 29.3 A matriz real é maior do que Moodle versus PHP

Na prática, uma matriz pode envolver:

```
Moodle
```

```php
PostgreSQL / MariaDB / MySQL
browser
SO do worker
Redis ou outro cache store
filesystem local ou object storage
tema
modo CLI versus web
```

Isso não significa testar o produto cartesiano completo. Significa escolher combinações representativas de risco em vez de fingir que uma única instalação cobre tudo.

## 29.4 Um snapshot útil em setembro de 2026

Como referência temporal deste capítulo, a situação oficial publicada pelo Moodle é aproximadamente esta:

```
Moodle 4.5 LTS
    release inicial: 07/10/2024
    segurança até:   04/10/2027
    PHP mínimo:       8.1

Moodle 5.0
    release inicial: 14/04/2025
    segurança até:   05/10/2026
    PHP mínimo:       8.2

Moodle 5.1
    release inicial: 06/10/2025
    segurança até:   19/04/2027
    PHP mínimo:       8.2

Moodle 5.2
    release inicial: 20/04/2026
    segurança até:   04/10/2027
    PHP mínimo:       8.3
```

Essas datas envelhecem, então não transforme a tabela em regra eterna. O valor dela é mostrar que a faixa de compatibilidade do plugin precisa respeitar também o ciclo de suporte do próprio Moodle.

## 29.5 A próxima LTS muda a conversa

Moodle 5.3 está previsto como a próxima LTS. Quando uma nova LTS entra em produção, muitos ambientes pulam diretamente da LTS anterior para ela, e isso cria uma janela em que o plugin precisa suportar duas linhas bastante diferentes.

É exatamente nesse período que adapters, CI e uma política de branch bem desenhada pagam o investimento feito antes.

## 29.6 `version.php` é parte da política de compatibilidade

`version.php` não é apenas um arquivo obrigatório para o instalador. Ele informa ao Moodle qual plugin está instalado, qual versão de código está presente e em quais branches esse pacote pode operar.

Um exemplo simples:

```php
<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
$plugin->maturity = MATURITY_STABLE;
$plugin->release = '2.4.0';
```

Esse pacote declara que requer pelo menos Moodle 4.5 e que sua faixa suportada termina em 5.2.

## 29.7 `$plugin->requires`

`requires` indica a versão mínima do core necessária para instalar aquela versão do plugin.

Se o plugin utiliza uma API introduzida em Moodle 5.0 e não existe fallback, declarar requisito 4.5 só para aumentar o número de instalações é erro de produto. O instalador pode aceitar o pacote, mas o runtime vai quebrar depois.

Prefira bloquear cedo com uma mensagem clara a permitir uma combinação que você sabe ser inválida.

## 29.8 Build number não é branch number

Moodle 4.5.0 possui build `2024100700`, enquanto a branch usada em `supported` é `405`. São escalas diferentes.

Não escreva:

```php
$plugin->supported = [2024100700, 2026042000];
```

O formato correto para a faixa de branches é:

```php
$plugin->supported = [405, 502];
```

## 29.9 `$plugin->supported`

```php
$plugin->supported define a menor e a maior branch suportadas por aquele release do plugin.
```

Isso é diferente de `requires`. Um pacote pode tecnicamente instalar numa branch posterior, mas você pode querer declarar que aquela versão não foi testada nela.

Exemplo:

```php
$plugin->requires = 2024100700;
$plugin->supported = [405, 502];
```

A mensagem implícita é que 4.5 até 5.2 fazem parte da política de suporte daquele pacote.

## 29.10 `$plugin->incompatible`

`incompatible` serve para declarar a primeira branch a partir da qual aquela versão do plugin não deve ser usada.

Ele é útil em cenários específicos, mas não substitui uma política organizada de releases. Em muitos projetos, `supported` já comunica melhor a faixa esperada.

Evite manter combinações contraditórias entre `requires`, `supported` e `incompatible`.

## 29.11 `$plugin->dependencies`

Compatibilidade não envolve apenas core. Se o plugin depende de outro componente, declare isso.

```php
$plugin->dependencies = [
    'local_deliveryhub' => 2026090100,
];
```

Não teste presença em runtime e siga silenciosamente com metade da funcionalidade quando a dependência é realmente obrigatória.

## 29.12 Dependência opcional é diferente de dependência obrigatória

Se a integração com outro plugin é opcional, não declare dependency obrigatória só para descobrir se ele está instalado.

Nesse caso use descoberta e feature detection:

```php
$manager = core_plugin_manager::instance();
$info = $manager->get_plugin_info('local_optionalfeature');

if ($info !== null) {
    // Integração opcional disponível.
}
```

A arquitetura precisa continuar funcionando sem esse componente.

## 29.13 `release` não controla upgrade

```php
$plugin->release = '2.4.0' é um nome legível para humanos. O instalador decide upgrade usando $plugin->version.
```

Você pode usar Semantic Versioning na release e um inteiro datado no version:

```php
$plugin->version = 2026092401;
$plugin->release = '2.4.1';
```

Não tente substituir um pelo outro.

## 29.14 A branch do Git também faz parte da compatibilidade

Quando um mesmo repositório suporta várias linhas Moodle, você precisa escolher entre uma branch única com compatibilidade interna ou branches de manutenção separadas.

As duas estratégias podem funcionar, mas possuem custos diferentes.

## 29.15 Branch única

Uma branch única é atraente porque reduz backport. O mesmo patch atende 4.5, 5.0, 5.1 e 5.2.

Ela funciona melhor quando as APIs utilizadas são estáveis e as diferenças entre branches podem ser isoladas em poucos adapters.

Ela começa a ficar ruim quando `if version` aparece por todo lado, classes precisam de assinaturas incompatíveis ou o frontend exige builds diferentes.

## 29.16 Branches por linha

Outra estratégia é manter branches como:

```
MOODLE_405_STABLE
MOODLE_500_STABLE
MOODLE_501_STABLE
MOODLE_502_STABLE
main
```

Isso facilita código específico por branch, mas aumenta custo de backport e risco de correções divergirem.

Para plugins menores, manter uma branch por cada versão sem necessidade real pode virar burocracia.

## 29.17 Branch por compatibilidade, não por ansiedade

Não crie uma branch só porque saiu Moodle novo. Primeiro verifique se a mesma base continua compatível.

Se 5.1 exige apenas ajuste de deploy e o PHP do plugin continua igual, talvez a branch única ainda seja melhor. Se 5.2 exige PHP 8.3 e você quer começar a usar recursos de linguagem que quebrariam 4.5, então uma separação pode passar a fazer sentido.

## 29.18 PHP é parte do problema

Moodle 4.5 aceita PHP 8.1, enquanto 5.2 exige PHP 8.3. Se você promete suportar 4.5, não pode escrever o plugin inteiro usando sintaxe exclusiva do PHP 8.3 apenas porque sua máquina de desenvolvimento já foi atualizada.

A menor versão PHP da sua faixa Moodle limita a sintaxe que o mesmo código compartilhado pode utilizar.

## 29.19 Compatibilidade de sintaxe é diferente de compatibilidade de API

Um código pode ser sintaticamente válido em PHP 8.1 e ainda chamar uma API Moodle que só existe em 5.2.

Por isso lint não comprova compatibilidade com a branch. Você precisa testar o plugin dentro de cada Moodle suportado.

## 29.20 O salto de PHP 8.2 para 8.3 em Moodle 5.2

Moodle 5.0 e 5.1 usam PHP 8.2 como mínimo, enquanto 5.2 elevou o mínimo para 8.3.

Se o plugin suporta 4.5 até 5.2 em uma única codebase, a sintaxe comum precisa continuar compatível com PHP 8.1, mesmo que a matrix também teste 8.4 nas branches novas.

Isso é uma das razões para não confundir "minha produção usa PHP 8.4" com "meu plugin pode exigir PHP 8.4".

## 29.21 Banco também muda

Moodle 5.0 aumentou requisitos mínimos de banco e removeu suporte ao Oracle Database. Um plugin que promete compatibilidade precisa respeitar o conjunto suportado pelo core da branch.

Não escreva SQL específico de PostgreSQL num plugin distribuído genericamente só porque seu ambiente principal usa PostgreSQL.

## 29.22 DML protege parte da portabilidade

Usar DML e placeholders reduz dependência de sintaxe particular de banco.

```php
$sql = "SELECT id, userid
          FROM {mod_checkpoint_response}
         WHERE checkpointid = :checkpointid";

$records = $DB->get_records_sql($sql, [
    'checkpointid' => $checkpointid,
]);
```

Ainda assim, funções SQL específicas, tipos e ordenações podem variar. Teste mais de um banco quando o plugin possui consultas complexas.

## 29.23 XMLDB é parte da compatibilidade

Schema definido com XMLDB é justamente o mecanismo para permitir instalação e upgrade coerentes em bancos suportados.

Evite DDL manual como:

```php
$DB->execute('ALTER TABLE ...');
```

Use `xmldb_table`, `xmldb_field`, `xmldb_index` e Database Manager, especialmente em `upgrade.php`.

## 29.24 Deprecação não significa remoção imediata

O Moodle possui uma política formal de deprecação. Uma API pública normalmente passa por estágio inicial, estágio final e depois remoção.

Isso cria uma janela para migração. O problema é quando o desenvolvedor ignora `debugging()` durante duas versões e só descobre a mudança quando o método some.

## 29.25 `DEBUG_DEVELOPER` é ferramenta de compatibilidade

Ambiente de CI e desenvolvimento deve rodar com debugging suficiente para denunciar chamadas deprecated.

Um teste que passa produzindo dez mensagens de deprecação não está realmente saudável. Ele está avisando que a próxima atualização provavelmente quebrará.

## 29.26 Não silencie depreciação

Nunca resolva uma depreciação com:

```
@deprecated_function();
```

ou filtrando warnings globais.

A mensagem existe para dar tempo de migrar. Silenciar só transfere o custo para o próximo upgrade.

## 29.27 Leia `UPGRADING.md` e developer updates

Antes de declarar suporte a uma nova branch, leia o developer update e as notas de upgrade relevantes.

Procure especialmente por:

```
deprecated
removed
renamed
signature changed
moved
new mandatory feature
minimum PHP
minimum database
JavaScript
```

```mustache
theme
course format
plugin type
```

Isso reduz bastante a quantidade de incompatibilidades descobertas apenas em produção.

## 29.28 APIs públicas e detalhes internos

Código que depende de API pública tende a sobreviver melhor. Código que chama classe interna, método `protected` por reflection, tabela sem contrato ou template interno de outra área aumenta risco de quebra.

Uma classe ter método `public` em PHP não significa automaticamente que ele é API pública do Moodle. A política considera intenção e uso esperado.

## 29.29 Quanto mais profundo o acoplamento, maior o custo de upgrade

Se seu plugin precisa sobrescrever renderer interno, copiar template core inteiro e chamar método não documentado, cada release Moodle vira projeto de migração.

Às vezes isso é inevitável, principalmente em themes e course formats, mas precisa ser tratado como dívida consciente e coberto por testes específicos.

## 29.30 Feature detection versus version detection

Um padrão ruim é espalhar:

```php
if ($CFG->version >= 2025100600) {
    // Moodle 5.1.
}
```

Em muitos casos é melhor perguntar se a capacidade existe:

```
if (class_exists('\core\some\new_api')) {
    // API disponível.
}
```

Feature detection descreve o que você realmente precisa.

## 29.31 Quando version detection é legítimo

Nem toda diferença pode ser detectada por `class_exists()` ou `method_exists()`. Às vezes a mesma classe existe, mas o comportamento mudou de forma intencional entre branches.

Nesses casos um teste de versão pode ser legítimo, desde que centralizado e documentado.

O problema não é usar `$CFG->version`. O problema é transformar a aplicação numa floresta de números mágicos.

## 29.32 Centralize diferenças de versão

Crie uma pequena camada de compatibilidade:

```php
namespace mod_checkpoint\local;

final class compatibility {
    public static function is_moodle_51_or_later(): bool {
        global $CFG;
        return $CFG->version >= 2025100600;
    }
}
```

Melhor ainda, quando possível, esconda a diferença dentro de adapter que oferece uma única API ao restante do plugin.

## 29.33 Adapter é melhor do que `if` espalhado

Imagine que a forma de obter determinado objeto mudou entre branches.

Em vez de:

```
if (...) {
    // versão nova
} else {
    // versão antiga
}
```

em dez arquivos, crie:

```php
interface course_bridge {
    public function get_activity_data(int $cmid): array;
}
```

E escolha a implementação uma única vez.

## 29.34 Shim

Shim é uma pequena camada que reproduz uma interface ausente numa branch antiga ou adapta uma antiga para a nova.

Ele é útil quando a diferença é pequena e temporária. Ele vira problema quando cresce até copiar metade do core.

Se o shim começa a exigir várias centenas de linhas, talvez seja hora de separar branches de manutenção.

## 29.35 Não copie classes inteiras do core

Copiar uma classe de Moodle 5.2 para dentro do plugin para "ter a API nova no 4.5" parece solução rápida, mas você também copia bugs, dependências e pressupostos daquela versão.

Implemente apenas a parte mínima necessária ou mantenha implementação própria claramente isolada.

## 29.36 Compatibilidade com Hooks

Hooks modernos foram introduzidos progressivamente e substituem alguns callbacks ou pontos de extensão históricos.

Se a menor branch suportada ainda não possui determinado Hook, o plugin pode manter callback legado e registrar Hook nas branches novas, desde que ambos chamem a mesma classe de serviço.

Não duplique regra de negócio nos dois caminhos.

## 29.37 Um serviço compartilhado para callback e Hook

Exemplo conceitual:

```php
final class course_observer_service {
    public static function handle(array $data): void {
        // Regra única.
    }
}
```

A bridge antiga chama `handle()`. O subscriber novo também chama `handle()`.

Assim a compatibilidade fica na borda e não dentro da regra principal.

## 29.38 `db/hooks.php` e branches antigas

Não assuma que uma branch antiga entenderá todos os metadados introduzidos depois. Antes de adicionar arquivo novo à mesma codebase, verifique como o component manager daquela versão lida com ele.

Em vários casos arquivos desconhecidos são simplesmente ignorados, mas isso deve ser confirmado e testado, não presumido.

## 29.39 Subplugins entre 4.5 e 5.0

O Capítulo 20 mostrou uma mudança concreta de compatibilidade. Em Moodle 5.0 o metadata de subplugins passou a usar `subplugintypes` com caminho relativo à raiz do plugin pai.

Para suportar 4.5 e 5.x na mesma codebase, declare os dois formatos:

```
{
    "subplugintypes": {
        "deliveryconnector": "connector"
    },
    "plugintypes": {
        "deliveryconnector": "local/deliveryhub/connector"
    }
}
```

Esse é um exemplo clássico de compatibilidade resolvida declarativamente, sem `if` em runtime.

## 29.40 Activity purpose em 5.1

Desde Moodle 5.1, `FEATURE_MOD_PURPOSE` é parte obrigatória da classificação principal da activity, e `FEATURE_MOD_OTHERPURPOSE` pode ser usado como propósito secundário.

Se o mesmo módulo precisa rodar numa branch em que a constante secundária ainda não existe, proteja o uso:

```php
if (defined('FEATURE_MOD_OTHERPURPOSE') && $feature === FEATURE_MOD_OTHERPURPOSE) {
    return MOD_PURPOSE_COMMUNICATION;
}
```

A feature principal deve continuar coerente com cada branch suportada.

## 29.41 Constantes novas precisam de proteção

Referenciar uma constante inexistente pode quebrar antes mesmo de sua condição ser avaliada dependendo de como o código foi escrito.

Use `defined()` quando a compatibilidade realmente exige trabalhar com constante introduzida depois.

## 29.42 PHP attributes e branches antigas

Moodle 4.4 introduziu a Deprecation API baseada também no atributo `\core\attribute\deprecated`, mas a própria sintaxe de attributes exige PHP moderno, o que já é compatível com essas branches.

Mesmo assim, não use uma classe de atributo que não existe na menor branch suportada sem separar o código ou garantir que aquele arquivo não será carregado nela.

## 29.43 Deprecation API não substitui PHPDoc

A documentação atual reforça que o atributo `deprecated` não substitui `@deprecated` no PHPDoc. Eles atendem necessidades diferentes.

Se você possui uma API pública do próprio plugin usada por terceiros, aplique uma política de depreciação coerente também no seu código.

## 29.44 Deprecando API do seu plugin

Não remova um método público entre `2.3.0` e `2.4.0` sem transição se outros plugins dependem dele.

Faça algo como:

```php
/**
 * @deprecated since mod_checkpoint 2.4.0.
 * @see new_method()
 */
public function old_method(): void {
    debugging('old_method() is deprecated. Use new_method().', DEBUG_DEVELOPER);
    $this->new_method();
}
```

Depois remova apenas numa versão maior ou conforme a política publicada.

## 29.45 Compatibilidade de templates Mustache

Themes podem sobrescrever templates. Se você muda completamente a estrutura de um template público entre releases do plugin, o override do cliente pode quebrar silenciosamente.

Mantenha nomes e context data estáveis quando possível e documente mudanças incompatíveis.

## 29.46 Context data também é API

Se o template recebe:

```
[
    'items' => $items,
    'canedit' => $canedit,
]
```

outro theme ou plugin pode depender dessa estrutura. Renomear `canedit` para `editable` pode ser uma breaking change mesmo que PHP continue funcionando.

## 29.47 JavaScript também possui contrato de compatibilidade

AMD modules, ESM, selectors, Events DOM e templates podem mudar entre branches.

Não trate o frontend como camada descartável. Um plugin pode estar perfeitamente compatível em PHP e quebrado completamente no navegador.

## 29.48 JavaScript deprecated em Moodle 5.2

A política de deprecação de JavaScript foi formalizada ainda mais em Moodle 5.2, inclusive com utilidade própria de deprecação no core.

Para plugins que expõem módulos consumidos por terceiros, adote a mesma disciplina. Evite renomear módulo ou função exportada sem período de transição.

## 29.49 AMD e código moderno

Se sua faixa inclui branches em que AMD ainda é o caminho comum do plugin, não migre todo frontend para uma forma que a branch antiga não consegue construir ou carregar sem estratégia de fallback.

Compatibilidade de build também precisa entrar no CI.

## 29.50 Bootstrap 4 e Bootstrap 5

Moodle 5.0 trouxe Bootstrap 5 e uma camada de compatibilidade para suavizar a transição. Isso não significa que qualquer markup antigo será seguro para sempre.

Plugins que usam classes Bootstrap diretamente devem revisar mudanças de utilitários, componentes e comportamento, principalmente se também suportam 4.5.

## 29.51 Prefira componentes Moodle a CSS específico da versão

Quanto mais sua UI depende de classes internas de Bootstrap, maior o risco na troca de versão.

Quando existe Output API, template core ou componente Moodle para o problema, ele tende a oferecer uma superfície mais estável.

## 29.52 Moodle 5.1 e a nova raiz `public`

Moodle 5.1 iniciou a reestruturação do código, movendo a maior parte do código web acessível para um diretório `public`.

Essa mudança é enorme no filesystem, mas foi desenhada para ter impacto pequeno no código dos plugins. `$CFG->wwwroot` e `$CFG->dirroot` continuam funcionando conforme o contrato documentado, e uma nova variável read-only `$CFG->root` aponta para a raiz da instalação.

## 29.53 Não monte paths assumindo a raiz antiga

Código ruim:

```php
$path = dirname(__DIR__, 4) . '/config.php';
```

Isso depende da posição física da pasta.

Código melhor usa o bootstrap e variáveis oficiais do Moodle, ou APIs que evitam completamente a necessidade de resolver path manualmente.

```php
29.54 $CFG->dirroot versus $CFG->root
```

Na estrutura nova, `$CFG->dirroot` representa a raiz pública do código Moodle, enquanto `$CFG->root` representa a raiz geral da instalação.

Seu plugin normalmente deve continuar usando os contratos documentados em vez de tentar descobrir caminhos com `realpath()` e número fixo de `dirname()`.

## 29.55 Scripts CLI e estrutura de diretórios

Ferramentas próprias que executam algo como:

```
php admin/cli/cron.php
```

podem precisar ser revistas em instalações 5.1+ dependendo do diretório de trabalho e da forma de deploy.

É por isso que scripts de CI e documentação operacional também fazem parte da compatibilidade, não só o PHP do plugin.

## 29.56 ZIP do plugin continua sendo o plugin

A reestruturação do core não significa que você deva incluir uma pasta `public` dentro do ZIP do seu plugin.

O pacote continua representando a raiz do componente, e o instalador ou processo de deployment coloca o plugin na localização apropriada daquela instalação.

## 29.57 Ferramentas hardcoded são um risco

Shell scripts, deploy scripts e jobs Jenkins antigos podem assumir caminhos como:

```
/var/www/moodle/mod/meuplugin
```

Em estruturas 5.1+ o caminho físico pode mudar. Documente variáveis de raiz e torne deployment parametrizável.

## 29.58 Moodle 5.2 e Composer para plugins

Moodle 5.2 introduziu suporte nativo para distribuir e instalar plugins via Composer usando `moodle/composer-installer`.

Isso adiciona uma nova forma de entrega, mas não elimina instalação tradicional por ZIP.

Se você publica via Composer, continue declarando dependências Moodle obrigatórias também em `version.php`, porque instalações sem Composer ainda precisam validar corretamente.

## 29.59 Não crie dependência Composer-only sem decidir abandonar ZIP

A documentação atual recomenda cuidado com dependências runtime que só existiriam quando o plugin fosse instalado por Composer.

Se seu plugin continua distribuído em ZIP, ele precisa funcionar nesse fluxo ou detectar de forma clara que uma dependência externa está ausente.

## 29.60 `composer.json` não substitui `version.php`

Mesmo em Moodle 5.2, `version.php` continua fazendo parte do contrato do plugin.

Composer descreve pacote e dependências no ecossistema Composer; Moodle continua precisando de seu próprio metadata para instalação e upgrade.

## 29.61 PHPUnit também muda por branch

Moodle 5.0 atualizou o core para PHPUnit 11.4, enquanto branches anteriores utilizam versões mais antigas.

Se uma única suíte precisa rodar em 4.5 e 5.x, evite escrever testes dependentes de uma feature exclusiva do PHPUnit 11 sem adapter ou separação.

O Capítulo 25 mostrou como data providers e attributes modernos precisam ser tratados nessa transição.

## 29.62 Behat e tooling também mudam

O mesmo raciocínio vale para Behat. O comando, dependências e ambiente são fornecidos pelo core da branch.

Não fixe no repositório do plugin uma versão arbitrária da stack de teste e espere que ela represente todas as branches Moodle.

## 29.63 CI é onde a promessa de compatibilidade vira prova

Se `version.php` diz `[405, 502]`, o CI deveria executar pelo menos cenários representativos dessa faixa.

Não precisa testar cada patch release, mas precisa cobrir os extremos e mudanças relevantes.

## 29.64 Uma matrix pragmática

Exemplo conceitual:

```
strategy:
  matrix:
    include:
      - moodle: MOODLE_405_STABLE
        php: '8.1'
        db: pgsql

      - moodle: MOODLE_405_STABLE
        php: '8.3'
        db: mariadb

      - moodle: MOODLE_501_STABLE
        php: '8.2'
        db: pgsql

      - moodle: MOODLE_502_STABLE
        php: '8.3'
        db: mariadb

      - moodle: MOODLE_502_STABLE
        php: '8.4'
        db: pgsql
```

Isso testa mínimos, máximos e combinações variadas sem multiplicar tudo por tudo.

## 29.65 Teste o menor PHP suportado

Muitos projetos testam apenas a versão mais nova do PHP. Isso é exatamente o contrário do que mais revela incompatibilidade de sintaxe.

Se você declara 4.5 e PHP 8.1, pelo menos uma job precisa rodar em 8.1.

## 29.66 Teste o maior PHP suportado

A outra ponta também importa. Warnings, deprecations do PHP e mudanças de comportamento aparecem primeiro na versão nova.

Idealmente a matrix cobre menor e maior PHP válidos para a branch.

## 29.67 Teste a menor branch Moodle

A menor branch revela uso acidental de API nova.

Se todos os testes rodam apenas em 5.2, você pode introduzir `FEATURE_MOD_OTHERPURPOSE` ou outra API e só descobrir o problema quando um cliente 4.5 atualizar o plugin.

## 29.68 Teste a branch mais nova

A maior branch revela depreciações, remoções e mudanças visuais.

Esse teste deve rodar com debugging de desenvolvimento para transformar avisos em ação antes que virem quebra na próxima versão.

## 29.69 Testar `main` pode ser útil

Se o plugin é estratégico e você quer antecipar Moodle futuro, uma job não obrigatória contra `main` pode avisar sobre quebras antes do release.

Ela não deve bloquear releases estáveis se a branch futura ainda está em desenvolvimento, mas serve como radar.

## 29.70 CI de compatibilidade não é só PHPUnit

Inclua:

```
moodle-plugin-ci validate
phpcs
phpdoc
php lint
PHPUnit
Behat crítico
install test
upgrade test
backup/restore quando importante
Grunt/ESLint para frontend
```

A combinação depende do plugin, mas a compatibilidade precisa atravessar o produto.

## 29.71 Teste de instalação limpa

Uma nova versão pode funcionar em seu banco de desenvolvimento apenas porque você carrega anos de upgrade acumulado.

Teste instalação limpa em cada linha suportada.

Isso pega `install.xml`, defaults e metadata que `upgrade.php` pode ter mascarado.

## 29.72 Teste de upgrade

Se existem clientes vindo da versão anterior do plugin, CI precisa validar esse caminho.

Um teste de instalação limpa não detecta savepoint errado, migration incompleta ou coluna antiga que deveria ser transformada.

## 29.73 Upgrade entre Moodle e plugin ao mesmo tempo

Ambientes reais frequentemente atualizam core e plugin no mesmo maintenance window.

Teste pelo menos um cenário em que banco começa numa combinação antiga, depois core e plugin são atualizados juntos para a nova combinação suportada.

## 29.74 `upgrade.php` não deve perguntar a versão do Moodle para tudo

Um upgrade step deve representar versão do plugin e transformação de dados.

Se a transformação depende de diferença do core, isole esse detalhe, mas não transforme `upgrade.php` numa árvore enorme de branches Moodle.

## 29.75 Savepoints continuam obrigatórios

Toda etapa de upgrade precisa fechar corretamente com savepoint do componente.

Compatibilidade sem upgrade consistente é ilusão, porque usuários não reinstalam o plugin a cada release.

## 29.76 Compatibilidade de dados é mais difícil que compatibilidade de código

Você pode corrigir uma classe e publicar novo ZIP. Corrigir dados migrados incorretamente é muito mais difícil.

Antes de alterar formato de JSON, enum, identificador externo ou semântica de coluna, pense em como versões antigas já persistiram esses valores.

## 29.77 Migração deve ser forward-only

Moodle não trabalha com downgrade automático de schema de plugin.

Depois que uma versão sobe `$plugin->version` e transforma o banco, voltar código antigo não é um rollback seguro.

Documente isso em processo de release e operação.

## 29.78 Feature flag para transição

Quando uma funcionalidade nova precisa conviver por algum tempo com comportamento antigo, uma feature flag pode ajudar mais do que branches duplicadas.

Use com prazo de remoção. Flag eterna vira segunda arquitetura que ninguém testa.

## 29.79 Compatibilidade com temas

Plugins de UI precisam ser testados pelo menos com Boost e com os themes realmente suportados comercialmente.

Overrides de templates, classes CSS e mudanças de Bootstrap podem quebrar sem qualquer erro PHP.

## 29.80 Course formats merecem cuidado especial

Course formats sofreram mudanças grandes entre 4.x e 5.x, especialmente na migração de bibliotecas antigas e na arquitetura de output.

Se seu plugin injeta controles em course format, siga APIs oficiais e evite DOM selectors baseados em markup privado do core.

## 29.81 Activity chooser em 5.1

Moodle 5.1 moveu lógica e templates do activity chooser de `core_course` para `core_courseformat`.

Themes e formats que sobrescreviam os templates antigos precisam migrar. Isso é exemplo perfeito de mudança que um plugin comum talvez nem perceba, mas um plugin de UI específico quebra imediatamente.

## 29.82 Não trate override de template como contrato eterno

Template core pode ser API de extensão em alguns contextos, mas alterações relevantes são anunciadas e precisam ser acompanhadas.

Ao sobrescrever, mantenha o diff o menor possível e revise a cada branch.

## 29.83 Compatibilidade com callbacks legados

Alguns plugin types ainda possuem callbacks históricos em `lib.php`. Quando surge API moderna, não migre necessariamente removendo o callback se a branch antiga ainda depende dele.

Faça o callback virar uma bridge fina para a nova classe de serviço.

## 29.84 Evite lógica duplicada na bridge

Ruim:

```
function plugin_old_callback(...) {
    // 80 linhas de regra.
}

class new_handler {
    // As mesmas 80 linhas adaptadas.
}
```

Melhor:

```php
function plugin_old_callback(...) {
    return \plugin\local\service::handle(...);
}
```

A API externa muda, a regra interna não.

## 29.85 Compatibilidade de External Functions

Se clientes externos consomem seus Web Services, mudar parâmetros, tipos ou retorno pode quebrar aplicações mesmo que o Moodle esteja perfeito.

Versione o contrato ou mantenha compatibilidade de parâmetros opcionais quando possível.

Não confunda upgrade do plugin com permissão para quebrar cliente remoto.

## 29.86 Web Service é API pública de verdade

Depois que um app mobile ou ERP depende da função, o contrato passa a existir fora do repositório.

Mudanças incompatíveis precisam de estratégia de versão, depreciação e documentação.

## 29.87 Compatibilidade de banco externo

Integrações com ERP sofrem com duas versões ao mesmo tempo, a do Moodle e a do sistema externo.

Mantenha adapters de integração separados da regra Moodle, para que uma mudança no payload do ERP não force alteração espalhada pelo plugin inteiro.

## 29.88 Compatibilidade com REST e APIs externas

Não dependa de campos não documentados do provedor. Valide payload e trate ausência de campos opcionais.

Se a API externa oferece versão, fixe conscientemente a versão utilizada e planeje migração antes do endpoint antigo ser desligado.

## 29.89 Semver ajuda, mas não resolve tudo

Semantic Versioning é útil para comunicar breaking changes do plugin, mas Moodle usa seu próprio inteiro para upgrade.

Você pode combinar:

```
release 2.7.3
version 2026092403
```

A política precisa explicar o que major, minor e patch significam para seus usuários.

## 29.90 Release maior para remoção de compatibilidade

Parar de suportar Moodle 4.5 pode ser uma breaking change mesmo que nenhuma feature do plugin tenha mudado.

Considere refletir isso em major release ou, no mínimo, comunicar claramente no changelog e metadata.

## 29.91 Não abandone branch silenciosamente

Se a nova versão do plugin passa a exigir Moodle 5.2, mantenha disponível a última release compatível com 4.5 e documente qual é.

Isso permite que administradores recebam correções adequadas à linha que ainda usam.

## 29.92 Security fixes em linhas antigas

Enquanto uma branch do plugin é suportada, falhas de segurança podem exigir backport mesmo que novas features tenham parado de chegar.

Defina diferença entre suporte funcional e suporte de segurança, especialmente para clientes institucionais.

## 29.93 Changelog deve informar compatibilidade

Um changelog útil não escreve apenas "v2.4.0 released".

Inclua algo como:

```
Added support for Moodle 5.2.
Dropped support for Moodle 4.4.
Minimum PHP is now 8.1.
Replaced deprecated course renderer API.
Added Composer metadata for Moodle 5.2 installations.
```

Isso reduz surpresa no upgrade.

## 29.94 `README` não deve ser a única fonte

Compatibilidade precisa estar em metadata executável, CI e release notes. README ajuda humanos, mas não impede instalação indevida.

Se o pacote não funciona em determinada branch, `version.php` deve refletir isso.

## 29.95 Política de suporte

Uma política simples pode ser:

```
Suportamos a LTS atual e as duas versões regulares mais recentes.
Mantemos correções críticas na LTS anterior enquanto ela recebe segurança do core.
Novas features entram apenas nas linhas em general support.
```

A regra exata depende do produto. O importante é existir e ser aplicável.

## 29.96 Custo de cada versão suportada

Cada branch adicionada aumenta CI, suporte, QA, documentação e backport.

Suportar dez versões não é automaticamente melhor atendimento. Às vezes significa que nenhuma delas é testada direito.

## 29.97 Um único código ou releases diferentes

O critério prático é observar quanto código condicional existe.

Se diferenças estão concentradas em duas ou três bridges, codebase única funciona bem. Se cada formulário, renderer e task possui bifurcação, releases específicas por linha começam a ficar mais simples.

## 29.98 Como eu organizaria `mod_checkpoint`

Para o plugin construído ao longo do livro, eu manteria a regra de negócio comum em classes sem dependência de versão e criaria uma pasta de adapters apenas para diferenças concretas.

```
classes/
    local/
        compatibility/
            bridge.php
            bridge_45.php
            bridge_50.php
            bridge_52.php
        service/
            submission_manager.php
            grading_manager.php
```

A factory de compatibilidade escolhe a bridge; o restante do plugin continua igual.

## 29.99 Uma factory de compatibilidade

Exemplo:

```php
namespace mod_checkpoint\local\compatibility;

final class factory {
    public static function get(): bridge {
        global $CFG;

        if ($CFG->version >= 2026042000) {
            return new bridge_52();
        }

        if ($CFG->version >= 2025041400) {
            return new bridge_50();
        }

        return new bridge_45();
    }
}
```

O resto do código pede `factory::get()` e não conhece números de versão.

## 29.100 Não crie bridge sem necessidade

A pasta acima é exemplo de isolamento, não recomendação para todo plugin.

Se não existe diferença real, uma única implementação é melhor. Arquitetura de compatibilidade também pode virar abstração inútil quando criada antecipadamente.

## 29.101 Exercício - atravessar 4.5, 5.0, 5.1 e 5.2

Pegue o `mod_checkpoint` dos capítulos anteriores e declare suporte de Moodle 4.5 até 5.2. Monte uma matrix CI que execute a menor e a maior combinação de PHP suportada, pelo menos PostgreSQL e MariaDB, PHPUnit e um conjunto Behat crítico.

Depois introduza deliberadamente quatro incompatibilidades. Use uma constante exclusiva de 5.1 sem proteção, uma API deprecated em 5.2, um path absoluto que assume a estrutura anterior ao diretório `public` e um teste usando recurso exclusivo do PHPUnit 11. Execute a matrix e observe qual job encontra cada problema.

Corrija sem espalhar `if ($CFG->version ...)` pela aplicação. Use feature detection onde fizer sentido, uma bridge para a diferença comportamental e metadata declarativa para o caso de subplugin.

Em seguida crie duas versões do ZIP. A primeira deve suportar 4.5 até 5.1; a segunda passa a exigir 5.0 e suportar até 5.2. Confirme que o Moodle impede a instalação da segunda no 4.5 antes de qualquer fatal error.

Por fim escreva uma política de suporte de uma página para o plugin. Ela precisa definir branches Moodle aceitas, versões PHP testadas, política para security fixes, quanto tempo uma linha antiga continua recebendo correções e como o usuário descobre qual é a última release compatível com sua instalação.

O exercício só está concluído quando compatibilidade deixa de depender da memória do desenvolvedor e passa a existir em `version.php`, CI, branches, changelog, testes e documentação.

## 29.102 Fechando o capítulo

Compatibilidade não é uma camada colocada no fim do projeto. Ela nasce quando você escolhe APIs públicas, separa regra de integração, evita caminhos físicos, trata deprecated notices como trabalho real e mantém diferenças de branch nas bordas.

O plugin mais fácil de manter não é o que contém mais checks de versão, é o que precisa de menos checks porque foi escrito sobre contratos estáveis. Quando uma diferença é inevitável, isole-a. Quando uma branch deixou de ser viável, encerre suporte de forma explícita. E quando declarar que uma versão é suportada, faça a CI provar isso.

Esse é o ponto em que manutenção deixa de ser reação a cada novo Moodle e passa a ser uma característica planejada do produto.

## REFERÊNCIAS

MOODLE. Moodle Developer Resources. Moodle versions and release support. https://moodledev.io/general/releases/

MOODLE. Moodle Developer Resources. PHP version policy. https://moodledev.io/general/development/policies/php

MOODLE. Moodle Developer Resources. Deprecation policy. https://moodledev.io/general/development/policies/deprecation

MOODLE. Moodle Developer Resources. Deprecation API. https://moodledev.io/docs/5.2/apis/core/deprecation

MOODLE. Moodle Developer Resources. Moodle 4.5 developer update. https://moodledev.io/docs/4.5/devupdate

MOODLE. Moodle Developer Resources. Moodle 5.0 developer update. https://moodledev.io/docs/5.0/devupdate

MOODLE. Moodle Developer Resources. Moodle 5.1 developer update. https://moodledev.io/docs/5.1/devupdate

MOODLE. Moodle Developer Resources. Moodle 5.2 developer update. https://moodledev.io/docs/5.2/devupdate

MOODLE. Moodle Developer Resources. Code restructure. https://moodledev.io/docs/5.1/guides/restructure

MOODLE. Moodle Developer Resources. Composer support for plugins. https://moodledev.io/docs/5.2/guides/composer

MOODLE. Moodle Developer Resources. version.php. https://moodledev.io/docs/4.5/apis/commonfiles/version.php


{% endraw %}
