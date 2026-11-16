// 投稿の詳細(Twitter のスレッドを開いた形)と、人物との会話
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import { Icon } from './icons.js';
import {
  Img, ProfileAvatar, PersonaAvatar, AiAvatar, AutoText, ActionSheet, TagSheet, TagPill, DateCapsule,
  usePostMenu, ReplyItem, copyText, shareText,
} from './ui.js';
import { findUrls, formatDateTime, formatTime, hostOf } from './util.js';

export function Detail({ id }) {
  const st = S.state;
  const memo = S.getMemo(id);
  const [title, setTitle] = useState(memo?.title ?? '');
  const [text, setText] = useState(memo ? S.editableText(memo) : '');
  const [aiMenu, setAiMenu] = useState(false);
  const [jungMenu, setJungMenu] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [words, setWords] = useState(false);
  const photoInput = useRef();
  const cameraInput = useRef();
  const menu = usePostMenu();
  if (!memo) return html`<div class="screen"><${NavBar} title="" /></div>`;

  const p = st.settings.persona;
  const busy = st.busy?.memoId === id ? st.busy.task : null;
  const images = S.memoImages(memo);
  const author = S.authorOf(p, memo.aiCommentBy ?? '', memo.aiCommentIcon ?? '');

  const saveText = (t) => { setText(t); S.setMemoContent(id, { text: t }); };
  const saveTitle = (t) => { setTitle(t); S.setMemoContent(id, { title: t }); };
  const addFiles = async (files) => {
    const added = [];
    for (const f of files) { const n = await S.importImage(f); if (n) added.push(n); }
    S.setMemoContent(id, { text, images: [...images, ...added] });
  };
  const removeImage = (name) => {
    if (!confirm('この写真を外しますか?')) return;
    S.setMemoContent(id, { text, images: images.filter((n) => n !== name) });
  };
  const insertWord = (w) => { S.useWord(w); saveText(text ? `${text}${text.endsWith('\n') ? '' : ' '}${w}` : w); };

  return html`<div class="screen">
    <${NavBar} title=${memo.allDay ? 'Diary' : 'Post'} right=${html`
      <button class="icon-btn accent" aria-label="AI tools" disabled=${!!st.busy} onClick=${() => setAiMenu(true)}>${Icon.sparkle()}</button>
      <button class="icon-btn accent glyph-btn" aria-label=${p.name} disabled=${!!st.busy} onClick=${() => setJungMenu(true)}>${S.personaGlyph(p)}</button>`} />

    <div class="scroll">
      <div class="detail-head">
        <${ProfileAvatar} size=${48} />
        <div class="flex"><div class="name-lg">${st.settings.profileName}</div><div class="muted">${memo.allDay ? 'Diary' : 'Post'}</div></div>
        <button class="icon-btn muted" aria-label="More" onClick=${() => menu.openMenu(memo)}>${Icon.more(20)}</button>
      </div>
      <input class="title-input" placeholder="Title (optional)" aria-label="Title" value=${title} onInput=${(e) => saveTitle(e.target.value)} />
      <${AutoText} class="body-input" value=${text} onInput=${saveText} placeholder="What's happening?" label="Post text" />
      ${(findUrls(text).length > 0 || S.hashtagsIn(text).length > 0) && html`<div class="pills pad">
        ${findUrls(text).map((u) => html`<a class="link-chip" href=${u} target="_blank" rel="noopener">${Icon.link(14)} ${hostOf(u)}</a>`)}
        ${[...new Set(S.hashtagsIn(text))].map((h) => html`<button class="link-chip hashtag-chip" onClick=${() => S.open({ name: 'search', q: `#${h}` })}>#${h}</button>`)}
      </div>`}
      ${images.length > 0 && html`<div class="detail-images">${images.map((n) => html`<button class="detail-img" aria-label="Remove photo" onClick=${() => removeImage(n)}><${Img} name=${n} class="media-img" /></button>`)}</div>`}
      <div class="pills pad">
        ${memo.tags.map((t) => html`<${TagPill} name=${t} onClick=${() => setTagSheet(true)} />`)}
        <button class="chip" onClick=${() => setTagSheet(true)}>${Icon.tag(16)} ${memo.tags.length ? 'Edit tags' : 'Add tag'}</button>
      </div>
      <div class="meta-line">${memo.allDay ? '' : `${formatTime(memo.createdAt)} · `}${new Date(memo.createdAt).getFullYear()}年 <${DateCapsule} date=${S.memoDate(memo)} small /></div>
      ${(memo.place || memo.weather || memo.steps != null) && html`<div class="meta-line muted">${[memo.place, memo.weather, memo.steps != null ? `${memo.steps} steps` : ''].filter(Boolean).join(' · ')}</div>`}

      <div class="detail-actions">
        <button class="act" aria-label=${`Talk with ${p.name}`} onClick=${() => S.open({ name: 'chat', id })}>${Icon.reply(20)}${memo.chat.length > 0 && html`<span>${memo.chat.length}</span>`}</button>
        <button class=${`act glyph-act ${memo.aiComment ? 'persona-color' : ''}`} aria-label=${`${p.name}'s comment`} disabled=${!!st.busy} onClick=${() => S.commentOn(id)}>${busy === 'comment' ? html`<span class="spinner"></span>` : S.personaGlyph(p)}</button>
        <button class="act" aria-label="Polish with AI" disabled=${!!st.busy} onClick=${() => S.polish(id, false)}>${busy === 'polish' ? html`<span class="spinner"></span>` : Icon.sparkle(20)}</button>
        <button class="act" aria-label="Share" onClick=${() => shareText(S.plainText(memo))}>${Icon.share(20)}</button>
      </div>
      ${(busy === 'ideas' || busy === 'title') && html`<div class="pad muted"><div class="progress"><span></span></div>${busy === 'ideas' ? 'Expanding ideas…' : 'Finding a title…'}</div>`}

      ${(memo.aiComment || busy === 'comment') && html`<${ReplyItem} avatar=${html`<${PersonaAvatar} by=${memo.aiComment ? memo.aiCommentBy ?? '' : null} icon=${memo.aiCommentIcon ?? ''} />`}
        name=${memo.aiComment ? author.name : p.name} meta=${`Replying to ${st.settings.profileName}`} busy=${busy === 'comment'} foldable=${memo.aiComment.length > 160}
        menu=${[
          { label: 'Comment again', disabled: !!st.busy, onClick: () => S.commentOn(id) },
          { label: `Talk with ${p.name}`, onClick: () => S.open({ name: 'chat', id }) },
          { label: 'Copy', onClick: () => copyText(memo.aiComment) },
          { label: 'Remove', danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiComment: '' })) },
        ]}>${memo.aiComment && html`<p class="reply-text">${memo.aiComment}</p>`}</${ReplyItem}>`}

      ${(memo.aiSummary || busy === 'polish') && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name="AI" meta="Polished · editable" busy=${busy === 'polish'}
        menu=${[
          { label: 'Polish again: prose', disabled: !!st.busy, onClick: () => S.polish(id, false) },
          { label: 'Polish again: bullets', disabled: !!st.busy, onClick: () => S.polish(id, true) },
          { divider: true },
          { label: 'Append to post', onClick: () => saveText(text ? `${text}\n${memo.aiSummary}` : memo.aiSummary) },
          { label: 'Replace post', onClick: () => { if (confirm('本文をAIの文章に置き換えますか?')) saveText(memo.aiSummary); } },
          { label: 'Copy', onClick: () => copyText(memo.aiSummary) },
          { divider: true },
          { label: 'Remove', danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiSummary: '' })) },
        ]}>${memo.aiSummary && html`<${AutoText} class="reply-edit" value=${memo.aiSummary} label="AI version"
          onInput=${(t) => S.updateMemo(id, (m) => ({ ...m, aiSummary: t }), 400)} />`}</${ReplyItem}>`}

      ${memo.aiIdeas && html`<${ReplyItem} avatar=${html`<${AiAvatar} />`} name="AI" meta="Ideas"
        menu=${[
          { label: 'Append to post', onClick: () => { saveText(text ? `${text}\n${memo.aiIdeas}` : memo.aiIdeas); S.updateMemo(id, (m) => ({ ...m, aiIdeas: '' })); } },
          { label: 'Copy', onClick: () => copyText(memo.aiIdeas) },
          { label: 'Remove', danger: true, onClick: () => S.updateMemo(id, (m) => ({ ...m, aiIdeas: '' })) },
        ]}><p class="reply-text">${memo.aiIdeas}</p></${ReplyItem}>`}

      ${memo.chat.slice(-4).map((c) => html`<${ReplyItem} avatar=${c.fromUser ? html`<${ProfileAvatar} />` : html`<${PersonaAvatar} />`}
        name=${c.fromUser ? st.settings.profileName : p.name} meta="Chat"><p class="reply-text clamp6">${c.text}</p></${ReplyItem}>`)}
      ${memo.chat.length > 0 && html`<button class="link-btn strong pad" onClick=${() => S.open({ name: 'chat', id })}>Continue the conversation (${memo.chat.length})</button>`}
      <p class="footnote">Updated ${formatDateTime(memo.updatedAt)}</p>
    </div>

    ${words && html`<div class="word-row bar-top">${[...st.quickWords].sort((a, b) => b.uses - a.uses).map((w) => html`<button class="word" onClick=${() => insertWord(w.text)}>${w.text}</button>`)}</div>`}
    <div class="toolbar">
      <button class="icon-btn" aria-label="Add photo" onClick=${() => photoInput.current.click()}>${Icon.photo(22)}</button>
      <button class="icon-btn" aria-label="Camera" onClick=${() => cameraInput.current.click()}>${Icon.camera(22)}</button>
      <span class="flex"></span>
      <button class=${`capsule-btn ${words ? 'on' : ''}`} onClick=${() => setWords(!words)}>Words</button>
    </div>
    <input ref=${photoInput} type="file" accept="image/*" multiple hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
    <input ref=${cameraInput} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />

    ${aiMenu && html`<${ActionSheet} title="AI" onClose=${() => setAiMenu(false)} items=${[
      { label: 'Polish into prose', onClick: () => S.polish(id, false) },
      { label: 'Polish into bullets', onClick: () => S.polish(id, true) },
      { label: 'Expand ideas', onClick: () => S.ideas(id) },
      { label: 'Title & tags', onClick: () => S.titleAndTags(id) },
    ]} />`}
    ${jungMenu && html`<${ActionSheet} title=${p.name} onClose=${() => setJungMenu(false)} items=${[
      { label: 'Comment', onClick: () => S.commentOn(id) },
      { label: `Talk with ${p.name}`, onClick: () => S.open({ name: 'chat', id }) },
    ]} />`}
    ${tagSheet && html`<${TagSheet} selected=${memo.tags} onChange=${(t) => S.setMemoTags(id, t)} onClose=${() => setTagSheet(false)} />`}
    ${st.suggestion?.memoId === id && html`<${Suggestion} s=${st.suggestion} text=${text} onTitle=${(t) => setTitle(t)} onText=${saveText} />`}
    ${menu.view}
  </div>`;
}

