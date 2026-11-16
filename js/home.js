// ホーム: カレンダー(週 → 月 → 隠す)+ 日をまたいで続くタイムライン + 下の入力欄
import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { t, locale, formatMonthL, weekdayHeaders, formatMonthShortL } from './i18n.js';
import {
  Img, ProfileAvatar, PersonaAvatar, AiAvatar, DateCapsule, TagPill, AutoText, ActionSheet,
  TagSheet, usePostMenu, longPress, shareText, copyText, ReplyItem, tagColor, Linkified, StarButton,
} from './ui.js';
import { BlockView, toggleTodo } from './editor.js';
import { addDays, dateKey, formatDay, formatTime, hostOf, findUrls, parseDateKey, todayKey, weekStartOf, haptic } from './util.js';

/** タイムラインの並び: 日付の見出し → その日の投稿(日記が先頭)→ その日のまとめ */
function buildFeed(memos, today, selected, notes) {
  const byDate = new Map();
  memos.forEach((m) => {
    const k = S.memoDate(m);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(m);
  });
  [today, selected].forEach((k) => { if (!byDate.has(k)) byDate.set(k, []); });
  return [...byDate.keys()].sort().map((date) => ({
    date,
    posts: byDate.get(date).sort((a, b) => (a.allDay === b.allDay ? a.createdAt - b.createdAt : a.allDay ? -1 : 1)),
    note: notes[date],
  }));
}

/** カレンダーに出す、日ごとのまとめ(投稿数・写真・日記・タグの色・AIのまとめ) */
function dayInfo(memos, notes) {
  const map = new Map();
  for (const m of memos) {
    if (S.isBlank(m)) continue;
    const k = S.memoDate(m);
    if (!map.has(k)) map.set(k, { posts: 0, photos: 0, diary: false, tags: [], firstPhoto: null });
    const d = map.get(k);
    d.posts += 1;
    const imgs = S.memoImages(m);
    d.photos += imgs.length;
    if (!d.firstPhoto && imgs.length) d.firstPhoto = imgs[0];
    if (m.allDay) { d.diary = true; if (m.mood) d.mood = m.mood; }
    if (m.starred) d.starred = true;
    m.tags.forEach((tg) => { if (!d.tags.includes(tg)) d.tags.push(tg); });
  }
  for (const k of Object.keys(notes)) {
    if (!map.has(k)) map.set(k, { posts: 0, photos: 0, diary: false, tags: [], firstPhoto: null });
    map.get(k).ai = true;
  }
  return map;
}

/** 今日(今日がまだなら昨日)から何日続けて書いているか */
function streak(info, today) {
  let k = info.get(today)?.posts ? today : addDays(today, -1);
  let n = 0;
  while (info.get(k)?.posts) { n += 1; k = addDays(k, -1); }
  return n;
}

function rangeStats(info, start, end) {
  let posts = 0; let photos = 0; let days = 0;
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const d = info.get(k);
    if (d?.posts) { posts += d.posts; photos += d.photos; days += 1; }
  }
  return { posts, photos, days };
}

