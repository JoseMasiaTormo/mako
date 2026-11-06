# Política de privacidad de Mako

**Última actualización:** 6 de noviembre de 2026

Esta política explica qué datos trata la aplicación **Mako** (paquete `es.josemasia.mako`), para qué se usan, con quién se comparten y qué puedes hacer con ellos.

## Responsable

Mako es una aplicación desarrollada por **FCO JOSE MASIA TORMO**.
Para cualquier duda o solicitud sobre privacidad puedes escribir a **josemasia2004@gmail.com**.

## Resumen

- Tu diario de comidas, tus objetivos, tu registro de agua y tus productos guardados se almacenan **solo en tu dispositivo**.
- Ahora mismo Mako no te pide crear una cuenta ni te pide tu nombre, tu email o tu ubicación.
- Cuando usas las funciones de inteligencia artificial, el texto que escribes o la foto de la etiqueta se envían a nuestro servidor y de ahí a **Google Gemini** para analizarlos. No guardamos ese contenido.
- No vendemos tus datos ni los usamos para publicidad.

## Datos que se guardan en tu dispositivo

La aplicación guarda localmente, en una base de datos del propio móvil:

- Las comidas que registras (descripción, cantidades, calorías y macronutrientes).
- Tus objetivos diarios y el registro de agua.
- Los productos que guardas en _Mis productos_.
- Tus preferencias, como los recordatorios.
- Un **identificador aleatorio de instalación** (un UUID generado por la app). No está ligado a tu identidad, a tu cuenta de Google ni a ningún identificador publicitario o del dispositivo.

Estos datos no salen de tu dispositivo salvo en los casos que se describen abajo. Si desinstalas la app o borras sus datos desde los ajustes de Android, se eliminan.

## Datos que salen de tu dispositivo

### 1. Análisis con inteligencia artificial

Cuando pides a Mako que analice una comida escrita o que lea una foto de una tabla nutricional, la app envía a nuestro servidor (alojado en **Cloudflare Workers**):

- El **texto** de la comida que has escrito, o
- La **foto de la etiqueta** que has hecho (reducida de tamaño).
- El **identificador aleatorio de instalación**, para aplicar el límite de uso diario.

El servidor reenvía el texto o la foto a la **API de Google Gemini**, que devuelve los valores nutricionales estimados. Nuestro servidor **no almacena** ni el texto ni la foto: solo los usa para responder a esa petición.

Mako usa la **API de pago de Gemini**. Según los [términos de la API de Gemini](https://ai.google.dev/gemini-api/terms), en los servicios de pago Google **no usa tus peticiones ni sus respuestas para mejorar sus productos ni para entrenar sus modelos**. Google puede conservarlas durante un tiempo limitado únicamente para detectar abusos y cumplir obligaciones legales. Puedes consultar la [política de privacidad de Google](https://policies.google.com/privacy).

Te recomendamos no incluir datos personales en el texto ni en las fotos que envías para analizar.

### 2. Límite de uso diario

Para evitar abusos, el servidor guarda un contador con:

- El identificador aleatorio de instalación.
- La fecha.
- El número de análisis realizados ese día.

Este contador no contiene el contenido de tus comidas ni ningún dato que te identifique.

### 3. Registros técnicos del servidor

Como cualquier servicio en Internet, el proveedor de alojamiento (**Cloudflare**) puede registrar datos técnicos de cada petición, como la **dirección IP**, la fecha y hora, y los posibles errores. Usamos estos registros solo para detectar fallos y abusos. Se conservan durante un tiempo limitado según la política de retención de Cloudflare. Más información en la [política de privacidad de Cloudflare](https://www.cloudflare.com/privacypolicy/).

### 4. Búsqueda de productos en Open Food Facts

Cuando escaneas un código de barras o mencionas un producto envasado, la app consulta directamente la base de datos pública de **[Open Food Facts](https://world.openfoodfacts.org)**. Se envían el **código de barras** o el **nombre del producto** que buscas y, como en cualquier conexión a Internet, Open Food Facts recibe tu dirección IP. Consulta su [política de privacidad](https://world.openfoodfacts.org/privacy).

## Permisos de la aplicación

- **Cámara**: para escanear códigos de barras y hacer fotos a las tablas nutricionales. El código de barras se lee en el propio dispositivo. Las fotos de etiquetas solo se envían cuando pides analizarlas y no se guardan en la galería.
- **Notificaciones**: para los recordatorios de comidas y agua que tú configures. Se programan en el propio dispositivo y no pasan por ningún servidor.

Mako no accede a tu ubicación, contactos, micrófono ni archivos.

## Finalidad y base legal

Tratamos los datos descritos únicamente para:

- Ofrecerte las funciones de análisis con inteligencia artificial que solicitas (ejecución del servicio que pides).
- Limitar el uso diario y proteger el servicio frente a abusos (interés legítimo).
- Detectar y corregir errores técnicos (interés legítimo).

## Con quién se comparten los datos

Solo con los proveedores necesarios para que la app funcione, y únicamente con la finalidad descrita:

| Proveedor           | Para qué                     | Datos                                               |
| ------------------- | ---------------------------- | --------------------------------------------------- |
| Cloudflare          | Alojar el servidor           | Peticiones de análisis, IP, identificador aleatorio |
| Google (Gemini API) | Analizar comidas y etiquetas | Texto de la comida o foto de la etiqueta            |
| Open Food Facts     | Buscar productos envasados   | Código de barras o nombre del producto, IP          |

Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo, con las garantías previstas en sus propias políticas (como las cláusulas contractuales tipo de la Comisión Europea).

No vendemos tus datos ni los compartimos con terceros con fines publicitarios.

## Seguridad

Todas las comunicaciones entre la app y los servicios externos se realizan cifradas mediante **HTTPS**.

## Tus derechos

Según el Reglamento General de Protección de Datos (RGPD), puedes solicitar el acceso, la rectificación, la supresión, la limitación u oposición al tratamiento y la portabilidad de tus datos escribiendo a **[EMAIL DE CONTACTO]**.

Como casi todos los datos se guardan solo en tu dispositivo, puedes borrarlos tú mismo en cualquier momento desinstalando la app o borrando sus datos desde los ajustes de Android. Los datos del servidor no están asociados a tu identidad, así que, en la práctica, no podemos vincularlos a ti.

También puedes presentar una reclamación ante la **Agencia Española de Protección de Datos** ([www.aepd.es](https://www.aepd.es)).

## Menores

Mako no está dirigida a menores de 14 años y no recopila conscientemente datos de menores.

## Cambios en esta política

Podemos actualizar esta política, por ejemplo si añadimos nuevas funciones o servicios. Publicaremos la nueva versión en esta misma dirección con su fecha de actualización y, si los cambios son importantes, te avisaremos dentro de la app.

## Aviso

Los valores nutricionales que ofrece Mako son **estimaciones** y no sustituyen el consejo de un profesional sanitario o de la nutrición.
