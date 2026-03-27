export interface GeneratorOptions {
  /** Path to the TTF/OTF font file */
  fontPath: string;
  /** Output directory for generated files */
  outputDir: string;
  /** Font name used in manifest (defaults to font family from file) */
  fontName?: string;
  /** Base font size in pixels for sprite rendering (default: 32) */
  fontSize?: number;
  /** Maximum sprite sheet size in pixels; actual pages auto-select 128/256/512/1024/2048 up to this limit (default: 2048) */
  pageSize?: number;
  /** Padding around each character in pixels (default: 0) */
  padding?: number;
  /** zlib compression level 0-9 (default: 9) */
  pngCompression?: number;
  /** Pixel density multiplier for HiDPI. fontSize and pageSize are multiplied by this value. (default: 1) */
  resolution?: number;
}

export interface CharData {
  /** Unicode code point */
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  /** Page index within this subset's PNG array */
  page: number;
}

export interface PageData {
  id: number;
  filename: string;
  width: number;
  height: number;
  chars: CharData[];
}

export interface FontMetrics {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
}

/** Compact char entry written into manifest.json */
export interface CharEntry {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ox: number;
  oy: number;
  adv: number;
  /** Page index within this subset's pngs array. Generated manifests currently write 0. */
  page: number;
}

export interface SubsetManifest {
  id: number;
  /** Generated manifests currently write exactly one png per subset. */
  pngs: string[];
  chars: CharEntry[];
}

export interface FontManifest {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  /** Pixel density multiplier (1 = standard, 2 = HiDPI). Char metrics are in logical pixels. */
  resolution: number;
  subsets: SubsetManifest[];
}
