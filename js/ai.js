// Gemini の呼び出しと、すべてのプロンプト(Android 版 ai/Prompts.kt と同じ内容)

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-flash-latest';

export class AiError extends Error {}

/** turns: [{fromUser, text}] */
export async function generate(apiKey, model, system, turns, json = false) {
  const name = (model || DEFAULT_MODEL).trim().replace(/^models\//, '');
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: turns.map((t) => ({ role: t.fromUser ? 'user' : 'model', parts: [{ text: t.text }] })),
  };
  if (json) body.generationConfig = { responseMimeType: 'application/json' };
  const res = await request('POST', `${BASE}/models/${name}:generateContent`, apiKey, body);
  const candidate = res.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
  if (!text) {
    const reason = res.promptFeedback?.blockReason || candidate?.finishReason;
    throw new AiError(`AIから応答が返りませんでした${reason ? `(${reason})` : ''}。`);
  }
  return text;
}

/** generateContent に対応した Gemini のモデル名 */
export async function listModels(apiKey) {
  const res = await request('GET', `${BASE}/models?pageSize=1000`, apiKey, null);
  return (res.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini'))
    .sort();
}

async function request(method, url, apiKey, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'x-goog-api-key': apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AiError('通信できませんでした。電波の状況を確認して、もう一度試してください。');
  }
  const raw = await res.text();
  if (!res.ok) {
    let detail = '';
    try { detail = JSON.parse(raw).error?.message ?? ''; } catch { /* 読めなければ空 */ }
    const code = res.status;
    const hint = [400, 401, 403].includes(code) ? 'APIキーが正しいか設定で確認してください。'
      : code === 404 ? 'モデル名が正しいか設定で確認してください。'
        : code === 429 ? '利用上限に達しました。少し待ってからもう一度試してください。'
          : code >= 500 ? 'Gemini側で問題が起きています。少し待ってからもう一度試してください。' : '';
    throw new AiError([`AIの呼び出しに失敗しました(エラー ${code})。`, hint, detail].filter(Boolean).join('\n'));
  }
  return JSON.parse(raw);
}

// ---- プロンプト ----

const PLAIN = 'Markdown記法(# や ** など)は使わず、プレーンテキストで、メモと同じ言語で書いてください。'
  + 'スマホの小さな画面で読むので簡潔にしてください。';

/** どの人物でも必ず守ること(消さない) */
const SAFETY = 'もし死にたい気持ちなど強い苦しみがうかがえる時だけは、分析をせずに気持ちに寄り添い、'
  + '信頼できる人や専門の相談窓口に話すようやさしくすすめてください。';

export function personaPrompt(p) {
  let s = `あなたは「${p.name.trim()}」として振る舞います。`;
  if (p.role.trim()) s += `人物・役割: ${p.role.trim()} `;
  if (p.style.trim()) s += `話し方: ${p.style.trim()} `;
  if (p.aboutUser.trim()) {
    s += `ユーザーについて前もって知っていること: ${p.aboutUser.trim()} `;
    s += 'これは必要な時だけ自然に活かし、毎回わざわざ触れないでください。';
  }
  return s + SAFETY;
}

const POLISH = 'あなたは、散歩中に書かれた走り書きのメモを整える編集者です。'
  + 'メモには、思いついた言葉が断片的に並んでいたり、誤字や言い間違い、'
  + '音声入力の誤変換が混ざっていたりします。書き手の意図と内容は変えずに、'
  + '誤りを直し、言葉どうしをつなげて読みやすくしてください。'
  + 'メモにない事実や意見は付け足さないでください。'
  + '整えた結果だけを出力し、前置きや説明は書かないでください。';

export const POLISH_PROSE = POLISH + '自然な文章にしてください。段落はできるだけ少なく(1〜3段落)、'
  + '短い文は1文ずつ改行せず、同じ段落の中でつなげてください。' + PLAIN;

export const POLISH_BULLETS = POLISH + '要点ごとの箇条書きにしてください。1項目1行で、行頭は「・」を使います。' + PLAIN;

