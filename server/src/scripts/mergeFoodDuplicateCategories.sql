-- Fold the duplicate `Food > Recipe`, `Food > Recipes` and `Food > Cooking` categories into `Food` (TASKS.md,
-- stray categories). Their items keep every other category and get the `Food` root if they lack it; then the
-- three empty categories are deleted. Only item_categories and categories change (no titles, tags, reviewed flag
-- or updated_at). Nothing in the code creates these categories. This file holds ids only.
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/mergeFoodDuplicateCategories.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/mergeFoodDuplicateCategories.sql
BEGIN;

CREATE TEMP TABLE dups(id uuid) ON COMMIT DROP;
INSERT INTO dups VALUES
  ('5fd60dca-6356-46e5-a006-94d3aa631460'),  -- Food > Recipes
  ('356527f4-049f-40c9-9287-473eed5fba39'),  -- Food > Cooking
  ('c92011a0-cce7-4c05-8651-e6c33fa28388');  -- Food > Recipe

-- Abort if any of them is not a leaf under the `Food` root, so a changed tree is never touched.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM dups d
  WHERE NOT EXISTS (SELECT 1 FROM categories c JOIN categories p ON p.id = c.parent_id
                    WHERE c.id = d.id AND p.name = 'Food' AND p.parent_id IS NULL AND c.name IN ('Recipe','Recipes','Cooking'))
     OR EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = d.id);
  IF bad > 0 THEN RAISE EXCEPTION 'unexpected category tree (% of 3 changed)', bad; END IF;
END $$;

CREATE TEMP TABLE affected ON COMMIT DROP AS
SELECT DISTINCT ic.item_id FROM item_categories ic WHERE ic.category_id IN (SELECT id FROM dups);

SELECT (SELECT count(*) FROM affected) AS items_affected;

DELETE FROM item_categories WHERE category_id IN (SELECT id FROM dups);

INSERT INTO item_categories (item_id, category_id, depth)
SELECT a.item_id, f.id, 0 FROM affected a
CROSS JOIN (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL) f
ON CONFLICT DO NOTHING;

DELETE FROM categories WHERE id IN (SELECT id FROM dups);

-- After: every affected item sits in Food; the three categories are gone.
SELECT (SELECT count(*) FROM affected a WHERE EXISTS (
          SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
          WHERE ic.item_id = a.item_id AND c.name = 'Food' AND c.parent_id IS NULL)) AS in_food,
       (SELECT count(*) FROM categories WHERE id IN (SELECT id FROM dups)) AS dups_left;

\if :{?commit}
  \echo 'COMMIT requested: keeping changes.'
  COMMIT;
\else
  \echo 'Preview only: rolling back. Re-run with -v commit=1 to keep the changes.'
  ROLLBACK;
\endif
