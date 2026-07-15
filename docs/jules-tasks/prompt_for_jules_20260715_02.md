# Jules向け指示書 — 2026-07-15（AIカンパニー - タスク追加）

## 対象ブランチ・コミット
- ブランチ: main
- 直前のコミット: 最新 (git pull適用後)

## 参照すべきデザイン・モック画像
デザインをブラッシュアップするにあたり、以下のモック画像を強く意識して再現してください。
- **モック画像ローカルパス**: `C:\Users\bonob\.gemini\antigravity-ide\brain\b75052ef-0fdc-4dd1-adfd-24266fa7eaf8\media__1784125907918.png`
- **デザインシステム指示**: `docs/design/DESIGN_SYSTEM.md`
※モック画像で示されている温かみのあるウッド調テイスト、ボーダーデザイン、各コンポーネントの配置バランスに極限まで近づけることを厳守してください。

---

## 依頼するタスク

今回は、1on1チャット機能（S6）のUI/UX改善と、API利用料金・トークン量のトラッキング機能（新規）の実装をお願いします。

### タスク1：【APIエラーハンドリングの改善と日本語メッセージ化】
現在、OpenAIやGeminiなどのAPIキーが無効、あるいはクォータ上限（支払い枠上限）に達している場合、APIから返却されたエラーの生JSONがチャットのバブル内にそのまま表示されてしまいます（例: `{"error":{"message":"You exceeded your current quota..."}}`）。
これをユーザーが理解しやすい日本語エラーメッセージに改善してください。

**[実装要件]**
- `src/App.tsx` 内の `onSubmit`（1on1チャットのAPI呼び出し部分）および会議モード内のAPI呼び出し部分において、HTTPレスポンスがエラー（`!response.ok`）の場合、レスポンスのJSONをパースしてください。
- エラーオブジェクトに含まれるメッセージやエラーコードを判定し、以下のように日本語のユーザーフレンドリーなメッセージに翻訳してチャット画面に表示、およびDB（`chat_messages`テーブル）へ保存してください。
  - **クォータ上限エラー** (APIエラー内に `"insufficient_quota"` や `"quota"` などの文言がある場合):
    - `「APIの利用制限（残高不足、またはカード有効期限切れ）に達しています。OpenAI等の開発者プラットフォームの支払い設定をご確認ください。」`
  - **APIキー無効エラー** (APIエラー内に `"invalid_api_key"`、`"invalid_key"`、`"API key not valid"` などの文言がある場合):
    - `「APIキーが無効です。設定画面から正しいAPIキーを入力し直してください。」`
  - **レートリミットエラー** (APIエラー内に `"rate_limit_exceeded"` や `"Too Many Requests"` などの文言がある場合):
    - `「リクエストの制限速度を超えました。しばらく時間をおいてから送信してください。」`
  - **その他のAPIエラー**:
    - `「APIリクエストに失敗しました。（詳細: [APIから返却されたエラーメッセージ]）」`
- `catch (apiErr)` ブロックで捕捉された通信エラー（ネットワーク切断等）も同様に、日本語メッセージで保存されるようにしてください。

---

### タスク2：【1on1チャット履歴のクリア（セッション初期化）機能の追加】
現在、1on1チャット画面（S6）にはチャットログをクリアする機能がありません。会話をリセットして最初からやり直せる機能を追加してください。

**[実装要件]**
- 1on1チャット画面（S6）のヘッダー部分（「← チームに戻る」ボタンの横あたり）に、**「🧹 チャット履歴をクリア」**ボタンを追加してください。
- ボタンがクリックされた際、ブラウザの `confirm`（例: `「これまでのチャット履歴を完全に消去して、会話をリセットしますか？」`）を表示してください。
- ユーザーがOKを押した場合、以下の処理を実行してください：
  1. データベース上の `chat_messages` テーブルから、現在の `chatSessionId` に紐づくレコードをすべて削除（`DELETE`）する。
  2. チャット画面上のメッセージ一覧状態（`chatMessages`）を空（`[]`）にする。
  3. 完了したら「チャット履歴をクリアしました」と一時的な通知を出すか、自動で最初のメッセージなしの状態（「まだメッセージはありません」のプレースホルダー表示）に切り替える。

---

### タスク3：【1on1チャットの自動スクロール処理の最適化】
新規メッセージを送信した際、あるいは画面を開いた際に、チャット画面が最下部まで正しくスクロールしない現象が発生しています。

**[実装要件]**
- `src/App.tsx` 内の `chatMessages` 状態が更新されたタイミングで、`chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })` が確実に実行され、最下部までスムーズスクロールするように `useEffect` 等のトリガーを保証・調整してください。
- チャット画面に入った直後（`chatMemberId` がセットされた際）にも、既存の履歴がある場合は最下部までスクロールされるようにしてください。

---

### タスク4：【チャット画面（S6）のUIデザインブラッシュアップ】
モック画像（`media__1784125907918.png`）をベースに、温かみのあるウッド調テイスト（`panel-paper` クラス、および `--color-border-inner` などの変数）を適用し、チャット画面をよりプレミアムな見た目に調整してください。

