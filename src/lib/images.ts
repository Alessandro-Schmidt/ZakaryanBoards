import type { Asset } from '../types';
import { uid } from './id';

const MAX_SIDE = 6000;

export function loadImage(src: string, crossOrigin?: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn’t load ${src.slice(0, 80)}`));
    img.src = src;
  });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t create the image'))), type, quality),
  );
}

/** Decodes a blob, downscaling absurdly large images, and wraps it as an Asset. */
export async function createAsset(blob: Blob, name: string, parentId?: string): Promise<Asset> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    let { naturalWidth: width, naturalHeight: height } = img;
    let finalBlob = blob;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    // Re-encode when too big, or when the format may not survive (e.g. SVG has no intrinsic pixels).
    if (scale < 1 || blob.type === 'image/svg+xml' || !blob.type.startsWith('image/')) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      c.getContext('2d')!.drawImage(img, 0, 0, width, height);
      finalBlob = await canvasToBlob(c, 'image/png');
    }
    return { id: uid(), name, blob: finalBlob, width, height, createdAt: Date.now(), parentId };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Image cache for rendering assets on the board.

const cache = new Map<string, Promise<HTMLImageElement>>();

export function imageForAsset(asset: Asset) {
  let p = cache.get(asset.id);
  if (!p) {
    p = loadImage(URL.createObjectURL(asset.blob));
    cache.set(asset.id, p);
  }
  return p;
}

const objectUrls = new Map<string, string>();
export function assetUrl(asset: Asset) {
  let u = objectUrls.get(asset.id);
  if (!u) {
    u = URL.createObjectURL(asset.blob);
    objectUrls.set(asset.id, u);
  }
  return u;
}

// ---------------------------------------------------------------------------
// Importing from drag & drop / clipboard.

export interface DropPayload {
  files: File[];
  urls: string[];
}

const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(f.name);

/** Must be called synchronously inside the drop/paste handler: the DataTransfer is emptied afterwards. */
export function readDataTransfer(dt: DataTransfer): DropPayload {
  const files = Array.from(dt.files).filter(isImageFile);
  const urls: string[] = [];
  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('img').forEach((img) => {
      const best = largestFromSrcset(img.getAttribute('srcset')) ?? img.getAttribute('src');
      if (best) urls.push(best);
    });
  }
  const uriList = dt.getData('text/uri-list') || dt.getData('text/plain');
  uriList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^(https?:|data:image\/)/.test(l))
    .forEach((l) => urls.push(l));
  return { files, urls: unique(urls.map(unwrapRedirect)) };
}

const unique = <T,>(a: T[]) => Array.from(new Set(a));

function largestFromSrcset(srcset: string | null) {
  if (!srcset) return null;
  let best: { url: string; size: number } | null = null;
  for (const part of srcset.split(',')) {
    const [url, d] = part.trim().split(/\s+/);
    const size = parseFloat(d ?? '1') || 1;
    if (url && (!best || size > best.size)) best = { url, size };
  }
  return best?.url ?? null;
}

/** Google Images & co. wrap the real image URL in a redirect link. */
function unwrapRedirect(url: string) {
  try {
    const u = new URL(url);
    const inner = u.searchParams.get('imgurl') ?? u.searchParams.get('mediaurl');
    if (inner) return inner;
  } catch {
    /* not a URL */
  }
  return url;
}

async function fetchImageBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/') || blob.type === '' || blob.type === 'application/octet-stream') return blob;
    }
  } catch {
    /* CORS refused, fall back to <img crossorigin> */
  }
  const img = await loadImage(url, 'anonymous');
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return canvasToBlob(c, 'image/png'); // throws if the canvas is tainted
}

function nameFromUrl(url: string) {
  if (url.startsWith('data:')) return 'Pasted image';
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    return last.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Web image';
  } catch {
    return 'Web image';
  }
}

export interface ImportResult {
  assets: Asset[];
  failed: boolean;
  /** The failed drop came from Pinterest, so the Pinterest button is the way out. */
  pinterest?: boolean;
}

// ---------------------------------------------------------------------------
// Pinterest: a drag often carries only the pin's page link, and thumbnails are small.

const PIN_PAGE = /^https?:\/\/([a-z]+\.)?pinterest\.[a-z.]+\/pin\/(?:[^/]*--)?(\d+)/i;
const PINIMG = /^(https?:\/\/i\.pinimg\.com\/)(?:\d+x|originals)(\/.*)$/i;

export const isPinterestUrl = (url: string) => PIN_PAGE.test(url) || PINIMG.test(url) || /pin\.it\//i.test(url);

/** Largest Pinterest image first: originals (whose extension can differ), then 736x, then what we were given. */
function pinimgCandidates(url: string) {
  const m = PINIMG.exec(url);
  if (!m) return [url];
  return unique([`${m[1]}originals${m[2]}`, `${m[1]}736x${m[2]}`, url]);
}

/** Looks a pin up through Pinterest's public widget API (JSONP, so no CORS needed). */
function pinImageUrls(pinId: string): Promise<string[]> {
  return new Promise((resolve) => {
    const cb = `__belvederePin${pinId}_${Date.now()}`;
    const script = document.createElement('script');
    const done = (urls: string[]) => {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[cb];
      script.remove();
      resolve(urls);
    };
    const timer = window.setTimeout(() => done([]), 8000);
    (window as unknown as Record<string, unknown>)[cb] = (res: { data?: { images?: Record<string, { url: string; width: number }> }[] }) => {
      const images = Object.values(res?.data?.[0]?.images ?? {}).sort((a, b) => b.width - a.width);
      done(images.map((i) => i.url));
    };
    script.src = `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${pinId}&callback=${cb}`;
    script.onerror = () => done([]);
    document.head.appendChild(script);
  });
}

/** Expands the dropped URLs into the image URLs worth trying, best first. */
async function candidateUrls(urls: string[]) {
  const out: string[] = [];
  for (const url of urls) {
    const pin = PIN_PAGE.exec(url);
    if (pin) for (const u of await pinImageUrls(pin[2])) out.push(...pinimgCandidates(u));
    else out.push(...pinimgCandidates(url));
  }
  // Prefer real image URLs over page links.
  return unique(out).sort((a, b) => Number(PIN_PAGE.test(a)) - Number(PIN_PAGE.test(b)));
}

export async function importPayload(p: DropPayload): Promise<ImportResult> {
  const assets: Asset[] = [];
  for (const f of p.files) {
    try {
      assets.push(await createAsset(f, f.name.replace(/\.[a-z0-9]+$/i, '') || 'Image'));
    } catch {
      /* skip undecodable file */
    }
  }
  if (assets.length) return { assets, failed: false };
  // A drop from another tab usually carries several candidate URLs; the first that loads wins.
  for (const url of await candidateUrls(p.urls)) {
    try {
      assets.push(await createAsset(await fetchImageBlob(url), nameFromUrl(url)));
      return { assets, failed: false };
    } catch {
      /* try the next candidate */
    }
  }
  return { assets, failed: p.urls.length > 0 || p.files.length > 0, pinterest: p.urls.some(isPinterestUrl) };
}
