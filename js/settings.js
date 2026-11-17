// 設定・AIの人物・検索・ゴミ箱・タグ・簡単ワード
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import * as B from './backup.js';
import { listModels, DEFAULT_MODEL, AiError } from './ai.js';
import { Icon } from './icons.js';
import { NavBar } from './detail.js';
import { ProfileAvatar, PersonaAvatar, ActionSheet, Linkified, TagPill, Sheet } from './ui.js';
import { formatDay, formatTime, formatDateTime, TAG_COLORS } from './util.js';
import { t, LANGUAGES } from './i18n.js';

function Row({ icon, tint, label, value = '', onClick, chevron = true }) {
  return html`<button class="row" onClick=${onClick}>
    ${icon && html`<span class="row-icon" style=${`background:${tint}`}>${icon}</span>`}
    <span class="row-label">${label}</span><span class="row-value">${value}</span>
    ${chevron && html`<span class="chev">${Icon.chevronRight(12)}</span>`}
  </button>`;
}

function Segmented({ label, options, value, onChange }) {
  return html`<div class="segmented" role="radiogroup" aria-label=${label}>
    ${options.map(([v, l]) => html`<button role="radio" aria-checked=${value === v} class=${value === v ? 'on' : ''} onClick=${() => onChange(v)}>${l}</button>`)}
  </div>`;
}

