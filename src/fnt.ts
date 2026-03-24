import { writeFileSync } from 'fs';
import { join } from 'path';
import type { CharData, PageData, FontMetrics } from './types.js';

/**
 * Writes a BMFont text-format .fnt file for a subset.
 */
export function writeFntFile(
  pages: PageData[],
  metrics: FontMetrics,
  outputDir: string,
  fntFilename: string,
): void {
  const { fontName, fontSize, lineHeight, base } = metrics;

  const allChars = pages.flatMap((p) => p.chars);
  const allPages = pages;

  // Use actual texture dimensions from the first page
  const pageW = pages[0]?.width ?? 1024;
  const pageH = pages[0]?.height ?? 1024;

  const lines: string[] = [];

  lines.push(
    `info face="${fontName}" size=${fontSize} bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1 outline=0`,
  );
  lines.push(
    `common lineHeight=${lineHeight} base=${base} scaleW=${pageW} scaleH=${pageH} pages=${allPages.length} packed=0 alphaChnl=0 redChnl=0 greenChnl=0 blueChnl=0`,
  );

  for (const page of allPages) {
    lines.push(`page id=${page.id} file="${page.filename}"`);
  }

  lines.push(`chars count=${allChars.length}`);

  for (const ch of allChars) {
    lines.push(
      `char id=${ch.id}   x=${ch.x}   y=${ch.y}   width=${ch.width}   height=${ch.height}   xoffset=${ch.xoffset}   yoffset=${ch.yoffset}   xadvance=${ch.xadvance}   page=${ch.page}   chnl=15`,
    );
  }

  lines.push('kernings count=0');

  writeFileSync(join(outputDir, fntFilename), lines.join('\n') + '\n');
}

/** Parses a BMFont text-format .fnt string into structured data. */
export interface ParsedFnt {
  fontName: string;
  fontSize: number;
  lineHeight: number;
  base: number;
  pages: { id: number; file: string }[];
  chars: CharData[];
}

export function parseFnt(content: string): ParsedFnt {
  const lines = content.split('\n');
  const result: ParsedFnt = {
    fontName: '',
    fontSize: 0,
    lineHeight: 0,
    base: 0,
    pages: [],
    chars: [],
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('info ')) {
      result.fontName = extractString(line, 'face') ?? '';
      result.fontSize = extractNumber(line, 'size') ?? 0;
    } else if (line.startsWith('common ')) {
      result.lineHeight = extractNumber(line, 'lineHeight') ?? 0;
      result.base = extractNumber(line, 'base') ?? 0;
    } else if (line.startsWith('page ')) {
      result.pages.push({
        id: extractNumber(line, 'id') ?? 0,
        file: extractString(line, 'file') ?? '',
      });
    } else if (line.startsWith('char ')) {
      result.chars.push({
        id: extractNumber(line, 'id') ?? 0,
        x: extractNumber(line, 'x') ?? 0,
        y: extractNumber(line, 'y') ?? 0,
        width: extractNumber(line, 'width') ?? 0,
        height: extractNumber(line, 'height') ?? 0,
        xoffset: extractNumber(line, 'xoffset') ?? 0,
        yoffset: extractNumber(line, 'yoffset') ?? 0,
        xadvance: extractNumber(line, 'xadvance') ?? 0,
        page: extractNumber(line, 'page') ?? 0,
      });
    }
  }

  return result;
}

function extractNumber(line: string, key: string): number | null {
  const match = new RegExp(`\\b${key}=(-?\\d+)`).exec(line);
  return match ? parseInt(match[1], 10) : null;
}

function extractString(line: string, key: string): string | null {
  // Handles both quoted and unquoted values
  const quoted = new RegExp(`\\b${key}="([^"]*)"`).exec(line);
  if (quoted) return quoted[1];
  const unquoted = new RegExp(`\\b${key}=(\\S+)`).exec(line);
  return unquoted ? unquoted[1] : null;
}
