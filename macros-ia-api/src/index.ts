export interface Env {
	GEMINI_API_KEY: string;
	DB: D1Database;
}

type Item = {
	nombre: string;
	gramos: number;
	kcal: number;
	proteina: number;
	carbos: number;
	grasa: number;
	es_producto: boolean;
	marca: string;
	busqueda: string;
};

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const RETRY_STATUS = [500, 503, 504];
const MAX_LENGTH = 300;

const LIMITE_DISPOSITIVO = 50;
const LIMITE_GLOBAL = 1000;
const DEVICE_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ~1,5 MB de base64 ≈ 1,1 MB de imagen. Una foto de 1024 px en JPEG 0.7 suele ocupar 100-300 KB.
const MAX_IMAGEN_BASE64 = 1_500_000;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const KJ_POR_KCAL = 4.184;

const SQL_SUMAR = `
	INSERT INTO uso_diario (device_id, dia, peticiones) VALUES (?, ?, 1)
	ON CONFLICT(device_id, dia) DO UPDATE SET peticiones = peticiones + 1
	RETURNING peticiones
`;

async function registrarUso(db: D1Database, deviceId: string) {
	const dia = new Date().toISOString().slice(0, 10);
	const stmt = db.prepare(SQL_SUMAR);

	const [dispositivo, total] = await db.batch<{ peticiones: number }>([stmt.bind(deviceId, dia), stmt.bind('__total__', dia)]);

	return {
		usadasDispositivo: dispositivo.results[0]?.peticiones ?? 0,
		usadasTotal: total.results[0]?.peticiones ?? 0,
	};
}

const SYSTEM_PROMPT = `Eres un nutricionista que estima calorías y macronutrientes de comidas españolas.
El usuario describe lo que ha comido en lenguaje natural, sin pesos.
Reglas:
- Separa el plato en ingredientes principales.
- Si no hay cantidad, asume una ración normal de un adulto en España.
- Si el usuario indica cantidad ("2 huevos", "media pizza", "200 g"), respétala.
- Incluye siempre el aceite de cocinar o aliñar si el plato lo lleva normalmente.
- Bebidas: inclúyelas si las menciona.
- Valores en gramos cocinados/consumidos, macros en gramos, energía en kcal.
- Nombres de ingredientes cortos y en español.
- Si el texto no describe comida o bebida, devuelve "items" vacío.
Productos de marca o envasados:
- Si un elemento es un producto envasado o de una marca concreta (menciona una marca o supermercado: Hacendado, Mercadona, Lidl, Carrefour, Danone, Doritos, Coca-Cola, etc.), pon es_producto = true. No lo separes en ingredientes: es un único elemento.
- En "marca" pon la marca del producto. Si dice Mercadona, la marca es Hacendado.
- En "busqueda" pon el nombre corto del producto sin la marca (ej: "lasaña boloñesa", "yogur griego"). Si el nombre del producto es la propia marca, repítela (ej: marca "Coca-Cola", busqueda "coca-cola"; marca "Monster", busqueda "monster energy").
- Si el usuario indica una variante (zero, light, sin azúcar, sin cafeína, un sabor concreto…), inclúyela en "busqueda". Si no la indica, no añadas ninguna variante: es la versión normal.
- En "marca" usa el nombre corto de la marca (ej: "Monster", no "Monster Energy Company").
- Si no indica cantidad, usa el peso del envase o ración individual habitual.
- Aunque sea un producto, estima igualmente sus valores.
- Si no es un producto de marca: es_producto = false, y "marca" y "busqueda" vacíos.`;

const RESPONSE_SCHEMA = {
	type: 'OBJECT',
	properties: {
		items: {
			type: 'ARRAY',
			items: {
				type: 'OBJECT',
				properties: {
					nombre: { type: 'STRING' },
					gramos: { type: 'NUMBER' },
					kcal: { type: 'NUMBER' },
					proteina: { type: 'NUMBER' },
					carbos: { type: 'NUMBER' },
					grasa: { type: 'NUMBER' },
					es_producto: { type: 'BOOLEAN' },
					marca: { type: 'STRING' },
					busqueda: { type: 'STRING' },
				},
				required: ['nombre', 'gramos', 'kcal', 'proteina', 'carbos', 'grasa', 'es_producto', 'marca', 'busqueda'],
			},
		},
	},
	required: ['items'],
};

