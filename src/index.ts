/**
 * Pure color math for DeepSeek Harness: hex/rgb/hsl conversion, harmony
 * palettes, WCAG 2.1 contrast ratios, and lightness ramps. Every tool is a
 * deterministic in-process computation over the arguments the model supplies —
 * no network, filesystem, subprocess, or listener is touched.
 * @module @qingshanjiluo/dsh-color-palette
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-color-palette'
export const inject = ['tools']

/** Deployment policy for the color tools. */
export interface Config {
  /**
   * Upper clamp for a requested shade/tint ramp length, so one model call
   * cannot ask for a thousand swatches. Values below 2 are raised to 2.
   */
  maxShades: number
  /** Render hex values with uppercase letters (`#FF8A00` vs `#ff8a00`). */
  hexUppercase: boolean
}

/** Schemastery configuration for the color palette plugin. */
export const Config: z<Config> = z.object({
  maxShades: z.number().default(12),
  hexUppercase: z.boolean().default(true),
})

/* -------------------------------------------------------------------------- */
/* Color model and conversions                                                 */
/* -------------------------------------------------------------------------- */

/** An 8-bit sRGB triplet. */
interface Rgb {
  r: number
  g: number
  b: number
}

/** Hue in degrees, saturation and lightness in percent. */
interface Hsl {
  h: number
  s: number
  l: number
}

/** Result of parsing one caller-supplied color string. */
type ColorParse = { readonly ok: true; readonly rgb: Rgb } | { readonly ok: false; readonly error: string }

/** Clamp to an 8-bit channel, rounding half away from zero-free drift. */
function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

/** Clamp a number into an inclusive range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Wrap any degree value into `[0, 360)`. */
function mod360(value: number): number {
  return ((value % 360) + 360) % 360
}

/** Round to a fixed number of decimals for stable, JSON-friendly output. */
function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/**
 * Convert sRGB to HSL without premature rounding.
 * @param rgb - 8-bit channels.
 * @returns hue in degrees, saturation and lightness in percent.
 */
function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l: l * 100 }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / delta) % 6
  else if (max === gn) h = (bn - rn) / delta + 2
  else h = (rn - gn) / delta + 4
  return { h: mod360(h * 60), s: s * 100, l: l * 100 }
}

/**
 * Convert HSL back to sRGB.
 * @param hsl - hue in degrees, saturation and lightness in percent.
 * @returns rounded 8-bit channels.
 */
function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = mod360(h)
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2
  let channels: [number, number, number]
  if (hn < 60) channels = [c, x, 0]
  else if (hn < 120) channels = [x, c, 0]
  else if (hn < 180) channels = [0, c, x]
  else if (hn < 240) channels = [0, x, c]
  else if (hn < 300) channels = [x, 0, c]
  else channels = [c, 0, x]
  return {
    r: clampChannel((channels[0] + m) * 255),
    g: clampChannel((channels[1] + m) * 255),
    b: clampChannel((channels[2] + m) * 255),
  }
}

/**
 * WCAG 2.1 relative luminance of an sRGB color.
 * @param rgb - 8-bit channels.
 * @returns luminance in `[0, 1]`.
 */
function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number): number => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * WCAG 2.1 contrast ratio between two colors (order-independent).
 * @param a - first color.
 * @param b - second color.
 * @returns ratio in `[1, 21]`.
 */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Render one color as `#RRGGBB` (or lowercase per deployment policy).
 * @param rgb - 8-bit channels.
 * @param upper - whether to uppercase the hex letters.
 * @returns the hex string, including the leading `#`.
 */
function formatHex(rgb: Rgb, upper: boolean): string {
  const hex = (((1 << 24) | (rgb.r << 16) | (rgb.g << 8) | rgb.b) >>> 0).toString(16).slice(1)
  return `#${upper ? hex.toUpperCase() : hex}`
}

/**
 * Render one color as a CSS `rgb()` function.
 * @param rgb - 8-bit channels.
 * @returns e.g. `rgb(255, 138, 0)`.
 */
