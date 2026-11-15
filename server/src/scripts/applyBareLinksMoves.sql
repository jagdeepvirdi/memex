-- Move the SAFE subset of bare-`Links` items into a specific topic leaf (TASKS.md, Phase 1 cleanup, option 1).
-- Targets come from the Gemini classifier baseline (2026-11-15). Only buckets whose titles were checked by hand
-- are included: hotels, restaurants, cameras, laptops, phones, cookies, stocks (21 items). The other ~175
-- bare-`Links` items are deliberately NOT here: the classifier misfiles them (see TASKS.md).
-- This file holds item ids only, no titles.
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyBareLinksMoves.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyBareLinksMoves.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: one root-first path per item, depth 0..n. Only item_categories
-- changes (tags, reviewed flag and updated_at are untouched). Idempotent: an item is touched only while its ONLY
-- category link is the bare `Links` root, so anything filed since then is left alone. Needs no Ollama.
BEGIN;

CREATE TEMP TABLE moves(item_id uuid, to_path text) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('4f0d8d6a-2f8e-4a16-aedd-bc6991e32bf0', 'Finance > Stocks'),
  ('8a0f2630-eec7-4a8e-b48e-c9b9c2fdb977', 'Finance > Stocks'),
  ('1dbff236-46d0-482a-a97d-bf7e59194d6e', 'Finance > Stocks'),
  ('c23428e6-40b4-48c1-97e2-cfa03b7c23fa', 'Finance > Stocks'),
  ('76ee5202-62bf-442f-a3e6-5495dfb4165d', 'Finance > Stocks'),
  ('2ccb2ddd-ca3f-47a3-9090-aa7b7278374d', 'Finance > Stocks'),
  ('2b3679fe-199b-4f7b-a084-018a1dcc831d', 'Food > Bakery > Cookies'),
  ('0b4b6134-0c2b-4b91-bcfb-96349d440916', 'Food > Bakery > Cookies'),
  ('86e754c5-6da0-41fc-9c33-3d828377ac0d', 'Tech > Cameras'),
  ('6cb0f579-ae0a-447a-8964-a5e33ccae6bd', 'Tech > Cameras'),
  ('d43e06f0-4516-4fdc-ae2f-ccd03b762149', 'Tech > Cameras'),
  ('cb644b0d-06b1-4a0a-b976-e2b5b7043626', 'Tech > Cameras'),
  ('3afc95d3-ed6a-4dd0-a0e7-a8f544d9ee86', 'Tech > Laptops'),
  ('f1932de3-cc61-4c0f-bd3f-faf2e9c0166a', 'Tech > Phones'),
  ('dadd729b-45c3-42d7-b3e4-807ce44300e3', 'Travel > Hotels'),
  ('2a68516f-a726-46ce-9c9b-d8122f6cded1', 'Travel > Hotels'),
  ('73836316-0be3-4682-b9b6-1433b88f17c1', 'Travel > Hotels'),
  ('a458335a-6189-4081-a360-f82b4216ca58', 'Travel > Hotels'),
  ('5335ff59-75f9-4249-a2a2-75fc8991aa6a', 'Travel > Hotels'),
  ('163af0db-33f8-4fbc-b477-6c4ae3f0f5c2', 'Travel > Restaurants'),
  ('7636c51e-00ef-4ff5-b458-01bdb4d28319', 'Travel > Restaurants');

CREATE TEMP TABLE tree ON COMMIT DROP AS
WITH RECURSIVE t AS (
  SELECT id, name::text AS path, 0 AS depth FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.path || ' > ' || c.name, t.depth + 1 FROM categories c JOIN t ON c.parent_id = t.id
)
SELECT * FROM t;

-- Abort (nothing changed yet) if a target category does not exist.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT m.to_path, ', ') INTO missing
  FROM moves m WHERE NOT EXISTS (SELECT 1 FROM tree WHERE path = m.to_path);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'target category missing: %', missing;
  END IF;
END $$;

-- Only items that are still bare Links (exactly one link: the Links root) and not in the trash.
CREATE TEMP TABLE todo ON COMMIT DROP AS
SELECT m.* FROM moves m
JOIN items i ON i.id = m.item_id AND i.deleted_at IS NULL
WHERE (SELECT count(*) FROM item_categories ic WHERE ic.item_id = m.item_id) = 1
  AND EXISTS (SELECT 1 FROM item_categories ic JOIN tree t ON t.id = ic.category_id
              WHERE ic.item_id = m.item_id AND t.path = 'Links');

SELECT (SELECT count(*) FROM moves) AS listed, (SELECT count(*) FROM todo) AS will_move;

-- Before: what will move, and where to.
SELECT td.to_path AS target, i.reviewed, i.title
FROM todo td JOIN items i ON i.id = td.item_id
ORDER BY td.to_path, i.title;

DELETE FROM item_categories WHERE item_id IN (SELECT item_id FROM todo);

INSERT INTO item_categories (item_id, category_id, depth)
SELECT td.item_id, t.id, t.depth
FROM todo td JOIN tree t ON t.path = td.to_path OR td.to_path LIKE t.path || ' > %';

-- After: each moved item's leaf path matches its target (filed_correctly should equal items).
SELECT td.to_path AS target, count(*) AS items,
       count(*) FILTER (WHERE (SELECT t.path FROM item_categories ic JOIN tree t ON t.id = ic.category_id
                               WHERE ic.item_id = td.item_id ORDER BY ic.depth DESC LIMIT 1) = td.to_path) AS filed_correctly
FROM todo td GROUP BY td.to_path ORDER BY td.to_path;

\if :{?commit}
  \echo 'COMMIT requested: keeping changes.'
  COMMIT;
\else
  \echo 'Preview only: rolling back. Re-run with -v commit=1 to keep the changes.'
  ROLLBACK;
\endif
