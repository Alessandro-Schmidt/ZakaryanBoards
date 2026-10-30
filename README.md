![Belvedere. Vision boards, made to print. A beautiful view of what's next.](docs/banner.png)

# Belvedere

A vision board editor made for **real printing** (A4, A3, posters) and for phone, iPad and desktop wallpapers. The look is inspired by Apple's Liquid Glass, with 8 colour themes to pick from under **Appearance**. Aurora is the default.

## What you can do

- **Real formats**: A4, A3, A5, Letter, 50×70 poster, 30×30 square, iPhone, Android, iPad, Desktop, Instagram 4:5, Stories 9:16 or a custom size (mm or px), in portrait or landscape.
- **Background colour** from a ready-made palette or any colour.
- **Drag images from another tab** (or from your computer) straight onto the page. They also go into the **Images** library, which is shared by all boards.
  - If a site blocks dragging, right-click → *Copy image* and paste with `⌘V` / `Ctrl+V`.
  - **Pinterest**: dragging a pin brings in the full-size image. Where Pinterest blocks the drag, open **Drag from Pinterest** in the Images panel and add the *Belvedere* button to your bookmarks bar once; clicking it on Pinterest makes every pin draggable. Pasting a pin's link also works.
- **Edit images** without losing the original (every edit becomes a new version):
  - **Crop**: free, or 1:1, 4:5, 3:4, 2:3, 3:2, 16:9, 9:16 and original.
  - **Lasso**: draw around just the object (say, only the car) to keep it or erase it.
  - **Remove background (AI)**: separates the object from its background automatically, right in the browser.
  - **Erase / Restore**: a brush to refine the cut-out.
- **Build the board**: move, resize, rotate (snapping to angles), snap to the centre and edges, layers, opacity, rounded corners, shadow, flip, fill the page, and text in elegant fonts.
- **Export**: PDF at the exact page size (150 or 300 dpi), PNG or JPG. The **Print** button opens a print-ready PDF.
- **Install as an app**: in Chrome or Edge, use *Install Belvedere* in the address bar; in Safari on Mac, *File → Add to Dock*; on iPhone, *Share → Add to Home Screen*. The icons live in `public/icons` and are generated with `node scripts/generate-icons.cjs`.
- **Gallery** with all your boards: open, rename, duplicate, delete. Everything saves automatically.
- **Make it fit**: one click lays out every image on the board in tidy rows that fill the page without overlapping, keeping each image's proportions and resizing them as needed. Texts stay where they are, and `⌘Z` undoes it.
- **Select several items**: drag on an empty spot to draw a selection box, or shift-click. Move them together, duplicate, delete or bring them forward as a group. `⌘A` selects everything.
- **Pinch to zoom**: pinching the trackpad zooms the board around your fingers, not the page.
- **Full canvas**: slide the images panel and the board settings away with the buttons at either end of the toolbar, or with `[` and `]`, and bring them back the same way.
- Undo/redo (`⌘Z` / `⇧⌘Z`), duplicate (`⌘D`), delete (`⌫`), nudge with the arrow keys (`⇧` = 10 px).

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Publishing (GitHub Pages)

The `.github/workflows/deploy.yml` workflow publishes the site on every push to `main`. To turn it on once: **Settings → Pages → Source: GitHub Actions**.

## Where your data lives

Boards and images are saved **in the browser** (IndexedDB) on the device where they were made. Nothing is sent to a server. Clearing the site's data deletes the boards.

## Tech

React + TypeScript + Vite, [Konva](https://konvajs.org/) for the canvas, [jsPDF](https://github.com/parallax/jsPDF) for PDFs and [@imgly/background-removal](https://github.com/imgly/background-removal-js) for background removal (the AI model is downloaded from IMG.LY's CDN on first use and then cached). Note: that library is AGPL-3.0. That's fine for personal use, but needs care if the project ever becomes a product.
