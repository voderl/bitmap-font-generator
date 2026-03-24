import { loadSync as opentypeLoad } from 'opentype.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, basename, extname } from 'path';
import { getCharsets } from './charset.js';
import { registerFont, renderSpriteSheets } from './sprite.js';
import { writeFntFile } from './fnt.js';
import type { GeneratorOptions, FontManifest, FontMetrics, SubsetManifest } from './types.js';

export { parseFnt } from './fnt.js';
export type { GeneratorOptions, FontManifest, SubsetManifest, FontMetrics, CharData, PageData } from './types.js';

/**
 * Generates bitmap font sprite sheets and .fnt files from a TTF/OTF font.
 *
 * Each output subset corresponds to one entry in the Google Fonts unicode-range list.
 * Only subsets that contain at least one character present in the font are generated.
 *
 * Output files:
 *   {fontName}_manifest.json       — subset index and code point mapping
 *   {fontName}_{i}.fnt             — BMFont text-format descriptor for subset i
 *   {fontName}_{i}_{page}.png      — sprite sheet for subset i, page
 */
export async function bitmapFontGenerator(options: GeneratorOptions): Promise<FontManifest> {
  const { fontPath, outputDir } = options;
  const fontSize = options.fontSize ?? 32;
  const pageSize = options.pageSize ?? 1024;
  const padding = options.padding ?? 1;

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Load font with opentype.js for metrics and glyph availability
  console.log(`[bitmap-font-generator] Loading font: ${fontPath}`);
  const font = opentypeLoad(fontPath);

  // Determine font name
  const fontName =
    options.fontName ??
    (font.names.fontFamily as Record<string, string> | undefined)?.en ??
    basename(fontPath, extname(fontPath));

  // Register font for canvas rendering
  registerFont(fontPath, fontName);

  // Get font metrics
  const unitsPerEm = font.unitsPerEm;
  const scale = fontSize / unitsPerEm;
  const ascender = Math.ceil(font.ascender * scale);
  const descender = Math.ceil(Math.abs(font.descender * scale));
  const lineHeight = ascender + descender;
  const base = ascender;

  const metrics: FontMetrics = { fontName, fontSize, lineHeight, base };

  console.log(
    `[bitmap-font-generator] Font: "${fontName}", size: ${fontSize}px, lineHeight: ${lineHeight}, base: ${base}`,
  );

  // Build set of codepoints available in the font
  const cmap = font.tables.cmap as { glyphIndexMap?: Record<string, number> } | undefined;
  const glyphIndexMap = cmap?.glyphIndexMap ?? {};
  const availableCPs = new Set(Object.keys(glyphIndexMap).map(Number));
  console.log(`[bitmap-font-generator] Font has ${availableCPs.size} glyphs`);

  // Process each charset subset
  const charsets = getCharsets();
  const manifest: FontManifest = { fontName, fontSize, lineHeight, base, subsets: [] };
  let generatedCount = 0;

  for (let i = 0; i < charsets.length; i++) {
    const range = charsets[i];
    // Intersect subset with available font glyphs
    const chars = range.unicodes.filter((cp) => availableCPs.has(cp));
    if (chars.length === 0) continue;

    const prefix = `${fontName}_${i}`;
    process.stdout.write(`[bitmap-font-generator] Subset ${i}: ${chars.length} chars... `);

    // Render sprite sheet(s)
    const pages = await renderSpriteSheets({
      ...metrics,
      codePoints: chars,
      pageSize,
      padding,
      outputDir,
      prefix,
    });

    // Write .fnt file
    const fntFilename = `${prefix}.fnt`;
    writeFntFile(pages, metrics, outputDir, fntFilename);

    const subsetManifest: SubsetManifest = {
      id: i,
      codePoints: chars,
      fnt: fntFilename,
      pages: pages.map((p) => p.filename),
    };
    manifest.subsets.push(subsetManifest);
    generatedCount++;
    console.log(`done (${pages.length} page${pages.length > 1 ? 's' : ''})`);
  }

  // Write manifest
  const manifestPath = join(outputDir, `${fontName}_manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `[bitmap-font-generator] Done! Generated ${generatedCount} subsets → ${manifestPath}`,
  );

  return manifest;
}
