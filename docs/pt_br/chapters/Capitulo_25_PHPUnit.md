{% raw %}

# 25 PHPUNIT

Teste automatizado em plugin Moodle não deveria entrar no projeto quando alguém pede cobertura antes de publicar. Ele deveria entrar quando a primeira regra de negócio deixa de caber confortavelmente na cabeça de quem escreveu o código, porque é justamente nesse momento que começa a ficar caro descobrir regressão clicando em tela, criando curso, trocando papel, executando cron e repetindo o mesmo cenário depois de cada mudança.

O problema é que muita gente aprende PHPUnit pelo caminho errado. Primeiro aprende `assertEquals()`, depois cria um teste que chama um método trivial, vê uma barra verde e conclui que existe uma suíte. Só que em Moodle a parte interessante começa quando o teste precisa de curso, usuário, contexto, capability, activity module, arquivo, evento, task, Web Service ou banco. A plataforma já possui uma infraestrutura enorme para isso e, quando usamos essa infraestrutura corretamente, o teste deixa de ser uma imitação frágil do ambiente real e passa a executar a regra dentro de um Moodle isolado preparado especificamente para teste.

Neste capítulo vamos continuar usando `mod_checkpoint` como referência. A atividade já possui instância, respostas, notas, completion, eventos e backup, portanto ela é um bom laboratório para mostrar testes de DML, capabilities, Events, Hooks, Tasks, External Functions, Privacy e upgrades. O objetivo não é terminar com cem testes porque cem parece um número bonito, mas construir uma suíte que detecte mudanças de comportamento importantes e permita refatorar sem transformar cada alteração em uma sessão de tentativa e erro no navegador.

## 25.1 O que PHPUnit testa no Moodle

PHPUnit é usado para testar comportamento de código PHP de forma automatizada. Em Moodle isso inclui desde classes puras sem qualquer dependência da plataforma até fluxos de integração que escrevem no banco, criam usuários, manipulam contexts, disparam eventos e trabalham com APIs do core.

Isso faz com que a expressão "teste unitário" seja usada de maneira um pouco ampla no dia a dia. Um teste que cria curso e grava registros no banco não é unitário no sentido acadêmico mais estrito, mas continua sendo executado pela infraestrutura PHPUnit do Moodle e normalmente fica na mesma suíte.

O mais importante é saber o nível de isolamento necessário para cada caso e não forçar um teste de navegador quando um teste PHP resolve o problema em milissegundos.

## 25.2 PHPUnit versus Behat

PHPUnit e Behat não competem entre si. PHPUnit testa código e comportamento em nível de PHP, enquanto Behat testa jornadas pela interface do usuário.

Se eu quero saber se uma regra de completion retorna `COMPLETION_COMPLETE` quando o aluno enviou uma resposta válida, PHPUnit é melhor. Se eu quero garantir que o professor consegue abrir o formulário, marcar a opção, salvar e depois o aluno vê o estado correto na interface, Behat é mais adequado.

O erro é usar Behat para cada combinação de regra de negócio, porque o teste fica muito mais lento, ou usar PHPUnit para simular detalhes de HTML e JavaScript que pertencem à experiência real da interface.

## 25.3 Estrutura `tests/`

Os testes ficam dentro do diretório `tests/` do componente.

```
mod/checkpoint/
    tests/
        generator/
            lib.php
        external/
            submit_response_test.php
        completion_test.php
        event_test.php
        instance_manager_test.php
        privacy_test.php
```

Arquivos de teste precisam terminar em `_test.php`, devem usar nome em minúsculas e, segundo a convenção atual do Moodle, cada arquivo deve conter uma única testcase class cujo nome corresponda ao arquivo.

## 25.4 Namespace dos testes

Os arquivos dentro de `tests/` seguem as mesmas regras gerais de namespace usadas em `classes/`. Um teste de `mod_checkpoint` pode ficar em:

```
namespace mod_checkpoint;

final class instance_manager_test extends \advanced_testcase {
}
```

Quando o teste está organizado em subpasta, como `tests/external/`, o namespace pode acompanhar a unidade testada, por exemplo `mod_checkpoint\external`.

Não crie um namespace artificial `mod_checkpoint\tests` apenas porque o arquivo está dentro da pasta `tests`, salvo se houver uma razão concreta para isso.

## 25.5 PHPUnit 11.4 no Moodle 5.0

Moodle 5.0 migrou o core para PHPUnit 11.4, enquanto Moodle 4.4 e 4.5 continuam na família PHPUnit 9.6. Essa diferença importa bastante quando a mesma base de plugin precisa ser testada nas duas famílias, porque não é apenas o número do executável que mudou; APIs removidas, assinaturas e práticas recomendadas também mudam.

No PHPUnit 11.4, data providers precisam ser public static e várias APIs antigas deixaram de existir, enquanto attributes ganharam espaço para metadata de testes. Não copie configuração de PHPUnit 9.6 para uma branch Moodle 5.0 e tente corrigir os erros um por um sem antes verificar o guia de upgrade, porque parte da diferença está na própria infraestrutura de testes do core.

Se o plugin mantém uma única branch para Moodle 4.5 e Moodle 5.x, seja conservador com recursos específicos da versão do PHPUnit. Em muitos projetos, manter branches separadas por linha principal do Moodle reduz bastante a quantidade de compatibilidade artificial dentro dos próprios testes.

Trate 11.4 como parte da plataforma Moodle 5.0, não como uma dependência escolhida livremente pelo plugin. O composer.lock e a infraestrutura da branch definem o conjunto compatível; instalar um PHPUnit global mais novo porque "é melhor" pode produzir falhas que não existem no ambiente real do Moodle.

## 25.6 Instalando PHPUnit

PHPUnit entra como dependência de desenvolvimento do Moodle via Composer. Em uma instalação de desenvolvimento, o fluxo começa normalmente com:

```
composer install
```

Depois disso o executável fica disponível em `vendor/bin/phpunit`.

