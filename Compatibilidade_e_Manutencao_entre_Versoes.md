# COMPATIBILIDADE E MANUTENÇÃO ENTRE VERSÕES

Compatibilidade não significa apenas o instalador aceitar o ZIP. Um plugin é compatível quando instala, executa seus fluxos, passa pelos upgrades e usa APIs existentes em todas as versões que promete suportar.

Esta edição usa Moodle 3.5.0 como referência, lançado em 17 de maio de 2018. Quando um projeto também precisa funcionar em 3.4, 3.3 ou outra linha anterior, a decisão precisa aparecer no código, nos testes e no processo de release, e não apenas numa frase do README.

## `version.php` é o primeiro contrato

`$plugin->requires` informa o build mínimo do Moodle necessário para instalar o componente.

```php
$plugin->requires = 2018051700; // Moodle 3.5.0.
```

Se o plugin depende de uma API introduzida no 3.5, não declare 3.1 apenas para aumentar o número de instalações, porque o erro aparecerá depois durante a execução. Dependências de outros plugins também devem ser declaradas em `$plugin->dependencies` quando realmente existirem.

## PHP suportado

Moodle 3.5 exige PHP 7.0.0 e, no momento desta edição, também pode ser executado com PHP 7.1 e 7.2. Se a intenção é atender toda instalação válida de Moodle 3.5, o plugin precisa continuar compatível com PHP 7.0.

Isso significa testar na versão mínima e evitar escolher sintaxe apenas porque a máquina do desenvolvedor usa um PHP mais novo.

## APIs mudam entre branches

Mesmo quando a sintaxe PHP é válida, uma classe, função, constante ou callback pode não existir na branch mais antiga que você pretende atender. Antes de usar uma API, procure sua implementação no código daquela branch e consulte os arquivos `upgrade.txt` relacionados ao subsistema.

Se uma funcionalidade só existe no 3.5 e ela é essencial ao plugin, aumentar `$plugin->requires` costuma ser mais limpo do que criar uma imitação parcial para versões anteriores.

## Deprecações

Código marcado como deprecated pode continuar funcionando por compatibilidade, mas `DEBUG_DEVELOPER` existe justamente para revelar esse tipo de dívida durante o desenvolvimento. Quando a própria linha suportada oferece uma substituição estável, faça a migração antes que o código antigo se espalhe.

Não troque uma chamada deprecada por outra API sem confirmar que ela existe em todas as branches declaradas pelo plugin.

## Feature detection

Quando duas branches próximas expõem pequenas diferenças, `function_exists()`, `method_exists()` e `class_exists()` podem ser melhores do que espalhar comparações de versão pelo código.

```php
if (method_exists($object, 'new_method')) {
    $object->new_method();
} else {
    $object->old_method();
}
```

Use isso apenas quando os dois caminhos representam o mesmo contrato. Se a arquitetura mudou de verdade, esconda a diferença numa camada pequena de compatibilidade ou mantenha releases separadas.

## Banco de dados

Use XMLDB para schema e DML para consultas. SQL específico de MySQL pode passar despercebido em desenvolvimento e falhar quando o mesmo plugin for instalado com PostgreSQL ou MariaDB.

Upgrades devem ser acumulativos, usar savepoints e preservar o caminho de quem já instalou versões anteriores do plugin. Depois que um passo de `upgrade.php` foi distribuído, editar aquele passo como se nenhuma instalação tivesse executado o código é pedir por bancos em estados diferentes.

## JavaScript

No Moodle 3.5, JavaScript novo usa módulos AMD em `amd/src/`, enquanto o código compilado ou minificado fica em `amd/build/`. O build deve ser reproduzível com as ferramentas suportadas pela branch.

Se você mantém também uma versão anterior do Moodle, confirme que as dependências AMD usadas já existem nela e não copie código apenas porque aparece no `master` do repositório.

## Bootstrap e temas

Moodle 3.5 traz o Boost com Bootstrap 4 estável e ainda convive com temas que seguem estruturas diferentes. Teste o plugin nos temas que você declara suportar e prefira componentes, templates e APIs do Moodle em vez de depender de detalhes de markup que pertencem a um único tema.

## PHPUnit e Behat

As ferramentas de teste também fazem parte da compatibilidade. A suíte precisa ser executada com versões de PHPUnit, Behat, Selenium, Node e navegador compatíveis com Moodle 3.5 e com a matriz que você decidiu manter.

Não atualize apenas uma dessas peças porque uma versão nova foi publicada; em ambiente de testes, compatibilidade entre as ferramentas vale mais do que novidade isolada.

## CI como prova da promessa

Se o plugin promete funcionar em PHP 7.0, 7.1 e 7.2, a CI deve executar essas combinações sempre que forem relevantes. Se promete MySQL e PostgreSQL, pelo menos os fluxos críticos precisam ser exercitados nos dois ambientes.

Uma matriz pequena que realmente roda em cada alteração vale mais do que uma tabela enorme de compatibilidade que ninguém testa.

## Instalação limpa e upgrade

Teste dois caminhos diferentes: instalar a versão atual do plugin numa cópia limpa do Moodle 3.5 e atualizar uma instalação que já possua uma release anterior do próprio plugin com dados de teste.

Muitos erros de `upgrade.php` nunca aparecem numa instalação limpa porque `install.xml` já cria a estrutura no estado final.

## Releases

Mantenha disponível a última release que atende cada linha do Moodle que você decidiu suportar. Quando uma nova versão do plugin aumentar o requisito mínimo, documente isso no changelog e altere `$plugin->requires` de forma explícita.

Não publique uma atualização que deixa de instalar numa versão antes suportada sem tornar essa mudança visível para quem administra o site.

## Exercício

Pegue `mod_checkpoint`, declare Moodle 3.5.0 como requisito mínimo e revise todas as dependências de Moodle e PHP. Depois execute instalação limpa, upgrade de uma release anterior, PHPUnit e os cenários Behat principais usando PHP 7.0 e PHP 7.2.

## O que precisa ficar deste capítulo

Compatibilidade é uma combinação de versão do Moodle, PHP, banco de dados, APIs, ferramentas e dados persistidos. A promessa só é confiável quando o mesmo conjunto que você documenta é o conjunto que instala, atualiza e passa pelos testes.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
