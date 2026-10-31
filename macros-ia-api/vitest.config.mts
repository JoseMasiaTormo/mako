import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// schema.sql se convierte en una "migración" que test/apply-schema.ts aplica
// en la base de datos D1 local de los tests antes de que se ejecuten.
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const migrations = [
	{
		name: "schema.sql",
		queries: schema
			.split(";")
			.map((q) => q.trim())
			.filter(Boolean),
	},
];

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					// Clave falsa: los tests nunca llaman a Gemini de verdad.
					GEMINI_API_KEY: "clave-falsa-de-test",
					// Límite pequeño para no tener que hacer 50 peticiones en el test.
					LIMITE_DISPOSITIVO: "3",
					TEST_MIGRATIONS: migrations,
				},
			},
		}),
	],
	test: {
		setupFiles: ["./test/apply-schema.ts"],
	},
});
