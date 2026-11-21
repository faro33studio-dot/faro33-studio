-- PII = SOLO dentro de ciphertext; el resto son metadatos sin datos personales
--
-- Base D1 (SQLite) para el Worker de recepción del cuestionario de Faro 33.
-- Este archivo es idempotente: puede ejecutarse varias veces en la consola de D1.
--
-- Notas de seguridad:
--   * ciphertext guarda el JSON cifrado con AES-GCM-256 (AAD = folio).
--   * iv y ciphertext están en base64; key_version indica con qué llave se cifró.
--   * phone_hash / ip_hash son HMAC-SHA256 (nunca el teléfono ni la IP en claro).
--   * No agregues columnas con nombre, teléfono, correo ni comentarios.

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  folio         TEXT    UNIQUE NOT NULL,
  created_at    TEXT    NOT NULL,
  formulario    TEXT,
  version       INTEGER,
  tipo          TEXT,
  origen        TEXT,
  cta           TEXT,
  status        TEXT    NOT NULL DEFAULT 'nuevo',
  phone_hash    TEXT,
  ip_hash       TEXT,
  key_version   INTEGER NOT NULL,
  iv            TEXT    NOT NULL,
  ciphertext    TEXT    NOT NULL
);

-- Consultas del Worker y del futuro panel de administración.
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_phone_hash ON submissions (phone_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_ip_hash    ON submissions (ip_hash);
CREATE INDEX IF NOT EXISTS idx_submissions_status     ON submissions (status);

-- Bitácora de acciones del panel admin (no guarda PII: solo folio y metadatos).
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  actor  TEXT,
  accion TEXT NOT NULL,
  folio  TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_folio ON audit (folio);
CREATE INDEX IF NOT EXISTS idx_audit_at    ON audit (at);
