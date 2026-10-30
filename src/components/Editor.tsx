import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Board, BoardElement, ImageElement, TextElement } from '../types';
import { boardPixelSize } from '../formats';
import { deleteAsset, getBoard, listAssets, listBoards, saveAsset, saveBoard } from '../lib/db';
import { createAsset, importPayload, readDataTransfer, type DropPayload } from '../lib/images';
import { arrange } from '../lib/arrange';
import { useBoardHistory } from '../lib/history';
import { uid } from '../lib/id';
import { AssetPanel, ASSET_MIME } from './AssetPanel';
import { BoardCanvas, STAGE_PAD, type BoardCanvasHandle } from './BoardCanvas';
import { ExportDialog } from './ExportDialog';
import { FormatPicker, type PageSpec } from './FormatPicker';
import { ImageEditor } from './ImageEditor';
import { Inspector } from './Inspector';
import { PinterestHelp } from './PinterestHelp';
import { Icon } from './Icon';

export function Editor({ boardId, onBack }: { boardId: string; onBack(): void }) {
  const [initial, setInitial] = useState<{ board: Board; assets: Asset[] } | null | undefined>();
  useEffect(() => {
    Promise.all([getBoard(boardId), listAssets()]).then(([board, assets]) =>
      setInitial(board ? { board, assets } : null),
    );
  }, [boardId]);

  if (initial === undefined) return <div className="center-screen muted">Loading…</div>;
  if (initial === null)
    return (
      <div className="center-screen">
        <p>Board not found.</p>
        <button className="btn primary" onClick={onBack}>Back</button>
      </div>
    );
  return <EditorInner initial={initial.board} initialAssets={initial.assets} onBack={onBack} />;
}

type Modal =
  | { kind: 'image'; asset: Asset; elementId?: string }
  | { kind: 'export' }
  | { kind: 'format'; spec: PageSpec }
  | { kind: 'pinterest' }
  | null;

function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

type Panels = { left: boolean; right: boolean };
const PANELS_KEY = 'belvedere-panels';

