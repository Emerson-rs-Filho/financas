// Avisos da tela inicial: uma linha por área dizendo o que pede atenção.
// Cada área é lida em separado; se uma falhar (tabela ainda não criada, sem internet), só ela fica sem aviso.
import * as db from './data.js';

const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
const pl = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// Funções puras (recebem os dados e a data de hoje), para poderem ser testadas.
export const regras = {
  financas({ contas, pagamentos }, hoje) {
    const ano = hoje.getFullYear(), mes = hoje.getMonth() + 1;
    const ultimo = new Date(ano, mes, 0).getDate();
    const abertas = contas.filter((k) => k.ativa !== false).map((k) => {
      let venc;
      if (k.recorrente !== false) venc = new Date(ano, mes - 1, Math.min(k.dia_vencimento || 1, ultimo));
      else if (k.vencimento && deISO(k.vencimento).getFullYear() === ano && deISO(k.vencimento).getMonth() + 1 === mes) venc = deISO(k.vencimento);
      else return null;
      const paga = pagamentos.some((p) => p.conta_id === k.id && p.ano === ano && p.mes === mes);
      return paga ? null : { k, dias: Math.round((venc - hoje) / 864e5) };
    }).filter(Boolean);
    const vencidas = abertas.filter((c) => c.dias < 0);
    const semana = abertas.filter((c) => c.dias >= 0 && c.dias <= 7);
    if (vencidas.length) return { texto: pl(vencidas.length, 'conta vencida', 'contas vencidas'), alerta: true };
    if (semana.length) return { texto: `${pl(semana.length, 'conta vence', 'contas vencem')} em até 7 dias · ${brl(semana.reduce((s, c) => s + (+c.k.valor_previsto || 0), 0))}` };
    if (abertas.length) return { texto: `${pl(abertas.length, 'conta', 'contas')} a pagar neste mês` };
    return contas.some((k) => k.ativa !== false) ? { texto: 'contas do mês pagas' } : null;
  },
  compras(itens) {
    const n = itens.filter((i) => !i.comprado).length;
    return n ? { texto: pl(n, 'item para comprar', 'itens para comprar') } : null;
  },
  reparos({ reparos }, hoje) {
    const abertos = reparos.filter((r) => r.status !== 'feito');
    const atras = abertos.filter((r) => r.prazo && r.prazo < isoDia(hoje));
    if (atras.length) return { texto: pl(atras.length, 'reparo atrasado', 'reparos atrasados'), alerta: true };
    return abertos.length ? { texto: `${abertos.length} em aberto` } : null;
  },
  documentos(docs, hoje) {
    const dias = (d) => Math.round((deISO(d.vencimento) - hoje) / 864e5);
    const comVenc = docs.filter((d) => d.vencimento);
    const vencidos = comVenc.filter((d) => dias(d) < 0).length;
    const vencendo = comVenc.filter((d) => dias(d) >= 0 && dias(d) <= (d.avisar_dias ?? 30)).length;
    if (vencidos || vencendo) return { texto: [vencidos ? pl(vencidos, 'vencido', 'vencidos') : '', vencendo ? `${vencendo} vencendo` : ''].filter(Boolean).join(' · '), alerta: true };
    return docs.length ? { texto: pl(docs.length, 'guardado', 'guardados') } : null;
  },
  rotina({ rotinas }, hoje) {
    const ativas = rotinas.filter((r) => r.ativa !== false).map((r) => Math.round((deISO(r.proxima) - hoje) / 864e5));
    const atras = ativas.filter((n) => n < 0).length;
    const semana = ativas.filter((n) => n >= 0 && n <= 7).length;
    if (atras) return { texto: pl(atras, 'tarefa atrasada', 'tarefas atrasadas'), alerta: true };
    if (semana) return { texto: `${pl(semana, 'tarefa', 'tarefas')} nesta semana` };
    return ativas.length ? { texto: 'tudo em dia' } : null;
  },
  cardapio(refs, hoje) {
    const h = refs.filter((x) => x.dia === isoDia(hoje)).sort((a, b) => a.refeicao.localeCompare(b.refeicao));
    return h.length ? { texto: `hoje: ${h.map((x) => x.prato.toLowerCase()).join(' e ')}` } : null;
  },
  metas({ metas, aportes, investimentos }) {
    if (!metas.length) return null;
    const guardado = (m) => {
      const i = m.investimento_id ? investimentos.find((x) => x.id === m.investimento_id) : null;
      return i ? i.valor_atual : aportes.filter((a) => a.meta_id === m.id).reduce((s, a) => s + a.valor, 0);
    };
    const alvo = metas.reduce((s, m) => s + m.valor_alvo, 0);
    const tot = metas.reduce((s, m) => s + Math.min(guardado(m), m.valor_alvo), 0);
    return { texto: `${Math.floor((tot / alvo) * 100)}% guardado · faltam ${brl(alvo - tot)}` };
  },
};

const FONTES = {
  financas: () => db.listContas(),
  compras: () => db.listCompras(),
  reparos: () => db.listReparos(),
  documentos: () => db.listDocumentos(),
  rotina: () => db.listRotinas(),
  cardapio: () => db.listCardapio(),
  metas: async () => { const [m, investimentos] = await Promise.all([db.listMetas(), db.listInvestimentos()]); return { ...m, investimentos }; },
};

// Chama cb(id, aviso) conforme cada área responde.
export function carregarAvisos(ids, cb) {
  const h = new Date();
  const hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  ids.filter((id) => FONTES[id]).forEach(async (id) => {
    try { const a = regras[id](await FONTES[id](), hoje); if (a) cb(id, a); } catch (e) { /* sem aviso para esta área */ }
  });
}
