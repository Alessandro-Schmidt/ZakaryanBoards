import { useEffect, useRef, useState } from 'react';
import { THEMES } from '../theme';
import { Logo } from './Logo';

export function ThemePicker({ value, onChange }: { value: string; onChange(id: string): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={ref}>
      <button className="btn large" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        <Logo themeId={value} size={22} /> Aparência
      </button>
      {open && (
        <div className="glass theme-menu" role="menu">
          <p className="eyebrow">Cores do Belvedere</p>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={t.id === value}
                className={'theme-option' + (t.id === value ? ' on' : '')}
                onClick={() => onChange(t.id)}
              >
                <Logo themeId={t.id} size={56} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
