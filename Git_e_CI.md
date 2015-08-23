# GIT E CI

Qualidade não pode depender de lembrar uma sequência de comandos antes de publicar cada ZIP. Git registra exatamente qual código está sendo entregue e Continuous Integration executa automaticamente as verificações que o projeto considera obrigatórias.

Em maio de 2018, um fluxo comum para plugins Moodle usa Git, branches ou tags para releases e serviços como Travis CI para executar lint, Coding Style, PHPUnit, Behat e verificações do Moodle Plugin CI. 

## Git não é apenas backup de código

Git registra estados e relações entre estados. Isso parece óbvio, mas muda a forma de trabalhar com plugin Moodle porque cada alteração passa a ter origem, diff, autor, revisão e um commit exato que pode ser reproduzido.

Quando um cliente informa que a versão instalada começou a falhar depois da atualização, a pergunta deixa de ser "qual ZIP você subiu?" e passa a ser "qual tag ou commit está instalado?". Quando uma correção precisa voltar para uma branch Moodle anterior, você consegue localizar o commit e fazer backport em vez de copiar arquivos entre pastas.

Um repositório saudável permite reconstruir uma release sem depender do computador de quem publicou.

## Um repositório por plugin

Para plugins distribuídos separadamente, um repositório por componente costuma ser a opção mais simples. `mod_checkpoint` fica em um repositório, `local_deliveryhub` em outro e cada um possui issues, releases, tags e CI próprios.

Monorepo também é possível, principalmente quando vários componentes sempre são desenvolvidos e entregues juntos, mas ele muda a complexidade de versionamento e pipeline. Se cinco plugins independentes vivem no mesmo repositório, uma tag deixa de responder claramente qual versão de cada componente foi publicada.

Não escolha monorepo apenas porque todos os projetos pertencem à mesma empresa. Escolha quando o ciclo de desenvolvimento e entrega realmente é compartilhado.

## O root do repositório

Para um plugin isolado, gosto de deixar o root do repositório sendo o próprio plugin:

```
mod_checkpoint/
    .travis.yml
    classes/
    db/
    lang/
    tests/
    version.php
    README.md
```

Quando o Moodle Plugin CI fizer checkout, essa pasta será instalada no local correto dentro de uma cópia temporária do Moodle.

Essa estrutura também deixa o ZIP de release previsível, porque basta empacotar o conteúdo sob uma pasta `checkpoint` para entregar em `mod/checkpoint`.

## `.gitignore`

`.gitignore` deve excluir arquivos gerados ou locais que não pertencem à fonte do plugin. Um exemplo inicial:

```
/vendor/
/node_modules/
.phpunit.result.cache
/.idea/
/.vscode/
/coverage/
*.log
.DS_Store
```

Não trate o arquivo como uma lista copiada da internet. O que deve ser ignorado depende do que é gerado, do que é necessário em produção e do processo de build da release.

## Não ignore `amd/build` por reflexo

Este é um erro importante em plugin Moodle. `amd/src` contém o fonte, mas o Moodle serve em produção os arquivos compilados de `amd/build`. Se o plugin é distribuído como ZIP, os arquivos de build precisam estar presentes no pacote final.

Por isso não coloque `amd/build` no `.gitignore` apenas porque em outros ecossistemas a pasta `build` costuma ser descartável. No desenvolvimento Moodle é comum versionar o resultado compilado necessário para produção.

A mesma pergunta vale para qualquer artefato frontend: se o servidor de produção não executará o toolchain para gerar aquele arquivo, ele precisa chegar pronto na release.

## `node_modules` não pertence ao plugin publicado

`node_modules` é dependência de desenvolvimento e pode ser recriado por `npm`. Ele não deve ser colocado no Git nem no ZIP do plugin.

O que interessa é o manifesto e, quando utilizado, o lock file que permite reconstruir a mesma árvore de dependências.

```
package.json
package-lock.json
```

O resultado necessário ao Moodle deve estar compilado em seus diretórios de build, não carregado a partir de `node_modules` em produção.

## Composer e `vendor`

`vendor` também não deve entrar no Git apenas porque o CI usa Composer. Moodle Plugin CI, PHPCS, PHPUnit e outras ferramentas de desenvolvimento podem ser instaladas durante o pipeline.