/** AI の提案。タグは一覧の中から、#ハッシュタグ は本文の最後に足す */
function Suggestion({ s, text, onTitle, onText }) {
  const close = () => S.setState({ suggestion: null });
  const apply = () => {
    const memo = S.getMemo(s.memoId);
    const title = s.title || memo.title;
    onTitle(title);
    S.setMemoContent(s.memoId, { title });
    if (s.tags.length) S.setMemoTags(s.memoId, [...new Set([...memo.tags, ...s.tags])]);
    if (s.hashtags.length) {
      const line = s.hashtags.map((h) => `#${h}`).join(' ');
      onText(text.trim() ? `${text.replace(/\s+$/, '')}\n${line}` : line);
    }
    close();
  };
  return html`<div class="backdrop center" onClick=${close}>
    <div class="alert" role="alertdialog" aria-label="AI suggestion" onClick=${(e) => e.stopPropagation()}>
      <div class="alert-title">AIの提案</div>
      <p>タイトル: ${s.title || '(なし)'}</p>
      <p>タグ: ${s.tags.join('、') || '(一覧に合うものなし)'}</p>
      <p>ハッシュタグ: ${s.hashtags.map((h) => `#${h}`).join(' ') || '(なし)'}</p>
      <div class="alert-buttons"><button onClick=${close}>やめる</button><button class="strong" onClick=${apply}>適用</button></div>
    </div>
  </div>`;
}

export function NavBar({ title, right = null, backLabel = 'Back' }) {
  return html`<div class="safe-top"></div><nav class="nav">
    <button class="back" onClick=${S.back}>${Icon.back()}${backLabel}</button>
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
    const t = input.trim();
    if (!t) return;
    setInput('');
    if (!(await S.sendChat(id, t))) setInput(t);
  };
  return html`<div class="screen">
    <${NavBar} title=${html`<span class="nav-persona"><${PersonaAvatar} size=${26} /> ${p.name}</span>`}
      right=${memo.chat.length > 0 && html`<button class="link-btn" disabled=${thinking} onClick=${() => { if (confirm('会話を消しますか?')) S.updateMemo(id, (m) => ({ ...m, chat: [] })); }}>Clear</button>`} />
    <div class="scroll chat">
      ${memo.chat.length === 0 && !thinking && html`<p class="empty">このメモについて${p.name}と話してみましょう。<br />送信した時だけ、メモの内容がAIに送られます。</p>`}
      ${memo.chat.map((c) => html`<div class=${`bubble ${c.fromUser ? 'me' : 'them'}`}>${c.text}</div>`)}
      ${thinking && html`<div class="bubble them"><span class="spinner"></span></div>`}
      <div ref=${end}></div>
    </div>
    <div class="compose-row chat-input">
      <div class="field"><${AutoText} value=${input} onInput=${setInput} placeholder="Message" maxRows=${4} class="field-input" onSubmit=${send} /></div>
      <button class=${`round send ${input.trim() && !st.busy ? 'ready' : ''}`} aria-label="Send" disabled=${!input.trim() || !!st.busy} onClick=${send}>${Icon.send()}</button>
    </div>
  </div>`;
}
