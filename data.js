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

// --- Ingresos fijos por mes (desplegable de "Registrar") ---
// Genera el desplegable de meses igual que antes: desde 12 meses atrás
// (o el mes más antiguo con algo guardado, si es anterior) hasta 24
// meses por delante — sin límite real, porque estos meses futuros son
// solo un cálculo del navegador, no hace falta guardarlos en la base
// de datos hasta que de verdad se rellenen.
function getMesesDropdown() {
  return Promise.all([
    supabaseClient.from('ingresos_fijos_mensuales').select('mes, importe').order('mes', { ascending: true }),
    getPerfil()
  ]).then(function (res) {
    var filas = lanzarSiError_(res[0]) || [];
    var mapa = {};
    filas.forEach(function (f) { mapa[claveMes(f.mes)] = Number(f.importe); });

    var hoy = new Date();
    var inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var indiceMesActual = inicioMesActual.getFullYear() * 12 + inicioMesActual.getMonth();

    var indiceMinimo = indiceMesActual - 12;
    if (filas.length > 0) {
      var primeraFecha = new Date(filas[0].mes);
      var indicePrimera = primeraFecha.getFullYear() * 12 + primeraFecha.getMonth();
      if (indicePrimera < indiceMinimo) indiceMinimo = indicePrimera;
    }
    var indiceMaximo = indiceMesActual + 24;

    var salida = [];
    for (var idx = indiceMinimo; idx <= indiceMaximo; idx++) {
      var anio = Math.floor(idx / 12);
      var mes = idx % 12;
      var fecha = new Date(anio, mes, 1);
      var mm = String(mes + 1).padStart(2, '0');
      var fechaISO = anio + '-' + mm + '-01';
      var clave = anio + '-' + mes;
      salida.push({
        clave: clave,
        etiqueta: etiquetaMes(fechaISO),
        ingresoFijo: (clave in mapa) ? mapa[clave] : null,
        esMesActual: idx === indiceMesActual
      });
    }
    return salida;
  });
}

function guardarIngresoFijoMes(claveMesTexto, importe) {
  var partes = claveMesTexto.split('-');
  var anio = Number(partes[0]), mes = Number(partes[1]);
  var mm = String(mes + 1).padStart(2, '0');
  var mesISO = anio + '-' + mm + '-01';

  return currentUserId_().then(function (uid) {
    return supabaseClient.from('ingresos_fijos_mensuales')
      .upsert({ user_id: uid, mes: mesISO, importe: importe }, { onConflict: 'user_id,mes' })
      .then(lanzarSiError_)
      .then(function () {
        var hoy = new Date();
        var claveMesActual = hoy.getFullYear() + '-' + hoy.getMonth();
        if (claveMesTexto === claveMesActual) {
          // igual que en Apps Script: el mes actual también actualiza
          // la nómina base, que sirve de sugerencia para el mes siguiente
          return supabaseClient.from('perfil')
            .upsert({ user_id: uid, nomina_base: importe }, { onConflict: 'user_id' })
            .then(lanzarSiError_);
        }
      });
  });
}

// --- Movimientos (gastos e ingresos puntuales mezclados) ---
function getMovimientos(limite) {
  limite = limite || 20;
  return Promise.all([
    supabaseClient.from('gastos').select('id, fecha, categoria, importe, metodo_pago, nota')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(limite),
    supabaseClient.from('ingresos').select('id, fecha, concepto, importe')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(limite)
  ]).then(function (res) {
    var gastos = (lanzarSiError_(res[0]) || []).map(function (g) {
      return { tipo: 'gasto', id: g.id, fecha: g.fecha, titulo: g.categoria || 'Otros',
        metodoPago: g.metodo_pago || '', nota: g.nota || '', importe: Number(g.importe) };
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
      importe: datos.importe, metodo_pago: datos.metodoPago, nota: datos.nota || ''
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
        activo: !!f.activo, nota: f.nota || ''
      };
    });
  });
}

function guardarGastoFijo(datos) {
  var valores = {
    concepto: datos.concepto, categoria: datos.categoria, importe: datos.importe,
    frecuencia: datos.frecuencia, metodo_pago: datos.metodoPago,
    proxima_fecha: datos.proximaFecha, activo: !!datos.activo, nota: datos.nota || ''
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
    supabaseClient.from('gastos').select('fecha, categoria, importe')
      .gte('fecha', inicioMes).lt('fecha', inicioMesSiguiente),
    supabaseClient.from('ingresos').select('importe')
      .gte('fecha', inicioMes).lt('fecha', inicioMesSiguiente),
    supabaseClient.from('ingresos_fijos_mensuales').select('importe').eq('mes', inicioMes).maybeSingle()
  ]).then(function (res) {
    var perfil = res[0];
    var gastosMes = lanzarSiError_(res[1]) || [];
    var ingresosPuntuales = lanzarSiError_(res[2]) || [];
    var ingresoFijoRow = lanzarSiError_(res[3]);

    var porCategoria = {};
    CATEGORIES.forEach(function (c) { porCategoria[c.id] = 0; });
    var totalMesActual = 0, mayorGasto = 0, totalHastaHoy = 0;

    gastosMes.forEach(function (g) {
      var importe = Number(g.importe) || 0;
      totalMesActual += importe;
      porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + importe;
      if (importe > mayorGasto) mayorGasto = importe;
      if (g.fecha <= hoyStr) totalHastaHoy += importe;
    });

    var ingresosPuntualesMes = ingresosPuntuales.reduce(function (s, i) { return s + (Number(i.importe) || 0); }, 0);
    var ingresosFijosMes = ingresoFijoRow ? Number(ingresoFijoRow.importe) : 0;
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
      porCategoria: porCategoria
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
