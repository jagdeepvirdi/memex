-- Fourth pass of the bare-`Links` cleanup (TASKS.md, stray categories): the remaining bare-`Links` items that a title
-- made clear (AI/tech links, aquarium, talks and videos, travel, jobs, courses). Business/local-business links, the
-- untitled ones and a few unclear ones are NOT here. This file holds item ids only, no titles.
-- It creates the target categories that do not exist yet (Hobbies > Aquarium, Jobs), inside the same transaction.
--
-- SAFE BY DEFAULT: prints before/after and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyBareLinksMoves4.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyBareLinksMoves4.sql
--
-- Mirrors setItemCategories() in db/helpers.ts: one root-first path per item, depth 0..n. Only item_categories
-- changes (tags, reviewed flag and updated_at are untouched). Idempotent: an item is touched only while its ONLY
-- category link is the bare `Links` root. Needs no Ollama.
BEGIN;

CREATE TEMP TABLE moves(item_id uuid, to_path text) ON COMMIT DROP;
INSERT INTO moves VALUES
  ('c11db145-19b1-412f-bca4-27be1d282ff6', 'Tech'),
  ('f8e83511-7ace-40e8-93ec-017362f25f66', 'Tech > AI > Tools'),
  ('482928bb-2f5b-43d2-a53a-2fde8bda3723', 'Links > YouTube'),
  ('93a807ef-d1a4-420f-a789-4bff738f33f6', 'Tech'),
  ('ae200c19-aba5-44d2-a882-4502de13c8fc', 'Tech'),
  ('e2b519b2-a140-4a2d-a7c7-9cf62edf490c', 'Links > YouTube'),
  ('c74eae92-7547-4473-95f0-df8d790eb1df', 'Hobbies > Aquarium'),
  ('82794fea-1b62-4194-86f2-68564eafdc84', 'Hobbies > Aquarium'),
  ('c139a5f5-f573-4924-b89a-f04bb7315d1d', 'Tech'),
  ('f4650ab6-fbd3-4504-a841-73b5e477620d', 'Tech'),
  ('f9107975-9df7-42f3-a005-c8c779c4bcea', 'Tech > AI > Repos'),
  ('2d3cfa9a-be1f-4f2a-9256-29041714e34a', 'Links > YouTube'),
  ('6b0650a2-090e-4c6b-afd7-d19facf6594e', 'Jobs'),
  ('b6ce67b9-b30d-4635-939d-d9b4fe657840', 'Tech'),
  ('0cbb9697-63a2-4742-ab39-856bdf12a973', 'Courses'),
  ('3a8805a1-1854-4d88-a5ae-e84d1e4a7ed2', 'Tech'),
  ('fcd5103b-04ed-48d1-9463-1a3f85a07b0c', 'Links > YouTube'),
  ('602770f1-057d-49d9-a59e-f6adcff4d92e', 'Tech'),
  ('4e1ebe03-2e96-4f49-9081-7ae328ffbe09', 'Tech'),
  ('ea2f8509-c40b-4760-ac2e-29d2e25949c8', 'Tech'),
  ('00fd3177-1ee2-42ec-b16f-7b070aae46d4', 'Travel'),
  ('53c60955-21b3-44f2-8756-1c5a494bf8ff', 'Tech'),
  ('0deb8630-3a16-48c3-92d8-b2d7317c12ff', 'Links > Articles'),
  ('865290ec-43f5-4af2-a535-28ac92475450', 'Hobbies > Aquarium'),
  ('0ebe6a08-a7a5-4e64-91e3-8591ba04deb0', 'Links > YouTube'),
  ('f9dd660b-0d11-44c1-8aa0-5628ed1bc5e1', 'Hobbies > Aquarium'),
  ('af0d519e-5609-4807-91d4-1e8e6033e7a6', 'Links > YouTube'),
  ('2968a6b2-d773-433a-90ab-5aa99125a7b9', 'Media > Movies > Comedy'),
  ('ed70fe1e-edfb-4739-8eb9-c3335bfbe3d3', 'Tech > AI > Tools'),
  ('db88415e-ddb9-4e4c-926d-349da9f6f1dc', 'Tech'),
  ('f79be029-9128-4b78-a1f3-6e599f67fe91', 'Tech'),
  ('18db8ab1-b36d-4479-972c-8f768265fc39', 'Courses'),
  ('4258f2e7-14ca-425d-b64d-c9a9221799a2', 'Hobbies > Aquarium'),
  ('c7a8f42d-4500-4b55-9335-0e2571e366c8', 'Links > YouTube'),
  ('26c7bcb5-4800-4aad-b63d-be1550bb8416', 'Links > YouTube'),
  ('26675127-851d-4146-ae92-50544cfe0571', 'Media > Movies'),
  ('15797b21-722b-4ae0-92c7-76a0467edad4', 'Tech'),
  ('f13a5e7f-298d-4c25-b8ad-7e946ecde0b1', 'Tech > AI > Explainers'),
  ('630bd773-c7d6-45b4-b65a-7bb35a71aa6b', 'Links > YouTube'),
  ('bb31c8f3-c1c1-4c14-9f00-045916f2f02e', 'Jobs'),
  ('04adcab0-266f-4d81-89b4-aa5804524350', 'Travel'),
  ('82f9c786-37a5-4baa-92ec-bef8920eacb0', 'Links > YouTube'),
  ('95282f4d-de15-4f64-81d6-c633e2bfdfbe', 'Tech'),
  ('5276c4dc-bd93-44b2-861a-bae74d5c661f', 'Tech'),
  ('e2ad4fac-5c6f-4adf-b896-128495817730', 'Hobbies > Aquarium');

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
