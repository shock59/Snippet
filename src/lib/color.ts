function hslToRgb(
	h: number,
	s: number,
	l: number
): { obj: { r: number; g: number; b: number }; arr: [number, number, number] };
function hslToRgb(hsl: { h: number; s: number; l: number }): {
	obj: { r: number; g: number; b: number };
	arr: [number, number, number];
};
function hslToRgb(hsl: [number, number, number]): {
	obj: { r: number; g: number; b: number };
	arr: [number, number, number];
};
function hslToRgb(
	p1: number | { h: number; s: number; l: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { r: number; g: number; b: number }; arr: [number, number, number] } {
	const [h, s, l] =
		typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.h, p1.s, p1.l];
	const s_norm = s / 100;
	const l_norm = l / 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = s_norm * Math.min(l_norm, 1 - l_norm);
	const f = (n: number) => l_norm - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	const r = Math.round(f(0) * 255);
	const g = Math.round(f(8) * 255);
	const b = Math.round(f(4) * 255);
	return { obj: { r, g, b }, arr: [r, g, b] };
}

function rgbToHex(r: number, g: number, b: number): string;
function rgbToHex(rgb: { r: number; g: number; b: number }): string;
function rgbToHex(rgb: [number, number, number]): string;
function rgbToHex(
	p1: number | { r: number; g: number; b: number } | [number, number, number],
	p2?: number,
	p3?: number
): string {
	const [r, g, b] =
		typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.r, p1.g, p1.b];
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function rgbToHsl(
	r: number,
	g: number,
	b: number
): { obj: { h: number; s: number; l: number }; arr: [number, number, number] };
function rgbToHsl(rgb: { r: number; g: number; b: number }): {
	obj: { h: number; s: number; l: number };
	arr: [number, number, number];
};
function rgbToHsl(rgb: [number, number, number]): {
	obj: { h: number; s: number; l: number };
	arr: [number, number, number];
};
function rgbToHsl(
	p1: number | { r: number; g: number; b: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { h: number; s: number; l: number }; arr: [number, number, number] } {
	let [r, g, b] =
		typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.r, p1.g, p1.b];

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
	const hh = Math.round(h * 360),
		ss = Math.round(s * 100),
		ll = Math.round(l * 100);
	return { obj: { h: hh, s: ss, l: ll }, arr: [hh, ss, ll] };
}

function hslToHex(h: number, s: number, l: number): string;
function hslToHex(hsl: { h: number; s: number; l: number }): string;
function hslToHex(hsl: [number, number, number]): string;
function hslToHex(
	p1: number | { h: number; s: number; l: number } | [number, number, number],
	p2?: number,
	p3?: number
): string {
	const rgb =
		typeof p1 === 'number'
			? hslToRgb(p1, p2!, p3!)
			: Array.isArray(p1)
				? hslToRgb(p1)
				: hslToRgb(p1);
	const [r, g, b] = rgb.arr;
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRgb(hex: string): {
	obj: { r: number; g: number; b: number };
	arr: [number, number, number];
} {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const r = result ? parseInt(result[1], 16) : 0;
	const g = result ? parseInt(result[2], 16) : 0;
	const b = result ? parseInt(result[3], 16) : 0;
	return { obj: { r, g, b }, arr: [r, g, b] };
}

function hexToHsl(hex: string): {
	obj: { h: number; s: number; l: number };
	arr: [number, number, number];
} {
	return rgbToHsl(hexToRgb(hex).arr);
}

function hsvToRgb(
	h: number,
	s: number,
	v: number
): { obj: { r: number; g: number; b: number }; arr: [number, number, number] };
function hsvToRgb(hsv: { h: number; s: number; v: number }): {
	obj: { r: number; g: number; b: number };
	arr: [number, number, number];
};
function hsvToRgb(hsv: [number, number, number]): {
	obj: { r: number; g: number; b: number };
	arr: [number, number, number];
};
function hsvToRgb(
	p1: number | { h: number; s: number; v: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { r: number; g: number; b: number }; arr: [number, number, number] } {
	const [h, s, v] =
		typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.h, p1.s, p1.v];
	const s_norm = s / 100;
	const v_norm = v / 100;
	const c = v_norm * s_norm;
	const m = v_norm - c;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	let r = 0,
		g = 0,
		b = 0;

	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];

	const R = Math.round((r + m) * 255);
	const G = Math.round((g + m) * 255);
	const B = Math.round((b + m) * 255);
	return { obj: { r: R, g: G, b: B }, arr: [R, G, B] };
}

