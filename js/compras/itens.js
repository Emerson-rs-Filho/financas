// Interpretação de itens da lista de compras ("2 leite, pão e 1 kg de café").
// Usado pelo app e pela função da Alexa (cópia em supabase/functions/alexa/itens.js — mantenha as duas iguais).

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12 };
const UNIDADES = 'kg|quilos?|g|gramas?|l|litros?|ml|pacotes?|pct|caixas?|cx|latas?|garrafas?|unidades?|un|d[uú]zias?|bandejas?|sacos?|potes?|vidros?|rolos?|fardos?';

// minúsculas, sem acento, espaços simples
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "2 kg de carne" → { nome: 'Carne', quantidade: '2 kg' } · "duas caixas de leite" → { nome: 'Leite', quantidade: '2 caixas' }
export function interpretarItem(texto) {
  let t = String(texto || '').replace(/\s+/g, ' ').trim().replace(/^(mais|tamb[eé]m|o|a|os|as|um|uma|uns|umas)\s+/i, '');
  if (!t) return null;
  let qtd = '';
  const palavras = t.split(' ');
  const n0 = normalizar(palavras[0]);
  const meia = /^meia duzia\b/.test(normalizar(t));
  if (meia) { qtd = '6'; t = t.split(' ').slice(2).join(' '); }
  else if (/^\d+([.,]\d+)?$/.test(n0) || (NUMEROS[n0] && palavras.length > 1 && !['um', 'uma'].includes(n0))) {
    qtd = /^\d/.test(n0) ? palavras[0] : String(NUMEROS[n0]);
    t = palavras.slice(1).join(' ');
  }
  if (qtd) {
    const m = new RegExp(`^(${UNIDADES})(?:\\s+|$)(?:de\\s+)?(.*)$`, 'i').exec(t);
    if (m && m[2]) { qtd = `${qtd} ${m[1].toLowerCase()}`; t = m[2]; }
    else t = t.replace(/^de\s+/i, '');
  }
  t = t.replace(/[.!?]+$/, '').trim();
  if (!t) return null;
  return { nome: capitalizar(t), quantidade: qtd || null };
}

// "leite, pão e 2 cafés" → três itens. Separa por vírgula, ponto e vírgula, quebra de linha e " e ".
export function separarItens(texto) {
  const vistos = new Set();
  return String(texto || '')
    .split(/\s*(?:(?<!\d),|,(?!\d)|[;\n]|\be\b|\bmais\b)\s*/i)
    .map(interpretarItem)
    .filter((i) => i && !vistos.has(normalizar(i.nome)) && vistos.add(normalizar(i.nome)));
}