export function Home() {
  const st = S.state;
  const today = todayKey();
  // 何も書いていない投稿(開いただけの日記など)はタイムラインに出さない
  const memos = S.activeMemos().filter((m) => !S.isBlank(m));
  const feed = useMemo(() => buildFeed(memos, today, st.selected, st.dayNotes), [st.memos, st.selected, st.dayNotes, today]);
  const info = useMemo(() => dayInfo(memos, st.dayNotes), [st.memos, st.dayNotes]);
  const [mode, setMode] = useState(st.settings.calendarHidden ? 'hidden' : 'week'); // week | month | hidden
  const [weekStart, setWeekStart] = useState(weekStartOf(st.selected));
  const [month, setMonth] = useState(st.selected.slice(0, 7));
  const [typing, setTyping] = useState(false);
  const scroller = useRef();
  const stick = useRef(true); // 最新の投稿に張り付いているか
  const [atEnd, setAtEnd] = useState(true);
  const menu = usePostMenu();

  const setCal = (m) => {
    setMode(m);
    if ((m === 'hidden') !== st.settings.calendarHidden) S.updateSettings({ calendarHidden: m === 'hidden' });
  };

  const scrollToEnd = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // 起動時と投稿した時は最新へ。写真が後から読み込まれて伸びても追いかける
  useLayoutEffect(() => { if (stick.current) scrollToEnd(); });
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => { if (stick.current) scrollToEnd(); });
    ro.observe(el.firstElementChild);
    const release = () => { stick.current = false; };
    el.addEventListener('touchstart', release, { passive: true });
    el.addEventListener('wheel', release, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener('touchstart', release); el.removeEventListener('wheel', release); };
  }, []);

  // スクロールに合わせて、カレンダーの選択日も動かす
  const onScroll = () => {
    const el = scroller.current;
    setAtEnd(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (stick.current) return;
    let current = null;
    for (const h of el.querySelectorAll('[data-day]')) {
      if (h.offsetTop - el.scrollTop <= 4) current = h.dataset.day;
      else break;
    }
    if (current && current !== S.state.selected) {
      S.setState({ selected: current });
      setWeekStart(weekStartOf(current));
    }
  };

  const jumpTo = (key) => {
    stick.current = false;
    S.setState({ selected: key });
    setWeekStart(weekStartOf(key));
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector(`[data-day="${key}"]`);
      if (el) scroller.current.scrollTop = el.offsetTop;
    });
  };

  const goToday = () => {
    stick.current = true;
    S.setState({ selected: today });
    setWeekStart(weekStartOf(today));
    setMonth(today.slice(0, 7));
    scrollToEnd();
  };

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [my, mm] = (mode === 'month' ? month : week[3].slice(0, 7)).split('-').map(Number);
  const title = formatMonthL(my, mm);
  const monthStart = `${month}-01`;
  const monthEnd = dateKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0));
  const stats = mode === 'month' ? rangeStats(info, monthStart, monthEnd) : rangeStats(info, week[0], week[6]);
  const days = streak(info, today);

  const review = () => {
    if (mode === 'month') S.reviewPeriod(monthStart, monthEnd, formatMonthL(my, mm));
    else S.reviewPeriod(week[0], week[6], `${formatDay(week[0])} – ${formatDay(week[6])}`);
  };

  const showingToday = mode === 'month' ? month === today.slice(0, 7) && st.selected === today : week.includes(today) && st.selected === today;

  return html`<div class="screen home">
    <div class="safe-top"></div>
    ${!typing && html`<header class="home-bar">
      <button class="title-btn" aria-label=${mode === 'month' ? t('showWeek') : t('showMonth')}
        onClick=${() => { if (mode === 'month') setCal('week'); else { setMonth(st.selected.slice(0, 7)); setCal('month'); } }}>
        <span>${title}</span><span class="accent chev-btn">${mode === 'month' ? Icon.chevronUp(14) : Icon.chevronDown(14)}</span></button>
      <span class="flex"></span>
      ${!showingToday && html`<button class="pill-btn glass" onClick=${goToday}>${t('today')}</button>`}
      <div class="glass-group">
        <button class="glass-icon" aria-label=${t('search')} onClick=${() => S.open({ name: 'search' })}>${Icon.search(20)}</button>
        <button class="glass-icon" aria-label=${t('aiReview')} disabled=${st.reviewBusy || mode === 'hidden'} onClick=${review}>${st.reviewBusy ? html`<span class="spinner"></span>` : Icon.sparkle(20)}</button>
        <button class="glass-icon" aria-label=${t('settings')} onClick=${() => S.open({ name: 'settings' })}>${Icon.gear(20)}</button>
      </div>
    </header>`}

    ${mode !== 'hidden' && html`<section class=${`cal-card ${typing ? 'compact' : ''}`} aria-label=${title}>
      <${WeekdayRow} />
      ${(mode === 'week' || typing) && html`<${WeekStrip} week=${week} today=${today} selected=${st.selected} info=${info}
        onPick=${jumpTo} onPrev=${() => setWeekStart(addDays(weekStart, -7))} onNext=${() => setWeekStart(addDays(weekStart, 7))}
        onExpand=${() => { setMonth(st.selected.slice(0, 7)); setCal('month'); }} onHide=${() => setCal('hidden')} />`}
      ${mode === 'month' && !typing && html`<${MonthGrid} month=${month} today=${today} selected=${st.selected} info=${info}
        onMonth=${setMonth} onPick=${(k) => S.setState({ selected: k })} />`}
      ${!typing && html`<div class="cal-foot">
        <div class="stats">
          <span class="stat"><strong>${stats.posts}</strong> ${t('statPosts')}</span>
          <span class="stat"><strong>${stats.days}</strong> ${t('statDays')}</span>
          <span class="stat"><strong>${stats.photos}</strong> ${t('statPhotos')}</span>
          ${days > 0 && html`<span class="stat streak"><strong>${days}</strong> ${t('statStreak')}</span>`}
        </div>
        ${mode === 'month' && html`<${SelectedDay} date=${st.selected} info=${info.get(st.selected)} note=${st.dayNotes[st.selected]}
          onOpen=${() => { setCal('week'); jumpTo(st.selected); }} />`}
      </div>`}
    </section>`}
    ${!typing && html`<${Handle} mode=${mode} onChange=${setCal} />`}

    <div class="feed" ref=${scroller} onScroll=${onScroll}>
      <div>
        ${feed.map((day) => html`<${DaySection} key=${day.date} day=${day} today=${today} menu=${menu} />`)}
        ${memos.length === 0 && html`<div class="empty"><strong>${t('noPostsYet')}</strong><p>${t('noPostsHint')}</p></div>`}
      </div>
    </div>
    ${!atEnd && html`<button class="latest glass" onClick=${goToday}>${Icon.chevronDown(14)} ${t('latest')}</button>`}

    <${Composer} onTyping=${setTyping} onPosted=${() => { stick.current = true; S.setState({ selected: today }); setWeekStart(weekStartOf(today)); }} />
    ${menu.view}
  </div>`;
}

