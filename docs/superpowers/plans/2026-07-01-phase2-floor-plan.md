# 평면도 배치 (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정된 가구/가전을 실제 치수 사각형으로 만들어, 사각형 방들을 이어 붙인 아파트 평면도(한 캔버스) 위에 마우스로 드래그·회전·배치하고 위치를 저장한다.

**Architecture:** Phase 1의 계층을 그대로 확장한다. 백엔드는 `rooms`·`placements` 테이블 + `server/queries/*`·`server/routes/*` 모듈 + 하나의 집계 읽기 엔드포인트 `GET /api/layout`. 프론트는 새 `/layout` 화면(SVG 캔버스). 좌표 변환·회전·스냅 같은 순수 로직은 `web/src/geometry.js`에 분리해 단위 테스트하고, 드래그는 그 위의 얇은 글루로 둔다.

**Tech Stack:** Phase 1과 동일 (Node ESM + Express + pg + PostgreSQL; React 18 + Vite + react-router-dom 6; Vitest + supertest + pg-mem 백엔드, Vitest + @testing-library/react + jsdom 프론트). **새 의존성 없음.**

## Global Constraints

- **런타임/계층:** Node 20+ ESM. 라우트는 SQL 직접 사용 금지 — `server/queries/*`만 호출. `createApp(pool)`는 `listen`하지 않음.
- **에러 형식:** 실패는 항상 `{ "error": "<메시지>" }`. 검증 400, 없음 404, 서버 500.
- **id 라우트:** `req.params.id`는 반드시 `parseId()`로 파싱하고 `null`이면 404 (Phase 1에서 도입한 헬퍼 재사용).
- **단위:** 모든 좌표·치수는 cm(`numeric`, 소수 허용). 방·가구 치수는 0 초과. 좌표 x/y는 임의의 유한 실수. 회전은 정수 `{0, 90, 180, 270}`만 허용.
- **마이그레이션:** 러너는 멱등적이어야 하고 `schema_migrations` 테이블로 적용 이력을 추적한다. 테스트 하네스는 `migrations/*.sql`을 **전부** 순서대로 pg-mem에 적용한다.
- **배치 자격:** 배치는 **확정된 항목** 중, 그 확정 후보에 `width_cm`과 `depth_cm`이 **둘 다** 있는 경우에만 허용. 아니면 "배치 불가"로 분류.
- **읽기 집계:** 평면도 화면은 하나의 `GET /api/layout`로 rooms·placements·palette·unplaceable을 한 번에 받는다.
- **프론트 순수 로직 분리:** cm↔px 변환, 스냅, 회전 footprint 계산은 `web/src/geometry.js`의 순수 함수. 드래그는 이 함수들 위의 글루.
- **드래그 테스트:** jsdom은 `PointerEvent`를 신뢰성 있게 지원하지 않으므로 드래그는 **mouse 이벤트**(mousedown/mousemove/mouseup)로 구현·테스트한다.

---

## File Structure

```
honsu-planner/
  migrations/
    002_rooms_placements.sql       (신규) rooms, placements 스키마
  server/
    migrate.js                     (수정) 멱등 러너 + schema_migrations 추적
    validation.js                  (수정) normalizeRoomInput, normalizePlacementInput 추가
    app.js                         (수정) rooms/placements/layout 라우터 마운트
    queries/
      rooms.js                     (신규) 방 CRUD 쿼리
      placements.js                (신규) 배치 upsert/delete + 확정치수 조회
      layout.js                    (신규) 평면도 집계 쿼리
    routes/
      rooms.js                     (신규)
      placements.js                (신규)
      layout.js                    (신규)
  test/
    helpers/testApp.js             (수정) 모든 마이그레이션 적용
    migrations.test.js             (신규) Phase 2 테이블 존재 스모크
    rooms.test.js                  (신규)
    placements.test.js             (신규)
    layout.test.js                 (신규)
  web/src/
    geometry.js                    (신규) 순수 좌표/회전/스냅
    geometry.test.js               (신규)
    api.js                         (수정) layout/rooms/placement 클라이언트 메서드
    api.test.js                    (수정) 신규 메서드 테스트
    App.jsx                        (수정) /layout 라우트
    pages/HomePage.jsx             (수정) 평면도 링크 추가
    pages/LayoutPage.jsx           (신규) 평면도 화면 (렌더 + 컨트롤 → 드래그)
    pages/LayoutPage.test.jsx      (신규)
    styles.css                     (수정) 평면도 스타일 추가
```

---

## Task 1: 마이그레이션 인프라 + Phase 2 스키마 + 테스트 하네스

**Files:**
- Modify: `server/migrate.js`
- Create: `migrations/002_rooms_placements.sql`
- Modify: `test/helpers/testApp.js`
- Create: `test/migrations.test.js`

**Interfaces:**
- Produces: `rooms`(id, name, x, y, width_cm, depth_cm, sort_order, created_at) and `placements`(id, item_id UNIQUE→items ON DELETE CASCADE, x, y, rotation, created_at) tables; `createTestApp()` now applies ALL migrations.

- [ ] **Step 1: 실패하는 스모크 테스트 작성**

`test/migrations.test.js`:
```js
import { test, expect } from 'vitest';
import { createTestApp } from './helpers/testApp.js';

test('phase 2 tables exist and are empty', async () => {
  const { pool } = createTestApp();
  const rooms = await pool.query('SELECT * FROM rooms');
  const placements = await pool.query('SELECT * FROM placements');
  expect(rooms.rows).toEqual([]);
  expect(placements.rows).toEqual([]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/migrations.test.js`
Expected: FAIL (relation "rooms" does not exist — harness only applies 001).

- [ ] **Step 3: 스키마 + 하네스 구현**

`migrations/002_rooms_placements.sql`:
```sql
CREATE TABLE rooms (
  id serial PRIMARY KEY,
  name text NOT NULL,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width_cm numeric NOT NULL,
  depth_cm numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE placements (
  id serial PRIMARY KEY,
  item_id int NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  x numeric NOT NULL,
  y numeric NOT NULL,
  rotation int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_placements_item ON placements(item_id);
```

