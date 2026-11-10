// Edge Function "google-auth": conecta (e desconecta) a conta Google de cada pessoa da casa.
//   POST {acao:'iniciar'}      (logado)  → devolve a URL da tela de permissão do Google
//   GET  ?code=…&state=…       (Google)  → troca o código por tokens, guarda cifrado e volta para o app
//   POST {acao:'desconectar'}  (logado)  → revoga o acesso e apaga agendas/eventos da pessoa
// Deploy (veja o README):
//   npx supabase functions deploy google-auth --no-verify-jwt
import {
  CORS, json, Erro, env, db, usuario, nomeDe, cifrar, decifrar, assinar, conferir, lerIdToken,
  ESCOPOS, redirectUri, trocarCodigo, listarAgendas,
} from '../_shared/google.ts';

// Volta para a tela de agendas do app, com o resultado na query (?gcal=ok | ?gcal=erro&motivo=…).
function voltar(params: Record<string, string>) {
  const u = new URL(env('APP_URL'));
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.hash = 'calendario/config';
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

async function callback(q: URLSearchParams) {
  const st = await conferir(q.get('state'));
  if (!st) return voltar({ gcal: 'erro', motivo: 'expirou' });
  if (q.get('error') || !q.get('code')) return voltar({ gcal: 'erro', motivo: 'cancelado' });
  const uid = String(st.uid);
  try {
    const { ok, d: tok } = await trocarCodigo(q.get('code')!);
    if (!ok) throw new Error(`token: ${tok.error || 'falhou'}`);
    const escopos = String(tok.scope || '');
    if (!escopos.includes('calendar.events') || !escopos.includes('calendar.calendarlist')) return voltar({ gcal: 'erro', motivo: 'permissao' });

    const { data: u } = await db.auth.admin.getUserById(uid);
    if (!u?.user) throw new Error('usuário do app não encontrado');
    const { data: antigo } = await db.from('cal_tokens').select('refresh_token_cifrado').eq('user_id', uid).maybeSingle();
    const refresh = tok.refresh_token ? await cifrar(tok.refresh_token) : antigo?.refresh_token_cifrado;
    if (!refresh) throw new Error('o Google não devolveu refresh token');

    const agora = new Date().toISOString();
    const e1 = await db.from('cal_tokens').upsert({
      user_id: uid,
      refresh_token_cifrado: refresh,
      access_token_cifrado: await cifrar(tok.access_token),
      expira_em: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
      escopos,
      atualizado_em: agora,
    });
    if (e1.error) throw e1.error;
    const e2 = await db.from('cal_contas').upsert({
      user_id: uid,
      nome: nomeDe(u.user),
      google_email: lerIdToken(tok.id_token || '').email || null,
      conectado_em: agora,
      erro: null,
    });
    if (e2.error) throw e2.error;
    await listarAgendas(uid, tok.access_token);
    return voltar({ gcal: 'ok' });
  } catch (e) {
    console.error('google-auth callback', e);
    return voltar({ gcal: 'erro', motivo: 'falha' });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.has('state')) return callback(url.searchParams);
    return json({ error: 'Use POST.' }, 405);
  }

  try {
    const u = await usuario(req);
    if (!u) return json({ error: 'Faça login no app.' }, 401);
    const { acao } = await req.json().catch(() => ({}));

    if (acao === 'iniciar') {
      const state = await assinar({ uid: u.id, exp: Date.now() + 10 * 60_000, n: crypto.randomUUID() });
      const p = new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: ESCOPOS.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` });
    }

    if (acao === 'desconectar') {
      const { data: t } = await db.from('cal_tokens').select('refresh_token_cifrado').eq('user_id', u.id).maybeSingle();
      if (t) {
        try {
          await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: await decifrar(t.refresh_token_cifrado) }),
          });
        } catch (e) { console.error('revoke', e); } // apaga do app mesmo se o Google não responder
      }
      await db.from('cal_agendas').delete().eq('user_id', u.id); // eventos vão junto (cascade)
      await db.from('cal_contas').delete().eq('user_id', u.id);
      await db.from('cal_tokens').delete().eq('user_id', u.id);
      return json({ ok: true });
    }

    return json({ error: 'Use acao=iniciar ou desconectar.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, (e as Erro).status || 500);
  }
});
