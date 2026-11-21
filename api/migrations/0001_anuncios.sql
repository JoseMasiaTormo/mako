-- Migración para la base de datos de producción (ya tiene uso_diario sin la columna extra).
-- Ejecutar una sola vez, ANTES de desplegar el Worker nuevo:
--   npx wrangler d1 execute macros-ia-db --remote --file=migrations/0001_anuncios.sql

ALTER TABLE uso_diario ADD COLUMN extra INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS recompensas (
    transaction_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    dia TEXT NOT NULL,
    acreditada INTEGER NOT NULL DEFAULT 0,
    creada TEXT NOT NULL DEFAULT (datetime('now'))
);
