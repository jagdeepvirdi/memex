-- Third pass of the bare-`Links` cleanup (TASKS.md, stray categories): file programming, data and tool tutorials,
-- courses and how-to pages (picked by title by hand) under the top-level `Tech` category. Real estate, shops,
-- untitled and personal links are NOT here. This file holds item ids only, no titles.
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyBareLinksMoves3.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyBareLinksMoves3.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: one root-first path per item, depth 0..n. Only item_categories
-- changes (tags, reviewed flag and updated_at are untouched). Idempotent: an item is touched only while its ONLY
-- category link is the bare `Links` root, so anything filed since then is left alone. Needs no Ollama.
BEGIN;

CREATE TEMP TABLE moves(item_id uuid, to_path text) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('281b8f39-134d-4bbf-9de2-803155d12aa7', 'Tech'),
  ('87fa6a17-742e-4778-8f37-5ac22ff3a429', 'Tech'),
  ('f6939be0-f583-4d9b-b5a7-9650ccab371f', 'Tech'),
  ('3fbe958b-4834-4198-9817-8afe1a6eaae2', 'Tech'),
  ('4ed6ed6c-89f9-4a9b-bb3f-08b90687a9b3', 'Tech'),
  ('82f27b2e-b8b0-4690-bb3a-0a441aa85e89', 'Tech'),
  ('7177caae-bc8f-4049-963d-f3101aa27b26', 'Tech'),
  ('a4e1007d-eb64-4ee1-a32f-b39b786c0da9', 'Tech'),
  ('f5c50d26-9cfb-4c32-91d3-9737e79dbd9f', 'Tech'),
  ('59b1a7de-c8d7-4d1c-b52f-7c6aadfdf405', 'Tech'),
  ('22180655-ebe0-46fe-96a1-7934d2494227', 'Tech'),
  ('9b001d3a-9597-4991-b8cf-57a359398b15', 'Tech'),
  ('261be0d8-7839-45ae-96ae-edb1d2a77d2a', 'Tech'),
  ('f8e3b20f-8a95-4a69-b84b-523619a9367b', 'Tech'),
  ('68973d0b-de1a-45fb-8175-44700e85f60a', 'Tech'),
  ('73dfa987-174f-4ba0-8ff5-4fcc69071fee', 'Tech'),
  ('456190ab-d43d-4bdc-b9fe-bdf664a7a390', 'Tech'),
  ('fb25532a-b401-40ae-807f-d58d2b116020', 'Tech'),
  ('26e4a17c-5ffb-43dd-98b0-060301820517', 'Tech'),
  ('6d7cbbdd-f809-4690-8799-5733ea3a5acd', 'Tech'),
  ('86126a25-8797-4ff5-af44-f686811009ed', 'Tech'),
  ('0272c995-1d0c-41c5-a758-ec35032e2f5a', 'Tech'),
  ('4bb29f5a-aa2f-488f-bfaf-1a5a89c89589', 'Tech'),
  ('44fba2a2-27b8-45c2-925b-c4002894fae8', 'Tech'),
  ('5b318d55-4287-4371-bede-8ba5dbf23af2', 'Tech'),
  ('36251af0-b513-43b3-a7b9-8e9a66eae7e8', 'Tech'),
  ('5e898174-a700-48f3-96a2-23a76974db49', 'Tech'),
  ('c9d7b449-56f9-4d04-84b8-44fe74f0876e', 'Tech'),
  ('e1717c64-af36-47d6-9f56-da1dc168743e', 'Tech'),
  ('545ff24c-7d8e-49d2-a9c8-0468240bdf85', 'Tech'),
  ('22b66339-ad77-4234-8030-cb4ab1d1ee38', 'Tech'),
  ('7da51744-9cbc-4027-9a51-961d97852581', 'Tech'),
  ('61f9d176-9612-4973-8459-48efc14b4eef', 'Tech'),
  ('2831c535-20f3-4ebe-8869-9bbc4b48e33c', 'Tech'),
  ('14952147-90d4-4c4a-a8ac-23369596f655', 'Tech'),
  ('ce2eaf79-1192-49d9-83ab-4193821c8679', 'Tech'),
  ('f3c1ba4a-18da-459d-a1e3-c900ebb6a864', 'Tech'),
  ('a759a352-f895-4b84-836d-19eba8a9b1f0', 'Tech'),
  ('1f45f24e-67e7-47d2-9b42-5d6cf4aee437', 'Tech'),
  ('2d79fdea-25aa-4cdb-90fb-2eb2f2e7a316', 'Tech'),
  ('6d6331fc-f5ec-4680-9317-4e7c2250c273', 'Tech'),
  ('cd2e154d-4735-4f1b-a07c-aacfb9583043', 'Tech'),
  ('ce2c4b9b-7365-43f5-b669-47d0ab50f6a2', 'Tech'),
  ('a575324d-f8e8-4eef-8dc1-7b2493e510a6', 'Tech'),
  ('891d3616-4898-4a18-9b7d-548b951730eb', 'Tech'),
  ('56ef3c85-c9ec-4568-9088-c7b5b828f6ab', 'Tech');

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
