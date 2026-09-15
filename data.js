// Capa de datos: todas las llamadas a Supabase que antes hacía
// Code.gs (doGet ?action=summary / doPost) desde Apps Script. Cada
// función devuelve una Promesa. Row Level Security en las tablas ya
// garantiza que cada persona solo lee/toca sus propias filas — no hace
// falta filtrar "where user_id = ..." en los SELECT, pero SÍ hay que
// indicar el user_id al INSERTAR (las políticas de RLS lo exigen).

function currentUserId_() {
  return supabaseClient.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) throw new Error('Sesión caducada, vuelve a iniciar sesión.');
    return session.user.id;
  });
}

function lanzarSiError_(res) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// --- Perfil (dinero inicial / nómina base) ---
function getPerfil() {
  return supabaseClient.from('perfil').select('*').maybeSingle().then(function (res) {
    var data = lanzarSiError_(res);
    return data || { dinero_inicial: null, nomina_base: 0 };
  });
}

function setDineroInicial(importe) {
  return currentUserId_().then(function (uid) {
    return supabaseClient.from('perfil')
      .upsert({ user_id: uid, dinero_inicial: importe }, { onConflict: 'user_id' })
      .then(lanzarSiError_);
  });
}

// --- Ingresos fijos (misma estructura que Gastos fijos: una lista de
// conceptos recurrentes, en vez de un único importe por mes) ---
function getIngresosFijos() {
  return supabaseClient.from('ingresos_fijos').select('*').order('concepto').then(function (res) {
    var filas = lanzarSiError_(res) || [];
    return filas.map(function (f) {
      return {
        id: f.id, concepto: f.concepto, importe: Number(f.importe),
        frecuencia: f.frecuencia, metodoPago: f.metodo_pago || '', proximaFecha: f.proxima_fecha,
        activo: !!f.activo, variable: !!f.variable, nota: f.nota || ''
      };
    });
  });
}

function guardarIngresoFijo(datos) {
  var valores = {
    concepto: datos.concepto, importe: datos.importe, frecuencia: datos.frecuencia,
    metodo_pago: datos.metodoPago, proxima_fecha: datos.proximaFecha,
    activo: !!datos.activo, variable: !!datos.variable, nota: datos.nota || ''
  };
  if (datos.id) {
    return supabaseClient.from('ingresos_fijos').update(valores).eq('id', datos.id).then(lanzarSiError_);
  }
  return currentUserId_().then(function (uid) {
    valores.user_id = uid;
    return supabaseClient.from('ingresos_fijos').insert(valores).then(lanzarSiError_);
  });
}

function eliminarIngresoFijo(id) {
  return supabaseClient.from('ingresos_fijos').delete().eq('id', id).then(lanzarSiError_);
}

// --- Pendientes de confirmar importe (gastos e ingresos fijos
// "variables" cuya próxima fecha ya ha llegado): el servidor NO los
// añade solos — hay que confirmar el importe real desde la app. ---
function getPendientesGastosFijos() {
  var hoy = hoyISO();
  return supabaseClient.from('gastos_fijos').select('*')
    .eq('activo', true).eq('variable', true).lte('proxima_fecha', hoy)
    .order('proxima_fecha').then(function (res) {
      var filas = lanzarSiError_(res) || [];
      return filas.map(function (f) {
        return {
          id: f.id, concepto: f.concepto, categoria: f.categoria,
          proximaFecha: f.proxima_fecha, frecuencia: f.frecuencia,
          retraso: periodosDeRetraso(f.proxima_fecha, f.frecuencia)
        };
      });
    });
}

function confirmarGastoFijoVariable(gastoFijoId, importe) {
  return currentUserId_().then(function (uid) {
    return supabaseClient.from('gastos_fijos').select('*').eq('id', gastoFijoId).single()
      .then(lanzarSiError_)
      .then(function (gf) {
        var notaFinal = 'Fijo: ' + gf.concepto + (gf.nota ? ' — ' + gf.nota : '');
        return supabaseClient.from('gastos').insert({
          user_id: uid, fecha: gf.proxima_fecha, categoria: gf.categoria, importe: importe,
          metodo_pago: gf.metodo_pago, nota: notaFinal, gasto_fijo_id: gf.id, tipo_gasto: gf.tipo_gasto
        }).then(lanzarSiError_).then(function () {
          var siguiente = avanzarFecha(gf.proxima_fecha, gf.frecuencia);
          return supabaseClient.from('gastos_fijos').update({ proxima_fecha: siguiente }).eq('id', gf.id).then(lanzarSiError_);
        });
      });
  });
}

