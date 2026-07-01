import express from 'express';
import { getSummary } from '../queries/summary.js';

export function summaryRouter(pool) {
  const r = express.Router();
  r.get('/summary', async (req, res, next) => {
    try { res.json(await getSummary(pool)); } catch (e) { next(e); }
  });
  return r;
}
