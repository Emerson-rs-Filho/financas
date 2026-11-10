// Edge Function "agenda": sincroniza e cria eventos no Google Agenda.
//   POST {acao:'sync'}                         (logado)  → atualiza as agendas e eventos de quem chamou
//   POST {acao:'criar', agenda_id, titulo, …}  (logado)  → cria o evento no Google do dono da agenda
//   POST {acao:'excluir', evento_id}           (logado)  → apaga um evento criado pelo app / da própria agenda
//   POST {acao:'sync-todos'}  (header x-cron-secret)    → sincroniza todo mundo (pg_cron)
// Deploy (veja o README):
//   npx supabase functions deploy agenda --no-verify-jwt
import {
  CORS, json, Erro, env, db, usuario, nomeDe, tokenValido, gapi, mapEvento, gravarEventos, syncUsuario, type Usuario,
} from '../_shared/google.ts';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 864e5;
const somaDia = (ymd: string) => new Date(Date.parse(ymd + 'T12:00:00Z') + DIA).toISOString().slice(0, 10);
const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

async function agendaPorId(id: number) {
  const { data } = await db.from('cal_agendas').select('*').eq('id', id).maybeSingle();
  if (!data) throw new Erro('Agenda não encontrada.', 404);
  return data;
}

// deno-lint-ignore no-explicit-any
async function criar(u: Usuario, b: any) {
  const titulo = texto(b.titulo, 200);
  if (!titulo) throw new Erro('Informe o título.');
  const ag = await agendaPorId(Number(b.agenda_id));
  const minha = ag.user_id === u.id;
  if (!ag.compartilhada || (!minha && !ag.familia_pode_criar)) throw new Erro('Essa agenda não aceita eventos da família.', 403);
  if (!ag.pode_escrever) throw new Erro('Essa agenda do Google é só de leitura.', 403);

  let start, end;
  if (b.dia_inteiro) {
    if (!DATA.test(b.inicio) || !DATA.test(b.fim) || b.fim < b.inicio) throw new Erro('Datas inválidas.');
    start = { date: b.inicio };
    end = { date: somaDia(b.fim) }; // no Google o fim de dia inteiro é exclusivo
  } else {
    const i = Date.parse(b.inicio), f = Date.parse(b.fim);
    if (!Number.isFinite(i) || !Number.isFinite(f) || f <= i) throw new Erro('O fim precisa ser depois do início.');
    if (f - i > 31 * DIA) throw new Erro('Evento longo demais.');
    start = { dateTime: new Date(i).toISOString(), timeZone: 'America/Sao_Paulo' };
    end = { dateTime: new Date(f).toISOString(), timeZone: 'America/Sao_Paulo' };
  }
  const descricao = [texto(b.descricao, 2000), minha ? '' : `Adicionado por ${nomeDe(u)} pelo app Nossa Casa.`].filter(Boolean).join('\n\n');

  const token = await tokenValido(ag.user_id); // token do DONO da agenda
  const e = await gapi(token, `/calendars/${encodeURIComponent(ag.google_calendar_id)}/events`, {
    method: 'POST',
    body: JSON.stringify({ summary: titulo, location: texto(b.local, 300) || undefined, description: descricao || undefined, start, end }),
  });
  const row = mapEvento(ag.id, e, new Date().toISOString());
  await gravarEventos([row]);
  await db.from('cal_eventos').update({ criado_pelo_app_por: u.id }).eq('agenda_id', ag.id).eq('google_event_id', e.id);
  return { ok: true };
}

async function excluir(u: Usuario, id: number) {
  const { data: ev } = await db.from('cal_eventos').select('id, agenda_id, google_event_id, criado_pelo_app_por').eq('id', id).maybeSingle();
  if (!ev) throw new Erro('Evento não encontrado.', 404);
  const ag = await agendaPorId(ev.agenda_id);
  if (ag.user_id !== u.id && ev.criado_pelo_app_por !== u.id) throw new Erro('Só quem criou o evento ou o dono da agenda pode excluir.', 403);
  const token = await tokenValido(ag.user_id);
  try {
    await gapi(token, `/calendars/${encodeURIComponent(ag.google_calendar_id)}/events/${encodeURIComponent(ev.google_event_id)}`, { method: 'DELETE' });
  } catch (e) {
    if (![404, 410].includes((e as Erro).status)) throw e; // já não existia no Google
  }
  await db.from('cal_eventos').delete().eq('id', ev.id);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    // deno-lint-ignore no-explicit-any
    const b: any = await req.json().catch(() => ({}));

    if (b.acao === 'sync-todos') {
      if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return json({ error: 'Não autorizado.' }, 401);
      const { data: contas } = await db.from('cal_contas').select('user_id, nome');
      const erros: string[] = [];
      for (const c of contas || []) {
        try { erros.push(...(await syncUsuario(c.user_id))); } catch (e) { erros.push(`${c.nome}: ${(e as Error).message}`); }
      }
      return json({ ok: true, contas: (contas || []).length, erros });
    }

    const u = await usuario(req);
    if (!u) return json({ error: 'Faça login no app.' }, 401);
    if (b.acao === 'sync') return json({ ok: true, erros: await syncUsuario(u.id) });
    if (b.acao === 'criar') return json(await criar(u, b));
    if (b.acao === 'excluir') return json(await excluir(u, Number(b.evento_id)));
    return json({ error: 'Use acao=sync, criar ou excluir.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, (e as Erro).status || 500);
  }
});
