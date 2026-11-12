// Finanças pela Alexa: contas a pagar, anotar gasto, orçamento por categoria e marcar conta como paga.
// Cada função recebe o cliente do Supabase e devolve o texto falado (string) ou
// { texto, repetir: true, sessao } quando precisa perguntar de novo.
import { normalizar } from './itens.js';
import { MESES, hojeBR, capital, juntar, reais, dinheiro, emDias, lerValor, limparNome, achar, lerCartao, mesDaFatura } from './comum.js';

// ---------- contas do mês ----------
// Todas as contas ativas que vencem neste mês, com a situação de cada uma.
export async function contasDoMes(db, h = hojeBR()) {
  const prefixo = `${h.ano}-${String(h.mes).padStart(2, '0')}-`;
  const [k, p] = await Promise.all([
    db.from('contas').select('id,descricao,categoria,valor_previsto,dia_vencimento,recorrente,vencimento,ativa'),
    db.from('contas_pagamentos').select('conta_id').eq('ano', h.ano).eq('mes', h.mes),
  ]);
  if (k.error) throw k.error;
  if (p.error) throw p.error;
  const cadastradas = k.data.filter((c) => c.ativa !== false);
  const pagas = new Set(p.data.map((x) => x.conta_id));
  const doMes = [];
  for (const c of cadastradas) {
    let venc = null;
    if (c.recorrente !== false) venc = Math.min(c.dia_vencimento ?? 1, h.ultimo);
    else if (c.vencimento && String(c.vencimento).startsWith(prefixo)) venc = Number(String(c.vencimento).slice(8, 10));
    if (venc == null) continue;
    doMes.push({ conta: c, nome: String(c.descricao).toLowerCase(), valor: Number(c.valor_previsto) || 0, dias: venc - h.dia, paga: pagas.has(c.id) });
  }
  return { cadastradas, doMes, abertas: doMes.filter((c) => !c.paga).sort((a, b) => a.dias - b.dias) };
}

export async function faltaPagar(db, h = hojeBR()) {
  const { cadastradas, abertas } = await contasDoMes(db, h);
  if (!cadastradas.length) return 'Ainda não há contas cadastradas no aplicativo.';
  if (!abertas.length) return 'Todas as contas deste mês já foram pagas.';
  const total = abertas.reduce((s, c) => s + c.valor, 0);
  const vencidas = abertas.filter((c) => c.dias < 0);
  const proximas = abertas.filter((c) => c.dias >= 0 && c.dias <= 7);
  const partes = [`Falta pagar ${abertas.length === 1 ? 'uma conta' : `${abertas.length} contas`} neste mês, no total de ${reais(total)}.`];
  if (vencidas.length) partes.push(`${vencidas.length === 1 ? 'Está vencida' : 'Estão vencidas'}: ${juntar(vencidas.map((c) => c.nome))}.`);
  if (proximas.length) partes.push(`${proximas.length === 1 ? 'Vence' : 'Vencem'} nos próximos sete dias: ${juntar(proximas.map((c) => `${c.nome} ${emDias(c.dias)}`))}.`);
  return partes.join(' ');
}

