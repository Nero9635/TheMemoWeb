// 画面の切り替え、テーマ・文字の大きさ・言語、共通のダイアログ
import { html, render, useEffect } from '../vendor/preact-htm.js';
import * as S from './store.js';
import * as B from './backup.js';
import { useStore } from './ui.js';
import { t } from './i18n.js';
import { Home } from './home.js';
import { Detail } from './detail.js';
import { Settings, Character, Search, Trash, QuickWords, Tags } from './settings.js';

function Screen({ s }) {
  switch (s.name) {
    // 以前の版や控えから戻した時は、作り直して新しい中身を見せる
    case 'detail': return html`<${Detail} key=${`${s.id}:${S.state.editorRev ?? 0}`} id=${s.id} reply=${!!s.reply} />`;
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

  // テーマ(System / Light / Dark)と文字の大きさ
  useEffect(() => {
    document.documentElement.dataset.theme = st.settings.theme;
    document.documentElement.style.setProperty('--ts', String(S.TEXT_SIZES[st.settings.textSize] ?? 1));
    document.documentElement.dataset.font = st.settings.writingFont === 'serif' ? 'serif' : 'default';
    document.documentElement.style.setProperty('--ed-lh', String(S.LINE_SPACINGS[st.settings.lineSpacing] ?? 1.6));
    document.documentElement.style.setProperty('--ed-side', `${S.EDITOR_MARGINS[st.settings.editorMargin] ?? 16}px`);
  }, [st.settings.theme, st.settings.textSize, st.settings.writingFont, st.settings.lineSpacing, st.settings.editorMargin]);

  if (!st.ready) return html`<div class="loading"></div>`;
  const top = st.stack[st.stack.length - 1];
  return html`
    <div class="stack" key=${st.settings.language}>
      <${Screen} s=${top} />
    </div>
    ${st.message && html`<div class="backdrop center" onClick=${() => S.setState({ message: null })}>
      <div class="alert glass" role="alertdialog" aria-label=${t('message')} onClick=${(e) => e.stopPropagation()}>
        <p class="pre">${st.message}</p>
        <div class="alert-buttons"><button class="strong" onClick=${() => S.setState({ message: null })}>${t('ok')}</button></div>
      </div></div>`}
    ${st.review && html`<div class="backdrop center" onClick=${() => S.setState({ review: null })}>
      <div class="alert glass wide" role="alertdialog" aria-label=${t('review', { label: st.review.label })} onClick=${(e) => e.stopPropagation()}>
        <div class="alert-title">${t('review', { label: st.review.label })}</div>
        <div class="alert-scroll pre">${st.review.text}</div>
        <div class="alert-buttons"><button onClick=${() => S.setState({ review: null })}>${t('close')}</button><button class="strong" onClick=${S.saveReview}>${t('saveAsMemo')}</button></div>
      </div></div>`}
    ${st.pendingSettings && html`<div class="backdrop center">
      <div class="alert glass" role="alertdialog" aria-label=${t('restoreSettingsQ')}>
        <div class="alert-title">${t('restoreSettingsQ')}</div>
        <p class="pre">${st.pendingSettings.message}\n\n${t('restoreSettingsText', { key: st.pendingSettings.settings.gemini_api_key ? t('andKey') : '' })}</p>
        <div class="alert-buttons"><button onClick=${() => S.setState({ pendingSettings: null })}>${t('memosOnly')}</button>
          <button class="strong" onClick=${() => B.applySettings(st.pendingSettings.settings)}>${t('restoreSettings')}</button></div>
      </div></div>`}
  `;
}

/**
 * iPhone / iPad ではキーボードが出ても画面の高さが変わらないので、
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

/** 指2本での拡大縮小とダブルタップの拡大を止める(iOS は viewport の指定だけでは止まらない) */
function noZoom() {
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
noZoom();

// アプリを閉じる・ほかのアプリに切り替える時は、書きかけの変更をすぐ保存する
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') S.flushSaves(); });
window.addEventListener('pagehide', () => S.flushSaves());
history.replaceState({ depth: 1 }, '');
render(html`<${App} />`, document.getElementById('app'));
S.init();

// オフラインでも開けるようにする(https か localhost の時だけ動く)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
