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

export class ApiError extends Error {}

const MESSAGES: Record<string, string> = {
  cuota: "Se ha alcanzado el límite de uso. Prueba más tarde o añádelo a mano.",
  saturado: "La IA está saturada ahora mismo. Prueba en unos segundos.",
  texto_largo: "El texto es demasiado largo.",
  texto_vacio: "Escribe lo que has comido.",
  limite_diario:
    "Has llegado al límite de análisis con IA de hoy. Mañana se reinicia. Mientras, puedes escanear el código de barras o añadirlo a mano.",
  servicio_lleno:
    "La app ha llegado a su límite de uso de hoy. Mañana se reinicia. Mientras, puedes escanear el código de barras o añadirlo a mano.",
};

export async function analizarComida(texto: string, deviceId: string): Promise<AiItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/analizar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": deviceId,
      },
      body: JSON.stringify({ texto }),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError("No se pudo conectar. Revisa tu conexión a internet.");
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(MESSAGES[data?.error] ?? "No se pudo analizar la comida. Inténtalo de nuevo.");
  }

  const items: Omit<AiItem, "fuente">[] = data?.items ?? [];
  if (!items.length) {
    throw new ApiError("No he reconocido ninguna comida en el texto.");
  }
  return items.map((i) => ({ ...i, fuente: "ia" as const }));
}
