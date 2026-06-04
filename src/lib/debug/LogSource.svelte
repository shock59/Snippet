<script lang="ts">
	import type { Shape, Source } from './index';

	type Props = {
		source: Source;
	};

	let { source }: Props = $props();

	function hexToRgb(hex: string) {
		const h = hex.replace('#', '');

		const full =
			h.length === 3
				? h
						.split('')
						.map((c) => c + c)
						.join('')
				: h;

		const num = parseInt(full, 16);

		return {
			r: (num >> 16) & 255,
			g: (num >> 8) & 255,
			b: num & 255
		};
	}

	function luminance({ r, g, b }: { r: number; g: number; b: number }) {
		const srgb = [r, g, b].map((v) => {
			v /= 255;
			return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
		});

		return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
	}

	function getTextColor(bgHex: string) {
		const { r, g, b } = hexToRgb(bgHex);
		const L = luminance({ r, g, b });

		const cw = 1.05 / (L + 0.05);
		const cb = (L + 0.05) / 0.05;

		return cw > cb ? '#fff' : '#000';
	}

	const textColor = $derived(getTextColor(source.color));
</script>

<div class="source">
	<div class="cap left {source.shapeLeft}" style="background: {source.color}"></div>

	<div
		class="body px-1"
		style="
			background: {source.color};
			color: {textColor};
		"
	>
		{source.name}
	</div>

	<div class="cap right {source.shapeRight}" style="background: {source.color}"></div>
</div>

<style>
	.source {
		display: flex;
		flex-direction: row;
		height: 1.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.body {
		display: flex;
		align-items: center;
		height: 100%;
	}
	.cap {
		width: 10px;
		height: 100%;
		flex-shrink: 0;
	}
	.cap.left.rectangle {
		clip-path: none;
	}
	.cap.left.circle {
		border-top-left-radius: 999px;
		border-bottom-left-radius: 999px;
	}
	.cap.left.rounded {
		border-top-left-radius: 5px;
		border-bottom-left-radius: 5px;

		border-top-right-radius: 0px;
		border-bottom-right-radius: 0px;
		margin-right: -6px;

	}
	.cap.left.slanted {
		clip-path: polygon(100% 0, 0 100%, 100% 100%);
	}
	.cap.left.inverseslanted {
		clip-path: polygon(100% 100%, 0 0, 100% 0);
	}
	.cap.left.angled {
		clip-path: polygon(100% 0, 0 50%, 100% 100%);
	}
	.cap.left.inverseangled {
		clip-path: polygon(0 0, 100% 50%, 0 100%, 100% 100%, 100% 0);
	}
	.cap.left.saw {
		clip-path: polygon(100% 0, 0 25%, 100% 50%, 0 75%, 100% 100%);
	}
	.cap.left.inversesaw {
		clip-path: polygon(100% 0, 0 0, 100% 25%, 0 50%, 100% 75%, 0 100%, 100% 100%);
	}
	.cap.right.rectangle {
		clip-path: none;
	}
	.cap.right.circle {
		border-top-right-radius: 999px;
		border-bottom-right-radius: 999px;
	}
	.cap.right.rounded {
		border-top-right-radius: 5px;
		border-bottom-right-radius: 5px;
		border-top-left-radius: 0px;
		border-bottom-left-radius: 0px;
		margin-left: -6px;
	}
	.cap.right.slanted {
		clip-path: polygon(0 0, 100% 100%, 0 100%);
	}
	.cap.right.inverseslanted {
		clip-path: polygon(0 100%, 100% 0, 0 0);
	}
	.cap.right.angled {
		clip-path: polygon(0 0, 100% 50%, 0 100%);
	}
	.cap.right.inverseangled {
		clip-path: polygon(100% 0, 0 50%, 100% 100%, 0 100%, 0 0);
	}
	.cap.right.saw {
		clip-path: polygon(0 0, 100% 25%, 0 50%, 100% 75%, 0 100%);
	}
	.cap.right.inversesaw {
		clip-path: polygon(0 0, 100% 0, 0 25%, 100% 50%, 0 75%, 100% 100%, 0 100%);
	}
</style>
