{% raw %}

# 14 WEB SERVICES E INTEGRACOES

Chega uma hora em que o Moodle deixa de conversar apenas com ele mesmo. Um ERP precisa matricular alunos, um sistema financeiro precisa avisar que uma fatura foi paga, um aplicativo precisa buscar dados de curso, um painel externo precisa ler indicadores, o frontend precisa salvar uma alteração sem recarregar a página e, de repente, aquela classe que até ontem era chamada somente por uma página PHP passa a ser uma fronteira entre sistemas diferentes. É nesse momento que aparece um erro muito comum, o desenvolvedor pega uma função que já existe, coloca alguma coisa em `db/services.php`, gera um token e considera a integração resolvida.

Só que Web Service não é uma função PHP com acesso remoto. Quando você expõe uma operação para fora do fluxo normal da página, você cria um contrato público com parâmetros, tipos, permissões, contexto, formato de retorno, comportamento de erro e consequências que precisam continuar previsíveis mesmo quando quem chama não é o seu próprio código. A chamada pode vir do Moodle App, de JavaScript executando dentro do Moodle, de um ERP, de um webhook, de um script de linha de comando ou de uma aplicação que você nem sabe que existe ainda. Isso muda bastante a maneira de pensar a implementação.

Neste capítulo nós vamos construir essa fronteira com cuidado. Vamos passar pela External API, funções externas, `classes/external`, `db/services.php`, estruturas de entrada e saída, serviços, tokens, AJAX, `core/ajax`, REST, chamadas para APIs externas com a classe `curl` do Moodle, retry, timeout, rate limit, webhooks e idempotência. Também vamos olhar para o Routing subsystem mais novo, disponível desde o Moodle 4.5, porque em 2026 já não faz sentido ensinar integração como se o único caminho possível continuasse sendo exatamente o mesmo usado dez anos atrás, mas sem jogar fora a External API tradicional, que continua sendo extremamente importante e está por trás de AJAX, Mobile e grande parte das integrações existentes.

## 14.1 Antes de tudo, existe uma fronteira

Quando uma página PHP do plugin chama uma classe interna, os dois lados vivem no mesmo processo, compartilham a mesma versão do código e normalmente são atualizados juntos. Quando um ERP chama um Web Service, nada disso é garantido. O ERP pode estar em outra linguagem, pode ser atualizado por outra equipe, pode chamar uma função criada três anos atrás e pode interpretar qualquer pequena mudança no retorno como quebra de integração.

Por isso a primeira mudança de mentalidade é esta, código externo não é só código reutilizável, é contrato. Se hoje a função devolve `userid`, `fullname` e `status`, remover `status` amanhã pode quebrar uma integração mesmo que o plugin continue funcionando perfeitamente pela interface. Se hoje um campo aceita ausência e amanhã passa a ser obrigatório, você mudou o contrato. Se hoje um erro devolve warning e amanhã vira exception, você mudou o contrato.

Isso é parecido com API pública de classe, só que com uma consequência maior porque quem consome pode estar fora do seu repositório, da sua empresa e até do seu controle.

## 14.2 External API

A External API é a infraestrutura usada pelo Moodle para declarar funções que podem ser consumidas externamente de maneira estruturada. Ela descreve os parâmetros aceitos, os valores devolvidos, faz validação de tipos e fornece a base usada por diferentes mecanismos, entre eles Web Services tradicionais, chamadas AJAX e o Moodle App.

O ponto mais importante é que a External API não deveria conter toda a regra de negócio do plugin. Eu prefiro pensar nela como uma camada adaptadora. Ela recebe dados de fora, valida esses dados, estabelece o contexto correto, verifica autorização, chama a API interna do componente e devolve uma estrutura compatível com o contrato externo.

Esse desenho deixa a integração mais fácil de testar e evita duplicar regra. A mesma operação usada pelo Web Service pode ser usada pela página PHP, por uma task ou por outro componente, sem fazer uma chamada HTTP para o próprio Moodle e sem copiar a lógica em quatro lugares.

## 14.3 API interna e API externa não são a mesma coisa

Imagine um plugin que possui uma classe responsável por aprovar uma solicitação.

```php
$result = request_manager::approve($requestid, $userid);
```

Essa classe pode receber objetos, enums, exceções específicas do domínio e trabalhar com tipos que fazem sentido dentro do PHP. A função externa precisa de outro cuidado, porque ela deve aceitar valores serializáveis, declarar cada parâmetro e devolver algo que o mecanismo externo saiba validar e transformar em JSON, XML ou outro protocolo suportado.

Uma arquitetura simples fica assim.

```
Frontend / ERP / App
        |
        v
External API
        |
        v
API do componente
        |
        v
DML / Events / Files / outras APIs Moodle
```

O erro é colocar banco, regra, autorização, integração externa e transformação de retorno tudo dentro de uma única função `execute()`. Funciona no primeiro mês e vira um problema quando a mesma ação precisa ser executada por outro caminho.

## 14.4 classes/external

Nas versões atuais do Moodle, as classes de funções externas devem ficar dentro do namespace `external` do componente, normalmente em `classes/external/`.

Para um plugin `local_integracao`, uma função para consultar um pedido poderia ficar aqui.

```
local/integracao/classes/external/get_order.php
```

Com namespace.

```
namespace local_integracao\external;
```