Não instale uma versão global aleatória do PHPUnit e espere que ela seja compatível com qualquer branch do Moodle. A versão suportada faz parte do conjunto de dependências da própria branch.

## 25.7 O ambiente de testes é separado

A suíte não deve executar contra as tabelas reais da sua instalação. O Moodle exige um dataroot separado e um prefixo próprio para PHPUnit.

Em `config.php`:

```php
$CFG->phpunit_prefix = 'phpu_';
$CFG->phpunit_dataroot = '/var/moodledata_phpunit';
```

Também é possível configurar um banco completamente separado usando as opções `phpunit_db*`, o que eu prefiro em ambientes de CI e laboratórios mais controlados.

A ideia é simples: teste destrói e recria estado o tempo todo. Se esse ambiente aponta para dados reais, o problema deixou de ser teste e virou incidente.

## 25.8 Inicializando o ambiente

Depois de configurar, inicialize:

```
php admin/tool/phpunit/cli/init.php
```

Em Moodle 5.1, considerando a nova árvore pública, o caminho físico pode aparecer sob `public/admin/...` dependendo da forma como o projeto está organizado, mas o importante é executar o utilitário correspondente à branch usada.

Esse processo cria as estruturas de teste e gera `phpunit.xml` com as suítes conhecidas pelo Moodle.

## 25.9 Quando rodar `init.php` novamente

O ambiente precisa acompanhar o código instalado. Mudança de versão do Moodle, instalação ou remoção de plugin e determinadas alterações de schema podem exigir nova inicialização.

Não tente consertar uma suíte estranha apagando tabelas aleatoriamente. Quando o ambiente está fora de sincronia com o código, recrie ou atualize pelo utilitário oficial da sua branch.

## 25.10 Rodando todos os testes

O comando mais simples é:

```
vendor/bin/phpunit
```

Isso pode levar bastante tempo em uma instalação completa. Durante desenvolvimento, normalmente você deve executar apenas o componente ou testcase em que está trabalhando e deixar a suíte maior para CI ou validação antes do merge.

## 25.11 Rodando apenas o plugin

Depois que as configurações de componentes foram geradas, você pode executar PHPUnit usando o `phpunit.xml` específico daquele componente ou usar filtros.

Um exemplo prático:

```
vendor/bin/phpunit --testsuite mod_checkpoint_testsuite
```

O nome exato da suite depende da configuração gerada, então verifique o `phpunit.xml` da branch em uso em vez de decorar nomes encontrados em exemplos de outra versão.

## 25.12 Rodando uma classe ou método

Durante desenvolvimento, filtro economiza bastante tempo:

```
vendor/bin/phpunit --filter instance_manager_test
```

Ou um método específico:

```
vendor/bin/phpunit --filter test_create_instance
```

Se você alterou apenas uma regra de cálculo e continua executando milhares de testes a cada salvamento, não está ganhando qualidade, está apenas aumentando o tempo entre escrever e receber feedback.

## 25.13 `basic_testcase`

Moodle possui `basic_testcase` para testes realmente simples que não alteram banco, filesystem nem globais importantes.

Uma função pura como esta:

```php
final class score_normalizer {
    public static function normalize(float $score): float {
        return max(0, min(100, $score));
    }
}
```

Pode ser testada sem preparar curso, usuário ou banco.

```php
final class score_normalizer_test extends \basic_testcase {
    public function test_limits_score(): void {
        $this->assertSame(100.0, score_normalizer::normalize(120));
        $this->assertSame(0.0, score_normalizer::normalize(-3));
    }
}
```

Se não precisa de Moodle state, não use `advanced_testcase` por reflexo.

## 25.14 `advanced_testcase`

A maior parte dos testes de plugin Moodle acaba usando `advanced_testcase`, porque ela fornece helpers para banco, usuário atual, generators, eventos, mensagens, hooks, contexts e reset do ambiente.

```
namespace mod_checkpoint;

final class response_service_test extends \advanced_testcase {
    public function test_submit_response(): void {
        // Teste com dados Moodle.
    }
}
```

A classe é uma integração do core com PHPUnit, não uma simples alias de `PHPUnit\Framework\TestCase`.

## 25.15 Isolamento entre testes

Um teste não deve depender do que outro deixou no banco. A infraestrutura do Moodle restaura o estado entre testes e monitora alterações em banco, filesystem e globais.

Isso significa que o método abaixo deve funcionar sozinho, mesmo se for executado antes de qualquer outro:

```php
public function test_submit_response(): void {
    $course = $this->getDataGenerator()->create_course();
    // ...
}
```

Se você precisa que `test_create()` rode antes de `test_update()`, provavelmente está testando uma sequência compartilhada em vez de dois cenários independentes.

## 25.16 `resetAfterTest()`

Quando o teste altera estado persistente ou globais, `resetAfterTest()` informa à infraestrutura que essas alterações são esperadas e que o ambiente deve voltar ao estado original.

```php
public function test_create_response(): void {
    $this->resetAfterTest();

    $course = $this->getDataGenerator()->create_course();
    // ...
}
```

A documentação moderna também recomenda não transformar `resetAfterTest()` em ritual automático colocado em todo `setUp()`, porque resets desnecessários custam memória e tempo. Use em testes que realmente modificam estado e evite preparar um banco inteiro para casos que poderiam ser puros.

## 25.17 Não use `resetAfterTest(false)` para acelerar suíte

É tecnicamente possível pedir para manter dados entre testes, mas isso destrói isolamento e normalmente cria uma suíte dependente de ordem.

O ganho de alguns segundos desaparece quando um teste passa sozinho e falha na suíte porque outro deixou uma configuração diferente.

Performance de teste deve ser resolvida reduzindo setup desnecessário, usando generators de forma inteligente e separando testes puros de integração, não compartilhando sujeira entre casos.

## 25.18 `setUp()`

`setUp()` é útil quando vários testes realmente precisam da mesma preparação, mas use com moderação.

