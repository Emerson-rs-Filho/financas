// Módulo Lista de compras: compartilhada entre o casal, atualiza em tempo real e recebe itens da Alexa.
import * as db from '../data.js';
import { esc, ico } from '../ui.js';
import { separarItens, normalizar } from './itens.js';

let C = { render() {}, irPara() {} };
let itens = [];
let cancelar = null;
let abrirComprados = false;

const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>';

async function recarregar() {
  try { itens = await db.listCompras(); } catch (e) { return; }
  pintar();
}

// Redesenha só a lista (o campo de digitação não perde o foco nem o texto).
function pintar() {
  const body = document.getElementById('shop-body');
  if (!body) return;
  const pend = itens.filter((i) => !i.comprado).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
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
  body.innerHTML = `
    <section class="tile">
      <div class="tile-head"><h2>para comprar</h2><span class="muted num" style="font-size:12px">${pend.length}</span></div>
      ${pend.length ? `<div class="shop-list">${pend.map(linha).join('')}</div>`
        : '<p class="muted" style="margin:0;font-size:13px;line-height:1.6">Nada para comprar agora. Adicione acima ou diga “Alexa, peça à nossa casa para adicionar leite”.</p>'}
    </section>
    ${feitos.length ? `<details class="group" id="shop-feitos" ${abrirComprados ? 'open' : ''}>
      <summary><span class="nm">comprados</span><span class="muted num" style="font-size:13px">${feitos.length}</span></summary>
      <div class="list" style="padding:0 20px 14px"><div class="shop-list">${feitos.map(linha).join('')}</div>
        <button class="btn" data-action="limpar" style="margin-top:10px">${ico('trash', 16)}limpar comprados</button></div>
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

export default {
  id: 'compras',
  nome: 'Lista de compras',
  abas: [['lista', 'Lista', 'compras']],
  barra: ['lista', { acao: 'add-foco', icone: 'plus', rotulo: 'Adicionar item' }],

  async carregar(ctx) {
    C = ctx;
    itens = await db.listCompras();
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
    } else if (a === 'limpar') {
      if (!confirm('Apagar todos os itens já comprados?')) return;
      await db.limparComprados();
      recarregar();
    } else if (a === 'add-foco') {
      const inp = document.getElementById('shop-in');
      if (inp) { inp.focus(); inp.scrollIntoView({ block: 'center' }); } else C.irPara('compras/lista');
    }
  },
};
