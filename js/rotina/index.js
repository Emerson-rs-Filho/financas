// Módulo Tarefas da casa: o que se repete (limpezas, trocas, manutenções). Ao marcar como feita, a próxima data anda sozinha.
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';

let C = { render() {}, irPara() {}, user: null };
let R = [];
let F = [];
let erro = '';

const UNIDADES = { dia: ['dia', 'dias'], semana: ['semana', 'semanas'], mes: ['mês', 'meses'], ano: ['ano', 'anos'] };
const SUGESTOES = [
  ['Trocar o filtro da água', 'Cozinha', 6, 'mes'], ['Limpar o filtro do ar-condicionado', 'Casa toda', 1, 'mes'],
  ['Limpar a caixa d’água', 'Casa toda', 6, 'mes'], ['Dedetização', 'Casa toda', 6, 'mes'],
  ['Limpar a coifa e o exaustor', 'Cozinha', 1, 'mes'], ['Descongelar o freezer', 'Cozinha', 3, 'mes'],
  ['Limpar as calhas', 'Área externa', 6, 'mes'], ['Virar o colchão', 'Quarto', 3, 'mes'],
  ['Lavar as cortinas', 'Casa toda', 6, 'mes'], ['Conferir a mangueira e o registro do gás', 'Cozinha', 1, 'ano'],
  ['Limpar a máquina de lavar', 'Lavanderia', 2, 'mes'], ['Trocar a esponja da pia', 'Cozinha', 2, 'semana'],
  ['Revisão do carro', 'Carro', 1, 'ano'], ['Vacina e vermífugo do pet', 'Pet', 1, 'ano'],
];