Existe uma diferença quando o plugin possui biblioteca PHP de runtime que não existe no core. Nesse caso você precisa definir conscientemente como essa dependência chega à instalação Moodle, respeitando licença e `thirdpartylibs.xml`. Não assuma que o administrador executará `composer install` dentro de cada plugin depois de instalar o ZIP.

CI dependency e runtime dependency são problemas diferentes.

## O lock file

Se o repositório possui seu próprio `composer.json` para ferramentas de desenvolvimento, um `composer.lock` versionado pode tornar o ambiente do CI mais reproduzível. A equipe sabe exatamente quais versões passaram na release.

Para projetos que se comportam como bibliotecas Composer, existe outra discussão sobre publicar ou não lock file, mas um plugin Moodle com toolchain próprio normalmente se beneficia de previsibilidade.

O importante é não executar `composer update` automaticamente em toda pipeline e acreditar que está testando sempre a mesma coisa. `composer install` instala o estado conhecido; `composer update` muda esse estado.

## Commits pequenos e compreensíveis

Commit deve representar uma mudança coerente. "Corrige capability do relatório" é muito mais útil do que "mudanças" com trinta arquivos não relacionados.

Commits pequenos ajudam revisão, `git bisect`, cherry-pick e manutenção de releases, além de diminuírem o risco de uma correção carregar alterações não relacionadas.

Não precisa transformar cada linha em um commit, mas cada commit deveria contar uma pequena história que faça sentido sozinho.

## Não misture refactor com correção urgente

Se você precisa corrigir uma falha de segurança, faça a correção com o menor diff coerente. Não aproveite para renomear vinte classes, mover diretórios e trocar o padrão de acesso ao banco no mesmo commit.

O CI pode provar que os testes passaram, mas não reduz o custo humano de revisar um diff gigantesco. Separar mudança funcional de refactor facilita entender exatamente o que foi corrigido e fazer backport para branches anteriores.

## Branch principal

Em 2018, `master` ainda é o nome mais comum para a branch principal dos repositórios Git e normalmente representa a linha de desenvolvimento ativa do plugin. Se você também mantém versões estáveis, deixe claro em qual branch entram novas funcionalidades e para quais branches as correções precisam ser levadas.

## Branch por versão Moodle

Quando existe divergência real entre APIs, use branches estáveis por linha Moodle. Uma convenção coerente com o próprio projeto Moodle é:

```
master
MOODLE_35_STABLE
MOODLE_34_STABLE
```

Não é obrigatório criar uma branch para cada versão se o mesmo código realmente funciona em todas. Branch sem divergência aumenta trabalho de merge sem entregar valor.

## Compatibilidade por uma única branch

Se `mod_checkpoint` funciona em todas as combinações de PHP e banco que você declara suportar no Moodle 3.5, a matriz do CI deve provar essa compatibilidade continuamente.

A vantagem é corrigir um bug uma vez. A desvantagem é precisar manter condicionais de compatibilidade e respeitar a menor versão de PHP suportada pelo conjunto. Esse é um trade-off de manutenção, não uma regra religiosa de Git.

## Quando separar branches

Separe branches quando a manutenção de releases antigas começar a exigir condicionais que tornam o código principal difícil de entender e testar. O custo passa a ser levar correções importantes para mais de uma linha, por isso a equipe precisa declarar quais branches recebem bug fixes, quais recebem apenas segurança e quais já foram encerradas.

## Estratégia de manutenção

Uma política simples em maio de 2018 poderia ser:

```
master             desenvolvimento ativo
MOODLE_35_STABLE   bug fixes e segurança
MOODLE_34_STABLE   segurança e correções críticas
```

A política do plugin não precisa ser idêntica à política do core Moodle, mas não deveria prometer suporte que ninguém testa. Se uma branch aparece no README como suportada, ela precisa existir na matriz de CI.

## Backport

Quando uma correção nasce em `master` e também se aplica à branch estável, prefira um commit pequeno que possa ser trazido por `cherry-pick`.

```
git checkout MOODLE_35_STABLE
git cherry-pick abc1234
```

Conflito não é motivo para copiar arquivo inteiro de outra branch. Resolva apenas as diferenças necessárias e rode o CI da branch de destino.

## Não reescreva histórico publicado

Depois que uma branch estável e tags foram compartilhadas, evite `push --force`, rebase destrutivo e movimentação de tag.

Release é referência para instalações reais. Se `v1.4.0` apontou para um commit e depois passa a apontar para outro, duas pessoas podem dizer que usam a mesma versão e ter códigos diferentes.

