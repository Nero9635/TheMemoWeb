// Notion のようなブロックエディタと、タイムライン用の表示
//
// ブロック: 段落・見出し1/2・箇条書き・番号付き・ToDo・引用・区切り線・写真
// 書き方: 行頭で「# 」「## 」「- 」「1. 」「[] 」「> 」、または「---」。空のブロックで「/」を打つと形式のメニュー
// Return: リストは次の項目、空の項目でリストを抜ける。段落と引用は中で改行(行をまたいで選べる)
// Backspace(行頭): 形式を外す → 前のブロックとつなぐ
import { html, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { Img, Linkified, ActionSheet } from './ui.js';
import { t } from './i18n.js';

const TEXT_TYPES = ['PARAGRAPH', 'HEADING1', 'HEADING2', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE'];
const LIST_TYPES = ['BULLET', 'NUMBERED', 'TODO'];

export const TYPE_LABEL = () => ({
  PARAGRAPH: t('blockText'), HEADING1: t('blockH1'), HEADING2: t('blockH2'), BULLET: t('blockBullet'),
  NUMBERED: t('blockNumbered'), TODO: t('blockTodo'), QUOTE: t('blockQuote'), DIVIDER: t('blockDivider'),
});

const TYPE_ICON = { PARAGRAPH: 'Aa', HEADING1: 'H1', HEADING2: 'H2', BULLET: '•', NUMBERED: '1.', TODO: '☐', QUOTE: '❝', DIVIDER: '—' };

/** 番号付きリストの番号(続いている間だけ数える) */
function numbers(blocks) {
  let n = 0;
  return blocks.map((b) => { n = b.type === 'NUMBERED' ? n + 1 : 0; return n; });
}

export function BlockEditor({ memo, focusRef }) {
  const [blocks, setBlocks] = useState(() => (memo.blocks.length ? memo.blocks : [S.block()]));
  const [focus, setFocus] = useState(null); // {id, pos}
  const [slash, setSlash] = useState(null); // 「/」メニューを出しているブロックの id
  const [menuFor, setMenuFor] = useState(null); // 形式メニュー(写真・区切り線を押した時)
  const refs = useRef(new Map());
  const lastFocused = useRef(null);
  const nums = numbers(blocks);

  // 外から(写真の追加・形式の変更・ワードの挿入)操作できるようにする
  const commit = (next, f = null) => {
    setBlocks(next);
    S.setMemoBlocks(memo.id, next);
    if (f) setFocus(f);
  };
  focusRef.current = {
    blocks,
    current: () => blocks.find((b) => b.id === lastFocused.current) ?? null,
    setType: (type) => {
      const cur = blocks.find((b) => b.id === lastFocused.current) ?? blocks[blocks.length - 1];
      if (!cur || cur.type === 'IMAGE') return;
      commit(blocks.map((b) => (b.id === cur.id ? retype(b, type) : b)), { id: cur.id, pos: cur.text.length });
    },
    move: (step) => {
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      const j = i + step;
      if (i < 0 || j < 0 || j >= blocks.length) return;
      const next = [...blocks];
      [next[i], next[j]] = [next[j], next[i]];
      commit(next, { id: blocks[i].id, pos: 0 });
    },
    removeCurrent: () => {
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      if (i < 0) return;
      const next = blocks.filter((_, k) => k !== i);
      commit(next.length ? next : [S.block()]);
    },
    insertImages: (names) => {
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      const at = i >= 0 ? i + 1 : blocks.length;
      const imgs = names.map((image) => S.block('IMAGE', '', { image }));
      let next = [...blocks.slice(0, at), ...imgs, ...blocks.slice(at)];
      // 写真の後ろにも書けるよう、最後なら空の段落を足す
      if (at === blocks.length) next = [...next, S.block()];
      commit(next);
    },
    insertText: (word) => {
      const cur = blocks.find((b) => b.id === lastFocused.current && TEXT_TYPES.includes(b.type))
        ?? [...blocks].reverse().find((b) => TEXT_TYPES.includes(b.type));
      if (!cur) { commit([...blocks, S.block('PARAGRAPH', word)]); return; }
      const el = refs.current.get(cur.id);
      const a = el ? el.selectionStart : cur.text.length;
      const z = el ? el.selectionEnd : cur.text.length;
      const text = cur.text.slice(0, a) + word + cur.text.slice(z);
      commit(blocks.map((b) => (b.id === cur.id ? { ...b, text } : b)), { id: cur.id, pos: a + word.length });
    },
    focusEnd: () => {
      const last = blocks[blocks.length - 1];
      if (last && TEXT_TYPES.includes(last.type)) setFocus({ id: last.id, pos: last.text.length });
      else commit([...blocks, S.block()], null);
    },
  };

  // 新しくできたブロックにカーソルを入れる
  useLayoutEffect(() => {
    if (!focus) return;
    const el = refs.current.get(focus.id);
    if (el) {
      el.focus({ preventScroll: false });
      const p = Math.min(focus.pos, el.value.length);
      el.setSelectionRange(p, p);
    }
    setFocus(null);
  }, [focus]);

  const update = (id, patch) => commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const onInput = (b, el) => {
    const text = el.value;
    const caret = el.selectionStart;
    // 空のブロックで「/」→ 形式のメニュー
    if (text === '/') { setSlash(b.id); update(b.id, { text }); return; }
    if (slash === b.id && text !== '/') setSlash(null);
    // 行頭の記号で形式を変える(今打った行だけを見る)
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    const lineEnd = text.indexOf('\n', caret) === -1 ? text.length : text.indexOf('\n', caret);
    const line = text.slice(lineStart, lineEnd);
    const typed = text.slice(lineStart, caret);
    const before = text.slice(0, Math.max(0, lineStart - 1));
    const after = text.slice(lineEnd + 1);
    const hasAfter = lineEnd < text.length;
    const i = blocks.indexOf(b);
    if (b.type === 'PARAGRAPH' || (b.type !== 'PARAGRAPH' && lineStart === 0 && typed.length <= 3)) {
      // 「---」(iPhone / iPad は「--」を「—」に変えるので「—-」も)
      if (/^(-{3}|—-)$/.test(line) && typed === line) {
        const pieces = [
          ...(lineStart > 0 ? [{ ...b, text: before }] : []),
          S.block('DIVIDER'),
          ...(hasAfter ? [S.block(b.type === 'PARAGRAPH' ? 'PARAGRAPH' : b.type, after)] : [S.block()]),
        ];
        const next = [...blocks.slice(0, i), ...pieces, ...blocks.slice(i + 1)];
        commit(next, { id: pieces[pieces.length - 1].id, pos: 0 });
        return;
      }
      // この入力の前の同じ行(1文字ずつ打っても、まとめて貼り付け・音声入力しても気づけるように)
      const oldEnd = b.text.indexOf('\n', lineStart);
      const oldLine = lineStart <= b.text.length ? b.text.slice(lineStart, oldEnd === -1 ? b.text.length : oldEnd) : '';
      for (const [re, type] of S.SHORTCUTS) {
        const m = line.match(re);
        if (!m || !/\s$|・$/.test(m[0]) || re.test(oldLine) || typed.length < m[0].length) continue;
        // 段落の途中の行なら、前の行は段落のまま、この行から新しい形式のブロックにする
        const rest = line.slice(m[0].length);
        // ブロックの先頭なら同じブロック(同じ入力欄)のまま形式だけ変える。速く打っても文字が迷子にならない
        const kind = type === 'TODO_DONE' ? 'TODO' : type;
        const extra = { checked: type === 'TODO_DONE' };
        const newBlock = lineStart === 0 ? { ...b, type: kind, text: rest, ...extra } : S.block(kind, rest, extra);
        const pieces = [
          ...(lineStart > 0 ? [{ ...b, text: before }] : []),
          newBlock,
          ...(hasAfter ? [S.block('PARAGRAPH', after)] : []),
        ];
        // カーソルは、記号を取った分だけ前の、今打っていた場所に置く
        commit([...blocks.slice(0, i), ...pieces, ...blocks.slice(i + 1)], { id: newBlock.id, pos: Math.max(0, caret - lineStart - m[0].length) });
        return;
      }
    }
    update(b.id, { text });
  };

  const onKeyDown = (b, e) => {
    const el = e.target;
    const i = blocks.indexOf(b);
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.isComposing) {
      const a = el.selectionStart;
      if (LIST_TYPES.includes(b.type) || b.type === 'HEADING1' || b.type === 'HEADING2') {
        e.preventDefault();
        if (LIST_TYPES.includes(b.type) && !b.text) {
          // 空の項目で Return → リストを抜ける
          commit(blocks.map((x) => (x.id === b.id ? { ...x, type: 'PARAGRAPH', checked: false } : x)), { id: b.id, pos: 0 });
          return;
        }
        const nb = S.block(LIST_TYPES.includes(b.type) ? b.type : 'PARAGRAPH', b.text.slice(a));
        commit([...blocks.slice(0, i), { ...b, text: b.text.slice(0, a) }, nb, ...blocks.slice(i + 1)], { id: nb.id, pos: 0 });
        return;
      }
      if (b.type === 'QUOTE' && a === b.text.length && b.text.endsWith('\n')) {
        // 引用の最後の空行で Return → 引用を抜ける
        e.preventDefault();
        const nb = S.block();
        commit([...blocks.slice(0, i), { ...b, text: b.text.slice(0, -1) }, nb, ...blocks.slice(i + 1)], { id: nb.id, pos: 0 });
      }
      return;
    }
    if (e.key === 'Backspace' && atStart) {
      if (b.type !== 'PARAGRAPH') {
        e.preventDefault();
        commit(blocks.map((x) => (x.id === b.id ? { ...x, type: 'PARAGRAPH', checked: false } : x)), { id: b.id, pos: 0 });
        return;
      }
      const prev = blocks[i - 1];
      if (!prev) return;
      e.preventDefault();
      if (prev.type === 'DIVIDER') { commit(blocks.filter((x) => x.id !== prev.id), { id: b.id, pos: 0 }); return; }
      if (prev.type === 'IMAGE') return;
      const join = prev.text.length;
      commit([...blocks.slice(0, i - 1), { ...prev, text: prev.text + b.text }, ...blocks.slice(i + 1)], { id: prev.id, pos: join });
      return;
    }
    if (e.key === 'ArrowUp' && atStart && i > 0) {
      const prev = [...blocks.slice(0, i)].reverse().find((x) => TEXT_TYPES.includes(x.type));
      if (prev) { e.preventDefault(); setFocus({ id: prev.id, pos: prev.text.length }); }
    }
    if (e.key === 'ArrowDown' && el.selectionStart === el.value.length) {
      const next = blocks.slice(i + 1).find((x) => TEXT_TYPES.includes(x.type));
      if (next) { e.preventDefault(); setFocus({ id: next.id, pos: 0 }); }
    }
    if (e.key === 'Escape' && slash) setSlash(null);
  };

  const pickSlash = (type) => {
    const id = slash;
    setSlash(null);
    if (type === 'DIVIDER') {
      // 区切り線にして、その下に書き続ける段落を用意する
      const i = blocks.findIndex((b) => b.id === id);
      const nb = S.block();
      commit([...blocks.slice(0, i), S.block('DIVIDER'), nb, ...blocks.slice(i + 1)], { id: nb.id, pos: 0 });
      return;
    }
    commit(blocks.map((b) => (b.id === id ? retype({ ...b, text: '' }, type) : b)), { id, pos: 0 });
  };

  return html`<div class="blocks">
    ${blocks.map((b, i) => html`<div key=${b.id} class=${`blk blk-${b.type.toLowerCase()} ${b.checked ? 'checked' : ''}`}>
      ${b.type === 'BULLET' && html`<span class="marker" aria-hidden="true">•</span>`}
      ${b.type === 'NUMBERED' && html`<span class="marker num" aria-hidden="true">${nums[i]}.</span>`}
      ${b.type === 'TODO' && html`<button class=${`check ${b.checked ? 'on' : ''}`} role="checkbox" aria-checked=${b.checked} aria-label="Done"
        onClick=${() => update(b.id, { checked: !b.checked })}>${b.checked && Icon.check(14)}</button>`}
      ${b.type === 'IMAGE' && html`<button class="blk-image" aria-label=${t('photo')} onClick=${() => { lastFocused.current = b.id; setMenuFor(b.id); }}>
        <${Img} name=${b.image} class="media-img" /></button>`}
      ${b.type === 'DIVIDER' && html`<button class="blk-divider" aria-label=${t('blockDivider')} onClick=${() => { lastFocused.current = b.id; setMenuFor(b.id); }}><hr /></button>`}
      ${TEXT_TYPES.includes(b.type) && html`<${BlockText} block=${b}
        placeholder=${blocks.length === 1 && !b.text ? t('whatsHappening') : b.type === 'HEADING1' ? t('blockH1') : b.type === 'HEADING2' ? t('blockH2') : ''}
        refFn=${(el) => { if (el) refs.current.set(b.id, el); else refs.current.delete(b.id); }}
        onFocus=${() => { lastFocused.current = b.id; }}
        onInput=${(el) => onInput(b, el)} onKeyDown=${(e) => onKeyDown(b, e)} />`}
      ${slash === b.id && html`<div class="slash-menu" role="menu" aria-label=${t('turnInto')}>
        ${S.BLOCK_TYPES.map((type) => html`<button role="menuitem" class="slash-item" onMouseDown=${(e) => e.preventDefault()} onClick=${() => pickSlash(type)}>
          <span class="slash-icon">${TYPE_ICON[type]}</span>${TYPE_LABEL()[type]}</button>`)}
      </div>`}
    </div>`)}
    ${menuFor && html`<${ActionSheet} onClose=${() => setMenuFor(null)} items=${[
      { label: t('moveUp'), onClick: () => focusRef.current.move(-1) },
      { label: t('moveDown'), onClick: () => focusRef.current.move(1) },
      { divider: true },
      { label: t('deleteBlock'), danger: true, onClick: () => focusRef.current.removeCurrent() },
    ]} />`}
  </div>`;
}

function retype(b, type) {
  if (type === 'DIVIDER') return { ...b, type, text: '---' };
  return { ...b, type, checked: type === 'TODO' ? b.checked : false };
}

/** ブロックの中の入力欄。中身に合わせて高さが伸びる */
function BlockText({ block, placeholder, refFn, onFocus, onInput, onKeyDown }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text, block.type]);
  return html`<textarea ref=${(el) => { ref.current = el; refFn(el); }} class="blk-input" rows="1" value=${block.text}
    placeholder=${placeholder} aria-label=${TYPE_LABEL()[block.type]} autocapitalize="sentences"
    onFocus=${onFocus} onInput=${(e) => onInput(e.target)} onKeyDown=${onKeyDown}></textarea>`;
}

