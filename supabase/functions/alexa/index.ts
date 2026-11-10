// Edge Function "alexa": atende a skill particular "Nossa Casa" e mexe na lista de compras.
//   "Alexa, peça à nossa casa para adicionar leite e pão"
//   "Alexa, pergunte à nossa casa o que tem na lista"
//   "Alexa, diga à nossa casa que já comprei leite"
// Deploy (veja o README):
//   npx supabase secrets set ALEXA_SKILL_ID=amzn1.ask.skill.xxxx
//   npx supabase functions deploy alexa --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as x509 from 'npm:@peculiar/x509@1';
import { separarItens, normalizar } from './itens.js';

const SKILL_ID = Deno.env.get('ALEXA_SKILL_ID') ?? '';
// A chave service_role só existe aqui no servidor (o Supabase a injeta nas Edge Functions); nunca vai para o navegador.
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

type Item = { id: number; nome: string; quantidade: string | null; comprado: boolean };

// ---------- verificação: a requisição veio mesmo da Alexa, para esta skill ----------
const certCache = new Map<string, { validoAte: Date; key: CryptoKey }>();

function urlCertValida(u: string) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 's3.amazonaws.com'
      && (url.port === '' || url.port === '443') && url.pathname.startsWith('/echo.api/');
  } catch { return false; }
}

async function chavePublica(certUrl: string): Promise<CryptoKey> {
  const hit = certCache.get(certUrl);
  if (hit && hit.validoAte > new Date()) return hit.key;
  const pem = await (await fetch(certUrl)).text();
  const folha = new x509.X509Certificate(pem.split(/(?=-----BEGIN CERTIFICATE-----)/)[0].trim());
  const agora = new Date();
  if (folha.notBefore > agora || folha.notAfter < agora) throw new Error('certificado fora da validade');
  const san = folha.getExtension(x509.SubjectAlternativeNameExtension);
  const nomes = san ? san.names.toJSON().map((n: { value: string }) => n.value) : [];
  if (!nomes.includes('echo-api.amazon.com')) throw new Error('certificado não é da Alexa');
  const key = await folha.publicKey.export({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, ['verify']);
  certCache.set(certUrl, { validoAte: folha.notAfter, key });
  return key;
}

// deno-lint-ignore no-explicit-any
async function verificar(req: Request, corpo: string, body: any) {
  const app = body?.context?.System?.application?.applicationId ?? body?.session?.application?.applicationId;
  if (!SKILL_ID || app !== SKILL_ID) throw new Error('skill desconhecida');
  const ts = Date.parse(body?.request?.timestamp ?? '');
  if (!ts || Math.abs(Date.now() - ts) > 150_000) throw new Error('requisição fora do horário');
  const certUrl = req.headers.get('SignatureCertChainUrl') ?? '';
  const assinatura = req.headers.get('Signature-256') ?? '';
  if (!urlCertValida(certUrl) || !assinatura) throw new Error('requisição sem assinatura');
  const key = await chavePublica(certUrl);
  const sig = Uint8Array.from(atob(assinatura), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(corpo));
  if (!ok) throw new Error('assinatura inválida');
}

// ---------- respostas ----------
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
const fala = (texto: string, terminar = true, insistir?: string) => resposta({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text: texto },
    shouldEndSession: terminar,
    ...(insistir ? { reprompt: { outputSpeech: { type: 'PlainText', text: insistir } } } : {}),
  },
});
// Conversa aberta ("Alexa, abre nossa casa"): fala o texto e já fica esperando o próximo item ("leite").
const INTENT_VAZIA = { name: 'AdicionarIntent', confirmationStatus: 'NONE', slots: { item: { name: 'item', confirmationStatus: 'NONE' } } };
// Na abertura: encadeia na AdicionarIntent e a própria Alexa pergunta "O que eu adiciono?" (prompt do modelo).
const abrirConversa = (texto: string) => resposta({
  version: '1.0',
  sessionAttributes: { conversa: true },
  response: {
    outputSpeech: { type: 'PlainText', text: texto },
    shouldEndSession: false,
    directives: [{ type: 'Dialog.Delegate', updatedIntent: INTENT_VAZIA }],
  },
});
// Depois de adicionar: pede outro item. Aqui precisa ser ElicitSlot (o Delegate não aceita fala na mesma intenção).
const continuar = (texto: string) => resposta({
  version: '1.0',
  sessionAttributes: { conversa: true },
  response: {
    outputSpeech: { type: 'PlainText', text: texto },
    reprompt: { outputSpeech: { type: 'PlainText', text: 'Quer adicionar mais alguma coisa? Se não, diga não.' } },
    shouldEndSession: false,
    directives: [{ type: 'Dialog.ElicitSlot', slotToElicit: 'item', updatedIntent: INTENT_VAZIA }],
  },
});
const ENCERRAR = /^(nao|nada|so isso|e so isso|e so|pronto|acabou|obrigad[oa]|nao obrigad[oa]|tchau|chega|nada mais|mais nada)$/;
const juntar = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const falado = (i: { nome: string; quantidade?: string | null }) =>
  (!i.quantidade ? i.nome : /[a-zà-ú]/i.test(i.quantidade) ? `${i.quantidade} de ${i.nome}` : `${i.quantidade} ${i.nome}`).toLowerCase();
