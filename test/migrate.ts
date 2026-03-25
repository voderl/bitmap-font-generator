/**
 * Migrates old font files (per-subset .fnt + flat manifest) to new format
 * (single manifest.json with inline char metrics, placed in fontName subdir).
 *
 * Old: test/web/public/fonts/HYWenHei_manifest.json + HYWenHei_*.fnt + HYWenHei_*_*.png
 * New: test/web/public/fonts/HYWenHei/manifest.json  + ../HYWenHei_*_*.png (PNGs stay put)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, 'web/public/fonts');
const newDir = join(fontsDir, 'HYWenHei');
mkdirSync(newDir, { recursive: true });

interface OldSubset { id: number; fnt: string; pages: string[]; codePoints: number[] }
interface OldManifest { fontName: string; fontSize: number; lineHeight: number; base: number; subsets: OldSubset[] }

const old = JSON.parse(readFileSync(join(fontsDir, 'HYWenHei_manifest.json'), 'utf-8')) as OldManifest;

function parseFntChars(content: string) {
  const chars = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('char ')) continue;
    const f: Record<string, string> = {};
    for (const part of line.trim().split(/\s+/).slice(1)) {
      const eq = part.indexOf('=');
      if (eq !== -1) f[part.slice(0, eq)] = part.slice(eq + 1);
    }
    if (f['id']) {
      chars.push({
        id: +f['id'], x: +f['x'], y: +f['y'],
        w: +f['width'], h: +f['height'],
        ox: +f['xoffset'], oy: +f['yoffset'],
        adv: +f['xadvance'], page: +f['page'],
      });
    }
  }
  return chars;
}

const newManifest = {
  fontName: old.fontName,
  fontSize: old.fontSize,
  lineHeight: old.lineHeight,
  base: old.base,
  subsets: old.subsets.map(subset => ({
    id: subset.id,
    // PNGs stay in parent dir — reference with ../
    pngs: subset.pages.map(p => '../' + p),
    chars: parseFntChars(readFileSync(join(fontsDir, subset.fnt), 'utf-8')),
  })),
};

const outPath = join(newDir, 'manifest.json');
writeFileSync(outPath, JSON.stringify(newManifest));

const totalChars = newManifest.subsets.reduce((s, sub) => s + sub.chars.length, 0);
console.log(`Migrated ${newManifest.subsets.length} subsets, ${totalChars} chars → ${outPath}`);
