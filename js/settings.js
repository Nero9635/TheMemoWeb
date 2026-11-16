// 設定・AIの人物・検索・ゴミ箱・簡単ワード
import { html, useRef, useState } from '../vendor/preact-htm.js';
import * as S from './store.js';
import * as B from './backup.js';
import { listModels, DEFAULT_MODEL, AiError } from './ai.js';
import { Icon } from './icons.js';
import { NavBar } from './detail.js';
import { ProfileAvatar, PersonaAvatar, ActionSheet, Linkified, TagPill } from './ui.js';
import { formatDay, formatTime, TAG_COLORS } from './util.js';

function Row({ icon, tint, label, value = '', onClick, chevron = true }) {
  return html`<button class="row" onClick=${onClick}>
    ${icon && html`<span class="row-icon" style=${`background:${tint}`}>${icon}</span>`}
    <span class="row-label">${label}</span><span class="row-value">${value}</span>
    ${chevron && html`<span class="chev">${Icon.chevronRight(12)}</span>`}
  </button>`;
}

export function Settings() {
  const st = S.state;
  const s = st.settings;
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState(null);
  const [checking, setChecking] = useState(false);
  const [askFull, setAskFull] = useState(false);
  const [askYear, setAskYear] = useState(false);
  const avatarInput = useRef();
  const restoreInput = useRef();

  const pickAvatar = async (file) => {
    const name = await S.importImage(file);
    if (!name) return;
    if (s.profileImage) await import('./db.js').then(({ db }) => db.deleteImage(s.profileImage));
    S.updateSettings({ profileImage: name });
  };

  const check = async () => {
    setChecking(true);
    try { setModels(await listModels(s.apiKey.trim())); } catch (e) { S.say(e instanceof AiError ? e.message : '確認できませんでした。'); } finally { setChecking(false); }
  };

  return html`<div class="screen grouped">
    <${NavBar} title="" />
    <div class="scroll">
      <h1 class="large-title">Settings</h1>

      <div class="group">
        <div class="row profile-row">
          <button class="avatar-btn" aria-label="Change photo" onClick=${() => avatarInput.current.click()}><${ProfileAvatar} size=${56} /></button>
          <div class="flex">
            <input class="row-input name-input" aria-label="Name" value=${s.profileName} onInput=${(e) => S.updateSettings({ profileName: e.target.value || 'Me' })} />
            <div class="muted small-text">名前とアイコン(投稿に表示)</div>
          </div>
          ${s.profileImage && html`<button class="link-btn" onClick=${() => S.updateSettings({ profileImage: '' })}>Remove</button>`}
        </div>
      </div>
      <input ref=${avatarInput} type="file" accept="image/*" hidden onChange=${(e) => { if (e.target.files[0]) pickAvatar(e.target.files[0]); e.target.value = ''; }} />

      <div class="group-title">APPEARANCE</div>
      <div class="group">
        <div class="row"><span class="row-label">Theme</span>
          <div class="segmented" role="radiogroup" aria-label="Theme">
            ${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => html`<button role="radio" aria-checked=${s.theme === v} class=${s.theme === v ? 'on' : ''} onClick=${() => S.updateSettings({ theme: v })}>${l}</button>`)}
          </div>
        </div>
      </div>

      <div class="group-title">AI</div>
      <div class="group">
        <button class="row" onClick=${() => S.open({ name: 'character' })}>
          <${PersonaAvatar} size=${32} /><span class="row-label">AI character</span><span class="row-value">${s.persona.name}</span><span class="chev">${Icon.chevronRight(12)}</span>
        </button>
        <label class="row"><span class="row-label">API key</span>
          <input class="row-input right" type=${showKey ? 'text' : 'password'} autocomplete="off" autocapitalize="off" spellcheck="false"
            placeholder="Gemini API key" value=${s.apiKey} onInput=${(e) => S.updateSettings({ apiKey: e.target.value.trim() })} />
          <button class="link-btn" onClick=${(e) => { e.preventDefault(); setShowKey(!showKey); }}>${showKey ? 'Hide' : 'Show'}</button>
        </label>
        <label class="row"><span class="row-label">Model</span>
          <input class="row-input right" autocapitalize="off" spellcheck="false" placeholder=${DEFAULT_MODEL} value=${s.model} onInput=${(e) => S.updateSettings({ model: e.target.value.trim() })} />
        </label>
        <button class="row" disabled=${!s.apiKey || checking} onClick=${check}><span class="row-label accent">${checking ? 'Checking…' : 'Check models'}</span></button>
        ${models && models.map((m) => html`<button class="row" onClick=${() => S.updateSettings({ model: m })}>
          <span class="row-label">${m}</span>${(s.model || DEFAULT_MODEL) === m && html`<span class="accent">${Icon.check()}</span>`}</button>`)}
      </div>
      <p class="hint">メモは端末の中だけに保存されます。✦ や ${S.personaGlyph(s.persona)} を押した時だけ、その内容が Google の Gemini API に送られます。APIキーは Google AI Studio(aistudio.google.com/apikey)で取得できます。</p>

      <div class="group-title">WRITING</div>
      <div class="group">
        <${Row} label="Tags" value=${String(st.tags.length)} onClick=${() => S.open({ name: 'tags' })} />
        <${Row} label="Quick words" value=${String(st.quickWords.length)} onClick=${() => S.open({ name: 'words' })} />
      </div>
      <p class="hint">タグは決まった分類(AI もこの中からだけ選びます)。自由な言葉は本文に「#銀杏」のように書くとハッシュタグになります。</p>

      <div class="group-title">DATA</div>
      <div class="group">
        <${Row} icon=${Icon.share(17)} tint="#1B7F4A" label="Back up memos" onClick=${() => B.backup(false)} />
        <${Row} icon=${Icon.share(17)} tint="#0060DF" label="Back up everything" onClick=${() => setAskFull(true)} />
        <${Row} icon=${Icon.photo(17)} tint="#6A45B0" label="Restore" onClick=${() => restoreInput.current.click()} />
        <${Row} icon=${Icon.clock(17)} tint="#8A5A00" label="Archive a year" onClick=${() => setAskYear(true)} />
        <${Row} icon=${Icon.trash(17)} tint="#C62828" label="Trash" value=${String(S.trashMemos().length)} onClick=${() => S.open({ name: 'trash' })} />
      </div>
      <p class="hint">共有シートで「ファイルに保存」や Google ドライブを選べます。Android 版のバックアップもそのまま読み込めます。ホーム画面に追加して使うと、データが消されにくくなります。</p>
      <input ref=${restoreInput} type="file" accept=".zip,application/zip" hidden onChange=${(e) => { if (e.target.files[0]) B.restore(e.target.files[0]); e.target.value = ''; }} />
      <p class="footnote">The Memo for iPhone · Web app</p>
    </div>

    ${askFull && html`<${FullBackup} onClose=${() => setAskFull(false)} />`}
    ${askYear && html`<${ActionSheet} title="保管する年を選んでください。書き出してから、その年のメモを端末から外します。" onClose=${() => setAskYear(false)}
      items=${B.yearsWithMemos().map(([y, n]) => ({ label: `${y}年 · ${n}件${y === new Date().getFullYear() ? '(今年)' : ''}`, onClick: () => B.archiveYear(y) }))} />`}
  </div>`;
}

