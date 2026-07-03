-- The narrowest interior door (representative value), used by the carry-in '방문' (room door) check. Nullable.
-- Does not model the carry-in path (which rooms it passes through); approximated by a single narrowest door.
ALTER TABLE home_settings ADD COLUMN room_door_width_cm numeric;
ALTER TABLE home_settings ADD COLUMN room_door_height_cm numeric;
