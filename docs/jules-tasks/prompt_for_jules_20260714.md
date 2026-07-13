# Jules向け指示書 — 2026-07-14（AIカンパニー）
Version: 1.0 / 担当: Jules（夜間非同期エージェント）

---

## ⚠️ 作業開始前に必ず読むこと（順番厳守）

1. `AGENTS.md`（プロジェクトルート）→ 絶対ルール3ヶ条を確認
2. `docs/design/DESIGN_SYSTEM.md` → カラー変数・フォント・CSSクラスのSSoT
3. `docs/design/DESIGN_SPEC.md` → 3層構造・アプリの世界観を確認
4. `src/App.tsx` → 現在の実装全体を把握してから着手する
5. `src/index.css` → 現在のCSSクラス定義を把握する

---

## 📋 今回の作業目標（優先度順）

**モック画像（`mock/` フォルダ内の PNG 全画面）のデザインを、現在の実装に忠実に再現すること。**
コンセプトは「Stardew Valley 風の温かみのある箱庭ゲーム UI」。
**ロジック・データフロー・コンポーネント構造は一切変更しないこと。CSS と JSX の見た目のみ改修すること。**

---

## 🛠️ タスク一覧

---

### タスク0【最最優先】アバター画像の再生成（牧場物語スタイル）

**背景・理由**: 現在 `public/avatars/` に配置されている5枚のアバター画像は洋ゲー的な写実的ドット絵で、コンセプトの「温かみのある箱庭ゲーム」と合っていない。**牧場物語（Harvest Moon / Story of Seasons）** のような、日本的・可愛らしい丸みのあるドット絵キャラクターに刷新する。

**生成する画像一覧**（`public/avatars/` に上書き保存すること）:

| ファイル名 | キャラクター設定 | プロンプトのキーワード |
|---|---|---|
| `avatar_strategy.png` | 経営戦略担当・女性・茶色のショートヘア・オレンジのかわいい服 | `story of seasons harvest moon style pixel art, cute japanese chibi female character, short brown hair, orange top, warm pastel background, round eyes, simple cute face, 16-bit pixel art, no realistic shading` |
| `avatar_designer.png` | UI/UXデザイナー・男性・黒髪・丸眼鏡・緑のセーター | `story of seasons harvest moon style pixel art, cute japanese chibi male character, messy black hair, round glasses, green sweater, soft green background, big round eyes, simple cute face, 16-bit pixel art, no realistic shading` |
| `avatar_security.png` | セキュリティエンジニア・パープルヘア・ダークパーカー | `story of seasons harvest moon style pixel art, cute japanese chibi character, purple hair, dark navy hoodie, soft purple background, big round eyes, simple cute face, 16-bit pixel art, no realistic shading` |
| `avatar_infrastructure.png` | インフラエンジニア・緑髪・黄色のヘルメット・作業着 | `story of seasons harvest moon style pixel art, cute japanese chibi character, short green hair, yellow construction helmet, work overalls, cyan background, big round eyes, simple cute face, 16-bit pixel art, no realistic shading` |
| `avatar_legal.png` | 法務アドバイザー・グレーヘア・スーツ | `story of seasons harvest moon style pixel art, cute japanese chibi female character, long grey hair, formal suit jacket, warm yellow background, big round eyes, gentle smile, simple cute face, 16-bit pixel art, no realistic shading` |

**Jules注**: Jules はゲーム内画像を直接生成する能力を持たない。その場合は、以下の代替手順をとること：
1. `public/avatars/README_AVATAR_REQUEST.md` に「再生成が必要な理由・スタイル指定・プロンプト」を記載して提出する
2. 上記ファイルを見た Antigravity が次のセッションで画像を再生成して配置する

---


**参照**: `mock/screen_S2_dashboard.png`、`mock/screen_S4_team.png`

**現状の問題**: アプリウィンドウに温かみのある木目調の外枠がない。フラットに見える。

