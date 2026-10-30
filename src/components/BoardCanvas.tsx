import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Konva from 'konva';
import { Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import type { Asset, Board, BoardElement, ImageElement, TextElement } from '../types';
import { boardPixelSize } from '../formats';
import { imageForAsset } from '../lib/images';
import { loadFonts } from '../lib/fonts';

export const STAGE_PAD = 56;
const SNAP_PX = 7;

export interface BoardCanvasHandle {
  /** Renders the page only (no handles/guides) at `pixelRatio` output px per logical px. */
  toCanvas(pixelRatio: number): HTMLCanvasElement;
  /** Converts a viewport point into page coordinates. */
  clientToBoard(clientX: number, clientY: number): { x: number; y: number };
  /** Converts a page point into viewport coordinates. */
  boardToClient(x: number, y: number): { x: number; y: number };
}

interface Props {
  board: Board;
  assets: Map<string, Asset>;
  zoom: number;
  selectedIds: string[];
  onSelect(ids: string[]): void;
  onChange(id: string, patch: Partial<BoardElement>, key?: string): void;
  /** Commits several elements at once (moving a multi-selection), as one undo step. */
  onChangeMany(patches: Map<string, Partial<BoardElement>>): void;
  onEditText(id: string): void;
}

type Guide = { points: number[] };
type Marquee = { x0: number; y0: number; x1: number; y1: number; base: string[] };
type PointerEvt = Konva.KonvaEventObject<MouseEvent | TouchEvent>;
const additive = (e: PointerEvt) => 'shiftKey' in e.evt && (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey);

function useAssetImage(asset: Asset | undefined) {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    let alive = true;
    if (asset) imageForAsset(asset).then((i) => alive && setImg(i), () => {});
    else setImg(undefined);
    return () => {
      alive = false;
    };
  }, [asset]);
  return img;
}

const SHADOW = { shadowColor: '#000', shadowOpacity: 0.32, shadowOffsetX: 0 } as const;

