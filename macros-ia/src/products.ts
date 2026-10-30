import { SQLiteDatabase } from "expo-sqlite";
import { AiItem } from "./api";
import { getCachedProduct, saveCachedProduct } from "./db";
import { buscarEnOFF, normalizar, Producto100g } from "./openfoodfacts";

const REINTENTAR_NO_ENCONTRADO_MS = 7 * 24 * 60 * 60 * 1000;

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
