# faro33-intake — Recepción segura del cuestionario

Guía para publicar el Worker que recibe el cuestionario de **faro33studio.com** y
guarda las respuestas **cifradas** en Cloudflare D1. Está escrita para seguirse
paso a paso desde el panel de Cloudflare. Lo único imprescindible en la
computadora es el comando de terminal para generar las llaves; los comandos
opcionales con `npx wrangler` requieren Node y solo son para respaldos.

> Regla de oro: los datos personales (nombre, teléfono, correo, comentarios,
> referencias…) viajan dentro de `ciphertext`. En las columnas “de afuera” solo
> hay metadatos sin PII. Si se pierde la llave de cifrado, **los datos no se
> pueden recuperar**.

---

## 1. Arquitectura

```
 Navegador (GitHub Pages)
   cuestionario/index.html
   + cuestionario.js
          │  POST application/json (máx. 32 KB)
          │  { formulario, version, folio, respuestas, meta, turnstile }
          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Worker faro33-intake (Cloudflare)                           │
 │                                                             │
 │  1. CORS: solo orígenes de ALLOWED_ORIGINS                  │
 │  2. Tamaño, Content-Type, folio y versión                   │
 │  3. Turnstile → siteverify (5 s máximo)                     │
 │  4. validar.js: visibilidad + tipos + requeridos            │
 │     (mismos ids de error que el cliente, sin valores)       │
 │  5. Idempotencia por folio                                  │
 │  6. Límite por IP (hash HMAC, nunca la IP)                  │
 │  7. Cifra AES-GCM-256 (AAD = folio) con la llave activa     │
 │  8. INSERT en D1                                            │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │ D1  faro33-forms             │
                 │  submissions                 │
                 │   folio, created_at, tipo,   │
                 │   origen, cta, status,       │
                 │   phone_hash, ip_hash,       │
                 │   key_version, iv,           │
                 │   ciphertext  ◄── PII cifrada│
                 │  audit (panel futuro)        │
                 └──────────────────────────────┘
```

- El navegador reintenta con el **mismo folio** si falla la red. El Worker
  responde `200 {ok:true,folio}` sin duplicar la fila.
- `phone_hash` permite buscar sin guardar el teléfono en claro; `ip_hash` sirve
  para el límite de tasa. Ambos son HMAC-SHA256 con `HMAC_KEY`.
- La llave de cifrado no está en el código: vive como *secret* del Worker.

---

## 2. Bindings del Worker

| Nombre | Tipo | Obligatorio | Valor / ejemplo | Para qué |
|---|---|---|---|---|
| `DB` | D1 binding | Sí | base `faro33-forms` | Leer y escribir `submissions` y `audit`. |
| `ENC_KEY_V1` | Secret (texto) | Sí | salida de `openssl rand -base64 32` | Llave AES-256 de la versión 1. |
| `ENC_KEY_V2`, `ENC_KEY_V3`… | Secret (texto) | Solo al rotar | otra llave de 32 bytes | Descifrar filas nuevas/antiguas. |
| `ACTIVE_KEY_VERSION` | Variable de texto | Recomendado | `1` | Versión con la que se cifran las filas nuevas. Si falta, se usa `1`. |
| `HMAC_KEY` | Secret (texto) | Sí | otra salida de `openssl rand -base64 32` | `phone_hash`, `ip_hash` y límite por IP. |
| `TURNSTILE_SECRET` | Secret (texto) | Sí en producción | secreto del sitio Turnstile | Verificar el token del navegador. |
| `ALLOWED_ORIGINS` | Variable de texto | No | `https://faro33studio.com,https://www.faro33studio.com` | Lista separada por comas. Es el valor por omisión. |
| `RATE_LIMIT_PER_HOUR` | Variable de texto | No | `5` | Envíos por IP en una hora. Si falta, 5. |
| `ALLOW_NO_TURNSTILE` | Variable de texto | **No en producción** | `1` | Solo pruebas: permite seguir sin `TURNSTILE_SECRET`. Nunca dejarlo en `1` en el sitio real. |

> Las llaves deben ser **base64 de exactamente 32 bytes**. El Worker rechaza
> cualquier otra longitud. No se muestran detalles de configuración al público.

---

## 3. Pasos numerados en el panel de Cloudflare

### Paso 1 — Crear la base D1