const AJUDA = 'Você pode dizer: adiciona leite e pão; o que tem na lista; ou já comprei leite.';

async function todos(): Promise<Item[]> {
  const { data, error } = await db.from('compras_itens').select('id,nome,quantidade,comprado').order('criado_em');
  if (error) throw error;
  return data as Item[];
}

// ---------- intenções ----------
async function adicionar(texto: string, conversa = false) {
  if (conversa && ENCERRAR.test(normalizar(texto).replace(/[.!,]/g, ''))) return fala('Até mais!');
  const novos = separarItens(texto);
  if (!novos.length) return conversa ? continuar('Não entendi o item. O que eu adiciono?') : fala('Não entendi o item. O que eu adiciono?', false, 'Diga, por exemplo: adiciona leite.');
  const lista = await todos();
  const criados: typeof novos = [], jaTinha: string[] = [];
  for (const n of novos) {
    const igual = lista.find((i) => normalizar(i.nome) === normalizar(n.nome));
    if (!igual) { criados.push(n); continue; }
    if (igual.comprado) {
      await db.from('compras_itens').update({ comprado: false, comprado_em: null, quantidade: n.quantidade ?? igual.quantidade }).eq('id', igual.id);
      criados.push(n);
    } else {
      if (n.quantidade && n.quantidade !== igual.quantidade) await db.from('compras_itens').update({ quantidade: n.quantidade }).eq('id', igual.id);
      jaTinha.push(n.nome.toLowerCase());
    }
  }
  const inserir = criados.filter((n) => !lista.some((i) => normalizar(i.nome) === normalizar(n.nome)));
  if (inserir.length) {
    const { error } = await db.from('compras_itens').insert(inserir.map((n) => ({ nome: n.nome, quantidade: n.quantidade, origem: 'alexa' })));
    if (error) throw error;
  }
  const partes = [];
  if (criados.length) partes.push(`Pronto, coloquei ${juntar(criados.map(falado))} na lista.`);
  if (jaTinha.length) partes.push(`${capital(juntar(jaTinha))} já ${jaTinha.length > 1 ? 'estavam' : 'estava'} na lista.`);
  return conversa ? continuar(`${partes.join(' ')} Mais alguma coisa?`) : fala(partes.join(' '));
}

async function lerLista() {
  const pend = (await todos()).filter((i) => !i.comprado);
  if (!pend.length) return fala('A lista de compras está vazia.');
  const lidos = pend.slice(0, 10).map(falado);
  const resto = pend.length - lidos.length;
  return fala(`${pend.length === 1 ? 'Tem um item' : `Tem ${pend.length} itens`} na lista: ${juntar(lidos)}${resto ? `, e mais ${resto}` : ''}.`);
}

async function comprei(texto: string) {
  const ditos = separarItens(texto);
  if (!ditos.length) return fala('O que você comprou?', false, 'Diga, por exemplo: já comprei leite.');
  const pend = (await todos()).filter((i) => !i.comprado);
  const marcados: string[] = [], naoAchei: string[] = [];
  for (const d of ditos) {
    const alvo = normalizar(d.nome);
    const item = pend.find((i) => normalizar(i.nome) === alvo) ?? pend.find((i) => normalizar(i.nome).includes(alvo) || alvo.includes(normalizar(i.nome)));
    if (!item) { naoAchei.push(d.nome.toLowerCase()); continue; }
    await db.from('compras_itens').update({ comprado: true, comprado_em: new Date().toISOString() }).eq('id', item.id);
    pend.splice(pend.indexOf(item), 1);
    marcados.push(item.nome.toLowerCase());
  }
  const partes = [];
  if (marcados.length) partes.push(`Marquei ${juntar(marcados)} como ${marcados.length > 1 ? 'comprados' : 'comprado'}.`);
  if (naoAchei.length) partes.push(`Não achei ${juntar(naoAchei)} na lista.`);
  return fala(partes.join(' '));
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- entrada ----------
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const corpo = await req.text();
  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = JSON.parse(corpo); } catch { return new Response('JSON inválido', { status: 400 }); }
  try { await verificar(req, corpo, body); } catch (e) {
    console.warn('alexa: recusada:', (e as Error).message);
    return new Response('Requisição recusada', { status: 400 });
  }

  const r = body.request ?? {};
  try {
    if (r.type === 'LaunchRequest') return abrirConversa('Oi!');
    if (r.type === 'SessionEndedRequest') return resposta({ version: '1.0', response: {} });
    if (r.type !== 'IntentRequest') return fala(AJUDA);
    const nome = r.intent?.name;
    const item = r.intent?.slots?.item?.value ?? '';
    switch (nome) {
      case 'AdicionarIntent': return await adicionar(item, !!body.session?.attributes?.conversa);
      case 'LerListaIntent': return await lerLista();
      case 'CompreiIntent': return await comprei(item);
      case 'AMAZON.HelpIntent': return fala(AJUDA, false, 'O que eu coloco na lista?');
      case 'AMAZON.StopIntent': case 'AMAZON.CancelIntent': case 'AMAZON.NavigateHomeIntent': return fala('Até mais!');
      default: return fala('Não entendi. Diga, por exemplo: adiciona leite.', false, AJUDA);
    }
  } catch (e) {
    console.error('alexa:', e);
    return fala('Tive um problema para falar com a lista de compras. Tenta de novo daqui a pouco.');
  }
});