export function Settings() {
  const st = S.state;
  const s = st.settings;
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState(null);
  const [checking, setChecking] = useState(false);
  const [askFull, setAskFull] = useState(false);
  const [askYear, setAskYear] = useState(false);
  const [snaps, setSnaps] = useState(false);
  const avatarInput = useRef();
  const restoreInput = useRef();
  // いま入っている版(sw.js の VERSION)。更新が届いたかの確認に使う
  const [version, setVersion] = useState('');
  useEffect(() => {
    caches?.keys().then((keys) => setVersion(keys.find((k) => k.startsWith('thememo-'))?.replace('thememo-', '') ?? '')).catch(() => {});
  }, []);

  const pickAvatar = async (file) => {
    const name = await S.importImage(file);
    if (!name) return;
    if (s.profileImage) await import('./db.js').then(({ db }) => db.deleteImage(s.profileImage));
    S.updateSettings({ profileImage: name });
  };

  const check = async () => {
    setChecking(true);
    try { setModels(await listModels(s.apiKey.trim())); } catch (e) { S.say(e instanceof AiError ? e.message : t('checkFailed')); } finally { setChecking(false); }
  };
  const sizes = t('sizes');

  return html`<div class="screen grouped">
    <${NavBar} title="" />
    <div class="scroll">
      <h1 class="large-title">${t('settings')}</h1>

      <div class="group">
        <div class="row profile-row">
          <button class="avatar-btn" aria-label=${t('choosePhoto')} onClick=${() => avatarInput.current.click()}><${ProfileAvatar} size=${60} /></button>
          <div class="flex">
            <input class="row-input name-input" aria-label=${t('name')} value=${s.profileName} onInput=${(e) => S.updateSettings({ profileName: e.target.value || 'Me' })} />
            <div class="muted small-text">${t('profileHint')}</div>
          </div>
          ${s.profileImage && html`<button class="link-btn" onClick=${() => S.updateSettings({ profileImage: '' })}>${t('remove')}</button>`}
        </div>
      </div>
      <input ref=${avatarInput} type="file" accept="image/*" hidden onChange=${(e) => { if (e.target.files[0]) pickAvatar(e.target.files[0]); e.target.value = ''; }} />

      <div class="group-title">${t('appearance')}</div>
      <div class="group">
        <div class="row"><span class="row-label">${t('language')}</span>
          <${Segmented} label=${t('language')} options=${LANGUAGES} value=${s.language} onChange=${(v) => S.updateSettings({ language: v })} /></div>
        <div class="row"><span class="row-label">${t('theme')}</span>
          <${Segmented} label=${t('theme')} options=${[['system', t('system')], ['light', t('light')], ['dark', t('dark')]]} value=${s.theme} onChange=${(v) => S.updateSettings({ theme: v })} /></div>
        <div class="row"><span class="row-label">${t('textSize')}</span>
          <${Segmented} label=${t('textSize')} options=${['s', 'm', 'l', 'xl'].map((v, i) => [v, sizes[i]])} value=${s.textSize} onChange=${(v) => S.updateSettings({ textSize: v })} /></div>
        <div class="row"><span class="row-label">${t('writingFont')}</span>
          <${Segmented} label=${t('writingFont')} options=${[['default', t('fontDefault')], ['serif', html`<span class="serif-sample">${t('fontSerif')}</span>`]]} value=${s.writingFont} onChange=${(v) => S.updateSettings({ writingFont: v })} /></div>
        <div class="row"><span class="row-label">${t('lineSpacing')}</span>
          <${Segmented} label=${t('lineSpacing')} options=${[['s', t('spacingTight')], ['m', t('spacingNormal')], ['l', t('spacingLoose')]]} value=${s.lineSpacing} onChange=${(v) => S.updateSettings({ lineSpacing: v })} /></div>
        <div class="row"><span class="row-label">${t('sideMargin')}</span>
          <${Segmented} label=${t('sideMargin')} options=${[['s', t('marginNarrow')], ['m', t('marginNormal')], ['l', t('marginWide')]]} value=${s.editorMargin} onChange=${(v) => S.updateSettings({ editorMargin: v })} /></div>
        <div class="spacing-preview" aria-hidden="true"><div class="spacing-sample">${t('spacingSample')}</div></div>
      </div>

      <div class="group-title">AI</div>
      <div class="group">
        <button class="row" onClick=${() => S.open({ name: 'character' })}>
          <${PersonaAvatar} size=${30} /><span class="row-label">${t('aiCharacter')}</span><span class="row-value">${s.persona.name}</span><span class="chev">${Icon.chevronRight(12)}</span>
        </button>
        <label class="row"><span class="row-label">${t('apiKey')}</span>
          <input class="row-input right" type=${showKey ? 'text' : 'password'} autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder=${t('apiKeyPlaceholder')} value=${s.apiKey} onInput=${(e) => S.updateSettings({ apiKey: e.target.value.trim() })} />
          <button class="link-btn" onClick=${(e) => { e.preventDefault(); setShowKey(!showKey); }}>${showKey ? t('hide') : t('show')}</button>
        </label>
        <label class="row"><span class="row-label">${t('model')}</span>
          <input class="row-input right" autocapitalize="off" spellcheck="false" placeholder=${DEFAULT_MODEL} value=${s.model} onInput=${(e) => S.updateSettings({ model: e.target.value.trim() })} />
        </label>
        <button class="row" disabled=${!s.apiKey || checking} onClick=${check}><span class="row-label accent">${checking ? t('checking') : t('checkModels')}</span></button>
        ${models && models.map((m) => html`<button class="row" onClick=${() => S.updateSettings({ model: m })}>
          <span class="row-label">${m}</span>${(s.model || DEFAULT_MODEL) === m && html`<span class="accent">${Icon.check()}</span>`}</button>`)}
      </div>
      <p class="hint">${t('aiHint')}</p>

      <div class="group-title">${t('writing')}</div>
      <div class="group">
        <${Row} label=${t('tags')} value=${String(st.tags.length)} onClick=${() => S.open({ name: 'tags' })} />
        <${Row} label=${t('quickWords')} value=${String(st.quickWords.length)} onClick=${() => S.open({ name: 'words' })} />
      </div>
      <p class="hint">${t('writingHint')}</p>

      <div class="group-title">${t('data')}</div>
      <div class="group">
        <${Row} icon=${Icon.share(16)} tint="#007AFF" label=${t('backupAll')} onClick=${() => setAskFull(true)} />
        <${Row} icon=${Icon.photo(16)} tint="#AF52DE" label=${t('restore')} onClick=${() => restoreInput.current.click()} />
        <${Row} icon=${Icon.clock(16)} tint="#34C759" label=${t('snapshots')} onClick=${() => setSnaps(true)} />
        <${Row} icon=${Icon.clock(16)} tint="#FF9500" label=${t('archiveYear')} onClick=${() => setAskYear(true)} />
        <${Row} icon=${Icon.trash(16)} tint="#FF3B30" label=${t('trash')} value=${String(S.trashMemos().length)} onClick=${() => S.open({ name: 'trash' })} />
      </div>
      <p class=${`hint ${backupOld(s.lastBackupAt) ? 'warn-text' : ''}`}>${s.lastBackupAt ? t('lastBackup', { d: formatDateTime(s.lastBackupAt) }) : t('neverBackedUp')}
        ${backupOld(s.lastBackupAt) ? ` ${t('backupReminder')}` : ''}</p>
      <p class="hint">${t('dataHint')}</p>
      <input ref=${restoreInput} type="file" accept=".zip,application/zip" hidden onChange=${(e) => { if (e.target.files[0]) B.restore(e.target.files[0]); e.target.value = ''; }} />
      <p class="footnote">The Memo for iPhone / iPad${version ? ` · ${t('version', { v: version })}` : ''}</p>
    </div>

    ${askFull && html`<${FullBackup} onClose=${() => setAskFull(false)} />`}
    ${snaps && html`<${SnapshotSheet} onClose=${() => setSnaps(false)} />`}
    ${askYear && html`<${ActionSheet} title=${t('archiveTitle')} onClose=${() => setAskYear(false)}
      items=${B.yearsWithMemos().map(([y, n]) => ({ label: t('yearItem', { y, n }) + (y === new Date().getFullYear() ? t('thisYear') : ''), onClick: () => B.archiveYear(y) }))} />`}
  </div>`;
}

