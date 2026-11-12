// Resumo do dia pela Alexa ("como está a casa hoje"): agenda, contas vencendo, tarefas da casa,
// cardápio e lista de compras, numa fala só. Cada parte é opcional: se a tabela não existir
// (módulo ainda não configurado) ou der erro, ela é pulada e o resto é falado.
import { normalizar } from './itens.js';
import { hojeBR, juntar } from './comum.js';
import { contasDoMes } from './financas.js';

const H = 3600 * 1000;

// "às 9 horas", "às 14 e 30", "ao meio-dia" (horário de Brasília)
function horaFalada(iso) {
  const d = new Date(Date.parse(iso) - 3 * H);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  if (h === 12 && !m) return 'ao meio-dia';
  const base = h === 0 ? 'à meia-noite' : h === 1 ? 'à uma' : `às ${h}`;
  return m ? `${base} e ${m}` : `${base}${h === 0 ? '' : h === 1 ? ' hora' : ' horas'}`;
}

async function agenda(db, h, agora) {
  const ini = new Date(Date.UTC(h.ano, h.mes - 1, h.dia, 3)).toISOString(); // meia-noite de Brasília
  const fim = new Date(Date.parse(ini) + 24 * H).toISOString();
  const { data, error } = await db.from('cal_eventos').select('titulo,inicio,fim,dia_inteiro').lt('inicio', fim).gt('fim', ini).order('inicio');
  if (error) throw error;
  const vistos = new Set();
  const evs = data.filter((e) => {
    if (!e.dia_inteiro && Date.parse(e.fim) < agora) return false; // já acabou
    const k = `${normalizar(e.titulo)}|${e.dia_inteiro ? '' : e.inicio}`; // o mesmo evento em duas agendas
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  // dia inteiro primeiro, depois por horário
  evs.sort((a, b) => (b.dia_inteiro ? 1 : 0) - (a.dia_inteiro ? 1 : 0) || String(a.inicio).localeCompare(String(b.inicio)));
  if (!evs.length) return 'Nada na agenda hoje.';
  const ditos = evs.slice(0, 4).map((e) => `${String(e.titulo).toLowerCase()}${e.dia_inteiro ? ', o dia todo' : ` ${horaFalada(e.inicio)}`}`);
  return `Na agenda: ${juntar(ditos)}${evs.length > 4 ? `, e mais ${evs.length - 4}` : ''}.`;
}

async function contas(db, h) {
  const { abertas } = await contasDoMes(db, h);
  const venc = abertas.filter((c) => c.dias < 0), hoje = abertas.filter((c) => c.dias === 0), amanha = abertas.filter((c) => c.dias === 1);
  const partes = [];
  if (venc.length) partes.push(`${venc.length === 1 ? 'Está vencida a conta de' : 'Estão vencidas as contas de'} ${juntar(venc.map((c) => c.nome))}.`);
  if (hoje.length) partes.push(`${hoje.length === 1 ? 'Vence hoje' : 'Vencem hoje'}: ${juntar(hoje.map((c) => c.nome))}.`);
  if (amanha.length) partes.push(`${amanha.length === 1 ? 'Vence amanhã' : 'Vencem amanhã'}: ${juntar(amanha.map((c) => c.nome))}.`);
  return partes.join(' ');
}

async function tarefas(db, h) {
  const { data, error } = await db.from('rotinas').select('titulo,proxima,ativa').lte('proxima', h.iso).order('proxima');
  if (error) throw error;
  const ts = data.filter((r) => r.ativa !== false);
  if (!ts.length) return '';
  const atrasadas = ts.filter((r) => r.proxima < h.iso).map((r) => String(r.titulo).toLowerCase());
  const doDia = ts.filter((r) => r.proxima === h.iso).map((r) => String(r.titulo).toLowerCase());
  const lista = (xs) => juntar(xs.slice(0, 4)) + (xs.length > 4 ? `, e mais ${xs.length - 4}` : '');
  const partes = [];
  if (doDia.length) partes.push(`Tarefas da casa para hoje: ${lista(doDia)}.`);
  if (atrasadas.length) partes.push(`${atrasadas.length === 1 ? 'Tarefa atrasada' : 'Tarefas atrasadas'}: ${lista(atrasadas)}.`);
  return partes.join(' ');
}

async function cardapio(db, h) {
  const { data, error } = await db.from('cardapio').select('refeicao,prato').eq('dia', h.iso);
  if (error) throw error;
  const prato = (r) => data.find((x) => x.refeicao === r)?.prato;
  const almoco = h.hora < 15 ? prato('almoco') : null, jantar = prato('jantar');
  if (almoco && jantar) return `No almoço, ${almoco.toLowerCase()}; no jantar, ${jantar.toLowerCase()}.`;
  if (almoco) return `No almoço, ${almoco.toLowerCase()}.`;
  if (jantar) return `No jantar, ${jantar.toLowerCase()}.`;
  return '';
}

async function compras(db) {
  const { data, error } = await db.from('compras_itens').select('id').eq('comprado', false);
  if (error) throw error;
  const n = data.length;
  return n ? `A lista de compras tem ${n === 1 ? 'um item' : `${n} itens`}.` : '';
}

export async function resumoDoDia(db, agora = Date.now()) {
  const h = hojeBR(agora);
  const saudacao = h.hora < 12 ? 'Bom dia!' : h.hora < 18 ? 'Boa tarde!' : 'Boa noite!';
  const partes = await Promise.all([agenda(db, h, agora), contas(db, h), tarefas(db, h), cardapio(db, h), compras(db)]
    .map((p) => p.catch((e) => { console.warn('alexa: resumo: parte pulada:', e?.message ?? e); return ''; })));
  const [ag, ...resto] = partes;
  // sem contas, tarefas, cardápio nem compras: diz que está tranquilo (a agenda só entra se foi lida)
  const fim = resto.some(Boolean) ? resto.filter(Boolean).join(' ') : 'Nenhuma conta vencendo e nenhuma tarefa da casa pendente.';
  return [saudacao, ag, fim].filter(Boolean).join(' ');
}
