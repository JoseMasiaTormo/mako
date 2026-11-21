import { SELF } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const GEMINI_HOST = "generativelanguage.googleapis.com";
const ADMOB_KEYS_URL = "https://gstatic.com/admob/reward/verifier-keys.json";

// ---------- Simulación de Gemini ----------
// El Worker se ejecuta en el mismo entorno que los tests, así que espiando
// globalThis.fetch interceptamos sus llamadas a Gemini sin salir a internet.

type Respuesta = { status: number; body?: unknown };
let respuestasGemini: Respuesta[] = [];
let llamadasGemini: { url: string; init?: RequestInit }[] = [];

/** Respuesta correcta de Gemini con `data` como JSON generado por el modelo. */
function geminiOk(data: unknown): Respuesta {
	return {
		status: 200,
		body: { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] },
	};
}

/** Encola las respuestas que devolverá Gemini, en orden. La última se repite. */
function simularGemini(...respuestas: Respuesta[]) {
	respuestasGemini = respuestas;
}

beforeEach(() => {
	respuestasGemini = [];
	llamadasGemini = [];
	const fetchOriginal = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url === ADMOB_KEYS_URL) return Response.json(clavesAdmobPublicadas);
		if (!url.includes(GEMINI_HOST)) return fetchOriginal(input, init);

		llamadasGemini.push({ url, init });
		const r = respuestasGemini.length > 1 ? respuestasGemini.shift()! : respuestasGemini[0];
		if (!r) throw new Error("Llamada a Gemini no esperada en este test");
		return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
			status: r.status,
			headers: { "Content-Type": "application/json" },
		});
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------- Ayudas para llamar al Worker ----------

function post(ruta: string, body: unknown, deviceId: string | null = crypto.randomUUID()) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (deviceId !== null) headers["X-Device-Id"] = deviceId;
	return SELF.fetch(`https://api.test${ruta}`, {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

// Un PNG de 1x1 píxel en base64 (válido).
const IMAGEN = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function etiqueta(campos: Record<string, unknown>) {
	return geminiOk({
		legible: true,
		kcal: 0,
		proteina: 0,
		carbos: 0,
		grasa: 0,
		nombre: "",
		marca: "",
		racion_g: 0,
		...campos,
	});
}

// ---------- Tests ----------

describe("rutas y métodos", () => {
	it("una ruta que no existe devuelve 404", async () => {
		const res = await SELF.fetch("https://api.test/no-existe");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "no_encontrado" });
	});

	it("GET en /analizar devuelve 405", async () => {
		const res = await SELF.fetch("https://api.test/analizar");
		expect(res.status).toBe(405);
		expect(await res.json()).toEqual({ error: "metodo_no_permitido" });
	});
});

describe("/analizar: validaciones", () => {
	it("sin cabecera X-Device-Id devuelve 400 sin_dispositivo", async () => {
		const res = await post("/analizar", { texto: "dos huevos" }, null);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "sin_dispositivo" });
	});

	it("con un X-Device-Id mal formado devuelve 400 sin_dispositivo", async () => {
		const res = await post("/analizar", { texto: "dos huevos" }, "no-es-un-uuid");
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "sin_dispositivo" });
	});

	it("con texto vacío devuelve 400 texto_vacio", async () => {
		const res = await post("/analizar", { texto: "   " });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "texto_vacio" });
	});

	it("con texto de más de 300 caracteres devuelve 400 texto_largo", async () => {
		const res = await post("/analizar", { texto: "a".repeat(301) });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "texto_largo" });
	});

	it("en ningún caso de error de validación se llama a Gemini", async () => {
		await post("/analizar", { texto: "" });
		await post("/analizar", { texto: "huevos" }, null);
		expect(llamadasGemini).toHaveLength(0);
	});
});

