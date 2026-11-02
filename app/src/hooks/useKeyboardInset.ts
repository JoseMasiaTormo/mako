// src/hooks/useKeyboardInset.ts
import { useEffect, useState } from "react";
import { Dimensions, Keyboard, LayoutChangeEvent, Platform } from "react-native";

/**
 * Cuánto espacio inferior hay que reservar para el teclado dentro de una vista
 * a pantalla completa (por ejemplo, el fondo de un Modal).
 *
 * Según el dispositivo, Android encoge la ventana al abrir el teclado o no lo
 * hace. Para no contar el teclado dos veces, comparamos la altura real de la
 * vista (onLayout) con el hueco que deja libre el teclado en la pantalla:
 *   - si la ventana ya se encogió, el resultado es ~0
 *   - si no, el resultado es ~la altura del teclado
 */
export function useKeyboardInset() {
  const [viewHeight, setViewHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setViewHeight(e.nativeEvent.layout.height);

  const free = Dimensions.get("screen").height - keyboardHeight;
  const inset = keyboardHeight > 0 && viewHeight > 0 ? Math.max(0, viewHeight - free) : 0;

  return { inset, onLayout };
}