A classe normalmente estende `\core_external\external_api`.

```
use core_external\external_api;

class get_order extends external_api {
    // ...
}
```

Código antigo ainda pode aparecer em `externallib.php`, porque durante muitos anos essa foi uma forma comum de declarar funções externas, mas para desenvolvimento atual eu evitaria criar código novo nesse formato quando existe estrutura namespaced e autoload disponível.

## 14.5 Anatomia de uma external function

Uma função externa moderna costuma ter três partes principais.

```php
public static function execute_parameters(): external_function_parameters {
    // Descreve entrada.
}

public static function execute(int $orderid): array {
    // Executa a operação.
}

public static function execute_returns(): external_single_structure {
    // Descreve saída.
}
```

A assinatura de `execute()` deve corresponder ao que foi declarado em `execute_parameters()`. Isso não é documentação opcional, é parte do contrato e da validação da função.

Eu gosto de olhar essas três funções como três perguntas diferentes. O que entra, o que acontece e o que sai. Se uma delas estiver vaga, a integração inteira está vaga.

## 14.6 db/services.php

Criar a classe não basta. O Moodle precisa saber que aquela função externa existe, e essa declaração é feita em `db/services.php`.

```php
$functions = [
    'local_integracao_get_order' => [
        'classname' => 'local_integracao\\external\\get_order',
        'description' => 'Returns an order visible to the current user.',
        'type' => 'read',
        'ajax' => true,
    ],
];
```

O nome da função precisa ser globalmente único, por isso o padrão com Frankenstyle no início é importante. A propriedade `type` informa se a função é de leitura ou escrita, enquanto `ajax` define se ela pode ser utilizada pelo endpoint AJAX do Moodle.

Depois de alterar `db/services.php`, lembre que esse arquivo é processado durante instalação e upgrade, então é necessário incrementar a versão do plugin e executar o upgrade para a definição chegar às tabelas internas usadas pelo subsistema.

## 14.7 Não confunda função externa com serviço

Uma external function é uma operação individual. Um service é um agrupamento de funções disponibilizadas sob uma determinada configuração.

Você pode ter uma função.

```
local_integracao_get_order
```

E um serviço chamado, por exemplo.

```
ERP Integration
```

Que contém várias funções.

```
local_integracao_get_order
local_integracao_create_order
local_integracao_update_order
```

Essa separação permite controlar quais funções determinada integração pode usar, em vez de entregar todo o universo de funções disponíveis no site para qualquer consumidor.

## 14.8 Serviço pré-definido ou serviço configurado pelo administrador

O plugin pode declarar um serviço em `db/services.php`.

```php
$services = [
    'ERP integration' => [
        'functions' => [
            'local_integracao_get_order',
            'local_integracao_update_order',
        ],
        'restrictedusers' => 1,
        'enabled' => 1,
        'shortname' => 'local_integracao_erp',
    ],
];
```

Mas nem sempre é necessário criar um serviço próprio. O administrador também pode montar serviços pela interface e escolher funções conforme a necessidade da integração. Criar um serviço fixo no plugin faz sentido quando ele representa uma integração conhecida, estável e que deve existir com um conjunto controlado de funções.

Não crie cinco serviços só porque o arquivo permite. Serviço é fronteira de acesso e operação, não organização estética do `db/services.php`.

## 14.9 O ajax em db/services.php

Quando você define.

```
'ajax' => true,
```

Está dizendo ao Moodle que aquela external function pode ser chamada pelo mecanismo AJAX da interface usando a sessão atual. Isso não transforma a função automaticamente em um serviço REST público e não elimina autorização dentro do `execute()`.

Eu vejo muito código que trata `ajax => true` como se fosse selo de segurança. Não é. Ele apenas torna aquela função disponível para o endpoint AJAX apropriado. Quem pode fazer o quê continua sendo responsabilidade da função.

## 14.10 Estruturas externas

A External API trabalha com descrições explícitas de dados. Entre as classes mais usadas estão.

```
external_function_parameters
external_value
external_single_structure
external_multiple_structure
```

Elas permitem descrever desde um inteiro simples até uma árvore inteira de registros.

```
return new external_function_parameters([
    'orderid' => new external_value(PARAM_INT, 'Order ID'),
]);
```

Ou uma lista de objetos.

```
return new external_multiple_structure(
    new external_single_structure([
        'id' => new external_value(PARAM_INT, 'Order ID'),
        'status' => new external_value(PARAM_ALPHANUMEXT, 'Order status'),
    ])
);
```

Não veja isso como burocracia. Essa descrição é o que permite ao Moodle validar entrada, validar saída e documentar o contrato.

## 14.11 external_value

`external_value` representa um valor escalar e recebe um tipo baseado nos mesmos `PARAM_*` usados em outras partes do Moodle.

```
'courseid' => new external_value(PARAM_INT, 'Course ID')
```

Escolha o tipo que realmente descreve o dado. Usar `PARAM_RAW` para tudo porque "assim não dá erro" é o equivalente externo de desligar a validação e torcer para o chamador ser educado.

Para identificadores numéricos, `PARAM_INT`. Para texto sem tags, normalmente existe um tipo mais adequado. Para URLs, e-mails, nomes de componentes e outros formatos conhecidos, use o parâmetro correspondente sempre que o contrato permitir.

