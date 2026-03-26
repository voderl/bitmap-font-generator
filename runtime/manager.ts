import type { FontManifest, SubsetManifest } from './types.js';

class FontHandle {
  readonly fontName: string;
  private readonly baseUrl: string;
  private readonly manifest: FontManifest;
  private readonly cpToSubset = new Map<number, number>();
  private readonly cpToAdv = new Map<number, number>();
  private readonly loadedSubsets = new Set<number>();
  private readonly pendingLoads = new Map<number, Promise<void>>();
  private readonly subscribers = new Set<(cps: ReadonlySet<number>) => void>();
  /** Code points that have been requested by at least one LazyBitmapText. */
  private readonly requestedCps = new Set<number>();
  private nextGlobalPage = 1; // page 0 is reserved for the dot texture
  private bitmapFont: import('pixi.js').BitmapFont | null = null;
  private dotTexture: import('pixi.js').Texture | null = null;
  private dotPx = 4;
  /** Cached PixiJS module reference to avoid dynamic import in sync methods. */
  private pixi!: typeof import('pixi.js');

  constructor(baseUrl: string, manifest: FontManifest) {
    this.fontName = manifest.fontName;
    this.baseUrl = baseUrl;
    this.manifest = manifest;
    for (const subset of manifest.subsets) {
      for (const ch of subset.chars) {
        this.cpToSubset.set(ch.id, subset.id);
        this.cpToAdv.set(ch.id, ch.adv);
      }
    }
  }

  /**
   * Registers the font in PixiJS immediately after the manifest loads.
   * Creates a minimal BitmapFont with just the dot-placeholder texture (page 0)
   * and zero char entries. Dot chars and real chars are added incrementally later.
   */
  async init(): Promise<void> {
    this.pixi = await import('pixi.js');
    const { BitmapFont, BitmapFontData, Texture, BaseTexture } = this.pixi;
    const manifest = this.manifest;

    // Create dot placeholder texture (once)
    this.dotPx = Math.max(2, Math.round(manifest.lineHeight * 0.25));
    const px = this.dotPx;
    const data = new Uint8Array(px * px * 4);
    for (let i = 0; i < px * px; i++) {
      data[i * 4]     = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 153; // ~60% alpha
    }
    this.dotTexture = new Texture(BaseTexture.fromBuffer(data, px, px));

    // Install minimal font: dot texture at page 0, no chars
    const fontData = new BitmapFontData();
    fontData.info = [{ face: manifest.fontName, size: manifest.fontSize }];
    fontData.common = [{ lineHeight: manifest.lineHeight }];
    fontData.distanceField = [];
    fontData.kerning = [];
    fontData.page = [{ id: 0, file: 'dot.png' }];
    fontData.char = [];

    this.bitmapFont = BitmapFont.install(fontData, [this.dotTexture], false);
  }

