import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Novedad } from "../novedades";
import { Colors, useThemedStyles } from "../theme";
import FloatingCard from "./FloatingCard";

type Props = {
  novedad: Novedad | null;
  onClose: () => void;
};

/** Notas del parche que se enseñan una vez tras actualizar la app. */
export default function NovedadesModal({ novedad, onClose }: Props) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Modal visible={novedad != null} animationType="fade" transparent onRequestClose={onClose}>
      <FloatingCard>
        <Text style={styles.title}>Novedades</Text>
        <Text style={styles.version}>Versión {novedad?.version}</Text>

        {novedad?.cambios.map((cambio, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.text}>{cambio}</Text>
          </View>
        ))}

        <Pressable style={styles.button} onPress={onClose}>
          <Text style={styles.buttonText}>Entendido</Text>
        </Pressable>
      </FloatingCard>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    version: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 16 },
    item: { flexDirection: "row", gap: 8, marginBottom: 10 },
    bullet: { fontSize: 15, color: colors.primary, fontWeight: "700", lineHeight: 21 },
    text: { flex: 1, fontSize: 15, color: colors.text, lineHeight: 21 },
    button: {
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: colors.primary,
    },
    buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  });
