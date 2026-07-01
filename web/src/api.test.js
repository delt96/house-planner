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