**[実装要件]**
- チャット入力フォームの枠線や、チャットメッセージの吹き出し部分のデザインをブラッシュアップする。
- ユーザー発言とAI発言の境界線を分かりやすくし、丸みのある美しいコンポーネントにする。

---

### タスク5：【APIトークン量＆利用料金（ドル・円）のトラッキング機能の実装】
各AIメンバーとの会話で利用したAPIトークン量と、それに応じた推定利用料金（ドルおよび円）を記録・集計して画面上に表示する機能を追加してください。

**[実装要件]**
1. **データベーステーブルの作成**:
   `src/App.tsx` のデータベース初期化ブロック（`Database.load` の直後）に、以下の `api_usage_logs` テーブルを作成する SQL コマンドを追加してください。
   ```sql
   CREATE TABLE IF NOT EXISTS api_usage_logs (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       member_id INTEGER NOT NULL,
       session_id INTEGER,       -- 1on1チャット用セッションID (NULL可)
       meeting_id INTEGER,       -- 会議用ID (NULL可)
       provider TEXT NOT NULL,   -- 'OpenAI' | 'Anthropic' | 'Gemini'
       model_id TEXT NOT NULL,
       prompt_tokens INTEGER NOT NULL,
       completion_tokens INTEGER NOT NULL,
       cost_usd REAL NOT NULL,
       created_at TEXT NOT NULL,
       FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
   );
   ```

2. **料金計算ロジック**:
   モデル ID に応じた単価テーブルを用意し、利用料金を算出するヘルパー関数を定義してください。
   - **OpenAI単価設定**
     - `gpt-4o`: 入力 $2.50/M tokens, 出力 $10.00/M tokens
     - `gpt-4o-mini`: 入力 $0.150/M tokens, 出力 $0.600/M tokens
     - （その他OpenAI）: デフォルトで上記 gpt-4o 単価を適用
   - **Anthropic単価設定**
     - `claude-3-5-sonnet`: 入力 $3.00/M tokens, 出力 $15.00/M tokens
     - `claude-3-5-haiku`: 入力 $0.80/M tokens, 出力 $4.00/M tokens
     - （その他Anthropic）: デフォルトで上記 claude-3-5-sonnet 単価を適用
   - **Gemini単価設定**
     - `gemini-1.5-pro` / `gemini-2.5-pro`: 入力 $1.25/M tokens, 出力 $5.00/M tokens
     - `gemini-1.5-flash` / `gemini-2.5-flash`: 入力 $0.075/M tokens, 出力 $0.30/M tokens
     - （その他Gemini）: デフォルトで上記 gemini-1.5-flash 単価を適用
   ※ドル円換算レートは固定で `1 USD = 150 JPY` を使用してください。

3. **トークン数の取得とDB保存**:
   1on1チャット（`S6`）のAPIコールが成功した際、APIからのレスポンスからトークン使用量を取得し、上記計算ロジックで料金を算出して `api_usage_logs` テーブルへ `INSERT` してください。
   - **OpenAIのトークンパス**: `data.usage.prompt_tokens` / `data.usage.completion_tokens`
   - **Anthropicのトークンパス**: `data.usage.input_tokens` / `data.usage.output_tokens`
   - **Geminiのトークンパス**: `data.usageMetadata.promptTokenCount` / `data.usageMetadata.candidatesTokenCount`

4. **UI表示**:
   - **メンバーエディタ（S5）モーダル**:
     - 編集画面内に **「📊 利用統計（トークン・料金）」** セクションを追加してください。
     - メンバー個別の「累積入力トークン数」「累積応答トークン数」「合計推定利用料金（`$0.015 (約2.2円)` 形式）」を表示してください。
     - 統計を初期化できる **「🗑️ 統計をリセット」** ボタンも配置し、クリック時は該当メンバーのログを削除してください。
   - **チーム管理（S4）画面**:
     - メンバーカードの中に、小さくそのメンバーの累積利用料金（例: `💰 $0.005`）をバッジ等で表示してください。

## 作業上の制約（必ず守ること）
- Tauri / React / TypeScript / Tailwind CSS / SQLite のスタック以外は使用しない
- `src-tauri/` 配下の Rust コードは触らない（フロントエンドのUI・ロジック修正のみ）
- 3層構造（プロジェクト→部署→メンバー）のロジックやプロンプトマージ部分は変更しない

## 設計資料の参照先
- ROADMAP.md: `docs/design/ROADMAP.md`
- DESIGN_SYSTEM.md: `docs/design/DESIGN_SYSTEM.md`
- AI_RULES.md: `docs/design/AI_RULES.md`

## 完了条件と確認方法
1. APIキーのエラー時に、生JSONではなく日本語のわかりやすいエラーメッセージがチャットに表示されること。
2. 「履歴をクリア」ボタンでチャット履歴が消え、DBから削除されてリセットされること。
3. トークン使用量と利用料金（ドル・円）が自動計算され、DBに格納されること。
4. メンバーエディタ（S5）およびメンバー一覧（S4）に、各メンバーの累積料金が表示されること。
