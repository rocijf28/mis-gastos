// Funciones y datos compartidos por las 4 páginas de la app (equivalente
// a "Utilidades.html" de la versión de Google Apps Script). Cada página
// carga primero el cliente de Supabase (CDN), luego config.js, luego
// este archivo, y por último su propio script.

var CATEGORIES = [
  { id: 'Alimentación', varName: '--cat-alimentacion' },
  { id: 'Transporte', varName: '--cat-transporte' },
  { id: 'Vivienda', varName: '--cat-vivienda' },
  { id: 'Servicios', varName: '--cat-servicios' },
  { id: 'Ocio', varName: '--cat-ocio' },
  { id: 'Salud', varName: '--cat-salud' },
  { id: 'Compras', varName: '--cat-compras' },
  { id: 'Suscripciones', varName: '--cat-suscripciones' },
  { id: 'Otros', varName: '--cat-otros' }
];

// Clasificación por defecto de cada categoría en "necesario" (vivienda,
// alimentación, salud, transporte, servicios...) o "prescindible" (lo
// que se puede recortar sin problema). Cada gasto puede saltarse esta
// regla individualmente con su propio "tipo_gasto" — ver NECESARIO_POR_DEFECTO.
var NECESARIO_POR_DEFECTO = {
  'Alimentación': true,
  'Transporte': true,
  'Vivienda': true,
  'Servicios': true,
  'Salud': true,
  'Otros': false,
  'Ocio': false,
  'Compras': false,
  'Suscripciones': false
};

// Lista de nombres de categorías (en el orden de CATEGORIES) que son
// "necesario" o "prescindible" por defecto — usado en la página Resumen
// para explicarle al usuario qué categorías entran en cada grupo.
function categoriasPorDefecto(tipo) {
  return CATEGORIES
    .filter(function (c) { return (NECESARIO_POR_DEFECTO[c.id] ? 'necesario' : 'prescindible') === tipo; })
    .map(function (c) { return c.id; })
    .join(', ');
}

// Métodos de pago para gastos/ingresos sueltos y para el desplegable de
// "Movimientos". "Domiciliación" no aparece aquí a propósito: solo tiene
// sentido para algo recurrente (ver METODOS_PAGO_FIJOS).
var METODOS_PAGO = ['Tarjeta', 'Efectivo', 'Bizum', 'Transferencia', 'Otro'];
// Métodos de pago para Gastos fijos e Ingresos fijos (recurrentes):
// añade "Domiciliación" al final de la lista general.
var METODOS_PAGO_FIJOS = METODOS_PAGO.concat(['Domiciliación']);

var FRECUENCIAS = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];
var MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

var catById = {};
CATEGORIES.forEach(function (c) { catById[c.id] = c; });

// --- Necesario / prescindible: tipo efectivo de un gasto ---
// tipoGasto es el valor guardado en la fila ('necesario'/'prescindible'/
// null); si es null, se usa la clasificación por defecto de su categoría.
function tipoEfectivo(categoria, tipoGasto) {
  if (tipoGasto === 'necesario' || tipoGasto === 'prescindible') return tipoGasto;
  return NECESARIO_POR_DEFECTO[categoria] ? 'necesario' : 'prescindible';
}

// --- Presupuesto mensual: solo lógica pura de umbrales/colores/mensajes.
// El cálculo de "cuánto llevas gastado" vive en data.js (getResumenActual /
// comprobarAvisosPresupuesto), que es quien conoce los totales reales. ---
var PRESUPUESTO_UMBRAL_AVISO = 0.8;

// Compara el gasto de "antes" y "después" de la acción que se acaba de
// hacer (añadir o editar un gasto) contra un límite, y dice si ESA
// acción concreta ha hecho cruzar hacia arriba el 80% o el 100% del
// límite. Solo avisa al subir (nunca al bajar un gasto o borrar uno),
// para no repetir el aviso cada vez que se recarga la página.
function cruzarUmbralPresupuesto(antes, despues, limite) {
  if (!limite || limite <= 0) return null;
  if (despues <= antes) return null;
  var umbralAviso = limite * PRESUPUESTO_UMBRAL_AVISO;
  if (antes < limite && despues >= limite) return 'pasado';
  if (antes < umbralAviso && despues >= umbralAviso) return 'aviso';
  return null;
}

