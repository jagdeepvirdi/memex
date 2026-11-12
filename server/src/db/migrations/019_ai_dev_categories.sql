-- Seed Tech > AI > Repos / Prompts & Skills / Explainers / Tools.
-- Idempotent: safe on the live DB, where Tech > AI already exists with a few items.
-- Always scope the Tech root with parent_id IS NULL (a stray non-root "Tech" exists under Courses).

INSERT INTO categories (name, parent_id)
  SELECT 'AI', id FROM categories WHERE name = 'Tech' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT leaf.name, ai.id
  FROM (VALUES ('Repos'), ('Prompts & Skills'), ('Explainers'), ('Tools')) AS leaf(name)
  CROSS JOIN (
    SELECT c.id FROM categories c
    WHERE c.name = 'AI'
      AND c.parent_id = (SELECT id FROM categories WHERE name = 'Tech' AND parent_id IS NULL)
  ) AS ai
ON CONFLICT DO NOTHING;