const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deISO = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
const hoje = () => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), h.getDate()); };
const dm = (iso) => String(iso || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const dias = (r) => Math.round((deISO(r.proxima) - hoje()) / 864e5);
const freq = (r) => `a cada ${r.cada > 1 ? `${r.cada} ` : ''}${UNIDADES[r.unidade][r.cada > 1 ? 1 : 0]}`;
const eu = () => { const n = (C.user && (C.user.user_metadata?.name || (C.user.email || '').split('@')[0])) || ''; return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''; };

// Soma o intervalo da tarefa a uma data ("31/01 + 1 mês" cai no último dia de fevereiro).
export function somar(iso, cada, unidade) {
  const d = deISO(iso);
  if (unidade === 'dia') d.setDate(d.getDate() + cada);
  else if (unidade === 'semana') d.setDate(d.getDate() + 7 * cada);
  else {
    const dia = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + (unidade === 'ano' ? 12 : 1) * cada);
    d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return isoDia(d);
}

async function carregarTudo() {
  try { ({ rotinas: R, feitas: F } = await db.listRotinas()); erro = ''; } catch (e) { R = []; F = []; erro = e.message; }
}
const ultima = (r) => F.filter((f) => f.rotina_id === r.id).sort((a, b) => String(b.feito_em).localeCompare(String(a.feito_em)) || b.id - a.id)[0];

function quando(r) {
  const n = dias(r);
  if (n < -1) return `atrasada há ${-n} dias`;
  if (n === -1) return 'era para ontem';
  if (n === 0) return 'para hoje';
  if (n === 1) return 'amanhã';
  return n <= 14 ? `em ${n} dias` : `em ${dm(r.proxima)}`;
}

function linha(r) {
  const u = ultima(r);
  const atras = dias(r) < 0;
  return `<div class="li tap" data-action="edit-rt" data-id="${r.id}">
    <div class="li-main"><span class="li-t">${esc(r.titulo)}</span>
      <span class="li-s ${atras ? 'neg' : ''}">${esc([quando(r), freq(r), r.area, r.responsavel].filter(Boolean).join(' · '))}</span>
      ${u ? `<span class="li-s">última: ${dm(u.feito_em)}${u.feito_por ? ` por ${esc(u.feito_por)}` : ''}</span>` : ''}</div>
    <button class="btn lime pagar" data-action="feito-rt" data-id="${r.id}">${ico('check', 15)}feito</button>
  </div>`;
}

function pintar() {
  const body = document.getElementById('rt-body');
  if (!body) return;
  const ativas = R.filter((r) => r.ativa !== false).sort((a, b) => String(a.proxima).localeCompare(String(b.proxima)));
  const atrasadas = ativas.filter((r) => dias(r) < 0);
  const semana = ativas.filter((r) => dias(r) >= 0 && dias(r) <= 7);
  const depois = ativas.filter((r) => dias(r) > 7);
  const cnt = document.getElementById('rt-count');
  if (cnt) cnt.textContent = atrasadas.length ? `${atrasadas.length} ${atrasadas.length > 1 ? 'atrasadas' : 'atrasada'}` : semana.length ? `${semana.length} nesta semana` : 'tudo em dia';
  if (erro) { body.innerHTML = `<div class="empty">${esc(erro)}</div>`; return; }
  if (!R.length) {
    body.innerHTML = `<div class="empty">Cadastre o que se repete na casa: trocar o filtro da água, limpar o ar-condicionado, dedetizar, revisar o carro.<br>
      O app mostra o que está na hora e, quando você marca como feito, já agenda a próxima vez.<br><br>
      <button class="btn lime" data-action="sugestoes-rt">${ico('rotina', 16)}começar pelas sugestões</button></div>`;
    return;
  }
  const bloco = (titulo, l, cls = '') => (l.length ? `<section class="tile"><div class="tile-head"><h2 class="${cls}">${titulo}</h2><span class="muted num" style="font-size:12px">${l.length}</span></div>
    <div class="list">${l.map(linha).join('')}</div></section>` : '');
  const pausadas = R.filter((r) => r.ativa === false);
  body.innerHTML = `
    ${bloco('atrasadas', atrasadas, 'neg')}
    ${bloco('nos próximos 7 dias', semana)}
    ${bloco('mais para frente', depois)}
    ${ativas.length ? '' : '<div class="empty">Todas as tarefas estão pausadas.</div>'}
    ${pausadas.length ? `<details class="group"><summary><span class="nm">pausadas</span><span class="muted num" style="font-size:13px">${pausadas.length}</span></summary>
      <div class="list" style="padding:0 20px 14px">${pausadas.map((r) => `<div class="li tap" data-action="edit-rt" data-id="${r.id}"><div class="li-main"><span class="li-t">${esc(r.titulo)}</span><span class="li-s">${esc(freq(r))}</span></div></div>`).join('')}</div></details>` : ''}`;
}

async function marcarFeito(r, feitoEm = isoDia(hoje())) {
  // a próxima conta a partir do dia em que foi feita (e não da data combinada), para o intervalo valer de verdade
  await db.fazerRotina(r, { feito_em: feitoEm, feito_por: eu(), proxima: somar(feitoEm, r.cada, r.unidade) });
  await carregarTudo();
  pintar();
}

function rotinaForm(r = {}) {
  const areas = [...new Set(['Cozinha', 'Banheiro', 'Quarto', 'Sala', 'Lavanderia', 'Área externa', 'Casa toda', 'Carro', 'Pet', ...R.map((x) => x.area).filter(Boolean)])];
  const hist = r.id ? F.filter((f) => f.rotina_id === r.id).sort((a, b) => String(b.feito_em).localeCompare(String(a.feito_em)) || b.id - a.id) : [];
  modal.innerHTML = `
  <form method="dialog" id="f-rt">
    <h2 class="h2">${r.id ? 'editar tarefa' : 'nova tarefa da casa'}</h2>
    <label class="field">O que fazer<input name="titulo" required maxlength="120" value="${esc(r.titulo || '')}" placeholder="Ex.: Trocar o filtro da água"></label>
    <div class="grid2">
      <label class="field">Repete a cada<input name="cada" type="number" inputmode="numeric" min="1" max="365" required value="${r.cada ?? 1}"></label>
      <label class="field">Unidade<select name="unidade">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${k === (r.unidade || 'mes') ? 'selected' : ''}>${v[1]}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label class="field">Próxima vez<input name="proxima" type="date" required value="${r.proxima || isoDia(hoje())}"></label>
      <label class="field">Onde (opcional)<input name="area" list="dl-area" value="${esc(r.area || '')}"></label>
    </div>
    <label class="field">Quem costuma fazer (opcional)<input name="responsavel" value="${esc(r.responsavel || '')}" placeholder="Nós, Emerson, empresa…"></label>
    <label class="field">Observações<textarea name="observacao" rows="2" placeholder="Modelo do filtro, telefone da empresa…">${esc(r.observacao || '')}</textarea></label>
    ${r.id ? `<label class="check"><input type="checkbox" name="ativa" ${r.ativa !== false ? 'checked' : ''}> tarefa ativa (desmarque para pausar)</label>` : ''}
    ${hist.length ? `<div class="rt-hist"><span class="muted">Feita em:</span> ${hist.slice(0, 6).map((h) => `${dm(h.feito_em)}${h.feito_por ? ` (${esc(h.feito_por)})` : ''}`).join(' · ')}
      <button type="button" class="link" id="rt-desfazer">desfazer a última</button></div>` : ''}
    <datalist id="dl-area">${areas.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${r.id ? '<button class="pill danger" value="del" formnovalidate>Excluir</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const err = f.querySelector('#f-err');
  const desf = f.querySelector('#rt-desfazer');
  if (desf) desf.addEventListener('click', async () => {
    if (!confirm(`Desfazer a vez de ${dm(hist[0].feito_em)}? A próxima data volta a ser a de antes.`)) return;
    try { await db.desfazerRotina(hist[0]); await carregarTudo(); pintar(); rotinaForm(R.find((x) => x.id === r.id)); } catch (e) { err.textContent = e.message; }
  });
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    try {
      if (ev.submitter && ev.submitter.value === 'del') {
        if (!confirm(`Excluir "${r.titulo}" e o histórico dela?`)) return;
        await db.excluirRotina(r.id);
      } else {
        if (!f.reportValidity()) return;
        const d = Object.fromEntries(new FormData(f));
        await db.salvarRotina({ ...d, id: r.id, ativa: r.id ? f.ativa.checked : true });
      }
      modal.close();
      await carregarTudo();
      pintar();
    } catch (e) { err.textContent = e.message; }
  });
  if (!modal.open) modal.showModal();
  if (!r.id) f.titulo.focus();
}

// Lista pronta para começar: marque o que faz sentido na sua casa.
function sugestoesForm() {
  const tem = new Set(R.map((r) => r.titulo.toLowerCase()));
  const lista = SUGESTOES.filter(([t]) => !tem.has(t.toLowerCase()));
  if (!lista.length) { alert('Todas as sugestões já estão cadastradas.'); return; }
  modal.innerHTML = `
  <form method="dialog" id="f-rt-sug">
    <h2 class="h2">sugestões</h2>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5">Marque o que vale para a sua casa. A primeira vez fica para hoje; ao marcar como feita, o app agenda a seguinte. Dá para ajustar tudo depois.</p>
    <div class="rt-sug">${lista.map(([t, a, c, u], i) => `<label class="check"><input type="checkbox" name="s" value="${i}"> <span>${esc(t)} <small class="muted">a cada ${c > 1 ? `${c} ` : ''}${UNIDADES[u][c > 1 ? 1 : 0]} · ${esc(a)}</small></span></label>`).join('')}</div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Adicionar marcadas</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    const sel = [...f.querySelectorAll('input[name="s"]:checked')].map((i) => lista[+i.value]);
    if (!sel.length) { f.querySelector('#f-err').textContent = 'Marque pelo menos uma.'; return; }
    try {
      await db.salvarRotinas(sel.map(([titulo, area, cada, unidade]) => ({ titulo, area, cada, unidade, proxima: isoDia(hoje()) })));
      modal.close();
      await carregarTudo();
      pintar();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

export default {
  id: 'rotina',
  nome: 'Tarefas da casa',
  abas: [['lista', 'Tarefas', 'rotina']],
  barra: ['lista', { acao: 'nova-rt', icone: 'plus', rotulo: 'Nova tarefa' }],

  async carregar(ctx) {
    C = ctx;
    await carregarTudo();
  },

  render(aba, el, ctx) {
    C = ctx;
    el.style.maxWidth = '820px';
    el.innerHTML = `
      <div class="page-head"><h1>tarefas da casa</h1>
        <div class="actions"><span class="badge lime" id="rt-count"></span>
          <button class="btn" data-action="sugestoes-rt" title="Sugestões de tarefas">${ico('rotina', 16)}<span class="lbl">sugestões</span></button>
          <button class="btn lime" data-action="nova-rt">${ico('plus', 16)}nova</button></div></div>
      <div id="rt-body" style="display:flex;flex-direction:column;gap:12px"></div>`;
    pintar();
  },

  async acao(a, b) {
    const r = R.find((x) => x.id === +b.dataset.id);
    if (a === 'nova-rt') rotinaForm();
    else if (a === 'sugestoes-rt') sugestoesForm();
    else if (a === 'edit-rt' && r) rotinaForm(r);
    else if (a === 'feito-rt' && r) {
      b.disabled = true;
      try { await marcarFeito(r); } catch (e) { alert(e.message); b.disabled = false; }
    }
  },
};
