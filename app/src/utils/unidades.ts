// Margen para que 2.9999 (por redondeos de gramos) cuente como 3.
const EPS = 0.01;

/** "2", "1,5", "0,3": unidades con como mucho un decimal. */
export function formatUnidades(u: number) {
  const r = Math.round(u * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
}

/** Unidades al pulsar "+": la siguiente entera (1,5 → 2; 2 → 3). */
export function unidadesMas(u: number) {
  return Math.floor(u + EPS) + 1;
}

/** Unidades al pulsar "−": la anterior entera, nunca menos de 1 (2,5 → 2; 2 → 1). */
export function unidadesMenos(u: number) {
  return Math.max(1, Math.ceil(u - EPS) - 1);
}

/** Si "−" tiene sentido (por debajo de una unidad no se baja con el contador). */
export function puedeRestar(u: number) {
  return u > 1 + EPS;
}

/** Gramos para unas unidades, redondeados a un decimal. */
export function gramosDeUnidades(unidades: number, unidadG: number) {
  return Math.round(unidades * unidadG * 10) / 10;
}
