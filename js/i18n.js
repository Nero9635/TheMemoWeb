// 画面の言葉(英語・日本語・中国語)。既定は英語。設定の Language で切り替える
// 使い方: t('post') / t('nPosts', { n: 3 })

let lang = 'en';
const LOCALES = { en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };

export const LANGUAGES = [['en', 'English'], ['ja', '日本語'], ['zh', '简体中文']];

export function setLang(l) {
  lang = LOCALES[l] ? l : 'en';
  document.documentElement.lang = { en: 'en', ja: 'ja', zh: 'zh-Hans' }[lang];
}
export const getLang = () => lang;
export const locale = () => LOCALES[lang];

const D = {
  // ---- 共通 ----
  back: ['Back', '戻る', '返回'],
  cancel: ['Cancel', 'キャンセル', '取消'],
  done: ['Done', '完了', '完成'],
  save: ['Save', '保存', '保存'],
  ok: ['OK', 'OK', '好'],
  close: ['Close', '閉じる', '关闭'],
  add: ['Add', '追加', '添加'],
  remove: ['Remove', '外す', '移除'],
  delete: ['Delete', '削除', '删除'],
  copy: ['Copy', 'コピー', '复制'],
  share: ['Share', '共有', '分享'],
  edit: ['Edit', '編集', '编辑'],
  more: ['More', 'その他', '更多'],
  showMore: ['Show more', 'もっと見る', '展开'],
  today: ['Today', '今日', '今天'],
  diary: ['Diary', '日記', '日记'],
  post: ['Post', '投稿', '帖子'],
  photo: ['Photo', '写真', '照片'],
  photos: ['Photos', '写真', '照片'],
  camera: ['Camera', 'カメラ', '相机'],
  tags: ['Tags', 'タグ', '标签'],
  words: ['Words', 'ワード', '常用词'],
  search: ['Search', '検索', '搜索'],
  settings: ['Settings', '設定', '设置'],
  copied: ['Copied.', 'コピーしました。', '已复制。'],
  copyFailed: ['Could not copy.', 'コピーできませんでした。', '无法复制。'],
  steps: ['{n} steps', '{n} 歩', '{n} 步'],
  nPosts: ['{n} posts', '{n}件', '{n} 条'],
  onePost: ['1 post', '1件', '1 条'],
  noPosts: ['No posts', '投稿なし', '没有帖子'],

  // ---- ホーム ----
  write: ['Write…', '書く…', '写点什么…'],
  writeLabel: ['Write a post', '投稿を書く', '写帖子'],
  addTools: ['Add photo or tag', '写真やタグを追加', '添加照片或标签'],
  closeTools: ['Close tools', '道具を閉じる', '关闭工具'],
  dictate: ['Dictate', '音声入力', '语音输入'],
  stopDictate: ['Stop dictation', '音声入力を止める', '停止语音输入'],
  send: ['Post', '投稿', '发布'],
  latest: ['Latest', '最新', '最新'],
  noPostsYet: ['No posts yet', 'まだ投稿がありません', '还没有帖子'],
  noPostsHint: ['Write whatever comes to mind in the box below.', '下の入力欄に、思いついたことを書いて送ってみましょう。', '在下方输入框写下你想到的任何事。'],
  showMonth: ['Show month', '月を表示', '显示月份'],
  showWeek: ['Show week', '週を表示', '显示周'],
  showCalendar: ['Show calendar', 'カレンダーを表示', '显示日历'],
  aiReview: ['AI review', 'AIで振り返り', 'AI 回顾'],
  aiForDay: ['AI for this day', 'この日のAI', '这一天的 AI'],
  summarizeDay: ['Summarize the day', 'この日をまとめる', '总结这一天'],
  personaOnDay: ['{name} on the day', '{name} がこの日にコメント', '{name} 评论这一天'],
  daySummary: ['Day summary', '一日のまとめ', '当日总结'],
  summarizeAgain: ['Summarize again', 'もう一度まとめる', '重新总结'],
  commentAgain: ['Comment again', 'もう一度コメント', '重新评论'],
  onDay: ['on {d}', '{d}', '{d}'],
  replies: ['Replies', '返信', '回复'],
  ask: ['Ask {name}', '{name} に聞く', '问 {name}'],
  thisWeek: ['This week', '今週', '本周'],
  thisMonth: ['This month', '今月', '本月'],
  statPosts: ['posts', '投稿', '帖子'],
  statDays: ['days', '日', '天'],
  statPhotos: ['photos', '写真', '照片'],
  statStreak: ['day streak', '日連続', '天连续'],
  dayDetail: ['{n} posts · {p} photos', '投稿 {n} · 写真 {p}', '{n} 条帖子 · {p} 张照片'],
  hasDiary: ['Diary written', '日記あり', '已写日记'],
  open: ['Open', '開く', '打开'],

  // ---- 投稿メニュー ----
  changeTime: ['Change time', '時刻を変更', '更改时间'],
  changeDate: ['Change date', '日付を変更', '更改日期'],
  copyText: ['Copy text', '文章をコピー', '复制文字'],
  date: ['Date', '日付', '日期'],
  time: ['Time', '時刻', '时间'],
  diaryTaken: ['There is already a diary on this day.', 'この日にはもう日記があります。', '这一天已经有日记了。'],
  confirmTrash: ['Move this post to Trash?\nYou can restore it from Settings › Trash for 30 days.', 'この投稿をゴミ箱に移しますか?\n30日間は設定の「ゴミ箱」から戻せます。', '把这条帖子移到废纸篓?\n30 天内可在“设置 › 废纸篓”中恢复。'],

  // ---- タグ ----
  notInList: ['not in list', '一覧にない', '不在列表中'],
  addTagToList: ['Add a tag to the list', '一覧にタグを追加', '在列表中添加标签'],
  tagSheetHint: ['Tags are fixed categories. For free words, write #words in the text — they become hashtags.', 'タグは決まった分類です。自由な言葉は、本文に「#銀杏」のように書くとハッシュタグになります。', '标签是固定的分类。自由的词语请在正文中写成“#银杏”，会成为话题标签。'],
  manageTags: ['Manage tags', 'タグを管理', '管理标签'],
  newTag: ['New tag', '新しいタグ', '新标签'],
  yourTags: ['YOUR TAGS', 'タグ一覧', '我的标签'],
  tagsHint: ['Tags are fixed categories; AI only picks from this list. Use #hashtags in the text for free words.', 'タグは決まった分類です。AI もこの一覧の中からだけ選びます。自由な言葉は本文の #ハッシュタグ を使ってください。', '标签是固定的分类，AI 也只会从这个列表中选择。自由的词语请在正文里使用 #话题标签。'],
  tagsEditHint: ['Tap a name to rename it, or the circle to change its color.', '名前を押すと変更、左の丸で色を選べます。', '点名称可重命名，点左侧圆点可换颜色。'],
  notInListTitle: ['NOT IN THE LIST ({n})', '一覧にないタグ ({n})', '不在列表中的标签 ({n})'],
  notInListHint: ['Tags from older versions or the Android app. Add them, turn them into hashtags, or remove them.', '以前の版や Android 版の AI が作ったタグです。一覧に入れる・ハッシュタグに変える・外すを選べます。', '来自旧版本或 Android 版 AI 的标签。可以加入列表、转为话题标签或移除。'],
  toHashtag: ['→ #', '→ #', '→ #'],
  tagName: ['Tag name', 'タグの名前', '标签名称'],
  confirmDeleteTag: ['Delete the tag “{name}”?\nIt will be removed from {n} posts (the posts stay).', 'タグ「{name}」を消しますか?\n付いている{n}件の投稿からも外れます(投稿は消えません)。', '删除标签“{name}”?\n它会从 {n} 条帖子中移除(帖子保留)。'],
  confirmToHashtag: ['Turn “{name}” into #{tag}?\nIt is added to the end of {n} posts and removed as a tag.', '「{name}」を #{tag} に変えますか?\n{n}件の投稿の本文の最後に足し、タグからは外します。', '把“{name}”改为 #{tag}?\n会添加到 {n} 条帖子末尾，并移除该标签。'],
  confirmRemoveTag: ['Remove “{name}” from {n} posts?', '「{name}」を{n}件の投稿から外しますか?', '从 {n} 条帖子中移除“{name}”?'],
  colorOf: ['Color of “{name}”', '「{name}」の色', '“{name}”的颜色'],
  colors: [['Blue', 'Red', 'Yellow', 'Green', 'Purple', 'Cyan', 'Orange', 'Pink', 'Brown', 'Gray'], ['青', '赤', '黄', '緑', '紫', '水色', '橙', '桃', '茶', '灰'], ['蓝', '红', '黄', '绿', '紫', '青', '橙', '粉', '棕', '灰']],

  // ---- 詳細 ----
  titleOptional: ['Title (optional)', 'タイトル(任意)', '标题(可选)'],
  whatsHappening: ["Type, or press / for blocks", '入力、または / でブロック', '输入，或按 / 选择块'],
  addTag: ['Add tag', 'タグを追加', '添加标签'],
  editTags: ['Edit tags', 'タグを編集', '编辑标签'],
  talkWith: ['Talk with {name}', '{name} と話す', '与 {name} 对话'],
  commentOf: ["{name}'s comment", '{name} のコメント', '{name} 的评论'],
  polishAi: ['Polish with AI', 'AIで整える', '用 AI 润色'],
  expanding: ['Expanding ideas…', 'アイデアを広げています…', '正在拓展想法…'],
  findingTitle: ['Finding a title…', 'タイトルを考えています…', '正在想标题…'],
  replyingTo: ['Replying to {name}', '{name} への返信', '回复 {name}'],
  polished: ['Polished · editable', '整えた文章 · 編集可', '润色后 · 可编辑'],
  ideasLabel: ['Ideas', 'アイデア', '想法'],
  chat: ['Chat', '会話', '对话'],
  polishProseAgain: ['Polish again: prose', 'もう一度: 文章に', '重新润色: 段落'],
  polishBulletsAgain: ['Polish again: bullets', 'もう一度: 箇条書きに', '重新润色: 要点'],
  appendToPost: ['Append to post', '本文に追加', '追加到正文'],
  replacePost: ['Replace post', '本文と置き換え', '替换正文'],
  confirmReplace: ['Replace the text with the AI version?', '本文をAIの文章に置き換えますか?', '用 AI 的文字替换正文?'],
  continueChat: ['Continue the conversation ({n})', '会話を続ける ({n})', '继续对话 ({n})'],
  updated: ['Updated {d}', '更新 {d}', '更新于 {d}'],
  removePhoto: ['Remove this photo?', 'この写真を外しますか?', '移除这张照片?'],
  polishProse: ['Polish into prose', '文章に整える', '润色成段落'],
  polishBullets: ['Polish into bullets', '箇条書きに整える', '整理成要点'],
  expandIdeas: ['Expand ideas', 'アイデアを広げる', '拓展想法'],
  titleTags: ['Title & tags', 'タイトルとタグ', '标题与标签'],
  comment: ['Comment', 'コメント', '评论'],
  aiSuggestion: ['AI suggestion', 'AIの提案', 'AI 建议'],
  sugTitle: ['Title: {v}', 'タイトル: {v}', '标题: {v}'],
  sugTags: ['Tags: {v}', 'タグ: {v}', '标签: {v}'],
  sugHashtags: ['Hashtags: {v}', 'ハッシュタグ: {v}', '话题标签: {v}'],
  none: ['(none)', '(なし)', '(无)'],
  noMatchingTag: ['(none from your list)', '(一覧に合うものなし)', '(列表中没有合适的)'],
  apply: ['Apply', '適用', '应用'],
  message: ['Message', 'メッセージ', '消息'],
  clear: ['Clear', '消す', '清除'],
  confirmClearChat: ['Clear this conversation?', '会話を消しますか?', '清除这段对话?'],
  chatEmpty: ['Talk with {name} about this memo.\nThe memo is sent to the AI only when you send a message.', 'このメモについて{name}と話してみましょう。\n送信した時だけ、メモの内容がAIに送られます。', '和 {name} 聊聊这条笔记。\n只有在发送消息时，笔记内容才会发送给 AI。'],

  // ---- ブロック ----
  blockText: ['Text', 'テキスト', '文本'],
  blockH1: ['Heading 1', '見出し1', '标题 1'],
  blockH2: ['Heading 2', '見出し2', '标题 2'],
  blockBullet: ['Bulleted list', '箇条書き', '项目符号列表'],
  blockNumbered: ['Numbered list', '番号付きリスト', '编号列表'],
  blockTodo: ['To-do list', 'ToDo リスト', '待办清单'],
  blockQuote: ['Quote', '引用', '引用'],
  blockDivider: ['Divider', '区切り線', '分隔线'],
  turnInto: ['Turn into', '変換', '转换为'],
  moveUp: ['Move up', '上へ移動', '上移'],
  moveDown: ['Move down', '下へ移動', '下移'],
  deleteBlock: ['Delete block', 'ブロックを削除', '删除块'],
  blockHint: ['Shortcuts: # Heading · - List · 1. Numbered · [] To-do · > Quote · --- Divider', 'ショートカット: # 見出し · - 箇条書き · 1. 番号 · [] ToDo · > 引用 · --- 区切り', '快捷方式: # 标题 · - 列表 · 1. 编号 · [] 待办 · > 引用 · --- 分隔线'],
  format: ['Format', '書式', '格式'],

  // ---- 設定 ----
  profileHint: ['Name and photo shown on your posts', '名前とアイコン(投稿に表示)', '帖子上显示的名字和头像'],
  appearance: ['APPEARANCE', '表示', '外观'],
  language: ['Language', '言語', '语言'],
  theme: ['Theme', 'テーマ', '主题'],
  system: ['System', '自動', '跟随系统'],
  light: ['Light', 'ライト', '浅色'],
  dark: ['Dark', 'ダーク', '深色'],
  textSize: ['Text size', '文字の大きさ', '文字大小'],
  sizes: [['S', 'M', 'L', 'XL'], ['小', '中', '大', '特大'], ['小', '中', '大', '特大']],
  aiCharacter: ['AI character', 'AIの人物', 'AI 角色'],
  apiKey: ['API key', 'APIキー', 'API 密钥'],
  apiKeyPlaceholder: ['Gemini API key', 'Gemini APIキー', 'Gemini API 密钥'],
  model: ['Model', 'モデル', '模型'],
  show: ['Show', '表示', '显示'],
  hide: ['Hide', '隠す', '隐藏'],
  checkModels: ['Check models', 'モデルを確認', '检查模型'],
  checking: ['Checking…', '確認中…', '检查中…'],
  checkFailed: ['Could not check.', '確認できませんでした。', '无法检查。'],
  aiHint: ['Memos stay on this device. Only when you tap ✦ or the character icon is the content sent to the Google Gemini API. Get a key at aistudio.google.com/apikey.', 'メモは端末の中だけに保存されます。✦ や人物のアイコンを押した時だけ、その内容が Google の Gemini API に送られます。APIキーは aistudio.google.com/apikey で取得できます。', '笔记只保存在本设备上。只有点 ✦ 或角色图标时，内容才会发送到 Google Gemini API。可在 aistudio.google.com/apikey 获取密钥。'],
  writing: ['WRITING', '書く', '写作'],
  quickWords: ['Quick words', '簡単ワード', '常用词'],
  writingHint: ['Tags are fixed categories (AI only picks from them). Write #words in the text for free hashtags.', 'タグは決まった分類(AI もこの中からだけ選びます)。自由な言葉は本文に #言葉 と書くとハッシュタグになります。', '标签是固定分类(AI 只从中选择)。在正文中写 #词语 即成为自由的话题标签。'],
  data: ['DATA', 'データ', '数据'],
  backupMemos: ['Back up memos', 'メモをバックアップ', '备份笔记'],
  backupAll: ['Back up everything', 'すべてをバックアップ', '备份全部'],
  restore: ['Restore', '復元', '恢复'],
  archiveYear: ['Archive a year', '年ごとに保管', '按年归档'],
  trash: ['Trash', 'ゴミ箱', '废纸篓'],
  dataHint: ['Choose “Save to Files” or Google Drive in the share sheet. Backups from the Android app can be restored too. Use the app from the Home Screen so iPadOS keeps your data.', '共有シートで「ファイルに保存」や Google ドライブを選べます。Android 版のバックアップも読み込めます。ホーム画面から使うと、データが消されにくくなります。', '在分享菜单中选择“存储到文件”或 Google 云端硬盘。也可以恢复 Android 版的备份。请从主屏幕使用本应用，数据才不容易被系统清除。'],
  backupAllText: ['Saves settings, profile and AI character in addition to memos, photos, tags and day summaries.', 'メモ・写真・タグ・一日のまとめに加えて、設定・プロフィール・AIの人物も保存します。', '除笔记、照片、标签和当日总结外，还会保存设置、个人资料和 AI 角色。'],
  includeKey: ['Include API key', 'APIキーを含める', '包含 API 密钥'],
  keyWarning: ['Do not share a file that contains your API key.', 'APIキーが入ったファイルは、人に渡したり公開したりしないでください。', '含有 API 密钥的文件请不要分享或公开。'],
  archiveTitle: ['Choose a year. Its memos are saved to a file, then removed from this device.', '保管する年を選んでください。書き出してから、その年のメモを端末から外します。', '选择年份。该年的笔记会先导出成文件，再从本设备移除。'],
  yearItem: ['{y} · {n} memos', '{y}年 · {n}件', '{y}年 · {n} 条'],
  thisYear: [' (this year)', '(今年)', '(今年)'],
  version: ['Version {v}', 'バージョン {v}', '版本 {v}'],
  trashHint: ['Deleted memos stay here for 30 days and can be restored.', '削除したメモは30日間ここに残り、元に戻せます。', '删除的笔记会在这里保留 30 天，可以恢复。'],
  trashEmpty: ['Trash is empty.', 'ゴミ箱は空です。', '废纸篓是空的。'],
  empty: ['Empty', '空にする', '清空'],
  confirmEmptyTrash: ['Delete {n} memos permanently? This cannot be undone.', '{n}件を完全に削除します。元に戻せません。', '永久删除 {n} 条笔记?此操作无法撤销。'],
  confirmDeleteForever: ['Delete permanently? This cannot be undone.', '完全に削除します。元に戻せません。', '永久删除?此操作无法撤销。'],
  newWord: ['New word', '新しい言葉', '新词语'],
  wordsHint: ['Sorted by use. Insert them from + › Words.', 'よく使う順に並びます。入力欄の ＋ → ワード から入れられます。', '按使用次数排序。可从 + › 常用词 插入。'],
  searchPlaceholder: ['Search or #hashtag', '検索 または #ハッシュタグ', '搜索或 #话题标签'],
  notFound: ['No results.', '見つかりませんでした。', '没有结果。'],
  results: ['{n} results', '{n}件', '{n} 条结果'],
  hashtags: ['HASHTAGS', 'ハッシュタグ', '话题标签'],
  tagsTitle: ['TAGS', 'タグ', '标签'],
  photoLabel: ['(photo)', '(写真)', '(照片)'],

  // ---- 人物 ----
  reset: ['Reset', 'リセット', '重置'],
  confirmResetPersona: ['Reset to Dr. Jung? “About me” is kept.', 'ユング先生に戻しますか?「About me」は残ります。', '恢复为荣格博士?“关于我”会保留。'],
  choosePhoto: ['Choose photo', '写真を選ぶ', '选择照片'],
  removePhotoBtn: ['Remove photo', '写真を外す', '移除照片'],
  name: ['Name', '名前', '名字'],
  icon: ['Icon', 'アイコン', '图标'],
  emojiOk: ['Emoji OK', '絵文字OK', '可用表情'],
  role: ['ROLE & BACKGROUND', '役割と設定', '角色与背景'],
  roleHint: ['Who they are, what they value, how they respond', 'どんな人物か、何を大切にし、どう関わるか', '是怎样的人、重视什么、如何回应'],
  style: ['SPEAKING STYLE', '話し方', '说话方式'],
  styleHint: ['Tone, how they address you, length', '口調・呼び方・長さなど', '语气、称呼、长短等'],
  aboutMe: ['ABOUT ME', '自分について', '关于我'],
  aboutHint: ['What this character should know about you (work, interests, goals…)', 'この人物に知っておいてほしいこと(仕事・関心・目標など)', '希望这个角色了解的关于你的事(工作、兴趣、目标等)'],
  safetyNote: ['Whatever the character, it will gently suggest talking to someone you trust or a helpline if you seem to be in serious distress.', '強い苦しみがうかがえる時に寄り添い、相談窓口をすすめる決まりは、どの人物でも変わりません。', '无论哪个角色，在察觉到你可能非常痛苦时，都会温和地建议你向信任的人或求助热线倾诉。'],

  // ---- バックアップ・メッセージ ----
  restoreSettingsQ: ['Restore settings too?', '設定も戻しますか?', '也恢复设置吗?'],
  restoreSettingsText: ['This backup also contains settings, profile and AI character{key}. Replace your current settings?', 'このバックアップには、設定・プロフィール・AIの人物{key}も入っています。今の設定を置き換えますか?', '此备份还包含设置、个人资料和 AI 角色{key}。要替换当前设置吗?'],
  andKey: [' and the API key', '・APIキー', '以及 API 密钥'],
  memosOnly: ['Memos only', 'メモだけ', '仅笔记'],
  restoreSettings: ['Restore settings', '設定も戻す', '恢复设置'],
  restored: ['Loaded {n} memos. When the same memo exists, the newer one is kept.', '{n}件のメモを読み込みました。同じメモは新しい方を残しています。', '已读取 {n} 条笔记。相同的笔记保留较新的版本。'],
  settingsRestored: ['Settings, profile and AI character restored.', '設定・プロフィール・AIの人物を戻しました。', '已恢复设置、个人资料和 AI 角色。'],
  notZip: ['Could not open the zip file.', 'zip ファイルを開けませんでした。', '无法打开 zip 文件。'],
  notBackup: ['This is not a The Memo backup.', 'The Memo のバックアップではありません。', '这不是 The Memo 的备份。'],
  backedUp: ['Backup saved.', 'バックアップを書き出しました。', '已导出备份。'],
  backedUpAll: ['Everything, including settings, was saved.', '設定も含めて、すべてを書き出しました。', '已导出包括设置在内的全部内容。'],
  backupFailed: ['Could not create the backup.', 'バックアップを作れませんでした。', '无法创建备份。'],
  archiveConfirm: ['Was the {y} file saved?\nTap OK to remove {n} memos from this device.', '{y}年のファイルを保存できましたか?\n「OK」で、{n}件のメモをこの端末から外します。', '{y} 年的文件保存好了吗?\n点“好”将从本设备移除 {n} 条笔记。'],
  archived: ['Archived {n} memos from {y} and removed them from this device. Restore them any time.', '{y}年のメモ{n}件を保管し、端末から外しました。「復元」でいつでも戻せます。', '已归档 {y} 年的 {n} 条笔记并从本设备移除。可随时恢复。'],
  archiveFailed: ['Could not archive. Nothing was removed.', '保管できませんでした。端末のメモは消していません。', '无法归档。本设备上的笔记未被删除。'],
  photoFailed: ['Could not load the photo.', '写真を読み込めませんでした。', '无法读取照片。'],
  needKey: ['To use AI, enter your Gemini API key in Settings.', 'AIを使うには、設定で Gemini の APIキーを入れてください。', '要使用 AI，请在设置中填写 Gemini API 密钥。'],
  memoEmpty: ['This memo is empty. Write something first.', 'メモがまだ空です。何か書いてから試してください。', '笔记还是空的，请先写点内容。'],
  noBody: ['There is no text to comment on yet.', 'コメントできる本文がまだありません。', '还没有可评论的正文。'],
  aiUnreadable: ['Could not read the AI response. Please try again.', 'AIの応答を読み取れませんでした。もう一度試してください。', '无法读取 AI 的回复，请重试。'],
  noDayPosts: ['No posts on this day yet.', 'この日の投稿はまだありません。', '这一天还没有帖子。'],
  noPeriodPosts: ['No memos in {label}.', '{label}のメモはありません。', '{label} 没有笔记。'],
  reviewTag: ['#review', '#振り返り', '#回顾'],
  reviewSaved: ['The review was saved as a memo.', '振り返りをメモとして保存しました。', '回顾已保存为笔记。'],
  review: ['Review {label}', '振り返り {label}', '回顾 {label}'],
  saveAsMemo: ['Save as memo', 'メモとして保存', '保存为笔记'],
  reviewTitle: ['Review {label}', '振り返り {label}', '回顾 {label}'],
  offline: ['Could not connect. Check your connection (or VPN) and try again.', '通信できませんでした。電波の状況(や VPN)を確認して、もう一度試してください。', '无法连接。请检查网络(或 VPN)后重试。'],
  aiFailed: ['The AI request failed (error {code}).', 'AIの呼び出しに失敗しました(エラー {code})。', 'AI 请求失败(错误 {code})。'],
  aiKeyHint: ['Check your API key in Settings.', 'APIキーが正しいか設定で確認してください。', '请在设置中检查 API 密钥。'],
  aiModelHint: ['Check the model name in Settings.', 'モデル名が正しいか設定で確認してください。', '请在设置中检查模型名称。'],
  aiLimitHint: ['Usage limit reached. Wait a little and try again.', '利用上限に達しました。少し待ってからもう一度試してください。', '已达到使用上限，请稍后重试。'],
  aiServerHint: ['Gemini is having trouble. Wait a little and try again.', 'Gemini側で問題が起きています。少し待ってからもう一度試してください。', 'Gemini 服务出现问题，请稍后重试。'],
  aiEmpty: ['The AI returned no answer{r}.', 'AIから応答が返りませんでした{r}。', 'AI 没有返回回答{r}。'],
};

const INDEX = { en: 0, ja: 1, zh: 2 };

export function t(key, vars = {}) {
  const entry = D[key];
  if (!entry) return key;
  let s = entry[INDEX[lang]] ?? entry[0];
  if (typeof s !== 'string') return s;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

// ---- 日付 ----

const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 「Mon, Nov 16」「11月16日(月)」「11月16日 周一」 */
export function formatDayL(d) {
  if (lang === 'ja') return `${d.getMonth() + 1}月${d.getDate()}日(${WEEK_JA[d.getDay()]})`;
  if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK_ZH[d.getDay()]}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 「November 2026」「2026年11月」 */
export function formatMonthL(y, m) {
  if (lang === 'en') return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${y}年${m}月`;
}

export function formatMonthShortL(m) {
  if (lang === 'en') return new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return `${m}月`;
}

/** カレンダーの曜日の見出し(日曜始まり) */
export function weekdayHeaders() {
  if (lang === 'ja') return WEEK_JA;
  if (lang === 'zh') return ['日', '一', '二', '三', '四', '五', '六'];
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
}

export function yearL(ms) {
  const y = new Date(ms).getFullYear();
  return lang === 'en' ? String(y) : `${y}年`;
}
