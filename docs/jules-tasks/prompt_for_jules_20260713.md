# Jules向け指示書 — 2026-07-13（AIカンパニー）
Version: 1.0 / 担当: Jules（夜間非同期エージェント）

---

## ⚠️ 作業開始前に必ず読むこと（順番厳守）

1. `AGENTS.md`（プロジェクトルート） ← このドキュメントを読む前にまずここ
2. `docs/design/DESIGN_SPEC.md`
3. `docs/design/DATA_SCHEMA.md`
4. `docs/design/DESIGN_SYSTEM.md` ← **UIを触る前に必読。唯一の正。**
5. `docs/design/AI_RULES.md`
6. `docs/design/ROADMAP.md`

---

## 現在の開発状況（ノードの完了状況）

```
✅ ノードA: DBスキーマ実装（全11テーブル）
✅ ノードB: 4層マージシステムプロンプト
✅ ノードC1: S1 初回起動・APIキー設定画面
✅ ノードC9: S9 設定画面（APIキー管理 + コアプロフィール）
🔜 ノードD2: S2 プロジェクト一覧（次の実装対象）
```

---

## Julesへの依頼タスク

### タスク1: `src/index.css` にDESIGN_SYSTEMのCSS基盤を実装する【最優先・必須】

**背景**:
現在の `src/index.css` はほぼ空（59バイト）のまま。すべてのスタイルがApp.tsx内にTailwindのインラインクラスで直書きされており、DESIGN_SYSTEM.mdで定義したCSS変数・カスタムクラスが一切存在しない状態。これを整備することが全UI実装の前提。

**実装内容**:
以下を `src/index.css` に追記すること。

```css
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap');

:root {
  /* === ベースカラー === */
  --color-bg: #FDF6E3;
  --color-panel: #F5E6C8;
  --color-sidebar: #D4A96A;
  --color-border-outer: #8B5A2B;
  --color-border-inner: #c8a96e;
  --color-text: #3d2b1f;
  --color-text-sub: #7a5c3a;

  /* === アクセントカラー === */
  --color-accent: #F5A623;
  --color-accent-hover: #E09015;
  --color-accent-shadow: #A0680F;
  --color-success: #86efac;
  --color-danger: #E6685B;
  --color-interrupt: #f59e0b;

  /* === フォント === */
  font-family: 'M PLUS Rounded 1c', sans-serif;
  background-color: var(--color-bg);
  color: var(--color-text);
}

/* === タイトル・見出し === */
h1, h2, .font-title {
  font-family: 'Caveat', cursive;
}

/* === プライマリボタン（押し込み演出あり） === */
.btn-primary {
  background-color: var(--color-accent);
  color: var(--color-text);
  font-family: 'M PLUS Rounded 1c', sans-serif;
  font-weight: 700;
  border: 2px solid var(--color-border-outer);
  border-radius: 8px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  box-shadow: 0px 4px 0px var(--color-accent-shadow);
  transition: background-color 0.1s, transform 0.05s, box-shadow 0.05s;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.btn-primary:hover {
  background-color: var(--color-accent-hover);
}
.btn-primary:active {
  transform: translate(0px, 4px);
  box-shadow: none;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0px 4px 0px var(--color-accent-shadow);
}

/* === セカンダリボタン（キャンセル・編集等） === */
.btn-secondary {
  background-color: var(--color-panel);
  color: var(--color-text);
  font-family: 'M PLUS Rounded 1c', sans-serif;
  font-weight: 700;
  border: 2px solid var(--color-border-inner);
  border-radius: 8px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  box-shadow: 0px 3px 0px var(--color-border-inner);
  transition: background-color 0.1s, transform 0.05s, box-shadow 0.05s;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.btn-secondary:hover {
  background-color: #EDD9B0;
}
.btn-secondary:active {
  transform: translate(0px, 3px);
  box-shadow: none;
}

/* === 危険ボタン（全削除等） === */
.btn-danger {
  background-color: var(--color-danger);
  color: #fff;
  font-family: 'M PLUS Rounded 1c', sans-serif;
  font-weight: 700;
  border: 2px solid #B84B41;
  border-radius: 8px;
  padding: 0.5rem 1.25rem;
  cursor: pointer;
  box-shadow: 0px 4px 0px #8B3530;
  transition: transform 0.05s, box-shadow 0.05s;
}
.btn-danger:active {
  transform: translate(0px, 4px);
  box-shadow: none;
}

/* === 羊皮紙パネル・カード === */
.panel-paper {
  background-color: var(--color-panel);
  border: 2px solid var(--color-border-inner);
  border-radius: 8px;
}

/* === 木目調サイドバー === */
.sidebar-wood {
  background-color: var(--color-sidebar);
  border-right: 4px solid var(--color-border-outer);
}

/* === アプリ外枠 === */
.frame-wood {
  border: 4px solid var(--color-border-outer);
  border-radius: 4px;
  background-color: var(--color-bg);
}

/* === アクティブなサイドバー項目 === */
.sidebar-item-active {
  background-color: var(--color-accent);
  color: var(--color-text);
  border: 2px solid var(--color-border-outer);
  border-radius: 8px;
  font-weight: 700;
  box-shadow: 0px 3px 0px var(--color-accent-shadow);
}

/* === 非アクティブなサイドバー項目 === */
.sidebar-item {
  background-color: var(--color-panel);
  border: 2px solid var(--color-border-inner);
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.1s;
}
.sidebar-item:hover {
  background-color: #EDD9B0;
}

/* === ドット絵アバター === */
.avatar-pixel {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}

/* === テキスト入力 === */
.input-wood {
  background-color: var(--color-bg);
  border: 2px solid var(--color-border-inner);
  border-radius: 6px;
  color: var(--color-text);
  font-family: 'M PLUS Rounded 1c', sans-serif;
  padding: 0.4rem 0.75rem;
  transition: border-color 0.1s;
}
.input-wood:focus {
  outline: none;
  border-color: var(--color-accent);
}
```

