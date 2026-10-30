export interface Env {
	GEMINI_API_KEY: string;
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

async function callGemini(texto: string, apiKey: string) {
	const payload = JSON.stringify({
		systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
		contents: [{ role: 'user', parts: [{ text: texto }] }],
		generationConfig: {
			temperature: 0.2,
			maxOutputTokens: 1024,
			responseMimeType: 'application/json',
			responseSchema: RESPONSE_SCHEMA,
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

async function analizar(texto: string, apiKey: string) {
	const res = await callGemini(texto, apiKey);

	if (res.status === 429) {
		return { error: 'cuota', status: 429 } as const;
	}
	if (RETRY_STATUS.includes(res.status)) {
		return { error: 'saturado', status: 503 } as const;
	}
	if (!res.ok) {
		console.error('Gemini error', res.status, await res.text());
		return { error: 'ia', status: 502 } as const;
	}

	const data: any = await res.json();
	const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!raw) return { error: 'ia', status: 502 } as const;

	let parsed: { items?: Item[] };
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: 'ia', status: 502 } as const;
	}

	const items: Item[] = (parsed.items ?? [])
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

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);

			if (url.pathname !== '/analizar') {
				return json({ error: 'no_encontrado' }, 404);
			}
			if (request.method !== 'POST') {
				return json({ error: 'metodo_no_permitido' }, 405);
			}
			if (!env.GEMINI_API_KEY) {
				return json({ error: 'falta_api_key' }, 500);
			}

			let body: { texto?: unknown };
			try {
				body = await request.json();
			} catch {
				return json({ error: 'json_invalido' }, 400);
			}

			const texto = typeof body.texto === 'string' ? body.texto.trim() : '';
			if (!texto) return json({ error: 'texto_vacio' }, 400);
			if (texto.length > MAX_LENGTH) return json({ error: 'texto_largo' }, 400);

			const result = await analizar(texto, env.GEMINI_API_KEY);
			if ('error' in result) return json({ error: result.error }, result.status);

			return json(result);
		} catch (err) {
			console.error(err);
			return json({ error: 'interno', detalle: String(err) }, 500);
		}
	},
} satisfies ExportedHandler<Env>;
