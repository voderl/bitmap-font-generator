// Bundled at build time — no runtime file reading needed
import charsetData from './data/google-font-unicode-range.json';

export interface CharsetRange {
  subset: string;
  unicodes: number[];
}

export function getCharsets(): CharsetRange[] {
  return charsetData as CharsetRange[];
}

/** Returns the set of all unicode code points defined across all subsets */
export function getAllSubsetCodepoints(): Set<number> {
  const all = new Set<number>();
  for (const range of getCharsets()) {
    for (const cp of range.unicodes) all.add(cp);
  }
  return all;
}
