// Módulo Metas e sonhos: quanto falta para cada objetivo e quanto guardar por mês para chegar lá.
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';

let C = { render() {}, irPara() {} };
let M = [];
let A = [];
let INV = [];
let erro = '';

const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: (+v % 1) ? 2 : 0 });
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dmy = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const inv = (m) => (m.investimento_id ? INV.find((i) => i.id === m.investimento_id) : null);
const aportesDe = (m) => A.filter((a) => a.meta_id === m.id).sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id);
// Guardado: o valor atual do investimento ligado, ou a soma do que foi guardado/retirado à mão.
export const guardado = (m) => (inv(m) ? inv(m).valor_atual : aportesDe(m).reduce((s, a) => s + a.valor, 0));

// Quanto guardar por mês até o prazo (contando o mês atual). null quando não há prazo ou a meta já foi atingida.
export function porMes(m, hoje = hojeISO()) {
  const falta = m.valor_alvo - guardado(m);
  if (!m.prazo || falta <= 0) return null;
  const [a1, m1] = hoje.split('-').map(Number);
  const [a2, m2] = m.prazo.split('-').map(Number);
  const meses = (a2 - a1) * 12 + (m2 - m1) + 1;
  return { meses, valor: meses > 0 ? falta / meses : null };
}

async function carregarTudo() {
  try {
    const [r, i] = await Promise.all([db.listMetas(), db.listInvestimentos().catch(() => [])]);
    M = r.metas; A = r.aportes; INV = i; erro = '';
  } catch (e) { M = []; A = []; erro = e.message; }
}

function cartao(m) {
  const g = guardado(m);
  const pct = Math.max(0, Math.min(100, (g / m.valor_alvo) * 100));
  const ok = g >= m.valor_alvo;
  const pm = porMes(m);
  const linha2 = ok ? 'meta atingida' : pm ? (pm.valor == null ? `o prazo (${dmy(m.prazo)}) já passou` : `${brl(Math.ceil(pm.valor))} por mês até ${MESES[+m.prazo.slice(5, 7) - 1]}/${m.prazo.slice(0, 4)}`) : 'sem prazo';
  return `<article class="tile mt-card ${ok ? 'ok' : ''}">
    <button class="mt-main" data-action="ver-mt" data-id="${m.id}">
      <span class="mt-top"><span class="mt-nome">${esc(m.nome)}</span><span class="mt-pct num">${Math.floor(pct)}%</span></span>
      <span class="track"><span class="mt-bar ${ok ? 'hi' : ''}" style="width:${pct}%"></span></span>
      <span class="mt-val num"><strong>${brl(g)}</strong> de ${brl(m.valor_alvo)}</span>
      <span class="mt-sub ${pm && pm.valor == null ? 'neg' : ''}">${ok ? '' : `faltam ${brl(m.valor_alvo - g)} · `}${linha2}</span>
      ${inv(m) ? `<span class="mt-sub">${ico('investimentos', 13)} acompanha o investimento ${esc(inv(m).nome)}</span>` : ''}
    </button>
    ${inv(m) ? '' : `<button class="btn lime pagar" data-action="guardar-mt" data-id="${m.id}">${ico('plus', 15)}guardar</button>`}
  </article>`;
}