```php
protected function setUp(): void {
    parent::setUp();

    $this->service = new response_service();
}
```

Evite criar curso, dez usuários e três atividades no `setUp()` se metade dos testes não usa esses dados. Esse padrão deixa todos os casos mais lentos e esconde o cenário real de cada teste.

## 25.19 `setUpBeforeClass()`

`setUpBeforeClass()` serve para preparação estática da testcase, não para criar dados Moodle que precisam ser resetados por teste.

Use para includes necessários em código não autoloadable ou preparação que não altera banco e estado da aplicação.

Se você cria registros em `setUpBeforeClass()` esperando que eles existam para todos os testes, está lutando contra o mecanismo de isolamento da suíte.

## 25.20 O banco de testes

Dentro de `advanced_testcase`, `$DB` continua sendo a DML API normal, mas apontando para o ambiente PHPUnit.

Isso é ótimo porque você testa o mesmo código que roda em produção sem inventar um banco fake incompatível com PostgreSQL, MariaDB ou outro driver suportado.

```php
global $DB;

$this->assertTrue($DB->record_exists('checkpoint_response', [
    'checkpointid' => $checkpoint->id,
    'userid' => $student->id,
]));
```

O teste verifica o efeito real da API sobre a persistência.

## 25.21 Não teste DML do Moodle

Se seu service chama `$DB->insert_record()`, não existe valor em testar se `insert_record()` consegue inserir uma linha. Isso já é responsabilidade do core.

Teste a regra do seu componente. O usuário correto foi gravado? O registro pertence à instância correta? Uma segunda resposta atualiza ou duplica? A exceção correta aparece quando a atividade está fechada?

Teste comportamento do plugin, não se o Moodle sabe fazer SQL.

## 25.22 Fixtures

Fixture é dado preparado para o cenário de teste. Pode ser criado com generator, dataset, objetos simples ou arquivos específicos.

Eu prefiro generators para entidades Moodle e pequenos builders/helpers para dados do plugin. Arquivos XML e CSV fazem sentido quando o volume ou a estrutura ficariam ilegíveis em PHP.

O erro é manter um dump de banco gigantesco como fixture e obrigar toda a suíte a depender de IDs mágicos que ninguém mais entende.

## 25.23 Data generators

O principal ponto de entrada é:

```php
$generator = $this->getDataGenerator();
```

Ele sabe criar diversas entidades do core e também carregar generators específicos de plugins.

Em vez de montar manualmente registros de curso, context e categoria, você cria uma entidade válida pela infraestrutura de testes.

## 25.24 Criando usuário

```php
$user = $this->getDataGenerator()->create_user([
    'username' => 'student1',
    'email' => 'student1@example.com',
]);
```

Não dependa de IDs fixos. Guarde o objeto devolvido e use `$user->id`.

No início do ambiente existem contas estruturais como admin e guest, mas seu teste não deveria presumir uma sequência de IDs além dos contratos explicitamente fornecidos pela API.

## 25.25 Criando curso

```php
$course = $this->getDataGenerator()->create_course([
    'fullname' => 'Course for checkpoint test',
    'shortname' => 'CHKTEST',
]);
```

O generator cria uma estrutura de curso válida, com category e demais dependências tratadas pelo Moodle.

## 25.26 Criando categoria

```php
$category = $this->getDataGenerator()->create_category([
    'name' => 'Testing category',
]);
```

Depois o curso pode usar `$category->id`. Isso deixa explícita a relação que realmente importa para o cenário.

## 25.27 Matriculando usuários

O generator possui helper simplificado para matrícula:

```php
$this->getDataGenerator()->enrol_user(
    $student->id,
    $course->id,
    $studentroleid,
    'manual'
);
```

Para testar especificamente um enrolment plugin, aí sim use a API daquele plugin em vez do helper, porque o comportamento do método de matrícula é justamente a unidade sob teste.

## 25.28 Criando activity modules

Para módulos, a forma curta é:

```php
$checkpoint = $this->getDataGenerator()->create_module('checkpoint', [
    'course' => $course->id,
    'name' => 'Checkpoint 1',
]);
```

Isso exige que `mod_checkpoint` ofereça um generator compatível ou que o generator genérico consiga trabalhar com seu `mod_form` e callbacks.

## 25.29 Generator próprio do plugin

Um módulo que aparece em muitos testes deveria fornecer `tests/generator/lib.php`.

```php
class mod_checkpoint_generator extends testing_module_generator {
    public function create_instance($record = null, array $options = null) {
        $record = (object)($record ?? []);

        if (!isset($record->name)) {
            $record->name = 'Checkpoint ' . $this->instancecount;
        }

        if (!isset($record->grade)) {
            $record->grade = 100;
        }

        return parent::create_instance($record, $options);
    }
}
```

O objetivo não é esconder toda configuração, mas fornecer defaults válidos para que cada teste informe apenas aquilo que interessa ao cenário.

## 25.30 Generator não deve criar cenário inteiro por padrão

Se `create_instance()` cria cinco usuários, grupos e respostas automaticamente, cada teste começa com estado que ele talvez não precise.

O generator da entidade deve criar a entidade. Cenários maiores podem usar helpers específicos dentro da testcase ou métodos adicionais como `create_response()`.

Essa separação evita fixtures mágicas difíceis de entender.

## 25.31 Um helper `create_response()`

No generator do plugin:

```php
public function create_response(array $data): stdClass {
    global $DB;

    $record = (object)[
        'checkpointid' => $data['checkpointid'],
        'userid' => $data['userid'],
        'answertext' => $data['answertext'] ?? 'Test answer',
        'timemodified' => time(),
    ];

    $record->id = $DB->insert_record('checkpoint_response', $record);
    return $record;
}
```

Esse helper é ótimo para preparar um estado conhecido quando a criação da resposta não é aquilo que o teste quer validar.

Quando o próprio comportamento sob teste é a criação de resposta, use o service real, não o generator, porque senão você pula justamente o código que queria verificar.

