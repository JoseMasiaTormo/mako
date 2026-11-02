// src/theme.tsx
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { useSQLiteContext } from "expo-sqlite";
import { getSettings, setSettings } from "./db";

export const lightColors = {
  bg: "#F5F6F8",
  card: "#FFFFFF",
  text: "#1C1F24",
  muted: "#6B7280",
  border: "#E5E7EB",
  primary: "#16A34A",
  primarySoft: "#DCFCE7",
  danger: "#DC2626",
  protein: "#2563EB",
  carbs: "#F59E0B",
  fat: "#DB2777",
  water: "#0284C7",
  waterSoft: "#E0F2FE",
};

export type Colors = typeof lightColors;

export const darkColors: Colors = {
  bg: "#0F1115",
  card: "#1A1D23",
  text: "#F3F4F6",
  muted: "#9CA3AF",
  border: "#2A2E36",
  primary: "#22C55E",
  primarySoft: "#14532D",
  danger: "#F87171",
  protein: "#60A5FA",
  carbs: "#FBBF24",
  fat: "#F472B6",
  water: "#38BDF8",
  waterSoft: "#0C2A3D",
};

export type ThemeMode = "light" | "dark";

const THEME_KEY = "tema";

type ThemeContextValue = {
  mode: ThemeMode;
  colors: Colors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  colors: lightColors,
  toggleTheme: () => {},
});

/** Carga el tema guardado en SQLite y lo expone a la app. Debe ir dentro de SQLiteProvider. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [mode, setMode] = useState<ThemeMode | null>(null);

  useEffect(() => {
    getSettings(db, THEME_KEY).then((v) => setMode(v === "dark" ? "dark" : "light"));
  }, [db]);

  const toggleTheme = useCallback(() => {
    setMode((m) => {
      const next: ThemeMode = m === "dark" ? "light" : "dark";
      setSettings(db, THEME_KEY, next);
      return next;
    });
  }, [db]);

  const value = useMemo(
    () => ({ mode: mode ?? "light", colors: mode === "dark" ? darkColors : lightColors, toggleTheme }),
    [mode, toggleTheme],
  );

  // No pintamos nada hasta leer el tema, para evitar un parpadeo claro → oscuro.
  if (mode === null) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Crea (y memoiza) los estilos de un componente a partir de la paleta actual. */
export function useThemedStyles<T>(factory: (colors: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}
