import type { D1Migration } from "cloudflare:test";

declare global {
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			GEMINI_API_KEY: string;
			LIMITE_DISPOSITIVO?: string;
			LIMITE_GLOBAL?: string;
			ADMOB_REWARDED_AD_UNIT?: string;
			TEST_MIGRATIONS: D1Migration[];
		}
	}
}