// ---------- marcar conta como paga ----------
// "a conta de luz", "luz 180 reais". Sem valor dito, usa o valor previsto da conta.
// sessao.contaId: conta escolhida antes, quando a Alexa perguntou só o valor.
export async function pagarConta(db, texto, sessao = {}, h = hojeBR()) {
  const { valor, resto } = lerValor(texto);
  const nome = limparNome(resto, ['conta', 'contas', 'boleto', 'fatura']);
  const { doMes, abertas } = await contasDoMes(db, h);
  let alvo;
  if (nome) {
    const achadas = achar(doMes, nome, (c) => c.conta.descricao);
    if (!achadas.length) return `Não achei ${nome} entre as contas deste mês.`;
    const emAberto = achadas.filter((c) => !c.paga);
    if (!emAberto.length) return `A conta de ${achadas[0].nome} deste mês já está paga.`;
    if (emAberto.length > 1) return { texto: `Achei ${juntar(emAberto.map((c) => c.nome))}. Qual delas você pagou?`, repetir: true };
    alvo = emAberto[0];
  } else if (sessao.contaId) {
    alvo = abertas.find((c) => c.conta.id === sessao.contaId);
    if (!alvo) return 'Essa conta já está paga.';
  } else return { texto: 'Qual conta você pagou?', repetir: true };

  const v = valor || alvo.valor;
  if (!v) return { texto: `Quanto foi a conta de ${alvo.nome}?`, repetir: true, sessao: { contaId: alvo.conta.id } };
  // Igual ao app: cria a saída em Finanças e registra o pagamento ligado a ela.
  const lanc = { ano: h.ano, mes: h.mes, tipo: 'saida', descricao: alvo.conta.descricao, categoria: alvo.conta.categoria, valor: v };
  const { data, error } = await db.from('lancamentos').insert(lanc).select('id').single();
  if (error) throw error;
  const pg = await db.from('contas_pagamentos').insert({ conta_id: alvo.conta.id, ano: h.ano, mes: h.mes, pago_em: h.iso, valor: v, lancamento_id: data.id });
  if (pg.error) { await db.from('lancamentos').delete().eq('id', data.id); throw pg.error; }
  const faltam = abertas.length - 1;
  return `Pronto, marquei a conta de ${alvo.nome} como paga, ${dinheiro(v)}. ${faltam ? `Ainda ${faltam === 1 ? 'falta uma conta' : `faltam ${faltam} contas`} neste mês.` : 'Com essa, todas as contas do mês estão pagas.'}`;
}

// ---------- anotar gasto ----------
// Mesmas palavras-chave da importação da fatura (js/importar.js), sem as categorias próprias do cartão.
const REGRAS = [
  [/supermerc|atacad|mercado(?!\s*livre|pago)|hortifr|a[cç]ougue|sacol[aã]o|feira/i, 'Mercado'],
  [/posto|combust|gasolina|etanol|[aá]lcool|diesel|shell|ipiranga|petrobras/i, 'Combustível'],
  [/farm[aá]c|drogaria|rem[eé]dio|panvel|droga raia|pague menos/i, 'Farmácia'],
  [/ifood|rappi|sushi|lanch|caf[eé]|panific|padaria|pizz|burger|restaur|a[cç]a[ií]|sorvete|almo[cç]o|jantar/i, 'Alimentação fora'],
  [/passagem|hotel|pousada|airbnb|booking|viagem/i, 'Viagem'],
  [/uber|\b99\b|t[aá]xi|estacion|ped[aá]gio|[oô]nibus|metr[oô]/i, 'Transporte'],
  [/seguro/i, 'Seguros'],
  [/shopee|magalu|amazon|mercado livre|aliexpress|shein|americanas/i, 'Compras online'],
  [/leroy|ferragem|ferramenta|madeireira|tinta|constru|material de/i, 'Casa e obra'],
  [/cinema|ingresso|show|teatro|netflix|spotify|streaming/i, 'Lazer e assinaturas'],
];
const SO_CARTAO = /cart[aã]o|estorno|pix no cr/i;

function escolherCategoria(desc, saidas, tetos) {
  const nd = normalizar(desc);
  // 1º: a categoria usada da última vez para a mesma descrição
  const antes = saidas.find((l) => normalizar(l.descricao) === nd && !SO_CARTAO.test(l.categoria));
  if (antes) return antes.categoria;
  // 2º: a descrição é o nome de uma categoria que já existe ("mercado", "farmácia")
  const cats = [...new Set([...tetos.map((o) => o.categoria), ...saidas.map((l) => l.categoria)])].filter((c) => !SO_CARTAO.test(c));
  const porNome = cats.find((c) => normalizar(c) === nd) ?? cats.find((c) => normalizar(c).length >= 4 && nd.split(' ').includes(normalizar(c)));
  if (porNome) return porNome;
  // 3º: palavras-chave; usa a grafia da categoria já existente, se houver
  for (const [re, cat] of REGRAS) if (re.test(desc)) return cats.find((c) => normalizar(c) === normalizar(cat)) ?? cat;
  return cats.find((c) => normalizar(c) === 'outros') ?? 'Outros';
}

