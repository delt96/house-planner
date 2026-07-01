export async function getSummary(pool) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(
         (SELECT SUM(c.price)
          FROM items i JOIN candidates c ON c.id = i.confirmed_candidate_id),
         0) AS confirmed_total,
       (SELECT COUNT(*) FROM items WHERE confirmed_candidate_id IS NULL) AS unconfirmed_count`
  );
  return {
    confirmed_total: Number(rows[0].confirmed_total),
    unconfirmed_count: Number(rows[0].unconfirmed_count),
  };
}
