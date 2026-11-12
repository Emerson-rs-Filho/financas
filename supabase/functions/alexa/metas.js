// Metas e sonhos pela Alexa: quanto falta para cada meta e guardar dinheiro nela.
// Mesmas contas do app (js/metas/index.js): o guardado é o valor atual do investimento ligado
// ou, sem investimento, a soma do que foi guardado/retirado à mão.
import { MESES, hojeBR, juntar, reais, dinheiro, lerValor, limparNome, achar } from './comum.js';

async function carregar(db) {
  const [m, a] = await Promise.all([
    db.from('metas').select('id,nome,valor_alvo,prazo,investimento_id').order('criado_em'),
    db.from('metas_aportes').select('meta_id,valor'),
  ]);
  if (m.error) throw m.error;
  if (a.error) throw a.error;
  const ids = m.data.map((x) => x.investimento_id).filter(Boolean);
  let inv = [];
  if (ids.length) {
    const r = await db.from('investimentos').select('id,nome,valor_atual').in('id', ids);
    if (r.error) throw r.error;
    inv = r.data;
  }
  return m.data.map((x) => {
    const i = x.investimento_id ? inv.find((v) => v.id === x.investimento_id) : null;
    const guardado = i ? Number(i.valor_atual) : a.data.filter((y) => y.meta_id === x.id).reduce((s, y) => s + Number(y.valor), 0);
    return { ...x, alvo: Number(x.valor_alvo), guardado, investimento: i, nomeFalado: String(x.nome).toLowerCase() };
  });
}

// Quanto guardar por mês até o prazo, contando o mês atual (igual a porMes do app).
function porMes(m, h) {
  const falta = m.alvo - m.guardado;
  if (!m.prazo || falta <= 0) return null;
  const [a2, m2] = String(m.prazo).split('-').map(Number);
  const meses = (a2 - h.ano) * 12 + (m2 - h.mes) + 1;
  return { meses, valor: meses > 0 ? falta / meses : null, ate: `${MESES[m2 - 1]} de ${a2}` };
}

function situacao(m, h) {
  if (m.guardado >= m.alvo) return `A meta ${m.nomeFalado} já foi atingida: ${reais(m.guardado)} guardados de ${reais(m.alvo)}.`;
  const partes = [`Para ${m.nomeFalado} faltam ${reais(m.alvo - m.guardado)}. Já tem ${reais(Math.max(0, m.guardado))} de ${reais(m.alvo)}, ${Math.max(0, Math.floor((m.guardado / m.alvo) * 100))} por cento.`];
  const pm = porMes(m, h);
  if (pm) partes.push(pm.valor == null ? `O prazo, ${pm.ate}, já passou.` : `Para chegar lá até ${pm.ate}, guarde ${reais(Math.ceil(pm.valor))} por mês.`);
  return partes.join(' ');
}

const EXTRAS = ['meta', 'metas', 'sonho', 'objetivo'];

// "viagem" → situação da meta; vazio → resumo de todas.
export async function metaSituacao(db, texto, h = hojeBR()) {
  const metas = await carregar(db);
  if (!metas.length) return 'Ainda não há metas no aplicativo.';
  const nome = limparNome(texto, EXTRAS);
  if (nome) {
    const [m] = achar(metas, nome, (x) => x.nome);
    if (m) return situacao(m, h);
    return `Não achei a meta ${nome}. As metas são: ${juntar(metas.map((x) => x.nomeFalado))}.`;
  }
  if (metas.length === 1) return situacao(metas[0], h);
  const feitas = metas.filter((m) => m.guardado >= m.alvo);
  const abertas = metas.filter((m) => m.guardado < m.alvo).sort((a, b) => String(a.prazo || '9999').localeCompare(String(b.prazo || '9999')));
  const partes = [`Vocês têm ${metas.length} metas.`];
  if (abertas.length) partes.push(`Faltam ${juntar(abertas.slice(0, 4).map((m) => `${reais(m.alvo - m.guardado)} para ${m.nomeFalado}`))}${abertas.length > 4 ? `, e mais ${abertas.length - 4}` : ''}.`);
  if (feitas.length) partes.push(`${feitas.length === 1 ? 'Já foi atingida' : 'Já foram atingidas'}: ${juntar(feitas.map((m) => m.nomeFalado))}.`);
  return partes.join(' ');
}

// "200 reais na viagem". sessao.metaValor: valor dito antes, quando a Alexa perguntou só a meta.
export async function guardarNaMeta(db, texto, sessao = {}, h = hojeBR()) {
  const lido = lerValor(texto);
  const valor = lido.valor ?? sessao.metaValor ?? null;
  const nome = limparNome(lido.resto, EXTRAS);
  if (!valor) return { texto: 'Quanto você guardou, e para qual meta?', repetir: true };
  const metas = await carregar(db);
  if (!metas.length) return 'Ainda não há metas no aplicativo. Crie uma em Metas e sonhos.';
  let m;
  if (nome) {
    [m] = achar(metas, nome, (x) => x.nome);
    if (!m) return { texto: `Não achei a meta ${nome}. As metas são: ${juntar(metas.map((x) => x.nomeFalado))}. Em qual delas?`, repetir: true, sessao: { metaValor: valor } };
  } else {
    const manuais = metas.filter((x) => !x.investimento);
    if (manuais.length !== 1) return { texto: `Em qual meta você guardou ${dinheiro(valor)}?`, repetir: true, sessao: { metaValor: valor } };
    m = manuais[0];
  }
  if (m.investimento) return `A meta ${m.nomeFalado} acompanha o investimento ${String(m.investimento.nome).toLowerCase()}. Atualize o valor dele em Finanças, Investimentos.`;
  const { error } = await db.from('metas_aportes').insert({ meta_id: m.id, data: h.iso, valor, observacao: 'pela Alexa' });
  if (error) throw error;
  const g = m.guardado + valor;
  if (g >= m.alvo) return `Guardei ${dinheiro(valor)} na meta ${m.nomeFalado}. Meta atingida! Agora são ${reais(g)} de ${reais(m.alvo)}.`;
  return `Guardei ${dinheiro(valor)} na meta ${m.nomeFalado}. Agora são ${reais(g)} de ${reais(m.alvo)}; faltam ${reais(m.alvo - g)}.`;
}