## 14.12 VALUE_REQUIRED, VALUE_OPTIONAL e VALUE_DEFAULT

Nem todo campo tem a mesma obrigatoriedade.

```
'limit' => new external_value(
    PARAM_INT,
    'Maximum number of records',
    VALUE_DEFAULT,
    100
)
```

Um valor obrigatório precisa existir, um opcional pode não existir e um valor com default possui um comportamento explícito quando não é enviado. Isso faz parte do contrato e deveria ser escolhido pelo significado, não para reduzir exceptions durante o desenvolvimento.

Um campo que é semanticamente obrigatório não deveria ganhar `VALUE_OPTIONAL` só porque o frontend atual sempre sabe preenchê-lo. Amanhã outro consumidor pode não saber.

## 14.13 validate_parameters()

Declarar os parâmetros não substitui a validação no `execute()`. A função externa deve validar os dados recebidos contra sua própria descrição.

```php
$params = self::validate_parameters(
    self::execute_parameters(),
    [
        'orderid' => $orderid,
    ]
);
```

A partir daí você trabalha com `$params`, que representa a entrada validada e limpa de acordo com o contrato.

Pular essa etapa é especialmente ruim porque dá uma falsa sensação de segurança. O desenvolvedor criou `execute_parameters()`, olha para aquilo e pensa que os dados já foram validados, mas a validação precisa ser efetivamente executada.

## 14.14 validate_context()

Depois da entrada, vem o contexto. Se a operação trabalha com dado pertencente a curso, módulo, usuário ou sistema, obtenha o contexto correspondente e valide.

```php
$context = context_course::instance($courseid);
self::validate_context($context);
```

Essa chamada é importante em external functions e não deve ser substituída por `require_login()` como se fossem equivalentes. O ambiente de Web Service possui particularidades próprias, e `validate_context()` faz verificações e prepara o contexto necessário para a operação externa.

O contexto precisa ser o mais específico relacionado ao recurso. Usar `context_system` para tudo continua sendo erro aqui do mesmo jeito que era no Capítulo 8.

## 14.15 Capability continua obrigatória

Validar contexto não responde se o usuário pode executar a ação. Depois de estabelecer o contexto correto, verifique capability quando a operação exigir.

```php
require_capability('local/integracao:vieworders', $context);
```

Se a função altera dados.

```php
require_capability('local/integracao:manageorders', $context);
```

External function não recebe uma permissão especial por ser external. Pelo contrário, ela merece ainda mais cuidado porque cria mais uma forma de chegar à mesma regra de negócio.

## 14.16 userid, courseid e outros IDs vindos do cliente

O Capítulo 8 já bateu bastante nisso, mas em Web Services o problema aparece o tempo todo. O cliente envia.

```
{
  "userid": 18,
  "courseid": 72
}
```

E o código aceita esses números como se o simples fato de serem inteiros provasse autorização. `PARAM_INT` só prova que o valor é um inteiro. Não prova que o usuário atual pode acessar o curso 72 nem operar sobre o usuário 18.

Valide tipo, carregue o registro real, determine o contexto, verifique capability e, quando necessário, confirme relação entre o usuário autenticado e o objeto pedido.

## 14.17 Não coloque a regra de negócio inteira no execute()

Uma implementação melhor costuma ficar assim.

```php
public static function execute(int $orderid): array {
    $params = self::validate_parameters(
        self::execute_parameters(),
        ['orderid' => $orderid]
    );

    $order = order_repository::get($params['orderid']);
    $context = context_course::instance($order->courseid);

    self::validate_context($context);
    require_capability('local/integracao:vieworders', $context);

    return order_service::get_external_data($order);
}
```

A External API cuida da fronteira, enquanto `order_service` resolve a operação do domínio. Isso também reduz a tentação de outra classe chamar `get_order::execute()` diretamente para reaproveitar código.

## 14.18 Não chame external function diretamente como API interna

Apesar de uma external function ser uma classe PHP, chamá-la diretamente de outro componente não é o melhor caminho. A documentação do Moodle chama atenção para isso porque external functions dependem de ambiente, linguagem, tema e contexto próprios.

Se você realmente precisa invocar uma external function programaticamente, use o mecanismo próprio da External API. Mas, na maior parte dos casos, a solução melhor é extrair a lógica para a API interna do componente e fazer os dois caminhos chamarem essa API.

Isso volta à separação do começo do capítulo. External API é adaptador, não centro do universo do plugin.

## 14.19 execute_returns()

A resposta também é contrato e deve ser descrita explicitamente.

```
public static function execute_returns(): external_single_structure {
    return new external_single_structure([
        'id' => new external_value(PARAM_INT, 'Order ID'),
        'status' => new external_value(PARAM_ALPHANUMEXT, 'Current status'),
        'timemodified' => new external_value(PARAM_INT, 'Modification timestamp'),
    ]);
}
```

Não declare uma coisa e devolva outra. O Moodle valida o retorno e isso é ótimo, porque pega inconsistências antes que um consumidor receba JSON que muda conforme o caminho executado.

## 14.20 Retorno "flexível demais" vira contrato impossível de manter

Tente evitar respostas em que um campo às vezes é inteiro, às vezes string e às vezes não existe sem uma regra clara. Isso deixa a integração frágil e geralmente obriga o consumidor a escrever dezenas de verificações defensivas.