`test/helpers/testApp.js` (replace entire file — now applies every migration in order):
```js
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { createApp } from '../../server/app.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export function createTestApp() {
  const db = newDb();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    db.public.none(readFileSync(path.join(migrationsDir, f), 'utf8'));
  }
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const app = createApp(pool);
  return { app, pool };
}
```

`server/migrate.js` (replace entire file — idempotent + tracked + closes pool in finally):
```js
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const pool = createPool();
try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  const { rows } = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) {
      console.log('Skip (already applied)', f);
      continue;
    }
    console.log('Running', f);
    await pool.query(readFileSync(path.join(dir, f), 'utf8'));
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
  }
  console.log('Migrations complete');
} finally {
  await pool.end();
}
```

- [ ] **Step 4: 테스트 통과 확인 (전체 스위트)**

Run: `npm test`
Expected: PASS — 기존 25개 + 신규 migrations 1개 = 26 passing. (하네스가 002도 적용하지만 Phase 1 테이블/테스트엔 영향 없음.)

- [ ] **Step 5: 커밋**

```bash
git add server/migrate.js migrations/002_rooms_placements.sql test/helpers/testApp.js test/migrations.test.js
git commit -m "feat: phase2 schema (rooms, placements) + idempotent migrations"
```

---

## Task 2: 방(rooms) CRUD API

**Files:**
- Create: `server/queries/rooms.js`, `server/routes/rooms.js`
- Modify: `server/validation.js` (add `normalizeRoomInput`), `server/app.js` (mount)
- Test: `test/rooms.test.js`

**Interfaces:**
- Consumes: `parseId` from `../validation.js`.
- Produces:
  - `normalizeRoomInput(body, {partial})` → `{ errors: string[], value: object }`
  - queries/rooms.js: `listRooms(pool)`, `getRoom(pool, id)`, `createRoom(pool, {name, width_cm, depth_cm, x?, y?})`, `updateRoom(pool, id, data)`, `deleteRoom(pool, id)`, `normalizeRoomRow(row)`
  - `roomsRouter(pool)` → Router (`GET/POST /rooms`, `PATCH/DELETE /rooms/:id`)
  - 방 행: `{ id, name, x, y, width_cm, depth_cm, sort_order, created_at }` (x/y/width_cm/depth_cm are numbers)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/rooms.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

test('POST /api/rooms creates a room', async () => {
  const { app } = createTestApp();
  const res = await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 500 });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: '거실', width_cm: 400, depth_cm: 500, x: 0, y: 0 });
});

test('POST /api/rooms rejects missing/invalid dimensions', async () => {
  const { app } = createTestApp();
  const noDim = await request(app).post('/api/rooms').send({ name: '거실' });
  expect(noDim.status).toBe(400);
  const zero = await request(app).post('/api/rooms').send({ name: '거실', width_cm: 0, depth_cm: 100 });
  expect(zero.status).toBe(400);
});

test('POST /api/rooms rejects empty name', async () => {
  const { app } = createTestApp();
  const res = await request(app).post('/api/rooms').send({ width_cm: 100, depth_cm: 100 });
  expect(res.status).toBe(400);
});

test('GET /api/rooms lists rooms', async () => {
  const { app } = createTestApp();
  await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 500 });
  await request(app).post('/api/rooms').send({ name: '침실', width_cm: 300, depth_cm: 400 });
  const res = await request(app).get('/api/rooms');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
});

test('PATCH /api/rooms/:id updates position', async () => {
  const { app } = createTestApp();
  const c = await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 500 });
  const res = await request(app).patch(`/api/rooms/${c.body.id}`).send({ x: 120, y: 60 });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ x: 120, y: 60 });
});

test('DELETE /api/rooms/:id removes it', async () => {
  const { app } = createTestApp();
  const c = await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 500 });
  const del = await request(app).delete(`/api/rooms/${c.body.id}`);
  expect(del.status).toBe(204);
  const list = await request(app).get('/api/rooms');
  expect(list.body).toHaveLength(0);
});

test('non-numeric room id → 404', async () => {
  const { app } = createTestApp();
  const res = await request(app).delete('/api/rooms/abc');
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/rooms.test.js`
Expected: FAIL (404 — router not mounted).

- [ ] **Step 3: 구현**

`server/validation.js` — add:
```js
export function normalizeRoomInput(body, { partial = false } = {}) {
  const out = {};
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') errors.push('Name is required');
    else out.name = body.name.trim();
  }

  for (const [key, label] of [['width_cm', 'Width'], ['depth_cm', 'Depth']]) {
    if (!partial || body[key] !== undefined) {
      const n = Number(body[key]);
      if (!(n > 0)) errors.push(`${label} must be a positive number`);
      else out[key] = n;
    }
  }

  for (const key of ['x', 'y']) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n)) errors.push(`${key} must be a number`);
      else out[key] = n;
    }
  }

  if (body.sort_order !== undefined) out.sort_order = Number(body.sort_order);

  return { errors, value: out };
}
```

`server/queries/rooms.js`:
```js
export function normalizeRoomRow(r) {
  return {
    ...r,
    x: Number(r.x),
    y: Number(r.y),
    width_cm: Number(r.width_cm),
    depth_cm: Number(r.depth_cm),
  };
}

export async function listRooms(pool) {
  const { rows } = await pool.query('SELECT * FROM rooms ORDER BY sort_order, id');
  return rows.map(normalizeRoomRow);
}

export async function getRoom(pool, id) {
  const { rows } = await pool.query('SELECT * FROM rooms WHERE id = $1', [id]);
  return rows[0] ? normalizeRoomRow(rows[0]) : null;
}

export async function createRoom(pool, { name, width_cm, depth_cm, x, y }) {
  const { rows } = await pool.query(
    'INSERT INTO rooms (name, width_cm, depth_cm, x, y) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [name, width_cm, depth_cm, x ?? 0, y ?? 0]
  );
  return normalizeRoomRow(rows[0]);
}

