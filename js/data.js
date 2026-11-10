// Camada de dados: Supabase quando configurado, senão modo demonstração (localStorage).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { seedLancamentos } from './seed.js';

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
let sb = null;

async function client() {
  if (sb) return sb;
  if (!window.supabase) {
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/supabase.js';
      s.onload = ok; s.onerror = () => fail(new Error('Não foi possível carregar o Supabase.'));
      document.head.appendChild(s);
    });
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return sb;
}

// ---------- modo demonstração ----------
const LS = 'nossa-casa-demo-v1';
function demoLoad() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* sem storage */ }
  return { user: null, lancamentos: seedLancamentos(), investimentos: [], compras: [], nextId: 100000 };
}
let demo = demoLoad();
function demoSave() { try { localStorage.setItem(LS, JSON.stringify(demo)); } catch (e) { /* ok */ } }

// ---------- autenticação ----------
export async function currentUser() {
  if (DEMO) return demo.user;
  const c = await client();
  const { data } = await c.auth.getSession();
  return data.session ? data.session.user : null;
}

export async function signIn(email, password) {
  if (DEMO) {
    if (!email || !password) throw new Error('Informe e-mail e senha.');
    demo.user = { email };
    demoSave();
    return demo.user;
  }
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
  return data.user;
}

export async function signOut() {
  if (DEMO) { demo.user = null; demoSave(); return; }
  const c = await client();
  await c.auth.signOut();
}

// ---------- lançamentos ----------
export async function listLancamentos() {
  if (DEMO) return demo.lancamentos.slice();
  const c = await client();
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await c.from('lancamentos').select('*').order('id').range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all.map((r) => ({ ...r, valor: Number(r.valor) }));
}

export async function saveLancamento(l) {
  const row = { ano: +l.ano, mes: +l.mes, tipo: l.tipo, descricao: l.descricao.trim(), categoria: l.categoria.trim(), valor: +l.valor };
  // só envia as colunas da importação quando usadas, para funcionar mesmo antes de rodar o schema novo
  if (l.cartao) Object.assign(row, { cartao: l.cartao.trim(), data_compra: l.data_compra || null });
  if (DEMO) {
    if (l.id) Object.assign(demo.lancamentos.find((x) => x.id === +l.id), row);
    else demo.lancamentos.push({ id: demo.nextId++, ...row });
    demoSave();
    return;
  }
  const c = await client();
  const q = l.id ? c.from('lancamentos').update(row).eq('id', l.id) : c.from('lancamentos').insert(row);
  const { error } = await q;
  if (error) throw error;
}

// Importa várias compras de uma vez. Linhas com import_key já existente são ignoradas.
export async function importLancamentos(rows) {
  const norm = rows.map((l) => ({ ano: +l.ano, mes: +l.mes, tipo: l.tipo, descricao: l.descricao.trim(), categoria: l.categoria.trim(),
    valor: +l.valor, cartao: l.cartao || null, data_compra: l.data_compra || null, import_key: l.import_key || null }));
  if (DEMO) {
    const ja = new Set(demo.lancamentos.map((x) => x.import_key).filter(Boolean));
    norm.filter((r) => !r.import_key || !ja.has(r.import_key)).forEach((r) => demo.lancamentos.push({ id: demo.nextId++, ...r }));
    demoSave();
    return;
  }
  const c = await client();
  for (let i = 0; i < norm.length; i += 500) {
    const { error } = await c.from('lancamentos').upsert(norm.slice(i, i + 500), { onConflict: 'import_key', ignoreDuplicates: true });
    if (error) throw new Error(/cartao|import_key|data_compra/.test(error.message)
      ? 'O banco ainda não tem as colunas da importação. Rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.' : error.message);
  }
}

