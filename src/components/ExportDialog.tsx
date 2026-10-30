import { useState, type RefObject } from 'react';
import type { Board } from '../types';
import { exportPlan } from '../formats';
import { exportCanvas, printCanvas, type ExportType } from '../lib/export';
import type { BoardCanvasHandle } from './BoardCanvas';
import { Icon } from './Icon';

export function ExportDialog({ board, canvasRef, onClose }: {
  board: Board;
  canvasRef: RefObject<BoardCanvasHandle | null>;
  onClose(): void;
}) {
  const isPrint = board.unit === 'mm';
  const [type, setType] = useState<ExportType>(isPrint ? 'pdf' : 'png');
  const [dpi, setDpi] = useState(300);
  const [mult, setMult] = useState(1);
  const [busy, setBusy] = useState(false);
  const plan = exportPlan(board, dpi, mult);

  const render = () => canvasRef.current!.toCanvas(plan.ratio);

  async function doExport() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
    try {
      await exportCanvas(render(), board, type);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function doPrint() {
    // Open the tab synchronously, otherwise popup blockers kick in.
    const win = window.open('', '_blank');
    setBusy(true);
    setTimeout(async () => {
      try {
        await printCanvas(render(), board, win);
      } finally {
        setBusy(false);
      }
    }, 30);
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass modal export-modal">
        <header className="modal-header">
          <h2>Export and print</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="modal-body">
          <div className="field">
            <span className="eyebrow">File format</span>
            <div className="choice-grid">
              {([
                ['pdf', 'PDF', 'Best for printing at the exact size'],
                ['png', 'PNG', 'Highest quality, lossless'],
                ['jpg', 'JPG', 'Smaller file, great for wallpapers'],
              ] as const).map(([id, label, desc]) => (
                <button key={id} className={'choice' + (type === id ? ' on' : '')} onClick={() => setType(id)}>
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="eyebrow">Quality</span>
            {isPrint ? (
              <div className="segmented">
                {[150, 300].map((d) => (
                  <button key={d} className={dpi === d ? 'on' : ''} onClick={() => setDpi(d)}>
                    {d} dpi {d === 300 ? '· print shop' : '· home'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="segmented">
                {[1, 2].map((m) => (
                  <button key={m} className={mult === m ? 'on' : ''} onClick={() => setMult(m)}>
                    {m}× {m === 1 ? '· screen native' : '· extra sharp'}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">
              Output: {plan.outW} × {plan.outH} px
              {plan.effectiveDpi ? ` (${plan.effectiveDpi} dpi)` : ''}
              {plan.capped && ' — reduced to fit in the browser’s memory.'}
            </p>
          </div>
          {isPrint && (
            <p className="note">
              When printing, choose <strong>actual size / 100%</strong> (not "fit to page") so it comes out at exactly the board’s size.
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button className="btn" disabled={busy} onClick={doPrint}><Icon name="printer" /> Print</button>
          <button className="btn primary" disabled={busy} onClick={doExport}>
            <Icon name="download" /> {busy ? 'Generating…' : `Download ${type.toUpperCase()}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
