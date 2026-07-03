// Room features (door/window/outlet). Wall anchor: wall (N/E/S/W) + offset_cm (distance from the corner).

const NUM_COLS = ['offset_cm', 'width_cm', 'height_cm', 'sill_height_cm', 'floor_height_cm'];

export function normalizeFeatureRow(r) {
  const out = { ...r };
  for (const c of NUM_COLS) out[c] = r[c] === null || r[c] === undefined ? null : Number(r[c]);
  return out;
}

export async function listFeatures(pool) {
  const { rows } = await pool.query('SELECT * FROM room_features ORDER BY room_id, sort_order, id');
  return rows.map(normalizeFeatureRow);
}

export async function getFeature(pool, id) {
  const { rows } = await pool.query('SELECT * FROM room_features WHERE id = $1', [id]);
  return rows[0] ? normalizeFeatureRow(rows[0]) : null;
}

export async function createFeature(pool, roomId, f) {
  const { rows } = await pool.query(
    `INSERT INTO room_features (room_id, kind, wall, offset_cm, width_cm, height_cm, sill_height_cm, floor_height_cm, swing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [roomId, f.kind, f.wall, f.offset_cm, f.width_cm, f.height_cm, f.sill_height_cm, f.floor_height_cm, f.swing]
  );
  return normalizeFeatureRow(rows[0]);
}

// The route merges + fully validates, so this always overwrites the whole row.
export async function updateFeature(pool, id, f) {
  const { rows } = await pool.query(
    `UPDATE room_features
     SET kind = $1, wall = $2, offset_cm = $3, width_cm = $4, height_cm = $5,
         sill_height_cm = $6, floor_height_cm = $7, swing = $8
     WHERE id = $9 RETURNING *`,
    [f.kind, f.wall, f.offset_cm, f.width_cm, f.height_cm, f.sill_height_cm, f.floor_height_cm, f.swing, id]
  );
  return rows[0] ? normalizeFeatureRow(rows[0]) : null;
}

export async function deleteFeature(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM room_features WHERE id = $1', [id]);
  return rowCount > 0;
}
