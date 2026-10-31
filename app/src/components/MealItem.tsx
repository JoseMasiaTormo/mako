import { Pressable, StyleSheet, Text, View } from "react-native";
import { Meal } from "../db";
import { colors } from "../theme";

type Props = {
  meal: Meal;
  onLongPress: () => void;
};

export default function MealItem({ meal, onLongPress }: Props) {
  return (
    <Pressable onLongPress={onLongPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <View style={styles.left}>
        <Text style={styles.name} numberOfLines={2}>
          {meal.name}
        </Text>
        <Text style={styles.macros}>
          {meal.grams != null ? `${Math.round(meal.grams)} g · ` : ""}P {Math.round(meal.protein)} · C{" "}
          {Math.round(meal.carbs)} · G {Math.round(meal.fat)}
        </Text>
      </View>
      <Text style={styles.kcal}>{Math.round(meal.kcal)} kcal</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  left: { flex: 1, marginRight: 12 },
  name: { fontSize: 16, fontWeight: "500", color: colors.text },
  macros: { fontSize: 13, color: colors.muted, marginTop: 2 },
  kcal: { fontSize: 15, fontWeight: "600", color: colors.text },
});
