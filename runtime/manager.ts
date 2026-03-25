import type { FontManifest, SubsetManifest, CharMetrics } from './types.js';

interface AccChar extends CharMetrics {
  globalPage: number;
}

class FontHandle {
  readonly fontName: string;
  private readonly baseUrl: string;
  private readonly manifest: FontManifest;
  private readonly cpToSubset = new Map<number, number>();
  private readonly loadedSubsets = new Set<number>();
  private readonly pendingLoads = new Map<number, Promise<void>>();
  private nextGlobalPage = 0;
  private accTextures: import('pixi.js').Texture[] = [];
  private accChars: AccChar[] = [];

  constructor(baseUrl: string, manifest: FontManifest) {
    this.fontName = manifest.fontName;
    this.baseUrl = baseUrl;
    this.manifest = manifest;
    for (const subset of manifest.subsets) {
      for (const ch of subset.chars) {
        this.cpToSubset.set(ch.id, subset.id);
      }
    }
  }

  async load(text: string): Promise<void> {
    const needed = this.getNeededSubsetIds(text);
    const toLoad = needed.filter((id) => !this.loadedSubsets.has(id));
    if (toLoad.length === 0) return;
    await Promise.all(toLoad.map((id) => this.loadSubset(id)));
    await this.installFont();
  }

  private getNeededSubsetIds(text: string): number[] {
    const ids = new Set<number>();
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp !== undefined) {
        const id = this.cpToSubset.get(cp);
        if (id !== undefined) ids.add(id);
      }
    }
    return Array.from(ids);
  }

  private loadSubset(id: number): Promise<void> {
    if (this.pendingLoads.has(id)) return this.pendingLoads.get(id)!;
    const subset = this.manifest.subsets.find((s) => s.id === id);
    if (!subset) return Promise.resolve();
    const p = this.doLoadSubset(subset).finally(() => this.pendingLoads.delete(id));
    this.pendingLoads.set(id, p);
    return p;
  }

  private async doLoadSubset(subset: SubsetManifest): Promise<void> {
    const { Assets } = await import('pixi.js');
    const pageRemap = new Map<number, number>();
    for (let i = 0; i < subset.pngs.length; i++) {
      const globalId = this.nextGlobalPage++;
      pageRemap.set(i, globalId);
      const tex = await Assets.load<import('pixi.js').Texture>(this.resolve(subset.pngs[i]));
      if (this.manifest.resolution !== 1) {
        // setResolution() properly updates baseTexture.width (logical = physical / resolution)
        // so UV coords are computed correctly against the logical width.
        tex.baseTexture.setResolution(this.manifest.resolution);
      }
      this.accTextures[globalId] = tex;
    }
    for (const ch of subset.chars) {
      this.accChars.push({ ...ch, globalPage: pageRemap.get(ch.page) ?? ch.page });
    }
    this.loadedSubsets.add(subset.id);
  }

  private async installFont(): Promise<void> {
    const { BitmapFont, BitmapFontData } = await import('pixi.js');
    const manifest = this.manifest;

    // Compact sparse texture array: concurrent loads pre-allocate globalIds
    // before their textures arrive, leaving holes that cause PixiJS to crash.
    const textures: import('pixi.js').Texture[] = [];
    const oldToNew = new Map<number, number>();
    for (let i = 0; i < this.accTextures.length; i++) {
      if (this.accTextures[i] !== undefined) {
        oldToNew.set(i, textures.length);
        textures.push(this.accTextures[i]);
      }
    }

    const fontData = new BitmapFontData();
    const res = manifest.resolution;
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
        // x/y/w/h are physical pixels in the texture; divide by resolution so PixiJS
        // gets logical coordinates (UV = logical/baseTexture.width which uses logical width).
        x: ch.x / res,
        y: ch.y / res,
        width: ch.w / res,
        height: ch.h / res,
        // ox/oy/adv are already in logical pixels (divided at generation time)
        xoffset: ch.ox,
        yoffset: ch.oy,
        xadvance: ch.adv,
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

export class BitmapFontManager {
  private static registry = new Map<string, FontHandle>();

  /**
   * Loads a bitmap font from a directory. Fetches `{dir}/manifest.json`.
   * Returns the font name, which is used as `fontName` in BitmapText / LazyBitmapText.
   */
  static async loadFont(dir: string): Promise<string> {
    const baseUrl = dir.endsWith('/') ? dir : dir + '/';
    const resp = await fetch(baseUrl + 'manifest.json');
    if (!resp.ok) {
      throw new Error(`Failed to load font: ${baseUrl}manifest.json (${resp.status})`);
    }
    const manifest = (await resp.json()) as FontManifest;
    this.registry.set(manifest.fontName, new FontHandle(baseUrl, manifest));
    return manifest.fontName;
  }

  /**
   * Ensures all characters in `text` are loaded for the given font.
   * Must call `loadFont()` first.
   */
  static async load(fontName: string, text: string): Promise<void> {
    const font = this.registry.get(fontName);
    if (!font) throw new Error(`Font "${fontName}" not loaded. Call BitmapFontManager.loadFont() first.`);
    await font.load(text);
  }
}

function safeFromCodePoint(cp: number): string {
  try { return String.fromCodePoint(cp); } catch { return '?'; }
}
