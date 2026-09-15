// Funciones y datos compartidos por las 4 páginas de la app (equivalente
// a "Utilidades.html" de la versión de Google Apps Script). Cada página
// carga primero el cliente de Supabase (CDN), luego config.js, luego
// este archivo, y por último su propio script.

var CATEGORIES = [
  { id: 'Alimentación', varName: '--cat-alimentacion' },
  { id: 'Transporte', varName: '--cat-transporte' },
  { id: 'Vivienda', varName: '--cat-vivienda' },
  { id: 'Ocio', varName: '--cat-ocio' },
  { id: 'Salud', varName: '--cat-salud' },
  { id: 'Compras', varName: '--cat-compras' },
  { id: 'Suscripciones', varName: '--cat-suscripciones' },
  { id: 'Otros', varName: '--cat-otros' }
];
var METODOS_PAGO = ['Tarjeta', 'Efectivo', 'Bizum', 'Otro'];
var FRECUENCIAS = ['Mensual', 'Trimestral', 'Semestral', 'Anual'];
var MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

var catById = {};
CATEGORIES.forEach(function (c) { catById[c.id] = c; });

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
