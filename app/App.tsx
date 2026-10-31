import { StatusBar } from "expo-status-bar";
import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { migrate } from "./src/db";
import DayScreen from "./src/screens/DayScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="marcos.db" onInit={migrate}>
        <DayScreen />
      </SQLiteProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
