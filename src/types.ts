export interface GeneratorOptions {
  /** Path to the TTF/OTF font file */
  fontPath: string;
  /** Output directory for generated files */
  outputDir: string;
  /** Font name used in .fnt files and manifest (defaults to font family from file) */
  fontName?: string;
  /** Base font size in pixels for sprite rendering (default: 32) */
  fontSize?: number;
  /** Sprite sheet size in pixels - width and height (default: 1024) */
  pageSize?: number;
  /** Padding around each character in pixels (default: 1) */
  padding?: number;
}

export interface CharData {
  /** Unicode code point */
  id: number;
  /** X position in sprite sheet */
  x: number;
  /** Y position in sprite sheet */
  y: number;
  /** Width of the character bitmap */
  width: number;
  /** Height of the character bitmap */
  height: number;
  /** Horizontal offset when rendering */
  xoffset: number;
  /** Vertical offset from top of line when rendering */
  yoffset: number;
  /** How much to advance X after this character */
  xadvance: number;
  /** Which page (sprite sheet) this character is on */
  page: number;
}

export interface PageData {
  id: number;
  /** Filename of the PNG sprite sheet */
  filename: string;
  /** Width of the sprite sheet in pixels */
  width: number;
  /** Height of the sprite sheet in pixels */
  height: number;
  chars: CharData[];
}

export interface FontMetrics {
  fontName: string;
  fontSize: number;
  /** Total line height in pixels */
  lineHeight: number;
  /** Distance from top of line to baseline */
  base: number;
}

export interface SubsetManifest {
  /** Index of this subset in the google-fonts unicode range list */
  id: number;
  /** Unicode code points included in this subset */
  codePoints: number[];
  /** Relative path to the .fnt file */
  fnt: string;
  /** Relative paths to PNG sprite sheet pages */
  pages: string[];
}

export interface FontManifest {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  subsets: SubsetManifest[];
}
