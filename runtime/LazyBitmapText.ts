import { BitmapFont, BitmapText } from 'pixi.js';
import { BitmapFontManager } from './manager.js';

export interface LazyBitmapTextOptions {
  fontName: string;
  fontSize?: number;
  tint?: number;
  letterSpacing?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
}

/**
 * A drop-in replacement for PixiJS BitmapText with lazy subset loading.
 *
 * While subsets are downloading, unloaded glyphs render as dot placeholders
 * (registered in the BitmapFont with the correct advance width so layout never
 * shifts). As each subset finishes loading, `dirty` is set so PixiJS re-draws
 * the text with the real glyphs on the next frame.
 *
 * `instanceof BitmapText` is true. All BitmapText properties (textWidth,
 * textHeight, anchor, …) work natively.
 *
 * @example
 * ```ts
 * await BitmapFontManager.loadFont('/fonts/HYWenHei/');
 *
 * const t = new LazyBitmapText('你好世界', { fontName: 'HYWenHei', fontSize: 24 });
 * app.stage.addChild(t);
 * t.text = '新内容'; // auto lazy-loads new subsets
 * ```
 */
export class LazyBitmapText extends BitmapText {
  private _rawText: string;
  private _trackedCps = new Set<number>();
  private _unsubscribe: (() => void) | null = null;
  private _initialized = false;
  /** True once every manifest char in _rawText has its subset loaded. */
  private _fullyLoaded = false;

  constructor(text: string, options: LazyBitmapTextOptions) {
    super(text, options);
    this._rawText = text;
    this._initialized = true;
    this._refreshTrackedCps();
    // Eagerly check: if all chars are already loaded (e.g. after warmup), skip
    // subscribing entirely so font-update notifications never touch this instance.
    this._checkFullyLoaded();
    if (!this._fullyLoaded) {
      this._subscribe();
      this._loadCurrentText();
    }
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = BitmapFontManager.subscribe(this._fontName, (updatedCps) => {
      // Skip instances whose text is already fully rendered with real glyphs.
      if (this._fullyLoaded || !this._dependsOnAny(updatedCps)) return;
      this.dirty = true;
      this._checkFullyLoaded();
    });
  }

  private _loadCurrentText(): void {
    BitmapFontManager.load(this._fontName, this._rawText).catch((err) => {
      console.error('[LazyBitmapText]', err);
    });
  }

  private _refreshTrackedCps(): void {
    this._trackedCps.clear();
    for (const ch of this._rawText) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && BitmapFontManager.getCharAdvance(this._fontName, cp) !== undefined) {
        this._trackedCps.add(cp);
      }
    }
  }

  private _dependsOnAny(updatedCps: ReadonlySet<number>): boolean {
    for (const cp of this._trackedCps) {
      if (updatedCps.has(cp)) return true;
    }
    return false;
  }

  /**
   * Checks whether every manifest char in _rawText is now loaded.
   * If so, sets _fullyLoaded = true and unsubscribes so future font-update
   * notifications bypass this instance entirely.
   */
  private _checkFullyLoaded(): void {
    for (const cp of this._trackedCps) {
      if (!BitmapFontManager.isCharLoaded(this._fontName, cp)) return;
    }
    this._fullyLoaded = true;
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  protected override validate(): void {
    const font = BitmapFont.available[this._fontName];
    if (!font) throw new Error(`Missing BitmapFont "${this._fontName}"`);
    // BitmapFontManager replaces the global font object whenever placeholder or
    // subset data changes. LazyBitmapText does its own targeted invalidation, so
    // only respect the local dirty flag here instead of forcing a full redraw for
    // every instance that shares this font.
    if (this.dirty) this.updateText();
  }

  override get text(): string { return this._rawText; }
  override set text(value: string) {
    this._rawText = value;
    super.text = value;
    if (!this._initialized) return;

    this._fullyLoaded = false;
    this._refreshTrackedCps();
    // Check eagerly — if new text is all loaded, no subscription needed.
    this._checkFullyLoaded();
    if (!this._fullyLoaded) {
      if (!this._unsubscribe) this._subscribe();
      this._loadCurrentText();
    }
  }

  override destroy(...args: Parameters<BitmapText['destroy']>): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.destroy(...args);
  }
}
