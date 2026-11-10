import * as db from './data.js';
import { NOME_CASA } from './config.js';
import { MESES, MES_CURTO, brl, kfmt, resumoAno, porCategoria, porItem, dicas, potencial, closedMonths, ehCartao, porCartao, cartaoPorCategoria } from './insights.js';
import { parseNubankCsv, chaveLoja } from './importar.js';
import * as calc from './calc.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const S = { user: null, lancs: [], invs: [], ano: new Date().getFullYear(), mes: null, charts: [],
  calc: 'meta', calcIn: {}, taxas: null, taxasErr: '', hist: null };
const TABS = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ['cartoes', 'Cartões'], ['investimentos', 'Investimentos'], ['calculadoras', 'Calculadoras'], ['dicas', 'Dicas']];
const TIPOS_INV = ['Reserva de emergência', 'Tesouro Direto', 'CDB / LCI / LCA', 'Fundos', 'Ações / FIIs', 'Previdência', 'Outros'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const route = () => (location.hash.replace('#', '') || 'resumo');
const ICON_THEME = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';

// ---------------- início ----------------
async function boot() {
  S.user = await db.currentUser();
  if (!S.user) return renderLogin();
  await loadData();
  render();
}

async function loadData() {
  app.innerHTML = '<main class="wrap"><p class="muted">Carregando…</p></main>';
  try {
    [S.lancs, S.invs] = await Promise.all([db.listLancamentos(), db.listInvestimentos()]);
  } catch (e) {
    app.innerHTML = `<main class="wrap"><div class="empty">Não foi possível carregar os dados: ${esc(e.message)}</div></main>`;
    throw e;
  }
  const anos = anosDisponiveis();
  if (!anos.includes(S.ano)) S.ano = anos[anos.length - 1];
}

function anosDisponiveis() {
  const set = new Set(S.lancs.map((l) => l.ano));
  set.add(new Date().getFullYear());
  return [...set].sort();
}

// ---------------- login ----------------
function renderLogin() {
  app.innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brand">${esc(NOME_CASA)}<span>.</span></div>
      <h1>O dinheiro da casa,<br>num lugar só.</h1>
      <p class="muted" style="max-width:420px;line-height:1.6">Entradas, saídas, cartões e investimentos de vocês dois — com gráficos e dicas para gastar melhor.</p>
    </section>
    <section class="login-form">
      <form id="login-form" novalidate>
        <h2 class="h2">Entrar</h2>
        ${db.DEMO ? '<p class="muted" style="margin:0;font-size:14px">Modo demonstração: qualquer e-mail e senha funcionam. Configure o Supabase para ativar o login de verdade.</p>' : ''}
        <label class="field">E-mail<input type="email" name="email" autocomplete="username" required></label>
        <label class="field">Senha<input type="password" name="password" autocomplete="current-password" required></label>
        <div class="error" id="login-err" role="alert"></div>
        <button class="pill green" type="submit" style="justify-content:center">Entrar</button>
      </form>
    </section>
  </div>`;
  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const err = document.getElementById('login-err');
    err.textContent = '';
    try {
      S.user = await db.signIn(f.get('email'), f.get('password'));
      await loadData();
      render();
    } catch (e) { err.textContent = e.message; }
  });
}

// ---------------- estrutura ----------------
function render() {
  S.charts.forEach((c) => c.destroy());
  S.charts = [];
  const r = route();
  const anos = anosDisponiveis();
  app.innerHTML = `
  ${db.DEMO ? '<div class="demo-bar">Modo demonstração — os dados ficam só neste navegador. <button data-action="reset-demo">Restaurar dados da planilha</button></div>' : ''}
  <header class="topbar"><div class="wrap">
    <div class="brand">${esc(NOME_CASA)}<span>.</span></div>
    <nav class="tabs" aria-label="Seções">${TABS.map(([id, nome]) => `<a href="#${id}" ${id === r ? 'aria-current="page"' : ''}>${nome}</a>`).join('')}</nav>
    <div class="actions">
      <label class="sr" style="position:absolute;left:-9999px" for="ano">Ano</label>
      <select id="ano" class="pill" data-action="ano">${anos.map((a) => `<option ${a === S.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <button class="icon-btn" data-action="tema" aria-label="Alternar modo claro/escuro">${ICON_THEME}</button>
      <button class="pill dark" data-action="sair">Sair</button>
    </div>
  </div></header>
  <main class="wrap" id="view"></main>`;
  const view = document.getElementById('view');
  ({ resumo: viewResumo, lancamentos: viewLancamentos, cartoes: viewCartoes, investimentos: viewInvestimentos, calculadoras: viewCalculadoras, dicas: viewDicas }[r] || viewResumo)(view);
}

// ---------------- Resumo ----------------
function viewResumo(el) {
  const r = resumoAno(S.lancs, S.ano);
  if (!r.L.length) { el.innerHTML = `<div class="empty">Nenhum lançamento em ${S.ano}. Comece pela aba <a href="#lancamentos">Lançamentos</a>.</div>`; return; }
  const cats = porCategoria(r);
  const ds = dicas(r);
  const periodo = r.n === 12 ? `ano de ${S.ano}` : r.n ? `janeiro a ${MESES[r.n - 1].toLowerCase()}` : 'nenhum mês fechado ainda';
  const totalInv = S.invs.reduce((a, i) => a + i.valor_atual, 0);
  const meta = r.mediaSaida * 6;
  el.innerHTML = `
  <section class="hero">
    <div class="hero-main">
      <div class="eyebrow">Saldo de ${S.ano} · ${periodo}</div>
      <div class="hero-num num" style="color:${r.saldo >= 0 ? 'var(--inc)' : 'var(--out)'}">${r.saldo >= 0 ? '+' : '−'}${brl(Math.abs(r.saldo))}</div>
      <p>Vocês receberam <strong>${brl(r.e)}</strong> e gastaram <strong>${brl(r.s)}</strong>.
      ${r.melhor >= 0 ? `${MESES[r.melhor]} foi o melhor mês` : ''}${r.n - r.positivos > 0 ? `; ${r.n - r.positivos} ${r.n - r.positivos > 1 ? 'meses fecharam' : 'mês fechou'} no vermelho.` : '.'}</p>
    </div>
    <div class="facts">
      <div><div class="muted" style="font-size:12px">Gasto médio/mês</div><div class="v num">${brl(r.mediaSaida)}</div></div>
      <div><div class="muted" style="font-size:12px">Melhor mês</div><div class="v num">${r.melhor >= 0 ? `${MES_CURTO[r.melhor]} ${kfmt(r.dif[r.melhor])}` : '—'}</div></div>
      <div><div class="muted" style="font-size:12px">Meses no azul</div><div class="v num">${r.positivos} de ${r.n}</div></div>
      <div><div class="muted" style="font-size:12px">Pior mês</div><div class="v num">${r.pior >= 0 ? `${MES_CURTO[r.pior]} ${kfmt(r.dif[r.pior])}` : '—'}</div></div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2 class="h2">O ano, mês a mês</h2>
      <div class="legend"><span><i style="background:var(--inc)"></i>Entradas</span><span><i style="background:var(--out)"></i>Saídas</span>${r.n < 12 ? '<span>Tracejado = meses ainda não fechados</span>' : ''}</div>
    </div>
    <div class="card">
      <div class="chart-box"><canvas id="ch-ano" role="img" aria-label="Gráfico de entradas e saídas por mês"></canvas></div>
      <div class="month-strip">${MES_CURTO.map((m, i) => `<div><span class="muted">${m}</span><b class="num" style="color:${r.dif[i] >= 0 ? 'var(--inc)' : 'var(--out)'};opacity:${i < r.n ? 1 : 0.55}">${r.E[i] || r.S[i] ? kfmt(r.dif[i]) : '—'}</b></div>`).join('')}</div>
    </div>
  </section>

  <section class="cols">
    <div>
      <h2 class="h2" style="margin-bottom:18px">Para onde foi</h2>
      ${cats.filter((c) => c.valor > 0).map((c, i) => `
        <div class="bar-row"><div class="top"><span style="font-weight:500">${esc(c.nome)}</span><span class="num"><span class="muted">${Math.round(c.pct * 100)}% · </span>${brl(c.valor)}</span></div>
        <div class="track"><div style="width:${Math.max(2, c.valor / cats[0].valor * 100)}%;background:${i === 0 ? 'var(--out)' : 'var(--inc)'}"></div></div></div>`).join('')}
    </div>
    <div>
      <div class="section-head" style="margin-bottom:14px"><h2 class="h2">Onde economizar</h2>${potencial(ds) ? `<span class="muted" style="font-size:14px">até <strong style="color:var(--inc)">${brl(potencial(ds))}/mês</strong></span>` : ''}</div>
      ${tipsHtml(ds.slice(0, 4))}
      ${ds.length > 4 ? `<a href="#dicas" style="color:var(--inc);font-weight:600;font-size:14px">Ver todas as ${ds.length} dicas →</a>` : ''}
    </div>
  </section>

  <section class="feature">
    <div style="flex:1 1 420px;min-width:0">
      <div class="eyebrow">Investimentos</div>
      <h2 class="h2" style="font-size:32px;margin-top:8px">${totalInv ? `${brl(totalInv)} investidos` : 'Comece pela reserva de emergência'}</h2>
      <p class="muted" style="font-size:15px;line-height:1.6;max-width:560px;margin:10px 0 0">Meta sugerida: seis meses do gasto médio, <strong style="color:var(--text)">${brl(meta)}</strong>.
      ${totalInv ? `Vocês já têm ${Math.round(totalInv / meta * 100)}% do caminho.` : r.saldo > 0 ? `Se o saldo deste ano fosse todo para lá, já seriam ${Math.round(r.saldo / meta * 100)}%.` : ''}</p>
    </div>
    <a class="pill green" href="#investimentos" style="text-decoration:none">Abrir Investimentos</a>
  </section>`;

  const n = r.n;
  S.charts.push(new Chart(document.getElementById('ch-ano'), {
    type: 'line',
    data: { labels: MES_CURTO, datasets: [
      { label: 'Entradas', data: r.E, borderColor: css('--inc'), backgroundColor: hexA(css('--inc'), 0.08), fill: true },
      { label: 'Saídas', data: r.S, borderColor: css('--out'), backgroundColor: 'transparent' },
    ].map((d) => ({ ...d, tension: 0.3, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: d.borderColor,
      segment: { borderDash: (ctx) => (ctx.p1DataIndex >= n ? [6, 6] : undefined) } })) },
    options: chartOpts({ money: true }),
  }));
}

function tipsHtml(ds) {
  if (!ds.length) return '<p class="muted">Ainda não há dados suficientes para sugerir economias.</p>';
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
  const table = (rows, tipo) => rows.length ? `
    <div class="table-box"><table>
      <thead><tr><th>Descrição</th><th>Categoria</th><th class="r">Valor</th>${tipo === 'saida' ? '<th class="r">vs. média</th>' : ''}<th class="r"><span style="position:absolute;left:-9999px">Ações</span></th></tr></thead>
      <tbody>${rows.map((l) => {
        const md = media.get(l.descricao) || 0, p = md ? (l.valor / md - 1) * 100 : 0;
        return `<tr><td style="font-weight:500">${esc(l.descricao)}</td><td><span class="tag">${esc(l.categoria)}</span></td><td class="r num" style="font-weight:600">${brl(l.valor, 2)}</td>
        ${tipo === 'saida' ? `<td class="r num" style="font-size:12px;font-weight:600;color:${p >= 30 ? 'var(--out)' : 'var(--muted)'}">${Math.abs(p) < 3 ? '= média' : (p > 0 ? '+' : '−') + Math.round(Math.abs(p)) + '%'}</td>` : ''}
        <td><div class="row-actions"><button data-action="edit-l" data-id="${l.id}" aria-label="Editar ${esc(l.descricao)}">Editar</button><button data-action="del-l" data-id="${l.id}" aria-label="Excluir ${esc(l.descricao)}">Excluir</button></div></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="r num">${brl(rows.reduce((a, l) => a + l.valor, 0), 2)}</td><td colspan="${tipo === 'saida' ? 2 : 1}"></td></tr></tfoot>
    </table></div>` : '<div class="empty">Nada lançado ainda.</div>';

  // Compras importadas: um grupo recolhível por cartão; linhas antigas de total ficam na tabela de sempre.
  const dataCurta = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
  const compras = (ls) => `<div class="table-box"><table>
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th><th class="r"><span style="position:absolute;left:-9999px">Ações</span></th></tr></thead>
      <tbody>${ls.map((l) => `<tr><td class="num muted" style="white-space:nowrap">${dataCurta(l.data_compra)}</td><td style="font-weight:500">${esc(l.descricao)}</td><td><span class="tag">${esc(l.categoria)}</span></td>
        <td class="r num" style="font-weight:600;${l.valor < 0 ? 'color:var(--inc)' : ''}">${brl(l.valor, 2)}</td>
        <td><div class="row-actions"><button data-action="edit-l" data-id="${l.id}" aria-label="Editar ${esc(l.descricao)}">Editar</button><button data-action="del-l" data-id="${l.id}" aria-label="Excluir ${esc(l.descricao)}">Excluir</button></div></td></tr>`).join('')}</tbody>
    </table></div>`;
  const grupos = new Map();
  saiCart.filter((l) => l.cartao).forEach((l) => { if (!grupos.has(l.cartao)) grupos.set(l.cartao, []); grupos.get(l.cartao).push(l); });
  const antigos = saiCart.filter((l) => !l.cartao);
  const cartHtml = !saiCart.length ? '<div class="empty">Nada lançado ainda. Use <strong>Importar fatura</strong> para trazer as compras do Nubank.</div>'
    : (antigos.length ? table(antigos, 'saida') : '') + [...grupos].map(([nome, ls]) => {
      ls.sort((a, b) => String(a.data_compra).localeCompare(String(b.data_compra)) || b.valor - a.valor);
      const tot = ls.reduce((a, l) => a + l.valor, 0);
      const cats = [...ls.reduce((m, l) => m.set(l.categoria, (m.get(l.categoria) || 0) + l.valor), new Map())].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return `<details class="group"><summary>
          <span><span class="nm" style="font-weight:600">${esc(nome)}</span> <span class="muted" style="font-size:13px">· ${ls.length} ${ls.length > 1 ? 'lançamentos' : 'lançamento'}${cats.length ? ' · ' + cats.map(([c, v]) => `${esc(c)} ${brl(v)}`).join(', ') : ''}</span></span>
          <span class="num" style="font-weight:700">${brl(tot, 2)}</span></summary>${compras(ls)}</details>`;
    }).join('');

  el.innerHTML = `
  <section>
    <div class="section-head"><h1 class="h2">Lançamentos de ${S.ano}</h1>
      <div class="actions" style="flex-wrap:wrap">
        <button class="pill" data-action="copiar-mes">Copiar fixos do mês anterior</button>
        <button class="pill" data-action="importar">Importar fatura</button>
        <button class="pill green" data-action="novo-l" data-tipo="saida">+ Novo lançamento</button>
      </div></div>
    <div class="chips" role="group" aria-label="Mês">${MES_CURTO.map((nm, i) => `<button class="chip" data-action="mes" data-mes="${i}" aria-pressed="${i === m}"><span style="font-weight:600;font-size:14px">${nm}</span><small class="num" style="color:${r.dif[i] >= 0 ? 'var(--inc)' : 'var(--out)'}">${r.E[i] || r.S[i] ? kfmt(r.dif[i]) : '—'}</small></button>`).join('')}</div>
  </section>
  <section class="kpis">
    <div class="kpi"><div class="muted" style="font-size:13px">Entradas · ${MESES[m]}</div><div class="v num" style="color:var(--inc)">${brl(r.E[m])}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Fixas · ${MESES[m]}</div><div class="v num" style="color:var(--out)">${brl(totalFixas)}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Cartões · ${MESES[m]}</div><div class="v num" style="color:var(--out)">${brl(totalCart)}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Total saídas · ${MESES[m]}</div><div class="v num" style="color:var(--out)">${brl(r.S[m])}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Sobrou${m >= r.n ? ' (previsto)' : ''}</div><div class="v num">${r.dif[m] >= 0 ? '+' : '−'}${brl(Math.abs(r.dif[m]))}</div></div>
  </section>
  <section>
    <div class="section-head" style="margin-bottom:10px">
      <h2 class="h2" style="font-size:22px">Despesas fixas</h2>
      <span class="num" style="font-size:15px;font-weight:600;color:var(--out)">${brl(totalFixas)}</span>
    </div>
    ${table(saiFixas, 'saida')}
  </section>
  <section>
    <div class="section-head" style="margin-bottom:10px">
      <h2 class="h2" style="font-size:22px">Cartões de crédito</h2>
      <span class="num" style="font-size:15px;font-weight:600;color:var(--out)">${brl(totalCart)}</span>
    </div>
    ${cartHtml}
  </section>
  <section>
    <h2 class="h2" style="font-size:22px;margin-bottom:10px">Entradas</h2>
    ${table(ent, 'entrada')}
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
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.descricao.addEventListener('change', () => {
    const prev = S.lancs.find((x) => x.descricao === f.descricao.value);
    if (prev && !f.categoria.value) { f.categoria.value = prev.categoria; f.tipo.value = prev.tipo; }
  });
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
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
  const novos = prev.filter((l) => !ja.has(l.descricao));
  if (!novos.length) return alert('Nada para copiar: os fixos do mês anterior já estão neste mês.');
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
    <h2 class="h2" style="font-size:24px">Importar fatura</h2>
    <p class="muted" style="margin:0;font-size:14px;line-height:1.5">${esc(fileName)} · ${p.linhas.length} lançamentos${p.ignoradas.length ? ` · ${p.ignoradas.length} pagamento da fatura anterior ignorado` : ''}. Confira as categorias sugeridas antes de salvar — as que você corrigir serão lembradas na próxima fatura.</p>
    <div class="grid3">
      <label class="field">Cartão<input name="cartao" required value="Nubank"></label>
      <label class="field">Lançar no mês<select name="mes">${MESES.map((nm, i) => `<option value="${i + 1}" ${p.mes === i + 1 ? 'selected' : ''}>${nm}</option>`).join('')}</select></label>
      <label class="field">Ano<input name="ano" type="number" required value="${p.ano}"></label>
    </div>
    <div class="imp-box"><table>
      <thead><tr><th style="width:36px"><input type="checkbox" id="imp-all" aria-label="Selecionar todos" checked></th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead>
      <tbody>${p.linhas.map((l, i) => {
        const dup = ja.has(l.import_key);
        return `<tr class="${dup ? 'off' : ''}"><td><input type="checkbox" name="inc" value="${i}" ${dup ? '' : 'checked'} aria-label="Incluir ${esc(l.titulo)}"></td>
          <td class="num muted" style="white-space:nowrap">${dataCurta(l.data)}</td>
          <td>${esc(l.titulo)}${dup ? ' <span class="tag">já importada</span>' : ''}</td>
          <td><input type="text" name="cat${i}" list="dl-cat-imp" value="${esc(l.categoria)}" aria-label="Categoria de ${esc(l.titulo)}"></td>
          <td class="r num" style="font-weight:600;white-space:nowrap;${l.valor < 0 ? 'color:var(--inc)' : ''}">${brl(l.valor, 2)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="imp-total"><span class="muted" id="imp-n"></span><span>Total selecionado: <strong class="num" id="imp-tot"></strong></span></div>
    <label class="check" id="imp-old-wrap" hidden><input type="checkbox" name="rmold" checked><span id="imp-old"></span></label>
    <datalist id="dl-cat-imp">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok" id="imp-ok">Importar</button></div>
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
    incs.forEach((c) => c.closest('tr').classList.toggle('off', !c.checked));
    f.querySelector('#imp-all').checked = sel.length === incs.length;
    f.querySelector('#imp-n').textContent = `${sel.length} de ${incs.length} selecionados`;
    f.querySelector('#imp-tot').textContent = brl(sel.reduce((a, c) => a + p.linhas[+c.value].valor, 0), 2);
    f.querySelector('#imp-ok').textContent = sel.length ? `Importar ${sel.length}` : 'Importar';
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
    ok.disabled = true; ok.textContent = 'Importando…';
    try {
      await db.importLancamentos(rows);
      if (f.rmold.checked && !f.querySelector('#imp-old-wrap').hidden) for (const l of totaisAntigos()) await db.deleteLancamento(l.id);
      modal.close();
      S.lancs = await db.listLancamentos();
      S.ano = ano; S.mes = mes - 1;
      if (route() === 'lancamentos') render(); else location.hash = '#lancamentos';
    } catch (e) { err.textContent = e.message; ok.disabled = false; atualizar(); }
  });
  modal.showModal();
}
modal.addEventListener('close', () => modal.classList.remove('wide'));

// ---------------- Cartões ----------------
function viewCartoes(el) {
  const r = resumoAno(S.lancs, S.ano);
  // Sem mês fechado com fatura (ex.: só a fatura em aberto importada), considera o ano todo.
  let ate = r.n, cartoes = porCartao(r);
  if (cartoes.length && !cartoes.some((c) => c.total > 0)) { ate = Math.max(...cartoes.map((c) => c.meses.findLastIndex((v) => v) + 1)); cartoes = porCartao(r, ate); }
  cartoes.sort((a, b) => b.total - a.total);
  const saidasAte = r.S.slice(0, ate).reduce((a, v) => a + v, 0);
  if (!cartoes.length) { el.innerHTML = '<div class="empty">Nenhum lançamento de cartão neste ano.<br><br><button class="pill green" data-action="importar">Importar fatura do Nubank</button></div>'; return; }
  const catCart = cartaoPorCategoria(r);
  const catPos = catCart.filter((c) => c.valor > 0);
  const totalCart = cartoes.reduce((a, c) => a + c.total, 0);
  const pal = [css('--out'), css('--inc'), '#8A7A55', '#6B7FA8', '#A0627E'];
  el.innerHTML = `
  <section class="hero">
    <div class="hero-main">
      <div class="eyebrow">Cartões de crédito · ${S.ano}</div>
      <div class="hero-num num">${brl(totalCart)}</div>
      <p>${saidasAte ? `Isso é <strong>${Math.round(totalCart / saidasAte * 100)}%</strong> de tudo que saiu no período, uma` : 'Uma'} média de <strong>${brl(totalCart / Math.max(1, ate))}</strong> por mês${ate > r.n ? ' (inclui faturas ainda em aberto)' : ''}.</p>
    </div>
  </section>
  <section>
    <div class="section-head"><h2 class="h2">Fatura por mês</h2><button class="pill" data-action="importar">Importar fatura</button></div>
    <div class="card"><div class="chart-box"><canvas id="ch-cart" role="img" aria-label="Faturas de cartão por mês"></canvas></div></div>
  </section>
  <section>
    <h2 class="h2" style="margin-bottom:12px">Por cartão</h2>
    <div class="table-box"><table>
      <thead><tr><th>Cartão</th><th class="r">Média/mês</th><th class="r">Maior fatura</th><th class="r">Total no período</th><th class="r">% dos cartões</th></tr></thead>
      <tbody>${cartoes.map((c) => { const mx = Math.max(...c.meses.slice(0, ate || 12)); return `<tr><td style="font-weight:500">${esc(c.nome)}</td><td class="r num">${brl(c.mediaAtivos)}</td><td class="r num">${brl(mx)} <span class="muted">(${MES_CURTO[c.meses.indexOf(mx)]})</span></td><td class="r num" style="font-weight:600">${brl(c.total)}</td><td class="r num">${totalCart ? Math.round(c.total / totalCart * 100) : 0}%</td></tr>`; }).join('')}</tbody>
    </table></div>
    ${catCart.length ? '' : '<p class="muted" style="font-size:14px;line-height:1.6;margin-top:16px">Dica: use <strong>Importar fatura</strong> com o CSV do Nubank para ver as compras por categoria (mercado, combustível, farmácia…) em vez de só o total — assim o app mostra exatamente onde cortar.</p>'}
  </section>
  ${catPos.length ? `<section>
    <div class="section-head"><h2 class="h2">No cartão, por categoria</h2><span class="muted" style="font-size:14px">compras importadas em ${S.ano}, incluindo faturas em aberto</span></div>
    ${catPos.map((c, i) => `
      <div class="bar-row"><div class="top"><span style="font-weight:500">${esc(c.nome)}</span><span class="num"><span class="muted">${Math.round(c.pct * 100)}% · </span>${brl(c.valor, 2)}</span></div>
      <div class="track"><div style="width:${Math.max(2, c.valor / catPos[0].valor * 100)}%;background:${i === 0 ? 'var(--out)' : 'var(--inc)'}"></div></div></div>`).join('')}
    ${catCart.some((c) => c.valor < 0) ? `<p class="muted" style="font-size:13px;margin:4px 0 0">Estornos e créditos no período: ${brl(-catCart.filter((c) => c.valor < 0).reduce((a, c) => a + c.valor, 0), 2)}.</p>` : ''}
  </section>` : ''}`;
  S.charts.push(new Chart(document.getElementById('ch-cart'), {
    type: 'bar',
    data: { labels: MES_CURTO, datasets: cartoes.map((c, i) => ({ label: c.nome, data: c.meses, backgroundColor: pal[i % pal.length], borderRadius: 4, maxBarThickness: 44 })) },
    options: chartOpts({ money: true, stacked: true, legend: true }),
  }));
}

// ---------------- Investimentos ----------------
function viewInvestimentos(el) {
  const r = resumoAno(S.lancs, S.ano);
  const apl = S.invs.reduce((a, i) => a + i.valor_aplicado, 0);
  const atual = S.invs.reduce((a, i) => a + i.valor_atual, 0);
  const meta = r.mediaSaida * 6;
  const pct = meta ? Math.min(100, atual / meta * 100) : 0;
  el.innerHTML = `
  <section class="section-head" style="margin:0">
    <h1 class="h2">Investimentos</h1>
    <button class="pill green" data-action="novo-i">+ Novo investimento</button>
  </section>
  <section class="kpis">
    <div class="kpi"><div class="muted" style="font-size:13px">Valor atual</div><div class="v num">${brl(atual)}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Total aplicado</div><div class="v num">${brl(apl)}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Rendimento</div><div class="v num" style="color:${atual - apl >= 0 ? 'var(--inc)' : 'var(--out)'}">${atual - apl >= 0 ? '+' : '−'}${brl(Math.abs(atual - apl))}</div></div>
  </section>
  <section class="feature" style="display:block">
    <div class="eyebrow">Meta · reserva de emergência</div>
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:12px;margin-top:8px">
      <h2 class="h2">${brl(atual)} de ${brl(meta)}</h2><span class="num" style="font-weight:600">${Math.round(pct)}%</span>
    </div>
    <div class="track" style="height:12px;margin-top:14px;background:var(--surface)"><div style="width:${pct}%"></div></div>
    <p class="muted" style="font-size:14px;line-height:1.6;margin:12px 0 0">Seis meses do gasto médio de ${S.ano} (${brl(r.mediaSaida)}/mês). Guardar ${brl(meta / 24)} por mês completa a meta em dois anos.</p>
  </section>
  ${S.invs.length ? `
  <section class="cols">
    <div style="flex:2 1 520px"><div class="table-box"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th class="r">Aplicado</th><th class="r">Atual</th><th class="r"><span style="position:absolute;left:-9999px">Ações</span></th></tr></thead>
      <tbody>${S.invs.map((i) => `<tr><td style="font-weight:500">${esc(i.nome)}<div class="muted" style="font-size:12px">${esc(i.instituicao || '')}${i.data_aplicacao ? ' · ' + new Date(i.data_aplicacao + 'T12:00').toLocaleDateString('pt-BR') : ''}</div></td><td><span class="tag">${esc(i.tipo)}</span></td><td class="r num">${brl(i.valor_aplicado, 2)}</td><td class="r num" style="font-weight:600">${brl(i.valor_atual, 2)}</td><td><div class="row-actions"><button data-action="edit-i" data-id="${i.id}">Editar</button><button data-action="del-i" data-id="${i.id}">Excluir</button></div></td></tr>`).join('')}</tbody>
    </table></div></div>
    <div style="flex:1 1 300px" class="card"><h2 style="font-size:16px;font-weight:600;margin-bottom:12px">Por tipo</h2><div class="chart-box" style="height:260px"><canvas id="ch-inv" role="img" aria-label="Investimentos por tipo"></canvas></div></div>
  </section>` : '<div class="empty">Nenhum investimento cadastrado ainda. Clique em “Novo investimento” para registrar o primeiro aporte.</div>'}`;
  if (S.invs.length) {
    const m = new Map();
    S.invs.forEach((i) => m.set(i.tipo, (m.get(i.tipo) || 0) + i.valor_atual));
    S.charts.push(new Chart(document.getElementById('ch-inv'), {
      type: 'doughnut',
      data: { labels: [...m.keys()], datasets: [{ data: [...m.values()], backgroundColor: [css('--inc'), css('--out'), '#8A7A55', '#6B7FA8', '#A0627E', '#5E8C8A', '#9A9284'], borderColor: css('--surface'), borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: css('--muted'), boxWidth: 12, font: { family: 'Inter' } } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${brl(c.parsed)}` } } } },
    }));
  }
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
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
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
  <section>
    <div class="section-head"><h1 class="h2">Calculadoras</h1><div style="font-size:14px;line-height:1.6">${fonte}</div></div>
    <div class="chips" role="group" aria-label="Calculadora" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      ${CALCS.map(([id, nome, sub]) => `<button class="chip" data-action="calc" data-calc="${id}" aria-pressed="${id === S.calc}"><span style="font-weight:600;font-size:14px">${nome}</span><small class="muted">${sub}</small></button>`).join('')}
    </div>
  </section>
  <section class="cols" style="gap:32px">
    <form class="card calc-form" id="calc-form" novalidate style="flex:1 1 300px;display:flex;flex-direction:column;gap:14px;align-self:flex-start"></form>
    <div id="calc-out" style="flex:2 1 480px;min-width:0;display:flex;flex-direction:column;gap:20px"></div>
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
      <tbody>${linhas.map((l) => `<tr${l === melhor ? ' style="background:var(--surface)"' : ''}>
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
  <section class="hero"><div class="hero-main">
    <div class="eyebrow">Dicas para ${S.ano}</div>
    <div class="hero-num num" style="color:var(--inc)">${brl(potencial(ds))}<span class="muted" style="font-size:0.35em">/mês</span></div>
    <p>É quanto dá para economizar seguindo as sugestões abaixo, calculadas a partir dos lançamentos de vocês. Em um ano, seriam <strong>${brl(potencial(ds) * 12)}</strong>.</p>
  </div></section>
  <section class="cols">
    <div style="flex:3 1 560px"><h2 class="h2" style="margin-bottom:14px">Com base nos seus dados</h2>${tipsHtml(ds)}</div>
    <div style="flex:2 1 340px">
      <h2 class="h2" style="margin-bottom:14px">Hábitos que ajudam</h2>
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
      x: { stacked, grid: { display: false }, ticks: { color: tick, font: { family: 'Inter' } } },
      y: { stacked, grid: { color: grid }, border: { display: false }, ticks: { color: tick, font: { family: 'Inter' }, callback: (v) => (money ? 'R$ ' + (v / 1000).toLocaleString('pt-BR') + 'k' : v) } },
    },
    plugins: {
      legend: { display: !!legend, position: 'bottom', labels: { color: tick, boxWidth: 12, font: { family: 'Inter' } } },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${brl(c.parsed.y, 2)}` } },
    },
  };
}

