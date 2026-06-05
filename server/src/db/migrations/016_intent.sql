-- Add intent classification: actionable | reference | idea
ALTER TABLE items ADD COLUMN IF NOT EXISTS intent VARCHAR(20);
ALTER TABLE item_extractions ADD COLUMN IF NOT EXISTS intent VARCHAR(20);