## 25.32 `setUser()`

Para simular o usuário atual:

```php
$this->setUser($student);
```

Isso atualiza a sessão e caches de acesso relevantes para a execução do teste.

Não faça simplesmente:

```php
$USER = $student;
```

Alterar a global na mão não reproduz corretamente o comportamento que o helper do core prepara.

## 25.33 `setAdminUser()` e `setGuestUser()`

Existem atalhos úteis:

```php
$this->setAdminUser();
$this->setGuestUser();
```

E para voltar ao estado sem login:

```php
$this->setUser(null);
```

Essa facilidade torna simples testar o mesmo service em três perspectivas de autorização diferentes.

## 25.34 Assertions

Use as assertions padrão do PHPUnit quando elas descrevem bem o comportamento.

```php
$this->assertSame($student->id, $response->userid);
$this->assertTrue($service->can_submit($student->id));
$this->assertCount(2, $responses);
$this->assertNull($result);
```

Não escolha `assertEquals()` para tudo. `assertSame()` detecta diferença de tipo e frequentemente representa melhor contratos em PHP.

## 25.35 `assertEquals()` versus `assertSame()`

`assertEquals()` compara valores com uma semântica mais flexível, enquanto `assertSame()` exige valor e tipo iguais.

Se sua API promete `int`, isto é mais forte:

```php
$this->assertSame(42, $result);
```

Do que:

```php
$this->assertEquals(42, $result);
```

Um retorno `'42'` poderia esconder uma inconsistência que depois aparece em JSON, type hint ou comparação estrita.

## 25.36 Testando exceptions

Quando erro faz parte do contrato, teste a exception.

```php
$this->expectException(\required_capability_exception::class);

$service->delete_response($responseid);
```

Quando existe uma mensagem ou errorcode relevante, valide o dado estável, mas evite acoplar o teste a texto humano traduzível que pode mudar sem alterar o comportamento.

## 25.37 Não use `try/catch` apenas para fazer assert de exception

Este padrão é desnecessário:

```php
try {
    $service->execute();
    $this->fail('Exception expected');
} catch (moodle_exception $e) {
    $this->assertSame('invalidstate', $e->errorcode);
}
```

Pode haver casos em que você precisa inspecionar a exception, mas quando basta verificar tipo, use `expectException()` e deixe o PHPUnit cuidar do fluxo.

## 25.38 Data providers

Data provider permite executar o mesmo teste com diferentes entradas.

```php
#[\PHPUnit\Framework\Attributes\DataProvider('score_provider')]
public function test_normalize(float $input, float $expected): void {
    $this->assertSame($expected, score_normalizer::normalize($input));
}

public static function score_provider(): array {
    return [
        'normal' => [50.0, 50.0],
        'below zero' => [-1.0, 0.0],
        'above max' => [130.0, 100.0],
    ];
}
```

Em PHPUnit 11 o provider precisa ser público e estático.

## 25.39 Compatibilidade de data providers com Moodle 4.5

Se o plugin também roda em Moodle 4.5, usar attributes pode complicar compatibilidade. O formato por annotation continua sendo uma opção para branches que precisam atravessar PHPUnit 9.6 e 11.

```php
/**
 * @dataProvider score_provider
 */
public function test_normalize(float $input, float $expected): void {
}
```

Por isso a estratégia de branch do plugin também afeta a escrita dos testes.

## 25.40 Não crie dados Moodle no data provider

```php
O provider deve fornecer valores, não executar $this->getDataGenerator() ou escrever no banco.
```

Providers são avaliados fora do mesmo ciclo de reset do teste, e no PHPUnit moderno também precisam ser estáticos.

Passe uma descrição do cenário e crie as entidades dentro do próprio test method.

## 25.41 Mocks

Mocks são úteis quando a unidade depende de um colaborador que você realmente quer substituir.

Imagine um service que depende de um cliente externo:

```php
$client = $this->createMock(external_client::class);
$client->expects($this->once())
    ->method('send')
    ->willReturn(new send_result(true));
```

Isso permite testar sua regra sem acessar rede.

## 25.42 Não mocke o Moodle inteiro

Se o teste precisa de `$DB`, context, course e capability, normalmente é melhor usar o ambiente real de testes do Moodle do que construir dez mocks de objetos internos.

Mock demais transforma o teste numa validação daquilo que você imaginou que o Moodle faz, não daquilo que ele realmente faz.

Use infraestrutura real para APIs do core e mocks principalmente nas bordas controladas pelo seu design, como clientes HTTP e gateways internos.

## 25.43 Test doubles

Mock é só um tipo de test double. Você também pode usar fake, stub e spy.

Um fake de API externa pode implementar a mesma interface e armazenar chamadas em memória, deixando o teste mais legível do que um mock configurado com vinte expectativas.

A escolha depende do que você quer provar. Se precisa afirmar que `send()` foi chamado exatamente uma vez, mock ou spy funciona. Se quer apenas uma implementação previsível, fake costuma ser mais simples.

## 25.44 Dependency injection melhora testes

Código assim é difícil de substituir:

```php
$client = new erp_client();
$client->send($data);
```

Código assim é mais testável:

```php
public function __construct(private erp_client_interface $client) {
}
```

Agora o teste pode passar uma implementação controlada.

Isso não significa transformar todo plugin em framework de DI, mas dependências externas importantes deveriam ser substituíveis sem hack.

## 25.45 Testando DML

Suponha que o service garanta uma resposta única por aluno e atividade.

O teste deve exercitar a API pública:

```php
$first = $service->submit($checkpoint->id, $student->id, 'A');
$second = $service->submit($checkpoint->id, $student->id, 'B');

$this->assertSame($first->id, $second->id);
$this->assertSame('B', $second->answertext);
```

Depois uma consulta ao banco pode confirmar que existe uma única linha.

## 25.46 Teste restrições de banco quando elas importam