Se um valor pode não existir, declare essa possibilidade. Se existem estados diferentes, modele esses estados. Se uma operação pode devolver uma lista vazia, devolva lista vazia em vez de alternar entre `false`, `null`, objeto e array.

O objetivo não é deixar a resposta bonita, é deixá-la previsível.

## 14.21 Warnings

Nem toda condição precisa interromper a função inteira. Em operações que processam vários registros, pode fazer sentido devolver resultado e warnings para itens que não puderam ser processados.

O core possui `external_warnings`, usado por várias external functions.

```
use core_external\external_warnings;

'warnings' => new external_warnings()
```

No resultado você pode devolver avisos estruturados.

```php
$warnings[] = [
    'item' => 'order',
    'itemid' => $orderid,
    'warningcode' => 'alreadyprocessed',
    'message' => get_string('alreadyprocessed', 'local_integracao'),
];
```

Warning é bom para situação recuperável. Não use warning para esconder falha de autorização, corrupção de dado ou erro que torna a operação inválida.

## 14.22 Exceptions

Quando a operação não pode continuar, lance uma exception apropriada em vez de devolver.

```
return ['success' => false, 'error' => 'qualquer coisa'];
```

Esse padrão parece simples, mas inventa um protocolo de erro por função. A infraestrutura de Web Services já sabe lidar com exceptions e transformar falhas em respostas adequadas ao protocolo.

Também evite expor detalhes internos desnecessários. Stack trace, SQL completo, segredo de API ou conteúdo sensível não deveriam fazer parte da mensagem de erro devolvida ao cliente.

## 14.23 REST tradicional do Moodle

No modelo clássico, o Moodle disponibiliza funções externas por endpoints de Web Service, sendo REST um dos protocolos mais usados. Uma chamada normalmente informa token, nome da função e formato de resposta, além dos parâmetros específicos.

Um exemplo simplificado de URL é.

```
/webservice/rest/server.php
```

Com parâmetros como.

```
wstoken
wsfunction
moodlewsrestformat=json
```

Não coloque token em exemplo real do seu ambiente, documentação pública, log ou captura de tela. Use valor fictício sempre.

## 14.24 Protocolos

O Moodle possui arquitetura de protocolos de Web Service e historicamente suporta diferentes formas de comunicação. REST acabou sendo o caminho mais comum em integrações atuais porque encaixa bem em clientes HTTP e JSON, mas a External API é conceitualmente separada do protocolo.

Isso é importante porque a função externa não deveria depender de detalhe específico do transporte. Ela descreve dados e operação, enquanto o servidor do protocolo cuida de transformar requisição e resposta.

## 14.25 Tokens

Token é credencial. Parece óbvio, mas muito projeto trata token como configuração qualquer e depois ele aparece em Git, print, ticket, log de debug e histórico de shell.

Um token de Web Service representa acesso dentro das regras do usuário e serviço associados. Se esse usuário possui privilégios amplos e o serviço expõe muitas funções, o impacto de vazamento cresce junto.

Prefira serviço com escopo reduzido, usuário dedicado quando fizer sentido e capabilities mínimas para a integração.

## 14.26 Token não substitui autorização dentro da função

Uma função não deveria concluir "tem token, então pode". O token identifica e autentica um usuário dentro de determinado serviço, mas a função ainda precisa validar contexto e capability para a operação real.

Pense em duas camadas.

```
Token/serviço -> quem conseguiu entrar por esta porta
Capability/contexto -> o que esse usuário pode fazer neste objeto
```

Tirar a segunda camada é criar uma API em que qualquer função adicionada ao serviço passa a confiar demais no usuário técnico da integração.

## 14.27 Serviços restritos

Serviços podem ser configurados para usuários restritos e isso é útil quando uma integração deveria ser usada apenas por contas específicas. É uma forma de diminuir o raio de acesso e deixar a administração mais explícita.

Ainda assim, serviço restrito não elimina capability, contexto ou validação dos parâmetros. Segurança em integração funciona por camadas, e não por uma única opção marcada na administração.

## 14.28 Usuário técnico dedicado

Para uma integração ERP, usar a conta pessoal de um administrador como dono do token é uma péssima ideia. A pessoa troca de cargo, senha, MFA, permissões ou sai da instituição e o ERP para de funcionar, além de o log ficar misturando ações humanas com ações automatizadas.

Quando o cenário justificar, crie um usuário técnico identificável, com permissions mínimas e finalidade documentada. Isso melhora auditoria e reduz dependência de conta pessoal.

## 14.29 Nunca grave token em código-fonte

Isto aqui não deveria existir.

```php
$token = 'abc123-token-real-da-producao';
```

Nem em PHP, nem em JavaScript, nem em arquivo de exemplo commitado no Git. Segredos devem ficar em configuração apropriada do ambiente e com acesso restrito.

Também tome cuidado para não imprimir token em `mtrace()`, `debugging()`, exception, query string de log ou tela administrativa.

## 14.30 Web Service e AJAX não são a mesma coisa

Os dois podem usar External API, mas o cenário de autenticação e transporte é diferente. Um cliente REST externo normalmente usa token e endpoint de Web Service. Já o JavaScript dentro do Moodle costuma usar a sessão atual e `core/ajax`.

