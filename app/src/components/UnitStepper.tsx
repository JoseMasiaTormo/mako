import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, useThemedStyles } from "../theme";
import { formatUnidades, puedeRestar, unidadesMas, unidadesMenos } from "../utils/unidades";

type Props = {
  /** Unidades actuales (gramos / peso de una unidad). */
  unidades: number;
  onChange: (unidades: number) => void;
};

/** Contador "− 2 ud +". Al cambiar las unidades, el padre recalcula los gramos. */
export default function UnitStepper({ unidades, onChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const restar = puedeRestar(unidades);

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.button, !restar && styles.disabled]}
        onPress={() => onChange(unidadesMenos(unidades))}
        disabled={!restar}
        hitSlop={6}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{formatUnidades(unidades)} ud</Text>
      <Pressable style={styles.button} onPress={() => onChange(unidadesMas(unidades))} hitSlop={6}>
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    button: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: colors.primary, fontSize: 18, fontWeight: "700", lineHeight: 20 },
    value: { minWidth: 44, textAlign: "center", fontSize: 14, fontWeight: "600", color: colors.text },
    disabled: { opacity: 0.3 },
  });
