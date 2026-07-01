import express from 'express';
import * as rooms from '../queries/rooms.js';
import { normalizeRoomInput, parseId } from '../validation.js';

export function roomsRouter(pool) {
  const r = express.Router();

  r.get('/rooms', async (req, res, next) => {
    try { res.json(await rooms.listRooms(pool)); } catch (e) { next(e); }
  });

  r.post('/rooms', async (req, res, next) => {
    try {
      const { errors, value } = normalizeRoomInput(req.body ?? {}, { partial: false });
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      res.status(201).json(await rooms.createRoom(pool, value));
    } catch (e) { next(e); }
  });

  r.patch('/rooms/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const { errors, value } = normalizeRoomInput(req.body ?? {}, { partial: true });
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      const updated = await rooms.updateRoom(pool, id, value);
      if (!updated) return res.status(404).json({ error: 'Room not found' });
      res.json(updated);
    } catch (e) { next(e); }
  });

  r.delete('/rooms/:id', async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (id === null) return res.status(404).json({ error: 'Not found' });
      const ok = await rooms.deleteRoom(pool, id);
      if (!ok) return res.status(404).json({ error: 'Room not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
