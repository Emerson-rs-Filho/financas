// Edge Function "openfinance": traz as transações do Open Finance (pelo MeuPluggy) para revisão no app.
// Nada entra direto nos lançamentos: tudo vai para of_pendentes, e a casa confirma pelo app.
//   POST {acao:'sync'}                 (logado) → sincroniza todas as conexões
//   POST {acao:'adicionar', item_id}   (logado) → cadastra uma conexão do MeuPluggy e já sincroniza
//   POST {acao:'remover', item_id}     (logado) → tira a conexão do app (os lançamentos já importados ficam)
//   POST {acao:'sync-todos'}  (header x-cron-secret) → o mesmo que sync, para o pg_cron
// Deploy (veja o README):
//   npx supabase functions deploy openfinance --no-verify-jwt
import { CORS, json, Erro, env, db, usuario } from '../_shared/google.ts';
import { mapearTransacao, historicos } from './mapear.js';

const API = 'https://api.pluggy.ai';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = 864e5;
const isoDia = (t: number) => new Date(t).toISOString().slice(0, 10);

// ---------- API da Pluggy ----------
let chave: { valor: string; ate: number } | null = null;
async function apiKey() {
  if (chave && chave.ate > Date.now()) return chave.valor;
  const r = await fetch(`${API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: env('PLUGGY_CLIENT_ID'), clientSecret: env('PLUGGY_CLIENT_SECRET') }),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || !b.apiKey) throw new Erro(`A Pluggy recusou as credenciais (${b.message || r.status}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.`, 502);
  chave = { valor: b.apiKey, ate: Date.now() + 90 * 60e3 }; // a chave vale 2 h
  return chave.valor;
}

// deno-lint-ignore no-explicit-any
async function pluggy(path: string): Promise<any> {
  const r = await fetch(API + path, { headers: { 'X-API-KEY': await apiKey(), Accept: 'application/json' } });
  const b = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Erro('A Pluggy não encontrou essa conexão. Confira o código do item no painel da Pluggy.', 404);
  if (!r.ok) throw new Erro(`A Pluggy respondeu ${r.status}${b.message ? `: ${b.message}` : ''}.`, 502);
  return b;
}

// deno-lint-ignore no-explicit-any
async function todasAsPaginas(path: string): Promise<any[]> {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const b = await pluggy(`${path}&pageSize=500&page=${page}`);
    out.push(...(b.results || []));
    if (!b.totalPages || page >= b.totalPages) break;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
function problemaDoItem(item: any): string | null {
  if (['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT'].includes(item.status) || /ERROR/.test(item.executionStatus || '')) {
    return 'O banco não está atualizando. A autorização pode ter vencido: entre no MeuPluggy e reconecte a conta.';
  }
  return null;
}

// ---------- sincronização ----------
async function lerHistorico() {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('lancamentos').select('id, tipo, descricao, categoria, cartao').order('id').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return historicos(all);
}

// Primeira vez: desde o começo do mês passado. Depois: 7 dias antes do último sync (o banco às vezes atrasa).
function inicio(ultimo: string | null) {
  if (ultimo) return isoDia(Date.parse(ultimo) - 7 * DIA);
  const h = new Date();
  return isoDia(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1));
}

async function syncItem(item_id: string, ultimo: string | null, hist: Awaited<ReturnType<typeof lerHistorico>>) {
  const item = await pluggy(`/items/${item_id}`);
  const contas = (await pluggy(`/accounts?itemId=${item_id}`)).results || [];
  if (contas.length) {
    // só nome e tipo: o apelido e o "ativa" escolhidos no app não são tocados
    // deno-lint-ignore no-explicit-any
    const { error } = await db.from('of_contas').upsert(contas.map((c: any) => ({ conta_id: c.id, item_id, nome: c.marketingName || c.name || 'Conta', tipo: c.type })), { onConflict: 'conta_id' });
    if (error) throw error;
  }
  const { data: minhas, error: e2 } = await db.from('of_contas').select('conta_id, tipo, ativa').eq('item_id', item_id);
  if (e2) throw e2;

  const desde = inicio(ultimo);
  const linhas = [];
  for (const c of minhas || []) {
    if (!c.ativa) continue;
    const faturas = new Map<string, string>();
    if (c.tipo === 'CREDIT') {
      try {
        // deno-lint-ignore no-explicit-any
        (await pluggy(`/bills?accountId=${c.conta_id}`)).results?.forEach((f: any) => faturas.set(f.id, f.dueDate));
      } catch { /* sem faturas: usa o mês seguinte à compra */ }
    }
    for (const tx of await todasAsPaginas(`/transactions?accountId=${c.conta_id}&from=${desde}`)) {
      const l = mapearTransacao(tx, { id: c.conta_id, tipo: c.tipo }, faturas, hist);
      if (l) linhas.push(l);
    }
  }

  // import_key repetida (já pendente, importada ou descartada) é ignorada
  let novas = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { data, error } = await db.from('of_pendentes').upsert(linhas.slice(i, i + 500), { onConflict: 'import_key', ignoreDuplicates: true }).select('id');
    if (error) throw error;
    novas += (data || []).length;
  }
  await db.from('of_itens').update({ nome: item.connector?.name || 'Banco', status: item.status, ultimo_sync: new Date().toISOString(), erro: problemaDoItem(item) })
    .eq('item_id', item_id);
  return novas;
}

async function syncTodos() {
  const { data: itens, error } = await db.from('of_itens').select('item_id, nome, ultimo_sync');
  if (error) throw error;
  const hist = await lerHistorico();
  let novas = 0;
  const erros: string[] = [];
  for (const it of itens || []) {
    try { novas += await syncItem(it.item_id, it.ultimo_sync, hist); } catch (e) {
      const msg = (e as Error).message;
      erros.push(`${it.nome}: ${msg}`);
      await db.from('of_itens').update({ erro: msg }).eq('item_id', it.item_id);
    }
  }
  return { ok: true, conexoes: (itens || []).length, novas, erros };
}

async function adicionar(item_id: string) {
  if (!UUID.test(item_id)) throw new Erro('O código do item é um UUID (ex.: 1a2b3c4d-…). Copie-o do painel da Pluggy.');
  const item = await pluggy(`/items/${item_id}`);
  const { error } = await db.from('of_itens').upsert({ item_id, nome: item.connector?.name || 'Banco', status: item.status }, { onConflict: 'item_id' });
  if (error) throw error;
  const novas = await syncItem(item_id, null, await lerHistorico());
  return { ok: true, novas };
}

async function remover(item_id: string) {
  const { error } = await db.from('of_itens').delete().eq('item_id', item_id);
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    // deno-lint-ignore no-explicit-any
    const b: any = await req.json().catch(() => ({}));

    if (b.acao === 'sync-todos') {
      if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'Não autorizado.' }, 401);
      return json(await syncTodos());
    }

    const u = await usuario(req);
    if (!u) return json({ error: 'Faça login no app.' }, 401);
    if (b.acao === 'sync') return json(await syncTodos());
    if (b.acao === 'adicionar') return json(await adicionar(String(b.item_id || '').trim()));
    if (b.acao === 'remover') return json(await remover(String(b.item_id || '')));
    return json({ error: 'Use acao=sync, adicionar ou remover.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, (e as Erro).status || 500);
  }
});
