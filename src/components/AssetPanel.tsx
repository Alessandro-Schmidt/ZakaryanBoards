import { useRef } from 'react';
import type { Asset } from '../types';
import { assetUrl } from '../lib/images';
import { Icon } from './Icon';

export const ASSET_MIME = 'application/x-zakaryan-asset';

interface Props {
  assets: Asset[];
  onUpload(files: File[]): void;
  onAdd(asset: Asset): void;
  onEdit(asset: Asset): void;
  onDelete(asset: Asset): void;
  onPinterest(): void;
}

export function AssetPanel({ assets, onUpload, onAdd, onEdit, onDelete, onPinterest }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <aside className="glass panel assets-panel">
      <header className="panel-header">
        <div>
          <h3>Images</h3>
          <span className="muted">{assets.length ? `${assets.length} in library` : 'Library is empty'}</span>
        </div>
        <button className="btn icon" title="Upload from computer" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onUpload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </header>

      <div className="drop-hint">
        <Icon name="image" size={22} />
        <p>
          <strong>Drag images</strong> here from another tab or your computer. You can also copy an image and paste it with{' '}
          <kbd>⌘V</kbd> / <kbd>Ctrl V</kbd>.
        </p>
      </div>
      <button className="btn small pinterest-btn" onClick={onPinterest}>
        <Icon name="pin" size={16} /> Drag from Pinterest
      </button>

      <div className="asset-grid">
        {assets.map((a) => (
          <div
            key={a.id}
            className="asset"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ASSET_MIME, a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(a)}
            title={`${a.name} — click or drag onto the board`}
          >
            <img src={assetUrl(a)} alt={a.name} draggable={false} />
            {a.parentId && <span className="badge">editada</span>}
            <div className="asset-actions" onClick={(e) => e.stopPropagation()}>
              <button className="btn icon tiny" title="Crop / remove background" onClick={() => onEdit(a)}>
                <Icon name="crop" size={14} />
              </button>
              <button className="btn icon tiny danger" title="Delete from library" onClick={() => onDelete(a)}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
