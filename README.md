# Nossa Casa — painel da casa

App web para gerenciar a casa. Depois do login aparece a tela inicial com as **áreas da casa**:

- **Finanças** — resumo do ano com gráficos, lançamentos mês a mês, cartões (com importação da fatura do Nubank), investimentos, calculadoras e dicas de economia.
- **Calendário** — a agenda da família, conectada ao Google Agenda.
- **Lista de compras** — compartilhada entre vocês dois, atualiza na hora nos dois celulares e recebe itens pela Alexa ("Alexa, peça à nossa casa para adicionar leite").
- **Reparos e melhorias** — o que consertar ou melhorar na casa, por cômodo e prioridade, com fotos de antes e depois.
- **Documentos e garantias** — notas fiscais, garantias, seguros e contratos com a foto ou o PDF, e aviso antes de vencer.
- **Tarefas da casa** — o que se repete (trocar o filtro, limpar o ar-condicionado, dedetizar), com a próxima data calculada sozinha.
- **Cardápio da semana** — almoço e jantar de cada dia, com os ingredientes indo para a lista de compras.
- **Metas e sonhos** — viagem, reforma, reserva: quanto já foi guardado, quanto falta e quanto guardar por mês.

Na tela inicial, cada área mostra um aviso do que pede atenção: contas vencendo, reparos atrasados, documentos para vencer, tarefas da semana, itens na lista e o prato de hoje.

Tem modo claro e escuro, funciona no celular e no computador, e o login é com e-mail e senha.

- **Hospedagem:** GitHub Pages (grátis)
- **Login e banco de dados:** Supabase (plano grátis)
- **Dados iniciais:** aba "Geral 2026" da planilha (313 lançamentos)

Para ver o app antes de configurar qualquer coisa, abra o `index.html` com um servidor local (`python3 -m http.server`) ou publique no GitHub direto. Sem o Supabase configurado, o app roda em **modo demonstração**: qualquer e-mail e senha entram e os dados ficam só no navegador.

---

## Passo 1 — Supabase (login + banco)

1. Crie uma conta em https://supabase.com e clique em **New project**. Anote a senha do banco.
2. No menu da esquerda, vá em **SQL Editor → New query**. Cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Abra outra query, cole o arquivo `seed_2026_NAO_SUBIR.sql` (ele vem fora da pasta do app, para não ir para o GitHub) e clique em **Run**. Rode só uma vez, senão os lançamentos ficam duplicados.
4. **Desligue o cadastro público** em **Authentication → Sign In / Providers → Email** e desmarque *Allow new users to sign up*. Assim só vocês dois conseguem entrar.
5. Crie os dois usuários em **Authentication → Users → Add user → Create new user**: um para você e um para a Mayara, cada um com e-mail e senha. Marque *Auto Confirm User*.
6. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
7. Cole as duas no arquivo `js/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

A chave *anon* pode ficar no código público. Quem protege os dados são as regras do banco, que só liberam acesso para usuários logados, junto com o cadastro público desligado. **Nunca** coloque a chave `service_role` no app.

## Passo 2 — GitHub Pages

1. Crie um repositório no GitHub, por exemplo `nossa-casa`. Ele pode ser **privado**, mas Pages em repositório privado exige o plano Pro. Num repositório público, o código aparece para todo mundo, mas os dados não, porque eles ficam no Supabase.
2. Envie os arquivos desta pasta:
   ```bash
   git init && git add . && git commit -m "Nossa Casa"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/nossa-casa.git
   git push -u origin main
   ```
3. No repositório, abra **Settings → Pages → Build and deployment**, escolha *Deploy from a branch*, branch `main` e pasta `/ (root)`, e clique em **Save**.
4. Em um ou dois minutos, o app estará em `https://SEU_USUARIO.github.io/nossa-casa/`.
5. Volte ao Supabase e, em **Authentication → URL Configuration**, coloque esse endereço em *Site URL*.

## Passo 3 — Cotações (aba Calculadoras)

