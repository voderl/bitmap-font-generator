export interface CharMetrics {
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
  chars: CharMetrics[];
}

export interface FontManifest {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  /** 1 = standard, 2 = HiDPI. Char metrics are in logical pixels; textures are resolution× larger. */
  resolution: number;
  subsets: SubsetManifest[];
}
