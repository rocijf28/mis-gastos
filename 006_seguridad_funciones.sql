-- =====================================================================
-- 006_seguridad_funciones.sql
--
-- Arregla los avisos del Security Advisor de Supabase sobre funciones
-- SECURITY DEFINER ejecutables por cualquiera (rol "public", es decir
-- sin sesión iniciada) o por cualquier usuario logueado ("authenticated").
--
-- Ninguna de estas funciones se llama desde app.js/data.js con
-- supabase.rpc(...): handle_new_user() la dispara el propio trigger de
-- alta de usuario, y procesar_nomina()/procesar_gastos_fijos()/
-- procesar_ingresos_fijos() las llama solo la tarea diaria de pg_cron
-- (o entre ellas). Quitarles el permiso a "public" y "authenticated"
-- no afecta a nada de lo que hace la app ahora mismo — solo evita que
-- alguien las dispare a mano desde fuera.
-- =====================================================================

revoke execute on function public.handle_new_user() from public, authenticated;
revoke execute on function public.procesar_nomina() from public, authenticated;
revoke execute on function public.procesar_gastos_fijos() from public, authenticated;
revoke execute on function public.procesar_ingresos_fijos() from public, authenticated;

-- Esta no aparece en las migraciones 001/002/004/005 (parece creada
-- directamente en el SQL Editor, sin migración 003 en el repo). Por su
-- nombre y por no usarse en el cliente, debería ser igual de segura de
-- restringir. Si al ejecutar esta línea da error de "function does not
-- exist", bórrala y revisa su definición antes de tocarla.
revoke execute on function public.rls_auto_enable() from public, authenticated;
