-- =====================================================================
-- 002_views_and_automations.sql
--
-- EJECUTA ESTE ARCHIVO ENTERO UNA VEZ en el SQL Editor de tu proyecto
-- de Supabase (con las tablas de 001_schema.sql ya creadas). Añade:
--
--   1. Un perfil automático al crear tu usuario (para no tener que
--      insertarlo a mano).
--   2. Una vista "resumen_mensual" que calcula, por mes, ingresos
--      fijos + puntuales, gastos y ahorro — el equivalente a la tabla
--      "Evolución mensual" del Excel, pero calculada al vuelo (no hay
--      que mantenerla ni "estirarla" con meses futuros: solo existen
--      filas para los meses que de verdad tienen algo).
--   3. Dos funciones que hacían antes el trigger diario de Apps
--      Script: procesar_gastos_fijos() (añade a "gastos" los cargos
--      fijos cuya "próxima fecha" ya llegó, y la avanza) y
--      procesar_nomina() (si el mes actual —o alguno de los últimos 12
--      meses— se quedó sin "ingreso fijo", lo rellena con tu nómina
--      base, sin tocar nunca un mes que ya hayas escrito tú).
--   4. Una tarea programada (pg_cron) que llama a esas dos funciones
--      cada día a las 6:00, igual que hacía el disparador de Apps
--      Script.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Perfil automático al crear el usuario
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfil (user_id, dinero_inicial, nomina_base)
  values (new.id, null, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Si tu usuario YA existe (lo creaste antes de ejecutar esto), crea su
-- fila de perfil ahora mismo con esta línea (no hace nada si ya existe):
insert into public.perfil (user_id, dinero_inicial, nomina_base)
select id, null, 0 from auth.users
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 2) Vista "resumen_mensual": una fila por mes con actividad
--    (ingreso fijo guardado, ingreso puntual o gasto), con
--    security_invoker para que cada persona solo vea sus propios
--    meses (misma protección que las políticas de RLS de las tablas).
-- ---------------------------------------------------------------------
create or replace view public.resumen_mensual
with (security_invoker = true) as
with meses as (
  select user_id, mes from public.ingresos_fijos_mensuales
  union
  select user_id, date_trunc('month', fecha)::date as mes from public.ingresos
  union
  select user_id, date_trunc('month', fecha)::date as mes from public.gastos
),
gastos_mes as (
  select user_id, date_trunc('month', fecha)::date as mes, sum(importe) as total
  from public.gastos
  group by 1, 2
),
ingresos_mes as (
  select user_id, date_trunc('month', fecha)::date as mes, sum(importe) as total
  from public.ingresos
  group by 1, 2
)
select
  m.user_id,
  m.mes,
  coalesce(f.importe, 0) as ingresos_fijos,
  coalesce(i.total, 0) as ingresos_puntuales,
  coalesce(f.importe, 0) + coalesce(i.total, 0) as ingresos_totales,
  coalesce(g.total, 0) as gastos,
  (coalesce(f.importe, 0) + coalesce(i.total, 0)) - coalesce(g.total, 0) as ahorro
from meses m
left join public.ingresos_fijos_mensuales f on f.user_id = m.user_id and f.mes = m.mes
left join gastos_mes g on g.user_id = m.user_id and g.mes = m.mes
left join ingresos_mes i on i.user_id = m.user_id and i.mes = m.mes;

grant select on public.resumen_mensual to authenticated;

-- ---------------------------------------------------------------------
-- 3) Automatización de gastos fijos y nómina (equivalente a
--    procesarGastosFijos()/procesarNomina_() de Apps Script).
--    SECURITY DEFINER: se ejecutan como el dueño de la base de datos,
--    así pueden procesar los gastos fijos de TODAS las personas que
--    usen esta misma base (aunque en tu caso solo seas tú) sin que las
--    políticas de "solo el dueño" se lo impidan.
-- ---------------------------------------------------------------------
create or replace function public.procesar_nomina()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  mes_cursor date;
  mes_actual date := date_trunc('month', now())::date;
begin
  -- Revisa los últimos 12 meses (de sobra para ponerse al día aunque
  -- la tarea programada llevara tiempo sin ejecutarse) y, mes a mes,
  -- si no hay ninguna fila todavía, la crea con la nómina base. Nunca
  -- toca un mes que ya tenga un importe guardado (ON CONFLICT DO
  -- NOTHING), así que un mes corregido a mano nunca se pisa.
  for r in select user_id, nomina_base from public.perfil loop
    mes_cursor := mes_actual - interval '11 months';
    while mes_cursor <= mes_actual loop
      insert into public.ingresos_fijos_mensuales (user_id, mes, importe)
      values (r.user_id, mes_cursor, r.nomina_base)
      on conflict (user_id, mes) do nothing;
      mes_cursor := (mes_cursor + interval '1 month')::date;
    end loop;
  end loop;
end;
$$;

create or replace function public.procesar_gastos_fijos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gf record;
  fecha_cursor date;
  meses_paso int;
  tope int;
  nota_final text;
begin
  for gf in select * from public.gastos_fijos where activo loop
    fecha_cursor := gf.proxima_fecha;
    meses_paso := case gf.frecuencia
      when 'Mensual' then 1
      when 'Trimestral' then 3
      when 'Semestral' then 6
      when 'Anual' then 12
      else 1
    end;
    tope := 0;

    while fecha_cursor <= current_date and tope < 60 loop
      nota_final := 'Fijo: ' || gf.concepto ||
        case when coalesce(gf.nota, '') <> '' then ' — ' || gf.nota else '' end;

      insert into public.gastos (user_id, fecha, categoria, importe, metodo_pago, nota)
      values (gf.user_id, fecha_cursor, gf.categoria, gf.importe, gf.metodo_pago, nota_final);

      fecha_cursor := (fecha_cursor + (meses_paso || ' months')::interval)::date;
      tope := tope + 1;
    end loop;

    if tope > 0 then
      update public.gastos_fijos set proxima_fecha = fecha_cursor where id = gf.id;
    end if;
  end loop;

  perform public.procesar_nomina();
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Tarea programada diaria (pg_cron), igual que el disparador de
--    Apps Script (todos los días a las 6:00 UTC).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'procesar-gastos-fijos-diario';

select cron.schedule(
  'procesar-gastos-fijos-diario',
  '0 6 * * *',
  $$select public.procesar_gastos_fijos();$$
);

-- Ejecuta ambas funciones una vez ahora mismo, para dejar todo al día
-- desde ya (equivalente a la llamada a procesarGastosFijos() dentro de
-- configurarHoja() en la versión de Apps Script):
select public.procesar_gastos_fijos();
