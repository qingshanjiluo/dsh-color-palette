# dsh-color-palette

> DeepSeek Harness 颜色工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ 功能特性

- 🎨 **颜色转换**: HEX/RGB/HSL 格式互转
- 🌈 **和谐配色**: 生成互补/类似/三色/分裂配色方案
- ♿ **对比度检查**: WCAG AA/AAA 标准对比度检测
- 🌓 **渐变色**: 生成明暗渐变色

## 📦 安装

```bash
npm install dsh-color-palette
```

## 🛠️ 工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `color_convert` | 颜色转换 | `color` |
| `color_harmony` | 和谐配色 | `color`, `type` |
| `color_contrast` | 对比度检查 | `color1`, `color2` |
| `color_shades` | 渐变色 | `color`, `count` |

## 📋 命令

- `/color convert <color>` — 转换
- `/color harmony <color>` — 配色
- `/color contrast <c1> <c2>` — 对比度
- `/color shades <color>` — 渐变

## ⚙️ 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 启用插件 |

## 📄 License

MIT
