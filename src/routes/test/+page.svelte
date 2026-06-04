<script lang="ts">
	import ObjViewer from '$lib/components/ObjViewer.svelte';
	import { createLogger } from '$lib/debug';
	import { onMouseUp } from '$lib/globals';
	import promptFor from '$lib/popups';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	function mendy() {}
	async function elect() {}
	function* gay() {}
	async function argsofhte(a: any, b: any, c: any, d: any) {}

	class a {
		static method() {}

		static async method2() {}

		method3() {}

		async method4() {}
	}

	const instance = new a();

	const logger = createLogger('mendy');
	logger({
		mendy: 'hello',
		hey: {},
		now: [],
		smal: [1, 2, 3, 4],
		number: 0,
		true: true,
		false: false,
		array: [true, false, undefined, null, 0, 1, 2, 1n],
		a: Array.from({ length: 999 }, (_, i) => i),
		secret: Symbol('joe'),
		fnw: function mendy() {
			console.log();
		},
		arrow: () => {},
		asyncArrow: async () => {},
		asynckeyword: async function () {},
		asynckeywordnamed: async function hello() {},
		second: mendy,
		onMouseUp,
		async: elect,
		argsofhte,
		gay,
		method1: a.method,
		method2: a.method2,
		method3: instance.method3,
		method4: instance.method4
	});
	logger(
		'lmao js could never',
		['mendy', true, false, 3n, 'js dont stringify bigints :joy:', null],
		{ mendy: true }
	);
	logger('levels');
	logger.info('info');
	logger.debug('debug');
	logger.warn('warn');
	logger.error('error');
	logger.fatal('nahhh bro the fuck you do :skull:');
	createLogger('shape', {
		shapeLeft: 'saw'
	}).error('mends');
</script>
