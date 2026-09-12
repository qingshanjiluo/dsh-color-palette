/**
 * Loads the built artifact and asserts it exports the Cordis function-plugin
 * face the harness loader requires, then runs one tool end-to-end. Run after
 * `npm run build`.
 * @module
 */
import assert from 'node:assert/strict'

const mod = await import(new URL('../lib/index.js', import.meta.url).href)

assert.equal(mod.name, 'dsh-color-palette', 'plugin name export')
assert.ok(mod.Config, 'Config schema export present')
assert.deepEqual(Object.keys(mod.Config.dict ?? {}), ['maxShades', 'hexUppercase'], 'Config declares both fields')
assert.equal(mod.Config.dict.maxShades.type, 'number', 'integer budget uses z.number()')
assert.deepEqual(mod.inject, ['tools'], 'inject declares the tools service')
assert.equal(typeof mod.apply, 'function', 'apply is a function')
assert.equal(mod.default, undefined, 'no fabricated default export')

const registered = []
mod.apply({ tools: { register: (def) => registered.push(def) } }, { maxShades: 12, hexUppercase: true })
assert.deepEqual(registered.map((def) => def.name).sort(), [
  'color_contrast',
  'color_convert',
  'color_harmony',
  'color_shades',
], 'all four tools register')
assert.ok(registered.every((def) => def.description.length > 20), 'every tool carries a model-facing description')
assert.ok(registered.every((def) => typeof def.execute === 'function'), 'every tool has an executor')
assert.ok(registered.every((def) => def.output && typeof def.output.render === 'function'), 'every tool declares output render')

const convert = registered.find((def) => def.name === 'color_convert')
const converted = await convert.execute({ color: '#ff8a00' })
assert.equal(converted.ok, true, 'built artifact converts hex input')
assert.equal(converted.hex, '#FF8A00', 'uppercase hex policy applied')
assert.equal(converted.red, 255)
const contrast = registered.find((def) => def.name === 'color_contrast')
const ratio = await contrast.execute({ foreground: '#000000', background: '#FFFFFF' })
assert.equal(ratio.ratio, 21, 'WCAG maximum ratio computed')
assert.equal(ratio.rating, 'AAA')

console.log('load-smoke: ok —', registered.length, 'tools registered from built artifact')
