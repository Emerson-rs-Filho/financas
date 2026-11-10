// Núcleo do Nossa Casa: login, tela inicial com as áreas da casa, rotas e estrutura de navegação.
// Cada área (módulo) vive em js/<id>/index.js e é registrada em js/modulos.js.
import * as db from './data.js';
import { modal, esc, ico, brand } from './ui.js';
import { MODULOS, modulo } from './modulos.js';

const app = document.getElementById('app');
// contexto entregue aos módulos
const C = { user: null, mod: null, def: null, aba: null, render, irPara };
const carregados = new Set();
const ABAS_ANTIGAS = ['resumo', 'lancamentos', 'cartoes', 'investimentos', 'calculadoras', 'dicas'];

// ---------------- rotas: #inicio · #<modulo> · #<modulo>/<aba> ----------------
function rota() {
  let h = location.hash.replace(/^#\/?/, '');
  if (ABAS_ANTIGAS.includes(h)) { h = `financas/${h}`; history.replaceState(null, '', `#${h}`); } // links antigos
  const [m, a] = h.split('/');
  return { m: m || 'inicio', a };
}
function irPara(r) {
  if (location.hash === `#${r}`) render(); else location.hash = `#${r}`;
}

// ---------------- início ----------------
async function boot() {
  C.user = await db.currentUser();
  if (!C.user) return renderLogin();
  render();
}

function renderLogin() {
  app.innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brand">${brand()}</div>
      <h1>a casa toda,<br>num lugar só.</h1>
      <p>Finanças, calendário, lista de compras e o que mais a casa precisar, para vocês dois.</p>
    </section>
    <section class="login-form">
      <form id="login-form" novalidate>
        <h2 class="h2" style="font-size:26px">entrar</h2>
        ${db.DEMO ? '<p class="muted" style="margin:0;font-size:13px;line-height:1.5">Modo demonstração: qualquer e-mail e senha funcionam. Configure o Supabase para ativar o login de verdade.</p>' : ''}
        <label class="field">E-mail<input type="email" name="email" autocomplete="username" required></label>
        <label class="field">Senha<input type="password" name="password" autocomplete="current-password" required></label>
        <div class="error" id="login-err" role="alert"></div>
        <button class="btn lime" type="submit" style="min-height:52px;font-size:15px">Entrar</button>
      </form>
    </section>
  </div>`;
  document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const err = document.getElementById('login-err');
    err.textContent = '';
    try {
      C.user = await db.signIn(f.get('email'), f.get('password'));
      render();
    } catch (e) { err.textContent = e.message; }
  });
}

// ---------------- desenho ----------------
let geracao = 0;
async function render() {
  if (!C.user) return renderLogin();
  const vez = ++geracao;
  const { m, a } = rota();
  const def = modulo(m);
  if (!def) { C.mod = C.def = C.aba = null; return renderInicio(); }
  if (def.status !== 'ativo') { C.mod = C.def = C.aba = null; return renderEmBreve(def); }
  const mod = await def.load();
  if (vez !== geracao) return;
  C.mod = mod; C.def = def;
  C.aba = mod.abas.some(([id]) => id === a) ? a : mod.abas[0][0];
  if (!carregados.has(def.id)) {
    app.innerHTML = '<main class="wrap"><p class="muted">Carregando…</p></main>';
    try { await mod.carregar(C); } catch (e) {
      app.innerHTML = `<main class="wrap"><div class="empty">Não foi possível carregar ${esc(def.nome)}: ${esc(e.message)}<br><br><a href="#inicio">voltar ao início</a></div></main>`;
      return;
    }
    if (vez !== geracao) return;
    carregados.add(def.id);
  }
  estrutura(def, mod);
  mod.render(C.aba, document.getElementById('view'), C);
}

const demoBar = () => (db.DEMO ? '<div class="demo-bar">Modo demonstração: os dados ficam só neste navegador. <button data-action="reset-demo">Restaurar dados da planilha</button></div>' : '');
const nomeUsuario = () => {
  const n = (C.user && (C.user.user_metadata?.name || (C.user.email || '').split('@')[0])) || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
};

function renderInicio() {
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  app.innerHTML = `${demoBar()}
  <div class="hub">
    <header class="hub-top"><a class="brand" href="#inicio">${brand()}</a>
      <div class="actions"><button class="btn icon" data-action="tema" aria-label="Alternar modo claro/escuro">${ico('tema', 18)}</button>
        <button class="btn icon" data-action="sair" aria-label="Sair">${ico('sair', 18)}</button></div></header>
    <section class="hub-hello">
      <span class="eyebrow">${esc(hoje)}</span>
      <h1>olá${nomeUsuario() ? `, ${esc(nomeUsuario().toLowerCase())}` : ''}</h1>
      <p class="muted">para onde vamos hoje?</p>
    </section>
    <nav class="mod-grid" aria-label="Áreas da casa">
      ${MODULOS.map((x) => `
      <a class="mod-card ${x.status === 'ativo' ? 'on' : 'soon'}" href="#${x.id}">
        <span class="mod-ic">${ico(x.icone, 24)}</span>
        <span class="mod-txt"><span class="mod-nm">${esc(x.nome)}</span><span class="mod-ds">${esc(x.desc)}</span></span>
        ${x.status === 'ativo' ? `<span class="mod-go">${ico('seta', 20)}</span>` : '<span class="badge">em breve</span>'}
      </a>`).join('')}
    </nav>
  </div>`;
}

function renderEmBreve(def) {
  app.innerHTML = `${demoBar()}
  <div class="hub">
    <header class="hub-top"><a class="btn" href="#inicio">${ico('voltar', 16)}início</a></header>
    <section class="tile soon-page">
      <span class="mod-ic big-ic">${ico(def.icone, 32)}</span>
      <h1>${esc(def.nome.toLowerCase())}</h1>
      <p class="muted">${esc(def.desc)}.</p>
      <span class="badge lime">em breve</span>
      <a class="btn lime" href="#inicio" style="margin-top:8px">voltar ao início</a>
    </section>
  </div>`;
}

// menu lateral (computador) + topo e barra inferior (celular)
function estrutura(def, mod) {
  const cur = (id) => (id === C.aba ? 'aria-current="page"' : '');
  const extra = (id) => (mod.topo ? mod.topo(C, id) : '');
  const barra = mod.barra || mod.abas.slice(0, 5).map(([id]) => id);
  const itemBarra = (it) => {
    if (typeof it === 'string') {
      const aba = mod.abas.find(([id]) => id === it);
      return `<a href="#${def.id}/${it}" aria-label="${esc(aba[1])}" ${cur(it)}>${ico(aba[2], 22)}</a>`;
    }
    return `<button data-action="${it.acao}" ${it.attrs || ''} aria-label="${esc(it.rotulo)}">${ico(it.icone, 24)}</button>`;
  };
  app.innerHTML = `${demoBar()}
  <div class="shell">
    <aside class="side">
      <a class="brand" href="#inicio">${brand()}</a>
      <div class="mod-switch" role="group" aria-label="Áreas da casa">
        <a class="ms-i" href="#inicio" aria-label="Início" title="Início">${ico('inicio', 18)}</a>
        ${MODULOS.map((x) => `<a class="ms-i ${x.status === 'ativo' ? '' : 'soon'}" href="#${x.id}" title="${esc(x.nome)}${x.status === 'ativo' ? '' : ' (em breve)'}" aria-label="${esc(x.nome)}" ${x.id === def.id ? 'aria-current="page"' : ''}>${ico(x.icone, 18)}</a>`).join('')}
      </div>
      <div class="side-mod">${esc(def.nome.toLowerCase())}</div>
      <nav aria-label="${esc(def.nome)}">${mod.abas.map(([id, nome, ic]) => `<a class="nav-a" href="#${def.id}/${id}" ${cur(id)}>${ico(ic)}${esc(nome)}</a>`).join('')}</nav>
      <div class="side-foot">${extra('ano-d')}
        <button class="btn icon" data-action="tema" aria-label="Alternar modo claro/escuro">${ico('tema', 18)}</button>
        <button class="btn icon" data-action="sair" aria-label="Sair">${ico('sair', 18)}</button></div>
    </aside>
    <div class="content">
      <header class="mtop">
        <a class="mtop-mod" href="#inicio" aria-label="Voltar ao início">${ico('inicio', 18)}<span>${esc(def.nome.toLowerCase())}</span></a>
        <div class="actions">${extra('ano-m')}<button class="btn icon" data-action="menu" aria-label="Mais opções">${ico('menu')}</button></div>
      </header>
      <main class="view" id="view"></main>
    </div>
  </div>
  <nav class="bnav" aria-label="${esc(def.nome)}" style="grid-template-columns:repeat(${barra.length},minmax(0,1fr))">${barra.map(itemBarra).join('')}</nav>`;
}

// ---------------- tema, menu "mais" (celular), sair ----------------
function toggleTema() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'dark' ? '#141416' : '#ECECE8';
  try { localStorage.setItem('nossa-casa-tema', t); } catch (e) { /* ok */ }
  render();
}

function menuSheet() {
  const mod = C.mod, def = C.def;
  const naBarra = new Set((mod && mod.barra || []).filter((x) => typeof x === 'string'));
  const outras = mod ? mod.abas.filter(([id]) => !naBarra.has(id)) : [];
  modal.innerHTML = `
  <form method="dialog" class="menu-sheet">
    <div style="display:flex;justify-content:space-between;align-items:center;padding-left:14px"><h2 class="h2">mais opções</h2>
      <button class="btn icon" value="cancel" aria-label="Fechar">${ico('fechar', 18)}</button></div>
    ${outras.length ? `<div class="sheet-sec"><span class="eyebrow">${esc(def.nome.toLowerCase())}</span>
      ${outras.map(([id, nome, ic]) => `<a class="nav-a" href="#${def.id}/${id}" ${id === C.aba ? 'aria-current="page"' : ''}>${ico(ic)}${esc(nome)}</a>`).join('')}</div>` : ''}
    <div class="sheet-sec"><span class="eyebrow">áreas da casa</span>
      <a class="nav-a" href="#inicio">${ico('inicio')}Início</a>
      ${MODULOS.map((x) => `<a class="nav-a" href="#${x.id}" ${def && x.id === def.id ? 'aria-current="page"' : ''}>${ico(x.icone)}${esc(x.nome)}${x.status === 'ativo' ? '' : ' <span class="tag" style="margin-left:auto">em breve</span>'}</a>`).join('')}</div>
    <div class="sheet-sec">
      <button class="nav-a" value="tema">${ico('tema')}Modo ${document.documentElement.dataset.theme === 'dark' ? 'claro' : 'escuro'}</button>
      <button class="nav-a" value="sair">${ico('sair')}Sair</button></div>
  </form>`;
  modal.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => modal.close()));
  modal.querySelector('form').addEventListener('submit', (ev) => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'tema') toggleTema();
    else if (v === 'sair') sair();
  });
  modal.showModal();
}

async function sair() {
  await db.signOut();
  C.user = null; C.mod = C.def = C.aba = null;
  carregados.clear();
  history.replaceState(null, '', '#inicio');
  renderLogin();
}

// ---------------- eventos ----------------
app.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'tema') toggleTema();
  else if (a === 'menu') menuSheet();
  else if (a === 'sair') sair();
  else if (a === 'reset-demo') {
    if (confirm('Voltar aos dados originais da planilha? O que você lançou no modo demonstração será apagado.')) { db.resetDemo(); carregados.clear(); render(); }
  } else if (C.mod && C.mod.acao) C.mod.acao(a, b, C);
});
app.addEventListener('change', (ev) => { if (C.mod && C.mod.mudou) C.mod.mudou(ev, C); });
window.addEventListener('hashchange', () => { if (C.user) { render(); window.scrollTo(0, 0); } });

boot();
