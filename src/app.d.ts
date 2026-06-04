// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	declare type Dimensions = {
		width: number;
		height: number;
	};
	declare type ClipBounds = {
		left: {
			px: number;
			seconds: number;
		};
		right: {
			px: number;
			seconds: number;
		};
	};
}

export {};
