-- Ask Backstage daily usage accounting
-- Apply before deploying the matching backend/frontend change.

CREATE TABLE IF NOT EXISTS public.ask_backstage_usage (
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date    date        NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  request_count integer     NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS ask_backstage_usage_date_idx
  ON public.ask_backstage_usage (usage_date);

ALTER TABLE public.ask_backstage_usage ENABLE ROW LEVEL SECURITY;

-- Usage is private operational data. The backend service role manages it;
-- authenticated browser clients receive only the API's remaining-count response.
REVOKE ALL ON TABLE public.ask_backstage_usage FROM anon, authenticated, PUBLIC;
