# 혼수 목록 & 예산 (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 혼수 필요 항목을 적고, 항목마다 후보 제품(이름·가격·URL·메모·치수)을 비교해 하나를 확정하면 전체 예상 금액이 계산되는 웹앱의 Phase 1을 만든다.

**Architecture:** 단일 Node.js(Express) 프로세스가 PostgreSQL을 쓰는 REST JSON API를 제공하고, 빌드된 React(Vite) 프론트를 정적으로 서빙한다. DB 접근은 `queries/*` 모듈에 격리하고, Express 앱은 `createApp(pool)` 팩토리로 만들어 테스트에서 in-memory PostgreSQL(pg-mem)을 주입한다.

**Tech Stack:** Node.js(ESM) + Express 4 + `pg`, PostgreSQL. 프론트 React 18 + Vite 5 + react-router-dom 6. 테스트: 백엔드 Vitest + supertest + pg-mem, 프론트 Vitest + @testing-library/react + jsdom.

## Global Constraints

- **런타임:** Node.js 20+ (내장 `node --watch`, ESM 사용). 모든 서버 파일은 `"type": "module"` 아래 ESM.
- **통화:** 금액은 정수 원(KRW). DB `price`는 `bigint`, 음수 불가, 미입력(null) 허용.
- **치수:** cm 단위 `numeric`(소수 허용), 값이 있으면 0 초과. 선택 입력(null 허용).
- **인증:** 없음. 로컬 네트워크 공유 전제.
- **DB 접근 격리:** 라우트는 SQL을 직접 쓰지 않고 `server/queries/*` 함수만 호출한다.
- **앱 팩토리:** `createApp(pool)`는 `listen`하지 않는다. 리스닝은 `server/index.js`에서만.
- **에러 응답 형식:** 실패는 항상 `{ "error": "<메시지>" }` JSON. 검증 400, 없음 404, 서버 오류 500.
- **테스트 DB:** 테스트는 실제 PostgreSQL을 요구하지 않는다. pg-mem에 `migrations/001_init.sql`을 적용해 사용한다.

---

## File Structure

```
honsu-planner/
  package.json              서버 의존성/스크립트 (ESM)
  .env.example              DATABASE_URL, PORT
  .gitignore
  README.md                 실행 방법
  migrations/
    001_init.sql            items, candidates 스키마 (Phase 1)
  server/
    db.js                   createPool() — 런타임 pg Pool
    app.js                  createApp(pool) — Express 앱 (라우트 마운트, 에러 핸들러)
    index.js                부트스트랩 + listen
    migrate.js              migrations/*.sql 순서대로 실행
    validation.js           validateItemName, normalizeCandidate
    queries/
      items.js              항목 CRUD + 확정/해제 쿼리
      candidates.js         후보 CRUD 쿼리
      summary.js            총액 요약 쿼리
    routes/
      items.js              /api/items* (+ /confirm), factory (pool)=>Router
      candidates.js         /api/items/:id/candidates, /api/candidates/:id
      summary.js            /api/summary
  test/
    helpers/testApp.js      pg-mem + createApp 테스트 하네스
    items.test.js
    candidates.test.js
    confirm.test.js
    summary.test.js
    health.test.js
  web/
    package.json
    vite.config.js
    index.html
    src/
      main.jsx
      App.jsx
      api.js                fetch 래퍼 API 클라이언트
      format.js             won() 통화 포맷
      styles.css
      test-setup.js
      api.test.js
      pages/
        HomePage.jsx
        HomePage.test.jsx
        ItemDetailPage.jsx
        ItemDetailPage.test.jsx
```

---

## Task 1: 백엔드 스캐폴딩 · 스키마 · 테스트 하네스

**Files:**
- Create: `honsu-planner/package.json`, `.env.example`, `.gitignore`, `README.md`
- Create: `migrations/001_init.sql`
- Create: `server/db.js`, `server/app.js`, `server/index.js`, `server/migrate.js`
- Create: `test/helpers/testApp.js`, `test/health.test.js`

**Interfaces:**
- Produces: `createApp(pool)` → Express app (mounts `express.json()`, `GET /api/health`, error handler; routers added in later tasks). `createPool()` → `pg.Pool`. `createTestApp()` → `{ app, pool }` (test helper).

- [ ] **Step 1: 프로젝트 파일 생성**

`honsu-planner/package.json`:
```json
{
  "name": "honsu-planner-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "migrate": "node server/migrate.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.11.5"
  },
  "devDependencies": {
    "pg-mem": "^2.8.1",
    "supertest": "^7.0.0",
    "vitest": "^1.6.0"
  }
}
```

`.env.example`:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/honsu
PORT=3000
```

`.gitignore`:
```
node_modules/
.env
web/dist/
```

`README.md`:
```markdown
# honsu-planner

혼수 목록 & 예산 (Phase 1).

## 실행
1. PostgreSQL DB 생성 후 `.env` 작성 (`.env.example` 참고)
2. `npm install`
3. `npm run migrate`
4. `cd web && npm install && npm run build && cd ..`
5. `npm start` → http://localhost:3000

## 개발
- 서버: `npm run dev`
- 프론트(별도 터미널): `cd web && npm run dev` (Vite dev, /api는 :3000으로 프록시)

