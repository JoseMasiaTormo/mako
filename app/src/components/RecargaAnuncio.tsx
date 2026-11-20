// src/components/RecargaAnuncio.tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRewardedAd } from "react-native-google-mobile-ads";
import { SQLiteDatabase } from "expo-sqlite";
import { consultarUso, getUso } from "../api";
import {
  abrirOpcionesDePrivacidad,
  BLOQUE_BONIFICADO,
  hayOpcionesDePrivacidad,
  prepararAnuncios,
  prepararSiYaHayConsentimiento,
} from "../ads";
import { getDeviceId } from "../device";
import { useTheme } from "../theme";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Botón para ver un anuncio bonificado y conseguir `recarga` análisis más.
 * Solo se muestra cuando no quedan análisis (lo decide quien lo usa).
 *
 * Las peticiones extra no las da la app: AdMob avisa al Worker (/recompensa) con una firma,
 * y aquí solo se pregunta al Worker hasta que aparecen. El ID del dispositivo viaja en
 * customData para que el Worker sepa a quién recargar.
 */
export default function RecargaAnuncio({ db, recarga }: { db: SQLiteDatabase; recarga: number }) {
  const { colors } = useTheme();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sdkListo, setSdkListo] = useState(false);
  const [pedido, setPedido] = useState(false); // el usuario ha pulsado el botón
  const [preparando, setPreparando] = useState(false); // formulario de consentimiento / arranque
  const [sinConsentimiento, setSinConsentimiento] = useState(false);
  const [tarda, setTarda] = useState(false); // la recompensa no ha llegado al Worker a tiempo
  const [privacidad, setPrivacidad] = useState(false);

  useEffect(() => {
    getDeviceId(db).then(setDeviceId);
    prepararSiYaHayConsentimiento().then((ok) => ok && setSdkListo(true));
    hayOpcionesDePrivacidad().then(setPrivacidad);
  }, [db]);

  // Tiene que ser estable: si cambia, la librería tira el anuncio cargado y crea otro.
  const requestOptions = useMemo(
    () => (deviceId ? { serverSideVerificationOptions: { customData: deviceId } } : undefined),
    [deviceId],
  );
  const ad = useRewardedAd({
    adUnitId: deviceId ? BLOQUE_BONIFICADO : null,
    requestOptions,
    autoLoad: sdkListo,
  });

  // En cuanto el anuncio pedido está cargado, se enseña. (show tiene identidad estable.)
  const { status, show } = ad;
  useEffect(() => {
    if (pedido && status === "loaded") show();
  }, [pedido, status, show]);

  // Tras verlo entero, se pregunta al Worker hasta que llegue la recarga (AdMob tarda unos segundos).
  // Cuando llega, `restantes` deja de ser 0 y este componente desaparece solo.
  useEffect(() => {
    if (ad.status !== "closed" || !ad.earnedReward || !deviceId) return;
    let cancelado = false;
    (async () => {
      for (let i = 0; i < 12 && !cancelado; i++) {
        await espera(1500);
        await consultarUso(deviceId);
        if ((getUso()?.restantes ?? 0) > 0) return;
      }
      if (!cancelado) setTarda(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [ad.status, ad.earnedReward, deviceId]);

  const verAnuncio = async () => {
    setPedido(true);
    setTarda(false);
    setSinConsentimiento(false);
    if (!sdkListo) {
      setPreparando(true);
      const ok = await prepararAnuncios();
      setPreparando(false);
      setSdkListo(ok); // con autoLoad el anuncio empieza a cargarse solo
      setSinConsentimiento(!ok);
      if (!ok) setPedido(false);
      hayOpcionesDePrivacidad().then(setPrivacidad);
      return;
    }
    if (ad.status === "closed" || ad.status === "no-fill" || ad.status === "error" || ad.status === "idle") {
      ad.retry();
    }
  };

  const esperandoRecarga = ad.status === "closed" && ad.earnedReward && !tarda;
  const cargando =
    preparando || (pedido && (ad.status === "loading" || ad.status === "idle" || ad.status === "loaded"));
  const ocupado = cargando || esperandoRecarga || ad.status === "showing";

  let aviso: string | null = null;
  if (sinConsentimiento) aviso = "Para ver anuncios tienes que responder al aviso de privacidad.";
  else if (pedido && (ad.status === "no-fill" || ad.status === "error"))
    aviso = "Ahora mismo no hay anuncios disponibles. Prueba en un rato.";
  else if (ad.status === "closed" && !ad.earnedReward)
    aviso = `Tienes que ver el anuncio entero para conseguir los ${recarga} análisis.`;
  else if (tarda) aviso = "Tu recompensa está tardando. Cierra y vuelve a abrir esta ventana en un momento.";

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary }, ocupado && styles.disabled]}
        onPress={verAnuncio}
        disabled={ocupado}
        accessibilityRole="button"
      >
        {ocupado ? (
          <View style={styles.row}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.text}>{esperandoRecarga ? "Recargando…" : "Cargando anuncio…"}</Text>
          </View>
        ) : (
          <Text style={styles.text}>Ver un anuncio y conseguir {recarga} análisis más</Text>
        )}
      </Pressable>
      {aviso && <Text style={[styles.aviso, { color: colors.danger }]}>{aviso}</Text>}
      {privacidad && (
        <Pressable onPress={abrirOpcionesDePrivacidad} hitSlop={8}>
          <Text style={[styles.privacidad, { color: colors.muted }]}>Privacidad de los anuncios</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, gap: 6 },
  button: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  text: { color: "#fff", fontWeight: "700", fontSize: 15, textAlign: "center" },
  disabled: { opacity: 0.6 },
  aviso: { fontSize: 13 },
  privacidad: { fontSize: 12, textDecorationLine: "underline", textAlign: "center" },
});
