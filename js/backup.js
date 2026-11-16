// バックアップ(zip)。中身の形は Android 版と同じなので、どちらのバックアップも読み込める
/* global JSZip */
import { db } from './db.js';
import { state, normalizeMemo, memoImages, setState, say, autoSnapshot, flushSaves, updateSettings } from './store.js';
import { todayKey } from './util.js';
import { t } from './i18n.js';

// Android 版の設定の名前と、この版の設定の対応
const KEYS = {
  gemini_api_key: 'apiKey',
  gemini_model: 'model',
  profile_name: 'profileName',
  profile_image: 'profileImage',
  calendar_hidden: 'calendarHidden',
  web_language: 'language',
  web_text_size: 'textSize',
  web_writing_font: 'writingFont',
  web_line_spacing: 'lineSpacing',
  web_editor_margin: 'editorMargin',
};

function settingsJson(includeApiKey) {
  const s = state.settings;
  const out = {};
  for (const [androidKey, key] of Object.entries(KEYS)) {
    if (androidKey === 'gemini_api_key' && !includeApiKey) continue;
    const v = s[key];
    if (v === '' || v === undefined) continue;
    out[androidKey] = typeof v === 'boolean' ? { t: 'b', v } : { t: 's', v: String(v) };
  }
  out.theme_mode = { t: 's', v: s.theme.toUpperCase() };
  out.persona = { t: 's', v: JSON.stringify(s.persona) };
  return out;
}

/** zip を作る。memos を渡すとその分だけ(年ごとの保管)、full なら設定も入れる */
export async function buildZip({ memos = state.memos, full = false, includeApiKey = false, dayNotes = state.dayNotes } = {}) {
  const zip = new JSZip();
  zip.file('memos.json', JSON.stringify(memos));
  zip.file('tags.json', JSON.stringify(state.tags));
  zip.file('quick_words.json', JSON.stringify(state.quickWords));
  zip.file('day_notes.json', JSON.stringify(dayNotes));
  if (full) zip.file('settings.json', JSON.stringify(settingsJson(includeApiKey)));
  const names = new Set(memos.flatMap(memoImages));
  if (full) [state.settings.profileImage, state.settings.persona.image].filter(Boolean).forEach((n) => names.add(n));
  for (const name of names) {
    const blob = await db.getImage(name);
    if (blob) zip.file(`images/${name}`, blob);
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

/**
 * ファイルを渡す。iPhone では共有シート(「ファイルに保存」や Google ドライブを選べる)、
 * 使えなければダウンロード。共有を閉じた時は false
 */
export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/zip' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return true;
}

export async function backup(full = false, includeApiKey = false) {
  try {
    const blob = await buildZip({ full, includeApiKey });
    const name = `${full ? 'thememo-all' : 'thememo-backup'}-${todayKey()}.zip`;
    if (await saveFile(blob, name)) {
      if (full) updateSettings({ lastBackupAt: Date.now() });
      say(full ? t('backedUpAll') : t('backedUp'));
    }
  } catch {
    say(t('backupFailed'));
  }
}

/** バックアップを読み込む。メモは今あるものに足す(同じメモは新しい方を残す) */
export async function restore(file) {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    say(t('notZip'));
    return;
  }
  const read = async (name) => {
    const f = zip.file(name);
    return f ? JSON.parse(await f.async('string')) : null;
  };
  const memos = await read('memos.json');
  if (!Array.isArray(memos)) {
    say(t('notBackup'));
    return;
  }
  // 読み込む前の状態を控えておく
  flushSaves();
  await autoSnapshot('beforeImport').catch(() => {});
  // 写真
  const imageFiles = zip.file(/^images\/[^/]+$/);
  const existing = new Set(await db.imageNames());
  for (const f of imageFiles) {
    const name = f.name.split('/').pop();
    if (!existing.has(name)) await db.putImage(name, await f.async('blob'));
  }
  // メモ
  const byId = new Map(state.memos.map((m) => [m.id, m]));
  const changed = [];
  for (const raw of memos) {
    const m = normalizeMemo(raw);
    const cur = byId.get(m.id);
    if (!cur || m.updatedAt > cur.updatedAt) { byId.set(m.id, m); changed.push(m); }
  }
  await db.putMemos(changed);
  state.memos = [...byId.values()];
  // タグ・簡単ワード・一日のまとめ
  const tags = (await read('tags.json')) ?? [];
  const known = new Set(state.tags.map((t) => t.name));
  state.tags = [...state.tags, ...tags.filter((t) => !known.has(t.name))];
  await db.set('tags', state.tags);
  const words = (await read('quick_words.json')) ?? [];
  const uses = new Map(state.quickWords.map((w) => [w.text, w.uses]));
  words.forEach((w) => uses.set(w.text, Math.max(uses.get(w.text) ?? 0, w.uses ?? 0)));
  state.quickWords = [...uses].map(([text, n]) => ({ text, uses: n })).sort((a, b) => b.uses - a.uses);
  await db.set('quickWords', state.quickWords);
  const notes = (await read('day_notes.json')) ?? {};
  const merged = { ...state.dayNotes };
  for (const [k, n] of Object.entries(notes)) {
    const cur = merged[k] ?? { summary: '', jung: '', jungBy: '', jungIcon: '' };
    merged[k] = cur.jung ? { ...cur, summary: cur.summary || n.summary } : { ...n, summary: cur.summary || n.summary };
  }
  state.dayNotes = merged;
  await db.set('dayNotes', merged);
  const message = t('restored', { n: memos.length });
  const settings = await read('settings.json');
  setState({ pendingSettings: settings ? { settings, message } : null, message: settings ? null : message });
}

