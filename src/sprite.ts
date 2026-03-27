import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';
import { renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CharData, PageData, FontMetrics } from './types.js';

interface RenderOptions extends FontMetrics {
  codePoints: number[];
  maxPageSize: number;
  padding: number;
  outputDir: string;
  prefix: string;
  pngCompression: number;
}

const AUTO_PAGE_SIZES = [128, 256, 512, 1024, 2048] as const;

/**
 * Registers a font file for use with @napi-rs/canvas
 */
export function registerFont(fontPath: string, fontName: string): void {
  const loaded = GlobalFonts.registerFromPath(fontPath, fontName);
  if (!loaded) {
    throw new Error(`Failed to register font from ${fontPath}`);
  }
}

/**
 * Renders character sprite sheets for a set of unicode code points.
 * Returns an array of PageData describing each generated PNG file.
 */
export async function renderSpriteSheets(options: RenderOptions): Promise<PageData[]> {
  const { fontName, fontSize, lineHeight, base, codePoints, maxPageSize, padding, outputDir, prefix, pngCompression } = options;

  const pages: PageData[] = [];
  let pageId = 0;

  // Measure all characters first to determine cell widths
  // Use a temporary canvas to measure
  const measureCanvas = createCanvas(128, 128);
  const measureCtx = measureCanvas.getContext('2d');
  setupContext(measureCtx, fontName, fontSize);

  // Pre-measure all characters
  const measurements = new Map<number, number>(); // codePoint → advance width
  for (const cp of codePoints) {
    const char = safeFromCodePoint(cp);
    if (!char) continue;
    const metrics = measureCtx.measureText(char);
    measurements.set(cp, Math.max(1, Math.ceil(metrics.width)));
  }

  const cellWidths = codePoints.flatMap((cp) => {
    const charWidth = measurements.get(cp);
    return charWidth === undefined ? [] : [charWidth + padding * 2];
  });
  const cellHeight = lineHeight + padding * 2;
  const pageSize = selectPageSize(cellWidths, cellHeight, padding, maxPageSize);

  // Create first page canvas
  let x = padding;
  let y = padding;
  let canvas = createCanvas(pageSize, pageSize);
  let ctx = canvas.getContext('2d');
  setupContext(ctx, fontName, fontSize);
  let pageChars: CharData[] = [];
  const baseFilename = `${prefix}.png`;
  const firstIndexedFilename = `${prefix}_0.png`;

  const flushPage = async () => {
    if (pageChars.length === 0) return;
    if (pageId > 0 && pages.length === 1 && pages[0].filename === baseFilename) {
      renameSync(join(outputDir, baseFilename), join(outputDir, firstIndexedFilename));
      pages[0].filename = firstIndexedFilename;
    }

    const filename = pageId === 0 ? baseFilename : `${prefix}_${pageId}.png`;
    // Crop to actual used height to avoid wasting space.
    const usedHeight = Math.min(y + (lineHeight + padding * 2) + padding, pageSize);
    const croppedCanvas = createCanvas(pageSize, usedHeight);
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(canvas, 0, 0);

    const rawBuffer = croppedCanvas.toBuffer('image/png');
    const buffer = await compressPng(rawBuffer, pngCompression);
    writeFileSync(join(outputDir, filename), buffer);
    pages.push({ id: pageId, filename, width: pageSize, height: usedHeight, chars: pageChars });
    pageId++;
    pageChars = [];
    x = padding;
    y = padding;
    canvas = createCanvas(pageSize, pageSize);
    ctx = canvas.getContext('2d');
    setupContext(ctx, fontName, fontSize);
  };

  for (const cp of codePoints) {
    const char = safeFromCodePoint(cp);
    if (!char) continue;
    const charWidth = measurements.get(cp) ?? fontSize;
    const cellWidth = charWidth + padding * 2;
    const cellHeight = lineHeight + padding * 2;

    // Move to next row if needed
    if (x + cellWidth > pageSize - padding) {
      x = padding;
      y += cellHeight;
    }

    // Start new page if needed
    if (y + cellHeight > pageSize - padding) {
      await flushPage();
    }

    // Render character: text baseline is at y + padding + base
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, x, y + padding + base);

    pageChars.push({
      id: cp,
      x: x,
      y: y + padding,
      width: charWidth,
      height: lineHeight,
      xoffset: 0,
      yoffset: 0,
      xadvance: charWidth,
      page: pageId,
    });

    x += cellWidth;
  }

  await flushPage();
  return pages;
}

function selectPageSize(cellWidths: number[], cellHeight: number, padding: number, maxPageSize: number): number {
  const normalizedMax = normalizeMaxPageSize(maxPageSize);

  if (cellWidths.length === 0) return AUTO_PAGE_SIZES[0];

  for (const size of AUTO_PAGE_SIZES) {
    if (size > normalizedMax) break;
    if (fitsOnSinglePage(cellWidths, cellHeight, size, padding)) return size;
  }

  return normalizedMax;
}

function normalizeMaxPageSize(maxPageSize: number): number {
  const clamped = Math.max(AUTO_PAGE_SIZES[0], Math.min(AUTO_PAGE_SIZES[AUTO_PAGE_SIZES.length - 1], Math.ceil(maxPageSize)));

  for (const size of AUTO_PAGE_SIZES) {
    if (clamped <= size) return size;
  }

  return AUTO_PAGE_SIZES[AUTO_PAGE_SIZES.length - 1];
}

function fitsOnSinglePage(cellWidths: number[], cellHeight: number, pageSize: number, padding: number): boolean {
  let x = padding;
  let y = padding;

  for (const cellWidth of cellWidths) {
    if (x + cellWidth > pageSize - padding) {
      x = padding;
      y += cellHeight;
    }

    if (y + cellHeight > pageSize - padding) return false;
    x += cellWidth;
  }

  return true;
}

async function compressPng(input: Buffer, compressionLevel: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(input)
    .png({ palette: true, colors: 4, compressionLevel })
    .toBuffer();
}

function setupContext(ctx: SKRSContext2D, fontName: string, fontSize: number): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = `${fontSize}px "${fontName}"`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  // antialias is set via canvas creation options, not context property
}

function safeFromCodePoint(cp: number): string | null {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return null;
  }
}
