# Faro 33 Studio — faro33studio.com

Sitio estático (GitHub Pages, dominio `faro33studio.com`, deploy = push a `main`).
Interiorismo en Culiacán. Objetivo comercial: leads por WhatsApp y ticket promedio alto.

## Mapa del sitio

| URL | Rol |
|---|---|
| `/` | Home: hero → Servicios (2 cards) → **slider Especialidades** → **directorio de servicios (strip)** → Proyectos → banda parallax → Manifiesto → Proceso (timeline) → Estudio (stats) → FAQ → Contacto → Footer |
| `/cocinas/` `/centros-de-entretenimiento/` `/acabados-de-pared/` | Landings de servicio (SEO + Meta Ads) |
| `/acabados-de-pared/#negocios` | Ángulo comercial (muros para negocios) |
| `/nosotros/` | Acerca de + mapa (pin verificado 24.8172379,-107.3883888) |
| `/casa-en-la-colina/` `/casa-quintas/` `/un-rincon-cerca-del-cielo/` `/un-pedacito-de-cielo/` | Proyectos |
| `/contacto/` | Puente a WhatsApp para ads (noindex) |

## ⚠️ Checklist: agregar un NUEVO SERVICIO (seguir en orden, sin excepciones)

1. Crear `/<slug>/index.html` **copiando la estructura de `/acabados-de-pared/`** (es la plantilla más completa: GA4, Pixel con `ViewContent`, JSON-LD LocalBusiness+Breadcrumb+FAQPage, fuentes compartidas de `/assets/home/*.woff2`, reveals, skip-link, related-projects, FAB).
2. **`/assets/menu.js`**: añadir la entrada al array `MENU` (menú lateral universal — presente en las 9 páginas; UNA edición cubre toda la navegación entre páginas).
3. Home — **3 puntos de entrada obligatorios**:
   a. Slide en el slider `#especialidades` (usar `data-bg` para diferir la imagen; actualizar el contador `/ 0N`).
   b. Enlace en el **directorio** `.svc-index` (strip bajo el slider).
   c. `<li>` en el footer, columna **Servicios**.
4. `sitemap.xml`: `<url>` con `lastmod` del día + `image:image` del hero.
5. Componente "Otros proyectos": añadir entrada al array `ALL` (está duplicado por página; al menos en la página nueva y el resto cuando se toquen).
6. Verificar en preview (desktop + 390px móvil, sin scroll horizontal) y deploy.
7. Pedir indexación en Search Console.

## Convenciones (no romper)

- **Menú lateral**: `/assets/menu.js` es la navegación universal (botón "Menú" inyectado en cada header + drawer). Las páginas nuevas solo necesitan `<script src="/assets/menu.js" defer></script>` antes de `</body>`.

- **Datos canónicos**: WhatsApp `526675402559` · correo `faro33studio@gmail.com` · dirección Blv. Pedro María Anaya 1142-E, Col. Chapultepec, 80040 Culiacán · horario Lun–Vie 10:00–17:00, Sáb 10:00–14:00 · IG `faro_33studio` · FB `faro33studio` · fundado **2020** por Fernando Aramburo · © 2026.
- **Imágenes**: solo trabajo REAL del estudio (nunca fotos de Pinterest/terceros). Pipeline: exif-transpose → ≤1800px → JPG q72-80 + WebP (`cwebp -q 72`) → referenciar con `image-set()` (comillas simples en `type('image/webp')` — las dobles rompen atributos `style`).
- **Conversión**: todo CTA va a WhatsApp con prefill específico del contexto; los clics en `wa.me` disparan Pixel `Lead` + GA4 `generate_lead` (script global por página).
- **Animación**: reveals gateados por `html.js` (nunca ocultar contenido sin JS), respetar `prefers-reduced-motion`, solo transform/opacity, sin dependencias externas.
- **Tipografía/paleta**: Bodoni MT (woff2 compartidas en `/assets/home/`), tokens navy/linen/brass — copiar `:root` de una página existente.
- **El home `index.html` ya NO es el bundle Wix** — es HTML estático normal; editar con cuidado normal (Python con asserts para cambios repetitivos).
- IDs GA4 `G-91L2N1S9T3` · Pixel `883854600914341` · GSC verificado por meta tag en el home (no quitar).

## Pendientes conocidos
- Editar pantallas de TV (video de fiesta) en fotos de Centros/Acabados vía extensión ChatGPT cuando el usuario la habilite.
- Fotos de proceso de carpintería que no llegaron a disco; antes/después para slider del home; testimonios y reseñas GBP.
