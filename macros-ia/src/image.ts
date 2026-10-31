import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const ANCHO_MAX = 1024;
const CALIDAD_JPEG = 0.7;

/** Reduce la foto a 1024 px de ancho como máximo y la devuelve en JPEG base64 (sin el prefijo data:). */
export async function prepararFoto(uri: string, ancho: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (ancho > ANCHO_MAX) context.resize({ width: ANCHO_MAX, height: null });

  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG, base64: true });
  if (!result.base64) throw new Error("Sin base64");
  return result.base64;
}
