-- =====================================================================
-- 008_frecuencia_semanal.sql
-- (ejecuta una vez en el SQL Editor, con 001 a 007 ya ejecutados)
--
-- Añade "Semanal" como frecuencia válida para gastos fijos e ingresos
-- fijos. Dos cosas hay que tocar para que funcione de verdad:
--
-- 1) Las restricciones de 007_restricciones_valores.sql, que hasta
--    ahora rechazaban cualquier frecuencia que no fuera Mensual,
--    Trimestral, Semestral o Anual — "Semanal" sería rechazado por la
--    base de datos aunque la app lo permitiera.
--
-- 2) procesar_gastos_fijos() y procesar_ingresos_fijos() (de
--    004_modificaciones_v2.sql), que calculaban el salto entre cobros
--    SIEMPRE en meses ("meses_paso"). Una frecuencia "Semanal" caía en
--    el "else 1" y avanzaba un mes en vez de una semana — un gasto/
--    ingreso semanal se habría generado solo una vez al mes. Ahora el
--    salto se calcula como un intervalo (7 days / 1-12 months) en vez
--    de asumir siempre meses.
-- =====================================================================

-- --- 1) Frecuencia: gastos_fijos e ingresos_fijos ---
alter table public.gastos_fijos drop constraint if exists gastos_fijos_frecuencia_valida;
alter table public.gastos_fijos add constraint gastos_fijos_frecuencia_valida
  check (frecuencia in ('Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual'));

alter table public.ingresos_fijos drop constraint if exists ingresos_fijos_frecuencia_valida;
alter table public.ingresos_fijos add constraint ingresos_fijos_frecuencia_valida
  check (frecuencia in ('Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual'));

-- --- 2) procesar_gastos_fijos(): mismo cuerpo que en
-- 004_modificaciones_v2.sql, cambiando "meses_paso int" por
-- "paso interval" para poder avanzar 7 días en vez de meses. ---
create or replace function public.procesar_gastos_fijos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  gf record;
  fecha_cursor date;
  paso interval;
  tope int;
  nota_final text;
begin
  for gf in select * from public.gastos_fijos where activo and not variable loop
    fecha_cursor := gf.proxima_fecha;
    paso := case gf.frecuencia
      when 'Semanal' then interval '7 days'
      when 'Mensual' then interval '1 month'
      when 'Trimestral' then interval '3 months'
      when 'Semestral' then interval '6 months'
      when 'Anual' then interval '12 months'
      else interval '1 month'
    end;
    tope := 0;

    while fecha_cursor <= current_date and tope < 60 loop
      nota_final := 'Fijo: ' || gf.concepto ||
        case when coalesce(gf.nota, '') <> '' then ' — ' || gf.nota else '' end;

      insert into public.gastos (user_id, fecha, categoria, importe, metodo_pago, nota, gasto_fijo_id, tipo_gasto)
      values (gf.user_id, fecha_cursor, gf.categoria, gf.importe, gf.metodo_pago, nota_final, gf.id, gf.tipo_gasto);

      fecha_cursor := (fecha_cursor + paso)::date;
      tope := tope + 1;
    end loop;

    if tope > 0 then
      update public.gastos_fijos set proxima_fecha = fecha_cursor where id = gf.id;
    end if;
  end loop;

  perform public.procesar_ingresos_fijos();
end;
$$;

-- --- 2b) procesar_ingresos_fijos(): mismo cambio ---
create or replace function public.procesar_ingresos_fijos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inf record;
  fecha_cursor date;
  paso interval;
  tope int;
  concepto_final text;
begin
  for inf in select * from public.ingresos_fijos where activo and not variable loop
    fecha_cursor := inf.proxima_fecha;
    paso := case inf.frecuencia
      when 'Semanal' then interval '7 days'
      when 'Mensual' then interval '1 month'
      when 'Trimestral' then interval '3 months'
      when 'Semestral' then interval '6 months'
      when 'Anual' then interval '12 months'
      else interval '1 month'
    end;
    tope := 0;

    while fecha_cursor <= current_date and tope < 60 loop
      concepto_final := 'Fijo: ' || inf.concepto ||
        case when coalesce(inf.nota, '') <> '' then ' — ' || inf.nota else '' end;

      insert into public.ingresos (user_id, fecha, concepto, importe, metodo_pago, ingreso_fijo_id)
      values (inf.user_id, fecha_cursor, concepto_final, inf.importe, inf.metodo_pago, inf.id);

      fecha_cursor := (fecha_cursor + paso)::date;
      tope := tope + 1;
    end loop;

    if tope > 0 then
      update public.ingresos_fijos set proxima_fecha = fecha_cursor where id = inf.id;
    end if;
  end loop;
end;
$$;
