// Edge Function "alexa": atende a skill particular "Nossa Casa": lista de compras, finanças e reparos.
//   "Alexa, abre nossa casa" → "Olá, Erminho! O que deseja fazer?" (hub: depois de cada pedido, "Mais alguma coisa?")
//   → "adicionar gasto" → "Quanto quer adicionar?" → "500 reais no cartão Nubank" → "Em que foi?" → "mercado"
//   "Alexa, peça à nossa casa para adicionar leite e pão"
//   "Alexa, pergunte à nossa casa o que tem na lista"
//   "Alexa, diga à nossa casa que já comprei leite"
//   "Alexa, pergunte à nossa casa quanto falta pagar"
//   "Alexa, diga à nossa casa que paguei a conta de luz"
//   "Alexa, peça à nossa casa para anotar um gasto de 45 reais na padaria"
//   "Alexa, pergunte à nossa casa quanto ainda posso gastar com mercado"
//   "Alexa, pergunte à nossa casa quanto falta para a meta da viagem"
//   "Alexa, diga à nossa casa que guardei 200 reais na viagem"
//   "Alexa, pergunte à nossa casa como está a casa hoje" (resumo do dia)
//   "Alexa, peça à nossa casa para anotar um reparo torneira pingando"
// Deploy (veja o README):
//   npx supabase secrets set ALEXA_SKILL_ID=amzn1.ask.skill.xxxx
//   npx supabase functions deploy alexa --no-verify-jwt
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as x509 from 'npm:@peculiar/x509@1';
import { separarItens, normalizar } from './itens.js';
import { capital, juntar } from './comum.js';
import { anotarGasto, faltaPagar, orcamento, pagarConta } from './financas.js';
import { guardarNaMeta, metaSituacao } from './metas.js';
import { resumoDoDia } from './resumo.js';
import { nomeDaPessoa, salvarNome } from './pessoas.js';

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
// As funções montam o corpo da resposta; a entrada aplica o hub (ver noHub) e só então vira Response.
// deno-lint-ignore no-explicit-any
type Corpo = any;
const resposta = (body: Corpo): Corpo => body;
const fala = (texto: string, terminar = true, insistir?: string): Corpo => resposta({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text: texto },
    shouldEndSession: terminar,
    ...(insistir ? { reprompt: { outputSpeech: { type: 'PlainText', text: insistir } } } : {}),
  },
});
const INTENT_VAZIA = { name: 'AdicionarIntent', confirmationStatus: 'NONE', slots: { item: { name: 'item', confirmationStatus: 'NONE' } } };
// Despedida: encerra mesmo dentro do hub.
const tchau = (): Corpo => ({ ...fala('Até mais!'), fim: true });

// ---------- hub ("Alexa, abre nossa casa") ----------
const MENU = 'Você pode adicionar um gasto, colocar algo na lista, pagar uma conta, perguntar do orçamento ou das metas, ou ouvir o resumo do dia.';
const abrirHub = (nome: string | null, texto?: string): Corpo => ({
  version: '1.0',
  sessionAttributes: { hub: true, nome },
  response: {
    outputSpeech: { type: 'PlainText', text: texto ?? `Olá${nome ? `, ${nome}` : ''}! O que deseja fazer?` },
    reprompt: { outputSpeech: { type: 'PlainText', text: `${MENU} O que deseja fazer?` } },
    shouldEndSession: false,
  },
});
// Dentro do hub, nada encerra sozinho: a resposta ganha "Mais alguma coisa?" e a sessão continua.
// Os atributos do hub (hub, nome) seguem junto com o que a resposta já guarda (ex.: o valor de um gasto pela metade).
// deno-lint-ignore no-explicit-any
function noHub(b: Corpo, sessao: any): Corpo {
  const fim = !!b?.fim;
  if (b) delete b.fim;
  if (!sessao?.hub || !b?.response?.outputSpeech || fim) return b;
  b.sessionAttributes = { ...(b.sessionAttributes ?? {}), hub: true, nome: b.sessionAttributes?.nome ?? sessao.nome ?? null };
  const r = b.response;
  if (r.shouldEndSession !== false) {
    r.outputSpeech.text += ' Mais alguma coisa?';
    r.shouldEndSession = false;
    r.reprompt = { outputSpeech: { type: 'PlainText', text: 'Mais alguma coisa? Se não, é só dizer não.' } };
  }
  return b;
}
// Pergunta de novo dentro da mesma intenção: a resposta ("45 reais na padaria") volta no slot "item".
const perguntar = (intent: string, texto: string, sessao: Record<string, unknown> = {}) => resposta({
  version: '1.0',
  sessionAttributes: sessao,
  response: {
    outputSpeech: { type: 'PlainText', text: texto },
    reprompt: { outputSpeech: { type: 'PlainText', text: texto } },
    shouldEndSession: false,
    directives: [{ type: 'Dialog.ElicitSlot', slotToElicit: 'item', updatedIntent: { ...INTENT_VAZIA, name: intent } }],
  },
});
// Os módulos devolvem o texto falado, ou { texto, repetir, sessao } quando falta alguma informação.
type Saida = string | { texto: string; repetir?: boolean; sessao?: Record<string, unknown> };
const responder = (intent: string, r: Saida) =>
  (typeof r === 'string' ? fala(r) : r.repetir ? perguntar(intent, r.texto, r.sessao) : fala(r.texto));

