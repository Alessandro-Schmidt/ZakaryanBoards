import { drawLogo } from './lib/logo';

/** One look for the whole app: backdrop spheres, accent, and the logo's "B." */
export interface Theme {
  id: string;
  label: string;
  scheme: 'light' | 'dark';
  /** Page background behind the glass, also the logo's square. */
  base: string;
  /** Letter colour in the logo. */
  ink: string;
  /** The final dot in "B.", and the small fourth sphere in the backdrop. */
  dot: string;
  /** The three spheres. */
  lights: [string, string, string];
  accent: string;
}

export const THEMES: Theme[] = [
  { id: 'aurora', label: 'Aurora', scheme: 'dark', base: '#0a0c1a', ink: '#ffffff', dot: '#ffc84a', lights: ['#6a5cff', '#ff79b4', '#ffd27a'], accent: '#7b6cff' },
  { id: 'arev', label: 'Arev', scheme: 'dark', base: '#1a0b06', ink: '#fff6ea', dot: '#ff4d6d', lights: ['#ff7a2e', '#ffc95c', '#c4164f'], accent: '#ff7a2e' },
  { id: 'roma', label: 'Romã', scheme: 'dark', base: '#14040a', ink: '#ffe9ee', dot: '#ffb35c', lights: ['#b3123c', '#ff5470', '#f7a35c'], accent: '#ff5470' },
  { id: 'vitral', label: 'Vitral', scheme: 'dark', base: '#061120', ink: '#f4f7ff', dot: '#f2c14e', lights: ['#1e6bff', '#d0142f', '#f2c14e'], accent: '#3b82ff' },
  { id: 'ametista', label: 'Ametista', scheme: 'dark', base: '#120c1f', ink: '#f7f1ff', dot: '#ff8fb8', lights: ['#8b5cf6', '#ff8fb8', '#4f46e5'], accent: '#8b5cf6' },
  { id: 'laguna', label: 'Laguna', scheme: 'dark', base: '#06141a', ink: '#effffb', dot: '#c6f432', lights: ['#22d3c5', '#3b82f6', '#a3e635'], accent: '#14b8a6' },
  { id: 'perola', label: 'Pérola', scheme: 'light', base: '#eeedf4', ink: '#1b1726', dot: '#7c5cff', lights: ['#c7b8ff', '#ffc2d6', '#a9d8ff'], accent: '#7c5cff' },
  { id: 'noir', label: 'Noir', scheme: 'dark', base: '#09090b', ink: '#ffffff', dot: '#ff5a4f', lights: ['#ffffff', '#9aa0b4', '#4b4f63'], accent: '#ff5a4f' },
];

export const DEFAULT_THEME = 'aurora';
const KEY = 'belvedere-theme';

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export function savedThemeId(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(id: string) {
  const t = themeById(id);
  const root = document.documentElement;
  root.dataset.scheme = t.scheme;
  root.dataset.theme = t.id;
  const vars: Record<string, string> = {
    '--bg': t.base,
    '--accent': t.accent,
    '--blob1': t.lights[0],
    '--blob2': t.lights[1],
    '--blob3': t.lights[2],
    '--blob4': t.dot,
    '--logo-ink': t.ink,
    '--logo-dot': t.dot,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.base);
  try {
    localStorage.setItem(KEY, t.id);
  } catch {
    /* private mode: the theme still applies for this visit */
  }
  updateFavicon(t);
}

// The favicon follows the chosen theme. Drawn on a canvas so it can use the logo's webfont.
async function updateFavicon(t: Theme) {
  try {
    await document.fonts.load('italic 500 40px "Bodoni Moda"');
  } catch {
    /* falls back to a system serif */
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  drawLogo(c.getContext('2d')!, 64, t);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = c.toDataURL('image/png');
}
