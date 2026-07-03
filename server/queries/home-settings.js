// Carry-in constraints for our home. A single row (id = 1), seeded by migration 004.

export const HOME_SETTING_COLS = [
  'door_width_cm',
  'door_height_cm',
  'room_door_width_cm',
  'room_door_height_cm',
  'elevator_door_width_cm',
  'elevator_door_height_cm',
  'elevator_car_width_cm',
  'elevator_car_depth_cm',
  'elevator_car_height_cm',
];

export function normalizeHomeSettingsRow(r) {
  const out = { id: r.id, updated_at: r.updated_at };
  for (const c of HOME_SETTING_COLS) {
    out[c] = r[c] === null || r[c] === undefined ? null : Number(r[c]);
  }
  return out;
}

export async function getHomeSettings(pool) {
  const [settings, ceiling] = await Promise.all([
    pool.query('SELECT * FROM home_settings WHERE id = 1'),
    pool.query('SELECT MIN(ceiling_height_cm) AS min_ceiling FROM rooms'),
  ]);
  if (!settings.rows[0]) return null;
  const out = normalizeHomeSettingsRow(settings.rows[0]);
  // 파생 필드: 입력된 방 천장 중 최저값. 키 큰 가구의 '세울 수 있나' 경고에 쓴다.
  const min = ceiling.rows[0]?.min_ceiling;
  out.min_ceiling_height_cm = min === null || min === undefined ? null : Number(min);
  return out;
}

export async function saveHomeSettings(pool, value) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const c of HOME_SETTING_COLS) {
    if (c in value) { sets.push(`${c} = $${i++}`); vals.push(value[c]); }
  }
  sets.push('updated_at = now()');
  vals.push(1);
  const { rows } = await pool.query(
    `UPDATE home_settings SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? getHomeSettings(pool) : null; // 파생 필드 포함해 동일한 형태로 반환
}