export const BoardCanvas = forwardRef<BoardCanvasHandle, Props>(function BoardCanvas(
  { board, assets, zoom, selectedIds, onSelect, onChange, onChangeMany, onEditText },
  ref,
) {
  const { w, h } = boardPixelSize(board);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const overlayRef = useRef<Konva.Group>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [, setFontsTick] = useState(0);

  useEffect(() => {
    loadFonts().then(() => {
      // Konva measured text with fallback fonts; re-measure now that the real ones are in.
      setFontsTick((t) => t + 1);
      layerRef.current?.find('Text').forEach((t) => (t as Konva.Text).fontFamily((t as Konva.Text).fontFamily()));
      layerRef.current?.batchDraw();
    });
  }, []);

  const multi = selectedIds.length > 1;
  const selected = multi ? undefined : board.elements.find((e) => e.id === selectedIds[0]);
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = selectedIds.map((id) => stageRef.current?.findOne('#' + id)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, board.elements]);

  // Mouse down on an item: shift/⌘ toggles it; otherwise it becomes the selection unless it is already part of it
  // (so a group can be dragged). A plain click without dragging narrows a group down to that item.
  const pick = (id: string, e: PointerEvt) => {
    if (additive(e)) onSelect(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    else if (!selectedIds.includes(id)) onSelect([id]);
  };
  const clickPick = (id: string, e: PointerEvt) => {
    if (!additive(e) && multi) onSelect([id]);
  };
  const ensurePicked = (id: string) => {
    if (!selectedIds.includes(id)) onSelect([id]);
  };

  // ---- rubber-band selection --------------------------------------------------------
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const setBand = (m: Marquee | null) => {
    marqueeRef.current = m;
    setMarquee(m);
  };
  function startMarquee(e: Konva.KonvaEventObject<MouseEvent>) {
    const p = layerRef.current!.getRelativePointerPosition()!;
    const base = additive(e) ? selectedIds : [];
    if (!additive(e)) onSelect([]);
    setBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, base });
    const stage = stageRef.current!;
    const move = (ev: MouseEvent) => {
      stage.setPointersPositions(ev);
      const q = layerRef.current!.getRelativePointerPosition()!;
      if (marqueeRef.current) setBand({ ...marqueeRef.current, x1: q.x, y1: q.y });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const m = marqueeRef.current;
      setBand(null);
      if (!m) return;
      const box = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) };
      if (box.width * zoom < 4 && box.height * zoom < 4) return;
      const layer = layerRef.current!;
      const hits = board.elements
        .filter((el) => {
          const n = stage.findOne('#' + el.id);
          return n && Konva.Util.haveIntersection(box, n.getClientRect({ relativeTo: layer }));
        })
        .map((el) => el.id);
      onSelect(Array.from(new Set([...m.base, ...hits])));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7b6cff';

  useImperativeHandle(
    ref,
    () => ({
      toCanvas(pixelRatio) {
        const layer = layerRef.current!;
        const overlay = overlayRef.current!;
        const prev = { x: layer.x(), y: layer.y(), s: layer.scaleX() };
        overlay.hide();
        layer.position({ x: 0, y: 0 });
        layer.scale({ x: 1, y: 1 });
        try {
          return layer.toCanvas({ x: 0, y: 0, width: w, height: h, pixelRatio });
        } finally {
          layer.position({ x: prev.x, y: prev.y });
          layer.scale({ x: prev.s, y: prev.s });
          overlay.show();
          layer.batchDraw();
        }
      },
      clientToBoard(clientX, clientY) {
        const r = stageRef.current!.container().getBoundingClientRect();
        return { x: (clientX - r.left - STAGE_PAD) / zoom, y: (clientY - r.top - STAGE_PAD) / zoom };
      },
      boardToClient(x, y) {
        const r = stageRef.current!.container().getBoundingClientRect();
        return { x: r.left + STAGE_PAD + x * zoom, y: r.top + STAGE_PAD + y * zoom };
      },
    }),
    [w, h, zoom],
  );

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    // A group moves as one; snapping a single member would pull it out of line.
    if (multi && selectedIds.includes(node.id())) return;
    const layer = layerRef.current!;
    const box = node.getClientRect({ relativeTo: layer });
    const thr = SNAP_PX / zoom;
    const found: Guide[] = [];
    const snap = (targets: number[], edges: number[], axis: 'x' | 'y') => {
      let best: { diff: number; at: number } | null = null;
      for (const t of targets)
        for (const edge of edges) {
          const diff = t - edge;
          if (Math.abs(diff) < thr && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { diff, at: t };
        }
      if (!best) return;
      node[axis](node[axis]() + best.diff);
      found.push({ points: axis === 'x' ? [best.at, -2000, best.at, h + 2000] : [-2000, best.at, w + 2000, best.at] });
    };
    snap([0, w / 2, w], [box.x, box.x + box.width / 2, box.x + box.width], 'x');
    snap([0, h / 2, h], [box.y, box.y + box.height / 2, box.y + box.height], 'y');
    setGuides(found);
  }

  // Every node of a dragged group fires its own dragend; commit them all once, as a single undo step.
  const groupCommit = useRef(0);
  function handleDragEnd(el: BoardElement, e: Konva.KonvaEventObject<DragEvent>) {
    setGuides([]);
    if (multi && selectedIds.includes(el.id)) {
      if (groupCommit.current) return;
      groupCommit.current = window.setTimeout(() => {
        groupCommit.current = 0;
        const stage = stageRef.current!;
        onChangeMany(
          new Map(selectedIds.flatMap((id) => {
            const n = stage.findOne('#' + id);
            return n ? [[id, { x: n.x(), y: n.y() }] as const] : [];
          })),
        );
      });
      return;
    }
    onChange(el.id, { x: e.target.x(), y: e.target.y() });
  }

  const isEmpty = (e: PointerEvt) => e.target === e.target.getStage() || e.target.name() === 'page-bg';

  const isText = selected?.type === 'text';

  return (
    <Stage
      ref={stageRef}
      width={w * zoom + STAGE_PAD * 2}
      height={h * zoom + STAGE_PAD * 2}
      onMouseDown={(e) => isEmpty(e) && e.evt.button === 0 && startMarquee(e)}
      onTouchStart={(e) => isEmpty(e) && onSelect([])}
    >
      <Layer ref={layerRef} x={STAGE_PAD} y={STAGE_PAD} scaleX={zoom} scaleY={zoom}>
        <Group clipX={0} clipY={0} clipWidth={w} clipHeight={h}>
          <Rect name="page-bg" width={w} height={h} fill={board.background} />
          {board.elements.map((el) =>
            el.type === 'image' ? (
              <ImageNode
                key={el.id}
                el={el}
                asset={assets.get(el.assetId)}
                onPick={(e) => pick(el.id, e)}
                onClickPick={(e) => clickPick(el.id, e)}
                onDragStart={() => ensurePicked(el.id)}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(el, e)}
                onChange={(p) => onChange(el.id, p)}
              />
            ) : (
              <TextNode
                key={el.id}
                el={el}
                onPick={(e) => pick(el.id, e)}
                onClickPick={(e) => clickPick(el.id, e)}
                onDragStart={() => ensurePicked(el.id)}
                onDblClick={() => onEditText(el.id)}
                onDragMove={handleDragMove}
                onDragEnd={(e) => handleDragEnd(el, e)}
                onChange={(p) => onChange(el.id, p)}
              />
            ),
          )}
        </Group>
        <Group ref={overlayRef} listening={true}>
          {guides.map((g, i) => (
            <Line key={i} points={g.points} stroke="#ff2d92" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
          ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill={accent}
              opacity={0.16}
              listening={false}
            />
          )}
          {marquee && (
            <Rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              stroke={accent}
              strokeWidth={1.5 / zoom}
              listening={false}
            />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled={!multi}
            keepRatio={!isText}
            enabledAnchors={
              multi
                ? []
                : isText
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
                : ['top-left', 'top-right', 'bottom-left', 'bottom-right']
            }
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            anchorSize={11}
            anchorCornerRadius={6}
            anchorStroke="#0a84ff"
            anchorFill="#ffffff"
            anchorStrokeWidth={1.5}
            borderStroke="#0a84ff"
            borderStrokeWidth={1.5}
            rotateAnchorOffset={28}
            padding={2}
            ignoreStroke
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 ? oldBox : newBox)}
          />
        </Group>
      </Layer>
    </Stage>
  );
});

