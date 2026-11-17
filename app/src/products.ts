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

/**
 * Item de la lista con los valores de la etiqueta (por 100 g) escalados a los gramos indicados.
 * Si no se dice el peso de una unidad, los gramos indicados cuentan como una.
 */
export function itemDeEtiqueta(p: Producto100g, marca: string, gramos: number, unidadG = gramos): AiItem {
  const f = gramos / 100;
  return {
    nombre: nombreConMarca(p.nombre, marca),
    gramos,
    unidad_g: unidadG,
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

// Palabras que no cuentan al comparar nombres: "tortilla de patatas" = "tortilla patatas".
const PALABRAS_VACIAS = new Set(["de", "del", "con", "la", "el", "los", "las", "al", "en", "un", "una"]);

function palabrasClave(s: string) {
  return palabras(s).filter((w) => !PALABRAS_VACIAS.has(w));
}

function coincidePalabraExacta(a: string, b: string) {
  // Solo plurales: "magdalena" / "magdalenas", "yogur" / "yogures". No "pan" / "panecillos".
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return larga.startsWith(corta) && larga.length - corta.length <= 2;
}

function contiene(a: string[], b: string[]) {
  return a.every((w) => b.some((x) => coincidePalabraExacta(w, x)));
}

/**
 * Busca entre Mis productos uno cuyo nombre sea el texto dado (sin importar orden, mayúsculas,
 * tildes, plurales ni si se escribe la marca). Más estricto que buscarEnMisProductos: sirve para
 * comidas sin marca, donde "pollo" no debe coincidir con "pollo al curry de mi madre".
 */
export function buscarPorNombre(productos: MiProducto[], texto: string): MiProducto | null {
  const pedidas = palabrasClave(texto);
  if (!pedidas.length) return null;

  return (
    productos.find((p) => {
      if (variantesDistintas(p.nombre, texto) > 0) return false;
      const nombre = palabrasClave(p.nombre);
      const conMarca = palabrasClave(`${p.nombre} ${p.marca}`);
      // Todas las palabras escritas están en el producto, y todas las del nombre están en lo escrito.
      return contiene(pedidas, conMarca) && contiene(nombre, pedidas);
    }) ?? null
  );
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

/**
 * Item con los valores de uno de Mis productos. Si tiene ración, se toma como peso de una unidad
 * y se mantienen las unidades que dijo la IA ("2 kinder joy" → 2 × su ración).
 */
function deMisProductos(mio: MiProducto, item: AiItem): AiItem {
  if (!mio.racion_g || item.unidad_g <= 0) return itemDeEtiqueta(mio, mio.marca, item.gramos, item.unidad_g);
  const unidades = item.gramos / item.unidad_g;
  return itemDeEtiqueta(mio, mio.marca, Math.round(unidades * mio.racion_g * 10) / 10, mio.racion_g);
}

/**
 * Productos de marca: Mis productos → caché local → Open Food Facts.
 * Resto: Mis productos, solo si el nombre coincide (comidas creadas a mano).
 */
export async function enriquecerItems(db: SQLiteDatabase, items: AiItem[]): Promise<AiItem[]> {
  const misProductos = await getMisProductos(db).catch(() => []);

  return Promise.all(
    items.map(async (item) => {
      if (!item.es_producto || !item.busqueda) {
        const mio = buscarPorNombre(misProductos, item.nombre);
        return mio ? { ...item, ...deMisProductos(mio, item), es_producto: false } : item;
      }

      try {
        const mio = buscarEnMisProductos(misProductos, item.marca, item.busqueda);
        const p = mio ?? (await buscarProducto(db, item.marca, item.busqueda));
        if (!p) return item;

        const enriched = mio ? deMisProductos(mio, item) : itemDeEtiqueta(p, item.marca, item.gramos, item.unidad_g);
        return { ...item, ...enriched, es_producto: item.es_producto, busqueda: item.busqueda };
      } catch {
        return item;
      }
    }),
  );
}
