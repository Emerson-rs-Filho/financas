// Cópia de segurança: baixa todos os dados da casa numa planilha do Excel (.xlsx), uma aba por assunto.
// O arquivo é montado aqui mesmo no navegador, sem biblioteca externa. Fotos e arquivos anexados não entram.
import * as db from './data.js';

// ---------------- zip sem compressão (o .xlsx é um zip de XMLs) ----------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// arquivos: [[nome, texto]] → Uint8Array com o zip
export function zip(arquivos) {
  const enc = new TextEncoder();
  const partes = [];
  const central = [];
  let pos = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255];
  const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  arquivos.forEach(([nome, texto]) => {
    const n = enc.encode(nome), d = enc.encode(texto), crc = crc32(d);
    const comum = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)];
    const local = new Uint8Array([0x50, 0x4B, 3, 4, ...comum]);
    partes.push(local, n, d);
    central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...comum, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)]), n);
    pos += local.length + n.length + d.length;
  });
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new Uint8Array([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length), ...u32(tamCentral), ...u32(pos), ...u16(0)]);
  const tudo = [...partes, ...central, fim];
  const out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let o = 0;
  tudo.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

// ---------------- planilha ----------------
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
// 0 → A, 25 → Z, 26 → AA
const coluna = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const celula = (v, ref) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') v = v ? 'sim' : 'não';
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(typeof v === 'object' ? JSON.stringify(v) : v)}</t></is></c>`;
};
// abas: [{ nome, linhas: [[...]] }] (a primeira linha é o cabeçalho) → Uint8Array do .xlsx
export function xlsx(abas) {
  const nomes = abas.map((a) => a.nome.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const arquivos = [
    ['[Content_Types].xml', `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, `${cab}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${a.linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => celula(v, coluna(c) + (r + 1))).join('')}</row>`).join('')}</sheetData></worksheet>`]),
  ];
  return zip(arquivos);
}

// lista de objetos → linhas, com as colunas escolhidas (ou todas as que aparecem)
const tabela = (lista, colunas) => {
  const cols = colunas || [...new Set(lista.flatMap((o) => Object.keys(o)))].filter((k) => !['criado_por', 'dados'].includes(k));
  return [cols, ...lista.map((o) => cols.map((k) => o[k]))];
};

const FONTES = [
  ['Lançamentos', async () => tabela(await db.listLancamentos(), ['id', 'ano', 'mes', 'tipo', 'descricao', 'categoria', 'valor', 'cartao', 'data_compra'])],
  ['Investimentos', async () => tabela(await db.listInvestimentos())],
  ['Contas a pagar', async () => tabela((await db.listContas()).contas)],
  ['Pagamentos de contas', async () => tabela((await db.listContas()).pagamentos)],
  ['Orçamento', async () => tabela(await db.listOrcamentos())],
  ['Lista de compras', async () => tabela(await db.listCompras())],
  ['Compras fechadas', async () => tabela((await db.listFechamentos()).map((f) => ({ ...f, itens: (f.itens || []).map((i) => (i.quantidade ? `${i.nome} (${i.quantidade})` : i.nome)).join(', ') })))],
  ['Reparos', async () => tabela((await db.listReparos()).reparos)],
  ['Documentos', async () => tabela(await db.listDocumentos())],
  ['Tarefas da casa', async () => tabela((await db.listRotinas()).rotinas)],
  ['Tarefas feitas', async () => tabela((await db.listRotinas()).feitas)],
  ['Cardápio', async () => tabela(await db.listCardapio())],
  ['Metas', async () => tabela((await db.listMetas()).metas)],
  ['Metas - guardado', async () => tabela((await db.listMetas()).aportes)],
];

// Monta a planilha com tudo o que der para ler. Devolve { bytes, nome, abas, falhas }.
export async function gerarBackup() {
  const abas = [];
  const falhas = [];
  for (const [nome, ler] of FONTES) {
    try { abas.push({ nome, linhas: await ler() }); } catch (e) { falhas.push(`${nome}: ${e.message}`); }
  }
  const agora = new Date();
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  abas.unshift({ nome: 'Sobre', linhas: [
    ['Cópia de segurança do Nossa Casa'], ['Gerada em', agora.toLocaleString('pt-BR')], [],
    ['Aba', 'Registros'], ...abas.map((a) => [a.nome, a.linhas.length - 1]), [],
    ['Fotos de reparos e arquivos de documentos não entram nesta planilha; eles ficam no Storage do Supabase.'],
    ...(falhas.length ? [[], ['Não foi possível ler:'], ...falhas.map((f) => [f])] : []),
  ] });
  return { bytes: xlsx(abas), nome: `nossa-casa-${dia}.xlsx`, abas: abas.length - 1, falhas };
}

export async function baixarBackup() {
  const r = await gerarBackup();
  const url = URL.createObjectURL(new Blob([r.bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = r.nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return r;
}
