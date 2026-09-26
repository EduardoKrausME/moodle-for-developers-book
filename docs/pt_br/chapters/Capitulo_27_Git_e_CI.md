{% raw %}

# 27 GIT E CI

No Capítulo 4 nós falamos de qualidade como uma responsabilidade do desenvolvedor. Código precisa seguir Coding Style, upgrade precisa estar correto, JavaScript precisa compilar, Mustache precisa ser válido, testes precisam passar e um plugin não deveria ser publicado apenas porque abriu sem erro no ambiente de quem escreveu. O problema é que depender de memória humana para executar todas essas verificações antes de cada entrega é uma estratégia que funciona até o dia em que você está corrigindo um bug urgente, esquece um comando e publica justamente o erro que o processo deveria impedir.

É aqui que Git e CI deixam de ser ferramentas de infraestrutura e passam a fazer parte da arquitetura do plugin. Git registra o histórico, organiza manutenção entre versões e cria pontos reproduzíveis de release, enquanto Continuous Integration executa automaticamente aquilo que o projeto considera obrigatório para aceitar uma mudança. O objetivo não é criar um workflow bonito no GitHub, é transformar regras que hoje dependem de disciplina em verificações que rodam sempre.

Neste capítulo vamos continuar usando `mod_checkpoint`. No Capítulo 25 ele ganhou testes PHPUnit, no 26 ganhou jornadas Behat e agora vamos colocar tudo isso em um pipeline real com GitHub Actions e Moodle Plugin CI. O mesmo pipeline também executará PHP lint, Coding Style, PHPDoc, `validate` do Moodle Plugin CI, Moodle Plugin Validate, savepoints, Mustache, Grunt, PHPUnit e Behat, além de testar combinações selecionadas de Moodle, PHP e banco. No final, uma tag aprovada poderá gerar um ZIP reproduzível sem alguém abrir o gerenciador de arquivos e compactar a pasta manualmente.

## 27.1 Git não é apenas backup de código

Git registra estados e relações entre estados. Isso parece óbvio, mas muda a forma de trabalhar com plugin Moodle porque cada alteração passa a ter origem, diff, autor, revisão e um commit exato que pode ser reproduzido.

Quando um cliente informa que a versão instalada começou a falhar depois da atualização, a pergunta deixa de ser "qual ZIP você subiu?" e passa a ser "qual tag ou commit está instalado?". Quando uma correção precisa voltar para uma branch Moodle anterior, você consegue localizar o commit e fazer backport em vez de copiar arquivos entre pastas.

Um repositório saudável permite reconstruir uma release sem depender do computador de quem publicou.

## 27.2 Um repositório por plugin

Para plugins distribuídos separadamente, um repositório por componente costuma ser a opção mais simples. `mod_checkpoint` fica em um repositório, `local_deliveryhub` em outro e cada um possui issues, releases, tags e CI próprios.

Monorepo também é possível, principalmente quando vários componentes sempre são desenvolvidos e entregues juntos, mas ele muda a complexidade de versionamento e pipeline. Se cinco plugins independentes vivem no mesmo repositório, uma tag deixa de responder claramente qual versão de cada componente foi publicada.

Não escolha monorepo apenas porque todos os projetos pertencem à mesma empresa. Escolha quando o ciclo de desenvolvimento e entrega realmente é compartilhado.

## 27.3 O root do repositório

Para um plugin isolado, gosto de deixar o root do repositório sendo o próprio plugin:

```
mod_checkpoint/
    .github/
    classes/
    db/
    lang/
    tests/
    version.php
    README.md
```

Quando o Moodle Plugin CI fizer checkout, essa pasta será instalada no local correto dentro de uma cópia temporária do Moodle.

Essa estrutura também deixa o ZIP de release previsível, porque basta empacotar o conteúdo sob uma pasta `checkpoint` para entregar em `mod/checkpoint`.

## 27.4 `.gitignore`

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

## 27.5 Não ignore `amd/build` por reflexo

Este é um erro importante em plugin Moodle. `amd/src` contém o fonte, mas o Moodle serve em produção os arquivos compilados de `amd/build`. Se o plugin é distribuído como ZIP, os arquivos de build precisam estar presentes no pacote final.

Por isso não coloque `amd/build` no `.gitignore` apenas porque em outros ecossistemas a pasta `build` costuma ser descartável. No desenvolvimento Moodle é comum versionar o resultado compilado necessário para produção.

A mesma pergunta vale para qualquer artefato frontend: se o servidor de produção não executará o toolchain para gerar aquele arquivo, ele precisa chegar pronto na release.

## 27.6 `node_modules` não pertence ao plugin publicado

`node_modules` é dependência de desenvolvimento e pode ser recriado por `npm`. Ele não deve ser colocado no Git nem no ZIP do plugin.

O que interessa é o manifesto e, quando utilizado, o lock file que permite reconstruir a mesma árvore de dependências.

```
package.json
package-lock.json
```

O resultado necessário ao Moodle deve estar compilado em seus diretórios de build, não carregado a partir de `node_modules` em produção.

## 27.7 Composer e `vendor`

`vendor` também não deve entrar no Git apenas porque o CI usa Composer. Moodle Plugin CI, PHPCS, PHPUnit e outras ferramentas de desenvolvimento podem ser instaladas durante o pipeline.

Existe uma diferença quando o plugin possui biblioteca PHP de runtime que não existe no core. Nesse caso você precisa definir conscientemente como essa dependência chega à instalação Moodle, respeitando licença e `thirdpartylibs.xml`. Não assuma que o administrador executará `composer install` dentro de cada plugin depois de instalar o ZIP.

CI dependency e runtime dependency são problemas diferentes.

## 27.8 O lock file

Se o repositório possui seu próprio `composer.json` para ferramentas de desenvolvimento, um `composer.lock` versionado pode tornar o ambiente do CI mais reproduzível. A equipe sabe exatamente quais versões passaram na release.

Para projetos que se comportam como bibliotecas Composer, existe outra discussão sobre publicar ou não lock file, mas um plugin Moodle com toolchain próprio normalmente se beneficia de previsibilidade.

O importante é não executar `composer update` automaticamente em toda pipeline e acreditar que está testando sempre a mesma coisa. `composer install` instala o estado conhecido; `composer update` muda esse estado.

## 27.9 Commits pequenos e compreensíveis

Commit deve representar uma mudança coerente. "Corrige capability do relatório" é muito mais útil do que "mudanças" com trinta arquivos não relacionados.

Commits pequenos ajudam revisão, `git bisect`, cherry-pick e backport. Também diminuem o risco de uma correção para Moodle 4.5 carregar por acidente uma refatoração exclusiva de Moodle 5.2.

