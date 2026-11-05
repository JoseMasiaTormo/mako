import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Goals } from "../db";
import { Colors, useTheme, useThemedStyles } from "../theme";
import FloatingCard from "./FloatingCard";

type Props = {
  visible: boolean;
  initial: Goals | null;
  onClose: () => void;
  onSave: (goals: Goals) => void;
  reminders: boolean;
  onToggleReminders: (on: boolean) => void;
};

const empty = { kcal: "", protein: "", carbs: "", fat: "", water: "" };
type FormKey = keyof typeof empty;

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export default function GoalsModal({ visible, initial, onClose, onSave, reminders, onToggleReminders }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (!visible) return;
    setForm(
      initial
        ? {
            kcal: String(initial.kcal),
            protein: String(initial.protein),
            carbs: String(initial.carbs),
            fat: String(initial.fat),
            water: initial.water ? String(initial.water) : "",
          }
        : empty,
    );
  }, [visible, initial]);

  const set = (key: FormKey) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const kcalMacros = Math.round(num(form.protein) * 4 + num(form.carbs) * 4 + num(form.fat) * 9);

  const save = () => {
    const kcal = num(form.kcal);
    if (kcal <= 0) {
      Alert.alert("Pon un objetivo de kcal");
      return;
    }
    onSave({
      kcal: Math.round(kcal),
      protein: num(form.protein),
      carbs: num(form.carbs),
      fat: num(form.fat),
      water: Math.round(num(form.water)),
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.title}>Objetivos diarios</Text>

        <Field label="Kcal" value={form.kcal} onChangeText={set("kcal")} />
        <View style={styles.row}>
          <Field label="Proteína (g)" value={form.protein} onChangeText={set("protein")} />
          <Field label="Carbos (g)" value={form.carbs} onChangeText={set("carbs")} />
          <Field label="Grasa (g)" value={form.fat} onChangeText={set("fat")} />
        </View>

        {kcalMacros > 0 && (
          <View style={styles.calc}>
            <Text style={styles.calcText}>Tus macros suman {kcalMacros} kcal</Text>
            {String(kcalMacros) !== form.kcal && (
              <Pressable onPress={() => set("kcal")(String(kcalMacros))} hitSlop={8}>
                <Text style={styles.calcButton}>Usar</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.waterField}>
          <Field label="Agua (ml)" value={form.water} onChangeText={set("water")} />
        </View>

        <View style={styles.reminder}>
          <View style={styles.reminderText}>
            <Text style={styles.reminderTitle}>Recordarme beber agua</Text>
            <Text style={styles.reminderHint}>Cada 2,5 h de 10:00 a 22:00. Para si llegas al objetivo.</Text>
          </View>
          <Switch
            value={reminders}
            onValueChange={onToggleReminders}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.save]} onPress={save}>
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </View>
      </FloatingCard>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 16 },
    row: { flexDirection: "row", gap: 10 },
    field: { flex: 1, marginBottom: 12 },
    label: { fontSize: 13, color: colors.muted, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
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
    waterField: { marginTop: 12 },
    reminder: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
    reminderText: { flex: 1 },
    reminderTitle: { fontSize: 15, color: colors.text, fontWeight: "500" },
    reminderHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
    buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.primary },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  });