function getPendientesIngresosFijos() {
  var hoy = hoyISO();
  return supabaseClient.from('ingresos_fijos').select('*')
    .eq('activo', true).eq('variable', true).lte('proxima_fecha', hoy)
    .order('proxima_fecha').then(function (res) {
      var filas = lanzarSiError_(res) || [];
      return filas.map(function (f) {
        return {
          id: f.id, concepto: f.concepto,
          proximaFecha: f.proxima_fecha, frecuencia: f.frecuencia,
          retraso: periodosDeRetraso(f.proxima_fecha, f.frecuencia)
        };
      });
    });
}

function confirmarIngresoFijoVariable(ingresoFijoId, importe) {
  return currentUserId_().then(function (uid) {
    return supabaseClient.from('ingresos_fijos').select('*').eq('id', ingresoFijoId).single()
      .then(lanzarSiError_)
      .then(function (inf) {
        var conceptoFinal = 'Fijo: ' + inf.concepto + (inf.nota ? ' — ' + inf.nota : '');
        return supabaseClient.from('ingresos').insert({
          user_id: uid, fecha: inf.proxima_fecha, concepto: conceptoFinal, importe: importe,
          metodo_pago: inf.metodo_pago, ingreso_fijo_id: inf.id
        }).then(lanzarSiError_).then(function () {
          var siguiente = avanzarFecha(inf.proxima_fecha, inf.frecuencia);
          return supabaseClient.from('ingresos_fijos').update({ proxima_fecha: siguiente }).eq('id', inf.id).then(lanzarSiError_);
        });
      });
  });
}

// --- Movimientos (gastos e ingresos puntuales mezclados) ---
function getMovimientos(limite) {
  limite = limite || 20;
  return Promise.all([
    supabaseClient.from('gastos').select('id, fecha, categoria, importe, metodo_pago, nota, tipo_gasto')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(limite),
    supabaseClient.from('ingresos').select('id, fecha, concepto, importe')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(limite)
  ]).then(function (res) {
    var gastos = (lanzarSiError_(res[0]) || []).map(function (g) {
      return { tipo: 'gasto', id: g.id, fecha: g.fecha, titulo: g.categoria || 'Otros',
        metodoPago: g.metodo_pago || '', nota: g.nota || '', importe: Number(g.importe),
        tipoGasto: g.tipo_gasto || null };
    });
    var ingresos = (lanzarSiError_(res[1]) || []).map(function (i) {
      return { tipo: 'ingreso', id: i.id, fecha: i.fecha, titulo: i.concepto || 'Ingreso',
        nota: '', importe: Number(i.importe) };
    });
    var todos = gastos.concat(ingresos);
    todos.sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      return b.id - a.id;
    });
    return todos.slice(0, limite);
  });
}

function eliminarMovimiento(tipo, id) {
  var tabla = tipo === 'gasto' ? 'gastos' : 'ingresos';
  return supabaseClient.from(tabla).delete().eq('id', id).then(lanzarSiError_);
}

function editarMovimiento(mov) {
  var tabla = mov.tipo === 'gasto' ? 'gastos' : 'ingresos';
  var cambios = { fecha: mov.fecha, importe: mov.importe };
  if (mov.tipo === 'gasto') {
    cambios.categoria = mov.categoria;
    cambios.metodo_pago = mov.metodoPago;
    cambios.nota = mov.nota || '';
    cambios.tipo_gasto = mov.tipoGasto || null;
  } else {
    cambios.concepto = mov.concepto;
  }
  return supabaseClient.from(tabla).update(cambios).eq('id', mov.id).then(lanzarSiError_);
}

// --- Añadir gasto / ingreso desde "Registrar" ---
function addGasto(datos) {
  return currentUserId_().then(function (uid) {
    return supabaseClient.from('gastos').insert({
      user_id: uid, fecha: datos.fecha, categoria: datos.categoria,
      importe: datos.importe, metodo_pago: datos.metodoPago, nota: datos.nota || '',
      tipo_gasto: datos.tipoGasto || null
    }).then(lanzarSiError_);
  });
}

function addIngreso(datos) {
  return currentUserId_().then(function (uid) {
    return supabaseClient.from('ingresos').insert({
      user_id: uid, fecha: datos.fecha, concepto: datos.concepto || 'Ingreso',
      importe: datos.importe
    }).then(lanzarSiError_);
  });
}

