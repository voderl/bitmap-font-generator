import type { FontManifest, SubsetManifest, FntChar } from './types.js';
import { parseFnt } from './fntParser.js';

interface AccumulatedChar extends FntChar {
  /** Global page id (remapped across all loaded subsets) */
  globalPage: number;
}

/**
 * Manages lazy loading of bitmap font subsets and installation into PixiJS BitmapFont.
 *
 * Usage:
 * ```ts
 * const manager = new BitmapFontManager({ baseUrl: '/fonts/' });
 * await manager.loadManifest('HYWenHei_manifest.json');
 * await manager.ensureLoaded('你好世界');
 * const text = new BitmapText('你好世界', { fontName: 'HYWenHei', fontSize: 24 });
 * ```
 */
export class BitmapFontManager {
  private baseUrl: string;
  private manifest: FontManifest | null = null;

  /** Maps unicode code point → subset id */
  private cpToSubset = new Map<number, number>();
  /** Which subset ids have been fully loaded */
  private loadedSubsets = new Set<number>();
  /** Currently in-flight subset loads */
  private pendingLoads = new Map<number, Promise<void>>();

  /** Accumulated char data across all loaded subsets */
  private accChars: AccumulatedChar[] = [];
  /** Ordered texture array indexed by global page id */
  private accTextures: import('pixi.js').Texture[] = [];
  private nextGlobalPage = 0;

  constructor(options: { baseUrl: string }) {
    this.baseUrl = options.baseUrl.endsWith('/') ? options.baseUrl : options.baseUrl + '/';
  }

  /** Load the font manifest JSON file */
  async loadManifest(manifestPath: string): Promise<void> {
    const url = this.resolve(manifestPath);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load manifest: ${url} (${resp.status})`);
    this.manifest = (await resp.json()) as FontManifest;
    this.buildCpIndex();
  }

  private buildCpIndex(): void {
    if (!this.manifest) return;
    this.cpToSubset.clear();
    for (const subset of this.manifest.subsets) {
      for (const cp of subset.codePoints) {
        this.cpToSubset.set(cp, subset.id);
      }
    }
  }

  /** The font name to pass to PixiJS BitmapText's `fontName` option */
  get fontName(): string {
    return this.manifest?.fontName ?? '';
  }

  /**
   * Ensures all characters in `text` are loaded and registered in PixiJS.
   * Resolves when the BitmapFont is ready to render all the given characters.
   */
  async ensureLoaded(text: string): Promise<void> {
    if (!this.manifest) throw new Error('Call loadManifest() first');

    const needed = this.getNeededSubsetIds(text);
    const toLoad = needed.filter((id) => !this.loadedSubsets.has(id));
    if (toLoad.length === 0) return;

    await Promise.all(toLoad.map((id) => this.loadSubset(id)));
    await this.installFont();
  }

  /** Returns true if all characters in `text` are already loaded */
  isLoaded(text: string): boolean {
    if (!this.manifest) return false;
    return this.getNeededSubsetIds(text).every((id) => this.loadedSubsets.has(id));
  }

  private getNeededSubsetIds(text: string): number[] {
    const ids = new Set<number>();
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp === undefined) continue;
      const subsetId = this.cpToSubset.get(cp);
      if (subsetId !== undefined) ids.add(subsetId);
    }
    return Array.from(ids);
  }

  private loadSubset(subsetId: number): Promise<void> {
    if (this.pendingLoads.has(subsetId)) return this.pendingLoads.get(subsetId)!;

    const subset = this.manifest!.subsets.find((s) => s.id === subsetId);
    if (!subset) return Promise.resolve();

    const p = this.doLoadSubset(subset).finally(() => this.pendingLoads.delete(subsetId));
    this.pendingLoads.set(subsetId, p);
    return p;
  }

  private async doLoadSubset(subset: SubsetManifest): Promise<void> {
    const { Assets } = await import('pixi.js');

    // Fetch and parse the .fnt file
    const fntResp = await fetch(this.resolve(subset.fnt));
    if (!fntResp.ok) throw new Error(`Failed to load ${subset.fnt} (${fntResp.status})`);
    const parsed = parseFnt(await fntResp.text());

    // Load page textures, assigning global page ids
    const pageRemap = new Map<number, number>(); // local id → global id
    for (const page of parsed.pages) {
      const globalId = this.nextGlobalPage++;
      pageRemap.set(page.id, globalId);
      this.accTextures[globalId] = await Assets.load<import('pixi.js').Texture>(
        this.resolve(page.file),
      );
    }

    // Accumulate chars with global page ids
    for (const ch of parsed.chars) {
      this.accChars.push({ ...ch, globalPage: pageRemap.get(ch.page) ?? ch.page });
    }

    this.loadedSubsets.add(subset.id);
  }

  private async installFont(): Promise<void> {
    const { BitmapFont, BitmapFontData } = await import('pixi.js');
    const manifest = this.manifest!;

    // Compact the texture array: concurrent subset loads pre-allocate globalIds before
    // their textures arrive, leaving sparse holes. Filter to only defined textures and
    // remap char page references accordingly.
    const textures: import('pixi.js').Texture[] = [];
    const oldToNew = new Map<number, number>();
    for (let i = 0; i < this.accTextures.length; i++) {
      if (this.accTextures[i] !== undefined) {
        oldToNew.set(i, textures.length);
        textures.push(this.accTextures[i]);
      }
    }

    const fontData = new BitmapFontData();
    fontData.info = [{ face: manifest.fontName, size: manifest.fontSize }];
    fontData.common = [{ lineHeight: manifest.lineHeight }];
    fontData.distanceField = [];
    fontData.kerning = [];
    fontData.page = textures.map((_, i) => ({ id: i, file: `page_${i}.png` }));

    fontData.char = this.accChars
      .filter((ch) => oldToNew.has(ch.globalPage))
      .map((ch) => ({
        id: ch.id,
        page: oldToNew.get(ch.globalPage)!,
        x: ch.x,
        y: ch.y,
        width: ch.width,
        height: ch.height,
        xoffset: ch.xoffset,
        yoffset: ch.yoffset,
        xadvance: ch.xadvance,
        letter: safeFromCodePoint(ch.id),
        chnl: 15,
      }));

    BitmapFont.install(fontData, textures, false);
  }

  private resolve(path: string): string {
    if (/^https?:\/\/|^\//.test(path)) return path;
    return this.baseUrl + path;
  }
}

function safeFromCodePoint(cp: number): string {
  try { return String.fromCodePoint(cp); } catch { return '?'; }
}
