-- =====================================================================
-- 007_restricciones_valores.sql
-- (ejecuta una vez en el SQL Editor, con 001 a 006 ya ejecutados)
--
-- Hasta ahora, campos como "categoría", "frecuencia" o "método de pago"
-- se guardaban como texto libre: la app siempre los rellena eligiendo
-- de una lista fija (un <select>), pero la base de datos en sí no lo
-- exigía. Eso significa que, en teoría, alguien podría llamar a la API
-- de Supabase directamente (con su propia sesión) y guardar en SU
-- PROPIA cuenta un valor cualquiera en esos campos — incluido texto con
-- HTML, que luego se vería "raro" al abrir su propia página de Resumen.
-- Row Level Security ya impide que eso afecte a otras cuentas, pero no
-- está de más que la base de datos rechace directamente cualquier valor
-- que la app nunca produciría.
--
-- Estas restricciones reflejan EXACTAMENTE las listas que ya usa la app
-- (ver CATEGORIES, FRECUENCIAS, METODOS_PAGO y METODOS_PAGO_FIJOS en
-- app.js). Si en el futuro añades o renombras una categoría, un método
-- de pago o una frecuencia en app.js, tendrás que actualizar también la
-- restricción correspondiente aquí, o los guardados nuevos con el valor
-- distinto serán rechazados por la base de datos.
--
-- "tipo_gasto" (necesario/prescindible) ya tenía su propia restricción
-- desde 004_modificaciones_v2.sql — no hace falta repetirla aquí.
-- =====================================================================

-- --- Categoría: gastos, gastos_fijos y los límites de presupuesto por
-- categoría (presupuestos_categoria) ---
alter table public.gastos drop constraint if exists gastos_categoria_valida;
alter table public.gastos add constraint gastos_categoria_valida
  check (categoria in (
    'Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Ocio',
    'Salud', 'Compras', 'Suscripciones', 'Otros'
  ));

alter table public.gastos_fijos drop constraint if exists gastos_fijos_categoria_valida;
alter table public.gastos_fijos add constraint gastos_fijos_categoria_valida
  check (categoria in (
    'Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Ocio',
    'Salud', 'Compras', 'Suscripciones', 'Otros'
  ));

alter table public.presupuestos_categoria drop constraint if exists presupuestos_categoria_categoria_valida;
alter table public.presupuestos_categoria add constraint presupuestos_categoria_categoria_valida
  check (categoria in (
    'Alimentación', 'Transporte', 'Vivienda', 'Servicios', 'Ocio',
    'Salud', 'Compras', 'Suscripciones', 'Otros'
  ));

-- --- Frecuencia: gastos_fijos e ingresos_fijos ---
alter table public.gastos_fijos drop constraint if exists gastos_fijos_frecuencia_valida;
alter table public.gastos_fijos add constraint gastos_fijos_frecuencia_valida
  check (frecuencia in ('Mensual', 'Trimestral', 'Semestral', 'Anual'));

alter table public.ingresos_fijos drop constraint if exists ingresos_fijos_frecuencia_valida;
alter table public.ingresos_fijos add constraint ingresos_fijos_frecuencia_valida
  check (frecuencia in ('Mensual', 'Trimestral', 'Semestral', 'Anual'));

-- --- Método de pago: gastos e ingresos puntuales (sin "Domiciliación",
-- que solo tiene sentido para algo recurrente) ---
alter table public.gastos drop constraint if exists gastos_metodo_pago_valido;
alter table public.gastos add constraint gastos_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro'));

alter table public.ingresos drop constraint if exists ingresos_metodo_pago_valido;
alter table public.ingresos add constraint ingresos_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro'));

-- --- Método de pago: gastos_fijos e ingresos_fijos (con "Domiciliación") ---
alter table public.gastos_fijos drop constraint if exists gastos_fijos_metodo_pago_valido;
alter table public.gastos_fijos add constraint gastos_fijos_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro', 'Domiciliación'));

alter table public.ingresos_fijos drop constraint if exists ingresos_fijos_metodo_pago_valido;
alter table public.ingresos_fijos add constraint ingresos_fijos_metodo_pago_valido
  check (metodo_pago is null or metodo_pago in ('Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro', 'Domiciliación'));
