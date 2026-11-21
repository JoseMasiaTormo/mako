export interface Env {
	GEMINI_API_KEY: string;
	DB: D1Database;
	// Opcionales: si no se definen se usan LIMITE_DISPOSITIVO / LIMITE_GLOBAL. Sirven sobre todo para los tests.
	LIMITE_DISPOSITIVO?: string;
	LIMITE_GLOBAL?: string;
	// ID del bloque de anuncios bonificados de AdMob (ca-app-pub-XXX/YYY). Si está definido,
	// solo se aceptan recompensas de ese bloque. Ver rutaRecompensa.
	ADMOB_REWARDED_AD_UNIT?: string;
}

type Item = {
	nombre: string;
	gramos: number;
	unidades: number;
	kcal: number;
	proteina: number;
	carbos: number;
	grasa: number;
	/** Valores por 100 g (o 100 ml). Los totales de arriba se calculan a partir de ellos. */
	por_100g: Valores;
	es_producto: boolean;
	marca: string;
	busqueda: string;
};

type Valores = { kcal: number; proteina: number; carbos: number; grasa: number };

// Lo que devuelve Gemini por cada elemento: valores por 100 g, no del total.
type ItemGemini = {
	nombre: string;
	gramos: number;
	unidades: number;
	kcal_100g: number;
	proteina_100g: number;
	carbos_100g: number;
	grasa_100g: number;
	es_producto: boolean;
	marca: string;
	busqueda: string;
};

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const RETRY_STATUS = [500, 503, 504];
const MAX_LENGTH = 300;

const LIMITE_DISPOSITIVO = 8;
// Peticiones extra que da ver un anuncio bonificado, solo cuando ya no quedan.
const RECARGA_ANUNCIO = 5;
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
	RETURNING peticiones, extra
