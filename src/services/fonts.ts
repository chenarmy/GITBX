import type { Locale } from '@/i18n/config';
import { ensureOptionalFontLoaded } from '@/services/optionalFonts';

export type FontGroup = 'latin' | 'chinese' | 'japanese' | 'arabic' | 'mono';

export interface FontOption {
  id: string;
  /** Display name shown in the settings dropdown. */
  label: string;
  /** Full CSS font-family stack (bundled webfont first, system fallbacks last). */
  family: string;
  /** Family name used for document.fonts checks; defaults to the first stack entry. */
  checkFamily?: string;
  /**
   * True when the family ships with the app (declared in assets/fonts.css).
   * Bundled fonts work offline and need no network or CSP exemptions.
   */
  bundled?: boolean;
  /** True when the family is downloaded once and cached in persistent app storage. */
  downloadable?: boolean;
  group: FontGroup;
  /** Locales this font is recommended for. */
  locales: Locale[];
  /** License note (all entries must be open-source / free for commercial use). */
  license: string;
}

const ALL_LOCALES: Locale[] = ['en', 'ja', 'de', 'es', 'zh-CN', 'zh-TW', 'fr', 'ar'];

/**
 * Core families are bundled under `public/fonts`. Larger optional families are
 * downloaded on first selection, checksum-verified and cached for later offline
 * use. Every family retains system fallbacks when download is unavailable.
 *
 * Licenses (all free for commercial use):
 * - Inter, Noto Sans/Serif SC, Noto Sans JP, Noto Sans/Naskh Arabic, Cairo,
 *   JetBrains Mono, Source Code Pro, Noto Sans Mono: SIL OFL 1.1
 * - 阿里巴巴普惠体 Alibaba PuHuiTi 3.0: Alibaba PuHuiTi Free License
 * - HarmonyOS Sans SC（鸿蒙）: HarmonyOS Sans License
 */