## 테스트
- 서버: `npm test`
- 프론트: `cd web && npm test`
```

`migrations/001_init.sql`:
```sql
CREATE TABLE items (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  confirmed_candidate_id int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE candidates (
  id serial PRIMARY KEY,
  item_id int NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price bigint,
  url text,
  memo text,
  width_cm numeric,
  depth_cm numeric,
  height_cm numeric,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_item ON candidates(item_id);
```

`server/db.js`:
```js
import pg from 'pg';

export function createPool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}
```

`server/app.js`:
```js
import express from 'express';

export function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Routers are mounted here in later tasks.

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

`server/index.js`:
```js
import { createApp } from './app.js';
import { createPool } from './db.js';

const pool = createPool();
const app = createApp(pool);
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`honsu-planner listening on :${port}`));
```

`server/migrate.js`:
```js
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const pool = createPool();
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  console.log('Running', f);
  await pool.query(readFileSync(path.join(dir, f), 'utf8'));
}
await pool.end();
console.log('Migrations complete');
```

- [ ] **Step 2: 테스트 하네스 + smoke 테스트 작성**

`test/helpers/testApp.js`:
```js
import { readFileSync } from 'node:fs';
import { newDb } from 'pg-mem';
import { createApp } from '../../server/app.js';

export function createTestApp() {
  const db = newDb();
  const sql = readFileSync(new URL('../../migrations/001_init.sql', import.meta.url), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const app = createApp(pool);
  return { app, pool };
}
```

`test/health.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

test('GET /api/health returns ok', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true });
});
```

- [ ] **Step 3: 의존성 설치 후 테스트 실패/성공 확인**

Run: `cd honsu-planner && npm install && npm test`
Expected: `health.test.js` PASS (1 passed). 만약 pg-mem이 `001_init.sql`을 적용하지 못하면 여기서 즉시 드러난다 — 그 경우 SQL을 pg-mem 호환으로 조정(이 스키마는 serial/bigint/numeric/timestamptz/now()/CASCADE만 사용하므로 지원됨).

- [ ] **Step 4: 커밋**

```bash
git add honsu-planner
git commit -m "feat: scaffold server, schema, and pg-mem test harness"
```

---

## Task 2: 항목(items) CRUD API

**Files:**
- Create: `server/queries/items.js`, `server/validation.js`, `server/routes/items.js`
- Modify: `server/app.js` (라우터 마운트)
- Test: `test/items.test.js`

**Interfaces:**
- Consumes: `createTestApp()`, `createApp(pool)`.
- Produces:
  - `validateItemName(name)` → `string | null` (에러 메시지 또는 null)
  - queries/items.js: `listItems(pool)`, `getItem(pool, id)`, `getItemWithCandidates(pool, id)`, `createItem(pool, {name})`, `updateItem(pool, id, {name?, sort_order?})`, `deleteItem(pool, id)`
  - `itemsRouter(pool)` → Express Router
  - 항목 행 형태: `{ id, name, sort_order, confirmed_candidate_id, created_at }`. `listItems`는 추가로 `confirmed_name`, `confirmed_price`(number|null).

- [ ] **Step 1: 실패하는 테스트 작성**

`test/items.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

test('POST /api/items creates an item', async () => {
  const { app } = createTestApp();
  const res = await request(app).post('/api/items').send({ name: '  냉장고  ' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: '냉장고', confirmed_candidate_id: null });
  expect(res.body.id).toBeGreaterThan(0);
});

test('POST /api/items rejects empty name', async () => {
  const { app } = createTestApp();
  const res = await request(app).post('/api/items').send({ name: '   ' });
  expect(res.status).toBe(400);
  expect(res.body.error).toBeTruthy();
});

test('GET /api/items lists items with confirmed info', async () => {
  const { app } = createTestApp();
  await request(app).post('/api/items').send({ name: '냉장고' });
  await request(app).post('/api/items').send({ name: '세탁기' });
  const res = await request(app).get('/api/items');
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
  expect(res.body[0]).toHaveProperty('confirmed_price', null);
});

test('GET /api/items/:id returns 404 when missing', async () => {
  const { app } = createTestApp();
  const res = await request(app).get('/api/items/999');
  expect(res.status).toBe(404);
});

test('PATCH /api/items/:id updates name', async () => {
  const { app } = createTestApp();
  const created = await request(app).post('/api/items').send({ name: '냉장고' });
  const res = await request(app).patch(`/api/items/${created.body.id}`).send({ name: '김치냉장고' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('김치냉장고');
});

test('DELETE /api/items/:id removes it', async () => {
  const { app } = createTestApp();
  const created = await request(app).post('/api/items').send({ name: '냉장고' });
  const del = await request(app).delete(`/api/items/${created.body.id}`);
  expect(del.status).toBe(204);
  const res = await request(app).get(`/api/items/${created.body.id}`);
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner && npx vitest run test/items.test.js`
Expected: FAIL (404 on POST /api/items — 라우터 미마운트).

- [ ] **Step 3: 구현**

`server/validation.js`:
```js
export function validateItemName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Name is required';
  if (name.trim().length > 100) return 'Name is too long';
  return null;
}
```

`server/queries/items.js`:
```js
export async function listItems(pool) {
  const { rows } = await pool.query(
    `SELECT i.id, i.name, i.sort_order, i.confirmed_candidate_id, i.created_at,
            c.name AS confirmed_name, c.price AS confirmed_price
     FROM items i
     LEFT JOIN candidates c ON c.id = i.confirmed_candidate_id
     ORDER BY i.sort_order, i.id`
  );
  return rows.map((r) => ({
    ...r,
    confirmed_price: r.confirmed_price === null || r.confirmed_price === undefined
      ? null : Number(r.confirmed_price),
  }));
}

export async function getItem(pool, id) {
  const { rows } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getItemWithCandidates(pool, id) {
  const item = await getItem(pool, id);
  if (!item) return null;
  const { rows } = await pool.query(
    'SELECT * FROM candidates WHERE item_id = $1 ORDER BY sort_order, id',
    [id]
  );
  return { ...item, candidates: rows.map(normalizeCandidateRow) };
}

export async function createItem(pool, { name }) {
  const { rows } = await pool.query(
    'INSERT INTO items (name) VALUES ($1) RETURNING *',
    [name]
  );
  return rows[0];
}

export async function updateItem(pool, id, data) {
  const sets = [];
  const vals = [];
  let i = 1;
  if ('name' in data) { sets.push(`name = $${i++}`); vals.push(data.name); }
  if ('sort_order' in data) { sets.push(`sort_order = $${i++}`); vals.push(data.sort_order); }
  if (sets.length === 0) return getItem(pool, id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ?? null;
}

export async function deleteItem(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [id]);
  return rowCount > 0;
}

export function normalizeCandidateRow(r) {
  return {
    ...r,
    price: r.price === null || r.price === undefined ? null : Number(r.price),
    width_cm: r.width_cm === null || r.width_cm === undefined ? null : Number(r.width_cm),
    depth_cm: r.depth_cm === null || r.depth_cm === undefined ? null : Number(r.depth_cm),
    height_cm: r.height_cm === null || r.height_cm === undefined ? null : Number(r.height_cm),
  };
}
```

`server/routes/items.js`:
```js
import express from 'express';
import * as items from '../queries/items.js';
import { validateItemName } from '../validation.js';

export function itemsRouter(pool) {
  const r = express.Router();

  r.get('/items', async (req, res, next) => {
    try { res.json(await items.listItems(pool)); } catch (e) { next(e); }
  });

  r.get('/items/:id', async (req, res, next) => {
    try {
      const item = await items.getItemWithCandidates(pool, Number(req.params.id));
      if (!item) return res.status(404).json({ error: 'Item not found' });
      res.json(item);
    } catch (e) { next(e); }
  });

  r.post('/items', async (req, res, next) => {
    try {
      const err = validateItemName(req.body?.name);
      if (err) return res.status(400).json({ error: err });
      res.status(201).json(await items.createItem(pool, { name: req.body.name.trim() }));
    } catch (e) { next(e); }
  });

  r.patch('/items/:id', async (req, res, next) => {
    try {
      const data = {};
      if (req.body?.name !== undefined) {
        const err = validateItemName(req.body.name);
        if (err) return res.status(400).json({ error: err });
        data.name = req.body.name.trim();
      }
      if (req.body?.sort_order !== undefined) data.sort_order = Number(req.body.sort_order);
      const updated = await items.updateItem(pool, Number(req.params.id), data);
      if (!updated) return res.status(404).json({ error: 'Item not found' });
      res.json(updated);
    } catch (e) { next(e); }
  });

  r.delete('/items/:id', async (req, res, next) => {
    try {
      const ok = await items.deleteItem(pool, Number(req.params.id));
      if (!ok) return res.status(404).json({ error: 'Item not found' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
```

`server/app.js` — 라우터 마운트 (health 라인 아래, 에러 핸들러 위):
```js
import express from 'express';
import { itemsRouter } from './routes/items.js';

export function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', itemsRouter(pool));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner && npx vitest run test/items.test.js`
Expected: PASS (6 passed).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/server honsu-planner/test/items.test.js
git commit -m "feat: items CRUD API"
```

---

## Task 3: 후보(candidates) CRUD API

**Files:**
- Create: `server/queries/candidates.js`, `server/routes/candidates.js`
- Modify: `server/validation.js` (normalizeCandidate 추가), `server/app.js` (라우터 마운트)
- Test: `test/candidates.test.js`

**Interfaces:**
- Consumes: `items.normalizeCandidateRow`, `getItem`.
- Produces:
  - `normalizeCandidate(body, {partial})` → `{ errors: string[], value: object }`
  - queries/candidates.js: `getCandidate(pool, id)`, `createCandidate(pool, itemId, value)`, `updateCandidate(pool, id, value)`, `deleteCandidate(pool, id)` (확정 참조도 정리)
  - `candidatesRouter(pool)` → Router (`POST /items/:id/candidates`, `PATCH/DELETE /candidates/:id`)
  - 후보 행: `{ id, item_id, name, price, url, memo, width_cm, depth_cm, height_cm, sort_order, created_at }` (숫자 필드는 number|null)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/candidates.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function makeItem(app, name = '냉장고') {
  const res = await request(app).post('/api/items').send({ name });
  return res.body.id;
}

test('POST candidate with full fields', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const res = await request(app).post(`/api/items/${id}/candidates`).send({
    name: 'LG 냉장고', price: 1200000, url: 'http://x', memo: '4도어',
    width_cm: 91.2, depth_cm: 70, height_cm: 179,
  });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: 'LG 냉장고', price: 1200000, width_cm: 91.2 });
});

test('POST candidate allows optional fields to be omitted', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const res = await request(app).post(`/api/items/${id}/candidates`).send({ name: '이름만' });
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ name: '이름만', price: null, width_cm: null });
});

test('POST candidate rejects negative price', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const res = await request(app).post(`/api/items/${id}/candidates`).send({ name: 'x', price: -5 });
  expect(res.status).toBe(400);
});

test('POST candidate rejects missing name', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const res = await request(app).post(`/api/items/${id}/candidates`).send({ price: 100 });
  expect(res.status).toBe(400);
});

test('PATCH candidate updates price', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const c = await request(app).post(`/api/items/${id}/candidates`).send({ name: 'x', price: 100 });
  const res = await request(app).patch(`/api/candidates/${c.body.id}`).send({ price: 200 });
  expect(res.status).toBe(200);
  expect(res.body.price).toBe(200);
});

test('DELETE candidate removes it', async () => {
  const { app } = createTestApp();
  const id = await makeItem(app);
  const c = await request(app).post(`/api/items/${id}/candidates`).send({ name: 'x' });
  const del = await request(app).delete(`/api/candidates/${c.body.id}`);
  expect(del.status).toBe(204);
  const item = await request(app).get(`/api/items/${id}`);
  expect(item.body.candidates).toHaveLength(0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner && npx vitest run test/candidates.test.js`
Expected: FAIL (404 — 라우터 미마운트).

- [ ] **Step 3: 구현**

`server/validation.js` — 아래 함수 추가:
```js
export function normalizeCandidate(body, { partial = false } = {}) {
  const out = {};
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      errors.push('Name is required');
    } else {
      out.name = body.name.trim();
    }
  }

  if (body.price !== undefined) {
    if (body.price === null || body.price === '') {
      out.price = null;
    } else {
      const n = Number(body.price);
      if (!Number.isInteger(n) || n < 0) errors.push('Price must be a non-negative integer');
      else out.price = n;
    }
  }

  for (const key of ['url', 'memo']) {
    if (body[key] !== undefined) out[key] = body[key] === '' ? null : String(body[key]);
  }

  for (const [key, label] of [['width_cm', 'Width'], ['depth_cm', 'Depth'], ['height_cm', 'Height']]) {
    if (body[key] !== undefined) {
      if (body[key] === null || body[key] === '') {
        out[key] = null;
      } else {
        const n = Number(body[key]);
        if (!(n > 0)) errors.push(`${label} must be a positive number`);
        else out[key] = n;
      }
    }
  }

  return { errors, value: out };
}
```

`server/queries/candidates.js`:
```js
import { normalizeCandidateRow } from './items.js';

const COLS = ['name', 'price', 'url', 'memo', 'width_cm', 'depth_cm', 'height_cm'];

export async function getCandidate(pool, id) {
  const { rows } = await pool.query('SELECT * FROM candidates WHERE id = $1', [id]);
  return rows[0] ? normalizeCandidateRow(rows[0]) : null;
}

export async function createCandidate(pool, itemId, value) {
  const { rows } = await pool.query(
    `INSERT INTO candidates (item_id, name, price, url, memo, width_cm, depth_cm, height_cm)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      itemId, value.name, value.price ?? null, value.url ?? null, value.memo ?? null,
      value.width_cm ?? null, value.depth_cm ?? null, value.height_cm ?? null,
    ]
  );
  return normalizeCandidateRow(rows[0]);
}

