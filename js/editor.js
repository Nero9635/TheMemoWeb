// Notion のようなブロックエディタと、タイムライン用の表示
//
// ブロック: 段落・見出し1/2・箇条書き・番号付き・ToDo・引用・区切り線・写真
// 書き方: 行頭で「# 」「## 」「- 」「1. 」「[] 」「> 」、または「---」。空のブロックで「/」を打つと形式のメニュー
// Return: リストは次の項目、空の項目でリストを抜ける。段落と引用は中で改行(行をまたいで選べる)
// Backspace(行頭): 形式を外す → 前のブロックとつなぐ
import { html, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { Img, Linkified, ActionSheet } from './ui.js';
import { t } from './i18n.js';

const TEXT_TYPES = ['PARAGRAPH', 'HEADING1', 'HEADING2', 'HEADING3', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CALLOUT', 'CODE'];
const HEADINGS = ['HEADING1', 'HEADING2', 'HEADING3'];
/** 中で改行できる(行ごとに分けない)形式 */
const MULTILINE = ['PARAGRAPH', 'QUOTE', 'CALLOUT', 'CODE'];
const LIST_TYPES = ['BULLET', 'NUMBERED', 'TODO'];

export const TYPE_LABEL = () => ({
  PARAGRAPH: t('blockText'), HEADING1: t('blockH1'), HEADING2: t('blockH2'), HEADING3: t('blockH3'), BULLET: t('blockBullet'),
  NUMBERED: t('blockNumbered'), TODO: t('blockTodo'), QUOTE: t('blockQuote'), CALLOUT: t('blockCallout'), CODE: t('blockCode'),
  DIVIDER: t('blockDivider'),
});

const TYPE_ICON = { PARAGRAPH: 'Aa', HEADING1: 'H1', HEADING2: 'H2', HEADING3: 'H3', BULLET: '•', NUMBERED: '1.', TODO: '☐', QUOTE: '❝', CALLOUT: '💡', CODE: '</>', DIVIDER: '—' };

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
  // いちばん新しいブロックの並び。描き直す前に続けて操作しても、古い並びで上書きしないように
  const live = useRef(blocks);
  live.current = blocks;
  // 日本語などの変換中は形式の自動変換をしない。変換が決まってから、変換前の中身と比べて判断する
  const composing = useRef(null); // {id, text}
  const nums = numbers(blocks);

  // 外から(写真の追加・形式の変更・ワードの挿入)操作できるようにする
  const commit = (next, f = null) => {
    live.current = next;
    setBlocks(next);
    S.setMemoBlocks(memo.id, next);
    if (f) setFocus(f);
  };
  // 区切り線を入れる。カーソルの位置で分けて、上の文章も下の文章も必ず残す
  const insertDivider = (cur) => {
    const list = live.current;
    const i = list.findIndex((b) => b.id === cur.id);
    if (i < 0) return;
    if (!TEXT_TYPES.includes(cur.type)) {
      // 写真や区切り線を選んでいた時は、その下に入れる
      const nb = S.block();
      commit([...list.slice(0, i + 1), S.block('DIVIDER'), nb, ...list.slice(i + 1)], { id: nb.id, pos: 0 });
      return;
    }
    const el = refs.current.get(cur.id);
    const a = el && lastFocused.current === cur.id ? Math.min(el.selectionStart, cur.text.length) : cur.text.length;
    const before = cur.text.slice(0, a).replace(/\n$/, '');
    const after = cur.text.slice(a).replace(/^\n/, '');
    if (!before && !after) {
      // 空のブロックは区切り線に変え、下に書き続ける段落を用意する
      const nb = S.block();
      commit([...list.slice(0, i), S.block('DIVIDER'), nb, ...list.slice(i + 1)], { id: nb.id, pos: 0 });
      return;
    }
    if (!before) {
      // 行頭なら、区切り線を上に入れる
      commit([...list.slice(0, i), S.block('DIVIDER'), { ...cur, text: after }, ...list.slice(i + 1)], { id: cur.id, pos: 0 });
      return;
    }
    const rest = after ? S.block(LIST_TYPES.includes(cur.type) || cur.type === 'QUOTE' ? cur.type : 'PARAGRAPH', after) : S.block();
    commit([...list.slice(0, i), { ...cur, text: before }, S.block('DIVIDER'), rest, ...list.slice(i + 1)], { id: rest.id, pos: 0 });
  };
  focusRef.current = {
    blocks,
    current: () => live.current.find((b) => b.id === lastFocused.current) ?? null,
    currentType: () => live.current.find((b) => b.id === lastFocused.current)?.type ?? null,
    // フォーマットのパネルを閉じた時など、書いていた場所に戻る
    refocus: () => {
      const el = refs.current.get(lastFocused.current);
      if (el) { el.focus({ preventScroll: true }); centerSoon(el, true); }
    },
    blur: () => document.activeElement?.blur?.(),
    setType: (type) => {
      const list = live.current;
      const cur = list.find((b) => b.id === lastFocused.current) ?? list[list.length - 1];
      if (!cur) return;
      if (type === 'DIVIDER') { insertDivider(cur); return; }
      if (cur.type === 'IMAGE') return;
      if (cur.type === 'DIVIDER') {
        // 区切り線を文字のブロックに変える時は、「---」を残さず空のブロックにする
        commit(list.map((b) => (b.id === cur.id ? { ...b, type, text: '', checked: false } : b)), { id: cur.id, pos: 0 });
        return;
      }
      // 何行もある段落で、リストや見出しにする時は、カーソルのある行だけを変える(Apple のメモと同じ)
      const el = refs.current.get(cur.id);
      const caret = el && lastFocused.current === cur.id ? Math.min(el.selectionStart, cur.text.length) : cur.text.length;
      if (MULTILINE.includes(cur.type) && cur.text.includes('\n') && !MULTILINE.includes(type)) {
        const i = list.findIndex((b) => b.id === cur.id);
        const ls = cur.text.lastIndexOf('\n', caret - 1) + 1;
        const le = cur.text.indexOf('\n', caret) === -1 ? cur.text.length : cur.text.indexOf('\n', caret);
        const before = cur.text.slice(0, Math.max(0, ls - 1));
        const after = cur.text.slice(le + 1);
        const line = { ...cur, id: ls === 0 ? cur.id : S.block().id, type, text: cur.text.slice(ls, le), checked: false };
        const pieces = [
          ...(ls > 0 ? [{ ...cur, text: before }] : []),
          line,
          ...(le < cur.text.length ? [S.block(cur.type, after)] : []),
        ];
        commit([...list.slice(0, i), ...pieces, ...list.slice(i + 1)], { id: line.id, pos: caret - ls });
        return;
      }
      commit(list.map((b) => (b.id === cur.id ? retype(b, type) : b)), { id: cur.id, pos: caret });
    },
    // 今のブロックを複製して、すぐ下に置く
    duplicate: () => {
      const list = live.current;
      const i = list.findIndex((b) => b.id === lastFocused.current);
      if (i < 0) return;
      const copy = { ...list[i], id: S.block().id };
      commit([...list.slice(0, i + 1), copy, ...list.slice(i + 1)], TEXT_TYPES.includes(copy.type) ? { id: copy.id, pos: copy.text.length } : null);
    },
    move: (step) => {
      const blocks = live.current;
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      const j = i + step;
      if (i < 0 || j < 0 || j >= blocks.length) return;
      const next = [...blocks];
      [next[i], next[j]] = [next[j], next[i]];
      commit(next, { id: blocks[i].id, pos: 0 });
    },
    removeCurrent: () => {
      const blocks = live.current;
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      if (i < 0) return;
      const next = blocks.filter((_, k) => k !== i);
      commit(next.length ? next : [S.block()]);
    },
    insertImages: (names) => {
      const blocks = live.current;
      const i = blocks.findIndex((b) => b.id === lastFocused.current);
      const at = i >= 0 ? i + 1 : blocks.length;
      const imgs = names.map((image) => S.block('IMAGE', '', { image }));
      let next = [...blocks.slice(0, at), ...imgs, ...blocks.slice(at)];
      // 写真の後ろにも書けるよう、最後なら空の段落を足す
      if (at === blocks.length) next = [...next, S.block()];
      commit(next);
    },
    insertText: (word) => {
      const blocks = live.current;
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
      const blocks = live.current;
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
      lastFocused.current = focus.id;
      el.focus({ preventScroll: true });
      const p = Math.min(focus.pos, el.value.length);
      el.setSelectionRange(p, p);
      centerSoon(el, true);
    }
    setFocus(null);
  }, [focus]);

  // 書いている行を、いつも画面(キーボードの上)の真ん中あたりに保つ
  const root = useRef();
  const [typing, setTyping] = useState(false);
  const blurTimer = useRef(null);
  useEffect(() => {
    let last = 0;
    const onSel = () => {
      const el = document.activeElement;
      if (!el?.classList?.contains('blk-input') || !root.current?.contains(el)) return;
      cancelAnimationFrame(last);
      last = requestAnimationFrame(() => centerCaret(el, false));
    };
    const onResize = () => {
      const el = document.activeElement;
      if (el?.classList?.contains('blk-input') && root.current?.contains(el)) setTimeout(() => centerCaret(el, true), 60);
    };
    document.addEventListener('selectionchange', onSel);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);

  const update = (id, patch) => commit(live.current.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const onInput = (b0, el, isComposing = false) => {
    const blocks = live.current;
    const cur = blocks.find((x) => x.id === b0.id);
    if (!cur) return;
    if (isComposing) {
      // 変換中: 文字だけ保存して、変換前の中身を覚えておく
      if (composing.current?.id !== cur.id) composing.current = { id: cur.id, text: cur.text };
      update(cur.id, { text: el.value });
      return;
    }
    // 変換が決まった直後は、変換前の中身と比べる
    let b = cur;
    if (composing.current?.id === cur.id) { b = { ...cur, text: composing.current.text }; composing.current = null; }
    const text = el.value;
    const caret = el.selectionStart;
    centerSoon(el, true);
    // コードの中では記号をそのまま書く
    if (b.type === 'CODE') { update(b.id, { text }); return; }
    // 空のブロックで「/」→ 形式のメニュー
    if (text === '/' || text === '／') { setSlash(b.id); update(b.id, { text }); return; }
    if (slash === b.id && text !== '/') setSlash(null);
    // 行頭の記号で形式を変える(今打った行だけを見る)
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    const lineEnd = text.indexOf('\n', caret) === -1 ? text.length : text.indexOf('\n', caret);
    const line = text.slice(lineStart, lineEnd);
    const typed = text.slice(lineStart, caret);
    const before = text.slice(0, Math.max(0, lineStart - 1));
    const after = text.slice(lineEnd + 1);
    const hasAfter = lineEnd < text.length;
    const i = blocks.findIndex((x) => x.id === b.id);
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

  // 変換が決まった時(Safari は決まった後に input が来ないことがあるので、ここでも確かめる)
  const onCompositionEnd = (b) => {
    setTimeout(() => {
      if (composing.current?.id !== b.id) return;
      const el = refs.current.get(b.id);
      if (el) onInput(b, el, false);
      else composing.current = null;
    }, 0);
  };

  const onKeyDown = (b0, e) => {
    const el = e.target;
    const blocks = live.current;
    const b = blocks.find((x) => x.id === b0.id) ?? b0;
    const i = blocks.findIndex((x) => x.id === b.id);
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    // 変換を決める Return(Safari では keyCode 229)では何もしない
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      if (composing.current) return;
      const a = el.selectionStart;
      if (LIST_TYPES.includes(b.type) || HEADINGS.includes(b.type)) {
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
      if (['QUOTE', 'CALLOUT', 'CODE'].includes(b.type) && a === b.text.length && b.text.endsWith('\n')) {
        // 引用・コールアウト・コードの最後の空行で Return → 抜ける
        e.preventDefault();
        const nb = S.block();
        commit([...blocks.slice(0, i), { ...b, text: b.text.slice(0, -1) }, nb, ...blocks.slice(i + 1)], { id: nb.id, pos: 0 });
      }
      return;
    }
    if (e.key === 'Tab' && b.type === 'CODE') {
      e.preventDefault();
      const a = el.selectionStart;
      const text = b.text.slice(0, a) + '  ' + b.text.slice(el.selectionEnd);
      commit(blocks.map((x) => (x.id === b.id ? { ...x, text } : x)), { id: b.id, pos: a + 2 });
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
      if (prev.type === 'IMAGE') {
        // 写真の下の空の段落は消して、写真の上の文章へ
        if (b.text) return;
        const above = [...blocks.slice(0, i)].reverse().find((x) => TEXT_TYPES.includes(x.type));
        const next = blocks.filter((x) => x.id !== b.id);
        if (!next.length || next[next.length - 1].type === 'IMAGE') return; // 写真の後ろに書ける場所を残す
        commit(next, above ? { id: above.id, pos: above.text.length } : null);
        return;
      }
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
    const list = live.current;
    const cur = list.find((b) => b.id === id);
    if (!cur) return;
    // 「/」だけを消してから形式を変える(ほかの文字は消さない)
    const text = cur.text === '/' || cur.text === '／' ? '' : cur.text;
    if (type === 'DIVIDER') {
      if (text) { insertDivider({ ...cur, text }); return; }
      const i = list.findIndex((b) => b.id === id);
      const nb = S.block();
      commit([...list.slice(0, i), S.block('DIVIDER'), nb, ...list.slice(i + 1)], { id: nb.id, pos: 0 });
      return;
    }
    commit(list.map((b) => (b.id === id ? retype({ ...b, text }, type) : b)), { id, pos: text.length });
  };

  return html`<div class="blocks" ref=${root}
    onfocusin=${() => { clearTimeout(blurTimer.current); setTyping(true); }}
    onfocusout=${() => { clearTimeout(blurTimer.current); blurTimer.current = setTimeout(() => setTyping(root.current?.contains(document.activeElement) ?? false), 150); }}>
    ${blocks.map((b, i) => html`<div key=${b.id} class=${`blk blk-${b.type.toLowerCase()} ${b.checked ? 'checked' : ''}`}>
      ${b.type === 'BULLET' && html`<span class="marker" aria-hidden="true">•</span>`}
      ${b.type === 'NUMBERED' && html`<span class="marker num" aria-hidden="true">${nums[i]}.</span>`}
      ${b.type === 'CALLOUT' && html`<span class="callout-icon" aria-hidden="true">💡</span>`}
      ${b.type === 'TODO' && html`<button class=${`check ${b.checked ? 'on' : ''}`} role="checkbox" aria-checked=${b.checked} aria-label="Done"
        onClick=${() => update(b.id, { checked: !b.checked })}>${b.checked && Icon.check(14)}</button>`}
      ${b.type === 'IMAGE' && html`<button class="blk-image" aria-label=${t('photo')} onClick=${() => { lastFocused.current = b.id; setMenuFor(b.id); }}>
        <${Img} name=${b.image} class="media-img" /></button>`}
      ${b.type === 'DIVIDER' && html`<button class="blk-divider" aria-label=${t('blockDivider')} onClick=${() => { lastFocused.current = b.id; setMenuFor(b.id); }}><hr /></button>`}
      ${TEXT_TYPES.includes(b.type) && html`<${BlockText} block=${b}
        placeholder=${blocks.length === 1 && !b.text ? t('whatsHappening') : HEADINGS.includes(b.type) || b.type === 'CALLOUT' || b.type === 'CODE' ? TYPE_LABEL()[b.type] : ''}
        refFn=${(el) => { if (el) refs.current.set(b.id, el); else refs.current.delete(b.id); }}
        onFocus=${() => { lastFocused.current = b.id; }}
        onInput=${(el, c) => onInput(b, el, c)} onKeyDown=${(e) => onKeyDown(b, e)}
        onCompositionEnd=${() => onCompositionEnd(b)} />`}
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
    ${typing && html`<div class="type-space" aria-hidden="true"></div>`}
  </div>`;
}

/** 入力欄の中のカーソルの高さ(入力欄の上から何 px か)。同じ形の見えない箱で測る */
function caretOffset(el) {
  const cs = getComputedStyle(el);
  const m = document.createElement('div');
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'textTransform', 'wordBreak']) m.style[k] = cs[k];
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', width: `${el.clientWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', boxSizing: 'border-box' });
  m.textContent = el.value.slice(0, el.selectionStart);
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  m.appendChild(mark);
  document.body.appendChild(m);
  const y = mark.offsetTop + mark.offsetHeight / 2;
  m.remove();
  return y;
}

/**
 * カーソルの行を、見えている範囲(キーボードの上)の真ん中あたりへ。
 * force: 打っている時はいつも真ん中へ。カーソルを動かしただけの時は、端に寄った時だけ動かす
 */
function centerCaret(el, force) {
  const sc = el.closest('.scroll');
  if (!sc || document.activeElement !== el) return;
  const vv = window.visualViewport;
  const r = sc.getBoundingClientRect();
  // 実際に見えている下端(キーボードの上端)。iPad はキーボードで画面をずらすことがあるので offsetTop も足す
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const tools = sc.querySelector('.tools-sticky')?.offsetHeight ?? 0;
  const bottom = Math.min(r.bottom, viewBottom) - r.top - tools; // 道具のすぐ上(スクロールの箱の中の位置)
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 30;
  const y = el.getBoundingClientRect().top + caretOffset(el) - el.scrollTop - r.top; // カーソルの行の真ん中
  // 書いている行と道具の間は 2 行分だけ空ける
  const target = bottom - lh * 2.5;
  // 文章の最後の方を書いている時は、上にずれすぎていても下ろして、いつも同じ位置に保つ
  // (iPad が自分で一番下までスクロールしてしまっても、ここで戻す)
  const blocks = el.closest('.blocks');
  const all = blocks ? blocks.querySelectorAll(':scope > .blk') : [];
  const lastBlk = all.length ? all[all.length - 1] : null;
  const docEnd = lastBlk ? lastBlk.getBoundingClientRect().bottom - r.top : y;
  const nearEnd = docEnd - y < lh * 3;
  if (y > target + 2 || (force && nearEnd && y < target - 2)) {
    sc.scrollTop += y - target;
    return;
  }
  // 上に隠れた時だけ下ろす
  if (y < lh * 1.5) sc.scrollTop += y - lh * 2;
}

let centerTimer = 0;
let lateTimer = 0;
function centerSoon(el, force) {
  cancelAnimationFrame(centerTimer);
  clearTimeout(lateTimer);
  centerTimer = requestAnimationFrame(() => requestAnimationFrame(() => centerCaret(el, force)));
  // iPad は入力の少しあとに自分でスクロールすることがあるので、もう一度合わせる
  lateTimer = setTimeout(() => centerCaret(el, force), 180);
}

function retype(b, type) {
  if (type === 'DIVIDER') return { ...b, type, text: '---' };
  return { ...b, type, checked: type === 'TODO' ? b.checked : false };
}

/** ブロックの中の入力欄。中身に合わせて高さが伸びる */
function BlockText({ block, placeholder, refFn, onFocus, onInput, onKeyDown, onCompositionEnd }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    el.scrollTop = 0; // 伸びる前に入力欄の中がずれていたら戻す
  }, [block.text, block.type]);
  return html`<textarea ref=${(el) => { ref.current = el; refFn(el); }} class="blk-input" rows="1" value=${block.text}
    placeholder=${placeholder} aria-label=${TYPE_LABEL()[block.type]} autocapitalize="sentences"
    onFocus=${onFocus} onInput=${(e) => onInput(e.target, !!e.isComposing)} onKeyDown=${onKeyDown}
    oncompositionend=${onCompositionEnd}></textarea>`;
}

/**
 * 閲覧モードの本文。編集モードとまったく同じ形(同じ部品・文字の大きさ・行間・記号)で、書き換えだけできない。
 * ToDo の丸は押せる
 */
export function BlockStatic({ memo, onToggle }) {
  const blocks = memo.blocks.length ? memo.blocks : [S.block()];
  const nums = numbers(blocks);
  return html`<div class="blocks static">
    ${blocks.map((b, i) => html`<div key=${b.id} class=${`blk blk-${b.type.toLowerCase()} ${b.checked ? 'checked' : ''}`}>
      ${b.type === 'BULLET' && html`<span class="marker" aria-hidden="true">•</span>`}
      ${b.type === 'NUMBERED' && html`<span class="marker num" aria-hidden="true">${nums[i]}.</span>`}
      ${b.type === 'CALLOUT' && html`<span class="callout-icon" aria-hidden="true">💡</span>`}
      ${b.type === 'TODO' && html`<button class=${`check ${b.checked ? 'on' : ''}`} role="checkbox" aria-checked=${b.checked} aria-label="Done"
        onClick=${(e) => { e.stopPropagation(); onToggle?.(b.id); }}>${b.checked && Icon.check(14)}</button>`}
      ${b.type === 'IMAGE' && html`<div class="blk-image"><${Img} name=${b.image} class="media-img" /></div>`}
      ${b.type === 'DIVIDER' && html`<div class="blk-divider"><hr /></div>`}
      ${TEXT_TYPES.includes(b.type) && html`<div class="blk-input blk-text">${b.text ? html`<${Linkified} text=${b.text} />` : '​'}</div>`}
    </div>`)}
  </div>`;
}

/**
 * タイムラインでの本文の表示。見出し・リスト・ToDo・引用・区切り線を形のまま出す。
 * ToDo の丸はその場で押せる。写真はここでは出さない(下にまとめて出す)
 */
export function BlockView({ memo, onToggle, images = false }) {
  const blocks = images ? memo.blocks : memo.blocks.filter((b) => b.type !== 'IMAGE');
  const nums = numbers(blocks);
  return html`<div class="bview">
    ${blocks.map((b, i) => {
      if (b.type === 'DIVIDER') return html`<hr class="bv-divider" />`;
      if (b.type === 'IMAGE') return html`<${Img} name=${b.image} class="media-img bv-img" />`;
      if (!b.text && b.type === 'PARAGRAPH') return null;
      const text = html`<${Linkified} text=${b.text} />`;
      switch (b.type) {
        case 'HEADING1': return html`<div class="bv-h1">${text}</div>`;
        case 'HEADING2': return html`<div class="bv-h2">${text}</div>`;
        case 'HEADING3': return html`<div class="bv-h3">${text}</div>`;
        case 'CALLOUT': return html`<div class="bv-callout"><span class="callout-icon" aria-hidden="true">💡</span><span>${text}</span></div>`;
        case 'CODE': return html`<pre class="bv-code">${b.text}</pre>`;
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
