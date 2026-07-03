import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

test('GET returns the seeded row with all dimensions null', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/api/home-settings');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({
    id: 1,
    door_width_cm: null,
    door_height_cm: null,
    elevator_door_width_cm: null,
    elevator_door_height_cm: null,
    elevator_car_width_cm: null,
    elevator_car_depth_cm: null,
    elevator_car_height_cm: null,
  });
});

test('PUT updates dimensions and persists them', async () => {
  const { app } = createTestApp();
  const res = await request(app).put('/api/home-settings').send({
    door_width_cm: 90,
    door_height_cm: 210,
    elevator_car_width_cm: 130,
  });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: 1, door_width_cm: 90, door_height_cm: 210, elevator_car_width_cm: 130 });

  const again = await request(app).get('/api/home-settings');
  expect(again.body).toMatchObject({ door_width_cm: 90, door_height_cm: 210, elevator_car_width_cm: 130 });
});

test('PUT clears a value when given empty string', async () => {
  const { app } = createTestApp();
  await request(app).put('/api/home-settings').send({ door_width_cm: 90 });
  const res = await request(app).put('/api/home-settings').send({ door_width_cm: '' });
  expect(res.status).toBe(200);
  expect(res.body.door_width_cm).toBeNull();
});

test('PUT rejects a non-positive dimension', async () => {
  const { app } = createTestApp();
  const res = await request(app).put('/api/home-settings').send({ door_width_cm: -5 });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/door_width_cm/);
});

test('PUT stores the room door (실내 문) dimensions', async () => {
  const { app } = createTestApp();
  const res = await request(app).put('/api/home-settings').send({ room_door_width_cm: 75, room_door_height_cm: 198 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ room_door_width_cm: 75, room_door_height_cm: 198 });
  const again = await request(app).get('/api/home-settings');
  expect(again.body).toMatchObject({ room_door_width_cm: 75, room_door_height_cm: 198 });
});

test('GET exposes the lowest room ceiling as min_ceiling_height_cm', async () => {
  const { app } = createTestApp();
  expect((await request(app).get('/api/home-settings')).body.min_ceiling_height_cm).toBeNull();
  const a = (await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 300 })).body;
  const b = (await request(app).post('/api/rooms').send({ name: '안방', width_cm: 350, depth_cm: 300 })).body;
  await request(app).patch(`/api/rooms/${a.id}`).send({ ceiling_height_cm: 240 });
  await request(app).patch(`/api/rooms/${b.id}`).send({ ceiling_height_cm: 232 });
  const res = await request(app).get('/api/home-settings');
  expect(res.body.min_ceiling_height_cm).toBe(232);
});