A aba **Calculadoras** busca cotações no Yahoo Finance e CDI, Selic e IPCA no Banco Central. O navegador não pode acessar essas fontes direto, então quem faz a busca é uma função no Supabase (`supabase/functions/cotacoes`). Só usuários logados conseguem usá-la. Para publicar a função, rode no terminal, dentro desta pasta:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF   # o código que aparece na Project URL
npx supabase functions deploy cotacoes --no-verify-jwt
```

O `--no-verify-jwt` é necessário porque a própria função confere o login. Sem a função publicada, as calculadoras de Meta, Projeção e Renda fixa continuam funcionando com uma taxa digitada à mão. Só o simulador de **Histórico** precisa dela.

## Passo 4 — Lista de compras pela Alexa (skill particular)

A Amazon desligou em julho de 2024 o acesso de outros apps à lista de compras nativa da Alexa. Por isso o Nossa Casa tem a **própria skill**, que só existe na sua conta (fica em modo de desenvolvimento, não vai para a loja e é grátis). Você fala com ela começando por "nossa casa":

- "Alexa, peça à nossa casa para adicionar leite e pão"
- "Alexa, pergunte à nossa casa o que tem na lista"
- "Alexa, diga à nossa casa que já comprei leite"
- "Alexa, abre nossa casa" → "adiciona café"

> "Alexa, adiciona leite na lista" (sem "nossa casa") continua indo para a lista **nativa** da Alexa, não para o app.

**Uma vez só:**

1. Rode de novo o `supabase/schema.sql` no SQL Editor (cria a tabela `compras_itens` e liga o tempo real).
2. Entre em https://developer.amazon.com/alexa/console/ask com **a mesma conta Amazon dos seus Echo** e clique em **Create Skill**:
   - nome: *Nossa Casa* · idioma: **Portuguese (BR)**
   - tipo: **Other → Custom** · hospedagem: **Provision your own**
   - template: **Start from Scratch**
3. No menu da skill, abra **Interaction Model → JSON Editor**, apague tudo, cole o conteúdo de `alexa/modelo-pt-BR.json`, clique em **Save** e depois em **Build skill**.
4. Copie o **Skill ID** (aparece na lista de skills, começa com `amzn1.ask.skill.`) e publique a função, dentro desta pasta:
   ```bash
   npx supabase secrets set ALEXA_SKILL_ID=amzn1.ask.skill.COLE-AQUI
   npx supabase functions deploy alexa --no-verify-jwt
   ```
5. Em **Endpoint**, escolha **HTTPS**. Em *Default Region*, cole `https://SEU-PROJETO.supabase.co/functions/v1/alexa` (a Project URL do `js/config.js` + `/functions/v1/alexa`). No certificado, escolha *"My development endpoint is a sub-domain of a domain that has a wildcard certificate from a certificate authority"*. Clique em **Save**.
6. Na aba **Test**, troque *Off* por **Development** e escreva "abre nossa casa" para testar. Pronto: funciona em todos os Echo e no app Alexa da mesma conta.

A função confere que cada pedido veio mesmo da Alexa (assinatura da Amazon) e da sua skill (Skill ID), e grava na lista com a chave de serviço, que fica só no servidor do Supabase.

**Dica:** no app Alexa, crie uma **Rotina** com uma frase curta (ex.: "acabou o café") que dispara "peça à nossa casa para adicionar café".

## Passo 5 — Calendário (Google Agenda)

Cada pessoa da casa entra no app com o próprio login, conecta **a sua** conta Google e escolhe quais agendas a família pode ver. Quem conecta é o servidor do Supabase: as chaves do Google ficam cifradas no banco, e o navegador nunca recebe um token do Google.

**Uma vez só:**

