import * as db from './data.js';
import { NOME_CASA } from './config.js';
import { MESES, MES_CURTO, brl, kfmt, resumoAno, porCategoria, porItem, dicas, potencial, closedMonths } from './insights.js';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const S = { user: null, lancs: [], invs: [], ano: new Date().getFullYear(), mes: null, charts: [] };
const TABS = [['resumo', 'Resumo'], ['lancamentos', 'Lançamentos'], ['cartoes', 'Cartões'], ['investimentos', 'Investimentos'], ['dicas', 'Dicas']];
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
  ({ resumo: viewResumo, lancamentos: viewLancamentos, cartoes: viewCartoes, investimentos: viewInvestimentos, dicas: viewDicas }[r] || viewResumo)(view);
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
      ${cats.map((c, i) => `
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
  const sai = doMes.filter((l) => l.tipo === 'saida').sort((a, b) => b.valor - a.valor);
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

  el.innerHTML = `
  <section>
    <div class="section-head"><h1 class="h2">Lançamentos de ${S.ano}</h1>
      <div class="actions" style="flex-wrap:wrap">
        <button class="pill" data-action="copiar-mes">Copiar fixos do mês anterior</button>
        <button class="pill green" data-action="novo-l" data-tipo="saida">+ Novo lançamento</button>
      </div></div>
    <div class="chips" role="group" aria-label="Mês">${MES_CURTO.map((nm, i) => `<button class="chip" data-action="mes" data-mes="${i}" aria-pressed="${i === m}"><span style="font-weight:600;font-size:14px">${nm}</span><small class="num" style="color:${r.dif[i] >= 0 ? 'var(--inc)' : 'var(--out)'}">${r.E[i] || r.S[i] ? kfmt(r.dif[i]) : '—'}</small></button>`).join('')}</div>
  </section>
  <section class="kpis">
    <div class="kpi"><div class="muted" style="font-size:13px">Entradas · ${MESES[m]}</div><div class="v num" style="color:var(--inc)">${brl(r.E[m])}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Saídas · ${MESES[m]}</div><div class="v num" style="color:var(--out)">${brl(r.S[m])}</div></div>
    <div class="kpi"><div class="muted" style="font-size:13px">Sobrou${m >= r.n ? ' (previsto)' : ''}</div><div class="v num">${r.dif[m] >= 0 ? '+' : '−'}${brl(Math.abs(r.dif[m]))}</div></div>
  </section>
  <section class="cols">
    <div style="flex:1 1 100%"><h2 class="h2" style="font-size:22px;margin-bottom:10px">Saídas</h2>${table(sai, 'saida')}</div>
    <div style="flex:1 1 100%"><h2 class="h2" style="font-size:22px;margin-bottom:10px">Entradas</h2>${table(ent, 'entrada')}</div>
  </section>`;
}

function lancForm(l) {
  const cats = [...new Set(S.lancs.map((x) => x.categoria))].sort();
  const descs = [...new Set(S.lancs.map((x) => x.descricao))].sort();
  modal.innerHTML = `
  <form method="dialog" id="f-l">
    <h2 class="h2" style="font-size:24px">${l.id ? 'Editar' : 'Novo'} lançamento</h2>
    <input type="hidden" name="id" value="${l.id || ''}">
    <div class="grid2">
      <label class="field">Tipo<select name="tipo"><option value="saida" ${l.tipo === 'saida' ? 'selected' : ''}>Saída</option><option value="entrada" ${l.tipo === 'entrada' ? 'selected' : ''}>Entrada</option></select></label>
      <label class="field">Valor (R$)<input name="valor" type="number" step="0.01" min="0.01" required value="${l.valor ?? ''}"></label>
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
  const prev = S.lancs.filter((l) => l.ano === pa && l.mes === pm && l.tipo === 'saida' && !/cart|outr/i.test(l.categoria));
  const ja = new Set(S.lancs.filter((l) => l.ano === S.ano && l.mes === m).map((l) => l.descricao));
  const novos = prev.filter((l) => !ja.has(l.descricao));
  if (!novos.length) return alert('Nada para copiar: os fixos do mês anterior já estão neste mês.');
  if (!confirm(`Copiar ${novos.length} contas fixas de ${MESES[pm - 1]} para ${MESES[m - 1]}? Depois é só ajustar os valores.`)) return;
  for (const l of novos) await db.saveLancamento({ ...l, id: null, ano: S.ano, mes: m });
  S.lancs = await db.listLancamentos();
  render();
}

// ---------------- Cartões ----------------
function viewCartoes(el) {
  const r = resumoAno(S.lancs, S.ano);
  const cartoes = porItem(r).filter((it) => /cart/i.test(it.categoria)).sort((a, b) => b.total - a.total);
  if (!cartoes.length) { el.innerHTML = '<div class="empty">Nenhum lançamento na categoria "Cartões de crédito" neste ano.</div>'; return; }
  const totalCart = cartoes.reduce((a, c) => a + c.total, 0);
  const pal = [css('--out'), css('--inc'), '#8A7A55', '#6B7FA8', '#A0627E'];
  el.innerHTML = `
  <section class="hero">
    <div class="hero-main">
      <div class="eyebrow">Cartões de crédito · ${S.ano}</div>
      <div class="hero-num num">${brl(totalCart)}</div>
      <p>Isso é <strong>${Math.round(totalCart / r.s * 100)}%</strong> de tudo que saiu no período, uma média de <strong>${brl(totalCart / Math.max(1, r.n))}</strong> por mês.</p>
    </div>
  </section>
  <section>
    <div class="section-head"><h2 class="h2">Fatura por mês</h2></div>
    <div class="card"><div class="chart-box"><canvas id="ch-cart" role="img" aria-label="Faturas de cartão por mês"></canvas></div></div>
  </section>
  <section>
    <h2 class="h2" style="margin-bottom:12px">Por cartão</h2>
    <div class="table-box"><table>
      <thead><tr><th>Cartão</th><th class="r">Média/mês</th><th class="r">Maior fatura</th><th class="r">Total no período</th><th class="r">% dos cartões</th></tr></thead>
      <tbody>${cartoes.map((c) => { const mx = Math.max(...c.meses.slice(0, r.n || 12)); return `<tr><td style="font-weight:500">${esc(c.nome)}</td><td class="r num">${brl(c.mediaAtivos)}</td><td class="r num">${brl(mx)} <span class="muted">(${MES_CURTO[c.meses.indexOf(mx)]})</span></td><td class="r num" style="font-weight:600">${brl(c.total)}</td><td class="r num">${Math.round(c.total / totalCart * 100)}%</td></tr>`; }).join('')}</tbody>
    </table></div>
    <p class="muted" style="font-size:14px;line-height:1.6;margin-top:16px">Dica: lance as compras do cartão por categoria (mercado, combustível, farmácia…) em vez de só o total da fatura — assim o app mostra exatamente onde cortar.</p>
  </section>`;
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