describe("/analizar: respuesta correcta", () => {
	it("devuelve los items limpios", async () => {
		simularGemini(
			geminiOk({
				items: [
					{
						nombre: "  Huevo frito ",
						gramos: 120.6,
						unidades: 2,
						kcal_100g: 174.4,
						proteina_100g: 12.6,
						carbos_100g: -3, // negativo → 0
						grasa_100g: 13.26,
						es_producto: false,
						marca: "ignorada",
						busqueda: "ignorada",
					},
					{
						nombre: "Coca-Cola",
						gramos: 330,
						kcal_100g: 42,
						proteina_100g: 0,
						carbos_100g: 10.6,
						grasa_100g: 0,
						es_producto: true,
						marca: " Coca-Cola ",
						busqueda: " coca-cola zero ",
					},
					{
						// es_producto true pero sin búsqueda → se trata como no producto
						nombre: "Yogur",
						gramos: 125,
						unidades: -1, // negativo → 1
						kcal_100g: 56,
						proteina_100g: 3.2,
						carbos_100g: 4.8,
						grasa_100g: 2.4,
						es_producto: true,
						marca: "Danone",
						busqueda: "   ",
					},
					// sin nombre → se descarta
					{ nombre: "  ", gramos: 10, kcal_100g: 10, proteina_100g: 1, carbos_100g: 1, grasa_100g: 1, es_producto: false, marca: "", busqueda: "" },
				],
			}),
		);

		const res = await post("/analizar", { texto: "huevo frito, una coca-cola zero y un yogur" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			items: [
				{
					nombre: "Huevo frito",
					gramos: 121,
					unidades: 2,
					// Totales calculados por el Worker: por 100 g × 1,21.
					kcal: 211,
					proteina: 15.2,
					carbos: 0,
					grasa: 16.1,
					por_100g: { kcal: 174, proteina: 12.6, carbos: 0, grasa: 13.3 },
					es_producto: false,
					marca: "",
					busqueda: "",
				},
				{
					nombre: "Coca-Cola",
					gramos: 330,
					unidades: 1,
					kcal: 139,
					proteina: 0,
					carbos: 35,
					grasa: 0,
					por_100g: { kcal: 42, proteina: 0, carbos: 10.6, grasa: 0 },
					es_producto: true,
					marca: "Coca-Cola",
					busqueda: "coca-cola zero",
				},
				{
					nombre: "Yogur",
					gramos: 125,
					unidades: 1,
					kcal: 70,
					proteina: 4,
					carbos: 6,
					grasa: 3,
					por_100g: { kcal: 56, proteina: 3.2, carbos: 4.8, grasa: 2.4 },
					es_producto: false,
					marca: "",
					busqueda: "",
				},
			],
		});

		// Una sola llamada, al modelo principal y con la API key falsa.
		expect(llamadasGemini).toHaveLength(1);
		expect(llamadasGemini[0].url).toContain("gemini-3.5-flash-lite");
		const headers = new Headers(llamadasGemini[0].init?.headers);
		expect(headers.get("x-goog-api-key")).toBe("clave-falsa-de-test");
		// Temperatura 0 para que la misma comida dé los mismos valores.
		const enviado = JSON.parse(String(llamadasGemini[0].init?.body));
		expect(enviado.generationConfig.temperature).toBe(0);
	});
});

describe("/analizar: errores de Gemini", () => {
	it("si Gemini devuelve 503 siempre, reintenta, usa el modelo de reserva y responde saturado", async () => {
		simularGemini({ status: 503 });

		const res = await post("/analizar", { texto: "lentejas" });
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "saturado" });

		// 2 intentos con el modelo principal y 2 con el de reserva.
		const modelos = llamadasGemini.map((l) => l.url.match(/models\/([^:]+):/)![1]);
		expect(modelos).toEqual([
			"gemini-3.5-flash-lite",
			"gemini-3.5-flash-lite",
			"gemini-3.1-flash-lite",
			"gemini-3.1-flash-lite",
		]);
	}, 15_000); // el Worker espera ~3 s entre reintentos

	it("si el modelo principal da 503 y el de reserva responde bien, devuelve los items", async () => {
		simularGemini(
			{ status: 503 },
			{ status: 503 },
			geminiOk({
				items: [{ nombre: "Lentejas", gramos: 300, kcal_100g: 116, proteina_100g: 9, carbos_100g: 20, grasa_100g: 0.4, es_producto: false, marca: "", busqueda: "" }],
			}),
		);

		const res = await post("/analizar", { texto: "lentejas" });
		expect(res.status).toBe(200);
		const data: any = await res.json();
		expect(data.items[0].nombre).toBe("Lentejas");
		expect(llamadasGemini.at(-1)!.url).toContain("gemini-3.1-flash-lite");
	}, 15_000);

	it("si Gemini devuelve 429 responde cuota sin reintentar", async () => {
		simularGemini({ status: 429, body: { error: { message: "quota" } } });

		const res = await post("/analizar", { texto: "lentejas" });
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "cuota" });
		expect(llamadasGemini).toHaveLength(1);
	});
});

