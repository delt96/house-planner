import express from 'express';
import * as candidates from '../queries/candidates.js';
import { getItem } from '../queries/items.js';
import { normalizeCandidate } from '../validation.js';

export function candidatesRouter(pool) {
  const r = express.Router();

  r.post('/items/:id/candidates', async (req, res, next) => {
    try {
      const item = await getItem(pool, Number(req.params.id));
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const { errors, value } = normalizeCandidate(req.body ?? {}, { partial: false });
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      res.status(201).json(await candidates.createCandidate(pool, item.id, value));
    } catch (e) { next(e); }
  });

  r.patch('/candidates/:id', async (req, res, next) => {
    try {
      const { errors, value } = normalizeCandidate(req.body ?? {}, { partial: true });
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      const updated = await candidates.updateCandidate(pool, Number(req.params.id), value);
      if (!updated) return res.status(404).json({ error: 'Candidate not found' });
      res.json(updated);
    } catch (e) { next(e); }
  });

  r.delete('/candidates/:id', async (req, res, next) => {
    try {
      const ok = await candidates.deleteCandidate(pool, Number(req.params.id));
      if (!ok) return res.status(404).json({ error: 'Candidate not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
