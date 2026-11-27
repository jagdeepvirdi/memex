-- YouTube videos that were typed `media` (so the Media page listed them as movies) become plain `link` items
-- (TASKS.md, decided 2026-11-27). Two items that look like real films are left as `media` (not listed here).
-- This file holds item ids only, no titles. Only items.type changes: structured data, categories, tags and the
-- reviewed flag are untouched (the structured watch status and rating stay stored, just not shown for a link).
-- Idempotent: only rows that are still `media` and not in the trash are touched.
--
-- SAFE BY DEFAULT: prints what will change and ends in ROLLBACK. To keep the changes pass  -v commit=1
--   preview: docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 < server/src/scripts/applyYoutubeMediaToLink.sql
--   apply:   docker exec -i memex-postgres-1 psql -U memex -d memex -v ON_ERROR_STOP=1 -v commit=1 < server/src/scripts/applyYoutubeMediaToLink.sql
-- To undo: restore the backup taken before applying (npm run restore -- <file> --yes), or set type back to 'media' for these ids.
-- Needs no Ollama.
BEGIN;

CREATE TEMP TABLE retype(item_id uuid) ON COMMIT DROP;
INSERT INTO retype VALUES
  ('015461cd-185d-4665-9946-8250a2d21499'),
  ('22180655-ebe0-46fe-96a1-7934d2494227'),
  ('281b8f39-134d-4bbf-9de2-803155d12aa7'),
  ('2b3679fe-199b-4f7b-a084-018a1dcc831d'),
  ('330aabf5-5c64-4777-97ee-59c3d57843bb'),
  ('340ff94e-5cee-4ceb-bc11-f117be3299a3'),
  ('48c1c611-22a3-4734-a64b-a332611a80d6'),
  ('5b318d55-4287-4371-bede-8ba5dbf23af2'),
  ('61f9d176-9612-4973-8459-48efc14b4eef'),
  ('6d6331fc-f5ec-4680-9317-4e7c2250c273'),
  ('6d7cbbdd-f809-4690-8799-5733ea3a5acd'),
  ('73dfa987-174f-4ba0-8ff5-4fcc69071fee'),
  ('82f27b2e-b8b0-4690-bb3a-0a441aa85e89'),
  ('891d3616-4898-4a18-9b7d-548b951730eb'),
  ('9a52cea2-a10e-4e11-813a-4d594e8f1f37'),
  ('a759a352-f895-4b84-836d-19eba8a9b1f0'),
  ('aef1f920-c430-4666-a5e1-6bec50b990a6'),
  ('c10828e7-305c-4af0-a337-9e3ead9687f0'),
  ('c54cc670-16d5-4fc0-a717-e60de089cf8c'),
  ('c66a8478-e4ce-46bf-8046-d46f16010ba4'),
  ('c9d7b449-56f9-4d04-84b8-44fe74f0876e'),
  ('d5d24c84-ad66-4541-ac16-0278019e12a9'),
  ('d8cc5fa3-c6cd-476b-b6f0-b5cd79f04765'),
  ('dcd7602c-9755-4293-9d6b-b2e329475336'),
  ('f3c1ba4a-18da-459d-a1e3-c900ebb6a864'),
  ('f434e758-4e88-44f6-a06c-8f3809530120'),
  ('f6939be0-f583-4d9b-b5a7-9650ccab371f'),
  ('f8e3b20f-8a95-4a69-b84b-523619a9367b'),
  ('fb25532a-b401-40ae-807f-d58d2b116020'),
  ('fc615cb1-8c7a-43b2-bc95-c98aa04ce79d');

SELECT (SELECT count(*) FROM retype) AS listed,
       (SELECT count(*) FROM items i JOIN retype r ON r.item_id = i.id WHERE i.type = 'media' AND i.deleted_at IS NULL) AS will_change;

UPDATE items SET type = 'link'
WHERE id IN (SELECT item_id FROM retype) AND type = 'media' AND deleted_at IS NULL;

SELECT type, count(*) FROM items WHERE deleted_at IS NULL AND type IN ('media', 'link') GROUP BY type ORDER BY type;

\if :{?commit}
  \echo 'COMMIT requested: keeping changes.'
  COMMIT;
\else
  \echo 'Preview only: rolling back. Re-run with -v commit=1 to keep the changes.'
  ROLLBACK;
\endif
