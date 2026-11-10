// Cálculos e dicas de economia geradas a partir dos lançamentos.
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const MES_CURTO = MESES.map((m) => m.slice(0, 3));

export const brl = (v, dec = 0) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec });
export const kfmt = (v) => (v >= 0 ? '+' : '−') + (Math.abs(v) / 1000).toFixed(1).replace('.', ',') + 'k';
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);

// Meses "fechados" do ano: para o ano corrente, só os meses anteriores ao atual.
export function closedMonths(ano, hoje = new Date()) {
  if (ano < hoje.getFullYear()) return 12;
  if (ano > hoje.getFullYear()) return 0;
  return hoje.getMonth(); // jan..mês anterior
}

export function resumoAno(lancs, ano) {
  const L = lancs.filter((l) => l.ano === ano);
  const E = Array(12).fill(0), S = Array(12).fill(0);
  L.forEach((l) => { (l.tipo === 'entrada' ? E : S)[l.mes - 1] += l.valor; });
  const n = closedMonths(ano);
  const e = sum(E.slice(0, n)), s = sum(S.slice(0, n));
  const dif = E.map((v, i) => v - S[i]);
  const fechados = dif.slice(0, n);
  let melhor = -1, pior = -1;
  fechados.forEach((d, i) => { if (melhor < 0 || d > dif[melhor]) melhor = i; if (pior < 0 || d < dif[pior]) pior = i; });
  return { L, E, S, dif, n, e, s, saldo: e - s, mediaSaida: n ? s / n : 0, mediaEntrada: n ? e / n : 0,
    positivos: fechados.filter((d) => d >= 0).length, melhor, pior };
}

export function porCategoria(r, tipo = 'saida') {
  const m = new Map();
  r.L.filter((l) => l.tipo === tipo && l.mes <= r.n).forEach((l) => m.set(l.categoria, (m.get(l.categoria) || 0) + l.valor));
  const tot = sum([...m.values()]);
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor, pct: tot ? valor / tot : 0 })).sort((a, b) => b.valor - a.valor);
}

export function porItem(r, tipo = 'saida') {
  const m = new Map();
  r.L.filter((l) => l.tipo === tipo).forEach((l) => {
    if (!m.has(l.descricao)) m.set(l.descricao, { nome: l.descricao, categoria: l.categoria, meses: Array(12).fill(0) });
    m.get(l.descricao).meses[l.mes - 1] += l.valor;
  });
  return [...m.values()].map((it) => {
    const fech = it.meses.slice(0, r.n);
    const ativos = fech.filter((v) => v > 0);
    return { ...it, total: sum(fech), media: avg(fech), mediaAtivos: avg(ativos), ativos: ativos.length };
  });
}

// Lançamento de cartão: compra importada (tem `cartao`) ou linha antiga com o total da fatura.
export const ehCartao = (l) => !!l.cartao || /cart/i.test(l.categoria);

// Totais por cartão: compras importadas somam no cartão de origem; linhas antigas pelo nome.
export function porCartao(r, n = r.n) {
  const m = new Map();
  r.L.filter((l) => l.tipo === 'saida' && ehCartao(l)).forEach((l) => {
    const nome = l.cartao || l.descricao;
    if (!m.has(nome)) m.set(nome, { nome, meses: Array(12).fill(0) });
    m.get(nome).meses[l.mes - 1] += l.valor;
  });
  return [...m.values()].map((it) => {
    const fech = it.meses.slice(0, n);
    return { ...it, total: sum(fech), mediaAtivos: avg(fech.filter((v) => v > 0)) };
  });
}

// Gastos dentro do cartão, por categoria (só compras importadas). Usa todos os meses do ano.
export function cartaoPorCategoria(r) {
  const m = new Map();
  r.L.filter((l) => l.tipo === 'saida' && l.cartao).forEach((l) => m.set(l.categoria, (m.get(l.categoria) || 0) + l.valor));
  const tot = sum([...m.values()]);
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor, pct: tot ? valor / tot : 0 })).sort((a, b) => b.valor - a.valor);
}