Se sua regra exige unicidade e o schema possui índice unique, teste também a consequência quando relevante, principalmente em caminhos que podem sofrer concorrência.

Não substitua a regra de negócio pelo teste do índice, mas garanta que o schema protege uma invariável crítica que o código sozinho não consegue garantir em duas requisições simultâneas.

## 25.47 Testando capabilities

Capabilities merecem testes porque é muito fácil verificar a permissão certa no contexto errado.

Um cenário básico cria curso, atividade, usuário e papel, depois executa a operação com context module.

```php
$this->setUser($student);

$this->expectException(\required_capability_exception::class);
$service->grade_response($responseid, 80);
```

Em seguida, repita com um usuário que possui a capability e confirme sucesso.

## 25.48 Não use admin em todos os testes

Admin ignora ou possui praticamente todas as capabilities, então um teste feito somente com admin pode esconder exatamente o bug de autorização que deveria detectar.

Use admin para setup quando necessário, mas valide a ação final com o papel real que executará aquela operação em produção.

## 25.49 Criando papel de teste

Você pode usar generators para papel e atribuição, ou aproveitar archetypes existentes conforme o cenário.

Quando a regra depende de uma capability específica, criar um role mínimo deixa o teste mais preciso do que usar editingteacher e herdar dezenas de permissões que não são relevantes.

## 25.50 Contexto correto

Teste explicitamente o caso em que a mesma capability existe no curso mas não na atividade, se essa distinção faz parte da segurança do plugin.

Isso parece exagero até aparecer uma regressão em que alguém troca:

```php
context_module::instance($cmid)
```

Por:

```php
context_course::instance($courseid)
```

E o teste passa a impedir que a falha chegue à produção.

## 25.51 Testando Events

`advanced_testcase` pode redirecionar Events para um sink.

```php
$sink = $this->redirectEvents();

$service->submit($checkpoint->id, $student->id, 'Answer');

$events = $sink->get_events();
$sink->close();

$this->assertCount(1, $events);
$this->assertInstanceOf(
    \mod_checkpoint\event\response_submitted::class,
    $events[0],
);
```

Isso evita depender do logstore para saber se o evento foi disparado.

## 25.52 Verifique os dados importantes do evento

Não basta `assertInstanceOf()`. Quando o contrato importa, valide context, objectid, relateduserid e `other`.

```php
$event = reset($events);

$this->assertSame($response->id, $event->objectid);
$this->assertSame($student->id, $event->relateduserid);
$this->assertSame($cm->id, $event->contextinstanceid);
```

Um evento com classe correta e IDs errados continua sendo um evento errado.

## 25.53 Testando Hooks

A infraestrutura atual permite redirecionar callbacks de Hook durante testes.

```php
$called = false;

$this->redirectHook(
    \mod_checkpoint\hook\before_submit::class,
    function($hook) use (&$called): void {
        $called = true;
    }
);

$service->submit(...);
$this->assertTrue($called);
```

Depois a infraestrutura limpa os redirects no teardown, mas evite criar dependência entre testes baseada em callback registrado manualmente.

## 25.54 Hook que altera dados

Se o Hook permite mutação, teste o resultado da mutação, não apenas que a callback foi chamada.

Por exemplo, um Hook que ajusta limite de tentativas deveria resultar no valor final usado pelo service.

Isso protege o contrato útil do Hook e permite alterar detalhes internos do dispatcher sem quebrar o teste.

## 25.55 Testando Tasks

Para uma task, normalmente você não precisa esperar cron real. Instancie a task, configure custom data quando necessário e chame `execute()`.

```php
$task = new \mod_checkpoint\task\recalculate_scores();
$task->set_custom_data([
    'checkpointid' => $checkpoint->id,
]);

$task->execute();
```

Depois verifique o estado final no banco ou no serviço externo fake.

## 25.56 Scheduled Task versus Adhoc Task em teste

Scheduled Task tende a ser testada como unidade de execução, enquanto Adhoc Task também precisa ter o custom data correto.

Se o código sob teste é o observer que enfileira a task, teste o enfileiramento no observer e teste a lógica da task separadamente. Não transforme um teste simples em cron completo apenas para provar duas coisas diferentes de uma vez.

## 25.57 Idempotência de Tasks

Uma task de integração deveria ser testada duas vezes com o mesmo estado.

```php
$task->execute();
$task->execute();

$this->assertSame(1, $DB->count_records('checkpoint_sync', [
    'checkpointid' => $checkpoint->id,
]));
```

Esse teste encontra duplicações que quase nunca aparecem no primeiro caminho feliz.

## 25.58 Testando mensagens

Você pode redirecionar mensagens com um sink.

```php
$sink = $this->redirectMessages();

$service->notify_teacher($checkpoint->id);

$messages = $sink->get_messages();
$sink->close();

$this->assertCount(1, $messages);
```

Isso é muito melhor do que tentar consultar email real ou caixa de mensagem externa.

## 25.59 Testando email

Para código que realmente usa envio de email, o ambiente de teste também oferece redirecionamento de email.

A mesma regra vale: capture, execute e valide campos relevantes, sem enviar nada para SMTP externo durante PHPUnit.

Teste automatizado não deveria surpreender alguém com cinquenta emails porque você esqueceu de isolar infraestrutura.

## 25.60 Testando External Functions

External Functions precisam de testes de parâmetros, contexto, capabilities e retorno.

Um teste útil não chama apenas `execute()` com admin. Ele verifica pelo menos um caso permitido, um negado e entrada inválida.

Na documentação atual existem helpers específicos para Web Services, mas a lógica central continua a mesma: preparar dados, estabelecer usuário, chamar a função e validar o contrato retornado.

## 25.61 Validação de retorno de External Function

Além de testar o array produzido, valide a estrutura externa quando isso fizer sentido, porque o Moodle também valida retorno segundo `execute_returns()`.

Uma mudança aparentemente inocente de `int` para string ou ausência de campo pode quebrar um cliente mesmo que o método PHP continue funcionando.

