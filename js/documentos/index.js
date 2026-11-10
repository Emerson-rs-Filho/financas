// Módulo Documentos e garantias: notas, garantias, seguros e contratos, com o arquivo anexado e aviso de vencimento.
import * as db from '../data.js';
import { modal, esc, ico, reduzirImagem } from '../ui.js';

let C = { render() {}, irPara() {} };
let D = [];
let erro = '';
let fTipo = '';
let busca = '';

export const TIPOS = { garantia: 'Garantia', nota: 'Nota fiscal', seguro: 'Seguro', pessoal: 'Documento pessoal', contrato: 'Contrato', manual: 'Manual', outro: 'Outro' };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);

// Dias até o vencimento (negativo = já venceu); null quando o documento não vence.
export function diasPara(d) {
  if (!d.vencimento) return null;
  const [a, m, dia] = d.vencimento.split('-').map(Number);
  const h = new Date();
  return Math.round((new Date(a, m - 1, dia) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 864e5);
}
export const situacao = (d) => {
  const n = diasPara(d);
  return n == null ? 'sem' : n < 0 ? 'vencido' : n <= (d.avisar_dias ?? 30) ? 'vencendo' : 'ok';
};
const textoVenc = (d) => {
  const n = diasPara(d);
  if (n == null) return '';
  if (n < 0) return `venceu em ${dmy(d.vencimento)}`;
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  return n <= 60 ? `vence em ${n} dias` : `vale até ${dmy(d.vencimento)}`;
};

async function carregarTudo() {
  try { D = await db.listDocumentos(); erro = ''; } catch (e) { D = []; erro = e.message; }
}

function linha(d) {
  const s = situacao(d);
  return `<div class="li tap" data-action="ver-d" data-id="${d.id}">
    <span class="li-ic ${s === 'vencido' ? 'neg' : ''}">${ico('documentos', 18)}</span>
    <div class="li-main"><span class="li-t">${esc(d.titulo)}</span>
      <span class="li-s ${s === 'vencido' ? 'neg' : ''}">${esc([TIPOS[d.tipo] || 'Outro', d.dono, textoVenc(d)].filter(Boolean).join(' · '))}</span></div>
    ${d.arquivo_path ? `<span class="li-v muted" title="Tem arquivo anexado">${ico('clipe', 16)}</span>` : ''}
  </div>`;
}

function pintar() {
  const body = document.getElementById('doc-body');
  if (!body) return;
  const cnt = document.getElementById('doc-count');
  const alerta = D.filter((d) => ['vencido', 'vencendo'].includes(situacao(d))).length;
  if (cnt) { cnt.textContent = alerta ? `${alerta} ${alerta > 1 ? 'pedem' : 'pede'} atenção` : `${D.length} ${D.length === 1 ? 'guardado' : 'guardados'}`; }
  if (erro) { body.innerHTML = `<div class="empty">${esc(erro)}</div>`; return; }
  if (!D.length) {
    body.innerHTML = `<div class="empty">Guarde aqui notas fiscais, garantias, apólices de seguro, contratos e documentos da família, com a foto ou o PDF.<br>
      Informe o vencimento e o app avisa antes de a garantia ou o seguro acabar.<br><br>
      <button class="btn lime" data-action="novo-d">${ico('plus', 16)}primeiro documento</button></div>`;
    return;
  }
  const q = norm(busca);
  const lista = D.filter((d) => (!fTipo || d.tipo === fTipo) && (!q || norm(`${d.titulo} ${d.dono} ${d.observacao} ${TIPOS[d.tipo]}`).includes(q)));
  const porVenc = (a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999');
  const vencidos = lista.filter((d) => situacao(d) === 'vencido').sort(porVenc);
  const vencendo = lista.filter((d) => situacao(d) === 'vencendo').sort(porVenc);
  const resto = lista.filter((d) => ['ok', 'sem'].includes(situacao(d))).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const tipos = Object.keys(TIPOS).filter((t) => D.some((d) => d.tipo === t));
  const chip = (v, rotulo, n) => `<button class="chip" data-action="f-tipo" data-v="${v}" aria-pressed="${v === fTipo}">${esc(rotulo)}${n != null ? ` <small class="num">${n}</small>` : ''}</button>`;
  const bloco = (titulo, l, cls = '') => (l.length ? `<section class="tile"><div class="tile-head"><h2 class="${cls}">${titulo}</h2><span class="muted num" style="font-size:12px">${l.length}</span></div>
    <div class="list">${l.map(linha).join('')}</div></section>` : '');
  body.innerHTML = `
    ${tipos.length > 1 ? `<div class="rp-filtros" role="group" aria-label="Tipo">${chip('', 'todos', D.length)}${tipos.map((t) => chip(t, TIPOS[t].toLowerCase(), D.filter((d) => d.tipo === t).length)).join('')}</div>` : ''}
    ${bloco('vencidos', vencidos, 'neg')}
    ${bloco('vencendo', vencendo)}
    ${bloco(vencidos.length || vencendo.length ? 'os demais' : 'documentos', resto)}
    ${lista.length ? '' : '<div class="empty">Nenhum documento encontrado com esse filtro.</div>'}`;
}

// ---------------- detalhe ----------------
function verDoc(id) {
  const d = D.find((x) => x.id === +id);
  if (!d) return;
  const s = situacao(d);
  const info = [['tipo', TIPOS[d.tipo] || 'Outro'], ['de quem / do quê', d.dono],
    ['vencimento', d.vencimento ? `${dmy(d.vencimento)}${s === 'vencido' ? ' (vencido)' : ''}` : ''],
    ['avisar', d.vencimento ? `${d.avisar_dias ?? 30} dias antes` : '']].filter(([, v]) => v);
  modal.innerHTML = `
  <form method="dialog" id="f-doc-ver">
    <div class="rp-det-head"><h2 class="h2">${esc(d.titulo)}</h2>${s === 'vencido' ? '<span class="rp-tag neg">vencido</span>' : s === 'vencendo' ? `<span class="rp-tag fazendo">${textoVenc(d)}</span>` : ''}</div>
    <dl class="rp-info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${d.observacao ? `<p class="rp-desc">${esc(d.observacao)}</p>` : ''}
    ${d.arquivo_path ? `<button type="button" class="btn doc-abrir" id="doc-abrir">${ico('clipe', 16)}<span>${esc(d.arquivo_nome || 'arquivo')}</span><small class="muted">${tamanho(d.tamanho)}</small></button>`
      : '<p class="muted" style="margin:0;font-size:13px">Sem arquivo anexado. Toque em Editar para anexar a foto ou o PDF.</p>'}
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill danger" value="del" formnovalidate>Excluir</button><button class="pill" value="edit">Editar</button><button class="pill green" value="cancel">Fechar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const err = f.querySelector('#f-err');
  const abrir = f.querySelector('#doc-abrir');
  if (abrir) abrir.addEventListener('click', async () => {
    err.textContent = '';
    // abre a aba antes de pedir o link: o celular bloqueia janelas abertas depois de uma espera
    const w = db.DEMO ? null : window.open('', '_blank');
    try {
      const url = await db.urlDocumento(d);
      if (w) w.location = url; else location.href = url;
    } catch (e) { if (w) w.close(); err.textContent = e.message; }
  });
  f.addEventListener('submit', async (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') return;
    ev.preventDefault();
    if (v === 'edit') return docForm(d);
    if (!confirm(`Excluir "${d.titulo}"${d.arquivo_path ? ' e o arquivo anexado' : ''}?`)) return;
    try { await db.excluirDocumento(d); D = D.filter((x) => x !== d); modal.close(); pintar(); } catch (e) { err.textContent = e.message; }
  });
  if (!modal.open) modal.showModal();
}

// ---------------- cadastro ----------------
function docForm(d = {}) {
  const donos = [...new Set(D.map((x) => x.dono).filter(Boolean))];
  modal.innerHTML = `
  <form method="dialog" id="f-doc">
    <h2 class="h2">${d.id ? 'editar documento' : 'novo documento'}</h2>
    <label class="field">Nome<input name="titulo" required maxlength="120" value="${esc(d.titulo || '')}" placeholder="Ex.: Garantia da geladeira, Seguro do carro"></label>
    <div class="grid2">
      <label class="field">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === (d.tipo || fTipo || 'garantia') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">De quem / do quê (opcional)<input name="dono" list="dl-dono" value="${esc(d.dono || '')}" placeholder="Geladeira, Carro, Emerson…"></label>
    </div>
    <div class="grid2" id="doc-gar">
      <label class="field">Data da compra<input name="compra" type="date"></label>
      <label class="field">Garantia (meses)<input name="meses" type="number" inputmode="numeric" min="1" max="240" placeholder="12"></label>
    </div>
    <div class="grid2">
      <label class="field">Vence em (opcional)<input name="vencimento" type="date" value="${d.vencimento || ''}"></label>
      <label class="field">Avisar quantos dias antes<input name="avisar_dias" type="number" inputmode="numeric" min="0" max="365" value="${d.avisar_dias ?? 30}"></label>
    </div>
    <label class="field">Observações<textarea name="observacao" rows="2" placeholder="Número da apólice, loja, telefone da assistência…">${esc(d.observacao || '')}</textarea></label>
    <label class="field">${d.arquivo_path ? `Trocar o arquivo (atual: ${esc(d.arquivo_nome || 'arquivo')})` : 'Arquivo: foto ou PDF (opcional)'}<input name="arquivo" type="file" accept="image/*,application/pdf" class="rp-file"></label>
    ${db.DEMO ? '<p class="muted" style="margin:0;font-size:12px">Modo demonstração: o arquivo não é guardado, só os dados.</p>' : ''}
    <datalist id="dl-dono">${donos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const gar = () => { f.querySelector('#doc-gar').hidden = f.tipo.value !== 'garantia'; };
  // data da compra + meses de garantia → vencimento
  const calc = () => {
    if (!f.compra.value || !(+f.meses.value > 0)) return;
    const [a, m, dia] = f.compra.value.split('-').map(Number);
    const fim = new Date(a, m - 1 + +f.meses.value, dia);
    if (fim.getDate() !== dia) fim.setDate(0); // 31/01 + 1 mês → último dia de fevereiro
    f.vencimento.value = isoDia(fim);
  };
  f.tipo.addEventListener('change', gar);
  f.compra.addEventListener('change', calc);
  f.meses.addEventListener('input', calc);
  gar();
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') { if (d.id) { ev.preventDefault(); verDoc(d.id); } return; }
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const dados = Object.fromEntries(new FormData(f));
    ['arquivo', 'compra', 'meses'].forEach((k) => delete dados[k]);
    const botao = f.querySelector('.pill.green');
    const err = f.querySelector('#f-err');
    botao.disabled = true; err.textContent = '';
    try {
      let arq = f.arquivo.files[0] || null;
      if (arq && arq.size > 20 * 1048576 && !/^image\//.test(arq.type)) throw new Error('O arquivo passa de 20 MB. Use um PDF menor.');
      if (arq && /^image\//.test(arq.type)) {
        // fotos de câmera são grandes: reduz mantendo o texto legível
        const blob = await reduzirImagem(arq, 2200, 0.85);
        arq = new File([blob], arq.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
      await db.salvarDocumento({ ...dados, id: d.id, arquivo_path: d.arquivo_path }, arq);
      await carregarTudo();
      modal.close();
      pintar();
    } catch (e) { err.textContent = e.message; botao.disabled = false; }
  });
  if (!modal.open) modal.showModal();
  f.titulo.focus();
}

export default {
  id: 'documentos',
  nome: 'Documentos e garantias',
  abas: [['lista', 'Documentos', 'documentos']],
  barra: ['lista', { acao: 'novo-d', icone: 'plus', rotulo: 'Novo documento' }],

  async carregar(ctx) {
    C = ctx;
    await carregarTudo();
  },

  render(aba, el, ctx) {
    C = ctx;
    el.style.maxWidth = '820px';
    el.innerHTML = `
      <div class="page-head"><h1>documentos e garantias</h1>
        <div class="actions"><span class="badge lime" id="doc-count"></span>
          <button class="btn lime" data-action="novo-d">${ico('plus', 16)}novo</button></div></div>
      <label class="shop-add doc-busca"><span class="sr">Buscar documento</span><span class="muted" style="display:flex;padding-left:10px">${ico('busca', 18)}</span>
        <input id="doc-q" type="search" placeholder="buscar… ex.: geladeira, seguro" value="${esc(busca)}" autocomplete="off"></label>
      <div id="doc-body" style="display:flex;flex-direction:column;gap:12px"></div>`;
    el.querySelector('#doc-q').addEventListener('input', (ev) => { busca = ev.target.value; pintar(); });
    pintar();
  },

  acao(a, b) {
    if (a === 'novo-d') docForm();
    else if (a === 'ver-d') verDoc(b.dataset.id);
    else if (a === 'f-tipo') { fTipo = b.dataset.v; pintar(); }
  },
};
