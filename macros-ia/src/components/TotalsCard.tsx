import { StyleSheet, Text, View } from "react-native";
import { Totals } from "../db";
import { colors } from "../theme";

type Props = { totals: Totals };

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, { color }]}>{Math.round(value)} g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

export default function TotalsCard({ totals }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.kcal}>{Math.round(totals.kcal)}</Text>
      <Text style={styles.kcalLabel}>kcal</Text>
      <View style={styles.row}>
        <Macro label="Proteína" value={totals.protein} color={colors.protein} />
        <Macro label="Carbos" value={totals.carbs} color={colors.carbs} />
        <Macro label="Grasa" value={totals.fat} color={colors.fat} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  kcal: { fontSize: 40, fontWeight: "700", color: colors.text },
  kcalLabel: { fontSize: 14, color: colors.muted, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-around", alignSelf: "stretch" },
  macro: { alignItems: "center" },
  macroValue: { fontSize: 18, fontWeight: "600" },
  macroLabel: { fontSize: 12, color: colors.muted },
});
