export type Unit = 'mm' | 'px';

export interface BoardFormat {
  id: string;
  label: string;
  group: 'print' | 'screen' | 'custom';
  unit: Unit;
  /** Natural size (portrait for paper, native orientation for screens). */
  w: number;
  h: number;
}

interface BaseElement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  shadow: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
  width: number;
  height: number;
  cornerRadius: number;
  flipX: boolean;
}

export type FontStyle = 'normal' | 'bold' | 'italic' | 'bold italic';

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  width: number;
  fontFamily: string;
  fontSize: number;
  fontStyle: FontStyle;
  fill: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
}

export type BoardElement = ImageElement | TextElement;

export interface Board {
  id: string;
  name: string;
  formatId: string;
  unit: Unit;
  /** Page size in `unit`, already oriented. */
  width: number;
  height: number;
  background: string;
  elements: BoardElement[];
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
}

export interface Asset {
  id: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: number;
  /** Set when this asset was produced by editing another one. */
  parentId?: string;
}
