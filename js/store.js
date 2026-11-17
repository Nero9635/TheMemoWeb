// アプリの状態と、すべての操作(Android 版の MainViewModel にあたる)
import { db } from './db.js';
import * as ai from './ai.js';
import { dateKey, defaultTag, graphemes, parseDateKey, todayKey, uuid, formatTime } from './util.js';
import { t, setLang } from './i18n.js';

// ---- 人物(AI character) ----

/** 前の版の既定の人物(ユング先生)。まだ自分で変えていなければ、新しい既定に置きかえる */
const OLD_DEFAULT_NAME = 'Dr. Jung';
export const JUNG_PERSONA = {
  name: 'Dr. Jung',
  icon: 'J',
  image: '',
  role: '分析心理学を創始したカール・グスタフ・ユング博士(ユング先生)。'
    + '病気や症状、診断、治療といった病理の話はせず、日々の気づき・創造性・心の成長に目を向けます。'
    + 'ペルソナ、影(シャドウ)、元型、象徴、共時性、個性化といった考え方を、'
    + '必要な時だけ1つ程度、日常の言葉に置きかえて使います。専門用語を並べすぎないでください。'
    + '決めつけず、仮説としてやわらかく示し、本人が自分で考えを深められる問いを添えます。',
  style: '落ち着いた、思慮深く温かい語り口。相手を「あなた」と呼ぶ。',
  aboutUser: '',
};

/** 既定の人物: 特定の人物ではない、あなた専用の AI */
export const DEFAULT_PERSONA = {
  name: 'My AI',
  icon: '✦',
  image: '',
  role: 'ユーザーのメモや日記をていねいに読み、そこに表れた思いや関心を言葉にして返す、思慮深い相棒。'
    + '決めつけず、気づきを仮説としてやわらかく示し、本人が自分で考えを深められる問いを1つ添えます。'
    + '病気や診断の話はせず、日々の気づき・創造性・成長に目を向けます。',
  style: '穏やかで温かく、簡潔な語り口。相手を「あなた」と呼ぶ。',
  aboutUser: '',
};

export function personaGlyph(p) {
  // 三叉(Ψ)は使わない。前の版のコメントに残っていても ✦ で出す
  const icon = (p.icon || '').trim().replace('Ψ', '');
  return graphemes(icon || (p.name || '').trim().slice(0, 1) || '✦', 2);
}

/** コメントを書いた人物。by が null なら今の人物、空なら人物を選べる前のコメント(ユング先生) */
export function authorOf(current, by, icon) {
  if (by == null) return current;
  if (!by) return current.name === OLD_DEFAULT_NAME ? current : { ...JUNG_PERSONA, icon: '✦' };
  if (by === current.name) return current;
  return { ...DEFAULT_PERSONA, name: by, icon, image: '' };
}

/** 言語ごとの初期の簡単ワードとタグ。まだ自分で変えていなければ、言語を変えた時に入れ替える */
const DEFAULT_WORDS = {
  en: ['Idea', 'To do', 'To buy', 'Remembered', 'Look up later', 'Important', 'Insight'],
  ja: ['アイデア', 'やること', '買うもの', '思い出した', 'あとで調べる', '重要', '気づき'],
  zh: ['想法', '待办', '要买的', '想起来了', '稍后查', '重要', '发现'],
};
const DEFAULT_TAGS = {
  en: ['Ideas', 'Walk', 'To-do', 'Insight', 'Work', 'Diary'],
  ja: ['アイデア', '散歩', 'やること', '気づき', '作品', '日記'],
  zh: ['想法', '散步', '待办', '发现', '作品', '日记'],
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: '',
  theme: 'system',
  profileName: 'Me',
  profileImage: '',
  calendarHidden: false,
  persona: DEFAULT_PERSONA,
  language: 'en',
  textSize: 'm',
  writingFont: 'default',
  lineSpacing: 'm',
  editorMargin: 'm',
  lastBackupAt: 0,
};

/** 日記の気分。key は保存用、emoji は表示用(名前は i18n の moods と同じ順番) */
export const MOODS = [
  ['great', '😄'], ['good', '🙂'], ['okay', '😐'], ['low', '😔'],
  ['sad', '😢'], ['angry', '😠'], ['tired', '😴'], ['calm', '😌'],
];

export function moodEmoji(key) {
  return MOODS.find(([k]) => k === key)?.[1] ?? '';
}

export function moodLabel(key) {
  const i = MOODS.findIndex(([k]) => k === key);
  return i < 0 ? '' : t('moods')[i];
}

/** 文字の大きさ(設定の S / M / L / XL) */
export const TEXT_SIZES = { s: 0.9, m: 1, l: 1.15, xl: 1.3 };
/** 編集画面の行の間隔と、左右の余白 */
export const LINE_SPACINGS = { s: 1.4, m: 1.6, l: 1.9 };
export const EDITOR_MARGINS = { s: 8, m: 16, l: 36 };

