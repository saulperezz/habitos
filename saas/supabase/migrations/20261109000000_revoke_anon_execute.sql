-- Las funciones creadas después del «revoke» de la migración inicial heredan EXECUTE para anon/public
-- (privilegios por defecto de Supabase). Solo los usuarios autenticados deben poder llamar a las RPC,
-- y las funciones de trigger no deben exponerse por /rest/v1/rpc.
revoke execute on all functions in schema public from anon, public;

revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.set_updated_at() from authenticated;
revoke execute on function public.enforce_row_limit() from authenticated;

grant execute on function public.is_valid_timezone(text) to authenticated;
grant execute on function public.import_legacy_backup(jsonb) to authenticated;
grant execute on function public.record_review_answer(date, uuid, text) to authenticated;
grant execute on function public.delete_account() to authenticated;
