import Root from './accordion.svelte';
import Content from './accordion-content.svelte';
import Item from './accordion-item.svelte';
import Trigger from './accordion-trigger.svelte';

export {
	Root,
	Content,
	Item,
	Trigger,
	//
	Root as AccordionRoot,
	Content as AccordionContent,
	Item as AccordionItem,
	Trigger as AccordionTrigger
};
export const Accordion = { Root, Content, Item, Trigger };
export default Accordion;