// --- Gastos fijos ---
function getGastosFijos() {
  return supabaseClient.from('gastos_fijos').select('*').order('concepto').then(function (res) {
    var filas = lanzarSiError_(res) || [];
    return filas.map(function (f) {
      return {
        id: f.id, concepto: f.concepto, categoria: f.categoria, importe: Number(f.importe),
        frecuencia: f.frecuencia, metodoPago: f.metodo_pago || '', proximaFecha: f.proxima_fecha,
        activo: !!f.activo, variable: !!f.variable, tipoGasto: f.tipo_gasto || null, nota: f.nota || ''
      };
    });
  });
}

function guardarGastoFijo(datos) {
  var valores = {
    concepto: datos.concepto, categoria: datos.categoria, importe: datos.importe,
    frecuencia: datos.frecuencia, metodo_pago: datos.metodoPago,
    proxima_fecha: datos.proximaFecha, activo: !!datos.activo, variable: !!datos.variable,
    tipo_gasto: datos.tipoGasto || null, nota: datos.nota || ''
  };
  if (datos.id) {
    return supabaseClient.from('gastos_fijos').update(valores).eq('id', datos.id).then(lanzarSiError_);
  }
  return currentUserId_().then(function (uid) {
    valores.user_id = uid;
    return supabaseClient.from('gastos_fijos').insert(valores).then(lanzarSiError_);
  });
}

function eliminarGastoFijo(id) {
  return supabaseClient.from('gastos_fijos').delete().eq('id', id).then(lanzarSiError_);
}

// --- Resumen del mes actual (tarjetas + gasto por categoría) ---
function getResumenActual() {
  var hoy = new Date();
  var inicioMes = inicioMesISO(hoy);
  var inicioMesSiguiente = inicioMesISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1));
  var hoyStr = hoyISO();
  var claveMesActual = hoy.getFullYear() + '-' + hoy.getMonth();

  return Promise.all([
    getPerfil(),
    supabaseClient.from('gastos').select('fecha, categoria, importe, tipo_gasto')
      .gte('fecha', inicioMes).lt('fecha', inicioMesSiguiente),
    supabaseClient.from('ingresos').select('importe, ingreso_fijo_id')
      .gte('fecha', inicioMes).lt('fecha', inicioMesSiguiente)
  ]).then(function (res) {
    var perfil = res[0];
    var gastosMes = lanzarSiError_(res[1]) || [];
    var ingresosMesFilas = lanzarSiError_(res[2]) || [];

    var porCategoria = {};
    CATEGORIES.forEach(function (c) { porCategoria[c.id] = 0; });
    var totalMesActual = 0, mayorGasto = 0, totalHastaHoy = 0;
    var necesarioMes = 0, prescindibleMes = 0;

    gastosMes.forEach(function (g) {
      var importe = Number(g.importe) || 0;
      totalMesActual += importe;
      porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + importe;
      if (importe > mayorGasto) mayorGasto = importe;
      if (g.fecha <= hoyStr) totalHastaHoy += importe;
      if (tipoEfectivo(g.categoria, g.tipo_gasto) === 'necesario') necesarioMes += importe;
      else prescindibleMes += importe;
    });

    // Un ingreso con "ingreso_fijo_id" viene de un ingreso fijo (nómina...);
    // sin él, es un ingreso puntual — misma distinción que usa resumen_mensual.
    var ingresosFijosMes = 0, ingresosPuntualesMes = 0;
    ingresosMesFilas.forEach(function (i) {
      var importe = Number(i.importe) || 0;
      if (i.ingreso_fijo_id) ingresosFijosMes += importe;
      else ingresosPuntualesMes += importe;
    });
    var ingresosMesActual = ingresosFijosMes + ingresosPuntualesMes;
    var ahorroMes = ingresosMesActual - totalMesActual;
    var pctAhorroMes = ingresosMesActual !== 0 ? (ahorroMes / ingresosMesActual) : 0;
    var gastoMedioDiario = totalHastaHoy / hoy.getDate();
    var dineroInicial = Number(perfil.dinero_inicial) || 0;

    return {
      dineroInicial: dineroInicial,
      dineroInicialPendiente: perfil.dinero_inicial === null || typeof perfil.dinero_inicial === 'undefined',
      nomina: Number(perfil.nomina_base) || 0,
      totalMes: totalMesActual,
      ingresosMes: ingresosMesActual,
      ahorroMes: ahorroMes,
      pctAhorroMes: pctAhorroMes,
      gastoMedioDiario: gastoMedioDiario,
      mayorGasto: mayorGasto,
      porCategoria: porCategoria,
      necesarioMes: necesarioMes,
      prescindibleMes: prescindibleMes
      // "saldoTotal" se añade en getEvolucionYSaldo() (necesita el histórico completo)
    };
  });
}

