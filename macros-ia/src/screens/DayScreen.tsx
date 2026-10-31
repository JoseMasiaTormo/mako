import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import {
  addMeal,
  deleteMeal,
  getGoals,
  getMealsByDate,
  getSettings,
  Goals,
  Meal,
  NewMeal,
  saveGoals,
  setSettings,
  sumTotals,
} from "../db";
import { addDays, labelFor, todayKey } from "../utils/date";
import TotalsCard from "../components/TotalsCard";
import MealItem from "../components/MealItem";
import AddMealModal from "../components/AddMealModal";
import GoalsModal from "../components/GoalsModal";
import { colors } from "../theme";

export default function DayScreen() {
  const db = useSQLiteContext();
  const [date, setDate] = useState(todayKey());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [goalsVisible, setGoalsVisible] = useState(false);

  const load = useCallback(async () => {
    const rows = await getMealsByDate(db, date);
    setMeals(rows);
  }, [db, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getGoals(db).then(setGoals);
  }, [db]);

  useEffect(() => {
    (async () => {
      const seen = await getSettings(db, "aviso_visto");
      if (!seen) {
        Alert.alert(
          "Antes de empezar",
          "Las calorías y macros que calcula la IA son estimaciones aproximadas. Úsalas como orientación, no como un valor exacto.",
          [{ text: "Entendido", onPress: () => setSettings(db, "aviso_visto", "1") }],
          { cancelable: false },
        );
      }
    })();
  }, [db]);

  const handleAdd = async (meal: Omit<NewMeal, "date">) => {
    await addMeal(db, { ...meal, date });
    setModalVisible(false);
    load();
  };

  const handleSaveGoals = async (g: Goals) => {
    await saveGoals(db, g);
    setGoals(g);
    setGoalsVisible(false);
  };

  const handleDelete = (meal: Meal) => {
    Alert.alert("Borrar comida", `¿Borrar "${meal.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          await deleteMeal(db, meal.id);
          load();
        },
      },
    ]);
  };

  const totals = sumTotals(meals);
  const isToday = date === todayKey();

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>Mako</Text>
        <Pressable onPress={() => setGoalsVisible(true)} hitSlop={12}>
          <Text style={styles.gear}>⚙︎</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Pressable onPress={() => setDate((d) => addDays(d, -1))} hitSlop={12}>
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setDate(todayKey())} disabled={isToday}>
          <Text style={styles.dateLabel}>{labelFor(date)}</Text>
        </Pressable>
        <Pressable onPress={() => setDate((d) => addDays(d, 1))} hitSlop={12}>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <TotalsCard totals={totals} goals={goals} onSetGoals={() => setGoalsVisible(true)} />

      <FlatList
        data={meals}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <MealItem meal={item} onLongPress={() => handleDelete(item)} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Sin comidas este día</Text>}
      />

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSave={handleAdd} />

      <GoalsModal
        visible={goalsVisible}
        initial={goals}
        onClose={() => setGoalsVisible(false)}
        onSave={handleSaveGoals}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  appTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
  gear: { fontSize: 24, color: colors.text },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  arrow: { fontSize: 32, color: colors.text, paddingHorizontal: 8 },
  dateLabel: { fontSize: 18, fontWeight: "600", color: colors.text, textTransform: "capitalize" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40, fontSize: 15 },
  fab: {
    position: "absolute",
    right: 24,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: "#fff", fontSize: 32, lineHeight: 34 },
});
