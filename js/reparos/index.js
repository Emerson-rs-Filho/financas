// Módulo Reparos e melhorias: o que precisa ser feito na casa, por cômodo e prioridade, com fotos de antes e depois.
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';

let C = { render() {}, irPara() {}, esquecer() {} };
let R = [];          // reparos
let F = [];          // fotos
let fStatus = 'abertos';
let fComodo = '';
let cancelar = null;
let erro = '';

const COMODOS = ['Sala', 'Cozinha', 'Banheiro', 'Quarto', 'Lavanderia', 'Área externa', 'Garagem', 'Casa toda'];
const STATUS = { a_fazer: 'a fazer', fazendo: 'fazendo', feito: 'feito' };
const PRIO = { alta: 'alta', media: 'média', baixa: 'baixa' };
const ORD_ST = { fazendo: 0, a_fazer: 1, feito: 2 };
const ORD_PR = { alta: 0, media: 1, baixa: 2 };

const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: (+v % 1) ? 2 : 0 });
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dm = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const dmy = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const atrasado = (r) => r.status !== 'feito' && r.prazo && r.prazo < hojeISO();
const fotosDe = (id, momento) => F.filter((f) => f.reparo_id === id && (!momento || f.momento === momento));

// ---------------- dados ----------------
async function carregarTudo() {
  try { ({ reparos: R, fotos: F } = await db.listReparos()); erro = ''; } catch (e) { R = []; F = []; erro = e.message; }
}
async function recarregar() {
  await carregarTudo();
  if (C.def && C.def.id === 'reparos' && document.getElementById('rp-body')) pintar();
}

// Reduz a foto no próprio celular antes de enviar (fotos de câmera têm 3–8 MB).
async function reduzir(file, max, q) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    src = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error(`Não consegui abrir "${file.name}". Use uma foto JPG ou PNG.`));
      i.src = URL.createObjectURL(file);
    });
  }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error('Falha ao preparar a foto.'))), 'image/jpeg', q));
}

async function enviarFotos(reparoId, files, momento, aviso) {
  const lista = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  for (let i = 0; i < lista.length; i++) {
    if (aviso) aviso(`enviando foto ${i + 1} de ${lista.length}…`);
    const blob = await reduzir(lista[i], db.DEMO ? 900 : 1600, db.DEMO ? 0.7 : 0.82);
    F.push(await db.addFotoReparo(reparoId, blob, momento));
  }
  if (aviso) aviso('');
}

// Coloca as imagens nos <img data-foto> da tela (links temporários do bucket privado).
async function mostrarFotos(raiz) {
  const imgs = [...raiz.querySelectorAll('img[data-foto]')];
  if (!imgs.length) return;
  const ids = new Set(imgs.map((i) => +i.dataset.foto));
  const urls = await db.urlsFotosReparo(F.filter((f) => ids.has(f.id)));
  imgs.forEach((i) => { const u = urls.get(+i.dataset.foto); if (u) i.src = u; });
}

// ---------------- lista ----------------
function ordenar(a, b) {
  if (a.status === 'feito' && b.status === 'feito') return String(b.concluido_em || '').localeCompare(String(a.concluido_em || '')) || b.id - a.id;
  return ORD_ST[a.status] - ORD_ST[b.status] || ORD_PR[a.prioridade] - ORD_PR[b.prioridade]
    || (a.prazo || '9999').localeCompare(b.prazo || '9999') || b.id - a.id;
}

function cartao(r) {
  const capa = fotosDe(r.id, r.status === 'feito' ? 'depois' : 'antes')[0] || fotosDe(r.id)[0];
  const n = fotosDe(r.id).length;
  const tags = [];
  if (r.status === 'fazendo') tags.push('<span class="rp-tag fazendo">fazendo</span>');
  if (r.status === 'feito') tags.push(`<span class="rp-tag ok">feito${r.concluido_em ? ` ${dm(r.concluido_em)}` : ''}</span>`);
  else if (r.prioridade === 'alta') tags.push('<span class="rp-tag alta">prioridade alta</span>');
  if (r.status !== 'feito' && r.prazo) tags.push(`<span class="rp-tag ${atrasado(r) ? 'neg' : ''}">${atrasado(r) ? 'atrasado · ' : 'até '}${dm(r.prazo)}</span>`);
  const custo = r.status === 'feito' ? r.custo_real : r.custo_estimado;
  if (custo) tags.push(`<span class="rp-tag">${brl(custo)}</span>`);
  if (n) tags.push(`<span class="rp-tag">${n} ${n > 1 ? 'fotos' : 'foto'}</span>`);
  return `<button class="rp-card ${r.status === 'feito' ? 'feito' : ''}" data-action="ver-r" data-id="${r.id}">
    <span class="rp-foto">${capa ? `<img data-foto="${capa.id}" alt="" loading="lazy">` : ico(r.tipo === 'melhoria' ? 'melhoria' : 'reparos', 26)}</span>
    <span class="rp-body">
      <span class="rp-t">${esc(r.titulo)}</span>
      <span class="rp-s">${esc([r.comodo, r.tipo === 'melhoria' ? 'melhoria' : 'reparo', r.responsavel].filter(Boolean).join(' · '))}</span>
      ${tags.length ? `<span class="rp-tags">${tags.join('')}</span>` : ''}
    </span>
  </button>`;
}

