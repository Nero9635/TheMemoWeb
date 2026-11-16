// 画面どうしで共通の部品
import { html, useEffect, useRef, useState, useReducer, useLayoutEffect } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { t } from './i18n.js';
import { formatDay, weekdayColor, weekdayTextColor, splitLinks, tagStyle, dateKey, TAG_COLORS } from './util.js';

/** 状態が変わったら描き直す */
export function useStore() {
  const [, force] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const off = S.subscribe(force);
    // 購読する前に変わっていた分も描き直す
    force();
    return off;
  }, []);
  return S.state;
}

/** 端末に保存した写真 */
export function Img({ name, class: cls, alt = '', style = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    S.imageUrl(name).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [name]);
  return url ? html`<img class=${cls} style=${style} src=${url} alt=${alt} />` : html`<div class=${`${cls} img-loading`} style=${style}></div>`;
}

export function ProfileAvatar({ size = 40 }) {
  const s = S.state.settings;
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (s.profileImage) return html`<${Img} name=${s.profileImage} class="avatar avatar-img" style=${style} />`;
  return html`<div class="avatar" style=${style} aria-hidden="true">${(s.profileName || 'M').slice(0, 1).toUpperCase()}</div>`;
}

/** 人物のアイコン。by を渡すと、そのコメントを書いた人物として出す */
export function PersonaAvatar({ size = 40, by = null, icon = '' }) {
  const p = S.authorOf(S.state.settings.persona, by, icon);
  const style = `width:${size}px;height:${size}px`;
  if (p.image && p.name === S.state.settings.persona.name) {
    return html`<${Img} name=${p.image} class="avatar avatar-img" style=${style} />`;
  }
  const glyph = S.personaGlyph(p);
  const fs = Math.round(size * ([...glyph].length > 1 ? 0.36 : 0.5));
  return html`<div class="avatar persona" style=${`${style};font-size:${fs}px`} aria-hidden="true">${glyph}</div>`;
}

export function AiAvatar({ size = 40 }) {
  return html`<div class="avatar ai" style=${`width:${size}px;height:${size}px`} aria-hidden="true">${Icon.sparkle(Math.round(size / 2))}</div>`;
}

/** URL と #ハッシュタグ を押せるようにした文章。ハッシュタグを押すと、その言葉で検索する */
export function Linkified({ text }) {
  return splitLinks(text).flatMap((p) => {
    if (p.href) return [html`<a href=${p.href} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>${p.text}</a>`];
    const out = [];
    let last = 0;
    for (const m of p.text.matchAll(S.HASHTAG_RE)) {
      const start = m.index + m[1].length;
      if (start > last) out.push(p.text.slice(last, start));
      const tag = m[2];
      out.push(html`<button class="hashtag" onClick=${(e) => { e.stopPropagation(); S.open({ name: 'search', q: `#${tag}` }); }}>#${tag}</button>`);
      last = start + 1 + tag.length;
    }
    if (last < p.text.length) out.push(p.text.slice(last));
    return out;
  });
}

export function DateCapsule({ date, small = false }) {
  return html`<span class=${`capsule ${small ? 'small' : ''}`} style=${`background:${weekdayColor(date)};color:${weekdayTextColor(date)}`}>${formatDay(date)}</span>`;
}

export function TagPill({ name, onClick }) {
  const tg = S.tagInfo(name);
  return html`<button class="pill" style=${tagStyle(tg)} onClick=${(e) => { e.stopPropagation(); onClick?.(); }}>${name}</button>`;
}

export function tagColor(name) {
  return TAG_COLORS[S.tagInfo(name).color] ?? TAG_COLORS[0];
}

/** 高さが文字に合わせて伸びる入力欄。onSubmit があれば ⌘ + Return で送る */
export function AutoText({ value, onInput, placeholder, class: cls, maxRows = 0, label, autofocus = false, onSubmit = null }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const max = maxRows ? lh * maxRows + 20 : Infinity;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value]);
  useEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  const onKeyDown = onSubmit && ((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit(); }
  });
  return html`<textarea ref=${ref} class=${cls} rows="1" value=${value} placeholder=${placeholder} aria-label=${label || placeholder}
    onInput=${(e) => onInput(e.target.value)} onKeyDown=${onKeyDown}></textarea>`;
}

// ---- シート(下からせり上がる / iPad では浮かぶ画面) ----

