# dsh-color-palette

Pure color math for DeepSeek Harness: format conversion, harmony palettes, WCAG
contrast verdicts, and lightness ramps, exposed as four model tools. Every tool
is a deterministic in-process computation — no network, filesystem, subprocess,
or browser half.

- npm package: `@qingshanjiluo/dsh-color-palette`
- plugin name (Cordis): `dsh-color-palette`
- injects: `tools`

## Install

```bash
npx -y @deepseek-ai/dsh plugin --profile web add @qingshanjiluo/dsh-color-palette
```

## Color input formats

All four tools accept any of these spellings for a color argument:

| Form | Example |
|------|---------|
| HEX (3 or 6 digits, `#` optional) | `#FF8A00`, `f0a` |
| `rgb()` / `rgba()` (comma or space syntax) | `rgb(255, 138, 0)`, `rgb(0 128 255)` |
| `hsl()` / `hsla()` (comma or space syntax) | `hsl(32.5, 100%, 50%)`, `hsl(200 60% 40%)` |
| Bare triple | `255, 138, 0` |

Alpha is accepted but ignored (these tools work on opaque colors). Unparsable
input returns `ok: false` with a readable `error` instead of throwing.

## Tools

| Tool | Parameters | Returns |
|------|------------|---------|
| `color_convert` | `color` | HEX, `red`/`green`/`blue`, `hue`/`saturation`/`lightness`, `rgbCss`, `hslCss`, and WCAG `luminance` |
| `color_harmony` | `color`, `type` (`complementary`, `analogous`, `triadic`, `split_complementary`, `square`, `tetradic`, `monochromatic`) | `colors[]` (`hex`, `rgbCss`, `relation`, `hueShift`, `lightnessShift`) with the base first, plus a paste-ready `hexList` |
| `color_contrast` | `foreground`, `background` | `ratio` (2 dp), `rating` (`AAA` / `AA` / `AA Large` / `Fail`) and the booleans `passAA` (4.5:1), `passAALargeText` (3:1), `passAANonText` (3:1), `passAAA` (7:1), `passAAALargeText` (4.5:1) |
| `color_shades` | `color`, `count` | `steps[]` (`index`, `lightness`, `hex`, `rgbCss`, `isBase`) ordered lightest to darkest, `requestedCount`/`count` after clamping, and `hexList` |

Implementation notes:

- HSL uses the standard cylindrical conversion; hue rotations keep saturation
  and lightness, `monochromatic` keeps hue and saturation and offsets lightness.
- `color_shades` keeps the base hue and saturation and spaces lightness evenly
  across 95% down to 10%; the stop closest to the original color is flagged
  `isBase`.
- Contrast follows WCAG 2.1: sRGB linearization (`c <= 0.03928 ? c/12.92 :
  ((c+0.055)/1.055)^2.4`), weighted luminance `0.2126R + 0.7152G + 0.0722B`,
  and `(L1 + 0.05) / (L2 + 0.05)`.

## Configuration

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `maxShades` | number | `12` | Upper clamp for a `color_shades` ramp (values below 2 are raised to 2) |
| `hexUppercase` | boolean | `true` | Render HEX as `#FF8A00` (`false` gives `#ff8a00`) |

`cordis.patch.yml` carries the bundle layer that inserts this plugin with those
defaults.

## Development

```bash
npm install --no-audit --no-fund
npx tsc --noEmit
npm run build          # tsc -p tsconfig.json && tsdown -> lib/index.js, lib/index.d.ts
npx vitest run
node scripts/load-smoke.mjs
```

## License

MIT
