// Edge Function "cotacoes": proxy para Yahoo Finance e Banco Central (SGS).
// tipo=precos&tickers=WIZC3,MXRF11 devolve o preço atual de cada ativo da B3.
// tipo=dividendos&tickers=... devolve o preço e quanto cada cota pagou nos últimos 12 meses.
// Só usuários logados no app podem chamar. Deploy:
//   npx supabase functions deploy cotacoes --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// cache simples em memória (vive enquanto a instância da função estiver quente)
const cache = new Map<string, { t: number; v: unknown }>();
const TTL = 15 * 60 * 1000;
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TICKER = /^[A-Z0-9.\-^=]{1,20}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const brData = (iso: string) => iso.split('-').reverse().join('/');
const isoData = (br: string) => br.split('/').reverse().join('-');

async function getJson(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Fonte respondeu ${r.status}`);
  return r.json();
}

// ---------- Banco Central (SGS) ----------
async function sgsUltimo(serie: number) {
  const d = await getJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`);
  return { valor: Number(d[0].valor), data: isoData(d[0].data) };
}

async function taxas() {
  const [selic, cdi, ipca] = await Promise.all([sgsUltimo(432), sgsUltimo(4389), sgsUltimo(13522)]);
  return { selic, cdi, ipca }; // valores em % a.a.
}

async function cdiMensal(inicio: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const d = await getJson(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=${brData(inicio)}&dataFinal=${brData(hoje)}`,
  );
  return { pontos: d.map((p: { data: string; valor: string }) => ({ data: isoData(p.data), taxa: Number(p.valor) })) };
}

// ---------- Yahoo Finance ----------
async function historico(ticker: string, inicio: string) {
  const p1 = Math.floor(new Date(inicio + 'T00:00:00Z').getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const d = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&period1=${p1}&period2=${p2}&events=div,split`,
  );
  const r = d?.chart?.result?.[0];
  if (!r || !r.timestamp) throw new Error(d?.chart?.error?.description || 'Ticker não encontrado');
  const adj: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose || r.indicators?.quote?.[0]?.close || [];
  const porMes = new Map<string, { data: string; preco: number }>();
  r.timestamp.forEach((ts: number, k: number) => {
    const preco = adj[k];
    if (preco == null || !(preco > 0)) return;
    const data = new Date(ts * 1000).toISOString().slice(0, 10);
    porMes.set(data.slice(0, 7), { data: data.slice(0, 7) + '-01', preco }); // último valor do mês vence
  });
  return {
    ticker,
    nome: r.meta?.longName || r.meta?.shortName || ticker,
    moeda: r.meta?.currency || '',
    pontos: [...porMes.values()],
  };
}

// Preço atual de ativos da B3 (o Yahoo usa o sufixo .SA).
async function precoAtual(ticker: string) {
  const simbolo = ticker.includes('.') || ticker.startsWith('^') ? ticker : `${ticker}.SA`;
  const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1d&interval=1d`);
  const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
  if (!(p > 0)) throw new Error('sem preço');
  return Number(p);
}

async function precos(tickers: string[]) {
  const out: Record<string, number> = {};
  const erros: string[] = [];
  await Promise.all(tickers.map(async (t) => {
    try { out[t] = await cached('p:' + t, () => precoAtual(t)); } catch { erros.push(t); }
  }));
  return { precos: out, erros };
}

// Dividendos pagos por cota nos últimos 12 meses (ações e FIIs da B3) e o preço atual.
async function dividendoAtivo(ticker: string) {
  const simbolo = ticker.includes('.') || ticker.startsWith('^') ? ticker : `${ticker}.SA`;
  const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1y&interval=1mo&events=div`);
  const r = d?.chart?.result?.[0];
  const preco = Number(r?.meta?.regularMarketPrice);
  if (!(preco > 0)) throw new Error('sem preço');
  const desde = Date.now() / 1000 - 365 * 86400;
  const pagos = Object.values(r?.events?.dividends ?? {}) as { amount: number; date: number }[];
  const validos = pagos.filter((p) => p.date >= desde && p.amount > 0);
  return { preco, div12m: validos.reduce((s, p) => s + Number(p.amount), 0), pagamentos: validos.length };
}

async function dividendos(tickers: string[]) {
  const ativos: Record<string, { preco: number; div12m: number; pagamentos: number }> = {};
  const erros: string[] = [];
  await Promise.all(tickers.map(async (t) => {
    try { ativos[t] = await cached('d:' + t, () => dividendoAtivo(t)); } catch { erros.push(t); }
  }));
  return { ativos, erros };
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const auth = req.headers.get('Authorization') || '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u?.user) return json({ error: 'Faça login para ver cotações.' }, 401);

  const q = new URL(req.url).searchParams;
  const tipo = q.get('tipo');
  const inicio = q.get('inicio') || '';
  try {
    if (tipo === 'taxas') return json(await cached('taxas', taxas));
    if (tipo === 'cdi_mensal') {
      if (!DATA.test(inicio)) return json({ error: 'Data inválida.' }, 400);
      return json(await cached('cdi:' + inicio, () => cdiMensal(inicio)));
    }
    if (tipo === 'historico') {
      const ticker = (q.get('ticker') || '').toUpperCase();
      if (!TICKER.test(ticker)) return json({ error: 'Ticker inválido.' }, 400);
      if (!DATA.test(inicio)) return json({ error: 'Data inválida.' }, 400);
      return json(await cached(`h:${ticker}:${inicio}`, () => historico(ticker, inicio)));
    }
    if (tipo === 'dividendos') {
      const lista = [...new Set((q.get('tickers') || '').toUpperCase().split(',').map((t) => t.trim()).filter(Boolean))];
      if (!lista.length || lista.length > 30 || !lista.every((t) => TICKER.test(t))) return json({ error: 'Tickers inválidos.' }, 400);
      return json(await dividendos(lista));
    }
    if (tipo === 'precos') {
      const lista = [...new Set((q.get('tickers') || '').toUpperCase().split(',').map((t) => t.trim()).filter(Boolean))];
      if (!lista.length || lista.length > 30 || !lista.every((t) => TICKER.test(t))) return json({ error: 'Tickers inválidos.' }, 400);
      return json(await precos(lista));
    }
    return json({ error: 'Use tipo=taxas, historico, cdi_mensal, precos ou dividendos.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
