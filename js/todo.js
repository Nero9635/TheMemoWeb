// To-do リスト(v39)。日記に付く、その日のリスト。いくつでも作れて、アイコンと色を選べる。
// 気分と同じく日記の持ち物なので、ホームの日記カード・日記の画面(タイトルと本文の間)・カレンダーに出る。
// 書く欄はふつうの <input>(書ける面とは別)なので、本文の入力の仕組みには関わらない
import { html, render, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { Sheet } from './ui.js';
import { t } from './i18n.js';
import { haptic, parseDateKey, formatDay } from './util.js';

// リストのアイコン(白い線で、色の丸の上に描く。Apple のリマインダーと同じ形)
const g = (size, body) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const TODO_GLYPH = {
  list: (s) => g(s, html`<path d="M9 7h10M9 12h10M9 17h10"/><circle cx="5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1.1" fill="currentColor" stroke="none"/>`),
  check: (s) => g(s, html`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  star: (s) => g(s, html`<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>`),
  heart: (s) => g(s, html`<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>`),
  cart: (s) => g(s, html`<path d="M3 4h2.2l2.2 11h10.8l2-8H6.3"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>`),
  work: (s) => g(s, html`<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>`),
  home: (s) => g(s, html`<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>`),
  book: (s) => g(s, html`<path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2z"/><path d="M12 6.5v13"/>`),
  run: (s) => g(s, html`<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>`),
  pill: (s) => g(s, html`<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l9-9a4.95 4.95 0 0 1 7 7z"/><path d="M8 8l8 8"/>`),
  leaf: (s) => g(s, html`<path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z"/><path d="M5 19l7.5-7.5"/>`),
  sun: (s) => g(s, html`<circle cx="12" cy="12" r="3.8"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`),
  moon: (s) => g(s, html`<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>`),
  gift: (s) => g(s, html`<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-1-2.6-4.6-3.6-4.6-1.3C7.4 8 12 8 12 8zM12 8c1-2.6 4.6-3.6 4.6-1.3C16.6 8 12 8 12 8z"/>`),
  plane: (s) => g(s, html`<path d="M21.5 3L2.5 10.5l7 2.5 2.5 7z"/><path d="M9.5 13L21.5 3"/>`),
  flag: (s) => g(s, html`<path d="M5.5 21V4M5.5 4h11l-2.2 4 2.2 4h-11"/>`),
};

const colorOf = (l) => S.TODO_COLORS[l?.color] ?? S.TODO_COLORS.blue;
const glyph = (icon, size) => (TODO_GLYPH[icon] ?? TODO_GLYPH.list)(size);

/** 色の丸にアイコン */
export function TodoBadge({ list, size = 28 }) {
  return html`<span class="todo-badge" style=${`--tc:${colorOf(list)};width:${size}px;height:${size}px`}>${glyph(list.icon, Math.round(size * 0.58))}</span>`;
}

/** カレンダーの小さな印: その日の To-do の進み具合の輪。全部終わったら塗りつぶしにチェック */
export function TodoRing({ done, total }) {
  if (!total) return null;
  const r = 3.6;
  const c = 2 * Math.PI * r;
  if (done >= total) {
    return html`<i class="mark todo-ring all" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 9 9"><circle cx="4.5" cy="4.5" r="4.5" fill="currentColor"/>
      <path d="M2.4 4.6l1.4 1.4 2.8-2.9" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></i>`;
  }
  return html`<i class="mark todo-ring" aria-hidden="true"><svg width="9" height="9" viewBox="0 0 9 9">
    <circle cx="4.5" cy="4.5" r=${r} fill="none" stroke="currentColor" stroke-opacity="0.28" stroke-width="1.5"/>
    <circle cx="4.5" cy="4.5" r=${r} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
      stroke-dasharray=${`${(c * done) / total} ${c}`} transform="rotate(-90 4.5 4.5)"/></svg></i>`;
}

/** シートをページのいちばん外に出す(日の見出しやカードの中だと、画面いっぱいに広がれないため) */
function Portal({ children }) {
  const host = useRef(null);
  if (!host.current) host.current = document.createElement('div');
  useLayoutEffect(() => {
    document.body.appendChild(host.current);
    return () => { render(null, host.current); host.current.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, host.current); });
  return null;
}

// 押したことが、外側(日記カードを開く・長押しメニュー)へ伝わらないように
const stop = { onClick: (e) => e.stopPropagation(), onPointerDown: (e) => e.stopPropagation(), onContextMenu: (e) => e.stopPropagation() };

/**
 * リストを作る・直すシート。
 * - list が null: 新しいリスト(前に作ったリストを使い回すこともできる)
 * - source 'memo': その日だけのリスト(日記に付く) / 'repeat': 繰り返すリスト(state.todoLists)
 * memoId は関数でもよい(ホームの日の見出しから: その日だけのリストを作る時に初めて日記を作る)
 * date はこのシートを開いた日。繰り返しの始まり・やめる日になる
 */
export function TodoListSheet({ memoId, date, list = null, source = 'memo', onClose }) {
  const isRepeat = source === 'repeat';
  // 繰り返しをやめたリストは「なし」と見せる(選び直せば、また繰り返す)
  const startKind = isRepeat && !list.end ? list.repeat.kind : 'none';
  const dow = parseDateKey(date).getDay();
  const [title, setTitle] = useState(list?.title ?? '');
  const [icon, setIcon] = useState(list?.icon ?? 'list');
  const [color, setColor] = useState(list?.color ?? 'blue');
  const [kind, setKind] = useState(startKind);
  const [days, setDays] = useState(isRepeat && list.repeat.days.length ? list.repeat.days : [dow]);
  const resolveId = () => (typeof memoId === 'function' ? memoId() : memoId);
  const saved = list ? [] : S.savedTodoLists(typeof memoId === 'function' ? null : memoId);
  const draft = { title, icon, color };
  const repeat = { kind, days: kind === 'weekly' ? days : [] };
  // 説明に使う「始まりの日」: 繰り返すリストは元の始まりの日、新しく繰り返す時はこの日
  const preview = kind === 'none' ? null : { repeat: { kind, days: repeat.days }, start: isRepeat ? list.start : date };
  const done = () => {
    const attrs = { title: title.trim(), icon, color };
    if (!list) {
      if (kind === 'none') S.addTodoList(resolveId(), attrs);
      else S.addTodoDef({ ...attrs, repeat, start: date });
    } else if (!isRepeat) {
      if (kind === 'none') S.updateTodos(resolveId(), (ls) => ls.map((l) => (l.id === list.id ? { ...l, ...attrs } : l)));
      else S.makeRepeating(resolveId(), list.id, repeat, attrs);
    } else if (kind === 'none') {
      S.updateTodoDef(list.id, (l) => ({ ...l, ...attrs }));
      // もうやめているリストは、やめた日をそのままに(前の日から開いても、後の日の記録を隠さない)
      if (!list.end) S.stopRepeating(list.id, date);
    } else {
      // 繰り返し方を変えた(または、やめていたのをまた繰り返す)
      S.updateTodoDef(list.id, (l) => ({ ...l, ...attrs, repeat, end: null }));
    }
    haptic();
    onClose();
  };
  const reuse = (l) => {
    S.addTodoList(resolveId(), { title: l.title, icon: l.icon, color: l.color, items: l.items.filter((i) => i.text.trim()) });
    haptic();
    onClose();
  };
  const remove = () => {
    if (isRepeat) {
      if (!confirm(t('todoConfirmDeleteAll'))) return;
      S.deleteTodoDef(list.id);
    } else {
      if (!confirm(t('todoConfirmDelete'))) return;
      S.updateTodos(resolveId(), (ls) => ls.filter((l) => l.id !== list.id));
    }
    onClose();
  };
  const toggleDay = (d) => setDays((xs) => (xs.includes(d) ? (xs.length > 1 ? xs.filter((x) => x !== d) : xs) : [...xs, d].sort()));
  const hint = kind === 'none'
    ? (isRepeat && list.end ? t('repeatEndedOn', { d: formatDay(list.end) }) : isRepeat ? t('repeatStopHint') : '')
    : `${S.repeatLabel(preview)}${!list || !isRepeat ? ` · ${t('repeatFrom', { d: formatDay(date) })}` : ''}`;
  return html`<${Portal}><${Sheet} onClose=${onClose} label=${list ? t('todoEditList') : t('todoNewList')}>
    <div class="sheet-head"><button class="link-btn" onClick=${onClose}>${t('cancel')}</button>
      <span class="sheet-title">${list ? t('todoEditList') : t('todoNewList')}</span>
      <button class="link-btn strong" onClick=${done}>${t('done')}</button></div>
    <div class="todo-hero" style=${`--tc:${colorOf(draft)}`}>
      <${TodoBadge} list=${draft} size=${72} />
      <input class="todo-name-input" placeholder=${t('todoListName')} aria-label=${t('todoListName')} value=${title} enterkeyhint="done"
        onInput=${(e) => setTitle(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); e.target.blur(); } }} />
    </div>
    <div class="group-title">${t('repeat')}</div>
    <div class="todo-repeat" style=${`--tc:${colorOf(draft)}`}>
      <div class="todo-repeat-kinds" role="radiogroup" aria-label=${t('repeat')}>
        ${S.REPEAT_KINDS.map((k) => html`<button class=${`todo-chip-opt ${kind === k ? 'on' : ''}`} role="radio" aria-checked=${kind === k}
          onClick=${() => setKind(k)}>${t(`repeat_${k}`)}</button>`)}
      </div>
      ${kind === 'weekly' && html`<div class="todo-repeat-days" role="group" aria-label=${t('repeat_weekly')}>
        ${[0, 1, 2, 3, 4, 5, 6].map((d) => html`<button class=${`todo-day-opt ${days.includes(d) ? 'on' : ''}`} aria-pressed=${days.includes(d)}
          onClick=${() => toggleDay(d)}>${t('dowShort')[d]}</button>`)}
      </div>`}
      ${hint && html`<p class="todo-repeat-hint">${kind !== 'none' && Icon.repeat(14)}${hint}</p>`}
    </div>
    <div class="todo-pick" role="radiogroup" aria-label=${t('todoColor')}>
      ${Object.entries(S.TODO_COLORS).map(([k, hex]) => html`<button class=${`todo-swatch ${color === k ? 'on' : ''}`} role="radio" aria-checked=${color === k}
        aria-label=${k} style=${`--sw:${hex}`} onClick=${() => setColor(k)}></button>`)}
    </div>
    <div class="todo-pick icons" role="radiogroup" aria-label=${t('todoIcon')} style=${`--tc:${colorOf(draft)}`}>
      ${S.TODO_ICONS.map((k) => html`<button class=${`todo-icon-opt ${icon === k ? 'on' : ''}`} role="radio" aria-checked=${icon === k} aria-label=${k}
        onClick=${() => setIcon(k)}>${glyph(k, 22)}</button>`)}
    </div>
    ${saved.length > 0 && html`<div class="group-title">${t('todoFromSaved')}</div>
      <div class="group">${saved.map((l) => html`<button class="row todo-saved" onClick=${() => reuse(l)}>
        <${TodoBadge} list=${l} size=${30} />
        <span class="row-label">${l.title}</span>
        <span class="muted">${t('todoItems', { n: l.items.filter((i) => i.text.trim()).length })}</span>
        <span class="todo-saved-plus">${Icon.plus(18)}</span>
      </button>`)}</div>`}
    ${list && html`<div class="group"><button class="row danger-text todo-del" onClick=${remove}>${isRepeat ? t('todoDeleteAll') : t('todoDelete')}</button></div>`}
  </${Sheet}></${Portal}>`;
}

/** 「＋ To-do」ボタン(日記の気分の隣・日の見出し)。押すと新しいリストのシート */
export function TodoAddButton({ memoId, date, className = '', label = true }) {
  const [open, setOpen] = useState(false);
  return html`<span class="todo-add-host" ...${stop}>
    <button class=${className} aria-label=${t('todoAddList')} onClick=${(e) => { e.stopPropagation(); setOpen(true); }}>
      ${label === 'add' ? Icon.plus(16) : Icon.checklist(16)}${label && html`<span>${label === 'add' ? t('todoAddList') : t('todo')}</span>`}</button>
    ${open && html`<${TodoListSheet} memoId=${memoId} date=${date} onClose=${() => setOpen(false)} />`}
  </span>`;
}

/** ひとつの項目。書く欄は自分で値を持つ(打っている最中に上から書き換えない: 変換が崩れないように) */
function TodoItemRow({ item, color, focus, onFocused, onToggle, onText, onEnter, onRemoveEmpty, onBlurEmpty }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.value !== item.text) el.value = item.text;
  }, [item.text]);
  useLayoutEffect(() => {
    if (!focus || !ref.current) return;
    ref.current.focus();
    const n = ref.current.value.length;
    ref.current.setSelectionRange(n, n);
    onFocused();
  }, [focus]);
  return html`<div class=${`todo-item ${item.done ? 'done' : ''}`}>
    <button class="todo-check" role="checkbox" aria-checked=${item.done} aria-label=${item.text || t('todoAddItem')}
      onMouseDown=${(e) => e.preventDefault()} onClick=${onToggle}>${item.done && Icon.check(13)}</button>
    <input class="todo-text" ref=${ref} defaultValue=${item.text} enterkeyhint="next" aria-label=${t('todoAddItem')} placeholder=${t('todoAddItem')}
      style=${`caret-color:${color}`}
      onInput=${(e) => onText(e.target.value)}
      onKeyDown=${(e) => {
        if (e.isComposing || e.keyCode === 229) return;
        // 空の項目で Return → 書き終わり(リマインダーと同じ)。文字があれば次の項目へ
        if (e.key === 'Enter') { e.preventDefault(); if (e.target.value.trim()) onEnter(); else e.target.blur(); }
        else if (e.key === 'Backspace' && !e.target.value) { e.preventDefault(); onRemoveEmpty(); }
      }}
      onBlur=${(e) => { if (!e.target.value.trim()) onBlurEmpty(); }} />
  </div>`;
}