async function gastoDoMes(db, h) {
  const { data, error } = await db.from('lancamentos').select('categoria,valor').eq('ano', h.ano).eq('mes', h.mes).eq('tipo', 'saida');
  if (error) throw error;
  const m = new Map();
  data.forEach((l) => m.set(l.categoria, (m.get(l.categoria) || 0) + Number(l.valor)));
  return m;
}

async function tetos(db) {
  const { data, error } = await db.from('orcamentos').select('categoria,teto');
  if (error) throw error;
  return data.map((o) => ({ categoria: o.categoria, teto: Number(o.teto) }));
}

// "45 reais na padaria". sessao.gastoValor: valor dito antes, quando a Alexa perguntou só onde foi.
// Cartões que a casa já usa: os dos lançamentos e os apelidos dos cartões do Open Finance.
async function cartoesConhecidos(db) {
  const [l, o] = await Promise.all([
    db.from('lancamentos').select('cartao').not('cartao', 'is', null).order('id', { ascending: false }).limit(2000),
    db.from('of_contas').select('nome,apelido,tipo').eq('tipo', 'CREDIT'),
  ]);
  if (l.error) throw l.error;
  const nomes = [...l.data.map((x) => x.cartao), ...(o.error ? [] : o.data.map((x) => x.apelido || x.nome))].filter(Boolean);
  const vistos = new Map();
  nomes.forEach((n) => { if (!vistos.has(normalizar(n))) vistos.set(normalizar(n), n); });
  return [...vistos.values()];
}

