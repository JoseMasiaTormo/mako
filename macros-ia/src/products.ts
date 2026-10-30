import { SQLiteDatabase } from "expo-sqlite";
import { AiItem } from "./api";
import { getCachedProduct, saveCachedProduct } from "./db";
import { buscarEnOFF, normalizar, Producto100g } from "./openfoodfacts";

const REINTENTAR_NO_ENCONTRADO_MS = 7 * 24 * 60 * 60 * 1000;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function claveDe(marca: string, busqueda: string) {
  return `${normalizar(marca)}|${normalizar(busqueda)}`;
}

async function buscarProducto(db: SQLiteDatabase, marca: string, busqueda: string): Promise<Producto100g | null> {
  const clave = claveDe(marca, busqueda);
  const cached = await getCachedProduct(db, clave);

  if (cached) {
    if (cached.encontrado) {
      return {
        nombre: cached.nombre ?? busqueda,
        kcal: cached.kcal ?? 0,
        proteina: cached.proteina ?? 0,
        carbos: cached.carbos ?? 0,
        grasa: cached.grasa ?? 0,
      };
    }
    const edad = Date.now() - new Date(cached.actualizado).getTime();
    if (edad < REINTENTAR_NO_ENCONTRADO_MS) return null;
  }

  const producto = await buscarEnOFF(marca, busqueda);
  await saveCachedProduct(db, clave, producto);
  return producto;
}

export async function enriquecerItems(db: SQLiteDatabase, items: AiItem[]): Promise<AiItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.es_producto || !item.busqueda) return item;

      try {
        const p = await buscarProducto(db, item.marca, item.busqueda);
        if (!p) return item;

        const f = item.gramos / 100;
        const incluyeMarca = item.marca && normalizar(p.nombre).includes(normalizar(item.marca));
        const nombre = item.marca && !incluyeMarca ? `${p.nombre} (${item.marca})` : p.nombre;

        return {
          ...item,
          nombre,
          kcal: Math.round(p.kcal * f),
          proteina: round1(p.proteina * f),
          carbos: round1(p.carbos * f),
          grasa: round1(p.grasa * f),
          fuente: "etiqueta" as const,
        };
      } catch {
        return item;
      }
    }),
  );
}
