import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function itemWithConfirmed(app, name, price) {
  const item = await request(app).post('/api/items').send({ name });
  const cand = await request(app).post(`/api/items/${item.body.id}/candidates`).send({ name: 'c', price });
  await request(app).put(`/api/items/${item.body.id}/confirm`).send({ candidate_id: cand.body.id });
  return item.body.id;
}

test('summary is zero when empty', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/api/summary');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ confirmed_total: 0, unconfirmed_count: 0 });
});

test('summary sums confirmed prices and counts unconfirmed', async () => {
  const { app } = createTestApp();
  await itemWithConfirmed(app, '냉장고', 1200000);
  await itemWithConfirmed(app, '세탁기', 800000);
  await request(app).post('/api/items').send({ name: '소파' }); // unconfirmed
  const res = await request(app).get('/api/summary');
  expect(res.body).toEqual({ confirmed_total: 2000000, unconfirmed_count: 1 });
});

test('confirmed candidate with null price counts as 0', async () => {
  const { app } = createTestApp();
  const item = await request(app).post('/api/items').send({ name: '냉장고' });
  const cand = await request(app).post(`/api/items/${item.body.id}/candidates`).send({ name: 'c' });
  await request(app).put(`/api/items/${item.body.id}/confirm`).send({ candidate_id: cand.body.id });
  const res = await request(app).get('/api/summary');
  expect(res.body).toEqual({ confirmed_total: 0, unconfirmed_count: 0 });
});
