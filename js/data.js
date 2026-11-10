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
  return { user: null, lancamentos: seedLancamentos(), investimentos: [], nextId: 100000 };
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

export function resetDemo() {
  demo = { user: demo.user, lancamentos: seedLancamentos(), investimentos: [], nextId: 100000 };
  demoSave();
}
