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

## Como usar

- **Resumo:** saldo do ano, gráfico de entradas e saídas, para onde foi o dinheiro e as principais dicas.
- **Lançamentos:** escolha o mês, adicione, edite ou exclua. O botão *Copiar fixos do mês anterior* copia as contas fixas (sem cartões e "outras") para você só ajustar os valores.
- **Cartões:** faturas por mês e comparação entre os cartões.
- **Investimentos:** cadastre aportes e acompanhe a meta da reserva de emergência (6× o gasto médio mensal).
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
js/seed.js            dados da planilha (2026)
js/vendor/            Chart.js e supabase-js (sem depender de CDN)
supabase/schema.sql   tabelas e segurança
supabase/seed_2026.sql dados iniciais
```

## Próximos passos possíveis

- Importar as abas de 2023 e 2025 e os detalhes dos cartões
- Lançar as compras do cartão por categoria
- Metas de gasto por categoria, com alerta quando passar