function etiquetaPresupuesto(categoria) {
  return categoria ? 'en ' + categoria : 'del mes';
}

function mensajeAvisoPresupuesto(cruce, categoria, despues, limite) {
  var etiqueta = etiquetaPresupuesto(categoria);
  if (cruce === 'pasado') return 'Has superado tu presupuesto ' + etiqueta + ': ' + eur(despues) + ' de ' + eur(limite);
  if (cruce === 'aviso') return 'Vas al 80% de tu presupuesto ' + etiqueta + ': ' + eur(despues) + ' de ' + eur(limite);
  return '';
}

// Devuelve 'good' / 'warn' / 'bad' según qué fracción del límite llevas
// gastada — usado tanto para el color de las barras como, si hiciera
// falta, como clase CSS (ver --warn en styles.css).
function colorPresupuesto(fraccion) {
  if (fraccion >= 1) return 'bad';
  if (fraccion >= PRESUPUESTO_UMBRAL_AVISO) return 'warn';
  return 'good';
}

// --- Cliente de Supabase (una sola vez, compartido por toda la página) ---
var supabaseClient = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

// --- Formato ---
function eur(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatearFechaCorta(fechaISO) {
  var partes = (fechaISO || '').split('-');
  if (partes.length !== 3) return fechaISO || '';
  return partes[2] + '/' + partes[1] + '/' + partes[0];
}

function etiquetaMes(fechaISO) {
  // fechaISO: 'AAAA-MM-DD' (el primer día del mes, tal como lo devuelve Postgres)
  var partes = fechaISO.split('-');
  var anio = Number(partes[0]), mesIdx = Number(partes[1]) - 1;
  var etiqueta = MESES_ES[mesIdx] + ' de ' + anio;
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

function claveMes(fechaISO) {
  // 'AAAA-MM-DD' -> 'AAAA-M' (mes 0-indexado, como en la versión anterior)
  var partes = fechaISO.split('-');
  return Number(partes[0]) + '-' + (Number(partes[1]) - 1);
}

function inicioMesISO(date) {
  var d = date || new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-01';
}

function hoyISO() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// --- Avance de fecha según frecuencia (mismo criterio que
// procesar_gastos_fijos()/procesar_ingresos_fijos() en el servidor):
// usado en el navegador para confirmar el importe real de un gasto o
// ingreso fijo "variable" y calcular su siguiente fecha. ---
var MESES_POR_FRECUENCIA = { 'Mensual': 1, 'Trimestral': 3, 'Semestral': 6, 'Anual': 12 };

function avanzarFecha(fechaISO, frecuencia) {
  var partes = fechaISO.split('-').map(Number);
  var pasos = MESES_POR_FRECUENCIA[frecuencia] || 1;
  var d = new Date(partes[0], (partes[1] - 1) + pasos, partes[2]);
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// Cuenta cuántos periodos de retraso lleva un fijo "variable" (sin
// contar el que ya está pendiente de confirmar), solo para el aviso
// de "y N más pendientes después de este" — no inserta ni cambia nada.
function periodosDeRetraso(proximaFecha, frecuencia) {
  var cursor = avanzarFecha(proximaFecha, frecuencia);
  var hoy = hoyISO();
  var extra = 0;
  while (cursor <= hoy && extra < 24) {
    extra++;
    cursor = avanzarFecha(cursor, frecuencia);
  }
  return extra;
}

// --- Aviso flotante ---
function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function () { toast.classList.remove('show'); }, 2600);
}

// --- Selects reutilizables ---
function poblarSelectCategorias(select) {
  CATEGORIES.forEach(function (cat) {
    var opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.id;
    select.appendChild(opt);
  });
}
function poblarSelectFrecuencias(select) {
  FRECUENCIAS.forEach(function (f) {
    var opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });
}
function poblarSelectMetodos(select) {
  METODOS_PAGO.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
}
function poblarSelectMetodosFijos(select) {
  METODOS_PAGO_FIJOS.forEach(function (m) {
    var opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
}
function poblarSelectTipoGasto(select) {
  [
    { value: '', label: 'Automático según categoría' },
    { value: 'necesario', label: 'Necesario' },
    { value: 'prescindible', label: 'Prescindible' }
  ].forEach(function (o) {
    var opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  });
}

// --- Navegación: resalta la pestaña activa (la navegación en sí es un
// <a href> normal — al ser páginas estáticas ya no hace falta la
// navegación "sin recarga" que necesitaba Apps Script para disimular
// su lentitud) ---
function initNav() {
  var links = document.querySelectorAll('.nav-link');
  links.forEach(function (link) {
    link.classList.toggle('active', link.getAttribute('data-page') === PAGINA_ACTUAL);
  });
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      supabaseClient.auth.signOut().then(function () { window.location.href = 'login.html'; });
    });
  }
}