1. Entra a <https://dash.cloudflare.com> con tu cuenta.
2. Menú izquierdo: **Workers & Pages → D1**.
3. Botón **Create database** (o **Crear base de datos**).
4. Nombre: `faro33-forms`. Región: la más cercana (por ejemplo, EE. UU. oeste).
5. **Create**.

### Paso 2 — Ejecutar `db/schema.sql`

1. Abre la base `faro33-forms`.
2. Pestaña **Console** (consola SQL).
3. Copia **todo** el contenido de `salida_codigo/backend/db/schema.sql` y pégalo.
4. **Execute**. Deben aparecer `submissions` y `audit`.
5. Si la consola solo acepta una sentencia por vez, ejecuta por separado cada
   bloque `CREATE TABLE` y cada `CREATE INDEX` (todos son idempotentes).

Verificación rápida en la misma consola:

```sql
SELECT name, type FROM sqlite_master
WHERE type IN ('table','index')
  AND (name LIKE '%submissions%' OR name LIKE '%audit%');
```

### Paso 3 — Generar las llaves en TU terminal

Hazlo en tu computadora, no en un chat ni en un sitio web. Necesitas **dos**
llaves distintas:

```bash
openssl rand -base64 32
```

Copia la salida y guárdala como `ENC_KEY_V1`. Ejecuta otra vez el comando:

```bash
openssl rand -base64 32
```

Copia esa segunda salida y guárdala como `HMAC_KEY`.

**Guarda ambas en tu gestor de contraseñas** (1Password, Bitwarden, etc.) con una
nota del tipo “Faro 33 — Worker intake — llave de cifrado v1”. No las pegues en
WhatsApp, correo, Notion, GitHub ni en un chat con IA.

> Si pierdes `ENC_KEY_V1` y no tienes copia, las filas cifradas con esa versión
> quedan **irrecuperables**. No hay “recuperar contraseña” para esto.

### Paso 4 — Crear el Worker y pegar el archivo generado

1. En el repositorio, genera el archivo que se pega en Cloudflare:

   ```bash
   cd salida_codigo/backend
   node build.mjs --schema ../cuestionario/schema.json
   ```

   Se crea `dist/intake.worker.js`. Ese archivo ya contiene el schema, las
   librerías y el Worker; **no lo edites a mano** (tiene la leyenda
   “ARCHIVO GENERADO: no editar a mano”).

2. En Cloudflare: **Workers & Pages → Create → Worker**.
3. Nombre: `faro33-intake`. **Deploy**.
4. Botón **Edit code**. Borra el ejemplo que aparece.
5. Abre `dist/intake.worker.js`, copia todo y pégalo en el editor.
6. **Deploy** otra vez.

### Paso 5 — Enlazar la base D1 como `DB`

1. Dentro del Worker `faro33-intake`: **Settings → Bindings**.
2. **Add binding → D1 database**.
3. Variable name: `DB` (exactamente así, mayúsculas).
4. D1 database: `faro33-forms`.
5. **Save** y vuelve a **Deploy** si el panel lo pide.

### Paso 6 — Cargar las llaves y variables

En **Settings → Variables and Secrets** del Worker:

1. **Add → Secret**:
   - Nombre `ENC_KEY_V1`, valor: la primera llave que guardaste.
   - Nombre `HMAC_KEY`, valor: la segunda llave.
   - Nombre `TURNSTILE_SECRET`, valor: el secreto del paso 7.
2. **Add → Variable** (texto plano):
   - `ACTIVE_KEY_VERSION` = `1`
   - `ALLOWED_ORIGINS` = `https://faro33studio.com,https://www.faro33studio.com`
   - `RATE_LIMIT_PER_HOUR` = `5`
3. **Deploy** para aplicar los cambios.

> `ALLOW_NO_TURNSTILE` **no** se crea en producción. Solo existe para pruebas
> locales o de un Worker de ensayo.

### Paso 7 — Crear el sitio Turnstile

1. Menú: **Turnstile → Add site**.
2. Nombre: `Faro 33 — cuestionario`.
3. Domains: `faro33studio.com` y `www.faro33studio.com` (añade también el
   dominio de pruebas si usas uno).
4. Widget mode: **Managed**.
5. Copia la **Site Key** (pública, empieza con `0x…`) y el **Secret Key**.
6. El **Secret Key** va como `TURNSTILE_SECRET` en el Worker (paso 6). La
   **Site Key** va en el HTML (paso 8).

### Paso 8 — Configurar el formulario en el sitio

En `cuestionario/index.html` (o donde cargues la configuración del formulario)
define `F33_FORM` **antes** de cargar `cuestionario.js`:

```html
<script>
  window.F33_FORM = {
    endpoint: 'https://faro33-intake.TU-SUBDOMINIO.workers.dev/',
    turnstileSiteKey: '0x4AAAAAAA_TU_SITE_KEY',
    meta: () => ({
      pagina: location.pathname,
      cta: new URLSearchParams(location.search).get('cta') || 'directo',
      origen: new URLSearchParams(location.search).get('origen') || 'organico'
    })
  };
</script>
```

- `endpoint` debe terminar en `/` (o usar `/enviar`).
- La `turnstileSiteKey` es pública; el secreto **nunca** va en el HTML.
- Publica el cambio en GitHub Pages.

### Paso 9 — Prueba de punta a punta y borrado de la fila de prueba

1. Abre `https://faro33studio.com/cuestionario/` en una ventana privada.
2. Responde el cuestionario con datos de prueba reconocibles, por ejemplo
   nombre `PRUEBA F33`, teléfono `6670000000`, y envía.
3. En Cloudflare: **D1 → faro33-forms → Console**:

   ```sql
   SELECT id, folio, created_at, tipo, status, key_version
   FROM submissions ORDER BY id DESC LIMIT 5;
   ```

   Anota el `folio` del envío de prueba (formato `F33-XXXXXX`).
4. Confirma que la respuesta llegó y que no hay PII en claro:

   ```sql
   SELECT folio, tipo, origen, cta, status, length(ciphertext) AS bytes_cifrados
   FROM submissions WHERE folio = 'F33-XXXXXX';
   ```

5. Borra **solo** esa fila de prueba y deja constancia:

   ```sql
   INSERT INTO audit (at, actor, accion, folio)
   VALUES (datetime('now'), 'prueba', 'borrado_prueba', 'F33-XXXXXX');

   DELETE FROM submissions WHERE folio = 'F33-XXXXXX';
   ```

6. Comprueba que ya no existe:

   ```sql
   SELECT COUNT(*) AS quedan FROM submissions WHERE folio = 'F33-XXXXXX';
   ```

También puedes probar el Worker sin navegador (útil en un Worker de ensayo con
`ALLOW_NO_TURNSTILE=1`; **quítalo después**):

```bash
curl -i https://faro33-intake.TU-SUBDOMINIO.workers.dev/ \
  -H 'Origin: https://faro33studio.com' \
  -H 'Content-Type: application/json' \
  --data '{"formulario":"cuestionario-proyecto","version":1,"folio":"F33-TEST22","respuestas":{"tipo":"residencial","nombre":"PRUEBA F33","telefono":"6670000000","ciudad":"Culiacán","contacto_preferido":"whatsapp","situacion":"obra_nueva","m2":"50_100","alcance":["diseno_planos"],"plazo":"1_3_meses","res_inmueble":"casa","res_espacios":["sala"],"res_ocupantes":"3_4","consentimiento":true},"meta":{"pagina":"/cuestionario/","cta":"prueba","origen":"instagram"}}'
```

La salud del Worker (sin datos) está en `GET /salud` y debe responder
`{"ok":true}`.

---

## 4. Rotación de llaves (cuando toque)

1. Genera una llave nueva en tu terminal: `openssl rand -base64 32`.
2. Guárdala en el gestor de contraseñas como `ENC_KEY_V2`.
3. En el Worker, **Add → Secret**: `ENC_KEY_V2` con esa llave.
4. Cambia la variable `ACTIVE_KEY_VERSION` a `2` y **Deploy**.
5. Desde ese momento las filas nuevas se cifran con v2. Las viejas conservan
   `key_version = 1` y se siguen descifrando con `ENC_KEY_V1`.
6. **No borres `ENC_KEY_V1`** hasta que ya no existan filas con esa versión
   (o hasta que las hayas re-cifrado con un procedimiento controlado).

Comprobación:

```sql
SELECT key_version, COUNT(*) AS filas
FROM submissions GROUP BY key_version ORDER BY key_version;
```

---

## 5. ARCO y borrado por folio

La PII solo se puede leer descifrando `ciphertext` con la llave de su
`key_version`. El panel de administración llegará en otro lote; mientras tanto,
las solicitudes se atienden por folio.

**Localizar una fila por folio** (nunca por nombre o teléfono en claro, porque no
existen en la base):

```sql
SELECT id, folio, created_at, formulario, version, tipo, origen, cta,
       status, key_version, iv, ciphertext
FROM submissions WHERE folio = 'F33-ABC234';
```

