// Módulo Cardápio da semana: almoço e jantar de cada dia; os ingredientes vão para a lista de compras.
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';
import { separarItens, normalizar } from '../compras/itens.js';

let C = { render() {}, irPara() {}, esquecer() {} };
let M = [];           // refeições planejadas
let erro = '';
let semana = null;    // segunda-feira da semana mostrada (ISO)

const REF = { almoco: 'almoço', jantar: 'jantar' };
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deISO = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const mais = (iso, n) => { const d = deISO(iso); d.setDate(d.getDate() + n); return isoDia(d); };
const hojeISO = () => isoDia(new Date());
// segunda-feira da semana de uma data
export const segunda = (iso) => { const d = deISO(iso); return mais(iso, -((d.getDay() + 6) % 7)); };
const rotuloSemana = (seg) => {
  const a = deISO(seg), b = deISO(mais(seg, 6));
  return a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MESES[a.getMonth()]}` : `${a.getDate()} de ${MESES[a.getMonth()]} a ${b.getDate()} de ${MESES[b.getMonth()]}`;
};
const refeicao = (dia, r) => M.find((x) => x.dia === dia && x.refeicao === r);

async function carregarTudo() {
  try { M = await db.listCardapio(); erro = ''; } catch (e) { M = []; erro = e.message; }
}

// Pratos já usados, do mais recente para o mais antigo, com os ingredientes da última vez.
function pratosConhecidos() {
  const vistos = new Map();
  M.slice().sort((a, b) => b.dia.localeCompare(a.dia)).forEach((x) => { const k = normalizar(x.prato); if (!vistos.has(k)) vistos.set(k, x); });
  return [...vistos.values()];
}

function pintar() {
  const body = document.getElementById('cd-body');
  if (!body) return;
  if (erro) { body.innerHTML = `<div class="empty">${esc(erro)}</div>`; return; }
  const hoje = hojeISO();
  const dias = [...Array(7)].map((_, i) => mais(semana, i));
  const planejadas = dias.reduce((n, d) => n + Object.keys(REF).filter((r) => refeicao(d, r)).length, 0);
  const slot = (dia, r) => {
    const x = refeicao(dia, r);
    return `<button class="cd-slot ${x ? '' : 'vazio'}" data-action="edit-cd" data-dia="${dia}" data-ref="${r}">
      <span class="cd-ref">${REF[r]}</span>
      <span class="cd-prato">${x ? esc(x.prato) : 'adicionar'}</span>
      ${x && x.ingredientes ? `<span class="cd-ing">${esc(x.ingredientes)}</span>` : ''}
    </button>`;
  };
  body.innerHTML = `
    <div class="cd-nav">
      <button class="btn icon" data-action="sem-cd" data-n="-7" aria-label="Semana anterior">${ico('voltar', 18)}</button>
      <div class="cd-sem"><strong>${rotuloSemana(semana)}</strong><span class="muted">${semana === segunda(hoje) ? 'esta semana' : semana === mais(segunda(hoje), 7) ? 'semana que vem' : `${planejadas} ${planejadas === 1 ? 'refeição' : 'refeições'}`}</span></div>
      <button class="btn icon" data-action="sem-cd" data-n="7" aria-label="Próxima semana">${ico('avancar', 18)}</button>
    </div>
    <div class="cd-dias">${dias.map((d) => `
      <section class="tile cd-dia ${d === hoje ? 'hoje' : ''} ${d < hoje ? 'passou' : ''}">
        <div class="cd-dia-h"><h2>${DIAS[deISO(d).getDay()]}</h2><span class="muted num">${d.slice(8)}/${d.slice(5, 7)}</span>${d === hoje ? '<span class="badge lime">hoje</span>' : ''}</div>
        ${slot(d, 'almoco')}${slot(d, 'jantar')}
      </section>`).join('')}</div>
    <div class="cd-acoes">
      <button class="btn lime" data-action="lista-cd" ${planejadas ? '' : 'disabled'}>${ico('compras', 16)}mandar ingredientes para a lista</button>
      ${semana === segunda(hoje) ? '' : `<button class="btn" data-action="hoje-cd">voltar para esta semana</button>`}
    </div>`;
  const cnt = document.getElementById('cd-count');
  if (cnt) { const h = Object.keys(REF).map((r) => refeicao(hoje, r)).filter(Boolean); cnt.textContent = h.length ? `hoje: ${h.map((x) => x.prato.toLowerCase()).join(' e ')}` : 'nada planejado para hoje'; }
}

function refeicaoForm(dia, r) {
  const x = refeicao(dia, r) || {};
  const pratos = pratosConhecidos();
  modal.innerHTML = `
  <form method="dialog" id="f-cd">
    <h2 class="h2">${REF[r]} de ${DIAS[deISO(dia).getDay()]}, ${dia.slice(8)}/${dia.slice(5, 7)}</h2>
    <label class="field">Prato<input name="prato" required maxlength="120" list="dl-pratos" value="${esc(x.prato || '')}" placeholder="Ex.: Strogonoff de frango" autocomplete="off"></label>
    <label class="field">Ingredientes para comprar (opcional)<textarea name="ingredientes" rows="3" placeholder="frango, creme de leite, champignon, batata palha">${esc(x.ingredientes || '')}</textarea></label>
    <p class="muted" style="margin:0;font-size:12px;line-height:1.5">Separe por vírgula. Ao escolher um prato que vocês já fizeram, os ingredientes da última vez vêm preenchidos.</p>
    <datalist id="dl-pratos">${pratos.map((p) => `<option value="${esc(p.prato)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${x.id ? '<button class="pill danger" value="del" formnovalidate>Tirar</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.prato.addEventListener('input', () => {
    const p = pratos.find((y) => normalizar(y.prato) === normalizar(f.prato.value));
    if (p && p.ingredientes && !f.ingredientes.value.trim()) f.ingredientes.value = p.ingredientes;
  });
  f.addEventListener('submit', async (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'cancel') return;
    ev.preventDefault();
    if (v !== 'del' && !f.reportValidity()) return;
    try {
      await db.salvarCardapio({ dia, refeicao: r, prato: v === 'del' ? '' : f.prato.value, ingredientes: f.ingredientes.value });
      modal.close();
      await carregarTudo();
      pintar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
  if (!x.id) f.prato.focus();
}

// Junta os ingredientes da semana mostrada e manda os escolhidos para a lista de compras.
async function listaForm() {
  const dias = [...Array(7)].map((_, i) => mais(semana, i)).filter((d) => d >= hojeISO() || semana !== segunda(hojeISO()));
  const refs = M.filter((x) => dias.includes(x.dia) && x.ingredientes);
  if (!refs.length) { alert('Nenhuma refeição desta semana (de hoje em diante) tem ingredientes anotados. Toque numa refeição e preencha "Ingredientes para comprar".'); return; }
  let lista = [];
  try { lista = await db.listCompras(); } catch (e) { alert(e.message); return; }
  const naLista = new Map(lista.map((i) => [normalizar(i.nome), i]));
  const itens = new Map();
  refs.forEach((x) => separarItens(x.ingredientes).forEach((i) => {
    const k = normalizar(i.nome);
    const it = itens.get(k) || { ...i, pratos: [] };
    if (!it.pratos.some((p) => normalizar(p) === normalizar(x.prato))) it.pratos.push(x.prato);
    itens.set(k, it);
  }));
  const todos = [...itens.entries()].map(([k, i]) => ({ ...i, k, ja: naLista.get(k) && !naLista.get(k).comprado }));
  modal.innerHTML = `
  <form method="dialog" id="f-cd-lista">
    <h2 class="h2">ingredientes da semana</h2>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5">Desmarque o que já tem em casa. O que já está na lista de compras não é repetido.</p>
    <div class="rt-sug">${todos.map((i, n) => `<label class="check"><input type="checkbox" name="i" value="${n}" ${i.ja ? 'disabled' : 'checked'}>
      <span>${esc(i.nome)}${i.quantidade ? ` <span class="tag">${esc(i.quantidade)}</span>` : ''} <small class="muted">${i.ja ? 'já está na lista' : esc(i.pratos.join(', '))}</small></span></label>`).join('')}</div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Adicionar à lista</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    const sel = [...f.querySelectorAll('input[name="i"]:checked')].map((c) => todos[+c.value]);
    if (!sel.length) { modal.close(); return; }
    try {
      const novos = [];
      for (const i of sel) {
        const igual = naLista.get(i.k);
        if (!igual) novos.push({ nome: i.nome, quantidade: i.quantidade });
        else if (igual.comprado) await db.updateCompra(igual.id, { comprado: false, comprado_em: null, quantidade: i.quantidade || igual.quantidade });
      }
      if (novos.length) await db.addCompras(novos, 'app');
      C.esquecer('compras');
      modal.close();
      const cnt = document.getElementById('cd-count');
      if (cnt) cnt.textContent = `${sel.length} ${sel.length > 1 ? 'itens foram' : 'item foi'} para a lista`;
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

export default {
  id: 'cardapio',
  nome: 'Cardápio da semana',
  abas: [['semana', 'Semana', 'cardapio']],
  barra: ['semana', { acao: 'lista-cd', icone: 'compras', rotulo: 'Mandar ingredientes para a lista' }],

  async carregar(ctx) {
    C = ctx;
    semana = segunda(hojeISO());
    await carregarTudo();
  },

  render(aba, el, ctx) {
    C = ctx;
    if (!semana) semana = segunda(hojeISO());
    el.innerHTML = `
      <div class="page-head"><h1>cardápio da semana</h1><span class="badge lime" id="cd-count"></span></div>
      <div id="cd-body" style="display:flex;flex-direction:column;gap:12px"></div>`;
    pintar();
  },

  acao(a, b) {
    if (a === 'edit-cd') refeicaoForm(b.dataset.dia, b.dataset.ref);
    else if (a === 'sem-cd') { semana = mais(semana, +b.dataset.n); pintar(); }
    else if (a === 'hoje-cd') { semana = segunda(hojeISO()); pintar(); }
    else if (a === 'lista-cd') listaForm();
  },
};
