import { describe, expect, it } from 'vitest';
import { isTftAtlasFilename, isTftSplashFilename, preferNonSplashImageInfo } from './ddragon-assets.js';

describe('isTftAtlasFilename', () => {
  it('detects TFT atlas filenames', () => {
    expect(isTftAtlasFilename('tft-champion5.png')).toBe(true);
    expect(isTftAtlasFilename('tft-item1.png')).toBe(true);
    expect(isTftAtlasFilename('tft-trait12.png')).toBe(true);
    expect(isTftAtlasFilename('tft-augment9.png')).toBe(true);
    expect(isTftAtlasFilename('TFT-CHAMPION5.PNG')).toBe(true);
  });

  it('does not flag per-icon filenames', () => {
    expect(isTftAtlasFilename('TFT16_Qiyana.png')).toBe(false);
    expect(isTftAtlasFilename('TFT_Item_InfinityEdge.png')).toBe(false);
    expect(isTftAtlasFilename('some_other.png')).toBe(false);
    expect(isTftAtlasFilename('')).toBe(false);
  });
});

describe('preferNonSplashImageInfo', () => {
  it('prefers non-splash over splash', () => {
    type Img = { group: string; full: string };
    const splash: Img = { group: 'tft-champion', full: 'TFT16_Ahri_splash.png' };
    const icon: Img = { group: 'tft-champion', full: 'TFT16_Ahri.png' };
    expect(isTftSplashFilename(splash.full)).toBe(true);
    expect(isTftSplashFilename(icon.full)).toBe(false);
    expect(preferNonSplashImageInfo(splash as any, icon as any)).toEqual(icon);
    expect(preferNonSplashImageInfo(icon as any, splash as any)).toEqual(icon);
  });

  it('is stable when both candidates are the same type', () => {
    type Img = { group: string; full: string };
    const a: Img = { group: 'tft-champion', full: 'TFT16_Ahri.png' };
    const b: Img = { group: 'tft-champion', full: 'TFT16_Ahri_alt.png' };
    expect(preferNonSplashImageInfo(a as any, b as any)).toEqual(a);

    const sa: Img = { group: 'tft-champion', full: 'TFT16_Ahri_splash.png' };
    const sb: Img = { group: 'tft-champion', full: 'TFT16_Ahri_alt_splash.png' };
    expect(preferNonSplashImageInfo(sa as any, sb as any)).toEqual(sa);
  });
});