1. Rode de novo o `supabase/schema.sql` no SQL Editor. Ele cria as tabelas `cal_*` e liga o tempo real.
2. Em https://console.cloud.google.com crie um projeto (ex.: *Nossa Casa*) e configure:
   - **APIs e serviços → Biblioteca:** ative a **Google Calendar API**.
   - **Tela de permissão OAuth:** escolha o tipo *Externo*, informe o nome *Nossa Casa* e o seu e-mail, e adicione os escopos `.../auth/calendar.events` e `.../auth/calendar.calendarlist.readonly`.
   - Depois, em **Público-alvo**, clique em **Publicar app** (status *Em produção*). Se o app ficar em *Teste*, o Google desconecta todo mundo a cada 7 dias. O app não precisa passar pela verificação do Google. Na hora de conectar aparece o aviso "o Google não verificou este app": clique em **Avançado → Acessar Nossa Casa**.
   - **Credenciais → Criar credenciais → ID do cliente OAuth:** escolha o tipo **Aplicativo da Web** e, em *URIs de redirecionamento autorizados*, coloque `https://SEU-PROJETO.supabase.co/functions/v1/google-auth`. Copie o **ID do cliente** e a **Chave secreta**.
3. Dentro desta pasta, configure os secrets e publique as funções:
   ```bash
   npx supabase secrets set GOOGLE_CLIENT_ID=COLE-O-ID GOOGLE_CLIENT_SECRET=COLE-A-CHAVE \
     APP_URL=https://SEU-USUARIO.github.io/financas/ \
     OAUTH_STATE_SECRET=$(openssl rand -hex 32) TOKEN_KEY=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 32)
   npx supabase functions deploy google-auth --no-verify-jwt
   npx supabase functions deploy agenda --no-verify-jwt
   ```
   O `APP_URL` é o endereço do app no GitHub Pages, com a barra no final. **Não troque o `TOKEN_KEY` depois**: sem ele, os tokens já guardados não podem mais ser lidos e todos precisam conectar de novo.
4. **Opcional:** para sincronizar mesmo com o app fechado, use o trecho do `pg_cron` que está comentado no fim do `schema.sql`. Sem ele, o app sincroniza sempre que alguém abre o calendário e já se passaram 5 minutos desde a última vez, e também pelo botão de sincronizar.

## Como usar

Depois de entrar, escolha a área na tela inicial. Para trocar de área: no computador, use os ícones no topo do menu lateral (ou clique em *nossa casa.*); no celular, toque no nome da área no topo ou abra o menu ☰ → *áreas da casa*. Links antigos como `#lancamentos` continuam funcionando e abrem `#financas/lancamentos`.

### Finanças

- **Resumo:** saldo do ano, gráfico de entradas e saídas, para onde foi o dinheiro e as principais dicas.
- **Lançamentos:** escolha o mês, adicione, edite ou exclua. O botão *Copiar fixos do mês anterior* copia as contas fixas (sem cartões e "outras") para você só ajustar os valores.
- **Contas:** as contas com vencimento (aluguel, luz, internet, escola…). Para cada mês mostra o que está vencido, o que vence nos próximos 7 dias e o que já foi pago. **Pagar** cria o lançamento de saída sozinho (com o valor e a data que você confirmar); **desfazer** apaga o pagamento e o lançamento. *Criar dos fixos* transforma os fixos do mês anterior em contas recorrentes — a partir daí não precisa mais copiar fixos (o botão de copiar passa a ignorar o que já é conta, para não lançar em dobro). Uma conta pode ser mensal ou avulsa, e pode ser pausada sem perder o histórico.
- **Orçamento:** teto mensal por categoria (mercado, delivery, lazer…). Mostra quanto já foi gasto no mês, com barra verde até 80%, laranja até 100% e vermelha acima. A sugestão de teto é a média mensal da categoria no ano. O **Resumo** avisa no topo quando há conta vencida ou vencendo em até 3 dias e quando uma categoria passa de 80% do teto.
- **Cartões:** faturas por mês, comparação entre os cartões e, para faturas importadas, os gastos do cartão por categoria.

