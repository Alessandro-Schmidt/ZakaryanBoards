export const FONTS = [
  'Cormorant Garamond',
  'Playfair Display',
  'Great Vibes',
  'Dancing Script',
  'Inter',
  'Montserrat',
  'Bebas Neue',
];

let ready: Promise<void> | null = null;

/** Canvas text only renders a web font once it has been loaded, so force-load them all. */
export function loadFonts() {
  ready ??= Promise.all(
    FONTS.flatMap((f) => [
      document.fonts.load(`400 32px "${f}"`),
      document.fonts.load(`700 32px "${f}"`),
      document.fonts.load(`italic 400 32px "${f}"`),
    ]),
  ).then(() => undefined, () => undefined);
  return ready;
}
