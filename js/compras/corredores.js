// Em que corredor do mercado cada item fica, para a lista aparecer na ordem em que se anda na loja.
import { normalizar } from './itens.js';

// Ordem em que os corredores aparecem na lista.
export const CORREDORES = [
  ['hortifruti', 'hortifrúti'],
  ['padaria', 'padaria'],
  ['acougue', 'açougue e peixaria'],
  ['frios', 'frios e laticínios'],
  ['congelados', 'congelados'],
  ['mercearia', 'mercearia'],
  ['bebidas', 'bebidas'],
  ['limpeza', 'limpeza'],
  ['higiene', 'higiene e farmácia'],
  ['bebe', 'bebê'],
  ['pet', 'pet'],
  ['outros', 'outros'],
];

// A primeira regra que casar vale: as mais específicas vêm antes ("molho de tomate" antes de "tomate").
const REGRAS = [
  ['pet', 'racao|areia de gato|areia higienica|petisco|sache para|tapete higienico|coleira'],
  ['bebe', 'fralda|lenco umedecido|mamadeira|chupeta|papinha|pomada para assadura'],
  ['higiene', 'papel higienico|sabonete|shampoo|xampu|condicionador|creme dental|pasta de dente|escova de dente|fio dental|desodorante|absorvente|cotonete|algodao|barbeador|lamina|creme de barbear|hidratante|protetor solar|enxaguante|curativo|band aid|remedio|dipirona|paracetamol|vitamina|preservativo|esmalte|acetona'],
  ['limpeza', 'detergente|sabao|amaciante|agua sanitaria|candida|desinfetante|alvejante|esponja|bucha|pano de|saco de lixo|papel toalha|guardanapo|papel aluminio|filme plastico|limpa vidro|multiuso|veja|lustra movel|inseticida|vassoura|rodo|luva|limpador|desengordurante|sapolio|palha de aco|bombril|vela|fosforo|pilha|lampada'],
  ['congelados', 'pizza|lasanha|hamburguer|nugget|sorvete|picole|acai|pao de queijo|batata congelada|batata frita|congelad|empanado'],
  ['mercearia', 'molho de tomate|extrato de tomate|leite de coco|leite condensado|creme de leite|leite em po|oleo|azeite|vinagre|arroz|feijao|macarrao|massa|farinha|acucar|adocante|sal\\b|cafe|cha\\b|achocolatado|nescau|toddy|biscoito|bolacha|cereal|granola|aveia|milho|ervilha|atum|sardinha|maionese|ketchup|catchup|mostarda|shoyu|tempero|caldo|pimenta\\b|oregano|canela|fermento|gelatina|chocolate|bombom|doce de|geleia|mel\\b|amendoim|castanha|pipoca|salgadinho|batata palha|lentilha|grao de bico|fuba|polvilho|tapioca|goiabada|pacoca|azeitona|palmito|ovo'],
  ['bebidas', 'agua\\b|agua mineral|agua com gas|agua de coco|refrigerante|coca|guarana|suco|cerveja|vinho|energetico|isotonico|whisky|vodka|cachaca|gin\\b|espumante|cha gelado|kombucha'],
  ['frios', 'leite|queijo|mussarela|mucarela|presunto|mortadela|peito de peru|salame|iogurte|manteiga|margarina|requeijao|cream cheese|nata|ricota|coalhada|danone|yakult|salsicha|bacon|linguica|calabresa'],
  ['acougue', 'carne|frango|bife|picanha|alcatra|patinho|acem|costela|file|coxa|sobrecoxa|asa\\b|peito de frango|moida|porco|lombo|pernil|peixe|tilapia|salmao|camarao|bisteca|cupim|maminha|fraldinha|figado|hamburguer artesanal'],
  ['padaria', 'pao|bolo|torrada|bisnaguinha|croissant|sonho|rosca|broa|baguete|salgado'],
  ['hortifruti', 'banana|maca|laranja|limao|limoes|mamao|uva|morango|abacaxi|melancia|melao|manga|pera|abacate|kiwi|tangerina|mexerica|bergamota|goiaba|maracuja|ameixa|pessego|coco\\b|tomate|cebola|alho|batata|cenoura|alface|couve|brocolis|pepino|pimentao|abobrinha|abobora|mandioca|aipim|beterraba|chuchu|repolho|rucula|espinafre|cheiro verde|salsinha|salsa\\b|cebolinha|coentro|gengibre|hortela|manjericao|berinjela|quiabo|vagem|inhame|fruta|verdura|legume|salada'],
].map(([id, p]) => [id, new RegExp(`(^|\\s)(${p})`)]);

// "Molho de tomate" → 'mercearia' · "Tomate" → 'hortifruti' · algo desconhecido → 'outros'
export function corredor(nome) {
  const n = normalizar(nome);
  const r = REGRAS.find(([, re]) => re.test(n));
  return r ? r[0] : 'outros';
}