// --- Evolución mensual + saldo total (histórico completo, vía la
// vista "resumen_mensual" para no tener que traer al navegador todos
// los gastos e ingresos individuales de toda la vida de la cuenta) ---
var EVOLUCION_LIMITE = 12;

function getEvolucionYSaldo() {
  var hoy = new Date();
  var inicioMes = inicioMesISO(hoy);

  return Promise.all([
    supabaseClient.from('resumen_mensual').select('*').lte('mes', inicioMes).order('mes', { ascending: true }),
    getPerfil()
  ]).then(function (res) {
    var filas = lanzarSiError_(res[0]) || [];
    var perfil = res[1];
    var dineroInicial = Number(perfil.dinero_inicial) || 0;

    var ahorroAcumulado = filas.reduce(function (s, f) { return s + (Number(f.ahorro) || 0); }, 0);
    var saldoTotal = dineroInicial + ahorroAcumulado;

    var evolucion = filas.slice(-EVOLUCION_LIMITE).reverse().map(function (f) {
      var ingresosTotales = Number(f.ingresos_totales) || 0;
      var ahorro = Number(f.ahorro) || 0;
      return {
        etiqueta: etiquetaMes(f.mes),
        ingresosTotales: ingresosTotales,
        gastos: Number(f.gastos) || 0,
        ahorro: ahorro,
        pctAhorro: ingresosTotales !== 0 ? (ahorro / ingresosTotales) : null
      };
    });

    return { saldoTotal: saldoTotal, evolucion: evolucion };
  });
}

// --- Anomalías: compara cada gasto fijo con su propio historial (nunca
// gastos sueltos entre sí, que no son comparables). Necesita al menos
// una ocurrencia anterior del MISMO gasto fijo para poder avisar — por
// eso enlazamos cada gasto generado con su "gasto_fijo_id". Umbral: una
// desviación de más del 25% sobre la media de ocurrencias anteriores
// (hasta las últimas 6) se marca como anomalía; si además hay una
// ocurrencia de hace ~12 meses, se muestra esa comparación también. ---
var ANOMALIA_UMBRAL = 0.25;
var ANOMALIA_HISTORIAL_MAX = 6;

function getAnomalias() {
  return supabaseClient.from('gastos')
    .select('id, fecha, importe, gasto_fijo_id, gastos_fijos(concepto)')
    .not('gasto_fijo_id', 'is', null)
    .order('fecha', { ascending: true })
    .then(function (res) {
      var filas = lanzarSiError_(res) || [];
      var porFijo = {};
      filas.forEach(function (g) {
        var lista = porFijo[g.gasto_fijo_id] || (porFijo[g.gasto_fijo_id] = []);
        lista.push({
          fecha: g.fecha,
          importe: Number(g.importe),
          concepto: (g.gastos_fijos && g.gastos_fijos.concepto) || 'Gasto fijo'
        });
      });

      var anomalias = [];
      var hayHistorialSuficiente = false;
      Object.keys(porFijo).forEach(function (gastoFijoId) {
        var ocurrencias = porFijo[gastoFijoId];
        if (ocurrencias.length < 2) return; // nada con qué comparar todavía
        hayHistorialSuficiente = true;

        var actual = ocurrencias[ocurrencias.length - 1];
        var anteriores = ocurrencias.slice(Math.max(0, ocurrencias.length - 1 - ANOMALIA_HISTORIAL_MAX), ocurrencias.length - 1);
        var media = anteriores.reduce(function (s, o) { return s + o.importe; }, 0) / anteriores.length;
        if (media <= 0) return;

        var desviacion = (actual.importe - media) / media;
        if (Math.abs(desviacion) < ANOMALIA_UMBRAL) return;

        // ¿Hay una ocurrencia de hace ~12 meses (mismo mes, año anterior)?
        var fechaActual = new Date(actual.fecha);
        var mismoMesAnoAnterior = anteriores.filter(function (o) {
          var f = new Date(o.fecha);
          return f.getMonth() === fechaActual.getMonth() && f.getFullYear() === fechaActual.getFullYear() - 1;
        })[0];

        anomalias.push({
          concepto: actual.concepto,
          fecha: actual.fecha,
          importe: actual.importe,
          mediaAnterior: media,
          desviacionPct: desviacion,
          importeAnoAnterior: mismoMesAnoAnterior ? mismoMesAnoAnterior.importe : null,
          numOcurrenciasPrevias: anteriores.length
        });
      });

      anomalias.sort(function (a, b) { return Math.abs(b.desviacionPct) - Math.abs(a.desviacionPct); });
      return { anomalias: anomalias, hayHistorialSuficiente: hayHistorialSuficiente };
    });
}
