// src/ads.ts
import mobileAds, {
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  TestIds,
} from "react-native-google-mobile-ads";
import { ADMOB_REWARDED_AD_UNIT } from "./config";

/**
 * Bloque de anuncios bonificados. Sin ID configurado, el de prueba de Google, pero con ese AdMob
 * no avisa al Worker y la recarga no llega. También en desarrollo se usa el bloque real: para no
 * romper las normas de AdMob, registra tu móvil como dispositivo de prueba (los emuladores ya lo son).
 */
export const BLOQUE_BONIFICADO = ADMOB_REWARDED_AD_UNIT || TestIds.REWARDED;

let preparando: Promise<boolean> | null = null;

/**
 * Pide el consentimiento de anuncios (formulario de Google, obligatorio en la UE) si hace falta
 * y arranca el SDK de anuncios. Solo se llama cuando el usuario quiere ver un anuncio, para no
 * enseñar el formulario a quien nunca llega al límite.
 * Devuelve true si ya se pueden pedir anuncios.
 */
export function prepararAnuncios(): Promise<boolean> {
  preparando ??= (async () => {
    try {
      await AdsConsent.gatherConsent();
    } catch {
      // Si falla el formulario se intenta igualmente con lo que se sepa del consentimiento.
    }
    const info = await AdsConsent.getConsentInfo().catch(() => null);
    if (info && !info.canRequestAds) {
      preparando = null; // que lo vuelva a preguntar la próxima vez
      return false;
    }
    await mobileAds().initialize();
    return true;
  })();
  return preparando;
}

/**
 * Si el usuario ya respondió al consentimiento en otra sesión, arranca el SDK sin enseñar nada,
 * para que el anuncio esté cargado antes de que lo pida.
 */
export async function prepararSiYaHayConsentimiento(): Promise<boolean> {
  const info = await AdsConsent.getConsentInfo().catch(() => null);
  return info?.canRequestAds ? prepararAnuncios() : false;
}

/** En la UE hay que dejar cambiar el consentimiento en cualquier momento. */
export async function hayOpcionesDePrivacidad() {
  const info = await AdsConsent.getConsentInfo().catch(() => null);
  return info?.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
}

export function abrirOpcionesDePrivacidad() {
  return AdsConsent.showPrivacyOptionsForm().catch(() => undefined);
}
