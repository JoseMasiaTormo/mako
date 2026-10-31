import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import CameraPermission from "./CameraPermission";

type Props = {
  onCaptured: (photo: { uri: string; width: number }) => void;
  onClose: () => void;
};

export default function LabelCamera({ onCaptured, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);

  const takePhoto = async () => {
    if (!ready || taking || !cameraRef.current) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      onCaptured({ uri: photo.uri, width: photo.width });
    } catch {
      setTaking(false);
      Alert.alert("Ups", "No se pudo hacer la foto. Inténtalo de nuevo.");
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <CameraPermission
        permission={permission}
        requestPermission={requestPermission}
        message="Necesito permiso para usar la cámara y leer la etiqueta nutricional."
        onClose={onClose}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        onCameraReady={() => setReady(true)}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>Encuadra la tabla nutricional</Text>
        <View style={styles.frame} />
        <View style={styles.controls}>
          <Pressable style={styles.closeButton} onPress={onClose} disabled={taking}>
            <Text style={styles.closeText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.shutter, (!ready || taking) && styles.disabled]}
            onPress={takePhoto}
            disabled={!ready || taking}
          >
            {taking ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
          </Pressable>
        </View>
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
    width: 280,
    height: 360,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: 16,
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 24 },
  closeButton: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  closeText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: "#000",
  },
  disabled: { opacity: 0.5 },
});