function FullBackup({ onClose }) {
  const [withKey, setWithKey] = useState(false);
  return html`<div class="backdrop center" onClick=${onClose}>
    <div class="alert" role="alertdialog" aria-label="Back up everything" onClick=${(e) => e.stopPropagation()}>
      <div class="alert-title">Back up everything</div>
      <p>メモ・写真・タグ・一日のまとめに加えて、設定・プロフィール・AIの人物も保存します。</p>
      <label class="check-row"><input type="checkbox" checked=${withKey} onChange=${(e) => setWithKey(e.target.checked)} /> Include API key</label>
      ${withKey && html`<p class="danger-text small-text">APIキーが入ったファイルは、人に渡したり公開の場所に置いたりしないでください。</p>`}
      <div class="alert-buttons"><button onClick=${onClose}>Cancel</button><button class="strong" onClick=${() => { onClose(); B.backup(true, withKey); }}>Save</button></div>
    </div>
  </div>`;
}

const PRESETS = [
  { label: 'Dr. Jung', p: S.DEFAULT_PERSONA },
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
    <${NavBar} title="AI character" backLabel="Settings" right=${html`<button class="link-btn" onClick=${() => { if (confirm('ユング先生に戻しますか?「About me」は残ります。')) S.resetPersona(); }}>Reset</button>`} />
    <div class="scroll">
      <div class="persona-hero">
        <button class="avatar-btn" aria-label="Choose photo" onClick=${() => photo.current.click()}><${PersonaAvatar} size=${88} /></button>
        <div class="name-xl">${p.name}</div>
        <div class="row-buttons">
          <button class="link-btn" onClick=${() => photo.current.click()}>Choose photo</button>
          ${p.image && html`<button class="link-btn" onClick=${() => S.updatePersona({ image: '' })}>Remove photo</button>`}
        </div>
      </div>
      <input ref=${photo} type="file" accept="image/*" hidden onChange=${async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { const n = await S.importImage(f); if (n) S.updatePersona({ image: n }); } }} />
      <div class="chips-scroll">${PRESETS.map((x) => html`<button class=${`chip ${p.name === x.p.name ? 'on' : ''}`} onClick=${() => pick(x.p)}>${x.p.icon} ${x.label}</button>`)}</div>
      <div class="group">
        <label class="row"><span class="row-label fixed">Name</span><input class="row-input" value=${p.name} onInput=${(e) => S.updatePersona({ name: e.target.value || 'Dr. Jung' })} /></label>
        <label class="row"><span class="row-label fixed">Icon</span><input class="row-input" value=${p.icon} placeholder="絵文字OK" onInput=${(e) => S.updatePersona({ icon: e.target.value })} /></label>
      </div>
      ${field('role', 'ROLE & BACKGROUND', 5, 'どんな人物か、何を大切にし、どう関わるか')}
      ${field('style', 'SPEAKING STYLE', 2, '口調・呼び方・長さなど(例: 関西弁で、短く、相手を「君」と呼ぶ)')}
      ${field('aboutUser', 'ABOUT ME', 3, 'この人物に知っておいてほしいこと(仕事・関心・目標・最近のことなど)')}
      <p class="hint">強い苦しみがうかがえる時に寄り添い、相談窓口をすすめる決まりは、どの人物でも変わりません。</p>
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
  const query = q.trim().toLowerCase();
  const hashtag = query.match(/^[#＃]([\p{L}\p{N}_ー・]+)$/u)?.[1];
  const memos = S.activeMemos();
  const results = (tag
    ? memos.filter((m) => m.tags.includes(tag))
    : hashtag
      ? memos.filter((m) => S.hashtagsIn(`${m.title}\n${m.body}`).some((h) => h.toLowerCase() === hashtag))
      : query
        ? memos.filter((m) => `${m.title}\n${m.body}\n${m.tags.join(' ')}`.toLowerCase().includes(query))
        : []).sort((a, b) => b.createdAt - a.createdAt);
  const hashtags = S.allHashtags().slice(0, 30);
  return html`<div class="screen">
    <${NavBar} title=${tag ? tag : 'Search'} />
    <div class="search-box"><span class="muted">${Icon.search(18)}</span>
      <input type="search" placeholder="Search or #hashtag" aria-label="Search" value=${q} onInput=${(e) => { setTag(null); setQ(e.target.value); }} autofocus=${!initial} /></div>
    <div class="scroll">
      ${!query && !tag && html`<div class="browse">
        <div class="group-title flush">TAGS</div>
        <div class="pills pad">${S.state.tags.map((t) => html`<${TagPill} name=${t.name} onClick=${() => setTag(t.name)} />`)}</div>
        ${hashtags.length > 0 && html`<div class="group-title flush">HASHTAGS</div>
          <div class="pills pad">${hashtags.map(([h, n]) => html`<button class="link-chip hashtag-chip" onClick=${() => setQ(`#${h}`)}>#${h} <span class="muted">${n}</span></button>`)}</div>`}
      </div>`}
      ${(query || tag) && results.length === 0 && html`<p class="empty">見つかりませんでした。</p>`}
      ${(query || tag) && results.length > 0 && html`<p class="hint flush">${results.length}件</p>`}
      ${results.map((m) => html`<button class="result" onClick=${() => S.open({ name: 'detail', id: m.id })}>
        <div class="muted small-text">${formatDay(S.memoDate(m))} ${m.allDay ? 'Diary' : formatTime(m.createdAt)}</div>
        ${m.title && html`<div class="post-title">${m.title}</div>`}
        <div class="clamp3"><${Linkified} text=${m.body} /></div>
      </button>`)}
    </div>
  </div>`;
}

export function Trash() {
  const list = S.trashMemos();
  return html`<div class="screen grouped">
    <${NavBar} title="Trash" backLabel="Settings" right=${list.length > 0 && html`<button class="link-btn danger-text" onClick=${() => { if (confirm(`${list.length}件を完全に削除します。元に戻せません。`)) S.emptyTrash(); }}>Empty</button>`} />
    <div class="scroll">
      <p class="hint">削除したメモは30日間ここに残り、元に戻せます。</p>
      ${list.length === 0 && html`<p class="empty">ゴミ箱は空です。</p>`}
      <div class="group">${list.map((m) => html`<div class="row trash-row">
        <div class="flex"><div class="muted small-text">${formatDay(S.memoDate(m))}</div><div class="clamp2">${m.title || m.body || '(写真)'}</div></div>
        <button class="link-btn" onClick=${() => S.restoreMemo(m.id)}>Restore</button>
        <button class="link-btn danger-text" onClick=${() => { if (confirm('完全に削除します。元に戻せません。')) S.deleteForever(m.id); }}>Delete</button>
      </div>`)}</div>
    </div>
  </div>`;
}

/**
 * タグの一覧の管理。足す・名前を変える・色・並べ替え・消す。
 * 投稿に付いているのに一覧にないタグ(以前 AI が作ったものなど)は、一覧に入れるか、#ハッシュタグ に変えるか、外す
 */
export function Tags() {
  const st = S.state;
  const [input, setInput] = useState('');
  const [colorFor, setColorFor] = useState(null);
  const unlisted = S.unlistedTags();
  const count = (name) => S.activeMemos().filter((m) => m.tags.includes(name)).length;
  const add = () => { S.registerTag(input); setInput(''); };
  return html`<div class="screen grouped">
    <${NavBar} title="Tags" backLabel="Settings" />
    <div class="scroll">
      <p class="hint">タグは決まった分類です。AI のタグ付けもこの一覧の中からだけ選びます。自由な言葉は、本文に「#銀杏」のように書くハッシュタグを使ってください。</p>
      <div class="group-title">YOUR TAGS</div>
      <div class="group">
        ${st.tags.map((t, i) => html`<div class="row tag-row">
          <button class="tag-swatch" style=${`background:${TAG_COLORS[t.color] ?? TAG_COLORS[0]}`} aria-label=${`Color of ${t.name}`} onClick=${() => setColorFor(t.name)}></button>
          <button class="row-label tag-name" onClick=${() => { const n = prompt('タグの名前', t.name); if (n) S.renameTag(t.name, n); }}>${t.name}</button>
          <span class="row-value">${count(t.name)}</span>
          <button class="icon-btn small muted" aria-label=${`Move ${t.name} up`} disabled=${i === 0} onClick=${() => S.moveTag(t.name, -1)}>${Icon.chevronUp(14)}</button>
          <button class="icon-btn small muted" aria-label=${`Move ${t.name} down`} disabled=${i === st.tags.length - 1} onClick=${() => S.moveTag(t.name, 1)}>${Icon.chevronDown(14)}</button>
          <button class="icon-btn small danger-text" aria-label=${`Delete ${t.name}`} onClick=${() => { if (confirm(`タグ「${t.name}」を消しますか?\n付いている${count(t.name)}件の投稿からも外れます(投稿は消えません)。`)) S.deleteTag(t.name); }}>${Icon.trash(16)}</button>
        </div>`)}
        <form class="row" onSubmit=${(e) => { e.preventDefault(); add(); }}>
          <input class="row-input" placeholder="New tag" aria-label="New tag" value=${input} onInput=${(e) => setInput(e.target.value)} />
          <button type="submit" class="link-btn" disabled=${!input.trim()}>Add</button>
        </form>
      </div>
      <p class="hint">名前を押すと変更、左の丸で色を選べます。</p>

      ${unlisted.length > 0 && html`
        <div class="group-title">NOT IN THE LIST (${unlisted.length})</div>
        <div class="group">
          ${unlisted.map(([name, n]) => html`<div class="row tag-row">
            <span class="row-label">${name}</span><span class="row-value">${n}</span>
            <button class="link-btn" onClick=${() => S.registerTag(name)}>Add</button>
            <button class="link-btn" onClick=${() => { if (confirm(`「${name}」を #${name.replace(/\s+/g, '_')} に変えますか?\n${n}件の投稿の本文の最後に足し、タグからは外します。`)) S.tagToHashtag(name); }}>→ #</button>
            <button class="link-btn danger-text" onClick=${() => { if (confirm(`「${name}」を${n}件の投稿から外しますか?`)) S.deleteTag(name); }}>Remove</button>
          </div>`)}
        </div>
        <p class="hint">以前の版や Android 版の AI が作ったタグなどです。一覧に入れるか、ハッシュタグに変えるか、外せます。</p>`}
    </div>
    ${colorFor && html`<${ActionSheet} title=${`「${colorFor}」の色`} onClose=${() => setColorFor(null)}
      items=${TAG_COLORS.map((c, i) => ({ label: html`<span class="swatch-label"><span class="tag-swatch" style=${`background:${c}`}></span>${['Blue', 'Red', 'Yellow', 'Green', 'Purple', 'Cyan', 'Orange', 'Pink', 'Brown', 'Gray'][i]}</span>`, onClick: () => S.setTagColor(colorFor, i) }))} />`}
  </div>`;
}

export function QuickWords() {
  const words = [...S.state.quickWords].sort((a, b) => b.uses - a.uses);
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (!t || words.some((w) => w.text === t)) return;
    S.setQuickWords([...S.state.quickWords, { text: t, uses: 0 }]);
    setInput('');
  };
  return html`<div class="screen grouped">
    <${NavBar} title="Quick words" backLabel="Settings" />
    <div class="scroll">
      <div class="group">
        <form class="row" onSubmit=${(e) => { e.preventDefault(); add(); }}>
          <input class="row-input" placeholder="New word" aria-label="New word" value=${input} onInput=${(e) => setInput(e.target.value)} />
          <button type="submit" class="link-btn" disabled=${!input.trim()}>Add</button>
        </form>
      </div>
      <div class="group">${words.map((w) => html`<div class="row">
        <span class="row-label">${w.text}</span><span class="row-value">${w.uses}</span>
        <button class="icon-btn small muted" aria-label=${`Remove ${w.text}`} onClick=${() => S.setQuickWords(S.state.quickWords.filter((x) => x.text !== w.text))}>${Icon.close(16)}</button>
      </div>`)}</div>
      <p class="hint">よく使う順に並びます。入力欄の ＋ → Words から入れられます。</p>
    </div>
  </div>`;
}