function rgbToHsv(
	r: number,
	g: number,
	b: number
): { obj: { h: number; s: number; v: number }; arr: [number, number, number] };
function rgbToHsv(rgb: { r: number; g: number; b: number }): {
	obj: { h: number; s: number; v: number };
	arr: [number, number, number];
};
function rgbToHsv(rgb: [number, number, number]): {
	obj: { h: number; s: number; v: number };
	arr: [number, number, number];
};
function rgbToHsv(
	p1: number | { r: number; g: number; b: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { h: number; s: number; v: number }; arr: [number, number, number] } {
	let [r, g, b] =
		typeof p1 === 'number' ? [p1, p2!, p3!] : Array.isArray(p1) ? p1 : [p1.r, p1.g, p1.b];
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	const d = max - min;
	let h = 0;

	if (d !== 0) {
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
		else if (max === g) h = ((b - r) / d + 2) * 60;
		else h = ((r - g) / d + 4) * 60;
	}

	const s = max === 0 ? 0 : d / max;
	const hh = Math.round(h);
	const ss = Math.round(s * 100);
	const vv = Math.round(max * 100);
	return { obj: { h: hh, s: ss, v: vv }, arr: [hh, ss, vv] };
}

function hslToHsv(
	h: number,
	s: number,
	l: number
): { obj: { h: number; s: number; v: number }; arr: [number, number, number] };
function hslToHsv(hsl: { h: number; s: number; l: number }): {
	obj: { h: number; s: number; v: number };
	arr: [number, number, number];
};
function hslToHsv(hsl: [number, number, number]): {
	obj: { h: number; s: number; v: number };
	arr: [number, number, number];
};
function hslToHsv(
	p1: number | { h: number; s: number; l: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { h: number; s: number; v: number }; arr: [number, number, number] } {
	const rgb =
		typeof p1 === 'number'
			? hslToRgb(p1, p2!, p3!)
			: Array.isArray(p1)
				? hslToRgb(p1)
				: hslToRgb(p1);
	return rgbToHsv(rgb.arr[0], rgb.arr[1], rgb.arr[2]);
}

function hsvToHsl(
	h: number,
	s: number,
	v: number
): { obj: { h: number; s: number; l: number }; arr: [number, number, number] };
function hsvToHsl(hsv: { h: number; s: number; v: number }): {
	obj: { h: number; s: number; l: number };
	arr: [number, number, number];
};
function hsvToHsl(hsv: [number, number, number]): {
	obj: { h: number; s: number; l: number };
	arr: [number, number, number];
};
function hsvToHsl(
	p1: number | { h: number; s: number; v: number } | [number, number, number],
	p2?: number,
	p3?: number
): { obj: { h: number; s: number; l: number }; arr: [number, number, number] } {
	const rgb =
		typeof p1 === 'number'
			? hsvToRgb(p1, p2!, p3!)
			: Array.isArray(p1)
				? hsvToRgb(p1)
				: hsvToRgb(p1);
	return rgbToHsl(rgb.arr[0], rgb.arr[1], rgb.arr[2]);
}

function hsvToHex(h: number, s: number, v: number): string;
function hsvToHex(hsv: { h: number; s: number; v: number }): string;
function hsvToHex(hsv: [number, number, number]): string;
function hsvToHex(
	p1: number | { h: number; s: number; v: number } | [number, number, number],
	p2?: number,
	p3?: number
): string {
	const rgb =
		typeof p1 === 'number'
			? hsvToRgb(p1, p2!, p3!)
			: Array.isArray(p1)
				? hsvToRgb(p1)
				: hsvToRgb(p1);
	const [r, g, b] = rgb.arr;
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToHsv(hex: string) {
	return rgbToHsv(hexToRgb(hex).arr);
}

export const color = {
	rgbToHex,
	rgbToHsl,
	rgbToHsv,
	hslToHex,
	hslToRgb,
	hslToHsv,
	hexToHsl,
	hexToRgb,
	hexToHsv,
	hsvToHex,
	hsvToHsl,
	hsvToRgb
};