Não precisa transformar cada linha em um commit, mas cada commit deveria contar uma pequena história que faça sentido sozinho.

## 27.10 Não misture refactor com correção urgente

Se você precisa corrigir uma falha de segurança, faça a correção com o menor diff coerente. Não aproveite para renomear vinte classes, mover diretórios e trocar o padrão de acesso ao banco no mesmo commit.

O CI pode provar que os testes passaram, mas não reduz o custo humano de revisar um diff gigantesco. Separar mudança funcional de refactor facilita entender exatamente o que foi corrigido e fazer backport para branches anteriores.

## 27.11 Branch principal

A branch principal normalmente representa a linha de desenvolvimento atual. Pode se chamar `main` ou seguir outra convenção da organização.

Se o plugin suporta várias versões do Moodle, você precisa decidir se `main` aponta para a versão mais nova suportada ou para uma linha mais conservadora compatível com todas. Para plugins que acompanham APIs novas, manter `main` alinhada ao Moodle mais recente costuma simplificar o desenvolvimento.

## 27.12 Branch por versão Moodle

Quando existe divergência real entre APIs, use branches estáveis por linha Moodle. Uma convenção muito comum no ecossistema é:

```
main
MOODLE_405_STABLE
MOODLE_500_STABLE
MOODLE_501_STABLE
MOODLE_502_STABLE
```

Não é obrigatório criar uma branch para cada versão se o mesmo código realmente funciona em todas. Branch sem divergência aumenta trabalho de merge sem entregar valor.

## 27.13 Compatibilidade por uma única branch

Se `mod_checkpoint` funciona de Moodle 4.5 até 5.2 com o mesmo código e pequenas verificações de compatibilidade, uma única branch pode ser melhor. A matrix do CI prova que a compatibilidade continua existindo.

A vantagem é corrigir um bug uma vez. A desvantagem é precisar manter condicionais de compatibilidade e respeitar a menor versão de PHP suportada pelo conjunto.

Esse é um trade-off de manutenção, não uma regra religiosa de Git.

## 27.14 Quando separar branches

Separe quando a compatibilidade começa a prejudicar o código. Se Moodle 5.x exige uma arquitetura nova e manter 4.5 significa espalhar `if (class_exists(...))` por todo o projeto, uma branch estável anterior pode ser mais clara.

O custo passa a ser backportar correções importantes. Por isso a equipe precisa declarar quais branches recebem bug fixes, quais recebem apenas segurança e quais estão encerradas.

## 27.15 Estratégia de manutenção

Uma política simples pode ser:

```
main                 desenvolvimento ativo
MOODLE_502_STABLE    bug fixes e segurança
MOODLE_501_STABLE    segurança e correções críticas
MOODLE_500_STABLE    segurança até a data definida pelo projeto
```

A política do plugin não precisa ser idêntica à política do core Moodle, mas não deveria prometer suporte que ninguém testa.

Se uma branch aparece no README como suportada, ela precisa existir na matrix de CI.

## 27.16 Backport

Quando uma correção nasce em `main` e também se aplica à branch estável, prefira um commit pequeno que possa ser trazido por `cherry-pick`.

```
git checkout MOODLE_500_STABLE
git cherry-pick abc1234
```

Conflito não é motivo para copiar arquivo inteiro de outra branch. Resolva apenas as diferenças necessárias e rode o CI da branch de destino.

## 27.17 Não reescreva histórico publicado

Depois que uma branch estável e tags foram compartilhadas, evite `push --force`, rebase destrutivo e movimentação de tag.

Release é referência para instalações reais. Se `v1.4.0` apontou para um commit e depois passa a apontar para outro, duas pessoas podem dizer que usam a mesma versão e ter códigos diferentes.

Se a release estava errada, publique `v1.4.1`.

## 27.18 Tags

Tag marca um estado específico do Git que você considera uma release.

```
git tag -a v1.4.0 -m "Release 1.4.0"
git push origin v1.4.0
```

Prefira tags anotadas para releases formais porque elas possuem metadata própria e mensagem.

## 27.19 Git tag e `$plugin->version` são coisas diferentes

No `version.php` temos algo assim:

```php
$plugin->component = 'mod_checkpoint';
$plugin->version = 2026092400;
$plugin->requires = 2025041400;
$plugin->release = '1.4.0';
$plugin->maturity = MATURITY_STABLE;
```

A tag pode ser `v1.4.0`, mas quem controla o mecanismo de upgrade do Moodle é `$plugin->version`, um número monotonicamente crescente.

Git não substitui `version.php` e `version.php` não substitui Git.

## 27.20 `$plugin->version`

Esse valor precisa aumentar quando uma instalação existente precisa executar um upgrade. Uma convenção comum usa data no formato `YYYYMMDDXX`.

```
2026092400
2026092401
2026092500
```

Não diminua o número em uma branch publicada. Moodle utiliza esse valor para saber se precisa executar `db/upgrade.php` e outras etapas de atualização.

## 27.21 `$plugin->release`

`release` é um identificador humano. Pode seguir SemVer quando isso faz sentido:

```
1.4.0
1.4.1
2.0.0
```

Ele ajuda usuário e administrador a reconhecerem a release, enquanto `version` continua sendo o identificador técnico de upgrade.

Não dependa de SemVer para o core saber se deve executar upgrade, porque não é esse campo que o Moodle usa para isso.

## 27.22 Tag e release precisam concordar

Se você publica tag `v1.4.0`, mas `version.php` ainda diz `release = '1.3.2'`, o pipeline deveria falhar.

Essa é uma ótima verificação customizada de CI porque evita release com metadata incoerente. Você pode extrair o número da tag e comparar com `$plugin->release` antes de gerar o ZIP.

## 27.23 GitHub Releases

Uma GitHub Release normalmente aponta para uma tag e pode anexar artefatos, changelog e notas.

Ela é útil mesmo quando o Moodle Marketplace exige upload manual do ZIP, porque mantém um histórico reproduzível de código e artefatos.

A release no GitHub não precisa ser a única forma de distribuição, mas deve representar exatamente o mesmo código do pacote publicado.

## 27.24 Continuous Integration

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

## 27.25 CI não é CD

Continuous Integration valida mudanças. Continuous Delivery ou Deployment trata entrega automática.

Você pode ter um excelente CI e continuar publicando manualmente. Também pode gerar ZIP automaticamente sem instalar nada em produção.

Não misture as etapas. Testar um pull request não deveria ter credenciais de servidor de produção apenas porque outro workflow de release precisa delas.

## 27.26 GitHub Actions

No GitHub, workflows ficam em:

```
.github/workflows/
```