describe("límite diario por dispositivo", () => {
	it("al pasar LIMITE_DISPOSITIVO peticiones con el mismo ID devuelve 429 limite_diario", async () => {
		simularGemini(geminiOk({ items: [] }));
		const id = crypto.randomUUID();

		// En los tests LIMITE_DISPOSITIVO = 3 (ver vitest.config.mts).
		for (let i = 0; i < 3; i++) {
			const res = await post("/analizar", { texto: "pan" }, id);
			expect(res.status).toBe(200);
		}

		const res = await post("/analizar", { texto: "pan" }, id);
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "limite_diario", limite: 3, recarga: 5 });
		// La petición que supera el límite no llega a Gemini.
		expect(llamadasGemini).toHaveLength(3);

		// Otro dispositivo sigue pudiendo usar el servicio.
		const otro = await post("/analizar", { texto: "pan" });
		expect(otro.status).toBe(200);
	});
});

describe("peticiones restantes", () => {
	it("cada respuesta lleva X-Peticiones-Restantes contando hacia atrás hasta 0", async () => {
		simularGemini(geminiOk({ items: [] }));
		const id = crypto.randomUUID();

		// En los tests LIMITE_DISPOSITIVO = 3.
		for (const esperado of ["2", "1", "0"]) {
			const res = await post("/analizar", { texto: "pan" }, id);
			expect(res.headers.get("X-Peticiones-Restantes")).toBe(esperado);
			expect(res.headers.get("X-Peticiones-Limite")).toBe("3");
		}

		const res = await post("/analizar", { texto: "pan" }, id);
		expect(res.status).toBe(429);
		expect(res.headers.get("X-Peticiones-Restantes")).toBe("0");
	});

	it("GET /uso devuelve las restantes sin gastar ninguna", async () => {
		simularGemini(geminiOk({ items: [] }));
		const id = crypto.randomUUID();
		const uso = () => SELF.fetch("https://api.test/uso", { headers: { "X-Device-Id": id } });

		let res = await uso();
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ limite: 3, restantes: 3, recargado: false, recarga: 5 });

		await post("/analizar", { texto: "pan" }, id);
		res = await uso();
		expect(await res.json()).toEqual({ limite: 3, restantes: 2, recargado: false, recarga: 5 });
		// Consultar no cuenta como petición.
		res = await uso();
		expect(await res.json()).toEqual({ limite: 3, restantes: 2, recargado: false, recarga: 5 });
	});

	it("GET /uso sin X-Device-Id devuelve 400", async () => {
		const res = await SELF.fetch("https://api.test/uso");
		expect(res.status).toBe(400);
	});
});

describe("/etiqueta", () => {
	it("una imagen que no es base64 válido devuelve 400 imagen_invalida", async () => {
		const res = await post("/etiqueta", { imagen: "esto no es base64!!", tipo: "image/jpeg" });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "imagen_invalida" });
		expect(llamadasGemini).toHaveLength(0);
	});

	it("si Gemini dice legible: false devuelve 422 etiqueta_ilegible", async () => {
		simularGemini(etiqueta({ legible: false }));

		const res = await post("/etiqueta", { imagen: IMAGEN, tipo: "image/png" });
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ error: "etiqueta_ilegible" });
	});

	it("si la energía viene en kJ en lugar de kcal, la convierte", async () => {
		// Macros: 4·5 + 4·60 + 9·10 = 350 kcal esperadas; Gemini devuelve 1464 (son kJ).
		simularGemini(
			etiqueta({ kcal: 1464, proteina: 5, carbos: 60, grasa: 10, nombre: " Galletas ", marca: "Hacendado", racion_g: 30 }),
		);

		const res = await post("/etiqueta", { imagen: `data:image/png;base64,${IMAGEN}`, tipo: "image/png" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			kcal: 350, // 1464 / 4,184 ≈ 349,9
			proteina: 5,
			carbos: 60,
			grasa: 10,
			nombre: "Galletas",
			marca: "Hacendado",
			racion_g: 30,
		});

		// Se envía la imagen a Gemini sin el prefijo data:...;base64,
		const payload = JSON.parse(String(llamadasGemini[0].init?.body));
		expect(payload.contents[0].parts[0].inlineData).toEqual({ mimeType: "image/png", data: IMAGEN });
	});

	it("con valores imposibles (más de 100 g de un macro) devuelve etiqueta_ilegible", async () => {
		simularGemini(etiqueta({ kcal: 400, proteina: 150, carbos: 10, grasa: 5 }));

		const res = await post("/etiqueta", { imagen: IMAGEN });
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ error: "etiqueta_ilegible" });
	});

	it("con más de 950 kcal por 100 g devuelve etiqueta_ilegible", async () => {
		simularGemini(etiqueta({ kcal: 2000, proteina: 0, carbos: 0, grasa: 0 }));

		const res = await post("/etiqueta", { imagen: IMAGEN });
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ error: "etiqueta_ilegible" });
	});
});