const TRASH_DAYS = 30;

// ---- 本文(ブロック) ----

/** ブロックの形式。DIVIDER は Android 版では「---」の段落として見える */
export const BLOCK_TYPES = ['PARAGRAPH', 'HEADING1', 'HEADING2', 'HEADING3', 'BULLET', 'NUMBERED', 'TODO', 'QUOTE', 'CALLOUT', 'CODE', 'DIVIDER'];

export function block(type = 'PARAGRAPH', text = '', extra = {}) {
  return { id: uuid(), type, text: type === 'DIVIDER' ? '---' : text, checked: false, image: '', comment: '', ...extra };
}

/** 行頭の記号(Notion と同じ書き方)と形式 */
export const SHORTCUTS = [
  [/^###\s/, 'HEADING3'], [/^##\s/, 'HEADING2'], [/^#\s/, 'HEADING1'], [/^```\s/, 'CODE'], [/^!\s/, 'CALLOUT'], [/^[-*+・]\s?/, 'BULLET'], [/^\d+[.)]\s/, 'NUMBERED'],
  [/^\[\s?\]\s?/, 'TODO'], [/^\[x\]\s?/i, 'TODO_DONE'], [/^>\s?/, 'QUOTE'], [/^["“”]\s/, 'QUOTE'],
];

/**
 * 入力欄の文章をブロックに分ける。「- 」「1. 」「# 」などで始まる行はその形式に、
 * 「---」は区切り線に、ほかの続いた行は1つの段落(改行を含む)にする
 */
export function parseBlocks(text) {
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) out.push(block('PARAGRAPH', para.join('\n')));
    para = [];
  };
  for (const line of text.replace(/\s+$/, '').split('\n')) {
    if (/^(-{3,}|—-+)$/.test(line.trim())) { flush(); out.push(block('DIVIDER')); continue; }
    const hit = SHORTCUTS.find(([re]) => re.test(line));
    // 「・」だけは空白なしでも箇条書きにする。ほかは記号の後に空白が必要
    if (hit && !(hit[1] === 'BULLET' && /^[-*]\S/.test(line))) {
      flush();
      const rest = line.replace(hit[0], '');
      out.push(hit[1] === 'TODO_DONE' ? block('TODO', rest, { checked: true }) : block(hit[1], rest));
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

/** 検索・共有・AI に使うプレーンテキスト(Android 版の toPlainText と同じ) */
export function toPlainText(blocks) {
  let n = 0;
  return blocks.map((b) => {
    n = b.type === 'NUMBERED' ? n + 1 : 0;
    switch (b.type) {
      case 'IMAGE': return null;
      case 'DIVIDER': return '---';
      case 'BULLET': return `・${b.text}`;
      case 'NUMBERED': return `${n}. ${b.text}`;
      case 'TODO': return (b.checked ? '☑ ' : '☐ ') + b.text;
      case 'QUOTE': return `> ${b.text}`;
      case 'CALLOUT': return `💡 ${b.text}`;
      default: return b.text;
    }
  }).filter((t) => t !== null).join('\n');
}

export function memoImages(memo) {
  return memo.blocks.filter((b) => b.type === 'IMAGE').map((b) => b.image);
}

export function plainText(memo) {
  return ((memo.title.trim() ? memo.title.trim() + '\n\n' : '') + memo.body.trim());
}

export function memoDate(memo) {
  return dateKey(memo.createdAt);
}

export function isBlank(memo) {
  return !memo.title.trim() && !memo.body.trim() && memoImages(memo).length === 0 && !memo.mood;
}

export function replyCount(memo) {
  return [memo.aiComment, memo.aiSummary, memo.aiIdeas].filter((t) => t && t.trim()).length + memo.chat.length;
}

function newMemo(fields) {
  const now = Date.now();
  return {
    id: uuid(), title: '', body: '', blocks: [], tags: [], createdAt: now, updatedAt: now, allDay: false,
    aiSummary: '', aiComment: '', aiCommentBy: '', aiCommentIcon: '', aiIdeas: '', chat: [],
    place: '', weather: '', mood: '', starred: false, deletedAt: 0, ...fields,
  };
}

/** 古いデータや Android 版のデータに足りない項目を埋める */
export function normalizeMemo(m) {
  const memo = newMemo({});
  Object.assign(memo, m);
  memo.blocks = (m.blocks ?? []).map((b) => ({ id: b.id ?? uuid(), type: b.type ?? 'PARAGRAPH', text: b.text ?? '', checked: !!b.checked, image: b.image ?? '', comment: b.comment ?? '' }));
  memo.tags = m.tags ?? [];
  memo.chat = m.chat ?? [];
  memo.starred = !!m.starred;
  if (!memo.body && memo.blocks.length) memo.body = toPlainText(memo.blocks);
  return memo;
}

// ---- 状態 ----

export const state = {
  ready: false,
  memos: [],
  settings: { ...DEFAULT_SETTINGS },
  tags: [],
  quickWords: DEFAULT_WORDS.en.map((text) => ({ text, uses: 0 })),
  dayNotes: {},
  busy: null, // {memoId, task}
  dayBusy: null, // {date, jung}
  reviewBusy: false,
  review: null, // {label, text}
  suggestion: null, // {memoId, title, tags}
  pendingSettings: null, // 読み込んだバックアップの設定 {settings, message}
  message: null,
  selected: todayKey(),
  stack: [{ name: 'home' }],
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let pending = false;
function emit() {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    listeners.forEach((fn) => fn());
  });
}

export function setState(patch) {
  Object.assign(state, patch);
  emit();
}

export function say(message) {
  setState({ message });
}

export async function init() {
  const [memos, settings, tags, words, notes] = await Promise.all([
    db.allMemos(), db.get('settings'), db.get('tags'), db.get('quickWords'), db.get('dayNotes'),
  ]);
  const limit = Date.now() - TRASH_DAYS * 86400000;
  const all = (memos ?? []).map(normalizeMemo);
  const expired = all.filter((m) => m.deletedAt && m.deletedAt < limit);
  for (const m of expired) await deleteForever(m.id, all);
  state.memos = all.filter((m) => !expired.includes(m));
  state.settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}), persona: { ...DEFAULT_PERSONA, ...(settings?.persona ?? {}) } };
  // 前の版の既定(ユング先生)のままなら、新しい既定の人物にする(「About me」は残す)
  const op = state.settings.persona;
  if (op.name === OLD_DEFAULT_NAME && (op.icon === 'Ψ' || !op.icon) && !op.image && op.role === JUNG_PERSONA.role) {
    state.settings.persona = { ...DEFAULT_PERSONA, aboutUser: op.aboutUser ?? '' };
    db.set('settings', state.settings);
  }
  setLang(state.settings.language);
  state.tags = tags ?? DEFAULT_TAGS[state.settings.language].map(defaultTag);
  if (!tags) db.set('tags', state.tags);
  state.quickWords = words ?? DEFAULT_WORDS[state.settings.language].map((text) => ({ text, uses: 0 }));
  state.dayNotes = notes ?? {};
  versions = (await db.get('versions').catch(() => null)) ?? {};
  state.ready = true;
  emit();
  // 1日1回、起動した時の全メモを控えておく(バグや誤操作で消えても戻せるように)
  autoSnapshot('daily').catch(() => {});
  // ホーム画面に追加したアプリのデータは消されにくい。念のため長く残すよう頼む
  navigator.storage?.persist?.().catch(() => {});
}

