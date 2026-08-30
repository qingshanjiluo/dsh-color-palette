import React from 'react';
import { createSettingsCard } from '@deepseek-ai/dsh-settings';

export default createSettingsCard({
  title: 'color-palette',
  description: '颜色工具',
  config: [
    { key: 'enabled', type: 'boolean', label: '启用插件', default: true },
  ],
});
