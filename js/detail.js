// 投稿の詳細(Twitter のスレッドを開いた形 + Notion のようなブロックエディタ)と、人物との会話
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import { t, yearL } from './i18n.js';
import {
  ProfileAvatar, PersonaAvatar, AiAvatar, AutoText, ActionSheet, TagSheet, TagPill, DateCapsule,
  usePostMenu, ReplyItem, copyText, shareText,
} from './ui.js';
import { BlockEditor, TYPE_LABEL } from './editor.js';
import { findUrls, formatDateTime, formatTime, hostOf } from './util.js';

export function Detail({ id }) {
  const st = S.state;
  const memo = S.getMemo(id);
  const [title, setTitle] = useState(memo?.title ?? '');
  const [aiMenu, setAiMenu] = useState(false);
  const [jungMenu, setJungMenu] = useState(false);
  const [formatMenu, setFormatMenu] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [words, setWords] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const photoInput = useRef();
  const cameraInput = useRef();
  const editor = useRef({});
  const menu = usePostMenu();
  if (!memo) return html`<div class="screen"><${NavBar} title="" /></div>`;

  const p = st.settings.persona;
  const busy = st.busy?.memoId === id ? st.busy.task : null;
  const author = S.authorOf(p, memo.aiCommentBy ?? '', memo.aiCommentIcon ?? '');
  // 本文を外から書き換えた時(AI の文章を足すなど)は、エディタを作り直して新しい中身を見せる
  const rebuild = () => setEditorKey((k) => k + 1);
  const append = (text) => { S.appendText(id, text); rebuild(); };

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) { const n = await S.importImage(f); if (n) added.push(n); }
    if (added.length) editor.current.insertImages(added);
  };
  const urls = findUrls(memo.body);
  const hashtags = [...new Set(S.hashtagsIn(memo.body))];

  return html`<div class="screen">
    <${NavBar} title=${memo.allDay ? t('diary') : t('post')} right=${html`<div class="glass-group">
      <button class="glass-icon" aria-label="AI" disabled=${!!st.busy} onClick=${() => setAiMenu(true)}>${Icon.sparkle(20)}</button>
      <button class="glass-icon glyph-btn" aria-label=${p.name} disabled=${!!st.busy} onClick=${() => setJungMenu(true)}>${S.personaGlyph(p)}</button>
      <button class="glass-icon" aria-label=${t('more')} onClick=${() => menu.openMenu(memo)}>${Icon.more(18)}</button>
    </div>`} />

    <div class="scroll detail">
      <div class="detail-head">
        <${ProfileAvatar} size=${44} />
        <div class="flex"><div class="name-lg">${st.settings.profileName}</div>
          <div class="muted small-text">${memo.allDay ? t('diary') : `${formatTime(memo.createdAt)} · `}${memo.allDay ? '' : yearL(memo.createdAt)}</div></div>
        <${DateCapsule} date=${S.memoDate(memo)} small />
      </div>
      <input class="title-input" placeholder=${t('titleOptional')} aria-label=${t('titleOptional')} value=${title}
        onInput=${(e) => { setTitle(e.target.value); S.setMemoTitle(id, e.target.value); }} />
      <${BlockEditor} key=${editorKey} memo=${memo} focusRef=${editor} />
      <button class="tap-to-write" aria-label=${t('write')} onClick=${() => editor.current.focusEnd()}></button>

      ${(urls.length > 0 || hashtags.length > 0) && html`<div class="pills pad">
        ${urls.map((u) => html`<a class="link-chip" href=${u} target="_blank" rel="noopener">${Icon.link(14)} ${hostOf(u)}</a>`)}
        ${hashtags.map((h) => html`<button class="link-chip hashtag-chip" onClick=${() => S.open({ name: 'search', q: `#${h}` })}>#${h}</button>`)}
      </div>`}
      <div class="pills pad">
        ${memo.tags.map((tg) => html`<${TagPill} name=${tg} onClick=${() => setTagSheet(true)} />`)}
        <button class="chip" onClick=${() => setTagSheet(true)}>${Icon.tag(16)} ${memo.tags.length ? t('editTags') : t('addTag')}</button>
      </div>
      ${(memo.place || memo.weather || memo.steps != null) && html`<div class="meta-line muted">${[memo.place, memo.weather, memo.steps != null ? t('steps', { n: memo.steps }) : ''].filter(Boolean).join(' · ')}</div>`}

      <div class="detail-actions">
        <button class="act" aria-label=${t('talkWith', { name: p.name })} onClick=${() => S.open({ name: 'chat', id })}>${Icon.reply(20)}${memo.chat.length > 0 && html`<span>${memo.chat.length}</span>`}</button>
        <button class=${`act glyph-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${t('commentOf', { name: p.name })} disabled=${!!st.busy} onClick=${() => S.commentOn(id)}>${busy === 'comment' ? html`<span class="spinner"></span>` : S.personaGlyph(p)}</button>
        <button class="act" aria-label=${t('polishAi')} disabled=${!!st.busy} onClick=${() => S.polish(id, false)}>${busy === 'polish' ? html`<span class="spinner"></span>` : Icon.sparkle(20)}</button>
        <button class="act" aria-label=${t('share')} onClick=${() => shareText(S.plainText(memo))}>${Icon.share(20)}</button>
      </div>
      ${(busy === 'ideas' || busy === 'title') && html`<div class="pad muted"><div class="progress"><span></span></div>${busy === 'ideas' ? t('expanding') : t('findingTitle')}</div>`}

      ${(memo.aiComment || busy === 'comment') && html`<${ReplyItem} avatar=${html`<${PersonaAvatar} by=${memo.aiComment ? memo.aiCommentBy ?? '' : null} icon=${memo.aiCommentIcon ?? ''} />`}
        name=${memo.aiComment ? author.name : p.name} meta=${t('replyingTo', { name: st.settings.profileName })} busy=${busy === 'comment'} foldable=${memo.aiComment.length > 160}
        menu=${[
          { label: t('commentAgain'), disabled: !!st.busy, onClick: () => S.commentOn(id) },
          { label: t('talkWith', { name: p.name }), onClick: () => S.open({ name: 'chat', id }) },
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

      ${memo.chat.slice(-4).map((c) => html`<${ReplyItem} avatar=${c.fromUser ? html`<${ProfileAvatar} />` : html`<${PersonaAvatar} />`}
        name=${c.fromUser ? st.settings.profileName : p.name} meta=${t('chat')}><p class="reply-text clamp6">${c.text}</p></${ReplyItem}>`)}
      ${memo.chat.length > 0 && html`<button class="link-btn strong pad" onClick=${() => S.open({ name: 'chat', id })}>${t('continueChat', { n: memo.chat.length })}</button>`}
      <p class="footnote">${t('updated', { d: formatDateTime(memo.updatedAt) })}</p>
    </div>

    ${words && html`<div class="word-row bar-top">${[...st.quickWords].sort((a, b) => b.uses - a.uses).map((w) => html`<button class="word"
      onMouseDown=${(e) => e.preventDefault()} onClick=${() => { S.useWord(w.text); editor.current.insertText(w.text); }}>${w.text}</button>`)}</div>`}
    <div class="toolbar-wrap">
      <div class="toolbar glass">
        <button class="tb-btn" aria-label=${t('format')} onMouseDown=${(e) => e.preventDefault()} onClick=${() => setFormatMenu(true)}><span class="aa">Aa</span></button>
        <button class="tb-btn" aria-label=${t('photo')} onClick=${() => photoInput.current.click()}>${Icon.photo(22)}</button>
        <button class="tb-btn" aria-label=${t('camera')} onClick=${() => cameraInput.current.click()}>${Icon.camera(22)}</button>
        <button class="tb-btn" aria-label=${t('tags')} onClick=${() => setTagSheet(true)}>${Icon.tag(20)}</button>
        <span class="flex"></span>
        <button class=${`capsule-btn ${words ? 'on' : ''}`} onMouseDown=${(e) => e.preventDefault()} onClick=${() => setWords(!words)}>${t('words')}</button>
      </div>
    </div>
    <input ref=${photoInput} type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    <input ref=${cameraInput} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />

    ${formatMenu && html`<${ActionSheet} title=${`${t('turnInto')}  ·  ${t('blockHint')}`} onClose=${() => setFormatMenu(false)} items=${[
      ...S.BLOCK_TYPES.map((type) => ({ label: TYPE_LABEL()[type], onClick: () => editor.current.setType(type) })),
      { divider: true },
      { label: t('moveUp'), onClick: () => editor.current.move(-1) },
      { label: t('moveDown'), onClick: () => editor.current.move(1) },
      { label: t('deleteBlock'), danger: true, onClick: () => editor.current.removeCurrent() },
    ]} />`}
    ${aiMenu && html`<${ActionSheet} title="AI" onClose=${() => setAiMenu(false)} items=${[
      { label: t('polishProse'), onClick: () => S.polish(id, false) },
      { label: t('polishBullets'), onClick: () => S.polish(id, true) },
      { label: t('expandIdeas'), onClick: () => S.ideas(id) },
      { label: t('titleTags'), onClick: () => S.titleAndTags(id) },
    ]} />`}
    ${jungMenu && html`<${ActionSheet} title=${p.name} onClose=${() => setJungMenu(false)} items=${[
      { label: t('comment'), onClick: () => S.commentOn(id) },
      { label: t('talkWith', { name: p.name }), onClick: () => S.open({ name: 'chat', id }) },
    ]} />`}
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

/** 人物との会話 */
export function Chat({ id }) {
  const st = S.state;
  const memo = S.getMemo(id);
  const [input, setInput] = useState('');
  const end = useRef();
  const p = st.settings.persona;
  const thinking = st.busy?.memoId === id && st.busy.task === 'chat';
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [memo?.chat.length, thinking]);
  if (!memo) return html`<div class="screen"><${NavBar} title="" /></div>`;
  const send = async () => {
    const v = input.trim();
    if (!v) return;
    setInput('');
    if (!(await S.sendChat(id, v))) setInput(v);
  };
  return html`<div class="screen">
    <${NavBar} title=${html`<span class="nav-persona"><${PersonaAvatar} size=${26} /> ${p.name}</span>`}
      right=${memo.chat.length > 0 && html`<button class="pill-btn glass" disabled=${thinking} onClick=${() => { if (confirm(t('confirmClearChat'))) S.updateMemo(id, (m) => ({ ...m, chat: [] })); }}>${t('clear')}</button>`} />
    <div class="scroll chat">
      ${memo.chat.length === 0 && !thinking && html`<p class="empty pre">${t('chatEmpty', { name: p.name })}</p>`}
      ${memo.chat.map((c) => html`<div class=${`bubble ${c.fromUser ? 'me' : 'them'}`}>${c.text}</div>`)}
      ${thinking && html`<div class="bubble them"><span class="spinner"></span></div>`}
      <div ref=${end}></div>
    </div>
    <div class="composer chat-composer">
      <div class="composer-card glass">
        <div class="compose-row">
          <div class="field"><${AutoText} value=${input} onInput=${setInput} placeholder=${t('message')} maxRows=${4} class="field-input" onSubmit=${send} /></div>
          <button class=${`round send ${input.trim() && !st.busy ? 'ready' : ''}`} aria-label=${t('send')} disabled=${!input.trim() || !!st.busy} onClick=${send}>${Icon.send()}</button>
        </div>
      </div>
    </div>
  </div>`;
}