const CANCELAR = /^(?:pare|para|parar|cancela|cancelar|cancele|esquece|esqueca|deixa|deixa pra la|deixa para la|nao|nao quero|nada|tchau|sair|sai|chega|desisto|ignora|volta|voltar)$/;
const ENCERRAR = /^(nao|nada|so isso|e so isso|e so|pronto|acabou|obrigad[oa]|nao obrigad[oa]|tchau|chega|nada mais|mais nada)$/;
// Frases que o modelo de voz pode jogar na AdicionarIntent ("adicionar {item}"): estes começos levam ao pedido certo.
const PEDIDOS: [RegExp, string][] = [
  [/^(?:um |uma |o )?(?:gasto|despesa)(?: de| no| na)?\b/, 'GastoIntent'], // "adicionar gasto", "adicionar um gasto de 50 reais"
  [/^(?:um |o )?(?:reparo|conserto)\b/, 'AnotarReparoIntent'],
  [/^(?:quanto (?:ainda )?falta pagar|quais contas|que contas|tem conta|o que vence)\b/, 'ContasIntent'],
  [/^(?:o que tem na lista|o que tem para comprar|o que falta comprar|ler a lista|le a lista|leia a lista)\b/, 'LerListaIntent'],
  [/^anot[ae]r? (?:um |o )?(?:reparo|conserto)\b/, 'AnotarReparoIntent'],
  [/^(?:(?:anot[ae]r?|lanc[ae]r?|registr[ae]r?) (?:um |o )?gasto(?: de)?|gastei)\b/, 'GastoIntent'],
  [/^(?:ja )?paguei\b/, 'PagarContaIntent'],
  [/^(?:quanto (?:ainda )?(?:posso|da para|da pra) gastar|como (?:esta|anda) o orcamento|quanto (?:ja )?gastei)\b/, 'OrcamentoIntent'],
  [/^(?:quanto falta (?:para|pra|na) (?:a |as )?metas?|como (?:esta|estao|andam) (?:a |as )?metas?|quanto (?:ja )?(?:guardei|tem guardado) (?:para|pra))\b/, 'MetaIntent'],
  [/^(?:ja )?(?:guardei|juntei)\b/, 'GuardarMetaIntent'],
  [/^(?:(?:o |me da o |me de o )?resumo(?: do dia)?|como esta a casa|o que tem (?:para |pra )?hoje|bom dia|como vai ser o dia)\b/, 'ResumoIntent'],
];
const falado = (i: { nome: string; quantidade?: string | null }) =>
  (!i.quantidade ? i.nome : /[a-zà-ú]/i.test(i.quantidade) ? `${i.quantidade} de ${i.nome}` : `${i.quantidade} ${i.nome}`).toLowerCase();
const AJUDA = 'Você pode dizer: como está a casa hoje; adiciona leite e pão; o que tem na lista; já comprei leite; quanto falta pagar; paguei a conta de luz; '
  + 'anotar um gasto de 45 reais na padaria; quanto ainda posso gastar com mercado; quanto falta para a meta da viagem; '
  + 'guardei 200 reais na viagem; ou anotar um reparo.';

async function todos(): Promise<Item[]> {
  const { data, error } = await db.from('compras_itens').select('id,nome,quantidade,comprado').order('criado_em');
  if (error) throw error;
  return data as Item[];
}

// ---------- intenções ----------
// deno-lint-ignore no-explicit-any
async function adicionar(texto: string, sessao: any = {}) {
  const dito = normalizar(texto).replace(/[.!?,]/g, '');
  if (sessao.hub && ENCERRAR.test(dito)) return tchau();
  // "adicionar gasto" ou, no hub, uma frase livre que o modelo de voz jogou aqui: leva ao pedido certo
  for (const [re, intent] of PEDIDOS) {
    const m = re.exec(dito);
    // tira do texto original as palavras do começo do pedido (mantém acentos do resto)
    if (m) return executar(intent, texto.trim().split(/\s+/).slice(m[0].split(' ').length).join(' '), sessao);
  }
  const novos = separarItens(texto);
  if (!novos.length) return fala('Não entendi o item. O que eu adiciono?', false, 'Diga, por exemplo: adiciona leite.');
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
  return fala(partes.join(' '));
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

// ---------- reparos ----------
async function anotarReparo(texto: string) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim().replace(/^(de|do|da|para|pra|que)\s+/i, '').replace(/[.!?]+$/, '');
  if (!t) return fala('Qual é o reparo?', false, 'Diga, por exemplo: anotar um reparo, torneira da cozinha pingando.');
  const { data, error } = await db.from('reparos').select('id,titulo,status');
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  if ((data as any[]).some((r) => r.status !== 'feito' && normalizar(r.titulo) === normalizar(t))) return fala(`${capital(t)} já está anotado nos reparos.`);
  const ins = await db.from('reparos').insert([{ titulo: capital(t) }]);
  if (ins.error) throw ins.error;
  return fala(`Anotei nos reparos: ${t}.`);
}

