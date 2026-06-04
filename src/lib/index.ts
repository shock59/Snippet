// place files you want to import through the `$lib` alias in this folder.
export function scalenum(
	value: number,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	clamp = false,
	easing: 'linear' | 'ease-out' | 'ease-in' | 'ease-in-out' = 'linear'
) {
	if (x1 === x2) return y1;
	let t = (value - x1) / (x2 - x1);

	if (clamp) t = Math.min(Math.max(t, 0), 1);

	if (easing === 'ease-out') t = t * (2 - t);
	else if (easing === 'ease-in') t = t * t;
	else if (easing === 'ease-in-out') t = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

	const result = y1 + t * (y2 - y1);
	if (!clamp) return result;
	return Math.min(Math.max(result, Math.min(y1, y2)), Math.max(y1, y2));
}
