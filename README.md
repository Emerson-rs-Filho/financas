# Nossa Casa — finanças do casal

App web das finanças da casa: resumo do ano com gráficos, lançamentos mês a mês, cartões, investimentos e dicas de economia calculadas a partir dos dados. Tem modo claro e escuro e login com e-mail e senha.

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

## Como usar

- **Resumo:** saldo do ano, gráfico de entradas e saídas, para onde foi o dinheiro e as principais dicas.
- **Lançamentos:** escolha o mês, adicione, edite ou exclua. O botão *Copiar fixos do mês anterior* copia as contas fixas (sem cartões e "outras") para você só ajustar os valores.
- **Cartões:** faturas por mês, comparação entre os cartões e, para faturas importadas, os gastos do cartão por categoria.
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

## Estrutura

```
index.html            página única
css/style.css         visual (tema claro/escuro)
js/config.js          ← suas chaves do Supabase
js/app.js             telas e navegação
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

## Próximos passos possíveis

- Importar as abas de 2023 e 2025 e os detalhes dos cartões
- Importar faturas de outros bancos
- Metas de gasto por categoria, com alerta quando passar
