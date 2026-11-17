// 画面どうしで共通の部品
import { html, useEffect, useRef, useState, useReducer, useLayoutEffect } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { t } from './i18n.js';
import { formatDay, formatTime, formatDateTime, weekdayColor, weekdayTextColor, splitLinks, tagStyle, dateKey, TAG_COLORS } from './util.js';

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

export function DateCapsule({ date, small = false, time = '', onClick = null, label = '' }) {
  const style = `background:${weekdayColor(date)};color:${weekdayTextColor(date)}`;
  const text = time ? html`${formatDay(date)}<span class="capsule-time">${time}</span>` : formatDay(date);
  if (onClick) return html`<button class=${`capsule capsule-btn-date ${small ? 'small' : ''}`} style=${style} aria-label=${label} onClick=${onClick}>${text}</button>`;
  return html`<span class=${`capsule ${small ? 'small' : ''}`} style=${style}>${text}</span>`;
}

/** 星(お気に入り)のボタン */
export function StarButton({ memo, size = 20, class: cls = 'act' }) {
  return html`<button class=${`${cls} star-act ${memo.starred ? 'starred' : ''}`} aria-pressed=${memo.starred}
    aria-label=${memo.starred ? t('unstar') : t('star')} onClick=${(e) => { e.stopPropagation(); S.toggleStar(memo.id); }}>
    ${memo.starred ? Icon.starFill(size) : Icon.star(size)}</button>`;
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
    <div class="tag-cloud" role="group" aria-label=${t('tags')}>
      ${names.map((n) => {
        const on = sel.includes(n);
        const c = tagColor(n);
        return html`<button class=${`tag-cap ${on ? 'on' : ''} ${S.isListedTag(n) ? '' : 'unlisted'}`} aria-pressed=${on}
          style=${on ? `${tagStyle(S.tagInfo(n))};border-color:${c}` : `--dot:${c}`} title=${S.isListedTag(n) ? '' : t('notInList')} onClick=${() => toggle(n)}>
          ${on ? html`<span class="tag-cap-check">${Icon.check(14)}</span>` : html`<span class="tag-cap-dot"></span>`}${n}</button>`;
      })}
      <form class="tag-cap tag-cap-new" onSubmit=${(e) => { e.preventDefault(); add(); }}>
        <span class="tag-cap-plus">${Icon.plus(14)}</span>
        <input placeholder=${t('newTag')} aria-label=${t('addTagToList')} value=${name} onInput=${(e) => setName(e.target.value)} enterkeyhint="done" />
        ${name.trim() && html`<button type="submit" class="tag-cap-add">${t('add')}</button>`}
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
  const [mooding, setMooding] = useState(null);
  const [history, setHistory] = useState(null);
  const openMenu = (memo, preview = null) => setMenu({ memo, preview });
  const persona = S.state.settings.persona;
  const view = html`
    ${menu && html`<${ActionSheet} preview=${menu.preview} onClose=${() => setMenu(null)} items=${[
      { label: t('edit'), icon: Icon.edit(), onClick: () => S.open({ name: 'detail', id: menu.memo.id }) },
      { label: menu.memo.starred ? t('unstar') : t('star'), icon: menu.memo.starred ? Icon.starFill(20) : Icon.star(20), onClick: () => S.toggleStar(menu.memo.id) },
      { label: t('tags'), icon: Icon.tag(20), onClick: () => setTagging(menu.memo) },
      { label: t('ask', { name: persona.name }), icon: html`<span class="glyph">${S.personaGlyph(persona)}</span>`, disabled: !!S.state.busy, onClick: () => S.commentOn(menu.memo.id) },
      { divider: true },
      { label: t('copyText'), icon: Icon.copy(), onClick: () => copyText(S.plainText(menu.memo)) },
      { label: t('share'), icon: Icon.share(20), onClick: () => shareText(S.plainText(menu.memo)) },
      S.versionsOf(menu.memo.id).length > 0 && { label: t('versionHistory'), icon: Icon.clock(), onClick: () => setHistory(menu.memo.id) },
      { divider: true },
      { label: t('delete'), icon: Icon.trash(), danger: true, onClick: () => { if (confirm(t('confirmTrash'))) S.trashMemo(menu.memo.id); } },
    ]} />`}
    ${tagging && html`<${TagSheet} selected=${tagging.tags} onChange=${(tg) => S.setMemoTags(tagging.id, tg)} onClose=${() => setTagging(null)} />`}
    ${timing && html`<${TimeSheet} memo=${timing} onClose=${() => setTiming(null)} />`}
    ${mooding && html`<${ActionSheet} title=${t('howWasToday')} onClose=${() => setMooding(null)} items=${S.MOODS.map(([k, e], i) => ({
      label: `${e}  ${t('moods')[i]}${S.getMemo(mooding)?.mood === k ? '  ✓' : ''}`, onClick: () => S.setMood(mooding, k),
    }))} />`}
    ${history && html`<${VersionSheet} id=${history} onClose=${() => setHistory(null)} />`}
  `;
  return { openMenu, openTags: setTagging, openMood: (memo) => setMooding(memo.id), openTime: setTiming, openHistory: setHistory, view };
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

/** 以前の版の一覧。押すと中身を見られ、その版に戻せる */
export function VersionSheet({ id, onClose }) {
  const list = S.versionsOf(id);
  const [open, setOpen] = useState(null);
  const restore = (v) => {
    if (!confirm(t('confirmRestoreVersion', { d: formatDateTime(v.at) }))) return;
    S.restoreVersion(id, v.at);
    onClose();
  };
  return html`<${Sheet} onClose=${onClose} label=${t('versionHistory')}>
    <div class="sheet-head"><span class="sheet-title">${t('versionHistory')}</span><button class="link-btn strong" onClick=${onClose}>${t('done')}</button></div>
    <p class="hint">${t('versionHint')}</p>
    ${list.length === 0 && html`<p class="empty">${t('noVersions')}</p>`}
    <div class="group">
      ${list.map((v) => html`<div class="version-row">
        <button class="version-main" onClick=${() => setOpen(open === v.at ? null : v.at)} aria-expanded=${open === v.at}>
          <div class="small-text muted">${formatDateTime(v.at)}</div>
          ${v.title && html`<div class="version-title">${v.title}</div>`}
          <div class=${open === v.at ? 'pre version-body' : 'clamp2 version-body'}>${v.body || t('photoLabel')}</div>
        </button>
        <button class="pill-btn small version-restore" onClick=${() => restore(v)}>${t('restore')}</button>
      </div>`)}
    </div>
  </${Sheet}>`;
}

/**
 * iOS のプルダウンメニュー。押したボタン(rect)の近くから、ふわっと広がって出る。
 * sections: [[{label, icon, onClick, danger, disabled}], ...] 区切りごとの項目
 */
export function PopMenu({ rect, sections, onClose, title = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const vw = window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const width = Math.min(270, vw - 24);
  const below = rect.top < vh / 2;
  const right = Math.max(12, Math.min(vw - rect.right, vw - width - 12));
  const pos = below ? `top:${rect.bottom + 8}px;max-height:${vh - rect.bottom - 24}px` : `bottom:${vh - rect.top + 8}px;max-height:${rect.top - 24}px`;
  const originX = vw - right - (rect.left + rect.right) / 2 < width / 2 ? 'right' : 'center';
  const list = sections.map((sec) => sec.filter(Boolean)).filter((sec) => sec.length);
  return html`<div class="pop-backdrop" onClick=${onClose}>
    <div class="pop-menu" role="menu" aria-label=${title || 'Menu'} onClick=${(e) => e.stopPropagation()}
      style=${`${pos};right:${right}px;width:${width}px;transform-origin:${below ? 'top' : 'bottom'} ${originX}`}>
      ${title && html`<div class="pop-title">${title}</div>`}
      ${list.map((sec, i) => html`${i > 0 && html`<div class="pop-sep" aria-hidden="true"></div>`}
        ${sec.map((it) => html`<button role="menuitem" class=${`pop-item ${it.danger ? 'danger' : ''}`} disabled=${it.disabled}
          onClick=${() => { onClose(); it.onClick(); }}><span class="pop-label">${it.label}</span>${it.icon && html`<span class="pop-icon">${it.icon}</span>`}</button>`)}`)}
    </div>
  </div>`;
}

/** 下からせり上がる、操作のためのパネル(フォーマット・写真など)。後ろは暗くしない */
export function Panel({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`<div class="panel-backdrop" onClick=${onClose}>
    <div class="panel" role="dialog" aria-label=${title} onClick=${(e) => e.stopPropagation()}>
      <div class="panel-head"><span class="panel-title">${title}</span>
        <button class="panel-close" aria-label=${t('close')} onMouseDown=${(e) => e.preventDefault()} onClick=${onClose}>${Icon.close(16)}</button></div>
      ${children}
    </div>
  </div>`;
}

/**
 * iPad / iPhone で入力欄を押した時、キーボードに合わせて画面全体が一度上へずれてから戻る動きを止める。
 * 押した瞬間だけ入力欄を画面の上の外へ動かしてからフォーカスすると、iOS は画面をずらさない。
 * キーボードが出て画面の高さが合ったら(visualViewport の resize)元の位置に戻す
 */
export function focusWithoutSlide(el) {
  if (!el || document.activeElement === el) return;
  const vv = window.visualViewport;
  let done = false;
  const restore = () => {
    if (done) return;
    done = true;
    vv?.removeEventListener('resize', onResize);
    el.style.transform = '';
  };
  const onResize = () => requestAnimationFrame(() => requestAnimationFrame(restore));
  el.style.transform = 'translateY(-200vh)';
  el.focus({ preventScroll: true });
  vv?.addEventListener('resize', onResize);
  setTimeout(restore, 650); // キーボードが出ない時(外付けキーボードなど)
}
