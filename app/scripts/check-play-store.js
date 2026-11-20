#!/usr/bin/env node
// Comprobaciones básicas antes de generar el AAB para Google Play.
//
// Uso:
//   node scripts/check-play-store.js           -> comprueba app.json, versiones e iconos
//   node scripts/check-play-store.js --manifest -> además revisa android/ (tras `expo prebuild`)
//
// Sale con código 1 si algo falla, para que GitHub Actions marque el job en rojo.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const errors = [];
const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => {
  console.log(`  ✖ ${msg}`);
  errors.push(msg);
};
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

/** Lee ancho, alto y tipo de color de la cabecera IHDR de un PNG. */
function pngInfo(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const signature = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== signature) return null;
  const colorType = buf[25]; // 2 = RGB, 6 = RGBA, 0 = gris, 4 = gris+alfa, 3 = paleta
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6,
  };
}

function checkPng(rel, { size, square = true, noAlpha = false, alpha = false }) {
  if (!rel) return fail("Falta la ruta de un icono en app.json");
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return fail(`${rel} no existe`);
  const info = pngInfo(rel);
  if (!info) return fail(`${rel} no es un PNG válido`);
  const desc = `${rel} (${info.width}x${info.height})`;
  if (square && info.width !== info.height) return fail(`${desc} debe ser cuadrado`);
  if (size && info.width < size) return fail(`${desc} debe medir al menos ${size}x${size}`);
  if (noAlpha && info.hasAlpha) return fail(`${desc} no debe tener transparencia`);
  if (alpha && !info.hasAlpha) return fail(`${desc} debe tener fondo transparente`);
  ok(desc);
}

// ---------------------------------------------------------------------------
console.log("\napp.json y versiones");
const { expo } = readJson("app.json");
const pkg = readJson("package.json");

check(/^\d+\.\d+\.\d+$/.test(expo.version ?? ""), `versión con formato x.y.z (${expo.version})`);
check(expo.version === pkg.version, `app.json (${expo.version}) y package.json (${pkg.version}) tienen la misma versión`);
check(expo.android?.package === "es.josemasia.mako", `package de Android es es.josemasia.mako (${expo.android?.package})`);
// El micrófono se usa para dictar en el modo Automático (expo-speech-recognition).
// Si se quita el permiso, el botón del micro deja de funcionar sin dar error al compilar.
check(
  (expo.android?.permissions ?? []).includes("android.permission.RECORD_AUDIO"),
  "se pide RECORD_AUDIO (dictado por voz)",
);
check(
  !(expo.android?.blockedPermissions ?? []).includes("android.permission.RECORD_AUDIO"),
  "RECORD_AUDIO no está en blockedPermissions",
);
check(
  (expo.plugins ?? []).some((p) => (Array.isArray(p) ? p[0] : p) === "expo-speech-recognition"),
  "el plugin expo-speech-recognition está activado",
);
check(
  (expo.plugins ?? []).includes("./plugins/withOptionalScreenFeatures"),
  "el plugin withOptionalScreenFeatures está activado",
);

// AdMob: sin App ID la app se cierra nada más abrirla.
const ADMOB_TEST_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const ads = (expo.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "react-native-google-mobile-ads");
const admobAppId = ads?.[1]?.androidAppId ?? "";
check(/^ca-app-pub-\d{16}~\d{10}$/.test(admobAppId), `App ID de AdMob para Android con formato válido (${admobAppId})`);
const configTs = fs.readFileSync(path.join(ROOT, "src/config.ts"), "utf8");
const bloque = configTs.match(/ADMOB_REWARDED_AD_UNIT = "([^"]*)"/)?.[1] ?? "";
check(!bloque || /^ca-app-pub-\d{16}\/\d{10}$/.test(bloque), `ID del bloque bonificado con formato válido (${bloque || "vacío: prueba"})`);
if (admobAppId === ADMOB_TEST_APP_ID || !bloque) {
  // No falla: se puede publicar, pero los anuncios serán los de prueba y no darán dinero.
  console.log("  ⚠ AdMob usa IDs de prueba: los anuncios no generarán ingresos");
}

// ---------------------------------------------------------------------------
console.log("\nIconos");
checkPng(expo.icon, { size: 1024, noAlpha: true });
checkPng(expo.android?.adaptiveIcon?.foregroundImage, { size: 1024, alpha: true });
const notif = (expo.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-notifications");
checkPng(notif?.[1]?.icon, { size: 96, alpha: true });
if (expo.web?.favicon) checkPng(expo.web.favicon, { size: 48 });
if (fs.existsSync(path.join(ROOT, "assets/play-store-icon.png"))) {
  checkPng("assets/play-store-icon.png", { size: 512, noAlpha: true });
}

// ---------------------------------------------------------------------------
if (process.argv.includes("--manifest")) {
  console.log("\nAndroidManifest.xml generado por expo prebuild");
  const manifestPath = path.join(ROOT, "android/app/src/main/AndroidManifest.xml");
  const gradlePath = path.join(ROOT, "android/app/build.gradle");
  if (!fs.existsSync(manifestPath)) {
    fail("No existe android/. Ejecuta antes `npx expo prebuild --platform android --no-install`");
  } else {
    const manifest = fs.readFileSync(manifestPath, "utf8");
    const gradle = fs.readFileSync(gradlePath, "utf8");

    // Lo que hizo fallar la subida de la v1.4.1: Play daba por obligatoria la
    // pantalla en vertical y dejaba fuera tablets/Chromebooks.
    for (const feature of ["android.hardware.screen.portrait", "android.hardware.screen.landscape"]) {
      const re = new RegExp(`<uses-feature[^>]*android:name="${feature.replace(/\./g, "\\.")}"[^>]*>`);
      const tag = manifest.match(re)?.[0];
      check(tag?.includes('android:required="false"'), `${feature} declarado como opcional`);
    }

    const recordAudio = manifest.match(/<uses-permission[^>]*RECORD_AUDIO[^>]*>/)?.[0];
    check(recordAudio && !recordAudio.includes('tools:node="remove"'), "RECORD_AUDIO está en el manifest");

    // El reconocedor de voz es otra app (Google). Sin esta consulta, en Android 11+
    // isRecognitionAvailable() puede devolver false aunque el móvil lo tenga.
    check(manifest.includes("android.speech.RecognitionService"), "consulta a android.speech.RecognitionService");

    check(
      manifest.includes('android:name="com.google.android.gms.ads.APPLICATION_ID"') && manifest.includes(admobAppId),
      "App ID de AdMob en el manifest",
    );

    check(gradle.includes(`applicationId '${expo.android.package}'`), `applicationId es ${expo.android.package}`);
    check(gradle.includes(`versionName "${expo.version}"`), `versionName es ${expo.version}`);
  }
}

// ---------------------------------------------------------------------------
if (errors.length) {
  console.log(`\n✖ ${errors.length} comprobación(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✔ Todo correcto");
