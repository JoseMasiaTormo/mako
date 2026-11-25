// src/components/AddMealModal.tsx
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteFavorito,
  Favorito,
  favoritoComoComida,
  getFavoritos,
  getMiProductoPorCodigo,
  getMisProductos,
  NewMeal,
  NuevoMiProducto,
  saveMiProducto,
} from "../db";
import { AiItem, analizarComida, ApiError, EtiquetaLeida, leerEtiqueta } from "../api";
import { Colors, useTheme, useThemedStyles } from "../theme";
import { useSQLiteContext } from "expo-sqlite";
import { buscarPorNombre, enriquecerItems, itemDeEtiqueta } from "../products";
import BarcodeScanner from "./BarcodeScanner";
import LabelCamera from "./LabelCamera";
import { buscarPorCodigo } from "../openfoodfacts";
import { getDeviceId } from "../device";
import { prepararFoto } from "../image";
import FloatingCard from "./FloatingCard";
import { useUso } from "../hooks/useUso";
import UnitStepper from "./UnitStepper";
import MicButton from "./MicButton";
import RecargaAnuncio from "./RecargaAnuncio";
import { useDictado } from "../hooks/useDictado";
import { gramosDeUnidades } from "../utils/unidades";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (meal: Omit<NewMeal, "date">) => void;
};

type Mode = "auto" | "manual" | "favoritas";

const MAX_TEXTO = 300;
type EditableItem = { base: AiItem; gramosText: string };

const emptyManual = { name: "", grams: "", kcal: "", protein: "", carbs: "", fat: "" };
type ManualKey = keyof typeof emptyManual;

// Formulario de "Añadir producto". Los valores nutricionales son por 100 g.
const emptyProduct = { codigo: "", nombre: "", marca: "", racion: "", kcal: "", proteina: "", carbos: "", grasa: "" };
type ProductDraft = typeof emptyProduct;
type ProductKey = keyof ProductDraft;

/** Texto para un campo numérico del formulario: "12.5", o "" si no hay valor. */
function numText(n: number | null) {
  return n == null ? "" : String(Math.round(n * 10) / 10);
}

/** Rellena el formulario con lo leído en la etiqueta. Nombre, marca y ración solo si estaban vacíos. */
function rellenarConEtiqueta(d: ProductDraft, e: EtiquetaLeida): ProductDraft {
  return {
    ...d,
    nombre: d.nombre.trim() ? d.nombre : e.nombre,
    marca: d.marca.trim() ? d.marca : e.marca,
    racion: d.racion.trim() ? d.racion : numText(e.racion_g),
    kcal: numText(Math.round(e.kcal)),
    proteina: numText(e.proteina),
    carbos: numText(e.carbos),
    grasa: numText(e.grasa),
  };
}

function num(v: string) {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function scale(item: AiItem, grams: number): AiItem {
  const f = item.gramos > 0 ? grams / item.gramos : 1;
  return {
    ...item,
    gramos: grams,
    kcal: item.kcal * f,
    proteina: item.proteina * f,
    carbos: item.carbos * f,
    grasa: item.grasa * f,
  };
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={numeric ? "decimal-pad" : "default"}
      />
    </View>
  );
}

