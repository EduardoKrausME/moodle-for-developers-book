# WEB SERVICES E INTEGRAÇÕES

Em algum momento o Moodle precisa conversar com outro sistema. Um ERP matricula alunos, um aplicativo consulta cursos, uma página usa AJAX para salvar uma operação sem recarregar tudo ou um processo externo precisa buscar informações. No Moodle 3.5 a base para isso é a External API, registrada em `db/services.php` e utilizada pelos protocolos de Web Service e também pelo módulo JavaScript `core/ajax`.

A parte mais importante não é gerar um token. Uma função externa é um contrato público e precisa declarar exatamente o que recebe, validar contexto e autorização e devolver uma estrutura previsível.

## External API

O Moodle 3.5 fornece `external_api`, `external_function_parameters`, `external_value`, `external_single_structure` e `external_multiple_structure` em `lib/externallib.php`.

A forma clássica de um plugin é criar `externallib.php` na raiz do componente.

```php
<?php

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');

class local_orders_external extends external_api {

    public static function get_order_parameters() {
        return new external_function_parameters(array(
            'orderid' => new external_value(PARAM_INT, 'Order id'),
        ));
    }

    public static function get_order($orderid) {
        global $DB;

        $params = self::validate_parameters(
            self::get_order_parameters(),
            array('orderid' => $orderid)
        );

        $order = $DB->get_record('local_orders',
            array('id' => $params['orderid']), '*', MUST_EXIST);

        $context = context_course::instance($order->courseid);
        self::validate_context($context);
        require_capability('local/orders:view', $context);

        return array(
            'id' => $order->id,
            'status' => $order->status
        );
    }

    public static function get_order_returns() {
        return new external_single_structure(array(
            'id' => new external_value(PARAM_INT, 'Order id'),
            'status' => new external_value(PARAM_TEXT, 'Order status'),
        ));
    }
}
```

O nome do método é livre, mas os métodos `get_order_parameters()` e `get_order_returns()` fazem parte do contrato daquela função.

## `db/services.php`

O registro da função aponta para a classe e o método.

```php
<?php

$functions = array(
    'local_orders_get_order' => array(
        'classname' => 'local_orders_external',
        'methodname' => 'get_order',
        'classpath' => 'local/orders/externallib.php',
        'description' => 'Return an order.',
        'type' => 'read',
        'ajax' => true,
        'capabilities' => 'local/orders:view',
    )
);
```

O campo `capabilities` ajuda a descrever a função, mas não substitui `require_capability()` dentro da implementação.

## Parâmetros e retorno

`validate_parameters()` deve ser chamado antes de usar a entrada. Tipos como `PARAM_INT`, `PARAM_TEXT`, `PARAM_ALPHANUMEXT` e `PARAM_BOOL` não são decoração, pois definem o contrato aceito pelo serviço.

Para retorno, declare a estrutura real. Não devolva objetos arbitrários do banco esperando que o serializador descubra sozinho o que deveria expor.

## Contexto e autorização

`validate_context()` confirma que o contexto é válido para a chamada externa e `require_capability()` aplica a autorização. O contexto deve estar relacionado ao recurso real que será lido ou alterado.

Se o cliente envia `orderid=10`, não basta exigir uma capability no contexto de sistema. Carregue a ordem, descubra o curso ou outro contexto ao qual ela pertence e valide a permissão nesse lugar.

## REST do Moodle

O Moodle 3.5 possui o servidor REST tradicional em `/webservice/rest/server.php`. Ele recebe `wstoken`, `wsfunction`, `moodlewsrestformat` e os parâmetros da função registrada.

O token identifica um usuário e um serviço, mas a função continua responsável por validar o que esse usuário pode fazer.

Exemplo conceitual:

```
POST /webservice/rest/server.php
wstoken=...
wsfunction=local_orders_get_order
moodlewsrestformat=json
orderid=10
```

Nunca coloque tokens reais em documentação, repositório ou JavaScript entregue ao navegador quando o token tiver privilégios de integração de servidor.

## Serviços

O administrador pode montar serviços customizados e associar funções externas a eles. Um plugin também pode declarar um serviço em `db/services.php` quando existe um conjunto conhecido de funções que deve ser instalado junto do componente.

Use usuário técnico com as permissões mínimas necessárias para integrações servidor a servidor. Token de administrador completo porque "é mais fácil" costuma virar problema de segurança alguns meses depois.

## AJAX com `core/ajax`

No Moodle 3.5 o JavaScript AMD é a abordagem recomendada e `core/ajax` permite chamar External Functions marcadas com `'ajax' => true`.

```javascript
define(['core/ajax'], function(ajax) {
    return {
        load: function(orderid) {
            var requests = ajax.call([{
                methodname: 'local_orders_get_order',
                args: {orderid: orderid}
            }]);

            return requests[0];
        }
    };
});
```

O código-fonte fica em `amd/src/` e o build distribuído fica em `amd/build/`, gerado pelas ferramentas JavaScript do Moodle.

AJAX não cria uma autorização diferente. A mesma função precisa validar contexto, capability e relacionamento entre os IDs recebidos.

## API interna e API externa

Não use a classe externa como service interno principal do plugin. Uma boa divisão é manter a regra de negócio em classes próprias e deixar `externallib.php` como adaptador de entrada e saída.

Assim, uma página PHP, uma task e uma External Function podem chamar a mesma regra sem fingir que toda chamada interna é uma requisição de Web Service.

## Chamando APIs externas

Para chamadas HTTP de saída, use a infraestrutura disponível no Moodle, em especial a classe `curl` de `lib/filelib.php`, em vez de espalhar `file_get_contents()` ou uma configuração própria de cURL por cada endpoint.

```php
require_once($CFG->libdir . '/filelib.php');

$curl = new curl();
$response = $curl->get($url, array(), array(
    'CURLOPT_TIMEOUT' => 10,
    'CURLOPT_CONNECTTIMEOUT' => 5,
));
```

Defina timeout e trate falhas. Uma integração externa fora do ar não deveria prender indefinidamente um worker PHP do Moodle.

## Processamento demorado

Quando uma sincronização precisa percorrer milhares de usuários ou depende de uma API lenta, tire o trabalho pesado da requisição do navegador e use a Task API. A chamada web pode registrar o que precisa ser feito e deixar o cron executar em lotes.

Esse desenho também facilita retry, registro de progresso e retomada depois de falha.

## Segurança

Os problemas que mais aparecem em integrações são previsíveis: função registrada sem autorização real, contexto genérico demais, IDOR por confiar em `userid` ou `courseid` vindo do cliente, token exposto, retorno com dados demais e SQL montado a partir de parâmetro externo.

A External API ajuda com estrutura e validação, mas não conhece a regra de negócio do seu plugin. Essa parte continua sendo sua.

## Exercício

Crie `local_orders_get_order` e `local_orders_set_status`. Registre as duas funções em `db/services.php`, marque apenas a leitura ou a operação necessária para AJAX, valide parâmetros, contexto e capability e escreva um módulo AMD que consulte o estado usando `core/ajax`.

Depois teste as mesmas funções por REST com um usuário técnico limitado ao curso e confirme que trocar o `orderid` por uma ordem de outro curso é negado.

## O que precisa ficar deste capítulo

No Moodle 3.5, External Functions são construídas sobre `external_api` de `lib/externallib.php`, registradas em `db/services.php` e podem ser consumidas pelos protocolos de Web Service habilitados ou pelo `core/ajax` quando a função permite AJAX.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
