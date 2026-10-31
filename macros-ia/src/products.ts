import { SQLiteDatabase } from "expo-sqlite";
import { AiItem } from "./api";
import { getCachedProduct, getMisProductos, MiProducto, saveCachedProduct } from "./db";
import { buscarEnOFF, coincideMarca, normalizar, palabras, Producto100g, variantesDistintas } from "./openfoodfacts";

const REINTENTAR_NO_ENCONTRADO_MS = 7 * 24 * 60 * 60 * 1000;
// Parte mínima de las palabras buscadas que tiene que tener el nombre de uno de Mis productos.
const COBERTURA_MINIMA = 0.6;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function claveDe(marca: string, busqueda: string) {
  return `${normalizar(marca)}|${normalizar(busqueda)}`;
}

/** "Yogur griego" + "Hacendado" → "Yogur griego (Hacendado)", salvo que el nombre ya incluya la marca. */
export function nombreConMarca(nombre: string, marca: string) {
  if (!marca || normalizar(nombre).includes(normalizar(marca))) return nombre;
  return `${nombre} (${marca})`;
}

/** Item de la lista con los valores de la etiqueta (por 100 g) escalados a los gramos indicados. */
export function itemDeEtiqueta(p: Producto100g, marca: string, gramos: number): AiItem {
  const f = gramos / 100;
  return {
    nombre: nombreConMarca(p.nombre, marca),
    gramos,
    kcal: Math.round(p.kcal * f),
    proteina: round1(p.proteina * f),
    carbos: round1(p.carbos * f),
    grasa: round1(p.grasa * f),
    es_producto: true,
    marca,
    busqueda: "",
    fuente: "etiqueta",
  };
}

function coincidePalabra(a: string, b: string) {
  // startsWith cubre plurales sencillos: "yogur" / "yogures".
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/** Busca entre Mis productos el que mejor encaja con la marca y el nombre que ha dado la IA. */
export function buscarEnMisProductos(productos: MiProducto[], marca: string, busqueda: string): MiProducto | null {
  const pedidas = palabras(busqueda);
  if (!pedidas.length) return null;

  let mejor: MiProducto | null = null;
  let mejorScore = -Infinity;

  for (const p of productos) {
    if (normalizar(marca) && !coincideMarca(marca, p.marca)) continue;
    if (variantesDistintas(p.nombre, busqueda) > 0) continue;

    const delProducto = palabras(p.nombre);
    const aciertos = pedidas.filter((w) => delProducto.some((x) => coincidePalabra(w, x))).length;
    if (aciertos / pedidas.length < COBERTURA_MINIMA) continue;

    // Más palabras acertadas es mejor; las palabras de sobra en el nombre restan un poco.
    const score = aciertos - 0.1 * (delProducto.length - aciertos);
    if (score > mejorScore) {
      mejorScore = score;
      mejor = p;
    }
  }

  return mejor;
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

/** Orden: Mis productos → caché local → Open Food Facts. */
export async function enriquecerItems(db: SQLiteDatabase, items: AiItem[]): Promise<AiItem[]> {
  const misProductos = items.some((i) => i.es_producto && i.busqueda) ? await getMisProductos(db).catch(() => []) : [];

  return Promise.all(
    items.map(async (item) => {
      if (!item.es_producto || !item.busqueda) return item;

      try {
        const p =
          buscarEnMisProductos(misProductos, item.marca, item.busqueda) ??
          (await buscarProducto(db, item.marca, item.busqueda));
        if (!p) return item;

        const enriched = itemDeEtiqueta(p, item.marca, item.gramos);
        return { ...item, ...enriched, es_producto: item.es_producto, busqueda: item.busqueda };
      } catch {
        return item;
      }
    }),
  );
}
