import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Meal } from "../db";
import { Colors, useTheme, useThemedStyles } from "../theme";
import FloatingCard from "./FloatingCard";

type Props = {
  meal: Meal | null;
  onClose: () => void;
  onSave: (meal: Meal, grams: number) => void;
};

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function EditGramsModal({ meal, onClose, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  // El padre le pone key={meal.id}, así que se vuelve a montar con cada comida.
  const [value, setValue] = useState(() => (meal?.grams ? String(Math.round(meal.grams)) : ""));

  const grams = num(value);
  const f = meal?.grams ? grams / meal.grams : 0;

  return (
    <Modal visible={meal != null} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.title} numberOfLines={2}>
          {meal?.name}
        </Text>

        <Text style={styles.label}>Gramos</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholderTextColor={colors.muted}
          autoFocus
          selectTextOnFocus
        />

        {meal && grams > 0 && (
          <View style={styles.preview}>
            <Text style={styles.previewKcal}>{Math.round(meal.kcal * f)} kcal</Text>
            <Text style={styles.previewMacros}>
              P {Math.round(meal.protein * f)} · C {Math.round(meal.carbs * f)} · G {Math.round(meal.fat * f)}
            </Text>
          </View>
        )}

        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.save, grams <= 0 && styles.disabled]}
            disabled={grams <= 0}
            onPress={() => meal && onSave(meal, grams)}
          >
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
    preview: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
      padding: 12,
      borderRadius: 10,
      marginTop: 12,
    },
    previewKcal: { color: colors.text, fontWeight: "600", fontSize: 15 },
    previewMacros: { color: colors.muted, fontSize: 14 },
    buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.primary },
    disabled: { opacity: 0.5 },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  });