O teste deveria proteger o contrato público, não somente a implementação.

## 25.62 Testando Privacy API

Privacy provider é excelente candidato a PHPUnit porque export e delete possuem muitos casos que seriam tediosos de verificar manualmente.

Crie usuário, contexto e dados pessoais, chame `get_contexts_for_userid()`, exporte, verifique o conteúdo e depois execute exclusão.

No fim, confirme que os registros corretos desapareceram e que dados de outro usuário permaneceram.

## 25.63 Privacy em lote

Se o provider implementa `delete_data_for_users()`, teste dois ou mais usuários dentro do mesmo contexto e um terceiro fora da lista aprovada.

Isso encontra bugs em `get_in_or_equal()` e deletes amplos que um teste de usuário único não perceberia.

Privacidade não pode ser testada só com `assertTrue(true)` para satisfazer checklist.

## 25.64 Testando Files API

Quando a regra usa arquivos, crie arquivos no storage de teste por `get_file_storage()` e depois verifique a filearea.

Não grave arquivos manualmente em `$CFG->dataroot`. O objetivo é testar o plugin usando a mesma Files API que será usada em produção.

Se a exclusão de uma entidade deve limpar arquivos, confirme isso explicitamente.

## 25.65 Testando Gradebook

Para activity modules, execute o callback ou service que atualiza grades e depois consulte a Gradebook API ou registros de forma adequada.

O teste interessante é verificar se nota, máximo, scale e feedback chegam corretamente, além de confirmar comportamento quando a nota é desabilitada ou alterada.

Não teste escrevendo direto em `grade_grades`, porque isso ignora justamente a API que o plugin deve usar.

## 25.66 Testando Completion

Completion customizada deve ser exercitada com estados diferentes.

Para `mod_checkpoint`, crie cenário sem resposta, com resposta, com grade abaixo do mínimo e com grade suficiente, conforme as regras implementadas.

A classe `custom_completion` deve devolver exatamente o estado esperado para cada combinação, sem depender de clique em navegador.

## 25.67 Testando grupos

Se a regra muda com `SEPARATEGROUPS`, crie dois grupos e usuários distintos. Teste professor com `accessallgroups`, aluno no grupo A e tentativa de acessar dados do grupo B.

Um teste com apenas um grupo não prova que o isolamento funciona.

## 25.68 Testando cache

Cache merece teste quando faz parte do comportamento observável, principalmente invalidação.

Um bom cenário é preencher cache, alterar a fonte real por meio da API pública e confirmar que a próxima leitura devolve o novo valor.

Não teste detalhes internos como o nome exato de uma chave se isso não faz parte do contrato, porque esse tipo de teste impede refatoração sem proteger comportamento útil.

## 25.69 Testando upgrade

Upgrade é um dos testes mais importantes em plugin distribuído e um dos mais esquecidos. O problema é que ele exige simular um estado antigo e executar apenas o passo de upgrade relevante.

Quando uma migração transforma dados, prepare registros no formato antigo, execute a função de upgrade correspondente e valide schema e conteúdo resultantes.

Esses testes precisam ser escritos com cuidado porque o ambiente de PHPUnit já representa o schema atual, portanto muitas vezes a preparação exige DDL temporária ou helpers específicos da estratégia de teste do projeto.

## 25.70 Nem todo upgrade precisa de teste automatizado

Adicionar uma coluna simples com default previsível pode estar suficientemente protegido por testes de instalação e CI, dependendo do risco do projeto.

Migração que converte milhares de registros, altera semântica ou reconstrói relacionamento merece teste específico.

Teste onde a regressão seria cara, não onde apenas aumenta o contador de cobertura.

## 25.71 Testando backup e restore

Backup/restore pode ser exercitado por helpers e controladores do subsistema, mas esses testes tendem a ser mais pesados. Para um módulo com dados complexos, vale ter pelo menos um teste que crie a instância completa, execute backup e restore e compare o estado funcional.

O objetivo não é comparar IDs, porque eles mudam. Compare dados, files, mappings e relações que deveriam sobreviver.

O Capítulo 24 já mostrou o fluxo; aqui a novidade é automatizar a garantia.

## 25.72 Cobertura de código

Coverage ajuda a encontrar áreas sem teste, mas 100% não é sinônimo de boa suíte.

Você pode executar todas as linhas sem fazer nenhuma assertion relevante, ou testar getters triviais enquanto deixa uma regra crítica sem caso de erro.

Use coverage como mapa, não como meta isolada.

## 25.73 `coverage.php`

Desde Moodle 4.0 existe configuração padrão de cobertura para plugins, incluindo `classes`, `tests/generator`, `lib.php` e outros arquivos convencionais. Um `coverage.php` só é necessário quando você quer ajustar esse conjunto.

Não crie um arquivo apenas porque algum tutorial antigo dizia que todo plugin precisava.

## 25.74 `#[CoversClass]`

Em Moodle 5.x com PHPUnit moderno, attributes podem declarar a classe coberta:

```php
#[\PHPUnit\Framework\Attributes\CoversClass(response_service::class)]
final class response_service_test extends \advanced_testcase {
}
```

Para plugins que também precisam rodar em PHPUnit 9.6, annotations podem ser a escolha compatível.

## 25.75 Cobertura deve seguir a unidade testada

Prefira declarar cobertura da classe como um todo em vez de marcar dezenas de métodos individualmente.

Isso também força uma pergunta saudável: qual classe este arquivo realmente testa? Se a resposta for "umas vinte classes porque montei o sistema inteiro", talvez a testcase esteja grande demais ou o código esteja acoplado demais.

## 25.76 O que não vale a pena testar

Não teste getters sem lógica, constantes, PHP nativo, DML básico do Moodle, funcionamento de `get_string()` ou se `moodle_url` concatena parâmetros corretamente.

Teste a sua decisão sobre esses recursos. O plugin escolhe a URL correta? A string correta é usada no estado de erro? O registro certo é carregado?