/**
 * ひとつのリスト。list の items には、その日のチェック(done)が入っている。
 * update(fn, delay): 項目の並び(done 付き)を書き換える。その日だけのリストか繰り返すリストかで、保存先が変わる
 */
function TodoList({ list, update, sheet }) {
  const [focusId, setFocusId] = useState(null);
  const [editing, setEditing] = useState(false);
  const color = colorOf(list);
  const items = list.items;
  const filled = items.filter((i) => i.text.trim());
  const doneN = filled.filter((i) => i.done).length;
  const addAfterId = (id) => {
    const it = S.todoItem();
    update((xs) => {
      const at = xs.findIndex((x) => x.id === id);
      return at < 0 ? [...xs, it] : [...xs.slice(0, at + 1), it, ...xs.slice(at + 1)];
    });
    setFocusId(it.id);
  };
  // 項目を消す(最後の 1 つは残す)。消すのは id で: あとから呼ばれても別の項目を消さないように
  const removeId = (id, focusPrev) => {
    const at = items.findIndex((x) => x.id === id);
    const prev = at > 0 ? items[at - 1] : null;
    update((xs) => (xs.length <= 1 ? xs : xs.filter((x) => x.id !== id)));
    if (focusPrev && prev) setFocusId(prev.id);
  };
  return html`<div class="todo-list" style=${`--tc:${color}`}>
    <div class="todo-head">
      <button class="todo-head-btn" aria-label=${t('todoEditList')} onClick=${() => setEditing(true)}>
        <${TodoBadge} list=${list} size=${26} />
        <span class="todo-head-text">
          <span class="todo-title">${list.title || t('todo')}</span>
          ${list.repeat && html`<span class="todo-repeat-label">${Icon.repeat(11)}${S.repeatLabel(list)}</span>`}
        </span>
      </button>
      <span class="todo-count" aria-label=${`${doneN}/${filled.length}`}>${filled.length ? `${doneN}/${filled.length}` : ''}</span>
      <button class="icon-btn small muted" aria-label=${t('todoEditList')} onClick=${() => setEditing(true)}>${Icon.more()}</button>
    </div>
    ${items.map((it) => html`<${TodoItemRow} key=${it.id} item=${it} color=${color} focus=${focusId === it.id} onFocused=${() => setFocusId(null)}
      onToggle=${() => { if (!it.text.trim()) return; haptic(); update((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x))); }}
      onText=${(v) => update((xs) => xs.map((x) => (x.id === it.id ? { ...x, text: v } : x)), 400)}
      onEnter=${() => addAfterId(it.id)}
      onRemoveEmpty=${() => removeId(it.id, true)}
      onBlurEmpty=${() => setTimeout(() => removeId(it.id, false), 0)} />`)}
    <button class="todo-add-item" onMouseDown=${(e) => e.preventDefault()} onClick=${() => {
      const last = items[items.length - 1];
      if (last && !last.text.trim()) { setFocusId(last.id); return; }
      addAfterId(last?.id);
    }}>${Icon.plus(18)}<span>${t('todoAddItem')}</span></button>
    ${editing && html`<${TodoListSheet} ...${sheet} list=${sheet.list ?? list} onClose=${() => setEditing(false)} />`}
  </div>`;
}

