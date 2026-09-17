# Mis Gastos — versión Supabase

App de gestión de gastos personales, con Supabase como base de datos
(Postgres + Auth + Row Level Security) y el frontend como una web
estática de páginas HTML/JS/CSS planas — sin build, sin framework —
pensada para alojarse gratis en GitHub Pages, Vercel o Netlify.

Repositorio real: `github.com/rocijf28/mis-gastos`, publicado en
`https://rocijf28.github.io/mis-gastos/` vía GitHub Pages.

## 1. Qué hay en esta carpeta

**Páginas de la app** (todas exigen sesión iniciada, salvo las dos primeras):
- `login.html` — pantalla de entrada (email + contraseña).
- `crear-contrasena.html` — pantalla a la que llega quien acepta una
  invitación por correo, para elegir su propia contraseña.
- `registro.html` — página **Registrar**: formulario de gasto/ingreso
  puntual, y la tarjeta de configuración del **Presupuesto mensual**
  (total y por categoría). Antes se llamaba `index.html`; ese nombre
  ya no tenía sentido una vez que dejó de ser la única pantalla, así
  que ahora `index.html` es solo una redirección automática hacia
  `registro.html` (se mantiene porque GitHub Pages sirve siempre
  `index.html` en la URL raíz del sitio, y porque los accesos directos
  de la app instalada como PWA apuntan ahí).
