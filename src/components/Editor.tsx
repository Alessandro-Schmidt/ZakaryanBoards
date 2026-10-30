import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Asset, Board, BoardElement, ImageElement, TextElement } from '../types';
import { boardPixelSize } from '../formats';
import { deleteAsset, getBoard, listAssets, listBoards, saveAsset, saveBoard } from '../lib/db';
import { createAsset, importPayload, readDataTransfer, type DropPayload } from '../lib/images';
import { useBoardHistory } from '../lib/history';
import { uid } from '../lib/id';
import { AssetPanel, ASSET_MIME } from './AssetPanel';
import { BoardCanvas, STAGE_PAD, type BoardCanvasHandle } from './BoardCanvas';
import { ExportDialog } from './ExportDialog';
import { FormatPicker, type PageSpec } from './FormatPicker';
import { ImageEditor } from './ImageEditor';
import { Inspector } from './Inspector';
import { Icon } from './Icon';

export function Editor({ boardId, onBack }: { boardId: string; onBack(): void }) {
  const [initial, setInitial] = useState<{ board: Board; assets: Asset[] } | null | undefined>();
  useEffect(() => {
    Promise.all([getBoard(boardId), listAssets()]).then(([board, assets]) =>
      setInitial(board ? { board, assets } : null),
    );
  }, [boardId]);

  if (initial === undefined) return <div className="center-screen muted">Carregando…</div>;
  if (initial === null)
    return (
      <div className="center-screen">
        <p>Board não encontrado.</p>
        <button className="btn primary" onClick={onBack}>Voltar</button>
      </div>
    );
  return <EditorInner initial={initial.board} initialAssets={initial.assets} onBack={onBack} />;
}

type Modal =
  | { kind: 'image'; asset: Asset; elementId?: string }
  | { kind: 'export' }
  | { kind: 'format'; spec: PageSpec }
  | null;

