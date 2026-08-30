import React from 'react';
const NS = 'color-palette';
const zh = { title: '颜色工具', description: '颜色转换、和谐配色、对比度', enabled: '启用插件' };
const en = { title: 'Color Palette', description: 'Convert, harmony, contrast', enabled: 'Enable plugin' };
export const inject = ['settingsScope', 'slots', 'locale'];
export function apply(ctx: any) {
  ctx.effect?.(() => ctx.locale?.register?.(NS, { zh, en }), 'dsh-color: locale');
  ctx.effect?.(() => { ctx.slots?.inject?.('settings.plugin.item', function* () { yield ctx.slots.register({ name: 'settings.plugin.item', key: NS, locale: NS, inject: () => ({}) }, Card); }); }, 'dsh-color: settings');
}
function Card(props: any) {
  const { scope, t } = props;
  const [open, setOpen] = React.useState(false);
  return React.createElement('li', { style: { background: '#1a1a2e', color: '#e0e0e0', borderRadius: '8px', padding: '12px', marginBottom: '8px', border: '1px solid #333' } },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', cursor: 'pointer' }, onClick: () => setOpen(!open) },
      React.createElement('strong', null, '🎨 ', t('title')), React.createElement('span', { style: { fontSize: '12px', color: '#888' } }, open ? '▲' : '▼')),
    open ? React.createElement('div', { style: { padding: '8px 0', borderTop: '1px solid #333' } },
      React.createElement('label', { style: { display: 'flex', gap: '8px', cursor: 'pointer', fontSize: '13px' } },
        React.createElement('input', { type: 'checkbox', checked: scope?.get?.('enabled') ?? true, onChange: (e: any) => scope?.set?.('enabled', e.target.checked) }), t('enabled'))) : null);
}
