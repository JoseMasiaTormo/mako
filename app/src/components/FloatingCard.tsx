// src/components/FloatingCard.tsx
import { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { Colors, useThemedStyles } from "../theme";

const GAP = 16;

/**
 * Tarjeta flotante centrada para el contenido de un Modal transparente.
 * Se mantiene centrada en el hueco libre por encima del teclado y hace scroll
 * si el contenido no cabe.
 */
export default function FloatingCard({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  const safe = useSafeAreaInsets();
  const { inset, onLayout } = useKeyboardInset();

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.backdrop,
        {
          paddingTop: safe.top + GAP,
          paddingBottom: inset > 0 ? inset + GAP : safe.bottom + GAP,
        },
      ]}
    >
      <View style={styles.card}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: GAP,
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    card: {
      flexShrink: 1,
      backgroundColor: colors.card,
      borderRadius: 20,
      overflow: "hidden",
    },
    scroll: { flexGrow: 0 },
    content: { padding: 20 },
  });
