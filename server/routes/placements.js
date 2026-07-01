import express from 'express';
import * as placements from '../queries/placements.js';
import { getItem } from '../queries/items.js';
import { parseId, normalizePlacementInput } from '../validation.js';

export function placementsRouter(pool) {
  const r = express.Router();

  r.put('/items/:id/placement', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const item = await getItem(pool, id);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const dims = await placements.confirmedDims(pool, id);
      if (!dims) return res.status(400).json({ error: 'Item is not confirmed' });
      if (dims.width_cm === null || dims.depth_cm === null) {
        return res.status(400).json({ error: 'Confirmed product has no dimensions' });
      }
      const { errors, value } = normalizePlacementInput(req.body ?? {});
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      res.json(await placements.upsertPlacement(pool, id, value));
    } catch (e) { next(e); }
  });

  r.delete('/items/:id/placement', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const ok = await placements.deletePlacement(pool, id);
      if (!ok) return res.status(404).json({ error: 'Placement not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
