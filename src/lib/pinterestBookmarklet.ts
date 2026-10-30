/**
 * Runs on pinterest.com when the user clicks the "Belvedere" bookmark. Pinterest covers its images with
 * overlays and blocks dragging; this takes over every drag that starts on a pin and hands the drop target
 * the full-size image URL instead of the pin's page link.
 */
function enablePinterestDrag() {
  const w = window as unknown as { __belvedere?: boolean };
  const toast = (msg: string) => {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;' +
      'border-radius:999px;background:#0a0c1a;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  };
  if (w.__belvedere) return toast('Belvedere: dragging is already on. Drag any pin into your board.');
  w.__belvedere = true;

  const best = (img: HTMLImageElement) => {
    let url = img.currentSrc || img.src;
    let size = 0;
    for (const part of (img.getAttribute('srcset') ?? '').split(',')) {
      const [u, d] = part.trim().split(/\s+/);
      const n = parseFloat(d ?? '') || 1;
      if (u && n > size) {
        size = n;
        url = u;
      }
    }
    return url;
  };
  const imageAt = (e: DragEvent) => {
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      if (el instanceof HTMLImageElement && el.naturalWidth > 60) return el;
    }
    const t = e.target instanceof Element ? e.target : null;
    const box = t?.closest('[data-test-id="pin"], [data-grid-item], a[href*="/pin/"]') ?? t;
    return box?.querySelector('img') ?? null;
  };

  document.addEventListener(
    'dragstart',
    (e) => {
      const img = imageAt(e);
      if (!img || !e.dataTransfer) return;
      e.stopImmediatePropagation();
      const url = best(img);
      e.dataTransfer.clearData();
      e.dataTransfer.setData('text/uri-list', url);
      e.dataTransfer.setData('text/plain', url);
      e.dataTransfer.setData('text/html', `<img src="${url}">`);
      e.dataTransfer.effectAllowed = 'copy';
    },
    true,
  );
  // Pinterest marks its images and links as not draggable; undo that, now and as more pins load.
  const unlock = () =>
    document.querySelectorAll('[draggable="false"], img').forEach((n) => n.setAttribute('draggable', 'true'));
  unlock();
  setInterval(unlock, 1500);
  toast('Belvedere: dragging is on. Drag any pin into your board.');
}

export const PINTEREST_BOOKMARKLET = `javascript:${encodeURIComponent(`(${enablePinterestDrag.toString()})()`)}`;