Para o plugin podemos criar:

```
.github/workflows/ci.yml
.github/workflows/release.yml
```

Separar CI de release reduz permissões e deixa mais claro qual workflow apenas testa e qual produz artefatos.

## 27.27 Trigger de CI

Uma base simples:

```
name: Moodle Plugin CI

on:
  push:
  pull_request:
  workflow_dispatch:
```

`push` valida commits enviados, `pull_request` protege integração e `workflow_dispatch` permite execução manual.

Não use `pull_request_target` para executar código não confiável do PR com secrets, porque esse evento possui implicações de segurança muito diferentes.

## 27.28 Menor privilégio no `GITHUB_TOKEN`

Se o CI apenas lê o repositório, declare:

```
permissions:
  contents: read
```

Não entregue permissão de escrita para um job que só precisa fazer checkout e testar.

A mesma ideia vale para qualquer token ou secret. Pipeline é código executável e precisa seguir o princípio de menor privilégio.

## 27.29 Checkout

O template atual do Moodle Plugin CI faz checkout do plugin em uma pasta chamada `plugin`:

```
- name: Check out repository code
  uses: actions/checkout@v6
  with:
    path: plugin
    persist-credentials: false
```

`persist-credentials: false` é uma boa proteção quando o restante do job não precisa fazer push de volta ao repositório.

## 27.30 Moodle Plugin CI

`moodle-plugin-ci` automatiza instalação de uma cópia Moodle e execução das principais verificações usadas por desenvolvedores de plugins.

O fluxo atual costuma iniciar com:

```
- name: Initialise moodle-plugin-ci
  run: |
    composer create-project -n --no-dev --prefer-dist moodlehq/moodle-plugin-ci ci ^4
    echo $(cd ci/bin; pwd) >> $GITHUB_PATH
    echo $(cd ci/vendor/bin; pwd) >> $GITHUB_PATH
    sudo locale-gen en_AU.UTF-8
```

Depois o comando `install` prepara Moodle, banco, plugin e ambientes de teste.

## 27.31 Por que usar Moodle Plugin CI

Você poderia escrever shell para clonar Moodle, instalar dependências, criar banco, copiar plugin, gerar `config.php`, inicializar PHPUnit e Behat. O problema é que teria de manter essa infraestrutura a cada mudança do core.

Moodle Plugin CI concentra esse conhecimento e expõe comandos consistentes para plugins.

Isso não impede passos customizados, apenas evita reconstruir o que já existe.

## 27.32 Instalação no workflow

Uma etapa típica:

```mustache
- name: Install Moodle Plugin CI environment
  run: moodle-plugin-ci install --plugin ./plugin --db-host=127.0.0.1
  env:
    DB: ${{ matrix.database }}
    MOODLE_BRANCH: ${{ matrix.moodle-branch }}
```

A matrix decide qual combinação será instalada naquele job.

## 27.33 Matrix

Matrix permite executar o mesmo job em combinações diferentes de versão Moodle, PHP e banco.

O exemplo ingênuo seria:

```
matrix:
  php: ['8.1', '8.2', '8.3', '8.4']
  moodle-branch: [MOODLE_405_STABLE, MOODLE_500_STABLE, MOODLE_501_STABLE, MOODLE_502_STABLE]
  database: [pgsql, mariadb]
```

Isso gera combinações inválidas, como Moodle 5.2 com PHP 8.1. Além disso explode o número de jobs sem necessariamente aumentar cobertura útil.

## 27.34 Prefira `matrix.include` para compatibilidade real

Uma matrix explícita é mais clara:

```
strategy:
  fail-fast: false
  matrix:
    include:
      - moodle-branch: MOODLE_405_STABLE
        php: '8.1'
        database: pgsql
      - moodle-branch: MOODLE_405_STABLE
        php: '8.3'
        database: mariadb
      - moodle-branch: MOODLE_500_STABLE
        php: '8.2'
        database: pgsql
      - moodle-branch: MOODLE_500_STABLE
        php: '8.4'
        database: mariadb
      - moodle-branch: MOODLE_501_STABLE
        php: '8.4'
        database: pgsql
      - moodle-branch: MOODLE_502_STABLE
        php: '8.3'
        database: mariadb
      - moodle-branch: MOODLE_502_STABLE
        php: '8.4'
        database: pgsql
```

A matrix deve seguir a política de suporte do plugin, não uma tabela copiada para sempre.

## 27.35 Teste mínimo e máximo de PHP

Uma estratégia econômica é testar pelo menos a menor e a maior versão PHP suportadas por cada linha Moodle importante.

Se o plugin declara Moodle 5.0 com PHP 8.2 a 8.4, testar só 8.4 não prova que 8.2 continua funcionando. Da mesma forma, testar apenas o mínimo deixa de encontrar incompatibilidades com a versão nova que usuários já estão adotando.

## 27.36 Moodle 4.5, 5.0, 5.1 e 5.2

As linhas recentes possuem requisitos diferentes. Moodle 4.5 parte de PHP 8.1, Moodle 5.0 e 5.1 de PHP 8.2, enquanto Moodle 5.2 parte de PHP 8.3.

Não mantenha esses números hardcoded em documentação interna para sempre sem revisar, porque suporte de PHP evolui durante a vida das branches.

O CI é onde essa política precisa virar configuração executável.

## 27.37 PostgreSQL

PostgreSQL é uma ótima segunda família de banco para descobrir SQL que por acaso funcionou em MySQL/MariaDB.

Case sensitivity, casts, agrupamento, tratamento de boolean e funções específicas expõem rápido consultas pouco portáveis.

Se o plugin promete suporte aos bancos oficiais do Moodle, testar só o banco do seu cliente principal é pouco.

## 27.38 MariaDB não é simplesmente MySQL

Apesar da compatibilidade histórica, MariaDB e MySQL possuem evolução independente. Uma query pode funcionar em um e apresentar comportamento diferente no outro.

O template atual do Moodle Plugin CI usa MariaDB e PostgreSQL como serviços principais. Se sua base instalada inclui MySQL e o plugin possui SQL complexo, adicione também uma execução MySQL representativa.

Não escreva no README "MySQL/MariaDB" como se fossem um único motor apenas porque ambos usam a extensão `mysqli` no Moodle.

## 27.39 O custo de testar todos os bancos

Testar todas as combinações de Moodle, PHP e quatro bancos pode produzir dezenas de jobs por commit. Nem sempre isso é necessário.

Uma estratégia equilibrada distribui cobertura:

```
menor Moodle + menor PHP + PostgreSQL
menor Moodle + maior PHP + MariaDB
Moodle atual + menor PHP + MariaDB
Moodle atual + maior PHP + PostgreSQL
job periódico adicional com MySQL
```

