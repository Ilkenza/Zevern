-- Zevern — make the RPC surface deliberate.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and PUBLIC is a
-- superset of anon. 0026 revoked delete_user from `anon` and thought that closed it;
-- the default grant underneath was still there, and the linter caught it. Revoke from
-- PUBLIC first, then hand out exactly the roles each function is meant for.

revoke execute on function public.delete_user(text) from public, anon;
grant  execute on function public.delete_user(text) to authenticated;

-- The three ext_* functions ARE meant to be callable without a session: the browser
-- extension talks to them with the anon key and a token. Re-granting them explicitly
-- keeps that an intentional decision rather than an inherited default, so the linter
-- warning that remains is one to read as "yes, on purpose".
revoke execute on function public.ext_lead_exists(text, text, text) from public;
revoke execute on function public.ext_get_lead(text, text, text) from public;
revoke execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  from public;

grant execute on function public.ext_lead_exists(text, text, text) to anon, authenticated;
grant execute on function public.ext_get_lead(text, text, text) to anon, authenticated;
grant execute on function public.ext_add_lead(text, text, text, text, text, text, text, text)
  to anon, authenticated;

-- handle_new_user is a trigger function; nothing should be able to call it directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
