const BASE_URL = "https://es.openfoodfacts.org/cgi/search.pl";
const USER_AGENT = "MacrosIA/0.1 (josemasia2004@gmail.com)";

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
    .trim();
}

function n(v: unknown) {
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) && x >= 0 ? x : null;
}

export async function buscarEnOFF(marca: string, busqueda: string): Promise<Producto100g | null> {
  const params = new URLSearchParams({
    search_terms: `${busqueda} ${marca}`.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "10",
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
    const marcaN = normalizar(marca);

    for (const p of productos) {
      if (marcaN && !normalizar(p.brands ?? "").includes(marcaN)) continue;

      const nut = p.nutriments ?? {};
      let kcal = n(nut["energy-kcal_100g"]);
      if (kcal == null) {
        const kj = n(nut["energy_100g"]);
        if (kj != null) kcal = kj / 4.184;
      }
      const proteina = n(nut.proteins_100g);
      const carbos = n(nut.carbohydrates_100g);
      const grasa = n(nut.fat_100g);
      if (kcal == null || proteina == null || carbos == null || grasa == null) continue;

      const nombre = String(p.product_name_es || p.product_name || busqueda).trim();
      return { nombre, kcal, proteina, carbos, grasa };
    }

    return null;
  } finally {
    clearTimeout(timeout);
  }
}