function WeekdayRow() {
  return html`<div class="weekdays" aria-hidden="true">${weekdayHeaders().map((w, i) => html`<span class=${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>${w}</span>`)}</div>`;
}

/** 縦や横のスワイプを見分ける */
function swipe({ up, down, left, right }) {
  let start = null;
  return {
    onPointerDown: (e) => { start = [e.clientX, e.clientY]; },
    onPointerUp: (e) => {
      if (!start) return;
      const dx = e.clientX - start[0];
      const dy = e.clientY - start[1];
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      if (Math.abs(dy) > Math.abs(dx)) (dy > 0 ? down : up)?.();
      else (dx > 0 ? right : left)?.();
    },
    onPointerCancel: () => { start = null; },
  };
}

/** その日の印: タグの色の点(なければ青)を最大3つ */
function Dots({ d }) {
  if (!d?.posts) return html`<span class="dots"></span>`;
  const colors = d.tags.slice(0, 3).map(tagColor);
  while (colors.length < Math.min(d.posts, 3)) colors.push('var(--accent)');
  return html`<span class="dots" aria-hidden="true">${colors.map((c) => html`<i style=${`background:${c}`}></i>`)}</span>`;
}

function dayLabel(date, d) {
  const parts = [formatDay(date)];
  if (d?.posts) parts.push(d.posts === 1 ? t('onePost') : t('nPosts', { n: d.posts }));
  if (d?.diary) parts.push(t('hasDiary'));
  if (d?.starred) parts.push(t('starred'));
  return parts.join(', ');
}

function WeekStrip({ week, today, selected, info, onPick, onPrev, onNext, onExpand, onHide }) {
  return html`<div class="week-strip" ...${swipe({ left: onNext, right: onPrev, down: onExpand, up: onHide })}>
    ${week.map((date) => {
      const d = info.get(date);
      const dow = parseDateKey(date).getDay();
      return html`<button class=${`wday ${date === today ? 'today' : ''} ${date === selected ? 'selected' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}`}
        aria-label=${dayLabel(date, d)} aria-current=${date === today ? 'date' : undefined} onClick=${() => onPick(date)}>
        <span class="num">${Number(date.slice(8))}</span>
        <${Dots} d=${d} />
        <span class="marks">${d?.diary && (d.mood ? html`<i class="mark mood" aria-hidden="true">${S.moodEmoji(d.mood)}</i>` : html`<i class="mark diary" aria-hidden="true"></i>`)}${d?.starred && html`<i class="mark star" aria-hidden="true">★</i>`}${d?.ai && html`<i class="mark ai" aria-hidden="true">✦</i>`}</span>
      </button>`;
    })}
  </div>`;
}

/** 月全体。上下(または左右)にスワイプで前後の月。写真のある日は小さな写真、投稿の数、日記と AI の印 */
function MonthGrid({ month, today, selected, info, onMonth, onPick }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const count = new Date(y, m, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, i) => dateKey(new Date(y, m - 1, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); onMonth(dateKey(d).slice(0, 7)); };
  return html`<div>
    <div class="month-nav">
      <button class="glass-icon small" aria-label="Previous month" onClick=${() => shift(-1)}><span style="transform:rotate(90deg);display:inline-flex">${Icon.chevronDown(14)}</span></button>
      <span class="month-nav-label">${formatMonthShortL(((m + 10) % 12) + 1)}</span>
      <span class="flex"></span>
      <span class="month-nav-label">${formatMonthShortL((m % 12) + 1)}</span>
      <button class="glass-icon small" aria-label="Next month" onClick=${() => shift(1)}><span style="transform:rotate(-90deg);display:inline-flex">${Icon.chevronDown(14)}</span></button>
    </div>
    <div class="month-grid" ...${swipe({ up: () => shift(1), down: () => shift(-1), left: () => shift(1), right: () => shift(-1) })}>
      ${cells.map((date) => {
        if (!date) return html`<span class="mday blank" aria-hidden="true"></span>`;
        const d = info.get(date);
        const dow = parseDateKey(date).getDay();
        return html`<button class=${`mday ${date === today ? 'today' : ''} ${date === selected ? 'selected' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''} ${d?.posts ? 'has' : ''}`}
          aria-label=${dayLabel(date, d)} aria-current=${date === today ? 'date' : undefined} onClick=${() => onPick(date)}>
          ${d?.firstPhoto && html`<${Img} name=${d.firstPhoto} class="mday-photo" />`}
          <span class="num">${Number(date.slice(8))}</span>
          <span class="mday-foot">
            <${Dots} d=${d} />
            ${d?.posts > 1 && html`<span class="count">${d.posts}</span>`}
          </span>
          <span class="marks">${d?.diary && (d.mood ? html`<i class="mark mood" aria-hidden="true">${S.moodEmoji(d.mood)}</i>` : html`<i class="mark diary" aria-hidden="true"></i>`)}${d?.starred && html`<i class="mark star" aria-hidden="true">★</i>`}${d?.ai && html`<i class="mark ai" aria-hidden="true">✦</i>`}</span>
        </button>`;
      })}
    </div>
  </div>`;
}

/** 月表示で選んだ日の中身(投稿・写真・日記・タグ・AI のまとめ) */
function SelectedDay({ date, info, note, onOpen }) {
  const d = info ?? { posts: 0, photos: 0, diary: false, tags: [] };
  return html`<div class="sel-day">
    <div class="sel-day-head">
      <${DateCapsule} date=${date} small />
      <span class="muted small-text">${d.posts ? t('dayDetail', { n: d.posts, p: d.photos }) : t('noPosts')}${d.diary ? ` · ${t('hasDiary')}` : ''}</span>
      <span class="flex"></span>
      <button class="pill-btn glass small diary-btn" onClick=${() => { const m = S.diaryFor(date); S.open({ name: 'detail', id: m.id }); }}>${Icon.edit(15)} ${t('diary')}</button>
      ${(d.posts || note) && html`<button class="pill-btn glass small" onClick=${onOpen}>${t('open')}</button>`}
    </div>
    ${d.tags.length > 0 && html`<div class="pills">${d.tags.slice(0, 6).map((tg) => html`<${TagPill} name=${tg} />`)}</div>`}
    ${note?.summary && html`<p class="sel-day-note clamp2">✦ ${note.summary}</p>`}
  </div>`;
}

/** 取っ手。下へで「隠す → 週 → 月」、上へで逆。押すと次の形へ */
function Handle({ mode, onChange }) {
  const next = { hidden: 'week', week: 'month', month: 'week' };
  return html`<button class="handle" aria-label=${mode === 'hidden' ? t('showCalendar') : mode === 'week' ? t('showMonth') : t('showWeek')}
    onClick=${() => onChange(next[mode])}
    ...${swipe({ down: () => onChange(mode === 'hidden' ? 'week' : 'month'), up: () => onChange(mode === 'month' ? 'week' : 'hidden') })}>
    <span></span>
  </button>`;
}

const DAY_LINE = ['#E5484D', '#8E6BD8', '#F06A3B', '#2A9BD8', '#3FA45B', '#E9B21F', '#4D62D6'];

function DaySection({ day, today, menu }) {
  const st = S.state;
  const [aiOpen, setAiOpen] = useState(false);
  const busy = st.dayBusy?.date === day.date;
  const p = st.settings.persona;
  const note = day.note;
  return html`<section>
    <div class="day-header" data-day=${day.date}>
      <span class="day-line" style=${`background:${DAY_LINE[parseDateKey(day.date).getDay()]}`} aria-hidden="true"></span>
      <${DateCapsule} date=${day.date} />
      ${day.date === today && html`<span class="today-label">${t('today')}</span>`}
      <span class="flex"></span>
      <button class="glass-icon small" aria-label=${t('aiForDay')} disabled=${busy} onClick=${() => setAiOpen(true)}>${busy ? html`<span class="spinner"></span>` : Icon.sparkle(16)}</button>
      <button class="pill-btn glass small" onClick=${() => { const d = S.diaryFor(day.date); S.open({ name: 'detail', id: d.id }); }}>${t('diary')}</button>
    </div>
    ${day.posts.map((m) => (m.allDay ? html`<${DiaryCard} key=${m.id} memo=${m} menu=${menu} />` : html`<${Post} key=${m.id} memo=${m} menu=${menu} />`))}
    ${(note || busy) && html`<div class="day-review">
      ${(note?.summary || (busy && !st.dayBusy.jung)) && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name=${t('daySummary')} meta=${formatDay(day.date)} line=${false}
        busy=${busy && !st.dayBusy.jung} foldable=${(note?.summary ?? '').length > 160}
        menu=${[
          { label: t('summarizeAgain'), onClick: () => S.reviewDay(day.date, false) },
          { label: t('copy'), onClick: () => copyText(note.summary) },
          { label: t('remove'), danger: true, onClick: () => S.clearDayNote(day.date, false) },
        ]}>${note?.summary && html`<p class="reply-text">${note.summary}</p>`}</${ReplyItem}>`}
      ${(note?.jung || (busy && st.dayBusy.jung)) && html`<${ReplyItem}
        avatar=${html`<${PersonaAvatar} by=${note?.jung ? note.jungBy ?? '' : null} icon=${note?.jungIcon ?? ''} />`}
        name=${S.authorOf(p, note?.jung ? note.jungBy ?? '' : null, note?.jungIcon ?? '').name} meta=${t('onDay', { d: formatDay(day.date) })} line=${false}
        busy=${busy && st.dayBusy.jung} foldable=${(note?.jung ?? '').length > 160}
        menu=${[
          { label: t('commentAgain'), onClick: () => S.reviewDay(day.date, true) },
          { label: t('copy'), onClick: () => copyText(note.jung) },
          { label: t('remove'), danger: true, onClick: () => S.clearDayNote(day.date, true) },
        ]}>${note?.jung && html`<p class="reply-text">${note.jung}</p>`}</${ReplyItem}>`}
    </div>`}
    ${aiOpen && html`<${ActionSheet} title=${formatDay(day.date)} onClose=${() => setAiOpen(false)} items=${[
      { label: t('summarizeDay'), icon: Icon.sparkle(20), onClick: () => S.reviewDay(day.date, false) },
      { label: t('personaOnDay', { name: p.name }), icon: html`<span class="glyph">${S.personaGlyph(p)}</span>`, onClick: () => S.reviewDay(day.date, true) },
    ]} />`}
  </section>`;
}

/** タイムラインの1件 */
function Post({ memo, menu }) {
  const st = S.state;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const bodyRef = useRef();
  const cardRef = useRef();
  const images = S.memoImages(memo);
  const urls = findUrls(memo.body);
  const persona = st.settings.persona;
  const jungBusy = st.busy?.memoId === memo.id && st.busy.task === 'comment';
  const open = () => S.open({ name: 'detail', id: memo.id });
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && !expanded) setOverflow(el.scrollHeight > el.clientHeight + 2);
  }, [memo.body, expanded]);
  const preview = html`<div class="post preview"><${ProfileAvatar} /><div class="post-main">
    <div class="post-head"><strong>${st.settings.profileName}</strong><span class="muted"> · ${formatTime(memo.createdAt)}</span></div>
    <p class="post-body clamp4">${memo.body}</p></div></div>`;

  return html`<article class=${`post ${memo.starred ? 'is-starred' : ''}`} ref=${cardRef} onClick=${open} ...${longPress(() => { haptic(); menu.openMenu(memo, preview); })}>
    <${ProfileAvatar} />
    <div class="post-main">
      <div class="post-head">
        <strong class="ellipsis">${st.settings.profileName}</strong>
        <span class="muted"> · ${memo.allDay ? t('diary') : formatTime(memo.createdAt)}</span>
        ${memo.starred && html`<span class="head-star" aria-label=${t('starred')}>★</span>`}
        <span class="flex"></span>
        <button class="icon-btn small muted" aria-label=${t('more')} onClick=${(e) => { e.stopPropagation(); menu.openMenu(memo); }}>${Icon.more()}</button>
      </div>
      ${memo.title.trim() && html`<div class="post-title"><${Linkified} text=${memo.title} /></div>`}
      ${memo.body.trim() && html`<div ref=${bodyRef} class=${`post-body ${expanded ? '' : 'folded'} ${overflow && !expanded ? 'fade' : ''}`}>
        <${BlockView} memo=${memo} onToggle=${(id) => toggleTodo(memo, id)} /></div>`}
      <${FoldButton} overflow=${overflow} expanded=${expanded} setExpanded=${setExpanded} cardRef=${cardRef} />
      ${images.length > 0 && html`<${Media} names=${images} />`}
      ${urls.slice(0, 1).map((u) => html`<a class="link-card" href=${u} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>
        <span class="link-host">${Icon.link()} ${hostOf(u)}</span></a>`)}
      ${memo.tags.length > 0 && html`<div class="pills">${memo.tags.map((tg) => html`<${TagPill} name=${tg} onClick=${() => menu.openTags(memo)} />`)}</div>`}
      ${(memo.place || memo.weather || memo.steps != null) && memo.allDay && html`<div class="details muted">
        ${[memo.place, memo.weather, memo.steps != null ? t('steps', { n: memo.steps }) : ''].filter(Boolean).join(' · ')}</div>`}
      <div class="actions" onClick=${(e) => e.stopPropagation()}>
        <button class="act" aria-label=${t('reply')} onClick=${() => S.open({ name: 'detail', id: memo.id, reply: true })}>${Icon.reply()}${S.replyCount(memo) > 0 && html`<span>${S.replyCount(memo)}</span>`}</button>
        <button class=${`act glyph-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${t('ask', { name: persona.name })}
          onClick=${() => (memo.aiComment ? open() : S.commentOn(memo.id))}>${jungBusy ? html`<span class="spinner"></span>` : S.personaGlyph(persona)}</button>
        <button class="act" aria-label=${t('tags')} onClick=${() => menu.openTags(memo)}>${Icon.tag()}${memo.tags.length > 0 && html`<span>${memo.tags.length}</span>`}</button>
        <${StarButton} memo=${memo} />
        <button class="act" aria-label=${t('share')} onClick=${() => shareText(S.plainText(memo))}>${Icon.share()}</button>
      </div>
    </div>
  </article>`;
}

/** タイムラインの日記。紙のような特別なカードに、気分・本文・写真を載せる */
function DiaryCard({ memo, menu }) {
  const st = S.state;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const bodyRef = useRef();
  const cardRef = useRef();
  const images = S.memoImages(memo);
  const persona = st.settings.persona;
  const jungBusy = st.busy?.memoId === memo.id && st.busy.task === 'comment';
  const open = () => S.open({ name: 'detail', id: memo.id });
  const date = parseDateKey(S.memoDate(memo));
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && !expanded) setOverflow(el.scrollHeight > el.clientHeight + 2);
  }, [memo.body, expanded]);
  const details = [memo.place, memo.weather, memo.steps != null ? t('steps', { n: memo.steps }) : ''].filter(Boolean);

  return html`<article class=${`diary-card ${memo.starred ? 'is-starred' : ''}`} ref=${cardRef} onClick=${open} ...${longPress(() => { haptic(); menu.openMenu(memo); })}>
    <div class="diary-top">
      <span class="diary-label">${t('diaryLabel')}</span>
      <span class="diary-date">${date.toLocaleDateString(locale(), { weekday: 'long' })}</span>
      ${memo.starred && html`<span class="head-star" aria-label=${t('starred')}>★</span>`}
      <span class="flex"></span>
      <button class=${`diary-mood ${memo.mood ? 'set' : ''}`} aria-label=${memo.mood ? `${t('mood')}: ${S.moodLabel(memo.mood)}` : t('mood')}
        onClick=${(e) => { e.stopPropagation(); menu.openMood(memo); }}>
        ${memo.mood ? html`<span class="mood-emoji">${S.moodEmoji(memo.mood)}</span>${S.moodLabel(memo.mood)}` : html`<span class="mood-emoji faint">☺︎</span>`}
      </button>
      <button class="icon-btn small muted" aria-label=${t('more')} onClick=${(e) => { e.stopPropagation(); menu.openMenu(memo); }}>${Icon.more()}</button>
    </div>
    ${memo.title.trim() && html`<div class="diary-title"><${Linkified} text=${memo.title} /></div>`}
    ${memo.body.trim() && html`<div ref=${bodyRef} class=${`post-body diary-body ${expanded ? '' : 'folded'} ${overflow && !expanded ? 'fade' : ''}`}>
      <${BlockView} memo=${memo} onToggle=${(id) => toggleTodo(memo, id)} /></div>`}
    <${FoldButton} overflow=${overflow} expanded=${expanded} setExpanded=${setExpanded} cardRef=${cardRef} />
    ${images.length > 0 && html`<${Media} names=${images} />`}
    ${memo.tags.length > 0 && html`<div class="pills">${memo.tags.map((tg) => html`<${TagPill} name=${tg} onClick=${() => menu.openTags(memo)} />`)}</div>`}
    ${details.length > 0 && html`<div class="diary-details muted">${details.join(' · ')}</div>`}
    <div class="actions diary-actions" onClick=${(e) => e.stopPropagation()}>
      <button class="act" aria-label=${t('reply')} onClick=${() => S.open({ name: 'detail', id: memo.id, reply: true })}>${Icon.reply()}${S.replyCount(memo) > 0 && html`<span>${S.replyCount(memo)}</span>`}</button>
      <button class=${`act glyph-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${t('ask', { name: persona.name })}
        onClick=${() => (memo.aiComment ? open() : S.commentOn(memo.id))}>${jungBusy ? html`<span class="spinner"></span>` : S.personaGlyph(persona)}</button>
      <button class="act" aria-label=${t('tags')} onClick=${() => menu.openTags(memo)}>${Icon.tag()}${memo.tags.length > 0 && html`<span>${memo.tags.length}</span>`}</button>
      <${StarButton} memo=${memo} />
      <button class="act" aria-label=${t('share')} onClick=${() => shareText(S.plainText(memo))}>${Icon.share()}</button>
    </div>
  </article>`;
}

/**
 * 長い本文の「もっと見る」と「たたむ」。たたんだ時に投稿の頭が画面の上に隠れていたら、頭まで戻す
 */
function FoldButton({ overflow, expanded, setExpanded, cardRef }) {
  if (!overflow) return null;
  const fold = (e) => {
    e.stopPropagation();
    setExpanded(false);
    requestAnimationFrame(() => {
      const el = cardRef.current;
      const feed = el?.closest('.feed');
      if (!el || !feed) return;
      const top = el.getBoundingClientRect().top - feed.getBoundingClientRect().top;
      if (top < 0) feed.scrollTop += top - 8;
    });
  };
  return expanded
    ? html`<button class="link-btn strong show-more show-less" onClick=${fold}>${Icon.chevronUp(12)} ${t('showLess')}</button>`
    : html`<button class="link-btn strong show-more" onClick=${(e) => { e.stopPropagation(); setExpanded(true); }}>${t('showMore')}</button>`;
}

/** 写真: 1枚は大きく、2枚は横、3枚以上は2×2(5枚目から「+n」) */
export function Media({ names }) {
  const shown = names.slice(0, 4);
  return html`<div class=${`media n${Math.min(names.length, 4)}`}>
    ${shown.map((n, i) => html`<div class="cell"><${Img} name=${n} class="media-img" />
      ${i === 3 && names.length > 4 && html`<span class="more-count">+${names.length - 4}</span>`}</div>`)}
  </div>`;
}

/** 画面の下に浮かぶ入力欄 */
function Composer({ onTyping, onPosted }) {
  const st = S.state;
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [tags, setTags] = useState([]);
  const [tools, setTools] = useState(false);
  const [words, setWords] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const photoInput = useRef();
  const cameraInput = useRef();
  const canSend = text.trim() || images.length;

  const addFiles = async (files) => {
    for (const f of files) {
      const name = await S.importImage(f);
      if (name) setImages((list) => [...list, name]);
    }
  };

  const send = () => {
    if (!canSend) return;
    S.post(text, images, tags);
    haptic();
    setText(''); setImages([]); setTags([]); setTools(false); setWords(false);
    onPosted();
  };

  const insertWord = (w) => {
    S.useWord(w);
    setText((x) => (x ? `${x}${x.endsWith(' ') || x.endsWith('\n') ? '' : ' '}${w}` : w));
  };

  return html`<div class="composer" onfocusin=${() => onTyping(true)} onfocusout=${() => onTyping(false)}>
    <div class="composer-card glass">
      ${tools && html`<div class="tools">
        <button class="tool" onClick=${() => photoInput.current.click()}><span>${Icon.photo(24)}</span>${t('photos')}</button>
        <button class="tool" onClick=${() => cameraInput.current.click()}><span>${Icon.camera(24)}</span>${t('camera')}</button>
        <button class="tool" onClick=${() => setTagSheet(true)}><span>${Icon.tag(24)}</span>${tags.length ? `${t('tags')} (${tags.length})` : t('tags')}</button>
        <button class="tool" onClick=${() => setWords(!words)}><span>${Icon.words(24)}</span>${t('words')}</button>
      </div>`}
      ${tools && words && html`<div class="word-row">${[...st.quickWords].sort((a, b) => b.uses - a.uses).map((w) => html`<button class="word" onClick=${() => insertWord(w.text)}>${w.text}</button>`)}</div>`}
      ${(images.length > 0 || tags.length > 0) && html`<div class="pending">
        ${images.map((n) => html`<div class="thumb"><${Img} name=${n} class="thumb-img" />
          <button class="thumb-x" aria-label=${t('remove')} onClick=${() => setImages(images.filter((x) => x !== n))}>${Icon.close(12)}</button></div>`)}
        ${tags.map((tg) => html`<${TagPill} name=${`${tg} ✕`} onClick=${() => setTags(tags.filter((x) => x !== tg))} />`)}
      </div>`}
      <div class="compose-row">
        <button class=${`round ${tools ? 'on' : ''}`} aria-label=${tools ? t('closeTools') : t('addTools')} onClick=${() => setTools(!tools)}>${tools ? Icon.close() : Icon.plus()}</button>
        <div class="field">
          <${AutoText} value=${text} onInput=${setText} placeholder=${t('write')} label=${t('writeLabel')} maxRows=${6} class="field-input" onSubmit=${send} />
        </div>
        <button class=${`round send ${canSend ? 'ready' : ''}`} aria-label=${t('send')} disabled=${!canSend} onClick=${send}>${Icon.send()}</button>
      </div>
    </div>
    <input ref=${photoInput} type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    <input ref=${cameraInput} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    ${tagSheet && html`<${TagSheet} selected=${tags} onChange=${setTags} onClose=${() => setTagSheet(false)} />`}
  </div>`;
}