O objetivo é encontrar classes diferentes de incompatibilidade sem transformar cada typo em uma suíte de uma hora.

## 27.40 Serviços de banco no GitHub Actions

Exemplo com PostgreSQL:

```
services:
  postgres:
    image: postgres:17
    env:
      POSTGRES_USER: postgres
      POSTGRES_HOST_AUTH_METHOD: trust
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 3
```

O health check evita iniciar a instalação do Moodle antes de o banco estar pronto.

## 27.41 Serviço MariaDB

```
mariadb:
  image: mariadb:11
  env:
    MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: '1'
    MYSQL_CHARACTER_SET_SERVER: utf8mb4
    MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
  ports:
    - 3306:3306
```

Versões de imagens de CI também precisam acompanhar requisitos das branches testadas.

## 27.42 PHP Setup

O workflow precisa instalar a versão selecionada:

```mustache
- name: Setup PHP ${{ matrix.php }}
  uses: shivammathur/setup-php@v2
  with:
    php-version: ${{ matrix.php }}
    ini-values: max_input_vars=5000, opcache.enable_cli=1
    coverage: none
```

Se você não está coletando coverage naquele job, não carregue Xdebug apenas por hábito, porque ele adiciona custo.

## 27.43 PHP lint

A primeira verificação deveria ser barata:

```
- name: PHP Lint
  run: moodle-plugin-ci phplint
```

Não faz sentido gastar vários minutos instalando browser para descobrir no final que um arquivo PHP possui erro de sintaxe.

Organize o pipeline para falhar cedo em problemas baratos.

## 27.44 Moodle Coding Style

```
- name: Moodle Code Checker
  run: moodle-plugin-ci phpcs --max-warnings 0
```

`--max-warnings 0` transforma warning em dívida que precisa ser resolvida agora, em vez de acumular centenas de avisos que ninguém mais lê.

Se existe código legado, trate exceções de forma localizada e documentada, não desabilite o checker inteiro.

## 27.45 PHPDoc

```
- name: Moodle PHPDoc Checker
  run: moodle-plugin-ci phpdoc --max-warnings 0
```

Documentação de código pode parecer detalhe até uma API pública ficar ambígua para o próximo mantenedor ou para quem escreve um subplugin.

CI impede que o padrão se degrade silenciosamente.

## 27.46 `validate` do Moodle Plugin CI

```
- name: Validate plugin
  run: moodle-plugin-ci validate
```

Validate verifica metadata, estrutura e vários requisitos formais do plugin. Ele não prova segurança nem correção funcional, mas encontra uma classe importante de erros de empacotamento e declaração.

Não trate um `validate` verde como selo de plugin seguro.

## 27.47 Moodle Plugin Validate

