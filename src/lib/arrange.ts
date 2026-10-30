/**
 * "Make it fit": lays images out in justified rows (like a photo gallery) so they all fit on the page
 * without overlapping. Every image keeps its aspect ratio; the row count is chosen to cover the most page.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Splits `aspects` (in order) into `rows` contiguous groups with aspect sums as even as possible. */
function partition(aspects: number[], rows: number): number[][] {
  const n = aspects.length;
  const prefix = [0];
  for (const a of aspects) prefix.push(prefix[prefix.length - 1] + a);
  const target = prefix[n] / rows;
  // cost[k][i]: best cost putting the first i images into k rows; cut[k][i] remembers where the last row starts.
  const cost = Array.from({ length: rows + 1 }, () => new Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: rows + 1 }, () => new Array(n + 1).fill(0));
  cost[0][0] = 0;
  for (let k = 1; k <= rows; k++) {
    for (let i = k; i <= n - (rows - k); i++) {
      for (let j = k - 1; j < i; j++) {
        const c = cost[k - 1][j] + (prefix[i] - prefix[j] - target) ** 2;
        if (c < cost[k][i]) {
          cost[k][i] = c;
          cut[k][i] = j;
        }
      }
    }
  }
  const out: number[][] = [];
  for (let k = rows, i = n; k > 0; k--) {
    const j = cut[k][i];
    out.unshift(Array.from({ length: i - j }, (_, t) => j + t));
    i = j;
  }
  return out;
}

export function arrange(sizes: { width: number; height: number }[], pageW: number, pageH: number): Box[] {
  const n = sizes.length;
  if (!n) return [];
  const margin = Math.min(pageW, pageH) * 0.05;
  const gap = Math.min(pageW, pageH) * 0.02;
  const W = pageW - margin * 2;
  const H = pageH - margin * 2;
  const aspects = sizes.map((s) => s.width / s.height);

  let best: { rows: number[][]; heights: number[]; scale: number; area: number } | null = null;
  for (let r = 1; r <= n; r++) {
    const rows = partition(aspects, r);
    // Each row stretched to the full width.
    const heights = rows.map((row) => (W - gap * (row.length - 1)) / row.reduce((s, i) => s + aspects[i], 0));
    const room = H - gap * (r - 1);
    if (room <= 0) break;
    const scale = Math.min(1, room / heights.reduce((s, h) => s + h, 0));
    const area = rows.reduce((s, row, k) => s + row.reduce((t, i) => t + (heights[k] * scale) ** 2 * aspects[i], 0), 0);
    if (!best || area > best.area) best = { rows, heights, scale, area };
  }
  if (!best) return sizes.map(() => ({ x: margin, y: margin, width: W, height: H }));

  // Centre the block vertically and each row horizontally (rows are narrower when everything had to shrink).
  const { rows, heights, scale } = best;
  const blockH = heights.reduce((s, h) => s + h * scale, 0) + gap * (rows.length - 1);
  const out: Box[] = new Array(n);
  let y = margin + (H - blockH) / 2;
  rows.forEach((row, k) => {
    const h = heights[k] * scale;
    const rowW = row.reduce((s, i) => s + h * aspects[i], 0) + gap * (row.length - 1);
    let x = margin + (W - rowW) / 2;
    for (const i of row) {
      const w = h * aspects[i];
      out[i] = { x, y, width: w, height: h };
      x += w + gap;
    }
    y += h + gap;
  });
  return out;
}
