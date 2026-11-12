// Sugestão de categoria para compras e movimentações importadas (fatura em CSV e Open Finance).
// Usado pelo app e pela função "openfinance" (cópia em supabase/functions/openfinance/categorias.js — mantenha as duas iguais).

// Descrição sem a parte "- Parcela 3/10", para reconhecer a mesma loja entre faturas.
export const chaveLoja = (d) => String(d).replace(/\s*-\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, '').trim().toLowerCase();

const REGRAS = [
  [/pagamento recebido/i, null],
  [/pix no cr[eé]dito/i, 'Pix no crédito'],
  [/supermerc|atacad|mercado(?!\s*livre|pago)|hortifr|a[cç]ougue|sacol[aã]o/i, 'Mercado'],
  [/posto|combust|shell|ipiranga|petrobras|\bbr mania/i, 'Combustível'],
  [/panvel|farm[aá]c|drogas|droga raia|pague menos/i, 'Farmácia'],
  [/ifd\*|ifood|rappi|sushi|lanch|caf[eé]|panific|padaria|pizz|burger|restaur|bacio|choper|a[cç]a[ií]/i, 'Alimentação fora'],
  [/azul linhas|latam|\bgol\b|gol linhas|booking|airbnb|hotel|decolar|123milhas|smiles/i, 'Viagem'],
  [/uber|99app|\b99\b|estacion|est baia|mpk est|sem parar|veloe|conectcar|ped[aá]gio/i, 'Transporte'],
  [/seguro|porto seg/i, 'Seguros'],
  [/shopee|tiktok|magalu|mlp\*|amazon|amzn|mercadolivre|mercado livre|aliexpress|shein|americanas/i, 'Compras online'],
  [/leroy|cer[aâ]mica|ceramic|orion maq|maquinas e ferra|ferragem|madeireira|tintas|constru/i, 'Casa e obra'],
  [/ticketmaster|sympla|ingresso|cinema|netflix|spotify|disney|hbo|prime video|youtube|steam|playstation/i, 'Lazer e assinaturas'],
];

/**
 * 1º: categoria já usada antes para a mesma loja (aprende com as correções); 2º: palavras-chave.
 * historico: Map chaveLoja → categoria.
 * opcoes.cartao = false para conta corrente: aí o valor negativo não é estorno, e o padrão é "Outros" / "Outras entradas".
 */
export function sugerirCategoria(titulo, valor, historico, { cartao = true, tipo = 'saida' } = {}) {
  if (cartao && valor < 0) return 'Estornos do cartão';
  const padrao = cartao ? 'Outros (cartão)' : tipo === 'entrada' ? 'Outras entradas' : 'Outros';
  const prev = historico.get(chaveLoja(titulo));
  if (prev) return prev;
  if (tipo === 'entrada') return padrao;
  for (const [re, cat] of REGRAS) if (re.test(titulo)) return cat || padrao;
  return padrao;
}
