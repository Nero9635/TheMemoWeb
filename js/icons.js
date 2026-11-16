// 線のアイコン(iOS の SF Symbols に近い形)。色は文字色(currentColor)に従う
import { html } from '../vendor/preact-htm.js';

const svg = (size, body, fill = false) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"
  fill=${fill ? 'currentColor' : 'none'} stroke=${fill ? 'none' : 'currentColor'} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const Icon = {
  star: (s = 22) => svg(s, html`<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>`),
  starFill: (s = 22) => svg(s, html`<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`, true),
  back: (s = 24) => svg(s, html`<path d="M15 5l-7 7 7 7" stroke-width="2.4"/>`),
  chevronDown: (s = 16) => svg(s, html`<path d="M6 9l6 6 6-6" stroke-width="2.4"/>`),
  chevronUp: (s = 16) => svg(s, html`<path d="M6 15l6-6 6 6" stroke-width="2.4"/>`),
  chevronRight: (s = 14) => svg(s, html`<path d="M9 5l7 7-7 7" stroke-width="2.6"/>`),
  search: (s = 22) => svg(s, html`<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>`),
  sparkle: (s = 22) => svg(s, html`<path d="M10 3l1.6 4.6L16 9.2l-4.4 1.6L10 15.4 8.4 10.8 4 9.2l4.4-1.6z"/><path d="M18 13l.9 2.4 2.4.9-2.4.9L18 19.6l-.9-2.4-2.4-.9 2.4-.9z"/>`, true),
  gear: (s = 22) => svg(s, html`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  more: (s = 18) => svg(s, html`<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>`, true),
  reply: (s = 18) => svg(s, html`<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>`),
  tag: (s = 18) => svg(s, html`<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>`),
  share: (s = 18) => svg(s, html`<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>`),
  plus: (s = 20) => svg(s, html`<path d="M12 5v14M5 12h14" stroke-width="2.2"/>`),
  close: (s = 20) => svg(s, html`<path d="M6 6l12 12M18 6L6 18" stroke-width="2.2"/>`),
  mic: (s = 20) => svg(s, html`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`),
  send: (s = 20) => svg(s, html`<path d="M12 19V5M6 11l6-6 6 6" stroke-width="2.6"/>`),
  photo: (s = 24) => svg(s, html`<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>`),
  camera: (s = 24) => svg(s, html`<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`),
  words: (s = 24) => svg(s, html`<path d="M4 7h16M4 12h10M4 17h7"/>`),
  check: (s = 20) => svg(s, html`<path d="M5 12.5l4.5 4.5L19 7.5" stroke-width="2.4"/>`),
  trash: (s = 20) => svg(s, html`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`),
  clock: (s = 20) => svg(s, html`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  copy: (s = 20) => svg(s, html`<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>`),
  edit: (s = 20) => svg(s, html`<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>`),
  link: (s = 16) => svg(s, html`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
};