/** 読み込んだバックアップの設定を、今の設定に置き換える */
export async function applySettings(json) {
  const s = { ...state.settings };
  for (const [androidKey, key] of Object.entries(KEYS)) {
    if (json[androidKey]) s[key] = json[androidKey].v;
  }
  if (json.theme_mode) s.theme = String(json.theme_mode.v).toLowerCase();
  if (json.persona) {
    try { s.persona = { ...s.persona, ...JSON.parse(json.persona.v) }; } catch { /* 読めなければ今のまま */ }
  }
  state.settings = s;
  await db.set('settings', s);
  setState({ pendingSettings: null, message: t('settingsRestored') });
}

export function yearsWithMemos() {
  const counts = new Map();
  state.memos.forEach((m) => { const y = new Date(m.createdAt).getFullYear(); counts.set(y, (counts.get(y) ?? 0) + 1); });
  return [...counts].sort((a, b) => b[0] - a[0]);
}

/**
 * その年のメモ・写真・一日のまとめをファイルにして渡し、渡せたら端末から外す。
 * 作った zip を読み直して件数が合わなければ、何も消さない
 */
export async function archiveYear(year) {
  const target = state.memos.filter((m) => new Date(m.createdAt).getFullYear() === year);
  if (!target.length) return;
  const notes = Object.fromEntries(Object.entries(state.dayNotes).filter(([k]) => k.startsWith(`${year}-`)));
  try {
    const blob = await buildZip({ memos: target, dayNotes: notes });
    const check = await JSZip.loadAsync(blob);
    const count = JSON.parse(await check.file('memos.json').async('string')).length;
    if (count !== target.length) throw new Error('count mismatch');
    if (!(await saveFile(blob, `thememo-${year}.zip`))) return;
    if (!confirm(t('archiveConfirm', { y: year, n: target.length }))) return;
    await autoSnapshot('beforeArchive').catch(() => {});
    const ids = new Set(target.map((m) => m.id));
    state.memos = state.memos.filter((m) => !ids.has(m.id));
    for (const id of ids) await db.deleteMemo(id);
    const used = new Set([...state.memos.flatMap(memoImages), state.settings.profileImage, state.settings.persona.image]);
    for (const name of target.flatMap(memoImages)) if (!used.has(name)) await db.deleteImage(name);
    const rest = { ...state.dayNotes };
    Object.keys(notes).forEach((k) => delete rest[k]);
    state.dayNotes = rest;
    await db.set('dayNotes', rest);
    say(t('archived', { y: year, n: target.length }));
  } catch {
    say(t('archiveFailed'));
  }
}
