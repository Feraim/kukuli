# Web del C.D. Latino Kukuli — instrucciones

## Publicar en GitHub Pages (recomendado)

La tarea automática `.github/workflows/web.yml` descarga los datos de la federación
4 veces por semana (domingo 21:00, lunes 12:00, miércoles 20:00 y viernes 20:00) y
publica la web. No hace falta tener ningún ordenador encendido.

**Primera vez:**
1. Instala **GitHub Desktop** (desktop.github.com) e inicia sesión con tu cuenta de GitHub.
2. *File → Add local repository* → elige `C:\Users\w\Documents\kukuli`.
3. Abajo a la izquierda escribe un resumen (p. ej. "Primera versión") y pulsa **Commit to main**.
4. Pulsa **Publish repository**. Desmarca *Keep this code private* (Pages gratis necesita repositorio público).
5. En github.com, abre tu repositorio → **Settings → Pages** → en *Source* elige **GitHub Actions**.
6. Pestaña **Actions** → **Actualizar y publicar web** → **Run workflow**.
   En 1-2 minutos la web estará en `https://TU-USUARIO.github.io/kukuli/`
   (la dirección exacta aparece en *Settings → Pages*).

**Para cambiar algo** (jugadores, noticias, colores…): edita los archivos, y en GitHub Desktop
pulsa primero **Fetch origin / Pull origin** (trae los datos nuevos que guarda la tarea automática),
luego **Commit** y **Push origin**. La web se vuelve a publicar sola en 1-2 minutos.

**Opcional — identificarse ante la federación:** en *Settings → Secrets and variables → Actions →
Variables* crea la variable `CONTACTO` con el correo del club. Se envía en cada petición para que
la federación pueda contactar en vez de bloquear.

> GitHub desactiva las tareas programadas si un repositorio pasa 60 días sin actividad.
> Si un día deja de actualizarse, entra en *Actions* y vuelve a activarla.

## Aparecer en Google ("latino kukuli benjamín", "kukuli benjamín")

La web ya lleva todo lo que Google usa para entenderla: título y descripción con esas
palabras, datos estructurados del equipo, texto en la página, `sitemap.xml` y `robots.txt`
(estos dos y la dirección canónica se generan solos al publicar, con la dirección real).

Para que Google la encuentre antes (sin esto puede tardar semanas):
1. Entra en **search.google.com/search-console** con tu cuenta de Google → **Añadir propiedad**
   → tipo **Prefijo de la URL** → pega la dirección de la web (`https://TU-USUARIO.github.io/kukuli/`).
2. Método **Etiqueta HTML**: copia solo el código de `content="…"`.
3. En GitHub: *Settings → Secrets and variables → Actions → Variables* → **New repository variable**:
   nombre `GOOGLE_VERIFICATION`, valor el código. Luego *Actions → Run workflow*.
4. Vuelve a Search Console y pulsa **Verificar**. Después, en **Sitemaps**, envía `sitemap.xml`,
   y en **Inspección de URLs** pega la dirección y pulsa **Solicitar indexación**.

Lo que más ayuda a salir el primero: **enlaces a la web** desde el Instagram/Facebook del club
(en la biografía), grupos de familias y la web de la federación o del club si la tiene.

## Arrancar en tu ordenador

Solo hace falta **Python 3.9+** (no hay que instalar nada con pip):

```bash
python backend/server.py
```

Abre http://localhost:8000. Desde el móvil, en la misma wifi: `http://IP-DEL-PC:8000`.

Si abres `frontend/index.html` directamente (doble clic), la web funciona con los
datos de ejemplo de `frontend/mock-data.js`.

## Estructura

```
backend/scraper.py   Scraper de la RFCYLF (librería estándar de Python)
backend/server.py    Servidor: sirve la web + API /api/data y /api/refresh con caché
data/cache.json      Últimos datos descargados (se reescribe en cada actualización)
backend/seo.py       Prepara la web para Google al publicar (sitemap, robots, canónica)
frontend/            Web (index.html, styles.css, app.js, mock-data.js, img/)
```

## Cómo funcionan los datos

- La caché dura **6 horas** (`CACHE_TTL_HOURS`). Pasado ese tiempo, la siguiente
  visita lanza una actualización en segundo plano y muestra al instante lo guardado.
- El botón **"Actualizar datos"** fuerza la actualización, como mucho una vez
  cada 10 minutos (`MIN_REFRESH_MINUTES`).
- Si la federación está caída o cambia su HTML, se siguen mostrando los últimos
  datos guardados, con un aviso.
- **La federación bloquea temporalmente la IP si recibe muchas peticiones seguidas.**
  Por eso el scraper es incremental: las jornadas ya completas no se vuelven a pedir,
  espera 10 s entre peticiones y hace como máximo 6 por actualización. Si detecta
  un bloqueo, el servidor local no reintenta hasta pasadas 6 h (12 h, 24 h… si se repite). Lo que falte
  se completa en las siguientes actualizaciones.
- La federación **no publica la tabla de clasificación** de esta categoría, así que se
  calcula con los resultados oficiales de cada jornada (3 pts victoria, 1 empate).
  En la cabecera, la posición/estadísticas del equipo salen de la fila oficial de la ficha.

Variables de entorno opcionales: `PORT`, `CACHE_TTL_HOURS`, `MIN_REFRESH_MINUTES`.
Actualizar a mano desde terminal: `python backend/scraper.py data/cache.json`.

## Escudo

Pon el escudo en `frontend/img/escudo.jpg` (cuadrado, mínimo 200×200 px; PNG con
fondo transparente también vale: cambia la extensión en `index.html` y en
`localCrest` dentro de `frontend/app.js`). El actual es el que tiene la federación.

## Colores

Al principio de `frontend/styles.css`:

```css
--color-primary: #e2007a;       /* rosa del escudo: botones y destacados */
--color-primary-dark: #b30061;  /* hover y enlaces */
--color-secondary: #111111;     /* negro: cabecera */
--color-accent: #ffd6ea;        /* rosa claro: fila y partidos destacados */
```

## Otro equipo o temporada

En `backend/scraper.py` cambia `COD_EQUIPO` y `COD_GRUPO` (están en la URL de la ficha
del equipo en la RFCYLF). En `frontend/app.js`, `CONFIG.displayName` y `CONFIG.teamMatch`.
