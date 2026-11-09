import { useEffect, useState } from "react";
import { SQLiteDatabase } from "expo-sqlite";
import { consultarUso, getUso, suscribirUso, Uso } from "../api";
import { getDeviceId } from "../device";

/**
 * Peticiones de IA que le quedan hoy al dispositivo (cuenta atrás de 15 a 0).
 * Mientras `activo` sea true, pregunta al Worker el valor actual al activarse.
 */
export function useUso(db: SQLiteDatabase, activo: boolean): Uso | null {
  const [uso, setUso] = useState(getUso);

  useEffect(() => suscribirUso(setUso), []);

  useEffect(() => {
    if (!activo) return;
    getDeviceId(db).then(consultarUso);
  }, [db, activo]);

  return uso;
}
