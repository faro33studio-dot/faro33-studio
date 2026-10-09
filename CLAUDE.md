# Faro 33 Studio — faro33studio.com

Sitio estático (GitHub Pages, dominio `faro33studio.com`, deploy = push a `main`).
Interiorismo en Culiacán. Objetivo comercial: leads por WhatsApp y ticket promedio alto.

## Mapa del sitio

| URL | Rol |
|---|---|
| `/` | Home: hero → **Explora por espacio** (6 tiles → `/proyectos/?espacio=…`) → Servicios (2 cards) → **slider Especialidades** → **directorio de servicios (strip)** → Proyectos → banda parallax → Manifiesto → Proceso (timeline) → Estudio (stats) → FAQ → Contacto → Footer |
| `/proyecto-integral/` | Qué es un proyecto integral (del brochure): punto de partida, comparación, alcance, 7 pasos, rangos de inversión con IVA (sección `#inversion`, se puede quitar completa), FAQ + FAQPage. Destino de "Interiorismo integral" en menú, strip, footer, slide y serv-card |
| `/cocinas/` `/centros-de-entretenimiento/` `/acabados-de-pared/` | Landings de servicio (SEO + Meta Ads) |
| `/acabados-de-pared/#negocios` | Ángulo comercial (muros para negocios) |
| `/centros-de-entretenimiento/configurador/` | Configurador 2D (SVG acotado: muro, consola, TV con panel flotante opcional, torres, acabados atrás) → WhatsApp con las medidas + enlace 3D. La URL guarda el diseño (`#d=…`) y se restaura al cargar. **Reglas de las torres** (según las fotos de referencia del cliente): repisas abiertas; `towerMount` `lado` = desde el piso junto a la consola (`towerOffset` = separación de la consola) · `sobre` = apoyada en la cubierta en un extremo (`towerOffset` = la recorre hacia el centro). **Luz** sólo dentro de las torres (LED bajo cada repisa + fondo) y detrás del panel de TV (halo); nunca bajo la consola ni en el canto exterior de la torre. **Acabados atrás** (`panels`, máx. 3): franjas a todo lo alto de lambrín (4 tonos), mármol, piedra o papel, cada una con ancho y posición |
| `/centros-de-entretenimiento/maqueta/` | Maqueta 3D animada (Three.js): Día · Cine · Reunión · Noche + vistas Carpintería y Planta. Sin hash = modelo de muestra (`DESIGN` en `scene.js`); con `#d=…` = el diseño del cliente (guion de `buildSteps`). `wallLayout()` replica `computeLayout()` del configurador: si cambia una regla de geometría, cambiarla en ambos. Depurar con `?debug&paso=N` o `?debug&vista=planta` |
| `/centros-de-entretenimiento/diseno.js` | Esquema compartido configurador ↔ maqueta: rangos (deben coincidir con los `<input type="range">`), nombres, `encode/decode/fromHash`. Todo lo que llega por URL se sanea aquí. Migra enlaces viejos ya compartidos: `towerStart` → `towerMount`, `wallFinish` → un acabado en `panels` a todo el muro |
| `/proyectos/` | **Índice de proyectos** con filtros por espacio (`?espacio=casa|sala|cocina|recamara|bano|tv|muros|comercial`); tarjetas = 4 casos + showcases de servicios |
| `/nosotros/` | Acerca de + mapa (pin verificado 24.8172379,-107.3883888) |
| `/casa-en-la-colina/` `/casa-quintas/` `/un-rincon-cerca-del-cielo/` `/un-pedacito-de-cielo/` | Proyectos (con bloque `.proj-next`: CTA WhatsApp específico + anterior/siguiente en ciclo rincón→colina→quintas→pedacito) |
| `/caso-oshio/` | **Ejemplo de proyecto comercial (octubre 2026)**: restaurante de 190 m², diseñado en Claude Design. Debe verse siempre como EJEMPLO (insignia dorada en el hero, banda bajo el hero, insignia en el cierre, etiqueta en tarjetas del home, `/proyectos/` y `related`). Ciclo: pedacito → oshio → rincón |
| `/cocina-oxford/` | Cocina de Un rincón cerca del cielo en página propia (barra de granito, jerarquía 90/75 cm, materiales). Se enlaza desde `/cocinas/#oxford`, la página del proyecto, `/proyectos/` (filtro cocina), menú y `related`; "siguiente" = el proyecto completo |
| `/rincon-de-delicias/` | Caso de cocina pequeña de costo contenido (render vs. entregada, galería, materiales). Fuera del ciclo anterior/siguiente; se enlaza desde `/cocinas/#delicias`, `/proyectos/` (filtro cocina), menú y `related` |
| `/contacto/` | Puente a WhatsApp para ads (noindex) |
| `/aviso-de-privacidad/` | Aviso de privacidad integral + cookies (enlazado desde pies, menú y barra de cookies) |