function savedPanels(): Panels {
  try {
    return { left: true, right: true, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') };
  } catch {
    return { left: true, right: true };
  }
}

function EditorInner({ initial, initialAssets, onBack }: { initial: Board; initialAssets: Asset[]; onBack(): void }) {
  const { board, update, undo, redo, canUndo, canRedo } = useBoardHistory(initial);
  const [assets, setAssets] = useState(initialAssets);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [importing, setImporting] = useState(false);
  // The side panels slide out so the board can use the whole window.
  const [panels, setPanels] = useState(savedPanels);
  const togglePanel = (side: keyof Panels) =>
    setPanels((p) => {
      const next = { ...p, [side]: !p[side] };
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(next));
      } catch {
        /* private mode: still toggles for this visit */
      }
      return next;
    });
  const canvasRef = useRef<BoardCanvasHandle>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);

  const { w, h } = boardPixelSize(board);
  const selection = board.elements.filter((e) => selectedIds.includes(e.id));
  const selected = selection.length === 1 ? selection[0] : undefined;

  // ---- toasts -----------------------------------------------------------
  const toastTimer = useRef<number>(undefined);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5200);
  }, []);

  // ---- zoom ---------------------------------------------------------------
  const [area, setArea] = useState({ w: 800, h: 600 });
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
  useLayoutEffect(() => {
    const el = areaRef.current!;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fitZoom = Math.max(0.05, Math.min((area.w - STAGE_PAD * 2 - 16) / w, (area.h - STAGE_PAD * 2 - 16) / h));
  const zoom = zoomMode === 'fit' ? fitZoom : zoomMode;
  const zoomBy = (k: number) => setZoomMode(Math.min(8, Math.max(0.05, zoom * k)));

  // Pinch on a trackpad zooms the board around the fingers, never the whole page.
  const zoomAnchor = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const zoomAt = (k: number, clientX: number, clientY: number) => {
    const b = canvasRef.current?.clientToBoard(clientX, clientY);
    if (b) zoomAnchor.current = { ...b, clientX, clientY };
    zoomBy(k);
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const area = areaRef.current;
    if (!a || !area || !canvasRef.current) return;
    zoomAnchor.current = null;
    const p = canvasRef.current.boardToClient(a.x, a.y);
    area.scrollLeft += p.x - a.clientX;
    area.scrollTop += p.y - a.clientY;
  }, [zoom]);
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;
  useEffect(() => {
    // Chrome, Edge and Firefox report a pinch as a wheel event with ctrlKey set.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAtRef.current(Math.exp(-Math.max(-50, Math.min(50, e.deltaY)) * 0.01), e.clientX, e.clientY);
    };
    // Safari sends its own gesture events.
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    let last = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      last = 1;
    };
    const onGestureChange = (e: Event) => {
      const g = e as Gesture;
      e.preventDefault();
      zoomAtRef.current(g.scale / last, g.clientX, g.clientY);
      last = g.scale;
    };
    const block = (e: Event) => e.preventDefault();
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('gesturestart', onGestureStart);
    window.addEventListener('gesturechange', onGestureChange);
    window.addEventListener('gestureend', block);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGestureStart);
      window.removeEventListener('gesturechange', onGestureChange);
      window.removeEventListener('gestureend', block);
    };
  }, []);

  // ---- autosave -------------------------------------------------------------
  const latest = useRef(board);
  latest.current = board;
  const dirty = useRef(false);
  const persist = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const b = latest.current;
    let thumbnail = b.thumbnail;
    try {
      const { w: bw, h: bh } = boardPixelSize(b);
      thumbnail = canvasRef.current?.toCanvas(480 / Math.max(bw, bh)).toDataURL('image/jpeg', 0.82) ?? thumbnail;
    } catch {
      /* keep the previous thumbnail */
    }
    await saveBoard({ ...b, thumbnail, updatedAt: Date.now() });
  }, []);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(persist, 900);
    return () => clearTimeout(t);
  }, [board, persist]);

  async function back() {
    await persist();
    onBack();
  }

  // ---- board mutations ------------------------------------------------------
  const setElements = (elements: BoardElement[], key?: string) => update({ ...board, elements }, key);
  const patchElement = (id: string, patch: Partial<BoardElement>, key?: string) =>
    setElements(board.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as BoardElement) : e)), key);
  /** Several elements in one history step (moving a multi-selection, nudging it). */
  const patchMany = (patches: Map<string, Partial<BoardElement>>, key?: string) =>
    setElements(board.elements.map((e) => (patches.has(e.id) ? ({ ...e, ...patches.get(e.id) } as BoardElement) : e)), key);
  const nudge = (dx: number, dy: number) =>
    patchMany(new Map(selection.map((e) => [e.id, { x: e.x + dx, y: e.y + dy }])), 'nudge');

  function addImage(asset: Asset, at?: { x: number; y: number }, base = board) {
    const { w: bw, h: bh } = boardPixelSize(base);
    let width = bw * 0.42;
    let height = (width * asset.height) / asset.width;
    if (height > bh * 0.5) {
      height = bh * 0.5;
      width = (height * asset.width) / asset.height;
    }
    const c = at ?? { x: bw / 2, y: bh / 2 };
    const el: ImageElement = {
      id: uid(), type: 'image', assetId: asset.id,
      x: c.x - width / 2, y: c.y - height / 2, width, height,
      rotation: 0, opacity: 1, cornerRadius: 0, flipX: false, shadow: false,
    };
    return el;
  }

  function placeImages(list: Asset[], at?: { x: number; y: number }) {
    const els = list.map((a, i) => addImage(a, at && { x: at.x + i * 24, y: at.y + i * 24 }));
    setElements([...board.elements, ...els]);
    setSelectedId(els[els.length - 1]?.id ?? null);
  }

  function addText() {
    const el: TextElement = {
      id: uid(), type: 'text', text: 'Dream big',
      x: w * 0.15, y: h * 0.45, width: w * 0.7, rotation: 0, opacity: 1, shadow: false,
      fontFamily: 'Cormorant Garamond', fontSize: Math.round(w * 0.08), fontStyle: 'italic',
      fill: board.background.toLowerCase() === '#111111' || board.background.toLowerCase() === '#1f2a44' ? '#ffffff' : '#1f2a44',
      align: 'center', letterSpacing: 0, lineHeight: 1.1,
    };
    setElements([...board.elements, el]);
    setSelectedId(el.id);
    setTimeout(() => textRef.current?.select(), 50);
  }

  function removeSelected() {
    if (!selection.length) return;
    setElements(board.elements.filter((e) => !selectedIds.includes(e.id)));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (!selection.length) return;
    const copies = selection.map((e) => ({ ...e, id: uid(), x: e.x + 24, y: e.y + 24 }));
    setElements([...board.elements, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }

  function moveLayer(dir: 'front' | 'back') {
    if (!selection.length) return;
    const rest = board.elements.filter((e) => !selectedIds.includes(e.id));
    setElements(dir === 'front' ? [...rest, ...selection] : [...selection, ...rest]);
  }

  function centerSelected() {
    if (!selected) return;
    if (selected.type === 'image') {
      patchElement(selected.id, { x: (w - selected.width) / 2, y: (h - selected.height) / 2, rotation: 0 });
    } else {
      patchElement(selected.id, { x: (w - selected.width) / 2, rotation: 0 });
    }
  }

  function fillSelected() {
    if (selected?.type !== 'image') return;
    const k = Math.max(w / selected.width, h / selected.height);
    const width = selected.width * k, height = selected.height * k;
    patchElement(selected.id, { width, height, x: (w - width) / 2, y: (h - height) / 2, rotation: 0 });
  }

  /** Lays every image out in tidy rows that fit the page without overlapping. Texts stay where they are. */
  function makeItFit() {
    const images = board.elements.filter((e): e is ImageElement => e.type === 'image');
    if (!images.length) return;
    // Keep the reading order the user already has: top to bottom, then left to right.
    const order = [...images].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
    const boxes = arrange(order, w, h);
    const placed = new Map(order.map((e, i) => [e.id, boxes[i]]));
    setElements(board.elements.map((e) => {
      const b = placed.get(e.id);
      return b ? { ...e, ...b, rotation: 0 } : e;
    }));
    notify(`${images.length} image${images.length > 1 ? 's' : ''} arranged · ⌘Z to undo`);
  }

  function applyFormat(spec: PageSpec) {
    const old = boardPixelSize(board);
    const next = boardPixelSize(spec);
    const sx = next.w / old.w, sy = next.h / old.h, k = Math.min(sx, sy);
    const elements = board.elements.map((e): BoardElement => {
      if (e.type === 'image') {
        const width = e.width * k, height = e.height * k;
        return { ...e, width, height, cornerRadius: e.cornerRadius * k,
          x: (e.x + e.width / 2) * sx - width / 2, y: (e.y + e.height / 2) * sy - height / 2 };
      }
      const width = e.width * k;
      return { ...e, width, fontSize: e.fontSize * k, x: (e.x + e.width / 2) * sx - width / 2, y: e.y * sy };
    });
    update({ ...board, ...spec, elements });
    setZoomMode('fit');
  }

  // ---- assets -----------------------------------------------------------------
  async function addAssets(list: Asset[]) {
    await Promise.all(list.map(saveAsset));
    setAssets((prev) => [...list, ...prev]);
  }

  async function handleImport(payload: DropPayload, at?: { x: number; y: number }, place = !!at) {
    if (!payload.files.length && !payload.urls.length) return;
    setImporting(true);
    try {
      const { assets: added, failed, pinterest } = await importPayload(payload);
      if (added.length) {
        await addAssets(added);
        if (place) {
          placeImages(added, at);
          setToast(null);
        }
        else notify(added.length > 1 ? `${added.length} images added` : 'Image added to the library');
      } else if (failed && pinterest) {
        setModal({ kind: 'pinterest' });
      } else if (failed) {
        notify('This site blocks dragging the image. Right-click → "Copy image" and paste here with ⌘V / Ctrl+V.');
      }
    } finally {
      setImporting(false);
    }
  }

  async function removeAsset(a: Asset) {
    const boards = await listBoards();
    const used = boards.filter((b) => (b.id === board.id ? board : b).elements.some((e) => e.type === 'image' && e.assetId === a.id));
    const msg = used.length
      ? `This image is used in ${used.length} board(s) and will disappear from them. Delete anyway?`
      : `Delete "${a.name}" from the library?`;
    if (!confirm(msg)) return;
    await deleteAsset(a.id);
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    if (board.elements.some((e) => e.type === 'image' && e.assetId === a.id))
      setElements(board.elements.filter((e) => !(e.type === 'image' && e.assetId === a.id)));
  }

  async function saveEditedImage(blob: Blob, source: Asset, elementId?: string) {
    const asset = await createAsset(blob, source.name.replace(/ \(edited\)$/, '') + ' (edited)', source.id);
    await addAssets([asset]);
    const el = elementId && board.elements.find((e) => e.id === elementId);
    if (el && el.type === 'image') {
      const height = (el.width * asset.height) / asset.width;
      patchElement(el.id, { assetId: asset.id, height, y: el.y + (el.height - height) / 2 });
    }
    setModal(null);
    if (!elementId) notify('New version saved to the library');
  }

  // ---- drag & drop from other tabs / desktop -------------------------------
  const acceptsDrag = (e: React.DragEvent) =>
    ['Files', 'text/uri-list', 'text/html', ASSET_MIME].some((t) => e.dataTransfer.types.includes(t));

  function onDragEnter(e: React.DragEvent) {
    if (!acceptsDrag(e)) return;
    e.preventDefault();
    dragDepth.current++;
    if (!e.dataTransfer.types.includes(ASSET_MIME)) setDropActive(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!acceptsDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropActive(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const overCanvas = !!(e.target as HTMLElement).closest('.canvas-area');
    const at = overCanvas ? canvasRef.current?.clientToBoard(e.clientX, e.clientY) : undefined;
    const assetId = e.dataTransfer.getData(ASSET_MIME);
    if (assetId) {
      const a = assetMap.get(assetId);
      if (a && overCanvas) placeImages([a], at);
      return;
    }
    handleImport(readDataTransfer(e.dataTransfer), at);
  }

  // ---- paste & keyboard ---------------------------------------------------------
  const selectAll = () => setSelectedIds(board.elements.map((e) => e.id));
  const keyHandlers = { handleImport, removeSelected, duplicateSelected, undo, redo, nudge, selectAll, selection, modal, togglePanel };
  const handlers = useRef(keyHandlers);
  handlers.current = keyHandlers;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e) || handlers.current.modal || !e.clipboardData) return;
      const payload = readDataTransfer(e.clipboardData);
      if (payload.files.length || payload.urls.length) {
        e.preventDefault();
        handlers.current.handleImport(payload, undefined, true);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const H = handlers.current;
      if (H.modal || isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) H.redo();
        else H.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        H.redo();
      } else if (mod && k === 'a') {
        e.preventDefault();
        H.selectAll();
      } else if (mod && k === 'd') {
        e.preventDefault();
        H.duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (H.selection.length) {
          e.preventDefault();
          H.removeSelected();
        }
      } else if (!mod && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        H.togglePanel(e.key === '[' ? 'left' : 'right');
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (H.selection.length && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        H.nudge(dx, dy);
      }
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // ---- render -------------------------------------------------------------------
  return (
    <div
      className={'editor' + (panels.left ? '' : ' hide-left') + (panels.right ? '' : ' hide-right')}
      onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <header className="glass toolbar">
        <div className="row gap-s">
          <button className="btn icon ghost" onClick={back} title="All boards"><Icon name="back" /></button>
          <button
            className={'btn icon ghost panel-toggle' + (panels.left ? ' on' : '')}
            onClick={() => togglePanel('left')}
            aria-pressed={panels.left}
            title={panels.left ? 'Hide images ([)' : 'Show images ([)'}
          >
            <Icon name="sidebarLeft" />
          </button>
          <input
            className="title-input"
            value={board.name}
            onChange={(e) => update({ ...board, name: e.target.value }, 'name')}
            aria-label="Board name"
          />
        </div>
        <div className="row gap-s toolbar-center">
          <button className="btn icon ghost" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)"><Icon name="undo" /></button>
          <button className="btn icon ghost" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)"><Icon name="redo" /></button>
          <span className="divider" />
          <button className="btn ghost" onClick={addText}><Icon name="text" /> Text</button>
          <button
            className="btn ghost"
            onClick={makeItFit}
            disabled={!board.elements.some((e) => e.type === 'image')}
            title="Arrange all images so they fit the page without overlapping"
          >
            <Icon name="arrange" /> Make it fit
          </button>
          <span className="divider" />
          <button className="btn icon ghost" onClick={() => zoomBy(1 / 1.2)} title="Zoom out"><Icon name="zoomOut" /></button>
          <button className="btn ghost zoom-label" onClick={() => setZoomMode('fit')} title="Fit to screen">
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn icon ghost" onClick={() => zoomBy(1.2)} title="Zoom in"><Icon name="zoomIn" /></button>
        </div>
        <div className="row gap-s">
          <button className="btn primary" onClick={() => { setSelectedId(null); setModal({ kind: 'export' }); }}>
            <Icon name="download" /> Export
          </button>
          <button
            className={'btn icon ghost panel-toggle' + (panels.right ? ' on' : '')}
            onClick={() => togglePanel('right')}
            aria-pressed={panels.right}
            title={panels.right ? 'Hide board settings (])' : 'Show board settings (])'}
          >
            <Icon name="sidebarRight" />
          </button>
        </div>
      </header>

      <AssetPanel
        assets={assets}
        onUpload={(files) => handleImport({ files, urls: [] })}
        onAdd={(a) => placeImages([a])}
        onEdit={(a) => setModal({ kind: 'image', asset: a })}
        onDelete={removeAsset}
        onPinterest={() => setModal({ kind: 'pinterest' })}
      />

      <main className="canvas-area" ref={areaRef}>
        <div className="canvas-scroller">
          <div className="stage-wrap">
          <div className="page-shadow" style={{ width: w * zoom, height: h * zoom, left: STAGE_PAD, top: STAGE_PAD }} />
          <BoardCanvas
            ref={canvasRef}
            board={board}
            assets={assetMap}
            zoom={zoom}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onChangeMany={(patches) => patchMany(patches)}
            onChange={patchElement}
            onEditText={(id) => {
              setSelectedId(id);
              setTimeout(() => textRef.current?.focus(), 30);
            }}
          />
          </div>
        </div>
        {board.elements.length === 0 && (
          <div className="canvas-empty">Drag images here, or click an image in the library</div>
        )}
      </main>

      <Inspector
        board={board}
        selected={selected}
        selectionCount={selection.length}
        textRef={textRef}
        onBoard={(patch, key) => update({ ...board, ...patch }, key)}
        onElement={(patch, key) => selected && patchElement(selected.id, patch, key)}
        onChangeFormat={() => setModal({ kind: 'format', spec: { formatId: board.formatId, unit: board.unit, width: board.width, height: board.height } })}
        onEditImage={(el) => {
          const a = assetMap.get(el.assetId);
          if (a) setModal({ kind: 'image', asset: a, elementId: el.id });
        }}
        onLayer={moveLayer}
        onDuplicate={duplicateSelected}
        onDelete={removeSelected}
        onCenter={centerSelected}
        onFill={fillSelected}
      />

      {dropActive && (
        <div className="drop-overlay">
          <div className="glass drop-card">
            <Icon name="image" size={34} />
            <strong>Drop to add</strong>
            <span>Drop it on the page to place it right there</span>
          </div>
        </div>
      )}
      {importing && <div className="glass toast">Importing image…</div>}
      {toast && !importing && <div className="glass toast">{toast}</div>}

      {modal?.kind === 'image' && (
        <ImageEditor
          asset={modal.asset}
          saveLabel={modal.elementId ? 'Apply to board' : 'Save copy'}
          onCancel={() => setModal(null)}
          onSave={(blob) => saveEditedImage(blob, modal.asset, modal.elementId)}
        />
      )}
      {modal?.kind === 'pinterest' && <PinterestHelp onClose={() => setModal(null)} />}
      {modal?.kind === 'export' && <ExportDialog board={board} canvasRef={canvasRef} onClose={() => setModal(null)} />}
      {modal?.kind === 'format' && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="glass modal">
            <header className="modal-header">
              <h2>Page format</h2>
              <button className="btn icon ghost" onClick={() => setModal(null)}><Icon name="close" /></button>
            </header>
            <div className="modal-body">
              <FormatPicker value={modal.spec} onChange={(spec) => setModal({ kind: 'format', spec })} />
              <p className="muted small">Elements are repositioned proportionally to the new format.</p>
            </div>
            <footer className="modal-footer">
              <button className="btn ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn primary" onClick={() => { applyFormat(modal.spec); setModal(null); }}>Apply</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
