# Bundled fonts

All fonts in this directory ship with GITBX so that font selection works
offline, without any CDN and without loosening the Tauri CSP. Every family is
free for commercial use.

| Family | CSS name | Source | License |
| --- | --- | --- | --- |
| 思源宋体 / Source Han Serif SC | `Noto Serif SC` | Google Fonts (Noto Serif SC) | SIL OFL 1.1 |
| 思源黑体 / Source Han Sans SC | `Noto Sans SC` | Google Fonts (Noto Sans SC) | SIL OFL 1.1 |
| 阿里巴巴普惠体 3.0 | `Alibaba PuHuiTi 3.0` | Alibaba PuHuiTi 3.0 (npm `@fontpkg/alibaba-puhuiti-3-0`) | Alibaba PuHuiTi Free License |
| HarmonyOS Sans SC（鸿蒙） | `HarmonyOS Sans SC` | HarmonyOS Sans SC (npm `@fontpkg/harmony-os-sans-sc`) | HarmonyOS Sans License |
| Noto Sans JP | `Noto Sans JP` | Google Fonts | SIL OFL 1.1 |
| Noto Sans Arabic | `Noto Sans Arabic` | Google Fonts | SIL OFL 1.1 |
| Noto Naskh Arabic | `Noto Naskh Arabic` | Google Fonts | SIL OFL 1.1 |
| Cairo | `Cairo` | Google Fonts | SIL OFL 1.1 |
| Inter | `Inter` | Google Fonts | SIL OFL 1.1 |
| Noto Sans | `Noto Sans` | Google Fonts | SIL OFL 1.1 |
| JetBrains Mono | `JetBrains Mono` | Google Fonts | SIL OFL 1.1 |
| Source Code Pro | `Source Code Pro` | Google Fonts | SIL OFL 1.1 |
| Noto Sans Mono | `Noto Sans Mono` | Google Fonts | SIL OFL 1.1 |

See [LICENSES.md](./LICENSES.md) for copyright notices and [OFL-1.1.txt](./OFL-1.1.txt)
for the SIL Open Font License text.

## Layout

- `*.woff2` at the root: self-subset CJK fonts (Alibaba PuHuiTi, HarmonyOS Sans SC).
- `<family>/0001.woff2 ...`: Google Fonts unicode-range subsets, referenced with
  their original `unicode-range` rules in `src/assets/fonts.css`.

The stylesheet `src/assets/fonts.css` maps these files to `font-family` names and
is imported once in `src/main.ts`. Browsers only download the subsets that the
current UI text needs.

## Regenerating

The Alibaba/HarmonyOS subsets contain GB2312 + Big5 level-1 hanzi, kana, Latin,
CJK punctuation and common symbols (~11k characters) produced with
[`subset-font`](https://www.npmjs.com/package/subset-font) (harfbuzz wasm):

```js
const subsetFont = require('subset-font');
const out = await subsetFont(sourceTtfOrOtf, charsetString, { targetFormat: 'woff2' });
```

Google Fonts subsets were cached by requesting
`https://fonts.googleapis.com/css2?family=<Family>:wght@400;700&display=swap`
with a Chrome user agent and downloading every referenced `woff2` file.
