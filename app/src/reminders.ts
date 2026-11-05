import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { SQLiteDatabase } from "expo-sqlite";
import { getGoals, getSettings, getWaterByDate, setSettings } from "./db";
import { addDays, fromKey, todayKey } from "./utils/date";

/** Horas del día a las que se avisa (cada 2,5 h entre las 10:00 y las 22:00). */
const HORAS: [number, number][] = [
  [10, 0],
  [12, 30],
  [15, 0],
  [17, 30],
  [20, 0],
  [22, 0],
];

/** Días que se dejan programados por delante. Se reprograma cada vez que se abre la app. */
const DIAS = 7;

const CANAL = "agua";
const PREFIJO = "agua-";
const AJUSTE = "recordatorio_agua";

const MENSAJES = [
  "¿Un vaso de agua? 💧",
  "Toca hidratarse 💧",
  "Hace rato que no apuntas agua 💧",
  "Tu cuerpo te pide agua 💧",
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getRemindersEnabled(db: SQLiteDatabase) {
  return (await getSettings(db, AJUSTE)) === "1";
}

/**
 * Se llama al abrir la app. La primera vez pide permiso de notificaciones y,
 * si lo concede, deja activados los recordatorios. Después solo reprograma.
 */
export async function initReminders(db: SQLiteDatabase) {
  if (Platform.OS === "android") {
    // En Android 13+ el diálogo de permiso no sale hasta que existe un canal.
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: "Recordatorios de agua",
      importance: AndroidImportance.DEFAULT,
    });
  }

  if ((await getSettings(db, AJUSTE)) == null) {
    const { granted } = await Notifications.requestPermissionsAsync();
    await setSettings(db, AJUSTE, granted ? "1" : "0");
  }

  await syncReminders(db);
}

/** Activa o desactiva los recordatorios. Devuelve si quedaron activados. */
export async function setRemindersEnabled(db: SQLiteDatabase, enabled: boolean) {
  if (enabled) {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) enabled = false;
  }
  await setSettings(db, AJUSTE, enabled ? "1" : "0");
  await syncReminders(db);
  return enabled;
}

/**
 * Borra los recordatorios programados y los vuelve a crear para los próximos días.
 * Si hoy ya se ha llegado al objetivo de agua, hoy no se avisa más.
 * Llamar al abrir la app y cada vez que cambie el agua de hoy o el objetivo.
 */
export async function syncReminders(db: SQLiteDatabase) {
  const programadas = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    programadas
      .filter((n) => n.identifier.startsWith(PREFIJO))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  if (!(await getRemindersEnabled(db))) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const hoy = todayKey();
  const [goals, bebida] = await Promise.all([getGoals(db), getWaterByDate(db, hoy)]);
  const objetivo = goals?.water ?? 0;
  const hoyCumplido = objetivo > 0 && bebida >= objetivo;

  const ahora = Date.now();
  let i = 0;
  for (let d = hoyCumplido ? 1 : 0; d < DIAS; d++) {
    const dia = addDays(hoy, d);
    for (const [h, m] of HORAS) {
      const fecha = fromKey(dia);
      fecha.setHours(h, m, 0, 0);
      if (fecha.getTime() <= ahora) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIJO}${dia}-${h}${m}`,
        content: {
          title: MENSAJES[i++ % MENSAJES.length],
          body: "Apúntalo en Mako para llevar la cuenta.",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fecha,
          channelId: CANAL,
        },
      });
    }
  }
}
