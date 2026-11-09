import { API_URL } from "./config";

export type AiItem = {
  nombre: string;
  gramos: number;
  kcal: number;
  proteina: number;
  carbos: number;
  grasa: number;
  es_producto: boolean;
  marca: string;
  busqueda: string;
  fuente: "ia" | "etiqueta";
};

/** Valores leídos de la foto de una etiqueta (por 100 g). */
export type EtiquetaLeida = {
  kcal: number;
  proteina: number;
  carbos: number;
  grasa: number;
  nombre: string;
  marca: string;
  racion_g: number | null;
};

export class ApiError extends Error {}

// ---------- Peticiones de IA restantes hoy ----------
// El Worker devuelve en cada respuesta cuántas le quedan al dispositivo.
// Se guarda aquí para que cualquier pantalla pueda mostrar la cuenta atrás.

export type Uso = { restantes: number; limite: number };

let usoActual: Uso | null = null;
const oyentes = new Set<(u: Uso | null) => void>();

function setUso(u: Uso) {
  usoActual = u;
  oyentes.forEach((f) => f(u));
}

export function getUso() {
  return usoActual;
}

export function suscribirUso(f: (u: Uso | null) => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

function leerUsoDeCabeceras(res: Response) {
  const restantes = Number(res.headers.get("X-Peticiones-Restantes"));
  const limite = Number(res.headers.get("X-Peticiones-Limite"));
  if (res.headers.has("X-Peticiones-Restantes") && Number.isFinite(restantes) && limite > 0) {
    setUso({ restantes, limite });
  }
}

/** Pregunta al Worker cuántas peticiones quedan hoy (no gasta ninguna). */
export async function consultarUso(deviceId: string) {
  try {
    const res = await fetch(`${API_URL}/uso`, { headers: { "X-Device-Id": deviceId } });
    if (!res.ok) return;
    const data = await res.json();
    if (typeof data?.restantes === "number" && typeof data?.limite === "number") {
      setUso({ restantes: data.restantes, limite: data.limite });
    }
  } catch {
    // Sin conexión: se mantiene el último valor conocido.
  }
}

const MESSAGES: Record<string, string> = {
  cuota: "Se ha alcanzado el límite de uso. Prueba más tarde o añádelo a mano.",
  saturado: "La IA está saturada ahora mismo. Prueba en unos segundos.",
  texto_largo: "El texto es demasiado largo.",
  texto_vacio: "Escribe lo que has comido.",
  limite_diario:
    "Has llegado al límite de análisis con IA de hoy. Mañana se reinicia. Mientras, puedes escanear el código de barras o añadirlo a mano.",
  servicio_lleno:
    "La app ha llegado a su límite de uso de hoy. Mañana se reinicia. Mientras, puedes escanear el código de barras o añadirlo a mano.",
  imagen_vacia: "No se ha podido enviar la foto. Inténtalo de nuevo.",
  imagen_grande: "La foto es demasiado grande. Inténtalo de nuevo.",
  imagen_invalida: "La foto no es válida. Inténtalo de nuevo.",
  etiqueta_ilegible:
    "No he podido leer la tabla nutricional. Haz otra foto de cerca, con buena luz y sin reflejos, o rellena los datos a mano.",
};

const MSG_SIN_CONEXION = "No se pudo conectar. Revisa tu conexión a internet.";
const MSG_TIMEOUT = "La respuesta está tardando demasiado. Inténtalo de nuevo en unos segundos.";

async function postApi(path: string, body: unknown, deviceId: string, timeoutMs: number, fallback: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(controller.signal.aborted ? MSG_TIMEOUT : MSG_SIN_CONEXION);
  } finally {
    clearTimeout(timeout);
  }

  leerUsoDeCabeceras(res);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(MESSAGES[data?.error] ?? fallback);
  }
  return data;
}

export async function analizarComida(texto: string, deviceId: string): Promise<AiItem[]> {
  const data = await postApi(
    "/analizar",
    { texto },
    deviceId,
    20000,
    "No se pudo analizar la comida. Inténtalo de nuevo.",
  );

  const items: Omit<AiItem, "fuente">[] = data?.items ?? [];
  if (!items.length) {
    throw new ApiError("No he reconocido ninguna comida en el texto.");
  }
  return items.map((i) => ({ ...i, fuente: "ia" as const }));
}

function numero(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Manda la foto (JPEG en base64) al Worker, que la lee con Gemini. */
export async function leerEtiqueta(imagenBase64: string, deviceId: string): Promise<EtiquetaLeida> {
  const fallback = "No se pudo leer la etiqueta. Inténtalo de nuevo.";
  const data = await postApi("/etiqueta", { imagen: imagenBase64, tipo: "image/jpeg" }, deviceId, 30000, fallback);
  if (!data) throw new ApiError(fallback);

  const racion = numero(data.racion_g);
  return {
    kcal: numero(data.kcal),
    proteina: numero(data.proteina),
    carbos: numero(data.carbos),
    grasa: numero(data.grasa),
    nombre: typeof data.nombre === "string" ? data.nombre : "",
    marca: typeof data.marca === "string" ? data.marca : "",
    racion_g: racion > 0 ? racion : null,
  };
}
