import { SQLiteDatabase } from "expo-sqlite";
import { normalizar, type Producto100g } from "./openfoodfacts";

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
  /** Unidades, si la comida es un solo producto con peso por unidad conocido (calculado al leer). */
  unidades: number | null;
};

/** Ingrediente de una comida desglosada (lo que devuelve la IA). Valores para sus gramos. */
export type Ingrediente = {
  id: number;
  meal_id: number;
  nombre: string;
  gramos: number;
  kcal: number;
  proteina: number;
  carbos: number;
  grasa: number;
  fuente: "ia" | "etiqueta" | "manual";
  /** Gramos de una unidad (un huevo, un Kinder Joy…). 0 si no se sabe. */
  unidad_g: number;
};

export type NuevoIngrediente = Omit<Ingrediente, "id" | "meal_id">;

export type NewMeal = Omit<Meal, "id" | "created_at" | "unidades"> & { ingredientes?: NuevoIngrediente[] };

export type Totals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

const DB_VERSION = 10;

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

  if (version === 5) {
    // Agua bebida: una fila por cada vaso (o cantidad) que se apunta.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS water (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        ml REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_water_date ON water(date);
    `);
    version = 6;
  }

  if (version === 6) {
    // Desglose de cada comida, para poder editar los ingredientes después de guardarla.
    // Las comidas anteriores no tienen filas aquí y se editan por el total.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS meal_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meal_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        gramos REAL NOT NULL DEFAULT 0,
        kcal REAL NOT NULL DEFAULT 0,
        proteina REAL NOT NULL DEFAULT 0,
        carbos REAL NOT NULL DEFAULT 0,
        grasa REAL NOT NULL DEFAULT 0,
        fuente TEXT NOT NULL DEFAULT 'ia'
      );
      CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);
    `);
    version = 7;
  }

  if (version === 7) {
    // Peso de una unidad, para poder contar por unidades. En lo ya guardado, lo que se apuntó cuenta como una.
    await db.execAsync(`
      ALTER TABLE meal_items ADD COLUMN unidad_g REAL NOT NULL DEFAULT 0;
      UPDATE meal_items SET unidad_g = gramos;
    `);
    version = 8;
  }

  if (version === 8) {
    // Valores por 100 g de alimentos genéricos (sin marca) que ha estimado la IA. Se guarda la
    // primera estimación y se reutiliza, para que el mismo alimento dé siempre los mismos valores.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS alimentos_cache (
        clave TEXT PRIMARY KEY NOT NULL,
        kcal REAL NOT NULL,
        proteina REAL NOT NULL,
        carbos REAL NOT NULL,
        grasa REAL NOT NULL,
        actualizado TEXT NOT NULL
      );
    `);
    version = 9;
  }

  if (version === 9) {
    // Comidas favoritas: copia de una comida (con su desglose) para volver a apuntarla tal cual.
    // "clave" es el nombre normalizado: una sola favorita por nombre.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS favoritos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        grams REAL,
        kcal REAL NOT NULL DEFAULT 0,
        protein REAL NOT NULL DEFAULT 0,
        carbs REAL NOT NULL DEFAULT 0,
        fat REAL NOT NULL DEFAULT 0,
        creado TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS favorito_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        favorito_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        gramos REAL NOT NULL DEFAULT 0,
        kcal REAL NOT NULL DEFAULT 0,
        proteina REAL NOT NULL DEFAULT 0,
        carbos REAL NOT NULL DEFAULT 0,
        grasa REAL NOT NULL DEFAULT 0,
        fuente TEXT NOT NULL DEFAULT 'ia',
        unidad_g REAL NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_favorito_items_fav ON favorito_items(favorito_id);
    `);
    version = 10;
  }

  await db.execAsync(`PRAGMA user_version = ${DB_VERSION}`);
}

export function getMealsByDate(db: SQLiteDatabase, date: string) {
  // Las unidades solo tienen sentido si la comida es un único ingrediente con peso por unidad.
  return db.getAllAsync<Meal>(
    `SELECT m.*, (
      SELECT CASE WHEN COUNT(*) = 1 AND MAX(i.unidad_g) > 0 THEN MAX(i.gramos) / MAX(i.unidad_g) END
      FROM meal_items i WHERE i.meal_id = m.id
    ) AS unidades
    FROM meals m WHERE m.date = ? ORDER BY m.created_at ASC, m.id ASC`,
    date,
  );
}

export async function addMeal(db: SQLiteDatabase, meal: NewMeal) {
  let id = 0;
  await db.withTransactionAsync(async () => {
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
    id = result.lastInsertRowId;
    for (const i of meal.ingredientes ?? []) {
      await db.runAsync(
        "INSERT INTO meal_items (meal_id, nombre, gramos, kcal, proteina, carbos, grasa, fuente, unidad_g) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        i.nombre,
        i.gramos,
        i.kcal,
        i.proteina,
        i.carbos,
        i.grasa,
        i.fuente,
        i.unidad_g,
      );
    }
  });
  return id;
}

