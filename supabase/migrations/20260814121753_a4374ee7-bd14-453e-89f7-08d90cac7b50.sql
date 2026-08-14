CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  raw_name text;
  clean_name text;
BEGIN
  raw_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'user'
  );
  -- Keep only characters allowed by profiles_username_ok and cap length.
  clean_name := regexp_replace(raw_name, '[^A-Za-z0-9_.]', '', 'g');
  clean_name := left(clean_name, 32);
  IF clean_name IS NULL OR clean_name = '' THEN
    clean_name := 'user' || left(replace(NEW.id::text, '-', ''), 12);
  END IF;

  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    clean_name,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block sign-in because profile creation failed.
  RETURN NEW;
END;
$function$;