/** 最後のバックアップから 14 日以上たったか */
const backupOld = (at) => S.activeMemos().length > 0 && (!at || Date.now() - at > 14 * 86400000);

/** 自動の控えの一覧。押すとその時の状態に戻せる */
function SnapshotSheet({ onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => { S.listSnapshots().then(setList); }, []);
  const restore = async (x) => {
    if (!confirm(t('confirmRestoreSnapshot', { d: formatDateTime(x.at), n: x.count }))) return;
    onClose();
    await S.restoreSnapshot(x.at);
  };
  const reason = (r) => ({ daily: t('snapDaily'), beforeRestore: t('snapBeforeRestore'), beforeImport: t('snapBeforeImport'), beforeEmptyTrash: t('snapBeforeEmpty'), beforeArchive: t('snapBeforeArchive') }[r] ?? r);
  return html`<${Sheet} onClose=${onClose} label=${t('snapshots')}>
    <div class="sheet-head"><span class="sheet-title">${t('snapshots')}</span><button class="link-btn strong" onClick=${onClose}>${t('done')}</button></div>
    <p class="hint">${t('snapshotsHint')}</p>
    ${list && list.length === 0 && html`<p class="empty">${t('noSnapshots')}</p>`}
    <div class="group">
      ${(list ?? []).map((x) => html`<div class="row">
        <div class="flex"><div>${formatDateTime(x.at)}</div><div class="muted small-text">${reason(x.reason)} · ${t('nMemos', { n: x.count })}</div></div>
        <button class="link-btn" onClick=${() => restore(x)}>${t('restore')}</button>
      </div>`)}
    </div>
  </${Sheet}>`;
}

function FullBackup({ onClose }) {
  const [withKey, setWithKey] = useState(false);
  return html`<div class="backdrop center" onClick=${onClose}>
    <div class="alert glass" role="alertdialog" aria-label=${t('backupAll')} onClick=${(e) => e.stopPropagation()}>
      <div class="alert-title">${t('backupAll')}</div>
      <p>${t('backupAllText')}</p>
      <label class="check-row"><input type="checkbox" checked=${withKey} onChange=${(e) => setWithKey(e.target.checked)} /> ${t('includeKey')}</label>
      ${withKey && html`<p class="danger-text small-text">${t('keyWarning')}</p>`}
      <div class="alert-buttons"><button onClick=${onClose}>${t('cancel')}</button><button class="strong" onClick=${() => { onClose(); B.backup(true, withKey); }}>${t('save')}</button></div>
    </div>
  </div>`;
}

const PRESETS = [
  { label: 'My AI', p: S.DEFAULT_PERSONA },
  { label: 'Dr. Jung', p: S.JUNG_PERSONA },
  { label: 'Coach', p: { name: 'Coach', icon: '🏃', role: '散歩や日々の習慣を応援する、前向きなライフコーチ。書かれた内容から小さな前進を見つけてほめ、次の一歩を1つだけ具体的に提案する。', style: '明るく短い言葉で、親しみをこめて話す。相手を「あなた」と呼ぶ。' } },
  { label: 'Zen monk', p: { name: 'Zen monk', icon: '🍃', role: '禅の考え方を大切にする僧侶。いま・ここに気づくこと、手放すこと、身の回りの小さな美しさに目を向けることをやさしく思い出させる。', style: '静かで余白のある、ゆっくりとした語り口。短い言葉を選ぶ。' } },
  { label: 'Editor', p: { name: 'Editor', icon: '✎', role: '文章とアイデアを磨く、経験豊かな編集者。メモの中の面白い種を見つけ、文章や作品にするための切り口と、足りない情報を指摘する。', style: '率直で具体的。ていねい語で、要点から話す。' } },
];

