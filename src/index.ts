/**
 * dsh-color-palette — 颜色工具
 *
 * 功能：
 * 1. HEX/RGB/HSL转换
 * 2. 和谐配色
 * 3. WCAG对比度检查
 * 4. 渐变色生成
 *
 * 工具：color_convert, color_harmony, color_contrast, color_shades
 * 命令：/color
 * 配置：enabled
 */
import { z } from 'zod';
export const name = 'dsh-color-palette';
export const inject = ['settings', 'tools', 'commands'];
const configSchema = z.object({ enabled: z.boolean().default(true) });

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}
function rgbToHex(r: number, g: number, b: number): string { return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join(''); }
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1/3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1/3) * 255) };
}
function contrastRatio(rgb1: { r: number; g: number; b: number }, rgb2: { r: number; g: number; b: number }): number {
  const luminance = (rgb: { r: number; g: number; b: number }) => { const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs; };
  const l1 = luminance(rgb1), l2 = luminance(rgb2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function apply(ctx: any, config: Config) {
  if (!config.enabled) return;
  ctx.effect(() => ctx.tools.register({
    name: 'color_convert', description: '颜色格式转换（HEX/RGB/HSL）。',
    parameters: { color: { type: 'string', description: '颜色值（如 #ff0000, rgb(255,0,0), hsl(0,100,50)）' } },
    output: { schema: { type: 'json' }, render: (_a: unknown, v: unknown) => {
      const c = v as any; return [{ type: 'text', text: `## 🎨 颜色转换\nHEX: ${c.hex}\nRGB: rgb(${c.r}, ${c.g}, ${c.b})\nHSL: hsl(${c.h}, ${c.s}%, ${c.l}%)` }];
    }},
    async execute(args: { color: string }) {
      const input = args.color.trim();
      let r: number, g: number, b: number;
      if (input.startsWith('#')) { const rgb = hexToRgb(input); if (!rgb) throw new Error('无效 HEX'); ({ r, g, b } = rgb); }
      else if (input.startsWith('rgb')) { const m = input.match(/(\d+)/g)!.map(Number); [r, g, b] = m; }
      else if (input.startsWith('hsl')) { const m = input.match(/(\d+)/g)!.map(Number); const rgb = hslToRgb(m[0], m[1], m[2]); ({ r, g, b } = rgb); }
      else { const rgb = hexToRgb('#' + input); if (!rgb) throw new Error('无法解析颜色'); ({ r, g, b } = rgb); }
      const hsl = rgbToHsl(r, g, b);
      return { hex: rgbToHex(r, g, b), r, g, b, ...hsl };
    },
  }), 'dsh-color: convert');
  ctx.effect(() => ctx.tools.register({
    name: 'color_harmony', description: '生成和谐配色方案。',
    parameters: { color: { type: 'string', description: '基础颜色 HEX' }, type: { type: 'string', description: '类型：complementary | analogous | triadic | split' } },
    output: { schema: { type: 'json' }, render: (_a: unknown, v: unknown) => {
      const colors = v as string[]; return [{ type: 'text', text: '## 🎨 配色方案\n' + colors.map(c => `\`${c}\``).join(' | ') }];
    }},
    async execute(args: { color: string; type?: string }) {
      const rgb = hexToRgb(args.color); if (!rgb) throw new Error('无效颜色');
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const harmonies: Record<string, number[]> = { complementary: [180], analogous: [30, 60], triadic: [120, 240], split: [150, 210] };
      const offsets = harmonies[args.type || 'complementary'] || harmonies.complementary;
      return [args.color, ...offsets.map(off => { const h = (hsl.h + off) % 360; const c = hslToRgb(h, hsl.s, hsl.l); return rgbToHex(c.r, c.g, c.b); })];
    },
  }), 'dsh-color: harmony');
  ctx.effect(() => ctx.tools.register({
    name: 'color_contrast', description: 'WCAG 对比度检查。',
    parameters: { color1: { type: 'string', description: '颜色 1' }, color2: { type: 'string', description: '颜色 2' } },
    output: { schema: { type: 'json' }, render: (_a: unknown, v: unknown) => {
      const r = v as any; return [{ type: 'text', text: `## ♿ 对比度: ${r.ratio.toFixed(2)}:1\nAA 标准: ${r.ratio >= 4.5 ? '✅' : '❌'} | AAA 标准: ${r.ratio >= 7 ? '✅' : '❌'}` }];
    }},
    async execute(args: { color1: string; color2: string }) {
      const rgb1 = hexToRgb(args.color1), rgb2 = hexToRgb(args.color2);
      if (!rgb1 || !rgb2) throw new Error('无效颜色');
      return { ratio: contrastRatio(rgb1, rgb2) };
    },
  }), 'dsh-color: contrast');
  ctx.effect(() => ctx.tools.register({
    name: 'color_shades', description: '生成明暗渐变色。',
    parameters: { color: { type: 'string', description: '基础颜色 HEX' }, count: { type: 'number', description: '生成数量（默认 5）' } },
    output: { schema: { type: 'json' }, render: (_a: unknown, v: unknown) => {
      const colors = v as string[]; return [{ type: 'text', text: '## 🌈 渐变色\n' + colors.map(c => `\`${c}\``).join(' → ') }];
    }},
    async execute(args: { color: string; count?: number }) {
      const rgb = hexToRgb(args.color); if (!rgb) throw new Error('无效颜色');
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const count = args.count || 5;
      return Array.from({ length: count }, (_, i) => {
        const l = Math.round(20 + (60 / (count - 1)) * i);
        const c = hslToRgb(hsl.h, hsl.s, l);
        return rgbToHex(c.r, c.g, c.b);
      });
    },
  }), 'dsh-color: shades');
  ctx.effect(() => ctx.commands.register({
    name: 'color', description: '颜色工具', input: { hint: 'convert <color> | harmony <color> | contrast <c1> <c2>' },
    async handler() { return { kind: 'text', text: '用法: /color convert|harmony|contrast|shades' }; },
  }), 'dsh-color: command');
  ctx.inject(['settings'], (sctx: any) => { const { settingsNamespace } = require('@deepseek-ai/dsh-settings'); sctx.settings.register(settingsNamespace('color-palette'), configSchema, { base: config, expose: true, applies: 'live' }); });
}
