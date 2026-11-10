// Módulo Lista de compras: compartilhada entre o casal, atualiza em tempo real e recebe itens da Alexa.
// A lista aparece por corredor do mercado; "fechar compra" guarda o histórico e pode lançar o gasto em Finanças.
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';
import { separarItens, normalizar } from './itens.js';
import { CORREDORES, corredor } from './corredores.js';

let C = { render() {}, irPara() {}, esquecer() {} };
let itens = [];
let fechamentos = [];
let erroHist = '';
let cancelar = null;
let abrirComprados = true;

const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';
const FORMAS = { credito: 'Cartão de crédito', debito: 'Débito', pix: 'Pix', dinheiro: 'Dinheiro' };
const brl = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dm = (iso) => String(iso || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/');

async function carregarHistorico() {
  try { fechamentos = await db.listFechamentos(); erroHist = ''; } catch (e) { fechamentos = []; erroHist = e.message; }
}

async function recarregar() {
  try { itens = await db.listCompras(); } catch (e) { return; }
  pintar();
}

// Os itens mais comprados nos últimos 90 dias que não estão na lista agora.
function frequentes() {
  const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const naLista = new Set(itens.filter((i) => !i.comprado).map((i) => normalizar(i.nome)));
  const cont = new Map();
  fechamentos.filter((f) => String(f.data) >= limite).forEach((f) => (f.itens || []).forEach((i) => {
    const k = normalizar(i.nome);
    if (!k || naLista.has(k)) return;
    const c = cont.get(k) || { nome: i.nome, n: 0 };
    c.n += 1;
    cont.set(k, c);
  }));
  return [...cont.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 12);
}

// Redesenha só a lista (o campo de digitação não perde o foco nem o texto).
function pintar() {
  const body = document.getElementById('shop-body');
  if (!body) return;
  const pend = itens.filter((i) => !i.comprado).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const feitos = itens.filter((i) => i.comprado).sort((a, b) => String(b.comprado_em).localeCompare(String(a.comprado_em)));
  const linha = (i) => `
    <div class="shop-li ${i.comprado ? 'done' : ''}">
      <button class="shop-tg" data-action="tg" data-id="${i.id}" aria-pressed="${i.comprado}" aria-label="${i.comprado ? 'Desmarcar' : 'Marcar como comprado'}: ${esc(i.nome)}">
        <span class="ck">${i.comprado ? CHECK : ''}</span>
        <span class="nm">${esc(i.nome)}</span>
        ${i.quantidade ? `<span class="tag">${esc(i.quantidade)}</span>` : ''}
        ${i.origem === 'alexa' ? '<span class="tag alexa">alexa</span>' : ''}
      </button>
      <button class="shop-del" data-action="del-c" data-id="${i.id}" aria-label="Excluir ${esc(i.nome)}">${ico('trash', 17)}</button>
    </div>`;
  const grupos = CORREDORES.map(([id, nome]) => [nome, pend.filter((i) => corredor(i.nome) === id)]).filter(([, l]) => l.length);
  const freq = frequentes();
  body.innerHTML = `
    ${freq.length ? `<div class="shop-freq" role="group" aria-label="Itens que vocês compram sempre">
      ${freq.map((f) => `<button data-action="add-freq" data-nome="${esc(f.nome)}">${ico('plus', 14)}${esc(f.nome.toLowerCase())}</button>`).join('')}</div>` : ''}
    <section class="tile">
      <div class="tile-head"><h2>para comprar</h2><span class="muted num" style="font-size:12px">${pend.length}</span></div>
      ${pend.length ? grupos.map(([nome, l]) => `${grupos.length > 1 ? `<div class="grp-t">${nome}</div>` : ''}<div class="shop-list">${l.map(linha).join('')}</div>`).join('')
        : '<p class="muted" style="margin:0;font-size:13px;line-height:1.6">Nada para comprar agora. Adicione acima ou diga “Alexa, peça à nossa casa para adicionar leite”.</p>'}
    </section>
    ${feitos.length ? `<details class="group" id="shop-feitos" ${abrirComprados ? 'open' : ''}>
      <summary><span class="nm">no carrinho</span><span class="muted num" style="font-size:13px">${feitos.length}</span></summary>
      <div class="list" style="padding:0 20px 14px"><div class="shop-list">${feitos.map(linha).join('')}</div>
        <button class="btn lime" data-action="fechar-compra" style="margin-top:12px;width:100%">${CHECK}fechar compra</button></div>
    </details>` : ''}
    ${fechamentos.length ? `<details class="group">
      <summary><span class="nm">últimas compras</span><span class="muted num" style="font-size:13px">${fechamentos.length}</span></summary>
      <div class="list" style="padding:0 20px 14px">${fechamentos.slice(0, 15).map((f) => `
        <div class="li tap" data-action="ver-fech" data-id="${f.id}">
          <div class="li-main"><span class="li-t">${esc(f.mercado || 'Compra')}</span>
            <span class="li-s">${dm(f.data)} · ${(f.itens || []).length} ${(f.itens || []).length === 1 ? 'item' : 'itens'}${f.forma ? ` · ${FORMAS[f.forma].toLowerCase()}` : ''}</span></div>
          <div class="li-v num">${f.valor ? brl(f.valor) : ''}</div>
        </div>`).join('')}</div>
    </details>` : ''}`;
  const det = document.getElementById('shop-feitos');
  if (det) det.addEventListener('toggle', () => { abrirComprados = det.open; });
  const cnt = document.getElementById('shop-count');
  if (cnt) cnt.textContent = pend.length ? `${pend.length} ${pend.length > 1 ? 'itens' : 'item'}` : 'tudo comprado';
}

async function adicionar(texto) {
  const novos = separarItens(texto);
  if (!novos.length) return;
  const criar = [];
  for (const n of novos) {
    const igual = itens.find((i) => normalizar(i.nome) === normalizar(n.nome));
    if (!igual) criar.push(n);
    else if (igual.comprado) await db.updateCompra(igual.id, { comprado: false, comprado_em: null, quantidade: n.quantidade || igual.quantidade });
    else if (n.quantidade && n.quantidade !== igual.quantidade) await db.updateCompra(igual.id, { quantidade: n.quantidade });
  }
  if (criar.length) await db.addCompras(criar, 'app');
  await recarregar();
}

// Fecha a compra: os itens do carrinho saem da lista e ficam no histórico.
async function fecharForm() {
  const feitos = itens.filter((i) => i.comprado);
  if (!feitos.length) return;
  if (erroHist) {
    // sem a tabela do histórico (schema antigo): ainda dá para esvaziar o carrinho
    if (confirm(`${erroHist}\n\nApagar os itens do carrinho mesmo assim, sem guardar no histórico?`)) { await db.limparComprados(); recarregar(); }
    return;
  }
  let cats = [];
  try { cats = [...new Set((await db.listLancamentos()).filter((l) => l.tipo === 'saida').map((l) => l.categoria))].sort(); } catch (e) { /* sem finanças */ }
  const cat = cats.find((c) => /mercado/i.test(c)) || cats.find((c) => /aliment/i.test(c)) || 'Mercado';
  const mercados = [...new Set(fechamentos.map((f) => f.mercado).filter(Boolean))];
  const ultima = fechamentos.find((f) => f.forma);
  modal.innerHTML = `
  <form method="dialog" id="f-fech">
    <h2 class="h2">fechar compra</h2>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5">${feitos.length} ${feitos.length > 1 ? 'itens saem' : 'item sai'} da lista e ${feitos.length > 1 ? 'ficam' : 'fica'} guardado${feitos.length > 1 ? 's' : ''} em <strong>últimas compras</strong>.</p>
    <div class="grid2">
      <label class="field">Mercado (opcional)<input name="mercado" list="dl-merc" value="${esc(mercados[0] || '')}" placeholder="Ex.: Atacadão"></label>
      <label class="field">Data<input name="data" type="date" required value="${hojeISO()}"></label>
    </div>
    <div class="grid2">
      <label class="field">Valor total (R$, opcional)<input name="valor" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00"></label>
      <label class="field">Pago com<select name="forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${ultima && ultima.forma === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <label class="field" id="fech-cat" hidden>Lançar em Finanças na categoria<input name="categoria" list="dl-cat-fech" value="${esc(cat)}"></label>
    <p class="muted" id="fech-dica" style="margin:0;font-size:12px;line-height:1.5"></p>
    <datalist id="dl-merc">${mercados.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
    <datalist id="dl-cat-fech">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Fechar compra</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const lanca = () => +f.valor.value > 0 && f.forma.value !== 'credito';
  const trocar = () => {
    f.querySelector('#fech-cat').hidden = !lanca();
    f.categoria.required = lanca();
    f.querySelector('#fech-dica').textContent = !(+f.valor.value > 0) ? 'Sem valor, a compra só fica no histórico.'
      : f.forma.value === 'credito' ? 'No crédito não lança em Finanças: o gasto entra quando você importar a fatura do cartão.'
        : 'Vai criar uma saída em Finanças no mês da compra.';
  };
  f.valor.addEventListener('input', trocar);
  f.forma.addEventListener('change', trocar);
  trocar();
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const botao = f.querySelector('.pill.green');
    botao.disabled = true;
    try {
      await db.fecharCompra({ data: f.data.value, mercado: f.mercado.value, valor: f.valor.value, forma: f.forma.value,
        itens: itens.filter((i) => i.comprado), categoria: lanca() ? f.categoria.value : '' });
      if (lanca()) C.esquecer('financas');
      modal.close();
      await carregarHistorico();
      await recarregar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; botao.disabled = false; }
  });
  modal.showModal();
}

function verFechamento(id) {
  const fe = fechamentos.find((x) => x.id === +id);
  if (!fe) return;
  const lista = fe.itens || [];
  modal.innerHTML = `
  <form method="dialog" id="f-ver-fech">
    <h2 class="h2">${esc((fe.mercado || 'compra').toLowerCase())} · ${dm(fe.data)}</h2>
    <p class="muted" style="margin:0;font-size:13px">${fe.valor ? `${brl(fe.valor)} · ${FORMAS[fe.forma] || ''}${fe.lancamento_id ? ' · lançado em Finanças' : ''}` : 'Sem valor informado.'}</p>
    <div class="shop-hist">${lista.map((i) => `<span>${esc(i.nome)}${i.quantidade ? ` <small>${esc(i.quantidade)}</small>` : ''}</span>`).join('') || '<span class="muted">Sem itens.</span>'}</div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill danger" value="del" formnovalidate>Excluir</button>
      ${lista.length ? '<button class="pill" value="repetir">Pôr na lista de novo</button>' : ''}<button class="pill green" value="cancel">Fechar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') return;
    ev.preventDefault();
    try {
      if (v === 'repetir') {
        await adicionar(lista.map((i) => (i.quantidade ? `${i.quantidade} ${/[a-zà-ú]/i.test(i.quantidade) ? 'de ' : ''}${i.nome}` : i.nome)).join('\n'));
      } else {
        if (!confirm(fe.lancamento_id ? 'Excluir esta compra do histórico? O lançamento que ela criou em Finanças também será apagado.' : 'Excluir esta compra do histórico?')) return;
        await db.excluirFechamento(fe);
        if (fe.lancamento_id) C.esquecer('financas');
        await carregarHistorico();
      }
      modal.close();
      pintar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

export default {
  id: 'compras',
  nome: 'Lista de compras',
  abas: [['lista', 'Lista', 'compras']],
  barra: ['lista', { acao: 'add-foco', icone: 'plus', rotulo: 'Adicionar item' }],

  async carregar(ctx) {
    C = ctx;
    [itens] = await Promise.all([db.listCompras(), carregarHistorico()]);
    if (!cancelar) {
      cancelar = db.assinarCompras(recarregar);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && C.def && C.def.id === 'compras') recarregar(); });
    }
  },

  render(aba, el, ctx) {
    C = ctx;
    el.style.maxWidth = '820px';
    el.innerHTML = `
      <div class="page-head"><h1>lista de compras</h1><span class="badge lime" id="shop-count"></span></div>
      <form class="shop-add" id="shop-form" autocomplete="off">
        <label class="sr" for="shop-in">Adicionar item</label>
        <input id="shop-in" placeholder="adicionar… ex.: 2 leite, pão e café" enterkeyhint="done" autocapitalize="sentences">
        <button class="btn lime icon" aria-label="Adicionar">${ico('plus', 20)}</button>
      </form>
      <div id="shop-body" style="display:flex;flex-direction:column;gap:12px"></div>
      <p class="muted shop-hint">Pela Alexa: “Alexa, peça à nossa casa para adicionar leite e pão”.</p>`;
    pintar();
    const f = el.querySelector('#shop-form');
    const inp = f.querySelector('#shop-in');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = inp.value;
      if (!v.trim()) return;
      inp.value = '';
      try { await adicionar(v); } catch (e) { alert(e.message); inp.value = v; }
      inp.focus();
    });
  },

  async acao(a, b) {
    const item = itens.find((i) => i.id === +b.dataset.id);
    if (a === 'tg' && item) {
      const comprado = !item.comprado;
      Object.assign(item, { comprado, comprado_em: comprado ? new Date().toISOString() : null });
      pintar();
      try { await db.updateCompra(item.id, { comprado, comprado_em: item.comprado_em }); } catch (e) { alert(e.message); recarregar(); }
    } else if (a === 'del-c' && item) {
      itens = itens.filter((i) => i !== item);
      pintar();
      try { await db.deleteCompra(item.id); } catch (e) { alert(e.message); recarregar(); }
    } else if (a === 'add-freq') {
      try { await adicionar(b.dataset.nome); } catch (e) { alert(e.message); }
    } else if (a === 'fechar-compra') {
      fecharForm();
    } else if (a === 'ver-fech') {
      verFechamento(b.dataset.id);
    } else if (a === 'add-foco') {
      const inp = document.getElementById('shop-in');
      if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center' }); } else C.irPara('compras/lista');
    }
  },
};
