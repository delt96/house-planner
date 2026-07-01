function normalizePlacementRow(r) {
  return { ...r, x: Number(r.x), y: Number(r.y), rotation: Number(r.rotation) };
}

export async function confirmedDims(pool, itemId) {
  const { rows } = await pool.query(
    `SELECT c.width_cm, c.depth_cm
     FROM items i JOIN candidates c ON c.id = i.confirmed_candidate_id
     WHERE i.id = $1`,
    [itemId]
  );
  if (!rows[0]) return null;
  return {
    width_cm: rows[0].width_cm === null ? null : Number(rows[0].width_cm),
    depth_cm: rows[0].depth_cm === null ? null : Number(rows[0].depth_cm),
  };
}

export async function upsertPlacement(pool, itemId, { x, y, rotation }) {
  const { rows } = await pool.query(
    `INSERT INTO placements (item_id, x, y, rotation)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id) DO UPDATE
       SET x = EXCLUDED.x, y = EXCLUDED.y, rotation = EXCLUDED.rotation
     RETURNING *`,
    [itemId, x, y, rotation]
  );
  return normalizePlacementRow(rows[0]);
}

export async function deletePlacement(pool, itemId) {
  const { rowCount } = await pool.query('DELETE FROM placements WHERE item_id = $1', [itemId]);
  return rowCount > 0;
}
