// src/components/AddMealModal.tsx
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { NewMeal } from "../db";
import { AiItem, analizarComida, ApiError } from "../api";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (meal: Omit<NewMeal, "date">) => void;
};

type Mode = "ia" | "manual";
type EditableItem = { base: AiItem; gramosText: string };

const emptyManual = { name: "", grams: "", kcal: "", protein: "", carbs: "", fat: "" };
type ManualKey = keyof typeof emptyManual;

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function scale(item: AiItem, grams: number): AiItem {
  const f = item.gramos > 0 ? grams / item.gramos : 1;
  return {
    nombre: item.nombre,
    gramos: grams,
    kcal: item.kcal * f,
    proteina: item.proteina * f,
    carbos: item.carbos * f,
    grasa: item.grasa * f,
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
}

export default function AddMealModal({ visible, onClose, onSave }: Props) {
  const [mode, setMode] = useState<Mode>("ia");
  const [texto, setTexto] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  const reset = () => {
    setMode("ia");
    setTexto("");
    setItems([]);
    setLoading(false);
    setManual(emptyManual);
  };

  const close = () => {
    reset();
    onClose();
  };

  const analizar = async () => {
    if (!texto.trim() || loading) return;
    setLoading(true);
    try {
      const result = await analizarComida(texto.trim());
      setItems(result.map((base) => ({ base, gramosText: String(base.gramos) })));
    } catch (e) {
      Alert.alert("Ups", e instanceof ApiError ? e.message : "Algo ha fallado.");
    } finally {
      setLoading(false);
    }
  };

  const setItemGrams = (index: number) => (value: string) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, gramosText: value } : it)));

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const computed = items.map((it) => scale(it.base, num(it.gramosText)));
  const total = computed.reduce(
    (acc, i) => ({
      gramos: acc.gramos + i.gramos,
      kcal: acc.kcal + i.kcal,
      proteina: acc.proteina + i.proteina,
      carbos: acc.carbos + i.carbos,
      grasa: acc.grasa + i.grasa,
    }),
    { gramos: 0, kcal: 0, proteina: 0, carbos: 0, grasa: 0 },
  );

  const saveIa = () => {
    if (!computed.length) return;
    const t = texto.trim();
    onSave({
      name: t.charAt(0).toUpperCase() + t.slice(1),
      grams: Math.round(total.gramos),
      kcal: Math.round(total.kcal),
      protein: round1(total.proteina),
      carbs: round1(total.carbos),
      fat: round1(total.grasa),
    });
    reset();
  };

  const setManualField = (key: ManualKey) => (value: string) => setManual((f) => ({ ...f, [key]: value }));

  const saveManual = () => {
    if (!manual.name.trim()) {
      Alert.alert("Falta el nombre");
      return;
    }
    onSave({
      name: manual.name.trim(),
      grams: manual.grams ? num(manual.grams) : null,
      kcal: num(manual.kcal),
      protein: num(manual.protein),
      carbs: num(manual.carbs),
      fat: num(manual.fat),
    });
    reset();
  };

  const renderIa = () => {
    if (!items.length) {
      return (
        <>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={texto}
            onChangeText={setTexto}
            placeholder="Ej: plato de garbanzos con pollo y una caña"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={300}
            editable={!loading}
          />
          <Text style={styles.hint}>Los valores son estimaciones aproximadas.</Text>
          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancel]} onPress={close}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.save, (!texto.trim() || loading) && styles.disabled]}
              onPress={analizar}
              disabled={!texto.trim() || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Analizar</Text>}
            </Pressable>
          </View>
        </>
      );
    }

    return (
      <>
        <Text style={styles.query}>{texto.trim()}</Text>
        {computed.map((item, index) => (
          <View key={`${item.nombre}-${index}`} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.nombre}</Text>
              <Text style={styles.itemMacros}>
                P {Math.round(item.proteina)} · C {Math.round(item.carbos)} · G {Math.round(item.grasa)}
              </Text>
            </View>
            <TextInput
              style={styles.gramsInput}
              value={items[index].gramosText}
              onChangeText={setItemGrams(index)}
              keyboardType="decimal-pad"
            />
            <Text style={styles.gramsUnit}>g</Text>
            <Text style={styles.itemKcal}>{Math.round(item.kcal)}</Text>
            <Pressable onPress={() => removeItem(index)} hitSlop={10}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {Math.round(total.kcal)} kcal · P {Math.round(total.proteina)} · C {Math.round(total.carbos)} · G{" "}
            {Math.round(total.grasa)}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={() => setItems([])}>
            <Text style={styles.cancelText}>Volver</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.save, !computed.length && styles.disabled]}
            onPress={saveIa}
            disabled={!computed.length}
          >
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </View>
      </>
    );
  };

  const renderManual = () => (
    <>
      <Field
        label="Nombre"
        value={manual.name}
        onChangeText={setManualField("name")}
        placeholder="Garbanzos con pollo"
      />
      <View style={styles.row}>
        <Field label="Gramos" value={manual.grams} onChangeText={setManualField("grams")} numeric />
        <Field label="Kcal" value={manual.kcal} onChangeText={setManualField("kcal")} numeric />
      </View>
      <View style={styles.row}>
        <Field label="Proteína (g)" value={manual.protein} onChangeText={setManualField("protein")} numeric />
        <Field label="Carbos (g)" value={manual.carbs} onChangeText={setManualField("carbs")} numeric />
        <Field label="Grasa (g)" value={manual.fat} onChangeText={setManualField("fat")} numeric />
      </View>
      <View style={styles.buttons}>
        <Pressable style={[styles.button, styles.cancel]} onPress={close}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.save]} onPress={saveManual}>
          <Text style={styles.saveText}>Guardar</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Añadir comida</Text>

            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, mode === "ia" && styles.tabActive]}
                onPress={() => setMode("ia")}
                disabled={loading}
              >
                <Text style={[styles.tabText, mode === "ia" && styles.tabTextActive]}>Con IA</Text>
              </Pressable>
              <Pressable
                style={[styles.tab, mode === "manual" && styles.tabActive]}
                onPress={() => setMode("manual")}
                disabled={loading}
              >
                <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>Manual</Text>
              </Pressable>
            </View>

            {mode === "ia" ? renderIa() : renderManual()}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 12 },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.bg,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: colors.card },
  tabText: { color: colors.muted, fontWeight: "600" },
  tabTextActive: { color: colors.text },
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
  textarea: { minHeight: 90, textAlignVertical: "top" },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
  query: { fontSize: 15, fontStyle: "italic", color: colors.muted, marginBottom: 12 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, color: colors.text, fontWeight: "500" },
  itemMacros: { fontSize: 12, color: colors.muted, marginTop: 2 },
  gramsInput: {
    width: 60,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: "right",
    fontSize: 15,
    color: colors.text,
  },
  gramsUnit: { fontSize: 13, color: colors.muted },
  itemKcal: { width: 44, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.text },
  remove: { fontSize: 16, color: colors.danger, paddingLeft: 6 },
  totalRow: { paddingVertical: 12 },
  totalLabel: { fontSize: 13, color: colors.muted },
  totalValue: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 12 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cancel: { backgroundColor: colors.bg },
  save: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
  saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
