import { useEffect, useRef } from 'react';
import { drawLogo } from '../lib/logo';
import { themeById } from '../theme';

/** The app icon for a given theme, drawn sharp at the screen's pixel density. */
export function Logo({ themeId, size = 40 }: { themeId: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const px = Math.round(size * (window.devicePixelRatio || 1));
    c.width = c.height = px;
    const draw = () => drawLogo(c.getContext('2d')!, px, themeById(themeId));
    draw();
    // Redraw once the webfont arrives, otherwise the first paint keeps the fallback serif.
    document.fonts.load(`italic 500 ${px}px "Bodoni Moda"`).then(draw, () => {});
  }, [themeId, size]);
  return <canvas ref={ref} className="logo" style={{ width: size, height: size }} aria-hidden />;
}
