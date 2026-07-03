-- 실내에서 가장 좁은 문(대표값). 반입 판정의 '방문' 체크에 사용. Nullable.
-- 반입 경로(어느 방까지 가는지) 모델링은 하지 않고 최소 문 하나로 근사한다.
ALTER TABLE home_settings ADD COLUMN room_door_width_cm numeric;
ALTER TABLE home_settings ADD COLUMN room_door_height_cm numeric;
