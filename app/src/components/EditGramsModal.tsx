import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ingrediente, Meal } from "../db";
import { Colors, useTheme, useThemedStyles } from "../theme";
import FloatingCard from "./FloatingCard";
import UnitStepper from "./UnitStepper";
import { gramosDeUnidades } from "../utils/unidades";

type Props = {
  meal: Meal | null;
  /** Desglose de la comida. Con dos o más se editan uno a uno; si no, se edita el total. */
  ingredientes: Ingrediente[];
  onClose: () => void;
  onSave: (meal: Meal, grams: number) => void;
  onSaveIngredientes: (meal: Meal, ingredientes: Ingrediente[]) => void;
};

type Editable = { base: Ingrediente; gramosText: string };

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Ingrediente con sus valores reescalados a los gramos indicados (igual que al añadir la comida). */
function escalar(i: Ingrediente, gramos: number): Ingrediente {
  const f = i.gramos > 0 ? gramos / i.gramos : 1;
  return {
    ...i,
    gramos,
    kcal: i.kcal * f,
    proteina: i.proteina * f,
    carbos: i.carbos * f,
    grasa: i.grasa * f,
  };
}

export default function EditGramsModal({ meal, ingredientes, onClose, onSave, onSaveIngredientes }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  // El padre le pone key={meal.id}, así que se vuelve a montar con cada comida.
  const [value, setValue] = useState(() => (meal?.grams ? String(Math.round(meal.grams)) : ""));
  const [items, setItems] = useState<Editable[]>(() =>
    ingredientes.map((base) => ({ base, gramosText: String(Math.round(base.gramos)) })),
  );

  const desglosada = ingredientes.length > 1;
  // Peso de una unidad al editar el total: el de su ingrediente, o (comidas antiguas) lo apuntado cuenta como una.
  const unidadG = ingredientes.length === 1 && ingredientes[0].unidad_g > 0 ? ingredientes[0].unidad_g : (meal?.grams ?? 0);

  const grams = num(value);
  const f = meal?.grams ? grams / meal.grams : 0;

  const computed = items.map((it) => escalar(it.base, num(it.gramosText)));
  const total = computed.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      proteina: acc.proteina + i.proteina,
      carbos: acc.carbos + i.carbos,
      grasa: acc.grasa + i.grasa,
    }),
    { kcal: 0, proteina: 0, carbos: 0, grasa: 0 },
  );
  // Un ingrediente que la IA dio sin gramos (0) puede quedarse así; el resto necesita gramos.
  const ingredientesValidos =
    items.length > 0 && items.every((it) => num(it.gramosText) > 0 || it.base.gramos === 0);

  const setItemGrams = (index: number) => (v: string) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, gramosText: v } : it)));
  const setItemUnidades = (index: number) => (unidades: number) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, gramosText: String(gramosDeUnidades(unidades, it.base.unidad_g)) } : it,
      ),
    );
  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const renderTotal = () => (
    <>
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
      {unidadG > 0 && (
        <UnitStepper
          unidades={grams / unidadG}
          onChange={(u) => setValue(String(gramosDeUnidades(u, unidadG)))}
        />
      )}

      {meal && grams > 0 && (
        <View style={styles.preview}>
          <Text style={styles.previewKcal}>{Math.round(meal.kcal * f)} kcal</Text>
          <Text style={styles.previewMacros}>
            P {Math.round(meal.protein * f)} · C {Math.round(meal.carbs * f)} · G {Math.round(meal.fat * f)}
          </Text>
        </View>
      )}
    </>
  );

  const renderIngredientes = () => (
    <>
      {computed.map((item, index) => (
        <View key={item.id} style={styles.itemRow}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.nombre}</Text>
            <View style={styles.itemMeta}>
              <Text style={[styles.badge, item.fuente === "etiqueta" ? styles.badgeEtiqueta : styles.badgeIa]}>
                {item.fuente === "etiqueta" ? "Etiqueta" : "Estimado"}
              </Text>
              <Text style={styles.itemMacros}>
                P {Math.round(item.proteina)} · C {Math.round(item.carbos)} · G {Math.round(item.grasa)}
              </Text>
            </View>
            {item.unidad_g > 0 && (
              <UnitStepper unidades={item.gramos / item.unidad_g} onChange={setItemUnidades(index)} />
            )}
          </View>
          <TextInput
            style={styles.gramsInput}
            value={items[index].gramosText}
            onChangeText={setItemGrams(index)}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={styles.gramsUnit}>g</Text>
          <Text style={styles.itemKcal}>{Math.round(item.kcal)}</Text>
          {/* Siempre tiene que quedar al menos uno: para quitarlo todo, se borra la comida. */}
          <Pressable onPress={() => removeItem(index)} hitSlop={10} disabled={items.length <= 1}>
            <Text style={[styles.remove, items.length <= 1 && styles.removeDisabled]}>✕</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.preview}>
        <Text style={styles.previewKcal}>{Math.round(total.kcal)} kcal</Text>
        <Text style={styles.previewMacros}>
          P {Math.round(total.proteina)} · C {Math.round(total.carbos)} · G {Math.round(total.grasa)}
        </Text>
      </View>
    </>
  );

  const puedeGuardar = desglosada ? ingredientesValidos : grams > 0;

  const guardar = () => {
    if (!meal || !puedeGuardar) return;
    if (desglosada) onSaveIngredientes(meal, computed);
    else onSave(meal, grams);
  };

  return (
    <Modal visible={meal != null} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.title} numberOfLines={2}>
          {meal?.name}
        </Text>

        {desglosada ? renderIngredientes() : renderTotal()}

        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.save, !puedeGuardar && styles.disabled]}
            disabled={!puedeGuardar}
            onPress={guardar}
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
    itemMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    itemMacros: { fontSize: 12, color: colors.muted, marginTop: 2 },
    badge: {
      fontSize: 10,
      fontWeight: "700",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    badgeEtiqueta: { backgroundColor: colors.primarySoft, color: colors.primary },
    badgeIa: { backgroundColor: colors.bg, color: colors.muted },
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
    removeDisabled: { opacity: 0.3 },
    buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.primary },
    disabled: { opacity: 0.5 },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  });