export async function updateRoom(pool, id, data) {
  const cols = ['name', 'width_cm', 'depth_cm', 'x', 'y', 'sort_order'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const c of cols) {
    if (c in data) { sets.push(`${c} = $${i++}`); vals.push(data[c]); }
  }
  if (sets.length === 0) return getRoom(pool, id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? normalizeRoomRow(rows[0]) : null;
}

export async function deleteRoom(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM rooms WHERE id = $1', [id]);
  return rowCount > 0;
}
```

`server/routes/rooms.js`:
```js
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
```

`server/app.js` — import and mount after the summary router (before the static block):
```js
import { roomsRouter } from './routes/rooms.js';
// ...
  app.use('/api', roomsRouter(pool));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/rooms.test.js`
Expected: PASS (7 passed).

- [ ] **Step 5: 커밋**

```bash
git add server/queries/rooms.js server/routes/rooms.js server/validation.js server/app.js test/rooms.test.js
git commit -m "feat: rooms CRUD API"
```

---

## Task 3: 배치(placements) API

**Files:**
- Create: `server/queries/placements.js`, `server/routes/placements.js`
- Modify: `server/validation.js` (add `normalizePlacementInput`), `server/app.js` (mount)
- Test: `test/placements.test.js`

**Interfaces:**
- Consumes: `getItem` from `../queries/items.js`; `parseId` from `../validation.js`.
- Produces:
  - `normalizePlacementInput(body)` → `{ errors, value:{x,y,rotation} }` (x/y required finite; rotation ∈ {0,90,180,270}, default 0)
  - queries/placements.js: `confirmedDims(pool, itemId)` → `{width_cm, depth_cm}|null`, `upsertPlacement(pool, itemId, {x,y,rotation})` → placement row, `deletePlacement(pool, itemId)` → boolean
  - `placementsRouter(pool)` → Router (`PUT /items/:id/placement`, `DELETE /items/:id/placement`)
  - placement row: `{ id, item_id, x, y, rotation, created_at }` (x/y/rotation numbers)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/placements.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/placements.test.js`
Expected: FAIL (404 — router not mounted).

- [ ] **Step 3: 구현**

`server/validation.js` — add:
```js
export function normalizePlacementInput(body) {
  const out = {};
  const errors = [];
  for (const key of ['x', 'y']) {
    const n = Number(body[key]);
    if (!Number.isFinite(n)) errors.push(`${key} must be a number`);
    else out[key] = n;
  }
  const rot = body.rotation === undefined ? 0 : Number(body.rotation);
  if (![0, 90, 180, 270].includes(rot)) errors.push('rotation must be 0, 90, 180, or 270');
  else out.rotation = rot;
  return { errors, value: out };
}
```

`server/queries/placements.js`:
```js
function normalizePlacementRow(r) {
  return { ...r, x: Number(r.x), y: Number(r.y), rotation: Number(r.rotation) };
}

export async function confirmedDims(pool, itemId) {
  const { rows } = await pool.query(
    `SELECT c.width_cm, c.depth_cm
     FROM items i JOIN candidates c ON c.id = i.confirmed_candidate_id
     WHERE i.id = $1`,
    [itemId]
  );
  if (!rows[0]) return null;
  return {
    width_cm: rows[0].width_cm === null ? null : Number(rows[0].width_cm),
    depth_cm: rows[0].depth_cm === null ? null : Number(rows[0].depth_cm),
  };
}

export async function upsertPlacement(pool, itemId, { x, y, rotation }) {
  const { rows } = await pool.query(
    `INSERT INTO placements (item_id, x, y, rotation)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_id) DO UPDATE
       SET x = EXCLUDED.x, y = EXCLUDED.y, rotation = EXCLUDED.rotation
     RETURNING *`,
    [itemId, x, y, rotation]
  );
  return normalizePlacementRow(rows[0]);
}

export async function deletePlacement(pool, itemId) {
  const { rowCount } = await pool.query('DELETE FROM placements WHERE item_id = $1', [itemId]);
  return rowCount > 0;
}
```

**NAMED RISK for the implementer:** `upsertPlacement` uses `ON CONFLICT (item_id) DO UPDATE ... EXCLUDED`. If pg-mem does not support `ON CONFLICT DO UPDATE` or `EXCLUDED`, the upsert test will fail. In that case, replace `upsertPlacement` with a transactional manual upsert that computes the SAME result (SELECT existing by item_id; if present `UPDATE ... RETURNING *`, else `INSERT ... RETURNING *`) using `pool.connect()`/BEGIN/COMMIT (this pattern already works in the codebase — see `deleteCandidate`). Note any change in your report.

`server/routes/placements.js`:
```js
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
```

`server/app.js` — import and mount after the rooms router:
```js
import { placementsRouter } from './routes/placements.js';
// ...
  app.use('/api', placementsRouter(pool));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run test/placements.test.js`
Expected: PASS (7 passed).

- [ ] **Step 5: 커밋**

```bash
git add server/queries/placements.js server/routes/placements.js server/validation.js server/app.js test/placements.test.js
git commit -m "feat: placements upsert/delete API"
```

---

## Task 4: 평면도 집계 API (GET /api/layout)

**Files:**
- Create: `server/queries/layout.js`, `server/routes/layout.js`
- Modify: `server/app.js` (mount)
- Test: `test/layout.test.js`

**Interfaces:**
- Consumes: `listRooms` from `../queries/rooms.js`.
- Produces:
  - `getLayout(pool)` → `{ rooms:[...], placements:[...], palette:[...], unplaceable:[...] }`
  - `layoutRouter(pool)` → Router (`GET /layout`)
  - Categorization: confirmed item (has confirmed candidate) → if candidate has both dims: placed row present → `placements` (`{item_id,name,x,y,rotation,width_cm,depth_cm}`), else `palette` (`{item_id,name,width_cm,depth_cm}`); if candidate missing a dim → `unplaceable` (`{item_id,name}`). Unconfirmed items appear nowhere.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/layout.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function confirmItem(app, name, dims) {
  const item = await request(app).post('/api/items').send({ name });
  const cand = await request(app).post(`/api/items/${item.body.id}/candidates`).send({ name: 'c', price: 100, ...dims });
  await request(app).put(`/api/items/${item.body.id}/confirm`).send({ candidate_id: cand.body.id });
  return item.body.id;
}

test('empty layout', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/api/layout');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ rooms: [], placements: [], palette: [], unplaceable: [] });
});