O comando acima pertence ao Moodle Plugin CI. Ele não deve ser confundido com o [Moodle Plugin Validate](https://github.com/EduardoKrausME/moodle-plugin-validate), que é um validador estático separado e consegue inspecionar o plugin antes mesmo de o Moodle ser instalado.

Essa diferença é útil dentro do CI. O `moodle-plugin-ci validate` roda dentro do ambiente preparado pelo Moodle Plugin CI e verifica o plugin usando aquela infraestrutura. Já o Moodle Plugin Validate trabalha diretamente sobre os arquivos do repositório, não inicializa o Moodle e, por isso, consegue interromper o pipeline mais cedo quando encontra erros simples que não justificam gastar tempo montando todo o ambiente de testes.

Na raiz do projeto ele verifica requisitos básicos de empacotamento, como arquivo de licença, README, `version.php`, um `$plugin->component` válido e um `$plugin->version` numérico e positivo. Ele também cruza o arquivo base de idioma com metadados que frequentemente ficam inconsistentes durante o desenvolvimento, incluindo `pluginname`, capabilities declaradas em `db/access.php`, providers de mensagens, definições de cache, referências literais da Privacy API e chamadas literais de `get_string()` para o componente atual.

Uma área particularmente útil é a validação de subplugins. Quando existe `db/subplugins.json`, o validador confere a estrutura JSON, as chaves aceitas, nomes de tipos de subplugin, caminhos, strings obrigatórias e a consistência entre as declarações antigas em `plugintypes` e as modernas em `subplugintypes`. Depois, cada subplugin empacotado é analisado separadamente, incluindo seu próprio `version.php`, nome do componente, número de versão, dependência explícita do plugin pai e compatibilidade dessa dependência com a versão do pai entregue no mesmo repositório.

O validador também gera alguns warnings de arquitetura sem transformar toda recomendação em erro fatal. Por exemplo, ele pode avisar sobre endpoints AJAX legados e grandes fragmentos HTML construídos diretamente em JavaScript. Essa separação é importante: um nome de componente inválido deve quebrar o pipeline, enquanto um cheiro de arquitetura pode merecer revisão sem necessariamente bloquear uma correção urgente.

Como a análise é estática, ela pode rodar imediatamente depois do checkout e da configuração do PHP:

```yaml
- name: Validar plugin Moodle estaticamente
  uses: EduardoKrausME/moodle-plugin-validate@main
  with:
    plugin: ./plugin
```

Para um workflow de produção mantido por muito tempo, prefira uma tag imutável ou um commit SHA assim que o projeto publicar uma versão estável, em vez de acompanhar `@main` indefinidamente. O ponto principal aqui é a posição dessa verificação: antes de `moodle-plugin-ci install`. Não faz sentido gastar tempo criando um ambiente Moodle completo quando o repositório já possui uma string de idioma ausente, uma declaração de subplugin malformada ou metadados inválidos que uma análise estática consegue detectar em segundos.

Ele também pode ser executado localmente sem depender da GitHub Action. O repositório atualmente expõe o binário de linha de comando como `bin/moodle-string-validate`:

```bash
php bin/moodle-string-validate /caminho/para/plugin
php bin/moodle-string-validate /caminho/para/plugin --format=github
```

O formato GitHub gera annotations no workflow, enquanto o formato de texto imprime cada verificação executada como `OK`, `WARNING` ou `ERROR`. Erros retornam exit code `1`, warnings não fazem o build falhar e problemas de argumentos ou execução retornam `2`.

Esse validador não substitui Moodle Plugin CI, PHPCS, PHPUnit, Behat nem um teste real de instalação. O ganho está em obter feedback antes e validar erros específicos de repositórios de plugins Moodle que são fáceis de introduzir, mas caros de descobrir apenas depois que todo o ambiente foi montado. Em um pipeline sério, os dois validadores se complementam em vez de disputar a mesma função.

## 27.48 Savepoints

```
- name: Check upgrade savepoints
  run: moodle-plugin-ci savepoints
```

Essa etapa verifica erros comuns em `db/upgrade.php`, especialmente inconsistência entre números de versão e savepoints.

É exatamente o tipo de falha que pode passar despercebida em instalação limpa e aparecer somente no cliente que está atualizando uma versão antiga.

## 27.49 Mustache lint

```
- name: Mustache Lint
  run: moodle-plugin-ci mustache
```

Template quebrado pode não ser exercitado pelo PHPUnit e só aparecer ao abrir determinada página.

Lint barato deve rodar antes dos testes de navegador.

## 27.50 JavaScript e Grunt

```
- name: Grunt
  run: moodle-plugin-ci grunt --max-lint-warnings 0
```

O toolchain do Moodle utiliza Grunt para lint e build de JavaScript e CSS. Dependendo do código do plugin, essa etapa passa por ESLint, stylelint e tarefas de compilação.

Se você altera `amd/src` e esquece de regenerar `amd/build`, o CI deveria perceber.

## 27.51 ESLint

Quando o plugin precisa de uma verificação JavaScript específica, também pode executar as tarefas do Grunt direcionadas ao código correspondente.

O objetivo não é ter "mais um linter", mas garantir que o fonte entregue respeita as regras e que o build versionado corresponde ao que seria produzido pelo toolchain.

Nunca corrija automaticamente arquivos e faça commit dentro do CI normal. Pipeline deve verificar o commit recebido, não produzir silenciosamente um commit diferente.

## 27.52 PHPUnit

```
- name: PHPUnit tests
  run: moodle-plugin-ci phpunit --fail-on-warning
```

Tudo que foi construído no Capítulo 25 vira agora gate de merge.

Um teste que só roda no notebook do desenvolvedor é útil; um teste que roda em todo pull request é uma política de qualidade.

## 27.53 Behat

```
- name: Behat features
  id: behat
  run: moodle-plugin-ci behat --profile chrome --scss-deprecations
```

Behat é mais caro, então você pode escolher rodá-lo apenas em algumas combinações da matrix ou em um job separado.

Não precisa abrir Chrome oito vezes para provar a mesma jornada se os outros jobs já cobrem PHP e bancos.

## 27.54 Não rode Behat em toda combinação sem pensar

Uma estratégia comum é executar lint e PHPUnit em toda matrix e Behat apenas em uma combinação principal:

```
if: >-
  matrix.moodle-branch == 'MOODLE_502_STABLE' &&
  matrix.php == '8.4' &&
  matrix.database == 'pgsql'
```

Isso reduz tempo e custo sem abandonar cobertura de interface.

Se existe comportamento específico de banco visível na jornada, então justifique uma segunda combinação.

## 27.55 Faildump de Behat

Quando Behat falha no CI, screenshot e dump do navegador são muito mais úteis do que apenas "step failed".

```mustache
- name: Upload Behat faildump
  if: ${{ failure() && steps.behat.outcome == 'failure' }}
  uses: actions/upload-artifact@v7
  with:
    name: behat-faildump-${{ matrix.moodle-branch }}-${{ matrix.php }}
    path: ${{ github.workspace }}/moodledata/behat_dump
    retention-days: 7
    if-no-files-found: ignore
```

Artefato existe para diagnóstico depois que o runner já foi destruído.

## 27.56 Artifact não é cache

Cache acelera execução reaproveitando dependências. Artifact preserva saída de um job.

Use cache para downloads reconstruíveis, como pacotes Composer. Use artifact para ZIP de release, coverage, logs ou faildump.

Misturar os dois conceitos cria workflows difíceis de manter e pode introduzir risco de supply chain.

## 27.57 Cache de Composer

Runners hospedados nascem limpos, então baixar as mesmas dependências toda vez custa tempo.

Você pode guardar o diretório de cache do Composer com `actions/cache`, usando uma chave baseada em sistema, PHP e lock file.

Não cacheie secrets, tokens, arquivos de configuração sensíveis ou uma instalação Moodle inteira sem entender as consequências.

## 27.58 Cache precisa poder falhar

O pipeline deve funcionar com cache miss. Se apagar todos os caches faz o CI quebrar, você transformou cache em dependência oculta.

Cache é otimização. Fonte de verdade continua sendo manifestos, lock files e scripts reproduzíveis.

## 27.59 Segurança de cache

Cache restaurado deve ser tratado como conteúdo não confiável, principalmente em workflows que recebem pull requests externos.

Não permita que um PR não confiável escreva cache que depois será executado por um workflow privilegiado com secrets.

CI também tem superfície de ataque.

## 27.60 Composer no CI

Para dependências do próprio repositório:

```
composer validate --strict
composer install --no-interaction --prefer-dist --no-progress
```

Evite `composer update` no job normal porque isso altera o conjunto de versões em vez de verificar o conjunto versionado.

Dependência nova deve entrar por um PR separado, com lock file revisado e CI verde.

## 27.61 Dependências do Moodle Plugin CI

O próprio Moodle Plugin CI é uma ferramenta externa e evolui. Usar `^4` acompanha a linha 4.x, enquanto pinagem exata aumenta reprodutibilidade.

Existe um trade-off. Pin rígido envelhece e pode ficar incompatível com runners novos; faixa ampla pode introduzir mudança inesperada no pipeline.

Uma política saudável combina pinagem consciente com atualização automatizada revisada.

## 27.62 Dependabot

Dependabot pode abrir PRs para atualizar dependências e Actions.

Um arquivo básico:

```
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly

  - package-ecosystem: composer
    directory: /
    schedule:
      interval: weekly
```

Se o plugin possui `package.json`, você pode adicionar `npm` também.

## 27.63 Dependabot não substitui revisão

Uma PR automática ainda precisa passar pelo mesmo CI e ser revisada, principalmente em atualização major.

Não configure auto-merge irrestrito apenas porque o autor da PR é um bot. Mudança de action ou dependência pode mudar comportamento do pipeline e do build.

Automação reduz trabalho repetitivo, não remove responsabilidade.

## 27.64 Atualizando GitHub Actions

Dependabot consegue acompanhar referências como `actions/checkout`, `actions/cache` e `actions/upload-artifact`.

Isso é importante porque actions antigas deixam de ser suportadas e runners mudam. Pipeline também é software e precisa de manutenção.

## 27.65 Pin por SHA

Para ambientes com requisito de segurança maior, GitHub recomenda fixar actions de terceiros por commit SHA completo porque tag pode ser movida.

Exemplo conceitual:

```html
uses: actions/checkout@<sha-completo>
```

A desvantagem é legibilidade e manutenção, por isso ferramentas como Dependabot se tornam ainda mais úteis para abrir PRs atualizando esses SHAs de forma revisável.

## 27.66 `continue-on-error`

O template do Moodle Plugin CI costuma deixar algumas análises opcionais como PHP Mess Detector sem quebrar o job:

```
continue-on-error: true
```

Use isso apenas quando a ferramenta é informativa. Não coloque PHPUnit, PHPCS ou validate em `continue-on-error` e depois diga que o pipeline protege a qualidade.

Uma regra que pode falhar sem bloquear não é gate.

## 27.67 Falhar build em erro

O comportamento desejado para uma verificação obrigatória é simples: exit code diferente de zero precisa falhar o job.

Evite scripts assim:

```
moodle-plugin-ci phpcs || true
```

Isso produz uma pipeline verde que imprime erros em vermelho, que é pior do que não ter CI porque cria confiança falsa.

## 27.68 `fail-fast: false`

Em matrix, `fail-fast: false` permite que outras combinações continuem mesmo depois de uma falhar.

```
strategy:
  fail-fast: false
```

Isso é útil porque você quer saber se o problema ocorre só em PostgreSQL, só no PHP mínimo ou em todas as combinações.

Cancelar tudo na primeira falha economiza minutos, mas perde diagnóstico.

## 27.69 Timeout

Jobs devem possuir limite razoável:

```
timeout-minutes: 30
```

Sem timeout, um Behat travado, download preso ou banco indisponível pode consumir runner por muito tempo.

Timeout também ajuda a detectar regressão de performance da suíte.

## 27.70 Concurrency

Se um desenvolvedor envia cinco commits rapidamente para o mesmo PR, normalmente você não precisa terminar os cinco workflows antigos.

GitHub Actions permite agrupar execuções por branch ou PR e cancelar a anterior.

Isso economiza runner e entrega feedback do commit atual mais rápido.

## 27.71 Pull request como gate

A melhor utilização de CI aparece quando a branch principal exige status checks verdes antes do merge.

Se a equipe pode ignorar a pipeline e fazer push direto em `main`, CI vira relatório, não proteção.

Branch protection ou rulesets devem exigir os jobs realmente importantes.

## 27.72 Não deixe o gate depender de job instável

Se um Behat flaky bloqueia metade dos PRs por motivo aleatório, a equipe começa a ignorar o CI.

Corrija ou isole o teste instável. Um gate confiável precisa falhar por causa de mudança real, não porque o runner acordou de mau humor.

Os princípios do Capítulo 26 valem aqui com ainda mais força.

## 27.73 Instalação limpa

Uma release precisa instalar em um Moodle limpo. O processo padrão do Moodle Plugin CI já instala o plugin durante a preparação e por isso encontra vários problemas de schema e metadata.

Mesmo assim, se seu projeto possui scripts especiais ou dependências extras, crie um job explícito que simule a instalação real da distribuição, não apenas da árvore Git.

Isso encontra o clássico caso em que o repositório possui um arquivo que o script de ZIP esqueceu de incluir.

## 27.74 Teste de upgrade

Instalação limpa não testa `db/upgrade.php`. Para isso você precisa partir de uma versão anterior instalada.

Um fluxo de upgrade real é:

```
instalar release anterior
criar dados representativos
substituir código pela nova versão
executar admin/cli/upgrade.php --non-interactive
rodar verificações pós-upgrade
```

Savepoints ajuda, mas não substitui esse teste.

## 27.75 Upgrade test automatizado

Uma pipeline pode baixar uma tag anterior do próprio plugin, instalar, inserir dados de fixture, trocar para o commit atual e executar o upgrade.

Esse job é mais caro e não precisa rodar em todas as combinações. Uma combinação principal por release já entrega valor enorme.

Plugins com schema complexo deveriam considerar upgrade test um requisito de release.

## 27.76 Testar o ZIP, não apenas o repositório

O maior teste de empacotamento é instalar o próprio artefato que será publicado.

Se o pipeline testa a árvore Git e depois um script diferente remove arquivos ao gerar ZIP, ainda existe espaço para uma release quebrada.

A etapa de release deveria montar o ZIP, extrair em ambiente limpo e rodar pelo menos validate e instalação antes de anexar o artefato.

## 27.77 Gerando ZIP

Um script simples pode preparar a estrutura:

```
set -euo pipefail

rm -rf build/package
mkdir -p build/package/checkpoint

rsync -a ./ build/package/checkpoint/ \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude 'vendor' \
  --exclude 'coverage'

cd build/package
zip -r ../mod_checkpoint.zip checkpoint
```

A lista de exclusões precisa respeitar runtime dependencies do plugin.

## 27.78 Nome da pasta dentro do ZIP

Para `mod_checkpoint`, o pacote precisa resultar em uma pasta `checkpoint` com os arquivos do plugin.

Depois de gerar, sempre confira:

```
unzip -l build/mod_checkpoint.zip
```

Um ZIP com `repository-main/checkpoint` ou com todos os arquivos soltos no root pode falhar no fluxo de instalação mesmo que o código esteja perfeito.

## 27.79 ZIP reproduzível

Idealmente, duas execuções sobre o mesmo commit deveriam produzir o mesmo conteúdo lógico.

Não coloque timestamps desnecessários, logs locais, `.DS_Store`, arquivos temporários ou configuração de IDE.

O pacote deve ser consequência determinística do commit e da receita de build.

## 27.80 Arquivos gerados precisam estar atualizados

Antes do ZIP, valide se assets compilados correspondem ao fonte. Uma estratégia é rodar o build e verificar se `git diff --exit-code` continua limpo.

```
npx grunt amd
git diff --exit-code
```

Se o build modifica `amd/build`, alguém esqueceu de versionar o resultado correto.

Esse teste evita release com JavaScript antigo apesar do fonte novo estar no repositório.

## 27.81 Artefato de release

Depois de gerar o ZIP, publique como artifact do workflow:

```mustache
- name: Upload plugin ZIP
  uses: actions/upload-artifact@v7
  with:
    name: mod_checkpoint-${{ github.ref_name }}
    path: build/mod_checkpoint.zip
```

Artifact é útil para revisão e download mesmo antes de criar GitHub Release.

## 27.82 Workflow de release

Um workflow separado pode responder apenas a tags:

```
on:
  push:
    tags:
      - 'v*'
```

Ele deveria reconstruir ou reaproveitar checks essenciais, validar que tag e `version.php` concordam, gerar o ZIP e publicar o artefato.

Não dependa de "o CI do PR estava verde três dias atrás" se a tag pode ter sido criada em outro commit.

## 27.83 Release só de commit verde

Uma proteção ainda melhor é permitir tag formal apenas de commit que já passou pelos checks obrigatórios.

Isso pode ser uma regra de processo ou automação da organização.

O objetivo é impedir que alguém tague um commit local não revisado e contorne todo o pipeline.

## 27.84 Changelog

Release deve explicar o que mudou de forma útil para quem atualiza.

```
Added
- Custom completion rule for feedback received.

Fixed
- Group filtering in teacher report.
- PostgreSQL compatibility in response query.
```

Não use apenas a lista bruta de commits se os commits são detalhes internos demais para o administrador.

## 27.85 Versionamento de banco e release

Uma mudança em `install.xml` para instalações novas normalmente exige pensar também em `upgrade.php` para instalações existentes e aumentar `$plugin->version`.

CI pode verificar savepoints, mas a equipe precisa revisar semanticamente se a mudança de schema possui caminho de upgrade.

Esse é um ótimo ponto de checklist de pull request.

## 27.86 Branch de release não substitui tag

Uma branch se move; uma tag de release deveria ser imutável.

`MOODLE_500_STABLE` pode receber dezenas de commits depois de `v1.4.0`. Por isso não entregue "baixe a branch estável" quando você quer fornecer um pacote reproduzível.

Use tag ou release identificável.

## 27.87 PR de dependência

Atualização de Composer, npm ou GitHub Actions deveria entrar como PR própria quando possível.

Isso deixa claro que uma falha veio da dependência e não de uma alteração funcional no plugin.

Dependabot automatiza justamente esse tipo de manutenção, mas a separação continua importante para diagnóstico.

## 27.88 Checks rápidos e checks caros

Uma pipeline madura não precisa colocar tudo em um único job sequencial.

Você pode ter:

```
lint
unit-matrix
behat
upgrade
package
```

Lint falha rápido, unit matrix cobre compatibilidade, Behat testa jornada, upgrade protege migração e package valida entrega.

Jobs independentes também podem rodar em paralelo.

## 27.89 `needs`

Quando uma etapa depende de outra, use `needs`.

```
package:
  needs:
    - lint
    - unit-matrix
    - behat
```

Assim o ZIP só nasce depois dos gates relevantes.

Não use dependência artificial entre jobs que poderiam rodar em paralelo.

## 27.90 Job de lint separado

Executar PHPCS e validate uma vez é suficiente. Não precisa repetir os mesmos linters em oito combinações de banco se eles não dependem de banco.

Uma arquitetura melhor separa:

```
lint             1 job
phpunit matrix   N jobs
behat            1 ou 2 jobs
```

Isso reduz custo e tempo de feedback.

## 27.91 Matrix de PHPUnit

PHPUnit é onde a matrix de compatibilidade mais entrega valor, porque executa rápido comparado ao browser e toca banco e APIs reais.

Se uma query não é portável, PostgreSQL encontra. Se o código usa feature de PHP 8.4 sem perceber, o job PHP 8.2 encontra. Se uma API mudou entre 4.5 e 5.2, os dois jobs mostram.

Esse é o coração do CI de plugin Moodle.

## 27.92 Job futuro não bloqueante

Uma técnica útil é testar periodicamente contra a branch `main` do Moodle para descobrir incompatibilidades antes da próxima release.

Esse job pode começar como informativo, sem bloquear merge, porque o core em desenvolvimento muda. Quando a nova versão é lançada e você passa a prometer suporte, ela entra na matrix obrigatória.

Isso reduz sustos no mês da atualização.

## 27.93 Scheduled CI

Dependências e Moodle mudam mesmo quando seu plugin não recebe commits. Um workflow semanal ou mensal pode detectar regressão externa.

```
on:
  schedule:
    - cron: '17 4 * * 1'
```

Escolha horário sem significado especial para evitar picos comuns de cron em minuto zero.

## 27.94 CI e secrets

Pull requests públicos não devem receber secrets de produção. Integrações externas usadas em teste deveriam ter credenciais próprias e escopo mínimo, ou serem mockadas quando possível.

Se um job depende de secret indisponível para forks, separe-o dos checks básicos que qualquer contribuição precisa conseguir executar.

Não use `pull_request_target` apenas para "resolver" acesso a secrets rodando código do PR.

## 27.95 Produção não é ambiente de CI

Nunca configure o pipeline para testar contra banco de cliente, bucket de produção ou API destrutiva real.

CI precisa ser descartável e reproduzível. Se a integração externa não possui sandbox, construa fake server, fixture ou adapter substituível.

O pipeline deve poder rodar vinte vezes sem causar vinte matrículas, vinte cobranças ou vinte emails reais.

## 27.96 Um pipeline completo para `mod_checkpoint`

Uma estrutura possível:

```mustache
name: Moodle Plugin CI

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-24.04
    timeout-minutes: 35

    strategy:
      fail-fast: false
      matrix:
        include:
          - moodle-branch: MOODLE_500_STABLE
            php: '8.2'
            database: pgsql
          - moodle-branch: MOODLE_500_STABLE
            php: '8.4'
            database: mariadb
          - moodle-branch: MOODLE_502_STABLE
            php: '8.3'
            database: mariadb
          - moodle-branch: MOODLE_502_STABLE
            php: '8.4'
            database: pgsql

    services:
      postgres:
        image: ${{ matrix.database == 'pgsql' && 'postgres:17' || '' }}
        env:
          POSTGRES_USER: postgres
          POSTGRES_HOST_AUTH_METHOD: trust
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 3

      mariadb:
        image: ${{ matrix.database == 'mariadb' && 'mariadb:11' || '' }}
        env:
          MARIADB_ALLOW_EMPTY_ROOT_PASSWORD: '1'
          MYSQL_CHARACTER_SET_SERVER: utf8mb4
          MYSQL_COLLATION_SERVER: utf8mb4_unicode_ci
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v6
        with:
          path: plugin
          persist-credentials: false

      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          ini-values: max_input_vars=5000, opcache.enable_cli=1
          coverage: none

      - name: Validação estática do plugin Moodle
        uses: EduardoKrausME/moodle-plugin-validate@main
        with:
          plugin: ./plugin

      - name: Initialise Moodle Plugin CI
        run: |
          composer create-project -n --no-dev --prefer-dist moodlehq/moodle-plugin-ci ci ^4
          echo $(cd ci/bin; pwd) >> $GITHUB_PATH
          echo $(cd ci/vendor/bin; pwd) >> $GITHUB_PATH
          sudo locale-gen en_AU.UTF-8

      - name: Install
        run: moodle-plugin-ci install --plugin ./plugin --db-host=127.0.0.1
        env:
          DB: ${{ matrix.database }}
          MOODLE_BRANCH: ${{ matrix.moodle-branch }}

      - run: moodle-plugin-ci phplint
      - run: moodle-plugin-ci phpcs --max-warnings 0
      - run: moodle-plugin-ci phpdoc --max-warnings 0
      - run: moodle-plugin-ci validate
      - run: moodle-plugin-ci savepoints
      - run: moodle-plugin-ci mustache
      - run: moodle-plugin-ci grunt --max-lint-warnings 0
      - run: moodle-plugin-ci phpunit --fail-on-warning
```

Esse exemplo ainda pode ser refinado separando linters da matrix, mas já transforma a política em código executável.

## 27.97 Adicionando Behat sem multiplicar custo

No mesmo job, acrescente condição:

```
- name: Behat
  id: behat
  if: >-
    matrix.moodle-branch == 'MOODLE_502_STABLE' &&
    matrix.php == '8.4' &&
    matrix.database == 'pgsql'
  run: moodle-plugin-ci behat --profile chrome --scss-deprecations
```

Assim Behat continua protegendo a jornada principal sem quadruplicar o tempo da matrix.

## 27.98 Separando lint da matrix

Em projeto maior eu prefiro um job `lint` independente e outro `phpunit` com matrix. Isso evita rodar PHPCS quatro vezes.

A arquitetura pode ficar:

```
lint
  |
  +------ phpunit[4 combinações]
  |
  +------ behat
  |
  +------ upgrade
             |
             +------ package
```

O package só aparece quando todos os gates necessários estiverem verdes.

## 27.99 Checklist de uma release

Antes de publicar uma tag, o projeto deveria conseguir responder automaticamente a quase tudo:

```
version.php atualizado
upgrade.php coerente
PHPCS verde
PHPDoc verde
Moodle Plugin Validate verde
Moodle Plugin CI validate verde
Savepoints verdes
Mustache verde
Grunt verde
PHPUnit verde
Behat verde
upgrade test verde
ZIP gerado da árvore limpa
ZIP reinstalado em ambiente limpo
```

Quanto menos itens dependerem de "lembrei de rodar", mais previsível é a release.

## 27.100 Exercício - pipeline completo do projeto

Pegue `mod_checkpoint` dos capítulos anteriores e transforme o repositório em um projeto que não permite merge de código quebrado.

Crie `.gitignore`, defina a estratégia de branches e documente quais versões Moodle são suportadas. Adicione `version.php` coerente com uma release `1.0.0` e crie uma tag de teste sem publicá-la ainda.

Monte um GitHub Actions com um job de lint executando PHP lint, PHPCS, PHPDoc, Moodle Plugin Validate, `validate` do Moodle Plugin CI, savepoints, Mustache e Grunt. Depois crie uma matrix PHPUnit com pelo menos duas versões Moodle, menor e maior PHP suportados e PostgreSQL/MariaDB. Adicione Behat em apenas uma combinação principal.

Crie um segundo workflow de release acionado por tag. Ele deve verificar se a tag `vX.Y.Z` corresponde a `$plugin->release`, garantir que a árvore está limpa depois do build frontend, gerar `mod_checkpoint-X.Y.Z.zip`, listar o conteúdo do ZIP e publicá-lo como artifact.

Depois provoque intencionalmente seis falhas: erro de sintaxe PHP, warning de PHPCS, savepoint incorreto, Mustache inválido, teste PHPUnit quebrado e `amd/build` desatualizado. Em todos os casos o pipeline precisa ficar vermelho pelo motivo correto.

Por fim, crie uma alteração em `install.xml` acompanhada de `upgrade.php`, instale a tag anterior, rode upgrade automatizado para o commit atual e confirme que os dados antigos continuam válidos. Quando isso funcionar, o pipeline deixou de ser decoração no README e passou a proteger de verdade a manutenção do plugin.

## 27.101 Fechando o capítulo

Git organiza a história do plugin, mas CI transforma essa história em um processo verificável. Branches definem linhas de manutenção, tags tornam releases reproduzíveis, `version.php` controla upgrades e a pipeline impede que uma mudança avance sem passar pelas regras que o projeto decidiu exigir.

O objetivo não é executar o maior número possível de ferramentas. É escolher verificações que representam riscos reais e colocá-las no lugar certo. Lint deve falhar rápido, PHPUnit deve cobrir combinações de Moodle, PHP e banco, Behat deve proteger jornadas críticas, upgrade test deve provar migrações e o ZIP final deve ser testado como o artefato que realmente será distribuído.

A partir daqui qualidade deixa de ser uma lembrança no final do desenvolvimento e passa a ser parte do fluxo normal de cada commit.

## Referências técnicas consultadas

* KRAUS, Eduardo. Moodle Plugin Validate. Validador estático para estrutura, metadados, subplugins, strings de idioma, referências da Privacy API e verificações selecionadas de qualidade de código em plugins Moodle. Disponível em: https://github.com/EduardoKrausME/moodle-plugin-validate. Acesso em: 26 set. 2026.
MOODLEHQ. Moodle Plugin CI. Documentação e templates de GitHub Actions. Disponível em: https://github.com/moodlehq/moodle-plugin-ci. Acesso em: 24 set. 2026.

MOODLEHQ. Moodle Plugin CI. `gha.dist.yml`. Disponível em: https://github.com/moodlehq/moodle-plugin-ci/blob/main/gha.dist.yml. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. GitHub Actions integration. Disponível em: https://moodledev.io/general/development/tools/gha. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. NodeJS and Grunt. Disponível em: https://moodledev.io/general/development/tools/nodejs. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. PHP CodeSniffer. Disponível em: https://moodledev.io/general/development/tools/phpcs. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Plugin code prechecks. Disponível em: https://moodledev.io/general/community/plugincontribution/codeprechecks. Acesso em: 24 set. 2026.
* MOODLE. Moodle Developer Resources. Moodle 4.5, 5.0, 5.1 e 5.2 release requirements. Disponível em: https://moodledev.io/general/releases. Acesso em: 24 set. 2026.
* GITHUB. Workflow syntax for GitHub Actions. Disponível em: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax. Acesso em: 24 set. 2026.
* GITHUB. Dependency caching. Disponível em: https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching. Acesso em: 24 set. 2026.
* GITHUB. Workflow artifacts. Disponível em: https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts. Acesso em: 24 set. 2026.
* GITHUB. Secure use reference. Disponível em: https://docs.github.com/en/actions/reference/security/secure-use. Acesso em: 24 set. 2026.
* GITHUB. Dependabot version updates. Disponível em: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates. Acesso em: 24 set. 2026.

{% endraw %}