> **Já usa o app?** Para ativar Contas e Orçamento, rode de novo o `supabase/schema.sql` no SQL Editor (cria as tabelas `orcamentos`, `contas` e `contas_pagamentos`; não mexe nos dados).
- **Importar fatura (Nubank):** no app do Nubank, abra a fatura e exporte em CSV (arquivo `Nubank_AAAA-MM-DD.csv`). Em *Lançamentos* ou *Cartões*, clique em **Importar fatura** e escolha o arquivo. Cada compra vira um lançamento no mês da fatura (data do nome do arquivo), com categoria sugerida; revise e clique em *Importar*. O pagamento da fatura anterior é ignorado, estornos entram negativos e importar o mesmo arquivo de novo não duplica nada. As categorias que vocês corrigirem são lembradas nas próximas faturas. Se o mês já tiver uma linha "Nubank" com o total da fatura, o app oferece removê-la para não contar em dobro.

> **Já usa o app?** Para ativar a importação, rode de novo o `supabase/schema.sql` inteiro no **SQL Editor** do Supabase. Ele só adiciona as colunas novas (`cartao`, `data_compra`, `import_key`) e não mexe nos dados.
- **Investimentos:** cadastre aportes e acompanhe a meta da reserva de emergência (6× o gasto médio mensal).
- **Calculadoras:**
  - **Meta:** quanto guardar por mês para juntar um valor num prazo.
  - **Projeção:** juros compostos com aportes mensais.
  - **Histórico:** "e se eu tivesse investido em PETR4.SA, BOVA11.SA, BTC-BRL… desde 2020?", comparado com o CDI.
  - **Renda fixa:** CDB × LCI/LCA × Tesouro Selic × poupança, já descontando o IR.
- **Dicas:** sugestões geradas pelos próprios dados, como contas que subiram, contas que oscilam, custos anuais concentrados e meses no vermelho.

Os meses do ano corrente que ainda não fecharam aparecem como previsão (tracejado) e não entram nas médias.

### Lista de compras

> Já usa o app? Rode de novo o `supabase/schema.sql`: ele cria a tabela `compras_fechamentos`. Não precisa publicar a função da Alexa de novo.

- Digite no campo e aperte Enter. Dá para adicionar vários de uma vez e com quantidade: "2 leite, pão e 1 kg de café".
- A lista aparece **por corredor do mercado** (hortifrúti, padaria, açougue, frios, mercearia, bebidas, limpeza, higiene…), na ordem em que se anda na loja.
- Toque no item para pôr **no carrinho**; toque de novo para voltar.
- **Fechar compra:** tira do carrinho e guarda em *últimas compras*. Se informar o valor e pagar no débito, Pix ou dinheiro, cria a saída em Finanças. No crédito não lança, porque o gasto entra pela fatura importada.
- **Frequentes:** acima da lista aparecem os itens que vocês mais compraram nos últimos 90 dias e que não estão na lista; um toque adiciona.
- **Últimas compras:** toque numa compra para ver os itens, pôr tudo na lista de novo ou excluir (apaga também o lançamento que ela criou).
- Itens que vieram pela Alexa aparecem com o selo **alexa**. Um item repetido não é duplicado: se já foi comprado, ele volta para a lista.
- A lista atualiza sozinha quando o outro celular ou a Alexa mexe nela.

### Reparos e melhorias

> Já usa o app? Rode de novo o `supabase/schema.sql` no SQL Editor: ele cria as tabelas `reparos` e `reparos_fotos` e o espaço de fotos (bucket privado `reparos`).

- **Novo:** o que precisa ser feito, cômodo, tipo (reparo ou melhoria), prioridade, quem faz, prazo, custo previsto, detalhes e fotos. No celular, o campo de fotos abre a câmera ou a galeria.
- **Lista:** em aberto primeiro, por prioridade e prazo; itens atrasados ficam em vermelho. Filtre por situação e por cômodo.
- **Detalhe:** toque no item para ver tudo, mudar a situação (a fazer · fazendo · feito), adicionar ou apagar fotos de *antes* e *depois* e ampliar uma foto.
- **Concluir:** informe quanto custou e, se quiser, marque *lançar este gasto em Finanças* (vira uma saída no mês da conclusão). Não marque se pagou no cartão de crédito: o gasto já entra pela fatura importada.
- As fotos são reduzidas no próprio celular antes de enviar e ficam num espaço privado do Supabase: só quem está logado vê. No modo demonstração ficam no navegador, em tamanho pequeno.

