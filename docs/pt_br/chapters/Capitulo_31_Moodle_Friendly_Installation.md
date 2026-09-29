{% raw %}

# 31 MOODLE FRIENDLY INSTALLATION: OPERAÇÃO E AUTOMAÇÃO

Até aqui quase tudo aconteceu depois que o Moodle já estava de pé. Mas quem colocou ele de pé? Quem criou banco, diretórios, configuração do servidor web, SSL, permissões, cron, diagnóstico e monitoramento? Quando você administra uma instalação isso parece rotina; quando administra dezenas, a rotina vira sistema.

É justamente esse salto que o **Moodle Friendly Installation** tenta resolver. Ele não é plugin Moodle e isso é importante: estamos saindo da arquitetura interna da plataforma e olhando para operação, automação, privilégios, filas de jobs e observabilidade ao redor dela. O projeto está em [https://github.com/EduardoKrausME/moodle_friendly_installation](https://github.com/EduardoKrausME/moodle_friendly_installation).

Não trate o repositório como receita universal de hospedagem. Quero usar uma arquitetura concreta para discutir decisões que aparecem em servidor real, principalmente uma que merece atenção desde o início: painel web não deveria ganhar `root` só porque precisa executar uma tarefa privilegiada. A partir daí entram separação de processos, fila, CRON privilegiado e os limites entre conveniência operacional e segurança.

## 31.1 O problema que o projeto resolve

Imagine um servidor com várias instalações Moodle, cada uma em `/home/[domain]/moodle`, com seu próprio `moodledata`, banco, configuração de NGINX ou Apache, certificado SSL e eventualmente um aplicativo Android próprio.

Fazer isso manualmente funciona quando existem dois sites e o administrador lembra de todos os detalhes. Quando o número cresce, a operação começa a depender da memória de alguém: criar usuário e banco, copiar configuração, ajustar permissões, instalar plugins, habilitar certificado, revisar DNS, configurar logs, verificar debug e repetir tudo isso sem esquecer uma etapa.

O Moodle Friendly Installation transforma esse fluxo em um painel que lista instalações existentes, cria novas instalações, executa diagnósticos, acompanha jobs, coleta consumo de recursos, controla algumas configurações de servidor e gera APK/AAB para cada domínio quando o suporte de APP está disponível.

## 31.2 Painel web não deve ser root

A decisão arquitetural mais importante do projeto é que o painel web **não executa diretamente as operações privilegiadas**.

PHP-FPM ou Apache atende a interface e cria um job. Um processo separado, executado por CRON como `root`, consome a fila e realiza a ação.

O fluxo fica conceitualmente assim:

```
navegador
    ↓
painel PHP
    ↓
valida entrada
    ↓
grava job pendente
    ↓
CRON root
    ↓
adquire lock
    ↓
executa operação privilegiada
    ↓
grava resultado e log
    ↓
painel exibe estado
```

Isso evita uma solução muito pior: conceder ao usuário do servidor web permissão para recarregar NGINX, alterar arquivos em `/home`, administrar bancos ou executar scripts de instalação como superusuário.

Quando um painel administrativo precisa fazer algo privilegiado, a pergunta correta não é "como faço o PHP rodar como root?", mas "como transformo essa ação em uma mensagem validada para um executor privilegiado com superfície mínima?".

## 31.3 Separação entre plano de controle e executor

O painel atua como plano de controle. Ele recebe intenção, valida parâmetros, registra estado e apresenta resultados.

O runner atua como executor. Ele conhece um conjunto fechado de tipos de job e executa apenas as operações previstas.

Essa separação reduz o impacto de uma falha no painel. Se uma entrada arbitrária enviada pelo navegador puder virar diretamente um comando de shell, a aplicação web virou uma API remota para o sistema operacional. A fila não resolve isso sozinha, mas cria uma fronteira onde cada tipo de ação pode ser validado novamente antes da execução.

## 31.4 A fila é uma máquina de estados

Um job não deveria ser apenas um arquivo JSON com um comando. Ele possui estado e regras de transição.

Um modelo simples pode usar:

```
pending
running
waiting_dns
completed
failed
cancelled
```

A transição precisa ser atômica o bastante para impedir duas execuções simultâneas e também para impedir o cancelamento depois que o runner já assumiu o job.

O projeto usa lock no runner e executa um job pendente por vez. Essa decisão reduz paralelismo, mas simplifica muito a consistência para um servidor que está modificando configuração, banco, filesystem e serviços do sistema operacional.

Antes de aumentar concorrência, é preciso responder quais operações podem rodar juntas sem disputar os mesmos arquivos, portas, pacotes, serviços ou limites do host.

## 31.5 Instalação de Moodle como pipeline

A instalação não é uma única operação. Ela é uma sequência de passos com dependências.

Em alto nível:

```
validar domínio e parâmetros
    ↓
preparar diretórios
    ↓
criar banco e credenciais
    ↓
obter código Moodle
    ↓
gerar config.php
    ↓
gerar configuração NGINX/Apache
    ↓
executar instalação CLI
    ↓
instalar plugins padrão
    ↓
emitir/validar SSL
    ↓
validar ambiente final
```

Se o DNS ainda não aponta para o servidor, por exemplo, não faz sentido tratar a emissão do certificado como uma falha definitiva do processo inteiro. Um estado de espera pode ser mais adequado do que repetir toda a instalação.

Essa diferença entre erro recuperável, dependência externa ainda não satisfeita e falha definitiva é importante em qualquer automação de infraestrutura.

## 31.6 Templates são código de produção

O projeto gera arquivos de servidor a partir de templates. Isso exige o mesmo cuidado aplicado a código PHP.

Um template de NGINX incorreto pode tirar um domínio do ar. Um template de Apache mal formado pode impedir reload. Um script de instalação com uma variável sem escape pode produzir um problema de segurança.

Por isso configuração gerada deve passar por validação antes da ativação. No caso de NGINX, `nginx -t`; no caso de Apache, `apache2ctl` ou `httpd` com a opção adequada.

O projeto valida a configuração antes de ativar mudanças e, quando a validação ou reload falha, restaura a configuração anterior. Isso é muito mais importante do que simplesmente mostrar "salvo com sucesso" na interface.

## 31.7 Rollback não é luxo

Toda ação administrativa que modifica uma configuração funcional deveria pensar no caminho de volta.

O padrão é:

```
ler estado atual
criar backup temporário
gerar novo estado
validar
ativar
testar/recarregar
se falhar:
    restaurar estado anterior
    recarregar novamente
    registrar erro
```

Sem rollback, a interface pode converter um erro simples de digitação ou template em indisponibilidade.

## 31.8 Diagnóstico precisa responder perguntas operacionais

Uma tela de diagnóstico útil não mostra apenas "OK" em verde. Ela ajuda a responder por que um site não está funcionando.

O projeto verifica, entre outros pontos:

* existência e leitura do `config.php`;
* dados básicos do banco;
* DNS do domínio;
* certificado SSL;
* arquivos de NGINX e Apache;
* flags de controle do ambiente;
* debug e maintenance mode.

O valor dessa tela está na correlação. DNS correto com SSL ausente sugere um problema diferente de DNS incorreto com certificado ainda não emitido.

## 31.9 Métricas caras não pertencem ao request web

Calcular tamanho de `moodledata`, código, banco e uso do disco pode envolver operações caras. Fazer isso em toda abertura da página transforma o painel em gerador de I/O.

O projeto coleta esses dados em background e mantém snapshots. Se o snapshot estiver ausente ou antigo, o runner atualiza as informações.

Esse padrão é simples e poderoso:

```
request web
    ↓
lê snapshot rápido

background
    ↓
faz operação cara
    ↓
substitui snapshot
```

É o mesmo raciocínio usado dentro do Moodle quando uma informação pode ser materializada ou calculada fora do caminho crítico do usuário.

## 31.10 Logs precisam ter limites

Dar acesso a logs pelo painel parece simples até alguém abrir um arquivo de vários gigabytes.

O projeto limita a leitura aos últimos 256 KB e 500 linhas e oferece filtro textual. Logs novos por domínio também entram em rotação.

Esse detalhe evita duas classes de problema: consumo exagerado de memória no PHP e uso do próprio painel como ferramenta de negação de serviço contra o servidor.

Além disso, o painel só deve permitir leitura de arquivos conhecidos. Um parâmetro como `?file=/etc/shadow` nunca pode decidir livremente o caminho que será aberto.

## 31.11 Segurança de caminhos e domínios

Domínio, diretório, package UID e nomes usados em arquivos precisam ser tratados como dados hostis.

Não basta remover `../`. O melhor desenho é converter uma entrada externa em um identificador validado e só então construir caminhos internos a partir de uma raiz conhecida.

Por exemplo, se o sistema opera apenas em `/home/[domain]`, o domínio deve passar por uma validação estrita de formato e a resolução final do caminho deve permanecer dentro da raiz esperada.

Automação de infraestrutura amplifica erros. Uma falha de path traversal em um plugin pode expor arquivos do Moodle; uma falha semelhante em um painel executado junto de um runner root pode alcançar o servidor inteiro.

## 31.12 ModSecurity e cache como jobs

Ativar ou desativar ModSecurity ou cache do NGINX não é uma simples preferência visual. É uma mudança de configuração de servidor.

Por isso essas ações entram na fila privilegiada, passam por validação de configuração e reload controlado.

A interface pode continuar oferecendo um botão simples, mas a implementação precisa tratar o clique como uma mudança operacional com possibilidade de falha e rollback.

## 31.13 SSO administrativo

O projeto permite acesso administrativo por um arquivo SSO gerado dentro do Moodle.

Esse recurso merece atenção especial porque qualquer mecanismo de login administrativo automático é, por definição, sensível.

Tokens ou arquivos temporários precisam ser imprevisíveis, ter escopo pequeno, vida curta e idealmente uso único. Também devem ser removidos ou invalidados depois do consumo.

A conveniência de "entrar como admin com um clique" nunca pode criar uma URL permanente que funcione como senha eterna.

## 31.14 Dados do painel fora de public

Usuários, fila, runtime e logs são gravados em diretórios como:

```
data/
data/logs/
data/queue/
data/runtime/
```

Esses dados não precisam ficar dentro do document root. Manter arquivos operacionais fora de `public/` reduz a chance de uma configuração incorreta do servidor web expor JSON, logs, hashes, filas ou arquivos internos.

O mesmo princípio vale para qualquer aplicação PHP: se o navegador não precisa baixar um arquivo diretamente, ele provavelmente não deveria morar no document root.

## 31.15 Senhas e bootstrap

O primeiro usuário é criado em `data/users.json`. Quando uma senha em texto simples é encontrada no primeiro login, ela é substituída por `password_hash()`.

Isso simplifica o bootstrap, mas a senha inicial ainda precisa ser protegida como segredo desde o momento em que é escrita.

Em produção, o passo seguinte natural é reduzir ao máximo o tempo em que existe segredo em texto puro e garantir permissões de arquivo restritas.

## 31.16 Build do APP como outra pipeline

A geração do aplicativo Android é uma segunda pipeline, diferente da instalação Moodle.

Ela precisa de Node.js, NPM, Cordova, Android SDK, Gradle, Java 17 e ImageMagick, além de tratar identidade do aplicativo, ícones, keystore e artefatos finais.

O projeto valida um ícone PNG 1024x1024, associa recursos ao `Package UID`, cria o keystore na primeira configuração e gera APK/AAB pela fila.

O ponto arquitetural importante é que build mobile também é processamento pesado e potencialmente lento, portanto não deve ocorrer dentro do request HTTP que recebeu o formulário.

## 31.17 Package UID não é campo cosmético

Depois que um aplicativo é publicado, mudar o package ID significa mudar sua identidade para Android e lojas.

Por isso o projeto bloqueia o `Package UID` depois da primeira gravação.

Essa é uma boa demonstração de regra de domínio: tecnicamente o campo poderia continuar editável, mas permitir isso produziria uma consequência operacional muito maior do que a interface sugere.

## 31.18 Keystore é ativo crítico

O keystore usado para assinar o APP precisa ser tratado como ativo de longo prazo.

Perder esse arquivo ou sua senha pode impedir atualizações do aplicativo. Expor esse arquivo permite que terceiros assinem builds como se fossem legítimos.

Portanto backup, permissão de filesystem e procedimento de recuperação do keystore merecem documentação própria, não apenas um campo escondido no formulário.

## 31.19 Interface multilíngue

Os textos do painel vivem em `public/app/lang/`. Cada idioma retorna um array com os textos e metadata como nome, idioma HTML e bandeira.

A seleção é mantida em sessão e cookie e também pode ser alterada pela URL.

Separar texto de interface do código evita o padrão clássico de espalhar strings por templates e condicionais, o que torna uma tradução futura praticamente uma busca e substituição manual pelo projeto inteiro.

## 31.20 O que este projeto ensina sobre segurança

O projeto junta várias fronteiras que costumam aparecer isoladas:

```
browser → PHP
PHP → fila
fila → runner root
runner → shell
runner → banco
runner → filesystem
runner → NGINX/Apache
runner → Certbot
runner → toolchain Android
```

Cada seta precisa de contrato e validação.

Quanto maior o privilégio do próximo processo, menor deve ser a liberdade da entrada anterior.

Não passe "comandos" pela fila. Passe intenção estruturada, como `install_moodle`, `toggle_modsecurity` ou `build_app`, e deixe o executor construir internamente a operação permitida.

## 31.21 O que este projeto ensina sobre observabilidade

Uma automação sem histórico vira uma caixa-preta.

Cada job deve registrar pelo menos:

```
id
tipo
domínio/alvo
estado
criado em
iniciado em
finalizado em
resultado
mensagem de erro
referência para log
```

Quando uma instalação falha às três da manhã, a pergunta não pode ser "quem lembra em qual etapa o script estava?".

## 31.22 Idempotência

Scripts de infraestrutura precisam considerar reexecução.

Se uma tentativa falha depois de criar o banco, a segunda tentativa não deveria destruir dados ou falhar apenas porque o banco agora existe. O mesmo vale para diretórios, certificados, arquivos de configuração e plugins.

Nem toda etapa consegue ser perfeitamente idempotente, mas o fluxo deve saber distinguir "já está no estado desejado" de "estado inesperado".

## 31.23 O repositório como estudo de caso

Ao estudar o código do Moodle Friendly Installation, não olhe apenas para telas. Siga um fluxo inteiro.

Por exemplo, escolha "instalar Moodle" e acompanhe:

1. onde o formulário valida domínio, branch e credenciais;
2. como o job é persistido;
3. como o runner encontra e bloqueia o job;
4. qual script executa a instalação;
5. onde são gerados NGINX/Apache e `config.php`;
6. como erros são registrados;
7. como o painel apresenta o resultado.

Depois repita o exercício para build do APP e para uma alteração de configuração de servidor.

Essa leitura transversal mostra arquitetura melhor do que analisar arquivos isolados.

## 31.24 Onde o projeto pode evoluir

Uma evolução natural é substituir gradualmente arquivos JSON por um armazenamento transacional quando volume, concorrência ou auditoria exigirem isso.

Outra é formalizar uma máquina de estados para jobs, criar políticas de retry por tipo de erro, adicionar health checks, testes automatizados dos templates e integração com um mecanismo de secrets em vez de depender de configuração estática para credenciais sensíveis.

Também faz sentido separar adaptadores de NGINX, Apache, banco e distribuição Linux quando as diferenças de ambiente começarem a produzir condicionais demais no núcleo.

A regra continua a mesma usada em plugins: abstração deve nascer de variação real, não da vontade de criar mais diretórios.

## 31.25 Exercício prático

Clone o projeto em um ambiente descartável e escolha um único fluxo para auditar.

Para a instalação Moodle, desenhe a máquina de estados do job, liste todas as entradas externas, identifique cada comando privilegiado e marque quais validações acontecem antes da fila e quais precisam acontecer novamente no runner.

Depois provoque pelo menos quatro falhas controladas: DNS incorreto, configuração NGINX inválida, credencial de banco incorreta e ausência de uma dependência de build. O painel precisa informar em qual etapa falhou sem expor senha, token ou comando sensível.

Por fim, responda a três perguntas.

Se o processo PHP for comprometido, quais ações o atacante consegue solicitar ao runner? Se um job for alterado manualmente no disco, o runner valida novamente o conteúdo ou confia cegamente nele? E se o servidor reiniciar no meio de uma instalação, como o sistema sabe se deve continuar, repetir ou exigir intervenção?

Essas respostas dizem muito mais sobre a segurança e maturidade da automação do que a aparência do dashboard.

## 31.26 Código-fonte

O projeto completo está disponível em:

[https://github.com/EduardoKrausME/moodle_friendly_installation](https://github.com/EduardoKrausME/moodle_friendly_installation)

O README do repositório contém os requisitos atuais do servidor, o comando de instalação, o fluxo do runner root, diagnósticos, geração do APP, idiomas, estrutura de dados e o fluxo operacional esperado. Como este é um projeto ativo, use sempre o repositório como referência para detalhes que podem mudar com a evolução da implementação.

{% endraw %}
