// Configuración dinámica: parte de app.json y solo la cambia para las builds de desarrollo y prueba.
//
// Con APP_VARIANT=development (perfil "development" de eas.json) la app se instala como otra
// distinta: "Mako Dev" con el paquete es.josemasia.mako.dev. Así convive en el móvil con la
// versión de Google Play (firmada con otra clave) sin desinstalarla ni perder sus datos.
//
// Con APP_VARIANT=preview (perfil "preview") es "Mako Test" con es.josemasia.mako.test: una build
// de release (con R8, como la de Play) para probar antes de subir, sin pisar la de Play ni la Dev.
//
// Los AAB de producción no cambian: siguen siendo es.josemasia.mako.

const VARIANTS = {
  development: { name: "Mako Dev", id: "es.josemasia.mako.dev" },
  preview: { name: "Mako Test", id: "es.josemasia.mako.test" },
};

module.exports = ({ config }) => {
  const variant = VARIANTS[process.env.APP_VARIANT];
  if (!variant) return config;
  return {
    ...config,
    name: variant.name,
    android: { ...config.android, package: variant.id },
    ios: { ...config.ios, bundleIdentifier: variant.id },
  };
};