### Documentos e garantias

> Já usa o app? Rode de novo o `supabase/schema.sql`: ele cria a tabela `documentos` e o espaço de arquivos (bucket privado `documentos`).

- **Novo:** nome, tipo (garantia, nota fiscal, seguro, documento pessoal, contrato, manual), de quem ou do quê, vencimento, com quantos dias de antecedência avisar, observações e o arquivo (foto ou PDF, até 20 MB).
- **Garantia:** informe a data da compra e os meses de garantia e o vencimento é calculado.
- **Lista:** os vencidos aparecem primeiro, depois os que estão vencendo, depois os demais. Dá para buscar e filtrar por tipo.
- **Abrir o arquivo:** o app gera um link que vale 5 minutos. Os arquivos ficam num espaço privado do Supabase, que só quem está logado acessa.
- No modo demonstração o arquivo não é guardado, só os dados.

### Tarefas da casa

> Já usa o app? Rode de novo o `supabase/schema.sql`: ele cria as tabelas `rotinas` e `rotinas_feitas`.

- **Nova:** o que fazer, de quanto em quanto tempo (dias, semanas, meses ou anos), a próxima data, onde e quem costuma fazer. *Sugestões* traz uma lista pronta para marcar.
- **Lista:** atrasadas primeiro, depois as dos próximos 7 dias e as demais.
- **Feito:** registra quem fez e quando, e agenda a próxima vez contando a partir de hoje.
- Toque na tarefa para editar, pausar, ver as últimas vezes ou desfazer a última.
- Reparos é para o que se faz uma vez; aqui fica o que volta sempre.

### Cardápio da semana

> Já usa o app? Rode de novo o `supabase/schema.sql`: ele cria a tabela `cardapio`.

- Toque em *almoço* ou *jantar* de um dia para escolher o prato e anotar os ingredientes que precisam ser comprados, separados por vírgula.
- Ao escolher um prato que vocês já fizeram, os ingredientes da última vez vêm preenchidos.
- **Mandar ingredientes para a lista:** junta os ingredientes da semana (de hoje em diante), você desmarca o que já tem em casa e o resto vai para a Lista de compras, sem repetir o que já está lá.
- As setas mudam de semana, para planejar a próxima ou rever as anteriores.

### Metas e sonhos

> Já usa o app? Rode de novo o `supabase/schema.sql`: ele cria as tabelas `metas` e `metas_aportes`.

- **Nova meta:** nome, quanto custa e, se quiser, para quando. Com prazo, o app calcula quanto guardar por mês.
- **Guardar:** anote cada valor guardado (ou retirado). Isso só acompanha a meta; não cria lançamento em Finanças.
- **Ligar a um investimento:** escolha um investimento de Finanças e o guardado passa a ser o valor atual dele, sem anotar nada à mão.
- Toque na meta para ver o histórico, editar ou excluir.

### Calendário

- **Agendas:** toque em *conectar Google Agenda* e autorize. Depois, em cada agenda, marque:
  - **compartilhar com a família** para que todos vejam os eventos dela;
  - **família pode adicionar eventos** para que os outros criem eventos nela, que vão direto para o seu Google Agenda.
  
  Agendas não marcadas não aparecem para ninguém. Eventos marcados como *particulares* no Google aparecem só como "Ocupado".
- **Agenda:** os próximos 30 dias, separados por dia, com uma cor por agenda e o nome de quem compartilhou. *Mostrar mais 30 dias* vai mais longe.
- **Mês:** a grade do mês. Toque num dia para ver os eventos daquele dia ou para adicionar um.
- **Novo evento:** escolha a agenda (as suas compartilhadas e as que a família liberou). Quem criou o evento pelo app, ou o dono da agenda, pode excluí-lo.
- Para editar um evento, use o Google Agenda. A mudança aparece no app na próxima sincronização.

