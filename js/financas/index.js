// Módulo Finanças: lançamentos, cartões, investimentos, calculadoras e dicas.
import * as db from '../data.js';
import { MESES, MES_CURTO, brl, kfmt, resumoAno, porCategoria, porItem, dicas, potencial, closedMonths, ehCartao, porCartao } from '../insights.js';
import { parseNubankCsv, chaveLoja } from '../importar.js';
import * as calc from '../calc.js';
import { modal, esc, css, ico, sinal, PAL } from '../ui.js';

const S = { lancs: [], invs: [], ano: new Date().getFullYear(), mes: null, charts: [],
  calc: 'meta', calcIn: {}, taxas: null, taxasErr: '', hist: null,
  contas: [], pags: [], orc: [], erroExtra: '' };
const TIPOS_INV = ['Reserva de emergência', 'Tesouro Direto', 'CDB / LCI / LCA', 'Fundos', 'Ações / FIIs', 'Previdência', 'Outros'];

// contexto do núcleo (render da estrutura, aba atual, navegação)
let C = { render() {}, aba: 'resumo', irPara() {} };
const render = () => C.render();
const route = () => C.aba;

function anosDisponiveis() {
  const set = new Set(S.lancs.map((l) => l.ano));
  set.add(new Date().getFullYear());
  return [...set].sort();
}

// ---------------- Resumo ----------------
function viewResumo(el) {
  const r = resumoAno(S.lancs, S.ano);
  if (!r.L.length) { el.innerHTML = `<div class="page-head"><h1>resumo</h1></div><div class="empty">Nenhum lançamento em ${S.ano}. Comece pela aba <a href="#lancamentos">Lançamentos</a> ou importe uma fatura.</div>`; return; }
  const cats = porCategoria(r).filter((c) => c.valor > 0);
  const ds = dicas(r);
  const periodo = r.n === 12 ? 'ano todo' : r.n ? `janeiro a ${MESES[r.n - 1].toLowerCase()}` : 'nenhum mês fechado ainda';
  const totalInv = S.invs.reduce((a, i) => a + i.valor_atual, 0);
  const meta = r.mediaSaida * 6;
  const mx = Math.max(1, ...r.E, ...r.S);
  const bars = MES_CURTO.map((m, i) => `<div class="col"><div class="pair">
      <span class="b" style="height:${(r.E[i] / mx * 100).toFixed(1)}%;background:rgba(20,20,20,${i < r.n ? 0.85 : 0.3})"></span>
      <span class="b" style="height:${(r.S[i] / mx * 100).toFixed(1)}%;background:rgba(20,20,20,${i < r.n ? 0.3 : 0.12})"></span></div><small>${m}</small></div>`).join('');
  el.innerHTML = `
  <div class="page-head"><h1>resumo</h1>
    <div class="actions"><button class="btn" data-action="importar">${ico('importar', 16)}<span class="lbl">importar fatura</span></button>
      <button class="btn lime" data-action="novo-l" data-tipo="saida">${ico('plus', 16)}novo lançamento</button></div></div>
  ${alertasHtml()}
  <section class="row2">
    <div class="lime-card" style="flex:2 1 520px">
      <div class="lime-top">
        <div><div class="label">saldo de ${S.ano} · ${periodo}</div><div class="big num">${sinal(r.saldo)}${brl(Math.abs(r.saldo))}</div></div>
        ${r.n ? `<span class="badge">${r.positivos} de ${r.n} ${r.n > 1 ? 'meses' : 'mês'} no azul</span>` : ''}
      </div>
      <div class="bars" role="img" aria-label="Entradas e saídas por mês">${bars}</div>
      <div class="lg"><span><i style="background:rgba(20,20,20,.85)"></i>entradas</span><span><i style="background:rgba(20,20,20,.3)"></i>saídas</span>${r.n < 12 ? '<span style="opacity:.7">meses claros ainda em aberto</span>' : ''}</div>
    </div>
    <div class="kpis k2">
      <div class="kpi"><span class="k">entrou</span><span class="v num">${brl(r.e)}</span></div>
      <div class="kpi"><span class="k">gasto médio/mês</span><span class="v num">${brl(r.mediaSaida)}</span></div>
      <div class="kpi"><span class="k">melhor mês</span><span class="v num pos">${r.melhor >= 0 ? `${MES_CURTO[r.melhor].toLowerCase()} ${kfmt(r.dif[r.melhor])}` : '—'}</span></div>
      <div class="kpi"><span class="k">pior mês</span><span class="v num ${r.pior >= 0 && r.dif[r.pior] < 0 ? 'neg' : ''}">${r.pior >= 0 ? `${MES_CURTO[r.pior].toLowerCase()} ${kfmt(r.dif[r.pior])}` : '—'}</span></div>
    </div>
  </section>
  <section class="cols">
    <div class="tile">
      <div class="tile-head"><h2>para onde foi</h2><span class="muted num" style="font-size:12px">${brl(r.s)}</span></div>
      ${cats.length ? barRows(cats, 0) : '<p class="muted" style="margin:0;font-size:13px">Sem gastos nos meses fechados ainda.</p>'}
    </div>
    <div class="tile">
      <div class="tile-head"><h2>onde economizar</h2>${potencial(ds) ? `<span class="pos" style="font-size:12px;font-weight:600">até ${brl(potencial(ds))}/mês</span>` : ''}</div>
      ${tipsHtml(ds.slice(0, 3))}
      ${ds.length > 3 ? `<a href="#dicas" class="pos" style="display:inline-flex;min-height:44px;align-items:center;font-weight:600;font-size:13px;text-decoration:none">ver todas as ${ds.length} dicas →</a>` : ''}
    </div>
    <a class="dcard" href="#investimentos">
      <div><div class="nm">investimentos</div><div class="sub">reserva de emergência · meta de 6 meses de gastos</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <span class="val num">${brl(totalInv)}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="cx">meta ${brl(meta)}</span>${meta ? `<span class="cx">${Math.round(totalInv / meta * 100)}% do caminho</span>` : ''}</div>
      </div>
    </a>
  </section>`;
}

// Barras horizontais: a primeira em destaque.
function barRows(items, dec = 0) {
  const top = Math.max(...items.map((c) => c.valor));
  return items.map((c, i) => `
    <div class="bar-row"><div class="top"><span>${esc(c.nome)}</span><span class="num"><span class="muted">${Math.round(c.pct * 100)}% · </span>${brl(c.valor, dec)}</span></div>
    <div class="track"><div class="${i === 0 ? 'hi' : ''}" style="width:${Math.max(2, c.valor / top * 100)}%"></div></div></div>`).join('');
}

function tipsHtml(ds) {
  if (!ds.length) return '<p class="muted" style="margin:0;font-size:13px">Ainda não há dados suficientes para sugerir economias.</p>';
  return ds.map((d, i) => `
    <article class="tip"><div class="n">${i + 1}</div>
      <div style="flex:1;min-width:0"><h3>${esc(d.titulo)}</h3><p>${esc(d.texto)}</p></div>
      <div class="save">${esc(d.rotulo)}</div></article>`).join('');
}

