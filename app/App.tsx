import { SQLiteProvider } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { migrate } from "./src/db";
import DayScreen from "./src/screens/DayScreen";
import { ThemeProvider } from "./src/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="marcos.db" onInit={migrate}>
        <ThemeProvider>
          <DayScreen />
        </ThemeProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
