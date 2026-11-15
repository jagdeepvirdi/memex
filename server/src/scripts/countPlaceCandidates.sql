-- Read-only in effect: only SELECTs on your tables, plus ON COMMIT DROP temp tables, and it ends in ROLLBACK.
-- (A literal READ ONLY transaction cannot create temp tables.)
-- How many notes could contain places worth adding to the Places table?
-- Prints counts only, never note text. Run:
--   docker exec -i memex-postgres-1 psql -U memex -d memex < server/src/scripts/countPlaceCandidates.sql
--
-- Hard exclusions (never sent anywhere): encrypted / password items, items under the Personal, Passwords, Finance
-- or Links trees, items tagged private / no-cloud / local-only, and anything whose text looks like account or
-- credential data (long digit runs, IBAN, PIN/OTP/CVV/password words). Items are linked to every ancestor
-- category, so "under a tree" = linked to that root category.
BEGIN;

CREATE TEMP TABLE cand ON COMMIT DROP AS
SELECT i.id, i.type, i.reviewed, i.source,
       lower(coalesce(i.title,'') || ' ' || coalesce(i.content,'')) AS txt,
       (SELECT c.name FROM item_categories ic JOIN categories c ON c.id = ic.category_id
         WHERE ic.item_id = i.id AND c.parent_id IS NULL LIMIT 1) AS root
FROM items i
WHERE i.deleted_at IS NULL
  AND i.type <> 'password' AND NOT coalesce(i.encrypted, false)
  AND NOT EXISTS (SELECT 1 FROM item_categories ic JOIN categories c ON c.id = ic.category_id
                   WHERE ic.item_id = i.id AND c.parent_id IS NULL
                     AND lower(c.name) IN ('personal','passwords','finance','links'))
  AND NOT EXISTS (SELECT 1 FROM item_tags it JOIN tags t ON t.id = it.tag_id
                   WHERE it.item_id = i.id AND lower(t.name) IN ('private','no-cloud','local-only'));

-- 1. Active items overall, then after the hard exclusions.
SELECT 'active items (all)' AS step, count(*) AS n FROM items WHERE deleted_at IS NULL
UNION ALL SELECT 'after category/tag/type exclusions', count(*) FROM cand
UNION ALL SELECT '  of which look like account/credential data (also excluded)',
       count(*) FROM cand WHERE txt ~ '[0-9][0-9 -]{8,}[0-9]' OR txt ~ '\m(iban|swift|ifsc|cvv|otp|pin|passcode|password|passwd|account no|acct)\M';

CREATE TEMP TABLE safe ON COMMIT DROP AS
SELECT * FROM cand
WHERE NOT (txt ~ '[0-9][0-9 -]{8,}[0-9]' OR txt ~ '\m(iban|swift|ifsc|cvv|otp|pin|passcode|password|passwd|account no|acct)\M');

-- 2. Safe candidates by item type (the user's "notes" are type note).
SELECT type, count(*) AS items, count(*) FILTER (WHERE reviewed) AS reviewed FROM safe GROUP BY type ORDER BY items DESC;

-- 3. Place-word shortlist among the safe candidates: strong signals vs broad ones.
WITH s AS (
  SELECT *,
    txt ~ '\m(hotel|resort|hostel|villa|restaurant|cafe|brewery|bistro|itinerary|airbnb|homestay|guesthouse)\M'
      OR txt ~ '(maps\.app\.goo\.gl|goo\.gl/maps|google\.[a-z.]+/maps|maps\.apple\.com)'  AS strong,
    txt ~ '\m(bar|pub|beach|island|temple|museum|park|waterfall|market|mall|trip|visit|trek|hike|stay|booking|street|road|soi|address|located|near)\M' AS broad
  FROM safe)
SELECT 'strong place signal' AS shortlist, count(*) AS n FROM s WHERE strong
UNION ALL SELECT 'broad-only place signal', count(*) FROM s WHERE broad AND NOT strong
UNION ALL SELECT 'no place signal (never sent)', count(*) FROM s WHERE NOT broad AND NOT strong;

-- 4. Where the shortlisted candidates sit today (root category) and what type they are.
WITH s AS (
  SELECT *, txt ~ '\m(hotel|resort|hostel|villa|restaurant|cafe|brewery|bistro|itinerary|airbnb|homestay|guesthouse)\M'
         OR txt ~ '(maps\.app\.goo\.gl|goo\.gl/maps|google\.[a-z.]+/maps|maps\.apple\.com)' AS strong,
         txt ~ '\m(bar|pub|beach|island|temple|museum|park|waterfall|market|mall|trip|visit|trek|hike|stay|booking|street|road|soi|address|located|near)\M' AS broad
  FROM safe)
SELECT coalesce(root, '(none)') AS root_category, type, count(*) AS items
FROM s WHERE strong OR broad GROUP BY root, type ORDER BY items DESC LIMIT 25;

-- 5. What the Places table already holds (so duplicates can be skipped).
SELECT 'existing place items' AS what, count(*) AS n FROM items WHERE deleted_at IS NULL AND type = 'place'
UNION ALL SELECT '  with a city', count(*) FROM items WHERE deleted_at IS NULL AND type = 'place' AND coalesce(structured->>'city','') <> ''
UNION ALL SELECT '  with an address', count(*) FROM items WHERE deleted_at IS NULL AND type = 'place' AND coalesce(structured->>'address','') <> '';

ROLLBACK;
