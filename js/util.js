// 日付・文字・色など、画面とデータの両方で使う小さな道具
import { formatDayL } from './i18n.js';

/** 端末の時刻での日付キー(YYYY-MM-DD)。Android 版の LocalDate.toString() と同じ形 */
export function dateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return dateKey(new Date());
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** 設定の言語での日付(「Mon, Oct 19」「10月19日(月)」「10月19日 周一」) */
export function formatDay(key) {
  return formatDayL(parseDateKey(key));
}

/** 「8:12」 */
export function formatTime(ms) {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 「2026/10/19 8:12」 */
export function formatDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${formatTime(ms)}`;
}

/** その週の日曜日 */
export function weekStartOf(key) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() - d.getDay());
  return dateKey(d);
}

/** 曜日の色。白い文字が読めるよう、iOS 版では少し濃くしている。金曜だけは濃い文字 */
export function weekdayColor(key) {
  const day = parseDateKey(key).getDay();
  return ['#C62828', '#6A45B0', '#D84315', '#0277BD', '#2E7D32', '#F2B705', '#1F4FB4'][day];
}

export function weekdayTextColor(key) {
  return parseDateKey(key).getDay() === 5 ? '#1F1F1F' : '#FFFFFF';
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Java の String.hashCode と同じ値(タグの既定色を Android 版とそろえるため) */
export function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// ---- タグ ----

/** タグの色(Android 版と同じ順番) */
export const TAG_COLORS = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#A142F4', '#24C1E0', '#FA7B17', '#F538A0', '#8D6E63', '#9AA0A6'];

/** タグの色で、文字と背景の組。背景は薄く、文字は読める濃さに */
const TAG_TEXT = ['#1A56C4', '#B3261E', '#7A5A00', '#1B6E3A', '#7B2FC0', '#00718A', '#B4530A', '#B0186F', '#5D4037', '#5F6368'];

export function tagStyle(tag) {
  const i = Math.max(0, Math.min(TAG_COLORS.length - 1, tag.color ?? 0));
  return `color: ${TAG_TEXT[i]}; background: ${TAG_COLORS[i]}26`;
}

export function defaultTag(name) {
  const n = TAG_COLORS.length;
  return { name, color: ((javaHash(name) % n) + n) % n, icon: 'label' };
}

// ---- リンク ----

const URL_RE = /(https?:\/\/|www\.)[^\s　「」『』（）()<>]+/g;

/** 文章を、普通の文字とリンクの部品に分ける */
export function splitLinks(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0].replace(/[.,!?。、！？:;）」』]+$/, '');
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: url, href: url.startsWith('http') ? url : `https://${url}` });
    last = m.index + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function findUrls(text) {
  return splitLinks(text).filter((p) => p.href).map((p) => p.href);
}

export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** 絵文字の組み合わせも1文字と数えて、先頭の n 文字 */
export function graphemes(text, n) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const parts = [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
    return parts.slice(0, n).join('');
  }
  return [...text].slice(0, n).join('');
}

/** 触覚の手応え(対応端末だけ。iPhone の Safari では何も起きない) */
export function haptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // 対応していなければ何もしない
  }
}
