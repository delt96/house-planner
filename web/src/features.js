// 방 부착물(문·창문·콘센트) 표시용 메타/문자열 헬퍼. 프레임워크 무관.

export const WALLS = ['N', 'E', 'S', 'W'];
export const WALL_LABEL = { N: '북쪽', E: '동쪽', S: '남쪽', W: '서쪽' };

export const SWINGS = ['in-left', 'in-right', 'out-left', 'out-right'];
export const SWING_LABEL = { 'in-left': '안·좌', 'in-right': '안·우', 'out-left': '밖·좌', 'out-right': '밖·우' };

export const FEATURE_META = {
  door: { label: '문', icon: '🚪' },
  window: { label: '창문', icon: '⊞' },
  outlet: { label: '콘센트', icon: '⚡' },
};

// 패널 한 줄 요약: "남쪽 · 모서리 30cm · 폭80 · 높이204 · 안·좌"
export function featureSummary(f) {
  const parts = [WALL_LABEL[f.wall], `모서리 ${f.offset_cm}cm`];
  if (f.width_cm != null) parts.push(`폭${f.width_cm}`);
  if (f.height_cm != null) parts.push(`높이${f.height_cm}`);
  if (f.kind === 'door' && f.swing) parts.push(SWING_LABEL[f.swing]);
  if (f.kind === 'window' && f.sill_height_cm != null) parts.push(`턱${f.sill_height_cm}`);
  if (f.kind === 'outlet' && f.floor_height_cm != null) parts.push(`바닥 ${f.floor_height_cm}cm`);
  return parts.join(' · ');
}

// 평면도 기호 클릭 칩. 수직(높이) 정보는 위에서 본 도면에 못 그리므로 여기로 분리한다.
export function featureChip(f) {
  const parts = [];
  if (f.width_cm != null) parts.push(`W${f.width_cm}`);
  if (f.height_cm != null) parts.push(`H${f.height_cm}`);
  if (f.kind === 'window' && f.sill_height_cm != null) parts.push(`턱${f.sill_height_cm}`);
  if (f.kind === 'door' && f.swing) parts.push(SWING_LABEL[f.swing]);
  if (f.kind === 'outlet') parts.push(f.floor_height_cm != null ? `바닥 ${f.floor_height_cm}cm` : '콘센트');
  return parts.join(' · ');
}
