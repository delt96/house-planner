import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function makeRoom(app) {
  const res = await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 300 });
  return res.body;
}

test('POST creates a door on a wall', async () => {
  const { app } = createTestApp();
  const room = await makeRoom(app);
  const res = await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'door', wall: 'S', offset_cm: 30, width_cm: 80, height_cm: 204, swing: 'in-left' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    room_id: room.id, kind: 'door', wall: 'S', offset_cm: 30, width_cm: 80, height_cm: 204,
    swing: 'in-left', sill_height_cm: null, floor_height_cm: null,
  });
});

test('POST 404s for a missing room', async () => {
  const { app } = createTestApp();
  const res = await request(app).post('/api/rooms/999/features').send({ kind: 'outlet', wall: 'E', offset_cm: 10 });
  expect(res.status).toBe(404);
});

test('POST rejects a bad wall and a feature past the wall end', async () => {
  const { app } = createTestApp();
  const room = await makeRoom(app);
  const badWall = await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'outlet', wall: 'X', offset_cm: 10 });
  expect(badWall.status).toBe(400);
  // S벽 길이 = width_cm 400 < 350 + 80
  const past = await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'window', wall: 'S', offset_cm: 350, width_cm: 80 });
  expect(past.status).toBe(400);
  expect(past.body.error).toMatch(/벽 길이/);
});

test('PATCH merges over the existing row and re-validates', async () => {
  const { app } = createTestApp();
  const room = await makeRoom(app);
  const f = (await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'window', wall: 'N', offset_cm: 90, width_cm: 180, height_cm: 120, sill_height_cm: 90 })).body;
  const res = await request(app).patch(`/api/features/${f.id}`).send({ offset_cm: 100 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ offset_cm: 100, width_cm: 180, sill_height_cm: 90 }); // 나머지 유지
  const tooFar = await request(app).patch(`/api/features/${f.id}`).send({ offset_cm: 250 });
  expect(tooFar.status).toBe(400); // 250 + 180 > 400
});

test('DELETE removes a feature', async () => {
  const { app } = createTestApp();
  const room = await makeRoom(app);
  const f = (await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'outlet', wall: 'E', offset_cm: 150, floor_height_cm: 30 })).body;
  expect((await request(app).delete(`/api/features/${f.id}`)).status).toBe(204);
  expect((await request(app).delete(`/api/features/${f.id}`)).status).toBe(404);
});

test('deleting a room cascades to its features', async () => {
  const { app } = createTestApp();
  const room = await makeRoom(app);
  const f = (await request(app).post(`/api/rooms/${room.id}/features`)
    .send({ kind: 'outlet', wall: 'W', offset_cm: 10 })).body;
  await request(app).delete(`/api/rooms/${room.id}`);
  expect((await request(app).patch(`/api/features/${f.id}`).send({ offset_cm: 20 })).status).toBe(404);
});
