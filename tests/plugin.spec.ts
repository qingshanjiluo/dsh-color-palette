/**
 * Behavior tests for the color palette plugin: export face, registration set,
 * and at least one happy plus one edge case per tool. All assertions run the
 * pure in-process math — no network, filesystem, or subprocess.
 * @module
 */
import { describe, expect, it } from 'vitest'
import { assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { apply, Config, inject, name } from '../src/index.ts'

interface RenderBlock {
  type: string
  text: string
}

interface RegisteredTool {
  name: string
  execute(args: never, exec: never): Promise<Record<string, unknown>>
  output: { schema: unknown; render(args: never, value: never): RenderBlock[] }
  isConcurrencySafe?(args: unknown): boolean
}

type TestConfig = { maxShades?: number; hexUppercase?: boolean }

function mountPlugin(config: TestConfig = {}): RegisteredTool[] {
  const registered: RegisteredTool[] = []
  const ctx = { tools: { register: (def: RegisteredTool) => registered.push(def) } }
  // The plugin only reads ctx.tools, so this stub is the whole registrant surface.
  apply(ctx as never, { maxShades: 12, hexUppercase: true, ...config } as never)
  return registered
}

function tool(toolName: string, config: TestConfig = {}): RegisteredTool {
  const found = mountPlugin(config).find((candidate) => candidate.name === toolName)
  if (!found) throw new Error(`${toolName} was not registered`)
  return found
}

async function run(toolName: string, args: Record<string, unknown>, config: TestConfig = {}): Promise<Record<string, unknown>> {
  return tool(toolName, config).execute(args as never, {} as never)
}

describe('plugin contract', () => {
  it('exports the loader plugin face', () => {
    expect(name).toBe('dsh-color-palette')
    expect(inject).toEqual(['tools'])
    expect(typeof apply).toBe('function')
    expect(Config).toBeInstanceOf(Object)
  })

  it('registers the four documented tools, all concurrency-safe', () => {
    const tools = mountPlugin()
    expect(tools.map((entry) => entry.name).sort()).toEqual([
      'color_contrast',
      'color_convert',
      'color_harmony',
      'color_shades',
    ])
    const validArgs: Record<string, Record<string, unknown>> = {
      color_convert: { color: '#ff8a00' },
      color_harmony: { color: '#ff8a00', type: 'triadic' },
      color_contrast: { foreground: '#000', background: '#fff' },
      color_shades: { color: '#ff8a00', count: 5 },
    }
    for (const entry of tools) {
      // defineTool only reports parallel for well-formed arguments.
      expect(entry.isConcurrencySafe?.(validArgs[entry.name])).toBe(true)
      expect(entry.isConcurrencySafe?.({})).toBe(false)
    }
  })

  it('rejects malformed arguments before running any math', async () => {
    await expect(run('color_convert', {})).rejects.toThrow(/invalid arguments/)
    await expect(run('color_shades', { color: '#ff8a00', count: 'five' })).rejects.toThrow(/invalid arguments/)
  })
})

describe('color_convert', () => {
  it('expands a hex color into every notation', async () => {
    const result = await run('color_convert', { color: '#ff8a00' })
    expect(result).toMatchObject({
      ok: true,
      error: '',
      input: '#ff8a00',
      hex: '#FF8A00',
      red: 255,
      green: 138,
      blue: 0,
      hue: 32.5,
      saturation: 100,
      lightness: 50,
      rgbCss: 'rgb(255, 138, 0)',
      hslCss: 'hsl(32.5, 100%, 50%)',
    })
    expect(result.luminance).toBeCloseTo(0.3944, 4)
  })

  it('accepts space-separated rgb() and shorthand hex', async () => {
    const spaced = await run('color_convert', { color: 'rgb(0 128 255)' })
    expect(spaced).toMatchObject({ ok: true, hex: '#0080FF', red: 0, green: 128, blue: 255 })
    const shorthand = await run('color_convert', { color: 'f0a' })
    expect(shorthand).toMatchObject({ ok: true, hex: '#FF00AA' })
  })

  it('round-trips an hsl() input to within 8-bit channel quantization', async () => {
    const result = await run('color_convert', { color: 'hsl(200, 60%, 40%)' })
    expect(result.ok).toBe(true)
    expect(result.hex).toBe('#297AA3')
    expect(Math.abs(Number(result.hue) - 200)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(Number(result.saturation) - 60)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(Number(result.lightness) - 40)).toBeLessThanOrEqual(0.5)
  })

  it('honors the hexUppercase policy', async () => {
    const result = await run('color_convert', { color: '#ff8a00' }, { hexUppercase: false })
    expect(result.hex).toBe('#ff8a00')
  })

  it('rejects unreadable colors and alpha-bearing hex', async () => {
    const junk = await run('color_convert', { color: 'chartreuse-ish' })
    expect(junk.ok).toBe(false)
    expect(junk.error).toContain('unsupported color')
    expect(junk.hex).toBe('')
    const alpha = await run('color_convert', { color: '#ff00' })
    expect(alpha.ok).toBe(false)
    expect(alpha.error).toContain('alpha')
  })

  it('renders a text block for the model', async () => {
    const value = await run('color_convert', { color: '#000' })
    const blocks = tool('color_convert').output.render({ color: '#000' } as never, value as never)
    expect(blocks[0]).toMatchObject({ type: 'text' })
    expect(String(blocks[0]!.text)).toContain('#000000')
  })
})

describe('color_harmony', () => {
  it('builds a complementary pair whose second hue is 180 degrees away', async () => {
    const result = await run('color_harmony', { color: '#ff8a00', type: 'complementary' })
    expect(result.base).toBe('#FF8A00')
    const colors = result.colors as { hex: string; relation: string; hueShift: number }[]
    expect(colors).toHaveLength(2)
    expect(colors[0]!.relation).toBe('base')
    expect(colors[1]!.hueShift).toBe(180)
    const complement = await run('color_convert', { color: colors[1]!.hex })
    expect(Math.abs(Number(complement.hue) - 212.5)).toBeLessThanOrEqual(1)
  })

  it('builds triadic and analogous palettes of the expected size', async () => {
    const triadic = await run('color_harmony', { color: '#ff8a00', type: 'triadic' })
    const hues = triadic.colors as { hueShift: number }[]
    expect(hues.map((entry) => entry.hueShift)).toEqual([0, 120, 240])
    expect((triadic.hexList as string[]).filter((hex, index, all) => all.indexOf(hex) === index)).toHaveLength(3)
    const analogous = await run('color_harmony', { color: '#ff8a00', type: 'analogous' })
    expect((analogous.colors as unknown[]).map(() => 1)).toHaveLength(3)
  })

  it('keeps one hue across a monochromatic palette', async () => {
    const result = await run('color_harmony', { color: '#ff8a00', type: 'monochromatic' })
    const colors = result.colors as { hex: string }[]
    expect(colors).toHaveLength(5)
    for (const entry of colors) {
      const converted = await run('color_convert', { color: entry.hex })
      expect(Math.abs(Number(converted.hue) - 32.5)).toBeLessThanOrEqual(1)
    }
  })

  it('fails cleanly on an unparsable base and rejects an out-of-enum type', async () => {
    const bad = await run('color_harmony', { color: 'nope', type: 'triadic' })
    expect(bad.ok).toBe(false)
    expect(bad.colors).toEqual([])
    expect(String(bad.error)).toContain('unsupported color')
    // The registry validates `enum` before execute, so an invented scheme never reaches the math.
    await expect(run('color_harmony', { color: '#ff8a00', type: 'vibes' })).rejects.toThrow(/must be one of/)
  })
})

describe('color_contrast', () => {
  it('scores black on white at the 21:1 maximum', async () => {
    const result = await run('color_contrast', { foreground: '#000000', background: '#FFFFFF' })
    expect(result).toMatchObject({
      ok: true,
      ratio: 21,
      rating: 'AAA',
      passAA: true,
      passAAA: true,
      passAALargeText: true,
      passAANonText: true,
      passAAALargeText: true,
    })
  })

  it('applies the 4.5:1 AA boundary', async () => {
    const passing = await run('color_contrast', { foreground: '#767676', background: '#ffffff' })
    expect(passing.ratio).toBeCloseTo(4.54, 2)
    expect(passing.passAA).toBe(true)
    expect(passing.passAAA).toBe(false)
    expect(passing.rating).toBe('AA')
    const failing = await run('color_contrast', { foreground: '#777777', background: '#ffffff' })
    expect(failing.ratio).toBeCloseTo(4.48, 2)
    expect(failing.passAA).toBe(false)
    expect(failing.rating).toBe('AA Large')
  })

  it('is symmetric and mixes notations', async () => {
    const oneWay = await run('color_contrast', { foreground: 'hsl(0, 0%, 0%)', background: '#FFFFFF' })
    const other = await run('color_contrast', { foreground: '#FFFFFF', background: 'rgb(0 0 0)' })
    expect(oneWay.ratio).toBe(other.ratio)
    expect(oneWay.ratio).toBe(21)
  })

  it('reports 1:1 for identical colors and names the failing input', async () => {
    const same = await run('color_contrast', { foreground: '#123456', background: 'rgb(18, 52, 86)' })
    expect(same).toMatchObject({ ok: true, ratio: 1, rating: 'Fail', passAA: false })
    const bad = await run('color_contrast', { foreground: '#000000', background: 'banana' })
    expect(bad.ok).toBe(false)
    expect(String(bad.error)).toContain('background')
    expect(bad.ratio).toBe(0)
  })
})

describe('color_shades', () => {
  it('emits an ordered lightest-to-darkest ramp with one base stop', async () => {
    const result = await run('color_shades', { color: '#ff8a00', count: 5 })
    const steps = result.steps as { index: number; lightness: number; hex: string; isBase: boolean }[]
    expect(result).toMatchObject({ ok: true, base: '#FF8A00', requestedCount: 5, count: 5 })
    expect(steps.map((step) => step.index)).toEqual([1, 2, 3, 4, 5])
    expect(steps[0]!.lightness).toBe(95)
    expect(steps[4]!.lightness).toBe(10)
    expect(steps.every((step, i) => i === 0 || step.lightness < steps[i - 1]!.lightness)).toBe(true)
    expect(steps.filter((step) => step.isBase)).toHaveLength(1)
    expect(steps.every((step) => /^#[0-9A-F]{6}$/.test(step.hex))).toBe(true)
    expect(result.hexList).toEqual(steps.map((step) => step.hex))
  })

  it('preserves the base hue along the ramp', async () => {
    const result = await run('color_shades', { color: '#ff8a00', count: 8 })
    for (const step of result.steps as { hex: string }[]) {
      const converted = await run('color_convert', { color: step.hex })
      expect(Math.abs(Number(converted.hue) - 32.5)).toBeLessThanOrEqual(1.5)
    }
  })

  it('clamps the requested count to the configured maximum and floor', async () => {
    const capped = await run('color_shades', { color: '#3366cc', count: 99 }, { maxShades: 6 })
    expect(capped).toMatchObject({ requestedCount: 99, count: 6 })
    expect((capped.steps as unknown[])).toHaveLength(6)
    const floored = await run('color_shades', { color: '#3366cc', count: 1 })
    expect(floored.count).toBe(2)
    expect((floored.steps as unknown[])).toHaveLength(2)
  })

  it('fails cleanly on an unparsable base color', async () => {
    const result = await run('color_shades', { color: '#gg', count: 4 })
    expect(result.ok).toBe(false)
    expect(result.steps).toEqual([])
    expect(result.requestedCount).toBe(4)
    expect(String(result.error).length).toBeGreaterThan(0)
  })
})

describe('output contracts', () => {
  const cases: readonly { tool: string; args: Record<string, unknown> }[] = [
    { tool: 'color_convert', args: { color: '#ff8a00' } },
    { tool: 'color_convert', args: { color: 'sunrise' } },
    { tool: 'color_harmony', args: { color: 'hsl(210, 80%, 45%)', type: 'triadic' } },
    { tool: 'color_harmony', args: { color: 'hsl(210, 80%, 45%)', type: 'monochromatic' } },
    { tool: 'color_harmony', args: { color: 'nonsense', type: 'square' } },
    { tool: 'color_contrast', args: { foreground: '#767676', background: '#ffffff' } },
    { tool: 'color_contrast', args: { foreground: '#767676', background: 'oops' } },
    { tool: 'color_shades', args: { color: 'rgb(51 102 204)', count: 7 } },
    { tool: 'color_shades', args: { color: '#c0ffee', count: 2 } },
    { tool: 'color_shades', args: { color: '#c0ffee', count: 1000 } },
  ]

  it('declares an object-rooted schema for every tool', () => {
    for (const entry of mountPlugin()) {
      expect(() => assertObjectJsonSchema(entry.output.schema)).not.toThrow()
    }
  })

  for (const entryCase of cases) {
    it(`${entryCase.tool} returns a value that satisfies its own schema`, async () => {
      const entry = tool(entryCase.tool)
      const value = await entry.execute(entryCase.args as never, {} as never)
      expect(validateJsonSchemaValue(entry.output.schema as never, value)).toEqual([])
    })
  }
})
