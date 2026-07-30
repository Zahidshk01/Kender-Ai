-- ============================================================
-- 1. LEAST PRIVILEGE: remove anonymous write access everywhere
-- ============================================================
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;

-- Anonymous visitors keep read access ONLY to publicly shareable surfaces.
REVOKE SELECT ON public.chat_messages       FROM anon;
REVOKE SELECT ON public.direct_messages     FROM anon;
REVOKE SELECT ON public.notifications_state FROM anon;
REVOKE SELECT ON public.push_subscriptions  FROM anon;
REVOKE SELECT ON public.usage_daily         FROM anon;
REVOKE SELECT ON public.user_blocks         FROM anon;
REVOKE SELECT ON public.user_follows        FROM anon;
REVOKE SELECT ON public.user_likes          FROM anon;
REVOKE SELECT ON public.user_reports        FROM anon;
REVOKE SELECT ON public.user_saves          FROM anon;
REVOKE SELECT ON public.user_user_follows   FROM anon;

-- Users must never be able to hand-write billing or quota rows.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.usage_daily   FROM authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================================
-- 2. STRICT INPUT VALIDATION AT THE DATABASE LAYER
--    (NOT VALID => applies to all new/updated rows, legacy rows untouched)
-- ============================================================

ALTER TABLE public.characters
  ADD CONSTRAINT characters_name_len       CHECK (char_length(name) BETWEEN 1 AND 80) NOT VALID,
  ADD CONSTRAINT characters_tagline_len    CHECK (tagline IS NULL OR char_length(tagline) <= 300) NOT VALID,
  ADD CONSTRAINT characters_persona_len    CHECK (persona IS NULL OR char_length(persona) <= 4000) NOT VALID,
  ADD CONSTRAINT characters_first_msg_len  CHECK (first_message IS NULL OR char_length(first_message) <= 4000) NOT VALID,
  ADD CONSTRAINT characters_relation_len   CHECK (relation IS NULL OR char_length(relation) <= 200) NOT VALID,
  ADD CONSTRAINT characters_category_len   CHECK (category IS NULL OR char_length(category) <= 60) NOT VALID,
  ADD CONSTRAINT characters_creator_len    CHECK (creator IS NULL OR char_length(creator) <= 64) NOT VALID,
  ADD CONSTRAINT characters_visibility_ok  CHECK (visibility IN ('public','private')) NOT VALID,
  ADD CONSTRAINT characters_owner_present  CHECK (owner_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT characters_image_ok
    CHECK (image IS NULL OR (char_length(image) <= 8388608
      AND (image ~ '^https://' OR image ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'))) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_ok
    CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_.]{1,32}$') NOT VALID,
  ADD CONSTRAINT profiles_bio_len CHECK (bio IS NULL OR char_length(bio) <= 300) NOT VALID,
  ADD CONSTRAINT profiles_avatar_ok
    CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 8388608
      AND (avatar_url ~ '^https://' OR avatar_url ~ '^data:image/(png|jpeg|jpg|webp|gif);base64,'))) NOT VALID;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_content_len CHECK (char_length(content) <= 8000) NOT VALID;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT dm_content_len CHECK (char_length(content) BETWEEN 1 AND 4000) NOT VALID,
  ADD CONSTRAINT dm_not_self    CHECK (sender_id <> recipient_id) NOT VALID;

ALTER TABLE public.user_reports
  ADD CONSTRAINT reports_reason_len  CHECK (reason IS NULL OR char_length(reason) <= 120) NOT VALID,
  ADD CONSTRAINT reports_details_len CHECK (details IS NULL OR char_length(details) <= 2000) NOT VALID,
  ADD CONSTRAINT reports_target_len  CHECK (reported_target IS NULL OR char_length(reported_target) <= 200) NOT VALID;

-- ============================================================
-- 3. SECURITY / AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.security_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event       text NOT NULL CHECK (char_length(event) <= 64),
  outcome     text NOT NULL DEFAULT 'info' CHECK (outcome IN ('info','success','failure','blocked')),
  route       text CHECK (route IS NULL OR char_length(route) <= 128),
  ip          text CHECK (ip IS NULL OR char_length(ip) <= 64),
  user_agent  text CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_events_created_idx ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user_idx    ON public.security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_event_idx   ON public.security_events (event, created_at DESC);

GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL    ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own security events"
  ON public.security_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);