// --- Sesión: cada página (menos login.html) exige estar identificado.
// Devuelve una promesa con el usuario, o redirige a login.html. ---
function exigirSesion() {
  return supabaseClient.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) {
      window.location.href = 'login.html';
      return Promise.reject(new Error('sin sesión'));
    }
    return session.user;
  });
}

// --- Aviso de "Dinero inicial": obligatorio la primera vez (sin botón
// de cancelar), y reutilizable desde la página Resumen para corregirlo
// luego ---
var dineroInicialModal, dineroInicialInput, dineroInicialError,
  dineroInicialSaveBtn, dineroInicialCancelBtn, dineroInicialTitulo;

function initDineroInicialModal(alGuardar) {
  dineroInicialModal = document.getElementById('dineroInicialModal');
  if (!dineroInicialModal) return;
  dineroInicialInput = document.getElementById('dineroInicialInput');
  dineroInicialError = document.getElementById('dineroInicialError');
  dineroInicialSaveBtn = document.getElementById('dineroInicialSaveBtn');
  dineroInicialCancelBtn = document.getElementById('dineroInicialCancelBtn');
  dineroInicialTitulo = document.getElementById('dineroInicialTitulo');

  dineroInicialCancelBtn.addEventListener('click', function () {
    dineroInicialModal.hidden = true;
  });

  dineroInicialSaveBtn.addEventListener('click', function () {
    var importe = parseFloat(dineroInicialInput.value);
    if (dineroInicialInput.value === '' || isNaN(importe) || importe < 0) {
      dineroInicialError.textContent = 'Escribe un importe válido (puede ser 0).';
      return;
    }
    dineroInicialError.textContent = '';
    dineroInicialSaveBtn.disabled = true;
    dineroInicialSaveBtn.textContent = 'Guardando…';

    setDineroInicial(importe)
      .then(function () {
        dineroInicialModal.hidden = true;
        showToast('Dinero inicial guardado');
        if (typeof alGuardar === 'function') alGuardar(importe);
      })
      .catch(function (err) {
        dineroInicialError.textContent = err.message || 'No se pudo guardar. Inténtalo de nuevo.';
      })
      .then(function () {
        dineroInicialSaveBtn.disabled = false;
        dineroInicialSaveBtn.textContent = dineroInicialModal.dataset.pendiente === '1' ? 'Empezar' : 'Guardar';
      });
  });
}

// pendiente=true → aviso obligatorio (primera vez, sin botón de cancelar).
// pendiente=false + valorActual → modo "corregir" (desde la página Resumen).
function mostrarDineroInicialModal(pendiente, valorActual) {
  if (!dineroInicialModal) return;
  dineroInicialModal.dataset.pendiente = pendiente ? '1' : '0';
  dineroInicialCancelBtn.hidden = pendiente;
  dineroInicialTitulo.textContent = pendiente ? '¿De cuánto partes?' : 'Corregir dinero inicial';
  dineroInicialSaveBtn.textContent = pendiente ? 'Empezar' : 'Guardar';
  dineroInicialInput.value = (!pendiente && typeof valorActual === 'number') ? valorActual.toFixed(2) : '';
  dineroInicialError.textContent = '';
  dineroInicialModal.hidden = false;
}
