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

// ---------- 行の中の書式(太字・斜体・下線・取り消し線) ----------
// 書式は block.rich に、b / i / u / s / br だけの HTML で持つ(本文の文字は今まで通り block.text)。
// Android 版は知らない項目を読み飛ばすので、文字はそのまま読める

const MARK_TAGS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's' };
const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** span などに付いた書式(太字・斜体など)を、タグの名前に直す */
function styleMarks(n) {
  const st = n.style;
  if (!st) return [];
  const out = [];
  const w = st.fontWeight;
  if (w === 'bold' || w === 'bolder' || Number(w) >= 600) out.push('b');
  if (st.fontStyle === 'italic') out.push('i');
  const deco = `${st.textDecoration} ${st.textDecorationLine}`;
  if (deco.includes('underline')) out.push('u');
  if (deco.includes('line-through')) out.push('s');
  return out;
}

/** 行の中身を、書式のタグだけの HTML にする。書式が一つもなければ '' */
function richOf(el) {
  let has = false;
  const ser = (node) => {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += escHtml(n.data);
      else if (n.nodeName === 'BR') out += '<br>';
      else if (n.nodeType === 1) {
        const block = /^(DIV|P|LI)$/.test(n.nodeName);
        if (block && out && !out.endsWith('<br>')) out += '<br>';
        let inner = ser(n);
        const tags = MARK_TAGS[n.nodeName] ? [MARK_TAGS[n.nodeName]] : styleMarks(n);
        if (inner && tags.length) { has = true; for (const tg of tags) inner = `<${tg}>${inner}</${tg}>`; }
        out += inner;
        if (block && !out.endsWith('<br>')) out += '<br>';
      }
    }
    return out;
  };
  let html = ser(el);
  if (html.endsWith('<br>')) html = html.slice(0, -4); // 高さ用の最後の <br>
  return has ? html : '';
}

/** rich の HTML を、決まったタグだけで組み立て直して入れる。文字が text と合わなければ使わない */
function fillRich(el, rich, text) {
  const tpl = document.createElement('template');
  tpl.innerHTML = rich;
  const build = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) to.appendChild(document.createTextNode(n.data));
      else if (n.nodeName === 'BR') to.appendChild(document.createElement('br'));
      else if (n.nodeType === 1) {
        const tg = MARK_TAGS[n.nodeName];
        if (tg) { const m = document.createElement(tg); build(n, m); to.appendChild(m); } else build(n, to);
      }
    }
  };
  const box = document.createElement('div');
  build(tpl.content, box);
  if (textOf(box) !== text) { fillText(el, text, false); return; }
  el.textContent = '';
  while (box.firstChild) el.appendChild(box.firstChild);
  if (!text || text.endsWith('\n')) el.appendChild(document.createElement('br'));
}

/** タイムラインなどに出す、安全な書式つきの HTML(書式がなければ null) */
export function richHtml(b) {
  if (!b.rich) return null;
  const d = document.createElement('div');
  fillRich(d, b.rich, b.text);
  if (d.lastChild && d.lastChild.nodeName === 'BR') d.lastChild.remove();
  return d.innerHTML;
}

/** 文字だけの行を、rich と同じ形の HTML に(行をつなぐ時に使う) */
const richOrPlain = (b) => b.rich || escHtml(b.text).replace(/\n/g, '<br>');

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
  if (['center', 'right'].includes(b.align)) el.dataset.align = b.align; // 文字揃え(左はなし)
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
  } else if (b.rich) {
    fillRich(el, b.rich, b.text);
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
    ...(el.dataset.align ? { align: el.dataset.align } : {}),
    ...(type !== 'DIVIDER' && type !== 'IMAGE' && richOf(el) ? { rich: richOf(el) } : {}),
  };
}

