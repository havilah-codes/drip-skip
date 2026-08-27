/**
 * Extract dominant colors from an image URL.
 * Server: calls /api/extract-colors (Sharp)
 * Client: uses ColorThief as fallback
 */

import { getPaletteSync } from "colorthief";

/**
 * Extract dominant colors via the server API route.
 * Used after avatar upload.
 */
export async function extractColorsServer(imageUrl: string): Promise<string[]> {
  try {
    const res = await fetch("/api/extract-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, count: 3 }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.colors || [];
  } catch {
    return [];
  }
}

/**
 * Extract dominant colors from a loaded <img> element using ColorThief.
 * Client-side fallback for existing avatars without stored colors.
 */
export function extractColorsClient(img: HTMLImageElement): string[] {
  try {
    const palette = getPaletteSync(img, { colorCount: 3 });
    if (!palette) return [];
    return palette.map((swatch: any) => {
      const [r, g, b] = swatch.rgb || [0, 0, 0];
      const hex = [r, g, b]
        .map((v: number) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0"))
        .join("");
      return `#${hex}`;
    });
  } catch {
    return [];
  }
}

/**
 * Generate a CSS gradient string from dominant colors.
 * Returns a Tailwind-compatible gradient direction + color stops,
 * or a raw CSS linear-gradient string.
 */
export function colorsToGradient(colors: string[]): string {
  if (!colors || colors.length === 0) return "";
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]}88)`;
  if (colors.length === 2) return `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`;
}

/**
 * Determine if a hex color is light or dark.
 * Returns true if the color is light (needs dark text).
 */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

/**
 * Convert hex colors to CSS custom properties for a gradient card.
 * Returns an object with --gradient-bg and --text-color.
 */
export function gradientStyles(colors: string[]): React.CSSProperties {
  const gradient = colorsToGradient(colors);
  const textColor = colors.length > 0 && isLightColor(colors[0]) ? "#000000" : "#ffffff";
  return {
    background: gradient || undefined,
    color: textColor,
  };
}