  async load(text: string): Promise<void> {
    const newDotCps: number[] = [];
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp !== undefined && this.cpToSubset.has(cp) && !this.requestedCps.has(cp)) {
        this.requestedCps.add(cp);
        if (!this.isCharLoaded(cp)) newDotCps.push(cp);
      }
    }

    const needed = this.getNeededSubsetIds(text);
    const toLoad = needed.filter((id) => !this.loadedSubsets.has(id));

    // Incrementally add dot placeholders for newly requested unloaded chars
    if (newDotCps.length > 0 && toLoad.length > 0) {
      this.addDotChars(newDotCps);
      this.notifySubscribers(new Set(newDotCps));
    }

    if (toLoad.length === 0) return;
    await Promise.all(toLoad.map((id) => this.loadSubset(id)));
  }

  getCharAdvance(cp: number): number | undefined {
    return this.cpToAdv.get(cp);
  }

  isCharLoaded(cp: number): boolean {
    const subsetId = this.cpToSubset.get(cp);
    return subsetId !== undefined && this.loadedSubsets.has(subsetId);
  }

  getManifestMeta(): { lineHeight: number; fontSize: number } {
    return { lineHeight: this.manifest.lineHeight, fontSize: this.manifest.fontSize };
  }

  subscribe(cb: (cps: ReadonlySet<number>) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
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

  /**
   * Incrementally adds dot placeholder chars to the existing BitmapFont.
   * O(new chars) instead of O(all chars).
   */
  private addDotChars(cps: number[]): void {
    const font = this.bitmapFont;
    if (!font || !this.dotTexture) return;
    const { Texture, Rectangle } = this.pixi;
    const dp = this.dotPx;
    const lh = this.manifest.lineHeight;
    const dotBase = this.dotTexture.baseTexture;

    for (const cp of cps) {
      if (font.chars[cp]) continue; // already has an entry
      const adv = this.cpToAdv.get(cp)!;
      font.chars[cp] = {
        xOffset: (adv - dp) / 2,
        yOffset: (lh - dp) / 2,
        xAdvance: adv,
        kerning: {},
        texture: new Texture(dotBase, new Rectangle(0, 0, dp, dp)),
        page: 0,
      };
    }
  }

  /**
   * Loads a subset's textures and incrementally adds real chars to the
   * existing BitmapFont, replacing any dot placeholders. O(subset chars).
   */
  private async doLoadSubset(subset: SubsetManifest): Promise<void> {
    const { Assets, Texture, Rectangle } = this.pixi;
    const font = this.bitmapFont!;
    const res = this.manifest.resolution;

    // Load page textures and add them to the font incrementally
    const pageRemap = new Map<number, number>();
    for (let i = 0; i < subset.pngs.length; i++) {
      const pageId = this.nextGlobalPage++;
      pageRemap.set(i, pageId);
      const tex = await Assets.load<import('pixi.js').Texture>(this.resolve(subset.pngs[i]));
      if (res !== 1) {
        tex.baseTexture.setResolution(res);
      }
      font.pageTextures[pageId] = tex;
    }

    // Replace dot entries with real glyph entries
    for (const ch of subset.chars) {
      const pageId = pageRemap.get(ch.page) ?? ch.page;
      const pageTex = font.pageTextures[pageId];
      font.chars[ch.id] = {
        xOffset: ch.ox,
        yOffset: ch.oy,
        xAdvance: ch.adv,
        kerning: {},
        texture: new Texture(
          pageTex.baseTexture,
          new Rectangle(ch.x / res, ch.y / res, ch.w / res, ch.h / res),
        ),
        page: pageId,
      };
    }

    this.loadedSubsets.add(subset.id);
    this.notifySubscribers(new Set(subset.chars.map((ch) => ch.id)));
  }

  private notifySubscribers(cps: ReadonlySet<number>): void {
    if (cps.size === 0) return;
    for (const cb of this.subscribers) cb(cps);
  }

  private resolve(path: string): string {
    if (/^https?:\/\/|^\//.test(path)) return path;
    return this.baseUrl + path;
  }
}

export class BitmapFontManager {
  private static registry = new Map<string, FontHandle>();

  /**
   * Loads a bitmap font from a directory. Fetches `{dir}/manifest.json` and
   * registers an empty font in PixiJS so BitmapText never warns about a missing
   * font. Dot placeholders are added lazily the first time each glyph is
   * requested, and replaced with real glyphs as subsets finish downloading.
   */
  static async loadFont(dir: string): Promise<string> {
    const baseUrl = dir.endsWith('/') ? dir : dir + '/';
    const resp = await fetch(baseUrl + 'manifest.json');
    if (!resp.ok) {
      throw new Error(`Failed to load font: ${baseUrl}manifest.json (${resp.status})`);
    }
    const manifest = (await resp.json()) as FontManifest;
    const handle = new FontHandle(baseUrl, manifest);
    await handle.init();
    this.registry.set(manifest.fontName, handle);
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

  /** Returns the advance width (logical px at manifest font size) for a code point. */
  static getCharAdvance(fontName: string, cp: number): number | undefined {
    return this.registry.get(fontName)?.getCharAdvance(cp);
  }

  /** Returns true if the subset containing this code point has been loaded. */
  static isCharLoaded(fontName: string, cp: number): boolean {
    return this.registry.get(fontName)?.isCharLoaded(cp) ?? false;
  }

  /** Returns the manifest's lineHeight and fontSize (both in physical pixels). */
  static getManifestMeta(fontName: string): { lineHeight: number; fontSize: number } | undefined {
    return this.registry.get(fontName)?.getManifestMeta();
  }

  /**
   * Subscribe to font-update events. The callback fires after dot placeholders
   * are first registered and again each time a subset finishes loading.
   * Returns an unsubscribe function.
   */
  static subscribe(fontName: string, cb: (cps: ReadonlySet<number>) => void): () => void {
    return this.registry.get(fontName)?.subscribe(cb) ?? (() => {});
  }
}
