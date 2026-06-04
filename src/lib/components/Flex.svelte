<script lang="ts">
	import type { Snippet } from 'svelte';

	type AxisPosition = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

	type Props = {
		children?: Snippet;

		col?: boolean;
		row?: boolean;
		reverse?: boolean;

		gap?: number | string;

		xCenter?: boolean;
		yCenter?: boolean;
		center?: boolean;

		x?: AxisPosition;
		y?: AxisPosition;

		class?: string;
	};

	let {
		children,
		col,
		row,
		reverse,
		gap,
		xCenter,
		yCenter,
		center,
		x,
		y,
		class: classn
	}: Props = $props();

	const flexDirection = $derived(
		(col ? 'column' : row ? 'row' : 'row') + (reverse ? '-reverse' : '')
	);

	const gapValue = $derived(
		gap == null
			? undefined
			: typeof gap === 'number'
				? `${gap * 4 /* tailwind :3 */}px`
				: gap === 'px'
					? '1px'
					: gap
	);

	const resolvedX = $derived(center || xCenter ? 'center' : x);
	const resolvedY = $derived(center || yCenter ? 'center' : y);

	function mapAxis(value: AxisPosition | undefined) {
		switch (value) {
			case 'start':
				return 'flex-start';
			case 'end':
				return 'flex-end';
			case 'center':
				return 'center';
			case 'between':
				return 'space-between';
			case 'around':
				return 'space-around';
			case 'evenly':
				return 'space-evenly';
			default:
				return undefined;
		}
	}

	const justifyContent = $derived(col ? mapAxis(resolvedY) : mapAxis(resolvedX));

	const alignItems = $derived(col ? mapAxis(resolvedX) : mapAxis(resolvedY));
</script>

<div
	class={classn}
	style={`
		display: flex;
		flex-direction: ${flexDirection};
		${gapValue ? `gap: ${gapValue};` : ''}
		${justifyContent ? `justify-content: ${justifyContent};` : ''}
		${alignItems ? `align-items: ${alignItems};` : ''}
	`}
>
	{@render children?.()}
</div>