export function Character() {
  const p = S.state.settings.persona;
  const photo = useRef();
  const pick = (preset) => S.updatePersona({ name: preset.name, icon: preset.icon, role: preset.role, style: preset.style });
  const field = (key, label, rows, hint) => html`
    <div class="group-title">${label}</div>
    <div class="group"><textarea class="area" rows=${rows} aria-label=${label} value=${p[key]} onInput=${(e) => S.updatePersona({ [key]: e.target.value })}></textarea></div>
    ${hint && html`<p class="hint">${hint}</p>`}`;
  return html`<div class="screen grouped">
    <${NavBar} title=${t('aiCharacter')} right=${html`<button class="pill-btn glass" onClick=${() => { if (confirm(t('confirmResetPersona'))) S.resetPersona(); }}>${t('reset')}</button>`} />
    <div class="scroll">
      <div class="persona-hero">
        <button class="avatar-btn" aria-label=${t('choosePhoto')} onClick=${() => photo.current.click()}><${PersonaAvatar} size=${92} /></button>
        <div class="name-xl">${p.name}</div>
        <div class="row-buttons">
          <button class="link-btn" onClick=${() => photo.current.click()}>${t('choosePhoto')}</button>
          ${p.image && html`<button class="link-btn" onClick=${() => S.updatePersona({ image: '' })}>${t('removePhotoBtn')}</button>`}
        </div>
      </div>
      <input ref=${photo} type="file" accept="image/*" hidden onChange=${async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const n = await S.importImage(f); if (n) S.updatePersona({ image: n }); } }} />
      <div class="chips-scroll">${PRESETS.map((x) => html`<button class=${`chip ${p.name === x.p.name ? 'on' : ''}`} onClick=${() => pick(x.p)}>${x.p.icon} ${x.label}</button>`)}</div>
      <div class="group">
        <label class="row"><span class="row-label fixed">${t('name')}</span><input class="row-input" value=${p.name} onInput=${(e) => S.updatePersona({ name: e.target.value || S.DEFAULT_PERSONA.name })} /></label>
        <label class="row"><span class="row-label fixed">${t('icon')}</span><input class="row-input" value=${p.icon} placeholder=${t('emojiOk')} onInput=${(e) => S.updatePersona({ icon: e.target.value })} /></label>
      </div>
      ${field('role', t('role'), 5, t('roleHint'))}
      ${field('style', t('style'), 2, t('styleHint'))}
      ${field('aboutUser', t('aboutMe'), 3, t('aboutHint'))}
      <p class="hint">${t('safetyNote')}</p>
    </div>
  </div>`;
}

/**
 * 検索。「#言葉」はハッシュタグ、タグのチップを押すとそのタグの投稿だけ。
 * 何も入れていない時は、タグとよく使うハッシュタグの一覧を出す
 */