const ETIQUETA_PROMPT = `Lees fotos de la tabla de información nutricional de productos envasados (normalmente en español).
Devuelve los valores POR 100 g (o por 100 ml si es una bebida):
- kcal: energía en kilocalorías. Si la etiqueta da kJ y kcal, usa kcal. Si solo da kJ, conviértelo: kcal = kJ / 4,184.
- proteina: proteínas en gramos.
- carbos: hidratos de carbono totales en gramos (no solo los azúcares).
- grasa: grasas totales en gramos (no solo las saturadas).
- Si la tabla solo trae valores por ración y se ve el peso de la ración, conviértelos a 100 g.
- Usa el punto como separador decimal. "<0,5" o "trazas" cuenta como 0.
Si se ven en la foto:
- nombre: nombre corto del producto, en español. Si no se ve, "".
- marca: marca del producto. Si no se ve, "".
- racion_g: gramos (o ml) de una ración o unidad según la etiqueta. Si no se ve, 0.
Pon legible = false (y el resto a 0 o "") si la foto no muestra una tabla nutricional, si está borrosa, cortada
o si no puedes leer con seguridad la energía y los tres macronutrientes. No te inventes ningún valor.`;

const ETIQUETA_SCHEMA = {
	type: 'OBJECT',
	properties: {
		legible: { type: 'BOOLEAN' },
		kcal: { type: 'NUMBER' },
		proteina: { type: 'NUMBER' },
		carbos: { type: 'NUMBER' },
		grasa: { type: 'NUMBER' },
		nombre: { type: 'STRING' },
		marca: { type: 'STRING' },
		racion_g: { type: 'NUMBER' },
	},
	required: ['legible', 'kcal', 'proteina', 'carbos', 'grasa', 'nombre', 'marca', 'racion_g'],
};

type EtiquetaGemini = {
	legible: boolean;
	kcal: number;
	proteina: number;
	carbos: number;
	grasa: number;
	nombre: string;
	marca: string;
	racion_g: number;
};

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

function clean(n: unknown, decimals = 1) {
	const v = typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
	const f = 10 ** decimals;
	return Math.round(v * f) / f;
}

function cleanText(s: unknown) {
	return typeof s === 'string' ? s.trim() : '';
}

function geminiUrl(model: string) {
	return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

type GeminiRequest = {
	systemPrompt: string;
	parts: GeminiPart[];
	schema: unknown;
	temperature: number;
	maxOutputTokens: number;
};

type GeminiError = { error: 'cuota' | 'saturado' | 'ia'; status: number };

async function callGemini(req: GeminiRequest, apiKey: string) {
	const payload = JSON.stringify({
		systemInstruction: { parts: [{ text: req.systemPrompt }] },
		contents: [{ role: 'user', parts: req.parts }],
		generationConfig: {
			temperature: req.temperature,
			maxOutputTokens: req.maxOutputTokens,
			responseMimeType: 'application/json',
			responseSchema: req.schema,
		},
	});

	let last: Response | null = null;

	for (const model of MODELS) {
		for (let attempt = 0; attempt < 2; attempt++) {
			const res = await fetch(geminiUrl(model), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
				body: payload,
			});

			if (res.ok || !RETRY_STATUS.includes(res.status)) return res;

			console.warn(`Gemini ${model} ${res.status}, intento ${attempt + 1}`);
			last = res;
			await sleep(500 * (attempt + 1));
		}
	}

	return last!;
}

// Llama a Gemini y devuelve el JSON ya parseado, o un error con su status HTTP.
async function generarJson<T>(req: GeminiRequest, apiKey: string): Promise<{ data: T } | GeminiError> {
	const res = await callGemini(req, apiKey);

	if (res.status === 429) {
		return { error: 'cuota', status: 429 };
	}
	if (RETRY_STATUS.includes(res.status)) {
		return { error: 'saturado', status: 503 };
	}
	if (!res.ok) {
		console.error('Gemini error', res.status, await res.text());
		return { error: 'ia', status: 502 };
	}

	const body: any = await res.json();
	const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!raw) return { error: 'ia', status: 502 };

	try {
		return { data: JSON.parse(raw) as T };
	} catch {
		return { error: 'ia', status: 502 };
	}
}

async function analizar(texto: string, apiKey: string) {
	const result = await generarJson<{ items?: Item[] }>(
		{
			systemPrompt: SYSTEM_PROMPT,
			parts: [{ text: texto }],
			schema: RESPONSE_SCHEMA,
			temperature: 0.2,
			maxOutputTokens: 1024,
		},
		apiKey,
	);
	if ('error' in result) return result;

	const items: Item[] = (result.data.items ?? [])
		.filter((i) => i && typeof i.nombre === 'string' && i.nombre.trim())
		.map((i) => {
			const esProducto = i.es_producto === true && !!cleanText(i.busqueda);
			return {
				nombre: i.nombre.trim(),
				gramos: clean(i.gramos, 0),
				kcal: clean(i.kcal, 0),
				proteina: clean(i.proteina),
				carbos: clean(i.carbos),
				grasa: clean(i.grasa),
				es_producto: esProducto,
				marca: esProducto ? cleanText(i.marca) : '',
				busqueda: esProducto ? cleanText(i.busqueda) : '',
			};
		});

	return { items };
}

