// Hand-written ESM bundle (no build step): uses only Vue's h(), which Directus
// provides to app extensions as a shared dependency.
import { h } from 'vue';

export default {
	id: 'image-path',
	name: 'Image Path',
	icon: 'image',
	description: 'Thumbnail for a relative image path, prefixed with a base URL',
	types: ['string'],
	options: [
		{
			field: 'baseUrl',
			name: 'Base URL',
			type: 'string',
			meta: { interface: 'input', width: 'full', note: 'Prefixed to the stored path, e.g. http://localhost:3000' },
		},
		{
			field: 'size',
			name: 'Size (px)',
			type: 'integer',
			meta: { interface: 'input', width: 'half' },
			schema: { default_value: 28 },
		},
	],
	component: {
		props: {
			value: { type: String, default: null },
			baseUrl: { type: String, default: '' },
			size: { type: Number, default: 28 },
		},
		render() {
			if (!this.value) return null;
			const src = /^https?:\/\//.test(this.value) ? this.value : `${this.baseUrl}${this.value}`;
			return h('img', {
				src,
				alt: '',
				style: `height:${this.size}px;width:${this.size}px;object-fit:contain;vertical-align:middle;image-rendering:pixelated;`,
			});
		},
	},
};
