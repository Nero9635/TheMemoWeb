// 投稿の詳細(Twitter のスレッドを開いた形 + Notion のようなブロックエディタ)と、人物との会話
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { t, yearL } from './i18n.js';
import {
  ProfileAvatar, PersonaAvatar, AiAvatar, AutoText, TagSheet, TagPill, DateCapsule,
  usePostMenu, ReplyItem, copyText, shareText, StarButton, PopMenu, Panel,
} from './ui.js';
import { BlockEditor, BlockStatic, TYPE_LABEL, toggleTodo } from './editor.js';
import { findUrls, formatDateTime, formatTime, hostOf } from './util.js';

const lastMine = (memo) => memo.chat.map((c) => c.fromUser).lastIndexOf(true);

/** 「3分前」「14:05」「11月3日」のような返信の時刻 */
function formatAgo(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t('justNow');
  if (min < 60) return t('minAgo', { n: min });
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString() ? formatTime(ms) : formatDateTime(ms);
}

export function Detail({ id, reply = false }) {
  const st = S.state;
  const memo = S.getMemo(id);
  const [title, setTitle] = useState(memo?.title ?? '');
  // 閲覧モードと編集モード。何も書いていなければ編集、書いてあれば閲覧から始める
  const [mode, setMode] = useState(() => (memo && !reply && S.isBlank(memo) ? 'edit' : 'read'));
  const [pop, setPop] = useState(null); // {kind: 'more' | 'ai', rect}
  const [panel, setPanel] = useState(null); // 'format' | 'photo'
  const [tagSheet, setTagSheet] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [focusKind, setFocusKind] = useState(null);
  const blurTimer = useRef(null);
  const titleRef = useRef(null);
  const [, force] = useState(0);
  const photoInput = useRef();
  const cameraInput = useRef();
  const editor = useRef({});
  const menu = usePostMenu();
  const replyBox = useRef();
  // 返信(コメント・会話・返信欄)は吹き出しボタンで出し入れする
  const [thread, setThread] = useState(() => reply || (memo ? S.replyCount(memo) > 0 : false));
  const focusSoon = () => setTimeout(() => {
    const el = replyBox.current;
    if (!el) return;
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
    el.querySelector('textarea')?.focus();
  }, 60);
  const focusReply = () => { setThread(true); focusSoon(); };
  useEffect(() => { if (reply) setTimeout(focusSoon, 300); }, []);
  // 書き換え始めたら、元の中身を「以前の版」として残す
  useEffect(() => { S.beginEdit(id); }, []);
  if (!memo) return html`<div class="screen"><${NavBar} title="" /></div>`;

  const p = st.settings.persona;
  const busy = st.busy?.memoId === id ? st.busy.task : null;
  const author = S.authorOf(p, memo.aiCommentBy ?? '', memo.aiCommentIcon ?? '');
  const editing = mode === 'edit';
  // 入力中(フォーマットや写真のパネルを開いている間も含む)
  const typing = editing && (focusKind === 'editor' || !!panel);
  // 本文を外から書き換えた時(AI の文章を足すなど)は、エディタを作り直して新しい中身を見せる
  const rebuild = () => setEditorKey((k) => k + 1);
  const append = (text) => { S.appendText(id, text); rebuild(); };
  const withThread = (fn) => () => { setThread(true); fn(); };
  const hasMine = memo.chat.some((c) => c.fromUser);

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) { const n = await S.importImage(f); if (n) added.push(n); }
    if (!added.length) return;
    if (editing && editor.current.insertImages) editor.current.insertImages(added);
    else S.updateMemo(id, (m) => {
      const blocks = [...m.blocks, ...added.map((image) => S.block('IMAGE', '', { image }))];
      return { ...m, blocks, body: S.toPlainText(blocks) };
    });
    rebuild();
  };
  const urls = findUrls(memo.body);
  const hashtags = [...new Set(S.hashtagsIn(memo.body))];
  const openPop = (kind) => (e) => setPop({ kind, rect: e.currentTarget.getBoundingClientRect() });
  const openPanel = (kind) => { editor.current.blur?.(); setPanel(kind); };
  const closePanel = () => { setPanel(null); if (editing) editor.current.refocus?.(); };
  const toRead = () => { editor.current.blur?.(); setMode('read'); };

  // AI と人物の操作(右上の「…」と、下の AI ボタンで共通)
  const aiItems = [
    [
      { label: t('commentOf', { name: p.name }), icon: html`<span class="glyph">${S.personaGlyph(p)}</span>`, disabled: !!st.busy, onClick: withThread(() => S.commentOn(id)) },
      hasMine && { label: t('askToReply', { name: p.name }), icon: Icon.reply(18), disabled: !!st.busy, onClick: withThread(() => S.askReply(id, lastMine(memo))) },
    ],
    [
      { label: t('polishProse'), icon: Icon.sparkle(18), disabled: !!st.busy, onClick: withThread(() => S.polish(id, false)) },
      { label: t('polishBullets'), icon: Icon.listBullet(18), disabled: !!st.busy, onClick: withThread(() => S.polish(id, true)) },
      { label: t('expandIdeas'), icon: Icon.sparkle(18), disabled: !!st.busy, onClick: () => S.ideas(id) },
      { label: t('titleTags'), icon: Icon.tag(18), disabled: !!st.busy, onClick: () => S.titleAndTags(id) },
    ],
  ];
  const moreItems = [
    [
      editing ? { label: t('readMode'), icon: Icon.book(18), onClick: toRead } : { label: t('editMode'), icon: Icon.edit(18), onClick: () => setMode('edit') },
    ],
    ...aiItems,
    [
      { label: memo.starred ? t('unstar') : t('star'), icon: memo.starred ? Icon.starFill(18) : Icon.star(18), onClick: () => S.toggleStar(id) },
      { label: t('tags'), icon: Icon.tag(18), onClick: () => setTagSheet(true) },
      { label: memo.allDay ? t('changeDate') : t('changeTime'), icon: Icon.clock(18), onClick: () => menu.openTime(memo) },
      S.versionsOf(id).length > 0 && { label: t('versionHistory'), icon: Icon.clock(18), onClick: () => menu.openHistory(id) },
    ],
    [
      { label: t('copyText'), icon: Icon.copy(18), onClick: () => copyText(S.plainText(memo)) },
      { label: t('share'), icon: Icon.share(18), onClick: () => shareText(S.plainText(memo)) },
    ],
    [
      { label: t('delete'), icon: Icon.trash(18), danger: true, onClick: () => { if (confirm(t('confirmTrash'))) S.trashMemo(id); } },
    ],
  ];

  // どこに書いているか: 本文・タイトル(editor)/ 返信欄(reply)
  const kindOf = (el) => (!el ? null : el.closest?.('.reply-compose') ? 'reply'
    : el.closest?.('.ce') || el.classList?.contains('title-input') ? 'editor' : null);
  const onFocusIn = (e) => { clearTimeout(blurTimer.current); setFocusKind(kindOf(e.target)); };
  const onFocusOut = () => {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setFocusKind(kindOf(document.activeElement)), 120);
  };
  const curType = panel === 'format' ? editor.current.currentType?.() : null;
  const setType = (type) => { editor.current.setType(type); setTimeout(() => force((n) => n + 1), 30); };

  return html`<div class=${`screen ${typing ? 'typing' : ''}`}>
    <${NavBar} title=${memo.allDay ? t('diary') : t('post')} right=${html`
      <div class="mode-switch glass-group" role="radiogroup" aria-label=${t('mode')}>
        <button class=${`mode-btn ${editing ? 'on' : ''}`} role="radio" aria-checked=${editing} aria-label=${t('editMode')} onClick=${() => setMode('edit')}>${Icon.edit(18)}</button>
        <button class=${`mode-btn ${editing ? '' : 'on'}`} role="radio" aria-checked=${!editing} aria-label=${t('readMode')} onClick=${toRead}>${Icon.book(18)}</button>
      </div>
      <button class="glass-icon nav-more" aria-label=${t('more')} aria-haspopup="menu" onClick=${openPop('more')}>${busy ? html`<span class="spinner"></span>` : Icon.more(18)}</button>`} />

    <div class=${`scroll detail ${editing ? 'editing' : 'reading'} ${typing ? 'typing' : ''}`} onfocusin=${onFocusIn} onfocusout=${onFocusOut}>
      <div class="detail-head">
        <${ProfileAvatar} size=${44} />
        <div class="flex"><div class="name-lg">${st.settings.profileName}</div>
          <div class="muted small-text">${memo.allDay ? t('diary') : `${formatTime(memo.createdAt)} · `}${memo.allDay ? '' : yearL(memo.createdAt)}</div></div>
        ${memo.allDay && html`<button class=${`mood-chip ${memo.mood ? 'set' : ''}`} aria-label=${t('mood')} onClick=${() => menu.openMood(memo)}>
          ${memo.mood ? html`<span class="mood-emoji">${S.moodEmoji(memo.mood)}</span>${S.moodLabel(memo.mood)}` : html`<span class="mood-emoji faint">☺︎</span>${t('mood')}`}</button>`}
        <${DateCapsule} date=${S.memoDate(memo)} small time=${memo.allDay ? '' : formatTime(memo.createdAt)}
          label=${memo.allDay ? t('changeDate') : t('changeTime')} onClick=${() => menu.openTime(memo)} />
      </div>

      ${editing
        ? html`<input class="title-input" ref=${titleRef} enterkeyhint="next" placeholder=${t('titleOptional')} aria-label=${t('titleOptional')} value=${title}
            onKeyDown=${(e) => {
              // タイトルで Return / ↓ → 本文のいちばん上へ(Notion と同じ)
              if (e.isComposing || e.keyCode === 229) return;
              if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); editor.current.focusStart?.(); }
            }}
            onInput=${(e) => { setTitle(e.target.value); S.setMemoTitle(id, e.target.value); }} />`
        : memo.title.trim() && html`<h1 class="title-view">${memo.title}</h1>`}

      <!-- タグ: タイトルと本文の間 -->
      ${(editing || memo.tags.length > 0) && html`<div class="tag-line">
        ${memo.tags.map((tg) => html`<${TagPill} name=${tg} onClick=${() => setTagSheet(true)} />`)}
        ${editing && html`<button class="tag-add" onClick=${() => setTagSheet(true)}>${Icon.tag(14)} ${memo.tags.length ? t('edit') : t('addTag')}</button>`}
      </div>`}

      ${editing
        ? html`<${BlockEditor} key=${editorKey} memo=${memo} focusRef=${editor}
            onExitTop=${() => { const el = titleRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }} />
          ${!typing && html`<button class="tap-to-write" aria-label=${t('write')} onClick=${() => editor.current.focusEnd()}></button>`}`
        : html`<div class="read-body" onDblClick=${() => setMode('edit')}>
            ${S.isBlank(memo) ? html`<p class="muted read-empty">${t('nothingYet')}</p>`
              : html`<${BlockStatic} memo=${memo} onToggle=${(bid) => toggleTodo(memo, bid)} />`}
          </div>`}

      <!-- 入力中は本文の下のもの(ボタン・更新日時・返信)を隠す。最後の行の下は道具と 2 行分の余白だけになる -->
      ${!typing && html`<div class="below-text">
      ${(urls.length > 0 || hashtags.length > 0) && html`<div class="pills pad">
        ${urls.map((u) => html`<a class="link-chip" href=${u} target="_blank" rel="noopener">${Icon.link(14)} ${hostOf(u)}</a>`)}
        ${hashtags.map((h) => html`<button class="link-chip hashtag-chip" onClick=${() => S.open({ name: 'search', q: `#${h}` })}>#${h}</button>`)}
      </div>`}
      ${(memo.place || memo.weather || memo.steps != null) && html`<div class="meta-line muted">${[memo.place, memo.weather, memo.steps != null ? t('steps', { n: memo.steps }) : ''].filter(Boolean).join(' · ')}</div>`}

      <div class="detail-actions">
        <button class=${`act ${thread ? 'on' : ''}`} aria-label=${t('reply')} aria-expanded=${thread} onClick=${() => setThread(!thread)}>
          ${Icon.reply(20)}${S.replyCount(memo) > 0 && html`<span>${S.replyCount(memo)}</span>`}</button>
        <button class=${`act ai-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${t('aiAndPersona', { name: p.name })} aria-haspopup="menu" onClick=${openPop('ai')}>
          ${busy ? html`<span class="spinner"></span>` : Icon.sparkle(20)}</button>
        <${StarButton} memo=${memo} />
        <button class="act" aria-label=${t('share')} onClick=${() => shareText(S.plainText(memo))}>${Icon.share(20)}</button>
      </div>
      ${(busy === 'ideas' || busy === 'title') && html`<div class="pad muted"><div class="progress"><span></span></div>${busy === 'ideas' ? t('expanding') : t('findingTitle')}</div>`}

      ${(thread || busy === 'comment' || busy === 'polish' || busy === 'chat') && html`<div class="thread">
      ${(memo.aiComment || busy === 'comment') && html`<${ReplyItem} avatar=${html`<${PersonaAvatar} by=${memo.aiComment ? memo.aiCommentBy ?? '' : null} icon=${memo.aiCommentIcon ?? ''} />`}
        name=${memo.aiComment ? author.name : p.name} meta=${t('replyingTo', { name: st.settings.profileName })} busy=${busy === 'comment'} foldable=${memo.aiComment.length > 160}
        menu=${[
          { label: t('commentAgain'), disabled: !!st.busy, onClick: () => S.commentOn(id) },
          { label: t('reply'), onClick: focusReply },
          { label: t('copy'), onClick: () => copyText(memo.aiComment) },
          { label: t('remove'), danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiComment: '' })) },
        ]}>${memo.aiComment && html`<p class="reply-text">${memo.aiComment}</p>`}</${ReplyItem}>`}

      ${(memo.aiSummary || busy === 'polish') && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name="AI" meta=${t('polished')} busy=${busy === 'polish'}
        menu=${[
          { label: t('polishProseAgain'), disabled: !!st.busy, onClick: () => S.polish(id, false) },
          { label: t('polishBulletsAgain'), disabled: !!st.busy, onClick: () => S.polish(id, true) },
          { divider: true },
          { label: t('appendToPost'), onClick: () => append(memo.aiSummary) },
          { label: t('replacePost'), onClick: () => { if (confirm(t('confirmReplace'))) { S.replaceText(id, memo.aiSummary); rebuild(); } } },
          { label: t('copy'), onClick: () => copyText(memo.aiSummary) },
          { divider: true },
          { label: t('remove'), danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiSummary: '' })) },
        ]}>${memo.aiSummary && html`<${AutoText} class="reply-edit" value=${memo.aiSummary} label="AI"
          onInput=${(v) => S.updateMemo(id, (m) => ({ ...m, aiSummary: v }), 400)} />`}</${ReplyItem}>`}

      ${memo.aiIdeas && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name="AI" meta=${t('ideasLabel')}
        menu=${[
          { label: t('appendToPost'), onClick: () => { append(memo.aiIdeas); S.updateMemo(id, (m) => ({ ...m, aiIdeas: '' })); } },
          { label: t('copy'), onClick: () => copyText(memo.aiIdeas) },
          { label: t('remove'), danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiIdeas: '' })) },
        ]}><p class="reply-text">${memo.aiIdeas}</p></${ReplyItem}>`}

      ${memo.chat.map((c, i) => html`<div class="reply-pair" key=${`${i}-${c.at ?? ''}`}>
        <${ReplyItem} avatar=${c.fromUser ? html`<${ProfileAvatar} />` : html`<${PersonaAvatar} by=${c.by ?? null} icon=${c.icon ?? ''} />`}
          name=${c.fromUser ? st.settings.profileName : S.authorOf(p, c.by ?? null, c.icon ?? '').name}
          meta=${c.at ? formatAgo(c.at) : t('reply')}
          menu=${c.fromUser ? [
            { label: t('askToReply', { name: p.name }), disabled: !!st.busy, onClick: () => S.askReply(id, i) },
            { label: t('copy'), onClick: () => copyText(c.text) },
            { label: t('deleteReply'), danger: true, onClick: () => { if (confirm(t('confirmDeleteReply'))) S.deleteReply(id, i); } },
          ] : [
            { label: t('copy'), onClick: () => copyText(c.text) },
            { label: t('deleteReply'), danger: true, onClick: () => { if (confirm(t('confirmDeleteReply'))) S.deleteReply(id, i); } },
          ]}><p class="reply-text">${c.text}</p>
        </${ReplyItem}>
        ${busy === 'chat' && st.busy.index === i && html`<${ReplyItem} avatar=${html`<${PersonaAvatar} />`} name=${p.name} meta=${t('reply')} busy=${true}><span></span></${ReplyItem}>`}
      </div>`)}
      ${thread && html`<div class="reply-compose" ref=${replyBox}>
        <${ReplyComposer} id=${id} persona=${p} />
      </div>`}
      </div>`}
      <p class="footnote">${t('updated', { d: formatDateTime(memo.updatedAt) })}</p>
      </div>`}
    </div>

    <!-- 編集モードの道具: 本文とは別の層に置き、いつもキーボード(画面)のすぐ上に固定する -->
    ${editing && focusKind !== 'reply' && html`<div class="edit-bar-layer">
        <div class="edit-bar" role="toolbar" aria-label=${t('format')}>
          <button class="eb-btn" aria-label=${t('format')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => openPanel('format')}><span class="aa">Aa</span></button>
          <button class="eb-btn" aria-label=${t('blockTodo')} onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => setType(editor.current.currentType?.() === 'TODO' ? 'PARAGRAPH' : 'TODO')}>${Icon.checklist(22)}</button>
          <button class="eb-btn" aria-label=${t('photo')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => openPanel('photo')}>${Icon.photoCamera(22)}</button>
          <span class="eb-sep" aria-hidden="true"></span>
          <button class="eb-btn" aria-label=${t('hideKeyboard')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => editor.current.blur?.()}>${Icon.keyboardDown(22)}</button>
        </div>
      </div>`}


    <input ref=${photoInput} type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    <input ref=${cameraInput} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />

    ${panel === 'format' && html`<${Panel} title=${t('format')} onClose=${closePanel}>
      <div class="fmt-styles" role="radiogroup" aria-label=${t('fmtStyle')}>
        ${[['HEADING1', 'fmtTitle'], ['HEADING2', 'fmtHeading'], ['HEADING3', 'fmtSub'], ['PARAGRAPH', 'fmtBody'], ['CODE', 'fmtMono']].map(([type, key]) => html`<button role="radio"
          aria-checked=${curType === type} class=${`fmt-style fmt-${type.toLowerCase()} ${curType === type ? 'on' : ''}`}
          onMouseDown=${(e) => e.preventDefault()} onClick=${() => setType(type)}>${t(key)}</button>`)}
      </div>
      <div class="fmt-groups">
        <div class="fmt-group" role="group" aria-label=${t('fmtList')}>
          ${[['BULLET', Icon.listBullet(22)], ['NUMBERED', Icon.listNumber(22)], ['TODO', Icon.checklist(22)]].map(([type, icon]) => html`<button
            class=${`fmt-btn ${curType === type ? 'on' : ''}`} aria-label=${TYPE_LABEL()[type]} aria-pressed=${curType === type} title=${TYPE_LABEL()[type]}
            onMouseDown=${(e) => e.preventDefault()} onClick=${() => setType(curType === type ? 'PARAGRAPH' : type)}>${icon}</button>`)}
        </div>
        <div class="fmt-group" role="group" aria-label=${t('fmtBlock')}>
          ${[['QUOTE', Icon.quote(22)], ['CALLOUT', Icon.bulb(22)]].map(([type, icon]) => html`<button
            class=${`fmt-btn ${curType === type ? 'on' : ''}`} aria-label=${TYPE_LABEL()[type]} aria-pressed=${curType === type} title=${TYPE_LABEL()[type]}
            onMouseDown=${(e) => e.preventDefault()} onClick=${() => setType(curType === type ? 'PARAGRAPH' : type)}>${icon}</button>`)}
          <button class="fmt-btn" aria-label=${TYPE_LABEL().DIVIDER} title=${TYPE_LABEL().DIVIDER} onMouseDown=${(e) => e.preventDefault()} onClick=${() => setType('DIVIDER')}>${Icon.divider(22)}</button>
        </div>
      </div>
      <div class="fmt-groups">
        <div class="fmt-group" role="group" aria-label=${t('moveUp')}>
          <button class="fmt-btn" aria-label=${t('moveUp')} title=${t('moveUp')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => editor.current.move(-1)}>${Icon.arrowUp(20)}</button>
          <button class="fmt-btn" aria-label=${t('moveDown')} title=${t('moveDown')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => editor.current.move(1)}>${Icon.arrowDown(20)}</button>
        </div>
        <div class="fmt-group" role="group" aria-label=${t('duplicate')}>
          <button class="fmt-btn" aria-label=${t('duplicate')} title=${t('duplicate')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => { editor.current.duplicate(); force((n) => n + 1); }}>${Icon.copy(20)}</button>
          <button class="fmt-btn" aria-label=${t('insertNow')} title=${t('insertNow')} onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => { editor.current.insertText(`${formatDateTime(Date.now())} `); setPanel(null); }}>${Icon.clock(20)}</button>
        </div>
        <div class="fmt-group single" role="group" aria-label=${t('deleteBlock')}>
          <button class="fmt-btn danger" aria-label=${t('deleteBlock')} title=${t('deleteBlock')} onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => { editor.current.removeCurrent(); setPanel(null); }}>${Icon.trash(20)}</button>
        </div>
      </div>
    </${Panel}>`}
    ${panel === 'photo' && html`<${Panel} title=${t('photo')} onClose=${closePanel}>
      <div class="photo-choices">
        <button class="photo-choice" onClick=${() => { setPanel(null); photoInput.current.click(); }}>${Icon.photo(30)}<span>${t('photoLibrary')}</span></button>
        <button class="photo-choice" onClick=${() => { setPanel(null); cameraInput.current.click(); }}>${Icon.camera(30)}<span>${t('takePhoto')}</span></button>
      </div>
    </${Panel}>`}
    ${pop && html`<${PopMenu} rect=${pop.rect} sections=${pop.kind === 'ai' ? aiItems : moreItems} title=${pop.kind === 'ai' ? (p.name.includes('AI') ? p.name : `AI · ${p.name}`) : ''} onClose=${() => setPop(null)} />`}
    ${tagSheet && html`<${TagSheet} selected=${memo.tags} onChange=${(tg) => S.setMemoTags(id, tg)} onClose=${() => setTagSheet(false)} />`}
    ${st.suggestion?.memoId === id && html`<${Suggestion} s=${st.suggestion} onTitle=${(v) => setTitle(v)} onAppend=${append} />`}
    ${menu.view}
  </div>`;
}