export async function deleteLancamento(id) {
  if (DEMO) { demo.lancamentos = demo.lancamentos.filter((x) => x.id !== +id); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('lancamentos').delete().eq('id', id);
  if (error) throw error;
}

// ---------- investimentos ----------
export async function listInvestimentos() {
  if (DEMO) return demo.investimentos.slice();
  const c = await client();
  const { data, error } = await c.from('investimentos').select('*').order('data_aplicacao', { ascending: false });
  if (error) throw error;
  return data.map((r) => ({ ...r, valor_aplicado: Number(r.valor_aplicado), valor_atual: Number(r.valor_atual) }));
}

export async function saveInvestimento(i) {
  const row = { nome: i.nome.trim(), tipo: i.tipo, instituicao: (i.instituicao || '').trim(), valor_aplicado: +i.valor_aplicado,
    valor_atual: +(i.valor_atual || i.valor_aplicado), data_aplicacao: i.data_aplicacao || null, objetivo: i.objetivo || 'Reserva de emergência' };
  if (DEMO) {
    if (i.id) Object.assign(demo.investimentos.find((x) => x.id === +i.id), row);
    else demo.investimentos.push({ id: demo.nextId++, ...row });
    demoSave();
    return;
  }
  const c = await client();
  const q = i.id ? c.from('investimentos').update(row).eq('id', i.id) : c.from('investimentos').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteInvestimento(id) {
  if (DEMO) { demo.investimentos = demo.investimentos.filter((x) => x.id !== +id); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('investimentos').delete().eq('id', id);
  if (error) throw error;
}

// ---------- orçamento por categoria e contas a pagar ----------
const demoArr = (k) => (demo[k] || (demo[k] = []));
const semTabela = (error, nome) => new Error(error.message && error.message.includes(nome)
  ? `A tabela "${nome}" ainda não existe. Rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.` : error.message);
const numeros = (rows) => rows.map((r) => {
  const o = { ...r };
  ['teto', 'valor_previsto', 'valor'].forEach((k) => { if (o[k] != null) o[k] = Number(o[k]); });
  return o;
});
async function tabela(nome) {
  const c = await client();
  const { data, error } = await c.from(nome).select('*').order('id');
  if (error) throw semTabela(error, nome);
  return numeros(data);
}

export async function listOrcamentos() {
  if (DEMO) return demoArr('orcamentos').slice();
  return tabela('orcamentos');
}

// teto vazio ou zero remove o teto da categoria
export async function salvarOrcamento(categoria, teto) {
  teto = +teto || 0;
  if (DEMO) {
    const a = demoArr('orcamentos');
    const i = a.findIndex((x) => x.categoria === categoria);
    if (!teto) { if (i >= 0) a.splice(i, 1); } else if (i >= 0) a[i].teto = teto; else a.push({ id: demo.nextId++, categoria, teto });
    demoSave();
    return;
  }
  const c = await client();
  const { error } = teto
    ? await c.from('orcamentos').upsert({ categoria, teto }, { onConflict: 'categoria' })
    : await c.from('orcamentos').delete().eq('categoria', categoria);
  if (error) throw semTabela(error, 'orcamentos');
}

export async function listContas() {
  if (DEMO) return { contas: demoArr('contas').slice(), pagamentos: demoArr('contas_pagamentos').slice() };
  const [contas, pagamentos] = await Promise.all([tabela('contas'), tabela('contas_pagamentos')]);
  return { contas, pagamentos };
}

export async function salvarConta(k) {
  const recorrente = k.recorrente !== false && k.recorrente !== 'false';
  const row = { descricao: k.descricao.trim(), categoria: k.categoria.trim(), valor_previsto: +k.valor_previsto || 0, recorrente,
    dia_vencimento: recorrente ? +k.dia_vencimento : null, vencimento: recorrente ? null : (k.vencimento || null), ativa: k.ativa !== false };
  if (DEMO) {
    const a = demoArr('contas');
    if (k.id) Object.assign(a.find((x) => x.id === +k.id), row); else a.push({ id: demo.nextId++, ...row, criado_em: new Date().toISOString() });
    demoSave();
    return;
  }
  const c = await client();
  const { error } = k.id ? await c.from('contas').update(row).eq('id', k.id) : await c.from('contas').insert(row);
  if (error) throw semTabela(error, 'contas');
}

export async function salvarContas(lista) {
  for (const k of lista) await salvarConta(k);
}

export async function excluirConta(id) {
  if (DEMO) {
    demo.contas = demoArr('contas').filter((x) => x.id !== +id);
    demo.contas_pagamentos = demoArr('contas_pagamentos').filter((p) => p.conta_id !== +id);
    demoSave();
    return;
  }
  const c = await client();
  const { error } = await c.from('contas').delete().eq('id', id);
  if (error) throw error;
}

// Paga a conta no mês: cria o lançamento de saída e registra o pagamento ligado a ele.
export async function pagarConta({ conta, ano, mes, valor, pago_em }) {
  const lanc = { ano: +ano, mes: +mes, tipo: 'saida', descricao: conta.descricao, categoria: conta.categoria, valor: +valor };
  if (DEMO) {
    const lancamento_id = demo.nextId++;
    demo.lancamentos.push({ id: lancamento_id, ...lanc });
    demoArr('contas_pagamentos').push({ id: demo.nextId++, conta_id: conta.id, ano: +ano, mes: +mes, pago_em, valor: +valor, lancamento_id });
    demoSave();
    return;
  }
  const c = await client();
  const { data, error } = await c.from('lancamentos').insert(lanc).select('id').single();
  if (error) throw error;
  const { error: e2 } = await c.from('contas_pagamentos').insert({ conta_id: conta.id, ano: +ano, mes: +mes, pago_em, valor: +valor, lancamento_id: data.id });
  if (e2) { await c.from('lancamentos').delete().eq('id', data.id); throw semTabela(e2, 'contas_pagamentos'); }
}

// Desfaz o pagamento e apaga o lançamento que ele criou.
export async function desfazerPagamento(p) {
  if (DEMO) {
    demo.contas_pagamentos = demoArr('contas_pagamentos').filter((x) => x.id !== p.id);
    if (p.lancamento_id) demo.lancamentos = demo.lancamentos.filter((l) => l.id !== p.lancamento_id);
    demoSave();
    return;
  }
  const c = await client();
  const { error } = await c.from('contas_pagamentos').delete().eq('id', p.id);
  if (error) throw error;
  if (p.lancamento_id) await c.from('lancamentos').delete().eq('id', p.lancamento_id);
}

// ---------- cotações (Edge Function "cotacoes") ----------
const TAXAS_DEMO = { selic: { valor: 13.75, data: '' }, cdi: { valor: 13.65, data: '' }, ipca: { valor: 4.6, data: '' }, exemplo: true };

export async function cotacoes(params) {
  if (DEMO) {
    if (params.tipo === 'taxas') return TAXAS_DEMO;
    throw new Error('Cotações reais exigem o Supabase configurado (modo demonstração).');
  }
  const c = await client();
  const { data, error } = await c.functions.invoke('cotacoes?' + new URLSearchParams(params), { method: 'GET' });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (e) { /* sem corpo */ }
    if (/Failed to send|fetch/i.test(msg)) msg = 'Não foi possível falar com a função "cotacoes". Ela já foi publicada no Supabase?';
    throw new Error(msg);
  }
  return data;
}

export function resetDemo() {
  demo = { user: demo.user, lancamentos: seedLancamentos(), investimentos: [], compras: demo.compras || [], cal: demo.cal, reparos: demo.reparos, reparos_fotos: demo.reparos_fotos, nextId: Math.max(100000, demo.nextId || 0) };
  demoSave();
}

// ---------- lista de compras ----------
const demoCompras = () => {
  // relê do storage: no modo demonstração outra aba pode ter mudado a lista
  try {
    const raw = localStorage.getItem(LS);
    if (raw) { const d = JSON.parse(raw); demo.compras = d.compras || demo.compras; demo.nextId = Math.max(demo.nextId, d.nextId || 0); }
  } catch (e) { /* ok */ }
  if (!demo.compras) demo.compras = [];
  return demo.compras;
};

export async function listCompras() {
  if (DEMO) return demoCompras().slice();
  const c = await client();
  const { data, error } = await c.from('compras_itens').select('*').order('criado_em', { ascending: true });
  if (error) throw new Error(/compras_itens/.test(error.message) ? 'A tabela da lista de compras ainda não existe. Rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.' : error.message);
  return data;
}

// itens: [{ nome, quantidade }]
export async function addCompras(itens, origem = 'app') {
  const rows = itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade || null, origem, comprado: false }));
  if (DEMO) {
    const lista = demoCompras();
    rows.forEach((r) => lista.push({ id: demo.nextId++, ...r, comprado_em: null, criado_em: new Date().toISOString() }));
    demoSave();
    return;
  }
  const c = await client();
  const { error } = await c.from('compras_itens').insert(rows);
  if (error) throw error;
}

