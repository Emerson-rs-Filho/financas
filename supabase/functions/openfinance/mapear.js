// Converte as transações da Pluggy em linhas de of_pendentes. Sem rede nem banco, para poder ser testado.
import { chaveLoja, sugerirCategoria } from './categorias.js';

// Pagamento da fatura: no cartão é o "pagamento recebido"; na conta é o débito da fatura.
// Não entra, senão as compras do cartão contariam em dobro.
const PAGTO_FATURA = /pagamento (de |da )?fatura|pagamento recebido|pgto\.? fatura|pagto\.? fatura|credit card payment/i;
// Entram desmarcados: em geral não são gasto nem renda da casa.
const TRANSF_PROPRIA = /same person|same ownership|mesma titularidade|entre contas/i;
const INVESTIMENTO = /investment|aplica[cç][aã]o|resgate|\bcdb\b|tesouro direto|poupan[cç]a|rdb/i;

const doisDig = (n) => String(n).padStart(2, '0');
export const anoMes = (iso) => ({ ano: +iso.slice(0, 4), mes: +iso.slice(5, 7) });
export function mesSeguinte(iso) {
  const { ano, mes } = anoMes(iso);
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

// Dia da transação. A Pluggy manda ISO ("2026-11-10T00:00:00.000Z" ou "…T03:00:00.000Z"); vale o dia escrito,
// sem converter fuso, porque datas sem hora vêm como meia-noite UTC e voltariam um dia no horário de Brasília.
export function dataBR(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() + 1 === +m[2] ? `${m[1]}-${m[2]}-${doisDig(d.getUTCDate())}` : null;
}

/**
 * Histórico de categorias a partir dos lançamentos já salvos (os mais novos valem mais).
 * Devolve { cartao: Map loja → categoria, entrada: Map, saida: Map } (os dois últimos para conta corrente).
 */
export function historicos(lancamentos) {
  const h = { cartao: new Map(), entrada: new Map(), saida: new Map() };
  [...lancamentos].sort((a, b) => a.id - b.id).forEach((l) => {
    const m = l.cartao ? h.cartao : h[l.tipo];
    if (m) m.set(chaveLoja(l.descricao), l.categoria);
  });
  return h;
}

/**
 * tx: transação da Pluggy · conta: { id, tipo: 'BANK' | 'CREDIT' }
 * faturas: Map id da fatura → data de vencimento (ISO) · hist: o retorno de historicos()
 * Devolve a linha para of_pendentes, ou null quando a transação não deve entrar.
 */
export function mapearTransacao(tx, conta, faturas, hist) {
  if (tx.status === 'PENDING') return null; // ainda pode mudar; entra quando for confirmada
  const data = dataBR(tx.date);
  const valorAbs = Math.round(Math.abs(Number(tx.amount)) * 100) / 100;
  if (!data || !valorAbs) return null;
  const meta = tx.creditCardMetadata || {};
  let desc = String(tx.description || tx.descriptionRaw || '').replace(/\s+/g, ' ').trim() || 'Sem descrição';
  if (meta.totalInstallments > 1 && meta.installmentNumber && !/parcela\s+\d+\s*\/\s*\d+/i.test(desc)) {
    desc += ` - Parcela ${meta.installmentNumber}/${meta.totalInstallments}`;
  }
  const texto = `${desc} ${tx.category || ''}`;
  if (PAGTO_FATURA.test(texto)) return null;
  // DEBIT = o dinheiro saiu; CREDIT = entrou (no cartão, é estorno). Sem tipo, vale o sinal.
  const saiu = tx.type ? tx.type === 'DEBIT' : Number(tx.amount) < 0;

  const linha = { import_key: `pluggy|${tx.id}`, conta_id: conta.id, descricao: desc.slice(0, 200), data_compra: data, marcada: true, aviso: null };
  if (conta.tipo === 'CREDIT') {
    // Mês do lançamento = mês de vencimento da fatura (como na importação do CSV). Sem fatura, o mês seguinte.
    const venc = meta.billId && faturas.get(meta.billId);
    const valor = saiu ? valorAbs : -valorAbs;
    return { ...linha, ...(venc ? anoMes(venc) : mesSeguinte(data)), tipo: 'saida', valor,
      categoria: sugerirCategoria(desc, valor, hist.cartao) };
  }
  const tipo = saiu ? 'saida' : 'entrada';
  const r = { ...linha, ...anoMes(data), tipo, valor: valorAbs,
    categoria: sugerirCategoria(desc, valorAbs, hist[tipo], { cartao: false, tipo }) };
  if (TRANSF_PROPRIA.test(texto)) Object.assign(r, { marcada: false, aviso: 'transferência entre contas' });
  else if (INVESTIMENTO.test(texto)) Object.assign(r, { marcada: false, aviso: 'investimento' });
  return r;
}
