import Root, { buttonGroupVariants, type ButtonGroupOrientation } from './button-group.svelte';
import Text from './button-group-text.svelte';
import Separator from './button-group-separator.svelte';

export {
	Root,
	Text,
	Separator,
	buttonGroupVariants,
	type ButtonGroupOrientation,
	//
	Root as ButtonGroupRoot,
	Text as ButtonGroupText,
	Separator as ButtonGroupSeparator
};
export const ButtonGroup = {
	Root,
	Text,
	Separator
};
export default ButtonGroup;