/** 行の中の、文字の位置 a〜b の部分(書式つき) */
function partOf(el, a, b) {
  const full = textOf(el);
  const text = full.slice(a, b);
  const p = pointAt(el, a);
  const q = pointAt(el, b);
  const r = document.createRange();
  r.setStart(p.node, p.offset);
  r.setEnd(q.node, q.offset);
  // 1 つの太字などの中だけを写す時、ブラウザは外側の書式を写さないので、外側の書式で包み直す
  let frag = r.cloneContents();
  let anc = r.commonAncestorContainer;
  if (anc.nodeType === 3) anc = anc.parentNode;
  for (let n = anc; n && n !== el; n = n.parentNode) {
    const tg = MARK_TAGS[n.nodeName];
    if (!tg) continue;
    const wrap = document.createElement(tg);
    wrap.appendChild(frag);
    frag = wrap;
  }
  const d = document.createElement('div');
  d.appendChild(frag);
  const rich = richOf(d);
  return rich ? { text, rich } : { text };
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

/** 文字数の位置を、ノード + オフセット に直す */
function pointAt(blockEl, pos) {
  let left = pos;
  let found = null;
  const walk = (x) => {
    for (const c of x.childNodes) {
      if (found) return;
      if (c.nodeType === 3) {
        if (left <= c.data.length) { found = { node: c, offset: left }; return; }
        left -= c.data.length;
      } else if (c.nodeName === 'BR') {
        if (left === 0) { found = { node: c.parentNode, offset: [...c.parentNode.childNodes].indexOf(c) }; return; }
        left -= 1;
      } else walk(c);
    }
  };
  walk(blockEl);
  if (found) return found;
  // 最後: 高さ用の <br> があればその前に
  const last = blockEl.lastChild;
  if (last && last.nodeName === 'BR') return { node: blockEl, offset: blockEl.childNodes.length - 1 };
  return { node: blockEl, offset: blockEl.childNodes.length };
}

/** 文字数の位置にカーソルを置く */
function placeCaret(blockEl, pos) {
  const sel = window.getSelection();
  const r = document.createRange();
  const p = pointAt(blockEl, pos);
  r.setStart(p.node, p.offset);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
}

// ---------- 行全体の書式 ----------

const CMD_TAGS = { bold: ['B', 'STRONG'], italic: ['I', 'EM'], underline: ['U'], strikeThrough: ['S', 'STRIKE', 'DEL'] };

/** 行の文字すべてに、その書式が付いていれば外し、そうでなければ付ける */
function toggleLineMark(el, cmd) {
  const names = CMD_TAGS[cmd];
  if (!names) return;
  const texts = [];
  const walk = (x) => { for (const c of x.childNodes) { if (c.nodeType === 3) { if (c.data) texts.push(c); } else if (c.nodeType === 1) walk(c); } };
  walk(el);
  if (!texts.length) return;
  const marked = (t) => { for (let n = t.parentNode; n && n !== el; n = n.parentNode) if (names.includes(n.nodeName)) return true; return false; };
  const all = texts.every(marked);
  // いったん、この書式をすべて外す
  el.querySelectorAll(names.join(',')).forEach((n) => n.replaceWith(...n.childNodes));
  if (all) return;
  // 行の中身(最後の高さ用の <br> 以外)をまとめて包む
  const kids = [...el.childNodes];
  const last = kids[kids.length - 1];
  const keep = last && last.nodeName === 'BR' ? last : null;
  const wrap = document.createElement(names[0].toLowerCase());
  kids.forEach((k) => { if (k !== keep) wrap.appendChild(k); });
  el.insertBefore(wrap, keep);
}

// ---------- エディタ ----------

export function BlockEditor({ memo, focusRef, onBlockMenu }) {
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
    // 行の中: 太字・斜体・下線・取り消し線(b / i / u / s)はそのまま残す。
    // それ以外の飾り(span・font・中の div など)がある時だけ、書式を保って整え直す
    for (const blk of el.children) {
      if (!TEXT_TYPES.includes(blk.dataset.type)) continue;
      const odd = [...blk.querySelectorAll('*')].some((n) => n.nodeName !== 'BR' && !MARK_TAGS[n.nodeName]);
      if (!odd) continue;
      const isCaret = keep && keep.el === blk;
      const text = textOf(blk);
      const rich = richOf(blk);
      if (rich) fillRich(blk, rich, text); else fillText(blk, text, false);
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
        const before = partOf(cc.el, 0, cc.pos);
        const after = partOf(cc.el, cc.pos, cur.text.length);
        const nextType = LIST_TYPES.includes(cur.type) ? cur.type : 'PARAGRAPH';
        if (!before.text && after.text) {
          // 行頭で Return: 上に空の行を足し、今の行はそのまま
          const empty = S.block(nextType);
          replace([cc.el], [empty, cur], { id: cur.id, pos: 0 });
          return;
        }
        const { rich: _r, ...curPlain } = cur;
        const nb = { ...S.block(nextType, after.text), ...(after.rich ? { rich: after.rich } : {}), ...(cur.align ? { align: cur.align } : {}) };
        replace([cc.el], [{ ...curPlain, text: before.text, ...(before.rich ? { rich: before.rich } : {}) }, nb], { id: nb.id, pos: 0 });
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
        // 前の行とつなぐ(書式もいっしょに)
        const merged = { ...p, text: p.text + b.text };
        if (p.rich || b.rich) merged.rich = richOrPlain(p) + richOrPlain(b); else delete merged.rich;
        replace([prev, c.el], [merged], { id: p.id, pos: p.text.length });
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
        const rest = partOf(c.el, m[0].length, b.text.length);
        const { rich: _r, ...plain } = b;
        replace([c.el], [{ ...plain, type: kind, checked: type === 'TODO_DONE', text: rest.text, ...(rest.rich ? { rich: rest.rich } : {}) }], { id: b.id, pos: 0 });
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
  // 最後に選んでいた範囲(フォーマットのパネルを開くと選択が外れるので、覚えておく)
  const lastRange = useRef(null);
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection();
      if (!s.rangeCount || !root()?.contains(s.anchorNode)) return;
      const r = s.getRangeAt(0);
      const a = blockOf(r.startContainer);
      const z = blockOf(r.endContainer);
      if (!a || !z) return;
      lastRange.current = { a: a.dataset.id, ap: offsetIn(a, r.startContainer, r.startOffset), z: z.dataset.id, zp: offsetIn(z, r.endContainer, r.endOffset) };
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  focusRef.current = {
    currentType: () => currentEl()?.dataset.type ?? null,
    /** 太字・斜体・下線・取り消し線(選んだ文字に。何も選んでいなければ、これから打つ文字に) */
    /** 文字揃え(選んだ行すべて。何も選んでいなければカーソルの行)。行に印を付けるだけで、文字にはさわらない */
    setAlign: (align) => {
      const lr = lastRange.current;
      let els = [];
      const a = lr && byId(lr.a);
      const z = lr && byId(lr.z);
      if (a && z) { for (let n = a; n; n = n.nextElementSibling) { els.push(n); if (n === z) break; } }
      if (!els.length) { const c = currentEl(); if (c) els = [c]; }
      els.filter((x) => TEXT_TYPES.includes(x.dataset.type)).forEach((x) => {
        if (align === 'left') delete x.dataset.align; else x.dataset.align = align;
      });
      save();
    },
    currentAlign: () => {
      const lr = lastRange.current;
      const el = (lr && byId(lr.a)) || currentEl();
      return el?.dataset.align || 'left';
    },
    /** 「+」から開く時: その行をパネルの対象にする */
    menuFor: (id) => {
      if (!id || !byId(id)) return;
      lastCaret.current = { id, pos: lastCaret.current?.id === id ? lastCaret.current.pos : 0 };
      lastRange.current = { a: id, ap: lastCaret.current.pos, z: id, zp: lastCaret.current.pos };
    },
    format: (cmd) => {
      const lr = lastRange.current;
      const a = lr && byId(lr.a);
      const z = lr && byId(lr.z);
      // 文字を選んでいない時は、その行全体に付ける / 外す(キーボードを呼ばず、行の中身に直接)
      if (!lr || (lr.a === lr.z && lr.ap === lr.zp)) {
        const el = a ?? currentEl();
        if (el && TEXT_TYPES.includes(el.dataset.type)) { toggleLineMark(el, cmd); save(); }
        return;
      }
      root()?.focus({ preventScroll: true });
      if (a && z) {
        const p = pointAt(a, lr.ap);
        const q = pointAt(z, lr.zp);
        const r = document.createRange();
        r.setStart(p.node, p.offset);
        r.setEnd(q.node, q.offset);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      document.execCommand(cmd);
      save();
    },
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

  // 行の左の「+」(Notion のように)。書いている行の横にだけ出す。書ける面の外の別のボタンなので、入力には関わらない
  const plusRef = useRef();
  const plusFor = useRef(null);
  useEffect(() => {
    const place = () => {
      const btn = plusRef.current;
      const el = root();
      if (!btn || !el) return;
      const c = document.activeElement === el ? caret() : null;
      const blk = c?.el;
      if (!blk || !TEXT_TYPES.includes(blk.dataset.type)) { btn.style.display = 'none'; plusFor.current = null; return; }
      const hr = host.current.getBoundingClientRect();
      const br = blk.getBoundingClientRect();
      const sc = el.closest('.scroll')?.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(blk).lineHeight) || 28;
      const pad = parseFloat(getComputedStyle(blk).paddingTop) || 0;
      const size = 28;
      // 行の文字の左に。画面の端より外には出さない
      const left = br.left - hr.left - size - 4;
      // 左の余白が足りない時(iPhone の幅など)は、文字に重ならないよう出さない
      if (sc && br.left - sc.left < size + 6) { btn.style.display = 'none'; plusFor.current = null; return; }
      btn.style.left = `${left}px`;
      btn.style.top = `${br.top - hr.top + pad + (lh - size) / 2}px`;
      btn.style.display = 'flex';
      plusFor.current = blk.dataset.id;
    };
    const later = () => requestAnimationFrame(place);
    document.addEventListener('selectionchange', later);
    const el = root();
    el?.addEventListener('input', later);
    el?.addEventListener('blur', later);
    window.visualViewport?.addEventListener('resize', later);
    return () => {
      document.removeEventListener('selectionchange', later);
      el?.removeEventListener('input', later);
      el?.removeEventListener('blur', later);
      window.visualViewport?.removeEventListener('resize', later);
    };
  }, []);

  return html`<div class="editor-host" ref=${host}>
    <button class="blk-plus" ref=${plusRef} style="display:none" aria-label=${t('format')} tabindex="-1"
      onPointerDown=${(e) => { e.preventDefault(); const id = plusFor.current; focusRef.current.menuFor?.(id); onBlockMenu?.(); }}
      onClick=${(e) => e.preventDefault()}>${Icon.plus(18)}</button>
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
      const rh = richHtml(b);
      const text = rh ? html`<span dangerouslySetInnerHTML=${{ __html: rh }}></span>` : html`<${Linkified} text=${b.text} />`;
      const node = (() => { switch (b.type) {
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
      } })();
      return b.align ? html`<div style=${`text-align:${b.align}`}>${node}</div>` : node;
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