**実装内容**:
- `src/App.tsx` の最外側 `<main>` タグのスタイルを変更し、アプリ全体を太い木目調ボーダーで囲う
- 現在の `p-8 bg-[var(--color-bg)]` を維持しつつ、外側に以下のスタイルを適用する
- `border: 6px solid var(--color-border-outer)` ＋ `border-radius: 8px` ＋ `box-shadow: inset 0 0 20px rgba(139,90,43,0.2)` を組み合わせる
- モックの雰囲気に合わせ、アプリ全体を `min-h-screen` ではなく `h-screen overflow-hidden` で固定高さにし、内側コンテンツがスクロールする構造を維持する

---

### タスク2【高優先】ヘッダーエリアの木目タイトルバー化

**参照**: `mock/screen_S2_dashboard.png` 上部

**現状の問題**: タイトルバーが単なるテキスト。モックにはドット絵の木のイラスト、チューリップの装飾、ゲーム風の太いフォントタイトルが存在する。

**実装内容**（`src/App.tsx` の共通ヘッダー部分を改修）:

1. **ヘッダー背景**: `background-color: var(--color-panel)` ＋ `border-bottom: 4px solid var(--color-border-outer)` に強化
2. **タイトルフォント**: 現在の `AIカンパニー` を Caveat フォント・大きめ（`text-4xl`）に変更、色は `var(--color-border-outer)` のダークブラウン
3. **サブテキスト**: タイトル右側に `Build the perfect AI team for your mission. 🌸` というキャプション表示（モック `screen_S3_new_project.png` 参照）
4. **ヘッダー右側ボタン群**: 現在の `設定 (S9)` ボタンを、モックの「⚙ 設定」スタイル（丸みのある `panel-paper` 風）に変更

---

### タスク3【高優先】サイドバーの「看板風」ボタンデザイン強化

**参照**: `mock/screen_S2_dashboard.png` 左サイドバー

**現状の問題**: プロジェクト名のボタンが小さくフラット。モックでは丸みが大きく、アクティブ項目はオレンジ＋立体感のある「看板」のように見える。

**実装内容**（`src/index.css` の `.sidebar-item` と `.sidebar-item-active` を修正）:

`.sidebar-item` の強化:
```css
.sidebar-item {
  background-color: var(--color-panel);
  border: 3px solid var(--color-border-inner);
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.1s, transform 0.05s;
  padding: 0.6rem 1rem;
  box-shadow: 0px 4px 0px var(--color-border-inner);
}
.sidebar-item:hover {
  background-color: #EDD9B0;
  transform: translateY(-1px);
}
.sidebar-item:active {
  transform: translateY(2px);
  box-shadow: none;
}
```

`.sidebar-item-active` の強化:
```css
.sidebar-item-active {
  background-color: var(--color-accent);
  color: var(--color-text);
  border: 3px solid var(--color-border-outer);
  border-radius: 12px;
  font-weight: 700;
  box-shadow: 0px 4px 0px var(--color-accent-shadow);
  padding: 0.6rem 1rem;
}
```

サイドバー「プロジェクト一覧」ヘッダーをモック通り `プロジェクト 🌿` という看板スタイルのラベルにする（`font-title` クラスで Caveat フォント）

---

### タスク4【中優先】ダッシュボード（S2）の統計バッジとメンバーカードのモック再現

**参照**: `mock/screen_S2_dashboard.png` 右メインエリア

**現状の問題**: 
- 統計バッジ（メンバー数・最終会議日・会議回数）が地味でアイコンがない
- メンバーカードのアバター画像枠のデザインがシンプルすぎる

**実装内容**（`src/App.tsx` のS2画面内 JSX を改修）:

1. **統計バッジ**: モック通り以下のアイコンと表示形式に変更
   - メンバー数: `👥 N メンバー`（N は動的）
   - 最終会議日: `📅 最終会議: --`
   - 会議回数: `🎙️ 会議回数: N回`

2. **統計バッジのスタイル**:
   - `className="panel-paper px-5 py-3 flex items-center gap-3 border-2 border-[var(--color-border-inner)]"` を適用
   - 背景色は `var(--color-bg)`（若干明るい羊皮紙色）

