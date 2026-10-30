import type { RefObject } from 'react';
import type { Board, BoardElement, ImageElement, TextElement } from '../types';
import { formatById, formatSizeLabel } from '../formats';
import { FONTS } from '../lib/fonts';
import { ColorPicker } from './ColorPicker';
import { Icon } from './Icon';

const TEXT_SWATCHES = ['#111111', '#ffffff', '#1f2a44', '#8b6f47', '#b08d57', '#c2185b', '#6a4c93', '#2e7d32'];

interface Props {
  board: Board;
  selected?: BoardElement;
  /** How many elements are selected; above 1 the panel shows actions for the whole group. */
  selectionCount: number;
  textRef: RefObject<HTMLTextAreaElement | null>;
  onBoard(patch: Partial<Board>, key?: string): void;
  onElement(patch: Partial<BoardElement>, key?: string): void;
  onChangeFormat(): void;
  onEditImage(el: ImageElement): void;
  onLayer(dir: 'front' | 'back'): void;
  onDuplicate(): void;
  onDelete(): void;
  onCenter(): void;
  onFill(): void;
}

function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange(v: number): void;
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{Math.round(value * 100) / 100}{suffix}</output>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Inspector(p: Props) {
  const { board, selected } = p;

  if (p.selectionCount > 1) {
    return (
      <aside className="glass panel inspector">
        <header className="panel-header">
          <h3>{p.selectionCount} selected</h3>
        </header>
        <section className="group">
          <p className="muted small">Drag any of them to move them together. Shift-click to add or remove one.</p>
          <span className="eyebrow">Arrange</span>
          <div className="button-grid">
            <button className="btn" onClick={() => p.onLayer('front')}><Icon name="front" /> Front</button>
            <button className="btn" onClick={() => p.onLayer('back')}><Icon name="backward" /> Back</button>
          </div>
          <button className="btn" onClick={p.onDuplicate}><Icon name="copy" /> Duplicate</button>
          <button className="btn danger-soft full" onClick={p.onDelete}><Icon name="trash" /> Remove from board</button>
        </section>
      </aside>
    );
  }

  if (!selected) {
    const f = formatById(board.formatId);
    return (
      <aside className="glass panel inspector">
        <header className="panel-header"><h3>Page</h3></header>
        <section className="group">
          <span className="eyebrow">Format</span>
          <button className="format-summary" onClick={p.onChangeFormat}>
            <Icon name={f.group === 'screen' ? 'phone' : 'page'} />
            <span>
              <strong>{f.id === 'custom' ? 'Custom' : f.label}</strong>
              <small>{formatSizeLabel(board.unit, board.width, board.height)}</small>
            </span>
            <em>Change</em>
          </button>
        </section>
        <section className="group">
          <span className="eyebrow">Background colour</span>
          <ColorPicker value={board.background} onChange={(c) => p.onBoard({ background: c }, 'bg')} />
        </section>
        <section className="group tips">
          <span className="eyebrow">Tips</span>
          <ul>
            <li>Drag images from another tab straight onto the page.</li>
            <li>Double-click a text to edit it.</li>
            <li><kbd>⌘Z</kbd> undo, <kbd>⌘D</kbd> duplicate, <kbd>⌫</kbd> delete.</li>
            <li><kbd>[</kbd> and <kbd>]</kbd> hide or show the side panels.</li>
            <li>Drag on an empty spot to select several items, or shift-click them. <kbd>⌘A</kbd> selects all.</li>
            <li>Pinch the trackpad to zoom the board.</li>
            <li>Drag the handles to rotate and resize; elements snap to the centre and edges.</li>
          </ul>
        </section>
      </aside>
    );
  }

  const common = (
    <>
      <Slider label="Opacity" value={Math.round(selected.opacity * 100)} min={5} max={100} suffix="%"
        onChange={(v) => p.onElement({ opacity: v / 100 }, 'opacity')} />
      <Slider label="Rotation" value={Math.round(selected.rotation)} min={-180} max={180} suffix="°"
        onChange={(v) => p.onElement({ rotation: v }, 'rotation')} />
      <Toggle label="Shadow" checked={selected.shadow} onChange={(v) => p.onElement({ shadow: v })} />
    </>
  );

  const actions = (
    <section className="group">
      <span className="eyebrow">Arrange</span>
      <div className="button-grid">
        <button className="btn" onClick={() => p.onLayer('front')}><Icon name="front" /> Front</button>
        <button className="btn" onClick={() => p.onLayer('back')}><Icon name="backward" /> Back</button>
        <button className="btn" onClick={p.onCenter}><Icon name="center" /> Centre</button>
        <button className="btn" onClick={p.onDuplicate}><Icon name="copy" /> Duplicate</button>
      </div>
      <button className="btn danger-soft full" onClick={p.onDelete}><Icon name="trash" /> Remove from board</button>
    </section>
  );

  if (selected.type === 'image') {
    const el = selected;
    return (
      <aside className="glass panel inspector">
        <header className="panel-header"><h3>Image</h3></header>
        <section className="group">
          <button className="btn primary full" onClick={() => p.onEditImage(el)}>
            <Icon name="crop" /> Crop / remove background
          </button>
          <div className="button-grid">
            <button className="btn" onClick={() => p.onElement({ flipX: !el.flipX })}><Icon name="flip" /> Flip</button>
            <button className="btn" onClick={p.onFill}><Icon name="fit" /> Fill</button>
          </div>
        </section>
        <section className="group">
          <span className="eyebrow">Appearance</span>
          <Slider label="Corners" value={Math.round(el.cornerRadius)} min={0} max={Math.round(Math.min(el.width, el.height) / 2)}
            onChange={(v) => p.onElement({ cornerRadius: v }, 'radius')} />
          {common}
        </section>
        {actions}
      </aside>
    );
  }

  const el: TextElement = selected;
  const bold = el.fontStyle.includes('bold');
  const italic = el.fontStyle.includes('italic');
  const style = (b: boolean, i: boolean) =>
    (b && i ? 'bold italic' : b ? 'bold' : i ? 'italic' : 'normal') as TextElement['fontStyle'];

  return (
    <aside className="glass panel inspector">
      <header className="panel-header"><h3>Text</h3></header>
      <section className="group">
        <textarea
          ref={p.textRef}
          className="input text-input"
          rows={3}
          value={el.text}
          style={{ fontFamily: el.fontFamily }}
          onChange={(e) => p.onElement({ text: e.target.value }, 'text')}
        />
        <select className="input" value={el.fontFamily} style={{ fontFamily: el.fontFamily }}
          onChange={(e) => p.onElement({ fontFamily: e.target.value })}>
          {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <div className="row gap-s">
          <div className="segmented">
            <button className={bold ? 'on' : ''} onClick={() => p.onElement({ fontStyle: style(!bold, italic) })}><b>B</b></button>
            <button className={italic ? 'on' : ''} onClick={() => p.onElement({ fontStyle: style(bold, !italic) })}><i>I</i></button>
          </div>
          <div className="segmented">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={el.align === a ? 'on' : ''} onClick={() => p.onElement({ align: a })}>
                {a === 'left' ? 'Left' : a === 'center' ? 'Centre' : 'Right'}
              </button>
            ))}
          </div>
        </div>
        <Slider label="Size" value={Math.round(el.fontSize)} min={6} max={Math.round(Math.max(200, el.fontSize * 1.5))}
          onChange={(v) => p.onElement({ fontSize: v }, 'fontSize')} />
        <Slider label="Spacing" value={el.letterSpacing} min={-5} max={40}
          onChange={(v) => p.onElement({ letterSpacing: v }, 'spacing')} />
        <Slider label="Line height" value={el.lineHeight} min={0.7} max={2.5} step={0.05}
          onChange={(v) => p.onElement({ lineHeight: v }, 'lineHeight')} />
      </section>
      <section className="group">
        <span className="eyebrow">Colour</span>
        <ColorPicker value={el.fill} swatches={TEXT_SWATCHES} onChange={(c) => p.onElement({ fill: c }, 'fill')} />
        {common}
      </section>
      {actions}
    </aside>
  );
}