**完了確認方法**:
`src/index.css` に上記のCSS変数とクラスが全て存在すること。

---

### タスク2: `App.tsx` の既存スタイルを新しいCSSクラスに置き換える【推奨・任意】

**背景**:
現在のApp.tsxではカラーコードをTailwindのインラインクラスとして直接ハードコードしている（例: `bg-[#fdf6e3]`, `border-[#c8a96e]` 等）。タスク1で定義したCSS変数・クラスに段階的に移行することで、デザイン変更時の修正コストを大幅に削減できる。

**置き換え対象の例**:
```tsx
// Before（ハードコード）
className="bg-[#fdf6e3] border-2 border-[#c8a96e] p-5 rounded-lg"

// After（CSS変数クラス）
className="panel-paper p-5"
```

**作業上の制約**:
- UIの見た目・動作を変えない範囲でのリファクタリングのみ。新機能の追加はしない。
- Reactのstate・ロジック・useEffect等は**絶対に触らない**。CSSクラスの置き換えのみ行う。
- `src/App.tsx.bak` はバックアップファイルなので触らない。

---

### タスク3: S2（プロジェクト一覧画面）の基本骨格を実装する【推奨】

**背景**:
ROADMAPのノードD2に相当する。現在の `App.tsx` には `currentScreen` として `"apiKeySetup" | "promptTest" | "settings"` の3画面が存在するが、本番の画面構成はS2（プロジェクト一覧）がホームである。

**実装内容**:
`currentScreen` に `"home"` を追加し、S2画面（プロジェクト一覧）の骨格JSXを実装する。

**S2の画面仕様**（`docs/design/DESIGN_SPEC.md §6.2` と `mock/screen_S2_dashboard.png` を必ず参照すること）:

1. **左サイドバー（`.sidebar-wood`クラス使用）**:
   - 上部に「プロジェクト一覧」の見出し（木目調パネル）
   - 各プロジェクトを `.sidebar-item` / `.sidebar-item-active` で表示（絵文字アイコン＋プロジェクト名）
   - 下部に「＋ 新しいプロジェクト」ボタン（`.btn-secondary`クラス）

2. **右メインエリア**:
   - 選択中プロジェクトのアイコン・名前・説明をヘッダーに表示
   - 統計情報を横並びカード（メンバー数・最終会議日・会議回数）で表示
   - 部署ごとのメンバーカードをグリッド表示（アバター画像＋名前＋役割説明）
   - 右下に「🎙️ 会議を始める」ボタン（`.btn-primary`、大きめサイズ）

3. **データソース**:
   - `projects` テーブルから全件SELECT: `SELECT id, name, purpose FROM projects`
   - 選択プロジェクトの `departments` と `members` をJOINで取得:
     ```sql
     SELECT m.id, m.name, m.role, m.avatar_id, d.name as dept_name
     FROM members m
     JOIN departments d ON m.department_id = d.id
     WHERE d.project_id = ?
     ORDER BY d.display_order, m.id
     ```

