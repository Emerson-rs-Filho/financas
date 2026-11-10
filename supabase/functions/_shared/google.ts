// Código comum às funções "google-auth" e "agenda": login no app, cifra dos tokens,
// conversa com o Google (OAuth + Calendar API) e sincronização para as tabelas cal_*.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export class Erro extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

export function env(k: string) {
  const v = Deno.env.get(k);
  if (!v) throw new Erro(`Falta configurar o secret ${k} no Supabase.`, 500);
  return v;
}

// A chave service_role só existe aqui no servidor; nunca vai para o navegador.
export const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

export type Usuario = { id: string; email?: string; user_metadata?: { name?: string } };

// Usuário logado no app (pelo JWT do Supabase que o supabase-js manda no Authorization).
export async function usuario(req: Request): Promise<Usuario | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return (data?.user as Usuario) ?? null;
}

export const nomeDe = (u: Usuario) => {
  const n = u.user_metadata?.name || (u.email || '').split('@')[0] || 'Alguém';
  return n.charAt(0).toUpperCase() + n.slice(1);
};

// ---------- base64, cifra (AES-GCM) e assinatura (HMAC) ----------
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (u8: Uint8Array) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

let chaveAes: Promise<CryptoKey> | null = null;
function aes() {
  return (chaveAes ??= crypto.subtle.digest('SHA-256', enc.encode(env('TOKEN_KEY')))
    .then((h) => crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt'])));
}
export async function cifrar(txt: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), enc.encode(txt)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}
export async function decifrar(s: string) {
  const u = unb64(s);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await aes(), u.slice(12)));
}

const hmac = () => crypto.subtle.importKey('raw', enc.encode(env('OAUTH_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
export async function assinar(obj: Record<string, unknown>) {
  const p = b64url(enc.encode(JSON.stringify(obj)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmac(), enc.encode(p)));
  return `${p}.${b64url(sig)}`;
}
// Devolve o conteúdo se a assinatura confere e não expirou; senão null.
export async function conferir(state: string | null): Promise<Record<string, unknown> | null> {
  const [p, s] = (state || '').split('.');
  if (!p || !s) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmac(), unb64url(s), enc.encode(p)))) return null;
    const o = JSON.parse(dec.decode(unb64url(p)));
    return typeof o.exp === 'number' && o.exp > Date.now() ? o : null;
  } catch { return null; }
}
export const lerIdToken = (t: string) => {
  try { return JSON.parse(dec.decode(unb64url(t.split('.')[1]))); } catch { return {}; }
};

// ---------- OAuth do Google ----------
export const ESCOPOS = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];
export const redirectUri = () => `${env('SUPABASE_URL')}/functions/v1/google-auth`;

async function tokenEndpoint(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), ...params }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}
export const trocarCodigo = (code: string) =>
  tokenEndpoint({ code, redirect_uri: redirectUri(), grant_type: 'authorization_code' });

