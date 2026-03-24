import type { ParsedFnt, FntChar } from './types.js';

/** Parses a BMFont text-format .fnt string. */
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
      } satisfies FntChar);
    }
  }

  return result;
}

function extractNumber(line: string, key: string): number | null {
  const match = new RegExp(`\\b${key}=(-?\\d+)`).exec(line);
  return match ? parseInt(match[1], 10) : null;
}

function extractString(line: string, key: string): string | null {
  const quoted = new RegExp(`\\b${key}="([^"]*)"`).exec(line);
  if (quoted) return quoted[1];
  const unquoted = new RegExp(`\\b${key}=(\\S+)`).exec(line);
  return unquoted ? unquoted[1] : null;
}
