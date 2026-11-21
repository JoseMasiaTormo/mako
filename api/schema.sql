CREATE TABLE IF NOT EXISTS uso_diario (
    device_id TEXT NOT NULL,
    dia TEXT NOT NULL,
    peticiones INTEGER NOT NULL DEFAULT 0,
    -- Peticiones extra conseguidas hoy viendo anuncios bonificados.
    extra INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, dia)
);

-- Cada anuncio bonificado verificado por AdMob (para no contar dos veces un reintento).
CREATE TABLE IF NOT EXISTS recompensas (
    transaction_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    dia TEXT NOT NULL,
    acreditada INTEGER NOT NULL DEFAULT 0,
    creada TEXT NOT NULL DEFAULT (datetime('now'))
);
