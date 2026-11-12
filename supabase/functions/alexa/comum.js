// Ajudantes da skill da Alexa: datas no horário de Brasília, valores em reais falados e busca por nome.
// Sem dependências do Deno, para poder testar com Node.
import { normalizar } from './itens.js';

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// "Hoje" no horário de Brasília (a função roda em UTC).
export function hojeBR(agora = Date.now()) {
  const d = new Date(agora - 3 * 3600 * 1000);
  const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + 1, dia = d.getUTCDate();
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return { ano, mes, dia, iso, hora: d.getUTCHours(), ultimo: new Date(Date.UTC(ano, mes, 0)).getUTCDate() };
}

export const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const juntar = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
export const emDias = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `em ${n} dias`);
// Arredondado, para totais: "180 reais".
export const reais = (v) => { const n = Math.round(v); return `${n} ${Math.abs(n) === 1 ? 'real' : 'reais'}`; };
// Exato, para o que foi dito: "45 reais e 90 centavos".
export function dinheiro(v) {
  const c = Math.round(Math.abs(v) * 100), r = Math.floor(c / 100), cent = c % 100;
  const pr = r ? `${r} ${r === 1 ? 'real' : 'reais'}` : '';
  const pc = cent ? `${cent} ${cent === 1 ? 'centavo' : 'centavos'}` : '';
  return pr && pc ? `${pr} e ${pc}` : pr || pc || '0 reais';
}

// ---------- números por extenso ("cento e vinte e cinco" → "125") ----------
const NUM = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700,
  oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
};
const UNIDADE_DINHEIRO = /^(reais|real|contos?|pilas?|centavos?|mil)$/;
// Depois de um valor, o "e" só liga a uma ordem menor: "cento e vinte", "vinte e cinco", "mil e duzentos".
const cabeDepois = (ultimo, prox) => (ultimo === 1000 ? prox < 1000 : ultimo >= 100 ? prox < 100 : ultimo >= 20 && ultimo % 10 === 0 ? prox < 10 : false);

export function numerosPorExtenso(texto) {
  const pal = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const w = (k) => normalizar(pal[k] ?? '').replace(/[.,!?;:]+$/, '');
  const comeca = (k) => {
    const p = w(k);
    if (p === 'mil') return true;
    if (!(p in NUM)) return false;
    return (p !== 'um' && p !== 'uma') || UNIDADE_DINHEIRO.test(w(k + 1));
  };
  const out = [];
  for (let i = 0; i < pal.length;) {
    if (!comeca(i)) { out.push(pal[i]); i++; continue; }
    let total = 0, atual = 0, ultimo = 0, j = i;
    while (j < pal.length) {
      const p = w(j);
      if (p in NUM && (j === i || ultimo === 0 || cabeDepois(ultimo, NUM[p]))) { atual += NUM[p]; ultimo = NUM[p]; j++; }
      else if (p === 'mil') { total += (atual || 1) * 1000; atual = 0; ultimo = 1000; j++; }
      else if (p === 'e' && w(j + 1) in NUM && cabeDepois(ultimo, NUM[w(j + 1)])) j++; // "vinte e um": aqui "um" é número
      else break;
    }
    const fim = pal[j - 1].match(/[.,!?;:]+$/);
    out.push(String(total + atual) + (fim ? fim[0] : ''));
    i = j;
  }
  return out.join(' ');
}

// ---------- valor em reais dentro de uma frase ----------
// "45 reais na padaria" → { valor: 45, resto: 'na padaria' }
// "R$ 45,90 no mercado", "quarenta e cinco e noventa", "1.500 reais", "45 reais e 90 centavos"
const RE_VALOR = /(^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2})|\.(\d{1,2})(?!\d))?(?:\s*(?:reais|real|contos?|pilas?)\b)?(?:\s+e\s+(\d{1,2})(?:\s*centavos?\b)?(?=\s|$|[.,!?]))?/i;
export function lerValor(texto) {
  const t = numerosPorExtenso(texto);
  const m = RE_VALOR.exec(t);
  if (!m) return { valor: null, resto: t.trim() };
  const inteiro = Number(m[2].replace(/\./g, ''));
  const cent = m[3] ?? m[4] ?? m[5];
  const valor = inteiro + (cent ? Number(cent.padEnd(2, '0')) / 100 : 0);
  const resto = (t.slice(0, m.index) + m[1] + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  return { valor: valor > 0 ? Math.round(valor * 100) / 100 : null, resto };
}

// Tira preposições e artigos das pontas: "a conta de luz" → "luz", "na padaria." → "padaria".
const PONTA = /^(?:de|do|da|dos|das|no|na|nos|nas|em|com|pra|pro|para|o|a|os|as|um|uma|que|e)\s+/i;
export function limparNome(texto, extras = []) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '').replace(/^[,;:]+\s*/, '');
  const re = extras.length ? new RegExp(`^(?:${extras.join('|')})\\s+`, 'i') : null;
  for (let antes = ''; antes !== t;) {
    antes = t;
    t = t.replace(PONTA, '');
    if (re) t = t.replace(re, '');
    if (re && new RegExp(`^(?:${extras.join('|')})$`, 'i').test(t)) t = '';
  }
  t = t.replace(/\s+(?:este|esse|neste|nesse|deste|desse|do|no)\s+m[eê]s$/i, '').replace(/\s+(?:hoje|agora)$/i, '');
  return t.trim();
}

