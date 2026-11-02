// src/components/WaterCard.tsx
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Colors, useTheme, useThemedStyles } from "../theme";
import FloatingCard from "./FloatingCard";

const PRESETS = [150, 200, 250, 330, 500];

type Props = {
  ml: number;
  /** Objetivo diario en ml (0 = sin objetivo). */
  goal: number;
  /** Cantidad que suma/quita cada botón. */
  glassMl: number;
  onAdd: () => void;
  onRemoveLast: () => void;
  onChangeGlass: (ml: number) => void;
};

function formatMl(ml: number) {
  return ml >= 1000 ? `${(ml / 1000).toLocaleString("es-ES", { maximumFractionDigits: 2 })} L` : `${Math.round(ml)} ml`;
}

export default function WaterCard({ ml, goal, glassMl, onAdd, onRemoveLast, onChangeGlass }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [editing, setEditing] = useState(false);
  const pct = goal > 0 ? Math.min(ml / goal, 1) * 100 : 0;

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.label}>💧 Agua</Text>
        <Text style={styles.amount}>
          {formatMl(ml)}
          {goal > 0 ? <Text style={styles.goal}> / {formatMl(goal)}</Text> : null}
        </Text>
        {goal > 0 ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` as const }]} />
          </View>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            onPress={() => setEditing(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar cantidad por vaso, ahora ${glassMl} mililitros`}
          >
            <Text style={styles.chipText}>Vaso: {glassMl} ml ✎</Text>
          </Pressable>
          {goal > 0 && ml >= goal ? <Text style={styles.done}>¡Objetivo cumplido!</Text> : null}
        </View>
      </View>

      <View style={styles.buttons}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.minus, pressed && styles.pressed, ml <= 0 && styles.disabled]}
          onPress={onRemoveLast}
          disabled={ml <= 0}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Quitar el último vaso de agua"
        >
          <Text style={[styles.btnText, styles.minusText]}>−</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.plus, pressed && styles.pressed]}
          onPress={onAdd}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Añadir un vaso de agua, ${glassMl} mililitros`}
        >
          <Text style={[styles.btnText, styles.plusText]}>+</Text>
        </Pressable>
      </View>

      <GlassModal
        visible={editing}
        initial={glassMl}
        onClose={() => setEditing(false)}
        onSave={(v) => {
          onChangeGlass(v);
          setEditing(false);
        }}
      />
    </View>
  );
}

function GlassModal({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: number;
  onClose: () => void;
  onSave: (ml: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [value, setValue] = useState(String(initial));

  useEffect(() => {
    if (visible) setValue(String(initial));
  }, [visible, initial]);

  const save = () => {
    const n = Math.round(parseFloat(value.replace(",", ".")));
    if (!Number.isFinite(n) || n <= 0 || n > 5000) {
      Alert.alert("Cantidad no válida", "Pon una cantidad entre 1 y 5000 ml.");
      return;
    }
    onSave(n);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.modalTitle}>Cantidad por vaso</Text>
        <Text style={styles.modalHint}>Lo que suma el + y quita el − cada vez.</Text>

        <View style={styles.presets}>
          {PRESETS.map((p) => {
            const active = value === String(p);
            return (
              <Pressable
                key={p}
                style={[styles.preset, active && styles.presetActive]}
                onPress={() => setValue(String(p))}
              >
                <Text style={[styles.presetText, active && styles.presetTextActive]}>{p}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.inputLabel}>Personalizada (ml)</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          placeholderTextColor={colors.muted}
          selectTextOnFocus
        />

        <View style={styles.modalButtons}>
          <Pressable style={[styles.modalButton, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.modalButton, styles.save]} onPress={save}>
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </View>
      </FloatingCard>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.waterSoft,
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.water,
      gap: 12,
    },
    info: { flex: 1 },
    label: { fontSize: 13, fontWeight: "600", color: colors.water, marginBottom: 2 },
    amount: { fontSize: 24, fontWeight: "700", color: colors.text },
    goal: { fontSize: 16, fontWeight: "500", color: colors.muted },
    track: {
      height: 8,
      backgroundColor: colors.card,
      borderRadius: 999,
      overflow: "hidden",
      marginTop: 8,
    },
    fill: { height: "100%", backgroundColor: colors.water, borderRadius: 999 },
    footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.water,
      backgroundColor: colors.card,
    },
    chipText: { fontSize: 12, fontWeight: "600", color: colors.water },
    done: { fontSize: 12, fontWeight: "600", color: colors.water },
    buttons: { flexDirection: "row", gap: 10 },
    btn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
    },
    plus: { backgroundColor: colors.water },
    minus: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.water },
    btnText: { fontSize: 28, lineHeight: 30 },
    plusText: { color: "#fff" },
    minusText: { color: colors.water },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.35 },

    modalTitle: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 4 },
    modalHint: { fontSize: 13, color: colors.muted, marginBottom: 16 },
    presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    preset: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.water,
    },
    presetActive: { backgroundColor: colors.water },
    presetText: { color: colors.water, fontWeight: "600" },
    presetTextActive: { color: "#fff" },
    inputLabel: { fontSize: 13, color: colors.muted, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    modalButtons: { flexDirection: "row", gap: 10, marginTop: 20 },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.water },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  });