A função externa pode ser a mesma, mas você não deveria ensinar o frontend a montar manualmente uma chamada REST com token do usuário só para salvar um formulário dentro do próprio Moodle. Isso aumenta risco, expõe credenciais e ignora a infraestrutura própria de AJAX.

## 14.31 core/ajax

A recomendação clássica para interações AJAX no Moodle é usar `core/ajax`, que chama external functions marcadas com `ajax => true` usando a sessão atual.

```
import Ajax from 'core/ajax';

export const loadOrder = async(orderid) => {
    const [result] = await Ajax.call([{
        methodname: 'local_integracao_get_order',
        args: {orderid},
    }]);

    return result;
};
```

O frontend não precisa conhecer `/lib/ajax/service.php`, formato interno do payload, `sesskey` ou detalhes de serialização. Essa abstração é exatamente o motivo de usar `core/ajax` em vez de `fetch()` manual apontando para endpoints internos.

## 14.32 Um repository.js ou service module para chamadas

Mesmo em JavaScript pequeno, eu prefiro concentrar chamadas externas em um módulo específico.

```
amd/src/repository.js
```

Ou, nas arquiteturas novas de frontend, em um service module equivalente.

A tela chama.

```
const order = await repository.getOrder(orderid);
```

E somente o repositório sabe qual `methodname` usar. Quando o contrato muda, você não precisa caçar `Ajax.call()` em cinco componentes visuais.

## 14.33 loginrequired => false é exceção

A documentação atual permite, em casos muito específicos, marcar uma função AJAX como segura para uso sem sessão. Isso existe para informação completamente pública e barata de consultar.

Não use isso para contornar login porque "a tela ainda não abriu a sessão". Se a função acessa dado privado, depende de usuário, faz alteração ou pode ser abusada para consumir recurso, ela não deveria ser liberada dessa maneira.

Toda exceção de segurança que parece conveniente demais merece uma segunda leitura.

## 14.34 Moodle App

O Moodle App também utiliza funções externas. Quando uma função precisa estar disponível no serviço oficial do Mobile, ela pode ser associada ao serviço correspondente na declaração.

```
'services' => [
    MOODLE_OFFICIAL_MOBILE_SERVICE,
],
```

Não marque função para Mobile automaticamente. Pense se o contrato realmente é adequado para aplicativo, volume, conectividade móvel, permissões e experiência offline quando aplicável.

## 14.35 API externa de terceiros

Até agora falamos principalmente de sistemas chamando o Moodle. A direção contrária também é comum, o Moodle precisa chamar ERP, gateway de pagamento, CRM, serviço de vídeo, assinatura digital ou qualquer API externa.

Aqui muda a ferramenta. Você não está criando uma external function para chamar o ERP. Você está escrevendo um cliente HTTP dentro do plugin.

E isso deveria ficar isolado em uma classe própria.

```
classes/client/erp_client.php
```

Em vez de espalhar `curl` por página, task, observer e Web Service.

## 14.36 Moodle Curl API

O Moodle possui uma classe `curl` usada para requisições HTTP e que integra melhor com configurações de proxy e infraestrutura do sistema do que criar uma conexão completamente independente.

```php
$curl = new \curl();

$response = $curl->get(
    'https://api.exemplo.com/orders/123',
    [],
    [
        'timeout' => 15,
        'connecttimeout' => 5,
    ]
);
```

Para POST.

```php
$curl = new \curl();
$curl->setHeader([
    'Content-Type: application/json',
    'Authorization: Bearer ' . $token,
]);

$response = $curl->post(
    'https://api.exemplo.com/orders',
    json_encode($payload),
    ['timeout' => 20]
);
```

Depois da chamada, verifique status, conteúdo e erro, em vez de presumir que resposta não vazia significa sucesso.

## 14.37 core\http_client no Moodle 5.0

A classe curl continua fazendo parte do ecossistema Moodle e você encontrará muito código correto usando-a, mas o Moodle moderno também oferece \core\http_client, construído sobre Guzzle e compatível com PSR-18. Para código novo em classes de serviço, especialmente quando a integração precisa de testes limpos, http_client combina melhor com o modelo de Dependency Injection estudado no Capítulo 4.

```php
namespace local_integracao\local;

final class erp_client {
    public function __construct(
        private readonly \core\http_client $client,
    ) {
    }

    public function fetch_order(int $id): array {
        $response = $this->client->request(
            'GET',
            'https://erp.example.test/orders/' . $id,
            ['timeout' => 5],
        );

        return json_decode((string) $response->getBody(), true, flags: JSON_THROW_ON_ERROR);
    }
}
```

O ganho não está em trocar uma chamada HTTP por outra com nome mais moderno. O ganho está em a classe declarar que depende de um cliente HTTP, permitindo que a criação dessa dependência fique fora da regra e que o teste substitua o cliente real sem precisar interceptar rede.

## 14.38 PSR-18 e por que isso importa

\core\http_client implementa o contrato PSR-18 por meio de sendRequest(), além de expor as operações fornecidas pelo cliente Guzzle. Para a maioria dos plugins você não precisa decorar o padrão, mas entender que existe um contrato ajuda a separar "fazer uma requisição HTTP" de "usar uma classe concreta específica".

Essa separação fica especialmente útil em bibliotecas internas e integrações grandes. Se uma classe depende apenas de um contrato de cliente, teste, proxy, instrumentação e política de transporte podem evoluir sem contaminar a regra que interpreta pedidos, matrículas ou dados acadêmicos.

