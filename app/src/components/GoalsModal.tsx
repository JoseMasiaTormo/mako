import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Goals, ModoObjetivos } from "../db";
import { TipoRecordatorio } from "../reminders";
import { Colors, useTheme, useThemedStyles } from "../theme";
import {
  ACTIVIDADES,
  Actividad,
  calcularObjetivos,
  LIMITES,
  Meta,
  METAS,
  Perfil,
  Ritmo,
  RITMOS,
  Sexo,
} from "../utils/objetivos";
import FloatingCard from "./FloatingCard";

export type GuardarObjetivos = {
  goals: Goals;
  /** null si el usuario no ha rellenado sus datos (solo en modo manual). */
  perfil: Perfil | null;
  modo: ModoObjetivos;
};

type Props = {
  visible: boolean;
  initial: Goals | null;
  perfil: Perfil | null;
  modo: ModoObjetivos;
  onClose: () => void;
  onSave: (datos: GuardarObjetivos) => void;
  reminders: Record<TipoRecordatorio, boolean>;
  onToggleReminders: (tipo: TipoRecordatorio, on: boolean) => void;
};

/** 0 = pantalla con todo; 1–3 = asistente de la primera vez. */
type Paso = 0 | 1 | 2 | 3;

type DatosForm = {
  sexo: Sexo | null;
  edad: string;
  altura: string;
  peso: string;
  actividad: Actividad | null;
  meta: Meta;
  ritmo: Ritmo;
};

const datosVacios: DatosForm = {
  sexo: null,
  edad: "",
  altura: "",
  peso: "",
  actividad: null,
  meta: "mantener",
  ritmo: "normal",
};

const manualVacio = { kcal: "", protein: "", carbs: "", fat: "" };
type ManualKey = keyof typeof manualVacio;

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Número con coma decimal, como se escribe en España. */
function texto(n: number) {
  return String(n).replace(".", ",");
}

function miles(n: number) {
  return Math.round(n).toLocaleString("es-ES");
}

function datosDesdePerfil(p: Perfil): DatosForm {
  return {
    sexo: p.sexo,
    edad: String(p.edad),
    altura: String(p.altura),
    peso: texto(p.peso),
    actividad: p.actividad,
    meta: p.meta,
    ritmo: p.ritmo,
  };
}

function datosVaciosDeVerdad(d: DatosForm) {
  return !d.sexo && !d.edad && !d.altura && !d.peso && !d.actividad;
}

/** El perfil del formulario, o el texto del primer problema que haya. */
function leerPerfil(d: DatosForm, hasta: 1 | 2 = 2): Perfil | string {
  if (!d.sexo) return "Elige tu sexo.";
  const edad = num(d.edad);
  const altura = num(d.altura);
  const peso = num(d.peso);
  const fuera = (v: number, l: { min: number; max: number }) => v < l.min || v > l.max;
  if (fuera(edad, LIMITES.edad)) return `Pon una edad entre ${LIMITES.edad.min} y ${LIMITES.edad.max} años.`;
  if (fuera(altura, LIMITES.altura))
    return `Pon tu altura en cm, entre ${LIMITES.altura.min} y ${LIMITES.altura.max}.`;
  if (fuera(peso, LIMITES.peso)) return `Pon tu peso en kg, entre ${LIMITES.peso.min} y ${LIMITES.peso.max}.`;
  if (hasta === 2 && !d.actividad) return "Elige cómo es tu actividad.";
  return {
    sexo: d.sexo,
    edad: Math.round(edad),
    altura: Math.round(altura),
    peso: Math.round(peso * 10) / 10,
    actividad: d.actividad ?? "sedentaria",
    meta: d.meta,
    ritmo: d.ritmo,
  };
}