async function leerEtiqueta(imagen: string, mimeType: string, apiKey: string) {
	const result = await generarJson<EtiquetaGemini>(
		{
			systemPrompt: ETIQUETA_PROMPT,
			parts: [{ inlineData: { mimeType, data: imagen } }, { text: 'Lee la tabla nutricional de esta foto.' }],
			schema: ETIQUETA_SCHEMA,
			temperature: 0,
			maxOutputTokens: 512,
		},
		apiKey,
	);
	if ('error' in result) return result;

	const e = result.data;
	if (!e || e.legible !== true) return { error: 'etiqueta_ilegible', status: 422 } as const;

	const proteina = clean(e.proteina);
	const carbos = clean(e.carbos);
	const grasa = clean(e.grasa);
	let kcal = clean(e.kcal, 0);

	// Red de seguridad: si la "kcal" es muy superior a lo que dan los macros, probablemente sean kJ.
	const estimada = 4 * proteina + 4 * carbos + 9 * grasa;
	if (estimada >= 20 && kcal > estimada * 3) kcal = Math.round(kcal / KJ_POR_KCAL);

	if (kcal > 950 || proteina > 100 || carbos > 100 || grasa > 100) {
		return { error: 'etiqueta_ilegible', status: 422 } as const;
	}

	const racion = clean(e.racion_g, 0);
	return {
		kcal,
		proteina,
		carbos,
		grasa,
		nombre: cleanText(e.nombre),
		marca: cleanText(e.marca),
		racion_g: racion > 0 && racion <= 5000 ? racion : null,
	};
}

function limiteSuperado(uso: { usadasDispositivo: number; usadasTotal: number }) {
	if (uso.usadasTotal > LIMITE_GLOBAL) {
		return json({ error: 'servicio_lleno' }, 429);
	}
	if (uso.usadasDispositivo > LIMITE_DISPOSITIVO) {
		return json({ error: 'limite_diario', limite: LIMITE_DISPOSITIVO }, 429);
	}
	return null;
}

async function rutaAnalizar(request: Request, env: Env, deviceId: string) {
	let body: { texto?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'json_invalido' }, 400);
	}

	const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
	if (!texto) return json({ error: 'texto_vacio' }, 400);
	if (texto.length > MAX_LENGTH) return json({ error: 'texto_largo' }, 400);

	const limite = limiteSuperado(await registrarUso(env.DB, deviceId));
	if (limite) return limite;

	const result = await analizar(texto, env.GEMINI_API_KEY);
	if ('error' in result) return json({ error: result.error }, result.status);

	return json(result);
}

async function rutaEtiqueta(request: Request, env: Env, deviceId: string) {
	// Corta antes de leer el cuerpo si ya dice que es demasiado grande.
	const contentLength = Number(request.headers.get('Content-Length') ?? 0);
	if (contentLength > MAX_IMAGEN_BASE64 + 1024) return json({ error: 'imagen_grande' }, 413);

	let body: { imagen?: unknown; tipo?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'json_invalido' }, 400);
	}

	let imagen = typeof body.imagen === 'string' ? body.imagen : '';
	imagen = imagen.replace(/^data:[^,]*;base64,/, '').replace(/\s/g, '');
	if (!imagen) return json({ error: 'imagen_vacia' }, 400);
	if (imagen.length > MAX_IMAGEN_BASE64) return json({ error: 'imagen_grande' }, 413);
	if (!BASE64_REGEX.test(imagen)) return json({ error: 'imagen_invalida' }, 400);

	const tipo = typeof body.tipo === 'string' ? body.tipo : 'image/jpeg';
	if (!TIPOS_IMAGEN.includes(tipo)) return json({ error: 'imagen_invalida' }, 400);

	const limite = limiteSuperado(await registrarUso(env.DB, deviceId));
	if (limite) return limite;

	const result = await leerEtiqueta(imagen, tipo, env.GEMINI_API_KEY);
	if ('error' in result) return json({ error: result.error }, result.status);

	return json(result);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);

			const ruta = url.pathname === '/analizar' ? rutaAnalizar : url.pathname === '/etiqueta' ? rutaEtiqueta : null;
			if (!ruta) {
				return json({ error: 'no_encontrado' }, 404);
			}
			if (request.method !== 'POST') {
				return json({ error: 'metodo_no_permitido' }, 405);
			}
			if (!env.GEMINI_API_KEY) {
				return json({ error: 'falta_api_key' }, 500);
			}

			const deviceId = request.headers.get('X-Device-Id') ?? '';
			if (!DEVICE_ID_REGEX.test(deviceId)) {
				return json({ error: 'sin_dispositivo' }, 400);
			}

			return await ruta(request, env, deviceId);
		} catch (err) {
			console.error(err);
			return json({ error: 'interno', detalle: String(err) }, 500);
		}
	},
} satisfies ExportedHandler<Env>;
