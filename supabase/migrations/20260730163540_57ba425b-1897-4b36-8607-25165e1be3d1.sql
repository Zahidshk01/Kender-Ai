CREATE TABLE public.deleted_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  username text,
  profile jsonb,
  subscription jsonb,
  characters jsonb,
  stats jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.deleted_accounts TO service_role;

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY "No client access to deleted_accounts"
  ON public.deleted_accounts
  AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX idx_deleted_accounts_user_id ON public.deleted_accounts(user_id);
CREATE INDEX idx_deleted_accounts_email ON public.deleted_accounts(email);
