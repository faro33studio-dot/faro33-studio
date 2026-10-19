# Conversions API — Faro 33 (Cloudflare Worker)

El sitio (`assets/capi.js`) envía cada `Lead` y `Contact` al pixel con un `event_id`.
Este Worker reenvía el mismo evento a Meta desde el servidor con ese mismo `event_id`,
para que Meta los cuente una sola vez y no se pierdan por bloqueadores o iOS.

Hasta que el Worker esté desplegado, `CAPI_ENDPOINT` en `assets/capi.js` está vacío y el
sitio solo envía por el pixel. No hay cambio de comportamiento para el visitante.

## Despliegue (una vez)

1. Token: Events Manager → dataset `883854600914341` → Configuración → Conversions API →
   **Generar token de acceso**. No lo pegues en el repo ni en el chat.
2. Desde esta carpeta:
   ```bash
   npx wrangler login
   npx wrangler secret put META_TOKEN          # pega el token
   npx wrangler deploy                         # imprime la URL, p. ej. https://faro33-meta-capi.<cuenta>.workers.dev
   ```
3. En `assets/capi.js`, pon esa URL en `CAPI_ENDPOINT` y haz commit.
4. Prueba: `npx wrangler secret put TEST_EVENT_CODE` (código de Events Manager → Test events),
   envía el formulario del home desde faro33studio.com y revisa que llegue un `Lead` y un `Contact`
   por navegador y servidor con el mismo ID (deduplicado). Luego borra el secreto:
   `npx wrangler secret delete TEST_EVENT_CODE`.

## Qué recibe y qué guarda

- Solo acepta POST desde `faro33studio.com` y `www.faro33studio.com`, y solo los eventos `Lead` y `Contact`.
- Correo y teléfono solo llegan ya hasheados (SHA-256); el Worker descarta cualquier otro valor.
- Agrega IP y user agent de la conexión para Meta. No los guarda: no hay almacenamiento.
- Cloudflare registra las solicitudes según su configuración de logs. Menciónalo en el aviso de privacidad
  como proveedor de servicios, igual que Meta y GitHub.

## Pruebas locales

```bash
npm test     # 6 pruebas unitarias del Worker (sin red)
```