Se a release estava errada, publique `v1.4.1`.

## Tags

Tag marca um estado específico do Git que você considera uma release.

```
git tag -a v1.4.0 -m "Release 1.4.0"
git push origin v1.4.0
```

Prefira tags anotadas para releases formais porque elas possuem metadata própria e mensagem.

## Git tag e `$plugin->version` são coisas diferentes

No `version.php` temos algo assim:

```php
$plugin->component = 'mod_checkpoint';
$plugin->version = 2018052400;
$plugin->requires = 2018051700;
$plugin->release = '1.4.0';
$plugin->maturity = MATURITY_STABLE;
```

A tag pode ser `v1.4.0`, mas quem controla o mecanismo de upgrade do Moodle é `$plugin->version`, um número monotonicamente crescente.

Git não substitui `version.php` e `version.php` não substitui Git.

## `$plugin->version`

Esse valor precisa aumentar quando uma instalação existente precisa executar um upgrade. Uma convenção comum usa data no formato `YYYYMMDDXX`.

```
2018052400
2018052401
2018052500
```

Não diminua o número em uma branch publicada. Moodle utiliza esse valor para saber se precisa executar `db/upgrade.php` e outras etapas de atualização.

## `$plugin->release`

`release` é um identificador humano. Pode seguir SemVer quando isso faz sentido:

```
1.4.0
1.4.1
2.0.0
```

Ele ajuda usuário e administrador a reconhecerem a release, enquanto `version` continua sendo o identificador técnico de upgrade.

Não dependa de SemVer para o core saber se deve executar upgrade, porque não é esse campo que o Moodle usa para isso.

## Tag e release precisam concordar

Se você publica tag `v1.4.0`, mas `version.php` ainda diz `release = '1.3.2'`, o pipeline deveria falhar.

Essa é uma ótima verificação customizada de CI porque evita release com metadata incoerente. Você pode extrair o número da tag e comparar com `$plugin->release` antes de gerar o ZIP.

## GitHub Releases

Uma GitHub Release normalmente aponta para uma tag e pode anexar artefatos, changelog e notas.

Ela é útil mesmo quando o diretório de plugins do Moodle exige upload manual do ZIP, porque mantém um histórico reproduzível de código e artefatos.

A release no GitHub não precisa ser a única forma de distribuição, mas deve representar exatamente o mesmo código do pacote publicado.

## Continuous Integration

CI significa que a cada mudança relevante o projeto executa automaticamente verificações antes de considerar o código integrável.

O pipeline responde perguntas como:

```
O PHP compila?
O Coding Style está correto?
O plugin metadata é válido?
Os savepoints estão certos?
Os templates são válidos?
O JavaScript passa no lint/build?
PHPUnit passa?
Behat passa?
O plugin funciona nas versões de Moodle e bancos prometidos?
```

Se qualquer resposta obrigatória for "não", o merge deve parar.

## CI não é CD

Continuous Integration valida mudanças. Continuous Delivery ou Deployment trata entrega automática.

Você pode ter um excelente CI e continuar publicando manualmente. Também pode gerar ZIP automaticamente sem instalar nada em produção.

Não misture as etapas. Testar um pull request não deveria ter credenciais de servidor de produção apenas porque outro workflow de release precisa delas.

## Travis CI

Em 2018 o Travis CI é uma escolha comum em projetos hospedados no GitHub. O repositório contém um `.travis.yml` descrevendo versões de PHP, serviços de banco e comandos executados durante o build.

Um exemplo mínimo, simplificado, pode começar assim:

```yaml
language: php

php:
  - '7.0'
  - '7.1'
  - '7.2'

services:
  - mysql

cache:
  directories:
    - $HOME/.composer/cache

before_install:
  - phpenv config-rm xdebug.ini || true

script:
  - moodle-plugin-ci phplint
  - moodle-plugin-ci phpcpd
  - moodle-plugin-ci phpcs
  - moodle-plugin-ci phpdoc
  - moodle-plugin-ci validate
  - moodle-plugin-ci savepoints
  - moodle-plugin-ci mustache
  - moodle-plugin-ci grunt
  - moodle-plugin-ci phpunit
```

A configuração real depende da versão do `moodle-plugin-ci` utilizada e da forma como o Moodle de teste é instalado. O ponto importante é que o pipeline deve usar combinações realmente suportadas pelo Moodle 3.5, cujo mínimo é PHP 7.0 e que também suporta PHP 7.1 e 7.2.