export const activeMemos = () => state.memos.filter((m) => !m.deletedAt);
export const trashMemos = () => state.memos.filter((m) => m.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
export const getMemo = (id) => state.memos.find((m) => m.id === id);

// ---- 画面の移動(ブラウザの戻ると同じ動き) ----

export function open(screen) {
  state.stack = [...state.stack, screen];
  history.pushState({ depth: state.stack.length }, '');
  emit();
}

export function back() {
  if (state.stack.length > 1) history.back();
}

window.addEventListener('popstate', () => {
  if (state.stack.length <= 1) return;
  const left = state.stack[state.stack.length - 1];
  state.stack = state.stack.slice(0, -1);
  // 何も書かなかったメモは残さない
  if (left.name === 'detail') {
    const memo = getMemo(left.id);
    if (memo && isBlank(memo)) {
      if (versions[memo.id]?.length) updateMemo(memo.id, (m) => ({ ...m, deletedAt: Date.now() }));
      else removeMemoNow(memo.id);
    }
    endEdit();
  }
  emit();
});

// ---- メモ ----

const saveTimers = new Map();
function persist(memo, delay = 0) {
  clearTimeout(saveTimers.get(memo.id));
  if (!delay) { db.putMemo(memo); return; }
  saveTimers.set(memo.id, setTimeout(() => { saveTimers.delete(memo.id); db.putMemo(getMemo(memo.id) ?? memo); }, delay));
}

/** まだ書き込んでいない変更を、すぐ端末に保存する(アプリを閉じる時など) */
export function flushSaves() {
  for (const [id, timer] of saveTimers) {
    clearTimeout(timer);
    const m = getMemo(id);
    if (m) db.putMemo(m);
  }
  saveTimers.clear();
}

export function updateMemo(id, fn, delay = 0) {
  let changed = null;
  state.memos = state.memos.map((m) => {
    if (m.id !== id) return m;
    changed = { ...fn(m), updatedAt: Date.now() };
    return changed;
  });
  if (changed) persist(changed, delay);
  emit();
  return changed;
}

function addMemo(memo) {
  state.memos = [...state.memos, memo];
  persist(memo);
  emit();
  return memo;
}

function removeMemoNow(id) {
  state.memos = state.memos.filter((m) => m.id !== id);
  db.deleteMemo(id);
  emit();
}

/** 入力欄から投稿する。「- 」などで始まる行はリストなどのブロックに、写真、タグ */
export function post(text, images, tags) {
  if (!text.trim() && images.length === 0) return null;
  const blocks = [
    ...(text.trim() ? parseBlocks(text.trim()) : []),
    ...images.map((image) => block('IMAGE', '', { image })),
  ];
  return addMemo(newMemo({ blocks, body: toPlainText(blocks), tags: [...new Set(tags)] }));
}

/** その日の日記。なければ作る(時刻はその日の正午) */
export function diaryFor(key) {
  const found = activeMemos().find((m) => m.allDay && memoDate(m) === key);
  if (found) return found;
  const d = parseDateKey(key);
  d.setHours(12, 0, 0, 0);
  return addMemo(newMemo({ allDay: true, createdAt: d.getTime(), blocks: [block()] }));
}

export function newPostOn(key) {
  const now = new Date();
  const d = parseDateKey(key);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  return addMemo(newMemo({ createdAt: key === todayKey() ? Date.now() : d.getTime() }));
}

/** 詳細画面のブロックエディタからの保存(打つたびに呼ばれるので、書き込みは少し待ってまとめる) */
export function setMemoBlocks(id, blocks) {
  checkpoint(id);
  return updateMemo(id, (m) => ({ ...m, blocks, body: toPlainText(blocks) }), 400);
}

export function setMemoTitle(id, title) {
  checkpoint(id);
  return updateMemo(id, (m) => ({ ...m, title }), 400);
}

/** 本文の最後に文章を足す(AI の文章を本文へ、など) */
export function appendText(id, text) {
  checkpoint(id);
  return updateMemo(id, (m) => {
    const last = m.blocks[m.blocks.length - 1];
    // 最後が空の段落なら、そこに入れる
    const base = last && last.type === 'PARAGRAPH' && !last.text.trim() ? m.blocks.slice(0, -1) : m.blocks;
    const blocks = [...base, ...parseBlocks(text)];
    return { ...m, blocks, body: toPlainText(blocks) };
  });
}

/** 本文を文章で置き換える。写真は残す */
export function replaceText(id, text) {
  checkpoint(id);
  return updateMemo(id, (m) => {
    const blocks = [...parseBlocks(text), ...m.blocks.filter((b) => b.type === 'IMAGE')];
    return { ...m, blocks, body: toPlainText(blocks) };
  });
}

export function setMemoTags(id, tags) {
  updateMemo(id, (m) => ({ ...m, tags }));
}

/** 日記の気分。同じものをもう一度押すと外す */
export function setMood(id, mood) {
  updateMemo(id, (m) => ({ ...m, mood: m.mood === mood ? '' : mood }));
}

/** 星を付ける / 外す */
export function toggleStar(id) {
  updateMemo(id, (m) => ({ ...m, starred: !m.starred }));
}

export function setMemoTime(id, ms) {
  updateMemo(id, (m) => ({ ...m, createdAt: ms }));
}

export function trashMemo(id) {
  if (state.stack.some((s) => s.id === id)) {
    // 開いている画面から消す
    state.stack = state.stack.filter((s) => s.id !== id);
  }
  updateMemo(id, (m) => ({ ...m, deletedAt: Date.now() }));
}

export function restoreMemo(id) {
  updateMemo(id, (m) => ({ ...m, deletedAt: 0 }));
}

/** 完全に消す。ほかで使っていない写真も消す */
export async function deleteForever(id, list = state.memos) {
  const memo = list.find((m) => m.id === id);
  if (!memo) return;
  const rest = list.filter((m) => m.id !== id);
  const used = new Set([...rest.flatMap(memoImages), state.settings.profileImage, state.settings.persona?.image]);
  for (const name of memoImages(memo)) if (!used.has(name)) await db.deleteImage(name);
  await db.deleteMemo(id);
  if (list === state.memos) {
    state.memos = rest;
    emit();
  }
}

export async function emptyTrash() {
  await autoSnapshot('beforeEmptyTrash');
  for (const m of trashMemos()) await deleteForever(m.id);
}

// ---- タグ(決めた一覧)と #ハッシュタグ(本文に自由に書く) ----
//
// タグ: 設定の「Tags」で管理する、決まった分類。AI もこの中からしか選ばない。
// #ハッシュタグ: 本文に「#銀杏」のように書くだけ。いくつでも自由に作れ、押すと検索できる。


export function tagInfo(name) {
  return state.tags.find((t) => t.name === name) ?? defaultTag(name);
}

export function isListedTag(name) {
  return state.tags.some((t) => t.name === name);
}

function saveTags(tags) {
  state.tags = tags;
  db.set('tags', tags);
  emit();
}

/** 一覧にタグを足す(設定やタグのシートから、自分で足す時だけ) */
export function registerTag(name) {
  const n = name.trim().replace(/^#/, '');
  if (!n || isListedTag(n)) return;
  saveTags([...state.tags, defaultTag(n)]);
}

export function setTagColor(name, color) {
  saveTags(state.tags.map((t) => (t.name === name ? { ...t, color } : t)));
}

/** 名前を変える。付いている投稿のタグも変える */
export function renameTag(from, to) {
  const n = to.trim().replace(/^#/, '');
  if (!n || n === from) return;
  if (isListedTag(n)) saveTags(state.tags.filter((t) => t.name !== from));
  else saveTags(state.tags.map((t) => (t.name === from ? { ...t, name: n } : t)));
  activeMemos().filter((m) => m.tags.includes(from)).forEach((m) => {
    updateMemo(m.id, (x) => ({ ...x, tags: [...new Set(x.tags.map((t) => (t === from ? n : t)))] }));
  });
}

/** 一覧から外し、付いている投稿からも外す */
export function deleteTag(name) {
  saveTags(state.tags.filter((t) => t.name !== name));
  state.memos.filter((m) => m.tags.includes(name)).forEach((m) => {
    updateMemo(m.id, (x) => ({ ...x, tags: x.tags.filter((t) => t !== name) }));
  });
}

export function moveTag(name, step) {
  const list = [...state.tags];
  const i = list.findIndex((t) => t.name === name);
  const j = i + step;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  saveTags(list);
}

/** 投稿に付いているのに一覧にないタグ(Android 版の AI が作ったものなど)と、その件数 */
export function unlistedTags() {
  const counts = new Map();
  activeMemos().forEach((m) => m.tags.forEach((t) => { if (!isListedTag(t)) counts.set(t, (counts.get(t) ?? 0) + 1); }));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** 一覧にないタグを、本文の #ハッシュタグ に変える */
export function tagToHashtag(name) {
  const tag = `#${name.replace(/\s+/g, '_')}`;
  activeMemos().filter((m) => m.tags.includes(name)).forEach((m) => {
    if (!hashtagsIn(m.body).includes(tag.slice(1))) appendText(m.id, tag);
    updateMemo(m.id, (x) => ({ ...x, tags: x.tags.filter((n) => n !== name) }));
  });
}

export function hashtagsIn(text) {
  return [...text.matchAll(HASHTAG_RE)].map((m) => m[2]);
}

/** よく使う #ハッシュタグ(多い順) */
export function allHashtags() {
  const counts = new Map();
  activeMemos().forEach((m) => new Set(hashtagsIn(`${m.title}\n${m.body}`)).forEach((h) => counts.set(h, (counts.get(h) ?? 0) + 1)));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** 前が文字でない「#」から始まる言葉(URL の # は含めない) */
export const HASHTAG_RE = /(^|[^\p{L}\p{N}_/&])[#＃]([\p{L}\p{N}_ー・]+)/gu;

export function useWord(text) {
  state.quickWords = state.quickWords.map((w) => (w.text === text ? { ...w, uses: w.uses + 1 } : w));
  db.set('quickWords', state.quickWords);
}

export function setQuickWords(words) {
  state.quickWords = words;
  db.set('quickWords', words);
  emit();
}

// ---- 設定 ----

export function updateSettings(patch) {
  const from = state.settings.language;
  state.settings = { ...state.settings, ...patch };
  if (patch.language) {
    setLang(patch.language);
    swapDefaults(from, patch.language);
  }
  db.set('settings', state.settings);
  emit();
}

/** 初期のタグと簡単ワードを、まだ使っていなければ新しい言語のものに入れ替える */
function swapDefaults(from, to) {
  if (from === to) return;
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const used = new Set(state.memos.flatMap((m) => m.tags));
  if (same(state.tags.map((x) => x.name), DEFAULT_TAGS[from] ?? []) && !state.tags.some((x) => used.has(x.name))) {
    state.tags = DEFAULT_TAGS[to].map(defaultTag);
    db.set('tags', state.tags);
  }
  if (same(state.quickWords.map((w) => w.text), DEFAULT_WORDS[from] ?? []) && state.quickWords.every((w) => !w.uses)) {
    state.quickWords = DEFAULT_WORDS[to].map((text) => ({ text, uses: 0 }));
    db.set('quickWords', state.quickWords);
  }
}

export function updatePersona(patch) {
  const old = state.settings.persona;
  const next = { ...old, ...patch };
  if (old.image && old.image !== next.image) db.deleteImage(old.image);
  updateSettings({ persona: next });
}

export function resetPersona() {
  updatePersona({ ...DEFAULT_PERSONA, aboutUser: state.settings.persona.aboutUser });
}

// ---- 写真 ----

const urlCache = new Map();

/** 写真の表示用 URL(端末の中の画像) */
export async function imageUrl(name) {
  if (!name) return null;
  if (urlCache.has(name)) return urlCache.get(name);
  const blob = await db.getImage(name);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(name, url);
  return url;
}

/** 選んだ写真を長辺1600pxに縮めて JPEG で保存し、ファイル名を返す(Android 版と同じ大きさ) */
export async function importImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    const name = `${uuid()}.jpg`;
    await db.putImage(name, blob);
    return name;
  } catch {
    say(t('photoFailed'));
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- AI(押した時だけ。写真は送らない) ----

function needKey() {
  if (state.settings.apiKey.trim()) return false;
  say(t('needKey'));
  return true;
}

async function runAi(id, task, fn) {
  if (state.busy || needKey()) return;
  const memo = getMemo(id);
  if (!memo) return;
  if (!memo.title.trim() && !memo.body.trim()) {
    say(t('memoEmpty'));
    return;
  }
  setState({ busy: { memoId: id, task } });
  try {
    await fn(memo, state.settings.apiKey.trim(), state.settings.model);
  } catch (e) {
    say(e instanceof ai.AiError ? e.message : t('aiUnreadable'));
  } finally {
    setState({ busy: null });
  }
}

const userTurn = (memo) => [{ fromUser: true, text: plainText(memo) }];

export function commentOn(id) {
  return runAi(id, 'comment', async (memo, key, model) => {
    if (!memo.body.trim()) { say(t('noBody')); return; }
    const p = state.settings.persona;
    const text = await ai.generate(key, model, ai.commentPrompt(p), userTurn(memo));
    updateMemo(id, (m) => ({ ...m, aiComment: text, aiCommentBy: p.name, aiCommentIcon: personaGlyph(p), blocks: m.blocks.map((b) => ({ ...b, comment: '' })) }));
  });
}

export function polish(id, bullets) {
  return runAi(id, 'polish', async (memo, key, model) => {
    const text = await ai.generate(key, model, bullets ? ai.POLISH_BULLETS : ai.POLISH_PROSE, userTurn(memo));
    updateMemo(id, (m) => ({ ...m, aiSummary: text }));
  });
}

export function ideas(id) {
  return runAi(id, 'ideas', async (memo, key, model) => {
    const text = await ai.generate(key, model, ai.IDEAS, userTurn(memo));
    updateMemo(id, (m) => ({ ...m, aiIdeas: text }));
  });
}

/** タイトルと、一覧の中からのタグ、自由な #ハッシュタグ を提案してもらう */
export function titleAndTags(id) {
  return runAi(id, 'title', async (memo, key, model) => {
    const names = state.tags.map((t) => t.name);
    const json = ai.extractJson(await ai.generate(key, model, ai.titleTagsPrompt(names), userTurn(memo), true));
    const clean = (list) => (Array.isArray(list) ? list : []).map((t) => String(t).trim().replace(/^[#＃]/, '').replace(/\s+/g, '_')).filter(Boolean);
    const existing = new Set(hashtagsIn(plainText(memo)));
    setState({
      suggestion: {
        memoId: id,
        title: String(json.title ?? '').trim(),
        // 一覧にないタグは、AI が出してきても使わない
        tags: clean(json.tags).filter((t) => names.includes(t) && !memo.tags.includes(t)),
        hashtags: [...new Set(clean(json.hashtags))].filter((h) => !existing.has(h)).slice(0, 3),
      },
    });
  });
}

// ---- 返信(X と同じく、投稿の下に自分のコメントと人物の返事が並ぶ) ----
// memo.chat に {fromUser, text, at, by?, icon?} を順に入れる(Android 版の会話と同じ場所)

/** 自分の返信を足す。ask なら続けて人物に返事をもらう */
export async function addReply(id, text, ask = false) {
  const msg = { fromUser: true, text: text.trim(), at: Date.now() };
  if (!msg.text) return;
  const memo = updateMemo(id, (m) => ({ ...m, chat: [...m.chat, msg] }));
  if (ask) await askReply(id, memo.chat.length - 1);
}

export function deleteReply(id, index) {
  updateMemo(id, (m) => ({ ...m, chat: m.chat.filter((_, i) => i !== index) }));
}

/**
 * index 番目の(自分の)返信に、人物が返事をする。そこまでの会話と投稿、
 * 人物が先に書いたコメントを踏まえて答え、返事はその返信のすぐ後ろに入る
 */
export async function askReply(id, index) {
  if (state.busy || needKey()) return;
  const memo = getMemo(id);
  if (!memo) return;
  const p = state.settings.persona;
  // 同じ側の発言が続く時はまとめる(Gemini は交互の会話を前提にしている)
  const turns = [];
  for (const c of memo.chat.slice(0, index + 1)) {
    const last = turns[turns.length - 1];
    if (last && last.fromUser === c.fromUser) last.text += `\n\n${c.text}`;
    else turns.push({ fromUser: c.fromUser, text: c.text });
  }
  if (!turns.length || !turns[turns.length - 1].fromUser) return;
  setState({ busy: { memoId: id, task: 'chat', index } });
  try {
    const reply = await ai.generate(state.settings.apiKey.trim(), state.settings.model,
      ai.chatPrompt(plainText(memo), p, memo.aiComment), turns);
    const msg = { fromUser: false, text: reply.trim(), at: Date.now(), by: p.name, icon: personaGlyph(p) };
    updateMemo(id, (m) => ({ ...m, chat: [...m.chat.slice(0, index + 1), msg, ...m.chat.slice(index + 1)] }));
  } catch (e) {
    say(e instanceof ai.AiError ? e.message : t('aiUnreadable'));
  } finally {
    setState({ busy: null });
  }
}

/** その日全体のまとめ(jung = false)か、人物のコメント(jung = true) */
export async function reviewDay(key, jung) {
  if (state.dayBusy || needKey()) return;
  const posts = activeMemos().filter((m) => memoDate(m) === key && !isBlank(m)).sort((a, b) => a.createdAt - b.createdAt);
  if (!posts.length) { say(t('noDayPosts')); return; }
  const text = posts.map((m) => `【${m.allDay ? 'Diary' : formatTime(m.createdAt)}】\n${plainText(m)}`).join('\n\n').slice(0, 30000);
  const p = state.settings.persona;
  setState({ dayBusy: { date: key, jung } });
  try {
    const result = (await ai.generate(state.settings.apiKey.trim(), state.settings.model, jung ? ai.dayCommentPrompt(p) : ai.DAY_SUMMARY, [{ fromUser: true, text }])).trim();
    const note = state.dayNotes[key] ?? { summary: '', jung: '', jungBy: '', jungIcon: '' };
    setDayNote(key, jung ? { ...note, jung: result, jungBy: p.name, jungIcon: personaGlyph(p) } : { ...note, summary: result });
  } catch (e) {
    say(e instanceof ai.AiError ? e.message : t('aiUnreadable'));
  } finally {
    setState({ dayBusy: null });
  }
}

export function setDayNote(key, note) {
  const notes = { ...state.dayNotes };
  if (!note.summary?.trim() && !note.jung?.trim()) delete notes[key];
  else notes[key] = note;
  state.dayNotes = notes;
  db.set('dayNotes', notes);
  emit();
}

export function clearDayNote(key, jung) {
  const note = state.dayNotes[key];
  if (note) setDayNote(key, jung ? { ...note, jung: '' } : { ...note, summary: '' });
}

/** 期間の振り返り(週・月) */
export async function reviewPeriod(startKey, endKey, label) {
  if (state.reviewBusy || needKey()) return;
  const target = activeMemos().filter((m) => { const k = memoDate(m); return k >= startKey && k <= endKey && !isBlank(m); })
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!target.length) { say(t('noPeriodPosts', { label })); return; }
  const text = target.map((m) => `【${memoDate(m)} ${m.allDay ? 'Diary' : formatTime(m.createdAt)}】\n${plainText(m)}`).join('\n\n').slice(0, 30000);
  setState({ reviewBusy: true });
  try {
    const result = await ai.generate(state.settings.apiKey.trim(), state.settings.model, ai.REVIEW, [{ fromUser: true, text }]);
    setState({ review: { label, text: result } });
  } catch (e) {
    say(e instanceof ai.AiError ? e.message : t('aiUnreadable'));
  } finally {
    setState({ reviewBusy: false });
  }
}

export function saveReview() {
  const r = state.review;
  if (!r) return;
  const blocks = [...parseBlocks(r.text), block('PARAGRAPH', t('reviewTag'))];
  addMemo(newMemo({ title: t('reviewTitle', { label: r.label }), blocks, body: toPlainText(blocks) }));
  setState({ review: null, message: t('reviewSaved') });
}

// ---- 消えないための仕組み ----
//
// 1. 版の履歴: メモを開いて書き換え始めた時、書き換える前の中身を残す(1つのメモにつき 20 版まで)。
//    「…」→「以前の版」から戻せる
// 2. まるごとの控え: 1日1回(起動時)と、ゴミ箱を空にする・バックアップを読み込むなどの前に、
//    全メモを端末の中に控える(最大 10 個)。設定 →「自動の控え」から戻せる
// 3. 書き込み待ちの変更は、アプリを閉じる・切り替える時にすぐ保存する

const MAX_VERSIONS = 20;
const MAX_SNAPSHOTS = 10;
let versions = {}; // {memoId: [{at, title, blocks, body}]} 新しい順
let editing = null; // {id, original, saved}

const contentOf = (m) => ({ title: m.title, blocks: m.blocks, body: m.body });
const sameContent = (a, b) => a.title === b.title && JSON.stringify(a.blocks) === JSON.stringify(b.blocks);

/** 編集画面を開いた時。まだ何も変えていないので、元の中身だけ覚えておく */
export function beginEdit(id) {
  const m = getMemo(id);
  editing = m ? { id, original: contentOf(m), saved: false } : null;
}

export function endEdit() {
  editing = null;
}

/** 最初に書き換える直前に、元の中身を版として保存する(1回の編集につき1つ) */
function checkpoint(id) {
  if (!editing || editing.id !== id || editing.saved) return;
  editing.saved = true;
  const o = editing.original;
  if (!o.title.trim() && !o.body.trim() && !o.blocks.some((b) => b.type === 'IMAGE')) return;
  pushVersion(id, o);
}

function pushVersion(id, content) {
  const list = versions[id] ?? [];
  if (list[0] && sameContent(list[0], content)) return;
  versions = { ...versions, [id]: [{ at: Date.now(), ...JSON.parse(JSON.stringify(content)) }, ...list].slice(0, MAX_VERSIONS) };
  db.set('versions', versions).catch(() => {});
}

export const versionsOf = (id) => versions[id] ?? [];

/** 以前の版に戻す。今の中身も版として残すので、戻したことも取り消せる */
export function restoreVersion(id, at) {
  const v = versionsOf(id).find((x) => x.at === at);
  const m = getMemo(id);
  if (!v || !m) return;
  pushVersion(id, contentOf(m));
  const blocks = v.blocks.map((b) => ({ ...b }));
  updateMemo(id, (x) => ({ ...x, title: v.title, blocks, body: toPlainText(blocks) }));
  if (editing?.id === id) editing = { id, original: contentOf(getMemo(id)), saved: false };
  setState({ editorRev: (state.editorRev ?? 0) + 1, message: t('versionRestored') });
}

/** 全メモの控えを作る。daily は1日1回だけ */
export async function autoSnapshot(reason) {
  const list = (await db.get('snapshots').catch(() => null)) ?? [];
  if (reason === 'daily' && list.some((x) => x.reason === 'daily' && dateKey(x.at) === todayKey())) return;
  if (!state.memos.length) return;
  const snap = { at: Date.now(), reason, count: activeMemos().length, memos: JSON.parse(JSON.stringify(state.memos)), dayNotes: state.dayNotes };
  // 古いものから消す。ただし毎日の控えを少なくとも 5 つは残す
  let next = [snap, ...list];
  while (next.length > MAX_SNAPSHOTS) {
    const dailies = next.filter((x) => x.reason === 'daily').length;
    const victim = [...next].reverse().find((x) => (dailies > 5 ? true : x.reason !== 'daily')) ?? next[next.length - 1];
    next = next.filter((x) => x !== victim);
  }
  await db.set('snapshots', next);
}

/** 控えの一覧(中身は除いて、日時と件数だけ) */
export async function listSnapshots() {
  const list = (await db.get('snapshots').catch(() => null)) ?? [];
  return list.map(({ at, reason, count }) => ({ at, reason, count }));
}

/**
 * 控えから戻す。控えにあるメモはその時の中身に戻し、控えのあとに書いたメモはそのまま残す。
 * 戻す前の状態も控えに入れるので、やり直せる
 */
export async function restoreSnapshot(at) {
  const list = (await db.get('snapshots').catch(() => null)) ?? [];
  const snap = list.find((x) => x.at === at);
  if (!snap) return;
  flushSaves();
  await autoSnapshot('beforeRestore');
  const byId = new Map(state.memos.map((m) => [m.id, m]));
  const changed = [];
  for (const raw of snap.memos) {
    const m = normalizeMemo(raw);
    const cur = byId.get(m.id);
    if (cur && !sameContent(contentOf(cur), contentOf(m))) pushVersion(m.id, contentOf(cur));
    if (!cur || JSON.stringify(cur) !== JSON.stringify(m)) { byId.set(m.id, m); changed.push(m); }
  }
  await db.putMemos(changed);
  state.memos = [...byId.values()];
  const notes = { ...(snap.dayNotes ?? {}), ...state.dayNotes };
  state.dayNotes = notes;
  await db.set('dayNotes', notes);
  setState({ editorRev: (state.editorRev ?? 0) + 1, message: t('snapshotRestored', { n: changed.length }) });
}
