import express from 'express';
import { getLayout } from '../queries/layout.js';

export function layoutRouter(pool) {
  const r = express.Router();
  r.get('/layout', async (req, res, next) => {
    try { res.json(await getLayout(pool)); } catch (e) { next(e); }
  });
  return r;
}
