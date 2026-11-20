// Configuración dinámica: parte de app.json y solo la cambia para las builds de desarrollo.
//
// Con APP_VARIANT=development (perfil "development" de eas.json) la app se instala como otra
// distinta: "Mako Dev" con el paquete es.josemasia.mako.dev. Así convive en el móvil con la
// versión de Google Play (firmada con otra clave) sin desinstalarla ni perder sus datos.
// Los AAB de producción no cambian: siguen siendo es.josemasia.mako.

const IS_DEV = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => {
  if (!IS_DEV) return config;
  return {
    ...config,
    name: "Mako Dev",
    android: { ...config.android, package: "es.josemasia.mako.dev" },
    ios: { ...config.ios, bundleIdentifier: "es.josemasia.mako.dev" },
  };
};
