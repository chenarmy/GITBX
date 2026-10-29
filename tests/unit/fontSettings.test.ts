import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FONT_CATALOG,
  UI_FONTS,
  MONO_FONTS,
  clampFontSize,
  defaultFontIdForLocale,
  getFontById,
} from '../../src/services/fonts';

describe('font catalog (open-source only)', () => {
  it('contains all required Chinese fonts', () => {
    const labels = FONT_CATALOG.map((f) => f.label).join('|');
    expect(labels).toContain('思源宋体');
    expect(labels).toContain('阿里巴巴普惠体');
    expect(labels).toContain('HarmonyOS Sans');
  });

  it('every entry declares a free/open license', () => {
    for (const font of FONT_CATALOG) {
      expect(font.license.length).toBeGreaterThan(0);
      expect(font.family.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a system fallback stack', () => {
    for (const font of FONT_CATALOG) {
      expect(font.family).toMatch(/sans-serif|serif|monospace/);
    }
  });

  it('recommends different fonts per language', () => {
    expect(defaultFontIdForLocale('zh-CN')).not.toBe(defaultFontIdForLocale('en'));
    expect(defaultFontIdForLocale('ja')).not.toBe(defaultFontIdForLocale('ar'));
    for (const id of [
      defaultFontIdForLocale('zh-CN'),
      defaultFontIdForLocale('ja'),
      defaultFontIdForLocale('ar'),
      defaultFontIdForLocale('en'),
    ]) {
      expect(getFontById(id)).toBeDefined();
    }
  });

  it('clamps font sizes to 11-20', () => {
    expect(clampFontSize(5)).toBe(11);
    expect(clampFontSize(99)).toBe(20);
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize('abc')).toBe(12);
  });

  it('splits UI and mono fonts', () => {
    expect(UI_FONTS.length).toBeGreaterThan(8);
    expect(MONO_FONTS.length).toBeGreaterThanOrEqual(3);
  });

  it('maps Tailwind sans surfaces to the selected UI font', () => {
    const config = readFileSync(resolve(process.cwd(), 'tailwind.config.js'), 'utf8');
    expect(config).toMatch(/sans:\s*\[\s*["']var\(--gitbx-font-family\)["']\s*\]/);
  });

  it('keeps component font declarations connected to app font settings', () => {
    const sourceRoot = resolve(process.cwd(), 'src');
    const sourceFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (/\.(?:css|vue)$/.test(entry.name) && entry.name !== 'fonts.css') sourceFiles.push(path);
      }
    };
    visit(sourceRoot);

    const disconnectedDeclarations = sourceFiles.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /font-family\s*[:=]/i.test(line))
        .filter((line) => !/--gitbx-(?:font|mono)-family\s*:/.test(line))
        .filter((line) => !/var\(--gitbx-(?:font|mono)-family\)/.test(line))
        .map((line) => `${file}: ${line.trim()}`),
    );

    expect(disconnectedDeclarations).toEqual([]);
  });
});

describe('font settings persistence', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key in store) delete store[key];
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key in store) delete store[key];
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('round-trips font settings through local config', async () => {
    const { readLocalConfig, applyConfig, CONFIG_KEYS } = await import(
      '../../src/services/appConfig'
    );
    localStorage.setItem(CONFIG_KEYS.fontId, 'noto-serif-sc');
    localStorage.setItem(CONFIG_KEYS.fontSize, '16');
    localStorage.setItem(CONFIG_KEYS.monoFontId, 'jetbrains-mono');
    const config = readLocalConfig();
    expect(config.settings.fontId).toBe('noto-serif-sc');
    expect(config.settings.fontSize).toBe(16);
    expect(config.settings.monoFontId).toBe('jetbrains-mono');
    localStorage.clear();
    applyConfig(config);
    expect(localStorage.getItem(CONFIG_KEYS.fontId)).toBe('noto-serif-sc');
    expect(localStorage.getItem(CONFIG_KEYS.fontSize)).toBe('16');
    expect(localStorage.getItem(CONFIG_KEYS.monoFontId)).toBe('jetbrains-mono');
    localStorage.clear();
  });

  it('sanitizes invalid font ids on normalize path', async () => {
    const { readLocalConfig } = await import('../../src/services/appConfig');
    const { CONFIG_KEYS } = await import('../../src/services/appConfig');
    localStorage.setItem(CONFIG_KEYS.fontId, 'non-existent-font');
    localStorage.setItem(CONFIG_KEYS.fontSize, '999');
    const config = readLocalConfig();
    expect(config.settings.fontId).not.toBe('non-existent-font');
    expect(config.settings.fontSize).toBe(20);
    localStorage.clear();
  });
});