**Derecho de acceso (ARCO):** exporta esa fila y descífrala en un entorno de
confianza con `ENC_KEY_V<n>` (nunca en un chat ni en una web pública). Entrega
solo los datos del solicitante y registra la acción:

```sql
INSERT INTO audit (at, actor, accion, folio)
VALUES (datetime('now'), 'responsable', 'acceso_arco', 'F33-ABC234');
```

**Rectificación:** no se edita el `ciphertext` a mano. Se descifra, se corrige y
se vuelve a cifrar con la llave activa (AAD = el mismo folio), actualizando
`key_version`, `iv` y `ciphertext` en una sola operación. Si no tienes un
procedimiento probado, es preferible borrar y pedir un envío nuevo.

**Cancelación / borrado (derecho al olvido):**

```sql
INSERT INTO audit (at, actor, accion, folio)
VALUES (datetime('now'), 'responsable', 'borrado_arco', 'F33-ABC234');

DELETE FROM submissions WHERE folio = 'F33-ABC234';
```

**Oposición / limitación:** cambia el estado para excluirlo de campañas y, si
corresponde, borra la fila:

```sql
UPDATE submissions SET status = 'no_contactar' WHERE folio = 'F33-ABC234';
```

> El `audit` no guarda PII: solo fecha, actor, acción y folio. Conserva el folio
> en la bitácora aunque la fila ya no exista, para poder demostrar el borrado.

---

## 6. Retención sugerida

- **Cuestionarios activos**: mientras dure el proyecto y hasta 24 meses después
  del último contacto.
- **Clientes cerrados**: 24 meses desde el cierre; después, borrar o anonimizar.
- **No contactar / descartado**: 12 meses y borrar.
- **Bitácora `audit`**: 5 años (solo metadatos, sin PII).
- Revisa la retención al menos una vez al año y déjala escrita en el aviso de
  privacidad.

Purga manual sugerida (revisa el `SELECT` antes de borrar):

```sql
-- Ver qué se borraría
SELECT folio, created_at, status FROM submissions
WHERE status IN ('cerrado', 'descartado', 'no_contactar')
  AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 months');

-- Borrar (guarda antes los folios en audit si necesitas evidencia)
DELETE FROM submissions
WHERE status IN ('cerrado', 'descartado', 'no_contactar')
  AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 months');
```

---

## 7. Respaldo de D1

- **Time Travel** (viaje en el tiempo de D1): permite restaurar la base a un
  punto de las últimas 30 días (según el plan). Se usa desde el panel de D1 o
  con Wrangler:

  ```bash
  npx wrangler d1 time-travel info faro33-forms
  npx wrangler d1 time-travel restore faro33-forms --timestamp=2026-01-31T12:00:00Z
  ```

- **Exportación** a un archivo SQL (guárdalo cifrado, porque el `ciphertext`
  sigue siendo recuperable con las llaves):

  ```bash
  npx wrangler d1 export faro33-forms --remote --output=respaldo-faro33.sql
  ```

- Guarda una copia de las **llaves** en el gestor de contraseñas y una copia del
  respaldo en un lugar cifrado. Un respaldo sin llave no sirve; una llave sin
  respaldo tampoco.

---

## 8. Qué NO hacer

- **No** pegues `ENC_KEY_V1`, `HMAC_KEY` ni `TURNSTILE_SECRET` en chats, correos,
  capturas de pantalla, Notion, GitHub ni en un mensaje con una IA.
- **No** pongas llaves en el HTML, en `cuestionario.js` ni en el repositorio. El
  HTML solo lleva la Site Key pública de Turnstile.
- **No** registres el cuerpo de la petición, las respuestas ni la IP en claro en
  logs, analítica o herramientas de errores. El Worker solo registra
  `{evento, folio?, codigo}`.
- **No** crees ni abras un Worker de administración sin **Cloudflare Access**
  (o una protección equivalente). El panel admin del próximo lote debe quedar
  detrás de Access.
- **No** dejes `ALLOW_NO_TURNSTILE=1` en producción: desactiva Turnstile.
- **No** edites `dist/intake.worker.js` a mano: cambia `src/` y vuelve a correr
  `node build.mjs`.
- **No** borres `ENC_KEY_V1` al rotar hasta que no queden filas de esa versión.
- **No** exportes la base y la compartas por canales inseguros: aunque la PII
  esté cifrada, sigue siendo un dato personal.
