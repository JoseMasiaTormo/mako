import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import CameraPermission from "./CameraPermission";

type Props = {
  onScanned: (codigo: string) => void;
  onClose: () => void;
};

export default function BarcodeScanner({ onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const handleScan = ({ data }: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    onScanned(data);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <CameraPermission
        permission={permission}
        requestPermission={requestPermission}
        message="Necesito permiso para usar la cámara y leer el código de barras."
        onClose={onClose}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={handleScan}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>Apunta al código de barras</Text>
        <View style={styles.frame} />
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeText}>Cancelar</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 40,
  },
  hint: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    overflow: "hidden",
  },
  frame: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 16,
  },
  closeButton: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  closeText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
