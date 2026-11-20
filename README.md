Actúa como un desarrollador Full-Stack y diseñador UI/UX experto en plataformas deportivas. Necesito crear una aplicación web sencilla, moderna y totalmente responsiva (mobile-first) para el equipo de fútbol base **Latino Kukuki Salamanca** (categoría **Prebenjamín - 3ª División**).

### 1. Identidad Visual y Diseño (UI/UX)
- **Estilo:** Sencillo, limpio, intuitivo y amigable, pensado para que los padres, familiares y seguidores del equipo puedan consultarlo rápidamente desde el móvil.
- **Colores y Estética:** Utiliza la identidad visual del club **Latino Kukuki Salamanca** (define variables CSS fáciles de ajustar para el color primario, secundario y de acento según el escudo/equipación oficial del club, con alto contraste y buena legibilidad).
- **Estructura de la página (Single Page App con pestañas o secciones claras):**
  1. **Cabecera (Hero):** Escudo/logo del club, nombre "Latino Kukuki Salamanca", categoría "Prebenjamín 3ª División" y un indicador del próximo partido destacado (rival, fecha, hora y campo).
  2. **Clasificación:** Tabla limpia destacando la fila del *Latino Kukuki Salamanca* con posición, puntos, partidos jugados, ganados, empatados, perdidos y diferencia de goles.
  3. **Resultados y Calendario:** Lista de jornadas con los partidos disputados (mostrando el marcador final) y los próximos encuentros (fecha, hora y lugar). Permite filtrar por "Todos los partidos" o "Solo Latino Kukuki".
  4. **Pie de página:** Enlace directo a la fuente oficial de la Real Federación de Castilla y León de Fútbol (RFCYLF) y fecha/hora de la última actualización de datos.

### 2. Extracción de Datos (Web Scraping)
Crea un script/endpoint backend (en Node.js con Cheerio/Puppeteer o Python con BeautifulSoup) que extraiga automáticamente los datos actualizados desde la siguiente URL oficial de la RFCYLF:
`https://www.rfcylf.es/pnfg/NPcd/NFG_VisCompeticiones_Grupo?&cod_primaria=1000123&codequipo=22910498&codgrupo=24219190`

**Requisitos técnicos del scraper:**
- Debe extraer: la tabla de clasificación completa, los resultados de las jornadas jugadas y el calendario de los próximos partidos (fecha, hora, equipo local, equipo visitante, resultado y campo de juego).
- Implementa un sistema de **caché** (por ejemplo, que actualice los datos cada 6 o 12 horas, o mediante un botón manual de "Actualizar") para evitar hacer peticiones excesivas al servidor de la federación y garantizar que la web cargue al instante.
- Maneja posibles errores de conexión o cambios en el HTML mostrando los últimos datos guardados en caché si la web de la federación está caída.

### 3. Entregables
1. Código completo del **Frontend** (HTML/CSS/JS o React/Next.js con Tailwind CSS) con datos de ejemplo (*mock data*) cargados inicialmente para visualizar el diseño al momento.
2. Código del **Backend / API** con el scraper funcional adaptado a la estructura HTML de la RFCYLF.
3. Instrucciones breves sobre dónde colocar el escudo del club y cómo ajustar los códigos hexadecimales de los colores si es necesario.