## 14.39 Injetar o cliente em vez de instanciá-lo dentro da regra

Evite escrever new \core\http_client() no meio de cada método de negócio. O código funcionará, mas volta a esconder a dependência e dificulta controlar a chamada em PHPUnit. Receba o cliente no construtor e deixe o container do Moodle resolvê-lo quando a classe for obtida por Dependency Injection.

```php
$client = \core\di::get(\local_integracao\local\erp_client::class);
$order = $client->fetch_order($orderid);
```

Em entry points legados, essa chamada pontual ao container é aceitável; dentro de classes que já recebem erp_client, continue usando constructor injection e não espalhe \core\di::get() pela árvore inteira.

## 14.40 curl ou core\http_client?

Não existe necessidade de reescrever automaticamente toda integração baseada na classe curl. Código estável, testado e compatível com várias branches pode continuar usando a API que já possui, principalmente quando a versão mínima ainda antecede as APIs modernas. Para código novo voltado ao Moodle 5.0, porém, http_client é uma opção muito interessante quando testabilidade, PSR-18 e Dependency Injection fazem parte do desenho.

Independentemente do cliente, os riscos continuam os mesmos: SSRF, redirects, timeout, TLS, autenticação, tamanho de resposta, retry, rate limit e vazamento de segredo. Nenhuma biblioteca transforma uma URL fornecida pelo usuário em destino seguro por mágica.

## 14.41 Timeout não é detalhe

Integração sem timeout pode prender processo PHP esperando um serviço que não responde. Em página web isso vira usuário olhando loading infinito, workers ocupados e capacidade da aplicação caindo.

Defina timeout de conexão e timeout total compatíveis com a operação. Uma API interna na mesma região talvez mereça poucos segundos, enquanto upload grande pode exigir outra estratégia.

O valor correto depende do serviço, mas "sem limite" quase nunca é uma decisão consciente.

## 14.42 Retry

Retry não significa repetir qualquer falha três vezes.

Se a API devolve erro temporário, timeout ou status que indica indisponibilidade, repetir pode fazer sentido. Se devolve `400` porque o payload está errado, repetir a mesma coisa só gera três erros em vez de um.

Além disso, retry em operação de escrita exige idempotência. Se você fez POST de pagamento, perdeu a resposta e repete sem chave idempotente, pode criar pagamento duplicado.

## 14.43 Backoff

Quando retry é necessário, evite martelar o serviço imediatamente.

```
1a tentativa -> falhou
aguarda 2 s
2a tentativa -> falhou
aguarda 5 s
3a tentativa
```

Em processamento de background, o intervalo pode ser muito maior e controlado pela própria task. A ideia é dar tempo para o serviço se recuperar e evitar transformar uma falha externa em uma avalanche de requisições.

## 14.44 Rate limit

APIs externas frequentemente limitam requisições por segundo, minuto ou janela de uso. O plugin precisa respeitar isso tanto para não ser bloqueado quanto para não prejudicar outros consumidores da mesma credencial.

Se você precisa sincronizar cinquenta mil usuários, não faça cinquenta mil chamadas seguidas dentro de uma requisição web. Use batch, task, checkpoint e controle de ritmo, retomando a lógica do Capítulo 11.

## 14.45 Resposta HTTP precisa ser interpretada

Não faça isso.

```
if (!empty($response)) {
    // Deu certo.
}
```

Uma API pode devolver corpo JSON com erro e status `400`, HTML de proxy com `502`, JSON de rate limit com `429` ou resposta vazia legítima com `204`.

Consulte informação da resposta, status HTTP e formato esperado. Valide JSON antes de acessar chaves e trate resposta inválida como erro de integração, não como dado parcialmente correto.

## 14.46 Webhook de entrada

Webhook de entrada é quando um sistema externo chama o Moodle porque algo aconteceu, por exemplo pagamento confirmado, assinatura concluída ou cadastro alterado.

Isso cria um endpoint público e exige cuidados diferentes de uma external function autenticada por sessão. O endpoint precisa validar autenticidade da origem, formato, replay, duplicidade e volume.

Não faça um arquivo `webhook.php` que lê `php://input`, confia em um parâmetro `secret` e altera banco imediatamente sem mais nada.

## 14.47 Assinatura de webhook

Uma estratégia comum é o provedor assinar o corpo da requisição usando segredo compartilhado. Seu plugin calcula a assinatura esperada sobre o payload bruto e compara com o header recebido usando comparação segura.

Pseudocódigo.

```php
$rawbody = file_get_contents('php://input');
$received = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
$expected = hash_hmac('sha256', $rawbody, $secret);

if (!hash_equals($expected, $received)) {
    throw new moodle_exception('invalidsignature', 'local_integracao');
}
```

Cada provedor define exatamente o algoritmo, encoding e conteúdo assinado. Siga a especificação dele e não invente uma assinatura "parecida".

## 14.48 Timestamp e replay

Assinatura válida não impede necessariamente que a mesma requisição seja enviada novamente. Alguns provedores incluem timestamp e identificador do evento para você verificar se a mensagem é recente e se já foi processada.

Se um webhook de pagamento for reenviado cinco vezes, o resultado deveria continuar sendo um pagamento reconhecido, não cinco matrículas, cinco recibos e cinco mensagens.

Isso nos leva à idempotência.

