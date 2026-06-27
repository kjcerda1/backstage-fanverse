-- Founder Number auto-assignment — safe, idempotent, concurrency-safe
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Backstage V16 patch. Does not touch existing founder_number values (1, 2, 3).

-- 1. Uniqueness guard: founder_number must be unique whenever set.
--    Partial index — NULLs (unassigned comp/monthly/annual VIPs) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS users_founder_number_unique_idx
  ON public.users (founder_number)
  WHERE founder_number IS NOT NULL;

-- 2. assign_next_founder_number(target_user_id) — idempotent + concurrency-safe.
--    - If the user already has a founder_number, returns it unchanged (no-op).
--    - Otherwise takes a transaction-scoped advisory lock so two concurrent
--      Stripe webhook deliveries can never both compute the same MAX()+1.
--    - SECURITY DEFINER + locked to service_role only, matching the existing
--      pattern used by recalculate_proof_score / update_proof_score.
CREATE OR REPLACE FUNCTION public.assign_next_founder_number(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_number integer;
  next_number     integer;
BEGIN
  -- Fixed advisory-lock key — serializes all founder_number assignments
  -- across concurrent calls. Released automatically at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('assign_next_founder_number'));

  SELECT founder_number INTO existing_number
  FROM public.users
  WHERE id = target_user_id;

  IF existing_number IS NOT NULL THEN
    RETURN existing_number;
  END IF;

  SELECT COALESCE(MAX(founder_number), 0) + 1 INTO next_number
  FROM public.users;

  UPDATE public.users
  SET founder_number = next_number
  WHERE id = target_user_id;

  RETURN next_number;
END;
$$;

-- Lock down: backend (service_role) only — never callable by anon/authenticated clients.
REVOKE ALL ON FUNCTION public.assign_next_founder_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_next_founder_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assign_next_founder_number(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_next_founder_number(uuid) TO service_role;

-- To manually grant founder status + number to a comped user later, run:
--   select assign_next_founder_number('00000000-0000-0000-0000-000000000000');
-- This is intentionally NOT automatic for comp/comped vip_source.
