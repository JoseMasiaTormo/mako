import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { SQLiteDatabase } from "expo-sqlite";
import { getGoals, getMealsByDate, getSettings, getWaterByDate, setSettings } from "./db";
import { addDays, fromKey, todayKey } from "./utils/date";

/** Días que se dejan programados por delante. Se reprograma cada vez que se abre la app. */
const DIAS = 7;

export type TipoRecordatorio = "agua" | "comidas";

type Config = {
  canal: string;
  nombreCanal: string;
  prefijo: string;
  ajuste: string;
  horas: [number, number][];
  mensajes: string[];
  cuerpo: string;
};

const CONFIG: Record<TipoRecordatorio, Config> = {
  agua: {
    canal: "agua",
    nombreCanal: "Recordatorios de agua",
    prefijo: "agua-",
    ajuste: "recordatorio_agua",
    // Cada 2,5 h entre las 10:00 y las 22:00.
    horas: [
      [10, 0],
      [12, 30],
      [15, 0],
      [17, 30],
      [20, 0],
      [22, 0],
    ],
    mensajes: [
      "¿Un vaso de agua? 💧",
      "Toca hidratarse 💧",
      "Hace rato que no apuntas agua 💧",
      "Tu cuerpo te pide agua 💧",
    ],
    cuerpo: "Apúntalo en Mako para llevar la cuenta.",
  },
  comidas: {
    canal: "comidas",
    nombreCanal: "Recordatorios de comidas",
    prefijo: "comidas-",
    ajuste: "recordatorio_comidas",
    // Un poco después de las horas habituales de comer, para no molestar mientras se come.
    horas: [
      [10, 0],
      [15, 0],
      [22, 0],
    ],
    mensajes: ["¿Has desayunado? 🍽️", "¿Qué tal la comida? 🍽️", "¿Qué has cenado? 🍽️"],
    cuerpo: "Apunta lo que has comido en Mako para no perder la cuenta.",
  },
};

const TIPOS = Object.keys(CONFIG) as TipoRecordatorio[];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getRemindersEnabled(db: SQLiteDatabase, tipo: TipoRecordatorio) {
  return (await getSettings(db, CONFIG[tipo].ajuste)) === "1";
}

/**
 * Se llama al abrir la app. La primera vez pide permiso de notificaciones y,
 * si lo concede, deja activados los recordatorios de agua (los de comidas
 * empiezan apagados). Después solo reprograma.
 */
export async function initReminders(db: SQLiteDatabase) {
  if (Platform.OS === "android") {
    // En Android 13+ el diálogo de permiso no sale hasta que existe un canal.
    for (const tipo of TIPOS) {
      await Notifications.setNotificationChannelAsync(CONFIG[tipo].canal, {
        name: CONFIG[tipo].nombreCanal,
        importance: AndroidImportance.DEFAULT,
      });
    }
  }

  if ((await getSettings(db, CONFIG.agua.ajuste)) == null) {
    const { granted } = await Notifications.requestPermissionsAsync();
    await setSettings(db, CONFIG.agua.ajuste, granted ? "1" : "0");
  }

  await syncReminders(db);
}

/** Activa o desactiva un tipo de recordatorio. Devuelve si quedó activado. */
export async function setRemindersEnabled(db: SQLiteDatabase, tipo: TipoRecordatorio, enabled: boolean) {
  if (enabled) {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) enabled = false;
  }
  await setSettings(db, CONFIG[tipo].ajuste, enabled ? "1" : "0");
  await syncReminders(db);
  return enabled;
}

/** created_at viene de SQLite (datetime('now')): "YYYY-MM-DD HH:MM:SS" en UTC. */
function parseCreatedAt(s: string) {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

/**
 * Qué avisos de hoy sobran, como índices de `horas`.
 * - Agua: todos, si ya se ha llegado al objetivo.
 * - Comidas: el de cada tramo en el que ya se ha apuntado algo (desde el aviso
 *   anterior, o desde medianoche para el primero, hasta la hora del aviso).
 */
async function omitirHoy(db: SQLiteDatabase, tipo: TipoRecordatorio, hoy: string): Promise<Set<number>> {
  const horas = CONFIG[tipo].horas;
  if (tipo === "agua") {
    const [goals, bebida] = await Promise.all([getGoals(db), getWaterByDate(db, hoy)]);
    const objetivo = goals?.water ?? 0;
    return objetivo > 0 && bebida >= objetivo ? new Set(horas.keys()) : new Set();
  }

  const apuntadas = (await getMealsByDate(db, hoy)).map((m) => parseCreatedAt(m.created_at));
  const omitir = new Set<number>();
  let desde = fromKey(hoy).getTime();
  horas.forEach(([h, m], i) => {
    const hasta = fromKey(hoy);
    hasta.setHours(h, m, 0, 0);
    if (apuntadas.some((t) => t >= desde && t < hasta.getTime())) omitir.add(i);
    desde = hasta.getTime();
  });
  return omitir;
}

async function syncTipo(
  db: SQLiteDatabase,
  tipo: TipoRecordatorio,
  programadas: Notifications.NotificationRequest[],
  permiso: boolean,
) {
  const { canal, prefijo, horas, mensajes, cuerpo } = CONFIG[tipo];
  await Promise.all(
    programadas
      .filter((n) => n.identifier.startsWith(prefijo))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  if (!permiso || !(await getRemindersEnabled(db, tipo))) return;

  const hoy = todayKey();
  const omitir = await omitirHoy(db, tipo, hoy);
  const ahora = Date.now();
  let i = 0;
  for (let d = 0; d < DIAS; d++) {
    const dia = addDays(hoy, d);
    for (const [j, [h, m]] of horas.entries()) {
      // Agua: va rotando los mensajes. Comidas: cada hora tiene el suyo (desayuno, comida, cena).
      const titulo = tipo === "agua" ? mensajes[i++ % mensajes.length] : mensajes[j];
      if (d === 0 && omitir.has(j)) continue;
      const fecha = fromKey(dia);
      fecha.setHours(h, m, 0, 0);
      if (fecha.getTime() <= ahora) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${prefijo}${dia}-${h}${m}`,
        content: { title: titulo, body: cuerpo },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fecha,
          channelId: canal,
        },
      });
    }
  }
}

/**
 * Borra los recordatorios programados y los vuelve a crear para los próximos días,
 * saltándose los de hoy que ya no hacen falta (ver `omitirHoy`).
 * Llamar al abrir la app y cada vez que cambie el agua o las comidas de hoy, o el objetivo.
 */
export async function syncReminders(db: SQLiteDatabase) {
  const [programadas, { granted }] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPermissionsAsync(),
  ]);
  for (const tipo of TIPOS) await syncTipo(db, tipo, programadas, granted);
}