## ⚠️ Checklist: agregar un NUEVO SERVICIO (seguir en orden, sin excepciones)

1. Crear `/<slug>/index.html` **copiando la estructura de `/acabados-de-pared/`** (es la plantilla más completa: GA4, Pixel con `ViewContent`, JSON-LD LocalBusiness+Breadcrumb+FAQPage, fuentes compartidas de `/assets/home/*.woff2`, reveals, skip-link, related-projects, FAB).
2. **`/assets/menu.js`**: añadir la entrada al array `MENU` (menú lateral universal — presente en las 9 páginas; UNA edición cubre toda la navegación entre páginas).
3. Home — **3 puntos de entrada obligatorios**:
   a. Slide en el slider `#especialidades` (usar `data-bg` para diferir la imagen; actualizar el contador `/ 0N`). La diapositiva 02 es la maqueta 3D en vivo: iframe diferido a `/centros-de-entretenimiento/maqueta/teaser.html` (sin analítica, `noindex`), que el carrusel dispara con `postMessage` al mostrarla; `data-dur` le da más tiempo (9.5 s) para que termine el giro → luz → fade. En móvil los puntos del carrusel van en la fila del contador (con 5 diapositivas chocaban con el botón).
   b. Enlace en el **directorio** `.svc-index` (strip bajo el slider).
   c. `<li>` en el footer, columna **Servicios**.
4. `sitemap.xml`: `<url>` con `lastmod` del día + `image:image` del hero.
5. Componente "Otros proyectos": añadir entrada al array `ALL` (está duplicado por página; al menos en la página nueva y el resto cuando se toquen).
6. Verificar en preview (desktop + 390px móvil, sin scroll horizontal) y deploy.
7. Pedir indexación en Search Console.

## Checklist: agregar un NUEVO PROYECTO (caso)

1. Copiar la estructura de `/casa-quintas/` (hero, brief, specs, secciones, gallery `.scroller`, cierre, `.proj-next`, related, trackers, `gallery.js`+`motion.js`+`menu.js`).
2. Tarjeta en `/proyectos/index.html` con `data-tags` (espacios que resuelve) — es el índice filtrable.
3. Enlazar en el ciclo anterior/siguiente (`.pn-nav`) del proyecto vecino y del nuevo.
4. `menu.js` (sección Proyectos), home `.pgrid` si es destacado, `ALL` de related-projects, `sitemap.xml`, miniatura 900px en `/assets/thumbs/`.

## Convenciones (no romper)