function pintar() {
  const body = document.getElementById('mt-body');
  if (!body) return;
  const cnt = document.getElementById('mt-count');
  const ating = M.filter((m) => guardado(m) >= m.valor_alvo).length;
  if (cnt) cnt.textContent = M.length ? `${ating} de ${M.length} ${ating === 1 ? 'atingida' : 'atingidas'}` : '';
  if (erro) { body.innerHTML = `<div class="empty">${esc(erro)}</div>`; return; }
  if (!M.length) {
    body.innerHTML = `<div class="empty">Dê nome aos sonhos da casa: a viagem, a reforma, a troca do carro, a reserva de emergência.<br>
      Diga quanto custa e para quando, e o app mostra quanto guardar por mês para chegar lá.<br><br>
      <button class="btn lime" data-action="nova-mt">${ico('plus', 16)}primeira meta</button></div>`;
    return;
  }
  const alvo = M.reduce((s, m) => s + m.valor_alvo, 0);
  const tot = M.reduce((s, m) => s + Math.min(guardado(m), m.valor_alvo), 0);
  const mensal = M.reduce((s, m) => { const p = porMes(m); return s + (p && p.valor ? p.valor : 0); }, 0);
  const ord = M.slice().sort((a, b) => (guardado(a) >= a.valor_alvo) - (guardado(b) >= b.valor_alvo) || (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  body.innerHTML = `
    <section class="row2">
      <div class="lime-card" style="flex:2 1 420px">
        <div class="lime-top"><div><div class="label">guardado para as metas</div><div class="big num">${brl(tot)}</div></div>
          <span class="badge">${Math.floor((tot / alvo) * 100)}% do total</span></div>
        <div class="seg"><span style="flex:${tot || 0.0001};background:rgba(20,20,20,.85)"></span><span style="flex:${Math.max(alvo - tot, 0) || 0.0001};background:rgba(20,20,20,.15)"></span></div>
        <div class="lg"><span><i style="background:rgba(20,20,20,.85)"></i>guardado ${brl(tot)}</span><span><i style="background:rgba(20,20,20,.15)"></i>falta ${brl(alvo - tot)}</span></div>
      </div>
      <div class="kpis k2">
        <div class="kpi"><span class="k">soma das metas</span><span class="v num">${brl(alvo)}</span></div>
        <div class="kpi"><span class="k">guardar por mês</span><span class="v num">${mensal ? brl(Math.ceil(mensal)) : '—'}</span></div>
      </div>
    </section>
    <div class="mt-grid">${ord.map(cartao).join('')}</div>`;
}

function metaForm(m = {}) {
  modal.innerHTML = `
  <form method="dialog" id="f-mt">
    <h2 class="h2">${m.id ? 'editar meta' : 'nova meta'}</h2>
    <label class="field">Nome<input name="nome" required maxlength="80" value="${esc(m.nome || '')}" placeholder="Ex.: Viagem para o Nordeste"></label>
    <div class="grid2">
      <label class="field">Quanto custa (R$)<input name="valor_alvo" type="number" inputmode="decimal" step="0.01" min="1" required value="${m.valor_alvo ?? ''}"></label>
      <label class="field">Para quando (opcional)<input name="prazo" type="date" value="${m.prazo || ''}"></label>
    </div>
    ${INV.length ? `<label class="field">De onde vem o dinheiro<select name="investimento_id">
      <option value="">Vou anotando o que guardo aqui</option>
      ${INV.map((i) => `<option value="${i.id}" ${m.investimento_id === i.id ? 'selected' : ''}>Investimento: ${esc(i.nome)} (${brl(i.valor_atual)})</option>`).join('')}
    </select></label>
    <p class="muted" style="margin:0;font-size:12px;line-height:1.5">Ligando a um investimento de Finanças, o guardado passa a ser o valor atual dele.</p>` : '<input type="hidden" name="investimento_id" value="">'}
    <label class="field">Observações<textarea name="observacao" rows="2">${esc(m.observacao || '')}</textarea></label>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${m.id ? '<button class="pill danger" value="del" formnovalidate>Excluir</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') { if (m.id) { ev.preventDefault(); verMeta(m.id); } return; }
    ev.preventDefault();
    try {
      if (v === 'del') {
        if (!confirm(`Excluir a meta "${m.nome}" e o histórico dela?`)) return;
        await db.excluirMeta(m.id);
      } else {
        if (!f.reportValidity()) return;
        await db.salvarMeta({ ...Object.fromEntries(new FormData(f)), id: m.id });
      }
      modal.close();
      await carregarTudo();
      pintar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  if (!modal.open) modal.showModal();
  if (!m.id) f.nome.focus();
}

function guardarForm(m) {
  const pm = porMes(m);
  modal.innerHTML = `
  <form method="dialog" id="f-mt-ap">
    <h2 class="h2">${esc(m.nome.toLowerCase())}</h2>
    <div class="grid2">
      <label class="field">Movimento<select name="sinal"><option value="1">Guardei</option><option value="-1">Retirei</option></select></label>
      <label class="field">Valor (R$)<input name="valor" type="number" inputmode="decimal" step="0.01" min="0.01" required value="${pm && pm.valor ? Math.ceil(pm.valor) : ''}"></label>
    </div>
    <div class="grid2">
      <label class="field">Data<input name="data" type="date" required value="${hojeISO()}"></label>
      <label class="field">Anotação (opcional)<input name="observacao" maxlength="80" placeholder="13º, bônus…"></label>
    </div>
    <p class="muted" style="margin:0;font-size:12px;line-height:1.5">Isto só acompanha a meta; não cria lançamento em Finanças.</p>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (!f.reportValidity()) return;
    try {
      await db.addAporte({ meta_id: m.id, data: f.data.value, valor: +f.valor.value * +f.sinal.value, observacao: f.observacao.value });
      modal.close();
      await carregarTudo();
      pintar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  if (!modal.open) modal.showModal();
  f.valor.select();
}

function verMeta(id) {
  const m = M.find((x) => x.id === +id);
  if (!m) return;
  const g = guardado(m);
  const hist = aportesDe(m);
  modal.innerHTML = `
  <form method="dialog" id="f-mt-ver">
    <h2 class="h2">${esc(m.nome)}</h2>
    <dl class="rp-info">
      <div><dt>guardado</dt><dd>${brl(g)}</dd></div><div><dt>meta</dt><dd>${brl(m.valor_alvo)}</dd></div>
      <div><dt>${g >= m.valor_alvo ? 'passou' : 'falta'}</dt><dd>${brl(Math.abs(m.valor_alvo - g))}</dd></div>
      ${m.prazo ? `<div><dt>para</dt><dd>${dmy(m.prazo)}</dd></div>` : ''}
    </dl>
    ${m.observacao ? `<p class="rp-desc">${esc(m.observacao)}</p>` : ''}
    ${inv(m) ? `<p class="muted" style="margin:0;font-size:13px;line-height:1.5">Acompanha o investimento <strong>${esc(inv(m).nome)}</strong>. Para mudar o valor, atualize o investimento em Finanças.</p>`
      : hist.length ? `<div class="list mt-hist">${hist.map((a) => `<div class="li"><div class="li-main"><span class="li-t">${a.valor >= 0 ? 'Guardei' : 'Retirei'}${a.observacao ? ` · ${esc(a.observacao)}` : ''}</span><span class="li-s">${dmy(a.data)}</span></div>
        <div class="li-v num ${a.valor >= 0 ? 'pos' : 'neg'}">${a.valor >= 0 ? '+' : '−'}${brl(Math.abs(a.valor))}</div>
        <button type="button" class="btn icon" data-del-ap="${a.id}" aria-label="Apagar este registro">${ico('trash', 16)}</button></div>`).join('')}</div>`
        : '<p class="muted" style="margin:0;font-size:13px">Nada guardado ainda.</p>'}
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="edit">Editar</button>${inv(m) ? '' : '<button class="pill" value="guardar">Guardar</button>'}<button class="pill green" value="cancel">Fechar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-del-ap]');
    if (!b || !confirm('Apagar este registro?')) return;
    try { await db.excluirAporte(+b.dataset.delAp); await carregarTudo(); pintar(); verMeta(m.id); } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  f.addEventListener('submit', (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') return;
    ev.preventDefault();
    if (v === 'edit') metaForm(m); else guardarForm(m);
  });
  if (!modal.open) modal.showModal();
}

export default {
  id: 'metas',
  nome: 'Metas e sonhos',
  abas: [['lista', 'Metas', 'metas']],
  barra: ['lista', { acao: 'nova-mt', icone: 'plus', rotulo: 'Nova meta' }],

  async carregar(ctx) {
    C = ctx;
    await carregarTudo();
  },

  render(aba, el, ctx) {
    C = ctx;
    el.innerHTML = `
      <div class="page-head"><h1>metas e sonhos</h1>
        <div class="actions"><span class="badge lime" id="mt-count"></span>
          <button class="btn lime" data-action="nova-mt">${ico('plus', 16)}nova</button></div></div>
      <div id="mt-body" style="display:flex;flex-direction:column;gap:12px"></div>`;
    pintar();
    // os investimentos podem ter mudado em Finanças desde a última visita
    carregarTudo().then(pintar);
  },

  acao(a, b) {
    const m = M.find((x) => x.id === +b.dataset.id);
    if (a === 'nova-mt') metaForm();
    else if (a === 'ver-mt' && m) verMeta(m.id);
    else if (a === 'guardar-mt' && m) guardarForm(m);
  },
};
