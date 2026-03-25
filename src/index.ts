import { loadSync as opentypeLoad } from 'opentype.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { getCharsets } from './charset.js';
import { registerFont, renderSpriteSheets } from './sprite.js';
import type { GeneratorOptions, FontManifest, FontMetrics, SubsetManifest } from './types.js';

export type { GeneratorOptions, FontManifest, SubsetManifest, FontMetrics, CharData, PageData, CharEntry } from './types.js';

/**
 * Generates bitmap font sprite sheets from a TTF/OTF font.
 *
 * Output files (written to outputDir/):
 *   manifest.json           — char metrics + subset index, loaded by BitmapFontManager
 *   {fontName}_{i}_{p}.webp — sprite sheet for subset i, page p
 */
export async function bitmapFontGenerator(options: GeneratorOptions): Promise<FontManifest> {
  const { fontPath, outputDir } = options;
  const fontSize = options.fontSize ?? 32;
  const pageSize = options.pageSize ?? 1024;
  const padding = options.padding ?? 1;
  const pngCompression = options.pngCompression ?? 9;
  const resolution = options.resolution ?? 1;

  mkdirSync(outputDir, { recursive: true });

  console.log(`[bitmap-font-generator] Loading font: ${fontPath}`);
  const font = opentypeLoad(fontPath);

  const fontName =
    options.fontName ??
    (font.names.fontFamily as Record<string, string> | undefined)?.en ??
    basename(fontPath, extname(fontPath));

  registerFont(fontPath, fontName);

  const unitsPerEm = font.unitsPerEm;
  // Render at physical size (fontSize * resolution), store logical metrics (÷ resolution)
  const physicalFontSize = fontSize * resolution;
  const scale = physicalFontSize / unitsPerEm;
  const ascender = Math.ceil(font.ascender * scale);
  const descender = Math.ceil(Math.abs(font.descender * scale));
  const physicalLineHeight = ascender + descender;
  const physicalBase = ascender;
  const lineHeight = physicalLineHeight / resolution;
  const base = physicalBase / resolution;

  const metrics: FontMetrics = { fontName, fontSize: physicalFontSize, lineHeight: physicalLineHeight, base: physicalBase };

  console.log(
    `[bitmap-font-generator] Font: "${fontName}", size: ${fontSize}px, lineHeight: ${lineHeight}, base: ${base}`,
  );

  const cmap = font.tables.cmap as { glyphIndexMap?: Record<string, number> } | undefined;
  const availableCPs = new Set(Object.keys(cmap?.glyphIndexMap ?? {}).map(Number));
  console.log(`[bitmap-font-generator] Font has ${availableCPs.size} glyphs`);

  const charsets = getCharsets();
  const manifest: FontManifest = { fontName, fontSize, lineHeight, base, resolution, subsets: [] };
  let generatedCount = 0;

  for (let i = 0; i < charsets.length; i++) {
    const range = charsets[i];
    const chars = range.unicodes.filter((cp) => availableCPs.has(cp));
    if (chars.length === 0) continue;

    const prefix = `${fontName}_${i}`;
    process.stdout.write(`[bitmap-font-generator] Subset ${i}: ${chars.length} chars... `);

    const pages = await renderSpriteSheets({
      ...metrics,
      codePoints: chars,
      pageSize: pageSize * resolution,
      padding,
      outputDir,
      prefix,
      pngCompression,
    });

    const subsetManifest: SubsetManifest = {
      id: i,
      pngs: pages.map((p) => p.filename),
      chars: pages.flatMap((p) =>
        p.chars.map((ch) => ({
          id: ch.id,
          x: ch.x,
          y: ch.y,
          w: ch.width,
          h: ch.height,
          ox: ch.xoffset / resolution,
          oy: ch.yoffset / resolution,
          adv: ch.xadvance / resolution,
          page: ch.page,
        })),
      ),
    };
    manifest.subsets.push(subsetManifest);
    generatedCount++;
    console.log(`done (${pages.length} page${pages.length > 1 ? 's' : ''})`);
  }

  const manifestPath = join(outputDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(
    `[bitmap-font-generator] Done! Generated ${generatedCount} subsets → ${manifestPath}`,
  );

  return manifest;
}
