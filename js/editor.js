// Notion のようなブロックエディタと、タイムライン用の表示
//
// 文書全体が「ひとつの書ける面」(contenteditable)。各行(ブロック)はその中の要素で、
// 文字を打つ・消すのはブラウザにまかせ、Return・行頭の Backspace・行頭の記号だけを
// その場(同じフレーム)で組み替える。カーソルが別の入力欄へ移らないので、
// キーボードの候補やスクロールがリセットされず、行の追加や削除がなめらかになる(Notion と同じ考え方)。
//
// ブロック: 段落・見出し1/2/3・箇条書き・番号付き・ToDo・引用・コールアウト・コード・区切り線・写真
// 書き方: 行頭で「# 」「## 」「### 」「- 」「1. 」「[] 」「> 」「! 」「``` 」、または「---」。空の行で「/」を打つとメニュー
// Return: 次の行(リストは同じ形式、空の項目ならリストを抜ける)。Shift + Return: 行の中で改行。コードの中は改行
// Backspace(行頭): 形式を外す → 前の行とつなぐ
import { html, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { Img, Linkified, ActionSheet } from './ui.js';
import { t } from './i18n.js';
import { splitLinks } from './util.js';

const TEXT_TYPES = ['PARAGRAPH', 'HEADING1', 'HEADING2', 'HEADING3', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CALLOUT', 'CODE'];
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

// ---------- ブロックの要素を作る・読む ----------

/** ブロックの文字を要素に入れる。改行は <br>。空の行や最後の改行にも高さが出るよう、最後に <br> を1つ足す */
function fillText(el, text, links) {
  el.textContent = '';
  text.split('\n').forEach((line, i) => {
    if (i) el.appendChild(document.createElement('br'));
    if (!line) return;
    if (links) appendLinked(el, line);
    else el.appendChild(document.createTextNode(line));
  });
  if (!text || text.endsWith('\n')) el.appendChild(document.createElement('br'));
}

/** 閲覧モード: URL と #ハッシュタグ を押せるようにする */
function appendLinked(el, line) {
  for (const part of splitLinks(line)) {
    if (part.href) {
      const a = document.createElement('a');
      a.href = part.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = part.text;
      el.appendChild(a);
      continue;
    }
    let last = 0;
    for (const m of part.text.matchAll(S.HASHTAG_RE)) {
      const start = m.index + m[1].length;
      if (start > last) el.appendChild(document.createTextNode(part.text.slice(last, start)));
      const b = document.createElement('span');
      b.className = 'hashtag';
      b.textContent = `#${m[2]}`;
      b.dataset.tag = m[2];
      el.appendChild(b);
      last = start + 1 + m[2].length;
    }
    if (last < part.text.length) el.appendChild(document.createTextNode(part.text.slice(last)));
  }
}

function makeBlock(b, links = false) {
  const el = document.createElement('div');
  el.className = `blk blk-${b.type.toLowerCase()}${b.checked ? ' checked' : ''}`;
  el.dataset.id = b.id;
  el.dataset.type = b.type;
  if (b.comment) el.dataset.comment = b.comment;
  if (b.type === 'IMAGE') {
    el.contentEditable = 'false';
    el.dataset.image = b.image;
    const img = document.createElement('img');
    img.className = 'media-img';
    img.alt = '';
    S.imageUrl(b.image).then((u) => { if (u) img.src = u; });
    el.appendChild(img);
  } else if (b.type === 'DIVIDER') {
    el.contentEditable = 'false';
    el.appendChild(document.createElement('hr'));
  } else {
    fillText(el, b.text, links);
  }
  return el;
}

/** 要素の中の文字。<br> と、ブラウザが中に作った行(div / p)は改行にする。最後の高さ用の <br> は数えない */
function textOf(el) {
  let out = '';
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += n.data;
      else if (n.nodeName === 'BR') out += '\n';
      else if (n.nodeType === 1) {
        const block = /^(DIV|P|LI)$/.test(n.nodeName);
        if (block && out && !out.endsWith('\n')) out += '\n';
        walk(n);
        if (block && !out.endsWith('\n')) out += '\n';
      }
    }
  };
  walk(el);
  return out.endsWith('\n') ? out.slice(0, -1) : out;
}

