-- MawinguOps — remember a demo scenario for the life of a USSD session.
--
-- The plant/wait/don't-plant decision is only live in-season, so off-season a
-- demo needs a way to walk the decision path. A judge/demo harness passes a
-- `demo` field on the FIRST /ussd request; we persist it here so every later
-- step of that same session keeps reading the same in-season scenario even
-- though Africa's Talking does not resend custom fields. A real farmer's
-- session leaves this NULL and reads production ('machakos').
--
-- Idempotent: safe to re-run.

ALTER TABLE ussd_sessions
  ADD COLUMN IF NOT EXISTS demo_scenario VARCHAR(30);