interface NodeProps<T> {
  el: T;
  onPick(e: PointerEvt): void;
  onClickPick(e: PointerEvt): void;
  onDragStart(): void;
  onDragMove(e: Konva.KonvaEventObject<DragEvent>): void;
  onDragEnd(e: Konva.KonvaEventObject<DragEvent>): void;
  onChange(p: Partial<T>): void;
}

function ImageNode({ el, asset, onPick, onClickPick, onDragStart, onDragMove, onDragEnd, onChange }: NodeProps<ImageElement> & { asset?: Asset }) {
  const img = useAssetImage(asset);
  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity}
      draggable
      onMouseDown={onPick}
      onTap={onPick}
      onClick={onClickPick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={(e) => {
        const n = e.target;
        const width = Math.max(12, el.width * n.scaleX());
        const height = Math.max(12, el.height * n.scaleY());
        n.scale({ x: 1, y: 1 });
        onChange({ x: n.x(), y: n.y(), rotation: n.rotation(), width, height });
      }}
    >
      {img ? (
        <KImage
          image={img}
          width={el.width}
          height={el.height}
          x={el.flipX ? el.width : 0}
          scaleX={el.flipX ? -1 : 1}
          cornerRadius={el.cornerRadius}
          {...(el.shadow ? { ...SHADOW, shadowBlur: el.width * 0.08, shadowOffsetY: el.width * 0.03 } : {})}
        />
      ) : (
        <Rect width={el.width} height={el.height} fill="rgba(120,120,140,.15)" cornerRadius={el.cornerRadius} />
      )}
    </Group>
  );
}

function TextNode({ el, onPick, onClickPick, onDragStart, onDblClick, onDragMove, onDragEnd, onChange }: NodeProps<TextElement> & { onDblClick(): void }) {
  return (
    <Text
      id={el.id}
      x={el.x}
      y={el.y}
      rotation={el.rotation}
      opacity={el.opacity}
      text={el.text}
      width={el.width}
      fontFamily={el.fontFamily}
      fontSize={el.fontSize}
      fontStyle={el.fontStyle}
      fill={el.fill}
      align={el.align}
      letterSpacing={el.letterSpacing}
      lineHeight={el.lineHeight}
      {...(el.shadow ? { ...SHADOW, shadowBlur: el.fontSize * 0.25, shadowOffsetY: el.fontSize * 0.06 } : {})}
      draggable
      onMouseDown={onPick}
      onTap={onPick}
      onClick={onClickPick}
      onDragStart={onDragStart}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransform={(e) => {
        // Side handles change the text box width instead of stretching the glyphs.
        const n = e.target as Konva.Text;
        if (Math.abs(n.scaleY() - 1) < 0.0001) {
          n.width(Math.max(20, n.width() * n.scaleX()));
          n.scaleX(1);
        }
      }}
      onTransformEnd={(e) => {
        const n = e.target as Konva.Text;
        const sx = n.scaleX();
        const sy = n.scaleY();
        n.scale({ x: 1, y: 1 });
        onChange({
          x: n.x(),
          y: n.y(),
          rotation: n.rotation(),
          width: Math.max(20, n.width() * sx),
          fontSize: Math.max(4, el.fontSize * sy),
        });
      }}
    />
  );
}
