import { useEffect, useState } from 'react';
import type { Board } from '../types';
import { deleteBoard, listBoards, saveBoard } from '../lib/db';
import { uid } from '../lib/id';
import { formatById, formatSizeLabel } from '../formats';
import { NewBoardDialog, type NewBoardInput } from './NewBoardDialog';
import { Icon } from './Icon';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Gallery({ onOpen }: { onOpen(id: string): void }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [creating, setCreating] = useState(false);

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
    await saveBoard({ ...b, id: uid(), name: `${b.name} (cópia)`, createdAt: now, updatedAt: now });
    refresh();
  }

  async function rename(b: Board) {
    const name = prompt('Novo nome do board', b.name)?.trim();
    if (!name) return;
    await saveBoard({ ...b, name });
    refresh();
  }

  async function remove(b: Board) {
    if (!confirm(`Apagar "${b.name}"? Essa ação não pode ser desfeita.`)) return;
    await deleteBoard(b.id);
    refresh();
  }

  return (
    <div className="gallery">
      <header className="gallery-header">
        <div>
          <p className="eyebrow">Zakaryan Boards</p>
          <h1>Seus vision boards</h1>
        </div>
        <button className="btn primary large" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Novo board
        </button>
      </header>

      {boards && boards.length === 0 && (
        <div className="glass empty-state">
          <div className="empty-art">
            <span /><span /><span /><span />
          </div>
          <h2>Comece o seu 2027</h2>
          <p>Escolha um formato — A4 para imprimir, tela do celular para wallpaper — e arraste imagens de qualquer aba.</p>
          <button className="btn primary large" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Criar o primeiro board
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
                  <button className="btn icon ghost small" title="Renomear" onClick={() => rename(b)}><Icon name="edit" size={16} /></button>
                  <button className="btn icon ghost small" title="Duplicar" onClick={() => duplicate(b)}><Icon name="copy" size={16} /></button>
                  <button className="btn icon ghost small danger" title="Apagar" onClick={() => remove(b)}><Icon name="trash" size={16} /></button>
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