function formatRgbCss(rgb: Rgb): string {
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

/**
 * Render one HSL color as a CSS `hsl()` function, rounded to one decimal.
 * @param hsl - hue and percentages.
 * @returns e.g. `hsl(32.4, 100%, 50%)`.
 */
function formatHslCss(hsl: Hsl): string {
  return `hsl(${round(hsl.h, 1)}, ${round(hsl.s, 1)}%, ${round(hsl.l, 1)}%)`
}

/* -------------------------------------------------------------------------- */
/* Color string parsing                                                        */
/* -------------------------------------------------------------------------- */

/** One numeric channel plus the unit it was written with. */
interface ChannelNumber {
  value: number
  percent: boolean
}

/**
 * Parse one CSS-style number token, honoring `deg`, `turn`, `rad`, and `%`.
 * @param token - the raw textual channel.
 * @returns the normalized value, or `undefined` when the token is not numeric.
 */
function parseChannelNumber(token: string): ChannelNumber | undefined {
  const match = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+))(deg|turn|rad|%)?$/.exec(token.trim())
  if (!match) return undefined
  let value = Number.parseFloat(match[1]!)
  const unit = (match[2] ?? '').toLowerCase()
  if (unit === 'turn') value *= 360
  else if (unit === 'rad') value *= 180 / Math.PI
  return { value, percent: unit === '%' }
}