export async function updateCandidate(pool, id, value) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const c of COLS) {
    if (c in value) { sets.push(`${c} = $${i++}`); vals.push(value[c]); }
  }
  if (sets.length === 0) return getCandidate(pool, id);
  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE candidates SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  return rows[0] ? normalizeCandidateRow(rows[0]) : null;
}

export async function deleteCandidate(pool, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE items SET confirmed_candidate_id = NULL WHERE confirmed_candidate_id = $1', [id]);
    const { rowCount } = await client.query('DELETE FROM candidates WHERE id = $1', [id]);
    await client.query('COMMIT');
    return rowCount > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

`server/routes/candidates.js`:
```js
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
```

`server/app.js` — items 라우터 아래에 추가:
```js
import { candidatesRouter } from './routes/candidates.js';
// ...
  app.use('/api', itemsRouter(pool));
  app.use('/api', candidatesRouter(pool));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner && npx vitest run test/candidates.test.js`
Expected: PASS (6 passed).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/server honsu-planner/test/candidates.test.js
git commit -m "feat: candidates CRUD API"
```

---

## Task 4: 확정 / 확정 해제 API

**Files:**
- Modify: `server/queries/items.js` (setConfirmed, clearConfirmed), `server/routes/items.js` (confirm 라우트)
- Test: `test/confirm.test.js`

**Interfaces:**
- Consumes: `getItem`, `getItemWithCandidates`.
- Produces:
  - `setConfirmed(pool, itemId, candidateId)` → item row | null (후보가 해당 항목 소속일 때만 갱신)
  - `clearConfirmed(pool, itemId)` → item row | null
  - 라우트: `PUT /api/items/:id/confirm { candidate_id }`, `DELETE /api/items/:id/confirm`

- [ ] **Step 1: 실패하는 테스트 작성**

`test/confirm.test.js`:
```js
import { test, expect } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';

async function setup(app) {
  const item = await request(app).post('/api/items').send({ name: '냉장고' });
  const cand = await request(app).post(`/api/items/${item.body.id}/candidates`)
    .send({ name: 'LG', price: 1200000 });
  return { itemId: item.body.id, candId: cand.body.id };
}

test('PUT confirm sets confirmed candidate', async () => {
  const { app } = createTestApp();
  const { itemId, candId } = await setup(app);
  const res = await request(app).put(`/api/items/${itemId}/confirm`).send({ candidate_id: candId });
  expect(res.status).toBe(200);
  expect(res.body.confirmed_candidate_id).toBe(candId);

  const list = await request(app).get('/api/items');
  expect(list.body[0].confirmed_price).toBe(1200000);
});

test('DELETE confirm clears it', async () => {
  const { app } = createTestApp();
  const { itemId, candId } = await setup(app);
  await request(app).put(`/api/items/${itemId}/confirm`).send({ candidate_id: candId });
  const res = await request(app).delete(`/api/items/${itemId}/confirm`);
  expect(res.status).toBe(200);
  expect(res.body.confirmed_candidate_id).toBeNull();
});

test('PUT confirm rejects candidate from another item', async () => {
  const { app } = createTestApp();
  const { candId } = await setup(app);
  const other = await request(app).post('/api/items').send({ name: '세탁기' });
  const res = await request(app).put(`/api/items/${other.body.id}/confirm`).send({ candidate_id: candId });
  expect(res.status).toBe(400);
});

test('PUT confirm 404 when item missing', async () => {
  const { app } = createTestApp();
  const res = await request(app).put('/api/items/999/confirm').send({ candidate_id: 1 });
  expect(res.status).toBe(404);
});

test('deleting confirmed candidate clears confirmation', async () => {
  const { app } = createTestApp();
  const { itemId, candId } = await setup(app);
  await request(app).put(`/api/items/${itemId}/confirm`).send({ candidate_id: candId });
  await request(app).delete(`/api/candidates/${candId}`);
  const item = await request(app).get(`/api/items/${itemId}`);
  expect(item.body.confirmed_candidate_id).toBeNull();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner && npx vitest run test/confirm.test.js`
Expected: FAIL (404/405 — confirm 라우트 없음).

- [ ] **Step 3: 구현**

`server/queries/items.js` — 아래 함수 추가:
```js
export async function setConfirmed(pool, itemId, candidateId) {
  const { rows } = await pool.query(
    `UPDATE items SET confirmed_candidate_id = $2
     WHERE id = $1 AND EXISTS (SELECT 1 FROM candidates WHERE id = $2 AND item_id = $1)
     RETURNING *`,
    [itemId, candidateId]
  );
  return rows[0] ?? null;
}

export async function clearConfirmed(pool, itemId) {
  const { rows } = await pool.query(
    'UPDATE items SET confirmed_candidate_id = NULL WHERE id = $1 RETURNING *',
    [itemId]
  );
  return rows[0] ?? null;
}
```

`server/routes/items.js` — `return r;` 직전에 추가:
```js
  r.put('/items/:id/confirm', async (req, res, next) => {
    try {
      const itemId = Number(req.params.id);
      const candidateId = Number(req.body?.candidate_id);
      if (!Number.isInteger(candidateId)) {
        return res.status(400).json({ error: 'candidate_id is required' });
      }
      const item = await items.getItem(pool, itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      const updated = await items.setConfirmed(pool, itemId, candidateId);
      if (!updated) return res.status(400).json({ error: 'Candidate does not belong to this item' });
      res.json(updated);
    } catch (e) { next(e); }
  });

  r.delete('/items/:id/confirm', async (req, res, next) => {
    try {
      const updated = await items.clearConfirmed(pool, Number(req.params.id));
      if (!updated) return res.status(404).json({ error: 'Item not found' });
      res.json(updated);
    } catch (e) { next(e); }
  });
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner && npx vitest run test/confirm.test.js`
Expected: PASS (5 passed).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/server honsu-planner/test/confirm.test.js
git commit -m "feat: confirm/unconfirm API"
```

---

## Task 5: 총액 요약 API

**Files:**
- Create: `server/queries/summary.js`, `server/routes/summary.js`
- Modify: `server/app.js` (라우터 마운트)
- Test: `test/summary.test.js`

**Interfaces:**
- Produces:
  - `getSummary(pool)` → `{ confirmed_total: number, unconfirmed_count: number }`
  - `summaryRouter(pool)` → Router (`GET /api/summary`)

- [ ] **Step 1: 실패하는 테스트 작성**

`test/summary.test.js`:
```js
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner && npx vitest run test/summary.test.js`
Expected: FAIL (404 — 라우터 없음).

- [ ] **Step 3: 구현**

`server/queries/summary.js`:
```js
export async function getSummary(pool) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(
         (SELECT SUM(c.price)
          FROM items i JOIN candidates c ON c.id = i.confirmed_candidate_id),
         0) AS confirmed_total,
       (SELECT COUNT(*) FROM items WHERE confirmed_candidate_id IS NULL) AS unconfirmed_count`
  );
  return {
    confirmed_total: Number(rows[0].confirmed_total),
    unconfirmed_count: Number(rows[0].unconfirmed_count),
  };
}
```

`server/routes/summary.js`:
```js
import express from 'express';
import { getSummary } from '../queries/summary.js';

export function summaryRouter(pool) {
  const r = express.Router();
  r.get('/summary', async (req, res, next) => {
    try { res.json(await getSummary(pool)); } catch (e) { next(e); }
  });
  return r;
}
```

`server/app.js` — items 라우터 위(혹은 아래)에 마운트:
```js
import { summaryRouter } from './routes/summary.js';
// ...
  app.use('/api', summaryRouter(pool));
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner && npm test`
Expected: PASS (전체 파일 통과: health, items, candidates, confirm, summary).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/server honsu-planner/test/summary.test.js
git commit -m "feat: summary (total) API"
```

---

## Task 6: 프론트 스캐폴딩 · API 클라이언트 · 정적 서빙

**Files:**
- Create: `web/package.json`, `web/vite.config.js`, `web/index.html`, `web/src/main.jsx`, `web/src/App.jsx`, `web/src/api.js`, `web/src/format.js`, `web/src/styles.css`, `web/src/test-setup.js`, `web/src/api.test.js`
- Modify: `server/app.js` (빌드 정적 서빙)

**Interfaces:**
- Produces:
  - `api` 객체: `getSummary()`, `listItems()`, `getItem(id)`, `createItem(name)`, `updateItem(id, data)`, `deleteItem(id)`, `addCandidate(itemId, data)`, `updateCandidate(id, data)`, `deleteCandidate(id)`, `confirm(itemId, candidateId)`, `unconfirm(itemId)`
  - `won(n)` → 통화 문자열
  - `<App />` (라우터: `/` → HomePage, `/items/:id` → ItemDetailPage; 페이지는 Task 7·8에서 생성)

- [ ] **Step 1: 프론트 스캐폴드 파일 생성**

`web/package.json`:
```json
{
  "name": "honsu-planner-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.5",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "vite": "^5.2.11",
    "vitest": "^1.6.0"
  }
}
```

`web/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test-setup.js' },
});
```

`web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>혼수 목록</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`web/src/test-setup.js`:
```js
import '@testing-library/jest-dom';
```

`web/src/format.js`:
```js
export function won(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('ko-KR') + '원';
}
```

`web/src/api.js`:
```js
const BASE = '/api';

async function req(path, options) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSummary: () => req('/summary'),
  listItems: () => req('/items'),
  getItem: (id) => req(`/items/${id}`),
  createItem: (name) => req('/items', { method: 'POST', body: JSON.stringify({ name }) }),
  updateItem: (id, data) => req(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteItem: (id) => req(`/items/${id}`, { method: 'DELETE' }),
  addCandidate: (itemId, data) =>
    req(`/items/${itemId}/candidates`, { method: 'POST', body: JSON.stringify(data) }),
  updateCandidate: (id, data) =>
    req(`/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCandidate: (id) => req(`/candidates/${id}`, { method: 'DELETE' }),
  confirm: (itemId, candidateId) =>
    req(`/items/${itemId}/confirm`, { method: 'PUT', body: JSON.stringify({ candidate_id: candidateId }) }),
  unconfirm: (itemId) => req(`/items/${itemId}/confirm`, { method: 'DELETE' }),
};
```

`web/src/App.jsx`:
```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage.jsx';
import { ItemDetailPage } from './pages/ItemDetailPage.jsx';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

`web/src/main.jsx`:
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`web/src/styles.css`:
```css
:root { color-scheme: light dark; font-family: system-ui, -apple-system, sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; }
.container { max-width: 720px; margin: 0 auto; padding: 16px; }
h1 { font-size: 1.5rem; }
.summary { background: #f3f4f6; border-radius: 10px; padding: 12px 16px; margin: 12px 0; }
.error { color: #c0392b; }
.add-row, .cand-form { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.add-row input, .cand-form input { flex: 1 1 140px; padding: 8px; border: 1px solid #ccc; border-radius: 8px; }
button { padding: 8px 12px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
button.danger { background: #c0392b; }
.item-list, .candidate-list { list-style: none; padding: 0; }
.item-list li a { display: flex; justify-content: space-between; align-items: center;
  padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px;
  text-decoration: none; color: inherit; }
.badge { font-size: 0.9rem; color: #6b7280; }
.badge.confirmed { color: #059669; font-weight: 600; }
.candidate-list li { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
.candidate-list li.confirmed { border-color: #059669; background: rgba(5,150,105,0.06); }
.cand-head { display: flex; justify-content: space-between; font-weight: 600; }
.cand-actions { display: flex; gap: 8px; margin-top: 8px; }
.dims, .memo { color: #6b7280; font-size: 0.9rem; margin: 4px 0; }
```

`web/src/api.test.js`:
```js
import { vi, beforeEach, test, expect } from 'vitest';
import { api } from './api.js';

beforeEach(() => { global.fetch = vi.fn(); });

test('createItem posts to /api/items', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1, name: '냉장고' }) });
  const r = await api.createItem('냉장고');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/items',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: '냉장고' }) })
  );
  expect(r).toEqual({ id: 1, name: '냉장고' });
});

test('req throws with server error message', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Name is required' }) });
  await expect(api.createItem('')).rejects.toThrow('Name is required');
});

test('deleteItem returns null on 204', async () => {
  global.fetch.mockResolvedValue({ ok: true, status: 204 });
  await expect(api.deleteItem(1)).resolves.toBeNull();
});
```

- [ ] **Step 2: 설치 후 API 테스트 실행**

Run: `cd honsu-planner/web && npm install && npx vitest run src/api.test.js`
Expected: PASS (3 passed). (App.jsx는 아직 없는 페이지를 import하지만, api.test.js는 App을 import하지 않으므로 통과.)

- [ ] **Step 3: Express 정적 서빙 추가**

`server/app.js` — 에러 핸들러 **위**에 추가 (import 두 줄은 파일 상단에):
```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
```
```js
  // API 라우터 마운트 이후, 에러 핸들러 이전:
  const webDist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
```

- [ ] **Step 4: 서버 테스트가 여전히 통과하는지 확인**

Run: `cd honsu-planner && npm test`
Expected: PASS (정적 서빙 추가가 기존 /api 테스트에 영향 없음 — 테스트는 /api 경로만 호출).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/web honsu-planner/server/app.js
git commit -m "feat: frontend scaffold, api client, static serving"
```

---

## Task 7: 홈 화면 (요약 · 목록 · 항목 추가)

**Files:**
- Create: `web/src/pages/HomePage.jsx`, `web/src/pages/HomePage.test.jsx`

**Interfaces:**
- Consumes: `api.getSummary`, `api.listItems`, `api.createItem`, `won`, react-router `Link`.
- Produces: `<HomePage />`.

- [ ] **Step 1: 실패하는 테스트 작성**

`web/src/pages/HomePage.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { HomePage } from './HomePage.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: { getSummary: vi.fn(), listItems: vi.fn(), createItem: vi.fn() },
}));

beforeEach(() => { vi.clearAllMocks(); });

test('renders summary and items', async () => {
  api.getSummary.mockResolvedValue({ confirmed_total: 1200000, unconfirmed_count: 2 });
  api.listItems.mockResolvedValue([
    { id: 1, name: '냉장고', confirmed_candidate_id: 9, confirmed_price: 1200000 },
    { id: 2, name: '소파', confirmed_candidate_id: null, confirmed_price: null },
  ]);
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(await screen.findByText('냉장고')).toBeInTheDocument();
  expect(screen.getByText(/미확정 2건/)).toBeInTheDocument();
  expect(screen.getByText('⚪ 비교중')).toBeInTheDocument();
});

test('adds an item and reloads', async () => {
  api.getSummary.mockResolvedValue({ confirmed_total: 0, unconfirmed_count: 0 });
  api.listItems.mockResolvedValue([]);
  api.createItem.mockResolvedValue({ id: 1, name: '소파' });
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('새 항목 이름'), '소파');
  await userEvent.click(screen.getByText('＋ 항목 추가'));
  await waitFor(() => expect(api.createItem).toHaveBeenCalledWith('소파'));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner/web && npx vitest run src/pages/HomePage.test.jsx`
Expected: FAIL (HomePage 모듈 없음).

- [ ] **Step 3: 구현**

`web/src/pages/HomePage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { won } from '../format.js';

export function HomePage() {
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [s, list] = await Promise.all([api.getSummary(), api.listItems()]);
      setSummary(s);
      setItems(list);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, []);

  async function addItem(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createItem(name.trim());
      setName('');
      await load();
    } catch (e) { setError(e.message); }
  }

  return (
    <main className="container">
      <h1>혼수 목록</h1>
      {summary && (
        <div className="summary" role="status">
          확정 합계 <strong>{won(summary.confirmed_total)}</strong> · 미확정 {summary.unconfirmed_count}건
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <form onSubmit={addItem} className="add-row">
        <input
          aria-label="새 항목 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 냉장고"
        />
        <button type="submit">＋ 항목 추가</button>
      </form>
      <ul className="item-list">
        {items.map((it) => (
          <li key={it.id}>
            <Link to={`/items/${it.id}`}>
              <span className="item-name">{it.name}</span>
              {it.confirmed_candidate_id ? (
                <span className="badge confirmed">✅ {won(it.confirmed_price)}</span>
              ) : (
                <span className="badge">⚪ 비교중</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner/web && npx vitest run src/pages/HomePage.test.jsx`
Expected: PASS (2 passed).

- [ ] **Step 5: 커밋**

```bash
git add honsu-planner/web/src/pages/HomePage.jsx honsu-planner/web/src/pages/HomePage.test.jsx
git commit -m "feat: home page (summary, item list, add item)"
```

---

## Task 8: 항목 상세 화면 (후보 목록 · 추가 · 확정 · 삭제)

**Files:**
- Create: `web/src/pages/ItemDetailPage.jsx`, `web/src/pages/ItemDetailPage.test.jsx`

**Interfaces:**
- Consumes: `api.getItem`, `api.addCandidate`, `api.confirm`, `api.unconfirm`, `api.deleteCandidate`, `won`, react-router `useParams`, `Link`.
- Produces: `<ItemDetailPage />`. (App.jsx의 라우트가 이제 완전히 동작.)

- [ ] **Step 1: 실패하는 테스트 작성**

`web/src/pages/ItemDetailPage.test.jsx`:
```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { ItemDetailPage } from './ItemDetailPage.jsx';
import { api } from '../api.js';

vi.mock('../api.js', () => ({
  api: {
    getItem: vi.fn(), addCandidate: vi.fn(), confirm: vi.fn(),
    unconfirm: vi.fn(), deleteCandidate: vi.fn(),
  },
}));

function renderAt(id) {
  return render(
    <MemoryRouter initialEntries={[`/items/${id}`]}>
      <Routes><Route path="/items/:id" element={<ItemDetailPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => { vi.clearAllMocks(); });

test('shows candidates and confirm action', async () => {
  api.getItem.mockResolvedValue({
    id: 1, name: '냉장고', confirmed_candidate_id: null,
    candidates: [{ id: 5, name: 'LG', price: 1200000, url: null, memo: null,
      width_cm: 91, depth_cm: 70, height_cm: 179 }],
  });
  renderAt(1);
  expect(await screen.findByText('LG')).toBeInTheDocument();
  expect(screen.getByText('1,200,000원')).toBeInTheDocument();
  expect(screen.getByText('이걸로 확정')).toBeInTheDocument();
});

test('confirm calls api and reloads', async () => {
  api.getItem.mockResolvedValue({
    id: 1, name: '냉장고', confirmed_candidate_id: null,
    candidates: [{ id: 5, name: 'LG', price: 1200000, url: null, memo: null,
      width_cm: null, depth_cm: null, height_cm: null }],
  });
  api.confirm.mockResolvedValue({});
  renderAt(1);
  await screen.findByText('LG');
  await userEvent.click(screen.getByText('이걸로 확정'));
  await waitFor(() => expect(api.confirm).toHaveBeenCalledWith(1, 5));
});

test('adds a candidate', async () => {
  api.getItem.mockResolvedValue({ id: 1, name: '냉장고', confirmed_candidate_id: null, candidates: [] });
  api.addCandidate.mockResolvedValue({});
  renderAt(1);
  await screen.findByText('후보 추가');
  await userEvent.type(screen.getByLabelText('후보 이름'), '삼성');
  await userEvent.type(screen.getByLabelText('가격'), '1000000');
  await userEvent.click(screen.getByText('추가'));
  await waitFor(() =>
    expect(api.addCandidate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: '삼성', price: '1000000' })
    )
  );
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd honsu-planner/web && npx vitest run src/pages/ItemDetailPage.test.jsx`
Expected: FAIL (ItemDetailPage 모듈 없음).

- [ ] **Step 3: 구현**

`web/src/pages/ItemDetailPage.jsx`:
```jsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { won } from '../format.js';

const EMPTY = { name: '', price: '', url: '', memo: '', width_cm: '', depth_cm: '', height_cm: '' };

export function ItemDetailPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);

  async function load() {
    try { setItem(await api.getItem(itemId)); } catch (e) { setError(e.message); }
  }

  useEffect(() => { load(); }, [itemId]);

  async function addCandidate(e) {
    e.preventDefault();
    try { await api.addCandidate(itemId, form); setForm(EMPTY); await load(); }
    catch (e) { setError(e.message); }
  }
  async function confirm(cid) {
    try { await api.confirm(itemId, cid); await load(); } catch (e) { setError(e.message); }
  }
  async function unconfirm() {
    try { await api.unconfirm(itemId); await load(); } catch (e) { setError(e.message); }
  }
  async function removeCandidate(cid) {
    try { await api.deleteCandidate(cid); await load(); } catch (e) { setError(e.message); }
  }

  if (!item) {
    return (
      <main className="container">
        <Link to="/">← 목록</Link>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="container">
      <Link to="/">← 목록</Link>
      <h1>{item.name}</h1>
      {error && <p className="error">{error}</p>}
      <ul className="candidate-list">
        {item.candidates.map((c) => {
          const isConfirmed = c.id === item.confirmed_candidate_id;
          return (
            <li key={c.id} className={isConfirmed ? 'confirmed' : ''}>
              <div className="cand-head">
                <span className="cand-name">{isConfirmed && '⭐ '}{c.name}</span>
                <span className="cand-price">{won(c.price)}</span>
              </div>
              {c.url && <a href={c.url} target="_blank" rel="noreferrer">링크</a>}
              {c.memo && <p className="memo">{c.memo}</p>}
              {(c.width_cm || c.depth_cm || c.height_cm) && (
                <p className="dims">
                  {c.width_cm ?? '—'} × {c.depth_cm ?? '—'} × {c.height_cm ?? '—'} cm
                </p>
              )}
              <div className="cand-actions">
                {isConfirmed ? (
                  <button onClick={unconfirm}>확정 해제</button>
                ) : (
                  <button onClick={() => confirm(c.id)}>이걸로 확정</button>
                )}
                <button onClick={() => removeCandidate(c.id)} className="danger">삭제</button>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={addCandidate} className="cand-form">
        <h2>후보 추가</h2>
        <input aria-label="후보 이름" placeholder="이름" value={form.name} onChange={set('name')} />
        <input aria-label="가격" placeholder="가격(원)" value={form.price} onChange={set('price')} />
        <input aria-label="URL" placeholder="URL" value={form.url} onChange={set('url')} />
        <input aria-label="메모" placeholder="메모" value={form.memo} onChange={set('memo')} />
        <input aria-label="가로" placeholder="가로(cm)" value={form.width_cm} onChange={set('width_cm')} />
        <input aria-label="세로" placeholder="세로(cm)" value={form.depth_cm} onChange={set('depth_cm')} />
        <input aria-label="높이" placeholder="높이(cm)" value={form.height_cm} onChange={set('height_cm')} />
        <button type="submit">추가</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd honsu-planner/web && npm test`
Expected: PASS (api, HomePage, ItemDetailPage 전부 통과).

- [ ] **Step 5: 전체 빌드 검증 후 커밋**

Run: `cd honsu-planner/web && npm run build`
Expected: `web/dist/` 생성, 빌드 오류 없음.

```bash
git add honsu-planner/web/src/pages/ItemDetailPage.jsx honsu-planner/web/src/pages/ItemDetailPage.test.jsx
git commit -m "feat: item detail page (candidates, add, confirm, delete)"
```

---

## Self-Review

**1. Spec coverage**
- 항목 CRUD → Task 2 ✅
- 후보 CRUD(이름·가격·URL·메모·치수) → Task 3 ✅
- 확정/확정 해제 → Task 4 ✅
- 총액(확정 합계 + 미확정 건수, 가격 미입력=0) → Task 5 ✅
- 홈(요약 바·목록·상태·추가) → Task 7 ✅
- 항목 상세(후보 나열·URL 링크·확정·추가·삭제) → Task 8 ✅
- 기술 구조(Node+Express+pg, React+Vite, 단일 프로세스 서빙) → Task 1·6 ✅
- 에러 처리(400/404/500, `{error}`) → 전 Task 라우트 + Task 1 핸들러 ✅
- 테스트 전략(API 통합·총액 단위·핵심 프론트 상호작용) → 각 Task ✅
- Phase 2(rooms/placements/배치)는 의도적으로 이 plan 범위 밖 — 별도 plan 예정 ✅

**2. Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, "TBD/TODO/적절히 처리" 없음. ✅

**3. Type consistency:**
- `normalizeCandidateRow`는 items.js에서 export, candidates.js에서 import — 이름 일치 ✅
- 라우터 팩토리명 `itemsRouter`/`candidatesRouter`/`summaryRouter`가 app.js 마운트와 일치 ✅
- `api` 메서드명이 프론트 페이지 호출과 일치(`addCandidate`, `confirm(itemId, candidateId)` 등) ✅
- 확정 필드명 `confirmed_candidate_id`/`confirmed_price`가 백엔드 응답·프론트 렌더 일치 ✅

---

## 실행 후 최종 통합 점검 (수동)

전체 Task 완료 후 로컬 PostgreSQL로 1회 확인:
1. `.env` 작성 → `npm run migrate`
2. `cd web && npm run build && cd ..`
3. `npm start` → 브라우저에서 항목 추가 → 후보 추가 → 확정 → 홈 요약 금액 반영 확인.