function pintar() {
  const body = document.getElementById('rp-body');
  if (!body) return;
  const ano = new Date().getFullYear();
  const abertos = R.filter((r) => r.status !== 'feito');
  const cnt = document.getElementById('rp-count');
  if (cnt) cnt.textContent = abertos.length ? `${abertos.length} em aberto` : 'tudo em dia';
  if (erro) { body.innerHTML = `<div class="empty">${esc(erro)}</div>`; return; }
  if (!R.length) {
    body.innerHTML = `<div class="empty">Anote aqui o que precisa ser consertado ou melhorado na casa: a torneira pingando, a parede para pintar, a prateleira para instalar.<br>
      Tire uma foto do problema e, quando ficar pronto, uma do resultado.<br><br>
      <button class="btn lime" data-action="novo-r">${ico('plus', 16)}primeiro reparo</button></div>`;
    return;
  }
  const doStatus = R.filter((r) => (fStatus === 'abertos' ? r.status !== 'feito' : fStatus === 'todos' ? true : r.status === fStatus));
  const comodos = [...new Set(doStatus.map((r) => r.comodo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (fComodo && !comodos.includes(fComodo)) fComodo = '';
  const lista = doStatus.filter((r) => !fComodo || r.comodo === fComodo).sort(ordenar);
  const chip = (acao, valor, atual, rotulo, n) => `<button class="chip" data-action="${acao}" data-v="${esc(valor)}" aria-pressed="${valor === atual}">${esc(rotulo)}${n != null ? ` <small class="num">${n}</small>` : ''}</button>`;
  const prev = abertos.reduce((a, r) => a + (+r.custo_estimado || 0), 0);
  const gasto = R.filter((r) => r.status === 'feito' && String(r.concluido_em || '').startsWith(String(ano))).reduce((a, r) => a + (+r.custo_real || 0), 0);
  body.innerHTML = `
    <section class="kpis">
      <div class="kpi"><span class="k">a fazer</span><span class="v num">${R.filter((r) => r.status === 'a_fazer').length}</span></div>
      <div class="kpi"><span class="k">fazendo</span><span class="v num">${R.filter((r) => r.status === 'fazendo').length}</span></div>
      <div class="kpi"><span class="k">previsto em aberto</span><span class="v num">${brl(prev)}</span></div>
      <div class="kpi"><span class="k">gasto em ${ano}</span><span class="v num">${brl(gasto)}</span></div>
    </section>
    <div class="rp-filtros" role="group" aria-label="Situação">
      ${chip('f-st', 'abertos', fStatus, 'em aberto', abertos.length)}
      ${chip('f-st', 'fazendo', fStatus, 'fazendo', R.filter((r) => r.status === 'fazendo').length)}
      ${chip('f-st', 'feito', fStatus, 'feitos', R.filter((r) => r.status === 'feito').length)}
      ${chip('f-st', 'todos', fStatus, 'todos', R.length)}
    </div>
    ${comodos.length > 1 ? `<div class="rp-filtros" role="group" aria-label="Cômodo">
      ${chip('f-cm', '', fComodo, 'todos os cômodos')}
      ${comodos.map((c) => chip('f-cm', c, fComodo, c.toLowerCase(), doStatus.filter((r) => r.comodo === c).length)).join('')}
    </div>` : ''}
    ${lista.length ? `<div class="rp-grid">${lista.map(cartao).join('')}</div>`
      : `<div class="empty">${fStatus === 'feito' ? 'Nada concluído ainda.' : 'Nada em aberto por aqui.'}</div>`}`;
  mostrarFotos(body);
}

// ---------------- detalhe ----------------
function verReparo(id) {
  const r = R.find((x) => x.id === +id);
  if (!r) return;
  const info = [
    ['cômodo', r.comodo], ['tipo', r.tipo === 'melhoria' ? 'melhoria' : 'reparo'], ['prioridade', PRIO[r.prioridade]],
    ['quem faz', r.responsavel], ['prazo', r.prazo ? `${dmy(r.prazo)}${atrasado(r) ? ' (atrasado)' : ''}` : ''],
    ['custo previsto', r.custo_estimado ? brl(r.custo_estimado) : ''], ['custo real', r.custo_real ? brl(r.custo_real) : ''],
    ['concluído em', r.status === 'feito' ? dmy(r.concluido_em) : ''],
  ].filter(([, v]) => v);
  const blocoFotos = (momento) => {
    const fs = fotosDe(r.id, momento);
    return `<section class="rp-fotos-sec">
      <div class="rp-fotos-h"><h3>${momento}${fs.length ? ` <span class="muted num">${fs.length}</span>` : ''}</h3>
        <label class="btn rp-add">${ico('camera', 16)}adicionar<input type="file" accept="image/*" multiple data-momento="${momento}"></label></div>
      ${fs.length ? `<div class="rp-fotos">${fs.map((f) => `<div class="rp-th"><img data-foto="${f.id}" alt="Foto ${momento}" data-zoom>
        <button type="button" data-del-foto="${f.id}" aria-label="Apagar foto">${ico('fechar', 14)}</button></div>`).join('')}</div>`
        : `<p class="muted" style="margin:0;font-size:12px">${momento === 'antes' ? 'Foto do problema, da medida, do modelo da peça…' : 'Como ficou depois de pronto.'}</p>`}
    </section>`;
  };
  modal.classList.add('wide');
  modal.innerHTML = `
  <form method="dialog" id="f-rp-ver">
    <div class="rp-det-head"><h2 class="h2">${esc(r.titulo)}</h2>${r.prioridade === 'alta' && r.status !== 'feito' ? '<span class="rp-tag alta">prioridade alta</span>' : ''}</div>
    <div class="rp-st" role="group" aria-label="Situação">
      ${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-st="${k}" aria-pressed="${r.status === k}">${v}</button>`).join('')}
    </div>
    ${r.descricao ? `<p class="rp-desc">${esc(r.descricao)}</p>` : ''}
    ${info.length ? `<dl class="rp-info">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${blocoFotos('antes')}
    ${blocoFotos('depois')}
    <div class="muted" id="rp-aviso" role="status" style="font-size:13px"></div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill danger" value="del" formnovalidate>Excluir</button><button class="pill" value="edit">Editar</button><button class="pill green" value="cancel">Fechar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const err = f.querySelector('#f-err');
  const aviso = (t) => { f.querySelector('#rp-aviso').textContent = t; };
  f.addEventListener('click', async (ev) => {
    const st = ev.target.closest('[data-st]');
    const del = ev.target.closest('[data-del-foto]');
    const zoom = ev.target.closest('img[data-zoom]');
    if (st && st.dataset.st !== r.status) {
      if (st.dataset.st === 'feito') return concluirForm(r);
      if (r.status === 'feito' && !confirm('Reabrir este item? Se o gasto já foi lançado em Finanças, ele continua lá (apague em Lançamentos se precisar).')) return;
      try {
        await db.salvarReparo({ id: r.id, status: st.dataset.st, concluido_em: null });
        Object.assign(r, { status: st.dataset.st, concluido_em: null });
        pintar(); verReparo(r.id);
      } catch (e) { err.textContent = e.message; }
    } else if (del) {
      if (!confirm('Apagar esta foto?')) return;
      const foto = F.find((x) => x.id === +del.dataset.delFoto);
      try { await db.excluirFotoReparo(foto); F = F.filter((x) => x !== foto); pintar(); verReparo(r.id); } catch (e) { err.textContent = e.message; }
    } else if (zoom && zoom.src) {
      const z = document.createElement('div');
      z.className = 'rp-zoom';
      z.innerHTML = `<img src="${zoom.src}" alt="">`;
      z.addEventListener('click', (e2) => { e2.stopPropagation(); z.remove(); });
      f.appendChild(z);
    }
  });
  f.addEventListener('change', async (ev) => {
    const inp = ev.target.closest('input[type="file"]');
    if (!inp || !inp.files.length) return;
    err.textContent = '';
    f.querySelectorAll('.rp-add').forEach((l) => l.classList.add('busy'));
    try { await enviarFotos(r.id, inp.files, inp.dataset.momento, aviso); } catch (e) { err.textContent = e.message; aviso(''); }
    pintar();
    if (!err.textContent) verReparo(r.id); else f.querySelectorAll('.rp-add').forEach((l) => l.classList.remove('busy'));
  });
  f.addEventListener('submit', async (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') return;
    ev.preventDefault();
    if (v === 'edit') return reparoForm(r);
    if (v === 'del') {
      if (!confirm(`Excluir "${r.titulo}" e as fotos dele?`)) return;
      try {
        await db.excluirReparo(r.id, fotosDe(r.id));
        R = R.filter((x) => x !== r); F = F.filter((x) => x.reparo_id !== r.id);
        modal.close(); pintar();
      } catch (e) { err.textContent = e.message; }
    }
  });
  if (!modal.open) modal.showModal();
  mostrarFotos(f);
}

// ---------------- cadastro ----------------
function reparoForm(r = {}) {
  const comodos = [...new Set([...COMODOS, ...R.map((x) => x.comodo).filter(Boolean)])];
  const resp = [...new Set(['Nós', ...R.map((x) => x.responsavel).filter(Boolean)])];
  const sel = (nome, ops, atual) => `<select name="${nome}">${Object.entries(ops).map(([k, v]) => `<option value="${k}" ${k === atual ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
  modal.classList.remove('wide');
  modal.innerHTML = `
  <form method="dialog" id="f-rp">
    <h2 class="h2">${r.id ? 'editar' : 'novo reparo ou melhoria'}</h2>
    <label class="field">O que precisa ser feito<input name="titulo" required maxlength="120" value="${esc(r.titulo || '')}" placeholder="Ex.: Torneira da cozinha pingando"></label>
    <div class="grid2">
      <label class="field">Cômodo<input name="comodo" list="dl-comodo" value="${esc(r.comodo || '')}" placeholder="Cozinha"></label>
      <label class="field">Tipo${sel('tipo', { reparo: 'Reparo (algo quebrado)', melhoria: 'Melhoria (deixar melhor)' }, r.tipo || 'reparo')}</label>
    </div>
    <div class="grid2">
      <label class="field">Prioridade${sel('prioridade', { alta: 'Alta', media: 'Média', baixa: 'Baixa' }, r.prioridade || 'media')}</label>
      <label class="field">Quem faz<input name="responsavel" list="dl-resp" value="${esc(r.responsavel || '')}" placeholder="Nós, eletricista, encanador…"></label>
    </div>
    <div class="grid2">
      <label class="field">Fazer até (opcional)<input name="prazo" type="date" value="${r.prazo || ''}"></label>
      <label class="field">Custo previsto (R$)<input name="custo_estimado" type="number" inputmode="decimal" step="0.01" min="0" value="${r.custo_estimado ?? ''}" placeholder="0,00"></label>
    </div>
    <label class="field">Detalhes<textarea name="descricao" rows="3" placeholder="Medidas, modelo da peça, orçamento recebido, telefone do profissional…">${esc(r.descricao || '')}</textarea></label>
    ${r.id ? '' : `<label class="field">Fotos (opcional)<input name="fotos" type="file" accept="image/*" multiple class="rp-file"></label>`}
    <datalist id="dl-comodo">${comodos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="dl-resp">${resp.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="muted" id="rp-aviso" role="status" style="font-size:13px"></div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') { if (r.id) { ev.preventDefault(); verReparo(r.id); } return; }
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const d = Object.fromEntries(new FormData(f));
    delete d.fotos;
    const botao = f.querySelector('.pill.green');
    botao.disabled = true;
    try {
      const id = await db.salvarReparo({ ...d, id: r.id });
      await carregarTudo();
      if (!r.id && f.fotos && f.fotos.files.length) {
        try { await enviarFotos(id, f.fotos.files, 'antes', (t) => { f.querySelector('#rp-aviso').textContent = t; }); } catch (e) { alert(`O item foi salvo, mas a foto não: ${e.message}`); }
      }
      if (!r.id) { fStatus = fStatus === 'feito' ? 'abertos' : fStatus; fComodo = ''; }
      pintar();
      verReparo(id);
    } catch (e) { f.querySelector('#f-err').textContent = e.message; botao.disabled = false; }
  });
  if (!modal.open) modal.showModal();
  f.titulo.focus();
}

// ---------------- concluir (e lançar o gasto em Finanças) ----------------
async function concluirForm(r) {
  let cats = [];
  try { cats = [...new Set((await db.listLancamentos()).filter((l) => l.tipo === 'saida').map((l) => l.categoria))].sort(); } catch (e) { /* sem finanças */ }
  const sugestao = cats.find((c) => /manuten|reparo|reforma/i.test(c)) || cats.find((c) => /^casa$/i.test(c)) || 'Manutenção da casa';
  modal.classList.remove('wide');
  modal.innerHTML = `
  <form method="dialog" id="f-rp-ok">
    <h2 class="h2">concluir: ${esc(r.titulo.toLowerCase())}</h2>
    <div class="grid2">
      <label class="field">Quanto custou (R$)<input name="custo_real" type="number" inputmode="decimal" step="0.01" min="0" value="${r.custo_real ?? r.custo_estimado ?? ''}" placeholder="0,00"></label>
      <label class="field">Concluído em<input name="concluido_em" type="date" required value="${hojeISO()}"></label>
    </div>
    <label class="check"><input type="checkbox" name="lancar"> lançar este gasto em Finanças</label>
    <label class="field" id="rp-cat" hidden>Categoria em Finanças<input name="categoria" list="dl-cat-rp" value="${esc(sugestao)}"></label>
    <p class="muted" id="rp-cat-dica" style="margin:0;font-size:12px;line-height:1.5" hidden>Não marque se pagou no cartão de crédito: o gasto já vai entrar quando você importar a fatura.</p>
    <label class="field">Fotos de depois (opcional)<input name="fotos" type="file" accept="image/*" multiple class="rp-file"></label>
    <datalist id="dl-cat-rp">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="muted" id="rp-aviso" role="status" style="font-size:13px"></div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Voltar</button><button class="pill green" value="ok">Marcar como feito</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const trocar = () => {
    const on = f.lancar.checked;
    f.querySelector('#rp-cat').hidden = !on; f.querySelector('#rp-cat-dica').hidden = !on;
    f.categoria.required = on;
  };
  f.lancar.addEventListener('change', trocar);
  f.custo_real.addEventListener('input', () => { if (!(+f.custo_real.value > 0)) { f.lancar.checked = false; trocar(); } });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (ev.submitter && ev.submitter.value === 'cancel') return verReparo(r.id);
    if (!f.reportValidity()) return;
    const custo = +f.custo_real.value || 0;
    const quando = f.concluido_em.value;
    const botao = f.querySelector('.pill.green');
    botao.disabled = true;
    try {
      await db.salvarReparo({ id: r.id, status: 'feito', custo_real: custo || null, concluido_em: quando });
      Object.assign(r, { status: 'feito', custo_real: custo || null, concluido_em: quando });
      if (f.lancar.checked && custo > 0) {
        const [ano, mes] = quando.split('-');
        await db.saveLancamento({ ano, mes, tipo: 'saida', descricao: r.titulo, categoria: f.categoria.value, valor: custo });
        C.esquecer('financas');
      }
      if (f.fotos.files.length) {
        try { await enviarFotos(r.id, f.fotos.files, 'depois', (t) => { f.querySelector('#rp-aviso').textContent = t; }); } catch (e) { alert(`Concluído, mas a foto não foi enviada: ${e.message}`); }
      }
      pintar();
      verReparo(r.id);
    } catch (e) { f.querySelector('#f-err').textContent = e.message; botao.disabled = false; }
  });
  if (!modal.open) modal.showModal();
}

export default {
  id: 'reparos',
  nome: 'Reparos e melhorias',
  abas: [['lista', 'Reparos', 'reparos']],
  barra: ['lista', { acao: 'novo-r', icone: 'plus', rotulo: 'Novo reparo' }],

  async carregar(ctx) {
    C = ctx;
    await carregarTudo();
    if (!cancelar) {
      cancelar = db.assinarReparos(recarregar);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && C.def && C.def.id === 'reparos') recarregar(); });
    }
  },

  render(aba, el, ctx) {
    C = ctx;
    el.innerHTML = `
      <div class="page-head"><h1>reparos e melhorias</h1>
        <div class="actions"><span class="badge lime" id="rp-count"></span>
          <button class="btn lime" data-action="novo-r">${ico('plus', 16)}novo</button></div></div>
      <div id="rp-body" style="display:flex;flex-direction:column;gap:14px"></div>`;
    pintar();
  },

  acao(a, b) {
    if (a === 'novo-r') reparoForm();
    else if (a === 'ver-r') verReparo(b.dataset.id);
    else if (a === 'f-st') { fStatus = b.dataset.v; pintar(); }
    else if (a === 'f-cm') { fComodo = b.dataset.v; pintar(); }
  },
};
