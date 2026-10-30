import { useEffect, useRef } from 'react';
import { PINTEREST_BOOKMARKLET } from '../lib/pinterestBookmarklet';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { savedThemeId } from '../theme';

export function PinterestHelp({ onClose }: { onClose(): void }) {
  const link = useRef<HTMLAnchorElement>(null);
  // React refuses javascript: URLs in JSX, so the bookmarklet is set on the element directly.
  useEffect(() => link.current?.setAttribute('href', PINTEREST_BOOKMARKLET), []);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glass modal pinterest-help">
        <header className="modal-header">
          <h2>Drag from Pinterest</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="modal-body">
          <p className="muted">
            Pinterest blocks dragging its images. This button switches that off on Pinterest, so you can drag any pin
            straight into your board at full size. You set it up once.
          </p>
          <ol className="steps">
            <li>
              <span>Drag this button to your bookmarks bar.</span>
              <a ref={link} className="bookmarklet" onClick={(e) => e.preventDefault()} title="Drag me to your bookmarks bar">
                <Logo themeId={savedThemeId()} size={22} /> Belvedere
              </a>
              <span className="muted small">No bookmarks bar? Show it with <kbd>⇧⌘B</kbd> (Mac) or <kbd>Ctrl ⇧ B</kbd> (Windows).</span>
            </li>
            <li><span>On Pinterest, click <strong>Belvedere</strong> in your bookmarks bar. A message confirms it's on.</span></li>
            <li><span>Drag any pin into this window. Click the bookmark again after reloading Pinterest.</span></li>
          </ol>
          <p className="note">
            You can also paste a pin's link here with <kbd>⌘V</kbd> / <kbd>Ctrl V</kbd>, or right-click an image →
            <em> Copy image</em> and paste it.
          </p>
        </div>
      </div>
    </div>
  );
}
