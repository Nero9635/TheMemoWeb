// ホーム: カレンダー(週 → 月 → 隠す)+ 日をまたいで続くタイムライン + 下の入力欄
import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import {
  Img, ProfileAvatar, PersonaAvatar, AiAvatar, Linkified, DateCapsule, TagPill, AutoText, ActionSheet,
  TagSheet, usePostMenu, longPress, shareText, copyText, ReplyItem,
} from './ui.js';
import {
  addDays, dateKey, formatDay, formatTime, hostOf, findUrls, parseDateKey, todayKey, weekStartOf, haptic,
} from './util.js';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

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

export function Home() {
  const st = S.state;
  const today = todayKey();
  const memos = S.activeMemos();
  const feed = useMemo(() => buildFeed(memos, today, st.selected, st.dayNotes), [st.memos, st.selected, st.dayNotes, today]);
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
    const headers = el.querySelectorAll('[data-day]');
    let current = null;
    for (const h of headers) {
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

  const goLatest = () => {
    stick.current = true;
    S.setState({ selected: today });
    setWeekStart(weekStartOf(today));
    scrollToEnd();
  };

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const title = mode === 'month'
    ? `${month.slice(0, 4)}年${Number(month.slice(5))}月`
    : week[0].slice(5, 7) === week[6].slice(5, 7)
      ? `${week[0].slice(0, 4)}年${Number(week[0].slice(5, 7))}月`
      : `${Number(week[0].slice(5, 7))}月〜${Number(week[6].slice(5, 7))}月`;

  const review = () => {
    if (mode === 'month') {
      const [y, m] = month.split('-').map(Number);
      S.reviewPeriod(`${month}-01`, dateKey(new Date(y, m, 0)), `${y}年${m}月`);
    } else {
      S.reviewPeriod(week[0], week[6], `${formatDay(week[0])}〜${formatDay(week[6])}`);
    }
  };

  return html`<div class="screen home">
    <div class="safe-top"></div>
    ${!typing && mode !== 'hidden' && html`<header class="home-bar">
      <button class="title-btn" onClick=${() => { if (mode === 'month') setCal('week'); else { setMonth((st.selected || today).slice(0, 7)); setCal('month'); } }}
        aria-label=${mode === 'month' ? 'Show week' : 'Show month'}>${title}<span class="accent">${mode === 'month' ? Icon.chevronUp() : Icon.chevronDown()}</span></button>
      <span class="flex"></span>
      <button class="icon-btn accent" aria-label="Search" onClick=${() => S.open({ name: 'search' })}>${Icon.search()}</button>
      <button class="icon-btn accent" aria-label="AI review" disabled=${st.reviewBusy} onClick=${review}>${st.reviewBusy ? html`<span class="spinner"></span>` : Icon.sparkle()}</button>
      <button class="icon-btn accent" aria-label="Settings" onClick=${() => S.open({ name: 'settings' })}>${Icon.gear()}</button>
    </header>`}
    ${mode === 'hidden' && !typing && html`<header class="home-bar compact">
      <span class="flex"></span>
      <button class="icon-btn accent" aria-label="Search" onClick=${() => S.open({ name: 'search' })}>${Icon.search()}</button>
      <button class="icon-btn accent" aria-label="Settings" onClick=${() => S.open({ name: 'settings' })}>${Icon.gear()}</button>
    </header>`}

    ${mode !== 'hidden' && html`<${WeekdayRow} />`}
    ${mode === 'week' && html`<${WeekStrip} week=${week} today=${today} selected=${st.selected} memos=${memos}
      onPick=${jumpTo} onPrev=${() => setWeekStart(addDays(weekStart, -7))} onNext=${() => setWeekStart(addDays(weekStart, 7))}
      onExpand=${() => { setMonth(st.selected.slice(0, 7)); setCal('month'); }} onHide=${() => setCal('hidden')} />`}
    ${mode === 'month' && !typing && html`<${MonthGrid} month=${month} today=${today} selected=${st.selected} memos=${memos}
      onMonth=${setMonth} onPick=${(k) => { setCal('week'); jumpTo(k); }} />`}
    ${!typing && html`<${Handle} mode=${mode} onChange=${setCal} />`}

    <div class="feed" ref=${scroller} onScroll=${onScroll}>
      <div>
        ${feed.map((day) => html`<${DaySection} key=${day.date} day=${day} today=${today} menu=${menu} />`)}
        ${memos.length === 0 && html`<div class="empty"><strong>No posts yet</strong><p>下の入力欄に、思いついたことを書いて送ってみましょう。</p></div>`}
      </div>
    </div>
    ${!atEnd && html`<button class="latest" onClick=${goLatest}>${Icon.chevronDown(14)} Latest</button>`}

    <${Composer} onTyping=${setTyping} onPosted=${() => { stick.current = true; S.setState({ selected: today }); setWeekStart(weekStartOf(today)); }} />
    ${menu.view}
  </div>`;
}

function WeekdayRow() {
  return html`<div class="weekdays" aria-hidden="true">${WEEK.map((w, i) => html`<span class=${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>${w}</span>`)}</div>`;
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

function DayButton({ date, today, selected, has, onPick, hidden = false }) {
  const cls = `day ${date === today ? 'today' : date === selected ? 'selected' : ''} ${has ? 'has' : ''}`;
  return html`<button class=${cls} style=${hidden ? 'visibility:hidden' : ''} aria-label=${formatDay(date)} onClick=${() => onPick(date)}>
    <span class="num">${Number(date.slice(8))}</span><span class="dot" aria-hidden="true"></span>
  </button>`;
}

function WeekStrip({ week, today, selected, memos, onPick, onPrev, onNext, onExpand, onHide }) {
  const has = new Set(memos.map(S.memoDate));
  return html`<div class="week-strip" ...${swipe({ left: onNext, right: onPrev, down: onExpand, up: onHide })}>
    ${week.map((d) => html`<${DayButton} date=${d} today=${today} selected=${selected} has=${has.has(d)} onPick=${onPick} />`)}
  </div>`;
}

function MonthGrid({ month, today, selected, memos, onMonth, onPick }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const has = new Set(memos.map(S.memoDate));
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => dateKey(new Date(y, m - 1, i + 1)))];
  while (cells.length < 42) cells.push(null);
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); onMonth(dateKey(d).slice(0, 7)); };
  return html`<div class="month-grid" ...${swipe({ up: () => shift(1), down: () => shift(-1), left: () => shift(1), right: () => shift(-1) })}>
    ${cells.map((d) => (d
      ? html`<${DayButton} date=${d} today=${today} selected=${selected} has=${has.has(d)} onPick=${onPick} />`
      : html`<span class="day" aria-hidden="true"></span>`))}
  </div>`;
}

