<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import Prompter from '$lib/PopupManager.svelte';
	import { debuggerOpen, mouseUpCallbacks, mouseX, mouseY } from '$lib/globals';
	import DebugWindow from '$lib/debug/DebugWindow.svelte';
	import { browser } from '$app/environment';
	import { createLogger } from '$lib/debug';
	import Window from '$lib/components/Window.svelte';
	import { registerKeybind } from '$lib/kbd';

	let { children } = $props();

	const layoutLogger = createLogger('layout');

	if (browser) {
		window.onerror = function (msg, url, lineNo, columnNo, error) {
			layoutLogger.error('Error:', msg, 'at', url, ':', lineNo, ';', columnNo);
		};

		window.addEventListener('unhandledrejection', function (event) {
			layoutLogger.error('Unhandled Promise rejection:', event.reason);
		});
	}
	registerKeybind(
		{ bind: 'ctrl+shift+k d', name: 'Show debugger', description: 'Show the debugger window' },
		() => {
			debuggerOpen.update((a) => {
				if (a) {
					layoutLogger('debugger hidden');
				} else {
					layoutLogger('debugger shown');
				}
				return !a;
			});
		}
	);

	registerKeybind({ bind: 'ctrl+shift+l', name: 'Toggle dark mode' }, () => {
		toggleMode();
	});
</script>

<Prompter />
<ModeWatcher />
{@render children()}

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window
	onmousemove={(e) => {
		mouseX.set(e.clientX);
		mouseY.set(e.clientY);
	}}
	onmouseup={() => {
		while (mouseUpCallbacks.length) {
			mouseUpCallbacks.pop()?.();
		}
	}}
/>

<DebugWindow />

<!-- <Window name="ttest" open={true}>hawwo</Window>
<Window name="hi" open={true}>omg</Window>
<Window name="mendy" open={true}>among us</Window>
<Window name="TOO MANY" open={true}>HELP</Window>
<Window name="boo" open={true}>a</Window> -->