export function Search({ initial = '' }) {
  const [q, setQ] = useState(initial);
  const [tag, setTag] = useState(null);
  const [starOnly, setStarOnly] = useState(false);
  const query = q.trim().toLowerCase();
  const hashtag = query.match(/^[#＃]([\p{L}\p{N}_ー・]+)$/u)?.[1];
  const memos = S.activeMemos().filter((m) => !starOnly || m.starred);
  const results = (starOnly && !query && !tag ? memos.filter((m) => !S.isBlank(m)) : tag
    ? memos.filter((m) => m.tags.includes(tag))
    : hashtag
      ? memos.filter((m) => S.hashtagsIn(`${m.title}\n${m.body}`).some((h) => h.toLowerCase() === hashtag))
      : query
        ? memos.filter((m) => `${m.title}\n${m.body}\n${m.tags.join(' ')}`.toLowerCase().includes(query))
        : []).sort((a, b) => b.createdAt - a.createdAt);
  const hashtags = S.allHashtags().slice(0, 30);
  return html`<div class="screen">
    <${NavBar} title=${tag || t('search')} />
    <div class="search-box"><span class="muted">${Icon.search(18)}</span>
      <input type="search" placeholder=${t('searchPlaceholder')} aria-label=${t('search')} value=${q} onInput=${(e) => { setTag(null); setQ(e.target.value); }} autofocus=${!initial} /></div>
    <div class="search-filters">
      <button class=${`filter-chip ${starOnly ? 'on' : ''}`} aria-pressed=${starOnly} onClick=${() => setStarOnly(!starOnly)}>
        ${starOnly ? Icon.starFill(15) : Icon.star(15)} ${t('starred')}<span class="filter-count">${S.activeMemos().filter((m) => m.starred).length}</span></button>
      ${tag && html`<button class="filter-chip on" onClick=${() => setTag(null)}>${tag} ${Icon.close(12)}</button>`}
    </div>
    <div class="scroll">
      ${!query && !tag && !starOnly && html`<div class="browse">
        <div class="group-title flush">${t('tagsTitle')}</div>
        <div class="pills pad">${S.state.tags.map((x) => html`<${TagPill} name=${x.name} onClick=${() => setTag(x.name)} />`)}</div>
        ${hashtags.length > 0 && html`<div class="group-title flush">${t('hashtags')}</div>
          <div class="pills pad">${hashtags.map(([h, n]) => html`<button class="link-chip hashtag-chip" onClick=${() => setQ(`#${h}`)}>#${h} <span class="muted">${n}</span></button>`)}</div>`}
      </div>`}
      ${(query || tag || starOnly) && results.length === 0 && html`<p class="empty">${starOnly && !query && !tag ? t('noStarred') : t('notFound')}</p>`}
      ${(query || tag || starOnly) && results.length > 0 && html`<p class="hint flush">${t('results', { n: results.length })}</p>`}
      ${results.map((m) => html`<button class="result" onClick=${() => S.open({ name: 'detail', id: m.id })}>
        <div class="muted small-text">${m.starred && html`<span class="head-star">★ </span>`}${formatDay(S.memoDate(m))} ${m.allDay ? t('diary') : formatTime(m.createdAt)}</div>
        ${m.title && html`<div class="post-title">${m.title}</div>`}
        <div class="clamp3"><${Linkified} text=${m.body} /></div>
      </button>`)}
    </div>
  </div>`;
}

export function Trash() {
  const list = S.trashMemos();
  return html`<div class="screen grouped">
    <${NavBar} title=${t('trash')} right=${list.length > 0 && html`<button class="pill-btn glass danger-text" onClick=${() => { if (confirm(t('confirmEmptyTrash', { n: list.length }))) S.emptyTrash(); }}>${t('empty')}</button>`} />
    <div class="scroll">
      <p class="hint">${t('trashHint')}</p>
      ${list.length === 0 && html`<p class="empty">${t('trashEmpty')}</p>`}
      <div class="group">${list.map((m) => html`<div class="row trash-row">
        <div class="flex"><div class="muted small-text">${formatDay(S.memoDate(m))}</div><div class="clamp2">${m.title || m.body || t('photoLabel')}</div></div>
        <button class="link-btn" onClick=${() => S.restoreMemo(m.id)}>${t('restore')}</button>
        <button class="link-btn danger-text" onClick=${() => { if (confirm(t('confirmDeleteForever'))) S.deleteForever(m.id); }}>${t('delete')}</button>
      </div>`)}</div>
    </div>
  </div>`;
}

/**
 * タグの一覧の管理。足す・名前を変える・色・並べ替え・消す。
 * 投稿に付いているのに一覧にないタグは、一覧に入れるか、#ハッシュタグ に変えるか、外す
 */
export function Tags() {
  const st = S.state;
  const [input, setInput] = useState('');
  const [colorFor, setColorFor] = useState(null);
  const unlisted = S.unlistedTags();
  const count = (name) => S.activeMemos().filter((m) => m.tags.includes(name)).length;
  const add = () => { S.registerTag(input); setInput(''); };
  const names = t('colors');
  return html`<div class="screen grouped">
    <${NavBar} title=${t('tags')} />
    <div class="scroll">
      <p class="hint">${t('tagsHint')}</p>
      <div class="group-title">${t('yourTags')}</div>
      <div class="group">
        ${st.tags.map((x, i) => html`<div class="row tag-row">
          <button class="tag-swatch" style=${`background:${TAG_COLORS[x.color] ?? TAG_COLORS[0]}`} aria-label=${t('colorOf', { name: x.name })} onClick=${() => setColorFor(x.name)}></button>
          <button class="row-label tag-name" onClick=${() => { const n = prompt(t('tagName'), x.name); if (n) S.renameTag(x.name, n); }}>${x.name}</button>
          <span class="row-value">${count(x.name)}</span>
          <button class="icon-btn small muted" aria-label=${t('moveUp')} disabled=${i === 0} onClick=${() => S.moveTag(x.name, -1)}>${Icon.chevronUp(14)}</button>
          <button class="icon-btn small muted" aria-label=${t('moveDown')} disabled=${i === st.tags.length - 1} onClick=${() => S.moveTag(x.name, 1)}>${Icon.chevronDown(14)}</button>
          <button class="icon-btn small danger-text" aria-label=${t('delete')} onClick=${() => { if (confirm(t('confirmDeleteTag', { name: x.name, n: count(x.name) }))) S.deleteTag(x.name); }}>${Icon.trash(16)}</button>
        </div>`)}
        <form class="row" onSubmit=${(e) => { e.preventDefault(); add(); }}>
          <input class="row-input" placeholder=${t('newTag')} aria-label=${t('newTag')} value=${input} onInput=${(e) => setInput(e.target.value)} />
          <button type="submit" class="link-btn" disabled=${!input.trim()}>${t('add')}</button>
        </form>
      </div>
      <p class="hint">${t('tagsEditHint')}</p>

      ${unlisted.length > 0 && html`
        <div class="group-title">${t('notInListTitle', { n: unlisted.length })}</div>
        <div class="group">
          ${unlisted.map(([name, n]) => html`<div class="row tag-row">
            <span class="row-label">${name}</span><span class="row-value">${n}</span>
            <button class="link-btn" onClick=${() => S.registerTag(name)}>${t('add')}</button>
            <button class="link-btn" onClick=${() => { if (confirm(t('confirmToHashtag', { name, tag: name.replace(/\s+/g, '_'), n }))) S.tagToHashtag(name); }}>${t('toHashtag')}</button>
            <button class="link-btn danger-text" onClick=${() => { if (confirm(t('confirmRemoveTag', { name, n }))) S.deleteTag(name); }}>${t('remove')}</button>
          </div>`)}
        </div>
        <p class="hint">${t('notInListHint')}</p>`}
    </div>
    ${colorFor && html`<${ActionSheet} title=${t('colorOf', { name: colorFor })} onClose=${() => setColorFor(null)}
      items=${TAG_COLORS.map((c, i) => ({ label: html`<span class="swatch-label"><span class="tag-swatch" style=${`background:${c}`}></span>${names[i]}</span>`, onClick: () => S.setTagColor(colorFor, i) }))} />`}
  </div>`;
}

export function QuickWords() {
  const words = [...S.state.quickWords].sort((a, b) => b.uses - a.uses);
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || words.some((w) => w.text === v)) return;
    S.setQuickWords([...S.state.quickWords, { text: v, uses: 0 }]);
    setInput('');
  };
  return html`<div class="screen grouped">
    <${NavBar} title=${t('quickWords')} />
    <div class="scroll">
      <div class="group">
        <form class="row" onSubmit=${(e) => { e.preventDefault(); add(); }}>
          <input class="row-input" placeholder=${t('newWord')} aria-label=${t('newWord')} value=${input} onInput=${(e) => setInput(e.target.value)} />
          <button type="submit" class="link-btn" disabled=${!input.trim()}>${t('add')}</button>
        </form>
      </div>
      <div class="group" style="margin-top:16px">${words.map((w) => html`<div class="row">
        <span class="row-label">${w.text}</span><span class="row-value">${w.uses}</span>
        <button class="icon-btn small muted" aria-label=${`${t('remove')} ${w.text}`} onClick=${() => S.setQuickWords(S.state.quickWords.filter((x) => x.text !== w.text))}>${Icon.close(16)}</button>
      </div>`)}</div>
      <p class="hint">${t('wordsHint')}</p>
    </div>
  </div>`;
}
