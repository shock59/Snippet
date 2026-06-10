<script lang="ts">
	import Flex from '$lib/components/Flex.svelte';
	import ObjViewer from '$lib/components/ObjViewer.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import { mouseX, mouseY } from '$lib/globals';

	let hex = $state(undefined);
	let hsl = $state(undefined);
	let hsv = $state(undefined);
	let rgb = $state({
		r: 48,
		g: 38,
		b: 249
	});
	let opacity = $state(0);
</script>

<div class="fixed top-0 left-0 w-screen h-screen">
	<div style="position: absolute;" class="h-5 w-5 bg-amber-400">
		<ColorPicker bind:hex bind:hsl bind:rgb bind:hsv bind:opacity />
	</div>
	
	<!-- {hex}{hsl}{rgb} -->
	
	<ObjViewer
		object={{
			hex,
			hsl,
			rgb,
			hsv,
			opacity
		}}
	/>
</div>
