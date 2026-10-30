import type { Theme } from '../theme';

/** Sphere centres and diameters as fractions of the icon: centre and right, leaving the bottom-left for "B.". */
const SPHERES = [
  { x: 0.62, y: 0.3, d: 0.5 },
  { x: 0.82, y: 0.62, d: 0.44 },
  { x: 0.46, y: 0.57, d: 0.28 },
];

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

/** Draws the Belvedere app icon — blurred spheres of light and "B." — into a square of `size` px. */
export function drawLogo(ctx: CanvasRenderingContext2D, size: number, t: Theme) {
  const s = size;
  ctx.save();
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.225);
  ctx.clip();
  ctx.fillStyle = t.base;
  ctx.fillRect(0, 0, s, s);

  ctx.filter = `blur(${Math.max(0.6, s * 0.05)}px)`;
  ctx.globalCompositeOperation = t.scheme === 'light' ? 'multiply' : 'screen';
  SPHERES.forEach((b, i) => {
    const c = t.lights[i];
    const [cx, cy, r] = [b.x * s, b.y * s, (b.d * s) / 2];
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 0, cx, cy, r);
    g.addColorStop(0, mix(c, '#ffffff', 0.55));
    g.addColorStop(0.45, c);
    g.addColorStop(1, mix(c, '#000000', 0.35));
    ctx.globalAlpha = t.scheme === 'light' ? 0.85 : 0.95;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.font = `italic 500 ${s * 0.44}px "Bodoni Moda", Didot, "Bodoni 72", Georgia, serif`;
  ctx.textBaseline = 'alphabetic';
  const x = s * 0.11;
  const y = s * 0.86;
  ctx.fillStyle = t.ink;
  ctx.fillText('B', x, y);
  const w = ctx.measureText('B').width;
  ctx.fillStyle = t.dot;
  ctx.beginPath();
  ctx.arc(x + w + s * 0.035, y - s * 0.028, s * 0.028, 0, Math.PI * 2);
  ctx.fill();

  // Thin glass edge.
  ctx.strokeStyle = t.scheme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, s * 0.008);
  ctx.beginPath();
  ctx.roundRect(0, 0, s, s, s * 0.225);
  ctx.stroke();
  ctx.restore();
}
