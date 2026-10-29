import { BACKGROUND_SWATCHES } from '../formats';

export function ColorPicker({ value, onChange, swatches = BACKGROUND_SWATCHES }: {
  value: string;
  onChange(c: string): void;
  swatches?: string[];
}) {
  return (
    <div className="swatches">
      {swatches.map((c) => (
        <button
          key={c}
          className={'swatch' + (c.toLowerCase() === value.toLowerCase() ? ' on' : '')}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch custom" title="Outra cor">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
