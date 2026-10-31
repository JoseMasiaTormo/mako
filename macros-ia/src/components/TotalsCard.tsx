import { Pressable, StyleSheet, Text, View } from "react-native";
import { Goals, Totals } from "../db";
import { colors } from "../theme";

type Props = {
  totals: Totals;
  goals: Goals | null;
  onSetGoals: () => void;
};

function ProgressBar({
  value,
  max,
  color,
  height = 6,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  const over = max > 0 && value > max;
  return (
    <View style={[styles.track, { height }]}>
      <View style={[styles.fill, { width: `${pct}%` as const, backgroundColor: over ? colors.danger : color }]} />
    </View>
  );
}

function Macro({ label, value, goal, color }: { label: string; value: number; goal?: number; color: string }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, { color }]}>
        {Math.round(value)}
        {goal ? <Text style={styles.macroGoal}> / {Math.round(goal)}</Text> : null} g
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
      {goal ? (
        <View style={styles.macroBar}>
          <ProgressBar value={value} max={goal} color={color} />
        </View>
      ) : null}
    </View>
  );
}

export default function TotalsCard({ totals, goals, onSetGoals }: Props) {
  const restante = goals ? Math.round(goals.kcal - totals.kcal) : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.kcal}>
        {Math.round(totals.kcal)}
        {goals ? <Text style={styles.kcalGoal}> / {goals.kcal}</Text> : null}
      </Text>
      <Text style={styles.kcalLabel}>kcal</Text>

      {goals ? (
        <>
          <View style={styles.kcalBar}>
            <ProgressBar value={totals.kcal} max={goals.kcal} color={colors.primary} height={10} />
          </View>
          <Text style={[styles.remaining, restante < 0 && styles.over]}>
            {restante >= 0 ? `Te quedan ${restante} kcal` : `Te has pasado ${-restante} kcal`}
          </Text>
        </>
      ) : (
        <Pressable onPress={onSetGoals} hitSlop={8}>
          <Text style={styles.setGoals}>Pon tus objetivos diarios</Text>
        </Pressable>
      )}

      <View style={styles.row}>
        <Macro label="Proteína" value={totals.protein} goal={goals?.protein} color={colors.protein} />
        <Macro label="Carbos" value={totals.carbs} goal={goals?.carbs} color={colors.carbs} />
        <Macro label="Grasa" value={totals.fat} goal={goals?.fat} color={colors.fat} />
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
  kcalGoal: { fontSize: 20, fontWeight: "500", color: colors.muted },
  kcalLabel: { fontSize: 14, color: colors.muted, marginBottom: 10 },
  kcalBar: { alignSelf: "stretch", marginBottom: 6 },
  remaining: { fontSize: 14, color: colors.muted, marginBottom: 14 },
  over: { color: colors.danger, fontWeight: "600" },
  setGoals: { fontSize: 14, color: colors.primary, fontWeight: "600", marginBottom: 14 },
  row: { flexDirection: "row", alignSelf: "stretch", gap: 12 },
  macro: { flex: 1, alignItems: "center" },
  macroValue: { fontSize: 17, fontWeight: "600" },
  macroGoal: { fontSize: 13, fontWeight: "500", color: colors.muted },
  macroLabel: { fontSize: 12, color: colors.muted },
  macroBar: { alignSelf: "stretch", marginTop: 6 },
  track: { backgroundColor: colors.bg, borderRadius: 999, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 999 },
});
