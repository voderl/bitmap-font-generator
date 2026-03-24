export interface SubsetManifest {
  id: number;
  codePoints: number[];
  fnt: string;
  pages: string[];
}

export interface FontManifest {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  subsets: SubsetManifest[];
}

export interface ParsedFnt {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  pages: { id: number; file: string }[];
  chars: FntChar[];
}

export interface FntChar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  page: number;
}
