import { SQLiteDatabase } from "expo-sqlite";
import { getSettings, setSettings } from "./db";

export type Novedad = {
  version: string;
  cambios: string[];
};

/**
 * Notas de cada versión, la más reciente primero. Al publicar una versión con novedades,
 * añade su entrada arriba: quien actualice verá el modal una vez al abrir la app.
 */
export const NOVEDADES: Novedad[] = [
  {
    version: "1.5.0",
    cambios: [
      "Mako estrena logo: un nuevo icono con los colores de siempre.",
      "Ahora puedes dictar lo que has comido: en el modo Automático, pulsa el micrófono, dilo en voz alta y el texto aparecerá solo. Revísalo y pulsa Analizar. La primera vez te pedirá permiso para usar el micrófono.",
      "El límite diario de análisis con IA pasa a ser de 8. Si te quedas sin ellos, puedes ver un anuncio para conseguir 5 más. Cuando los gastes, podrás volver a ver otro.",
    ],
  },
  {
    version: "1.4.0",
    cambios: [
      "Ahora puedes contar por unidades: pulsa + o − para cambiar cuántos te has comido (2 huevos, 3 galletas…) y los gramos, las kcal y las macros se ajustan solos. Funciona al añadir una comida y al editarla, también en cada ingrediente.",
      "Al escribir cantidades como «2 huevos», el modo Automático ya entiende que son 2 unidades.",
      "Después de cada actualización verás estas notas con las novedades de la versión.",
      "Las notificaciones para beber agua ahora llevan el icono de Mako.",
    ],
  },
];

const CLAVE = "novedades_vistas";

/** Las novedades que el usuario aún no ha visto, o null si no hay. */
export async function getNovedadesPendientes(db: SQLiteDatabase): Promise<Novedad | null> {
  const ultima = NOVEDADES[0];
  if (!ultima) return null;
  const vista = await getSettings(db, CLAVE);
  return vista === ultima.version ? null : ultima;
}

/** Marca las últimas novedades como vistas (también al instalar, para no enseñarlas a quien acaba de llegar). */
export async function marcarNovedadesVistas(db: SQLiteDatabase) {
  const ultima = NOVEDADES[0];
  if (ultima) await setSettings(db, CLAVE, ultima.version);
}
