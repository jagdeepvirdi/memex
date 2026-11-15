-- APPLY: fix the six items in the small stray categories (matches dryRunStrayCategoryMoves.sql).
-- SAFE BY DEFAULT: ends in ROLLBACK, so a plain run only previews the result.
-- To keep the changes, pass a psql variable:   -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex < server/src/scripts/applyStrayCategoryMoves.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v commit=1 < server/src/scripts/applyStrayCategoryMoves.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: an item's categories are one root-first path, one
-- item_categories row per level with depth 0..n. Each item is rewritten to exactly its target path.
-- Idempotent: an item is only touched while it still links to its stray category, so a second run does nothing.
-- Only item_categories changes. Items, tags, reviewed flags and updated_at are left alone.
-- Needs no Ollama.
BEGIN;

CREATE TEMP TABLE moves(item_id uuid, from_path text, to_path text) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('967c5edf-a1f7-4bd5-934d-b0956c6df6c0', 'Tech > Link',               'Tech'),
  ('4bef6544-910e-4efa-9cf2-5e1ae4c24a98', 'Tech > Link',               'Personal > Courses'),
  ('f398a783-c14f-40d9-99e2-a5302add78c3', 'Tech > Link',               'Personal > Courses'),
  ('da9931cb-9f14-47ec-a5ad-13b6935313dc', 'Travel > Links',            'Travel'),
  ('d389513b-a04f-4f32-b007-72bb8579e3c4', 'Travel > Links',            'Travel > Hotels'),
  ('288541e8-78c6-4136-a72a-1eb4acf16093', 'Personal > Courses > Tech', 'Personal > Courses');

-- Category tree with root-first depth, kept for the steps below.
CREATE TEMP TABLE tree ON COMMIT DROP AS
WITH RECURSIVE t AS (
  SELECT id, name::text AS path, 0 AS depth FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.path || ' > ' || c.name, t.depth + 1 FROM categories c JOIN t ON c.parent_id = t.id
)
SELECT * FROM t;

-- Abort if any target category is missing (nothing has been changed yet).
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT m.to_path, ', ') INTO missing
  FROM moves m WHERE NOT EXISTS (SELECT 1 FROM tree WHERE path = m.to_path);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'target category missing: %', missing;
  END IF;
END $$;

-- Items that still link to their stray category (the only ones that will be rewritten).
CREATE TEMP TABLE todo ON COMMIT DROP AS
SELECT m.* FROM moves m
JOIN items i ON i.id = m.item_id AND i.deleted_at IS NULL
WHERE EXISTS (SELECT 1 FROM item_categories ic JOIN tree t ON t.id = ic.category_id
              WHERE ic.item_id = m.item_id AND t.path = m.from_path);

SELECT count(*) AS items_to_rewrite FROM todo;

DELETE FROM item_categories WHERE item_id IN (SELECT item_id FROM todo);

INSERT INTO item_categories (item_id, category_id, depth)
SELECT td.item_id, t.id, t.depth
FROM todo td
JOIN tree t ON t.path = td.to_path OR td.to_path LIKE t.path || ' > %';

-- Result: each rewritten item with its new path.
SELECT i.title,
       (SELECT string_agg(t.path, ' | ' ORDER BY ic.depth)
          FROM item_categories ic JOIN tree t ON t.id = ic.category_id
         WHERE ic.item_id = i.id) AS paths_after
FROM items i WHERE i.id IN (SELECT item_id FROM todo) ORDER BY i.title;

-- Strays left (expect 0 rows after an apply).
SELECT t.path, count(*) AS items
FROM item_categories ic JOIN tree t ON t.id = ic.category_id
WHERE t.path IN ('Tech > Link', 'Travel > Links', 'Personal > Courses > Tech')
GROUP BY t.path;

\if :{?commit}
  \echo 'COMMIT requested: keeping changes.'
  COMMIT;
\else
  \echo 'Preview only: rolling back. Re-run with -v commit=1 to keep the changes.'
  ROLLBACK;
\endif
