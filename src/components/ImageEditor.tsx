import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Asset } from '../types';
import { canvasToBlob, loadImage } from '../lib/images';
import { Icon, type IconName } from './Icon';

const WORK_MAX = 3000;
const HANDLE_HIT = 14;
const UNDO_LIMIT = 10;

type Tool = 'crop' | 'lasso' | 'erase' | 'restore';
type Rect = { x: number; y: number; w: number; h: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move' | 'new';
type AiState = { status: 'idle' } | { status: 'busy'; label: string; progress: number } | { status: 'error'; message: string };

const ASPECTS: { label: string; value: number | null | 'original' }[] = [
  { label: 'Livre', value: null },
  { label: 'Original', value: 'original' },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

interface Props {
  asset: Asset;
  saveLabel: string;
  onCancel(): void;
  onSave(blob: Blob): void | Promise<void>;
}

function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function cloneCanvas(src: HTMLCanvasElement) {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/** Bounding box of pixels with visible alpha inside `area`. */
function opaqueBounds(canvas: HTMLCanvasElement, area: Rect): Rect | null {
  const { data } = canvas.getContext('2d')!.getImageData(area.x, area.y, area.w, area.h);
  let minX = area.w, minY = area.h, maxX = -1, maxY = -1;
  for (let y = 0; y < area.h; y++)
    for (let x = 0; x < area.w; x++)
      if (data[(y * area.w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) return null;
  return { x: area.x + minX, y: area.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function ImageEditor({ asset, saveLabel, onCancel, onSave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const work = useRef<{ src: HTMLCanvasElement; mask: HTMLCanvasElement; comp: HTMLCanvasElement } | null>(null);
  const view = useRef({ s: 1, ox: 0, oy: 0, cw: 0, ch: 0 });
  const drag = useRef<{ handle: Handle; start: { x: number; y: number }; startCrop: Rect } | null>(null);
  const lasso = useRef<{ x: number; y: number }[] | null>(null);
  const brushLast = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<{ mask: HTMLCanvasElement; crop: Rect; maskEdited: boolean }[]>([]);

  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>('crop');
  const [aspect, setAspect] = useState<number | null>(null);
  const [aspectLabel, setAspectLabel] = useState('Livre');
  const [lassoMode, setLassoMode] = useState<'keep' | 'remove'>('keep');
  const [brush, setBrush] = useState(36);
  const [maskEdited, setMaskEdited] = useState(false);
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((t) => t + 1), []);

  // Load the asset into working canvases.
  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(asset.blob);
    loadImage(url).then((img) => {
      if (!alive) return;
      const scale = Math.min(1, WORK_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * scale);
      const H = Math.round(img.naturalHeight * scale);
      const src = newCanvas(W, H);
      src.getContext('2d')!.drawImage(img, 0, 0, W, H);
      const mask = newCanvas(W, H);
      const m = mask.getContext('2d')!;
      m.fillStyle = '#fff';
      m.fillRect(0, 0, W, H);
      work.current = { src, mask, comp: newCanvas(W, H) };
      rebuildComposite();
      setSize({ W, H });
      setCrop({ x: 0, y: 0, w: W, h: H });
      setReady(true);
    }, () => alive && onCancel());
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [asset]);

  function rebuildComposite() {
    const wk = work.current!;
    const c = wk.comp.getContext('2d')!;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, wk.comp.width, wk.comp.height);
    c.drawImage(wk.src, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(wk.mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
  }

  // Keep the view canvas sized to its container.
  useLayoutEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  // Render.
  useEffect(() => {
    const canvas = viewRef.current;
    const wrap = wrapRef.current;
    const wk = work.current;
    if (!canvas || !wrap || !wk) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
    }
    const { W, H } = size;
    const s = Math.min((cw - 48) / W, (ch - 48) / H);
    const ox = (cw - W * s) / 2;
    const oy = (ch - H * s) / 2;
    view.current = { s, ox, oy, cw, ch };

    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);

    // Checkerboard under the image to reveal transparency.
    g.save();
    g.beginPath();
    g.rect(ox, oy, W * s, H * s);
    g.clip();
    const cell = 10;
    for (let y = 0; y < H * s; y += cell)
      for (let x = 0; x < W * s; x += cell) {
        g.fillStyle = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? '#e6e6ea' : '#ffffff';
        g.fillRect(ox + x, oy + y, cell, cell);
      }
    g.restore();
    g.imageSmoothingQuality = 'high';
    g.drawImage(wk.comp, ox, oy, W * s, H * s);

    // Dim everything outside the crop.
    const cx = ox + crop.x * s, cy = oy + crop.y * s, cWid = crop.w * s, cHei = crop.h * s;
    g.fillStyle = 'rgba(10,10,20,0.5)';
    g.beginPath();
    g.rect(0, 0, cw, ch);
    g.rect(cx, cy, cWid, cHei);
    g.fill('evenodd');

    if (tool === 'crop') {
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 1; i < 3; i++) {
        g.moveTo(cx + (cWid * i) / 3, cy);
        g.lineTo(cx + (cWid * i) / 3, cy + cHei);
        g.moveTo(cx, cy + (cHei * i) / 3);
        g.lineTo(cx + cWid, cy + (cHei * i) / 3);
      }
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.strokeRect(cx, cy, cWid, cHei);
      // Corner brackets, iOS Photos style.
      g.lineWidth = 4;
      g.lineCap = 'round';
      const L = Math.min(22, cWid / 3, cHei / 3);
      const corners: [number, number, number, number][] = [
        [cx, cy, 1, 1], [cx + cWid, cy, -1, 1], [cx, cy + cHei, 1, -1], [cx + cWid, cy + cHei, -1, -1],
      ];
      g.beginPath();
      for (const [x, y, dx, dy] of corners) {
        g.moveTo(x + dx * L, y);
        g.lineTo(x, y);
        g.lineTo(x, y + dy * L);
      }
      if (aspect === null) {
        for (const [x, y] of [[cx + cWid / 2, cy], [cx + cWid / 2, cy + cHei]]) {
          g.moveTo(x - L / 2, y);
          g.lineTo(x + L / 2, y);
        }
        for (const [x, y] of [[cx, cy + cHei / 2], [cx + cWid, cy + cHei / 2]]) {
          g.moveTo(x, y - L / 2);
          g.lineTo(x, y + L / 2);
        }
      }
      g.stroke();
    }

    const pts = lasso.current;
    if (pts && pts.length > 1) {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(ox + p.x * s, oy + p.y * s) : g.moveTo(ox + p.x * s, oy + p.y * s)));
      g.closePath();
      g.fillStyle = lassoMode === 'keep' ? 'rgba(10,132,255,0.18)' : 'rgba(255,59,48,0.18)';
      g.fill();
      g.lineWidth = 2;
      g.setLineDash([6, 4]);
      g.strokeStyle = '#fff';
      g.stroke();
      g.lineDashOffset = 5;
      g.strokeStyle = lassoMode === 'keep' ? '#0a84ff' : '#ff3b30';
      g.stroke();
      g.setLineDash([]);
      g.lineDashOffset = 0;
    }

    if ((tool === 'erase' || tool === 'restore') && pointer.current) {
      g.beginPath();
      g.arc(pointer.current.x, pointer.current.y, brush / 2, 0, Math.PI * 2);
      g.lineWidth = 2;
      g.strokeStyle = '#fff';
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = tool === 'erase' ? '#ff3b30' : '#34c759';
      g.stroke();
    }
  }, [tick, size, crop, tool, aspect, lassoMode, brush]);

  // ---- helpers -----------------------------------------------------------

  const toImage = (e: React.PointerEvent) => {
    const r = viewRef.current!.getBoundingClientRect();
    const { s, ox, oy } = view.current;
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
  };

  function pushUndo() {
    const wk = work.current!;
    undoStack.current = [...undoStack.current, { mask: cloneCanvas(wk.mask), crop, maskEdited }].slice(-UNDO_LIMIT);
  }

  function undo() {
    const last = undoStack.current.pop();
    if (!last) return;
    const wk = work.current!;
    const m = wk.mask.getContext('2d')!;
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, size.W, size.H);
    m.drawImage(last.mask, 0, 0);
    setCrop(last.crop);
    setMaskEdited(last.maskEdited);
    rebuildComposite();
    redraw();
  }

  function reset() {
    pushUndo();
    const m = work.current!.mask.getContext('2d')!;
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = '#fff';
    m.fillRect(0, 0, size.W, size.H);
    setCrop({ x: 0, y: 0, w: size.W, h: size.H });
    setMaskEdited(false);
    rebuildComposite();
    redraw();
  }

  function chooseAspect(a: (typeof ASPECTS)[number]) {
    const ratio = a.value === 'original' ? size.W / size.H : a.value;
    setAspect(ratio);
    setAspectLabel(a.label);
    setTool('crop');
    if (ratio === null) return;
    pushUndo();
    // Largest centered rect with this ratio.
    let w = size.W, h = w / ratio;
    if (h > size.H) {
      h = size.H;
      w = h * ratio;
    }
    setCrop({ x: (size.W - w) / 2, y: (size.H - h) / 2, w, h });
  }

  function hitHandle(e: React.PointerEvent): Handle {
    const r = viewRef.current!.getBoundingClientRect();
    const { s, ox, oy } = view.current;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const x0 = ox + crop.x * s, y0 = oy + crop.y * s, x1 = x0 + crop.w * s, y1 = y0 + crop.h * s;
    const near = (a: number, b: number) => Math.abs(a - b) < HANDLE_HIT;
    const inX = px > x0 - HANDLE_HIT && px < x1 + HANDLE_HIT;
    const inY = py > y0 - HANDLE_HIT && py < y1 + HANDLE_HIT;
    const t = near(py, y0) && inX, b = near(py, y1) && inX, l = near(px, x0) && inY, rr = near(px, x1) && inY;
    if (t && l) return 'nw';
    if (t && rr) return 'ne';
    if (b && l) return 'sw';
    if (b && rr) return 'se';
    if (aspect === null) {
      if (t) return 'n';
      if (b) return 's';
      if (l) return 'w';
      if (rr) return 'e';
    }
    if (px > x0 && px < x1 && py > y0 && py < y1) return 'move';
    return 'new';
  }

  function computeCrop(handle: Handle, start: { x: number; y: number }, p: { x: number; y: number }, c0: Rect): Rect {
    const { W, H } = size;
    const clampX = (v: number) => Math.max(0, Math.min(W, v));
    const clampY = (v: number) => Math.max(0, Math.min(H, v));
    if (handle === 'move') {
      const x = Math.max(0, Math.min(W - c0.w, c0.x + p.x - start.x));
      const y = Math.max(0, Math.min(H - c0.h, c0.y + p.y - start.y));
      return { ...c0, x, y };
    }
    // Anchor = the fixed point opposite the dragged handle.
    let ax: number, ay: number;
    if (handle === 'new') {
      ax = clampX(start.x);
      ay = clampY(start.y);
    } else {
      ax = handle.includes('w') ? c0.x + c0.w : c0.x;
      ay = handle.includes('n') ? c0.y + c0.h : c0.y;
    }
    let x0 = ax, x1 = clampX(p.x), y0 = ay, y1 = clampY(p.y);
    if (handle === 'n' || handle === 's') {
      x0 = c0.x;
      x1 = c0.x + c0.w;
    }
    if (handle === 'e' || handle === 'w') {
      y0 = c0.y;
      y1 = c0.y + c0.h;
    }
    if (aspect !== null) {
      const dx = x1 - x0, dy = y1 - y0;
      let w = Math.abs(dx), h = w / aspect;
      if (h < Math.abs(dy)) {
        h = Math.abs(dy);
        w = h * aspect;
      }
      // Shrink to stay inside the image.
      const maxW = dx >= 0 ? W - ax : ax;
      const maxH = dy >= 0 ? H - ay : ay;
      const k = Math.min(1, maxW / w, maxH / h);
      w *= k;
      h *= k;
      x1 = ax + Math.sign(dx || 1) * w;
      y1 = ay + Math.sign(dy || 1) * h;
    }
    return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
  }

  function brushStroke(from: { x: number; y: number }, to: { x: number; y: number }) {
    const m = work.current!.mask.getContext('2d')!;
    m.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    m.strokeStyle = '#fff';
    m.fillStyle = '#fff';
    m.lineWidth = brush / view.current.s;
    m.lineCap = 'round';
    m.lineJoin = 'round';
    m.beginPath();
    m.moveTo(from.x, from.y);
    m.lineTo(to.x + 0.01, to.y);
    m.stroke();
    m.globalCompositeOperation = 'source-over';
    rebuildComposite();
  }

  function applyLasso(pts: { x: number; y: number }[]) {
    pushUndo();
    const m = work.current!.mask.getContext('2d')!;
    m.globalCompositeOperation = lassoMode === 'keep' ? 'destination-in' : 'destination-out';
    m.fillStyle = '#fff';
    m.beginPath();
    pts.forEach((p, i) => (i ? m.lineTo(p.x, p.y) : m.moveTo(p.x, p.y)));
    m.closePath();
    m.fill();
    m.globalCompositeOperation = 'source-over';
    setMaskEdited(true);
    rebuildComposite();
  }

  // ---- pointer events ----------------------------------------------------

  function onPointerDown(e: React.PointerEvent) {
    if (!ready || ai.status === 'busy') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (tool === 'crop') {
      pushUndo();
      drag.current = { handle: hitHandle(e), start: p, startCrop: crop };
    } else if (tool === 'lasso') {
      lasso.current = [p];
    } else {
      pushUndo();
      setMaskEdited(true);
      brushLast.current = p;
      brushStroke(p, p);
    }
    redraw();
  }

  function onPointerMove(e: React.PointerEvent) {
    const r = viewRef.current!.getBoundingClientRect();
    pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    const p = toImage(e);
    if (tool === 'crop' && drag.current) {
      const d = drag.current;
      setCrop(computeCrop(d.handle, d.start, p, d.startCrop));
    } else if (tool === 'lasso' && lasso.current) {
      const last = lasso.current[lasso.current.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) * view.current.s > 2) lasso.current.push(p);
    } else if (brushLast.current) {
      brushStroke(brushLast.current, p);
      brushLast.current = p;
    }
    if (tool === 'crop' && !drag.current) {
      const h = hitHandle(e);
      const cursors: Record<Handle, string> = {
        nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
        n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move', new: 'crosshair',
      };
      viewRef.current!.style.cursor = cursors[h];
    }
    redraw();
  }

  function onPointerUp() {
    if (drag.current) {
      const c = crop;
      if (c.w < 8 || c.h < 8) setCrop(drag.current.startCrop);
      drag.current = null;
    }
    if (lasso.current) {
      if (lasso.current.length > 2) applyLasso(lasso.current);
      lasso.current = null;
    }
    brushLast.current = null;
    redraw();
  }

  // ---- AI background removal ----------------------------------------------

  async function removeBg() {
    const wk = work.current!;
    setAi({ status: 'busy', label: 'Preparando a IA…', progress: 0 });
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const input = await canvasToBlob(wk.src, 'image/png');
      const result = await removeBackground(input, {
        model: 'isnet_fp16',
        output: { format: 'image/png' },
        progress: (key, current, total) => {
          const downloading = key.startsWith('fetch');
          setAi({
            status: 'busy',
            label: downloading ? 'Baixando o modelo de IA (só na primeira vez)…' : 'Separando o objeto do fundo…',
            progress: total ? current / total : 0,
          });
        },
      });
      setAi({ status: 'busy', label: 'Aplicando…', progress: 1 });
      const url = URL.createObjectURL(result);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      pushUndo();
      const m = wk.mask.getContext('2d')!;
      // Intersect, so a lasso made before still applies.
      m.globalCompositeOperation = 'destination-in';
      m.drawImage(img, 0, 0, size.W, size.H);
      m.globalCompositeOperation = 'source-over';
      setMaskEdited(true);
      rebuildComposite();
      setTool('erase');
      setAi({ status: 'idle' });
      redraw();
    } catch (err) {
      console.error(err);
      setAi({ status: 'error', message: 'Não foi possível remover o fundo. Verifique a conexão e tente de novo.' });
    }
  }

  // ---- save ----------------------------------------------------------------

  async function save() {
    const wk = work.current!;
    setSaving(true);
    try {
      let area: Rect = {
        x: Math.round(crop.x),
        y: Math.round(crop.y),
        w: Math.max(1, Math.round(crop.w)),
        h: Math.max(1, Math.round(crop.h)),
      };
      const source = maskEdited ? wk.comp : wk.src;
      if (maskEdited) area = opaqueBounds(wk.comp, area) ?? area; // trim transparent margins
      const out = newCanvas(area.w, area.h);
      out.getContext('2d')!.drawImage(source, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
      const keepPng = maskEdited || asset.blob.type === 'image/png';
      const blob = await canvasToBlob(out, keepPng ? 'image/png' : 'image/jpeg', 0.95);
      await onSave(blob);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const TOOLS: { id: Tool; label: string; icon: IconName }[] = [
    { id: 'crop', label: 'Cortar', icon: 'crop' },
    { id: 'lasso', label: 'Laço', icon: 'lasso' },
    { id: 'erase', label: 'Apagar', icon: 'eraser' },
    { id: 'restore', label: 'Restaurar', icon: 'brush' },
  ];

  return (
    <div className="modal-backdrop editor-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="glass image-editor">
        <header className="ie-header">
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <div className="ie-title">
            <strong>Editar imagem</strong>
            <span>{asset.name}</span>
          </div>
          <div className="row gap-s">
            <button className="btn icon ghost" title="Desfazer (⌘Z)" onClick={undo}>
              <Icon name="undo" />
            </button>
            <button className="btn ghost" onClick={reset} title="Desfaz todas as edições">Recomeçar</button>
            <button className="btn primary" disabled={!ready || saving || ai.status === 'busy'} onClick={save}>
              {saving ? 'Salvando…' : saveLabel}
            </button>
          </div>
        </header>

        <div className="ie-body">
          <aside className="ie-tools">
            {TOOLS.map((t) => (
              <button key={t.id} className={'tool-btn' + (tool === t.id ? ' active' : '')} onClick={() => setTool(t.id)}>
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </button>
            ))}
            <div className="ie-sep" />
            <button className="tool-btn ai" disabled={!ready || ai.status === 'busy'} onClick={removeBg}>
              <Icon name="sparkles" />
              <span>Remover fundo</span>
            </button>
          </aside>

          <div className="ie-stage" ref={wrapRef}>
            <canvas
              ref={viewRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                pointer.current = null;
                redraw();
              }}
              style={{ cursor: tool === 'lasso' ? 'crosshair' : tool === 'crop' ? 'crosshair' : 'none', touchAction: 'none' }}
            />
            {!ready && <div className="ie-overlay">Carregando…</div>}
            {ai.status === 'busy' && (
              <div className="ie-overlay">
                <div className="glass ai-card">
                  <Icon name="sparkles" />
                  <p>{ai.label}</p>
                  <div className="progress"><div style={{ width: `${Math.round(ai.progress * 100)}%` }} /></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="ie-footer">
          {tool === 'crop' && (
            <>
              <div className="segmented scroll-x">
                {ASPECTS.map((a) => (
                  <button key={a.label} className={aspectLabel === a.label ? 'on' : ''} onClick={() => chooseAspect(a)}>
                    {a.label}
                  </button>
                ))}
              </div>
              <span className="hint">Arraste para criar ou ajustar o recorte. {Math.round(crop.w)} × {Math.round(crop.h)} px</span>
            </>
          )}
          {tool === 'lasso' && (
            <>
              <div className="segmented">
                <button className={lassoMode === 'keep' ? 'on' : ''} onClick={() => setLassoMode('keep')}>Manter seleção</button>
                <button className={lassoMode === 'remove' ? 'on' : ''} onClick={() => setLassoMode('remove')}>Apagar seleção</button>
              </div>
              <span className="hint">Contorne o objeto (ex.: só o carro) segurando o clique. As bordas vazias são aparadas ao salvar.</span>
            </>
          )}
          {(tool === 'erase' || tool === 'restore') && (
            <>
              <label className="slider-label">
                Pincel
                <input type="range" min={6} max={160} value={brush} onChange={(e) => setBrush(+e.target.value)} />
                <span>{brush}px</span>
              </label>
              <span className="hint">
                {tool === 'erase' ? 'Pinte para apagar partes da imagem.' : 'Pinte para trazer de volta partes apagadas.'}
              </span>
            </>
          )}
          {ai.status === 'error' && <span className="hint error">{ai.message}</span>}
        </footer>
      </div>
    </div>
  );
}
