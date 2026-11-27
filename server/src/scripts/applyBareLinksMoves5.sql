-- Fifth pass of the bare-`Links` cleanup, plus the classifier leftovers (TASKS.md decisions 1 and 2).
-- Part 1: 17 of the last 19 bare-`Links` items that the saved link made clear (food links, Facebook and Instagram
-- profiles, shops, property listings, an article, a course ad, a government login page). Two stay: a bare map link
-- and a restaurant order page. Part 2: seven items that already had a category but the wrong one (bread and cookie
-- videos filed under Movies/Food, a language course under Movies, a tech course under Links > YouTube).
-- This file holds item ids only, no titles. It creates the target categories that do not exist yet (Links > Facebook).
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyBareLinksMoves5.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyBareLinksMoves5.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: one root-first path per item, depth 0..n. Only item_categories
-- changes (tags, reviewed flag, type and updated_at are untouched). Idempotent: a bare-Links row is touched only while
-- its ONLY category link is the `Links` root; any row is skipped once its leaf already equals the target.
-- Needs no Ollama.

BEGIN;

CREATE TEMP TABLE moves(item_id uuid, to_path text, bare_links_only boolean) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('74069fa0-6e52-4dc9-8402-bc863fd3c6ff', 'Food', true),
  ('85ec55a9-8f0e-469d-9340-77d519fa0555', 'Links > Facebook', true),
  ('244beb12-84af-4a09-a12d-dffe07dcfff2', 'Links > Facebook', true),
  ('ca6ab67e-69a1-4d3e-9426-841f6d51f0bf', 'Links > Facebook', true),
  ('2d5ea778-7b09-4f5b-bdc2-d9810a1d2314', 'Links > Facebook', true),
  ('a05939e0-27d5-49cf-8674-0dc7cbb2c8af', 'Links > Instagram', true),
  ('e8b6dfd5-ebda-40cb-92e6-1cf545e206e9', 'Links > Instagram', true),
  ('8a9f1ef1-f309-47ba-a8cc-b7a01b1c1652', 'Links > Instagram', true),
  ('dc24b3a8-f388-479d-b87f-1ede76b4f432', 'Shopping', true),
  ('b00a0c07-27ac-4d85-900a-5c5d6bfa1ca6', 'Shopping', true),
  ('c66a8478-e4ce-46bf-8046-d46f16010ba4', 'Tech', true),
  ('ef62bc62-f85d-4bfa-b524-4c8fab8aa520', 'Real Estate', true),
  ('32dcdab2-720e-4b46-a03b-23db7fa24609', 'Real Estate', true),
  ('372a88de-b50c-4e97-8c40-4993e2415a75', 'Real Estate', true),
  ('53292a02-fde2-4ccb-a4ce-c3e942b0389e', 'Links > Articles', true),
  ('28856933-2281-4521-b875-f7f7a8f7f207', 'Personal', true),
  ('f48eb15d-02f1-4d47-a79a-efb22ac53e0f', 'Courses', true),
  ('330aabf5-5c64-4777-97ee-59c3d57843bb', 'Food > Bakery > Bread', false),
  ('d5d24c84-ad66-4541-ac16-0278019e12a9', 'Food > Bakery > Bread', false),
  ('d8cc5fa3-c6cd-476b-b6f0-b5cd79f04765', 'Food > Bakery > Bread', false),
  ('340ff94e-5cee-4ceb-bc11-f117be3299a3', 'Food > Bakery > Cookies', false),
  ('aef1f920-c430-4666-a5e1-6bec50b990a6', 'Food > Bakery > Cookies', false),
  ('c54cc670-16d5-4fc0-a717-e60de089cf8c', 'Courses', false),
  ('dcd7602c-9755-4293-9d6b-b2e329475336', 'Tech', false);

-- Create any missing category along each target path (same walk as resolveCategoryPath).
DO $$
DECLARE r record; part text; parent uuid; cur uuid;
BEGIN
  FOR r IN SELECT DISTINCT to_path FROM moves LOOP
    parent := NULL;
    FOREACH part IN ARRAY string_to_array(r.to_path, ' > ') LOOP
      SELECT id INTO cur FROM categories WHERE name = part AND parent_id IS NOT DISTINCT FROM parent;
      IF cur IS NULL THEN
        INSERT INTO categories (name, parent_id) VALUES (part, parent) RETURNING id INTO cur;
        RAISE NOTICE 'created category: % (under %)', part, r.to_path;
      END IF;
      parent := cur;
    END LOOP;
  END LOOP;
END $$;

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

-- Items to move: not in the trash, not already filed at the target, and (for the bare-Links rows) still carrying
-- exactly one link, the Links root.
CREATE TEMP TABLE todo ON COMMIT DROP AS
SELECT m.item_id, m.to_path FROM moves m
JOIN items i ON i.id = m.item_id AND i.deleted_at IS NULL
WHERE (NOT m.bare_links_only OR (
        (SELECT count(*) FROM item_categories ic WHERE ic.item_id = m.item_id) = 1
        AND EXISTS (SELECT 1 FROM item_categories ic JOIN tree t ON t.id = ic.category_id
                    WHERE ic.item_id = m.item_id AND t.path = 'Links')))
  AND COALESCE((SELECT t.path FROM item_categories ic JOIN tree t ON t.id = ic.category_id
                WHERE ic.item_id = m.item_id ORDER BY ic.depth DESC LIMIT 1), '') <> m.to_path;

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
