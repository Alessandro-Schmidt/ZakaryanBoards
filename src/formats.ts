import type { Board, BoardFormat } from './types';

export const FORMATS: BoardFormat[] = [
  { id: 'a4', label: 'A4', group: 'print', unit: 'mm', w: 210, h: 297 },
  { id: 'a3', label: 'A3', group: 'print', unit: 'mm', w: 297, h: 420 },
  { id: 'a5', label: 'A5', group: 'print', unit: 'mm', w: 148, h: 210 },
  { id: 'letter', label: 'Carta (US Letter)', group: 'print', unit: 'mm', w: 215.9, h: 279.4 },
  { id: 'poster', label: 'Pôster 50 × 70', group: 'print', unit: 'mm', w: 500, h: 700 },
  { id: 'square30', label: 'Quadrado 30 × 30', group: 'print', unit: 'mm', w: 300, h: 300 },
  { id: 'iphone', label: 'iPhone', group: 'screen', unit: 'px', w: 1179, h: 2556 },
  { id: 'android', label: 'Android', group: 'screen', unit: 'px', w: 1080, h: 2400 },
  { id: 'ipad', label: 'iPad', group: 'screen', unit: 'px', w: 1640, h: 2360 },
  { id: 'desktop', label: 'Desktop / Mac', group: 'screen', unit: 'px', w: 2560, h: 1440 },
  { id: 'post', label: 'Instagram 4:5', group: 'screen', unit: 'px', w: 1080, h: 1350 },
  { id: 'story', label: 'Stories 9:16', group: 'screen', unit: 'px', w: 1080, h: 1920 },
  { id: 'custom', label: 'Personalizado', group: 'custom', unit: 'mm', w: 200, h: 200 },
];

export const formatById = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0];

const MM_TO_PX = 96 / 25.4;

/** Logical editing size of the page, in canvas pixels. */
export function boardPixelSize(b: Pick<Board, 'unit' | 'width' | 'height'>) {
  if (b.unit === 'mm') return { w: Math.round(b.width * MM_TO_PX), h: Math.round(b.height * MM_TO_PX) };
  return { w: b.width, h: b.height };
}

export function formatSizeLabel(unit: 'mm' | 'px', w: number, h: number) {
  const n = (v: number) => (Number.isInteger(v) ? v : v.toFixed(1));
  if (unit === 'mm') return w >= 100 && h >= 100 && w % 10 === 0 && h % 10 === 0
    ? `${w / 10} × ${h / 10} cm`
    : `${n(w)} × ${n(h)} mm`;
  return `${w} × ${h} px`;
}

/** Browsers struggle with canvases much bigger than this. */
export const MAX_EXPORT_PIXELS = 36_000_000;

/**
 * Pixel ratio (output px per logical px) for an export.
 * Paper boards are exported at `dpi`; screen boards at their native resolution times `multiplier`.
 */
export function exportPlan(b: Board, dpi: number, multiplier: number) {
  const { w, h } = boardPixelSize(b);
  let ratio = b.unit === 'mm' ? dpi / 96 : multiplier;
  const capped = w * h * ratio * ratio > MAX_EXPORT_PIXELS;
  if (capped) ratio = Math.sqrt(MAX_EXPORT_PIXELS / (w * h));
  return {
    ratio,
    capped,
    outW: Math.round(w * ratio),
    outH: Math.round(h * ratio),
    effectiveDpi: b.unit === 'mm' ? Math.round(ratio * 96) : undefined,
  };
}

export const BACKGROUND_SWATCHES = [
  '#ffffff', '#f7f1e8', '#efe6d8', '#f6e1dc', '#fbceb1', '#e8d5f0',
  '#dfe9f5', '#dbe8dc', '#c9b79c', '#8a9a7b', '#1f2a44', '#111111',
];