- **Menú lateral**: `/assets/menu.js` es la navegación universal (botón "Menú" inyectado en cada header + drawer). Las páginas nuevas solo necesitan `<script src="/assets/menu.js" defer></script>` antes de `</body>`.
- **Motor de movimiento**: `/assets/motion.js` (incluir antes de `menu.js`, + `<script>document.documentElement.classList.add('js')</script>` en el `<head>`). Da a toda página: reveals genéricos (`.mo/.in` sobre hijos de `.wrap`, grupos `.specs/.twin/.rooms/...` con stagger — se desactiva solo si la página ya trae `.rv`/`.reveal`), header `.nav.is-scrolled`, fondos diferidos (`data-bg="background-image:..."` inline, o reglas CSS gateadas como `html:not(.js) .sec .img, .sec.is-near .img{background-image:...}`), y videos `<video muted loop playsinline preload="none" data-autoplay>` que solo se descargan/reproducen en pantalla (`<source data-hd="...-hd.mp4">` para ≥900px). Videos: 720px móvil (`-crf 30`) + `-hd` 1080px; nunca `autoplay` en el HTML. ⚠️ Una regla CSS con fondo diferido NO puede llevar `url(...)` en su shorthand `background:` (el navegador lo descarga de inmediato): usar `none` en el shorthand y poner la imagen solo en la regla gateada `html:not(.js) …, .sec.is-near …`. Siempre `;` después de `image-set(...)`.
- **Galería/lightbox**: `/assets/gallery.js` (antes de `motion.js`) amplía fotos conocidas por selector (`.gallery .scroller .img`, `.twin .panel .img`, `.rooms .room .img`, `.proyecto .hero-img`, `.ph.gal`, `.finish .ph`, `.case-feature .img`…) leyendo el fondo computado — sin marcado extra; agrega flechas + arrastre a `.gallery .scroller`. Pie de foto = `aria-label` del elemento o `figcaption`.
- **Liquid Glass**: `/assets/glass.css` (último `<link>` del `<head>`) + `/assets/glass.js` (después de `menu.js`). Material SOLO para la capa flotante sobre contenido/fotografía: header en cápsula al hacer scroll, botón Menú, drawer, FAB de WhatsApp, flechas/controles, etiquetas sobre foto, CTA fantasma del hero. Nunca para tarjetas, textos o secciones. Pieza nueva de vidrio = clase `lg` (+ `lg-light` sobre foto clara, + `lg-press` si es botón) y ajustar `--lg-alpha` (texto sobre fondos claros ≥ .64). Refracción SVG solo en Chromium de escritorio; resto = vidrio esmerilado; `prefers-reduced-transparency` = navy sólido. Hijos con texto/iconos necesitan `position:relative; z-index:1`. Nunca usar `transform` para el efecto de presión: usar `scale`.
- **Legal (México, LFPDPPP 2025)**: aviso integral en `/aviso-de-privacidad/` (responsable, datos, finalidades primarias/adicionales, terceros, cookies, ARCO, revocación, conservación). TODA página nueva que mida (GA4/Pixel) necesita: (1) el bloque `F33_CONSENT_EARLY` en el `<head>` ANTES de gtag/Pixel (si el visitante rechazó, desactiva GA4 y deja `fbq` como stub para que el Pixel no cargue); (2) `<script src="/assets/consent.js" defer></script>` antes de `</body>` (barra de cookies pequeña, abajo-izquierda; `[data-cookie-prefs]` la reabre); (3) enlaces "Aviso de privacidad · Cookies" en el pie. Todo formulario que pida datos lleva el aviso breve con enlace (ver `.cform-legal` en el home). Si se agrega un servicio de terceros (otra analítica, chat, mapas, video), añadirlo a la tabla de cookies del aviso y actualizar la fecha.
- **Miniaturas**: tarjetas de "Otros proyectos" y del home usan `/assets/thumbs/*-900.{jpg,webp}` y `assets/home/<id>-900.*` con `srcset`; no apuntar tarjetas a fotos de 1800px.

- **Datos canónicos**: WhatsApp `526675402559` · correo `faro33studio@gmail.com` · dirección Blv. Pedro María Anaya 1142-E, Col. Chapultepec, 80040 Culiacán · horario Lun–Vie 10:00–17:00, Sáb 10:00–14:00 · IG `faro_33studio` · FB `faro33studio` · fundado **2020** por Fernando Aramburo · © 2026.
- **Imágenes**: solo trabajo REAL del estudio (nunca fotos de Pinterest/terceros). Pipeline: exif-transpose → ≤1800px → JPG q72-80 + WebP (`cwebp -q 72`) → referenciar con `image-set()` (comillas simples en `type('image/webp')` — las dobles rompen atributos `style`).
- **Conversión**: todo CTA va a WhatsApp con prefill específico del contexto; los clics en `wa.me` disparan Pixel `Lead` + GA4 `generate_lead` (script global por página).
- **Animación**: reveals gateados por `html.js` (nunca ocultar contenido sin JS), respetar `prefers-reduced-motion`, solo transform/opacity, sin dependencias externas.
- **Única dependencia externa (aislada):** Three.js r186 autoalojado en `/assets/vendor/three/` (bundle minificado + solo los addons que usa la maqueta; ver `README.txt`). Solo lo carga `/centros-de-entretenimiento/maqueta/` vía importmap; no usarlo en otras páginas sin razón.
- **Tipografía/paleta**: Bodoni MT (woff2 compartidas en `/assets/home/`), tokens navy/linen/brass — copiar `:root` de una página existente.
- **El home `index.html` ya NO es el bundle Wix** — es HTML estático normal; editar con cuidado normal (Python con asserts para cambios repetitivos).
- IDs GA4 `G-91L2N1S9T3` · Pixel `883854600914341` · GSC verificado por meta tag en el home (no quitar).

## Pendientes conocidos
- Editar pantallas de TV (video de fiesta) en fotos de Centros/Acabados vía extensión ChatGPT cuando el usuario la habilite.
- Fotos de proceso de carpintería que no llegaron a disco; antes/después para slider del home; testimonios y reseñas GBP.
