import { SQLiteDatabase } from "expo-sqlite";
import type { Producto100g } from "./openfoodfacts";

export type Meal = {
  id: number;
  date: string;
  name: string;
  grams: number | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  created_at: string;
};

export type NewMeal = Omit<Meal, "id" | "created_at">;

export type Totals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

const DB_VERSION = 5;

export async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let version = row?.user_version ?? 0;
  if (version >= DB_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                name TEXT NOT NULL,
                grams REAL,
                kcal REAL NOT NULL DEFAULT 0,
                protein REAL NOT NULL DEFAULT 0,
                carbs REAL NOT NULL DEFAULT 0,
                fat REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
        `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    version = 2;
  }

  if (version === 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS products_cache (
        clave TEXT PRIMARY KEY NOT NULL,
        encontrado INTEGER NOT NULL,
        nombre TEXT,
        kcal REAL,
        proteina REAL,
        carbos REAL,
        grasa REAL,
        actualizado TEXT NOT NULL
      );
    `);
    version = 3;
  }

  if (version === 3) {
    await db.execAsync("DELETE FROM products_cache;");
    version = 4;
  }

  if (version === 4) {
    // Productos que añade el usuario. UNIQUE en codigo permite varios NULL (productos sin código).
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mis_productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        nombre TEXT NOT NULL,
        marca TEXT NOT NULL DEFAULT '',
        kcal REAL NOT NULL DEFAULT 0,
        proteina REAL NOT NULL DEFAULT 0,
        carbos REAL NOT NULL DEFAULT 0,
        grasa REAL NOT NULL DEFAULT 0,
        racion_g REAL,
        creado TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    version = 5;
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

export function getMealsByDate(db: SQLiteDatabase, date: string) {
  return db.getAllAsync<Meal>("SELECT * FROM meals WHERE date = ? ORDER BY created_at ASC, id ASC", date);
}

export async function addMeal(db: SQLiteDatabase, meal: NewMeal) {
  const result = await db.runAsync(
    "INSERT INTO meals (date, name, grams, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)",
    meal.date,
    meal.name,
    meal.grams,
    meal.kcal,
    meal.protein,
    meal.carbs,
    meal.fat,
  );
  return result.lastInsertRowId;
}

export function deleteMeal(db: SQLiteDatabase, id: number) {
  return db.runAsync("DELETE FROM meals WHERE id = ?", id);
}

export async function getSettings(db: SQLiteDatabase, key: string) {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export function setSettings(db: SQLiteDatabase, key: string, value: string) {
  return db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, value);
}

export function sumTotals(meals: Meal[]): Totals {
  return meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export type CachedProduct = {
  clave: string;
  encontrado: number;
  nombre: string | null;
  kcal: number | null;
  proteina: number | null;
  carbos: number | null;
  grasa: number | null;
  actualizado: string;
};

export function getCachedProduct(db: SQLiteDatabase, clave: string) {
  return db.getFirstAsync<CachedProduct>("SELECT * FROM products_cache WHERE clave = ?", clave);
}

export function saveCachedProduct(db: SQLiteDatabase, clave: string, p: Producto100g | null) {
  return db.runAsync(
    `INSERT OR REPLACE INTO products_cache
      (clave, encontrado, nombre, kcal, proteina, carbos, grasa, actualizado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    clave,
    p ? 1 : 0,
    p?.nombre ?? null,
    p?.kcal ?? null,
    p?.proteina ?? null,
    p?.carbos ?? null,
    p?.grasa ?? null,
    new Date().toISOString(),
  );
}

/** Producto añadido por el usuario. Valores por 100 g. */
export type MiProducto = {
  id: number;
  codigo: string | null;
  nombre: string;
  marca: string;
  kcal: number;
  proteina: number;
  carbos: number;
  grasa: number;
  racion_g: number | null;
  creado: string;
};

export type NuevoMiProducto = Omit<MiProducto, "id" | "creado">;

export function getMiProductoPorCodigo(db: SQLiteDatabase, codigo: string) {
  return db.getFirstAsync<MiProducto>("SELECT * FROM mis_productos WHERE codigo = ?", codigo);
}

export function getMisProductos(db: SQLiteDatabase) {
  return db.getAllAsync<MiProducto>("SELECT * FROM mis_productos ORDER BY creado DESC, id DESC");
}

/** Guarda un producto. Si ya hay uno con el mismo código, lo actualiza. Devuelve su id. */
export async function saveMiProducto(db: SQLiteDatabase, p: NuevoMiProducto) {
  const row = await db.getFirstAsync<{ id: number }>(
    `INSERT INTO mis_productos (codigo, nombre, marca, kcal, proteina, carbos, grasa, racion_g)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(codigo) DO UPDATE SET
      nombre = excluded.nombre,
      marca = excluded.marca,
      kcal = excluded.kcal,
      proteina = excluded.proteina,
      carbos = excluded.carbos,
      grasa = excluded.grasa,
      racion_g = excluded.racion_g
    RETURNING id`,
    p.codigo,
    p.nombre,
    p.marca,
    p.kcal,
    p.proteina,
    p.carbos,
    p.grasa,
    p.racion_g,
  );
  return row?.id ?? null;
}

export function deleteMiProducto(db: SQLiteDatabase, id: number) {
  return db.runAsync("DELETE FROM mis_productos WHERE id = ?", id);
}

export type Goals = Totals;

const GOAL_KEYS = {
  kcal: "obj_kcal",
  protein: "obj_proteina",
  carbs: "obj_carbos",
  fat: "obj_grasa",
} as const;

export async function getGoals(db: SQLiteDatabase): Promise<Goals | null> {
  const keys = Object.values(GOAL_KEYS);
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(", ")})`,
    ...keys,
  );
  if (!rows.length) return null;

  const map: Record<string, number> = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    kcal: map[GOAL_KEYS.kcal] || 0,
    protein: map[GOAL_KEYS.protein] || 0,
    carbs: map[GOAL_KEYS.carbs] || 0,
    fat: map[GOAL_KEYS.fat] || 0,
  };
}

export async function saveGoals(db: SQLiteDatabase, goals: Goals) {
  await db.withTransactionAsync(async () => {
    for (const [field, key] of Object.entries(GOAL_KEYS)) {
      await setSettings(db, key, String(goals[field as keyof Goals]));
    }
  });
}