4. **アバター表示**:
   - Phase 1では `avatar_id` に対応した実際の画像ファイルがないため、役割ごとの絵文字をプレースホルダーとして使用。
   - 例: 法務系→⚖️、エンジニア系→💻、戦略系→📊、デフォルト→🧑‍💼

**完了条件**:
- プロジェクト一覧がサイドバーに表示される
- プロジェクトをクリックすると右エリアが切り替わる
- メンバーカードが表示される（アバターは絵文字プレースホルダーでOK）
- 「会議を始める」ボタンが右下に表示される（クリック時は `alert("会議機能は今後実装予定です")` でOK）

---

## 作業上の絶対制約（必ず守ること）

1. **技術スタック**: React + TypeScript + Tailwind CSS + Tauri のみ。他ライブラリの追加は禁止。
2. **Rustコードは触らない**: `src-tauri/` 配下のRustファイルは変更しない。フロントエンド（`src/`）のみ。
3. **3層構造・4層マージは変更禁止**: `src/lib/promptMerger.ts` の4層マージロジックは一切変更しない。
4. **ハードコード禁止**: カラーコードを直接 `bg-[#xxx]` と書かない。CSS変数（`var(--color-*)`）またはカスタムクラスを使う。
5. **APIキーはDBに書かない**: `src/lib/apiKeyStore.ts` の既存ロジックを変更しない。
6. **Gitコミットは禁止**: 作業完了後もコミットしない。コード変更のみ行い、しいたけさんが確認後にコミットする。

---

## 設計資料の参照先（重要度順）

| ファイル | 内容 | 特記 |
|---|---|---|
| `AGENTS.md` | 行動規範ゲートウェイ | 最初に読む |
| `docs/design/DESIGN_SYSTEM.md` | CSS変数・フォント・カラー | UI実装の唯一の正 |
| `docs/design/DESIGN_SPEC.md §6` | 画面定義・画面遷移 | S2の仕様確認 |
| `docs/design/DATA_SCHEMA.md` | SQLiteスキーマ | DB操作時に参照 |
| `mock/screen_S2_dashboard.png` | S2のビジュアルモック | 実装イメージの確認 |
| `mock/screen_S4_team.png` | S4のビジュアルモック | メンバーカードの参考 |

---

## 申し送り事項（Antigravity → Jules）

### App.tsx の現状について
- 685行の単一ファイル。今後コンポーネントファイルへの分割が必要だが、本タスクでは分割しなくてよい。
- `currentScreen` の状態管理でS1/S9の画面切り替えを実装済み。同じパターンでS2を追加できる。
- `dbInstance` 変数がすでに初期化済みで `App.tsx` のスコープ内でアクセス可能。

### 現在のシードデータ
- プロジェクト: ID=1「NPO-Trust-Platform」（1件のみ）
- 部署: ID=1「法務・コンプライアンス部」, ID=2「思考スタイル部」
- メンバー: ID=1「契約レビュー担当 鈴木」（法務部）, ID=2「悪魔の代弁者」（思考スタイル部）

### UI設計の重要ポイント
- モックのサイドバーは「木の板」のような背景色（`#D4A96A`）に濃い茶色の右ボーダー（`#8B5A2B`）
- アクティブなプロジェクト項目はオレンジ色（`#F5A623`）の背景、非アクティブは薄いベージュ
- メンバーカードの背景色はロールによって異なる（DESIGN_SYSTEM.md §2.3 参照）
- 「会議を始める」ボタンは画面右下固定で、大きめのプライマリボタン

### ホットリロードについて
- フロントエンド（React/TSX）変更はホットリロードで即時反映される。
- バックエンド（Rustコード）変更時は `npm run tauri dev` の再起動が必要。今回はRustを触らないのでこの心配は不要。

---

## 完了後のJulesへのお願い

1. タスクが完了したら `docs/jules-tasks/` 内に `jules_handover_20260713.md` を作成し、「何を変更したか」「なぜそうしたか」を日本語で記録すること。
2. PRを出す前に、`mock/screen_S2_dashboard.png` と自分の実装を見比べて、大きな乖離がないかを確認すること。
3. `src/App.tsx` の変更差分をできるだけ小さく保つこと（不要なリファクタリングを同時に行わない）。
