// src/hooks/useDictado.ts
import { useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

/**
 * Dictado por voz con el reconocedor del móvil (en Android, el de Google).
 * La voz se pasa a texto en el dispositivo o en el servicio de Google, nunca
 * pasa por el Worker de Mako ni gasta análisis de IA.
 *
 * `onTexto` recibe lo que se va reconociendo (resultados parciales incluidos),
 * para que el usuario vea el texto aparecer mientras habla.
 */
export function useDictado(onTexto: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Solo este componente debe reaccionar a los eventos (el módulo es global).
  const activo = useRef(false);

  useSpeechRecognitionEvent("start", () => {
    if (activo.current) setEscuchando(true);
  });

  useSpeechRecognitionEvent("end", () => {
    activo.current = false;
    setEscuchando(false);
  });

  useSpeechRecognitionEvent("result", (e) => {
    if (!activo.current) return;
    const texto = e.results[0]?.transcript?.trim();
    if (texto) onTexto(texto);
  });

  useSpeechRecognitionEvent("error", (e) => {
    if (!activo.current) return;
    const msg = MENSAJES[e.error];
    if (msg) setAviso(msg);
  });

  const empezar = async () => {
    setAviso(null);
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setAviso(SIN_SERVICIO);
      return;
    }

    const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permiso.granted) {
      if (!permiso.canAskAgain) {
        Alert.alert(
          "Micrófono desactivado",
          "Para dictar lo que has comido, activa el permiso de micrófono de Mako en los ajustes del móvil.",
          [
            { text: "Ahora no", style: "cancel" },
            { text: "Abrir ajustes", onPress: () => Linking.openSettings() },
          ],
        );
      }
      return;
    }

    activo.current = true;
    setEscuchando(true);
    ExpoSpeechRecognitionModule.start({
      lang: "es-ES",
      interimResults: true,
      continuous: false,
    });
  };

  /** Deja de escuchar y se queda con lo reconocido hasta ahora. */
  const parar = () => {
    if (activo.current) ExpoSpeechRecognitionModule.stop();
  };

  /** Deja de escuchar y descarta lo que quedara pendiente (al cerrar el modal). */
  const cancelar = () => {
    if (!activo.current) return;
    activo.current = false;
    setEscuchando(false);
    ExpoSpeechRecognitionModule.abort();
  };

  const alternar = () => (escuchando ? parar() : empezar());

  return { escuchando, aviso, alternar, cancelar };
}

const SIN_SERVICIO =
  "Tu móvil no tiene reconocimiento de voz disponible. Escríbelo o usa el micrófono del teclado.";

/** Mensajes para cada error. Los que no están (p. ej. "aborted") no muestran nada. */
const MENSAJES: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  "no-speech": "No te he oído. Pulsa el micrófono y vuelve a probar.",
  "speech-timeout": "No te he oído. Pulsa el micrófono y vuelve a probar.",
  network: "Para dictar hace falta conexión a internet.",
  "not-allowed": "Mako necesita permiso para usar el micrófono.",
  "audio-capture": "No se ha podido usar el micrófono. Inténtalo de nuevo.",
  busy: "El micrófono está ocupado. Inténtalo en unos segundos.",
  "language-not-supported": SIN_SERVICIO,
  "service-not-allowed": SIN_SERVICIO,
};
