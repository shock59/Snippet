function hslToRgb(h: number, s: number, l: number): [number, number, number];
function hslToRgb(hsl: { h: number; s: number; l: number }): [number, number, number];
function hslToRgb(hsl: [number, number, number]): [number, number, number];
function hslToRgb(
  p1: number | { h: number; s: number; l: number } | [number, number, number],
  p2?: number,
  p3?: number
): [number, number, number] {
  const [h, s, l] = typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.h, p1.s, p1.l];
  const s_norm = s / 100;
  const l_norm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s_norm * Math.min(l_norm, 1 - l_norm);
  const f = (n: number) => l_norm - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string;
function rgbToHex(rgb: { r: number; g: number; b: number }): string;
function rgbToHex(rgb: [number, number, number]): string;
function rgbToHex(
  p1: number | { r: number; g: number; b: number } | [number, number, number],
  p2?: number,
  p3?: number
): string {
  const [r, g, b] = typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.r, p1.g, p1.b];
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number];
function rgbToHsl(rgb: { r: number; g: number; b: number }): [number, number, number];
function rgbToHsl(rgb: [number, number, number]): [number, number, number];
function rgbToHsl(
  p1: number | { r: number; g: number; b: number } | [number, number, number],
  p2?: number,
  p3?: number
): [number, number, number] {
  let [r, g, b] = typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.r, p1.g, p1.b];

  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h: number = 0,
    s: number = 0,
    l: number = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string;
function hslToHex(hsl: { h: number; s: number; l: number }): string;
function hslToHex(hsl: [number, number, number]): string;
function hslToHex(
  p1: number | { h: number; s: number; l: number } | [number, number, number],
  p2?: number,
  p3?: number
): string {
  const [r, g, b] = typeof p1 === 'number' ? hslToRgb(p1, p2!, p3!) : Array.isArray(p1) ? hslToRgb(p1) : hslToRgb(p1);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function hexToHsl(hex: string): [number, number, number] {
  return rgbToHsl(hexToRgb(hex));
}

export const colorConversion = {
  rgbToHex,
  rgbToHsl,
  hslToHex,
  hslToRgb,
  hexToHsl,
  hexToRgb
};