/**
 * タイムラインでの本文の表示。見出し・リスト・ToDo・引用・区切り線を形のまま出す。
 * ToDo の丸はその場で押せる。写真はここでは出さない(下にまとめて出す)
 */
export function BlockView({ memo, onToggle }) {
  const blocks = memo.blocks.filter((b) => b.type !== 'IMAGE');
  const nums = numbers(blocks);
  return html`<div class="bview">
    ${blocks.map((b, i) => {
      if (b.type === 'DIVIDER') return html`<hr class="bv-divider" />`;
      if (!b.text && b.type === 'PARAGRAPH') return null;
      const text = html`<${Linkified} text=${b.text} />`;
      switch (b.type) {
        case 'HEADING1': return html`<div class="bv-h1">${text}</div>`;
        case 'HEADING2': return html`<div class="bv-h2">${text}</div>`;
        case 'BULLET': return html`<div class="bv-li"><span class="marker">•</span><span>${text}</span></div>`;
        case 'NUMBERED': return html`<div class="bv-li"><span class="marker num">${nums[i]}.</span><span>${text}</span></div>`;
        case 'TODO': return html`<div class=${`bv-li ${b.checked ? 'checked' : ''}`}>
          <button class=${`check small ${b.checked ? 'on' : ''}`} role="checkbox" aria-checked=${b.checked} aria-label="Done"
            onClick=${(e) => { e.stopPropagation(); onToggle?.(b.id); }}>${b.checked && Icon.check(12)}</button><span>${text}</span></div>`;
        case 'QUOTE': return html`<div class="bv-quote">${text}</div>`;
        default: return html`<p class="bv-p">${text}</p>`;
      }
    })}
  </div>`;
}

/** タイムラインで ToDo の丸を押した時 */
export function toggleTodo(memo, blockId) {
  const blocks = memo.blocks.map((b) => (b.id === blockId ? { ...b, checked: !b.checked } : b));
  S.updateMemo(memo.id, (m) => ({ ...m, blocks, body: S.toPlainText(blocks) }));
}

export function hasRichBlocks(memo) {
  return memo.blocks.some((b) => b.type !== 'PARAGRAPH' && b.type !== 'IMAGE');
}