function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function EditorInner({ initial, initialAssets, onBack }: { initial: Board; initialAssets: Asset[]; onBack(): void }) {
  const { board, update, undo, redo, canUndo, canRedo } = useBoardHistory(initial);
  const [assets, setAssets] = useState(initialAssets);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const canvasRef = useRef<BoardCanvasHandle>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);

  const { w, h } = boardPixelSize(board);
  const selected = board.elements.find((e) => e.id === selectedId);

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
      id: uid(), type: 'text', text: 'Sonhe grande',
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
    if (!selectedId) return;
    setElements(board.elements.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...selected, id: uid(), x: selected.x + 24, y: selected.y + 24 };
    setElements([...board.elements, copy]);
    setSelectedId(copy.id);
  }

  function moveLayer(dir: 'front' | 'back') {
    if (!selected) return;
    const rest = board.elements.filter((e) => e.id !== selected.id);
    setElements(dir === 'front' ? [...rest, selected] : [selected, ...rest]);
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
      const { assets: added, failed } = await importPayload(payload);
      if (added.length) {
        await addAssets(added);
        if (place) {
          placeImages(added, at);
          setToast(null);
        }
        else notify(added.length > 1 ? `${added.length} imagens adicionadas` : 'Imagem adicionada à biblioteca');
      } else if (failed) {
        notify('Esse site bloqueia arrastar a imagem. Clique com o botão direito → "Copiar imagem" e cole aqui com ⌘V / Ctrl+V.');
      }
    } finally {
      setImporting(false);
    }
  }

  async function removeAsset(a: Asset) {
    const boards = await listBoards();
    const used = boards.filter((b) => (b.id === board.id ? board : b).elements.some((e) => e.type === 'image' && e.assetId === a.id));
    const msg = used.length
      ? `Essa imagem está em uso em ${used.length} board(s) e vai sumir deles. Apagar mesmo assim?`
      : `Apagar "${a.name}" da biblioteca?`;
    if (!confirm(msg)) return;
    await deleteAsset(a.id);
    setAssets((prev) => prev.filter((x) => x.id !== a.id));
    if (board.elements.some((e) => e.type === 'image' && e.assetId === a.id))
      setElements(board.elements.filter((e) => !(e.type === 'image' && e.assetId === a.id)));
  }

  async function saveEditedImage(blob: Blob, source: Asset, elementId?: string) {
    const asset = await createAsset(blob, source.name.replace(/ \(editada\)$/, '') + ' (editada)', source.id);
    await addAssets([asset]);
    const el = elementId && board.elements.find((e) => e.id === elementId);
    if (el && el.type === 'image') {
      const height = (el.width * asset.height) / asset.width;
      patchElement(el.id, { assetId: asset.id, height, y: el.y + (el.height - height) / 2 });
    }
    setModal(null);
    if (!elementId) notify('Nova versão salva na biblioteca');
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
  const handlers = useRef({ handleImport, removeSelected, duplicateSelected, undo, redo, patchElement, selected, modal });
  handlers.current = { handleImport, removeSelected, duplicateSelected, undo, redo, patchElement, selected, modal };

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
      } else if (mod && k === 'd') {
        e.preventDefault();
        H.duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (H.selected) {
          e.preventDefault();
          H.removeSelected();
        }
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (H.selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        H.patchElement(H.selected.id, { x: H.selected.x + dx, y: H.selected.y + dy }, 'nudge');
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
    <div className="editor" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <header className="glass toolbar">
        <div className="row gap-s">
          <button className="btn icon ghost" onClick={back} title="Todos os boards"><Icon name="back" /></button>
          <input
            className="title-input"
            value={board.name}
            onChange={(e) => update({ ...board, name: e.target.value }, 'name')}
            aria-label="Nome do board"
          />
        </div>
        <div className="row gap-s toolbar-center">
          <button className="btn icon ghost" disabled={!canUndo} onClick={undo} title="Desfazer (⌘Z)"><Icon name="undo" /></button>
          <button className="btn icon ghost" disabled={!canRedo} onClick={redo} title="Refazer (⇧⌘Z)"><Icon name="redo" /></button>
          <span className="divider" />
          <button className="btn ghost" onClick={addText}><Icon name="text" /> Texto</button>
          <span className="divider" />
          <button className="btn icon ghost" onClick={() => zoomBy(1 / 1.2)} title="Diminuir zoom"><Icon name="zoomOut" /></button>
          <button className="btn ghost zoom-label" onClick={() => setZoomMode('fit')} title="Ajustar à tela">
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn icon ghost" onClick={() => zoomBy(1.2)} title="Aumentar zoom"><Icon name="zoomIn" /></button>
        </div>
        <div className="row gap-s">
          <button className="btn primary" onClick={() => { setSelectedId(null); setModal({ kind: 'export' }); }}>
            <Icon name="download" /> Exportar
          </button>
        </div>
      </header>

      <AssetPanel
        assets={assets}
        onUpload={(files) => handleImport({ files, urls: [] })}
        onAdd={(a) => placeImages([a])}
        onEdit={(a) => setModal({ kind: 'image', asset: a })}
        onDelete={removeAsset}
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
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={patchElement}
            onEditText={(id) => {
              setSelectedId(id);
              setTimeout(() => textRef.current?.focus(), 30);
            }}
          />
          </div>
        </div>
        {board.elements.length === 0 && (
          <div className="canvas-empty">Arraste imagens para cá, ou clique em uma imagem da biblioteca</div>
        )}
      </main>

      <Inspector
        board={board}
        selected={selected}
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
            <strong>Solte para adicionar</strong>
            <span>Solte sobre a página para já posicionar a imagem</span>
          </div>
        </div>
      )}
      {importing && <div className="glass toast">Importando imagem…</div>}
      {toast && !importing && <div className="glass toast">{toast}</div>}

      {modal?.kind === 'image' && (
        <ImageEditor
          asset={modal.asset}
          saveLabel={modal.elementId ? 'Aplicar no board' : 'Salvar cópia'}
          onCancel={() => setModal(null)}
          onSave={(blob) => saveEditedImage(blob, modal.asset, modal.elementId)}
        />
      )}
      {modal?.kind === 'export' && <ExportDialog board={board} canvasRef={canvasRef} onClose={() => setModal(null)} />}
      {modal?.kind === 'format' && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="glass modal">
            <header className="modal-header">
              <h2>Formato da página</h2>
              <button className="btn icon ghost" onClick={() => setModal(null)}><Icon name="close" /></button>
            </header>
            <div className="modal-body">
              <FormatPicker value={modal.spec} onChange={(spec) => setModal({ kind: 'format', spec })} />
              <p className="muted small">Os elementos são reposicionados proporcionalmente no novo formato.</p>
            </div>
            <footer className="modal-footer">
              <button className="btn ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn primary" onClick={() => { applyFormat(modal.spec); setModal(null); }}>Aplicar</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