## 14.49 Idempotência

Uma operação idempotente pode ser repetida sem causar efeito adicional indevido.

Para webhook, normalmente guarde o identificador externo do evento ou da operação.

```
provider = asaas
external_event_id = evt_12345
status = processed
```

Antes de processar, verifique se aquele evento já passou. Se passou, devolva sucesso novamente sem executar o efeito pela segunda vez.

Não dependa apenas de uma consulta sem índice unique. Duas requisições simultâneas podem passar na verificação ao mesmo tempo. Use restrição de banco, transação ou lock conforme o fluxo exigir.

## 14.50 Webhook não precisa fazer tudo na hora

Em muitos casos o endpoint só precisa verificar autenticidade, validar o payload mínimo, registrar o evento e enfileirar uma adhoc task.

```
Webhook chega
    |
    v
Valida assinatura
    |
    v
Registra evento
    |
    v
Enfileira task
    |
    v
Responde rapidamente
```

A task faz integração pesada depois. Isso reduz timeout do provedor e separa disponibilidade do webhook da disponibilidade de ERP, e-mail, geração de certificado ou qualquer processo posterior.

É exatamente a ligação com o Capítulo 11.

## 14.51 Webhook de saída

O Moodle também pode avisar sistemas externos quando algo acontece. Um observer pode detectar o evento e enfileirar uma task responsável pelo envio do webhook.

Eu evitaria fazer chamada HTTP pesada diretamente dentro do observer.

```
Evento Moodle
    |
    v
Observer leve
    |
    v
Adhoc task
    |
    v
Webhook externo
```

Se o destino estiver fora do ar, você não atrasa a ação original do usuário e ainda pode aplicar retry no processamento de background.

## 14.52 Autenticando chamadas de saída

Dependendo da API, você pode usar bearer token, basic auth, OAuth 2, certificado cliente ou assinatura HMAC. O plugin deve encapsular esse detalhe no cliente HTTP, não espalhar cabeçalhos de autenticação pelo sistema.

```php
final class erp_client {
    public function __construct(
        private readonly string $baseurl,
        private readonly string $token,
    ) {
    }

    public function get_order(int $id): array {
        // Monta e executa a chamada.
    }
}
```

Isso também facilita substituir autenticação depois sem alterar tasks, observers e páginas.

## 14.53 Secrets e rotação

Token externo, segredo HMAC e client secret precisam poder ser trocados sem editar código. A instituição deve conseguir rotacionar credencial e atualizar configuração.

Quando possível, trate segredo como dado sensível também na interface administrativa. Não mostre valor completo sem necessidade e não inclua em exportações, logs ou mensagens de erro.

Uma integração segura não termina no algoritmo, ela inclui ciclo de vida da credencial.

## 14.54 Routing API e REST v2

Desde o Moodle 4.5 existe também um subsistema de Routing baseado em rotas declaradas e um grupo de API REST com prefixo `/api/rest/v2`. Esse mecanismo trabalha com atributos, parâmetros de rota, query, headers e respostas estruturadas.

Isso representa uma direção mais moderna para APIs HTTP do Moodle e vale ser conhecido por quem desenvolve para branches recentes. Ao mesmo tempo, a External API clássica não desapareceu e continua essencial para `core/ajax`, Moodle App e inúmeras integrações existentes.

Eu não recomendo escolher uma API nova apenas porque ela é nova. Primeiro defina a branch mínima do plugin, o consumidor e o contrato necessário. Um plugin que precisa suportar Moodle 4.1 não pode depender de Routing introduzido em 4.5. Um plugin novo restrito a 5.2 pode avaliar esse caminho com muito mais liberdade.

## 14.55 Não misture dois contratos para a mesma operação sem motivo

Se você expõe `create_order` pela External API e cria outra rota REST com regras diferentes para fazer quase a mesma coisa, acabou de duplicar a fronteira pública.

O ideal é ambas chamarem a mesma API interna do componente e aplicarem as mesmas regras centrais. Caso contrário, daqui a pouco a rota permite um campo que o Web Service não permite, um caminho dispara Event e o outro não, ou uma interface valida capability diferente da outra.

Protocolos podem variar. Regra de negócio não deveria variar por acidente.

## 14.56 Integração síncrona ou assíncrona

Uma pergunta simples resolve muita arquitetura, o usuário realmente precisa da resposta externa antes de continuar?

Se a resposta for não, provavelmente aquela chamada pode virar task.

Exemplos que normalmente não precisam bloquear a página incluem sincronizar cadastro com CRM, enviar webhook, gerar arquivo pesado, recalcular lote, atualizar índice externo e importar centenas de registros.

Exemplos que podem exigir síncrono incluem validar um cupom antes de fechar compra ou consultar disponibilidade necessária para completar a ação atual.

Mesmo nesses casos, use timeout curto e comportamento de falha bem definido.

## 14.57 Logging de integração

Integração sem log é muito difícil de manter, mas log com segredo é problema de segurança.

Registre o suficiente para reconstruir o que aconteceu.

```
integration = erp
operation = create_enrolment
externalid = 839291
httpstatus = 201
attempt = 1
duration = 0.742
```

Evite gravar token, senha, authorization header, cartão, payload inteiro com dados pessoais ou resposta completa sem necessidade.