test('categorizes rooms, palette, placements, unplaceable', async () => {
  const { app } = createTestApp();
  await request(app).post('/api/rooms').send({ name: '거실', width_cm: 400, depth_cm: 500 });

  const placedId = await confirmItem(app, '소파', { width_cm: 200, depth_cm: 90 });
  await request(app).put(`/api/items/${placedId}/placement`).send({ x: 10, y: 20, rotation: 90 });

  await confirmItem(app, '식탁', { width_cm: 120, depth_cm: 80 }); // palette (dims, not placed)
  await confirmItem(app, '스탠드', {}); // unplaceable (no dims)
  await request(app).post('/api/items').send({ name: '미확정' }); // not confirmed → nowhere

  const res = await request(app).get('/api/layout');
  expect(res.body.rooms).toHaveLength(1);
  expect(res.body.placements).toEqual([
    { item_id: placedId, name: '소파', x: 10, y: 20, rotation: 90, width_cm: 200, depth_cm: 90 },
  ]);
  expect(res.body.palette).toEqual([{ item_id: expect.any(Number), name: '식탁', width_cm: 120, depth_cm: 80 }]);
  expect(res.body.unplaceable).toEqual([{ item_id: expect.any(Number), name: '스탠드' }]);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run test/layout.test.js`
Expected: FAIL (404 — router not mounted).

- [ ] **Step 3: 구현**

`server/queries/layout.js`:
```js
import { listRooms } from './rooms.js';

export async function getLayout(pool) {
  const rooms = await listRooms(pool);
  const { rows } = await pool.query(
    `SELECT i.id AS item_id, i.name,
            c.width_cm, c.depth_cm,
            p.x, p.y, p.rotation
     FROM items i
     JOIN candidates c ON c.id = i.confirmed_candidate_id
     LEFT JOIN placements p ON p.item_id = i.id
     ORDER BY i.sort_order, i.id`
  );

  const placements = [];
  const palette = [];
  const unplaceable = [];

  for (const row of rows) {
    const w = row.width_cm === null ? null : Number(row.width_cm);
    const d = row.depth_cm === null ? null : Number(row.depth_cm);
    if (w === null || d === null) {
      unplaceable.push({ item_id: row.item_id, name: row.name });
    } else if (row.x !== null && row.x !== undefined) {
      placements.push({
        item_id: row.item_id,
        name: row.name,
        x: Number(row.x),
        y: Number(row.y),
        rotation: Number(row.rotation),
        width_cm: w,
        depth_cm: d,
      });
    } else {
      palette.push({ item_id: row.item_id, name: row.name, width_cm: w, depth_cm: d });
    }
  }

  return { rooms, placements, palette, unplaceable };
}
```

`server/routes/layout.js`:
```js
import express from 'express';
import { getLayout } from '../queries/layout.js';

export function layoutRouter(pool) {
  const r = express.Router();
  r.get('/layout', async (req, res, next) => {
    try { res.json(await getLayout(pool)); } catch (e) { next(e); }
  });
  return r;
}
```

`server/app.js` — import and mount after the placements router:
```js
import { layoutRouter } from './routes/layout.js';
// ...
  app.use('/api', layoutRouter(pool));
```

- [ ] **Step 4: 테스트 통과 확인 (전체 백엔드)**

Run: `npm test`
Expected: PASS — 전체 백엔드 스위트(Phase 1 25 + migrations 1 + rooms 7 + placements 7 + layout 2 = 42), 출력 pristine.

- [ ] **Step 5: 커밋**

```bash
git add server/queries/layout.js server/routes/layout.js server/app.js test/layout.test.js
git commit -m "feat: layout aggregate API"
```

---

## Task 5: 프론트 기하 모듈 + API 클라이언트 + /layout 라우트·네비

**Files:**
- Create: `web/src/geometry.js`, `web/src/geometry.test.js`
- Modify: `web/src/api.js`, `web/src/api.test.js`, `web/src/App.jsx`, `web/src/pages/HomePage.jsx`

**Interfaces:**
- Produces:
  - geometry.js: `PX_PER_CM`(0.4), `GRID_CM`(10), `cmToPx(cm)`, `pxToCm(px)`, `snapCm(cm, grid?)`, `rotatedFootprint(width_cm, depth_cm, rotation)` → `{w,h}`, `nextRotation(rotation)` → number
  - api additions: `getLayout()`, `createRoom(data)`, `updateRoom(id,data)`, `deleteRoom(id)`, `placeItem(itemId,{x,y,rotation})`, `unplaceItem(itemId)`
  - App route `/layout` → `<LayoutPage />` (created in Task 6); HomePage shows a `<Link to="/layout">` nav.

- [ ] **Step 1: 실패하는 테스트 작성 (geometry + api)**

`web/src/geometry.test.js`:
```js
import { test, expect } from 'vitest';
import { cmToPx, pxToCm, snapCm, rotatedFootprint, nextRotation, PX_PER_CM } from './geometry.js';

test('cmToPx / pxToCm are inverse', () => {
  expect(cmToPx(100)).toBe(100 * PX_PER_CM);
  expect(pxToCm(cmToPx(250))).toBeCloseTo(250);
});

test('snapCm snaps to 10cm grid', () => {
  expect(snapCm(13)).toBe(10);
  expect(snapCm(16)).toBe(20);
  expect(snapCm(-14)).toBe(-10);
});

test('rotatedFootprint swaps w/h for 90 and 270', () => {
  expect(rotatedFootprint(90, 60, 0)).toEqual({ w: 90, h: 60 });
  expect(rotatedFootprint(90, 60, 90)).toEqual({ w: 60, h: 90 });
  expect(rotatedFootprint(90, 60, 180)).toEqual({ w: 90, h: 60 });
  expect(rotatedFootprint(90, 60, 270)).toEqual({ w: 60, h: 90 });
});

test('nextRotation cycles through 90-degree steps', () => {
  expect(nextRotation(0)).toBe(90);
  expect(nextRotation(270)).toBe(0);
  expect(nextRotation(undefined)).toBe(90);
});
```

`web/src/api.test.js` — append these tests (keep the existing ones):
```js
test('getLayout GETs /api/layout', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ rooms: [], placements: [], palette: [], unplaceable: [] }) });
  const r = await api.getLayout();
  expect(global.fetch).toHaveBeenCalledWith('/api/layout', expect.objectContaining({}));
  expect(r).toEqual({ rooms: [], placements: [], palette: [], unplaceable: [] });
});