// "45 reais na padaria", "500 reais no cartão Nubank". Quando falta algo, pergunta e guarda o que já foi dito na sessão:
// gastoValor, gastoDesc, gastoCartao (nome do cartão) e gastoCredito (falou "crédito" mas há mais de um cartão).
export async function anotarGasto(db, texto, sessao = {}, h = hojeBR()) {
  const cartoes = await cartoesConhecidos(db);
  const lc = lerCartao(texto, cartoes);
  const lido = lerValor(lc.resto);
  const valor = lido.valor ?? sessao.gastoValor ?? null;
  let desc = limparNome(lido.resto, ['gasto', 'gastos', 'despesa', 'compra']);
  let cartao = lc.cartao ?? sessao.gastoCartao ?? null;
  if (cartao == null && sessao.gastoCredito) {
    // respondendo "Em qual cartão?": a resposta é o nome do cartão
    const [k] = achar(cartoes, desc);
    if (k) { cartao = k; desc = ''; }
  }
  desc = desc || sessao.gastoDesc || '';
  if (cartao === '') {
    if (cartoes.length === 1) cartao = cartoes[0];
    else if (!cartoes.length) cartao = 'Cartão de crédito';
    else return { texto: `Em qual cartão? ${juntar(cartoes).replace(/ e ([^ ]+)$/, ' ou $1')}?`, repetir: true, sessao: { gastoValor: valor, gastoDesc: desc, gastoCredito: true } };
  }
  const guardado = { gastoValor: valor, gastoDesc: desc, gastoCartao: cartao };
  if (!valor) return { texto: 'Quanto quer adicionar?', repetir: true, sessao: guardado };
  if (!desc) return { texto: 'Em que foi?', repetir: true, sessao: guardado };

  const [hist, orc] = await Promise.all([
    db.from('lancamentos').select('descricao,categoria,cartao').eq('tipo', 'saida').order('id', { ascending: false }).limit(3000),
    tetos(db),
  ]);
  if (hist.error) throw hist.error;
  if (cartao) {
    // Igual a uma compra importada do cartão: mês da fatura, data da compra e uma chave que marca que veio da Alexa
    // (a tela Bancos e a importação do CSV usam isso para avisar quando a mesma compra chegar do banco).
    const doCartao = hist.data.filter((l) => l.cartao);
    let categoria = escolherCategoria(desc, [...doCartao, ...hist.data], orc);
    if (normalizar(categoria) === 'outros') categoria = 'Outros (cartão)';
    const f = mesDaFatura(h);
    const ins = await db.from('lancamentos').insert({
      ...f, tipo: 'saida', descricao: capital(desc), categoria, valor, cartao, data_compra: h.iso,
      import_key: `alexa|${h.iso}|${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    });
    if (ins.error) throw ins.error;
    return `Anotei ${dinheiro(valor)} de ${desc.toLowerCase()} no cartão ${cartao}, na fatura de ${MESES[f.mes - 1]}.`;
  }
  const categoria = escolherCategoria(desc, hist.data, orc);
  const ins = await db.from('lancamentos').insert({ ano: h.ano, mes: h.mes, tipo: 'saida', descricao: capital(desc), categoria, valor });
  if (ins.error) throw ins.error;
  let fala = normalizar(desc) === normalizar(categoria) ? `Anotei ${dinheiro(valor)} em ${categoria.toLowerCase()}.` : `Anotei ${dinheiro(valor)} de ${desc.toLowerCase()} em ${categoria.toLowerCase()}.`;
  const t = orc.find((o) => o.categoria === categoria);
  if (t) {
    const gasto = (await gastoDoMes(db, h)).get(categoria) || 0;
    fala += gasto > t.teto ? ` Atenção: ${categoria.toLowerCase()} passou ${reais(gasto - t.teto)} do teto do mês.` : ` Em ${categoria.toLowerCase()}, ainda dá ${reais(t.teto - gasto)} este mês.`;
  }
  return fala;
}

// ---------- orçamento ----------
// "mercado" → quanto ainda dá; vazio → resumo das categorias com teto.
export async function orcamento(db, texto, h = hojeBR()) {
  const nome = limparNome(texto, ['orçamento', 'orcamento', 'categoria', 'gastar', 'gastos?', 'gastei']);
  const [orc, gasto] = await Promise.all([tetos(db), gastoDoMes(db, h)]);
  const total = [...gasto.values()].reduce((s, v) => s + v, 0);
  if (nome) {
    const [o] = achar(orc, nome, (x) => x.categoria);
    if (o) {
      const g = gasto.get(o.categoria) || 0, cat = o.categoria.toLowerCase();
      return g > o.teto
        ? `${capital(cat)} passou ${reais(g - o.teto)} do teto. Este mês já foram ${reais(g)} de ${reais(o.teto)}.`
        : `Em ${cat}, ainda dá para gastar ${reais(o.teto - g)} este mês. Já foram ${reais(g)} de ${reais(o.teto)}.`;
    }
    const [cat] = achar([...gasto.keys()], nome);
    if (cat) return `${capital(cat.toLowerCase())} não tem teto no orçamento. Este mês já foram ${reais(gasto.get(cat))}.`;
    return `Não achei ${nome} no orçamento.${orc.length ? ` As categorias com teto são ${juntar(orc.map((x) => x.categoria.toLowerCase()))}.` : ''}`;
  }
  const inicio = `Este mês já foram ${reais(total)} em gastos.`;
  if (!orc.length) return `${inicio} Ainda não há tetos de orçamento no aplicativo.`;
  const comGasto = orc.map((o) => ({ ...o, g: gasto.get(o.categoria) || 0 }));
  const acima = comGasto.filter((o) => o.g > o.teto);
  const perto = comGasto.filter((o) => o.g <= o.teto && o.g >= o.teto * 0.8);
  const somaG = comGasto.reduce((s, o) => s + o.g, 0), somaT = comGasto.reduce((s, o) => s + o.teto, 0);
  const partes = [inicio, `Nas categorias com teto, foram ${reais(somaG)} de ${reais(somaT)}.`];
  if (acima.length) partes.push(`${acima.length === 1 ? 'Passou' : 'Passaram'} do teto: ${juntar(acima.map((o) => o.categoria.toLowerCase()))}.`);
  if (perto.length) partes.push(`Perto do teto: ${juntar(perto.map((o) => `${o.categoria.toLowerCase()}, ${Math.round((o.g / o.teto) * 100)} por cento`))}.`);
  if (!acima.length && !perto.length) partes.push('Tudo dentro do teto.');
  return partes.join(' ');
}