// deno-lint-ignore no-explicit-any
async function executar(nome: string, item: string, sessao: any, personId: string | null = null): Promise<Corpo> {
  switch (nome) {
    case 'AdicionarIntent': return await adicionar(item, sessao);
    case 'NomeIntent': {
      const r = await salvarNome(db, personId, item);
      return typeof r === 'object' && r.nome ? abrirHub(r.nome, r.texto) : responder(nome, r);
    }
    case 'AMAZON.YesIntent': return sessao.hub ? abrirHub(sessao.nome ?? null, 'O que deseja fazer?') : fala('Certo.');
    case 'AMAZON.NoIntent': return tchau();
    case 'AMAZON.FallbackIntent':
      return sessao.hub ? fala(`Não entendi. ${MENU} O que deseja fazer?`, false, 'O que deseja fazer?')
        : fala('Não entendi. Diga, por exemplo: adiciona leite.', false, AJUDA);
    case 'LerListaIntent': return await lerLista();
    case 'CompreiIntent': return await comprei(item);
    case 'ContasIntent': return fala(await faltaPagar(db));
    case 'PagarContaIntent': return responder(nome, await pagarConta(db, item, sessao));
    case 'GastoIntent': return responder(nome, await anotarGasto(db, item, sessao));
    case 'OrcamentoIntent': return responder(nome, await orcamento(db, item));
    case 'MetaIntent': return responder(nome, await metaSituacao(db, item));
    case 'GuardarMetaIntent': return responder(nome, await guardarNaMeta(db, item, sessao));
    case 'ResumoIntent': return fala(await resumoDoDia(db));
    case 'AnotarReparoIntent': return await anotarReparo(item);
    case 'AMAZON.HelpIntent': return fala(`${AJUDA} O que deseja fazer?`, false, 'O que deseja fazer?');
    case 'AMAZON.StopIntent': case 'AMAZON.CancelIntent': case 'AMAZON.NavigateHomeIntent': return tchau();
    default: return fala('Não entendi. Diga, por exemplo: adiciona leite.', false, AJUDA);
  }
}

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
  const sessao = body.session?.attributes ?? {};
  const personId: string | null = body.context?.System?.person?.personId ?? null;
  const json = (b: Corpo) => new Response(JSON.stringify(b), { headers: { 'Content-Type': 'application/json;charset=UTF-8' } });
  try {
    if (r.type === 'LaunchRequest') {
      const nome = await nomeDaPessoa(db, personId);
      // voz reconhecida, mas ainda sem nome: pergunta uma vez
      if (personId && nome === null) return json(abrirHub(null,'Olá! Ainda não sei o seu nome. Diga: meu nome é, e o seu nome. Ou diga o que deseja fazer.'));
      return json(abrirHub(nome ?? null));
    }
    if (r.type === 'SessionEndedRequest') return json({ version: '1.0', response: {} });
    if (r.type !== 'IntentRequest') return json(fala(AJUDA));
    // Respondendo a uma pergunta ("Em que foi?"), "pare"/"cancela"/"não" chegam como o próprio slot: cancela, sem gravar.
    const dito = normalizar(r.intent?.slots?.item?.value ?? '').replace(/[.!?,]/g, '');
    // pergunta pendente: a nossa (algo guardado na sessão além de hub/nome) ou a da própria Alexa (slot de outra intenção que não a lista)
    const pendente = Object.keys(sessao).some((k) => k !== 'hub' && k !== 'nome') || (r.intent?.name ?? '') !== 'AdicionarIntent';
    if (/^(?:tchau|sair|sai|chega)$/.test(dito)) return json(tchau());
    if (pendente && CANCELAR.test(dito)) {
      return json(sessao.hub ? abrirHub(sessao.nome ?? null, 'Tudo bem, não anotei nada. O que deseja fazer?') : fala('Tudo bem, não anotei nada.'));
    }
    return json(noHub(await executar(r.intent?.name ?? '', r.intent?.slots?.item?.value ?? '', sessao, personId), sessao));
  } catch (e) {
    console.error('alexa:', e);
    return json(noHub(fala('Tive um problema para falar com o aplicativo. Tenta de novo daqui a pouco.'), sessao));
  }
});
