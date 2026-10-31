import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PermissionResponse } from "expo-camera";
import { colors } from "../theme";

type Props = {
  permission: PermissionResponse;
  requestPermission: () => void;
  message: string;
  onClose: () => void;
};

/** Pantalla que pide el permiso de cámara (o manda a Ajustes si ya se denegó). */
export default function CameraPermission({ permission, requestPermission, message, onClose }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.message}>{message}</Text>
      {permission.canAskAgain ? (
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Dar permiso</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.button} onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Abrir ajustes</Text>
        </Pressable>
      )}
      <Pressable style={styles.link} onPress={onClose}>
        <Text style={styles.linkText}>Cancelar</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center", padding: 24 },
  message: { color: "#fff", fontSize: 16, textAlign: "center", marginBottom: 20 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: "#fff", fontSize: 15 },
});
