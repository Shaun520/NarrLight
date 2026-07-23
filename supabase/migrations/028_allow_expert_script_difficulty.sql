-- Allow the web generation form's "expert" difficulty to be persisted.
-- The application type and Admin generation spec already support this value.

ALTER TABLE public.scripts
  DROP CONSTRAINT IF EXISTS scripts_difficulty_check;

ALTER TABLE public.scripts
  ADD CONSTRAINT scripts_difficulty_check
  CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'expert'));
