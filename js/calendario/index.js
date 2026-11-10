// Módulo Calendário: cada pessoa conecta o próprio Google Agenda, escolhe o que compartilhar
// e a casa toda vê os compromissos juntos (e pode criar eventos nas agendas liberadas).
import * as db from '../data.js';
import { modal, esc, ico } from '../ui.js';

let C = { render() {}, irPara() {} };
let meuId = null;
let contas = [];
let agendas = [];
let eventos = [];
let mes = inicioMes(new Date()); // mês mostrado na aba "Mês"
let diaSel = null;               // 'AAAA-MM-DD' escolhido na grade
let dias = 30;                   // quantos dias a aba "Agenda" mostra
let aviso = null;                // { tipo: 'ok' | 'erro', txt }
let sincronizando = false;
let cancelar = null;

const CORES = ['#8E8EF5', '#F5A35C', '#5EC8C8', '#E98AB8', '#9BBF4A', '#B0B07A'];
const HEX = /^#[0-9a-f]{6}$/i;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deYmd = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
function inicioMes(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hoje0 = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
const inicioGrade = () => somaDias(mes, -mes.getDay());
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataLonga = (d) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const dataCurta = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function janela() {
  const h = hoje0();
  const de = new Date(Math.min(inicioGrade(), h));
  const ate = new Date(Math.max(somaDias(inicioGrade(), 42), somaDias(h, dias)));
  return [de.toISOString(), ate.toISOString()];
}

// ---------- dados ----------
async function recarregar() {
  try {
    ({ meuId, contas, agendas, eventos } = await db.calCarregar(...janela()));
  } catch (e) {
    aviso = { tipo: 'erro', txt: e.message };
  }
  pintar();
}

function pintar() {
  const el = document.getElementById('view');
  if (el && C.def && C.def.id === 'calendario') desenhar(C.aba, el);
}

async function sincronizar(silencioso) {
  if (sincronizando) return;
  sincronizando = true;
  if (!silencioso) pintar();
  try {
    const r = await db.calSync();
    if (r && r.erros && r.erros.length && !silencioso) aviso = { tipo: 'erro', txt: `Algumas agendas não sincronizaram: ${r.erros.join(' · ')}` };
  } catch (e) {
    if (!silencioso) aviso = { tipo: 'erro', txt: e.message };
  }
  sincronizando = false;
  await recarregar();
}

// Volta da tela do Google: ?gcal=ok | ?gcal=erro&motivo=…
function lerRetorno() {
  const q = new URLSearchParams(location.search);
  const r = q.get('gcal');
  if (!r) return false;
  const motivos = {
    cancelado: 'A conexão com o Google foi cancelada.',
    permissao: 'Para funcionar, deixe marcadas as permissões de ver suas agendas e de ver e editar eventos na tela do Google.',
    expirou: 'O pedido de conexão expirou. Tente de novo.',
  };
  aviso = r === 'ok'
    ? { tipo: 'ok', txt: 'Conta Google conectada! Agora marque quais agendas a família pode ver.' }
    : { tipo: 'erro', txt: motivos[q.get('motivo')] || 'Não foi possível conectar ao Google. Tente de novo.' };
  history.replaceState(null, '', location.pathname + location.hash);
  return r === 'ok';
}

// ---------- agendas, pessoas e eventos ----------
const minha = () => contas.find((c) => c.user_id === meuId);
const agDe = (e) => agendas.find((a) => a.id === e.agenda_id);
const corAg = (a) => {
  if (!a) return '#9A9AA0';
  const c = a.cor || a.cor_google;
  return c && HEX.test(c) ? c : CORES[Math.max(0, agendas.indexOf(a)) % CORES.length];
};
const donoNome = (a) => { const c = a && contas.find((x) => x.user_id === a.user_id); return c ? c.nome : ''; };
// "Trabalho · Ana"; sem repetir quando a agenda já tem o nome da pessoa (ou é minha, no formulário)
function rotuloAg(a, comDono = a && a.user_id !== meuId) {
  if (!a) return '';
  const dono = donoNome(a);
  return comDono && dono && dono.toLowerCase() !== a.nome.toLowerCase() ? `${a.nome} · ${dono}` : a.nome;
}
const podeCriarEm =(a) => a.pode_escrever && a.compartilhada && (a.user_id === meuId || a.familia_pode_criar);

const diaIni = (e) => ymd(new Date(e.inicio));
function diaFim(e) {
  const i = new Date(e.inicio);
  const f = e.dia_inteiro ? somaDias(new Date(e.fim), -1) : new Date(new Date(e.fim).getTime() - 1); // fim é exclusivo
  return ymd(f < i ? i : f);
}
const doDia = (k) => eventos
  .filter((e) => diaIni(e) <= k && k <= diaFim(e))
  .sort((a, b) => (b.dia_inteiro - a.dia_inteiro) || (new Date(a.inicio) - new Date(b.inicio)));

function hora(e, k) {
  if (e.dia_inteiro) return 'dia todo';
  const ini = diaIni(e), fim = diaFim(e);
  if (ini === fim) return `${hhmm(new Date(e.inicio))}–${hhmm(new Date(e.fim))}`;
  if (k === ini) return `a partir de ${hhmm(new Date(e.inicio))}`;
  if (k === fim) return `até ${hhmm(new Date(e.fim))}`;
  return 'dia todo';
}

function quandoEv(e) {
  const i = new Date(e.inicio), ini = diaIni(e), fim = diaFim(e);
  if (e.dia_inteiro) return ini === fim ? `${dataLonga(i)} · dia todo` : `${dataCurta(i)} a ${dataCurta(deYmd(fim))} · dia todo`;
  const f = new Date(e.fim);
  return ini === fim ? `${dataLonga(i)} · ${hhmm(i)}–${hhmm(f)}` : `${dataCurta(i)} ${hhmm(i)} → ${dataCurta(f)} ${hhmm(f)}`;
}

function haQuanto(ts) {
  if (!ts) return 'nunca';
  const min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

// ---------- pedaços de tela ----------
function linhaEv(e, k) {
  const a = agDe(e);
  return `
    <button class="cal-ev" data-action="ver-ev" data-id="${e.id}">
      <span class="cal-hora">${esc(hora(e, k))}</span>
      <span class="cal-dot" style="background:${corAg(a)}"></span>
      <span class="cal-txt"><span class="nm">${esc(e.titulo)}</span>${e.local ? `<span class="muted cal-loc">${esc(e.local)}</span>` : ''}</span>
      ${donoNome(a) ? `<span class="tag">${esc(donoNome(a))}</span>` : ''}
    </button>`;
}

function avisoHtml() {
  if (!aviso) return '';
  return `<div class="cal-aviso ${aviso.tipo}" role="status"><p>${esc(aviso.txt)}</p>
    <button class="btn icon" data-action="fechar-aviso" aria-label="Fechar aviso">${ico('fechar', 16)}</button></div>`;
}

function cabecalho(titulo, extra = '') {
  const eu = minha();
  const sync = eu ? `<button class="btn" data-action="sync" ${sincronizando ? 'disabled' : ''} title="Última sincronização: ${esc(haQuanto(eu.ultimo_sync))}">
      ${ico('refresh', 16)}<span class="lbl">${sincronizando ? 'sincronizando…' : esc(haQuanto(eu.ultimo_sync))}</span></button>` : '';
  return `<div class="page-head"><h1>${esc(titulo)}</h1>
    <div class="actions cal-top">${extra}${sync}<button class="btn lime" data-action="novo-evento">${ico('plus', 16)}<span class="lbl">novo evento</span></button></div></div>`;
}

const nadaCompartilhado = () => !agendas.some((a) => a.compartilhada);
const vazioConectar = () => `<div class="empty">Nenhuma agenda compartilhada ainda.<br>
  <a href="#calendario/config">Conecte seu Google Agenda</a> e escolha o que a família pode ver.</div>`;

// ---------- abas ----------
function telaAgenda() {
  const h = hoje0();
  const blocos = [];
  for (let i = 0; i < dias; i++) {
    const d = somaDias(h, i);
    const k = ymd(d);
    const evs = doDia(k);
    if (!evs.length) continue;
    const nome = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
    blocos.push(`
      <section class="tile">
        <div class="tile-head"><h2>${esc(nome)}</h2><span class="muted" style="font-size:12px">${esc(d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }))}</span></div>
        <div class="cal-list">${evs.map((e) => linhaEv(e, k)).join('')}</div>
      </section>`);
  }
  return `${cabecalho('calendário')}
    ${nadaCompartilhado() ? vazioConectar()
      : blocos.length ? blocos.join('') : `<div class="empty">Nada marcado nos próximos ${dias} dias.</div>`}
    ${!nadaCompartilhado() && dias < 365 ? `<button class="btn" data-action="mais" style="align-self:center">mostrar mais 30 dias</button>` : ''}`;
}

function telaMes() {
  const ini = inicioGrade();
  const hk = ymd(new Date());
  if (!diaSel || deYmd(diaSel).getMonth() !== mes.getMonth()) {
    diaSel = new Date().getMonth() === mes.getMonth() && new Date().getFullYear() === mes.getFullYear() ? hk : ymd(mes);
  }
  const nomeMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
  const nav = `<div class="cal-nav">
      <button class="btn icon" data-action="mes-ant" aria-label="Mês anterior">${ico('voltar', 18)}</button>
      <button class="btn" data-action="mes-hoje">hoje</button>
      <button class="btn icon" data-action="mes-prox" aria-label="Próximo mês">${ico('avancar', 18)}</button></div>`;
  const celulas = [];
  for (let i = 0; i < 42; i++) {
    const d = somaDias(ini, i);
    const k = ymd(d);
    const evs = doDia(k);
    const cls = [d.getMonth() !== mes.getMonth() && 'fora', k === hk && 'hoje', k === diaSel && 'sel'].filter(Boolean).join(' ');
    celulas.push(`
      <button class="cal-cel ${cls}" data-action="dia" data-dia="${k}" aria-label="${esc(dataLonga(d))}: ${evs.length ? `${evs.length} evento${evs.length > 1 ? 's' : ''}` : 'nada marcado'}" ${k === diaSel ? 'aria-pressed="true"' : ''}>
        <span class="cal-n">${d.getDate()}</span>
        <span class="cal-chips">${evs.slice(0, 3).map((e) => `<span class="cal-chip" style="--c:${corAg(agDe(e))}">${esc(e.titulo)}</span>`).join('')}${evs.length > 3 ? `<span class="cal-mais">+${evs.length - 3}</span>` : ''}</span>
      </button>`);
  }
  const evsSel = doDia(diaSel);
  return `${cabecalho(nomeMes, nav)}
    ${nadaCompartilhado() ? vazioConectar() : ''}
    <div class="cal-grid" role="grid">
      ${SEMANA.map((s) => `<span class="cal-wd">${s}</span>`).join('')}
      ${celulas.join('')}
    </div>
    <section class="tile">
      <div class="tile-head"><h2>${esc(dataLonga(deYmd(diaSel)))}</h2>
        <button class="btn" data-action="novo-evento" data-dia="${diaSel}">${ico('plus', 16)}adicionar</button></div>
      ${evsSel.length ? `<div class="cal-list">${evsSel.map((e) => linhaEv(e, diaSel)).join('')}</div>` : '<p class="muted" style="margin:0;font-size:13px">Nada marcado neste dia.</p>'}
    </section>`;
}

function telaConfig() {
  const eu = minha();
  const minhas = agendas.filter((a) => a.user_id === meuId);
  const conta = !eu ? `
    <section class="tile">
      <div class="tile-head"><h2>sua agenda do google</h2></div>
      <p class="muted cal-p">Conecte sua conta Google para mostrar seus compromissos aqui. Você escolhe quais agendas a família pode ver; nada aparece para os outros até você marcar <b>compartilhar</b>.</p>
      <button class="btn lime" data-action="conectar">${ico('link', 18)}conectar Google Agenda</button>
    </section>` : `
    <section class="tile">
      <div class="tile-head"><h2>sua conta</h2>${eu.google_email ? `<span class="badge">${esc(eu.google_email)}</span>` : ''}</div>
      ${eu.erro ? `<p class="error cal-p">${esc(eu.erro)}</p><button class="btn lime" data-action="conectar" style="margin-bottom:12px">${ico('link', 18)}reconectar</button>` : ''}
      <p class="muted cal-p">Última sincronização: ${esc(haQuanto(eu.ultimo_sync))}. O app busca novidades sozinho a cada poucos minutos.</p>
      <div class="cal-btns">
        <button class="btn" data-action="sync" ${sincronizando ? 'disabled' : ''}>${ico('refresh', 16)}${sincronizando ? 'sincronizando…' : 'sincronizar agora'}</button>
        <button class="btn danger" data-action="desconectar">${ico('sair', 16)}desconectar</button>
      </div>
      <span class="eyebrow" style="display:block;margin:20px 0 4px">suas agendas</span>
      ${minhas.length ? minhas.map((a) => `
        <div class="cal-ag">
          <input type="color" value="${corAg(a)}" data-ag="${a.id}" data-campo="cor" aria-label="Cor da agenda ${esc(a.nome)}">
          <span class="nm">${esc(a.nome)}${a.principal ? ' <span class="tag">principal</span>' : ''}${a.pode_escrever ? '' : ' <span class="tag">só leitura</span>'}</span>
          <div class="cal-ag-ops">
            <label class="check"><input type="checkbox" data-ag="${a.id}" data-campo="compartilhada" ${a.compartilhada ? 'checked' : ''}>compartilhar com a família</label>
            <label class="check"><input type="checkbox" data-ag="${a.id}" data-campo="familia_pode_criar" ${a.familia_pode_criar ? 'checked' : ''} ${a.compartilhada && a.pode_escrever ? '' : 'disabled'}>família pode adicionar eventos</label>
          </div>
        </div>`).join('') : '<p class="muted cal-p">Nenhuma agenda encontrada nessa conta.</p>'}
    </section>`;
  const familia = `
    <section class="tile">
      <div class="tile-head"><h2>família</h2><span class="muted num" style="font-size:12px">${contas.length}</span></div>
      ${contas.length ? `<div class="cal-list">${contas.map((c) => {
        const ags = agendas.filter((a) => a.user_id === c.user_id && a.compartilhada);
        return `<div class="cal-pessoa">
          <span class="cal-dots">${ags.map((a) => `<span class="cal-dot" style="background:${corAg(a)}"></span>`).join('') || '<span class="cal-dot"></span>'}</span>
          <span class="cal-txt"><span class="nm">${esc(c.nome)}${c.user_id === meuId ? ' <span class="tag">você</span>' : ''}</span>
            <span class="muted cal-loc">${ags.length ? esc(ags.map((a) => a.nome).join(', ')) : 'nenhuma agenda compartilhada'}</span></span>
          <span class="muted cal-loc">${esc(haQuanto(c.ultimo_sync))}</span>
        </div>`;
      }).join('')}</div>` : '<p class="muted cal-p">Ninguém conectou o Google ainda.</p>'}
      <p class="muted cal-p" style="margin-top:12px">Cada pessoa da casa entra no app com o próprio login e conecta a sua conta aqui.</p>
    </section>`;
  return `<div class="page-head"><h1>agendas</h1></div>${conta}${familia}`;
}

function desenhar(aba, el) {
  el.style.maxWidth = aba === 'mes' ? '1000px' : '820px';
  const tela = aba === 'mes' ? telaMes() : aba === 'config' ? telaConfig() : telaAgenda();
  el.innerHTML = avisoHtml() + tela;
}

// ---------- formulários ----------
function formEvento(diaInicial) {
  const permitidas = agendas.filter(podeCriarEm);
  if (!permitidas.length) {
    aviso = { tipo: 'erro', txt: 'Nenhuma agenda aceita eventos ainda. Conecte seu Google e compartilhe uma agenda, ou peça para alguém liberar "família pode adicionar eventos".' };
    return C.irPara('calendario/config');
  }
  const base = diaInicial ? deYmd(diaInicial) : new Date();
  const ini = new Date(base);
  if (diaInicial && diaInicial !== ymd(new Date())) ini.setHours(9, 0, 0, 0);
  else ini.setHours(new Date().getHours() + 1, 0, 0, 0);
  const fim = new Date(ini.getTime() + 3600e3);
  const padrao = permitidas.find((a) => a.user_id === meuId && a.principal) || permitidas.find((a) => a.user_id === meuId) || permitidas[0];
  modal.innerHTML = `
  <form method="dialog" id="f-ev">
    <h2 class="h2" style="font-size:24px">Novo evento</h2>
    <label class="field">Título<input name="titulo" required maxlength="200" autocomplete="off"></label>
    <label class="field">Agenda<select name="agenda_id">${permitidas.map((a) => `<option value="${a.id}" ${a === padrao ? 'selected' : ''}>${esc(rotuloAg(a))}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" name="dia_inteiro">dia todo</label>
    <div class="grid2">
      <label class="field">Início<input type="date" name="data_ini" required value="${ymd(ini)}"></label>
      <label class="field cal-h">Hora<input type="time" name="hora_ini" required value="${pad(ini.getHours())}:00"></label>
    </div>
    <div class="grid2">
      <label class="field">Fim<input type="date" name="data_fim" required value="${ymd(fim)}"></label>
      <label class="field cal-h">Hora<input type="time" name="hora_fim" required value="${pad(fim.getHours())}:00"></label>
    </div>
    <label class="field">Local (opcional)<input name="local" maxlength="300" autocomplete="off"></label>
    <label class="field">Descrição (opcional)<textarea name="descricao" rows="3" maxlength="2000"></textarea></label>
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions"><button class="pill" value="cancel" formnovalidate>Cancelar</button><button class="pill green" value="ok">Salvar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  const err = f.querySelector('#f-err');
  const horas = [...f.querySelectorAll('.cal-h')];
  f.dia_inteiro.addEventListener('change', () => {
    horas.forEach((l) => { l.hidden = f.dia_inteiro.checked; l.querySelector('input').required = !f.dia_inteiro.checked; });
  });
  f.data_ini.addEventListener('change', () => { if (f.data_fim.value < f.data_ini.value) f.data_fim.value = f.data_ini.value; });
  f.hora_ini.addEventListener('change', () => {
    if (f.data_fim.value === f.data_ini.value && f.hora_fim.value <= f.hora_ini.value) {
      const [h, m] = f.hora_ini.value.split(':').map(Number);
      if (h < 23) f.hora_fim.value = `${pad(h + 1)}:${pad(m)}`;
    }
  });
  f.addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value === 'cancel') return;
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const v = Object.fromEntries(new FormData(f));
    const dia = !!v.dia_inteiro;
    let inicio, fimEv;
    if (dia) {
      inicio = v.data_ini; fimEv = v.data_fim;
      if (fimEv < inicio) { err.textContent = 'O fim precisa ser depois do início.'; return; }
    } else {
      const i = new Date(`${v.data_ini}T${v.hora_ini}`), fdt = new Date(`${v.data_fim}T${v.hora_fim}`);
      if (!(fdt > i)) { err.textContent = 'O fim precisa ser depois do início.'; return; }
      inicio = i.toISOString(); fimEv = fdt.toISOString();
    }
    const btn = ev.submitter;
    if (btn) btn.disabled = true;
    err.textContent = '';
    try {
      await db.calCriarEvento({ agenda_id: +v.agenda_id, titulo: v.titulo.trim(), dia_inteiro: dia, inicio, fim: fimEv, local: v.local.trim(), descricao: v.descricao.trim() });
      modal.close();
      await recarregar();
    } catch (e) {
      err.textContent = e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  modal.showModal();
  f.titulo.focus();
}

// Descrições do Google podem vir em HTML: vira texto simples.
const textoSimples = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

function detalhe(id) {
  const e = eventos.find((x) => x.id === +id);
  if (!e) return;
  const a = agDe(e);
  const minhaAg = a && a.user_id === meuId;
  const podeExcluir = minhaAg || e.criado_pelo_app_por === meuId;
  const link = minhaAg && /^https:\/\/www\.google\.com\//.test(e.link_google || '') ? e.link_google : '';
  modal.innerHTML = `
  <form method="dialog">
    <div class="cal-det-head"><span class="cal-dot" style="background:${corAg(a)};width:14px;height:14px"></span><h2 class="h2" style="font-size:22px">${esc(e.titulo)}</h2></div>
    <p class="cal-det">${esc(quandoEv(e))}</p>
    ${e.local ? `<p class="cal-det">${esc(e.local)}</p>` : ''}
    <p class="cal-det muted">${esc(rotuloAg(a, true))}</p>
    ${e.descricao ? `<p class="cal-desc">${esc(textoSimples(e.descricao))}</p>` : ''}
    ${link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener" style="align-self:flex-start">${ico('link', 16)}abrir no Google Agenda</a>` : ''}
    <div class="error" id="f-err" role="alert"></div>
    <div class="dialog-actions">${podeExcluir ? '<button class="pill danger" value="del">Excluir</button>' : ''}<button class="pill" value="cancel">Fechar</button></div>
  </form>`;
  const f = modal.querySelector('form');
  f.addEventListener('submit', async (ev) => {
    if (!ev.submitter || ev.submitter.value !== 'del') return;
    ev.preventDefault();
    if (!confirm(`Excluir "${e.titulo}"? Ele também sai do Google Agenda${minhaAg ? '' : ` de ${donoNome(a)}`}.`)) return;
    try {
      await db.calExcluirEvento(e.id);
      modal.close();
      await recarregar();
    } catch (er) { f.querySelector('#f-err').textContent = er.message; }
  });
  modal.showModal();
}

// ---------- módulo ----------
export default {
  id: 'calendario',
  nome: 'Calendário',
  abas: [['agenda', 'Agenda', 'agenda'], ['mes', 'Mês', 'calendario'], ['config', 'Agendas', 'pessoas']],
  barra: ['agenda', 'mes', { acao: 'novo-evento', icone: 'plus', rotulo: 'Novo evento' }, 'config'],

  async carregar(ctx) {
    C = ctx;
    const conectou = lerRetorno();
    ({ meuId, contas, agendas, eventos } = await db.calCarregar(...janela()));
    if (!cancelar) {
      cancelar = db.assinarCalendario(recarregar);
      document.addEventListener('visibilitychange', () => { if (!document.hidden && C.def && C.def.id === 'calendario') recarregar(); });
    }
    const eu = minha();
    if (eu && !eu.erro && (conectou || !eu.ultimo_sync || Date.now() - new Date(eu.ultimo_sync) > 5 * 60e3)) sincronizar(true);
  },

  render(aba, el, ctx) {
    C = ctx;
    desenhar(aba, el);
  },

  async acao(a, b) {
    if (a === 'fechar-aviso') { aviso = null; pintar(); }
    else if (a === 'sync') sincronizar(false);
    else if (a === 'novo-evento') formEvento(b.dataset.dia);
    else if (a === 'ver-ev') detalhe(b.dataset.id);
    else if (a === 'dia') { diaSel = b.dataset.dia; pintar(); }
    else if (a === 'mais') { dias = Math.min(365, dias + 30); await recarregar(); }
    else if (a === 'mes-ant' || a === 'mes-prox' || a === 'mes-hoje') {
      mes = a === 'mes-hoje' ? inicioMes(new Date()) : new Date(mes.getFullYear(), mes.getMonth() + (a === 'mes-ant' ? -1 : 1), 1);
      diaSel = null;
      pintar();          // mostra o mês na hora; os eventos chegam em seguida
      await recarregar();
    } else if (a === 'conectar') {
      b.disabled = true;
      try { await db.calConectar(); if (db.DEMO) { aviso = { tipo: 'ok', txt: 'Conta de exemplo conectada. Marque quais agendas a família pode ver.' }; await recarregar(); } }
      catch (e) { aviso = { tipo: 'erro', txt: e.message }; pintar(); }
    } else if (a === 'desconectar') {
      if (!confirm('Desconectar sua conta Google? Seus eventos deixam de aparecer para a família (nada é apagado no Google).')) return;
      try { await db.calDesconectar(); aviso = null; } catch (e) { aviso = { tipo: 'erro', txt: e.message }; }
      await recarregar();
    }
  },

  async mudou(ev) {
    const t = ev.target;
    if (!t.dataset || !t.dataset.ag) return;
    const ag = agendas.find((a) => a.id === +t.dataset.ag);
    if (!ag) return;
    const campo = t.dataset.campo;
    const campos = { [campo]: t.type === 'checkbox' ? t.checked : t.value };
    if (campo === 'compartilhada' && !t.checked) campos.familia_pode_criar = false;
    Object.assign(ag, campos);
    pintar();
    try {
      await db.calSalvarAgenda(ag.id, campos);
      if (campo === 'compartilhada') await sincronizar(true); // traz (ou tira) os eventos dessa agenda
      else await recarregar();
    } catch (e) {
      aviso = { tipo: 'erro', txt: e.message };
      await recarregar();
    }
  },
};