// ---------- Recompensas de AdMob (verificación en servidor) ----------
// Se genera un par de claves propio y se publica como si fuera el verifier-keys.json de Google.
// Los avisos de AdMob se firman con ECDSA P-256 + SHA-256 y la firma va en DER y base64 web-safe.

const KEY_ID = "1234567890";
const BLOQUE = "5224354917"; // el de ADMOB_REWARDED_AD_UNIT en vitest.config.mts
let clavePrivada: CryptoKey;
let clavesAdmobPublicadas: { keys: { keyId: number; pem: string; base64: string }[] } = { keys: [] };

beforeAll(async () => {
	const par = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
		"sign",
		"verify",
	])) as CryptoKeyPair;
	clavePrivada = par.privateKey;
	const spki = new Uint8Array((await crypto.subtle.exportKey("spki", par.publicKey)) as ArrayBuffer);
	const base64 = btoa(String.fromCharCode(...spki));
	clavesAdmobPublicadas = { keys: [{ keyId: Number(KEY_ID), pem: "", base64 }] };
});

/** r||s (lo que da WebCrypto) → DER (lo que manda AdMob). */
function aDer(cruda: Uint8Array) {
	const entero = (v: Uint8Array) => {
		let i = 0;
		while (i < v.length - 1 && v[i] === 0) i++;
		v = v.subarray(i);
		const bytes = v[0] & 0x80 ? [0, ...v] : [...v];
		return [0x02, bytes.length, ...bytes];
	};
	const cuerpo = [...entero(cruda.subarray(0, 32)), ...entero(cruda.subarray(32))];
	return new Uint8Array([0x30, cuerpo.length, ...cuerpo]);
}

const base64Url = (b: Uint8Array) =>
	btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** URL de aviso de AdMob firmada, con los parámetros en orden alfabético como la manda Google. */
async function avisoAdmob(deviceId: string, opciones: { transaccion?: string; bloque?: string; clave?: CryptoKey } = {}) {
	const query = [
		"ad_network=5450213213286189855",
		`ad_unit=${opciones.bloque ?? BLOQUE}`,
		`custom_data=${encodeURIComponent(deviceId)}`,
		"reward_amount=5",
		"reward_item=analisis",
		`timestamp=${Date.now()}`,
		`transaction_id=${opciones.transaccion ?? crypto.randomUUID().replace(/-/g, "")}`,
	].join("&");
	const cruda = new Uint8Array(
		await crypto.subtle.sign(
			{ name: "ECDSA", hash: "SHA-256" },
			opciones.clave ?? clavePrivada,
			new TextEncoder().encode(query),
		),
	);
	return `https://api.test/recompensa?${query}&signature=${base64Url(aDer(cruda))}&key_id=${KEY_ID}`;
}

const uso = async (id: string) =>
	(await SELF.fetch("https://api.test/uso", { headers: { "X-Device-Id": id } })).json();

/** Gasta todas las peticiones del día (LIMITE_DISPOSITIVO = 3 en los tests) y una más que se rechaza. */
async function agotar(id: string, cuantas = 3) {
	simularGemini(geminiOk({ items: [] }));
	for (let i = 0; i < cuantas; i++) expect((await post("/analizar", { texto: "pan" }, id)).status).toBe(200);
	expect((await post("/analizar", { texto: "pan" }, id)).status).toBe(429);
}