- **No** cambies el `folio` de una fila existente: el cifrado está atado a él
  (AAD) y dejaría de descifrarse.

---

## 9. Estructura del proyecto

```
salida_codigo/backend/
├── db/schema.sql            Tablas e índices de D1
├── src/lib/cripto.js        AES-GCM-256, HMAC-SHA256, base64
├── src/lib/llaves.js        Versionado de llaves
├── src/lib/validar.js       Validación de servidor + visibilidad
├── src/lib/util.js          Teléfono, folios, CORS, respuestas
├── src/lib/turnstile.js     Verificación de Turnstile
├── src/intake.js            Worker (fetch)
├── build.mjs                Genera dist/intake.worker.js
├── test/                    Pruebas con node --test
└── dist/intake.worker.js    ARCHIVO GENERADO (no editar)
```

Para regenerar y probar:

```bash
cd salida_codigo/backend
node build.mjs --schema ../cuestionario/schema.json
cd ../..
node --test salida_codigo/backend/test/
```

---

## 10. Worker de administración (faro33-admin)

Este segundo Worker es el panel privado donde la dueña del estudio puede **ver los
envíos descifrados**, cambiar su estado, exportarlos a CSV y borrarlos por derechos
ARCO. Comparte la **misma base D1** y las **mismas llaves** que `faro33-intake`.
No es público: debe quedar siempre detrás de **Cloudflare Access**.

> Si ves nombres de menús distintos en tu panel de Cloudflare, no improvises:
> **verifica el nombre actual del menú** en la documentación o en el panel. La
> interfaz de Cloudflare cambia con frecuencia.

### 10.1 Generar el archivo del panel

En la carpeta `backend`, ejecuta:

```bash
node build.mjs --target admin --schema ../cuestionario/schema.json
```

Se crea `dist/admin.worker.js`. Ese archivo ya contiene el schema, las librerías,
el HTML del panel y el Worker. **No lo edites a mano**: tiene la leyenda
“ARCHIVO GENERADO: no editar a mano”. Si cambias algo, vuelve a ejecutar el
comando.

El build de `intake` no cambia: `node build.mjs` (sin `--target`) sigue generando
`dist/intake.worker.js` como antes.

### 10.2 Crear el Worker y pegar el archivo

1. En Cloudflare: **Workers & Pages → Create → Worker**.
2. Nombre: `faro33-admin`. **Deploy**.
3. Botón **Edit code**. Borra el ejemplo que aparece.
4. Abre `dist/admin.worker.js`, copia todo y pégalo en el editor.
5. **Deploy** otra vez.

### 10.3 Enlazar la MISMA base D1

1. Dentro del Worker `faro33-admin`: **Settings → Bindings**.
2. **Add binding → D1 database**.
3. Variable name: `DB` (exactamente así, mayúsculas).
4. D1 database: la misma que usa `faro33-intake`, por ejemplo `faro33-forms`.
5. **Save** y vuelve a **Deploy** si el panel lo pide.

No crees una base nueva: el panel debe leer las filas que ya recibe el Worker de
recepción.

### 10.4 Copiar los MISMOS secretos (sin pasar por chats)

En **Settings → Variables and Secrets** del Worker `faro33-admin`:

1. **Add → Secret**:
   - `ENC_KEY_V1`: la **misma** llave de cifrado que tiene `faro33-intake`.
   - `HMAC_KEY`: la **misma** llave HMAC que tiene `faro33-intake`.
2. **Add → Variable** (texto plano):
   - `ACTIVE_KEY_VERSION` = `1` (o la versión activa que uses).
   - `ACCESS_TEAM_DOMAIN`: el dominio del equipo de Cloudflare Access, por ejemplo
     `faro33.cloudflareaccess.com` (sin `https://`).
   - `ACCESS_AUD`: el **Application Audience (AUD) Tag** de la aplicación de Access
     que protege este Worker.
   - `ADMIN_EMAILS`: el correo de la dueña del estudio (puedes separar varios
     correos con comas). Se compara en minúsculas. Si está vacío o falta, el
     panel **niega todo**.
3. **Deploy** para aplicar los cambios.

Las llaves se copian **desde el gestor de contraseñas** (1Password, Bitwarden,
etc.) y se pegan directamente en Cloudflare. **Nunca** las pegues en un chat, un
correo, una captura, Notion o GitHub. Si no tienes la llave, no la inventes: sin
ella los envíos no se pueden descifrar.

### 10.5 Activar Cloudflare Access para este Worker

