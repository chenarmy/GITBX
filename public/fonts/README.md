# GITBX fonts

Core fonts in this directory ship with GITBX. Larger optional families live in
the repository-level `font-packs/` directory and are downloaded only when the
user selects them. Downloads are SHA-256 verified, stored in IndexedDB under
the app's persistent WebView data, and remain available offline afterward.
Every family is free for commercial use.

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

- `public/fonts/`: installer-bundled core fonts.
- `font-packs/`: optional Alibaba PuHuiTi, Noto Sans/Serif SC and Noto Sans JP.
- `font-packs/all-fonts.css`: canonical source of all `@font-face` declarations.
- `src/assets/fonts.css`: generated CSS for bundled families only.
- `src/services/optionalFontManifest.generated.ts`: generated optional-pack
  metadata, sizes, Unicode ranges and checksums.

Run `pnpm fonts:generate` after changing font files or declarations. Production
builds run `pnpm fonts:check` and fail if generated outputs are stale.

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