export function dicas(r) {
  const out = [];
  if (r.n < 2) return out;
  const itens = porItem(r);
  const totalSaidas = r.s;

  // 1) Item que concentra boa parte dos gastos
  const maior = itens.slice().sort((a, b) => b.total - a.total)[0];
  if (maior && maior.total / totalSaidas > 0.25) {
    const corte = maior.media * 0.1;
    out.push({ tipo: 'concentracao', titulo: `${maior.nome} concentra ${Math.round(maior.total / totalSaidas * 100)}% dos gastos`,
      texto: `Média de ${brl(maior.media)} por mês. Definir um teto mensal por categoria e cortar 10% já rende ${brl(corte * 12)} no ano.`,
      economia: corte, rotulo: `−${brl(corte)}/mês` });
  }

  // 2) Contas recorrentes que ficaram mais caras
  itens.filter((it) => it.ativos >= 6 && !['Impostos e folha', 'Cartões de crédito'].includes(it.categoria) && !/outr/i.test(it.categoria)).forEach((it) => {
    const vals = it.meses.slice(0, r.n).filter((v) => v > 0);
    const ini = avg(vals.slice(0, 3)), fim = avg(vals.slice(-3));
    const alta = fim / ini - 1;
    if (alta >= 0.15 && fim - ini >= 15) {
      out.push({ tipo: 'aumento', titulo: `${it.nome} subiu ${Math.round(alta * 100)}%`,
        texto: `Passou de ~${brl(ini, 2)} para ~${brl(fim, 2)} por mês. Vale renegociar, trocar de plano ou de fornecedor.`,
        economia: fim - ini, rotulo: `−${brl(fim - ini)}/mês` });
    }
  });

  // 3) Contas que oscilam muito (consumo)
  itens.filter((it) => it.ativos >= 6 && ['Casa', 'Saúde'].includes(it.categoria) && it.mediaAtivos > 150).forEach((it) => {
    const vals = it.meses.slice(0, r.n).filter((v) => v > 0);
    const m = avg(vals), dp = Math.sqrt(avg(vals.map((v) => (v - m) ** 2)));
    if (dp / m > 0.3) {
      const pico = it.meses.indexOf(Math.max(...it.meses.slice(0, r.n)));
      const eco = m * 0.15;
      out.push({ tipo: 'oscilacao', titulo: `${it.nome} oscila de ${brl(Math.min(...vals))} a ${brl(Math.max(...vals))}`,
        texto: `Média de ${brl(m)}. O pico foi em ${MESES[pico].toLowerCase()}. Acompanhar consumo e bandeira tarifária pode reduzir uns 15%.`,
        economia: eco, rotulo: `−${brl(eco)}/mês` });
    }
  });

  // 4) Custos anuais concentrados (IPVA, IPTU, lixo...)
  const anuais = itens.filter((it) => it.ativos === 1 && it.total >= 150 && ['Veículos', 'Impostos anuais'].includes(it.categoria));
  if (anuais.length) {
    const tot = sum(anuais.map((a) => a.total));
    const mesPico = anuais[0].meses.findIndex((v) => v > 0);
    out.push({ tipo: 'provisao', titulo: `${MESES[mesPico]} concentra ${brl(tot)} em custos anuais`,
      texto: `${anuais.map((a) => a.nome).join(', ')}. Separar ${brl(tot / 12)} por mês (de preferência rendendo) evita o mês no vermelho.`,
      economia: 0, rotulo: `${brl(tot / 12)}/mês` });
  }

  // 5) Gastos sem categoria com picos
  itens.filter((it) => /outr/i.test(it.categoria)).forEach((it) => {
    const mx = Math.max(...it.meses.slice(0, r.n));
    if (mx > 2 * it.media && mx > 1000) {
      const i = it.meses.indexOf(mx);
      out.push({ tipo: 'classificar', titulo: `“${it.nome}” de ${MESES[i].toLowerCase()}: ${brl(mx)}`,
        texto: `Classificar esses gastos em categorias mostra se foram pontuais ou se viraram rotina.`, economia: 0, rotulo: 'Revisar' });
    }
  });

  // 6) Assinaturas
  const assin = itens.filter((it) => it.categoria === 'Assinaturas' && it.media > 0);
  if (assin.length) {
    const m = sum(assin.map((a) => a.media));
    out.push({ tipo: 'assinatura', titulo: `Assinaturas: ${brl(m)}/mês`, texto: `Revezar serviços de streaming (assinar um por vez) costuma cortar metade desse valor.`,
      economia: m / 2, rotulo: `−${brl(m / 2)}/mês` });
  }

  // 7) Meses no vermelho
  const neg = r.dif.slice(0, r.n).map((d, i) => ({ d, i })).filter((x) => x.d < 0);
  if (neg.length) {
    out.push({ tipo: 'vermelho', titulo: `${neg.length} ${neg.length > 1 ? 'meses fecharam' : 'mês fechou'} no vermelho`,
      texto: `${neg.map((x) => `${MESES[x.i]} (${brl(x.d)})`).join(', ')}. Uma reserva de emergência cobre esses buracos sem cartão ou cheque especial.`,
      economia: 0, rotulo: 'Atenção' });
  }
  return out;
}

export const potencial = (ds) => sum(ds.map((d) => d.economia || 0));
