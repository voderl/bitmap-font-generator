import type { FontManifest, SubsetManifest, CharMetrics } from './types.js';

interface AccChar extends CharMetrics {
  globalPage: number;
}

class FontHandle {
  readonly fontName: string;
  private readonly baseUrl: string;
  private readonly manifest: FontManifest;
  private readonly cpToSubset = new Map<number, number>();
  private readonly cpToAdv = new Map<number, number>();
  private readonly loadedSubsets = new Set<number>();
  private readonly pendingLoads = new Map<number, Promise<void>>();
  private readonly subscribers = new Set<() => void>();
  /** Code points that have been requested by at least one LazyBitmapText. */
  private readonly requestedCps = new Set<number>();
  private nextGlobalPage = 0;
  private accTextures: import('pixi.js').Texture[] = [];
  private accChars: AccChar[] = [];
  private dotTexture: import('pixi.js').Texture | null = null;
  private dotPx = 4;

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
   * Installs the dot-placeholder texture as the sole page with zero char entries,
   * so BitmapText never hits a "font not found" error on first render.
   * Dot char entries are added lazily the first time each glyph is requested.
   */
  async init(): Promise<void> {
    await this.installFont();
  }

  async load(text: string): Promise<void> {
    // Track which code points have been requested so installFont() knows
    // which unloaded chars need dot entries.
    let addedNew = false;
    for (const char of text) {
      const cp = char.codePointAt(0);
      if (cp !== undefined && this.cpToSubset.has(cp) && !this.requestedCps.has(cp)) {
        this.requestedCps.add(cp);
        addedNew = true;
      }
    }

    const needed = this.getNeededSubsetIds(text);
    const toLoad = needed.filter((id) => !this.loadedSubsets.has(id));

    // If there are new unloaded chars, register dot placeholders for them right
    // away so BitmapText can render dots before any texture download finishes.
    if (addedNew && toLoad.length > 0) {
      await this.installFont();
      this.notifySubscribers();
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

  subscribe(cb: () => void): () => void {
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

  private async doLoadSubset(subset: SubsetManifest): Promise<void> {
    const { Assets } = await import('pixi.js');
    const pageRemap = new Map<number, number>();
    for (let i = 0; i < subset.pngs.length; i++) {
      const globalId = this.nextGlobalPage++;
      pageRemap.set(i, globalId);
      const tex = await Assets.load<import('pixi.js').Texture>(this.resolve(subset.pngs[i]));
      if (this.manifest.resolution !== 1) {
        tex.baseTexture.setResolution(this.manifest.resolution);
      }
      this.accTextures[globalId] = tex;
    }
    for (const ch of subset.chars) {
      this.accChars.push({ ...ch, globalPage: pageRemap.get(ch.page) ?? ch.page });
    }
    this.loadedSubsets.add(subset.id);
    await this.installFont();
    this.notifySubscribers();
  }

  private async installFont(): Promise<void> {
    const { BitmapFont, BitmapFontData, Texture, BaseTexture } = await import('pixi.js');
    const manifest = this.manifest;

    // ── Compact sparse real-texture array ────────────────────────────────────
    const textures: import('pixi.js').Texture[] = [];
    const oldToNew = new Map<number, number>();
    for (let i = 0; i < this.accTextures.length; i++) {
      if (this.accTextures[i] !== undefined) {
        oldToNew.set(i, textures.length);
        textures.push(this.accTextures[i]);
      }
    }

    // ── Dot placeholder texture (created once, lazy) ──────────────────────────
    if (!this.dotTexture) {
      // Use manifest.lineHeight directly (physical px) — PixiJS derives res=1 from
      // the page filename ('page_N.png' has no @2x suffix), so BitmapFont.lineHeight
      // = manifest.lineHeight and all layout coords are multiplied by the same scale.
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
    }

    const dotPageIndex = textures.length;
    textures.push(this.dotTexture);

    // ── Build font data ───────────────────────────────────────────────────────
    const fontData = new BitmapFontData();
    const res = manifest.resolution;
    const dp = this.dotPx;

    fontData.info = [{ face: manifest.fontName, size: manifest.fontSize }];
    fontData.common = [{ lineHeight: manifest.lineHeight }];
    fontData.distanceField = [];
    fontData.kerning = [];
    fontData.page = textures.map((_, i) => ({ id: i, file: `page_${i}.png` }));

    // Real glyphs for loaded subsets
    const realChars = this.accChars
      .filter((ch) => oldToNew.has(ch.globalPage))
      .map((ch) => ({
        id: ch.id,
        page: oldToNew.get(ch.globalPage)!,
        x: ch.x / res,
        y: ch.y / res,
        width: ch.w / res,
        height: ch.h / res,
        xoffset: ch.ox,
        yoffset: ch.oy,
        xadvance: ch.adv,
        letter: safeFromCodePoint(ch.id),
        chnl: 15,
      }));

    // Dot glyphs — only for code points that have actually been requested
    // (i.e. a LazyBitmapText is trying to render them) and whose subset is
    // not yet loaded. This keeps installFont() O(requested chars) instead of
    // O(all chars in the entire font).
    const loadedIds = new Set(realChars.map((c) => c.id));
    const dotChars = [...this.requestedCps]
      .filter((cp) => !loadedIds.has(cp))
      .map((cp) => {
        const adv = this.cpToAdv.get(cp)!;
        return {
          id: cp,
          page: dotPageIndex,
          x: 0,
          y: 0,
          width: dp,
          height: dp,
          xoffset: (adv - dp) / 2,
          yoffset: (manifest.lineHeight - dp) / 2,
          xadvance: adv,
          letter: safeFromCodePoint(cp),
          chnl: 15,
        };
      });

    fontData.char = [...realChars, ...dotChars];
    BitmapFont.install(fontData, textures, false);
  }

  private notifySubscribers(): void {
    for (const cb of this.subscribers) cb();
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
  static subscribe(fontName: string, cb: () => void): () => void {
    return this.registry.get(fontName)?.subscribe(cb) ?? (() => {});
  }
}

function safeFromCodePoint(cp: number): string {
  try { return String.fromCodePoint(cp); } catch { return '?'; }
}
