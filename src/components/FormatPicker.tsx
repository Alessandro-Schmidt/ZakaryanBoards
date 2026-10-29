import { FORMATS, formatById, formatSizeLabel } from '../formats';
import type { Unit } from '../types';

export interface PageSpec {
  formatId: string;
  unit: Unit;
  width: number;
  height: number;
}

export function specForFormat(id: string, landscape = false): PageSpec {
  const f = formatById(id);
  const [w, h] = landscape === f.w < f.h ? [f.h, f.w] : [f.w, f.h];
  return { formatId: f.id, unit: f.unit, width: w, height: h };
}

const GROUPS = [
  { id: 'print', title: 'Para imprimir' },
  { id: 'screen', title: 'Para telas' },
  { id: 'custom', title: 'Sob medida' },
] as const;

export function FormatPicker({ value, onChange }: { value: PageSpec; onChange(v: PageSpec): void }) {
  const landscape = value.width > value.height;
  const isCustom = value.formatId === 'custom';

  return (
    <div className="format-picker">
      {GROUPS.map((g) => (
        <section key={g.id}>
          <h4 className="eyebrow">{g.title}</h4>
          <div className="format-grid">
            {FORMATS.filter((f) => f.group === g.id).map((f) => {
              const k = 34 / Math.max(f.w, f.h);
              return (
                <button
                  key={f.id}
                  className={'format-card' + (value.formatId === f.id ? ' on' : '')}
                  onClick={() => onChange(f.id === 'custom' ? { ...value, formatId: 'custom' } : specForFormat(f.id, f.w > f.h))}
                >
                  <span className="format-thumb">
                    <span style={{ width: f.w * k, height: f.h * k }} />
                  </span>
                  <span className="format-name">{f.label}</span>
                  <span className="format-size">{f.id === 'custom' ? 'Você define' : formatSizeLabel(f.unit, f.w, f.h)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="row gap-m wrap">
        <div className="segmented">
          <button className={!landscape ? 'on' : ''} onClick={() => landscape && onChange({ ...value, width: value.height, height: value.width })}>
            Retrato
          </button>
          <button className={landscape ? 'on' : ''} onClick={() => !landscape && onChange({ ...value, width: value.height, height: value.width })}>
            Paisagem
          </button>
        </div>
        {isCustom && (
          <div className="row gap-s custom-size">
            <input
              type="number"
              min={10}
              value={value.width}
              onChange={(e) => onChange({ ...value, width: Math.max(1, +e.target.value || 1) })}
            />
            <span>×</span>
            <input
              type="number"
              min={10}
              value={value.height}
              onChange={(e) => onChange({ ...value, height: Math.max(1, +e.target.value || 1) })}
            />
            <div className="segmented small">
              {(['mm', 'px'] as const).map((u) => (
                <button key={u} className={value.unit === u ? 'on' : ''} onClick={() => onChange({ ...value, unit: u })}>
                  {u}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
