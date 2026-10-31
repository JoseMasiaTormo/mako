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

const DB_VERSION = 4;

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