3. **メンバーカード**: `panel-paper` にさらに `box-shadow: 2px 4px 0px var(--color-border-inner)` を追加し、立体感を付与

---

### タスク5【中優先】`.panel-paper` の視覚的強化（全体的な質感向上）

**現状の問題**: `panel-paper` が単純な `border: 2px solid` のみで、モックの「羊皮紙カード」の温かみに欠ける

**実装内容**（`src/index.css` の `.panel-paper` を拡張）:

```css
.panel-paper {
  background-color: var(--color-panel);
  border: 2px solid var(--color-border-inner);
  border-radius: 10px;
  box-shadow: 
    0px 3px 0px var(--color-border-inner),
    inset 0 1px 0 rgba(255,255,255,0.4);
}
```

ボトムシャドウにより「カードが浮いている」ような質感を付与すること。
`inset` シャドウにより、カード上部に微細な光のハイライトを追加すること。

---

### タスク6【低優先・できれば】ホーム画面の未選択状態の改善

**現状の問題**: プロジェクトが未選択の時に「左のリストから選択してください」というテキストのみで殺風景。

**実装内容**:
- 中央に農場風の絵文字を大きく表示（🏡 など）
- その下にキャッチコピーを追加（Caveat フォント・`text-3xl`）:
  ```
  あなたのミッションのために、
  最高のAIチームをつくりましょう。🌸
  ```

---

### タスク7【機能実装】S4: チーム管理画面の実装

**参照**: `mock/screen_S4_team.png`、`docs/design/DESIGN_SPEC.md §4.4`

**現状の問題**: 現在の S2 ダッシュボードはプロジェクト一覧と同じ画面にメンバーカードを表示しているが、ROADMAP のノードD4（S4）として独立した「チーム管理画面」が必要。

**実装内容**（`src/App.tsx` に新規画面を追加）:

1. **画面遷移**: S2 のメンバーカードをクリックした時、または「チームを管理する」ボタンを押した時に `currentScreen === "teamManage"` 画面へ遷移する
   - `currentScreen` の型定義に `"teamManage"` を追加する

2. **S4 の画面構成**（`mock/screen_S4_team.png` を参照）:
   - **左サイドバー**: S2 と同じプロジェクト一覧（変更なし）
   - **メインエリアヘッダー**: `{プロジェクト名} チーム ✏️` という見出し
   - **メンバーリスト（縦型）**: メンバーを縦に並べた横長カード形式で表示
     - 各行: `[アバター画像] [名前] [役割バッジ（色付き）] [役割説明] | [💬 話す ボタン] [✏️ 編集 ボタン]`
     - 「話す」ボタン（緑系 `.btn-secondary`）→ 後述のS6チャット画面へ遷移
     - 「編集」ボタン（紫系 `.btn-secondary`）→ 現時点では `alert("S5: メンバーエディタは今後実装予定")` で可
   - **フッター**: `+ メンバーを追加`（点線ボタン）＋ `🎙️ 会議を開始する`（オレンジの btn-primary）

3. **役割バッジのカラー**: `getRoleColor()` の戻り値をバッジ背景色に使用する。例: 戦略→`#FAD8C3`、UI/UX→`#D5E8D4` など（`src/App.tsx` の既存関数を流用）

4. **戻るナビゲーション**: S4 画面右上に `← プロジェクトに戻る` ボタンを追加し、S2 へ戻れるようにする

5. **S2 → S4 への入口**: S2 ダッシュボードのプロジェクトヘッダー部分に `👥 チームを管理する` ボタンを追加する

---

### タスク8【機能実装】S6: 1on1チャット画面の実装

**参照**: `mock/screen_S6_chat.png`、`docs/design/DESIGN_SPEC.md §4.6`

**現状の問題**: AIメンバーと個別に会話できる画面が未実装。

**重要な前提**:
- APIキー呼び出しは **行わない**（Phase 1の現段階ではUI・データ構造の実装のみ）
- メッセージは `chat_messages` テーブルへの保存・取得のみ行う
- AIの返答は `"（AIの返答機能は今後実装予定です）"` というプレースホルダーを一時的に使用

