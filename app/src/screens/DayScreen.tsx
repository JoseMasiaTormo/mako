import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import {
  addMeal,
  addWater,
  DEFAULT_GLASS_ML,
  deleteMeal,
  getGlassMl,
  getGoals,
  getMealsByDate,
  getWaterByDate,
  getSettings,
  Goals,
  Meal,
  NewMeal,
  removeLastWater,
  saveGoals,
  setGlassMl,
  setSettings,
  sumTotals,
  updateMealGrams,
} from "../db";
import { addDays, labelFor, todayKey } from "../utils/date";
import { getRemindersEnabled, initReminders, setRemindersEnabled, syncReminders } from "../reminders";
import TotalsCard from "../components/TotalsCard";
import MealItem from "../components/MealItem";
import AddMealModal from "../components/AddMealModal";
import GoalsModal from "../components/GoalsModal";
import EditGramsModal from "../components/EditGramsModal";
import Logo from "../components/Logo";
import WaterCard from "../components/WaterCard";
import { Colors, useTheme, useThemedStyles } from "../theme";

export default function DayScreen() {
  const styles = useThemedStyles(makeStyles);
  const { mode, toggleTheme } = useTheme();
  const db = useSQLiteContext();
  const [date, setDate] = useState(todayKey());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [water, setWater] = useState(0);
  const [glassMl, setGlassMlState] = useState(DEFAULT_GLASS_ML);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [goalsVisible, setGoalsVisible] = useState(false);
  const [editing, setEditing] = useState<Meal | null>(null);
  const [reminders, setReminders] = useState(false);

  const load = useCallback(async () => {
    const [rows, ml] = await Promise.all([getMealsByDate(db, date), getWaterByDate(db, date)]);
    setMeals(rows);
    setWater(ml);
  }, [db, date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getGoals(db).then(setGoals);
    getGlassMl(db).then(setGlassMlState);
  }, [db]);

  useEffect(() => {
    (async () => {
      // Pide permiso de notificaciones (solo la primera vez) y reprograma los recordatorios.
      const reminders = () =>
        initReminders(db)
          .then(() => getRemindersEnabled(db))
          .then(setReminders)
          .catch(() => {});

      const seen = await getSettings(db, "aviso_visto");
      if (!seen) {
        // Primero el aviso y luego el permiso, para no encadenar dos diálogos a la vez.
        Alert.alert(
          "Antes de empezar",
          "Las calorías y macros que calcula la IA son estimaciones aproximadas. Úsalas como orientación, no como un valor exacto.",
          [
            {
              text: "Entendido",
              onPress: async () => {
                await setSettings(db, "aviso_visto", "1");
                reminders();
              },
            },
          ],
          { cancelable: false },
        );
      } else {
        reminders();
      }
    })();
  }, [db]);

  const handleAdd = async (meal: Omit<NewMeal, "date">) => {
    await addMeal(db, { ...meal, date });
    setModalVisible(false);
    load();
  };

  const handleAddWater = async () => {
    setWater((w) => w + glassMl); // respuesta inmediata
    await addWater(db, date, glassMl);
    load();
    if (date === todayKey()) syncReminders(db).catch(() => {});
  };

  const handleRemoveWater = async () => {
    await removeLastWater(db, date);
    load();
    if (date === todayKey()) syncReminders(db).catch(() => {});
  };

  const handleChangeGlass = (ml: number) => {
    setGlassMlState(ml);
    setGlassMl(db, ml);
  };

  const handleSaveGoals = async (g: Goals) => {
    await saveGoals(db, g);
    setGoals(g);
    setGoalsVisible(false);
    syncReminders(db).catch(() => {});
  };

  const handleEditGrams = async (meal: Meal, grams: number) => {
    await updateMealGrams(db, meal, grams);
    setEditing(null);
    load();
  };

  const handleToggleReminders = async (on: boolean) => {
    setReminders(on);
    const ok = await setRemindersEnabled(db, on).catch(() => false);
    setReminders(ok);
    if (on && !ok) {
      Alert.alert(
        "Notificaciones desactivadas",
        "Para recibir los recordatorios, permite las notificaciones de Mako en los ajustes del móvil.",
      );
    }
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
        <Logo height={24} />
        <View style={styles.actions}>
          <Pressable
            onPress={toggleTheme}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={mode === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          >
            <Text style={styles.gear}>{mode === "dark" ? "☀︎" : "☾"}</Text>
          </Pressable>
          <Pressable onPress={() => setGoalsVisible(true)} hitSlop={12}>
            <Text style={styles.gear}>⚙︎</Text>
          </Pressable>
        </View>
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

      <WaterCard
        ml={water}
        goal={goals?.water ?? 0}
        glassMl={glassMl}
        onAdd={handleAddWater}
        onRemoveLast={handleRemoveWater}
        onChangeGlass={handleChangeGlass}
      />

      <TotalsCard totals={totals} goals={goals} onSetGoals={() => setGoalsVisible(true)} />

      <FlatList
        data={meals}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => (
          <MealItem
            meal={item}
            onPress={item.grams ? () => setEditing(item) : undefined}
            onLongPress={() => handleDelete(item)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Sin comidas este día</Text>}
      />

      <Pressable style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <AddMealModal visible={modalVisible} onClose={() => setModalVisible(false)} onSave={handleAdd} />

      <EditGramsModal key={editing?.id ?? "cerrado"} meal={editing} onClose={() => setEditing(null)} onSave={handleEditGrams} />

      <GoalsModal
        visible={goalsVisible}
        initial={goals}
        reminders={reminders}
        onToggleReminders={handleToggleReminders}
        onClose={() => setGoalsVisible(false)}
        onSave={handleSaveGoals}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    actions: { flexDirection: "row", alignItems: "center", gap: 20 },
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
