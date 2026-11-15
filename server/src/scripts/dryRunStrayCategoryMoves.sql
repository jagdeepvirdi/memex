-- DRY RUN: proposed fixes for the three small stray categories (TASKS.md, Phase 1 cleanup).
-- Changes nothing: READ ONLY transaction, rolled back. Prints what an apply step WOULD do.
-- Run:  docker exec -i memex-postgres-1 psql -U memex -d memex < server/src/scripts/dryRunStrayCategoryMoves.sql
--
-- Items are linked to every ancestor of their category (a `Tech > Link` item also has a `Tech` link), so
-- "moving" means: drop the link to the stray leaf, and add a link to the target (+ its ancestors) if the
-- item lacks it. A NULL target means "just drop the stray leaf; the parent link already keeps it filed".
-- All six items are already reviewed (the classifier will not touch them), so these are manual decisions.
-- The 218 bare-`Links` items are NOT covered here: they need a topic-by-topic mapping.
BEGIN READ ONLY;

WITH RECURSIVE tree AS (
  SELECT id, name::text AS path FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.path || ' > ' || c.name FROM categories c JOIN tree t ON c.parent_id = t.id
),
moves(item_id, from_path, to_path, why) AS (VALUES
  ('967c5edf-a1f7-4bd5-934d-b0956c6df6c0'::uuid, 'Tech > Link',                'Tech',              'a tech note: stays under Tech'),
  ('4bef6544-910e-4efa-9cf2-5e1ae4c24a98'::uuid, 'Tech > Link',                'Personal > Courses', 'a course'),
  ('f398a783-c14f-40d9-99e2-a5302add78c3'::uuid, 'Tech > Link',                'Personal > Courses', 'a course review'),
  ('da9931cb-9f14-47ec-a5ad-13b6935313dc'::uuid, 'Travel > Links',             'Travel',            'no better leaf, stays under Travel'),
  ('d389513b-a04f-4f32-b007-72bb8579e3c4'::uuid, 'Travel > Links',             'Travel > Hotels',   'a hotel'),
  ('288541e8-78c6-4136-a72a-1eb4acf16093'::uuid, 'Personal > Courses > Tech',  'Personal > Courses', 'keep under Courses, drop the odd nested Tech leaf')
)
SELECT i.title,
       i.reviewed,
       m.from_path                                   AS remove_link,
       m.to_path                                     AS ensure_link,
       CASE WHEN tt.id IS NULL THEN 'TARGET CATEGORY MISSING'
            WHEN EXISTS (SELECT 1 FROM item_categories x WHERE x.item_id = m.item_id AND x.category_id = tt.id)
              THEN 'already linked'
            ELSE 'would add' END                     AS target_status,
       (SELECT string_agg(t2.path, ' | ' ORDER BY t2.path)
          FROM item_categories ic2 JOIN tree t2 ON t2.id = ic2.category_id
         WHERE ic2.item_id = m.item_id)              AS paths_now,
       m.why
FROM moves m
JOIN items i       ON i.id = m.item_id AND i.deleted_at IS NULL
LEFT JOIN tree tt  ON tt.path = m.to_path
ORDER BY m.from_path, i.title;

-- Sanity: every move's source link must exist today (0 rows = nothing stale).
WITH RECURSIVE tree AS (
  SELECT id, name::text AS path FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, t.path || ' > ' || c.name FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT 'stray leaf still has items' AS note, t.path, COUNT(*) AS items
FROM tree t JOIN item_categories ic ON ic.category_id = t.id
WHERE t.path IN ('Tech > Link', 'Travel > Links', 'Personal > Courses > Tech')
GROUP BY t.path ORDER BY t.path;

ROLLBACK;