**実装内容**（`src/App.tsx` に新規画面を追加）:

1. **画面遷移**: 
   - `currentScreen` の型定義に `"chat"` を追加する
   - `chatMemberId` という State を追加し、どのメンバーとの会話か管理する
   - S4 の「話す」ボタンを押した時に `setChatMemberId(member.id)` → `setCurrentScreen("chat")` を実行

2. **S6 の画面構成**（`mock/screen_S6_chat.png` を参照）:
   - **左サイドバー**: S2/S4 と同じプロジェクト一覧
   - **ヘッダー**: 対象メンバーのアバター画像（小）＋ 名前 ＋ 役割バッジ ＋ 右上に `← チームに戻る` ボタン
   - **チャットエリア（メイン）**: スクロール可能なメッセージ表示領域
     - ユーザーメッセージ: 右寄せ、丸みのある吹き出し（`var(--color-bg)` 背景 + `var(--color-border-inner)` ボーダー）
     - AIメッセージ: 左寄せ、メンバーアバター付き、白系の吹き出し
   - **入力フォームフッター**: テキストエリア ＋ `📨 送信` ボタン（`btn-primary`）

3. **メッセージ管理**（データ永続化）:
   ```typescript
   // DB読み込み（画面表示時）
   const messages = await db.select<ChatMessage[]>(
     'SELECT * FROM chat_messages WHERE member_id = ? ORDER BY created_at ASC',
     [chatMemberId]
   );
   
   // 送信処理（ユーザーメッセージのみ保存。AIの返答は今後実装）
   await db.execute(
     'INSERT INTO chat_messages (member_id, role, content, created_at) VALUES (?, ?, ?, ?)',
     [chatMemberId, 'user', messageText, new Date().toISOString()]
   );
   ```
   - `ChatMessage` の型は `{ id: number, member_id: number, role: 'user' | 'assistant', content: string, created_at: string }` とする

4. **「送信」後の挙動（暫定）**:
   - ユーザーの入力をDBに保存しメッセージ一覧に追加表示する
   - 1秒後に `{ role: 'assistant', content: '（AIの返答機能は今後のセッションで実装予定です）' }` をUIに表示する（DBへは保存しなくてOK）


- **ロジックの変更禁止**: DB操作・状態管理・プロンプトマージロジックは一切変更しない
- **ハードコードカラー禁止**: カラーコードは必ず `var(--color-*)` CSS変数を使用する
- **破壊的な構造変更禁止**: 既存コンポーネントのスクロール構造・レイアウト構造を変えない
- **フォント変更禁止**: タイトル系は Caveat、本文は M PLUS Rounded 1c のみ使用する

---

## ✅ 完了基準

- [ ] アプリ全体に木目調の太いボーダーフレームが表示されている
- [ ] ヘッダータイトルが大きな Caveat フォントで表示されている
- [ ] サイドバーのプロジェクトボタンが立体的な「看板風」になっている
- [ ] 統計バッジにアイコンが付いてモックに近い見た目になっている
- [ ] `panel-paper` にボトムシャドウが追加されカードに立体感がある
- [ ] `npm run tauri dev` でビルドエラーが発生しない
- [ ] TypeScript型エラーがない

---

## 📦 成果物として提出すること

1. 改修した `src/App.tsx`（JSX部分のUI変更のみ）
2. 改修した `src/index.css`（CSSクラスの強化）
3. `docs/jules-tasks/jules_handover_20260714.md`（作業ログ・残タスクを記載）
4. `docs/learning/jules学習メモ_20260714.md`（どのCSSテクニックを使ったか記録）

---

## 💡 補足情報

- **モック画像の場所**: `mock/` フォルダ内（screen_S1〜S9 まで参照可能）
- **アバター画像の場所**: `public/avatars/` に5種類の PNG が配置済み
- **DESIGN_SYSTEM.md §6** にUI実装の詳細ルール（ハードコード禁止等）が定義されている
- **Tauri + React + Tailwind CSS** 構成

---

*このファイルは Antigravity が 2026-07-13 のセッション終了時に自動生成した Jules 向け指示書です。*
