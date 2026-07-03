export function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function validateItemName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Name is required';
  if (name.trim().length > 100) return 'Name is too long';
  return null;
}

export const ITEM_CATEGORIES = ['appliance', 'furniture'];

// Returns the normalized category (string | null) or an Error message string.
// Accepts undefined/null/'' as null (uncategorized); otherwise must be a known category.
export function normalizeCategory(value) {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || !ITEM_CATEGORIES.includes(value)) {
    return { error: `category must be one of ${ITEM_CATEGORIES.join(', ')}` };
  }
  return { value };
}

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

  for (const key of ['brand', 'url', 'memo']) {
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

  if (body.ceiling_height_cm !== undefined) {
    if (body.ceiling_height_cm === null || body.ceiling_height_cm === '') {
      out.ceiling_height_cm = null;
    } else {
      const n = Number(body.ceiling_height_cm);
      if (!(n > 0)) errors.push('ceiling_height_cm must be a positive number');
      else out.ceiling_height_cm = n;
    }
  }

  if (body.sort_order !== undefined) {
    const n = Number(body.sort_order);
    if (Number.isFinite(n)) out.sort_order = n;
    else errors.push('sort_order must be a number');
  }

  return { errors, value: out };
}

const HOME_SETTING_FIELDS = [
  'door_width_cm',
  'door_height_cm',
  'room_door_width_cm',
  'room_door_height_cm',
  'elevator_door_width_cm',
  'elevator_door_height_cm',
  'elevator_car_width_cm',
  'elevator_car_depth_cm',
  'elevator_car_height_cm',
];

export function normalizeHomeSettings(body) {
  const out = {};
  const errors = [];
  for (const key of HOME_SETTING_FIELDS) {
    if (body[key] !== undefined) {
      if (body[key] === null || body[key] === '') {
        out[key] = null;
      } else {
        const n = Number(body[key]);
        if (!(n > 0)) errors.push(`${key} must be a positive number`);
        else out[key] = n;
      }
    }
  }
  return { errors, value: out };
}

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

export const FEATURE_KINDS = ['door', 'window', 'outlet'];
export const FEATURE_WALLS = ['N', 'E', 'S', 'W'];
export const DOOR_SWINGS = ['in-left', 'in-right', 'out-left', 'out-right'];

// Full validation of a room feature (door/window/outlet). room is { width_cm, depth_cm } for wall-length checks.
// Partial updates (PATCH) are handled by the route, which merges body onto the existing row before calling this.
// Dimension fields that don't apply to the given kind are cleared to null instead of erroring, for predictability.
export function normalizeRoomFeature(body, room) {
  const errors = [];
  const out = {};

  if (!FEATURE_KINDS.includes(body.kind)) errors.push(`kind는 ${FEATURE_KINDS.join(', ')} 중 하나여야 합니다`);
  else out.kind = body.kind;

  if (!FEATURE_WALLS.includes(body.wall)) errors.push('wall은 N, E, S, W 중 하나여야 합니다');
  else out.wall = body.wall;

  const rawOff = body.offset_cm;
  const off = rawOff === '' || rawOff === null || rawOff === undefined ? NaN : Number(rawOff);
  if (!(Number.isFinite(off) && off >= 0)) errors.push('offset_cm은 0 이상의 숫자여야 합니다');
  else out.offset_cm = off;

  for (const key of ['width_cm', 'height_cm', 'sill_height_cm', 'floor_height_cm']) {
    const v = body[key];
    if (v === undefined || v === null || v === '') { out[key] = null; continue; }
    const n = Number(v);
    if (!(n > 0)) errors.push(`${key}은 양수여야 합니다`);
    else out[key] = n;
  }

  if (body.swing === undefined || body.swing === null || body.swing === '') out.swing = null;
  else if (!DOOR_SWINGS.includes(body.swing)) errors.push(`swing은 ${DOOR_SWINGS.join(', ')} 중 하나여야 합니다`);
  else out.swing = body.swing;

  if (out.kind === 'door' || out.kind === 'window') {
    if (out.width_cm === null) errors.push('문/창문은 폭(width_cm)이 필요합니다');
  }
  if (out.kind === 'door') { out.sill_height_cm = null; out.floor_height_cm = null; }
  if (out.kind === 'window') { out.swing = null; out.floor_height_cm = null; }
  if (out.kind === 'outlet') { out.width_cm = null; out.height_cm = null; out.sill_height_cm = null; out.swing = null; }

  if (errors.length === 0 && room) {
    const wallLen = out.wall === 'N' || out.wall === 'S' ? Number(room.width_cm) : Number(room.depth_cm);
    if (out.offset_cm + (out.width_cm ?? 0) > wallLen) {
      errors.push(`벽 길이(${wallLen}cm)를 벗어납니다`);
    }
  }

  return { errors, value: out };
}