/** 取っ手。下へで「隠す → 週 → 月」、上へで逆。押すと次の形へ */
function Handle({ mode, onChange }) {
  const next = { hidden: 'week', week: 'month', month: 'week' };
  return html`<button class="handle" aria-label=${mode === 'hidden' ? 'Show calendar' : mode === 'week' ? 'Show month' : 'Show week'}
    onClick=${() => onChange(next[mode])}
    ...${swipe({ down: () => onChange(mode === 'hidden' ? 'week' : 'month'), up: () => onChange(mode === 'month' ? 'week' : 'hidden') })}>
    <span></span>
  </button>`;
}

function DaySection({ day, today, menu }) {
  const st = S.state;
  const [aiOpen, setAiOpen] = useState(false);
  const busy = st.dayBusy?.date === day.date;
  const p = st.settings.persona;
  const note = day.note;
  return html`<section>
    <div class="day-header" data-day=${day.date} style=${`--day:${''}`}>
      <${DateCapsule} date=${day.date} />
      ${day.date === today && html`<span class="today-label">Today</span>`}
      <span class="flex"></span>
      <button class="icon-btn muted" aria-label="AI for this day" disabled=${busy} onClick=${() => setAiOpen(true)}>${busy ? html`<span class="spinner"></span>` : Icon.sparkle(20)}</button>
      <button class="link-btn strong" onClick=${() => { const d = S.diaryFor(day.date); S.open({ name: 'detail', id: d.id }); }}>Diary</button>
    </div>
    <div class="day-line" style=${`background:${dayLine(day.date)}`}></div>
    ${day.posts.map((m) => html`<${Post} key=${m.id} memo=${m} menu=${menu} />`)}
    ${(note || busy) && html`<div class="day-review">
      ${(note?.summary || (busy && !st.dayBusy.jung)) && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name="Day summary" meta=${formatDay(day.date)} line=${false}
        busy=${busy && !st.dayBusy.jung} foldable=${(note?.summary ?? '').length > 160}
        menu=${[
          { label: 'Summarize again', onClick: () => S.reviewDay(day.date, false) },
          { label: 'Copy', onClick: () => copyText(note.summary) },
          { label: 'Remove', danger: true, onClick: () => S.clearDayNote(day.date, false) },
        ]}>${note?.summary && html`<p class="reply-text">${note.summary}</p>`}</${ReplyItem}>`}
      ${(note?.jung || (busy && st.dayBusy.jung)) && html`<${ReplyItem}
        avatar=${html`<${PersonaAvatar} by=${note?.jung ? note.jungBy ?? '' : null} icon=${note?.jungIcon ?? ''} />`}
        name=${S.authorOf(p, note?.jung ? note.jungBy ?? '' : null, note?.jungIcon ?? '').name} meta=${`on ${formatDay(day.date)}`} line=${false}
        busy=${busy && st.dayBusy.jung} foldable=${(note?.jung ?? '').length > 160}
        menu=${[
          { label: 'Comment again', onClick: () => S.reviewDay(day.date, true) },
          { label: 'Copy', onClick: () => copyText(note.jung) },
          { label: 'Remove', danger: true, onClick: () => S.clearDayNote(day.date, true) },
        ]}>${note?.jung && html`<p class="reply-text">${note.jung}</p>`}</${ReplyItem}>`}
    </div>`}
    ${aiOpen && html`<${ActionSheet} title=${formatDay(day.date)} onClose=${() => setAiOpen(false)} items=${[
      { label: 'Summarize the day', icon: Icon.sparkle(20), onClick: () => S.reviewDay(day.date, false) },
      { label: `${p.name} on the day`, icon: html`<span class="glyph">${S.personaGlyph(p)}</span>`, onClick: () => S.reviewDay(day.date, true) },
    ]} />`}
  </section>`;
}

function dayLine(key) {
  return ['#C62828', '#7E57C2', '#E64A19', '#0288D1', '#388E3C', '#F2B705', '#3949AB'][parseDateKey(key).getDay()];
}

/** タイムラインの1件 */
function Post({ memo, menu }) {
  const st = S.state;
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const bodyRef = useRef();
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

  return html`<article class="post" onClick=${open} ...${longPress(() => { haptic(); menu.openMenu(memo, preview); })}>
    <${ProfileAvatar} />
    <div class="post-main">
      <div class="post-head">
        <strong class="ellipsis">${st.settings.profileName}</strong>
        <span class="muted"> · ${memo.allDay ? 'Diary' : formatTime(memo.createdAt)}</span>
        <span class="flex"></span>
        <button class="icon-btn small muted" aria-label="More" onClick=${(e) => { e.stopPropagation(); menu.openMenu(memo); }}>${Icon.more()}</button>
      </div>
      ${memo.title.trim() && html`<div class="post-title">${memo.title}</div>`}
      ${memo.body.trim() && html`<p ref=${bodyRef} class=${`post-body ${expanded ? '' : 'clamp8'}`}><${Linkified} text=${memo.body.trim()} /></p>`}
      ${overflow && !expanded && html`<button class="link-btn strong show-more" onClick=${(e) => { e.stopPropagation(); setExpanded(true); }}>Show more</button>`}
      ${images.length > 0 && html`<${Media} names=${images} />`}
      ${urls.slice(0, 1).map((u) => html`<a class="link-card" href=${u} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>
        <span class="link-host">${Icon.link()} ${hostOf(u)}</span></a>`)}
      ${memo.tags.length > 0 && html`<div class="pills">${memo.tags.map((t) => html`<${TagPill} name=${t} onClick=${() => menu.openTags(memo)} />`)}</div>`}
      ${(memo.place || memo.weather || memo.steps != null) && memo.allDay && html`<div class="details muted">
        ${[memo.place, memo.weather, memo.steps != null ? `${memo.steps} steps` : ''].filter(Boolean).join(' · ')}</div>`}
      <div class="actions" onClick=${(e) => e.stopPropagation()}>
        <button class="act" aria-label="Replies" onClick=${open}>${Icon.reply()}${S.replyCount(memo) > 0 && html`<span>${S.replyCount(memo)}</span>`}</button>
        <button class=${`act glyph-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${`Ask ${persona.name}`}
          onClick=${() => (memo.aiComment ? open() : S.commentOn(memo.id))}>${jungBusy ? html`<span class="spinner"></span>` : S.personaGlyph(persona)}</button>
        <button class="act" aria-label="Tags" onClick=${() => menu.openTags(memo)}>${Icon.tag()}${memo.tags.length > 0 && html`<span>${memo.tags.length}</span>`}</button>
        <button class="act" aria-label="Share" onClick=${() => shareText(S.plainText(memo))}>${Icon.share()}</button>
      </div>
    </div>
  </article>`;
}

/** 写真: 1枚は大きく、2枚は横、3枚以上は2×2(5枚目から「+n」) */
export function Media({ names }) {
  const shown = names.slice(0, 4);
  return html`<div class=${`media n${Math.min(names.length, 4)}`}>
    ${shown.map((n, i) => html`<div class="cell"><${Img} name=${n} class="media-img" />
      ${i === 3 && names.length > 4 && html`<span class="more-count">+${names.length - 4}</span>`}</div>`)}
  </div>`;
}

/** 画面の下にいつもある入力欄 */
function Composer({ onTyping, onPosted }) {
  const st = S.state;
  const [text, setText] = useState('');
  const [images, setImages] = useState([]);
  const [tags, setTags] = useState([]);
  const [tools, setTools] = useState(false);
  const [words, setWords] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [listening, setListening] = useState(false);
  const recog = useRef(null);
  const photoInput = useRef();
  const cameraInput = useRef();
  const canSend = text.trim() || images.length;
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

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

  // 音声入力(Safari の音声認識。使えない端末ではボタンを出さない)
  const dictate = () => {
    if (listening) { recog.current?.stop(); return; }
    const r = new Speech();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.continuous = false;
    const base = text;
    r.onresult = (e) => {
      const said = [...e.results].map((x) => x[0].transcript).join('');
      setText(base ? `${base}${base.endsWith('\n') ? '' : ' '}${said}` : said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recog.current = r;
    setListening(true);
    r.start();
  };

  const insertWord = (w) => {
    S.useWord(w);
    setText((t) => (t ? `${t}${t.endsWith(' ') || t.endsWith('\n') ? '' : ' '}${w}` : w));
  };

  return html`<div class="composer" onfocusin=${() => onTyping(true)} onfocusout=${() => onTyping(false)}>
    ${tools && html`<div class="tools">
      <button class="tool" onClick=${() => photoInput.current.click()}><span>${Icon.photo(26)}</span>Photos</button>
      <button class="tool" onClick=${() => cameraInput.current.click()}><span>${Icon.camera(26)}</span>Camera</button>
      <button class="tool" onClick=${() => setTagSheet(true)}><span>${Icon.tag(26)}</span>${tags.length ? `Tags (${tags.length})` : 'Tags'}</button>
      <button class="tool" onClick=${() => setWords(!words)}><span>${Icon.words(26)}</span>Words</button>
    </div>`}
    ${tools && words && html`<div class="word-row">${[...st.quickWords].sort((a, b) => b.uses - a.uses).map((w) => html`<button class="word" onClick=${() => insertWord(w.text)}>${w.text}</button>`)}</div>`}
    ${(images.length > 0 || tags.length > 0) && html`<div class="pending">
      ${images.map((n) => html`<div class="thumb"><${Img} name=${n} class="thumb-img" />
        <button class="thumb-x" aria-label="Remove photo" onClick=${() => setImages(images.filter((x) => x !== n))}>${Icon.close(12)}</button></div>`)}
      ${tags.map((t) => html`<${TagPill} name=${`${t} ✕`} onClick=${() => setTags(tags.filter((x) => x !== t))} />`)}
    </div>`}
    <div class="compose-row">
      <button class=${`round ${tools ? 'on' : ''}`} aria-label=${tools ? 'Close tools' : 'Add photo or tag'} onClick=${() => setTools(!tools)}>${tools ? Icon.close() : Icon.plus()}</button>
      <div class="field">
        <${AutoText} value=${text} onInput=${setText} placeholder="Write…" label="Write a post" maxRows=${5} class="field-input" onSubmit=${send} />
        ${Speech && !text && html`<button class=${`icon-btn small ${listening ? 'listening' : 'muted'}`} aria-label=${listening ? 'Stop dictation' : 'Dictate'} onClick=${dictate}>${Icon.mic()}</button>`}
      </div>
      <button class=${`round send ${canSend ? 'ready' : ''}`} aria-label="Post" disabled=${!canSend} onClick=${send}>${Icon.send()}</button>
    </div>
    <input ref=${photoInput} type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    <input ref=${cameraInput} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    ${tagSheet && html`<${TagSheet} selected=${tags} onChange=${setTags} onClose=${() => setTagSheet(false)} />`}
  </div>`;
}