Também diferencie log operacional de Event do Moodle. Nem toda tentativa HTTP precisa virar Event acadêmico ou de auditoria do usuário.

## 14.58 Correlation ID

Quando a operação atravessa vários sistemas, um identificador de correlação ajuda muito.

```
Moodle -> task -> ERP -> webhook -> Moodle
```

Se todos os pontos registram algo como.

```
correlationid = 7bc2d9a4...
```

fica muito mais fácil descobrir se um erro aconteceu antes do envio, no ERP ou no retorno do webhook.

Isso é especialmente útil quando existem retries e o mesmo objeto gera várias requisições ao longo de minutos.

## 14.59 Erros que eu procuro em code review

Quando reviso integração Moodle, alguns sinais me fazem parar imediatamente. Token hardcoded, endpoint REST sendo chamado por JavaScript com credencial exposta, `PARAM_RAW` em tudo, falta de `validate_parameters()`, ausência de `validate_context()`, capability verificada no contexto errado, `userid` vindo do cliente e usado diretamente, função externa com 300 linhas de regra de negócio, chamada HTTP sem timeout, retry de POST sem idempotência, observer esperando API externa, webhook sem assinatura e log que grava `Authorization` inteiro.

Nenhum desses problemas exige arquitetura sofisticada para evitar. Exige apenas tratar integração como fronteira crítica em vez de um `curl` que por acaso devolveu `200` no seu notebook.

## 14.60 Exercício - REST seguro e cliente ESM

O exercício deste capítulo é criar uma função externa de um plugin fictício `local_coursecatalog` que retorne detalhes de um curso para usuários autorizados e possa ser chamada pelo frontend do próprio Moodle usando `core/ajax`.

A função deve receber `courseid`, validar parâmetros, carregar o curso, usar `context_course`, chamar `validate_context()`, verificar uma capability do plugin e devolver estrutura explícita com `id`, `fullname`, `shortname`, `visible` e `warnings`.

A declaração em `db/services.php` deve marcar a função como `read` e `ajax => true`.

Depois crie um módulo de frontend responsável somente por chamar a API.

```
import Ajax from 'core/ajax';

export const getCourse = async(courseid) => {
    const [course] = await Ajax.call([{
        methodname: 'local_coursecatalog_get_course',
        args: {courseid},
    }]);

    return course;
};
```

A interface visual não deve conhecer `methodname` diretamente, ela chama `getCourse()` do módulo de serviço.

Na segunda parte do exercício, crie uma integração de saída fictícia com uma API externa de catálogo. A chamada deve usar a classe `curl` do Moodle, possuir timeout, encapsular autenticação em uma classe cliente e ser executada por adhoc task em vez de dentro da requisição web.

Por último, desenhe um webhook de retorno contendo assinatura HMAC, identificador externo único e processamento idempotente. O endpoint não deve realizar o processamento pesado, apenas validar, registrar e enfileirar a task.

Se você conseguir fazer essas três partes sem duplicar regra de negócio, sem token exposto e sem depender de um `webhook.php` gigantesco, já entendeu o ponto principal do capítulo.

## 14.61 O que precisa ficar deste capítulo

External API é contrato, não atalho para expor função PHP. `db/services.php` declara a fronteira, mas segurança continua dentro da operação com parâmetros validados, contexto correto e capability. Serviço controla agrupamento e acesso, token é credencial e não deveria aparecer em código nem log, enquanto AJAX dentro do Moodle deve preferir `core/ajax` em vez de inventar uma chamada REST com token.

Na direção contrária, chamadas para APIs externas precisam de cliente isolado, timeout, interpretação de status, retry consciente e rate limit. Webhooks precisam de autenticação, assinatura quando disponível, proteção contra replay e idempotência. Quando o processamento é pesado ou o sistema externo pode demorar, use Tasks e deixe a requisição HTTP curta.

E, principalmente, não coloque a regra de negócio dentro da camada de transporte. A página PHP, a external function, o AJAX, a task, o webhook e uma rota REST nova podem todos precisar executar a mesma operação, e quando isso acontecer você vai agradecer por ter uma API interna do componente que sabe o que fazer sem depender de como a chamada chegou.

## Referencias

Moodle Developer Resources. Dependency Injection, Moodle 5.0. https://moodledev.io/docs/5.0/apis/core/di

Moodle PHP Documentation. core\http_client, Moodle 5.0. https://phpdoc.moodledev.io/5.0/dc/dfe/classcore_1_1http__client.html

Moodle Developer Resources. External Services. https://moodledev.io/docs/5.2/apis/subsystems/external

Moodle Developer Resources. Function Definitions. https://moodledev.io/docs/5.2/apis/subsystems/external/functions

Moodle Developer Resources. External services security. https://moodledev.io/docs/5.2/apis/subsystems/external/security

Moodle Developer Resources. Service creation. https://moodledev.io/docs/5.2/apis/subsystems/external/advanced/custom-services

Moodle Developer Resources. AJAX. https://moodledev.io/docs/5.2/guides/javascript/ajax

Moodle Developer Resources. Routing. https://moodledev.io/docs/5.2/apis/subsystems/routing

Moodle Developer Resources. Responses. https://moodledev.io/docs/5.2/apis/subsystems/routing/responses

Moodle PHP Documentation. curl class. https://phpdoc.moodledev.io/main/da/d9f/classcurl.html


{% endraw %}
