-- Second pass of the bare-`Links` cleanup (TASKS.md, stray categories): file items whose title is only a source
-- placeholder ("YouTube Video", "YouTube Short", "Instagram Reel", an Instagram post or profile) into the existing
-- `Links > YouTube` / `Links > Instagram` leaves. Nothing topical is moved here: the rest of the bare-`Links`
-- items need a topic decision. This file holds item ids only, no titles.
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyBareLinksMoves2.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyBareLinksMoves2.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: one root-first path per item, depth 0..n. Only item_categories
-- changes (tags, reviewed flag and updated_at are untouched). Idempotent: an item is touched only while its ONLY
-- category link is the bare `Links` root, so anything filed since then is left alone. Needs no Ollama.
BEGIN;

CREATE TEMP TABLE moves(item_id uuid, to_path text) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('49ffe882-0306-482d-a6cc-69d643d855a9', 'Links > Instagram'),
  ('65c48672-1e4b-4879-aee8-3247fa46aec0', 'Links > Instagram'),
  ('81268cda-93ea-4672-adeb-e55a74b3983a', 'Links > Instagram'),
  ('97f739d7-ad3e-466e-890e-3db184f94a11', 'Links > Instagram'),
  ('982e2ef8-a78c-4ab4-b731-732fdf2b39ff', 'Links > Instagram'),
  ('b80180da-dff5-4df8-a5ac-45dc85163f9e', 'Links > Instagram'),
  ('07af7d9f-30e6-40d0-803e-781edb76db39', 'Links > YouTube'),
  ('0e199be4-c100-46b5-9d3d-c362e0a6c2d4', 'Links > YouTube'),
  ('251453aa-7ffd-49a7-9996-993f2d6dc8e7', 'Links > YouTube'),
  ('637ef01b-288c-4801-8b7f-627ac0d33b77', 'Links > YouTube'),
  ('6c1a2d77-b2e0-4431-885b-72bbf0b21f11', 'Links > YouTube'),
  ('803caa72-d59a-47c3-a40b-5941dadb28cd', 'Links > YouTube'),
  ('809ac4fa-a661-4043-a1f8-a3047a23535b', 'Links > YouTube'),
  ('981eb1a1-138f-4ada-be2a-31fca99ec360', 'Links > YouTube'),
  ('9fb9820c-5a52-4c03-9b79-7a39d05f508b', 'Links > YouTube'),
  ('aaa27d9e-ade7-4f47-ace8-cadf2b13ec43', 'Links > YouTube'),
  ('ab7103e1-054c-4cbf-ba82-121698cfced6', 'Links > YouTube'),
  ('b00154c4-933e-48a9-b692-0083ee1a113c', 'Links > YouTube'),
  ('c0d48374-991e-47ae-94d1-547416f026f4', 'Links > YouTube'),
  ('eb827bf3-725b-4370-966c-85980bb3633d', 'Links > YouTube'),
  ('ec5cf244-121d-4eb9-b189-c9e467f16882', 'Links > YouTube'),
  ('f8a8646e-083d-45ad-b00b-5a60403136e7', 'Links > YouTube'),
  ('fd90ba5c-cc08-4a9a-84de-f6c06c0d9c6a', 'Links > YouTube');

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