function Field({
  label,
  value,
  onChangeText,
  unidad,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  unidad?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
        />
        {unidad ? <Text style={styles.unidad}>{unidad}</Text> : null}
      </View>
    </View>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; titulo: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.titulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SeccionDatos({ datos, set }: { datos: DatosForm; set: (d: Partial<DatosForm>) => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <Text style={styles.label}>Sexo</Text>
      <Chips
        options={[
          { value: "hombre" as Sexo, titulo: "Hombre" },
          { value: "mujer" as Sexo, titulo: "Mujer" },
        ]}
        value={datos.sexo}
        onChange={(sexo) => set({ sexo })}
      />
      <View style={styles.row}>
        <Field label="Edad" unidad="años" value={datos.edad} onChangeText={(edad) => set({ edad })} />
        <Field label="Altura" unidad="cm" value={datos.altura} onChangeText={(altura) => set({ altura })} />
        <Field label="Peso" unidad="kg" value={datos.peso} onChangeText={(peso) => set({ peso })} />
      </View>
    </>
  );
}

function SeccionActividad({ datos, set }: { datos: DatosForm; set: (d: Partial<DatosForm>) => void }) {
  const styles = useThemedStyles(makeStyles);
  const ritmo = RITMOS.find((r) => r.value === datos.ritmo);
  return (
    <>
      <Text style={styles.label}>Actividad</Text>
      {ACTIVIDADES.map((a) => {
        const on = a.value === datos.actividad;
        return (
          <Pressable
            key={a.value}
            style={[styles.opcion, on && styles.chipOn]}
            onPress={() => set({ actividad: a.value })}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.opcionTitulo, on && styles.chipTextOn]}>{a.titulo}</Text>
            <Text style={styles.opcionDetalle}>{a.detalle}</Text>
          </Pressable>
        );
      })}

      <Text style={[styles.label, styles.espacio]}>¿Qué quieres conseguir?</Text>
      <Chips options={METAS} value={datos.meta} onChange={(meta) => set({ meta })} />

      {datos.meta !== "mantener" && (
        <>
          <Text style={[styles.label, styles.espacio]}>
            Ritmo: {texto(ritmo?.kgSemana ?? 0.5)} kg por semana
          </Text>
          <Chips options={RITMOS} value={datos.ritmo} onChange={(r) => set({ ritmo: r })} />
        </>
      )}
    </>
  );
}

function SeccionResultado({ perfil }: { perfil: Perfil }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const c = calcularObjetivos(perfil);
  const metaTexto = perfil.meta === "perder" ? "Bajar peso" : "Ganar peso";
  return (
    <View style={styles.resultado}>
      <Text style={styles.kcal}>
        {miles(c.kcal)} <Text style={styles.kcalUnidad}>kcal / día</Text>
      </Text>
      <View style={styles.desglose}>
        <Linea texto="Gasto en reposo" valor={miles(c.reposo)} />
        <Linea texto="Tu actividad" valor={`+ ${miles(c.actividad)}`} />
        {c.ajuste !== 0 && (
          <Linea texto={metaTexto} valor={`${c.ajuste < 0 ? "−" : "+"} ${miles(Math.abs(c.ajuste))}`} />
        )}
      </View>
      {c.limitado && (
        <Text style={styles.aviso}>
          Hemos suavizado el déficit para no bajar de un mínimo saludable. Si quieres ir más rápido, consúltalo
          con un profesional.
        </Text>
      )}
      <View style={styles.row}>
        <Macro label="Proteína" valor={c.protein} color={colors.protein} />
        <Macro label="Carbos" valor={c.carbs} color={colors.carbs} />
        <Macro label="Grasa" valor={c.fat} color={colors.fat} />
      </View>
    </View>
  );
}

function Linea({ texto, valor }: { texto: string; valor: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.linea}>
      <Text style={styles.lineaTexto}>{texto}</Text>
      <Text style={styles.lineaValor}>{valor}</Text>
    </View>
  );
}

function Macro({ label, valor, color }: { label: string; valor: number; color: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={[styles.macroValor, { color }]}>{valor} g</Text>
    </View>
  );
}

function ReminderRow({
  title,
  hint,
  value,
  onValueChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.reminder}>
      <View style={styles.reminderText}>
        <Text style={styles.reminderTitle}>{title}</Text>
        <Text style={styles.reminderHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor="#fff"
        style={styles.switch}
      />
    </View>
  );
}

