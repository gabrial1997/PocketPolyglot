jest.mock('../services/supabaseClient', () => ({ supabase: {} }));

import { TABS } from './index';

it('includes a Settings tab routing to the settings destination', () => {
  const labels = TABS.map((t) => t.label);
  expect(labels).toContain('Settings');
  const settings = TABS.find((t) => t.route === 'settings');
  expect(settings).toBeDefined();
  expect(settings?.label).toBe('Settings');
});
