import { useWindowDimensions } from "react-native";

/** Widest the app's content column gets (tablets, wide web windows). */
export const MAX_CONTENT_WIDTH = 640;

/**
 * Width available to a screen's content. app/_layout.tsx centres every
 * screen in a column at most MAX_CONTENT_WIDTH wide, so layouts that size
 * themselves from the window (carousels, grids, pagers) must use this, not
 * the raw window width, or they overflow the column on tablets.
 */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, MAX_CONTENT_WIDTH);
}