test('placeItem PUTs the placement body', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ item_id: 1, x: 10, y: 10, rotation: 0 }) });
  await api.placeItem(1, { x: 10, y: 10, rotation: 0 });
  expect(global.fetch).toHaveBeenCalledWith('/api/items/1/placement', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ x: 10, y: 10, rotation: 0 }) }));
});

test('createRoom POSTs to /api/rooms', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1, name: '거실' }) });
  await api.createRoom({ name: '거실', width_cm: 400, depth_cm: 500 });
  expect(global.fetch).toHaveBeenCalledWith('/api/rooms', expect.objectContaining({ method: 'POST' }));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/geometry.test.js src/api.test.js`
Expected: FAIL (geometry module not found; api.getLayout undefined).

- [ ] **Step 3: 구현**

`web/src/geometry.js`:
```js
export const PX_PER_CM = 0.4;
export const GRID_CM = 10;

export const cmToPx = (cm) => cm * PX_PER_CM;
export const pxToCm = (px) => px / PX_PER_CM;
export const snapCm = (cm, grid = GRID_CM) => Math.round(cm / grid) * grid;

export function rotatedFootprint(width_cm, depth_cm, rotation) {
  const r = ((rotation % 360) + 360) % 360;
  return r === 90 || r === 270 ? { w: depth_cm, h: width_cm } : { w: width_cm, h: depth_cm };
}

