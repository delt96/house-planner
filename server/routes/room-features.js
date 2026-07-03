import express from 'express';
import * as features from '../queries/room-features.js';
import { getRoom } from '../queries/rooms.js';
import { normalizeRoomFeature, parseId } from '../validation.js';

export function roomFeaturesRouter(pool) {
  const r = express.Router();

  r.post('/rooms/:id/features', async (req, res, next) => {
    try {
      const roomId = parseId(req.params.id);
      if (roomId === null) return res.status(404).json({ error: 'Not found' });
      const room = await getRoom(pool, roomId);
      if (!room) return res.status(404).json({ error: 'Room not found' });
      const { errors, value } = normalizeRoomFeature(req.body ?? {}, room);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      res.status(201).json(await features.createFeature(pool, roomId, value));
    } catch (e) { next(e); }
  });

  r.patch('/features/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const existing = await features.getFeature(pool, id);
      if (!existing) return res.status(404).json({ error: 'Feature not found' });
      const room = await getRoom(pool, existing.room_id);
      // Partial update: merge body onto the existing row, then fully re-validate
      const { errors, value } = normalizeRoomFeature({ ...existing, ...req.body }, room);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      res.json(await features.updateFeature(pool, id, value));
    } catch (e) { next(e); }
  });

  r.delete('/features/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const ok = await features.deleteFeature(pool, id);
      if (!ok) return res.status(404).json({ error: 'Feature not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
