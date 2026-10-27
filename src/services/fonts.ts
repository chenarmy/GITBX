import type { Locale } from '@/i18n/config';

export type FontGroup = 'latin' | 'chinese' | 'japanese' | 'arabic' | 'mono';

export interface FontOption {
  id: string;
  /** Display name shown in the settings dropdown. */
  label: string;
  /** Full CSS font-family stack (webfont first, system fallbacks last). */
  family: string;
  /** Family name used for document.fonts checks; defaults to the first stack entry. */
  checkFamily?: string;
  /** Remote stylesheet URL. Lazy-loaded on demand; absent means system font. */
  cssUrl?: string;
  group: FontGroup;
  /** Locales this font is recommended for. */
  locales: Locale[];
  /** License note (all entries must be open-source / free for commercial use). */
  license: string;
}

function googleCss(familyParam: string): string {
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;500;600;700&display=swap`;
}

const ALL_LOCALES: Locale[] = ['en', 'ja', 'de', 'es', 'zh-CN', 'zh-TW', 'fr', 'ar'];

/**
 * Open-source / free-for-commercial-use font catalog.
 *
 * - Latin/European: Inter, Noto Sans (SIL OFL 1.1, Google Fonts)
 * - Chinese (all required by product spec):
 *   思源宋体 Noto Serif SC (SIL OFL 1.1, Google Fonts),
 *   阿里巴巴普惠体 Alibaba PuHuiTi 3.0 (Alibaba free license, commercial use allowed),
 *   HarmonyOS Sans SC 鸿蒙 (HarmonyOS Sans license, free commercial use),
 *   plus 思源黑体 Noto Sans SC (SIL OFL 1.1, Google Fonts)
 * - Japanese: Noto Sans/Serif JP (SIL OFL 1.1, Google Fonts)
 * - Arabic: Noto Sans Arabic, Noto Naskh Arabic, Cairo (SIL OFL 1.1, Google Fonts)
 * - Monospace: JetBrains Mono, Source Code Pro, Noto Sans Mono (SIL OFL 1.1)
 *
 * Alibaba PuHuiTi and HarmonyOS Sans are not hosted on Google Fonts, so they
 * resolve through the cdnfonts mirror with a system-installed fallback stack.
 * If the remote stylesheet fails (e.g. offline), the system fallback in
 * `family` still applies and loading resolves gracefully.
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
    cssUrl: googleCss('Inter'),
    group: 'latin',
    locales: ['en', 'de', 'es', 'fr'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    family: '"Noto Sans", ui-sans-serif, -apple-system, "Segoe UI", sans-serif',
    checkFamily: 'Noto Sans',
    cssUrl: googleCss('Noto+Sans'),
    group: 'latin',
    locales: ['en', 'de', 'es', 'fr'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'harmonyos-sans-sc',
    label: 'HarmonyOS Sans SC（鸿蒙）',
    family: '"HarmonyOS Sans SC", "HarmonyOS Sans", "HarmonyOS Sans SC Regular", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'HarmonyOS Sans SC',
    cssUrl: 'https://fonts.cdnfonts.com/css/harmonyos-sans-sc',
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'HarmonyOS Sans License（免费商用）',
  },
  {
    id: 'alibaba-puhuiti',
    label: '阿里巴巴普惠体 3.0',
    family: '"Alibaba PuHuiTi 3.0", "AlibabaPuHuiTi-3-55-Regular", "Alibaba PuHuiTi", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'Alibaba PuHuiTi 3.0',
    cssUrl: 'https://fonts.cdnfonts.com/css/alibaba-puhui-ti-3-0',
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'Alibaba PuHuiTi Free License（允许商用）',
  },
  {
    id: 'noto-sans-sc',
    label: '思源黑体 (Noto Sans SC)',
    family: '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    checkFamily: 'Noto Sans SC',
    cssUrl: googleCss('Noto+Sans+SC'),
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-serif-sc',
    label: '思源宋体 (Noto Serif SC)',
    family: '"Noto Serif SC", "Songti SC", "SimSun", "Noto Sans SC", serif',
    checkFamily: 'Noto Serif SC',
    cssUrl: googleCss('Noto+Serif+SC'),
    group: 'chinese',
    locales: ['zh-CN', 'zh-TW'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-jp',
    label: 'Noto Sans JP（日本語）',
    family: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif',
    checkFamily: 'Noto Sans JP',
    cssUrl: googleCss('Noto+Sans+JP'),
    group: 'japanese',
    locales: ['ja'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-serif-jp',
    label: 'Noto Serif JP（日本語明朝）',
    family: '"Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
    checkFamily: 'Noto Serif JP',
    cssUrl: googleCss('Noto+Serif+JP'),
    group: 'japanese',
    locales: ['ja'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-arabic',
    label: 'Noto Sans Arabic（العربية）',
    family: '"Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif',
    checkFamily: 'Noto Sans Arabic',
    cssUrl: googleCss('Noto+Sans+Arabic'),
    group: 'arabic',
    locales: ['ar'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-naskh-arabic',
    label: 'Noto Naskh Arabic（نسخ）',
    family: '"Noto Naskh Arabic", "Traditional Arabic", serif',
    checkFamily: 'Noto Naskh Arabic',
    cssUrl: googleCss('Noto+Naskh+Arabic'),
    group: 'arabic',
    locales: ['ar'],
    license: 'SIL OFL 1.1',
  },
  {
    id: 'cairo',
    label: 'Cairo（القاهرة）',
    family: 'Cairo, "Noto Sans Arabic", "Segoe UI", sans-serif',
    checkFamily: 'Cairo',
    cssUrl: googleCss('Cairo'),
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
    cssUrl: googleCss('JetBrains+Mono'),
    group: 'mono',
    locales: ALL_LOCALES,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    family: '"Source Code Pro", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    checkFamily: 'Source Code Pro',
    cssUrl: googleCss('Source+Code+Pro'),
    group: 'mono',
    locales: ALL_LOCALES,
    license: 'SIL OFL 1.1',
  },
  {
    id: 'noto-sans-mono',
    label: 'Noto Sans Mono',
    family: '"Noto Sans Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    checkFamily: 'Noto Sans Mono',
    cssUrl: googleCss('Noto+Sans+Mono'),
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

const loadedStylesheets = new Set<string>();
const pendingLoads = new Map<string, Promise<boolean>>();

function firstFamilyName(option: FontOption): string {
  if (option.checkFamily) return option.checkFamily;
  const first = option.family.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || 'sans-serif';
}

/**
 * Lazy-load a font's remote stylesheet (once per session). Different
 * languages load different fonts: only the actually selected font's CSS is
 * ever fetched. Resolves false (instead of rejecting) when offline or when
 * the mirror is unreachable, so callers can fall back to system fonts.
 */
export function ensureFontLoaded(id: string): Promise<boolean> {
  const option = getFontById(id);
  if (!option || !option.cssUrl) return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.resolve(true);
  if (loadedStylesheets.has(id)) return Promise.resolve(true);
  const pending = pendingLoads.get(id);
  if (pending) return pending;

  const task = new Promise<boolean>((resolve) => {
    const cssUrl = option.cssUrl as string;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) loadedStylesheets.add(id);
      pendingLoads.delete(id);
      resolve(ok);
    };
    try {
      const existing = document.querySelector(`link[data-gitbx-font="${id}"]`);
      if (existing) {
        loadedStylesheets.add(id);
        finish(true);
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssUrl;
      link.dataset.gitbxFont = id;
      link.onload = () => {
        try {
          const fonts = (document as Document).fonts;
          const name = firstFamilyName(option);
          if (fonts?.load) {
            Promise.race([
              Promise.all([
                fonts.load(`400 16px "${name}"`),
                fonts.load(`700 16px "${name}"`),
              ]),
              new Promise((timerResolve) => setTimeout(timerResolve, 2500)),
            ])
              .then(() => finish(true))
              .catch(() => finish(true));
          } else {
            finish(true);
          }
        } catch {
          finish(true);
        }
      };
      link.onerror = () => {
        link.remove();
        finish(false);
      };
      document.head.appendChild(link);
      // Never leave callers hanging on a stalled network.
      setTimeout(() => finish(false), 12000);
    } catch {
      finish(false);
    }
  });

  pendingLoads.set(id, task);
  return task;
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