## Moodle Plugin CI

O projeto Moodle Plugin CI automatiza boa parte da preparação necessária para testar um plugin fora de uma instalação fixa. Ele ajuda a baixar ou preparar o Moodle, instalar o plugin no lugar correto e executar ferramentas conhecidas do ecossistema.

Não trate a ferramenta como substituta do entendimento. Quando um job falhar, descubra qual comando Moodle ou qual verificação está por trás do erro, porque a CI só torna repetível aquilo que você deveria conseguir reproduzir localmente.

## Coding Style e PHP lint

Todo build deve começar por verificações baratas. Um erro de sintaxe precisa falhar antes de gastar tempo preparando Behat, e Coding Style deve apontar problemas antes de uma release.

Use PHP_CodeSniffer com o standard do Moodle e as ferramentas compatíveis com a branch 3.5. O mesmo vale para PHPDoc, savepoints de upgrade, validação do plugin e Mustache.

## JavaScript e Grunt

No Moodle 3.5 os módulos AMD vivem em `amd/src/` e o resultado compilado/minificado distribuído fica em `amd/build/`. Rode Grunt no pipeline e confirme que os arquivos gerados versionados correspondem ao fonte.

Não entregue somente `amd/src/` contando que o servidor de produção execute Node. A instalação do plugin precisa chegar pronta para o Moodle servir os arquivos de build.

## PHPUnit

Unit e integration tests devem rodar automaticamente. Se o plugin depende de banco, capabilities, events ou APIs do core, use os testes do Moodle em vez de criar uma suíte paralela que ignora o ambiente real.

Uma mudança que quebra PHPUnit não está pronta para release apenas porque a tela abriu no navegador do desenvolvedor.

## Behat

Behat é mais caro e pode ficar em um job separado, mas fluxos críticos de interface merecem teste de aceitação. Em projetos pequenos talvez você execute apenas tags do plugin em cada commit e deixe uma suíte maior para a branch principal.

O importante é não mascarar instabilidade com `sleep()` ou ignorar falhas intermitentes. Teste instável não é proteção, é ruído.

## Bancos diferentes

O Moodle suporta mais de um banco e DML existe justamente para reduzir acoplamento. Se o plugin será distribuído, teste pelo menos mais de um banco quando possível, por exemplo MySQL/MariaDB e PostgreSQL.

Não escreva SQL "portável" apenas por aparência; use placeholders e helpers do `$DB` para diferenças que o Moodle já abstrai.

## Tags e ZIP de release

Uma tag deve apontar para um estado que passou pela CI. O ZIP publicado precisa conter apenas o diretório do plugin, com o nome correto, sem `.git`, `node_modules`, arquivos temporários ou segredos.

Teste o ZIP produzido, não apenas o checkout. É comum um plugin funcionar no repositório porque existe um arquivo ignorado que nunca entrou no pacote final.

## Branches

Se o mesmo plugin precisa suportar Moodle 3.5 e uma linha anterior, decida se uma única branch consegue manter compatibilidade de forma limpa ou se o custo justifica branches separadas. Não espalhe verificações de versão por toda a aplicação quando uma pequena camada de compatibilidade resolve o problema.

## Checklist antes de publicar

O commit da release deve passar por PHP lint, Coding Style, validação do plugin, verificação de upgrade, testes PHPUnit e os cenários Behat que protegem os fluxos críticos. Se existe JavaScript AMD, o build deve estar atualizado. O ZIP precisa instalar em uma cópia limpa do Moodle 3.5.

## Exercício

Configure um repositório de `mod_checkpoint` com Travis CI para PHP 7.0, 7.1 e 7.2. Execute lint, Coding Style, Plugin Validate, Grunt e PHPUnit; depois adicione um job Behat apenas para as features do plugin.

Crie uma tag de teste, gere o ZIP a partir da tag e instale esse ZIP em uma cópia limpa do Moodle 3.5. O exercício termina quando o artefato publicado é o mesmo código que passou pela CI.

## Referências

MOODLE. Documentação para desenvolvedores do Moodle 3.5. Disponível em: https://docs.moodle.org/dev/. Acesso em: maio de 2018.

MOODLE. Código-fonte do Moodle 3.5.0. Disponível em: https://github.com/moodle/moodle/tree/v3.5.0. Acesso em: maio de 2018.
