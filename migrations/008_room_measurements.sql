-- Per-room measurements: ceiling height (can differ per room) + wall features (door/window/outlet).
-- Features use a wall-anchor scheme: which wall (N/E/S/W) + distance (cm) from that wall's start corner.
-- offset zero-point convention — N/S walls: west (left) corner, E/W walls: north (top) corner.
ALTER TABLE rooms ADD COLUMN ceiling_height_cm numeric;

CREATE TABLE room_features (
  id serial PRIMARY KEY,
  room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  kind text NOT NULL,
  wall text NOT NULL,
  offset_cm numeric NOT NULL,
  width_cm numeric,
  height_cm numeric,
  sill_height_cm numeric,
  floor_height_cm numeric,
  swing text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_features_room ON room_features(room_id);