`;

type Uso = { usadas: number; extra: number };

const hoy = () => new Date().toISOString().slice(0, 10);

async function registrarUso(db: D1Database, deviceId: string) {
	const dia = hoy();
	const stmt = db.prepare(SQL_SUMAR);

	const [dispositivo, total] = await db.batch<{ peticiones: number; extra: number }>([
		stmt.bind(deviceId, dia),
		stmt.bind('__total__', dia),
	]);

	return {
		dispositivo: { usadas: dispositivo.results[0]?.peticiones ?? 0, extra: dispositivo.results[0]?.extra ?? 0 },
		usadasTotal: total.results[0]?.peticiones ?? 0,
	};
}

// Lee cuántas peticiones lleva hoy un dispositivo, sin sumar ninguna.
async function consultarUso(db: D1Database, deviceId: string): Promise<Uso> {
	const fila = await db
		.prepare('SELECT peticiones, extra FROM uso_diario WHERE device_id = ? AND dia = ?')
		.bind(deviceId, hoy())
		.first<{ peticiones: number; extra: number }>();
	return { usadas: fila?.peticiones ?? 0, extra: fila?.extra ?? 0 };
}

const SYSTEM_PROMPT = `Eres un nutricionista que estima calorías y macronutrientes de comidas españolas.
El usuario describe lo que ha comido en lenguaje natural, sin pesos.
Reglas:
- Separa el plato en ingredientes principales.
- Si no hay cantidad, asume una ración normal de un adulto en España.
- Si el usuario indica cantidad ("2 huevos", "media pizza", "200 g"), respétala.
- Incluye siempre el aceite de cocinar o aliñar si el plato lo lleva normalmente.
- Bebidas: inclúyelas si las menciona.
- "gramos" es el peso cocinado/consumido del total del elemento, no de una unidad (en bebidas, ml).
- kcal_100g, proteina_100g, carbos_100g y grasa_100g son los valores POR 100 g (o 100 ml) del alimento tal y como se come, no del total. Usa los valores de referencia habituales de las tablas de composición de alimentos españolas (BEDCA). Para el mismo alimento da siempre los mismos valores.
- "unidades": cuántas unidades o piezas son, si se cuenta por unidades ("2 huevos" → nombre "Huevo", unidades 2, gramos los de los dos). Si no se cuenta por unidades (un plato, aceite, arroz…), 1. Puede ser decimal ("media pizza" → 0.5).
- Nombres de ingredientes cortos, en español y en singular. Usa siempre el mismo nombre para el mismo alimento (ej: siempre "Pechuga de pollo", no a veces "Pollo (pechuga)"). Añade la forma de cocinarlo solo si cambia sus valores (ej: "Patata frita" frente a "Patata cocida").
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
					unidades: { type: 'NUMBER' },
					kcal_100g: { type: 'NUMBER' },
					proteina_100g: { type: 'NUMBER' },
					carbos_100g: { type: 'NUMBER' },
					grasa_100g: { type: 'NUMBER' },
					es_producto: { type: 'BOOLEAN' },
					marca: { type: 'STRING' },
					busqueda: { type: 'STRING' },
				},
				required: ['nombre', 'gramos', 'unidades', 'kcal_100g', 'proteina_100g', 'carbos_100g', 'grasa_100g', 'es_producto', 'marca', 'busqueda'],
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
	const result = await generarJson<{ items?: ItemGemini[] }>(
		{
			systemPrompt: SYSTEM_PROMPT,
			parts: [{ text: texto }],
			schema: RESPONSE_SCHEMA,
			// 0 para que el mismo texto dé (casi siempre) los mismos valores.
			temperature: 0,
			maxOutputTokens: 1024,
		},
		apiKey,
	);
	if ('error' in result) return result;

	const items: Item[] = (result.data.items ?? [])
		.filter((i) => i && typeof i.nombre === 'string' && i.nombre.trim())
		.map((i) => {
			const esProducto = i.es_producto === true && !!cleanText(i.busqueda);
			const gramos = clean(i.gramos, 0);
			const por100g: Valores = {
				kcal: clean(i.kcal_100g, 0),
				proteina: clean(i.proteina_100g),
				carbos: clean(i.carbos_100g),
				grasa: clean(i.grasa_100g),
			};
			// Los totales se calculan aquí, no los hace la IA: así 200 g son siempre el doble que 100 g.
			const f = gramos / 100;
			return {
				nombre: i.nombre.trim(),
				gramos,
				// Sin unidades (o un valor raro) se cuenta como una.
				unidades: clean(i.unidades, 1) || 1,
				kcal: clean(por100g.kcal * f, 0),
				proteina: clean(por100g.proteina * f),
				carbos: clean(por100g.carbos * f),
				grasa: clean(por100g.grasa * f),
				por_100g: por100g,
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

function leerLimite(valor: string | undefined, porDefecto: number) {
	const n = Number(valor);
	return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

function limiteDispositivo(env: Env) {
	return leerLimite(env.LIMITE_DISPOSITIVO, LIMITE_DISPOSITIVO);
}

/** Límite de hoy del dispositivo: el diario más lo recargado viendo anuncios. */
function limiteDeHoy(uso: Uso, env: Env) {
	return limiteDispositivo(env) + uso.extra;
}

function restantes(uso: Uso, env: Env) {
	return Math.max(0, limiteDeHoy(uso, env) - uso.usadas);
}

/**
 * Lo que ve el usuario: el límite diario, o tras ver un anuncio la recarga ("3/5 de la recarga").
 * Con un solo anuncio a la vez (solo se recarga con 0 restantes), lo que queda es siempre de la última.
 */
function usoVisible(uso: Uso, env: Env) {
	const recargado = uso.extra > 0;
	return {
		limite: recargado ? RECARGA_ANUNCIO : limiteDispositivo(env),
		restantes: restantes(uso, env),
		recargado,
	};
}

// Añade a la respuesta cuántas peticiones le quedan hoy al dispositivo.
function conRestantes(res: Response, uso: Uso, env: Env) {
	const v = usoVisible(uso, env);
	res.headers.set('X-Peticiones-Restantes', String(v.restantes));
	res.headers.set('X-Peticiones-Limite', String(v.limite));
	res.headers.set('X-Peticiones-Recargado', v.recargado ? '1' : '0');
	return res;
}

function limiteSuperado(uso: { dispositivo: Uso; usadasTotal: number }, env: Env) {
	const limiteGlobal = leerLimite(env.LIMITE_GLOBAL, LIMITE_GLOBAL);
	if (uso.usadasTotal > limiteGlobal) {
		return json({ error: 'servicio_lleno' }, 429);
	}
	if (uso.dispositivo.usadas > limiteDeHoy(uso.dispositivo, env)) {
		// "recarga": cuántas da un anuncio. La app ofrece verlo al recibir este error.
		return json({ error: 'limite_diario', limite: limiteDeHoy(uso.dispositivo, env), recarga: RECARGA_ANUNCIO }, 429);
	}
	return null;
}

async function rutaUso(env: Env, deviceId: string) {
	const uso = await consultarUso(env.DB, deviceId);
	return json({ ...usoVisible(uso, env), recarga: RECARGA_ANUNCIO });
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

	const uso = await registrarUso(env.DB, deviceId);
	const limite = limiteSuperado(uso, env);
	if (limite) return conRestantes(limite, uso.dispositivo, env);

	const result = await analizar(texto, env.GEMINI_API_KEY);
	if ('error' in result) return conRestantes(json({ error: result.error }, result.status), uso.dispositivo, env);

	return conRestantes(json(result), uso.dispositivo, env);
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

	const uso = await registrarUso(env.DB, deviceId);
	const limite = limiteSuperado(uso, env);
	if (limite) return conRestantes(limite, uso.dispositivo, env);

	const result = await leerEtiqueta(imagen, tipo, env.GEMINI_API_KEY);
	if ('error' in result) return conRestantes(json({ error: result.error }, result.status), uso.dispositivo, env);

	return conRestantes(json(result), uso.dispositivo, env);
}

// ---------- Recompensa por ver un anuncio (verificación en servidor de AdMob) ----------
//
// Cuando alguien termina de ver un anuncio bonificado, AdMob llama a
// GET /recompensa?ad_network=…&ad_unit=…&custom_data=<device id>&…&signature=…&key_id=…
// La firma (ECDSA P-256 + SHA-256) cubre la query tal cual llega, hasta antes de "&signature=".
// Las claves públicas de Google se descargan y se guardan como mucho 24 h.
// https://developers.google.com/admob/android/ssv

const ADMOB_KEYS_URL = 'https://gstatic.com/admob/reward/verifier-keys.json';
const ADMOB_KEYS_TTL_MS = 24 * 60 * 60 * 1000;
let clavesAdmob: { claves: Map<string, CryptoKey>; descargadas: number } | null = null;

async function descargarClavesAdmob() {
	const res = await fetch(ADMOB_KEYS_URL);
	if (!res.ok) throw new Error(`verifier-keys.json: ${res.status}`);
	const data = (await res.json()) as { keys?: { keyId: number | string; base64: string }[] };
	const claves = new Map<string, CryptoKey>();
	for (const k of data.keys ?? []) {
		const der = Uint8Array.from(atob(k.base64), (c) => c.charCodeAt(0));
		claves.set(String(k.keyId), await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
	}
	clavesAdmob = { claves, descargadas: Date.now() };
	return claves;
}

async function claveAdmob(keyId: string) {
	const caducada = !clavesAdmob || Date.now() - clavesAdmob.descargadas > ADMOB_KEYS_TTL_MS;
	let clave = caducada ? undefined : clavesAdmob!.claves.get(keyId);
	// Google rota las claves: si no está la que piden, se vuelve a descargar una vez.
	if (!clave) clave = (await descargarClavesAdmob()).get(keyId);
	return clave ?? null;
}

function base64UrlABytes(s: string) {
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** WebCrypto quiere la firma ECDSA como r||s (64 bytes); AdMob la manda en DER. */
function derAFirmaCruda(der: Uint8Array) {
	if (der[0] !== 0x30) return null;
	let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
	const leerEntero = () => {
		if (der[i] !== 0x02) return null;
		const len = der[i + 1];
		let v = der.subarray(i + 2, i + 2 + len);
		i += 2 + len;
		while (v.length > 32 && v[0] === 0) v = v.subarray(1);
		if (v.length > 32) return null;
		const out = new Uint8Array(32);
		out.set(v, 32 - v.length);
		return out;
	};
	const r = leerEntero();
	const s = leerEntero();
	if (!r || !s) return null;
	const firma = new Uint8Array(64);
	firma.set(r, 0);
	firma.set(s, 32);
	return firma;
}

async function firmaAdmobValida(query: string) {
	const corte = query.indexOf('&signature=');
	if (corte < 0) return false;
	const firmado = query.slice(0, corte);
	const params = new URLSearchParams(query.slice(corte + 1));
	const firma = params.get('signature');
	const keyId = params.get('key_id');
	if (!firma || !keyId) return false;

	const clave = await claveAdmob(keyId);
	if (!clave) return false;
	const cruda = derAFirmaCruda(base64UrlABytes(firma));
	if (!cruda) return false;
	return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, cruda, new TextEncoder().encode(firmado));
}

async function rutaRecompensa(request: Request, env: Env) {
	// La query sin tocar: la firma va sobre el texto exacto, con su codificación y su orden.
	const url = request.url;
	const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
	const params = new URLSearchParams(query);

	// Sin firma no se da nada, pero se responde 200 por si AdMob prueba la URL al guardarla.
	if (!params.has('signature')) return json({ ok: false, motivo: 'sin_firma' });
	if (!(await firmaAdmobValida(query))) {
		console.warn('recompensa rechazada: firma_invalida', { key_id: params.get('key_id'), ad_unit: params.get('ad_unit') });
		return json({ error: 'firma_invalida' }, 403);
	}

	const deviceId = params.get('custom_data') ?? '';
	const transaccion = params.get('transaction_id') ?? '';
	// Firmado por Google pero sin un ID de Mako: es la prueba de la URL desde AdMob, que manda
	// un ad_unit de ejemplo y sin custom_data. 200 para que AdMob la dé por buena, sin dar nada.
	if (!DEVICE_ID_REGEX.test(deviceId) || !transaccion) {
		console.log('recompensa sin dispositivo (prueba de AdMob)', { ad_unit: params.get('ad_unit') });
		return json({ ok: false, motivo: 'datos_invalidos' });
	}

	// Solo vale nuestro bloque de anuncios: cualquiera podría apuntar otro bloque suyo a esta URL.
	const bloque = env.ADMOB_REWARDED_AD_UNIT?.split('/').pop();
	if (bloque && params.get('ad_unit') !== bloque) {
		console.warn('recompensa rechazada: bloque_incorrecto', { ad_unit: params.get('ad_unit') });
		return json({ error: 'bloque_incorrecto' }, 403);
	}

	// AdMob reintenta si no recibe 200: cada transacción se cuenta una sola vez.
	const dia = hoy();
	const nueva = await env.DB.prepare(
		`INSERT INTO recompensas (transaction_id, device_id, dia) VALUES (?, ?, ?)
		 ON CONFLICT(transaction_id) DO NOTHING RETURNING transaction_id`,
	)
		.bind(transaccion, deviceId, dia)
		.first();
	if (!nueva) return json({ ok: true, acreditada: false, motivo: 'repetida' });

	// Solo se recarga si ya no le quedaba ninguna. Queda en exactamente RECARGA_ANUNCIO restantes
	// (las peticiones rechazadas por el límite también suman en "peticiones").
	const base = limiteDispositivo(env);
	const recarga = await env.DB.prepare(
		`UPDATE uso_diario SET extra = peticiones - ? + ?
		 WHERE device_id = ? AND dia = ? AND peticiones >= ? + extra
		 RETURNING extra`,
	)
		.bind(base, RECARGA_ANUNCIO, deviceId, dia, base)
		.first();

	await env.DB.prepare('UPDATE recompensas SET acreditada = ? WHERE transaction_id = ?')
		.bind(recarga ? 1 : 0, transaccion)
		.run();

	return json({ ok: true, acreditada: Boolean(recarga) });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const url = new URL(request.url);

			if (url.pathname === '/recompensa') {
				if (request.method !== 'GET') return json({ error: 'metodo_no_permitido' }, 405);
				return await rutaRecompensa(request, env);
			}

			const rutasPost: Record<string, typeof rutaAnalizar> = { '/analizar': rutaAnalizar, '/etiqueta': rutaEtiqueta };
			const esUso = url.pathname === '/uso';
			const ruta = rutasPost[url.pathname];
			if (!ruta && !esUso) {
				return json({ error: 'no_encontrado' }, 404);
			}
			if (request.method !== (esUso ? 'GET' : 'POST')) {
				return json({ error: 'metodo_no_permitido' }, 405);
			}

			const deviceId = request.headers.get('X-Device-Id') ?? '';
			if (!DEVICE_ID_REGEX.test(deviceId)) {
				return json({ error: 'sin_dispositivo' }, 400);
			}
			if (esUso) return await rutaUso(env, deviceId);

			if (!env.GEMINI_API_KEY) {
				return json({ error: 'falta_api_key' }, 500);
			}

			return await ruta(request, env, deviceId);
		} catch (err) {
			console.error(err);
			return json({ error: 'interno', detalle: String(err) }, 500);
		}
	},
} satisfies ExportedHandler<Env>;
