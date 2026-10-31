const BASE_URL = "https://es.openfoodfacts.org/cgi/search.pl";
const USER_AGENT = "MacrosIA/0.1 (tu-email@ejemplo.com)";

const VARIANTES = ["zero", "light", "sin azucar", "diet", "sin cafeina", "cero", "desnatad", "ultra", "0"];

export type Producto100g = {
  nombre: string;
  kcal: number;
  proteina: number;
  carbos: number;
  grasa: number;
};

export function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palabras(s: string) {
  return normalizar(s)
    .split(" ")
    .filter((w) => w.length > 1);
}

function contieneVariante(textoN: string, variante: string) {
  return ` ${textoN} `.includes(` ${variante}`);
}

function n(v: unknown) {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

function coincideMarca(marca: string, brands: string) {
  const marcaN = normalizar(marca);
  if (!marcaN) return true;
  const primera = marcaN.split(" ")[0];
  const lista = String(brands).split(",").map(normalizar).filter(Boolean);
  return lista.some((b) => b.includes(marcaN) || marcaN.includes(b) || b.split(" ")[0] === primera);
}

function puntuar(nombreProducto: string, busqueda: string) {
  const nombreN = normalizar(nombreProducto);
  const busquedaN = normalizar(busqueda);

  let score = palabras(busqueda).filter((w) => nombreN.includes(w)).length;

  for (const v of VARIANTES) {
    const enProducto = contieneVariante(nombreN, v);
    const pedida = contieneVariante(busquedaN, v);
    if (enProducto !== pedida) score -= 3;
  }

  return score;
}

function extraerMacros(p: any): Omit<Producto100g, "nombre"> | null {
  const nut = p.nutriments ?? {};
  let kcal = n(nut["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = n(nut["energy_100g"]);
    if (kj != null) kcal = kj / 4.184;
  }
  const proteina = n(nut.proteins_100g);
  const carbos = n(nut.carbohydrates_100g);
  const grasa = n(nut.fat_100g);
  if (kcal == null || proteina == null || carbos == null || grasa == null) return null;
  return { kcal, proteina, carbos, grasa };
}

export async function buscarEnOFF(marca: string, busqueda: string): Promise<Producto100g | null> {
  const params = new URLSearchParams({
    search_terms: `${busqueda} ${marca}`.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    fields: "product_name,product_name_es,brands,nutriments",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OFF ${res.status}`);

    const data = await res.json();
    const productos: any[] = data?.products ?? [];

    let mejor: Producto100g | null = null;
    let mejorScore = -Infinity;

    for (const p of productos) {
      if (!coincideMarca(marca, p.brands ?? "")) continue;

      const macros = extraerMacros(p);
      if (!macros) continue;

      const nombre = String(p.product_name_es || p.product_name || busqueda).trim();
      const score = puntuar(nombre, busqueda);

      if (score > mejorScore) {
        mejorScore = score;
        mejor = { nombre, ...macros };
      }
    }

    return mejor;
  } finally {
    clearTimeout(timeout);
  }
}

const PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";

export type ProductoCodigo = Producto100g & {
  marca: string;
  gramosSugeridos: number;
};

export async function buscarPorCodigo(codigo: string): Promise<ProductoCodigo | null> {
  const params = new URLSearchParams({
    fields: "product_name,product_name_es,brands,nutriments,serving_quantity,product_quantity",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${PRODUCT_URL}/${encodeURIComponent(codigo)}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (res.status == 404) return null;
    if (!res.ok) throw new Error(`OFF ${res.status}`);

    const data = await res.json();
    if (data?.status !== 1 || !data.product) return null;

    const p = data.product;
    const macros = extraerMacros(p);
    if (!macros) return null;

    const nombre = String(p.product_name_es || p.product_name || "Producto").trim();
    const marca = String(p.brands ?? "")
      .split(",")[0]
      .trim();
    const gramos = n(p.serving_quantity) || n(p.product_quantity) || 100;

    return { nombre, marca, gramosSugeridos: Math.round(gramos), ...macros };
  } finally {
    clearTimeout(timeout);
  }
}