export const nextRotation = (rotation) => (((rotation ?? 0) + 90) % 360);
```

`web/src/api.js` — add these entries inside the `api` object (alongside the existing methods):
```js
  getLayout: () => req('/layout'),
  createRoom: (data) => req('/rooms', { method: 'POST', body: JSON.stringify(data) }),
  updateRoom: (id, data) => req(`/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRoom: (id) => req(`/rooms/${id}`, { method: 'DELETE' }),
  placeItem: (itemId, data) => req(`/items/${itemId}/placement`, { method: 'PUT', body: JSON.stringify(data) }),
  unplaceItem: (itemId) => req(`/items/${itemId}/placement`, { method: 'DELETE' }),
```

`web/src/App.jsx` — add the layout route (import + Route):
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage.jsx';
import { ItemDetailPage } from './pages/ItemDetailPage.jsx';
import { LayoutPage } from './pages/LayoutPage.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/layout" element={<LayoutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

`web/src/pages/HomePage.jsx` — add a nav link to the layout page directly under the `<h1>혼수 목록</h1>` line:
```jsx
      <h1>혼수 목록</h1>
      <p className="nav"><Link to="/layout">평면도 배치 →</Link></p>
```
(`Link` is already imported in HomePage.jsx.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run src/geometry.test.js src/api.test.js`
Expected: PASS (geometry 4 + api 6 = 10). Do NOT run `npm run build` yet — `App.jsx` now imports `LayoutPage` which is created in Task 6.

- [ ] **Step 5: 커밋**

```bash
git add web/src/geometry.js web/src/geometry.test.js web/src/api.js web/src/api.test.js web/src/App.jsx web/src/pages/HomePage.jsx
git commit -m "feat: geometry module, layout api client, /layout route + nav"
```

---

## Task 6: 평면도 화면 — 렌더 + 컨트롤 (드래그 제외)

**Files:**
- Create: `web/src/pages/LayoutPage.jsx`, `web/src/pages/LayoutPage.test.jsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `api.getLayout/createRoom/deleteRoom/placeItem/unplaceItem`, geometry `cmToPx/rotatedFootprint/nextRotation`, react-router `Link`.
- Produces: `<LayoutPage />` — an SVG canvas rendering rooms and placed furniture as scaled rects, plus a control panel (add-room form, room list w/ delete, palette w/ 배치, placed list w/ 회전·제거, unplaceable list linking to item detail). No drag yet (Task 7 adds it).

- [ ] **Step 1: 실패하는 테스트 작성**

`web/src/pages/LayoutPage.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { LayoutPage } from './LayoutPage.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getLayout: vi.fn(), createRoom: vi.fn(), deleteRoom: vi.fn(),
    placeItem: vi.fn(), unplaceItem: vi.fn(), updateRoom: vi.fn(),
  },
}));

const LAYOUT = {
  rooms: [{ id: 1, name: '거실', x: 0, y: 0, width_cm: 400, depth_cm: 500 }],
  placements: [{ item_id: 5, name: '소파', x: 10, y: 20, rotation: 0, width_cm: 200, depth_cm: 90 }],
  palette: [{ item_id: 7, name: '식탁', width_cm: 120, depth_cm: 80 }],
  unplaceable: [{ item_id: 9, name: '스탠드' }],
};

beforeEach(() => { vi.clearAllMocks(); });

test('renders rooms, placed furniture, palette, and unplaceable', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  expect(await screen.findByText(/거실/)).toBeInTheDocument();
  expect(screen.getByText('소파')).toBeInTheDocument();
  expect(screen.getByText(/식탁/)).toBeInTheDocument();
  expect(screen.getByText(/스탠드/)).toBeInTheDocument();
});

test('add room calls api.createRoom', async () => {
  api.getLayout.mockResolvedValue({ rooms: [], placements: [], palette: [], unplaceable: [] });
  api.createRoom.mockResolvedValue({ id: 1 });
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText('방 추가');
  await userEvent.type(screen.getByLabelText('방 이름'), '침실');
  await userEvent.type(screen.getByLabelText('방 가로'), '300');
  await userEvent.type(screen.getByLabelText('방 세로'), '400');
  await userEvent.click(screen.getByRole('button', { name: '방 추가' }));
  await waitFor(() => expect(api.createRoom).toHaveBeenCalledWith({ name: '침실', width_cm: '300', depth_cm: '400' }));
});

test('placing a palette item calls api.placeItem', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  api.placeItem.mockResolvedValue({});
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText(/식탁/);
  await userEvent.click(screen.getByRole('button', { name: '배치' }));
  await waitFor(() => expect(api.placeItem).toHaveBeenCalledWith(7, { x: 10, y: 10, rotation: 0 }));
});

test('rotate calls api.placeItem with next rotation', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  api.placeItem.mockResolvedValue({});
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText('소파');
  await userEvent.click(screen.getByRole('button', { name: '회전' }));
  await waitFor(() => expect(api.placeItem).toHaveBeenCalledWith(5, { x: 10, y: 20, rotation: 90 }));
});

test('remove calls api.unplaceItem', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  api.unplaceItem.mockResolvedValue(null);
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText('소파');
  await userEvent.click(screen.getByRole('button', { name: '제거' }));
  await waitFor(() => expect(api.unplaceItem).toHaveBeenCalledWith(5));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/pages/LayoutPage.test.jsx`
Expected: FAIL (LayoutPage module not found).

- [ ] **Step 3: 구현**

`web/src/pages/LayoutPage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { cmToPx, rotatedFootprint, nextRotation } from '../geometry.js';

const MARGIN_CM = 50;

function canvasExtentCm(rooms, placements) {
  let maxX = 500;
  let maxY = 400;
  for (const r of rooms) {
    maxX = Math.max(maxX, r.x + r.width_cm);
    maxY = Math.max(maxY, r.y + r.depth_cm);
  }
  for (const p of placements) {
    const f = rotatedFootprint(p.width_cm, p.depth_cm, p.rotation);
    maxX = Math.max(maxX, p.x + f.w);
    maxY = Math.max(maxY, p.y + f.h);
  }
  return { w: maxX + MARGIN_CM, h: maxY + MARGIN_CM };
}

export function LayoutPage() {
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState(null);
  const [room, setRoom] = useState({ name: '', width_cm: '', depth_cm: '' });

  async function load() {
    try { setLayout(await api.getLayout()); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function addRoom(e) {
    e.preventDefault();
    try { await api.createRoom(room); setRoom({ name: '', width_cm: '', depth_cm: '' }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function removeRoom(id) {
    try { await api.deleteRoom(id); await load(); } catch (e) { setError(e.message); }
  }
  async function place(item) {
    try { await api.placeItem(item.item_id, { x: 10, y: 10, rotation: 0 }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function rotate(p) {
    try { await api.placeItem(p.item_id, { x: p.x, y: p.y, rotation: nextRotation(p.rotation) }); await load(); }
    catch (e) { setError(e.message); }
  }
  async function unplace(itemId) {
    try { await api.unplaceItem(itemId); await load(); } catch (e) { setError(e.message); }
  }

  if (!layout) {
    return (
      <main className="container">
        <Link to="/">← 목록</Link>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const { rooms, placements, palette, unplaceable } = layout;
  const ext = canvasExtentCm(rooms, placements);

  return (
    <main className="container">
      <Link to="/">← 목록</Link>
      <h1>평면도 배치</h1>
      {error && <p className="error">{error}</p>}
      <div className="layout-grid">
        <svg
          className="canvas"
          width={cmToPx(ext.w)}
          height={cmToPx(ext.h)}
          viewBox={`0 0 ${cmToPx(ext.w)} ${cmToPx(ext.h)}`}
          role="img"
          aria-label="평면도"
        >
          {rooms.map((r) => (
            <g key={`room-${r.id}`}>
              <rect className="room" data-testid={`room-${r.id}`}
                x={cmToPx(r.x)} y={cmToPx(r.y)} width={cmToPx(r.width_cm)} height={cmToPx(r.depth_cm)} />
              <text x={cmToPx(r.x) + 4} y={cmToPx(r.y) + 14} className="room-label">
                {r.name} ({r.width_cm}×{r.depth_cm})
              </text>
            </g>
          ))}
          {placements.map((p) => {
            const f = rotatedFootprint(p.width_cm, p.depth_cm, p.rotation);
            return (
              <g key={`item-${p.item_id}`}>
                <rect className="furniture" data-testid={`furn-${p.item_id}`}
                  x={cmToPx(p.x)} y={cmToPx(p.y)} width={cmToPx(f.w)} height={cmToPx(f.h)} />
                <text x={cmToPx(p.x) + 4} y={cmToPx(p.y) + 14} className="furn-label">{p.name}</text>
              </g>
            );
          })}
        </svg>

        <aside className="panel">
          <section>
            <h2>방 추가</h2>
            <form onSubmit={addRoom} className="room-form">
              <input aria-label="방 이름" placeholder="예: 거실" value={room.name}
                onChange={(e) => setRoom({ ...room, name: e.target.value })} />
              <input aria-label="방 가로" placeholder="가로(cm)" value={room.width_cm}
                onChange={(e) => setRoom({ ...room, width_cm: e.target.value })} />
              <input aria-label="방 세로" placeholder="세로(cm)" value={room.depth_cm}
                onChange={(e) => setRoom({ ...room, depth_cm: e.target.value })} />
              <button type="submit">방 추가</button>
            </form>
            <ul className="mini-list">
              {rooms.map((r) => (
                <li key={r.id}>{r.name} ({r.width_cm}×{r.depth_cm}) <button className="danger" onClick={() => removeRoom(r.id)}>삭제</button></li>
              ))}
            </ul>
          </section>

          <section>
            <h2>배치 가능</h2>
            <ul className="mini-list">
              {palette.map((it) => (
                <li key={it.item_id}>{it.name} ({it.width_cm}×{it.depth_cm}) <button onClick={() => place(it)}>배치</button></li>
              ))}
              {palette.length === 0 && <li className="muted">없음</li>}
            </ul>
          </section>

          <section>
            <h2>배치됨</h2>
            <ul className="mini-list">
              {placements.map((p) => (
                <li key={p.item_id}>{p.name} <button onClick={() => rotate(p)}>회전</button> <button className="danger" onClick={() => unplace(p.item_id)}>제거</button></li>
              ))}
              {placements.length === 0 && <li className="muted">없음</li>}
            </ul>
          </section>

          <section>
            <h2>배치 불가 (치수 없음)</h2>
            <ul className="mini-list">
              {unplaceable.map((it) => (
                <li key={it.item_id}><Link to={`/items/${it.item_id}`}>{it.name} — 치수 입력</Link></li>
              ))}
              {unplaceable.length === 0 && <li className="muted">없음</li>}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
```

`web/src/styles.css` — append:
```css
.nav { margin: 4px 0 12px; }
.layout-grid { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.canvas { border: 1px solid #cbd5e1; background:
  repeating-linear-gradient(0deg, #f8fafc, #f8fafc 3px, #eef2f7 4px),
  repeating-linear-gradient(90deg, #f8fafc, #f8fafc 3px, #eef2f7 4px);
  max-width: 100%; touch-action: none; }
.panel { flex: 1 1 260px; min-width: 240px; }
.panel section { margin-bottom: 16px; }
.panel h2 { font-size: 1rem; margin: 8px 0; }
.room { fill: rgba(37,99,235,0.06); stroke: #2563eb; stroke-width: 1; }
.room-label { font-size: 11px; fill: #1e3a8a; }
.furniture { fill: rgba(5,150,105,0.25); stroke: #059669; stroke-width: 1; cursor: move; }
.furn-label { font-size: 11px; fill: #064e3b; }
.mini-list { list-style: none; padding: 0; }
.mini-list li { display: flex; align-items: center; gap: 6px; padding: 4px 0; flex-wrap: wrap; }
.mini-list .muted { color: #9ca3af; }
.room-form { display: flex; flex-wrap: wrap; gap: 6px; }
.room-form input { flex: 1 1 90px; padding: 6px; border: 1px solid #ccc; border-radius: 6px; }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && npx vitest run src/pages/LayoutPage.test.jsx`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
git add web/src/pages/LayoutPage.jsx web/src/pages/LayoutPage.test.jsx web/src/styles.css
git commit -m "feat: layout page render + room/placement controls"
```

---

## Task 7: 드래그로 방·가구 이동 (mouse 이벤트)

**Files:**
- Modify: `web/src/pages/LayoutPage.jsx`
- Modify: `web/src/pages/LayoutPage.test.jsx` (add a drag test)

**Interfaces:**
- Consumes: geometry `pxToCm/snapCm/cmToPx`; `api.updateRoom(id, {x,y})`, `api.placeItem(itemId, {x,y,rotation})`.
- Produces: dragging a room or furniture rect on the SVG repositions it; on mouse-up the new snapped position is persisted (rooms via `updateRoom`, furniture via `placeItem` keeping rotation) and the layout reloads. Live offset is shown during the drag.

- [ ] **Step 1: 실패하는 드래그 테스트 작성 (append to LayoutPage.test.jsx)**

Add `fireEvent` to the existing import line: `import { render, screen, waitFor, fireEvent } from '@testing-library/react';`. Then append:
```jsx
test('dragging a room persists the snapped new position', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  api.updateRoom.mockResolvedValue({});
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText(/거실/);
  const rect = screen.getByTestId('room-1');
  const svg = screen.getByRole('img', { name: '평면도' });
  // move +40px in x → 40 / 0.4 = 100cm; room.x was 0 → 100
  fireEvent.mouseDown(rect, { clientX: 0, clientY: 0 });
  fireEvent.mouseMove(svg, { clientX: 40, clientY: 0 });
  fireEvent.mouseUp(svg, { clientX: 40, clientY: 0 });
  await waitFor(() => expect(api.updateRoom).toHaveBeenCalledWith(1, { x: 100, y: 0 }));
});

test('dragging furniture persists via placeItem keeping rotation', async () => {
  api.getLayout.mockResolvedValue(LAYOUT);
  api.placeItem.mockResolvedValue({});
  render(<MemoryRouter><LayoutPage /></MemoryRouter>);
  await screen.findByText('소파');
  const rect = screen.getByTestId('furn-5');
  const svg = screen.getByRole('img', { name: '평면도' });
  // move +0px x, +40px y → +100cm y; placement was (10,20) rot 0 → (10, 120)
  fireEvent.mouseDown(rect, { clientX: 0, clientY: 0 });
  fireEvent.mouseMove(svg, { clientX: 0, clientY: 40 });
  fireEvent.mouseUp(svg, { clientX: 0, clientY: 40 });
  await waitFor(() => expect(api.placeItem).toHaveBeenCalledWith(5, { x: 10, y: 120, rotation: 0 }));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd web && npx vitest run src/pages/LayoutPage.test.jsx`
Expected: FAIL — the two new drag tests fail (no drag handlers wired; `updateRoom`/`placeItem` not called by mouse events).

- [ ] **Step 3: 드래그 구현 (edit LayoutPage.jsx)**

Update the geometry import to include `pxToCm` and `snapCm`:
```jsx
import { cmToPx, pxToCm, snapCm, rotatedFootprint, nextRotation } from '../geometry.js';
```

Add drag state and handlers inside `LayoutPage`, right after the `const [room, setRoom] = ...` line:
```jsx
  const [drag, setDrag] = useState(null); // { kind:'room'|'item', id, startX, startY, dxCm, dyCm }

  function startDrag(kind, id, e) {
    e.preventDefault();
    setDrag({ kind, id, startX: e.clientX, startY: e.clientY, dxCm: 0, dyCm: 0 });
  }
  function moveDrag(e) {
    setDrag((d) => (d ? { ...d, dxCm: pxToCm(e.clientX - d.startX), dyCm: pxToCm(e.clientY - d.startY) } : d));
  }
  async function endDrag(e) {
    if (!drag) return;
    const ddx = snapCm(pxToCm(e.clientX - drag.startX));
    const ddy = snapCm(pxToCm(e.clientY - drag.startY));
    const d = drag;
    setDrag(null);
    if (ddx === 0 && ddy === 0) return;
    try {
      if (d.kind === 'room') {
        const r = layout.rooms.find((r) => r.id === d.id);
        await api.updateRoom(d.id, { x: r.x + ddx, y: r.y + ddy });
      } else {
        const p = layout.placements.find((p) => p.item_id === d.id);
        await api.placeItem(d.id, { x: p.x + ddx, y: p.y + ddy, rotation: p.rotation });
      }
      await load();
    } catch (err) { setError(err.message); }
  }
  const liveOffset = (kind, id) =>
    drag && drag.kind === kind && drag.id === id
      ? { dx: cmToPx(drag.dxCm), dy: cmToPx(drag.dyCm) }
      : { dx: 0, dy: 0 };
```

Wire mouse move/up onto the `<svg>` (add these two props to the existing `<svg ...>` tag):
```jsx
          onMouseMove={moveDrag}
          onMouseUp={endDrag}
```

Apply drag start + live offset to the room `<g>` block (replace the existing room map body):
```jsx
          {rooms.map((r) => {
            const off = liveOffset('room', r.id);
            return (
              <g key={`room-${r.id}`} transform={`translate(${off.dx} ${off.dy})`}>
                <rect className="room" data-testid={`room-${r.id}`}
                  onMouseDown={(e) => startDrag('room', r.id, e)}
                  x={cmToPx(r.x)} y={cmToPx(r.y)} width={cmToPx(r.width_cm)} height={cmToPx(r.depth_cm)} />
                <text x={cmToPx(r.x) + 4} y={cmToPx(r.y) + 14} className="room-label">
                  {r.name} ({r.width_cm}×{r.depth_cm})
                </text>
              </g>
            );
          })}
```

Apply drag start + live offset to the furniture `<g>` block (replace the existing placements map body):
```jsx
          {placements.map((p) => {
            const f = rotatedFootprint(p.width_cm, p.depth_cm, p.rotation);
            const off = liveOffset('item', p.item_id);
            return (
              <g key={`item-${p.item_id}`} transform={`translate(${off.dx} ${off.dy})`}>
                <rect className="furniture" data-testid={`furn-${p.item_id}`}
                  onMouseDown={(e) => startDrag('item', p.item_id, e)}
                  x={cmToPx(p.x)} y={cmToPx(p.y)} width={cmToPx(f.w)} height={cmToPx(f.h)} />
                <text x={cmToPx(p.x) + 4} y={cmToPx(p.y) + 14} className="furn-label">{p.name}</text>
              </g>
            );
          })}
```

- [ ] **Step 4: 테스트 통과 + 전체 프론트 스위트 + 빌드**

Run: `cd web && npm test`
Expected: PASS — 전체 프론트 스위트(api 6 + HomePage 2 + ItemDetailPage 3 + geometry 4 + LayoutPage 7 = 22), pristine (RR future-flag 경고 허용).

Run: `cd web && npm run build`
Expected: `web/dist/` 생성, 빌드 오류 없음 (모든 import 해결됨).

- [ ] **Step 5: 커밋**

```bash
git add web/src/pages/LayoutPage.jsx web/src/pages/LayoutPage.test.jsx
git commit -m "feat: drag rooms and furniture on the floor plan canvas"
```

---

## Self-Review

**1. Spec coverage (Phase 2 sections of the design doc):**
- 방 관리(이름·가로×세로 입력, 사각형 블록) → Task 2(API) + Task 6(폼/목록) ✅
- 방을 드래그로 위치 잡아 아파트 윤곽 구성(스냅) → Task 7(드래그) + geometry `snapCm` ✅
- 확정 가구가 실제 치수 사각형으로 등장 → Task 4(palette/placements 치수 포함) + Task 6(렌더) ✅
- 마우스 드래그 이동 → Task 7 ✅
- 90° 회전 → Task 6(회전 버튼) + geometry `nextRotation`/`rotatedFootprint` ✅
- 격자 스냅 → geometry `snapCm`(10cm) ✅
- 위치 저장 → Task 3(placements upsert) + Task 7(드롭 시 persist) ✅
- 배치 불가 목록(치수 없는 확정 항목) → Task 4(unplaceable) + Task 6(목록 + 항목 상세 링크) ✅
- 데이터 모델 rooms/placements → Task 1 ✅
- 후순위(겹침 감지·비사각형 방·문/창문·전체아파트 폴리곤)는 의도적으로 제외 ✅

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "TBD/적절히 처리" 없음. pg-mem ON CONFLICT는 명시적 named-risk + 구체적 대안(트랜잭션 수동 upsert)을 제시 — placeholder 아님. ✅

**3. Type consistency:**
- 쿼리 정규화기 이름: rooms는 `normalizeRoomRow`(행), 검증기는 `normalizeRoomInput`(입력) — 충돌 없음 ✅
- `parseId`/에러형식/`createApp` 마운트 패턴이 Phase 1과 일치 ✅
- layout 응답 필드(`item_id,name,x,y,rotation,width_cm,depth_cm` / palette·unplaceable)가 백엔드(Task 4) ↔ 프론트(Task 6) 일치 ✅
- api 메서드명(`getLayout/createRoom/updateRoom/deleteRoom/placeItem/unplaceItem`)이 클라이언트·페이지·테스트에서 일치 ✅
- geometry 함수명(`cmToPx/pxToCm/snapCm/rotatedFootprint/nextRotation`)이 페이지·테스트에서 일치 ✅

**Cross-task test-count expectations:** 백엔드 최종 42 (Task 4 기준); 프론트 최종 22 (Task 7 기준).

## 알려진 한계 / 후순위 (설계상 의도)

- 겹침(충돌) 감지 없음 — 방/가구가 서로 겹쳐 놓여도 경고하지 않음.
- 드래그 이동 중 커서가 SVG 밖으로 나가면 이동이 멈춤(mouseup을 svg에서 받음). v1 허용; window 레벨 캡처는 후속 개선.
- 항목의 확정을 해제하거나 확정 후보를 삭제하면 그 항목은 layout에서 자동으로 사라지지만(확정 후보 JOIN 기준), `placements` 행 자체는 남아 있다가 재확정 시 이전 위치로 복원됨 — 실사용에 무해, 필요 시 후속 정리.
- 비사각형/대각선 방, 문·창문 표시, 전체 아파트 폴리곤 윤곽은 후순위.

## 실행 후 최종 통합 점검 (수동)

전체 Task 완료 후 로컬 PostgreSQL로 1회 확인:
1. `npm run migrate` (002가 적용되고, 재실행 시 "Skip (already applied)" 출력 확인)
2. `cd web && npm run build && cd ..` → `npm start`
3. 항목 확정(치수 포함) → `/layout`에서 방 추가 → 팔레트에서 "배치" → 캔버스에서 드래그 이동 → 회전 → 새로고침 후 위치 유지 확인. 치수 없는 확정 항목이 "배치 불가"에 뜨는지 확인.