export default function GoalsModal({
  visible,
  initial,
  perfil,
  modo: modoInicial,
  onClose,
  onSave,
  reminders,
  onToggleReminders,
}: Props) {
  const styles = useThemedStyles(makeStyles);
  const [paso, setPaso] = useState<Paso>(0);
  const [modo, setModo] = useState<ModoObjetivos>("manual");
  const [datos, setDatos] = useState<DatosForm>(datosVacios);
  const [manual, setManual] = useState(manualVacio);
  const [water, setWater] = useState("");

  useEffect(() => {
    if (!visible) return;
    setDatos(perfil ? datosDesdePerfil(perfil) : datosVacios);
    setManual(
      initial
        ? {
            kcal: String(initial.kcal),
            protein: String(initial.protein),
            carbs: String(initial.carbs),
            fat: String(initial.fat),
          }
        : manualVacio,
    );
    setWater(initial?.water ? String(initial.water) : "");
    // Sin datos ni objetivos: es la primera vez, empezamos por el asistente.
    if (!perfil && !initial) {
      setModo("auto");
      setPaso(1);
    } else {
      setModo(perfil ? modoInicial : "manual");
      setPaso(0);
    }
  }, [visible, initial, perfil, modoInicial]);

  const setD = (d: Partial<DatosForm>) => setDatos((prev) => ({ ...prev, ...d }));
  const setM = (key: ManualKey) => (value: string) => setManual((f) => ({ ...f, [key]: value }));

  const perfilLeido = useMemo(() => leerPerfil(datos), [datos]);
  const perfilValido = typeof perfilLeido === "string" ? null : perfilLeido;
  const kcalMacros = Math.round(num(manual.protein) * 4 + num(manual.carbs) * 4 + num(manual.fat) * 9);
  const aguaRecomendada = perfilValido ? calcularObjetivos(perfilValido).water : 0;

  const falta = (titulo: string, mensaje: string) => Alert.alert(titulo, mensaje);

  const siguiente = () => {
    const r = leerPerfil(datos, paso === 1 ? 1 : 2);
    if (typeof r === "string") return falta("Falta un dato", r);
    if (paso === 2 && !water) setWater(String(calcularObjetivos(r).water));
    setPaso((p) => (p + 1) as Paso);
  };

  const save = () => {
    const agua = Math.round(num(water));
    if (modo === "auto") {
      if (typeof perfilLeido === "string") return falta("Falta un dato", perfilLeido);
      const c = calcularObjetivos(perfilLeido);
      onSave({
        goals: { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, water: agua },
        perfil: perfilLeido,
        modo,
      });
      return;
    }

    const kcal = num(manual.kcal);
    if (kcal <= 0) return falta("Faltan las kcal", "Pon un objetivo de kcal para guardar.");
    // En manual los datos son opcionales, pero si se han empezado a rellenar tienen que estar bien.
    let p: Perfil | null = null;
    if (!datosVaciosDeVerdad(datos)) {
      if (typeof perfilLeido === "string") return falta("Revisa tus datos", perfilLeido);
      p = perfilLeido;
    }
    onSave({
      goals: {
        kcal: Math.round(kcal),
        protein: num(manual.protein),
        carbs: num(manual.carbs),
        fat: num(manual.fat),
        water: agua,
      },
      perfil: p,
      modo,
    });
  };

  const empezarAsistente = () => {
    setModo("auto");
    setPaso(1);
  };

  const aMano = () => {
    // Si ya hay un cálculo, se parte de él para retocarlo.
    if (perfilValido && !manual.kcal) {
      const c = calcularObjetivos(perfilValido);
      setManual({ kcal: String(c.kcal), protein: String(c.protein), carbs: String(c.carbs), fat: String(c.fat) });
    }
    setModo("manual");
    setPaso(0);
  };

  const botones = (izq: { texto: string; onPress: () => void }, der: { texto: string; onPress: () => void }) => (
    <View style={styles.buttons}>
      <Pressable style={[styles.button, styles.cancel]} onPress={izq.onPress}>
        <Text style={styles.cancelText}>{izq.texto}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.save]} onPress={der.onPress}>
        <Text style={styles.saveText}>{der.texto}</Text>
      </Pressable>
    </View>
  );

  const progreso = (
    <View style={styles.progreso}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.progresoBarra, n <= paso && styles.progresoOn]} />
      ))}
    </View>
  );

  if (paso > 0) {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <FloatingCard>
          <Text style={styles.pasoTexto}>Paso {paso} de 3</Text>
          {progreso}

          {paso === 1 && (
            <>
              <Text style={styles.title}>Cuéntanos sobre ti</Text>
              <Text style={styles.subtitle}>
                Con esto calculamos tus kcal y macros. Podrás cambiarlo cuando quieras.
              </Text>
              <SeccionDatos datos={datos} set={setD} />
              <Text style={styles.privacidad}>Tus datos se guardan solo en este móvil.</Text>
              {botones({ texto: "Cancelar", onPress: onClose }, { texto: "Siguiente", onPress: siguiente })}
              <Pressable onPress={aMano} hitSlop={8} style={styles.enlace}>
                <Text style={styles.enlaceText}>Prefiero poner mis objetivos a mano</Text>
              </Pressable>
            </>
          )}

          {paso === 2 && (
            <>
              <Text style={styles.title}>¿Cómo es tu día?</Text>
              <SeccionActividad datos={datos} set={setD} />
              {botones({ texto: "Atrás", onPress: () => setPaso(1) }, { texto: "Calcular", onPress: siguiente })}
            </>
          )}

          {paso === 3 && perfilValido && (
            <>
              <Text style={styles.title}>Tus objetivos</Text>
              <SeccionResultado perfil={perfilValido} />
              <View style={styles.espacio}>
                <Field label="Agua" unidad="ml" value={water} onChangeText={setWater} />
              </View>
              {botones({ texto: "Atrás", onPress: () => setPaso(2) }, { texto: "Guardar", onPress: save })}
              <Pressable onPress={aMano} hitSlop={8} style={styles.enlace}>
                <Text style={styles.enlaceText}>Ajustar a mano</Text>
              </Pressable>
            </>
          )}
        </FloatingCard>
      </Modal>
    );
  }

  const conDatos = perfil != null || !datosVaciosDeVerdad(datos);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.title}>Objetivos diarios</Text>

        <View style={styles.modo}>
          {(["auto", "manual"] as const).map((m) => {
            const on = modo === m;
            return (
              <Pressable
                key={m}
                style={[styles.modoBoton, on && styles.modoOn]}
                onPress={() => (m === "auto" && !conDatos ? empezarAsistente() : setModo(m))}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.modoText, on && styles.modoTextOn]}>
                  {m === "auto" ? "Con mis datos" : "A mano"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {conDatos ? (
          <>
            <Text style={styles.seccion}>Tus datos</Text>
            <SeccionDatos datos={datos} set={setD} />
            <SeccionActividad datos={datos} set={setD} />
          </>
        ) : (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>
              Dinos tu peso, altura y actividad y calculamos tus kcal y macros.
            </Text>
            <Pressable onPress={empezarAsistente} hitSlop={8}>
              <Text style={styles.calcButton}>Empezar</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.seccion}>Objetivos</Text>
        {modo === "auto" ? (
          perfilValido ? (
            <SeccionResultado perfil={perfilValido} />
          ) : (
            <Text style={styles.aviso}>{perfilLeido as string}</Text>
          )
        ) : (
          <>
            <Field label="Kcal" value={manual.kcal} onChangeText={setM("kcal")} />
            <View style={styles.row}>
              <Field label="Proteína (g)" value={manual.protein} onChangeText={setM("protein")} />
              <Field label="Carbos (g)" value={manual.carbs} onChangeText={setM("carbs")} />
              <Field label="Grasa (g)" value={manual.fat} onChangeText={setM("fat")} />
            </View>
            {kcalMacros > 0 && (
              <View style={styles.calc}>
                <Text style={styles.calcText}>Tus macros suman {kcalMacros} kcal</Text>
                {String(kcalMacros) !== manual.kcal && (
                  <Pressable onPress={() => setM("kcal")(String(kcalMacros))} hitSlop={8}>
                    <Text style={styles.calcButton}>Usar</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}

        <View style={styles.espacio}>
          <Field label="Agua" unidad="ml" value={water} onChangeText={setWater} />
          {aguaRecomendada > 0 && String(aguaRecomendada) !== water && (
            <View style={styles.calc}>
              <Text style={styles.calcText}>Para tu peso: {texto(aguaRecomendada / 1000)} L</Text>
              <Pressable onPress={() => setWater(String(aguaRecomendada))} hitSlop={8}>
                <Text style={styles.calcButton}>Usar</Text>
              </Pressable>
            </View>
          )}
        </View>

        <ReminderRow
          title="Recordarme beber agua"
          hint="Cada 2,5 h de 10:00 a 22:00. Para si llegas al objetivo."
          value={reminders.agua}
          onValueChange={(on) => onToggleReminders("agua", on)}
        />
        <ReminderRow
          title="Recordarme apuntar comidas"
          hint="A las 10:00, 15:00 y 22:00. No avisa si ya has apuntado algo desde el aviso anterior."
          value={reminders.comidas}
          onValueChange={(on) => onToggleReminders("comidas", on)}
        />

        {botones({ texto: "Cancelar", onPress: onClose }, { texto: "Guardar", onPress: save })}
      </FloatingCard>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 16 },
    subtitle: { fontSize: 14, color: colors.muted, marginTop: -8, marginBottom: 16, lineHeight: 20 },
    seccion: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 20, marginBottom: 10 },
    pasoTexto: { fontSize: 13, color: colors.muted, marginBottom: 8 },
    progreso: { flexDirection: "row", gap: 6, marginBottom: 16 },
    progresoBarra: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
    progresoOn: { backgroundColor: colors.primary },
    row: { flexDirection: "row", gap: 10 },
    espacio: { marginTop: 12 },
    field: { flex: 1, marginBottom: 12 },
    label: { fontSize: 13, color: colors.muted, marginBottom: 6 },
    inputBox: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
    },
    input: { flex: 1, paddingVertical: 10, fontSize: 16, color: colors.text },
    unidad: { fontSize: 14, color: colors.muted, marginLeft: 4 },
    chips: { flexDirection: "row", gap: 8, marginBottom: 12 },
    chip: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    chipOn: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
    chipText: { fontSize: 15, color: colors.text },
    chipTextOn: { fontWeight: "700", color: colors.text },
    opcion: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    opcionTitulo: { fontSize: 15, fontWeight: "600", color: colors.text },
    opcionDetalle: { fontSize: 13, color: colors.muted, marginTop: 2 },
    resultado: { backgroundColor: colors.bg, borderRadius: 12, padding: 14 },
    kcal: { fontSize: 32, fontWeight: "700", color: colors.text, textAlign: "center" },
    kcalUnidad: { fontSize: 15, fontWeight: "400", color: colors.muted },
    desglose: { marginTop: 10, marginBottom: 12, gap: 4 },
    linea: { flexDirection: "row", justifyContent: "space-between" },
    lineaTexto: { fontSize: 14, color: colors.muted },
    lineaValor: { fontSize: 14, color: colors.text },
    macro: { flex: 1, backgroundColor: colors.card, borderRadius: 10, padding: 10 },
    macroLabel: { fontSize: 12, color: colors.muted },
    macroValor: { fontSize: 18, fontWeight: "700", marginTop: 2 },
    aviso: { fontSize: 13, color: colors.muted, marginBottom: 12, lineHeight: 18 },
    privacidad: { fontSize: 13, color: colors.muted },
    modo: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 12, padding: 4, gap: 4 },
    modoBoton: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    modoOn: { backgroundColor: colors.card },
    modoText: { fontSize: 15, color: colors.muted },
    modoTextOn: { color: colors.text, fontWeight: "700" },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      padding: 14,
      marginTop: 16,
    },
    bannerText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
    calc: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
      padding: 12,
      borderRadius: 10,
    },
    calcText: { color: colors.muted, fontSize: 14 },
    calcButton: { color: colors.primary, fontWeight: "700", fontSize: 14 },
    reminder: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 8,
      backgroundColor: colors.bg,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    reminderText: { flex: 1 },
    reminderTitle: { fontSize: 17, color: colors.text, fontWeight: "600" },
    reminderHint: { fontSize: 14, color: colors.muted, marginTop: 4 },
    switch: { transform: [{ scaleX: 1.25 }, { scaleY: 1.25 }] },
    buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.primary },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
    enlace: { alignItems: "center", marginTop: 14 },
    enlaceText: { color: colors.muted, fontSize: 14 },
  });