export async function updateCompra(id, campos) {
  if (DEMO) { Object.assign(demoCompras().find((x) => x.id === +id) || {}, campos); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('compras_itens').update(campos).eq('id', id);
  if (error) throw error;
}

export async function deleteCompra(id) {
  if (DEMO) { demo.compras = demoCompras().filter((x) => x.id !== +id); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('compras_itens').delete().eq('id', id);
  if (error) throw error;
}

export async function limparComprados() {
  if (DEMO) { demo.compras = demoCompras().filter((x) => !x.comprado); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('compras_itens').delete().eq('comprado', true);
  if (error) throw error;
}

// Avisa quando a lista muda em outro lugar (outro celular, Alexa). Devolve uma função para cancelar.
export function assinarCompras(cb) {
  if (DEMO) {
    const h = (ev) => { if (ev.key === LS) cb(); };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }
  let canal = null;
  client().then((c) => {
    canal = c.channel('compras_itens')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compras_itens' }, () => cb())
      .subscribe();
  });
  return () => { if (canal) canal.unsubscribe(); };
}

// ---------- reparos e melhorias (fotos no Storage, bucket privado "reparos") ----------
const BUCKET_REPAROS = 'reparos';
const CAMPOS_REPARO = ['titulo', 'descricao', 'comodo', 'tipo', 'prioridade', 'status', 'responsavel', 'prazo', 'custo_estimado', 'custo_real', 'concluido_em'];
const linhaReparo = (r) => {
  const o = {};
  CAMPOS_REPARO.forEach((k) => { if (k in r) o[k] = r[k] === '' ? null : r[k]; });
  ['custo_estimado', 'custo_real'].forEach((k) => { if (o[k] != null) o[k] = +o[k]; });
  if (o.titulo) o.titulo = o.titulo.trim();
  return o;
};
const numReparo = (r) => ({ ...r, custo_estimado: r.custo_estimado == null ? null : Number(r.custo_estimado), custo_real: r.custo_real == null ? null : Number(r.custo_real) });

export async function listReparos() {
  if (DEMO) return { reparos: demoArr('reparos').slice(), fotos: demoArr('reparos_fotos').slice() };
  const c = await client();
  const [r, f] = await Promise.all([
    c.from('reparos').select('*').order('id'),
    c.from('reparos_fotos').select('*').order('id'),
  ]);
  if (r.error) throw semTabela(r.error, 'reparos');
  if (f.error) throw semTabela(f.error, 'reparos_fotos');
  return { reparos: r.data.map(numReparo), fotos: f.data };
}

// Cria ou altera; devolve o id.
export async function salvarReparo(r) {
  const row = linhaReparo(r);
  if (DEMO) {
    const a = demoArr('reparos');
    if (r.id) { Object.assign(a.find((x) => x.id === +r.id), row); demoSave(); return +r.id; }
    const id = demo.nextId++;
    a.push({ id, status: 'a_fazer', ...row, criado_em: new Date().toISOString() });
    demoSave();
    return id;
  }
  const c = await client();
  const { data, error } = r.id
    ? await c.from('reparos').update(row).eq('id', r.id).select('id').single()
    : await c.from('reparos').insert(row).select('id').single();
  if (error) throw semTabela(error, 'reparos');
  return data.id;
}

export async function excluirReparo(id, fotos = []) {
  if (DEMO) {
    demo.reparos = demoArr('reparos').filter((x) => x.id !== +id);
    demo.reparos_fotos = demoArr('reparos_fotos').filter((f) => f.reparo_id !== +id);
    demoSave();
    return;
  }
  const c = await client();
  if (fotos.length) await c.storage.from(BUCKET_REPAROS).remove(fotos.map((f) => f.path));
  const { error } = await c.from('reparos').delete().eq('id', id);
  if (error) throw error;
}

// blob: imagem já reduzida (JPEG). momento: 'antes' | 'depois'.
export async function addFotoReparo(reparoId, blob, momento) {
  if (DEMO) {
    const dados = await new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = fail; fr.readAsDataURL(blob); });
    const a = demoArr('reparos_fotos');
    const f = { id: demo.nextId++, reparo_id: +reparoId, momento, path: '', dados, criado_em: new Date().toISOString() };
    a.push(f);
    try { localStorage.setItem(LS, JSON.stringify(demo)); } catch (e) {
      a.pop();
      throw new Error('O navegador ficou sem espaço para fotos no modo demonstração. Apague algumas fotos (no app de verdade elas ficam no Supabase).');
    }
    return f;
  }
  const c = await client();
  const path = `${reparoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const up = await c.storage.from(BUCKET_REPAROS).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw new Error(/bucket/i.test(up.error.message) ? 'O espaço de fotos "reparos" ainda não existe. Rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.' : up.error.message);
  const { data, error } = await c.from('reparos_fotos').insert({ reparo_id: +reparoId, momento, path }).select('*').single();
  if (error) { await c.storage.from(BUCKET_REPAROS).remove([path]); throw semTabela(error, 'reparos_fotos'); }
  return data;
}

export async function excluirFotoReparo(f) {
  if (DEMO) { demo.reparos_fotos = demoArr('reparos_fotos').filter((x) => x.id !== f.id); demoSave(); return; }
  const c = await client();
  await c.storage.from(BUCKET_REPAROS).remove([f.path]);
  const { error } = await c.from('reparos_fotos').delete().eq('id', f.id);
  if (error) throw error;
}

// Links temporários (1 hora) para mostrar as fotos do bucket privado. Devolve Map id → url.
const cacheUrls = new Map();
export async function urlsFotosReparo(fotos) {
  const res = new Map();
  if (DEMO) { fotos.forEach((f) => res.set(f.id, f.dados)); return res; }
  const agora = Date.now();
  const faltam = [];
  fotos.forEach((f) => {
    const c = cacheUrls.get(f.path);
    if (c && c.ate > agora) res.set(f.id, c.url); else faltam.push(f);
  });
  if (faltam.length) {
    const c = await client();
    const { data, error } = await c.storage.from(BUCKET_REPAROS).createSignedUrls(faltam.map((f) => f.path), 3600);
    if (!error) data.forEach((d, i) => {
      if (!d.signedUrl) return;
      cacheUrls.set(faltam[i].path, { url: d.signedUrl, ate: agora + 50 * 60 * 1000 });
      res.set(faltam[i].id, d.signedUrl);
    });
  }
  return res;
}

export function assinarReparos(cb) {
  if (DEMO) return () => {};
  let canal = null;
  client().then((c) => {
    canal = c.channel('reparos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reparos' }, () => cb())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reparos_fotos' }, () => cb())
      .subscribe();
  });
  return () => { if (canal) canal.unsubscribe(); };
}

// ---------- calendário (Google Agenda, via Edge Functions "google-auth" e "agenda") ----------
async function invocar(fn, body) {
  const c = await client();
  const { data, error } = await c.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (e) { /* sem corpo */ }
    if (/Failed to send|fetch/i.test(msg)) msg = `Não foi possível falar com a função "${fn}". Ela já foi publicada no Supabase?`;
    throw new Error(msg);
  }
  return data;
}

const DEMO_EU = 'demo-eu';
function demoCal() {
  if (demo.cal) return demo.cal;
  const h = (n, hh, mm = 0) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(hh, mm, 0, 0); return x.toISOString(); };
  const ev = (id, agenda_id, titulo, ini, fim, extra = {}) => ({ id, agenda_id, titulo, inicio: ini, fim, dia_inteiro: false, descricao: null, local: null, link_google: null, criado_pelo_app_por: null, ...extra });
  const dia = (id, agenda_id, titulo, n, dias = 1) => ev(id, agenda_id, titulo, h(n, 0), h(n + dias, 0), { dia_inteiro: true });
  demo.cal = {
    contas: [{ user_id: 'demo-ana', nome: 'Ana', google_email: 'ana@exemplo.com', ultimo_sync: new Date().toISOString(), erro: null }],
    agendas: [{ id: 1, user_id: 'demo-ana', nome: 'Ana', cor_google: '#8E8EF5', cor: null, principal: true, pode_escrever: true, compartilhada: true, familia_pode_criar: true }],
    eventos: [
      ev(1, 1, 'Academia', h(0, 19), h(0, 20)),
      ev(2, 1, 'Dentista', h(1, 9), h(1, 10), { local: 'Clínica Sorriso' }),
      ev(3, 1, 'Reunião da escola', h(3, 18, 30), h(3, 19, 30), { descricao: 'Levar o boletim.' }),
      dia(4, 1, 'Aniversário da vó', 6),
      dia(5, 1, 'Viagem para a praia', 12, 3),
    ],
    nextId: 1000,
  };
  return demo.cal;
}

export async function calCarregar(deISO, ateISO) {
  if (DEMO) {
    const cal = demoCal();
    const agendas = cal.agendas.filter((a) => a.compartilhada || a.user_id === DEMO_EU);
    const vis = new Set(agendas.filter((a) => a.compartilhada).map((a) => a.id));
    const eventos = cal.eventos.filter((e) => vis.has(e.agenda_id) && e.inicio < ateISO && e.fim >= deISO);
    return { meuId: DEMO_EU, contas: cal.contas.slice(), agendas: agendas.map((a) => ({ ...a })), eventos: eventos.map((e) => ({ ...e })) };
  }
  const c = await client();
  const { data: s } = await c.auth.getSession();
  const [r1, r2, r3] = await Promise.all([
    c.from('cal_contas').select('user_id, nome, google_email, ultimo_sync, erro').order('nome'),
    c.from('cal_agendas').select('id, user_id, nome, cor, cor_google, principal, pode_escrever, compartilhada, familia_pode_criar')
      .order('principal', { ascending: false }).order('nome'),
    c.from('cal_eventos').select('id, agenda_id, titulo, descricao, local, inicio, fim, dia_inteiro, link_google, criado_pelo_app_por')
      .lt('inicio', ateISO).gte('fim', deISO).order('inicio').limit(3000),
  ]);
  const error = r1.error || r2.error || r3.error;
  if (error) throw new Error(/cal_/.test(error.message) ? 'As tabelas do calendário ainda não existem. Rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.' : error.message);
  return { meuId: s.session && s.session.user.id, contas: r1.data, agendas: r2.data, eventos: r3.data };
}

// campos: { compartilhada, familia_pode_criar, cor }
export async function calSalvarAgenda(id, campos) {
  if (DEMO) { Object.assign(demoCal().agendas.find((a) => a.id === +id) || {}, campos); demoSave(); return; }
  const c = await client();
  const { error } = await c.from('cal_agendas').update(campos).eq('id', id);
  if (error) throw error;
}

// Leva para a tela de permissão do Google (no modo demonstração, cria uma conta de exemplo).
export async function calConectar() {
  if (DEMO) {
    const cal = demoCal();
    if (cal.contas.some((x) => x.user_id === DEMO_EU)) return;
    const nome = ((demo.user && demo.user.email) || 'você').split('@')[0];
    cal.contas.push({ user_id: DEMO_EU, nome: nome.charAt(0).toUpperCase() + nome.slice(1), google_email: (demo.user && demo.user.email) || '', ultimo_sync: new Date().toISOString(), erro: null });
    cal.agendas.push(
      { id: 2, user_id: DEMO_EU, nome: 'Pessoal', cor_google: '#F5A35C', cor: null, principal: true, pode_escrever: true, compartilhada: false, familia_pode_criar: false },
      { id: 3, user_id: DEMO_EU, nome: 'Feriados no Brasil', cor_google: '#5EC8C8', cor: null, principal: false, pode_escrever: false, compartilhada: false, familia_pode_criar: false },
    );
    const h = (n, hh) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(hh, 0, 0, 0); return x.toISOString(); };
    const ev = (id, agenda_id, titulo, ini, fim, dia_inteiro, local = null) => ({ id, agenda_id, titulo, inicio: ini, fim, dia_inteiro, local, descricao: null, link_google: null, criado_pelo_app_por: null });
    cal.eventos.push(
      ev(20, 2, 'Futebol', h(2, 20), h(2, 21), false, 'Quadra do clube'),
      ev(21, 2, 'Pagar IPVA', h(4, 0), h(5, 0), true),
      ev(22, 3, 'Feriado', h(9, 0), h(10, 0), true),
    );
    demoSave();
    return;
  }
  const { url } = await invocar('google-auth', { acao: 'iniciar' });
  location.href = url;
}

export async function calDesconectar() {
  if (DEMO) {
    const cal = demoCal();
    const minhas = new Set(cal.agendas.filter((a) => a.user_id === DEMO_EU).map((a) => a.id));
    cal.eventos = cal.eventos.filter((e) => !minhas.has(e.agenda_id));
    cal.agendas = cal.agendas.filter((a) => a.user_id !== DEMO_EU);
    cal.contas = cal.contas.filter((x) => x.user_id !== DEMO_EU);
    demoSave();
    return;
  }
  await invocar('google-auth', { acao: 'desconectar' });
}

export async function calSync() {
  if (DEMO) {
    const eu = demoCal().contas.find((x) => x.user_id === DEMO_EU);
    if (eu) { eu.ultimo_sync = new Date().toISOString(); demoSave(); }
    return { ok: true, erros: [] };
  }
  return invocar('agenda', { acao: 'sync' });
}

// ev: { agenda_id, titulo, dia_inteiro, inicio, fim, local, descricao }
// dia inteiro: inicio/fim = 'AAAA-MM-DD' (fim incluso); com hora: ISO.
export async function calCriarEvento(ev) {
  if (DEMO) {
    const cal = demoCal();
    const meia = (s, n = 0) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d + n).toISOString(); };
    cal.eventos.push({ id: cal.nextId++, agenda_id: ev.agenda_id, titulo: ev.titulo, local: ev.local || null, descricao: ev.descricao || null,
      dia_inteiro: ev.dia_inteiro, inicio: ev.dia_inteiro ? meia(ev.inicio) : ev.inicio, fim: ev.dia_inteiro ? meia(ev.fim, 1) : ev.fim,
      link_google: null, criado_pelo_app_por: DEMO_EU });
    demoSave();
    return;
  }
  await invocar('agenda', { acao: 'criar', ...ev });
}

export async function calExcluirEvento(id) {
  if (DEMO) { const cal = demoCal(); cal.eventos = cal.eventos.filter((e) => e.id !== +id); demoSave(); return; }
  await invocar('agenda', { acao: 'excluir', evento_id: id });
}

// Avisa quando eventos/agendas mudam (sincronização, outra pessoa criou um evento…).
export function assinarCalendario(cb) {
  let t = null;
  const avisar = () => { clearTimeout(t); t = setTimeout(cb, 400); }; // uma sincronização gera muitas mudanças seguidas
  if (DEMO) {
    const h = (ev) => {
      if (ev.key !== LS) return;
      try { demo.cal = JSON.parse(ev.newValue).cal || demo.cal; } catch (e) { /* ok */ }
      avisar();
    };
    window.addEventListener('storage', h);
    return () => window.removeEventListener('storage', h);
  }
  let canal = null;
  client().then((c) => {
    canal = c.channel('calendario')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_eventos' }, avisar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_agendas' }, avisar)
      .subscribe();
  });
  return () => { if (canal) canal.unsubscribe(); };
}
