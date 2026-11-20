// src/components/MicButton.tsx
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";

type Props = {
  escuchando: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
};

/**
 * Botón redondo con un micrófono dibujado con Views (la app no usa librería de iconos).
 * Mientras escucha se rellena de color para que se note que está grabando.
 */
export default function MicButton({ escuchando, onPress, disabled, size = 40 }: Props) {
  const { colors } = useTheme();
  const fg = escuchando ? "#fff" : colors.primary;
  const u = size / 40; // escala del dibujo

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={escuchando ? "Dejar de dictar" : "Dictar por voz"}
      accessibilityState={{ disabled, busy: escuchando }}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: colors.primary,
          backgroundColor: escuchando ? colors.danger : "transparent",
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        escuchando && { borderColor: colors.danger },
      ]}
    >
      <View style={{ alignItems: "center" }}>
        {/* cápsula */}
        <View style={{ width: 9 * u, height: 14 * u, borderRadius: 4.5 * u, backgroundColor: fg }} />
        {/* soporte en U */}
        <View
          style={{
            position: "absolute",
            top: 6 * u,
            width: 15 * u,
            height: 11 * u,
            borderWidth: 2 * u,
            borderTopWidth: 0,
            borderColor: fg,
            borderBottomLeftRadius: 7.5 * u,
            borderBottomRightRadius: 7.5 * u,
          }}
        />
        {/* pie */}
        <View style={{ width: 2 * u, height: 4 * u, marginTop: 3 * u, backgroundColor: fg }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