- `movimientos.html` — página **Movimientos**: últimos 20 gastos e
  ingresos, con editar y borrar, y un buscador plegable ("Buscar
  movimientos") por encima del listado con filtros por texto libre,
  tipo (gasto/ingreso), categoría, método de pago, necesario/
  prescindible, rango de fechas y rango de importe — se puede combinar
  cualquier número de filtros a la vez.
- `gastos-fijos.html` — página **Gastos fijos**: una tarjeta separada
  para añadir/editar, y otra con la lista plegable ("Ver mis gastos
  fijos") con filtros ligeros del lado del cliente, más la
  confirmación de importe para los gastos fijos marcados como
  "variables" (luz, agua...).
- `ingresos-fijos.html` — página **Ingresos fijos**: misma estructura
  que Gastos fijos (tarjeta de añadir/editar separada de la de ver/
  filtrar), para ingresos recurrentes (nómina y similares).
- `resumen.html` — página **Resumen**: tarjetas del mes, saldo total,
  necesario vs. prescindible, gasto por categoría, evolución mensual, y
  la barra de progreso del presupuesto (solo informativa — configurar
  el presupuesto se hace desde Registrar).
- `anomalias.html` — página **Anomalías**: compara cada gasto fijo con
  su propio historial y avisa si el último importe se desvía mucho de
  lo habitual.

En pantallas de PC (≥900px de ancho) el contenido de estas páginas se
reparte en dos columnas; por debajo de ese ancho (móvil) se ve igual
que siempre, en una sola columna vertical.

**Archivos compartidos:**
- `app.js` — utilidades comunes: formato de moneda/fecha, categorías y
  sus colores, métodos de pago, frecuencias (`Semanal`, `Mensual`,
  `Trimestral`, `Semestral`, `Anual`), sesión (`exigirSesion()`), el
  modal de "Dinero inicial", y la lógica de umbrales del presupuesto
  (`cruzarUmbralPresupuesto`, `colorPresupuesto`).
- `data.js` — toda la capa de datos: cada función hace una llamada a
  Supabase (leer, guardar, editar, borrar gastos/ingresos/fijos/
  presupuesto/perfil), incluida `buscarMovimientos(filtros)` para el
  buscador de la página Movimientos.
- `config.js` — la URL y la clave `anon` de tu proyecto de Supabase.
- `styles.css` — todo el diseño visual (modo claro/oscuro, feedback al
  pulsar botones, barras de progreso, el diseño de dos columnas en PC,
  etc.).
- `manifest.webmanifest` + `icons/` (`icon-180.png`, `icon-192.png`,
  `icon-512.png`) — para poder "instalar" la app (PWA) en Windows,
  Android e iPhone.
- `manual-uso.html` / `manual-uso.pdf` — manual de uso para la persona
  que vaya a usar la app (sin aspectos técnicos).

**SQL** (en la raíz del proyecto; ejecutar en Supabase → SQL Editor, en
este orden si partes de cero; si tu proyecto ya está en marcha, estos
archivos son referencia de lo que ya existe — o los que te falten por
ejecutar):
- `001_schema.sql` — tablas base: `gastos`, `ingresos`, `gastos_fijos`,
  `ingresos_fijos_mensuales` (en desuso, ver `004`), `perfil`, con su
  Row Level Security.
- `002_views_and_automations.sql` — trigger de alta automática de
  `perfil` al crear un usuario, la vista `resumen_mensual`, y las
  funciones + tarea programada (`pg_cron`, 6:00 UTC) que procesan
  gastos fijos e ingresos fijos cada día.
- `004_modificaciones_v2.sql` — añade `gastos_fijos.variable`/
  `tipo_gasto`, `gastos.gasto_fijo_id`/`tipo_gasto`, la tabla
  `ingresos_fijos` (sustituye a `ingresos_fijos_mensuales`),
  `ingresos.ingreso_fijo_id`/`metodo_pago`, y reescribe
  `resumen_mensual` y las funciones de `002` para tenerlo en cuenta.
- `005_presupuestos.sql` — añade `perfil.presupuesto_mensual` y la
  tabla `presupuestos_categoria` (un límite opcional por categoría).
- `006_seguridad_funciones.sql` — refuerzo de seguridad en las
  funciones `security definer` (fija `search_path` explícitamente,
  para que no se puedan manipular con esquemas falsos).
- `007_restricciones_valores.sql` — restricciones (`check`) en
  `categoria`, `frecuencia` y `metodo_pago` de `gastos`, `gastos_fijos`,
  `ingresos`, `ingresos_fijos` y `presupuestos_categoria`, para que la
  base de datos rechace cualquier valor que la app nunca produciría
  (aunque alguien llame a la API de Supabase directamente).
- `008_frecuencia_semanal.sql` — añade `'Semanal'` como frecuencia
  válida (hasta ahora solo se admitían Mensual/Trimestral/Semestral/
  Anual) y corrige `procesar_gastos_fijos()`/`procesar_ingresos_fijos()`
  para que un fijo semanal avance de verdad 7 días en cada cobro, en
  vez de tratarlo como si fuera mensual.

## 2. Arquitectura

- **Backend:** Supabase (Postgres + Auth + RLS). El frontend llama
  directamente a la API REST de Supabase con la clave `anon` (pública
  por diseño: la protección real es Row Level Security — cada persona
  solo ve y toca sus propias filas).
- **Autenticación:** Supabase Auth (email + contraseña). El alta
  pública está desactivada a propósito: solo entra quien tenga un
  usuario creado desde el panel de Supabase, bien a mano o por
  invitación (ver punto 6).
- **Tablas:** `gastos`, `ingresos` (puntuales), `gastos_fijos`,
  `ingresos_fijos` (recurrentes), `perfil` (dinero inicial, nómina
  base, presupuesto mensual — una fila por usuario),
  `presupuestos_categoria` (límites opcionales por categoría).
- **Frecuencias de gastos/ingresos fijos:** `Semanal`, `Mensual`,
  `Trimestral`, `Semestral` o `Anual`.
- **Métodos de pago:** `Tarjeta`, `Efectivo`, `Bizum`, `Transferencia`,
  `Otro` para gastos/ingresos puntuales; para gastos/ingresos fijos se
  añade además `Domiciliación` (justo antes de `Otro` en el
  desplegable), pensado para recibos domiciliados.
- **Vista `resumen_mensual`:** una fila por cada mes con algún dato
  (nunca hay que "estirarla" con meses futuros), separando ingresos
  fijos de puntuales, con el gasto y el ahorro de ese mes.
- **Automatización diaria (`pg_cron`, 6:00 UTC):** añade a `gastos` los
  cargos fijos cuya `proxima_fecha` ya llegó (saltando los marcados
  como "variables", que esperan confirmación manual del importe) y
  hace lo mismo para `ingresos` desde `ingresos_fijos`.
- **Presupuesto:** un único valor de presupuesto total (opcional) y,
  opcionalmente, un límite por categoría — sin histórico mes a mes: se
  aplican a todos los meses hasta que se cambien a mano. Aviso tipo
  toast al cruzar el 80% y el 100% de cualquiera de los dos, y barra de
  progreso permanente en Resumen (verde/ámbar/rojo).
- **Búsqueda de movimientos:** `buscarMovimientos(filtros)` construye
  la consulta a Supabase combinando solo los filtros que se hayan
  rellenado (texto, tipo, categoría, método de pago, necesario/
  prescindible, fechas e importes), sin necesidad de traer todos los
  movimientos al navegador para filtrarlos ahí.
- **Diseño responsive:** una sola hoja de estilos (`styles.css`) con un
  punto de corte en 900px: por debajo se ve todo en una columna
  (como el diseño original, pensado para móvil), y a partir de ahí el
  contenido de cada página se reparte en dos columnas fijas. Las
  pantallas de entrar/crear contraseña se mantienen siempre estrechas
  y centradas, en cualquier tamaño.

## 3. Seguridad

Row Level Security es la protección real de los datos (cada usuario
solo puede leer/escribir sus propias filas), pero además:

- **Sin `innerHTML` con datos del usuario:** las notas, conceptos y
  demás texto que escribe cada persona se insertan siempre con
  `textContent`/`document.createElement`, nunca concatenando HTML — así
  un texto como `<img src=x onerror=...>` se ve tal cual (como texto),
  en vez de ejecutarse.
- **Restricciones en la base de datos** (`007_restricciones_valores.sql`,
  `008_frecuencia_semanal.sql`): categoría, frecuencia y método de pago
  solo aceptan los valores que la app realmente ofrece, aunque alguien
  llame a la API de Supabase directamente con su propia sesión.
- **`search_path` fijo** en las funciones `security definer`
  (`006_seguridad_funciones.sql`), para que no se puedan engañar con un
  esquema falso.
- **Content-Security-Policy** en todas las páginas (etiqueta `<meta
  http-equiv="Content-Security-Policy">`): solo permite cargar scripts
  y estilos desde este mismo sitio, `cdn.jsdelivr.net` (el cliente de
  Supabase) y Google Fonts, y bloquea `object`/plugins.
- **Recomendación pendiente:** activar la verificación en dos pasos
  (2FA) en la cuenta de Supabase (Authentication → tu cuenta), como
  capa extra de protección del panel de administración. Si no se
  activa, conviene al menos usar ahí una contraseña larga y única.

## 4. Configurar Supabase (una sola vez, proyecto nuevo)

1. Abre tu proyecto en [supabase.com](https://supabase.com/dashboard) → **SQL Editor**.
2. Ejecuta, en este orden: `001_schema.sql`, `002_views_and_automations.sql`, `004_modificaciones_v2.sql`, `005_presupuestos.sql`, `006_seguridad_funciones.sql`, `007_restricciones_valores.sql` y `008_frecuencia_semanal.sql`.
3. **Crea tu usuario:** en el panel de Supabase, ve a **Authentication → Users → Add user**, escribe tu correo y una contraseña, y guarda. El trigger del paso 2 te crea automáticamente tu fila de `perfil`.
4. Por seguridad (es una app de datos financieros personales), en **Authentication → Providers → Email** desactiva "Allow new users to sign up" — así nadie puede crearse una cuenta desde `login.html`; solo entra quien tenga un usuario creado por ti.
5. Si vas a invitar a otras personas más adelante, configura también la Site URL (ver punto 7) antes de mandar la primera invitación.

No hace falta tocar nada más en Supabase después de esto: la app ya habla directamente con tu base de datos desde el navegador.

## 5. Subir esto a GitHub

Desde esta misma carpeta:

```bash
git init
git add .
git commit -m "Mis Gastos: versión Supabase"
git branch -M main
git remote add origin <URL-de-tu-repositorio-en-GitHub>
git push -u origin main
```

## 6. Publicar la app (elige una opción, las tres son gratis)

**GitHub Pages** (la que usa Rocío):
1. En el repositorio → **Settings → Pages**.
2. En "Build and deployment", elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Guarda. En un par de minutos tendrás una URL del tipo `https://tu-usuario.github.io/tu-repositorio/`. GitHub Pages sirve automáticamente `index.html` para esa URL raíz, que redirige a `registro.html` (ver punto 1).

**Vercel** o **Netlify** (alternativa):
1. Crea una cuenta gratuita y conecta tu repositorio de GitHub.
2. Como es una web estática (sin build), deja el comando de compilación vacío y el directorio de publicación como la raíz del proyecto.
3. Despliega — cada vez que subas cambios a GitHub se actualiza sola.

Con cualquiera de las tres, esa URL ya es tu app completa, instalable como PWA (el navegador ofrece "Instalar app" / "Añadir a pantalla de inicio" en Windows, Android e iPhone).

## 7. Invitar a familiares o amigos (cada uno con su propia contraseña)

1. En Supabase → **Authentication → URL Configuration**: pon como "Site URL" `https://tu-usuario.github.io/tu-repositorio/crear-contrasena.html`, y añade esa misma URL a "Redirect URLs".
2. Para invitar a alguien: **Authentication → Users → Invite user**, con su correo. Le llega un email con un enlace de un solo uso que le lleva a `crear-contrasena.html`, donde elige su propia contraseña; al guardarla entra directa a `registro.html`, con su propio perfil vacío (le preguntará su "Dinero inicial" la primera vez, igual que a ti).
3. Cada persona invitada ve y gestiona solo sus propios datos (Row Level Security) desde la misma app y la misma base de datos — no hace falta un despliegue distinto por persona.

## 8. Entrar por primera vez

1. Abre la URL publicada → te llevará a `login.html`.
2. Entra con el correo y la contraseña de tu usuario.
3. La primera vez te preguntará "¿De cuánto partes?" (el dinero
   inicial); se puede corregir después desde Resumen.

## 9. Si algún día quieres rotar la clave `anon`

Si regeneras la clave `anon` desde el panel de Supabase (Settings →
API), actualiza el valor de `anonKey` en `config.js` y vuelve a subir
ese archivo — no hay que tocar nada más.
