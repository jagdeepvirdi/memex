-- Migration 002 — seed category tree
-- Inserts the pre-seeded hierarchy from CLAUDE.md.
-- Uses subqueries to resolve parent IDs — fully idempotent (DO NOTHING on conflict).

-- ── Top-level categories ──────────────────────────────────────────────────────
INSERT INTO categories (name, parent_id) VALUES
  ('Food',     NULL),
  ('Media',    NULL),
  ('Tech',     NULL),
  ('Finance',  NULL),
  ('Personal', NULL),
  ('Links',    NULL),
  ('Travel',   NULL)
ON CONFLICT DO NOTHING;

-- ── Food → Bakery, Savory ─────────────────────────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Bakery', id FROM categories WHERE name = 'Food' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Savory', id FROM categories WHERE name = 'Food' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Food > Bakery → Cakes, Cookies, Bread ────────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Cakes', id FROM categories WHERE name = 'Bakery'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Cookies', id FROM categories WHERE name = 'Bakery'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Bread', id FROM categories WHERE name = 'Bakery'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

-- ── Food > Savory → Indian, Italian, Thai, Chinese ───────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Indian', id FROM categories WHERE name = 'Savory'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Italian', id FROM categories WHERE name = 'Savory'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Thai', id FROM categories WHERE name = 'Savory'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Chinese', id FROM categories WHERE name = 'Savory'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Food' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

-- ── Media → Movies, Books ─────────────────────────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Movies', id FROM categories WHERE name = 'Media' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Books', id FROM categories WHERE name = 'Media' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Media > Movies → Action, Drama, Horror, Comedy ───────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Action', id FROM categories WHERE name = 'Movies'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Drama', id FROM categories WHERE name = 'Movies'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Horror', id FROM categories WHERE name = 'Movies'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Comedy', id FROM categories WHERE name = 'Movies'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

-- ── Media > Books → Fiction, Non-Fiction, Technical ──────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Fiction', id FROM categories WHERE name = 'Books'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Non-Fiction', id FROM categories WHERE name = 'Books'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Technical', id FROM categories WHERE name = 'Books'
    AND parent_id = (SELECT id FROM categories WHERE name = 'Media' AND parent_id IS NULL)
ON CONFLICT DO NOTHING;

-- ── Tech → Laptops, Cameras, Phones, Specs ───────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Laptops', id FROM categories WHERE name = 'Tech' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Cameras', id FROM categories WHERE name = 'Tech' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Phones', id FROM categories WHERE name = 'Tech' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Specs', id FROM categories WHERE name = 'Tech' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Finance → Stocks, Crypto, Notes ──────────────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Stocks', id FROM categories WHERE name = 'Finance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Crypto', id FROM categories WHERE name = 'Finance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Notes', id FROM categories WHERE name = 'Finance' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Personal → Numbers, Contacts ─────────────────────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'Numbers', id FROM categories WHERE name = 'Personal' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Contacts', id FROM categories WHERE name = 'Personal' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Links → YouTube, Instagram, Articles, Docs ───────────────────────────────
INSERT INTO categories (name, parent_id)
  SELECT 'YouTube', id FROM categories WHERE name = 'Links' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Instagram', id FROM categories WHERE name = 'Links' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Articles', id FROM categories WHERE name = 'Links' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Docs', id FROM categories WHERE name = 'Links' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

-- ── Travel → Destinations, Hotels, Restaurants, Attractions ──────────────────
-- Travel is a first-class category from the Claude Design handoff (travel.jsx).
INSERT INTO categories (name, parent_id)
  SELECT 'Destinations', id FROM categories WHERE name = 'Travel' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Hotels', id FROM categories WHERE name = 'Travel' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Restaurants', id FROM categories WHERE name = 'Travel' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, parent_id)
  SELECT 'Attractions', id FROM categories WHERE name = 'Travel' AND parent_id IS NULL
ON CONFLICT DO NOTHING;
