import { BitmapText, ensureTextOptions } from 'pixi.js';
import { BitmapFontManager } from './manager.js';

import type { TextOptions, DestroyOptions, TextString, TextStyleOptions } from 'pixi.js';

export type LazyBitmapTextStyle = Omit<TextStyleOptions, 'fontFamily'> & {
  fontFamily: string;
};

export type LazyBitmapTextOptions = Omit<TextOptions, 'style'> & {
  style: LazyBitmapTextStyle;
};

function resolveFontId(fontFamily: unknown): string {
  if (typeof fontFamily !== 'string' || fontFamily.length === 0) {
    throw new Error('[LazyBitmapText] style.fontFamily is required and must be a non-empty string.');
  }

  return fontFamily;
}

/**
 * A drop-in replacement for PixiJS BitmapText with lazy subset loading.
 *
 * While subsets are downloading, unloaded glyphs render as dot placeholders
 * (registered in the BitmapFont with the correct advance width so layout never
 * shifts). As each subset finishes loading, `_didTextUpdate` is set so PixiJS
 * re-draws the text with the real glyphs on the next frame.
 *
 * `instanceof BitmapText` is true. All BitmapText properties (anchor, …) work
 * natively.
 *
 * @example
 * ```ts
 * await BitmapFontManager.loadFont('/fonts/HYWenHei/');
 *
 * const t = new LazyBitmapText({
 *   text: '你好世界',
 *   style: { fontFamily: 'HYWenHei', fontSize: 24 },
 * });
 * app.stage.addChild(t);
 * t.text = '新内容'; // auto lazy-loads new subsets
 * ```
 */
export class LazyBitmapText extends BitmapText {
  private _rawText: string;
  private _fontId: string;
  private _trackedCps = new Set<number>();
  private _unsubscribe: (() => void) | null = null;
  private _initialized = false;
  /** True once every manifest char in _rawText has its subset loaded. */
  private _fullyLoaded = false;

  constructor(options?: LazyBitmapTextOptions);
  constructor(text?: TextString, options?: LazyBitmapTextStyle);
  constructor(...args: [LazyBitmapTextOptions?] | [TextString, LazyBitmapTextStyle]) {
    const options = ensureTextOptions<LazyBitmapTextOptions>(args, 'LazyBitmapText');

    if (!options.style) {
      throw new Error('[LazyBitmapText] style is required.');
    }
    options.style.fill ??= 0xffffff;

    super(options);
    this._rawText = this.text;
    this._fontId = resolveFontId(this.style.fontFamily);
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
    this._unsubscribe = BitmapFontManager.subscribe(this._fontId, (updatedCps) => {
      // Skip instances whose text is already fully rendered with real glyphs.
      if (this._fullyLoaded || !this._dependsOnAny(updatedCps)) return;
      // Signal the render pipe to re-layout on next frame
      this._didTextUpdate = true;
      this.onViewUpdate();
      this._checkFullyLoaded();
    });
  }

  private _loadCurrentText(): void {
    BitmapFontManager.load(this._fontId, this._rawText).catch((err) => {
      console.error('[LazyBitmapText]', err);
    });
  }

  private _refreshTrackedCps(): void {
    this._trackedCps.clear();
    for (const ch of this._rawText) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && BitmapFontManager.getCharAdvance(this._fontId, cp) !== undefined) {
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
      if (!BitmapFontManager.isCharLoaded(this._fontId, cp)) return;
    }
    this._fullyLoaded = true;
    this._unsubscribe?.();
    this._unsubscribe = null;
  }

  override get text(): string { return this._rawText; }
  override set text(value: TextString) {
    const str = String(value);
    this._rawText = str;
    super.text = str;
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

  override destroy(options?: DestroyOptions | boolean): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    super.destroy(options);
  }
}
