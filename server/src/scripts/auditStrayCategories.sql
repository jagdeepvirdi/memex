-- Read-only audit of stray categories (Phase 1 cleanup, TASKS.md).
-- Changes nothing: the whole script runs in a READ ONLY transaction.
-- Run:  psql "$DATABASE_URL" -f server/src/scripts/auditStrayCategories.sql
BEGIN READ ONLY;

-- Full path of every category, with how many items use it.
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, name::text AS path, 0 AS depth
  FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.path || ' > ' || c.name, t.depth + 1
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
-- 1. Every category path in the tree with its item count (spot strays at a glance).
SELECT t.path, COUNT(ic.item_id) AS items
FROM tree t LEFT JOIN item_categories ic ON ic.category_id = t.id
GROUP BY t.path
ORDER BY t.path;

-- 2. The known strays: how many items sit in each, and whether they are reviewed.
WITH RECURSIVE tree AS (
  SELECT id, name, parent_id, name::text AS path
  FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, c.parent_id, t.path || ' > ' || c.name
  FROM categories c JOIN tree t ON c.parent_id = t.id
)
SELECT t.path,
       COUNT(*)                                   AS items,
       COUNT(*) FILTER (WHERE i.reviewed)         AS reviewed,
       COUNT(*) FILTER (WHERE NOT i.reviewed)     AS unreviewed
FROM tree t
JOIN item_categories ic ON ic.category_id = t.id
JOIN items i            ON i.id = ic.item_id
WHERE t.path IN ('Tech > Link', 'Courses > Tech', 'Travel > Links', 'Links')
GROUP BY t.path
ORDER BY t.path;

-- 3. Sample of the bare-`Links` items (title, type, source URL) to decide where they belong.
SELECT i.id, i.title, i.type, i.source, i.source_url, i.reviewed
FROM items i
JOIN item_categories ic ON ic.item_id = i.id
JOIN categories c       ON c.id = ic.category_id AND c.name = 'Links' AND c.parent_id IS NULL
ORDER BY i.created_at DESC
LIMIT 50;

ROLLBACK;
