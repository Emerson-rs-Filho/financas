// Calculadoras financeiras: só matemática, sem DOM. Taxas em fração (0.10 = 10%).

/** Converte taxa anual em mensal equivalente (juros compostos). */
export const taxaMensal = (aa) => Math.pow(1 + aa, 1 / 12) - 1;

/** Quanto guardar por mês para chegar em `meta` em `meses`, já tendo `inicial`. */
export function aporteNecessario({ meta, inicial = 0, meses, taxaAA = 0, ipcaAA = 0, corrigir = false }) {
  meses = Math.max(1, Math.round(meses));
  const alvo = corrigir ? meta * Math.pow(1 + ipcaAA, meses / 12) : meta;
  const i = taxaMensal(taxaAA);
  const f = Math.pow(1 + i, meses);
  const falta = alvo - inicial * f;
  let aporte = 0;
  if (falta > 0) aporte = i === 0 ? falta / meses : (falta * i) / (f - 1);
  const p = projecao({ inicial, aporte, meses, taxaAA });
  return { ...p, aporte, alvo, jaAtinge: falta <= 0 };
}

/** Projeção de juros compostos com aportes no fim de cada mês. */
export function projecao({ inicial = 0, aporte = 0, meses, taxaAA = 0 }) {
  meses = Math.max(1, Math.round(meses));
  const i = taxaMensal(taxaAA);
  let saldo = inicial, investido = inicial;
  const serie = [{ mes: 0, saldo, investido }];
  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + i) + aporte;
    investido += aporte;
    serie.push({ mes: m, saldo, investido });
  }
  return { final: saldo, investido, juros: saldo - investido, serie };
}

/**
 * Simula aportes mensais num ativo com preços históricos.
 * pontos: [{ data: 'AAAA-MM-DD', preco }] (um por mês). Compra no preço de cada mês.
 */
export function simularHistorico(pontos, aporte = 0, inicial = 0) {
  let cotas = 0, investido = 0;
  const serie = pontos.map((p, k) => {
    const valor = (k === 0 ? inicial : 0) + aporte;
    if (p.preco > 0) { cotas += valor / p.preco; investido += valor; }
    return { data: p.data, saldo: cotas * p.preco, investido };
  });
  const final = serie.length ? serie[serie.length - 1].saldo : 0;
  return { final, investido, ganho: final - investido, rent: investido ? final / investido - 1 : 0, serie };
}

/** Converte taxas mensais (% do mês) em um "índice de preço" para usar no simulador. */
export function indiceDeTaxas(mensais) {
  let idx = 1;
  return mensais.map((t, k) => {
    if (k > 0) idx *= 1 + t.taxa / 100;
    return { data: t.data, preco: idx };
  });
}

