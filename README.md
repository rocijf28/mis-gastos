# Mis Gastos — Supabase

Migración de la app "Mis Gastos" (antes en Google Apps Script + Google
Sheets) a Supabase como base de datos, con la misma interfaz de 4
páginas (Registrar, Movimientos, Gastos fijos, Resumen) servida ahora
como una web estática — pensada para alojarse gratis en GitHub Pages,
Vercel o Netlify.

## 1. Qué hay en esta carpeta

- `index.html`, `movimientos.html`, `gastos-fijos.html`, `resumen.html` — las 4 páginas de la app.
- `login.html` — pantalla de entrada (email + contraseña).
- `app.js` — utilidades compartidas (formato de moneda, categorías, sesión...).
- `data.js` — todas las llamadas a Supabase (el equivalente al `Code.gs` de antes).
- `config.js` — la URL y la clave `anon` de tu proyecto de Supabase.
- `styles.css` — el mismo diseño visual de siempre.
- `manifest.webmanifest` + `icons/` — para poder "instalar" la app (PWA), igual que antes.
- `sql/001_schema.sql` — las tablas que ya creaste en Supabase (se guarda aquí solo como referencia).
- `sql/002_views_and_automations.sql` — **hay que ejecutar este archivo una vez** (ver paso 2).

## 2. Configurar Supabase (una sola vez)

1. Abre tu proyecto en [supabase.com](https://supabase.com/dashboard) → **SQL Editor**.
2. Pega y ejecuta el contenido completo de `sql/002_views_and_automations.sql`.
   Esto añade:
   - Que se te cree automáticamente una fila de "perfil" (dinero inicial / nómina base) al crear tu usuario.
   - Una vista `resumen_mensual` que calcula solo, mes a mes, tus ingresos, gastos y ahorro.
   - Las funciones que procesan los **gastos fijos** (los añade a "Gastos" cuando toca) y la **nómina** (rellena el mes si se te olvida), y una tarea programada que las ejecuta cada día a las 6:00.
3. **Crea tu usuario** (si no lo has hecho ya): en el panel de Supabase, ve a **Authentication → Users → Add user**, escribe tu correo y una contraseña, y guarda. Con esa fila creada, el trigger del paso 2 te crea automáticamente tu perfil.
4. Por seguridad (es una app de datos personales), en **Authentication → Providers → Email** desactiva "Allow new users to sign up" — así nadie más puede crearse una cuenta desde `login.html`; solo entra quien tenga un usuario creado por ti desde el panel.

No hace falta tocar nada más en Supabase después de esto — la app ya habla directamente con tu base de datos desde el navegador (protegida por Row Level Security: cada usuario solo ve y toca sus propias filas).

## 3. Subir esto a GitHub

Desde esta misma carpeta:

```bash
git init
git add .
git commit -m "Mis Gastos: migración a Supabase"
git branch -M main
git remote add origin <URL-de-tu-repositorio-vacío-en-GitHub>
git push -u origin main
```

(Sustituye `<URL-de-tu-repositorio-vacío-en-GitHub>` por la URL del repositorio que crees en GitHub.)

## 4. Publicar la app (elige una opción, las tres son gratis)

**GitHub Pages** (la más sencilla si el repositorio ya está en GitHub):
1. En el repositorio → **Settings → Pages**.
2. En "Build and deployment", elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Guarda. En un par de minutos tendrás una URL del tipo `https://tu-usuario.github.io/tu-repositorio/`.

**Vercel** o **Netlify** (alternativa, con dominio algo más corto):
1. Crea una cuenta gratuita y conecta tu repositorio de GitHub.
2. Como es una web estática (sin build), deja el comando de compilación vacío y el directorio de publicación como la raíz del proyecto.
3. Despliega — te dan una URL al momento, y cada vez que subas cambios a GitHub se actualiza sola.

Con cualquiera de las tres, esa URL ya es tu app completa. Ábrela en el móvil o el ordenador y el navegador ofrecerá "Instalar app" / "Añadir a pantalla de inicio", igual que con la versión de Apps Script.

## 5. Entrar por primera vez

1. Abre la URL publicada → te llevará a `login.html`.
2. Entra con el correo y la contraseña que le pusiste a tu usuario en el paso 2.3.
3. La primera vez te preguntará "¿De cuánto partes?" (el dinero inicial), igual que antes.

## 6. Diferencias con la versión de Apps Script (todo a mejor)

- **No hace falta "Nueva versión" ni volver a ejecutar `configurarHoja`.** Cambiar el código es simplemente editar estos archivos y subirlos a GitHub — el sitio se actualiza solo.
- **La tabla de "evolución mensual" ya no hay que "estirarla" con meses futuros**: la vista `resumen_mensual` solo calcula los meses que de verdad tienen algún dato, así que no hay mantenimiento ninguno.
- **Editar/borrar un movimiento o un gasto fijo ya no depende del número de fila**: cada uno tiene un identificador propio en la base de datos, así que es más fiable que antes.
- Los gastos fijos y la nómina se siguen procesando solos cada día a las 6:00 (ahora vía Supabase, con `pg_cron`, en vez del disparador de Apps Script).

## 7. Si algún día quieres rotar la clave `anon`

Si por lo que sea regeneras la clave `anon` desde el panel de Supabase (Settings → API), solo tienes que actualizar el valor de `anonKey` en `config.js` y volver a subir ese archivo — no hay que tocar nada más.
