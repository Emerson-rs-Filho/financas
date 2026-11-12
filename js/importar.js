// Leitura da fatura do Nubank em CSV (date,title,amount) e sugestão de categoria.
// A sugestão de categoria fica em categorias.js (também usada pela função do Open Finance).
import { chaveLoja, sugerirCategoria } from './categorias.js';
export { chaveLoja, sugerirCategoria };

// "1.591,62" → 1591.62 · "- 7.861,31" → -7861.31 · também aceita "1591.62"
export function valorBR(s) {
  let t = String(s).replace(/\s|R\$/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

// CSV simples com campos entre aspas (vírgula dentro de aspas, "" como aspas escapadas).
function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}


// Mês da fatura: data no nome do arquivo (Nubank_2026-12-09.csv). Sem data, o mês seguinte à última compra.
function mesDaFatura(fileName, datas) {
  const m = /(\d{4})-(\d{2})-\d{2}/.exec(fileName || '');
  if (m) return { ano: +m[1], mes: +m[2] };
  const ult = datas.sort().pop();
  if (!ult) { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() + 1 }; }
  const a = +ult.slice(0, 4), me = +ult.slice(5, 7);
  return me === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: me + 1 };
}

// Converte "09/11/2026" em "2026-11-09"; mantém ISO.
const isoData = (s) => {
  const t = String(s).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : t.slice(0, 10);
};

/**
 * Lê o CSV e devolve { ano, mes, linhas, ignoradas }.
 * linhas: { data, titulo, valor, categoria, import_key }
 * historico: Map chaveLoja → categoria (de lançamentos de cartão já salvos)
 */
export function parseNubankCsv(text, fileName, historico = new Map()) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) throw new Error('O arquivo está vazio.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const iD = head.indexOf('date'), iT = head.indexOf('title'), iA = head.indexOf('amount');
  if (iD < 0 || iT < 0 || iA < 0) throw new Error('Este não parece ser o CSV da fatura do Nubank (esperava as colunas date, title e amount).');

  const linhas = [], ignoradas = [], vistos = new Map();
  for (const r of rows.slice(1)) {
    const data = isoData(r[iD]), titulo = (r[iT] || '').trim(), valor = valorBR(r[iA]);
    if (!titulo || !Number.isFinite(valor) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    if (/pagamento recebido/i.test(titulo)) { ignoradas.push({ data, titulo, valor }); continue; }
    const base = `nubank|${data}|${titulo}|${valor.toFixed(2)}`;
    const n = (vistos.get(base) || 0) + 1;
    vistos.set(base, n);
    linhas.push({ data, titulo, valor, categoria: sugerirCategoria(titulo, valor, historico), import_key: `${base}|${n}` });
  }
  if (!linhas.length) throw new Error('Nenhuma compra encontrada no arquivo.');
  linhas.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return { ...mesDaFatura(fileName, linhas.map((l) => l.data)), linhas, ignoradas };
}
