export async function listItems(pool) {
  const { rows } = await pool.query(
    `SELECT i.id, i.name, i.category, i.sort_order, i.confirmed_candidate_id, i.created_at,
            c.name AS confirmed_name, c.price AS confirmed_price,
            c.width_cm AS confirmed_width_cm, c.depth_cm AS confirmed_depth_cm,
            c.height_cm AS confirmed_height_cm
     FROM items i
     LEFT JOIN candidates c ON c.id = i.confirmed_candidate_id
     ORDER BY i.sort_order, i.id`
  );
  const { rows: counts } = await pool.query(
    'SELECT item_id, COUNT(*) AS n FROM candidates GROUP BY item_id'
  );
  const countBy = new Map(counts.map((r) => [r.item_id, Number(r.n)]));
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({
    ...r,
    confirmed_price: num(r.confirmed_price),
    confirmed_width_cm: num(r.confirmed_width_cm),
    confirmed_depth_cm: num(r.confirmed_depth_cm),
    confirmed_height_cm: num(r.confirmed_height_cm),
    candidate_count: countBy.get(r.id) ?? 0,
  }));
}

export async function getItem(pool, id) {
  const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getItemWithCandidates(pool, id) {
  const item = await getItem(pool, id);
  if (!item) return null;
  const { rows } = await pool.query(
    'SELECT * FROM candidates WHERE item_id = $1 ORDER BY sort_order, id',
    [id]
  );
  return { ...item, candidates: rows.map(normalizeCandidateRow) };
}

export async function createItem(pool, { name, category = null }) {
  const { rows } = await pool.query(
    'INSERT INTO items (name, category) VALUES ($1, $2) RETURNING *',
    [name, category]
  );
  return rows[0];
}

export async function updateItem(pool, id, data) {
  const sets = [];
  const vals = [];
  let i = 1;
  if ('name' in data) { sets.push(`name = $${i++}`); vals.push(data.name); }
  if ('category' in data) { sets.push(`category = $${i++}`); vals.push(data.category); }
  if ('sort_order' in data) { sets.push(`sort_order = $${i++}`); vals.push(data.sort_order); }
  if (sets.length === 0) return getItem(pool, id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

export async function deleteItem(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function setConfirmed(pool, itemId, candidateId) {
  const { rows } = await pool.query(
    `UPDATE items SET confirmed_candidate_id = $2
     WHERE id = $1 AND $2 IN (SELECT id FROM candidates WHERE item_id = $1)
     RETURNING *`,
    [itemId, candidateId]
  );
  return rows[0] ?? null;
}

export async function clearConfirmed(pool, itemId) {
  const { rows } = await pool.query(
    'UPDATE items SET confirmed_candidate_id = NULL WHERE id = $1 RETURNING *',
    [itemId]
  );
  return rows[0] ?? null;
}

export function normalizeCandidateRow(r) {
  return {
    ...r,
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    width_cm: r.width_cm === null || r.width_cm === undefined ? null : Number(r.width_cm),
    depth_cm: r.depth_cm === null || r.depth_cm === undefined ? null : Number(r.depth_cm),
    height_cm: r.height_cm === null || r.height_cm === undefined ? null : Number(r.height_cm),
  };
}
