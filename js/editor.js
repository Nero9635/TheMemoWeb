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

export function BlockEditor({ memo, focusRef, onExitTop }) {
  const host = useRef();
  const rootRef = useRef(null);
  const lastCaret = useRef(null); // {id, pos}
  const [slash, setSlashState] = useState(null); // {id, top, left, q, index}
  const slashRef = useRef(null);
  const setSlash = (v) => { slashRef.current = v; setSlashState(v); };
  const [menuFor, setMenuFor] = useState(null); // 写真・区切り線を押した時のメニュー
  const exitTop = useRef(onExitTop);
  exitTop.current = onExitTop;
  // 元に戻す / やり直す(Notion と同じく、自分で持つ。ブラウザの取り消しは組み替えに対応できないため)
  const hist = useRef({ undo: [], redo: [], lastAt: 0 });

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
    let el;
    let pos;
    if (r.startContainer === root()) {
      // 行と行の間を指している時は、その行の頭(最後なら最後の行の終わり)
      const kids = root().children;
      if (!kids.length) return null;
      const i = Math.min(r.startOffset, kids.length - 1);
      el = kids[i];
      pos = r.startOffset >= kids.length ? textOf(el).length : 0;
    } else {
      el = blockOf(r.startContainer);
      if (!el) return null;
      pos = offsetIn(el, r.startContainer, r.startOffset);
    }
    const endEl = r.collapsed ? el : (r.endContainer === root() ? root().children[Math.max(0, r.endOffset - 1)] : blockOf(r.endContainer));
    return { el, pos, collapsed: r.collapsed, endEl: endEl ?? el };
  };
  const currentEl = () => caret()?.el ?? (lastCaret.current && byId(lastCaret.current.id)) ?? null;
  const textBlock = (el) => el && TEXT_TYPES.includes(el.dataset.type);

  /** 文書の並びを読んで保存する */
  const save = () => {
    const el = root();
    if (!el) return;
    const blocks = [...el.children].map(readBlock);
    const blank = blocks.length === 1 && blocks[0].type === 'PARAGRAPH' && !blocks[0].text;
    el.classList.toggle('blank', blank);
    S.setMemoBlocks(memo.id, blocks);
  };

  // ---- 元に戻す ----
  const snapshot = () => {
    const c = caret();
    return { blocks: [...root().children].map(readBlock), caret: c ? { id: c.el.dataset.id, pos: c.pos } : lastCaret.current };
  };
  /** 変える前の状態を残す。文字を打ち続けている間は 1 回だけ(1 秒休むと次の区切り) */
  const record = (force) => {
    const h = hist.current;
    const now = Date.now();
    const quiet = now - h.lastAt > 1000;
    h.lastAt = now;
    if (!force && !quiet) return;
    h.undo.push(snapshot());
    if (h.undo.length > 200) h.undo.shift();
    h.redo = [];
  };
  const restore = (snap) => {
    root().replaceChildren(...snap.blocks.map((b) => makeBlock(b)));
    const target = (snap.caret && byId(snap.caret.id)) || root().lastElementChild;
    if (target && textBlock(target)) placeCaret(target, Math.min(snap.caret?.pos ?? 0, textOf(target).length));
    save();
    keepCaretVisible();
  };
  const undo = () => {
    const h = hist.current;
    if (!h.undo.length) return;
    h.redo.push(snapshot());
    restore(h.undo.pop());
    h.lastAt = 0;
  };
  const redo = () => {
    const h = hist.current;
    if (!h.redo.length) return;
    h.undo.push(snapshot());
    restore(h.redo.pop());
    h.lastAt = 0;
  };

  /** 書ける面の中を、いつも「ブロックの並び」に保つ(ブラウザが直接文字や <br> を置いた時など) */
  const normalize = () => {
    const el = root();
    const c = caret();
    let keep = c ? { el: c.el, pos: c.pos } : null;
    const sel = window.getSelection();
    let changed = false;
    const seen = new Set();
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 1 && n.classList.contains('blk') && n.dataset.id) {
        if (seen.has(n.dataset.id)) { n.dataset.id = S.block().id; changed = true; }
        seen.add(n.dataset.id);
        continue;
      }
      // 行の外に置かれた文字・<br>・ブラウザが作った div:
      // 隣の行の中へ移す。カーソルがその中にあれば、打っていた位置をそのまま保つ
      const text = n.nodeType === 3 ? n.data : n.nodeName === 'BR' ? '' : textOf(n);
      const hasCaret = sel.rangeCount && (sel.anchorNode === n || n.contains?.(sel.anchorNode));
      const caretInN = hasCaret ? (n.nodeType === 3 ? sel.anchorOffset : offsetIn(n, sel.anchorNode, sel.anchorOffset)) : 0;
      const prev = n.previousSibling;
      const next = n.nextSibling;
      changed = true;
      if (!text) { n.remove(); continue; }
      if (prev && prev.nodeType === 1 && textBlock(prev)) {
        const pt = readBlock(prev).text;
        fillText(prev, pt + text, false);
        n.remove();
        if (hasCaret) keep = { el: prev, pos: pt.length + caretInN };
      } else if (next && next.nodeType === 1 && textBlock(next)) {
        const nt = readBlock(next).text;
        fillText(next, text + nt, false);
        n.remove();
        if (hasCaret) keep = { el: next, pos: caretInN };
      } else {
        const nb = makeBlock(S.block('PARAGRAPH', text));
        el.replaceChild(nb, n);
        seen.add(nb.dataset.id);
        if (hasCaret) keep = { el: nb, pos: caretInN };
      }
      if (hasCaret) placeCaret(keep.el, keep.pos);
    }
    // ブラウザが行の中に作った飾り(span・font など)は外して、文字だけに戻す
    for (const blk of el.children) {
      if (!textBlock(blk)) continue;
      if (![...blk.childNodes].some((x) => x.nodeType === 1 && x.nodeName !== 'BR')) continue;
      const isCaret = keep && keep.el === blk;
      fillText(blk, textOf(blk), false);
      changed = true;
      if (isCaret) placeCaret(blk, Math.min(keep.pos, textOf(blk).length));
    }
    if (!el.children.length) {
      el.appendChild(makeBlock(S.block()));
      placeCaret(el.firstChild, 0);
      return true;
    }
    if (changed && keep && el.contains(keep.el) && document.activeElement === el) {
      const s = window.getSelection();
      if (!s.rangeCount || !el.contains(s.anchorNode)) placeCaret(keep.el, Math.min(keep.pos, textOf(keep.el).length));
    }
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
    if (!sel.rangeCount || !root()?.contains(sel.anchorNode)) return;
    const sc = root().closest('.scroll');
    if (!sc) return;
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.height) rect = blockOf(sel.anchorNode)?.getBoundingClientRect() ?? rect;
    const box = sc.getBoundingClientRect();
    const margin = 12;
    if (rect.bottom > box.bottom - margin) sc.scrollTop += rect.bottom - (box.bottom - margin);
    else if (rect.top < box.top + margin) sc.scrollTop -= (box.top + margin) - rect.top;
  };

  /** 空の行に、うすい案内(「/」でメニュー、見出し など)を出す */
  const markEmpty = () => {
    const el = root();
    if (!el) return;
    el.querySelectorAll(':scope > .ph').forEach((x) => x.classList.remove('ph'));
    const c = caret();
    if (!c || !c.collapsed || !textBlock(c.el) || textOf(c.el)) return;
    const type = c.el.dataset.type;
    const blank = el.children.length === 1;
    c.el.dataset.ph = type === 'PARAGRAPH' ? (blank ? t('whatsHappening') : t('slashHint')) : TYPE_LABEL()[type];
    c.el.classList.add('ph');
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

  // ---- 「/」メニュー: 打った言葉で絞り込む(「/見出し」「/todo」など) ----
  const slashItems = (q) => {
    const query = (q || '').trim().toLowerCase();
    return S.BLOCK_TYPES.filter((type) => !query
      || TYPE_LABEL()[type].toLowerCase().includes(query)
      || type.toLowerCase().includes(query)
      || TYPE_ICON[type].toLowerCase() === query);
  };
  const pickSlash = (type) => {
    const s = slashRef.current;
    setSlash(null);
    const el = s && byId(s.id);
    if (!el || !type) return;
    record(true);
    const b = readBlock(el);
    const text = /^[/／]/.test(b.text) ? '' : b.text;
    root().focus({ preventScroll: true });
    if (type === 'DIVIDER') { const nb = S.block(); replace([el], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 }); return; }
    replace([el], [{ ...b, type, text, checked: false }], { id: b.id, pos: text.length });
  };

  /** 何行にもまたがった選択を消して、最初の行と最後の行の残りをつなぐ */
  const deleteRange = (c) => {
    const r = window.getSelection().getRangeAt(0);
    const startEl = c.el;
    const endEl = c.endEl;
    const endPos = r.endContainer === root() ? 0 : offsetIn(endEl, r.endContainer, r.endOffset);
    const els = [];
    for (let n = startEl; n; n = n.nextElementSibling) { els.push(n); if (n === endEl) break; }
    const head = textBlock(startEl) ? readBlock(startEl).text.slice(0, c.pos) : '';
    const tail = textBlock(endEl) ? readBlock(endEl).text.slice(endPos) : '';
    const base = textBlock(startEl) ? readBlock(startEl) : S.block();
    const merged = { ...base, text: head + tail };
    replace(els, [merged], { id: merged.id, pos: head.length });
  };

  // ---- 入力の前: Return・行頭や行末の削除・貼り付け・元に戻す を、その場で組み替える ----
  useEffect(() => {
    const el = root();
    const onBeforeInput = (e) => {
      const type = e.inputType;
      if (type === 'historyUndo') { e.preventDefault(); undo(); return; }
      if (type === 'historyRedo') { e.preventDefault(); redo(); return; }
      // カーソルが行の外(書ける面そのもの)にある時に打った文字は、近くの行の中へ入れる
      const s0 = window.getSelection();
      if (!e.isComposing && s0.rangeCount && s0.isCollapsed && s0.anchorNode === el
        && (type === 'insertText' || type === 'insertReplacementText')) {
        const c0 = caret();
        if (c0 && textBlock(c0.el)) {
          e.preventDefault();
          placeCaret(c0.el, c0.pos);
          const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
          if (data) document.execCommand('insertText', false, data);
          return;
        }
      }
      if (e.isComposing) return;
      const c = caret();
      if (!c) return;
      // 何行にもまたがって選んでいる時: 消す・打つ・Return・貼り付けの前に、選んだ所を自分で消してつなぐ
      // (写真や区切り線をはさんでも、ブラウザまかせにせず必ず正しい形にする)
      if (!c.collapsed && c.endEl !== c.el && (type.startsWith('delete') || type.startsWith('insert'))) {
        record(true);
        deleteRange(c);
        if (type.startsWith('delete')) { e.preventDefault(); return; }
        if (type === 'insertText' || type === 'insertReplacementText') {
          e.preventDefault();
          const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
          if (data) document.execCommand('insertText', false, data);
          return;
        }
      }
      // 「/」メニューを開いている時の Return は、いちばん上の候補を選ぶ
      if (type === 'insertParagraph' && slashRef.current) {
        e.preventDefault();
        const s = slashRef.current;
        pickSlash(slashItems(s.q)[s.index ?? 0]);
        return;
      }
      if (type === 'insertFromPaste' || type === 'insertFromDrop' || type === 'insertFromPasteAsQuotation') {
        e.preventDefault();
        const text = (e.dataTransfer?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
        if (!text) return;
        record(true);
        if (caret() && !caret().collapsed) document.execCommand('delete'); // 1 行の中を選んでいる時だけ
        const cc = caret();
        if (!cc) return;
        if (!text.includes('\n') || cc.el.dataset.type === 'CODE') { document.execCommand('insertText', false, text); return; }
        // 何行もある時は、Notion と同じく 1 行を 1 ブロックに(「- 」などの記号も形式にする)
        const cur = readBlock(cc.el);
        const before = cur.text.slice(0, cc.pos);
        const after = cur.text.slice(cc.pos);
        const lines = text.split('\n');
        const rest = lines.slice(1).map((line) => (line.trim() ? S.parseBlocks(line)[0] : S.block()));
        const last = rest[rest.length - 1];
        const lastLen = last.text.length;
        rest[rest.length - 1] = { ...last, text: last.text + after };
        replace([cc.el], [{ ...cur, text: before + lines[0] }, ...rest], { id: last.id, pos: lastLen });
        return;
      }
      if (type === 'insertParagraph') {
        e.preventDefault();
        record(true);
        if (caret() && !caret().collapsed) document.execCommand('delete'); // 1 行の中を選んでいる時だけ
        const cc = caret();
        if (!cc) return;
        const cur = readBlock(cc.el);
        if (!textBlock(cc.el)) {
          // 写真・区切り線の上で Return: 下に新しい行
          const nb = S.block();
          const holder = document.createElement('div');
          cc.el.after(holder);
          replace([holder], [nb], { id: nb.id, pos: 0 });
          return;
        }
        if (cur.type === 'CODE') {
          // コードの中の Return は改行。最後の空の行でもう一度 Return → コードを抜けて次の行へ
          if (cc.pos === cur.text.length && cur.text.endsWith('\n')) {
            const nb = S.block();
            replace([cc.el], [{ ...cur, text: cur.text.slice(0, -1) }, nb], { id: nb.id, pos: 0 });
            return;
          }
          document.execCommand('insertLineBreak');
          return;
        }
        // 空のリストの項目・引用・コールアウトで Return → ふつうの行に戻す
        if (!cur.text && cur.type !== 'PARAGRAPH') {
          replace([cc.el], [{ ...cur, type: 'PARAGRAPH', checked: false }], { id: cur.id, pos: 0 });
          return;
        }
        const before = cur.text.slice(0, cc.pos);
        const after = cur.text.slice(cc.pos);
        const nextType = LIST_TYPES.includes(cur.type) ? cur.type : 'PARAGRAPH';
        if (!before && after) {
          // 行頭で Return: 上に空の行を足し、今の行はそのまま
          replace([cc.el], [S.block(nextType), cur], { id: cur.id, pos: 0 });
          return;
        }
        const nb = S.block(nextType, after);
        replace([cc.el], [{ ...cur, text: before }, nb], { id: nb.id, pos: 0 });
        return;
      }
      if (type.startsWith('delete') && type.endsWith('Backward') && c.collapsed && c.pos === 0) {
        const b = readBlock(c.el);
        // 行頭の Backspace: まず形式を外す
        if (b.type !== 'PARAGRAPH' && textBlock(c.el)) {
          e.preventDefault();
          record(true);
          replace([c.el], [{ ...b, type: 'PARAGRAPH', checked: false }], { id: b.id, pos: 0 });
          return;
        }
        const prev = c.el.previousElementSibling;
        e.preventDefault();
        if (!prev) { if (!b.text) exitTop.current?.(); return; }
        const p = readBlock(prev);
        record(true);
        if (p.type === 'DIVIDER') { prev.remove(); placeCaret(c.el, 0); save(); return; }
        if (p.type === 'IMAGE') {
          // 写真の下の空の行は消して、写真の上の行の最後へ
          if (b.text || !c.el.nextElementSibling) return; // 写真の後ろに書ける行を残す
          let up = prev.previousElementSibling;
          while (up && !textBlock(up)) up = up.previousElementSibling;
          c.el.remove();
          if (up) placeCaret(up, textOf(up).length);
          save();
          return;
        }
        // 前の行とつなぐ
        replace([prev, c.el], [{ ...p, text: p.text + b.text }], { id: p.id, pos: p.text.length });
        return;
      }
      if (type.startsWith('delete') && type.endsWith('Forward') && c.collapsed && textBlock(c.el) && c.pos === textOf(c.el).length) {
        // 行末の Delete: 次の行をつなぐ
        const b = readBlock(c.el);
        const next = c.el.nextElementSibling;
        e.preventDefault();
        if (!next) return;
        const n = readBlock(next);
        record(true);
        if (n.type === 'DIVIDER') { next.remove(); save(); return; }
        if (n.type === 'IMAGE') return;
        replace([c.el, next], [{ ...b, text: b.text + n.text }], { id: b.id, pos: b.text.length });
        return;
      }
      if (type.startsWith('insert') || type.startsWith('delete')) record(false);
    };
    const onInput = (e) => {
      if (e.isComposing) { save(); return; }
      normalize();
      if (!shortcut()) save();
      markEmpty();
    };
    const onCompositionEnd = () => setTimeout(() => { normalize(); if (!shortcut()) save(); markEmpty(); }, 0);
    // 行頭の記号で形式を変える・「---」で区切り線・行頭の「/」でメニュー
    const shortcut = () => {
      const c = caret();
      if (!c || !c.collapsed) { setSlash(null); return false; }
      const b = readBlock(c.el);
      if (b.type === 'CODE' || !textBlock(c.el)) { setSlash(null); return false; }
      const sm = b.text.match(/^[/／]([^\s/／]{0,20})$/);
      if (sm && c.pos === b.text.length && slashItems(sm[1]).length) {
        const r = c.el.getBoundingClientRect();
        const hr = host.current.getBoundingClientRect();
        const prev = slashRef.current;
        setSlash({ id: b.id, top: r.bottom - hr.top + 4, left: Math.max(0, r.left - hr.left), q: sm[1], index: prev?.id === b.id && prev.q === sm[1] ? prev.index : 0 });
        return false;
      }
      setSlash(null);
      if (/^(-{3}|—-|ー{3})$/.test(b.text) && c.pos === b.text.length) {
        record(true);
        const nb = S.block();
        replace([c.el], [S.block('DIVIDER'), nb], { id: nb.id, pos: 0 });
        return true;
      }
      for (const [re, kind] of S.SHORTCUTS) {
        const m = b.text.match(re);
        if (!m || !/\s$|・$/.test(m[0]) || c.pos !== m[0].length) continue;
        const to = kind === 'TODO_DONE' ? 'TODO' : kind;
        if (to === b.type && to !== 'TODO') continue;
        record(true);
        replace([c.el], [{ ...b, type: to, checked: kind === 'TODO_DONE', text: b.text.slice(m[0].length) }], { id: b.id, pos: 0 });
        return true;
      }
      return false;
    };
    const onKeyDown = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      const s = slashRef.current;
      if (s && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const n = slashItems(s.q).length;
        setSlash({ ...s, index: ((s.index ?? 0) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n });
        return;
      }
      if (s && e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      const c = caret();
      if (!c) return;
      if (e.key === 'Tab') {
        // 入力の面から出ていかないように。コードの中では字下げ
        e.preventDefault();
        if (c.el.dataset.type === 'CODE' && !e.shiftKey) document.execCommand('insertText', false, '  ');
        return;
      }
      // いちばん上の行の頭で ↑ → タイトルへ
      if (e.key === 'ArrowUp' && c.collapsed && c.pos === 0 && !c.el.previousElementSibling) { e.preventDefault(); exitTop.current?.(); }
    };
    // ToDo の丸: 押してもキーボードを出さずに付け外しする
    const inCheck = (blk, x) => blk?.dataset.type === 'TODO' && x - blk.getBoundingClientRect().left < 32;
    const onPointerDown = (e) => {
      const blk = blockOf(e.target);
      if (!inCheck(blk, e.clientX)) return;
      e.preventDefault();
      record(true);
      blk.classList.toggle('checked');
      save();
    };
    const onTouchStart = (e) => {
      const tt = e.touches[0];
      if (tt && inCheck(blockOf(e.target), tt.clientX)) e.preventDefault();
    };
    // 写真・区切り線を押した時のメニュー
    const onClick = (e) => {
      const blk = blockOf(e.target);
      if (!blk || textBlock(blk)) return;
      e.preventDefault();
      lastCaret.current = { id: blk.dataset.id, pos: 0 };
      el.blur();
      setMenuFor(blk.dataset.id);
    };
    const onSelection = () => {
      // iPad は、行と行の間(書ける面そのもの)にカーソルを置くことがある。
      // そのまま打つと文字が行の外に入るので、すぐに近くの行の中へ移す
      const s = window.getSelection();
      if (s.rangeCount && s.isCollapsed && s.anchorNode === el) {
        const kids = el.children;
        if (kids.length) {
          const i = s.anchorOffset;
          let target = kids[Math.min(i, kids.length - 1)];
          let end = i >= kids.length;
          if (!textBlock(target)) {
            // 写真・区切り線のそばなら、いちばん近い文字の行へ
            let up = target.previousElementSibling;
            while (up && !textBlock(up)) up = up.previousElementSibling;
            let down = target.nextElementSibling;
            while (down && !textBlock(down)) down = down.nextElementSibling;
            target = end ? (up ?? down) : (down ?? up);
            end = target === up;
          }
          if (target) { placeCaret(target, end ? textOf(target).length : 0); return; }
        }
      }
      const c = caret();
      if (c) lastCaret.current = { id: c.el.dataset.id, pos: c.pos };
      if (slashRef.current && (!c || c.el.dataset.id !== slashRef.current.id)) setSlash(null);
      markEmpty();
    };
    const onBlur = () => { root()?.querySelectorAll(':scope > .ph').forEach((x) => x.classList.remove('ph')); };
    // キーボードの高さが変わった時(候補の列が出る・消えるなど): 書いている行とキーボードの距離を変えない
    const vv = window.visualViewport;
    let lastH = vv?.height ?? 0;
    const onResize = () => {
      const h = vv.height;
      const d = lastH - h;
      lastH = h;
      if (!caret()) return;
      if (Math.abs(d) > 150) { keepCaretVisible(); return; } // キーボードが出る・閉じる時は、隠れないようにだけ
      const sc = el.closest('.scroll');
      if (sc && d) sc.scrollTop += d;
    };
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('input', onInput);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('click', onClick);
    el.addEventListener('blur', onBlur);
    document.addEventListener('selectionchange', onSelection);
    vv?.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('input', onInput);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('click', onClick);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('selectionchange', onSelection);
      vv?.removeEventListener('resize', onResize);
    };
  }, []);

  const focusRoot = () => { root()?.focus({ preventScroll: true }); };
  /** 選んでいる行(複数行を選んでいればその全部) */
  const selectedEls = () => {
    const c = caret();
    if (!c) { const el = currentEl(); return el ? [el] : []; }
    const out = [];
    for (let n = c.el; n; n = n.nextElementSibling) { out.push(n); if (n === c.endEl) break; }
    return out;
  };

  // 外から(道具・フォーマット・写真・ワード)操作する
  focusRef.current = {
    currentType: () => currentEl()?.dataset.type ?? null,
    refocus: () => {
      const lc = lastCaret.current;
      const el = lc && byId(lc.id);
      focusRoot();
      if (el && textBlock(el)) placeCaret(el, Math.min(lc.pos, textOf(el).length));
      keepCaretVisible();
    },
    blur: () => { root()?.blur(); window.getSelection()?.removeAllRanges(); },
    undo, redo,
    setType: (type) => {
      const sels = selectedEls();
      const el = sels[0] ?? root()?.lastElementChild;
      if (!el) return;
      record(true);
      const c = caret();
      const pos = c && c.el === el ? c.pos : (lastCaret.current?.id === el.dataset.id ? lastCaret.current.pos : textOf(el).length);
      focusRoot();
      if (type === 'DIVIDER') { insertDivider(el, pos); return; }
      // 何行か選んでいる時は、選んだ行すべての形式を変える(Notion と同じ)
      if (sels.length > 1) {
        const texts = sels.filter(textBlock);
        if (!texts.length) return;
        const all = texts.every((x) => x.dataset.type === type);
        const to = all ? 'PARAGRAPH' : type;
        texts.forEach((x) => { const b = readBlock(x); const n = makeBlock({ ...b, type: to, checked: to === 'TODO' ? b.checked : false }); x.replaceWith(n); });
        save();
        return;
      }
      const b = readBlock(el);
      if (b.type === 'IMAGE') return;
      if (b.type === 'DIVIDER') { replace([el], [{ ...b, type, text: '', checked: false }], { id: b.id, pos: 0 }); return; }
      // 何行もある行で、リストや見出しにする時は、カーソルのある行だけを変える
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
      record(true);
      const pos = lastCaret.current?.pos ?? 0;
      if (step < 0) other.before(el); else other.after(el);
      if (textBlock(el)) { focusRoot(); placeCaret(el, Math.min(pos, textOf(el).length)); }
      save();
      keepCaretVisible();
    },
    removeCurrent: () => {
      const el = currentEl();
      if (!el) return;
      record(true);
      const next = el.nextElementSibling ?? el.previousElementSibling;
      el.remove();
      if (!root().children.length) root().appendChild(makeBlock(S.block()));
      const target = next && root().contains(next) ? next : root().firstElementChild;
      if (textBlock(target)) { focusRoot(); placeCaret(target, 0); }
      save();
    },
    duplicate: () => {
      const el = currentEl();
      if (!el) return;
      record(true);
      const b = readBlock(el);
      const copy = { ...b, id: S.block().id };
      const holder = document.createElement('div');
      el.after(holder);
      focusRoot();
      replace([holder], [copy], textBlock(el) ? { id: copy.id, pos: copy.text.length } : null);
    },
    insertImages: (names) => {
      record(true);
      const el = currentEl();
      const holder = document.createElement('div');
      if (el) el.after(holder); else root().appendChild(holder);
      const imgs = names.map((image) => S.block('IMAGE', '', { image }));
      // 写真の後ろにも書けるよう、最後なら空の行を足す
      const tail = holder.nextElementSibling ? [] : [S.block()];
      replace([holder], [...imgs, ...tail], null);
    },
    insertText: (word) => {
      record(true);
      focusRoot();
      if (!caret()) {
        const lc = lastCaret.current;
        let el = lc && byId(lc.id);
        if (!textBlock(el)) el = root().lastElementChild;
        if (!textBlock(el)) { el = makeBlock(S.block()); root().appendChild(el); }
        placeCaret(el, lc && el.dataset.id === lc.id ? Math.min(lc.pos, textOf(el).length) : textOf(el).length);
      }
      document.execCommand('insertText', false, word);
      save();
    },
    focusStart: () => {
      let el = root().firstElementChild;
      if (!textBlock(el)) { el = makeBlock(S.block()); root().prepend(el); save(); }
      focusRoot();
      placeCaret(el, 0);
      keepCaretVisible();
    },
    focusEnd: () => {
      let el = root().lastElementChild;
      if (!textBlock(el)) { el = makeBlock(S.block()); root().appendChild(el); save(); }
      focusRoot();
      placeCaret(el, textOf(el).length);
      keepCaretVisible();
    },
  };

  const items = slash ? slashItems(slash.q) : [];
  return html`<div class="editor-host" ref=${host}>
    ${slash && items.length > 0 && html`<div class="slash-menu" role="menu" aria-label=${t('turnInto')} style=${`top:${slash.top}px;left:${slash.left}px`}>
      ${items.map((type, i) => html`<button role="menuitem" class=${`slash-item ${i === (slash.index ?? 0) ? 'on' : ''}`}
        onMouseDown=${(e) => e.preventDefault()} onClick=${() => pickSlash(type)}>
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
