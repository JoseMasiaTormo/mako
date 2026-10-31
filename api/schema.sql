CREATE TABLE IF NOT EXISTS uso_diario (
    device_id TEXT NOT NULL,
    dia TEXT NOT NULL,
    peticiones INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (device_id, dia)
);