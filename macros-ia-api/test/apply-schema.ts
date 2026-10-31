import { applyD1Migrations, env } from "cloudflare:test";

// Crea la tabla uso_diario (schema.sql) en la base de datos D1 local de los tests.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