Se o teste poderia estar no core e não menciona nenhuma regra do seu componente, talvez você esteja testando a camada errada.

## 25.77 Testes frágeis

Um teste frágil quebra quando a implementação muda sem que o comportamento mude.

Exemplo clássico é verificar ordem exata de cinco chamadas internas quando o contrato público apenas promete um resultado. Uma refatoração legítima troca a ordem e cinquenta testes ficam vermelhos apesar de nada ter sido quebrado para o usuário.

Teste resultado, efeitos e contratos importantes, não coreografia interna desnecessária.

## 25.78 Não use Reflection como primeira opção

Se a única forma de testar uma regra importante é acessar método private com Reflection, talvez essa regra mereça uma classe própria com API pública interna bem definida.

Reflection pode ser último recurso em código legado, mas não deveria orientar o design novo.

Encapsulamento também existe durante teste.

## 25.79 Tempo e testes

Código baseado em `time()` pode gerar testes intermitentes. Quando o core ou a arquitetura permitir, use abstrações de clock ou compare por janela com helpers adequados.

`advanced_testcase` possui helpers como `assertTimeCurrent()`, úteis quando você só precisa garantir que um timestamp foi criado agora.

Não escreva `sleep(2)` para fazer timestamps ficarem diferentes. Além de lento, isso ainda pode ser instável em CI.

## 25.80 Random e testes

Randomização é ótima para produção e ruim para reprodutibilidade quando não é controlada.

Se o algoritmo sorteia uma questão, injete seed, escolha uma fonte determinística ou teste invariantes que independem da escolha específica.

Um teste que falha uma vez a cada vinte execuções é pior do que um teste que falha sempre, porque rouba confiança na suíte inteira.

## 25.81 Chamadas externas

Unit tests padrão não deveriam depender da internet. Mocke ou fake o cliente externo e teste sua regra local separadamente.

Se existe necessidade de um teste de integração real com serviço externo, marque-o como long test ou coloque em uma suíte específica com configuração explícita.

Nunca faça a suíte padrão depender de o ERP do cliente estar online às três da manhã.

## 25.82 Long tests

Moodle possui suporte para testes longos. Testes que demoram mais de aproximadamente dez segundos ou acessam recursos caros deveriam ficar fora da execução padrão.

Uma suíte rápida é executada com frequência. Uma suíte que leva quarenta minutos para cada alteração acaba sendo ignorada, e teste ignorado não protege nada.

## 25.83 Performance da suíte

Muita lentidão vem de setup desnecessário. Criar curso e usuário em cem testes quando metade poderia usar `basic_testcase` custa mais do que parece.

Também evite reset pesado em `setUp()` para todos os casos. Coloque dados perto do teste que realmente precisa deles.

A mesma disciplina de performance aplicada em produção vale para a infraestrutura de desenvolvimento.

## 25.84 Test names

Nome do teste deve explicar comportamento.

Prefira:

```
public function test_student_cannot_grade_response(): void
```

Em vez de:

```
public function test_case_03(): void
```

Quando o teste falha no CI, o nome deve ajudar a entender o que foi quebrado sem abrir o arquivo imediatamente.

## 25.85 Um comportamento por teste

Isso não significa uma única assertion. Um comportamento pode exigir várias assertions relacionadas.

O problema é colocar criação, edição, exclusão, backup e privacy no mesmo método e depois receber "1 test failed" sem saber qual contrato realmente foi violado.

Divida por intenção, não por quantidade arbitrária de assertions.

## 25.86 Comentários em testes

Teste bem escrito deveria contar a história pelo nome, setup e assertions. Use comentários para explicar decisões não óbvias, não para narrar cada linha.

Isto é ruído:

```php
// Create user.
$user = $this->getDataGenerator()->create_user();
```

Isto pode ser útil:

```
// The user has the capability at course level, but not in this module context.
```

O segundo comentário explica por que o cenário existe.

## 25.87 AAA sem virar religião

Arrange, Act, Assert ajuda a manter teste legível.

```php
// Arrange.
$checkpoint = ...;
$student = ...;

// Act.
$response = $service->submit(...);

// Assert.
$this->assertSame(...);
```

Mas não precisa colocar três comentários em todo método se a divisão já está óbvia. A estrutura serve à leitura, não a um template rígido.

## 25.88 Testando `debugging()`

Se o comportamento esperado chama `debugging()`, `advanced_testcase` possui assertions próprias.

```php
$this->assertDebuggingCalled('Deprecated option used');
```

E existe também `assertDebuggingNotCalled()`.

Isso é melhor do que capturar output ou alterar `error_reporting()` manualmente.

## 25.89 `expectOutputRegex()`

Alguns callbacks legados ainda escrevem diretamente na saída. PHPUnit consegue validar esse output quando realmente faz parte do contrato.

```php
$this->expectOutputRegex('/submitted/');
```

Mas para código novo prefira Output API e dados testáveis em classes, porque comparar HTML inteiro costuma gerar teste frágil.

## 25.90 Testando classes `templatable`

Uma output class pode ser testada chamando `export_for_template()` e validando o array resultante.

Isso é mais estável do que renderizar Mustache e comparar uma string HTML completa.

Se a classe promete `hasresponses`, `items` e `canedit`, teste esses dados. O template será exercitado em Behat ou testes de frontend quando necessário.

## 25.91 Testando código legado de `lib.php`

Callbacks globais podem ser chamados diretamente, mas se a regra inteira está em `lib.php`, o teste fica mais difícil de organizar.

Uma boa refatoração mantém o callback pequeno e testa a classe para a qual ele delega. Depois um teste pequeno do callback confirma que os parâmetros chegam corretamente quando esse contrato merece proteção.

Esse desenho reduz o custo de testar código legado sem transformar PHPUnit em motivo para manter arquitetura antiga.

## 25.92 Testando upgrade entre versões do plugin