describe("/recompensa (anuncios bonificados)", () => {
	it("sin firma responde 200 pero no da nada (AdMob puede probar la URL así)", async () => {
		const res = await SELF.fetch("https://api.test/recompensa");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, motivo: "sin_firma" });
	});

	it("POST en /recompensa devuelve 405", async () => {
		const res = await SELF.fetch("https://api.test/recompensa", { method: "POST" });
		expect(res.status).toBe(405);
	});

	it("con las peticiones agotadas, un anuncio verificado deja exactamente 5 más", async () => {
		const id = crypto.randomUUID();
		await agotar(id);
		expect(await uso(id)).toMatchObject({ restantes: 0 });

		const res = await SELF.fetch(await avisoAdmob(id));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, acreditada: true });
		// Se muestra como recarga (5/5), no sumado al límite diario (5/9).
		expect(await uso(id)).toEqual({ restantes: 5, limite: 5, recargado: true, recarga: 5 });
		simularGemini(geminiOk({ items: [] }));
		const una = await post("/analizar", { texto: "pan" }, id);
		expect(una.headers.get("X-Peticiones-Restantes")).toBe("4");
		expect(una.headers.get("X-Peticiones-Limite")).toBe("5");
		expect(una.headers.get("X-Peticiones-Recargado")).toBe("1");
		await agotar(id, 4);

		// Usadas las 5, la sexta vuelve a dar limite_diario.
		expect(await uso(id)).toMatchObject({ restantes: 0 });
	});

	it("si aún le quedan peticiones, el anuncio no recarga nada", async () => {
		const id = crypto.randomUUID();
		simularGemini(geminiOk({ items: [] }));
		await post("/analizar", { texto: "pan" }, id);

		const res = await SELF.fetch(await avisoAdmob(id));
		expect(await res.json()).toEqual({ ok: true, acreditada: false });
		expect(await uso(id)).toMatchObject({ restantes: 2, limite: 3, recargado: false });
	});

	it("tras recargar, otro anuncio no suma hasta gastar las 5", async () => {
		const id = crypto.randomUUID();
		await agotar(id);
		await SELF.fetch(await avisoAdmob(id));

		const res = await SELF.fetch(await avisoAdmob(id));
		expect(await res.json()).toEqual({ ok: true, acreditada: false });
		expect(await uso(id)).toMatchObject({ restantes: 5 });
	});

	it("el mismo transaction_id (reintento de AdMob) solo cuenta una vez", async () => {
		const id = crypto.randomUUID();
		const transaccion = crypto.randomUUID().replace(/-/g, "");
		await agotar(id);
		await SELF.fetch(await avisoAdmob(id, { transaccion }));
		await agotar(id, 5);

		const res = await SELF.fetch(await avisoAdmob(id, { transaccion }));
		expect(await res.json()).toEqual({ ok: true, acreditada: false, motivo: "repetida" });
		expect(await uso(id)).toMatchObject({ restantes: 0 });
	});

	it("una firma hecha con otra clave se rechaza con 403", async () => {
		const id = crypto.randomUUID();
		await agotar(id);
		const otra = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
			"sign",
			"verify",
		])) as CryptoKeyPair;

		const res = await SELF.fetch(await avisoAdmob(id, { clave: otra.privateKey }));
		expect(res.status).toBe(403);
		expect(await uso(id)).toMatchObject({ restantes: 0 });
	});

	it("si se cambia un parámetro firmado (otro dispositivo), se rechaza con 403", async () => {
		const id = crypto.randomUUID();
		const otro = crypto.randomUUID();
		await agotar(otro);
		const url = (await avisoAdmob(id)).replace(id, otro);

		const res = await SELF.fetch(url);
		expect(res.status).toBe(403);
		expect(await uso(otro)).toMatchObject({ restantes: 0 });
	});

	it("un anuncio de otro bloque (bien firmado) se rechaza con 403", async () => {
		const id = crypto.randomUUID();
		await agotar(id);
		const res = await SELF.fetch(await avisoAdmob(id, { bloque: "9999999999" }));
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "bloque_incorrecto" });
	});

	it("la prueba de URL de AdMob (firmada, ad_unit de ejemplo, sin dispositivo) responde 200", async () => {
		const res = await SELF.fetch(await avisoAdmob("", { bloque: "1234567890" }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, motivo: "datos_invalidos" });
	});

	it("con un custom_data que no es un ID de dispositivo responde 200 sin dar nada", async () => {
		const res = await SELF.fetch(await avisoAdmob("no-es-un-uuid"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: false, motivo: "datos_invalidos" });
	});
});
