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