// ---------------- eventos ----------------
app.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'tema') {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('nossa-casa-tema', t); } catch (e) { /* ok */ }
    render();
  } else if (a === 'sair') {
    await db.signOut(); S.user = null; renderLogin();
  } else if (a === 'calc') {
    S.calc = b.dataset.calc; render();
  } else if (a === 'mes') {
    S.mes = +b.dataset.mes; render();
  } else if (a === 'novo-l') {
    lancForm({ tipo: b.dataset.tipo, ano: S.ano, mes: (S.mes ?? 0) + 1 });
  } else if (a === 'edit-l') {
    lancForm(S.lancs.find((l) => l.id === +b.dataset.id));
  } else if (a === 'del-l') {
    const l = S.lancs.find((x) => x.id === +b.dataset.id);
    if (confirm(`Excluir "${l.descricao}" de ${MESES[l.mes - 1]}?`)) { await db.deleteLancamento(l.id); S.lancs = await db.listLancamentos(); render(); }
  } else if (a === 'copiar-mes') {
    copiarMesAnterior();
  } else if (a === 'importar') {
    escolherFatura();
  } else if (a === 'novo-i') {
    invForm({ tipo: TIPOS_INV[0] });
  } else if (a === 'edit-i') {
    invForm(S.invs.find((i) => i.id === +b.dataset.id));
  } else if (a === 'del-i') {
    const i = S.invs.find((x) => x.id === +b.dataset.id);
    if (confirm(`Excluir "${i.nome}"?`)) { await db.deleteInvestimento(i.id); S.invs = await db.listInvestimentos(); render(); }
  } else if (a === 'reset-demo') {
    if (confirm('Voltar aos dados originais da planilha? O que você lançou no modo demonstração será apagado.')) { db.resetDemo(); await loadData(); render(); }
  }
});
app.addEventListener('change', (ev) => {
  if (ev.target.dataset.action === 'ano') { S.ano = +ev.target.value; S.mes = null; render(); }
});
window.addEventListener('hashchange', () => { if (S.user) { render(); window.scrollTo(0, 0); } });

boot();
