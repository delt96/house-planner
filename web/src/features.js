// Display metadata/string helpers for room features (door/window/outlet). Framework-agnostic.

export const WALLS = ['N', 'E', 'S', 'W'];
export const WALL_LABEL = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };

export const SWINGS = ['in-left', 'in-right', 'out-left', 'out-right'];
export const SWING_LABEL = { 'in-left': '안·좌', 'in-right': '안·우', 'out-left': '밖·좌', 'out-right': '밖·우' };

export const FEATURE_META = {
  door: { label: '문', icon: '🚪' },
  window: { label: '창문', icon: '⊞' },
  outlet: { label: '콘센트', icon: '⚡' },
};

// One-line panel summary: "남쪽 · 모서리 30cm · 폭80 · 높이204 · 안·좌"
export function featureSummary(f) {
  const parts = [WALL_LABEL[f.wall], `모서리 ${f.offset_cm}cm`];
  if (f.width_cm != null) parts.push(`폭${f.width_cm}`);
  if (f.height_cm != null) parts.push(`높이${f.height_cm}`);
  if (f.kind === 'door' && f.swing) parts.push(SWING_LABEL[f.swing]);
  if (f.kind === 'window' && f.sill_height_cm != null) parts.push(`턱${f.sill_height_cm}`);
  if (f.kind === 'outlet' && f.floor_height_cm != null) parts.push(`바닥 ${f.floor_height_cm}cm`);
  return parts.join(' · ');
}

// Click chip for the floor-plan symbol. Vertical (height) info can't be drawn on a top-down plan, so it's split out here.
export function featureChip(f) {
  const parts = [];
  if (f.width_cm != null) parts.push(`W${f.width_cm}`);
  if (f.height_cm != null) parts.push(`H${f.height_cm}`);
  if (f.kind === 'window' && f.sill_height_cm != null) parts.push(`턱${f.sill_height_cm}`);
  if (f.kind === 'door' && f.swing) parts.push(SWING_LABEL[f.swing]);
  if (f.kind === 'outlet') parts.push(f.floor_height_cm != null ? `바닥 ${f.floor_height_cm}cm` : '콘센트');
  return parts.join(' · ');
}
