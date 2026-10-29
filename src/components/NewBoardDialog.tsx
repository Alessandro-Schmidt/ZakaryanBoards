import { useState } from 'react';
import { ColorPicker } from './ColorPicker';
import { FormatPicker, specForFormat, type PageSpec } from './FormatPicker';
import { Icon } from './Icon';

export interface NewBoardInput extends PageSpec {
  name: string;
  background: string;
}

export function NewBoardDialog({ onCancel, onCreate }: { onCancel(): void; onCreate(v: NewBoardInput): void }) {
  const [name, setName] = useState('Vision Board 2027');
  const [spec, setSpec] = useState<PageSpec>(specForFormat('a4'));
  const [background, setBackground] = useState('#f7f1e8');

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="glass modal new-board">
        <header className="modal-header">
          <h2>Novo vision board</h2>
          <button className="btn icon ghost" onClick={onCancel} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          <label className="field">
            <span className="eyebrow">Nome</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <FormatPicker value={spec} onChange={setSpec} />
          <div className="field">
            <span className="eyebrow">Cor de fundo</span>
            <ColorPicker value={background} onChange={setBackground} />
          </div>
        </div>
        <footer className="modal-footer">
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={() => onCreate({ ...spec, name: name.trim() || 'Sem título', background })}>
            Criar board
          </button>
        </footer>
      </div>
    </div>
  );
}