El código verifica el JWT de Access como defensa en profundidad, pero la primera
barrera es Access. Actívalo:

- En la pantalla del Worker, busca **Settings → Domains & Routes** y la opción
  **“Protect with Cloudflare Access”** (el nombre exacto puede variar; verifica el
  menú actual).
- O bien, en **Zero Trust → Access → Applications → Add an application →
  Self-hosted**, protege el dominio del Worker (`faro33-admin.TU-SUBDOMINIO.workers.dev`
  o el dominio personalizado que uses). Crea una política **Allow** (Permitir)
  **solo** para el correo de la dueña. No uses una política abierta a todo el
  mundo.

De dónde salen los valores:

- `ACCESS_TEAM_DOMAIN`: en Zero Trust, en la configuración general del equipo
  (aparece como *Team domain*). Es un nombre tipo `faro33.cloudflareaccess.com`.
  Verifica el nombre actual del menú.
- `ACCESS_AUD`: en **Access → Applications**, abre la aplicación de este Worker y
  copia el **Application Audience (AUD) Tag** de la pantalla de resumen.
- `ADMIN_EMAILS`: el correo exacto con el que la dueña inicia sesión en Access.

### 10.6 Probar que sí está protegido

1. Abre el panel en una **ventana privada** y sin sesión: debe pedirte iniciar
   sesión en Cloudflare Access o responder `403`. No debe mostrar la lista.
2. Inicia sesión con el correo autorizado: debe aparecer “Faro 33 · Envíos” con la
   lista paginada.
3. Comprueba que un correo no autorizado recibe `403`.
4. Prueba en el teléfono: la tabla se convierte en tarjetas y no debe haber scroll
   horizontal.

### 10.7 Qué NO hacer

- **No** desactives Cloudflare Access “para probar” en producción.
- **No** abras el Worker `faro33-admin` a rutas públicas ni lo publiques en un
  enlace sin Access.
- **No** compartas capturas del panel: contienen datos personales.
- **No** pegues `ENC_KEY_V1`, `HMAC_KEY` ni el JWT en chats, correos o tickets.
- **No** crees una D1 distinta para el panel: debe ser la misma `DB`.
- **No** cambies el folio de una fila: el cifrado está atado a él (AAD).
- **No** edites `dist/admin.worker.js` a mano.

### 10.8 Procedimiento ARCO y borrado

- **Acceso:** abre el detalle del folio y usa “Exportar CSV” si necesitas entregar
  una copia. El CSV respeta los filtros de tipo y estado y tiene un límite de
  seguridad de 2000 filas por exportación. Guárdalo en un lugar cifrado.
- **Rectificación:** no se edita el cifrado a mano. Si hay un error, lo más seguro
  es borrar la fila y pedir un envío nuevo; si se hace un procedimiento técnico,
  debe re-cifrarse con la llave activa y el mismo folio.
- **Cancelación / derecho al olvido:** abre el detalle, pulsa **“Borrar (ARCO)”**,
  escribe el folio exacto para confirmar y confirma. El borrado es definitivo. La
  bitácora `audit` conserva el folio, la fecha y el actor, pero **no** los datos
  personales.
- **Oposición / limitación:** cambia el estado a `descartado` (o el que
  corresponda) y, si procede, borra la fila con el botón ARCO.

### 10.9 Ver la bitácora `audit` con SQL

En **D1 → tu base → Console**, puedes revisar las acciones del panel:

```sql
SELECT at, actor, accion, folio
FROM audit
ORDER BY id DESC
LIMIT 50;
```

Para un folio concreto:

```sql
SELECT at, actor, accion, folio
FROM audit
WHERE folio = 'F33-ABC234'
ORDER BY id DESC;
```

La tabla `audit` no guarda nombres, teléfonos, correos ni comentarios: solo fecha,
actor, acción y folio. Úsala para demostrar accesos, cambios de estado,
exportaciones y borrados.

### 10.10 Archivos nuevos del panel

```
backend/src/lib/access.js     Verificación RS256 del JWT de Cloudflare Access
backend/src/lib/csv.js        CSV seguro (comillas, saltos, fórmulas neutralizadas)
backend/src/lib/envio.js      Descifrado y etiquetado con el schema
backend/src/admin-ui.js       HTML/CSS/JS del panel (sin recursos externos)
backend/src/admin.js          Worker faro33-admin (rutas y auditoría)
backend/dist/admin.worker.js  ARCHIVO GENERADO (no editar)
```
