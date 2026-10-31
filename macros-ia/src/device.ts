import { SQLiteDatabase } from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { getSettings, setSettings } from "./db";

let cached: string | null = null;

export async function getDeviceId(db: SQLiteDatabase) {
  if (cached) return cached;

  let id = await getSettings(db, "device_id");
  if (!id) {
    id = Crypto.randomUUID();
    await setSettings(db, "device_id", id);
  }

  cached = id;
  return id;
}