// ---------------- Lançamentos ----------------
function viewLancamentos(el) {
  const r = resumoAno(S.lancs, S.ano);
  if (S.mes == null) S.mes = Math.max(0, Math.min(11, (r.n || 1) - 1));
  const m = S.mes;
  const doMes = r.L.filter((l) => l.mes === m + 1);
  const ent = doMes.filter((l) => l.tipo === 'entrada').sort((a, b) => b.valor - a.valor);
  const sai = doMes.filter((l) => l.tipo === 'saida');
  const saiFixas = sai.filter((l) => !ehCartao(l)).sort((a, b) => b.valor - a.valor);
  const saiCart = sai.filter(ehCartao).sort((a, b) => b.valor - a.valor);
  const totalFixas = saiFixas.reduce((a, l) => a + l.valor, 0);
  const totalCart = saiCart.reduce((a, l) => a + l.valor, 0);
  const itens = porItem(r);
  const media = new Map(itens.map((it) => [it.nome, it.mediaAtivos]));
  const dataCurta = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
  const acoes = (l) => `<div class="li-act"><button data-action="edit-l" data-id="${l.id}" aria-label="Editar ${esc(l.descricao)}">${ico('edit', 17)}</button><button data-action="del-l" data-id="${l.id}" aria-label="Excluir ${esc(l.descricao)}">${ico('trash', 17)}</button></div>`;
  const vsMedia = (l) => {
    const md = media.get(l.descricao) || 0, p = md ? (l.valor / md - 1) * 100 : 0;
    if (!md) return '';
    return `<small style="${p >= 30 ? 'color:var(--out)' : ''}">${Math.abs(p) < 3 ? '= média' : `${p > 0 ? '+' : '−'}${Math.round(Math.abs(p))}% vs média`}</small>`;
  };
  const lista = (rows, tipo) => rows.length ? `<div class="list">${rows.map((l) => `
      <div class="li tap" data-action="edit-l" data-id="${l.id}"><div class="li-main"><span class="li-t">${esc(l.descricao)}</span><span class="li-s">${esc(l.categoria)}</span></div>
        <div class="li-v num"><span class="${tipo === 'entrada' ? 'pos' : ''}">${brl(l.valor, 2)}</span>${tipo === 'saida' ? vsMedia(l) : ''}</div>${acoes(l)}</div>`).join('')}</div>`
    : '<p class="muted" style="margin:0;font-size:13px">Nada lançado ainda.</p>';
  // Compras importadas: um bloco recolhível por cartão.
  const compras = (ls) => `<div class="list">${ls.map((l) => `
      <div class="li tap" data-action="edit-l" data-id="${l.id}"><span class="li-ic num">${dataCurta(l.data_compra)}</span>
        <div class="li-main"><span class="li-t">${esc(l.descricao)}</span><span class="li-s">${esc(l.categoria)}</span></div>
        <div class="li-v num"><span class="${l.valor < 0 ? 'pos' : ''}">${brl(l.valor, 2)}</span></div>${acoes(l)}</div>`).join('')}</div>`;
  const grupos = new Map();
  saiCart.filter((l) => l.cartao).forEach((l) => { if (!grupos.has(l.cartao)) grupos.set(l.cartao, []); grupos.get(l.cartao).push(l); });
  const antigos = saiCart.filter((l) => !l.cartao);
  const gruposHtml = [...grupos].map(([nome, ls]) => {
    ls.sort((a, b) => String(b.data_compra).localeCompare(String(a.data_compra)) || b.valor - a.valor);
    const tot = ls.reduce((a, l) => a + l.valor, 0);
    const cats = [...ls.reduce((mp, l) => mp.set(l.categoria, (mp.get(l.categoria) || 0) + l.valor), new Map())].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `<details class="group"><summary>
        <span style="min-width:0"><span class="nm">${esc(nome)}</span><span class="sum-sub">${ls.length} ${ls.length > 1 ? 'lançamentos' : 'lançamento'}${cats.length ? ' · ' + cats.map(([c, v]) => `${esc(c.toLowerCase())} ${brl(v)}`).join(', ') : ''}</span></span>
        <span class="num" style="font-weight:600;font-size:16px;white-space:nowrap">${brl(tot, 2)}</span></summary>${compras(ls)}</details>`;
  }).join('');
  const sobra = r.dif[m];
  const seg = [[totalFixas, 'rgba(20,20,20,.85)', 'fixas'], [totalCart, 'rgba(20,20,20,.45)', 'cartões'], [Math.max(0, sobra), 'rgba(20,20,20,.14)', 'sobrou']].filter(([v]) => v > 0);

  el.innerHTML = `
  <div class="page-head"><h1>lançamentos</h1>
    <div class="actions">
      <button class="btn" data-action="copiar-mes" aria-label="Copiar fixos do mês anterior" title="Copiar fixos do mês anterior">${ico('copiar', 16)}<span class="lbl">copiar fixos</span></button>
      <button class="btn" data-action="importar" aria-label="Importar fatura" title="Importar fatura">${ico('importar', 16)}<span class="lbl">importar fatura</span></button>
      <button class="btn lime" data-action="novo-l" data-tipo="saida">${ico('plus', 16)}novo</button>
    </div></div>
  <div class="months" role="group" aria-label="Mês">${MES_CURTO.map((nm, i) => `<button class="chip" data-action="mes" data-mes="${i}" aria-pressed="${i === m}"><span style="font-weight:600;font-size:13px">${nm}</span><small class="num ${r.dif[i] < 0 ? 'neg' : 'muted'}">${r.E[i] || r.S[i] ? kfmt(r.dif[i]) : '—'}</small></button>`).join('')}</div>
  <section class="row2">
    <div class="lime-card" style="flex:2 1 420px">
      <div class="lime-top">
        <div><div class="label">sobrou em ${MESES[m].toLowerCase()}${m >= r.n ? ' (previsto)' : ''}</div><div class="big num">${sinal(sobra)}${brl(Math.abs(sobra), 2)}</div></div>
        ${r.E[m] ? `<span class="badge">${Math.round(r.S[m] / r.E[m] * 100)}% do que entrou foi gasto</span>` : ''}
      </div>
      ${seg.length ? `<div class="seg">${seg.map(([v, c]) => `<span style="flex:${v};background:${c}"></span>`).join('')}</div>
      <div class="lg">${seg.map(([v, c, n]) => `<span><i style="background:${c}"></i>${n} ${brl(v)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="kpis k2">
      <div class="kpi"><span class="k">entradas</span><span class="v num pos">${brl(r.E[m])}</span></div>
      <div class="kpi"><span class="k">fixas</span><span class="v num">${brl(totalFixas)}</span></div>
      <div class="kpi"><span class="k">cartões</span><span class="v num">${brl(totalCart)}</span></div>
      <div class="kpi"><span class="k">total de saídas</span><span class="v num">${brl(r.S[m])}</span></div>
    </div>
  </section>
  <section class="cols" style="align-items:flex-start">
    <div style="display:flex;flex-direction:column;gap:12px">
      ${gruposHtml}
      ${antigos.length ? `<div class="tile"><div class="tile-head"><h2>faturas de cartão</h2><span class="num">${brl(antigos.reduce((a, l) => a + l.valor, 0), 2)}</span></div>${lista(antigos, 'saida')}</div>` : ''}
      ${!saiCart.length ? `<button class="dashed" data-action="importar" style="min-height:120px">${ico('importar', 22)}importar a fatura do cartão</button>` : ''}
      <div class="tile"><div class="tile-head"><h2>despesas fixas</h2><span class="num">${brl(totalFixas, 2)}</span></div>${lista(saiFixas, 'saida')}</div>
    </div>
    <div class="tile"><div class="tile-head"><h2>entradas</h2><span class="num pos">${brl(r.E[m], 2)}</span></div>${lista(ent, 'entrada')}</div>
  </section>`;
}

function lancForm(l) {
  const cats = [...new Set(S.lancs.map((x) => x.categoria))].sort();
  const descs = [...new Set(S.lancs.map((x) => x.descricao))].sort();
  modal.innerHTML = `
  <form method="dialog" id="f-l">
    <h2 class="h2" style="font-size:24px">${l.id ? 'Editar' : 'Novo'} lançamento</h2>
    <input type="hidden" name="id" value="${l.id || ''}">
    <input type="hidden" name="cartao" value="${esc(l.cartao || '')}">
    <input type="hidden" name="data_compra" value="${esc(l.data_compra || '')}">
    ${l.cartao ? `<p class="muted" style="margin:0;font-size:13px">Compra no cartão ${esc(l.cartao)}${l.data_compra ? ` em ${l.data_compra.split('-').reverse().join('/')}` : ''}.</p>` : ''}
    <div class="grid2">
      <label class="field">Tipo<select name="tipo"><option value="saida" ${l.tipo === 'saida' ? 'selected' : ''}>Saída</option><option value="entrada" ${l.tipo === 'entrada' ? 'selected' : ''}>Entrada</option></select></label>
      <label class="field">Valor (R$)<input name="valor" type="number" step="0.01" ${l.cartao ? '' : 'min="0.01"'} required value="${l.valor ?? ''}"></label>
    </div>
    <label class="field">Descrição<input name="descricao" list="dl-desc" required value="${esc(l.descricao || '')}"></label>
    <label class="field">Categoria<input name="categoria" list="dl-cat" required value="${esc(l.categoria || '')}"></label>
    <div class="grid2">
      <label class="field">Mês<select name="mes">${MESES.map((nm, i) => `<option value="${i + 1}" ${l.mes === i + 1 ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <label class="field">Ano<input name="ano" type="number" required value="${l.ano}"></label>
    </div>
    <datalist id="dl-cat">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="dl-desc">${descs.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${l.id ? '<button class="pill danger" value="del" formnovalidate>Excluir</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.descricao.addEventListener('change', () => {
    const prev = S.lancs.find((x) => x.descricao === f.descricao.value);
    if (prev && !f.categoria.value) { f.categoria.value = prev.categoria; f.tipo.value = prev.tipo; }
  });
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (ev.submitter && ev.submitter.value === 'del') {
      if (!confirm(`Excluir "${l.descricao}" de ${MESES[l.mes - 1]}?`)) return;
      await db.deleteLancamento(l.id); modal.close(); S.lancs = await db.listLancamentos(); render();
      return;
    }
    if (!f.reportValidity()) return;
    try {
      await db.saveLancamento(Object.fromEntries(new FormData(f)));
      modal.close();
      S.lancs = await db.listLancamentos();
      render();
    } catch (e) { modal.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

async function copiarMesAnterior() {
  const m = S.mes + 1;
  const [pa, pm] = m === 1 ? [S.ano - 1, 12] : [S.ano, m - 1];
  const prev = S.lancs.filter((l) => l.ano === pa && l.mes === pm && l.tipo === 'saida' && !l.cartao && !/cart|outr/i.test(l.categoria));
  const ja = new Set(S.lancs.filter((l) => l.ano === S.ano && l.mes === m).map((l) => l.descricao));
  // o que já é conta a pagar entra sozinho quando for pago; não copia para não contar em dobro
  const contas = new Set(S.contas.filter((k) => k.ativa !== false && k.recorrente).map((k) => norm(k.descricao)));
  const novos = prev.filter((l) => !ja.has(l.descricao) && !contas.has(norm(l.descricao)));
  if (!novos.length) return alert(contas.size ? 'Nada para copiar: os fixos já estão neste mês ou são contas a pagar (veja a aba Contas).' : 'Nada para copiar: os fixos do mês anterior já estão neste mês.');
  if (!confirm(`Copiar ${novos.length} contas fixas de ${MESES[pm - 1]} para ${MESES[m - 1]}? Depois é só ajustar os valores.`)) return;
  for (const l of novos) await db.saveLancamento({ ...l, id: null, ano: S.ano, mes: m });
  S.lancs = await db.listLancamentos();
  render();
}

// ---------------- Importar fatura (CSV do Nubank) ----------------
function escolherFatura() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.csv,text/csv';
  inp.addEventListener('change', async () => {
    const file = inp.files[0];
    if (!file) return;
    // categoria mais recente usada para cada loja em compras de cartão já salvas
    const hist = new Map();
    S.lancs.filter((l) => l.cartao).sort((a, b) => a.id - b.id).forEach((l) => hist.set(chaveLoja(l.descricao), l.categoria));
    try { importForm(parseNubankCsv(await file.text(), file.name, hist), file.name); } catch (e) { alert(e.message); }
  });
  inp.click();
}

function importForm(p, fileName) {
  const ja = new Set(S.lancs.map((l) => l.import_key).filter(Boolean));
  const cats = [...new Set([...S.lancs.map((x) => x.categoria), ...p.linhas.map((l) => l.categoria)])].sort();
  const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  modal.classList.add('wide');
  modal.innerHTML = `
  <form method="dialog" id="f-imp">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div style="min-width:0"><h2 class="h2">importar fatura</h2><div class="muted" style="font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(fileName)}</div></div>
      <button class="btn icon" value="cancel" formnovalidate aria-label="Fechar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
    </div>
    <div class="grid3">
      <label class="field">Cartão<input name="cartao" required value="Nubank"></label>
      <label class="field">Lançar em<select name="mes">${MESES.map((nm, i) => `<option value="${i + 1}" ${p.mes === i + 1 ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <label class="field">Ano<input name="ano" type="number" inputmode="numeric" required value="${p.ano}"></label>
    </div>
    <div class="imp-sum"><span class="on" id="imp-n"></span>${p.linhas.some((l) => ja.has(l.import_key)) ? `<span>${p.linhas.filter((l) => ja.has(l.import_key)).length} já importadas</span>` : ''}${p.ignoradas.length ? `<span class="muted">${p.ignoradas.length} pagamento ignorado</span>` : ''}</div>
    <label class="imp-all"><input type="checkbox" id="imp-all" checked> selecionar todos · confira as categorias; as que você corrigir serão lembradas</label>
    <div class="imp-box">${p.linhas.map((l, i) => {
      const dup = ja.has(l.import_key);
      return `<div class="imp-row ${dup ? 'off' : ''}"><input type="checkbox" name="inc" value="${i}" ${dup ? '' : 'checked'} aria-label="Incluir ${esc(l.titulo)}">
        <div class="li-main"><span class="li-t">${esc(l.titulo)}</span>
          <span class="meta"><input type="text" name="cat${i}" list="dl-cat-imp" value="${esc(l.categoria)}" aria-label="Categoria de ${esc(l.titulo)}"><span class="li-s num">${dataCurta(l.data)}</span>${dup ? '<span class="tag">já importada</span>' : ''}</span></div>
        <span class="li-v num"><span class="${l.valor < 0 ? 'pos' : ''}">${brl(l.valor, 2)}</span></span></div>`;
    }).join('')}</div>
    <label class="check" id="imp-old-wrap" hidden><input type="checkbox" name="rmold" checked><span id="imp-old"></span></label>
    <datalist id="dl-cat-imp">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="imp-total"><div><div class="muted">total selecionado</div><strong class="num" id="imp-tot"></strong></div>
      <button class="btn lime" value="ok" id="imp-ok" style="min-height:52px;padding:0 24px;font-size:15px">Importar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const incs = [...f.querySelectorAll('input[name="inc"]')];
  const totaisAntigos = () => {
    const nome = f.cartao.value.trim().toLowerCase();
    return S.lancs.filter((l) => l.ano === +f.ano.value && l.mes === +f.mes.value && l.tipo === 'saida' && !l.cartao && ehCartao(l)
      && nome && l.descricao.toLowerCase().includes(nome));
  };
  const atualizar = () => {
    const sel = incs.filter((c) => c.checked);
    incs.forEach((c) => c.closest('.imp-row').classList.toggle('off', !c.checked));
    f.querySelector('#imp-all').checked = sel.length === incs.length;
    f.querySelector('#imp-n').textContent = `${sel.length} de ${incs.length} selecionadas`;
    f.querySelector('#imp-tot').textContent = brl(sel.reduce((a, c) => a + p.linhas[+c.value].valor, 0), 2);
    f.querySelector('#imp-ok').textContent = sel.length ? `importar ${sel.length}` : 'importar';
    const old = totaisAntigos();
    f.querySelector('#imp-old-wrap').hidden = !old.length;
    if (old.length) f.querySelector('#imp-old').textContent = `Remover ${old.map((l) => `“${l.descricao}” (${brl(l.valor, 2)})`).join(', ')} já lançado em ${MESES[+f.mes.value - 1]}, para não contar a fatura em dobro`;
  };
  f.querySelector('#imp-all').addEventListener('change', (ev) => { incs.forEach((c) => { c.checked = ev.target.checked; }); atualizar(); });
  f.addEventListener('change', atualizar);
  f.addEventListener('input', (ev) => { if (ev.target.name === 'cartao' || ev.target.name === 'ano') atualizar(); });
  atualizar();

  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const err = f.querySelector('#f-err');
    const ano = +f.ano.value, mes = +f.mes.value, cartao = f.cartao.value.trim();
    const rows = incs.filter((c) => c.checked).map((c) => {
      const l = p.linhas[+c.value];
      return { ano, mes, tipo: 'saida', descricao: l.titulo, categoria: f.elements[`cat${c.value}`].value.trim() || 'Outros (cartão)',
        valor: l.valor, cartao, data_compra: l.data, import_key: l.import_key };
    });
    if (!rows.length) { err.textContent = 'Selecione ao menos um lançamento.'; return; }
    const ok = f.querySelector('#imp-ok');
    ok.disabled = true; ok.textContent = 'importando…';
    try {
      await db.importLancamentos(rows);
      if (f.rmold.checked && !f.querySelector('#imp-old-wrap').hidden) for (const l of totaisAntigos()) await db.deleteLancamento(l.id);
      modal.close();
      S.lancs = await db.listLancamentos();
      S.ano = ano; S.mes = mes - 1;
      C.irPara('financas/lancamentos');
    } catch (e) { err.textContent = e.message; ok.disabled = false; atualizar(); }
  });
  modal.showModal();
}

// ---------------- Cartões ----------------
function viewCartoes(el) {
  const r = resumoAno(S.lancs, S.ano);
  // Sem mês fechado com fatura (ex.: só a fatura em aberto importada), considera o ano todo.
  let ate = r.n, cartoes = porCartao(r);
  if (cartoes.length && !cartoes.some((c) => c.total > 0)) { ate = Math.max(...cartoes.map((c) => c.meses.findLastIndex((v) => v) + 1)); cartoes = porCartao(r, ate); }
  cartoes.sort((a, b) => b.total - a.total);
  const head = `<div class="page-head"><h1>cartões</h1><button class="btn lime" data-action="importar">${ico('importar', 16)}importar fatura</button></div>`;
  if (!cartoes.length) { el.innerHTML = `${head}<div class="empty">Nenhum lançamento de cartão em ${S.ano}.<br>Exporte a fatura do Nubank em CSV e use <strong>importar fatura</strong>.</div>`; return; }
  const totalCart = cartoes.reduce((a, c) => a + c.total, 0);
  // fatura por mês (todos os cartões) e o mês mais recente com compras
  const mensal = Array(12).fill(0);
  r.L.filter((l) => l.tipo === 'saida' && ehCartao(l)).forEach((l) => { mensal[l.mes - 1] += l.valor; });
  const ult = mensal.findLastIndex((v) => v > 0);
  const anteriores = mensal.slice(0, Math.max(0, ult)).filter((v) => v > 0);
  const mediaMes = anteriores.length ? anteriores.reduce((a, v) => a + v, 0) / anteriores.length : 0;
  const mx = Math.max(1, ...mensal);
  // categorias das compras importadas no mês mais recente
  const catMap = new Map();
  r.L.filter((l) => l.tipo === 'saida' && l.cartao && l.mes === ult + 1).forEach((l) => catMap.set(l.categoria, (catMap.get(l.categoria) || 0) + l.valor));
  const catMes = [...catMap].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const estornos = [...catMap].filter(([, v]) => v < 0).reduce((a, [, v]) => a + v, 0);
  const totMes = catMes.reduce((a, [, v]) => a + v, 0);

  el.innerHTML = `${head}
  <div class="hscroll">
    ${cartoes.map((c) => {
      const v = ult >= 0 ? c.meses[ult] : 0;
      const ants = c.meses.slice(0, Math.max(0, ult)).filter((x) => x > 0);
      const md = ants.length ? ants.reduce((a, x) => a + x, 0) / ants.length : 0;
      const p = md ? Math.round((v / md - 1) * 100) : null;
      return `<div class="dcard">
        <div><div class="nm">${esc(c.nome)}</div><div class="sub">fatura de ${ult >= 0 ? MESES[ult].toLowerCase() : '—'}</div></div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;flex-wrap:wrap">
          <div><div class="sub">${ult >= r.n ? 'até agora' : 'total'}</div><div class="val num">${brl(v, 2)}</div></div>
          ${p != null ? `<span class="cx">${p >= 0 ? '+' : '−'}${Math.abs(p)}% vs média</span>` : ''}
        </div></div>`;
    }).join('')}
    <button class="dashed" data-action="importar">${ico('plus', 22)}importar outra fatura</button>
  </div>
  <section class="cols" style="align-items:flex-start">
    <div class="tile">
      <div class="tile-head"><h2>faturas por mês</h2>${mediaMes ? `<span class="muted num" style="font-size:12px">média ${brl(mediaMes)}</span>` : ''}</div>
      <div class="bars" style="height:120px" role="img" aria-label="Valor das faturas por mês">${MES_CURTO.map((m, i) => `<div class="col"><div class="pair">
        <span class="b" style="height:${(mensal[i] / mx * 100).toFixed(1)}%;background:${i === ult ? 'var(--lime)' : 'var(--bar)'}" title="${m}: ${brl(mensal[i])}"></span></div><small class="muted">${m}</small></div>`).join('')}</div>
    </div>
    <div class="tile">
      <div class="tile-head"><h2>por cartão</h2><span class="muted num" style="font-size:12px">${brl(totalCart)} no ano</span></div>
      <div class="list">${cartoes.map((c, i) => { const maior = Math.max(...c.meses.slice(0, ate || 12)); return `
        <div class="li"><span class="li-ic"><i style="background:${PAL[i % PAL.length]}"></i></span>
          <div class="li-main"><span class="li-t">${esc(c.nome)}</span><span class="li-s">média ${brl(c.mediaAtivos)}/mês · maior ${brl(maior)} (${MES_CURTO[c.meses.indexOf(maior)].toLowerCase()})</span></div>
          <div class="li-v num">${brl(c.total)}<small>${totalCart ? Math.round(c.total / totalCart * 100) : 0}%</small></div></div>`; }).join('')}</div>
      ${ate > r.n ? '<p class="muted" style="font-size:12px;margin:8px 0 0">Inclui faturas ainda em aberto.</p>' : ''}
    </div>
  </section>
  <section style="display:flex;flex-direction:column;gap:10px">
    <div class="section-head"><h2 class="h2" style="font-size:17px">no cartão, por categoria</h2><span class="muted" style="font-size:12px">${ult >= 0 ? MESES[ult].toLowerCase() : ''}</span></div>
    ${catMes.length ? `<div class="cat-grid">${catMes.map(([nome, v], i) => `
      <div class="cat ${i === 0 ? 'top' : ''}"><span class="k">${esc(nome)} · ${Math.round(v / totMes * 100)}%</span><span class="v num">${brl(v)}</span></div>`).join('')}</div>
      ${estornos < 0 ? `<p class="muted" style="font-size:12px;margin:0">Estornos e créditos no mês: ${brl(-estornos, 2)}.</p>` : ''}`
    : '<div class="empty">Importe a fatura em CSV para ver as compras por categoria (mercado, combustível, farmácia…) em vez de só o total.</div>'}
  </section>`;
}

// ---------------- Investimentos ----------------
function viewInvestimentos(el) {
  const r = resumoAno(S.lancs, S.ano);
  const apl = S.invs.reduce((a, i) => a + i.valor_aplicado, 0);
  const atual = S.invs.reduce((a, i) => a + i.valor_atual, 0);
  const meta = r.mediaSaida * 6;
  const pct = meta ? Math.min(100, atual / meta * 100) : 0;
  const ganho = atual - apl;
  const falta = Math.max(0, meta - atual);
  const tipos = [...S.invs.reduce((mp, i) => mp.set(i.tipo, (mp.get(i.tipo) || 0) + i.valor_atual), new Map())].sort((a, b) => b[1] - a[1]);
  const corTipo = new Map(tipos.map(([t], i) => [t, PAL[i % PAL.length]]));
  el.innerHTML = `
  <div class="page-head"><h1>investimentos</h1><button class="btn lime" data-action="novo-i">${ico('plus', 16)}novo investimento</button></div>
  <section class="row2">
    <div class="tile" style="flex:1 1 300px;display:flex;flex-direction:column;gap:8px">
      <span class="eyebrow">patrimônio hoje</span>
      <span class="big num">${brl(atual)}</span>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">
        ${apl ? `<span class="badge lime">${sinal(ganho)}${brl(Math.abs(ganho))} · ${(ganho / apl * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>` : ''}
        <span class="muted" style="font-size:12px">sobre ${brl(apl)} aplicados</span>
      </div>
    </div>
    <div class="lime-card" style="flex:1 1 300px;flex-direction:row;align-items:center;gap:18px">
      <span class="ring" style="background:conic-gradient(var(--on-lime) 0 ${pct}%, rgba(20,20,20,.15) ${pct}% 100%)"><span><b class="num">${Math.round(pct)}%</b><small>da meta</small></span></span>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <span style="font-size:15px;font-weight:600">reserva de emergência</span>
        <span style="font-size:12.5px;line-height:1.5">Meta de <strong>${brl(meta)}</strong>, seis meses do gasto médio de ${S.ano}.
        ${falta ? `Guardando <strong>${brl(falta / 24)}/mês</strong>, vocês completam em dois anos.` : 'Meta atingida!'}</span>
      </div>
    </div>
  </section>
  ${S.invs.length ? `
  <section class="cols" style="align-items:flex-start">
    <div class="tile" style="flex:2 1 420px">
      <div class="tile-head"><h2>aplicações</h2><span class="muted num" style="font-size:12px">${S.invs.length}</span></div>
      <div class="list">${S.invs.map((i) => { const g = i.valor_atual - i.valor_aplicado; return `
        <div class="li tap" data-action="edit-i" data-id="${i.id}"><span class="li-ic dot"><i style="background:${corTipo.get(i.tipo)}"></i></span>
          <div class="li-main"><span class="li-t">${esc(i.nome)}</span><span class="li-s">${esc(i.tipo)}${i.instituicao ? ' · ' + esc(i.instituicao) : ''}${i.data_aplicacao ? ' · desde ' + new Date(i.data_aplicacao + 'T12:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) : ''}</span></div>
          <div class="li-v num">${brl(i.valor_atual, 2)}<small class="${g >= 0 ? 'pos' : 'neg'}">${sinal(g)}${brl(Math.abs(g), 2)}</small></div>
          <div class="li-act"><button data-action="edit-i" data-id="${i.id}" aria-label="Editar ${esc(i.nome)}">${ico('edit', 17)}</button><button data-action="del-i" data-id="${i.id}" aria-label="Excluir ${esc(i.nome)}">${ico('trash', 17)}</button></div></div>`; }).join('')}</div>
    </div>
    <div class="tile" style="flex:1 1 280px;display:flex;flex-direction:column;gap:14px">
      <div class="tile-head" style="margin:0"><h2>por tipo</h2></div>
      <div class="seg">${tipos.map(([t, v]) => `<span style="flex:${v};background:${corTipo.get(t)}"></span>`).join('')}</div>
      <div class="lg" style="flex-direction:column;gap:8px">${tipos.map(([t, v]) => `<span style="display:flex;justify-content:space-between;gap:8px"><span><i style="background:${corTipo.get(t)}"></i>${esc(t)}</span><span class="num"><span class="muted">${atual ? Math.round(v / atual * 100) : 0}% · </span>${brl(v)}</span></span>`).join('')}</div>
    </div>
  </section>` : '<div class="empty">Nenhum investimento cadastrado ainda. Toque em <strong>novo investimento</strong> para registrar o primeiro aporte.</div>'}`;
}

function invForm(i) {
  modal.innerHTML = `
  <form method="dialog">
    <h2 class="h2" style="font-size:24px">${i.id ? 'Editar' : 'Novo'} investimento</h2>
    <input type="hidden" name="id" value="${i.id || ''}">
    <label class="field">Nome<input name="nome" required value="${esc(i.nome || '')}" placeholder="Ex.: Tesouro Selic 2029"></label>
    <div class="grid2">
      <label class="field">Tipo<select name="tipo">${TIPOS_INV.map((t) => `<option ${t === i.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">Instituição<input name="instituicao" value="${esc(i.instituicao || '')}" placeholder="Ex.: Nubank, XP"></label>
    </div>
    <div class="grid2">
      <label class="field">Valor aplicado (R$)<input name="valor_aplicado" type="number" step="0.01" min="0" required value="${i.valor_aplicado ?? ''}"></label>
      <label class="field">Valor atual (R$)<input name="valor_atual" type="number" step="0.01" min="0" value="${i.valor_atual ?? ''}" placeholder="igual ao aplicado"></label>
    </div>
    <label class="field">Data da aplicação<input name="data_aplicacao" type="date" value="${i.data_aplicacao || ''}"></label>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${i.id ? '<button class="pill danger" value="del" formnovalidate>Excluir</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (ev.submitter && ev.submitter.value === 'del') {
      if (!confirm(`Excluir "${i.nome}"?`)) return;
      await db.deleteInvestimento(i.id); modal.close(); S.invs = await db.listInvestimentos(); render();
      return;
    }
    if (!f.reportValidity()) return;
    try {
      await db.saveInvestimento(Object.fromEntries(new FormData(f)));
      modal.close();
      S.invs = await db.listInvestimentos();
      render();
    } catch (e) { modal.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

// ---------------- Calculadoras ----------------
const CALCS = [['meta', 'Meta', 'quanto guardar'], ['projecao', 'Projeção', 'juros compostos'], ['historico', 'Histórico', 'ativo real'], ['rendafixa', 'Renda fixa', 'CDB × LCI × Tesouro']];
const TICKERS = [['PETR4.SA', 'Petrobras'], ['VALE3.SA', 'Vale'], ['ITUB4.SA', 'Itaú'], ['BBAS3.SA', 'Banco do Brasil'], ['WEGE3.SA', 'WEG'],
  ['BOVA11.SA', 'ETF Ibovespa'], ['IVVB11.SA', 'ETF S&P 500 em reais'], ['HGLG11.SA', 'FII HGLG11'], ['MXRF11.SA', 'FII MXRF11'],
  ['^BVSP', 'Índice Ibovespa'], ['BTC-BRL', 'Bitcoin em reais'], ['USDBRL=X', 'Dólar'], ['AAPL', 'Apple (em US$)']];
let calcChart = null;

const pctBr = (v, d = 2) => (v * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const cdiAtual = () => (S.taxas ? S.taxas.cdi.valor : 10);
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fld = (label, name, value, extra = '') => `<label class="field">${label}<input name="${name}" type="number" inputmode="decimal" step="any" value="${esc(value)}" ${extra}></label>`;
const kpi = (rot, val, cor) => `<div class="kpi"><div class="muted" style="font-size:13px">${rot}</div><div class="v num"${cor ? ` style="color:${cor}"` : ''}>${val}</div></div>`;

function calcDefaults(id) {
  const cdi = cdiAtual();
  return {
    meta: { meta: 100000, inicial: 0, anos: 5, taxa: cdi, corrigir: '' },
    projecao: { inicial: 1000, aporte: 500, anos: 10, taxa: cdi },
    historico: { ticker: 'BOVA11.SA', inicio: '2020-01', aporte: 500, inicial: 0 },
    rendafixa: { valor: 10000, dias: 730, cdi, pctCdb: 110, pctLci: 92, selic: S.taxas ? S.taxas.selic.valor : cdi + 0.1 },
  }[id];
}

function setCalcChart(canvas, cfg) {
  if (calcChart && S.charts.includes(calcChart)) { calcChart.destroy(); S.charts = S.charts.filter((c) => c !== calcChart); }
  calcChart = canvas ? new Chart(canvas, cfg) : null;
  if (calcChart) S.charts.push(calcChart);
}

function carregarTaxas() {
  if (S.taxas || S.taxasErr || S.taxasLoading) return;
  S.taxasLoading = true;
  db.cotacoes({ tipo: 'taxas' })
    .then((t) => { S.taxas = t; })
    .catch((e) => { S.taxasErr = e.message; })
    .finally(() => { S.taxasLoading = false; if (route() === 'calculadoras') render(); });
}

function viewCalculadoras(el) {
  carregarTaxas();
  const t = S.taxas;
  const fonte = t
    ? `CDI <strong>${t.cdi.valor.toLocaleString('pt-BR')}% a.a.</strong> · Selic <strong>${t.selic.valor.toLocaleString('pt-BR')}%</strong> · IPCA 12m <strong>${t.ipca.valor.toLocaleString('pt-BR')}%</strong>
       <span class="muted">${t.exemplo ? '(valores de exemplo, modo demonstração)' : `(Banco Central, ${new Date(t.cdi.data + 'T12:00').toLocaleDateString('pt-BR')})`}</span>`
    : S.taxasErr ? `<span class="muted">Taxas do Banco Central indisponíveis: ${esc(S.taxasErr)} Usando 10% a.a. como padrão.</span>` : '<span class="muted">Buscando CDI, Selic e IPCA…</span>';
  el.innerHTML = `
  <div class="page-head"><h1>calculadoras</h1></div>
  <p style="margin:-4px 0 0;font-size:13px;line-height:1.6">${fonte}</p>
  <div class="chips" role="group" aria-label="Calculadora" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
    ${CALCS.map(([id, nome, sub]) => `<button class="chip" data-action="calc" data-calc="${id}" aria-pressed="${id === S.calc}"><span style="font-weight:600;font-size:14px">${nome}</span><small class="muted">${sub}</small></button>`).join('')}
  </div>
  <section class="cols" style="align-items:flex-start">
    <form class="card calc-form" id="calc-form" novalidate style="flex:1 1 300px"></form>
    <div id="calc-out" style="flex:2 1 480px;min-width:0;display:flex;flex-direction:column;gap:12px"></div>
  </section>`;

  const id = S.calc;
  const v = { ...calcDefaults(id), ...S.calcIn[id] };
  const f = document.getElementById('calc-form');
  const out = document.getElementById('calc-out');
  const taxaFld = (label = 'Rentabilidade (% ao ano)') => `${fld(label, 'taxa', v.taxa, 'min="0"')}
    ${t ? `<button type="button" class="pill" data-usar="cdi" style="align-self:flex-start;min-height:36px;font-size:13px">Usar CDI atual (${t.cdi.valor.toLocaleString('pt-BR')}%)</button>` : ''}`;

  f.innerHTML = {
    meta: `<h2 style="font-size:16px;font-weight:600">Quero juntar…</h2>
      ${fld('Valor da meta (R$)', 'meta', v.meta, 'min="0"')}
      ${fld('Já tenho guardado (R$)', 'inicial', v.inicial, 'min="0"')}
      ${fld('Em quantos anos', 'anos', v.anos, 'min="0.1" step="0.5"')}
      ${taxaFld()}
      <label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" name="corrigir" ${v.corrigir ? 'checked' : ''}> Meta em valor de hoje (corrigir pelo IPCA)</label>`,
    projecao: `<h2 style="font-size:16px;font-weight:600">Se eu investir…</h2>
      ${fld('Valor inicial (R$)', 'inicial', v.inicial, 'min="0"')}
      ${fld('Aporte por mês (R$)', 'aporte', v.aporte, 'min="0"')}
      ${fld('Por quantos anos', 'anos', v.anos, 'min="0.1" step="0.5"')}
      ${taxaFld()}`,
    historico: `<h2 style="font-size:16px;font-weight:600">E se eu tivesse investido…</h2>
      <label class="field">Ativo (código do Yahoo)<input name="ticker" list="dl-tickers" value="${esc(v.ticker)}" autocapitalize="characters" required></label>
      <datalist id="dl-tickers">${TICKERS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</datalist>
      <p class="muted" style="font-size:12px;margin:-8px 0 0;line-height:1.5">Ações e FIIs da B3 terminam em <b>.SA</b> (ex.: PETR4.SA).</p>
      <label class="field">Desde<input name="inicio" type="month" value="${esc(v.inicio)}" min="2000-01" required></label>
      ${fld('Aporte por mês (R$)', 'aporte', v.aporte, 'min="0"')}
      ${fld('Valor inicial (R$)', 'inicial', v.inicial, 'min="0"')}
      <button class="pill green" type="submit" style="justify-content:center">Simular</button>`,
    rendafixa: `<h2 style="font-size:16px;font-weight:600">Comparar aplicações</h2>
      ${fld('Valor aplicado (R$)', 'valor', v.valor, 'min="0"')}
      ${fld('Prazo (dias corridos)', 'dias', v.dias, 'min="1" step="1"')}
      <div class="grid2">${fld('CDI (% a.a.)', 'cdi', v.cdi, 'min="0"')}${fld('Selic (% a.a.)', 'selic', v.selic, 'min="0"')}</div>
      <div class="grid2">${fld('CDB (% do CDI)', 'pctCdb', v.pctCdb, 'min="0"')}${fld('LCI/LCA (% do CDI)', 'pctLci', v.pctLci, 'min="0"')}</div>`,
  }[id];

  // `salvar` só quando o usuário mexe: assim os padrões ainda acompanham as taxas que chegam depois
  const ler = (salvar) => {
    const o = Object.fromEntries(new FormData(f));
    if (id === 'meta') o.corrigir = f.corrigir.checked ? '1' : '';
    if (salvar) S.calcIn[id] = o;
    return o;
  };
  const calcular = (salvar) => ({ meta: outMeta, projecao: outProjecao, historico: outHistorico, rendafixa: outRendaFixa }[id])(ler(salvar), out);

  f.addEventListener('input', () => { if (id !== 'historico') calcular(true); else ler(true); });
  f.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-usar="cdi"]')) { f.taxa.value = t.cdi.valor; calcular(true); }
  });
  f.addEventListener('submit', (ev) => { ev.preventDefault(); if (id === 'historico') simularAtivo(ler(true), out); });
  if (id === 'historico') outHistorico(v, out); else calcular();
}

function serieChart(out, serie, rotulos) {
  out.insertAdjacentHTML('beforeend', '<div class="card"><div class="chart-box"><canvas id="ch-calc" role="img" aria-label="Evolução do patrimônio"></canvas></div></div>');
  const passo = rotulos ? Math.max(1, Math.ceil(serie.length / 8)) : Math.max(1, Math.ceil(serie.length / 12 / 10)) * 12;
  const opts = chartOpts({ money: true, legend: true });
  opts.scales.x.ticks = { ...opts.scales.x.ticks, autoSkip: false, maxRotation: 0,
    callback: (_, i) => (i % passo ? '' : rotulos ? rotulos[i] : `${i / 12} ${i === 12 ? 'ano' : 'anos'}`) };
  setCalcChart(document.getElementById('ch-calc'), {
    type: 'line',
    data: { labels: rotulos || serie.map((_, i) => `Mês ${i}`), datasets: [
      { label: 'Patrimônio', data: serie.map((p) => p.saldo), borderColor: css('--inc'), backgroundColor: hexA(css('--inc'), 0.1), fill: true },
      { label: 'Dinheiro depositado', data: serie.map((p) => p.investido), borderColor: css('--muted'), backgroundColor: 'transparent', borderDash: [6, 5] },
      ...(serie[0].cdi != null ? [{ label: 'Se fosse no CDI', data: serie.map((p) => p.cdi), borderColor: css('--out'), backgroundColor: 'transparent' }] : []),
    ].map((d) => ({ ...d, tension: 0.25, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5 })) },
    options: opts,
  });
}

function outMeta(v, out) {
  const anos = num(v.anos), meses = Math.max(1, Math.round(anos * 12));
  const r = calc.aporteNecessario({ meta: num(v.meta), inicial: num(v.inicial), meses, taxaAA: num(v.taxa) / 100,
    ipcaAA: (S.taxas ? S.taxas.ipca.valor : 4.5) / 100, corrigir: !!v.corrigir });
  const ano = resumoAno(S.lancs, S.ano);
  const sobra = ano.n ? ano.saldo / ano.n : 0;
  out.innerHTML = `
    <div class="feature" style="display:block;margin:0">
      <div class="eyebrow">Guardar por mês</div>
      <div class="hero-num num" style="font-size:clamp(40px,6vw,64px);color:var(--inc)">${r.jaAtinge ? 'R$ 0' : brl(r.aporte, 2)}</div>
      <p class="muted" style="font-size:15px;line-height:1.6;margin:12px 0 0">${r.jaAtinge
        ? `O que vocês já têm, rendendo ${esc(v.taxa)}% a.a., chega sozinho a ${brl(r.alvo)} em ${meses} meses.`
        : `Por ${meses} meses, rendendo ${esc(v.taxa)}% ao ano, para chegar a <strong style="color:var(--text)">${brl(r.alvo)}</strong>${v.corrigir ? ` (os ${brl(num(v.meta))} de hoje corrigidos pela inflação)` : ''}.`}
      ${sobra > 0 && r.aporte > 0 ? ` Isso é <strong style="color:var(--text)">${Math.round(r.aporte / sobra * 100)}%</strong> do que sobrou por mês em média em ${S.ano} (${brl(sobra)}).` : ''}</p>
    </div>
    <div class="kpis">${kpi('Vocês vão depositar', brl(r.investido))}${kpi('Os juros colocam', brl(r.juros), 'var(--inc)')}${kpi('Valor no final', brl(r.final))}</div>`;
  serieChart(out, r.serie);
}

function outProjecao(v, out) {
  const meses = Math.max(1, Math.round(num(v.anos) * 12));
  const taxa = num(v.taxa) / 100;
  const r = calc.projecao({ inicial: num(v.inicial), aporte: num(v.aporte), meses, taxaAA: taxa });
  const renda = r.final * calc.taxaMensal(taxa);
  out.innerHTML = `
    <div class="kpis">${kpi('Valor no final', brl(r.final), 'var(--inc)')}${kpi('Total depositado', brl(r.investido))}${kpi('Juros', brl(r.juros), 'var(--inc)')}</div>
    <p class="muted" style="font-size:14px;line-height:1.6;margin:0">Depois de ${meses} meses, os juros respondem por <strong style="color:var(--text)">${r.final ? Math.round(r.juros / r.final * 100) : 0}%</strong> do patrimônio.
    Na mesma taxa, ele renderia cerca de <strong style="color:var(--text)">${brl(renda)}/mês</strong> sem mexer no principal (antes de IR e inflação).</p>`;
  serieChart(out, r.serie);
}

function outHistorico(v, out) {
  const h = S.hist;
  if (!h || h.err) {
    out.innerHTML = h && h.err ? `<div class="empty" style="color:var(--danger)">${esc(h.err)}</div>`
      : '<div class="empty">Escolha um ativo e uma data e clique em <strong>Simular</strong> para ver quanto o dinheiro teria virado, comparado ao CDI.</div>';
    setCalcChart(null);
    return;
  }
  const r = h.res;
  const moeda = h.moeda && h.moeda !== 'BRL' ? h.moeda : '';
  const fmt = (x) => (moeda ? x.toLocaleString('pt-BR', { style: 'currency', currency: moeda, maximumFractionDigits: 0 }) : brl(x));
  const cdiFinal = r.serie[r.serie.length - 1].cdi;
  out.innerHTML = `
    <div>
      <div class="eyebrow">${esc(h.ticker)} · ${esc(h.nome)}</div>
      <p class="muted" style="font-size:14px;margin:6px 0 0">${r.serie.length} meses, de ${h.rot[0]} a ${h.rot[h.rot.length - 1]}. Preços ajustados por dividendos e desdobramentos.${moeda ? ` Valores em ${esc(moeda)}, sem conversão.` : ''}</p>
    </div>
    <div class="kpis">
      ${kpi('Valor hoje', fmt(r.final), r.ganho >= 0 ? 'var(--inc)' : 'var(--out)')}
      ${kpi('Total aportado', fmt(r.investido))}
      ${kpi('Ganho / perda', (r.ganho >= 0 ? '+' : '−') + fmt(Math.abs(r.ganho)) + ` <span style="font-size:15px">(${pctBr(r.rent, 1)})</span>`, r.ganho >= 0 ? 'var(--inc)' : 'var(--out)')}
      ${cdiFinal != null && !moeda ? kpi('No CDI teria', brl(cdiFinal)) : ''}
    </div>`;
  serieChart(out, r.serie, h.rot);
}

async function simularAtivo(v, out) {
  const ticker = String(v.ticker || '').trim().toUpperCase();
  if (!ticker || !v.inicio) return;
  out.innerHTML = '<div class="empty">Buscando cotações…</div>';
  const inicio = v.inicio + '-01';
  try {
    const [h, cdi] = await Promise.all([
      db.cotacoes({ tipo: 'historico', ticker, inicio }),
      db.cotacoes({ tipo: 'cdi_mensal', inicio }).catch(() => null),
    ]);
    if (!h.pontos.length) throw new Error('Sem cotações para esse período.');
    const aporte = num(v.aporte), inicial = num(v.inicial);
    const res = calc.simularHistorico(h.pontos, aporte, inicial);
    if (cdi && cdi.pontos.length) {
      const taxaMes = new Map(cdi.pontos.map((p) => [p.data.slice(0, 7), p.taxa]));
      const idx = calc.indiceDeTaxas(h.pontos.map((p) => ({ data: p.data, taxa: taxaMes.get(p.data.slice(0, 7)) ?? 0 })));
      calc.simularHistorico(idx, aporte, inicial).serie.forEach((p, i) => { res.serie[i].cdi = p.saldo; });
    }
    const rot = h.pontos.map((p) => `${MES_CURTO[+p.data.slice(5, 7) - 1].toLowerCase()}/${p.data.slice(2, 4)}`);
    S.hist = { ...h, res, rot };
  } catch (e) {
    S.hist = { err: e.message };
  }
  if (route() === 'calculadoras' && S.calc === 'historico') outHistorico(v, out);
}

function outRendaFixa(v, out) {
  const valor = num(v.valor), dias = Math.max(1, Math.round(num(v.dias))), cdi = num(v.cdi) / 100, selic = num(v.selic) / 100;
  const pctLci = num(v.pctLci) / 100;
  const linhas = [
    { ...calc.rendaFixa({ valor, dias, tipo: 'cdb', cdi, pct: num(v.pctCdb) / 100 }), det: `${esc(v.pctCdb)}% do CDI` },
    { ...calc.rendaFixa({ valor, dias, tipo: 'lci', cdi, pct: pctLci }), det: `${esc(v.pctLci)}% do CDI, isento de IR` },
    { ...calc.rendaFixa({ valor, dias, tipo: 'selic', cdi, selic }), det: 'Selic, custódia B3 de 0,20% a.a. acima de R$ 10 mil' },
    { ...calc.rendaFixa({ valor, dias, tipo: 'poupanca', cdi, selic }), det: 'Regra atual, sem TR' },
  ];
  const melhor = linhas.reduce((a, b) => (b.final > a.final ? b : a));
  const equiv = calc.cdbEquivalente(pctLci, dias);
  out.innerHTML = `
    <div class="table-box"><table>
      <thead><tr><th>Aplicação</th><th class="r">Rendimento bruto</th><th class="r">IR</th><th class="r">Líquido</th><th class="r">Valor final</th><th class="r">Líquido a.a.</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr${l === melhor ? ' style="background:var(--surface-2)"' : ''}>
        <td style="font-weight:500">${l.nome}${l === melhor ? ' <span class="tag" style="background:var(--inc);color:var(--on-inc)">melhor</span>' : ''}<div class="muted" style="font-size:12px">${l.det}</div></td>
        <td class="r num">${brl(l.bruto, 2)}</td>
        <td class="r num">${l.ir ? `${brl(l.ir, 2)}<div class="muted" style="font-size:12px">${pctBr(l.aliquota, 1)}${l.custodia ? ` + custódia ${brl(l.custodia, 2)}` : ''}</div>` : '—'}</td>
        <td class="r num" style="font-weight:600;color:var(--inc)">${brl(l.liquido, 2)}</td>
        <td class="r num">${brl(l.final, 2)}</td>
        <td class="r num">${pctBr(l.rentAA)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted" style="font-size:14px;line-height:1.6;margin:0">Em ${dias} dias o IR é de <strong style="color:var(--text)">${pctBr(calc.aliquotaIR(dias), 1)}</strong> (22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois).
    Uma LCI/LCA de ${esc(v.pctLci)}% do CDI equivale a um CDB de cerca de <strong style="color:var(--text)">${Math.round(equiv * 100)}% do CDI</strong> nesse prazo. Não considera IOF (só em resgates antes de 30 dias) nem o risco de cada emissor.</p>`;
  setCalcChart(null);
}

// ---------------- Dicas ----------------
function viewDicas(el) {
  const r = resumoAno(S.lancs, S.ano);
  const ds = dicas(r);
  el.innerHTML = `
  <div class="page-head"><h1>dicas</h1></div>
  <section class="lime-card">
    <div class="label">dá para economizar em ${S.ano}</div>
    <div class="big num">${brl(potencial(ds))}<span style="font-size:0.4em;font-weight:500">/mês</span></div>
    <p style="margin:0;font-size:13px;line-height:1.6;max-width:620px">Seguindo as sugestões abaixo, calculadas a partir dos lançamentos de vocês. Em um ano, seriam <strong>${brl(potencial(ds) * 12)}</strong>.</p>
  </section>
  <section class="cols" style="align-items:flex-start">
    <div class="tile" style="flex:3 1 420px"><div class="tile-head"><h2>com base nos seus dados</h2></div>${tipsHtml(ds)}</div>
    <div class="tile" style="flex:2 1 300px">
      <div class="tile-head"><h2>hábitos que ajudam</h2></div>
      ${[
        ['Teto por categoria', 'Definam juntos um limite mensal para mercado, delivery e lazer e acompanhem na aba Lançamentos.'],
        ['Pague-se primeiro', 'Assim que o salário cair, transfira um valor fixo para o investimento antes de pagar o resto.'],
        ['Uma conversa por mês', 'Quinze minutos no início do mês para olhar o Resumo juntos evitam surpresas no cartão.'],
        ['Desconto à vista', 'IPVA e IPTU costumam ter desconto no pagamento em cota única — com a provisão mensal, dá para aproveitar.'],
      ].map(([t, p], i) => `<article class="tip"><div class="n">${String.fromCharCode(65 + i)}</div><div><h3>${t}</h3><p>${p}</p></div></article>`).join('')}
    </div>
  </section>`;
}

// ---------------- gráficos ----------------
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function chartOpts({ money, stacked, legend }) {
  const grid = css('--border'), tick = css('--muted');
  return {
    maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: tick, font: { family: 'Sora', size: 11 } } },
      y: { stacked, grid: { color: grid }, border: { display: false }, ticks: { color: tick, font: { family: 'Sora', size: 11 }, callback: (v) => (money ? 'R$ ' + (v / 1000).toLocaleString('pt-BR') + 'k' : v) } },
    },
    plugins: {
      legend: { display: !!legend, position: 'bottom', labels: { color: tick, boxWidth: 12, font: { family: 'Sora', size: 11 } } },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(c.parsed.y, 2)}` } },
    },
  };
}


// ---------------- Contas a pagar e orçamento: utilidades ----------------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const hojeData = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const isoDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const DIA = 86400000;
// mês mostrado em Contas/Orçamento: o escolhido, senão o mês atual (ano corrente) ou dezembro
function mesPadrao() {
  if (S.mes != null) return S.mes;
  const h = new Date();
  return S.ano === h.getFullYear() ? h.getMonth() : 11;
}
const chipsMeses = (m, extra = () => '') => `<div class="months" role="group" aria-label="Mês">${MES_CURTO.map((nm, i) =>
  `<button class="chip" data-action="mes" data-mes="${i}" aria-pressed="${i === m}"><span style="font-weight:600;font-size:13px">${nm}</span><small class="num muted">${extra(i) || '&nbsp;'}</small></button>`).join('')}</div>`;

// Contas que valem no mês (1–12), com vencimento, pagamento e situação.
function contasDoMes(ano, mes) {
  const hoje = hojeData();
  return S.contas.filter((k) => k.ativa !== false).map((k) => {
    let venc;
    if (k.recorrente) {
      if (k.criado_em) { const c = new Date(k.criado_em); if (ano * 12 + mes < c.getFullYear() * 12 + c.getMonth() + 1) return null; }
      const ultimo = new Date(ano, mes, 0).getDate();
      venc = new Date(ano, mes - 1, Math.min(k.dia_vencimento || 1, ultimo));
    } else {
      if (!k.vencimento || +k.vencimento.slice(0, 4) !== ano || +k.vencimento.slice(5, 7) !== mes) return null;
      venc = new Date(+k.vencimento.slice(0, 4), +k.vencimento.slice(5, 7) - 1, +k.vencimento.slice(8, 10));
    }
    const pag = S.pags.find((p) => p.conta_id === k.id && p.ano === ano && p.mes === mes);
    const dias = Math.round((venc - hoje) / DIA);
    const sit = pag ? 'paga' : dias < 0 ? 'vencida' : dias <= 7 ? 'proxima' : 'futura';
    return { k, venc, pag, dias, sit };
  }).filter(Boolean).sort((a, b) => a.venc - b.venc);
}

// Gasto do mês por categoria (lançamentos de saída, inclusive compras do cartão importadas).
function gastoPorCategoria(ano, mes) {
  const m = new Map();
  S.lancs.filter((l) => l.ano === ano && l.mes === mes && l.tipo === 'saida').forEach((l) => m.set(l.categoria, (m.get(l.categoria) || 0) + l.valor));
  return m;
}
// Média mensal da categoria nos meses fechados do ano (sugestão de teto).
function mediaCategoria(cat) {
  const r = resumoAno(S.lancs, S.ano);
  if (!r.n) return 0;
  const tot = r.L.filter((l) => l.tipo === 'saida' && l.mes <= r.n && l.categoria === cat).reduce((a, l) => a + l.valor, 0);
  return tot / r.n;
}
const sugerirTeto = (v) => (v > 0 ? Math.ceil(v / 50) * 50 : '');

async function recarregarFinancas() {
  [S.lancs] = await Promise.all([db.listLancamentos(), carregarContasOrc()]);
}
async function carregarContasOrc() {
  try {
    const [{ contas, pagamentos }, orc] = await Promise.all([db.listContas(), db.listOrcamentos()]);
    S.contas = contas; S.pags = pagamentos; S.orc = orc; S.erroExtra = '';
  } catch (e) { S.contas = []; S.pags = []; S.orc = []; S.erroExtra = e.message; }
}

// Avisos para o topo do Resumo: contas vencidas/vencendo e categorias perto do teto (mês atual).
function alertasHtml() {
  const h = new Date();
  if (S.ano !== h.getFullYear()) return '';
  const ano = h.getFullYear(), mes = h.getMonth() + 1;
  const cs = contasDoMes(ano, mes);
  const venc = cs.filter((c) => c.sit === 'vencida');
  const logo = cs.filter((c) => !c.pag && c.dias >= 0 && c.dias <= 3);
  const gasto = gastoPorCategoria(ano, mes);
  const orc = S.orc.map((o) => ({ ...o, gasto: gasto.get(o.categoria) || 0 })).filter((o) => o.gasto >= o.teto * 0.8).sort((a, b) => b.gasto / b.teto - a.gasto / a.teto);
  const itens = [];
  if (venc.length) itens.push(`<a class="alerta neg" href="#financas/contas">${ico('alerta', 16)}${venc.length} ${venc.length > 1 ? 'contas vencidas' : 'conta vencida'}: ${esc(venc.map((c) => c.k.descricao).join(', '))}</a>`);
  logo.forEach((c) => itens.push(`<a class="alerta" href="#financas/contas">${ico('contas', 16)}${esc(c.k.descricao)} vence ${c.dias === 0 ? 'hoje' : c.dias === 1 ? 'amanhã' : `em ${c.dias} dias`} · ${brl(c.k.valor_previsto)}</a>`));
  orc.slice(0, 3).forEach((o) => itens.push(`<a class="alerta ${o.gasto > o.teto ? 'neg' : ''}" href="#financas/orcamento">${ico('orcamento', 16)}${esc(o.categoria)}: ${Math.round(o.gasto / o.teto * 100)}% do teto</a>`));
  return itens.length ? `<div class="alertas">${itens.join('')}</div>` : '';
}

// ---------------- Contas a pagar ----------------
function viewContas(el) {
  const m = mesPadrao(), ano = S.ano, mes = m + 1;
  const head = `<div class="page-head"><h1>contas</h1>
    <div class="actions"><button class="btn" data-action="contas-fixos" title="Criar contas a partir dos fixos">${ico('copiar', 16)}<span class="lbl">criar dos fixos</span></button>
      <button class="btn lime" data-action="nova-k">${ico('plus', 16)}nova conta</button></div></div>`;
  if (S.erroExtra) { el.innerHTML = `${head}<div class="empty">${esc(S.erroExtra)}</div>`; return; }
  if (!S.contas.length) {
    el.innerHTML = `${head}<div class="empty">Cadastre as contas que vencem todo mês (aluguel, luz, internet, escola…) e o app avisa o que vence e o que já foi pago.<br>
      Ao marcar uma conta como paga, ela vira um lançamento automaticamente — não precisa mais copiar os fixos.<br><br>
      <button class="btn lime" data-action="contas-fixos">${ico('copiar', 16)}criar a partir dos fixos do mês anterior</button></div>`;
    return;
  }
  const cs = contasDoMes(ano, mes);
  const pendentes = cs.filter((c) => !c.pag);
  const pagas = cs.filter((c) => c.pag);
  const totPrev = cs.reduce((a, c) => a + (c.pag ? c.pag.valor : c.k.valor_previsto), 0);
  const totPago = pagas.reduce((a, c) => a + c.pag.valor, 0);
  const falta = pendentes.reduce((a, c) => a + c.k.valor_previsto, 0);
  const qtdVenc = (i) => { const n = contasDoMes(ano, i + 1).filter((c) => !c.pag).length; return n ? `${n} a pagar` : ''; };
  const linha = (c) => {
    const sub = c.pag ? `pago em ${c.pag.pago_em.split('-').reverse().slice(0, 2).join('/')}` : c.sit === 'vencida' ? `venceu ${dm(c.venc)}` : c.dias === 0 ? 'vence hoje' : `vence ${dm(c.venc)}`;
    return `<div class="li tap" data-action="edit-k" data-id="${c.k.id}">
      <span class="li-ic dia num ${c.sit === 'vencida' ? 'neg' : ''}">${String(c.venc.getDate()).padStart(2, '0')}</span>
      <div class="li-main"><span class="li-t">${esc(c.k.descricao)}</span><span class="li-s ${c.sit === 'vencida' ? 'neg' : ''}">${esc(c.k.categoria)} · ${sub}${c.k.recorrente ? '' : ' · avulsa'}</span></div>
      <div class="li-v num">${brl(c.pag ? c.pag.valor : c.k.valor_previsto, 2)}${c.pag ? '<small class="pos">paga</small>' : ''}</div>
      ${c.pag ? `<button class="btn icon" data-action="desfazer-pag" data-id="${c.pag.id}" aria-label="Desfazer pagamento de ${esc(c.k.descricao)}" title="Desfazer pagamento">${ico('desfazer', 16)}</button>`
        : `<button class="btn lime pagar" data-action="pagar-k" data-id="${c.k.id}">pagar</button>`}
    </div>`;
  };
  const grupo = (titulo, lista, cls = '') => (lista.length ? `<div class="grp-t ${cls}">${titulo}</div><div class="list">${lista.map(linha).join('')}</div>` : '');
  el.innerHTML = `${head}
  ${chipsMeses(m, qtdVenc)}
  <section class="row2">
    <div class="lime-card" style="flex:2 1 420px">
      <div class="lime-top">
        <div><div class="label">falta pagar em ${MESES[m].toLowerCase()}</div><div class="big num">${brl(falta, 2)}</div></div>
        <span class="badge">${pagas.length} de ${cs.length} pagas</span>
      </div>
      ${totPrev ? `<div class="seg"><span style="flex:${totPago || 0.0001};background:rgba(20,20,20,.85)"></span><span style="flex:${falta || 0.0001};background:rgba(20,20,20,.15)"></span></div>
      <div class="lg"><span><i style="background:rgba(20,20,20,.85)"></i>pago ${brl(totPago)}</span><span><i style="background:rgba(20,20,20,.15)"></i>a pagar ${brl(falta)}</span></div>` : ''}
    </div>
    <div class="kpis k2">
      <div class="kpi"><span class="k">vencidas</span><span class="v num ${cs.some((c) => c.sit === 'vencida') ? 'neg' : ''}">${cs.filter((c) => c.sit === 'vencida').length}</span></div>
      <div class="kpi"><span class="k">próximos 7 dias</span><span class="v num">${cs.filter((c) => c.sit === 'proxima').length}</span></div>
      <div class="kpi"><span class="k">total do mês</span><span class="v num">${brl(totPrev)}</span></div>
      <div class="kpi"><span class="k">já pago</span><span class="v num pos">${brl(totPago)}</span></div>
    </div>
  </section>
  <section class="cols" style="align-items:flex-start">
    <div class="tile"><div class="tile-head"><h2>a pagar</h2><span class="muted num" style="font-size:12px">${pendentes.length}</span></div>
      ${pendentes.length ? grupo('vencidas', pendentes.filter((c) => c.sit === 'vencida'), 'neg') + grupo('próximos 7 dias', pendentes.filter((c) => c.sit === 'proxima'))
        + grupo('mais para frente', pendentes.filter((c) => c.sit === 'futura')) : '<p class="muted" style="margin:0;font-size:13px">Tudo pago neste mês.</p>'}
    </div>
    <div class="tile"><div class="tile-head"><h2>pagas</h2><span class="muted num" style="font-size:12px">${pagas.length}</span></div>
      ${pagas.length ? `<div class="list">${pagas.map(linha).join('')}</div>` : '<p class="muted" style="margin:0;font-size:13px">Nenhuma conta paga neste mês ainda.</p>'}
    </div>
  </section>
  ${S.contas.some((k) => k.ativa === false) ? `<p class="muted" style="font-size:12px;margin:0">Contas pausadas não aparecem: ${esc(S.contas.filter((k) => k.ativa === false).map((k) => k.descricao).join(', '))}.</p>` : ''}`;
}

function contaForm(k) {
  const cats = [...new Set([...S.lancs.map((x) => x.categoria), ...S.contas.map((x) => x.categoria)])].sort();
  const rec = k.recorrente !== false;
  modal.innerHTML = `
  <form method="dialog" id="f-k">
    <h2 class="h2">${k.id ? 'editar conta' : 'nova conta'}</h2>
    <label class="field">Descrição<input name="descricao" required value="${esc(k.descricao || '')}" placeholder="Ex.: Energia, Aluguel, Escola"></label>
    <div class="grid2">
      <label class="field">Categoria<input name="categoria" list="dl-cat-k" required value="${esc(k.categoria || '')}"></label>
      <label class="field">Valor previsto (R$)<input name="valor_previsto" type="number" inputmode="decimal" step="0.01" min="0" required value="${k.valor_previsto ?? ''}"></label>
    </div>
    <div class="grid2">
      <label class="field">Repete<select name="recorrente"><option value="true" ${rec ? 'selected' : ''}>Todo mês</option><option value="false" ${rec ? '' : 'selected'}>Só uma vez</option></select></label>
      <label class="field" id="k-dia" ${rec ? '' : 'hidden'}>Dia do vencimento<input name="dia_vencimento" type="number" inputmode="numeric" min="1" max="31" value="${k.dia_vencimento ?? 10}"></label>
      <label class="field" id="k-data" ${rec ? 'hidden' : ''}>Vencimento<input name="vencimento" type="date" value="${k.vencimento || ''}"></label>
    </div>
    ${k.id ? `<label class="check"><input type="checkbox" name="ativa" ${k.ativa !== false ? 'checked' : ''}> conta ativa (desmarque para pausar sem apagar o histórico)</label>` : ''}
    <datalist id="dl-cat-k">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${k.id ? '<button class="pill danger" value="del" formnovalidate>Excluir</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const trocar = () => {
    const r = f.recorrente.value === 'true';
    f.querySelector('#k-dia').hidden = !r; f.querySelector('#k-data').hidden = r;
    f.dia_vencimento.required = r; f.vencimento.required = !r;
  };
  f.recorrente.addEventListener('change', trocar);
  trocar();
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    try {
      if (ev.submitter && ev.submitter.value === 'del') {
        if (!confirm(`Excluir a conta "${k.descricao}"? Os lançamentos já criados pelos pagamentos continuam em Lançamentos.`)) return;
        await db.excluirConta(k.id);
      } else {
        if (!f.reportValidity()) return;
        const d = Object.fromEntries(new FormData(f));
        await db.salvarConta({ ...d, id: k.id, ativa: k.id ? f.ativa.checked : true });
      }
      modal.close();
      await carregarContasOrc();
      render();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

function pagarForm(k, ano, mes) {
  const ultimo = S.pags.filter((p) => p.conta_id === k.id).sort((a, b) => b.ano * 12 + b.mes - (a.ano * 12 + a.mes))[0];
  const c = contasDoMes(ano, mes).find((x) => x.k.id === k.id);
  const hoje = hojeData();
  const data = c && c.venc < hoje && (hoje.getFullYear() !== ano || hoje.getMonth() + 1 !== mes) ? c.venc : hoje;
  modal.innerHTML = `
  <form method="dialog" id="f-pag">
    <h2 class="h2">pagar ${esc(k.descricao.toLowerCase())}</h2>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5">Vai criar um lançamento de saída em <strong>${MESES[mes - 1]} de ${ano}</strong> na categoria <strong>${esc(k.categoria)}</strong>.</p>
    <div class="grid2">
      <label class="field">Valor pago (R$)<input name="valor" type="number" inputmode="decimal" step="0.01" min="0" required value="${(ultimo ? ultimo.valor : k.valor_previsto) || ''}"></label>
      <label class="field">Data do pagamento<input name="pago_em" type="date" required value="${isoDia(data)}"></label>
    </div>
    ${ultimo ? `<p class="muted" style="margin:0;font-size:12px">Último pagamento: ${brl(ultimo.valor, 2)} em ${MESES[ultimo.mes - 1].toLowerCase()}.</p>` : ''}
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Confirmar pagamento</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (!f.reportValidity()) return;
    try {
      await db.pagarConta({ conta: k, ano, mes, valor: f.valor.value, pago_em: f.pago_em.value });
      modal.close();
      await recarregarFinancas();
      render();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
  f.valor.select();
}

// gastos do dia a dia que não são "contas com vencimento" (vêm desmarcados)
const VARIAVEIS = /mercado|supermerc|aliment|delivery|ifood|restaur|lazer|combust|posto|farmac|viagem|compras|vestu|roupa|presente|outr/;
// "Fixos automáticos": transforma os fixos do último mês com lançamentos em contas recorrentes.
function contasDosFixos() {
  const m = mesPadrao() + 1;
  let pa = S.ano, pm = m, base = [];
  for (let i = 0; i < 4 && !base.length; i++) {
    [pa, pm] = pm === 1 ? [pa - 1, 12] : [pa, pm - 1];
    base = S.lancs.filter((l) => l.ano === pa && l.mes === pm && l.tipo === 'saida' && !l.cartao && !/cart|outr/i.test(l.categoria));
  }
  const ja = new Set(S.contas.map((k) => norm(k.descricao)));
  const vistos = new Set();
  const novos = base.filter((l) => !ja.has(norm(l.descricao)) && !vistos.has(norm(l.descricao)) && vistos.add(norm(l.descricao))).sort((a, b) => b.valor - a.valor);
  if (!novos.length) return alert(base.length ? 'Todos os fixos do mês anterior já viraram contas.' : 'Não encontrei despesas fixas nos últimos meses para usar como base.');
  modal.classList.add('wide');
  modal.innerHTML = `
  <form method="dialog" id="f-fixos">
    <h2 class="h2">criar contas dos fixos</h2>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.5">Fixos de ${MESES[pm - 1].toLowerCase()} de ${pa}. Marque os que vencem todo mês e ajuste o dia do vencimento. Depois, ao pagar, o lançamento é criado sozinho.</p>
    <div class="imp-box">${novos.map((l, i) => `
      <div class="imp-row"><input type="checkbox" name="inc" value="${i}" ${VARIAVEIS.test(norm(`${l.categoria} ${l.descricao}`)) ? '' : 'checked'} aria-label="Criar conta ${esc(l.descricao)}">
        <div class="li-main"><span class="li-t">${esc(l.descricao)}</span><span class="li-s">${esc(l.categoria)} · ${brl(l.valor, 2)}</span></div>
        <label class="field" style="width:96px">dia<input name="dia${i}" type="number" inputmode="numeric" min="1" max="31" value="10" aria-label="Dia do vencimento de ${esc(l.descricao)}"></label></div>`).join('')}</div>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Criar contas</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    const sel = [...f.querySelectorAll('input[name="inc"]:checked')].map((c) => {
      const l = novos[+c.value];
      return { descricao: l.descricao, categoria: l.categoria, valor_previsto: l.valor, recorrente: true, dia_vencimento: Math.min(31, Math.max(1, +f.elements[`dia${c.value}`].value || 10)) };
    });
    if (!sel.length) { f.querySelector('#f-err').textContent = 'Marque ao menos uma conta.'; return; }
    try {
      await db.salvarContas(sel);
      modal.close();
      await carregarContasOrc();
      if (route() === 'contas') render(); else C.irPara('financas/contas');
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
}

// ---------------- Orçamento por categoria ----------------
function viewOrcamento(el) {
  const m = mesPadrao(), ano = S.ano, mes = m + 1;
  const head = '<div class="page-head"><h1>orçamento</h1></div>';
  if (S.erroExtra) { el.innerHTML = `${head}<div class="empty">${esc(S.erroExtra)}</div>`; return; }
  const gasto = gastoPorCategoria(ano, mes);
  const comTeto = S.orc.map((o) => ({ ...o, gasto: gasto.get(o.categoria) || 0 })).sort((a, b) => b.gasto / b.teto - a.gasto / a.teto);
  const temTeto = new Set(S.orc.map((o) => o.categoria));
  const cats = [...new Set([...S.lancs.filter((l) => l.ano === ano && l.tipo === 'saida').map((l) => l.categoria)])].filter((c) => !temTeto.has(c))
    .map((c) => ({ categoria: c, gasto: gasto.get(c) || 0, media: mediaCategoria(c) })).filter((c) => c.gasto > 0 || c.media > 0).sort((a, b) => b.media - a.media);
  const totTeto = comTeto.reduce((a, o) => a + o.teto, 0);
  const totGasto = comTeto.reduce((a, o) => a + o.gasto, 0);
  const acima = comTeto.filter((o) => o.gasto > o.teto).length;
  const fechou = (() => { const h = new Date(); return ano < h.getFullYear() || (ano === h.getFullYear() && m < h.getMonth()); })();
  const linhaTeto = (o) => {
    const p = o.gasto / o.teto;
    const cls = p > 1 ? 'over' : p >= 0.8 ? 'warn' : 'hi';
    return `<div class="li tap" data-action="teto" data-cat="${esc(o.categoria)}" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0">
      <div class="bar-row" style="margin:0"><div class="top"><span style="font-weight:500">${esc(o.categoria)}</span>
        <span class="num"><span class="${p > 1 ? 'neg' : ''}">${brl(o.gasto)}</span><span class="muted"> de ${brl(o.teto)}</span></span></div>
      <div class="track"><div class="${cls}" style="width:${Math.min(100, Math.max(2, p * 100))}%"></div></div>
      <div class="li-s ${p > 1 ? 'neg' : ''}">${p > 1 ? `passou ${brl(o.gasto - o.teto)} do teto` : `${Math.round(p * 100)}% · ${fechou ? 'sobrou' : 'ainda dá'} ${brl(o.teto - o.gasto)}`}</div></div>
    </div>`;
  };
  el.innerHTML = `${head}
  ${chipsMeses(m)}
  ${comTeto.length ? `<section class="lime-card">
    <div class="lime-top">
      <div><div class="label">gasto nas categorias com teto · ${MESES[m].toLowerCase()}</div><div class="big num">${brl(totGasto)} <span style="font-size:.45em;font-weight:500">de ${brl(totTeto)}</span></div></div>
      <span class="badge">${acima ? `${acima} acima do teto` : 'tudo dentro do teto'}</span>
    </div>
    <div class="seg"><span style="flex:${Math.min(totGasto, totTeto) || 0.0001};background:rgba(20,20,20,.85)"></span><span style="flex:${Math.max(0, totTeto - totGasto) || 0.0001};background:rgba(20,20,20,.15)"></span></div>
  </section>` : ''}
  <section class="cols" style="align-items:flex-start">
    <div class="tile">
      <div class="tile-head"><h2>tetos do mês</h2><span class="muted" style="font-size:12px">toque para ajustar</span></div>
      ${comTeto.length ? `<div class="list">${comTeto.map(linhaTeto).join('')}</div>`
        : '<p class="muted" style="margin:0;font-size:13px;line-height:1.6">Defina um teto mensal para as categorias que mais pesam (mercado, delivery, lazer…). O app mostra quanto já foi gasto e avisa no Resumo quando passar de 80%.</p>'}
    </div>
    <div class="tile">
      <div class="tile-head"><h2>sem teto</h2><span class="muted" style="font-size:12px">média/mês em ${S.ano}</span></div>
      ${cats.length ? `<div class="list">${cats.map((c) => `
        <div class="li tap" data-action="teto" data-cat="${esc(c.categoria)}">
          <div class="li-main"><span class="li-t">${esc(c.categoria)}</span><span class="li-s">neste mês ${brl(c.gasto)}</span></div>
          <div class="li-v num">${brl(c.media)}<small>média</small></div>
          <button class="btn" data-action="teto" data-cat="${esc(c.categoria)}" style="min-height:36px;padding:0 12px">definir</button></div>`).join('')}</div>`
        : '<p class="muted" style="margin:0;font-size:13px">Todas as categorias com gastos já têm teto.</p>'}
    </div>
  </section>`;
}

function tetoForm(cat) {
  const o = S.orc.find((x) => x.categoria === cat);
  const media = mediaCategoria(cat);
  modal.innerHTML = `
  <form method="dialog" id="f-teto">
    <h2 class="h2">teto de ${esc(cat.toLowerCase())}</h2>
    <label class="field">Teto mensal (R$)<input name="teto" type="number" inputmode="decimal" step="10" min="0" value="${o ? o.teto : sugerirTeto(media)}"></label>
    <p class="muted" style="margin:0;font-size:12px;line-height:1.5">${media ? `Média de ${brl(media)}/mês nos meses fechados de ${S.ano}. ` : ''}Deixe em branco ou zero para tirar o teto.</p>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${o ? '<button class="pill danger" value="del" formnovalidate>Remover teto</button>' : ''}<button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    try {
      await db.salvarOrcamento(cat, ev.submitter && ev.submitter.value === 'del' ? 0 : f.teto.value);
      modal.close();
      await carregarContasOrc();
      render();
    } catch (e) { f.querySelector('#f-err').textContent = e.message; }
  });
  modal.showModal();
  f.teto.select();
}

// ---------------- o módulo ----------------
const VIEWS = { resumo: viewResumo, lancamentos: viewLancamentos, contas: viewContas, orcamento: viewOrcamento, cartoes: viewCartoes, investimentos: viewInvestimentos, calculadoras: viewCalculadoras, dicas: viewDicas };

export default {
  id: 'financas',
  nome: 'Finanças',
  abas: [['resumo', 'Resumo', 'resumo'], ['lancamentos', 'Lançamentos', 'lancamentos'], ['contas', 'Contas', 'contas'], ['orcamento', 'Orçamento', 'orcamento'],
    ['cartoes', 'Cartões', 'cartoes'], ['investimentos', 'Investimentos', 'investimentos'], ['calculadoras', 'Calculadoras', 'calculadoras'], ['dicas', 'Dicas', 'dicas']],
  // barra inferior no celular (5 itens): abas ou uma ação rápida
  barra: ['resumo', 'lancamentos', { acao: 'novo-l', icone: 'plus', rotulo: 'Novo lançamento', attrs: 'data-tipo="saida"' }, 'contas', 'orcamento'],

  async carregar(ctx) {
    C = ctx;
    [S.lancs, S.invs] = await Promise.all([db.listLancamentos(), db.listInvestimentos(), carregarContasOrc()]);
    const anos = anosDisponiveis();
    if (!anos.includes(S.ano)) S.ano = anos[anos.length - 1];
  },

  render(aba, el, ctx) {
    C = ctx;
    S.charts.forEach((c) => c.destroy());
    S.charts = [];
    (VIEWS[aba] || viewResumo)(el);
  },

  // seletor de ano, mostrado no menu lateral e no topo do celular
  topo(ctx, id) {
    return `<label class="sr" for="${id}">Ano</label><select id="${id}" class="pill" data-action="ano">${anosDisponiveis().map((a) => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>`;
  },

  mudou(ev) {
    if (ev.target.dataset.action === 'ano') { S.ano = +ev.target.value; S.mes = null; render(); }
  },

  async acao(a, b) {
    if (a === 'calc') {
      S.calc = b.dataset.calc; render();
    } else if (a === 'mes') {
      S.mes = +b.dataset.mes; render();
    } else if (a === 'novo-l') {
      const hoje = new Date();
      lancForm({ tipo: b.dataset.tipo || 'saida', ano: S.ano, mes: S.mes != null ? S.mes + 1 : (S.ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 1) });
    } else if (a === 'edit-l') {
      lancForm(S.lancs.find((l) => l.id === +b.dataset.id));
    } else if (a === 'del-l') {
      const l = S.lancs.find((x) => x.id === +b.dataset.id);
      if (confirm(`Excluir "${l.descricao}" de ${MESES[l.mes - 1]}?`)) { await db.deleteLancamento(l.id); S.lancs = await db.listLancamentos(); render(); }
    } else if (a === 'copiar-mes') {
      copiarMesAnterior();
    } else if (a === 'importar') {
      escolherFatura();
    } else if (a === 'nova-k') {
      contaForm({ recorrente: true });
    } else if (a === 'edit-k') {
      contaForm(S.contas.find((k) => k.id === +b.dataset.id));
    } else if (a === 'pagar-k') {
      pagarForm(S.contas.find((k) => k.id === +b.dataset.id), S.ano, mesPadrao() + 1);
    } else if (a === 'desfazer-pag') {
      const p = S.pags.find((x) => x.id === +b.dataset.id);
      const k = p && S.contas.find((x) => x.id === p.conta_id);
      if (p && confirm(`Desfazer o pagamento de "${k ? k.descricao : 'conta'}" em ${MESES[p.mes - 1]}? O lançamento de ${brl(p.valor, 2)} criado por ele também será apagado.`)) {
        await db.desfazerPagamento(p); await recarregarFinancas(); render();
      }
    } else if (a === 'contas-fixos') {
      contasDosFixos();
    } else if (a === 'teto') {
      tetoForm(b.dataset.cat);
    } else if (a === 'novo-i') {
      invForm({ tipo: TIPOS_INV[0] });
    } else if (a === 'edit-i') {
      invForm(S.invs.find((i) => i.id === +b.dataset.id));
    } else if (a === 'del-i') {
      const i = S.invs.find((x) => x.id === +b.dataset.id);
      if (confirm(`Excluir "${i.nome}"?`)) { await db.deleteInvestimento(i.id); S.invs = await db.listInvestimentos(); render(); }
    }
  },
};