export const IDEAS = 'あなたはアイデアの壁打ち相手です。ユーザーのメモにあるアイデアを発展させてください。'
  + '「別の視点」「掘り下げる問い」「次の小さな一歩」の3つの見出しで、'
  + 'それぞれ2個ずつ、1項目40文字以内で具体的に提案してください(行頭は「・」)。'
  + 'メモの内容を言い直すだけの項目は書かないでください。'
  + '前置きや挨拶は書かず、最初の見出しから書き始めてください。' + PLAIN;

/**
 * タイトル・タグ・ハッシュタグの提案。タグは決められた一覧からだけ選ばせ、新しいタグは作らせない。
 * 自由な言葉はハッシュタグとして出してもらう
 */
export function titleTagsPrompt(tagNames) {
  const list = tagNames.length ? tagNames.map((t) => `「${t}」`).join('、') : '(なし)';
  return 'ユーザーのメモに、後から探しやすいタイトル・タグ・ハッシュタグを付けてください。'
    + '次の形式のJSONだけを出力してください: {"title": "...", "tags": ["..."], "hashtags": ["..."]}。'
    + 'title は20文字以内。'
    + `tags は次の一覧の中から、内容に本当に合うものだけを0〜2個選んでください: ${list}。`
    + '一覧にない言葉は tags に絶対に入れないでください。合うものがなければ空の配列にします。'
    + 'hashtags は、メモに出てくる固有の物・場所・テーマを表す短い言葉を0〜3個(# は付けない、空白なし)。'
    + 'どれもメモと同じ言語で書いてください。';
}

export function commentPrompt(p) {
  return personaPrompt(p) + `ユーザーのメモ全体を読み、${p.name}としてひとつにまとまったコメントを書いてください。`
    + 'メモに表れた思いや関心を読み解いた見立てと、本人が考えを深められる問いを1つ含めます。'
    + '3〜5文、200文字程度で、段落は1つにしてください。'
    + 'メモの内容を言い直すだけにならないようにし、前置きや挨拶は書かないでください。' + PLAIN;
}

export const REVIEW = 'あなたはユーザーのメモを一緒にふりかえる相手です。'
  + 'ある期間のメモが【日付 時刻】付きで渡されます。次の3つの見出しで書いてください: '
  + '「よく出てきたテーマ」(2〜4個、どの日のメモに出てきたかも添える)、'
  + '「気づいたこと」(考えの変化やつながり)、「次に試すこと」(2〜3個)。'
  + '行頭は「・」を使ってください。前置きや挨拶は書かないでください。' + PLAIN;

export const DAY_SUMMARY = 'ある一日にユーザーが書いた投稿(メモ)が、【時刻】付きで時間順に渡されます。'
  + 'その日一日を短くまとめてください。最初に一日を表す一文を書き、'
  + '続けて出来事や考えたことの要点を3〜5個、行頭に「・」を付けて書きます。'
  + '投稿にない事実は付け足さないでください。前置きや挨拶は書かないでください。' + PLAIN;

export function dayCommentPrompt(p) {
  return personaPrompt(p) + 'ある一日にユーザーが書いた投稿(メモ)が、【時刻】付きで時間順に渡されます。'
    + `その一日全体を読み、${p.name}として、一日の流れに表れた心の動きや関心を読み解き、`
    + '本人が明日に向けて考えを深められる問いを1つ添えたコメントを書いてください。'
    + '4〜6文、250文字程度で、段落は1つ。前置きや挨拶は書かないでください。' + PLAIN;
}

export function chatPrompt(memoText, p) {
  return personaPrompt(p) + `ユーザーが書いたメモについて、${p.name}として対話します。`
    + 'ユーザーは歩きながらスマホで読むことがあるので、返答は短く、要点から書いてください。'
    + PLAIN + '\n\n--- メモ ---\n' + memoText;
}

/** 応答に前後の説明やコードフェンスが付いていても、中の JSON だけを取り出す */
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new AiError('AIの応答を読み取れませんでした。もう一度試してください。');
  return JSON.parse(text.slice(start, end + 1));
}
