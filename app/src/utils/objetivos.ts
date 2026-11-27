// src/utils/objetivos.ts
// Cálculo de kcal y macros a partir de los datos del usuario (Mifflin-St Jeor).

export type Sexo = "hombre" | "mujer";
export type Actividad = "sedentaria" | "ligera" | "moderada" | "alta";
export type Meta = "perder" | "mantener" | "ganar";
export type Ritmo = "suave" | "normal" | "rapido";

export type Perfil = {
  sexo: Sexo;
  edad: number;
  altura: number; // cm
  peso: number; // kg
  actividad: Actividad;
  meta: Meta;
  ritmo: Ritmo;
};

export const ACTIVIDADES: { value: Actividad; titulo: string; detalle: string; factor: number }[] = [
  { value: "sedentaria", titulo: "Poco o nada", detalle: "Trabajo sentado y no entreno", factor: 1.2 },
  { value: "ligera", titulo: "Ligera", detalle: "Entreno 1–3 días por semana", factor: 1.375 },
  { value: "moderada", titulo: "Moderada", detalle: "Entreno 3–5 días por semana", factor: 1.55 },
  { value: "alta", titulo: "Alta", detalle: "Entreno 6–7 días o trabajo físico", factor: 1.725 },
];

export const METAS: { value: Meta; titulo: string }[] = [
  { value: "perder", titulo: "Bajar peso" },
  { value: "mantener", titulo: "Mantener" },
  { value: "ganar", titulo: "Ganar peso" },
];

export const RITMOS: { value: Ritmo; titulo: string; kgSemana: number }[] = [
  { value: "suave", titulo: "Suave", kgSemana: 0.25 },
  { value: "normal", titulo: "Normal", kgSemana: 0.5 },
  { value: "rapido", titulo: "Rápido", kgSemana: 0.75 },
];

/** Límites razonables para los datos del formulario. */
export const LIMITES = {
  edad: { min: 14, max: 100 },
  altura: { min: 120, max: 230 },
  peso: { min: 30, max: 300 },
} as const;

/** kcal que hay que quitar o sumar al día para cambiar 1 kg de peso a la semana. */
const KCAL_POR_KG_SEMANA = 7700 / 7;

export type Calculo = {
  /** Gasto en reposo (metabolismo basal). */
  reposo: number;
  /** Lo que suma la actividad sobre el reposo. */
  actividad: number;
  /** Déficit (negativo) o superávit (positivo) por la meta. */
  ajuste: number;
  /** true si el ajuste se ha recortado para no bajar del mínimo seguro. */
  limitado: boolean;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Agua recomendada en ml. */
  water: number;
};

export function calcularObjetivos(p: Perfil): Calculo {
  const reposo = 10 * p.peso + 6.25 * p.altura - 5 * p.edad + (p.sexo === "hombre" ? 5 : -161);
  const factor = ACTIVIDADES.find((a) => a.value === p.actividad)?.factor ?? 1.2;
  const mantenimiento = reposo * factor;

  const kgSemana = RITMOS.find((r) => r.value === p.ritmo)?.kgSemana ?? 0.5;
  let ajuste = p.meta === "mantener" ? 0 : kgSemana * KCAL_POR_KG_SEMANA * (p.meta === "perder" ? -1 : 1);

  // No bajamos de un mínimo seguro ni por debajo del gasto en reposo.
  const minimo = Math.max(reposo, p.sexo === "hombre" ? 1500 : 1200);
  let limitado = false;
  if (mantenimiento + ajuste < minimo) {
    ajuste = Math.min(0, minimo - mantenimiento);
    limitado = true;
  }
  const kcal = Math.round(mantenimiento + ajuste);

  // Con sobrepeso, las macros por kg se calculan con un peso de referencia (IMC 27),
  // para no pedir cantidades de proteína disparatadas.
  const metros = p.altura / 100;
  const pesoRef = Math.min(p.peso, 27 * metros * metros);
  const gProteina = p.meta === "perder" ? 2 : p.meta === "ganar" ? 1.8 : 1.6;

  let protein = Math.round(pesoRef * gProteina);
  let fat = Math.round(pesoRef * 0.8);
  // Si con poca energía no queda sitio, la grasa baja hasta el 20 % de las kcal.
  if (protein * 4 + fat * 9 > kcal * 0.85) fat = Math.round((kcal * 0.2) / 9);
  if (protein * 4 + fat * 9 > kcal) protein = Math.round((kcal - fat * 9) / 4);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  // 35 ml por kg, entre 1,5 y 3,5 L, redondeado a 100 ml.
  const water = Math.min(3500, Math.max(1500, Math.round((p.peso * 35) / 100) * 100));

  return {
    reposo: Math.round(reposo),
    actividad: Math.round(mantenimiento - reposo),
    ajuste: Math.round(ajuste),
    limitado,
    kcal,
    protein,
    carbs,
    fat,
    water,
  };
}
