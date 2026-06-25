-- Reset newuser@pocketpolyglot.dev back to first-run state so the new-user
-- experience (diacritic orientation -> consent -> day-one pacing) replays.
-- Run via Supabase MCP execute_sql (project necfghfotwykjsykccsa) or the SQL editor.

with u as (select id from auth.users where email = 'newuser@pocketpolyglot.dev')
update profiles
   set settings = settings - 'seenDiacritics',
       rec_consent = false,
       rec_consent_at = null,
       training_consent = false
 where id = (select id from u);

delete from review_state where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
delete from review_log  where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
delete from recordings  where user_id = (select id from auth.users where email = 'newuser@pocketpolyglot.dev');