export function getIngredientes(db: SQLiteDatabase, mealId: number) {
  return db.getAllAsync<Ingrediente>("SELECT * FROM meal_items WHERE meal_id = ? ORDER BY id ASC", mealId);
}

/**
 * Guarda los ingredientes editados de una comida: actualiza los que siguen, borra los quitados
 * y recalcula el total de la comida a partir de ellos.
 */
export async function updateIngredientes(db: SQLiteDatabase, mealId: number, ingredientes: Ingrediente[]) {
  const total = ingredientes.reduce(
    (acc, i) => ({
      gramos: acc.gramos + i.gramos,
      kcal: acc.kcal + i.kcal,
      proteina: acc.proteina + i.proteina,
      carbos: acc.carbos + i.carbos,
      grasa: acc.grasa + i.grasa,
    }),
    { gramos: 0, kcal: 0, proteina: 0, carbos: 0, grasa: 0 },
  );
  const ids = ingredientes.map((i) => i.id);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM meal_items WHERE meal_id = ? AND id NOT IN (${ids.map(() => "?").join(", ")})`,
      mealId,
      ...ids,
    );
    for (const i of ingredientes) {
      await db.runAsync(
        "UPDATE meal_items SET gramos = ?, kcal = ?, proteina = ?, carbos = ?, grasa = ? WHERE id = ?",
        i.gramos,
        i.kcal,
        i.proteina,
        i.carbos,
        i.grasa,
        i.id,
      );
    }
    await db.runAsync(
      "UPDATE meals SET grams = ?, kcal = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?",
      Math.round(total.gramos),
      Math.round(total.kcal),
      Math.round(total.proteina * 10) / 10,
      Math.round(total.carbos * 10) / 10,
      Math.round(total.grasa * 10) / 10,
      mealId,
    );
  });
}

/** Cambia los gramos de una comida y reescala kcal y macros en proporción (también su ingrediente, si lo tiene). */
export async function updateMealGrams(db: SQLiteDatabase, meal: Meal, grams: number) {
  const f = meal.grams && meal.grams > 0 ? grams / meal.grams : 1;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "UPDATE meals SET grams = ?, kcal = ?, protein = ?, carbs = ?, fat = ? WHERE id = ?",
      grams,
      meal.kcal * f,
      meal.protein * f,
      meal.carbs * f,
      meal.fat * f,
      meal.id,
    );
    await db.runAsync(
      `UPDATE meal_items SET gramos = gramos * ?, kcal = kcal * ?, proteina = proteina * ?, carbos = carbos * ?,
        grasa = grasa * ? WHERE meal_id = ?`,
      f,
      f,
      f,
      f,
      f,
      meal.id,
    );
  });
}

export async function deleteMeal(db: SQLiteDatabase, id: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM meal_items WHERE meal_id = ?", id);
    await db.runAsync("DELETE FROM meals WHERE id = ?", id);
  });
}

// ---------- Comidas favoritas ----------

export type Favorito = Omit<Meal, "date" | "created_at" | "unidades"> & { clave: string };

/** Clave de una favorita a partir del nombre: sin mayúsculas, tildes ni espacios de más. */
export function claveFavorito(nombre: string) {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function getFavoritos(db: SQLiteDatabase) {
  return db.getAllAsync<Favorito>("SELECT id, clave, name, grams, kcal, protein, carbs, fat FROM favoritos ORDER BY name COLLATE NOCASE");
}

export async function getClavesFavoritos(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ clave: string }>("SELECT clave FROM favoritos");
  return new Set(rows.map((r) => r.clave));
}

/** Guarda una comida (y su desglose) como favorita. Si ya había una con el mismo nombre, la sustituye. */
export async function addFavorito(db: SQLiteDatabase, meal: Meal) {
  const clave = claveFavorito(meal.name);
  await db.withTransactionAsync(async () => {
    await borrarFavoritoPorClave(db, clave);
    const { lastInsertRowId: id } = await db.runAsync(
      "INSERT INTO favoritos (clave, name, grams, kcal, protein, carbs, fat) VALUES (?, ?, ?, ?, ?, ?, ?)",
      clave,
      meal.name.trim(),
      meal.grams,
      meal.kcal,
      meal.protein,
      meal.carbs,
      meal.fat,
    );
    await db.runAsync(
      `INSERT INTO favorito_items (favorito_id, nombre, gramos, kcal, proteina, carbos, grasa, fuente, unidad_g)
        SELECT ?, nombre, gramos, kcal, proteina, carbos, grasa, fuente, unidad_g FROM meal_items WHERE meal_id = ? ORDER BY id`,
      id,
      meal.id,
    );
  });
}

/**
 * Tras editar una comida: si es favorita (mismo nombre), la favorita pasa a tener sus valores
 * y su desglose nuevos.
 */
export async function actualizarFavoritoDesde(db: SQLiteDatabase, mealId: number) {
  const meal = await db.getFirstAsync<Meal>("SELECT * FROM meals WHERE id = ?", mealId);
  if (!meal) return;
  const existe = await db.getFirstAsync("SELECT 1 FROM favoritos WHERE clave = ?", claveFavorito(meal.name));
  if (existe) await addFavorito(db, meal);
}

async function borrarFavoritoPorClave(db: SQLiteDatabase, clave: string) {
  await db.runAsync("DELETE FROM favorito_items WHERE favorito_id IN (SELECT id FROM favoritos WHERE clave = ?)", clave);
  await db.runAsync("DELETE FROM favoritos WHERE clave = ?", clave);
}

export async function deleteFavorito(db: SQLiteDatabase, clave: string) {
  await db.withTransactionAsync(() => borrarFavoritoPorClave(db, clave));
}

/** La favorita lista para volver a apuntarla como comida, con su desglose. */
export async function favoritoComoComida(db: SQLiteDatabase, fav: Favorito): Promise<Omit<NewMeal, "date">> {
  const items = await db.getAllAsync<NuevoIngrediente>(
    "SELECT nombre, gramos, kcal, proteina, carbos, grasa, fuente, unidad_g FROM favorito_items WHERE favorito_id = ? ORDER BY id",
    fav.id,
  );
  return {
    name: fav.name,
    grams: fav.grams,
    kcal: fav.kcal,
    protein: fav.protein,
    carbs: fav.carbs,
    fat: fav.fat,
    ingredientes: items.length ? items : undefined,
  };
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

/** Valores por 100 g de un alimento genérico. */
export type Valores100g = { kcal: number; proteina: number; carbos: number; grasa: number };

export function getAlimento(db: SQLiteDatabase, clave: string) {
  return db.getFirstAsync<Valores100g>(
    "SELECT kcal, proteina, carbos, grasa FROM alimentos_cache WHERE clave = ?",
    clave,
  );
}

/** Guarda los valores de un alimento solo si no estaba ya: manda la primera estimación. */
export function saveAlimento(db: SQLiteDatabase, clave: string, v: Valores100g) {
  return db.runAsync(
    `INSERT OR IGNORE INTO alimentos_cache (clave, kcal, proteina, carbos, grasa, actualizado)
    VALUES (?, ?, ?, ?, ?, ?)`,
    clave,
    v.kcal,
    v.proteina,
    v.carbos,
    v.grasa,
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

/**
 * Guarda un producto. Si ya hay uno con el mismo código, lo actualiza. Si no tiene código
 * (creado a mano), actualiza el que tenga el mismo nombre y marca. Devuelve su id.
 */
export async function saveMiProducto(db: SQLiteDatabase, p: NuevoMiProducto) {
  if (p.codigo == null) {
    const existente = (await getMisProductos(db)).find(
      (x) => x.codigo == null && normalizar(x.nombre) === normalizar(p.nombre) && normalizar(x.marca) === normalizar(p.marca),
    );
    if (existente) {
      await db.runAsync(
        "UPDATE mis_productos SET nombre = ?, marca = ?, kcal = ?, proteina = ?, carbos = ?, grasa = ?, racion_g = ? WHERE id = ?",
        p.nombre,
        p.marca,
        p.kcal,
        p.proteina,
        p.carbos,
        p.grasa,
        p.racion_g,
        existente.id,
      );
      return existente.id;
    }
  }

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

export type Goals = Totals & {
  /** Objetivo de agua en ml (0 = sin objetivo). */
  water: number;
};

const GOAL_KEYS = {
  kcal: "obj_kcal",
  protein: "obj_proteina",
  carbs: "obj_carbos",
  fat: "obj_grasa",
  water: "obj_agua",
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
    water: map[GOAL_KEYS.water] || 0,
  };
}

export async function saveGoals(db: SQLiteDatabase, goals: Goals) {
  await db.withTransactionAsync(async () => {
    for (const [field, key] of Object.entries(GOAL_KEYS)) {
      await setSettings(db, key, String(goals[field as keyof Goals]));
    }
  });
}

/** Total de agua (ml) bebida en un día. */
export async function getWaterByDate(db: SQLiteDatabase, date: string) {
  const row = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(ml) AS total FROM water WHERE date = ?",
    date,
  );
  return row?.total ?? 0;
}

export function addWater(db: SQLiteDatabase, date: string, ml: number) {
  return db.runAsync("INSERT INTO water (date, ml) VALUES (?, ?)", date, ml);
}

/** Borra la última cantidad de agua apuntada en el día (para deshacer un vaso). */
export function removeLastWater(db: SQLiteDatabase, date: string) {
  return db.runAsync(
    "DELETE FROM water WHERE id = (SELECT id FROM water WHERE date = ? ORDER BY created_at DESC, id DESC LIMIT 1)",
    date,
  );
}

const GLASS_KEY = "vaso_ml";
export const DEFAULT_GLASS_ML = 250;

/** Cantidad (ml) que suma cada pulsación del "+" en la tarjeta de agua. */
export async function getGlassMl(db: SQLiteDatabase) {
  const v = Number(await getSettings(db, GLASS_KEY));
  return v > 0 ? v : DEFAULT_GLASS_ML;
}

export function setGlassMl(db: SQLiteDatabase, ml: number) {
  return setSettings(db, GLASS_KEY, String(ml));
}