/** AI の提案。タグは一覧の中から、#ハッシュタグ は本文の最後に足す */
function Suggestion({ s, onTitle, onAppend }) {
  const close = () => S.setState({ suggestion: null });
  const apply = () => {
    const memo = S.getMemo(s.memoId);
    const title = s.title || memo.title;
    onTitle(title);
    S.setMemoTitle(s.memoId, title);
    if (s.tags.length) S.setMemoTags(s.memoId, [...new Set([...memo.tags, ...s.tags])]);
    if (s.hashtags.length) onAppend(s.hashtags.map((h) => `#${h}`).join(' '));
    close();
  };
  return html`<div class="backdrop center" onClick=${close}>
    <div class="alert glass" role="alertdialog" aria-label=${t('aiSuggestion')} onClick=${(e) => e.stopPropagation()}>
      <div class="alert-title">${t('aiSuggestion')}</div>
      <p>${t('sugTitle', { v: s.title || t('none') })}</p>
      <p>${t('sugTags', { v: s.tags.join(', ') || t('noMatchingTag') })}</p>
      <p>${t('sugHashtags', { v: s.hashtags.map((h) => `#${h}`).join(' ') || t('none') })}</p>
      <div class="alert-buttons"><button onClick=${close}>${t('cancel')}</button><button class="strong" onClick=${apply}>${t('apply')}</button></div>
    </div>
  </div>`;
}

/** iOS 27 風のナビゲーションバー: 丸いガラスの戻るボタン、中央の題名、右にガラスのボタン */
export function NavBar({ title, right = null }) {
  return html`<div class="safe-top"></div><nav class="nav">
    <button class="glass-icon back-btn" aria-label=${t('back')} onClick=${S.back}>${Icon.back(22)}</button>
    <div class="nav-title">${title}</div>
    <div class="nav-right">${right}</div>
  </nav>`;
}

/** 投稿の下の返信欄(X の「返信をポスト」)。自分の返信だけ / 返信して人物に聞く */
function ReplyComposer({ id, persona }) {
  const st = S.state;
  const [text, setText] = useState('');
  const ready = text.trim() && !st.busy;
  const post = (ask) => {
    if (!text.trim()) return;
    const v = text;
    setText('');
    S.addReply(id, v, ask);
  };
  return html`<div class="reply-composer">
    <${ProfileAvatar} size=${36} />
    <div class="flex">
      <${AutoText} value=${text} onInput=${setText} placeholder=${t('replyPlaceholder')} maxRows=${8} class="reply-input" onSubmit=${() => post(false)} />
      <div class="reply-buttons">
        <button class="pill-btn ask-btn" disabled=${!ready} onClick=${() => post(true)}>
          <span class="glyph">${S.personaGlyph(persona)}</span> ${t('replyAndAsk', { name: persona.name })}</button>
        <button class="pill-btn post-btn" disabled=${!text.trim()} onClick=${() => post(false)}>${t('reply')}</button>
      </div>
    </div>
  </div>`;
}
