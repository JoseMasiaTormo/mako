// src/components/Logo.tsx
import { View } from "react-native";
import { lightColors, useTheme } from "../theme";

/**
 * Logotipo "Mako" dibujado con el mismo trazo que el icono de la app:
 * líneas gruesas con puntas redondeadas. La "M" lleva los colores del icono
 * (azul, naranja y rosa) y el resto de letras el color de texto del tema.
 */

// Proporciones sacadas del icono (assets/icon.png).
const STROKE = 0.232; // grosor del trazo respecto a la altura
const M_WIDTH = 1.062; // ancho de la M respecto a la altura
const M_VALLEY = 0.624; // altura del vértice de la V de la M
const X_HEIGHT = 0.68; // altura de las minúsculas respecto a la M

// Los colores del icono son fijos, no cambian con el tema.
const ICON = { left: lightColors.protein, mid: lightColors.carbs, right: lightColors.fat };

type SegProps = { x1: number; y1: number; x2: number; y2: number; w: number; color: string };

/** Trazo recto de (x1,y1) a (x2,y2) con puntas redondeadas. */
function Seg({ x1, y1, x2, y2, w, color }: SegProps) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <View
      style={{
        position: "absolute",
        left: (x1 + x2) / 2 - (len + w) / 2,
        top: (y1 + y2) / 2 - w / 2,
        width: len + w,
        height: w,
        borderRadius: w / 2,
        backgroundColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

/** Anillo (la "o" y el cuerpo de la "a"). */
function Ring({ left, top, size, w, color }: { left: number; top: number; size: number; w: number; color: string }) {
  return (
    <View
      style={{
        position: "absolute",
        left,
        top,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: w,
        borderColor: color,
      }}
    />
  );
}

export default function Logo({ height = 24 }: { height?: number }) {
  const { colors } = useTheme();
  const H = height;
  const w = H * STROKE;
  const r = w / 2;
  const xh = H * X_HEIGHT;
  const xTop = H - xh; // borde superior de las minúsculas
  const gap = w * 0.9;

  const mW = H * M_WIDTH;
  const kW = xh * 0.78;

  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", gap }}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Mako"
    >
      {/* M */}
      <View style={{ width: mW, height: H }}>
        <Seg x1={r} y1={r} x2={mW / 2} y2={H * M_VALLEY} w={w} color={ICON.mid} />
        <Seg x1={mW / 2} y1={H * M_VALLEY} x2={mW - r} y2={r} w={w} color={ICON.mid} />
        <Seg x1={r} y1={r} x2={r} y2={H - r} w={w} color={ICON.left} />
        <Seg x1={mW - r} y1={r} x2={mW - r} y2={H - r} w={w} color={ICON.right} />
      </View>

      {/* a */}
      <View style={{ width: xh, height: H }}>
        <Ring left={0} top={xTop} size={xh} w={w} color={colors.text} />
        <Seg x1={xh - r} y1={xTop + r} x2={xh - r} y2={H - r} w={w} color={colors.text} />
      </View>

      {/* k */}
      <View style={{ width: kW, height: H }}>
        <Seg x1={r} y1={r} x2={r} y2={H - r} w={w} color={colors.text} />
        <Seg x1={r} y1={xTop + xh * 0.55} x2={kW - r} y2={xTop + r} w={w} color={colors.text} />
        <Seg x1={r + w * 0.6} y1={xTop + xh * 0.45} x2={kW - r} y2={H - r} w={w} color={colors.text} />
      </View>

      {/* o */}
      <View style={{ width: xh, height: H }}>
        <Ring left={0} top={xTop} size={xh} w={w} color={colors.text} />
      </View>
    </View>
  );
}