/** Split an `rgb()`/`hsl()` argument list written with commas, spaces, or `/`. */
function splitChannels(body: string): string[] {
  return body
    .split(/[,/\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** Read the first three tokens as RGB channels (percent or 0-255). */
function parseRgbChannels(parts: readonly string[]): Rgb | undefined {
  const channels: number[] = []
  for (const part of parts.slice(0, 3)) {
    const parsed = parseChannelNumber(part)
    if (!parsed) return undefined
    channels.push(parsed.percent ? (parsed.value * 255) / 100 : parsed.value)
  }
  return { r: clampChannel(channels[0]!), g: clampChannel(channels[1]!), b: clampChannel(channels[2]!) }
}

/** Read the first three tokens as HSL channels; alpha suffixes are ignored. */
function parseHslChannels(parts: readonly string[]): Hsl | undefined {
  const hue = parseChannelNumber(parts[0]!)
  const sat = parseChannelNumber(parts[1]!)
  const light = parseChannelNumber(parts[2]!)
  if (!hue || !sat || !light || hue.percent) return undefined
  return { h: mod360(hue.value), s: clamp(sat.value, 0, 100), l: clamp(light.value, 0, 100) }
}

/**
 * Parse any supported color spelling into 8-bit sRGB.
 *
 * Accepted: `#rgb`, `#rrggbb` (with or without `#`), `rgb()`/`rgba()`,
 * `hsl()`/`hsla()` in both comma and space syntax, and a bare `r, g, b`
 * triple. An alpha channel is accepted but ignored, because every tool here
 * works on opaque colors.
 * @param raw - the caller-supplied color string.
 * @returns either the parsed color or a human-readable reason.
 */
function parseColor(raw: string): ColorParse {
  const input = raw.trim()
  if (input.length === 0) {
    return { ok: false, error: 'empty color; pass #hex, rgb(...), hsl(...), or a bare "r, g, b" triple' }
  }

  const functional = /^([a-z]+)\s*\(([^()]*)\)$/i.exec(input)
  if (functional) {
    const fn = functional[1]!.toLowerCase()
    const parts = splitChannels(functional[2]!)
    if (parts.length < 3) return { ok: false, error: `"${input}" needs three channels` }
    if (fn === 'rgb' || fn === 'rgba') {
      const rgb = parseRgbChannels(parts)
      return rgb ? { ok: true, rgb } : { ok: false, error: `"${input}" has a non-numeric rgb channel` }
    }
    if (fn === 'hsl' || fn === 'hsla') {
      const hsl = parseHslChannels(parts)
      return hsl ? { ok: true, rgb: hslToRgb(hsl) } : { ok: false, error: `"${input}" has a non-numeric hsl channel` }
    }
    return { ok: false, error: `unsupported color function "${fn}()"; use rgb(), hsl(), or #hex` }
  }

  const digits = input.startsWith('#') ? input.slice(1) : input
  if (/^[0-9a-f]+$/i.test(digits)) {
    if (digits.length === 3 || digits.length === 6) {
      const full = digits.length === 3
        ? Array.from(digits, (char) => char + char).join('')
        : digits
      const value = Number.parseInt(full, 16)
      return { ok: true, rgb: { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 } }
    }
    if (digits.length === 4 || digits.length === 8) {
      return { ok: false, error: `"${input}" carries an alpha channel; pass the opaque color` }
    }
    return { ok: false, error: `hex colors need 3 or 6 digits ("${input}")` }
  }

  if (/^[-+.\d\s,%]+$/.test(input)) {
    const rgb = parseRgbChannels(splitChannels(input))
    if (rgb) return { ok: true, rgb }
    return { ok: false, error: `"${input}" is not a readable "r, g, b" triple` }
  }

  return { ok: false, error: `unsupported color "${input}"; use #hex, rgb(...), hsl(...), or a bare "r, g, b" triple` }
}

/* -------------------------------------------------------------------------- */
/* Tool output shapes                                                          */
/* -------------------------------------------------------------------------- */

/** One fully-resolved color in every supported notation. */
interface ColorRecord {
  hex: string
  red: number
  green: number
  blue: number
  hue: number
  saturation: number
  lightness: number
  rgbCss: string
  hslCss: string
  luminance: number
}

/** Zero-filled record used when `ok` is false (documented to the model). */
const EMPTY_RECORD: ColorRecord = {
  hex: '',
  red: 0,
  green: 0,
  blue: 0,
  hue: 0,
  saturation: 0,
  lightness: 0,
  rgbCss: '',
  hslCss: '',
  luminance: 0,
}

/**
 * Expand one color into all notations reported by `color_convert`.
 * @param rgb - 8-bit channels.
 * @param upper - hex casing policy from {@link Config}.
 * @returns the canonical record.
 */
function toRecord(rgb: Rgb, upper: boolean): ColorRecord {
  const hsl = rgbToHsl(rgb)
  return {
    hex: formatHex(rgb, upper),
    red: rgb.r,
    green: rgb.g,
    blue: rgb.b,
    hue: round(hsl.h, 1),
    saturation: round(hsl.s, 1),
    lightness: round(hsl.l, 1),
    rgbCss: formatRgbCss(rgb),
    hslCss: formatHslCss(hsl),
    luminance: round(relativeLuminance(rgb), 4),
  }
}

/** Harmony recipes keyed by the model-facing type name. */
const HARMONY_TYPES = [
  'complementary',
  'analogous',
  'triadic',
  'split_complementary',
  'square',
  'tetradic',
  'monochromatic',
] as const

type HarmonyType = (typeof HARMONY_TYPES)[number]

/** One generated swatch. */
interface HarmonyEntry {
  hex: string
  rgbCss: string
  relation: string
  hueShift: number
  lightnessShift: number
}

/** Rotation/lightness plan for each harmony type (the base entry is always first). */
const HARMONY_RECIPES: Record<HarmonyType, readonly { hue: number; lightness: number; relation: string }[]> = {
  complementary: [{ hue: 180, lightness: 0, relation: 'complement (+180 deg)' }],
  analogous: [
    { hue: -30, lightness: 0, relation: 'analogous (-30 deg)' },
    { hue: 30, lightness: 0, relation: 'analogous (+30 deg)' },
  ],
  triadic: [
    { hue: 120, lightness: 0, relation: 'triad (+120 deg)' },
    { hue: 240, lightness: 0, relation: 'triad (+240 deg)' },
  ],
  split_complementary: [
    { hue: 150, lightness: 0, relation: 'split complement (+150 deg)' },
    { hue: 210, lightness: 0, relation: 'split complement (+210 deg)' },
  ],
  square: [
    { hue: 90, lightness: 0, relation: 'square (+90 deg)' },
    { hue: 180, lightness: 0, relation: 'square (+180 deg)' },
    { hue: 270, lightness: 0, relation: 'square (+270 deg)' },
  ],
  tetradic: [
    { hue: 60, lightness: 0, relation: 'tetradic (+60 deg)' },
    { hue: 180, lightness: 0, relation: 'tetradic (+180 deg)' },
    { hue: 240, lightness: 0, relation: 'tetradic (+240 deg)' },
  ],
  monochromatic: [
    { hue: 0, lightness: -32, relation: 'monochromatic (darker)' },
    { hue: 0, lightness: -16, relation: 'monochromatic (dark)' },
    { hue: 0, lightness: 16, relation: 'monochromatic (light)' },
    { hue: 0, lightness: 32, relation: 'monochromatic (lighter)' },
  ],
}

/** Lightest and darkest lightness a generated ramp may reach, in percent. */
const RAMP_TOP = 95
const RAMP_BOTTOM = 10

/** Resolved deployment policy with defensive fallbacks. */
interface ResolvedConfig {
  maxShades: number
  hexUppercase: boolean
}

/**
 * Normalize operator configuration.
 * @param config - deployment's explicit config.
 * @returns clamped values the tools can rely on.
 */
function resolveConfig(config: Config): ResolvedConfig {
  const requested = Number.isFinite(config.maxShades) ? Math.floor(config.maxShades) : 12
  return {
    maxShades: clamp(requested, 2, 64),
    hexUppercase: config.hexUppercase !== false,
  }
}

/**
 * Build the harmony palette for one base color.
 * @param base - base color in HSL.
 * @param type - harmony recipe name.
 * @param upper - hex casing policy.
 * @returns the base entry followed by every generated swatch.
 */
function buildHarmony(base: Hsl, type: HarmonyType, upper: boolean): HarmonyEntry[] {
  const entries: HarmonyEntry[] = []
  const push = (hueShift: number, lightnessShift: number, relation: string): void => {
    const l = clamp(base.l + lightnessShift, 2, 98)
    const rgb = hslToRgb({ h: mod360(base.h + hueShift), s: base.s, l })
    entries.push({
      hex: formatHex(rgb, upper),
      rgbCss: formatRgbCss(rgb),
      relation,
      hueShift: round(hueShift, 1),
      lightnessShift: round(l - base.l, 1),
    })
  }
  push(0, 0, 'base')
  const recipe = HARMONY_RECIPES[type] ?? HARMONY_RECIPES.complementary
  for (const step of recipe) push(step.hue, step.lightness, step.relation)
  return entries
}

/** One stop of a generated lightness ramp. */
interface RampEntry {
  index: number
  lightness: number
  hex: string
  rgbCss: string
  isBase: boolean
}

/**
 * Build an evenly-spaced lightness ramp that keeps the base hue and saturation.
 * @param base - base color in HSL.
 * @param count - number of stops to emit.
 * @param upper - hex casing policy.
 * @returns stops ordered lightest to darkest, with the nearest to the base flagged.
 */
function buildRamp(base: Hsl, count: number, upper: boolean): RampEntry[] {
  const stops: RampEntry[] = []
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1)
    const l = RAMP_TOP + (RAMP_BOTTOM - RAMP_TOP) * t
    const rgb = hslToRgb({ h: base.h, s: base.s, l })
    stops.push({ index: i + 1, lightness: round(l, 1), hex: formatHex(rgb, upper), rgbCss: formatRgbCss(rgb), isBase: false })
  }
  let nearest = 0
  for (let i = 1; i < stops.length; i += 1) {
    if (Math.abs(stops[i]!.lightness - base.l) < Math.abs(stops[nearest]!.lightness - base.l)) nearest = i
  }
  if (stops.length > 0) stops[nearest]!.isBase = true
  return stops
}

/**
 * Register the color tools on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment's explicit plugin policy.
 */
export function apply(ctx: Context, config: Config): void {
  const policy = resolveConfig(config)

  ctx.tools.register(defineTool({
    name: 'color_convert',
    description:
      'Convert one color between HEX, RGB, and HSL. Pass any spelling — "#ff8a00", ' +
      '"rgb(255, 138, 0)", "hsl(32.4, 100%, 50%)", or a bare "255, 138, 0" — and get ' +
      'back every notation plus the WCAG relative luminance. Alpha is ignored.',
    parameters: {
      color: {
        type: 'string',
        required: true,
        description: 'The color to convert, in hex, rgb(), hsl(), or bare "r, g, b" form.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'Whether the color parsed.' },
          error: { type: 'string', required: true, description: 'Why parsing failed; empty when ok is true.' },
          input: { type: 'string', required: true, description: 'The trimmed color string that was supplied.' },
          hex: { type: 'string', required: true, description: 'HEX notation, e.g. #FF8A00. Empty when ok is false.' },
          red: { type: 'integer', required: true, description: 'Red channel 0-255.' },
          green: { type: 'integer', required: true, description: 'Green channel 0-255.' },
          blue: { type: 'integer', required: true, description: 'Blue channel 0-255.' },
          hue: { type: 'number', required: true, description: 'Hue in degrees, 0-360.' },
          saturation: { type: 'number', required: true, description: 'HSL saturation in percent, 0-100.' },
          lightness: { type: 'number', required: true, description: 'HSL lightness in percent, 0-100.' },
          rgbCss: { type: 'string', required: true, description: 'CSS rgb() function, e.g. rgb(255, 138, 0).' },
          hslCss: { type: 'string', required: true, description: 'CSS hsl() function, e.g. hsl(32.4, 100%, 50%).' },
          luminance: { type: 'number', required: true, description: 'WCAG 2.1 relative luminance in [0, 1].' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `${value.hex}  ${value.rgbCss}  ${value.hslCss}\nrelative luminance ${value.luminance}`
          : value.error,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const input = args.color.trim()
      const parsed = parseColor(input)
      if (!parsed.ok) {
        return Promise.resolve({ ok: false as const, error: parsed.error, input, ...EMPTY_RECORD })
      }
      return Promise.resolve({ ok: true as const, error: '', input, ...toRecord(parsed.rgb, policy.hexUppercase) })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'color_harmony',
    description:
      'Generate a harmony palette from one base color. type is one of complementary, ' +
      'analogous, triadic, split_complementary, square, tetradic, monochromatic. ' +
      'The first swatch is always the base color; hue rotations keep saturation and ' +
      'lightness, monochromatic keeps hue and saturation.',
    parameters: {
      color: { type: 'string', required: true, description: 'Base color in any supported spelling.' },
      type: {
        type: 'string',
        required: true,
        enum: HARMONY_TYPES,
        description: 'Harmony scheme to generate.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'Whether the base color parsed.' },
          error: { type: 'string', required: true, description: 'Why parsing failed; empty when ok is true.' },
          base: { type: 'string', required: true, description: 'Normalized HEX of the base color; empty when ok is false.' },
          type: { type: 'string', required: true, description: 'Echo of the requested harmony type.' },
          colors: {
            type: 'array',
            required: true,
            description: 'The palette: base entry first, then each generated swatch.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                hex: { type: 'string', required: true, description: 'HEX notation of the swatch.' },
                rgbCss: { type: 'string', required: true, description: 'CSS rgb() function of the swatch.' },
                relation: { type: 'string', required: true, description: 'Human-readable role relative to the base.' },
                hueShift: { type: 'number', required: true, description: 'Degrees rotated from the base hue.' },
                lightnessShift: { type: 'number', required: true, description: 'Lightness percentage applied from the base (after clamping).' },
              },
            },
          },
          hexList: {
            type: 'array',
            required: true,
            description: 'Plain HEX list in palette order, ready to paste into CSS.',
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `${value.type} harmony from ${value.base}:\n- ${value.colors.map((c) => `${c.hex}  ${c.rgbCss}  ${c.relation}`).join('\n- ')}`
          : value.error,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const type = String(args.type)
      const parsed = parseColor(args.color)
      if (!parsed.ok) {
        return Promise.resolve({ ok: false as const, error: parsed.error, base: '', type, colors: [], hexList: [] })
      }
      const colors = buildHarmony(rgbToHsl(parsed.rgb), (HARMONY_TYPES as readonly string[]).includes(type)
        ? (type as HarmonyType)
        : 'complementary', policy.hexUppercase)
      return Promise.resolve({
        ok: true as const,
        error: '',
        base: colors[0]!.hex,
        type,
        colors,
        hexList: colors.map((color) => color.hex),
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'color_contrast',
    description:
      'Compute the WCAG 2.1 contrast ratio between a foreground (text) color and a ' +
      'background color, and report the pass/fail verdicts: AA needs 4.5:1 for normal ' +
      'text and 3:1 for large text or UI components, AAA needs 7:1 and 4.5:1.',
    parameters: {
      foreground: { type: 'string', required: true, description: 'The text or icon color, any supported spelling.' },
      background: { type: 'string', required: true, description: 'The color behind it, any supported spelling.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'Whether both colors parsed.' },
          error: { type: 'string', required: true, description: 'Which color failed to parse; empty when ok is true.' },
          foreground: { type: 'string', required: true, description: 'Normalized HEX foreground; empty when ok is false.' },
          background: { type: 'string', required: true, description: 'Normalized HEX background; empty when ok is false.' },
          ratio: { type: 'number', required: true, description: 'Contrast ratio in [1, 21], two decimals. 0 when ok is false.' },
          rating: {
            type: 'string',
            required: true,
            description: 'Best applicable WCAG label: AAA, AA, AA Large, Fail, or None when ok is false.',
          },
          passAA: { type: 'boolean', required: true, description: 'Ratio at least 4.5:1 (normal text).' },
          passAALargeText: { type: 'boolean', required: true, description: 'Ratio at least 3:1 (18pt+ or 14pt bold).' },
          passAANonText: { type: 'boolean', required: true, description: 'Ratio at least 3:1 (UI components and graphics).' },
          passAAA: { type: 'boolean', required: true, description: 'Ratio at least 7:1 (enhanced normal text).' },
          passAAALargeText: { type: 'boolean', required: true, description: 'Ratio at least 4.5:1 (enhanced large text).' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `${value.ratio}:1 between ${value.foreground} and ${value.background} — ${value.rating}\n` +
            `AA normal ${value.passAA ? 'PASS' : 'FAIL'} · AA large ${value.passAALargeText ? 'PASS' : 'FAIL'} · ` +
            `AA non-text ${value.passAANonText ? 'PASS' : 'FAIL'} · AAA normal ${value.passAAA ? 'PASS' : 'FAIL'}`
          : value.error,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const fg = parseColor(args.foreground)
      if (!fg.ok) {
        return Promise.resolve({ ok: false as const, error: `foreground: ${fg.error}`, foreground: '', background: '', ratio: 0, rating: 'None', passAA: false, passAALargeText: false, passAANonText: false, passAAA: false, passAAALargeText: false })
      }
      const bg = parseColor(args.background)
      if (!bg.ok) {
        return Promise.resolve({ ok: false as const, error: `background: ${bg.error}`, foreground: '', background: '', ratio: 0, rating: 'None', passAA: false, passAALargeText: false, passAANonText: false, passAAA: false, passAAALargeText: false })
      }
      const ratio = contrastRatio(fg.rgb, bg.rgb)
      const rounded = round(ratio, 2)
      const passAA = ratio >= 4.5
      return Promise.resolve({
        ok: true as const,
        error: '',
        foreground: formatHex(fg.rgb, policy.hexUppercase),
        background: formatHex(bg.rgb, policy.hexUppercase),
        ratio: rounded,
        rating: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Fail',
        passAA,
        passAALargeText: ratio >= 3,
        passAANonText: ratio >= 3,
        passAAA: ratio >= 7,
        passAAALargeText: ratio >= 4.5,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'color_shades',
    description:
      'Generate a lightness ramp (tints to shades) for one base color, keeping its hue ' +
      'and saturation. Pass count as the number of steps you need; it is clamped to the ' +
      'configured maximum. Steps are ordered lightest first, and the stop nearest the ' +
      'base color is flagged with isBase.',
    parameters: {
      color: { type: 'string', required: true, description: 'Base color in any supported spelling.' },
      count: { type: 'integer', required: true, description: 'Desired number of steps (2 or more; clamped by config).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true, description: 'Whether the base color parsed.' },
          error: { type: 'string', required: true, description: 'Why parsing failed; empty when ok is true.' },
          base: { type: 'string', required: true, description: 'Normalized HEX of the base color; empty when ok is false.' },
          requestedCount: { type: 'integer', required: true, description: 'The count the caller asked for.' },
          count: { type: 'integer', required: true, description: 'The count actually produced after clamping.' },
          steps: {
            type: 'array',
            required: true,
            description: 'Ramp stops, lightest to darkest.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'integer', required: true, description: '1-based position in the ramp.' },
                lightness: { type: 'number', required: true, description: 'HSL lightness of this stop, in percent.' },
                hex: { type: 'string', required: true, description: 'HEX notation of this stop.' },
                rgbCss: { type: 'string', required: true, description: 'CSS rgb() function of this stop.' },
                isBase: { type: 'boolean', required: true, description: 'True on the single stop closest to the base color.' },
              },
            },
          },
          hexList: {
            type: 'array',
            required: true,
            description: 'Plain HEX list in ramp order, ready to paste into CSS.',
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `${value.count}-step ramp from ${value.base} (lightest to darkest):\n- ` +
            value.steps.map((s) => `${s.index}. ${s.hex}  l=${s.lightness}%${s.isBase ? '  <- nearest base' : ''}`).join('\n- ')
          : value.error,
      }],
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const parsed = parseColor(args.color)
      if (!parsed.ok) {
        return Promise.resolve({
          ok: false as const,
          error: parsed.error,
          base: '',
          requestedCount: args.count,
          count: 0,
          steps: [],
          hexList: [],
        })
      }
      const requested = Number.isFinite(args.count) ? Math.floor(args.count) : 2
      const count = clamp(requested, 2, policy.maxShades)
      const steps = buildRamp(rgbToHsl(parsed.rgb), count, policy.hexUppercase)
      return Promise.resolve({
        ok: true as const,
        error: '',
        base: formatHex(parsed.rgb, policy.hexUppercase),
        requestedCount: requested,
        count,
        steps,
        hexList: steps.map((step) => step.hex),
      })
    },
  }))
}
