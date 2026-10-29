import type { Board } from '../types';
import { canvasToBlob } from './images';

export type ExportType = 'pdf' | 'png' | 'jpg';

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'vision-board';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function boardToPdf(canvas: HTMLCanvasElement, board: Board) {
  const { jsPDF } = await import('jspdf');
  // Page size is the board's real size, so "print at 100%" gives the exact format.
  const unit = board.unit === 'mm' ? 'mm' : 'pt';
  const w = board.unit === 'mm' ? board.width : board.width * 0.75;
  const h = board.unit === 'mm' ? board.height : board.height * 0.75;
  const pdf = new jsPDF({ unit, format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  pdf.setProperties({ title: board.name, creator: 'Zakaryan Boards' });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h, undefined, 'NONE');
  return pdf.output('blob');
}

export async function exportCanvas(canvas: HTMLCanvasElement, board: Board, type: ExportType) {
  const base = safeName(board.name);
  if (type === 'pdf') download(await boardToPdf(canvas, board), `${base}.pdf`);
  else if (type === 'png') download(await canvasToBlob(canvas, 'image/png'), `${base}.png`);
  else download(await canvasToBlob(canvas, 'image/jpeg', 0.95), `${base}.jpg`);
}

/** Opens the PDF in the browser's viewer, where the print dialog is one click away. */
export async function printCanvas(canvas: HTMLCanvasElement, board: Board, win: Window | null) {
  const url = URL.createObjectURL(await boardToPdf(canvas, board));
  if (win) win.location.href = url;
  else window.open(url, '_blank');
}
