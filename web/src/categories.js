// Item categories: 가전(appliance) / 가구(furniture). Null/unknown → 기타.
// "Bloom" palette: appliances read as cool teal, furniture as warm amber.

export const CATEGORY_ORDER = ['appliance', 'furniture', 'uncategorized'];

export const CATEGORY_META = {
  appliance: { label: '가전', color: '#2e8a82', soft: '#e5f5f3' },
  furniture: { label: '가구', color: '#d2762f', soft: '#fceee2' },
  uncategorized: { label: '기타', color: '#6b6875', soft: '#eef0f6' },
};

export function catKey(category) {
  return category === 'appliance' || category === 'furniture' ? category : 'uncategorized';
}

export function catLabel(category) {
  return CATEGORY_META[catKey(category)].label;
}

export function catColor(category) {
  return CATEGORY_META[catKey(category)].color;
}

export function catSoft(category) {
  return CATEGORY_META[catKey(category)].soft;
}