export function Sheet({ onClose, children, label = 'Sheet' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="backdrop" onClick=${onClose}>
    <div class="sheet glass" role="dialog" aria-label=${label} onClick=${(e) => e.stopPropagation()}>
      <div class="grabber" aria-hidden="true"></div>
      ${children}
    </div>
  </div>`;
}

/** iOS の長押しメニュー / アクションシート。preview があれば上に出す */
export function ActionSheet({ items, onClose, preview = null, title = '' }) {
  return html`<div class="backdrop menu-backdrop" onClick=${onClose}>
    <div class="menu-wrap" onClick=${(e) => e.stopPropagation()}>
      ${preview && html`<div class="menu-preview">${preview}</div>`}
      <div class="menu glass" role="menu" aria-label=${title || 'Actions'}>
        ${title && html`<div class="menu-title">${title}</div>`}
        ${items.filter(Boolean).map((it) => (it.divider
          ? html`<div class="menu-divider" aria-hidden="true"></div>`
          : html`<button role="menuitem" class=${`menu-item ${it.danger ? 'danger' : ''}`} disabled=${it.disabled}
              onClick=${() => { onClose(); it.onClick(); }}>
              <span>${it.label}</span>${it.icon && html`<span class="menu-icon">${it.icon}</span>`}
            </button>`))}
      </div>
      <button class="menu-cancel glass" onClick=${onClose}>${t('cancel')}</button>
    </div>
  </div>`;
}

/**
 * タグを選ぶシート。決めた一覧の中からチェックで付け外しする。
 * 一覧に新しいタグを足すこともできる(自由な言葉は本文に #ハッシュタグ で)
 */
export function TagSheet({ selected, onChange, onClose }) {
  const [sel, setSel] = useState(selected);
  const [name, setName] = useState('');
  // 一覧のタグ + この投稿に付いている一覧外のタグ(外せるように)
  const names = [...new Set([...S.state.tags.map((x) => x.name), ...sel])];
  const toggle = (n) => {
    const next = sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n];
    setSel(next);
    onChange(next);
  };
  const add = () => {
    const n = name.trim().replace(/^#/, '');
    if (!n) return;
    S.registerTag(n);
    if (!sel.includes(n)) toggle(n);
    setName('');
  };
  return html`<${Sheet} onClose=${onClose} label=${t('tags')}>
    <div class="sheet-head"><span class="sheet-title">${t('tags')}</span><button class="link-btn strong" onClick=${onClose}>${t('done')}</button></div>
    <div class="group">
      ${names.map((n) => html`<button class="row" onClick=${() => toggle(n)}>
        <span class="tag-dot" style=${`background:${tagColor(n)}`}></span><span class="row-label">${n}</span>
        ${!S.isListedTag(n) && html`<span class="row-value small-text">${t('notInList')}</span>`}
        ${sel.includes(n) && html`<span class="accent">${Icon.check()}</span>`}
      </button>`)}
      <form class="row" onSubmit=${(e) => { e.preventDefault(); add(); }}>
        <input class="row-input" placeholder=${t('addTagToList')} aria-label=${t('newTag')} value=${name} onInput=${(e) => setName(e.target.value)} />
        <button type="submit" class="link-btn" disabled=${!name.trim()}>${t('add')}</button>
      </form>
    </div>
    <p class="hint">${t('tagSheetHint')}</p>
    <button class="link-btn strong pad" onClick=${() => { onClose(); S.open({ name: 'tags' }); }}>${t('manageTags')}</button>
  </${Sheet}>`;
}

/** 投稿の日時を変える。日記は日付だけ(一日に1つなので、日記のある日には動かせない) */
export function TimeSheet({ memo, onClose }) {
  const d = new Date(memo.createdAt);
  const [date, setDate] = useState(dateKey(d));
  const [time, setTime] = useState(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  const taken = memo.allDay && date !== dateKey(d) && S.activeMemos().some((m) => m.allDay && m.id !== memo.id && S.memoDate(m) === date);
  const save = () => {
    const [y, mo, da] = date.split('-').map(Number);
    const [h, mi] = memo.allDay ? [12, 0] : time.split(':').map(Number);
    S.setMemoTime(memo.id, new Date(y, mo - 1, da, h, mi).getTime());
    onClose();
  };
  return html`<${Sheet} onClose=${onClose} label=${t('changeTime')}>
    <div class="sheet-head"><button class="link-btn" onClick=${onClose}>${t('cancel')}</button>
      <span class="sheet-title">${memo.allDay ? t('changeDate') : t('changeTime')}</span>
      <button class="link-btn strong" disabled=${taken || !date} onClick=${save}>${t('save')}</button></div>
    <div class="group">
      <label class="row"><span class="row-label">${t('date')}</span><input type="date" class="row-native" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
      ${!memo.allDay && html`<label class="row"><span class="row-label">${t('time')}</span><input type="time" class="row-native" value=${time} onInput=${(e) => setTime(e.target.value)} /></label>`}
    </div>
    ${taken && html`<p class="hint danger-text">${t('diaryTaken')}</p>`}
  </${Sheet}>`;
}

/** 投稿の「…」と長押しのメニュー */
export function usePostMenu() {
  const [menu, setMenu] = useState(null); // {memo, preview}
  const [tagging, setTagging] = useState(null);
  const [timing, setTiming] = useState(null);
  const openMenu = (memo, preview = null) => setMenu({ memo, preview });
  const persona = S.state.settings.persona;
  const view = html`
    ${menu && html`<${ActionSheet} preview=${menu.preview} onClose=${() => setMenu(null)} items=${[
      { label: t('edit'), icon: Icon.edit(), onClick: () => S.open({ name: 'detail', id: menu.memo.id }) },
      { label: menu.memo.allDay ? t('changeDate') : t('changeTime'), icon: Icon.clock(), onClick: () => setTiming(menu.memo) },
      { label: t('tags'), icon: Icon.tag(20), onClick: () => setTagging(menu.memo) },
      { label: t('ask', { name: persona.name }), icon: html`<span class="glyph">${S.personaGlyph(persona)}</span>`, disabled: !!S.state.busy, onClick: () => S.commentOn(menu.memo.id) },
      { divider: true },
      { label: t('copyText'), icon: Icon.copy(), onClick: () => copyText(S.plainText(menu.memo)) },
      { label: t('share'), icon: Icon.share(20), onClick: () => shareText(S.plainText(menu.memo)) },
      { divider: true },
      { label: t('delete'), icon: Icon.trash(), danger: true, onClick: () => { if (confirm(t('confirmTrash'))) S.trashMemo(menu.memo.id); } },
    ]} />`}
    ${tagging && html`<${TagSheet} selected=${tagging.tags} onChange=${(tg) => S.setMemoTags(tagging.id, tg)} onClose=${() => setTagging(null)} />`}
    ${timing && html`<${TimeSheet} memo=${timing} onClose=${() => setTiming(null)} />`}
  `;
  return { openMenu, openTags: setTagging, view };
}

/** 長押し(0.5秒)を見分ける。指が動いたらやめる */
export function longPress(onLong) {
  let timer = null;
  let start = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  return {
    onPointerDown: (e) => {
      start = [e.clientX, e.clientY];
      timer = setTimeout(() => { timer = null; onLong(); }, 500);
    },
    onPointerMove: (e) => { if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) cancel(); },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => { e.preventDefault(); },
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    S.say(t('copied'));
  } catch {
    S.say(t('copyFailed'));
  }
}

export async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* 閉じた時は何もしない */ }
  } else {
    copyText(text);
  }
}

/** 返信(人物・AI・会話)。左にアイコンとスレッドの線 */
export function ReplyItem({ avatar, name, meta, busy = false, menu = null, children, line = true, foldable = false }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(!foldable);
  return html`<div class="reply">
    <div class="reply-side">${avatar}${line && html`<div class="thread-line"></div>`}</div>
    <div class="reply-main">
      <div class="reply-head"><strong>${name}</strong><span class="muted"> · ${meta}</span><span class="flex"></span>
        ${menu && html`<button class="icon-btn small" aria-label=${t('more')} onClick=${() => setOpen(true)}>${Icon.more()}</button>`}</div>
      ${busy && html`<div class="progress" role="progressbar" aria-label="Working"><span></span></div>`}
      <div class=${showAll ? '' : 'clamp4'}>${children}</div>
      ${!showAll && html`<button class="link-btn strong show-more" onClick=${() => setShowAll(true)}>${t('showMore')}</button>`}
    </div>
    ${open && html`<${ActionSheet} items=${menu} onClose=${() => setOpen(false)} />`}
  </div>`;
}

/** iOS 風の丸いガラスのボタン(戻る・閉じるなど) */
export function GlassButton({ label, onClick, children, disabled = false, class: cls = '' }) {
  return html`<button class=${`glass-btn ${cls}`} aria-label=${label} disabled=${disabled} onClick=${onClick}>${children}</button>`;
}
