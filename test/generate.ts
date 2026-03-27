import { bitmapFontGenerator } from '../src/index.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fontPath = join(__dirname, 'web/public/fonts/HYWenHei-55W.ttf');
const outputDir = join(__dirname, 'web/public/fonts/HYWenHei');

console.log('Starting bitmap font generation...');
console.log(`Font: ${fontPath}`);
console.log(`Output: ${outputDir}`);

const manifest = await bitmapFontGenerator({
  fontPath,
  outputDir,
  fontName: 'HYWenHei',
  fontSize: 32,
  padding: 0,
  resolution: 2,
});

console.log(`\nGeneration complete!`);
console.log(`Font: ${manifest.fontName}`);
console.log(`Size: ${manifest.fontSize}px, lineHeight: ${manifest.lineHeight}px`);
console.log(`Generated ${manifest.subsets.length} subsets`);
console.log(
  `Total characters: ${manifest.subsets.reduce((sum, s) => sum + s.chars.length, 0)}`,
);