export default function AddMealModal({ visible, onClose, onSave }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>("auto");
  const [texto, setTexto] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(emptyManual);
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState<ProductDraft | null>(null);
  const [capturingLabel, setCapturingLabel] = useState(false);
  const [readingLabel, setReadingLabel] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  // Producto encontrado en Open Food Facts al escanear. Se guarda en Mis productos al añadirlo,
  // para que otro día se encuentre escribiendo su nombre (modo Automático) o escaneándolo sin conexión.
  const [escaneado, setEscaneado] = useState<NuevoMiProducto | null>(null);

  const db = useSQLiteContext();
  const uso = useUso(db, visible);

  // null mientras se cargan.
  const [favoritos, setFavoritos] = useState<Favorito[] | null>(null);
  useEffect(() => {
    if (!visible || mode !== "favoritas") return;
    let vivo = true;
    getFavoritos(db)
      .then((f) => vivo && setFavoritos(f))
      .catch(() => vivo && setFavoritos([]));
    return () => {
      vivo = false;
    };
  }, [db, visible, mode]);

  // Dictado por voz: lo que se dice se añade detrás de lo que ya estuviera escrito.
  const textoAntesDeDictar = useRef("");
  const dictado = useDictado((dicho) => {
    const antes = textoAntesDeDictar.current.trim();
    setTexto((antes ? `${antes} ${dicho}` : dicho).slice(0, MAX_TEXTO));
  });
  const alternarDictado = () => {
    if (!dictado.escuchando) textoAntesDeDictar.current = texto;
    dictado.alternar();
  };

  const reset = () => {
    dictado.cancelar();
    setMode("auto");
    setTexto("");
    setItems([]);
    setLoading(false);
    setManual(emptyManual);
    setScanning(false);
    setProduct(null);
    setCapturingLabel(false);
    setReadingLabel(false);
    setSavingProduct(false);
    setEscaneado(null);
    setFavoritos(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const analizar = async () => {
    if (!texto.trim() || loading) return;
    setLoading(true);
    try {
      // Si lo escrito es el nombre de uno de Mis productos, se usa directamente y no se gasta IA.
      const mio = buscarPorNombre(await getMisProductos(db).catch(() => []), texto);
      if (mio) {
        mostrarProducto(itemDeEtiqueta(mio, mio.marca, mio.racion_g || 100));
        return;
      }

      const deviceId = await getDeviceId(db);
      const result = await analizarComida(texto.trim(), deviceId);
      const enriched = await enriquecerItems(db, result);
      setItems(enriched.map((base) => ({ base, gramosText: String(base.gramos) })));
    } catch (e) {
      Alert.alert("Ups", e instanceof ApiError ? e.message : "Algo ha fallado.");
    } finally {
      setLoading(false);
    }
  };

  const mostrarProducto = (base: AiItem) => {
    setTexto(base.nombre);
    setItems([{ base, gramosText: String(base.gramos) }]);
    setEscaneado(null);
  };

  const handleScanned = async (codigo: string) => {
    setScanning(false);
    setLoading(true);
    try {
      // 1. Mis productos (sin red). 2. Open Food Facts.
      const mio = await getMiProductoPorCodigo(db, codigo);
      if (mio) {
        mostrarProducto(itemDeEtiqueta(mio, mio.marca, mio.racion_g || 100));
        return;
      }

      const p = await buscarPorCodigo(codigo);
      if (!p) {
        Alert.alert("Producto no encontrado", "No está en Open Food Facts o le faltan datos. ¿Quieres añadirlo tú?", [
          { text: "Cancelar", style: "cancel" },
          { text: "Añadir producto", onPress: () => setProduct({ ...emptyProduct, codigo }) },
        ]);
        return;
      }

      mostrarProducto(itemDeEtiqueta(p, p.marca, p.gramosSugeridos));
      setEscaneado({
        codigo,
        nombre: p.nombre,
        marca: p.marca,
        kcal: p.kcal,
        proteina: p.proteina,
        carbos: p.carbos,
        grasa: p.grasa,
        racion_g: p.gramosSugeridos,
      });
    } catch {
      Alert.alert("Ups", "No se pudo conectar. Revisa tu conexión a internet.");
    } finally {
      setLoading(false);
    }
  };

  const setProductField = (key: ProductKey) => (value: string) => setProduct((d) => (d ? { ...d, [key]: value } : d));

  const handleLabelPhoto = async (photo: { uri: string; width: number }) => {
    setCapturingLabel(false);
    setReadingLabel(true);
    try {
      let imagen: string;
      try {
        imagen = await prepararFoto(photo.uri, photo.width);
      } catch {
        throw new ApiError("No se pudo procesar la foto. Inténtalo de nuevo.");
      }
      const deviceId = await getDeviceId(db);
      const leida = await leerEtiqueta(imagen, deviceId);
      // Si el usuario ha cerrado el formulario mientras tanto, no se reabre.
      setProduct((d) => (d ? rellenarConEtiqueta(d, leida) : d));
    } catch (e) {
      Alert.alert("Ups", e instanceof ApiError ? e.message : "Algo ha fallado.");
    } finally {
      setReadingLabel(false);
    }
  };

  const saveProduct = async () => {
    if (!product || savingProduct || readingLabel) return;
    const nombre = product.nombre.trim();
    if (!nombre) {
      Alert.alert("Falta el nombre", "Ponle un nombre para guardar.");
      return;
    }
    const faltan = [product.kcal, product.proteina, product.carbos, product.grasa].some((v) => !v.trim());
    if (faltan) {
      Alert.alert("Faltan datos", "Rellena las kcal, proteína, carbos y grasa por 100 g (pon 0 si no tiene).");
      return;
    }

    const racion = num(product.racion);
    const nuevo: NuevoMiProducto = {
      codigo: product.codigo || null,
      nombre,
      marca: product.marca.trim(),
      kcal: num(product.kcal),
      proteina: num(product.proteina),
      carbos: num(product.carbos),
      grasa: num(product.grasa),
      racion_g: racion > 0 ? racion : null,
    };

    setSavingProduct(true);
    try {
      await saveMiProducto(db, nuevo);
    } catch {
      Alert.alert("Ups", "No se pudo guardar el producto.");
      setSavingProduct(false);
      return;
    }
    // Se usa lo que se ha guardado (nuevo), no los textos del formulario.
    mostrarProducto(itemDeEtiqueta(nuevo, nuevo.marca, nuevo.racion_g || 100));
    setProduct(null);
    setSavingProduct(false);
  };

  const setItemGrams = (index: number) => (value: string) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, gramosText: value } : it)));

  const setItemUnidades = (index: number) => (unidades: number) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === index ? { ...it, gramosText: String(gramosDeUnidades(unidades, it.base.unidad_g)) } : it,
      ),
    );

  const removeItem = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index));

  const computed = items.map((it) => scale(it.base, num(it.gramosText)));
  const total = computed.reduce(
    (acc, i) => ({
      gramos: acc.gramos + i.gramos,
      kcal: acc.kcal + i.kcal,
      proteina: acc.proteina + i.proteina,
      carbos: acc.carbos + i.carbos,
      grasa: acc.grasa + i.grasa,
    }),
    { gramos: 0, kcal: 0, proteina: 0, carbos: 0, grasa: 0 },
  );

  const saveIa = () => {
    if (!computed.length) return;
    if (escaneado) {
      // Si falla no pasa nada: la comida se apunta igual, solo que el producto no queda guardado.
      saveMiProducto(db, escaneado).catch(() => {});
    }
    const t = texto.trim();
    onSave({
      name: t.charAt(0).toUpperCase() + t.slice(1),
      grams: Math.round(total.gramos),
      kcal: Math.round(total.kcal),
      protein: round1(total.proteina),
      carbs: round1(total.carbos),
      fat: round1(total.grasa),
      ingredientes: computed.map((i) => ({
        nombre: i.nombre,
        gramos: i.gramos,
        kcal: i.kcal,
        proteina: i.proteina,
        carbos: i.carbos,
        grasa: i.grasa,
        fuente: i.fuente,
        unidad_g: i.unidad_g,
      })),
    });
    reset();
  };

  const setManualField = (key: ManualKey) => (value: string) => setManual((f) => ({ ...f, [key]: value }));

  const saveManual = () => {
    const nombre = manual.name.trim();
    if (!nombre) {
      Alert.alert("Falta el nombre", "Ponle un nombre para guardar.");
      return;
    }
    // Con gramos se puede pasar a valores por 100 g y guardarlo en Mis productos,
    // para encontrarlo otro día escribiendo su nombre en el modo Automático.
    const gramos = manual.grams ? num(manual.grams) : 0;
    const kcal = num(manual.kcal);
    const protein = num(manual.protein);
    const carbs = num(manual.carbs);
    const fat = num(manual.fat);
    if (gramos > 0) {
      const f = 100 / gramos;
      saveMiProducto(db, {
        codigo: null,
        nombre,
        marca: "",
        kcal: kcal * f,
        proteina: protein * f,
        carbos: carbs * f,
        grasa: fat * f,
        racion_g: gramos,
      }).catch(() => {});
    }
    onSave({
      name: nombre,
      grams: gramos > 0 ? gramos : null,
      kcal,
      protein,
      carbs,
      fat,
      // Con gramos se guarda como un ingrediente de una unidad, para poder contarla por unidades al editarla.
      ingredientes:
        gramos > 0
          ? [{ nombre, gramos, kcal, proteina: protein, carbos: carbs, grasa: fat, fuente: "manual", unidad_g: gramos }]
          : undefined,
    });
    reset();
  };

  const addFavorito = async (fav: Favorito) => {
    try {
      onSave(await favoritoComoComida(db, fav));
      reset();
    } catch {
      Alert.alert("Ups", "No se pudo añadir la comida.");
    }
  };

  const confirmDeleteFavorito = (fav: Favorito) => {
    Alert.alert("Quitar de favoritas", `¿Quitar "${fav.name}" de favoritas?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          await deleteFavorito(db, fav.clave).catch(() => {});
          setFavoritos((f) => f?.filter((x) => x.id !== fav.id) ?? null);
        },
      },
    ]);
  };

  const renderFavoritas = () => {
    let contenido;
    if (!favoritos) contenido = <ActivityIndicator color={colors.primary} style={styles.favLoading} />;
    else if (!favoritos.length)
      contenido = (
        <Text style={styles.favEmpty}>
          Aún no tienes comidas favoritas. Pulsa la estrella ☆ de una comida del día para guardarla aquí y apuntarla
          otro día con un toque.
        </Text>
      );
    else
      contenido = (
        <>
          {favoritos.map((fav) => (
            <Pressable
              key={fav.id}
              onPress={() => addFavorito(fav)}
              onLongPress={() => confirmDeleteFavorito(fav)}
              style={({ pressed }) => [styles.itemRow, pressed && styles.pressed]}
            >
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {fav.name}
                </Text>
                <Text style={styles.itemMacros}>
                  {fav.grams != null ? `${Math.round(fav.grams)} g · ` : ""}P {Math.round(fav.protein)} · C{" "}
                  {Math.round(fav.carbs)} · G {Math.round(fav.fat)}
                </Text>
              </View>
              <Text style={styles.favKcal}>{Math.round(fav.kcal)} kcal</Text>
            </Pressable>
          ))}
          <Text style={styles.hint}>Pulsa una para añadirla. Mantén pulsada para quitarla de favoritas.</Text>
        </>
      );

    return (
      <>
        {contenido}
        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={close}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        </View>
      </>
    );
  };

  const renderRestantes = (style?: object) => {
    if (!uso) return null;
    const agotado = uso.restantes <= 0;
    const pocas = uso.restantes <= 3;
    // Sin análisis y con un Worker que admite recargas: se ofrece ver un anuncio.
    const recargable = agotado && !!uso.recarga;
    return (
      <>
        <Text style={[styles.restantes, pocas && styles.restantesPocas, agotado && styles.restantesAgotado, style]}>
          {agotado
            ? recargable
              ? "No te quedan análisis con IA hoy"
              : `Sin análisis con IA hasta mañana (0/${uso.limite})`
            : uso.recargado
              ? `Te quedan ${uso.restantes}/${uso.limite} análisis de la recarga`
              : `Te quedan ${uso.restantes}/${uso.limite} análisis con IA hoy`}
        </Text>
        {recargable && <RecargaAnuncio db={db} recarga={uso.recarga!} />}
      </>
    );
  };

  const renderIa = () => {
    if (!items.length) {
      return (
        <>
          <View>
            <TextInput
              style={[styles.input, styles.textarea, styles.textareaConMic]}
              value={texto}
              onChangeText={setTexto}
              placeholder={
                dictado.escuchando ? "Te escucho…" : "Ej: plato de garbanzos con pollo y una caña"
              }
              placeholderTextColor={colors.muted}
              multiline
              maxLength={MAX_TEXTO}
              editable={!loading && !dictado.escuchando}
            />
            <View style={styles.micPos}>
              <MicButton escuchando={dictado.escuchando} onPress={alternarDictado} disabled={loading} />
            </View>
          </View>
          {dictado.aviso && <Text style={styles.micAviso}>{dictado.aviso}</Text>}
          <Text style={styles.hint}>
            {dictado.escuchando
              ? "Di lo que has comido. Pulsa otra vez el micrófono para terminar."
              : "Los valores son estimaciones aproximadas."}
          </Text>
          {renderRestantes()}
          <Pressable
            style={[styles.scanButton, loading && styles.disabled]}
            onPress={() => setScanning(true)}
            disabled={loading}
          >
            <Text style={styles.scanText}>Escanear código de barras</Text>
          </Pressable>
          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancel]} onPress={close}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.save, (!texto.trim() || loading || dictado.escuchando) && styles.disabled]}
              onPress={analizar}
              disabled={!texto.trim() || loading || dictado.escuchando}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Analizar</Text>}
            </Pressable>
          </View>
        </>
      );
    }

    return (
      <>
        <Text style={styles.query}>{texto.trim()}</Text>
        {computed.map((item, index) => (
          <View key={`${item.nombre}-${index}`} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.nombre}</Text>
              <View style={styles.itemMeta}>
                <Text style={[styles.badge, item.fuente === "etiqueta" ? styles.badgeEtiqueta : styles.badgeIa]}>
                  {item.fuente === "etiqueta" ? "Etiqueta" : "Estimado"}
                </Text>
                <Text style={styles.itemMacros}>
                  P {Math.round(item.proteina)} · C {Math.round(item.carbos)} · G {Math.round(item.grasa)}
                </Text>
              </View>
              {item.unidad_g > 0 && (
                <UnitStepper unidades={item.gramos / item.unidad_g} onChange={setItemUnidades(index)} />
              )}
            </View>
            <TextInput
              style={styles.gramsInput}
              value={items[index].gramosText}
              onChangeText={setItemGrams(index)}
              keyboardType="decimal-pad"
            />
            <Text style={styles.gramsUnit}>g</Text>
            <Text style={styles.itemKcal}>{Math.round(item.kcal)}</Text>
            <Pressable onPress={() => removeItem(index)} hitSlop={10}>
              <Text style={styles.remove}>✕</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            {Math.round(total.kcal)} kcal · P {Math.round(total.proteina)} · C {Math.round(total.carbos)} · G{" "}
            {Math.round(total.grasa)}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.cancel]}
            onPress={() => {
              setItems([]);
              setEscaneado(null);
            }}
          >
            <Text style={styles.cancelText}>Volver</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.save, !computed.length && styles.disabled]}
            onPress={saveIa}
            disabled={!computed.length}
          >
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </View>
      </>
    );
  };

  const renderManual = () => (
    <>
      <Field
        label="Nombre"
        value={manual.name}
        onChangeText={setManualField("name")}
        placeholder="Garbanzos con pollo"
      />
      <View style={styles.row}>
        <Field label="Gramos" value={manual.grams} onChangeText={setManualField("grams")} numeric />
        <Field label="Kcal" value={manual.kcal} onChangeText={setManualField("kcal")} numeric />
      </View>
      <View style={styles.row}>
        <Field label="Proteína (g)" value={manual.protein} onChangeText={setManualField("protein")} numeric />
        <Field label="Carbos (g)" value={manual.carbs} onChangeText={setManualField("carbs")} numeric />
        <Field label="Grasa (g)" value={manual.fat} onChangeText={setManualField("fat")} numeric />
      </View>
      <Text style={styles.hint}>
        Si pones los gramos, se guarda en Mis productos y otro día te basta con escribir su nombre.
      </Text>
      <View style={styles.buttons}>
        <Pressable style={[styles.button, styles.cancel]} onPress={close}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.save]} onPress={saveManual}>
          <Text style={styles.saveText}>Guardar</Text>
        </Pressable>
      </View>
    </>
  );

  const renderProducto = (d: ProductDraft) => {
    const busy = readingLabel || savingProduct;
    return (
      <>
        {d.codigo ? <Text style={styles.hint}>Código {d.codigo}</Text> : null}
        <Pressable
          style={[styles.scanButton, styles.photoButton, busy && styles.disabled]}
          onPress={() => setCapturingLabel(true)}
          disabled={busy}
        >
          {readingLabel ? (
            <View style={styles.readingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.scanText}>Leyendo la etiqueta…</Text>
            </View>
          ) : (
            <Text style={styles.scanText}>Rellenar con una foto de la etiqueta</Text>
          )}
        </Pressable>
        {renderRestantes(styles.restantesEtiqueta)}
        <Field label="Nombre" value={d.nombre} onChangeText={setProductField("nombre")} placeholder="Yogur griego" />
        <View style={styles.row}>
          <Field label="Marca" value={d.marca} onChangeText={setProductField("marca")} placeholder="Hacendado" />
          <Field
            label="Ración (g)"
            value={d.racion}
            onChangeText={setProductField("racion")}
            placeholder="125"
            numeric
          />
        </View>
        <Text style={styles.sectionLabel}>Por 100 g</Text>
        <View style={styles.row}>
          <Field label="Kcal" value={d.kcal} onChangeText={setProductField("kcal")} numeric />
          <Field label="Proteína (g)" value={d.proteina} onChangeText={setProductField("proteina")} numeric />
        </View>
        <View style={styles.row}>
          <Field label="Carbos (g)" value={d.carbos} onChangeText={setProductField("carbos")} numeric />
          <Field label="Grasa (g)" value={d.grasa} onChangeText={setProductField("grasa")} numeric />
        </View>
        <Text style={styles.hint}>Revisa los valores antes de guardar. Se guardará en Mis productos.</Text>
        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.cancel]} onPress={() => setProduct(null)} disabled={savingProduct}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.save, busy && styles.disabled]}
            onPress={saveProduct}
            disabled={busy}
          >
            {savingProduct ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Guardar</Text>}
          </Pressable>
        </View>
      </>
    );
  };

  const onRequestClose = () => {
    if (scanning) setScanning(false);
    else if (capturingLabel) setCapturingLabel(false);
    else if (product) {
      if (!savingProduct) setProduct(null);
    } else close();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose}>
      {scanning ? (
        <BarcodeScanner onScanned={handleScanned} onClose={() => setScanning(false)} />
      ) : capturingLabel ? (
        <LabelCamera onCaptured={handleLabelPhoto} onClose={() => setCapturingLabel(false)} />
      ) : (
        <FloatingCard>
          {product ? (
            <>
              <Text style={styles.title}>Añadir producto</Text>
              {renderProducto(product)}
            </>
          ) : (
            <>
              <Text style={styles.title}>Añadir comida</Text>

              <View style={styles.tabs}>
                <Pressable
                  style={[styles.tab, mode === "auto" && styles.tabActive]}
                  onPress={() => setMode("auto")}
                  disabled={loading}
                >
                  <Text style={[styles.tabText, mode === "auto" && styles.tabTextActive]}>Automático</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, mode === "manual" && styles.tabActive]}
                  onPress={() => setMode("manual")}
                  disabled={loading}
                >
                  <Text style={[styles.tabText, mode === "manual" && styles.tabTextActive]}>Manual</Text>
                </Pressable>
                <Pressable
                  style={[styles.tab, mode === "favoritas" && styles.tabActive]}
                  onPress={() => setMode("favoritas")}
                  disabled={loading}
                >
                  <Text style={[styles.tabText, mode === "favoritas" && styles.tabTextActive]}>Favoritas</Text>
                </Pressable>
              </View>

              {mode === "auto" ? renderIa() : mode === "manual" ? renderManual() : renderFavoritas()}
            </>
          )}
        </FloatingCard>
      )}
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    itemMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    badge: {
      fontSize: 10,
      fontWeight: "700",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    badgeEtiqueta: { backgroundColor: colors.primarySoft, color: colors.primary },
    badgeIa: { backgroundColor: colors.bg, color: colors.muted },
    title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 12 },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.bg,
      borderRadius: 10,
      padding: 4,
      marginBottom: 16,
    },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
    tabActive: { backgroundColor: colors.card },
    tabText: { color: colors.muted, fontWeight: "600" },
    tabTextActive: { color: colors.text },
    row: { flexDirection: "row", gap: 10 },
    field: { flex: 1, marginBottom: 12 },
    label: { fontSize: 13, color: colors.muted, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
    },
    textarea: { minHeight: 90, textAlignVertical: "top" },
    textareaConMic: { paddingRight: 56 },
    micPos: { position: "absolute", right: 8, bottom: 8 },
    micAviso: { fontSize: 13, color: colors.danger, marginTop: 6 },
    hint: { fontSize: 12, color: colors.muted, marginTop: 6 },
    restantes: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: "600" },
    restantesPocas: { color: "#D97706" },
    restantesAgotado: { color: colors.danger },
    restantesEtiqueta: { marginTop: -10, marginBottom: 12, textAlign: "center" },
    query: { fontSize: 15, fontStyle: "italic", color: colors.muted, marginBottom: 12 },
    itemRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 6,
    },
    itemInfo: { flex: 1 },
    itemName: { fontSize: 15, color: colors.text, fontWeight: "500" },
    itemMacros: { fontSize: 12, color: colors.muted, marginTop: 2 },
    gramsInput: {
      width: 60,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 6,
      textAlign: "right",
      fontSize: 15,
      color: colors.text,
    },
    gramsUnit: { fontSize: 13, color: colors.muted },
    itemKcal: { width: 44, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.text },
    remove: { fontSize: 16, color: colors.danger, paddingLeft: 6 },
    totalRow: { paddingVertical: 12 },
    totalLabel: { fontSize: 13, color: colors.muted },
    totalValue: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 2 },
    buttons: { flexDirection: "row", gap: 10, marginTop: 12 },
    button: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    cancel: { backgroundColor: colors.bg },
    save: { backgroundColor: colors.primary },
    disabled: { opacity: 0.5 },
    cancelText: { color: colors.text, fontWeight: "600", fontSize: 16 },
    saveText: { color: "#fff", fontWeight: "600", fontSize: 16 },
    scanButton: {
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
    },
    scanText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
    photoButton: { marginTop: 4, marginBottom: 16 },
    readingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    pressed: { opacity: 0.6 },
    favKcal: { fontSize: 15, fontWeight: "600", color: colors.text, marginLeft: 8 },
    favEmpty: { fontSize: 14, color: colors.muted, lineHeight: 20, textAlign: "center", paddingVertical: 12 },
    favLoading: { paddingVertical: 20 },
    sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 8 },
  });
