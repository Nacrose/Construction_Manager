-- Add curated key words to BoqItem for the collapsed BOQ keyline + highlight.
-- The keyline/highlight are DERIVED in src/lib (ADR-0006 §2); only the key
-- words are stored.

ALTER TABLE "BoqItem" ADD COLUMN "keyTerms" TEXT;
