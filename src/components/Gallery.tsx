import { useEffect, useState } from 'react';
import type { Board } from '../types';
import { deleteBoard, listBoards, saveBoard } from '../lib/db';
import { uid } from '../lib/id';
import { formatById, formatSizeLabel } from '../formats';
import { NewBoardDialog, type NewBoardInput } from './NewBoardDialog';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { ThemePicker } from './ThemePicker';
import { applyTheme, savedThemeId } from '../theme';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Gallery({ onOpen }: { onOpen(id: string): void }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [theme, setTheme] = useState(savedThemeId);

  function pickTheme(id: string) {
    applyTheme(id);
    setTheme(id);
  }

  const refresh = () => listBoards().then(setBoards);
  useEffect(() => {
    refresh();
  }, []);

  async function create(v: NewBoardInput) {
    const now = Date.now();
    const b: Board = {
      id: uid(),
      name: v.name,
      formatId: v.formatId,
      unit: v.unit,
      width: v.width,
      height: v.height,
      background: v.background,
      elements: [],
      createdAt: now,
      updatedAt: now,
    };
    await saveBoard(b);
    onOpen(b.id);
  }

  async function duplicate(b: Board) {
    const now = Date.now();
    await saveBoard({ ...b, id: uid(), name: `${b.name} (copy)`, createdAt: now, updatedAt: now });
    refresh();
  }

  async function rename(b: Board) {
    const name = prompt('New board name', b.name)?.trim();
    if (!name) return;
    await saveBoard({ ...b, name });
    refresh();
  }

  async function remove(b: Board) {
    if (!confirm(`Delete "${b.name}"? This can’t be undone.`)) return;
    await deleteBoard(b.id);
    refresh();
  }

  return (
    <div className="gallery">
      <header className="gallery-header">
        <div className="brand">
          <Logo themeId={theme} size={64} />
          <div>
            <p className="eyebrow">Belvedere</p>
            <h1>Your vision boards</h1>
          </div>
        </div>
        <div className="row gap-m wrap">
          <ThemePicker value={theme} onChange={pickTheme} />
          <button className="btn primary large" onClick={() => setCreating(true)}>
            <Icon name="plus" /> New board
          </button>
        </div>
      </header>

      {boards && boards.length === 0 && (
        <div className="glass empty-state">
          <div className="empty-art">
            <span /><span /><span /><span />
          </div>
          <h2>Start your 2027</h2>
          <p>Pick a format (A4 to print, a phone screen for a wallpaper) and drag in images from any tab.</p>
          <button className="btn primary large" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Create your first board
          </button>
        </div>
      )}

      <div className="board-grid">
        {boards?.map((b) => {
          const f = formatById(b.formatId);
          return (
            <article key={b.id} className="glass board-card">
              <button className="board-thumb" onClick={() => onOpen(b.id)}>
                <span style={{ aspectRatio: `${b.width} / ${b.height}` }}>
                  {b.thumbnail ? <img src={b.thumbnail} alt="" /> : <i style={{ background: b.background }} />}
                </span>
              </button>
              <div className="board-meta">
                <div className="board-text" onClick={() => onOpen(b.id)}>
                  <strong>{b.name}</strong>
                  <span>
                    {f.id === 'custom' ? formatSizeLabel(b.unit, b.width, b.height) : f.label} · {dateFmt.format(b.updatedAt)}
                  </span>
                </div>
                <div className="board-actions">
                  <button className="btn icon ghost small" title="Rename" onClick={() => rename(b)}><Icon name="edit" size={16} /></button>
                  <button className="btn icon ghost small" title="Duplicate" onClick={() => duplicate(b)}><Icon name="copy" size={16} /></button>
                  <button className="btn icon ghost small danger" title="Delete" onClick={() => remove(b)}><Icon name="trash" size={16} /></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {creating && <NewBoardDialog onCancel={() => setCreating(false)} onCreate={create} />}
    </div>
  );
}