Quando o plugin possui branches antigas, vale manter fixtures que representem o dado produzido pela versão anterior e executar a migração para a nova sem depender de export real de produção.

Isso é especialmente valioso em mudança de schema que converte JSON, separa tabela ou altera identificador externo.

Um upgrade que passou em instalação limpa não prova que upgrade de cliente existente funciona.

## 25.93 Testes e múltiplos bancos

Uma suíte que roda apenas em MariaDB pode esconder SQL incompatível com PostgreSQL. O código DML bem escrito reduz esse risco, mas CI com mais de um banco aumenta confiança.

Não precisa rodar todas as combinações localmente a cada commit. É exatamente aí que matrix de CI, tratada no Capítulo 27, passa a valer o custo.

## 25.94 Testes e versões Moodle

Uma função pode funcionar em 5.2 e nem existir em 4.5. Se o plugin promete ambas, a suíte precisa rodar nas duas ou você está testando apenas metade da promessa.

Evite `if (version_compare(...))` em dezenas de testes. Quando as diferenças ficam grandes, branches separadas tornam código e teste mais claros.

## 25.95 A suíte do `mod_checkpoint`

Depois dos capítulos anteriores, uma suíte razoável para `mod_checkpoint` poderia incluir:

```
tests/
    generator/
        lib.php
    external/
        submit_response_test.php
    completion_test.php
    event_test.php
    grade_test.php
    instance_manager_test.php
    privacy_test.php
    response_service_test.php
    task_test.php
```

Não existe obrigação de ter um arquivo para cada classe. A estrutura deve refletir unidades de comportamento compreensíveis.

## 25.96 Exemplo completo de `response_service_test`

```php
namespace mod_checkpoint;

final class response_service_test extends \advanced_testcase {
    public function test_submit_creates_single_response(): void {
        global $DB;

        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $checkpoint = $this->getDataGenerator()->create_module('checkpoint', [
            'course' => $course->id,
        ]);

        $this->setUser($student);

        $service = new \mod_checkpoint\local\response_service();
        $first = $service->submit($checkpoint->id, 'First');
        $second = $service->submit($checkpoint->id, 'Second');

        $this->assertSame($first->id, $second->id);
        $this->assertSame('Second', $second->answertext);
        $this->assertSame(1, $DB->count_records('checkpoint_response', [
            'checkpointid' => $checkpoint->id,
            'userid' => $student->id,
        ]));
    }
}
```

O teste não verifica como o service implementa update, apenas garante o contrato visível: uma única resposta e conteúdo atualizado.

## 25.97 Testando a regra negativa

Depois do caminho feliz, teste o que não pode acontecer.

```php
public function test_user_cannot_submit_to_other_checkpoint_context(): void {
    $this->resetAfterTest();

    // Cria dois cursos, duas instâncias e um aluno com acesso apenas ao primeiro.
    // Tenta enviar para a segunda e espera a exceção de autorização.
}
```

Esses testes negativos geralmente encontram mais vulnerabilidades do que aumentar a cobertura do caminho feliz de 80% para 95%.

## 25.98 Exercício - suíte completa do plugin

Pegue o `mod_checkpoint` construído ao longo do livro e crie uma suíte que teste criação, edição e exclusão da instância, resposta do aluno, grade, completion, capabilities, eventos, task, External Function, Privacy API e pelo menos uma migração de dados relevante.

Crie `tests/generator/lib.php` com generator da atividade e helper de resposta. Não use IDs fixos, não dependa de ordem entre testes e não crie dados no data provider. Para cada regra de autorização, tenha pelo menos um caso permitido e um negado.

Implemente um teste de idempotência para a task, um teste de Event usando sink, um teste de Privacy garantindo que excluir o aluno A não apaga dados do aluno B e um teste de External Function validando contexto e capability.

Depois rode a suíte em pelo menos duas versões Moodle suportadas pelo plugin e, quando possível, em dois bancos diferentes. Gere coverage e use o relatório para identificar uma regra importante sem teste, não para perseguir 100% artificialmente.

Por fim, delete propositalmente uma chamada de `require_capability()`, troque um `context_module` por `context_course`, remova uma invalidação de cache e faça a task inserir duplicado. A suíte deveria falhar em todos esses casos. Se continuar verde, ela está executando código, mas não está protegendo o comportamento que realmente importa.

## 25.99 O que deve ficar deste capítulo

PHPUnit em Moodle não serve para comprovar que uma função executou sem erro, serve para transformar decisões importantes do plugin em contratos executáveis. `advanced_testcase`, generators, sinks, helpers de contexto e o banco isolado existem justamente para que o teste rode próximo do comportamento real sem precisar levantar navegador e repetir uma jornada humana inteira.

Uma boa suíte deixa refatoração menos arriscada, encontra regressões de autorização antes do cliente e reduz o tempo gasto reproduzindo bugs manualmente. Mas ela só faz isso quando testa regra real. Cobertura alta com assertions vazias continua sendo uma barra verde decorativa.

No próximo capítulo vamos subir um nível e usar Behat para testar aquilo que PHPUnit deliberadamente não enxerga bem: a jornada completa do usuário pela interface, incluindo navegação, formulários, modais, JavaScript e comportamento visível no navegador.

## Referências técnicas consultadas

* MOODLE. Moodle Developer Resources. Writing PHPUnit tests, Moodle 5.1. Disponível em: https://moodledev.io/docs/5.1/guides/testing. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit. Disponível em: https://moodledev.io/general/development/tools/phpunit. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. PHPUnit 11 Upgrade. Disponível em: https://moodledev.io/general/development/tools/phpunit/upgrading-11. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. External services - Unit Testing. Disponível em: https://moodledev.io/docs/5.1/apis/subsystems/external/testing. Acesso em: 24 set. 2026.
* MOODLE. Moodle core source. `advanced_testcase`. Disponível no repositório oficial Moodle em: https://github.com/moodle/moodle. Acesso em: 24 set. 2026.

{% endraw %}
