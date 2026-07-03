// Drop-in auto-render. Add this one tag to a page and every ```spytial-gdl
// block renders itself (the engine is injected if it isn't already present):
//
//     <script type="module" src=".../src/auto.js"></script>
//
// For control over timing, height, or theme, import { autoRender } from
// './markdown.js' and call it yourself instead.

import { autoRender } from './markdown.js';

autoRender();