export const FONT_CATALOG: FontOption[] = [
  {
    id: 'system-default',
    label: 'System Default',
    family: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    group: 'latin',
    locales: ALL_LOCALES,
    license: 'System font (no download)',
  },
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif',
    checkFamily: 'Inter',
    bundled: true,
    group: 'latin',
    locales: ['en', 'de', 'es', 'fr'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    family: '"Noto Sans", ui-sans-serif, -apple-system, "Segoe UI", sans-serif',
    checkFamily: 'Noto Sans',
    bundled: true,
    group: 'latin',
    locales: ['en', 'de', 'es', 'fr'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'harmonyos-sans-sc',
    label: 'HarmonyOS Sans SC（鸿蒙）',
    family: '"HarmonyOS Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'HarmonyOS Sans SC',
    bundled: true,
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'HarmonyOS Sans License（免费商用）',
  },
  {
    id: 'alibaba-puhuiti',
    label: '阿里巴巴普惠体 3.0',
    family: '"Alibaba PuHuiTi 3.0", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'Alibaba PuHuiTi 3.0',
    downloadable: true,
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'Alibaba PuHuiTi Free License（允许商用）',
  },
  {
    id: 'noto-sans-sc',
    label: '思源黑体 (Noto Sans SC)',
    family: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'Noto Sans SC',
    downloadable: true,
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-serif-sc',
    label: '思源宋体 (Noto Serif SC)',
    family: '"Noto Serif SC", "Songti SC", SimSun, "Noto Sans SC", serif',
    checkFamily: 'Noto Serif SC',
    downloadable: true,
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-jp',
    label: 'Noto Sans JP（日本語）',
    family: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", "HarmonyOS Sans SC", sans-serif',
    checkFamily: 'Noto Sans JP',
    downloadable: true,
    group: 'japanese',
    locales: ['ja'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-arabic',
    label: 'Noto Sans Arabic（العربية）',
    family: '"Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif',
    checkFamily: 'Noto Sans Arabic',
    bundled: true,
    group: 'arabic',
    locales: ['ar'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-naskh-arabic',
    label: 'Noto Naskh Arabic（نسخ）',
    family: '"Noto Naskh Arabic", "Traditional Arabic", serif',
    checkFamily: 'Noto Naskh Arabic',
    bundled: true,
    group: 'arabic',
    locales: ['ar'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'cairo',
    label: 'Cairo（القاهرة）',
    family: 'Cairo, "Noto Sans Arabic", "Segoe UI", sans-serif',
    checkFamily: 'Cairo',
    bundled: true,
    group: 'arabic',
    locales: ['ar'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'system-mono',
    label: 'System Monospace',
    family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", "Microsoft YaHei", monospace',
    group: 'mono',
    locales: ALL_LOCALES,
    license: 'System font (no download)',
  },
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    checkFamily: 'JetBrains Mono',
    bundled: true,
    group: 'mono',
    locales: ALL_LOCALES,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    family: '"Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    checkFamily: 'Source Code Pro',
    bundled: true,
    group: 'mono',
    locales: ALL_LOCALES,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-mono',
    label: 'Noto Sans Mono',
    family: '"Noto Sans Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    checkFamily: 'Noto Sans Mono',
    bundled: true,
    group: 'mono',
    locales: ['zh-CN', 'zh-TW', 'ja'],
    license: 'SIL OFL 1.1',
  },
];

export const UI_FONTS: FontOption[] = FONT_CATALOG.filter((item) => item.group !== 'mono');
export const MONO_FONTS: FontOption[] = FONT_CATALOG.filter(
  (item) => item.group === 'mono' || item.id === 'system-mono',
);

const FONT_MAP = new Map(FONT_CATALOG.map((item) => [item.id, item]));

export function getFontById(id: string): FontOption | undefined {
  return FONT_MAP.get(id);
}

export function isKnownFontId(id: string): boolean {
  return FONT_MAP.has(id);
}

export const BASE_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 20;
export const DEFAULT_MONO_FONT_ID = 'system-mono';

export function defaultFontIdForLocale(locale: Locale): string {
  switch (locale) {
    case 'zh-CN':
    case 'zh-TW':
      return 'harmonyos-sans-sc';
    case 'ja':
      return 'noto-sans-jp';
    case 'ar':
      return 'noto-sans-arabic';
    default:
      return 'inter';
  }
}

export function clampFontSize(value: unknown, fallback = BASE_FONT_SIZE): number {
  const numeric = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(numeric)));
}

function firstFamilyName(option: FontOption): string {
  if (option.checkFamily) return option.checkFamily;
  const first = option.family.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || 'sans-serif';
}

/** Sample text that touches Latin, CJK and Arabic subsets. */
const FONT_PROBE_TEXT = 'Agile Git 中文简体 繁體中文 日本語 العربية 0123456789';

function normalizeFamily(value: string): string {
  return value.replace(/["']/g, '').trim().toLowerCase();
}

/** Decorative weights are optional: only regular/bold are used by the UI. */
const PROBE_WEIGHTS = ['400', '700'];

function matchingFaces(fonts: FontFaceSet, family: string): FontFace[] {
  const target = normalizeFamily(family);
  return Array.from(fonts).filter((face) => normalizeFamily(face.family) === target);
}

/** Collect the @font-face rules declared for a family (needed to retry a fetch). */
function declaredFontUrls(family: string): string[] {
  const urls: string[] = [];
  const target = normalizeFamily(family);
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name !== 'CSSFontFaceRule' && (rule as CSSRule).type !== 5) continue;
      const text = rule.cssText || '';
      const familyMatch = /font-family:\s*([^;]+);/.exec(text);
      if (!familyMatch || normalizeFamily(familyMatch[1]) !== target) continue;
      for (const match of text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
        if (match[2]) urls.push(match[2]);
      }
    }
  }
  return urls;
}

/**
 * Ensure the selected font is ready for painting. Bundled fonts are local
 * files, so this only warms the browser font cache (no network).
 *
 * A single abort (the browser cancels a font request when the user switches
 * fonts quickly or a background tab is throttled) must not be reported as a
 * broken font, so individual weight failures are tolerated and the final
 * verdict falls back to checking that the file itself is reachable.
 */
export async function ensureFontLoaded(id: string): Promise<boolean> {
  const option = getFontById(id);
  if (!option) return false;
  if (option.downloadable) return ensureOptionalFontLoaded(id);
  if (!option.bundled) return true;
  if (typeof document === 'undefined') return true;
  const fonts = document.fonts;
  if (!fonts?.load) return true;

  const name = firstFamilyName(option);

  const warm = async (): Promise<boolean> => {
    await Promise.allSettled(
      PROBE_WEIGHTS.map((weight) => fonts.load(`${weight} 16px "${name}"`, FONT_PROBE_TEXT)),
    );
    return matchingFaces(fonts, name).some((face) => face.status === 'loaded');
  };

  if (await warm()) return true;

  // Font requests can be aborted while the UI is switching fonts; retry once.
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (await warm()) return true;

  // Last resort: verify the stylesheet actually ships a file we can reach.
  // This separates "font is missing from the build" from a transient abort.
  const urls = declaredFontUrls(name);
  if (urls.length === 0) return false;
  try {
    const response = await fetch(urls[0], { cache: 'reload' });
    if (!response.ok) return false;
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Guard against SPA/static fallbacks that answer 200 with index.html.
    const isWoff2 = bytes.length > 4
      && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
    if (isWoff2) return true;
    return (response.headers.get('content-type') || '').startsWith('font/');
  } catch {
    return false;
  }
}

export interface AppFontSettings {
  family: string;
  size: number;
  monoFamily: string;
}

/**
 * Apply the font globally: CSS variables drive body text, rem-based Tailwind
 * sizes (via html font-size), px-based utilities (via --gitbx-font-scale
 * overrides in main.css) and the monospace stack for code views.
 */
export function applyAppFont(settings: AppFontSettings): void {
  if (typeof document === 'undefined') return;
  const size = clampFontSize(settings.size);
  const root = document.documentElement;
  root.style.setProperty('--gitbx-font-family', settings.family);
  root.style.setProperty('--gitbx-font-size', `${size}px`);
  root.style.setProperty('--gitbx-font-scale', String(size / BASE_FONT_SIZE));
  root.style.setProperty('--gitbx-mono-family', settings.monoFamily);
  document.body.style.fontFamily = settings.family;
  document.body.style.fontSize = `${size}px`;
}

/** Pre-resolve the stored/user font before Vue mounts to avoid FOUT. */
export function applyStoredFontEarly(family: string, size: number, monoFamily: string): void {
  try {
    applyAppFont({ family, size, monoFamily });
  } catch {
    // Font still applies once the settings store initializes.
  }
}