// Procura por nome: primeiro igual, depois um contido no outro. Devolve todos os que empatam.
export function achar(lista, nome, campo = (x) => x) {
  const alvo = normalizar(nome).replace(/[.,!?]/g, '');
  if (!alvo) return [];
  const iguais = lista.filter((x) => normalizar(campo(x)) === alvo);
  if (iguais.length) return iguais;
  const contem = lista.filter((x) => { const n = normalizar(campo(x)); return n.length >= 3 && alvo.length >= 3 && (n.includes(alvo) || alvo.includes(n)); });
  if (contem.length) return contem;
  // por palavra: "conta de energia elétrica" acha "energia"
  const pals = alvo.split(' ').filter((p) => p.length >= 4);
  return lista.filter((x) => { const n = normalizar(campo(x)).split(' '); return pals.some((p) => n.includes(p)); });
}

// ---------- cartão dentro de uma frase ----------
// "500 reais no cartão Nubank" → { cartao: 'Nubank', resto: '500 reais' }
// "no cartão de crédito do Inter", "no crédito" (cartao: '' = crédito sem nome), "no nubank" (cartão conhecido).
// cartao null: não falou de cartão.
const NAO_E_NOME = /^(?:em|no|na|nos|nas|de|do|da|para|pra|com|e|que|hoje|ontem)$/;
export function lerCartao(texto, conhecidos = []) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  const achado = (nome) => conhecidos.find((c) => normalizar(c) === normalizar(nome));
  let m = /(?:^|\s)(?:(?:no|na|pelo|pela|com o|com)\s+)?cart[aã]o(?:\s+de\s+cr[eé]dito)?(?:\s+(?:do|da|de)\b)?(?:\s+([^\s.,!?;]+))?/i.exec(t);
  if (m) {
    const pal = m[1] && !NAO_E_NOME.test(normalizar(m[1])) && !/^\d/.test(m[1]) ? m[1] : null;
    const fimMatch = pal ? m.index + m[0].length : m.index + m[0].length - (m[1] ? m[1].length : 0);
    const resto = (t.slice(0, m.index) + ' ' + t.slice(fimMatch)).replace(/\s+/g, ' ').trim();
    return { cartao: pal ? achado(pal) ?? capital(pal) : '', resto };
  }
  m = /(?:^|\s)(?:(?:no|na|pelo|pela)\s+)?cr[eé]dito\b/i.exec(t);
  if (m) return { cartao: '', resto: (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
  // nome de um cartão conhecido, palavra por palavra ("45 no nubank de padaria")
  const pals = t.split(' ');
  const norm = pals.map((p) => normalizar(p).replace(/[.,!?;:]+$/, ''));
  for (const c of conhecidos) {
    const alvo = normalizar(c).split(' ');
    for (let i = 0; i + alvo.length <= norm.length; i++) {
      if (!alvo.every((a, k) => norm[i + k] === a)) continue;
      const ini = i > 0 && /^(?:no|na|pelo|pela)$/.test(norm[i - 1]) ? i - 1 : i;
      return { cartao: c, resto: [...pals.slice(0, ini), ...pals.slice(i + alvo.length)].join(' ').trim() };
    }
  }
  return { cartao: null, resto: t };
}

// Mês da fatura de uma compra no cartão feita hoje: o mês seguinte (igual ao Open Finance sem dados da fatura).
export const mesDaFatura = (h) => (h.mes === 12 ? { ano: h.ano + 1, mes: 1 } : { ano: h.ano, mes: h.mes + 1 });
