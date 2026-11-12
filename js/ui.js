// Utilitários de tela compartilhados por todos os módulos.
import { NOME_CASA } from './config.js';

export const modal = document.getElementById('modal');
modal.addEventListener('close', () => modal.classList.remove('wide'));

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const sinal = (v) => (v >= 0 ? '+' : '−');
export const PAL = ['var(--lime)', '#8E8EF5', '#F5A35C', '#5EC8C8', '#E98AB8', '#B0B07A', '#9A9AA0'];
export const brand = () => `${esc(NOME_CASA)}<span>.</span>`;

// Ícones de traço (24×24). Novos módulos podem adicionar os seus aqui.
export const IC = {
  inicio: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  voltar: 'M15 5l-7 7 7 7',
  seta: 'M5 12h14M13 6l6 6-6 6',
  financas: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 13.5h2',
  calendario: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
  compras: 'M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01',
  resumo: 'M3 11l9-7 9 7M5 10v10h14V10',
  lancamentos: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cartoes: 'M2 7h20v12H2zM2 11h20',
  banco: 'M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18',
  investimentos: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  calculadoras: 'M5 3h14v18H5zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  dicas: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z',
  plus: 'M12 5v14M5 12h14',
  importar: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  copiar: 'M8 4h11v13H8zM5 7v13h11',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  tema: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sair: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 7h16M4 12h16M4 17h10',
  fechar: 'M6 6l12 12M18 6L6 18',
  avancar: 'M9 5l7 7-7 7',
  contas: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
  orcamento: 'M12 3a9 9 0 1 0 9 9h-9zM15 2.5A8 8 0 0 1 21.5 9H15z',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  desfazer: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  agenda: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  pessoas: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  reparos: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  melhoria: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  documentos: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  clipe: 'M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  rotina: 'M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  check: 'M5 12l5 5 9-10',
  cardapio: 'M7 2v8a2.5 2.5 0 0 0 5 0V2M9.5 2v20M19 22V2c-2.5 1-4 4-4 8v3h4',
  metas: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
export const ico = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IC[k] || IC.inicio}"></path></svg>`;

// Reduz a foto no próprio celular antes de enviar (fotos de câmera têm 3–8 MB).
export async function reduzirImagem(file, max, q) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    src = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error(`Não consegui abrir "${file.name}". Use uma foto JPG ou PNG.`));
      i.src = URL.createObjectURL(file);
    });
  }
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error('Falha ao preparar a foto.'))), 'image/jpeg', q));
}
