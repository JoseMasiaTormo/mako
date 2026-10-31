import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GEMINI_HOST = "generativelanguage.googleapis.com";

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
						kcal: 210.4,
						proteina: 15.26,
						carbos: -3, // negativo → 0
						grasa: 16.04,
						es_producto: false,
						marca: "ignorada",
						busqueda: "ignorada",
					},
					{
						nombre: "Coca-Cola",
						gramos: 330,
						kcal: 139,
						proteina: 0,
						carbos: 35,
						grasa: 0,
						es_producto: true,
						marca: " Coca-Cola ",
						busqueda: " coca-cola zero ",
					},
					{
						// es_producto true pero sin búsqueda → se trata como no producto
						nombre: "Yogur",
						gramos: 125,
						kcal: 70,
						proteina: 4,
						carbos: 6,
						grasa: 3,
						es_producto: true,
						marca: "Danone",
						busqueda: "   ",
					},
					// sin nombre → se descarta
					{ nombre: "  ", gramos: 10, kcal: 10, proteina: 1, carbos: 1, grasa: 1, es_producto: false, marca: "", busqueda: "" },
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
					kcal: 210,
					proteina: 15.3,
					carbos: 0,
					grasa: 16,
					es_producto: false,
					marca: "",
					busqueda: "",
				},
				{
					nombre: "Coca-Cola",
					gramos: 330,
					kcal: 139,
					proteina: 0,
					carbos: 35,
					grasa: 0,
					es_producto: true,
					marca: "Coca-Cola",
					busqueda: "coca-cola zero",
				},
				{
					nombre: "Yogur",
					gramos: 125,
					kcal: 70,
					proteina: 4,
					carbos: 6,
					grasa: 3,
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
				items: [{ nombre: "Lentejas", gramos: 300, kcal: 350, proteina: 20, carbos: 50, grasa: 8, es_producto: false, marca: "", busqueda: "" }],
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
		expect(await res.json()).toEqual({ error: "limite_diario", limite: 3 });
		// La petición que supera el límite no llega a Gemini.
		expect(llamadasGemini).toHaveLength(3);

		// Otro dispositivo sigue pudiendo usar el servicio.
		const otro = await post("/analizar", { texto: "pan" });
		expect(otro.status).toBe(200);
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
