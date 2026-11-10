// Áreas da casa. Para criar um módulo novo:
// 1. crie a pasta js/<id>/ com um index.js que exporta o módulo (veja js/financas/index.js);
// 2. adicione uma linha aqui com status 'ativo' e o load() apontando para ele;
// 3. se precisar, acrescente o ícone em js/ui.js (IC).
export const MODULOS = [
  { id: 'financas', nome: 'Finanças', desc: 'Entradas, saídas, cartões e investimentos', icone: 'financas', status: 'ativo',
    load: () => import('./financas/index.js').then((m) => m.default) },
  { id: 'calendario', nome: 'Calendário', desc: 'A agenda da família, conectada ao Google Agenda', icone: 'calendario', status: 'ativo',
    load: () => import('./calendario/index.js').then((m) => m.default) },
  { id: 'compras', nome: 'Lista de compras', desc: 'O que falta em casa, compartilhada entre vocês e com a Alexa', icone: 'compras', status: 'ativo',
    load: () => import('./compras/index.js').then((m) => m.default) },
  { id: 'reparos', nome: 'Reparos e melhorias', desc: 'O que consertar ou melhorar na casa, com fotos de antes e depois', icone: 'reparos', status: 'ativo',
    load: () => import('./reparos/index.js').then((m) => m.default) },
];

export const modulo = (id) => MODULOS.find((m) => m.id === id);
