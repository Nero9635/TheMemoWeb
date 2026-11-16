// 画面の切り替え、テーマ、共通のダイアログ
import { html, render, useEffect } from '../vendor/preact-htm.js';
import * as S from './store.js';
import * as B from './backup.js';
import { useStore } from './ui.js';
import { Home } from './home.js';
import { Detail, Chat } from './detail.js';
import { Settings, Character, Search, Trash, QuickWords, Tags } from './settings.js';

function Screen({ s }) {
  switch (s.name) {
    case 'detail': return html`<${Detail} key=${s.id} id=${s.id} />`;
    case 'chat': return html`<${Chat} id=${s.id} />`;
    case 'settings': return html`<${Settings} />`;
    case 'character': return html`<${Character} />`;
    case 'search': return html`<${Search} key=${s.q ?? ''} initial=${s.q ?? ''} />`;
    case 'tags': return html`<${Tags} />`;
    case 'trash': return html`<${Trash} />`;
    case 'words': return html`<${QuickWords} />`;
    default: return html`<${Home} />`;
  }
}

function App() {
  const st = useStore();

  // テーマ(System / Light / Dark)
  useEffect(() => {
    document.documentElement.dataset.theme = st.settings.theme;
  }, [st.settings.theme]);

  if (!st.ready) return html`<div class="loading"></div>`;
  const top = st.stack[st.stack.length - 1];
  return html`
    <div class="stack">
      <${Screen} s=${top} />
    </div>
    ${st.message && html`<div class="backdrop center" onClick=${() => S.setState({ message: null })}>
      <div class="alert" role="alertdialog" aria-label="Message" onClick=${(e) => e.stopPropagation()}>
        <p class="pre">${st.message}</p>
        <div class="alert-buttons"><button class="strong" onClick=${() => S.setState({ message: null })}>OK</button></div>
      </div></div>`}
    ${st.review && html`<div class="backdrop center" onClick=${() => S.setState({ review: null })}>
      <div class="alert wide" role="alertdialog" aria-label="Review" onClick=${(e) => e.stopPropagation()}>
        <div class="alert-title">Review ${st.review.label}</div>
        <div class="alert-scroll pre">${st.review.text}</div>
        <div class="alert-buttons"><button onClick=${() => S.setState({ review: null })}>Close</button><button class="strong" onClick=${S.saveReview}>Save as memo</button></div>
      </div></div>`}
    ${st.pendingSettings && html`<div class="backdrop center">
      <div class="alert" role="alertdialog" aria-label="Restore settings">
        <div class="alert-title">Restore settings too?</div>
        <p class="pre">${st.pendingSettings.message}\n\nこのバックアップには、設定・プロフィール・AIの人物${st.pendingSettings.settings.gemini_api_key ? '・APIキー' : ''}も入っています。今の設定を置き換えますか?</p>
        <div class="alert-buttons"><button onClick=${() => S.setState({ pendingSettings: null })}>Memos only</button>
          <button class="strong" onClick=${() => B.applySettings(st.pendingSettings.settings)}>Restore settings</button></div>
      </div></div>`}
  `;
}

/**
 * iPhone ではキーボードが出ても画面の高さが変わらないので、
 * 見えている高さに合わせて、下の入力欄がキーボードの上に来るようにする
 */
function fitViewport() {
  const vv = window.visualViewport;
  const set = () => {
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', `${h}px`);
    if (vv) window.scrollTo(0, 0);
  };
  set();
  vv?.addEventListener('resize', set);
  vv?.addEventListener('scroll', set);
  window.addEventListener('resize', set);
}

fitViewport();
history.replaceState({ depth: 1 }, '');
render(html`<${App} />`, document.getElementById('app'));
S.init();

// オフラインでも開けるようにする(https か localhost の時だけ動く)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