/**
 * その日の To-do リストをすべて: 繰り返すリスト(その日に当たるもの)と、日記に付いたその日だけのリスト。
 * memo があれば日記の日、なければ date の日(日記のない日のホームの欄)。
 * variant: 'card'(ホームの日記カード)/ 'detail'(日記の画面)/ 'day'(日記のない日のホーム)
 */
export function TodoSection({ memo = null, date = null, variant = 'detail', showAdd = false }) {
  const key = memo ? S.memoDate(memo) : date;
  const own = memo?.todos ?? [];
  const repeats = S.repeatsOn(key);
  if (!own.length && !repeats.length && !showAdd) return null;
  const memoId = memo ? memo.id : () => S.diaryFor(key).id;
  return html`<div class=${`todo-sec ${variant}`} ...${stop}>
    ${repeats.map((def) => html`<${TodoList} key=${def.id} list=${S.repeatView(def, key)}
      update=${(fn, delay) => S.updateRepeatItems(def.id, key, fn, delay)}
      sheet=${{ memoId, date: key, source: 'repeat', list: def }} />`)}
    ${own.map((l) => html`<${TodoList} key=${l.id} list=${l}
      update=${(fn, delay) => S.updateTodos(memo.id, (ls) => ls.map((x) => (x.id === l.id ? { ...x, items: fn(x.items) } : x)), delay)}
      sheet=${{ memoId: memo.id, date: key, source: 'memo' }} />`)}
    ${showAdd && (own.length > 0 || repeats.length > 0) && html`<${TodoAddButton} memoId=${memoId} date=${key} className="todo-add-list" label="add" />`}
  </div>`;
}
