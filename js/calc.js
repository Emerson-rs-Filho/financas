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