function readBlock(el) {
  const type = el.dataset.type || 'PARAGRAPH';
  return {
    id: el.dataset.id,
    type,
    text: type === 'DIVIDER' ? '---' : type === 'IMAGE' ? '' : textOf(el),
    checked: el.classList.contains('checked'),
    image: el.dataset.image || '',
    comment: el.dataset.comment || '',
  };
}

// ---------- カーソル(文字の位置で扱う。<br> は1文字) ----------

/** ブロックの中の、ノード + オフセット の位置を、文字数に直す */
function offsetIn(blockEl, node, offset) {
  const r = document.createRange();
  r.selectNodeContents(blockEl);
  r.setEnd(node, offset);
  const frag = r.cloneContents();
  const tmp = document.createElement('div');
  tmp.appendChild(frag);
  let n = 0;
  const walk = (x) => { for (const c of x.childNodes) { if (c.nodeType === 3) n += c.data.length; else if (c.nodeName === 'BR') n += 1; else walk(c); } };
  walk(tmp);
  return n;
}

/** 文字数の位置にカーソルを置く */
function placeCaret(blockEl, pos) {
  const sel = window.getSelection();
  const r = document.createRange();
  let left = pos;
  let done = false;
  const walk = (x) => {
    for (const c of x.childNodes) {
      if (done) return;
      if (c.nodeType === 3) {
        if (left <= c.data.length) { r.setStart(c, left); done = true; return; }
        left -= c.data.length;
      } else if (c.nodeName === 'BR') {
        if (left === 0) { r.setStartBefore(c); done = true; return; }
        left -= 1;
      } else walk(c);
    }
  };
  walk(blockEl);
  if (!done) {
    // 最後: 高さ用の <br> があればその前に
    const last = blockEl.lastChild;
    if (last && last.nodeName === 'BR') r.setStartBefore(last);
    else r.setStart(blockEl, blockEl.childNodes.length);
  }
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ---------- エディタ ----------

export function BlockEditor({ memo, focusRef }) {
  const host = useRef();
  const rootRef = useRef(null);
  const lastCaret = useRef(null); // {id, pos}
  const [slash, setSlash] = useState(null); // {id, top, left}
  const [menuFor, setMenuFor] = useState(null); // 写真・区切り線を押した時のメニュー

  const root = () => rootRef.current;
  const blockOf = (node) => {
    let n = node;
    while (n && n !== root()) {
      if (n.nodeType === 1 && n.parentNode === root()) return n;
      n = n.parentNode;
    }
    return null;
  };
  const byId = (id) => root()?.querySelector(`:scope > [data-id="${CSS.escape(id)}"]`);
  const caret = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount || !root()?.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    const el = blockOf(r.startContainer);
    if (!el) return null;
    return { el, pos: offsetIn(el, r.startContainer, r.startOffset), collapsed: r.collapsed };
  };
  const currentEl = () => caret()?.el ?? (lastCaret.current && byId(lastCaret.current.id)) ?? null;

  /** 文書の並びを読んで保存する */
  const save = () => {
    const el = root();
    if (!el) return;
    const blocks = [...el.children].map(readBlock);
    const blank = blocks.length === 1 && blocks[0].type === 'PARAGRAPH' && !blocks[0].text;
    el.classList.toggle('blank', blank);
    S.setMemoBlocks(memo.id, blocks);
  };

  /** 書ける面の中を、いつも「ブロックの並び」に保つ(ブラウザが直接文字や <br> を置いた時など) */
  const normalize = () => {
    const el = root();
    const c = caret();
    const keep = c ? { el: c.el, pos: c.pos } : null;
    let changed = false;
    const seen = new Set();
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 1 && n.classList.contains('blk') && n.dataset.id) {
        if (seen.has(n.dataset.id)) { n.dataset.id = S.block().id; changed = true; }
        seen.add(n.dataset.id);
        continue;
      }
      if (n.nodeType === 3 && !n.data.trim() && n.data !== ' ') { n.remove(); continue; }
      // 迷子の文字・<br>・ブラウザが作った div を段落にする
      const text = n.nodeType === 3 ? n.data : n.nodeName === 'BR' ? '' : textOf(n);
      const nb = makeBlock(S.block('PARAGRAPH', text));
      el.replaceChild(nb, n);
      seen.add(nb.dataset.id);
      changed = true;
      if (keep && (keep.el === n || n.contains?.(keep.el))) { keep.el = nb; }
    }
    // ブラウザが行の中に作った飾り(span・font など)は外して、文字だけに戻す
    for (const blk of el.children) {
      if (!TEXT_TYPES.includes(blk.dataset.type)) continue;
      if (![...blk.childNodes].some((n) => n.nodeType === 1 && n.nodeName !== 'BR')) continue;
      const isCaret = keep && keep.el === blk;
      fillText(blk, textOf(blk), false);
      if (isCaret) placeCaret(blk, Math.min(keep.pos, textOf(blk).length));
    }
    if (!el.children.length) {
      el.appendChild(makeBlock(S.block()));
      placeCaret(el.firstChild, 0);
      return true;
    }
    if (changed && keep && el.contains(keep.el)) placeCaret(keep.el, Math.min(keep.pos, textOf(keep.el).length));
    return changed;
  };

  /** ブロックを新しいものに入れ替えて、カーソルを置く(同じ面の中なので、キーボードはそのまま) */
  const replace = (oldEls, blocks, focus) => {
    const el = root();
    const first = oldEls[0];
    const made = blocks.map((b) => makeBlock(b));
    made.forEach((m) => el.insertBefore(m, first));
    oldEls.forEach((o) => o.remove());
    if (focus) {
      const target = made.find((m) => m.dataset.id === focus.id) ?? byId(focus.id);
      if (target) placeCaret(target, focus.pos);
    }
    save();
    keepCaretVisible();
  };

  /** カーソルが道具やキーボードに隠れた時だけ、隠れない所まで動かす(それ以外は画面を動かさない) */
  const keepCaretVisible = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const sc = root()?.closest('.scroll');
    if (!sc) return;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.height) rect = blockOf(sel.anchorNode)?.getBoundingClientRect() ?? rect;
    const box = sc.getBoundingClientRect();
    const margin = 12;
    if (rect.bottom > box.bottom - margin) sc.scrollTop += rect.bottom - (box.bottom - margin);
    else if (rect.top < box.top + margin) sc.scrollTop -= (box.top + margin) - rect.top;
  };

  // ---- はじめに一度だけ、書ける面を作る(Preact はこの中を書き換えない) ----
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'ce';
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-multiline', 'true');
    el.setAttribute('autocapitalize', 'sentences');
    el.dataset.placeholder = t('whatsHappening');
    const blocks = memo.blocks.length ? memo.blocks : [S.block()];
    blocks.forEach((b) => el.appendChild(makeBlock(b)));
    el.classList.toggle('blank', blocks.length === 1 && blocks[0].type === 'PARAGRAPH' && !blocks[0].text);
    host.current.appendChild(el);
    rootRef.current = el;
    return () => el.remove();
  }, []);

  // ---- 入力の前: Return・行頭の Backspace・コードの改行を、その場で組み替える ----
  useEffect(() => {
    const el = root();
    const onBeforeInput = (e) => {
      if (e.isComposing) return;
      const c = caret();
      if (!c) return;
      const b = readBlock(c.el);
      if (e.inputType === 'insertParagraph') {
        e.preventDefault();
        if (!c.collapsed) { document.execCommand('delete'); }
        const cc = caret();
        if (!cc) return;
        const cur = readBlock(cc.el);
        if (cur.type === 'CODE') { document.execCommand('insertLineBreak'); return; }
        // 空のリストの項目で Return → リストを抜ける
        if (LIST_TYPES.includes(cur.type) && !cur.text) {
          replace([cc.el], [{ ...cur, type: 'PARAGRAPH', checked: false }], { id: cur.id, pos: 0 });
          return;
        }
        const before = cur.text.slice(0, cc.pos);
        const after = cur.text.slice(cc.pos);
        const nextType = LIST_TYPES.includes(cur.type) ? cur.type : 'PARAGRAPH';
        if (!before && after) {
          // 行頭で Return: 上に空の行を足し、今の行はそのまま
          const empty = S.block(nextType);
          replace([cc.el], [empty, cur], { id: cur.id, pos: 0 });
          return;
        }
        const nb = S.block(nextType, after);
        replace([cc.el], [{ ...cur, text: before }, nb], { id: nb.id, pos: 0 });
        return;
      }
      if (e.inputType === 'deleteContentBackward' && c.collapsed && c.pos === 0) {
        // 行頭の Backspace: まず形式を外す
        if (b.type !== 'PARAGRAPH' && TEXT_TYPES.includes(b.type)) {
          e.preventDefault();
          replace([c.el], [{ ...b, type: 'PARAGRAPH', checked: false }], { id: b.id, pos: 0 });
          return;
        }
        const prev = c.el.previousElementSibling;
        if (!prev) { e.preventDefault(); return; }
        const p = readBlock(prev);
        e.preventDefault();
        if (p.type === 'DIVIDER') { prev.remove(); placeCaret(c.el, 0); save(); return; }
        if (p.type === 'IMAGE') {
          // 写真の下の空の行は消して、写真の上の行の最後へ
          if (b.text) return;
          let up = prev.previousElementSibling;
          while (up && !TEXT_TYPES.includes(up.dataset.type)) up = up.previousElementSibling;
          if (!c.el.nextElementSibling) return; // 写真の後ろに書ける行を残す
          c.el.remove();
          if (up) placeCaret(up, textOf(up).length);
          save();
          return;
        }
        // 前の行とつなぐ
        replace([prev, c.el], [{ ...p, text: p.text + b.text }], { id: p.id, pos: p.text.length });
      }
    };
    const onInput = (e) => {
      if (e.isComposing) { save(); return; }
      normalize();
      if (!shortcut()) save();
    };
    const onCompositionEnd = () => setTimeout(() => { normalize(); if (!shortcut()) save(); }, 0);
    // 行頭の記号で形式を変える・「---」で区切り線・空の行の「/」でメニュー
    const shortcut = () => {
      const c = caret();
      if (!c || !c.collapsed) return false;
      const b = readBlock(c.el);
      if (b.type === 'CODE' || !TEXT_TYPES.includes(b.type)) return false;
      if ((b.text === '/' || b.text === '／') && c.pos === 1) {
        const r = c.el.getBoundingClientRect();
        const hr = host.current.getBoundingClientRect();
        setSlash({ id: b.id, top: r.bottom - hr.top + 4, left: r.left - hr.left });
        return false;
      }
      setSlash(null);
      if (/^(-{3}|—-)$/.test(b.text) && c.pos === b.text.length) {
        const nb = S.block();
        replace([c.el], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 });
        return true;
      }
      for (const [re, type] of S.SHORTCUTS) {
        const m = b.text.match(re);
        if (!m || !/\s$|・$/.test(m[0]) || c.pos !== m[0].length) continue;
        const kind = type === 'TODO_DONE' ? 'TODO' : type;
        replace([c.el], [{ ...b, type: kind, checked: type === 'TODO_DONE', text: b.text.slice(m[0].length) }], { id: b.id, pos: 0 });
        return true;
      }
      return false;
    };
    const onKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const c = caret();
      if (!c) return;
      if (e.key === 'Tab' && c.el.dataset.type === 'CODE') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
      if (e.key === 'Escape') setSlash(null);
    };
    // ToDo の丸・写真・区切り線を押した時
    const onPointerDown = (e) => {
      const blk = blockOf(e.target);
      if (!blk) return;
      if (blk.dataset.type === 'TODO') {
        const r = blk.getBoundingClientRect();
        if (e.clientX - r.left < 30) {
          e.preventDefault();
          blk.classList.toggle('checked');
          save();
        }
      } else if (blk.dataset.type === 'IMAGE' || blk.dataset.type === 'DIVIDER') {
        e.preventDefault();
        lastCaret.current = { id: blk.dataset.id, pos: 0 };
        setMenuFor(blk.dataset.id);
      }
    };
    const onSelection = () => {
      const c = caret();
      if (c) lastCaret.current = { id: c.el.dataset.id, pos: c.pos };
    };
    // キーボードの高さが変わった時(候補の列が出る・消えるなど): 書いている行とキーボードの距離を変えない
    const vv = window.visualViewport;
    let lastH = vv?.height ?? 0;
    const onResize = () => {
      const h = vv.height;
      const d = lastH - h;
      lastH = h;
      if (!caret() || Math.abs(d) > 200) { if (caret()) keepCaretVisible(); return; } // キーボードが出る・閉じる時は隠れないようにだけ
      const sc = el.closest('.scroll');
      if (sc && d) sc.scrollTop += d;
    };
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('input', onInput);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('selectionchange', onSelection);
    vv?.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('selectionchange', onSelection);
      vv?.removeEventListener('resize', onResize);
    };
  }, []);

  // 区切り線を入れる。カーソルの位置で分けて、上の文章も下の文章も必ず残す
  const insertDivider = (el, pos) => {
    const b = readBlock(el);
    if (!TEXT_TYPES.includes(b.type)) {
      const nb = S.block();
      const holder = document.createElement('div');
      el.after(holder);
      replace([holder], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 });
      return;
    }
    const before = b.text.slice(0, pos).replace(/\n$/, '');
    const after = b.text.slice(pos).replace(/^\n/, '');
    if (!before && !after) { const nb = S.block(); replace([el], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 }); return; }
    if (!before) { replace([el], [S.block('DIVIDER'), { ...b, text: after }], { id: b.id, pos: 0 }); return; }
    const rest = after ? S.block(LIST_TYPES.includes(b.type) || b.type === 'QUOTE' ? b.type : 'PARAGRAPH', after) : S.block();
    replace([el], [{ ...b, text: before }, S.block('DIVIDER'), rest], { id: rest.id, pos: 0 });
  };

  const focusRoot = () => { root()?.focus({ preventScroll: true }); };

  // 外から(道具・フォーマット・写真・ワード)操作する
  focusRef.current = {
    currentType: () => currentEl()?.dataset.type ?? null,
    refocus: () => {
      const lc = lastCaret.current;
      const el = lc && byId(lc.id);
      focusRoot();
      if (el && TEXT_TYPES.includes(el.dataset.type)) placeCaret(el, Math.min(lc.pos, textOf(el).length));
      keepCaretVisible();
    },
    blur: () => { root()?.blur(); window.getSelection()?.removeAllRanges(); },
    setType: (type) => {
      const el = currentEl() ?? root()?.lastElementChild;
      if (!el) return;
      const c = caret();
      const pos = c && c.el === el ? c.pos : (lastCaret.current?.id === el.dataset.id ? lastCaret.current.pos : textOf(el).length);
      if (type === 'DIVIDER') { focusRoot(); insertDivider(el, pos); return; }
      const b = readBlock(el);
      if (b.type === 'IMAGE') return;
      if (b.type === 'DIVIDER') { focusRoot(); replace([el], [{ ...b, type, text: '', checked: false }], { id: b.id, pos: 0 }); return; }
      focusRoot();
      // 何行もある行で、リストや見出しにする時は、カーソルのある行だけを変える(Apple のメモと同じ)
      if (b.text.includes('\n') && type !== b.type && !['PARAGRAPH', 'QUOTE', 'CALLOUT', 'CODE'].includes(type)) {
        const ls = b.text.lastIndexOf('\n', pos - 1) + 1;
        const le = b.text.indexOf('\n', pos) === -1 ? b.text.length : b.text.indexOf('\n', pos);
        const line = { ...b, id: ls === 0 ? b.id : S.block().id, type, text: b.text.slice(ls, le), checked: false };
        const pieces = [
          ...(ls > 0 ? [{ ...b, text: b.text.slice(0, ls - 1) }] : []),
          line,
          ...(le < b.text.length ? [S.block(b.type, b.text.slice(le + 1))] : []),
        ];
        replace([el], pieces, { id: line.id, pos: pos - ls });
        return;
      }
      replace([el], [{ ...b, type, checked: type === 'TODO' ? b.checked : false }], { id: b.id, pos: Math.min(pos, b.text.length) });
    },
    move: (step) => {
      const el = currentEl();
      if (!el) return;
      const other = step < 0 ? el.previousElementSibling : el.nextElementSibling;
      if (!other) return;
      const pos = lastCaret.current?.pos ?? 0;
      if (step < 0) other.before(el); else other.after(el);
      if (TEXT_TYPES.includes(el.dataset.type)) { focusRoot(); placeCaret(el, Math.min(pos, textOf(el).length)); }
      save();
      keepCaretVisible();
    },
    removeCurrent: () => {
      const el = currentEl();
      if (!el) return;
      const next = el.nextElementSibling ?? el.previousElementSibling;
      el.remove();
      if (!root().children.length) root().appendChild(makeBlock(S.block()));
      const target = next && root().contains(next) ? next : root().firstElementChild;
      if (TEXT_TYPES.includes(target.dataset.type)) { focusRoot(); placeCaret(target, 0); }
      save();
    },
    duplicate: () => {
      const el = currentEl();
      if (!el) return;
      const b = readBlock(el);
      const copy = { ...b, id: S.block().id };
      const holder = document.createElement('div');
      el.after(holder);
      focusRoot();
      replace([holder], [copy], TEXT_TYPES.includes(copy.type) ? { id: copy.id, pos: copy.text.length } : null);
    },
    insertImages: (names) => {
      const el = currentEl();
      const holder = document.createElement('div');
      if (el) el.after(holder); else root().appendChild(holder);
      const imgs = names.map((image) => S.block('IMAGE', '', { image }));
      // 写真の後ろにも書けるよう、最後なら空の行を足す
      const tail = holder.nextElementSibling ? [] : [S.block()];
      replace([holder], [...imgs, ...tail], null);
    },
    insertText: (word) => {
      focusRoot();
      if (!caret()) {
        let el = root().lastElementChild;
        if (!el || !TEXT_TYPES.includes(el.dataset.type)) { el = makeBlock(S.block()); root().appendChild(el); }
        placeCaret(el, textOf(el).length);
      }
      document.execCommand('insertText', false, word);
      save();
    },
    focusEnd: () => {
      let el = root().lastElementChild;
      if (!el || !TEXT_TYPES.includes(el.dataset.type)) { el = makeBlock(S.block()); root().appendChild(el); save(); }
      focusRoot();
      placeCaret(el, textOf(el).length);
      keepCaretVisible();
    },
  };

  const pickSlash = (type) => {
    const s = slash;
    setSlash(null);
    const el = s && byId(s.id);
    if (!el) return;
    const b = readBlock(el);
    const text = b.text === '/' || b.text === '／' ? '' : b.text;
    focusRoot();
    if (type === 'DIVIDER') { const nb = S.block(); replace([el], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 }); return; }
    replace([el], [{ ...b, type, text, checked: false }], { id: b.id, pos: text.length });
  };

  return html`<div class="editor-host" ref=${host}>
    ${slash && html`<div class="slash-menu" role="menu" aria-label=${t('turnInto')} style=${`top:${slash.top}px;left:${slash.left}px`}>
      ${S.BLOCK_TYPES.map((type) => html`<button role="menuitem" class="slash-item" onMouseDown=${(e) => e.preventDefault()} onClick=${() => pickSlash(type)}>
        <span class="slash-icon">${TYPE_ICON[type]}</span>${TYPE_LABEL()[type]}</button>`)}
    </div>`}
    ${menuFor && html`<${ActionSheet} onClose=${() => setMenuFor(null)} items=${[
      { label: t('moveUp'), onClick: () => focusRef.current.move(-1) },
      { label: t('moveDown'), onClick: () => focusRef.current.move(1) },
      { divider: true },
      { label: t('deleteBlock'), danger: true, onClick: () => focusRef.current.removeCurrent() },
    ]} />`}
  </div>`;
}

/**
 * 閲覧モードの本文。編集モードとまったく同じ部品(同じ形・文字の大きさ・行間・記号)で作り、書き換えだけできない。
 * ToDo の丸、リンク、#ハッシュタグ は押せる
 */
export function BlockStatic({ memo, onToggle }) {
  const host = useRef();
  useLayoutEffect(() => {
    const el = document.createElement('div');
    el.className = 'ce static';
    const blocks = memo.blocks.length ? memo.blocks : [S.block()];
    blocks.forEach((b) => el.appendChild(makeBlock(b, true)));
    el.addEventListener('click', (e) => {
      const tag = e.target.closest?.('.hashtag');
      if (tag) { S.open({ name: 'search', q: `#${tag.dataset.tag}` }); return; }
      const blk = e.target.closest?.('.blk-todo');
      if (blk && e.clientX - blk.getBoundingClientRect().left < 30) onToggle?.(blk.dataset.id);
    });
    host.current.appendChild(el);
    return () => el.remove();
  }, [memo.blocks]);
  return html`<div class="editor-host" ref=${host}></div>`;
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
