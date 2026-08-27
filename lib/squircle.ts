/**
 * Squircle (superellipse) clip-path generator.
 * Produces a CSS clip-path polygon that approximates a superellipse
 * with exponent n ≈ 5 (smoother than rounded-rectangle, less than circle).
 *
 * Usage: style={{ clipPath: squircleClipPath(20, 120, 80) }}
 *   or:  className="squircle" (CSS class with pre-computed path)
 */

const N = 5; // superellipse exponent (higher = more square-ish)
const POINTS = 64; // number of sample points for the polygon

/**
 * Generate a CSS polygon clip-path string for a squircle
 * inscribed in a rectangle of the given dimensions.
 */
export function squircleClipPath(
  width: number = 120,
  height: number = 80,
  cornerRadius: number = 20
): string {
  const a = width / 2;
  const b = height / 2;
  const points: string[] = [];

  // We sample the superellipse boundary and offset by cornerRadius
  // to create the squircle shape within the bounding box.
  for (let i = 0; i <= POINTS; i++) {
    const t = (i / POINTS) * 2 * Math.PI;
    // Parametric superellipse: x = a·sign(cos t)·|cos t|^(2/n), y = b·sign(sin t)·|sin t|^(2/n)
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const exp = 2 / N;

    const x = a * Math.sign(cosT) * Math.pow(Math.abs(cosT), exp);
    const y = b * Math.sign(sinT) * Math.pow(Math.abs(sinT), exp);

    // Normalize to 0-100% for CSS polygon
    const px = ((x + a) / width) * 100;
    const py = ((y + b) / height) * 100;

    points.push(`${px.toFixed(2)}% ${py.toFixed(2)}%`);
  }

  return `polygon(${points.join(", ")})`;
}

/**
 * Generate a squircle clip-path that fits a square element.
 */
export function squircleSquareClipPath(): string {
  return squircleClipPath(100, 100);
}

/**
 * Pre-computed squircle clip-path for common sizes.
 * Use inline style: style={{ clipPath: SQUIRCLES.w16 }}
 */
export const SQUIRCLES = {
  /** Avatar 64x64 */
  w16: squircleClipPath(64, 64),
  /** Small button 36x36 */
  w9: squircleClipPath(36, 36),
  /** Medium card 120x80 */
  w32: squircleClipPath(120, 80),
  /** Full width card */
  full: squircleClipPath(400, 120),
  /** Square */
  square: squircleSquareClipPath(),
} as const;

/**
 * React inline style for squircle clip-path.
 * Pass width/height for dynamic sizing.
 */
export function squircleStyle(width?: number, height?: number): React.CSSProperties {
  return {
    clipPath: squircleClipPath(width, height),
  };
}
