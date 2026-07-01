import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function confirmedItem(app, { withDims = true } = {}) {
  const item = await request(app).post('/api/items').send({ name: '소파' });
  const cand = await request(app).post(`/api/items/${item.body.id}/candidates`).send(
    withDims ? { name: 'A', price: 100, width_cm: 200, depth_cm: 90 } : { name: 'A', price: 100 }
  );
  await request(app).put(`/api/items/${item.body.id}/confirm`).send({ candidate_id: cand.body.id });
  return item.body.id;
}

test('PUT placement for confirmed item with dims', async () => {
  const { app } = createTestApp();
  const id = await confirmedItem(app);
  const res = await request(app).put(`/api/items/${id}/placement`).send({ x: 30, y: 40, rotation: 90 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ item_id: id, x: 30, y: 40, rotation: 90 });
});

test('PUT placement is an upsert (second call moves it)', async () => {
  const { app } = createTestApp();
  const id = await confirmedItem(app);
  await request(app).put(`/api/items/${id}/placement`).send({ x: 30, y: 40, rotation: 0 });
  const res = await request(app).put(`/api/items/${id}/placement`).send({ x: 100, y: 60, rotation: 180 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ x: 100, y: 60, rotation: 180 });
});

test('PUT placement 400 when confirmed candidate has no dimensions', async () => {
  const { app } = createTestApp();
  const id = await confirmedItem(app, { withDims: false });
  const res = await request(app).put(`/api/items/${id}/placement`).send({ x: 10, y: 10 });
  expect(res.status).toBe(400);
});

test('PUT placement 400 when item is not confirmed', async () => {
  const { app } = createTestApp();
  const item = await request(app).post('/api/items').send({ name: '소파' });
  const res = await request(app).put(`/api/items/${item.body.id}/placement`).send({ x: 10, y: 10 });
  expect(res.status).toBe(400);
});

test('PUT placement 404 when item missing', async () => {
  const { app } = createTestApp();
  const res = await request(app).put('/api/items/999/placement').send({ x: 10, y: 10 });
  expect(res.status).toBe(404);
});

test('PUT placement 400 on invalid rotation', async () => {
  const { app } = createTestApp();
  const id = await confirmedItem(app);
  const res = await request(app).put(`/api/items/${id}/placement`).send({ x: 10, y: 10, rotation: 45 });
  expect(res.status).toBe(400);
});

test('DELETE placement removes it', async () => {
  const { app } = createTestApp();
  const id = await confirmedItem(app);
  await request(app).put(`/api/items/${id}/placement`).send({ x: 10, y: 10 });
  const del = await request(app).delete(`/api/items/${id}/placement`);
  expect(del.status).toBe(204);
  const again = await request(app).delete(`/api/items/${id}/placement`);
  expect(again.status).toBe(404);
});