/** Alíquota de IR da renda fixa pelo prazo em dias (tabela regressiva). */
export function aliquotaIR(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

export const TIPOS_RF = {
  cdb: { nome: 'CDB', isento: false },
  lci: { nome: 'LCI / LCA', isento: true },
  selic: { nome: 'Tesouro Selic', isento: false, custodia: 0.002 },
  poupanca: { nome: 'Poupança', isento: true },
};

/**
 * Rendimento de uma aplicação de renda fixa pós-fixada.
 * cdi: CDI anual (fração). pct: % do CDI (1 = 100%). selic: Selic anual (para poupança/Tesouro).
 */
export function rendaFixa({ valor, dias, tipo, cdi, pct = 1, selic = cdi, trMensal = 0 }) {
  const t = TIPOS_RF[tipo];
  const anos = dias / 365;
  let taxa;
  if (tipo === 'poupanca') {
    // Selic > 8,5%: 0,5% a.m. + TR; senão 70% da Selic + TR.
    const am = selic > 0.085 ? 0.005 : taxaMensal(selic * 0.7);
    taxa = Math.pow(1 + am + trMensal, 12) - 1;
  } else if (tipo === 'selic') taxa = selic;
  else taxa = cdi * pct;
  const bruto = valor * (Math.pow(1 + taxa, anos) - 1);
  const custodia = t.custodia ? Math.max(0, valor - 10000) * t.custodia * anos : 0; // Tesouro Selic: isento até R$ 10 mil
  const ir = t.isento ? 0 : bruto * aliquotaIR(dias);
  const liquido = bruto - ir - custodia;
  const final = valor + liquido;
  const rentAA = Math.pow(final / valor, 1 / anos) - 1;
  return { nome: t.nome, taxaBruta: taxa, bruto, ir, custodia, liquido, final, rentAA, aliquota: t.isento ? 0 : aliquotaIR(dias) };
}

/** % do CDI que um CDB precisa pagar para empatar com uma LCI/LCA isenta de `pctIsento` no mesmo prazo. */
export const cdbEquivalente = (pctIsento, dias) => pctIsento / (1 - aliquotaIR(dias));

// ---------------- dividendos (ações e FIIs) ----------------

/**
 * Renda de uma carteira de ativos que pagam dividendos.
 * ativos: [{ ticker, qtd, preco, div12m }] (div12m = quanto cada cota pagou nos últimos 12 meses).
 */
export function rendaCarteira(ativos) {
  const linhas = ativos.map((a) => {
    const qtd = Math.max(0, +a.qtd || 0), preco = Math.max(0, +a.preco || 0), div = Math.max(0, +a.div12m || 0);
    const valor = qtd * preco, ano = qtd * div;
    return { ...a, qtd, preco, div12m: div, valor, rendaAno: ano, rendaMes: ano / 12, dy: preco ? div / preco : 0 };
  });
  const valor = linhas.reduce((s, l) => s + l.valor, 0);
  const rendaAno = linhas.reduce((s, l) => s + l.rendaAno, 0);
  return { linhas, valor, rendaAno, rendaMes: rendaAno / 12, dy: valor ? rendaAno / valor : 0 };
}

/**
 * Quanto falta para a carteira pagar `rendaMes` por mês, no rendimento atual.
 * - total: valor que a carteira precisa ter; falta: quanto investir a mais;
 * - proporcao: cotas a comprar de cada ativo mantendo o peso de hoje na carteira;
 * - unico: cotas de um só ativo que, sozinhas, fechariam o que falta de renda.
 */
export function metaRenda({ ativos, rendaMes }) {
  const c = rendaCarteira(ativos);
  const alvoAno = Math.max(0, +rendaMes || 0) * 12;
  const faltaAno = Math.max(0, alvoAno - c.rendaAno);
  const total = c.dy ? alvoAno / c.dy : 0;
  const falta = c.dy ? faltaAno / c.dy : 0;
  const pagam = c.linhas.filter((l) => l.preco > 0 && l.div12m > 0);
  // se ninguém tem cota ainda, divide igualmente entre os ativos que pagam
  const base = pagam.reduce((s, l) => s + l.valor, 0);
  const proporcao = pagam.map((l) => {
    const peso = base ? l.valor / base : 1 / pagam.length;
    const cotas = faltaAno ? Math.ceil((falta * peso) / l.preco) : 0;
    return { ticker: l.ticker, peso, cotas, custo: cotas * l.preco, rendaMes: (cotas * l.div12m) / 12 };
  });
  const unico = pagam.map((l) => {
    const cotas = faltaAno ? Math.ceil(faltaAno / l.div12m) : 0;
    return { ticker: l.ticker, cotas, custo: cotas * l.preco, dy: l.dy };
  }).sort((a, b) => a.custo - b.custo);
  return { atual: c, alvoAno, faltaAno, total, falta, jaAtinge: alvoAno > 0 && faltaAno === 0, proporcao, unico };
}

/**
 * Mês a mês até a renda mensal chegar a `rendaMes` (no máximo `maxMeses`).
 * O dividendo do mês é valor × DY / 12; com `reinvestir` ele compra mais cotas.
 * serie: [{ mes, saldo, investido, renda }] (formato do gráfico das outras calculadoras).
 */
export function tempoAteRenda({ valorInicial = 0, dyAA, aporte = 0, rendaMes, reinvestir = true, valorizacaoAA = 0, maxMeses = 600 }) {
  const dyM = Math.max(0, +dyAA || 0) / 12;
  const v = Math.pow(1 + (+valorizacaoAA || 0), 1 / 12) - 1;
  let saldo = Math.max(0, +valorInicial || 0), investido = saldo, recebido = 0;
  const serie = [{ mes: 0, saldo, investido, renda: saldo * dyM }];
  const alvo = Math.max(0, +rendaMes || 0);
  if (!alvo || saldo * dyM >= alvo) return { meses: 0, chegou: true, serie, recebido };
  if (!dyM) return { meses: null, chegou: false, serie, recebido };
  for (let m = 1; m <= maxMeses; m++) {
    const div = saldo * dyM;
    recebido += div;
    saldo = saldo * (1 + v) + aporte + (reinvestir ? div : 0);
    investido += aporte;
    const renda = saldo * dyM;
    serie.push({ mes: m, saldo, investido, renda });
    if (renda >= alvo) return { meses: m, chegou: true, serie, recebido };
  }
  return { meses: null, chegou: false, serie, recebido };
}