### Cópia de segurança

Na tela inicial, o botão com a seta para baixo (ao lado do tema) baixa uma planilha do Excel com tudo: lançamentos, investimentos, contas, orçamento, compras, reparos, documentos, tarefas, cardápio e metas, uma aba para cada. O plano grátis do Supabase não faz backup automático, então vale baixar de vez em quando e guardar num lugar seguro. Fotos e arquivos anexados não entram na planilha, e ela não serve para restaurar os dados automaticamente.

## Estrutura

```
index.html            página única
css/style.css         visual (tema claro/escuro)
js/config.js          ← suas chaves do Supabase
js/app.js             núcleo: login, tela inicial, rotas, menus
js/modulos.js         lista das áreas da casa (módulos)
js/ui.js              utilitários de tela e ícones compartilhados
js/avisos.js          avisos da tela inicial (o que pede atenção em cada área)
js/backup.js          cópia de segurança em planilha (.xlsx)
js/financas/index.js  módulo Finanças (todas as telas de finanças)
js/compras/           módulo Lista de compras (itens.js entende "2 leite, pão e café"; corredores.js separa por corredor)
js/calendario/        módulo Calendário (agenda, mês, agendas conectadas)
js/reparos/           módulo Reparos e melhorias (com fotos no Storage)
js/documentos/        módulo Documentos e garantias (arquivos no Storage)
js/rotina/            módulo Tarefas da casa (o que se repete)
js/cardapio/          módulo Cardápio da semana
js/metas/             módulo Metas e sonhos
supabase/functions/google-auth/  conecta/desconecta a conta Google (OAuth)
supabase/functions/agenda/       sincroniza, cria e exclui eventos no Google Agenda
supabase/functions/_shared/      código comum das duas (tokens cifrados, Calendar API)
alexa/modelo-pt-BR.json        modelo de voz da skill (colar no console da Alexa)
supabase/functions/alexa/      função que atende a skill (usa uma cópia de itens.js)
js/data.js            Supabase / modo demonstração
js/insights.js        cálculos e dicas
js/importar.js        leitura do CSV do Nubank e sugestão de categorias
js/calc.js            fórmulas das calculadoras
supabase/functions/cotacoes/  função que busca Yahoo + Banco Central
js/seed.js            dados da planilha (2026)
js/vendor/            Chart.js e supabase-js (sem depender de CDN)
supabase/schema.sql   tabelas e segurança
supabase/seed_2026.sql dados iniciais
```

## Como criar uma nova área (módulo)

1. Crie a pasta `js/<id>/` com um `index.js` que exporta o módulo:
   ```js
   export default {
     id: 'calendario', nome: 'Calendário',
     abas: [['mes', 'Mês', 'calendario']],           // [id, nome, ícone de js/ui.js]
     barra: ['mes'],                                 // opcional: itens da barra inferior no celular
     async carregar(ctx) { /* busca os dados na primeira entrada */ },
     render(aba, el, ctx) { el.innerHTML = '...'; }, // desenha a aba; ctx.render() redesenha tudo
     acao(nome, botao, ctx) { /* cliques em [data-action] */ },
     mudou(ev, ctx) {},                              // opcional: eventos change
     topo(ctx, id) { return ''; },                   // opcional: controles extras no menu (ex.: ano)
   };
   ```
2. Em `js/modulos.js`, troque o status da área para `'ativo'` e aponte o `load()` para o arquivo.
3. Se a área precisar de tabelas, acrescente-as em `supabase/schema.sql` com as mesmas regras de segurança.

## Próximos passos possíveis

- Calendário: editar eventos pelo app e mostrar as contas a vencer do módulo Finanças
- Importar as abas de 2023 e 2025 e os detalhes dos cartões
- Importar faturas de outros bancos