// Access token válido do usuário, renovando com o refresh token quando faltar menos de 1 minuto.
export async function tokenValido(uid: string): Promise<string> {
  const { data: t } = await db.from('cal_tokens').select('*').eq('user_id', uid).maybeSingle();
  if (!t) throw new Erro('A conta Google não está conectada.', 409);
  if (t.access_token_cifrado && t.expira_em && new Date(t.expira_em).getTime() - Date.now() > 60_000) {
    return decifrar(t.access_token_cifrado);
  }
  const { ok, d } = await tokenEndpoint({ refresh_token: await decifrar(t.refresh_token_cifrado), grant_type: 'refresh_token' });
  if (!ok) {
    if (d.error === 'invalid_grant') {
      await db.from('cal_contas').update({ erro: 'O acesso ao Google expirou ou foi removido. Conecte de novo.' }).eq('user_id', uid);
    }
    throw new Erro('Não foi possível renovar o acesso ao Google. Conecte a conta de novo.', 409);
  }
  await db.from('cal_tokens').update({
    access_token_cifrado: await cifrar(d.access_token),
    expira_em: new Date(Date.now() + (d.expires_in || 3600) * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq('user_id', uid);
  return d.access_token;
}

// ---------- Calendar API ----------
// deno-lint-ignore no-explicit-any
export async function gapi(token: string, caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Erro(`Google Agenda: ${d?.error?.message || r.status}`, r.status);
  return d;
}

const lotes = <T>(arr: T[], n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Atualiza a lista de agendas do usuário sem mexer no que ele escolheu (compartilhar, cor…).
export async function listarAgendas(uid: string, token: string) {
  // deno-lint-ignore no-explicit-any
  const itens: any[] = [];
  let pageToken = '';
  do {
    const d = await gapi(token, `/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    itens.push(...(d.items || []));
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  const rows = itens.filter((c) => !c.deleted && !c.hidden).map((c) => ({
    user_id: uid,
    google_calendar_id: c.id,
    nome: c.summaryOverride || c.summary || c.id,
    cor_google: c.backgroundColor || null,
    principal: !!c.primary,
    pode_escrever: c.accessRole === 'owner' || c.accessRole === 'writer',
  }));
  if (rows.length) {
    const { error } = await db.from('cal_agendas').upsert(rows, { onConflict: 'user_id,google_calendar_id' });
    if (error) throw new Erro(error.message, 500);
  }
  const ids = new Set(rows.map((r) => r.google_calendar_id));
  const { data: atuais } = await db.from('cal_agendas').select('id, google_calendar_id').eq('user_id', uid);
  const sumiram = (atuais || []).filter((a) => !ids.has(a.google_calendar_id)).map((a) => a.id);
  if (sumiram.length) await db.from('cal_agendas').delete().in('id', sumiram);
}

// Eventos de dia inteiro: o app é de uma casa no Brasil (sem horário de verão desde 2019).
const MEIA_NOITE = 'T00:00:00-03:00';

// deno-lint-ignore no-explicit-any
export function mapEvento(agendaId: number, e: any, marca: string) {
  const privado = e.visibility === 'private' || e.visibility === 'confidential';
  const dia = !!e.start?.date;
  return {
    agenda_id: agendaId,
    google_event_id: e.id,
    titulo: privado ? 'Ocupado' : String(e.summary || '(sem título)').slice(0, 500),
    descricao: privado || !e.description ? null : String(e.description).slice(0, 4000),
    local: privado || !e.location ? null : String(e.location).slice(0, 500),
    inicio: dia ? e.start.date + MEIA_NOITE : e.start.dateTime,
    fim: dia ? (e.end?.date || e.start.date) + MEIA_NOITE : (e.end?.dateTime || e.start.dateTime),
    dia_inteiro: dia,
    link_google: e.htmlLink || null,
    atualizado_em: marca,
    sincronizado_em: marca,
  };
}

export async function gravarEventos(rows: ReturnType<typeof mapEvento>[]) {
  for (const l of lotes(rows)) {
    const { error } = await db.from('cal_eventos').upsert(l, { onConflict: 'agenda_id,google_event_id' });
    if (error) throw new Erro(error.message, 500);
  }
}

type Agenda = { id: number; google_calendar_id: string; sync_token: string | null; nome: string };

// Sincronização incremental (syncToken). Na primeira vez: de 60 dias atrás até 1 ano à frente.
async function syncAgenda(token: string, ag: Agenda): Promise<void> {
  const marca = new Date().toISOString();
  const completo = !ag.sync_token;
  const base = `/calendars/${encodeURIComponent(ag.google_calendar_id)}/events`;
  let pageToken = '';
  let proximo: string | null = null;
  try {
    do {
      const p = new URLSearchParams({ singleEvents: 'true', maxResults: '250' });
      if (ag.sync_token) p.set('syncToken', ag.sync_token);
      else {
        p.set('timeMin', new Date(Date.now() - 60 * 864e5).toISOString());
        p.set('timeMax', new Date(Date.now() + 365 * 864e5).toISOString());
      }
      if (pageToken) p.set('pageToken', pageToken);
      const d = await gapi(token, `${base}?${p}`);
      // deno-lint-ignore no-explicit-any
      const itens: any[] = d.items || [];
      await gravarEventos(itens.filter((e) => e.status !== 'cancelled' && e.start).map((e) => mapEvento(ag.id, e, marca)));
      const cancelados = itens.filter((e) => e.status === 'cancelled').map((e) => e.id);
      for (const l of lotes(cancelados, 200)) await db.from('cal_eventos').delete().eq('agenda_id', ag.id).in('google_event_id', l);
      pageToken = d.nextPageToken || '';
      proximo = d.nextSyncToken || proximo;
    } while (pageToken);
  } catch (e) {
    if ((e as Erro).status === 410 && ag.sync_token) return syncAgenda(token, { ...ag, sync_token: null }); // token velho: refaz do zero
    throw e;
  }
  // sync completo: o que não veio do Google deixou de existir
  if (completo) await db.from('cal_eventos').delete().eq('agenda_id', ag.id).lt('sincronizado_em', marca);
  await db.from('cal_agendas').update({ sync_token: proximo }).eq('id', ag.id);
}

// Atualiza agendas e eventos de um usuário. Devolve mensagens das agendas que falharam.
export async function syncUsuario(uid: string): Promise<string[]> {
  const token = await tokenValido(uid);
  await listarAgendas(uid, token);
  const { data: ags } = await db.from('cal_agendas').select('id, google_calendar_id, sync_token, nome, compartilhada').eq('user_id', uid);
  const erros: string[] = [];
  for (const ag of ags || []) {
    try {
      if (ag.compartilhada) await syncAgenda(token, ag);
      else {
        // deixou de ser compartilhada: tira os eventos do app
        await db.from('cal_eventos').delete().eq('agenda_id', ag.id);
        if (ag.sync_token) await db.from('cal_agendas').update({ sync_token: null }).eq('id', ag.id);
      }
    } catch (e) {
      erros.push(`${ag.nome}: ${(e as Error).message}`);
    }
  }
  await db.from('cal_contas').update({ ultimo_sync: new Date().toISOString(), erro: null }).eq('user_id', uid);
  return erros;
}
