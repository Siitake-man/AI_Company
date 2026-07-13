# UI Design System (AI Team Builder)
> **このドキュメントが唯一の正（Single Source of Truth）**。
> DESIGN_SPEC.md §5.1 との差異がある場合は、本書を優先すること。

---

## 1. デザインコンセプト

- **テーマ**: レトロRPG・箱庭ゲーム風（Stardew Valley / 牧場物語インスパイア）
- **キーワード**: ドット絵、Cozy（温かみ）、木目調フレーム、羊皮紙テクスチャ
- **目的**: AIチームの編成・育成という体験を、無機質なビジネスツールではなく、ゲームのようにワクワクする没入感のある体験に昇華させる。「ツールを使う」ではなく「チームと働く」感覚を演出する。
- **禁止事項**: 一般的なモダンSaaSのフラットデザイン（白背景・`shadow-md`のみ・ニュートラルグレーのボタン等）をそのまま使うことは禁止。必ず本書のルールに従ったコンポーネントクラスを使用すること。

---

## 2. カラーパレット（確定値）

モックアップ全画面から抽出した実測値。**この値が唯一の正。**

### 2.1 ベースカラー

| トークン名 | カラーコード | 説明・用途 |
|---|---|---|
| `--color-bg` | `#FDF6E3` | メイン背景（羊皮紙クリーム）。全画面の地色。 |
| `--color-panel` | `#F5E6C8` | カード・パネルの背景（少し濃いベージュ）。 |
| `--color-sidebar` | `#D4A96A` | サイドバー木材ベース色。 |
| `--color-border-outer` | `#8B5A2B` | 外枠の木フレーム（濃いブラウン）。太い縁取りに使用。 |
| `--color-border-inner` | `#c8a96e` | 内側の細いボーダー・カード枠（ゴールデンタン）。 |
| `--color-text` | `#3d2b1f` | メインテキスト（ダークブラウン）。 |
| `--color-text-sub` | `#7a5c3a` | サブテキスト・説明文（ミドルブラウン）。 |

### 2.2 アクセントカラー

| トークン名 | カラーコード | 説明・用途 |
|---|---|---|
| `--color-accent` | `#F5A623` | プライマリボタン（「はじめる」「保存する」「会議を始める」等）。オレンジゴールド。 |
| `--color-accent-hover` | `#E09015` | ホバー時のアクセント（少し暗く）。 |
| `--color-accent-shadow` | `#A0680F` | ボタンの押し込みシャドウ色。 |
| `--color-success` | `#86efac` | 完了・成功・ON状態（セージグリーン）。 |
| `--color-danger` | `#E6685B` | 危険操作（全削除等）。くすんだ赤。 |
| `--color-interrupt` | `#f59e0b` | 割り込み受付ウィンドウのパルス縁取り（S7会議画面用）。 |

### 2.3 役割（ロール）カラー

メンバーカード背景・ロールバッジに使用するパステルカラー。

| 役割カテゴリ | カラーコード | 説明 |
|---|---|---|
| 戦略・経営・PM系 | `#FAD8C3` | 温かみのある薄オレンジ/ピーチ |
| UI/UX・デザイン系 | `#D5E8D4` | 薄いミントグリーン |
| エンジニアリング・技術系 | `#E1D5E7` | 薄いラベンダー |
| インフラ・セキュリティ系 | `#D4E8D4` | 少し彩度を落とした薄いグリーン |
| 法務・コンプライアンス系 | `#E8E8E4` | ニュートラルな薄いグレーベージュ |
| 思考スタイル型（ドリーマー等） | `#FEF3C7` | 薄いイエロー |
| フォールバック（その他） | `#F5E6C8` | パネル背景色と同じ（ベージュ） |

---

## 3. タイポグラフィ（フォント）

モックを実測した結果。**2種のフォントを役割で使い分ける。**

| 用途 | フォント | Google Fonts |
|---|---|---|
| タイトル・見出し（「AI Team Builder」等） | `Caveat` または `Patrick Hand` | 手書き風スケッチ体。ゲームのロゴらしい温かみを演出。 |
| 本文・UI全般（メンバー名・説明・ボタンテキスト等） | `M PLUS Rounded 1c` | 丸ゴシック。ゲームUIらしい読みやすさ。全画面で一貫して使用。 |

**インポート例（index.css）：**
```css
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap');

:root {
  font-family: 'M PLUS Rounded 1c', sans-serif;
}
h1, .title {
  font-family: 'Caveat', cursive;
}
```

---

## 4. コンポーネント実装ルール（CSS指針）

グローバルなカスタムクラスを `src/index.css` に定義し、全画面で使い回す。
Tailwindユーティリティは補助的に使い、デザイントークンを直接ユーティリティに書くことを避けること。

### 4.1 ピクセル風ボタン（プライマリ）

```css
.btn-primary {
  background-color: var(--color-accent);
  color: #3d2b1f;
  font-family: 'M PLUS Rounded 1c', sans-serif;
  font-weight: 700;
  border: 2px solid var(--color-border-outer);
  border-radius: 8px;
  /* 右下シャドウで「押せる」立体感を演出 */
  box-shadow: 0px 4px 0px var(--color-accent-shadow);
  transition: transform 0.05s, box-shadow 0.05s;
}
.btn-primary:hover {
  background-color: var(--color-accent-hover);
}
.btn-primary:active {
  /* 押し込み演出：要素が右下にシフトし、シャドウが消える */
  transform: translate(0px, 4px);
  box-shadow: none;
}
```

### 4.2 セカンダリボタン（「キャンセル」「編集」等）

```css
.btn-secondary {
  background-color: var(--color-panel);
  border: 2px solid var(--color-border-inner);
  border-radius: 8px;
  box-shadow: 0px 3px 0px var(--color-border-inner);
}
.btn-secondary:active {
  transform: translate(0px, 3px);
  box-shadow: none;
}
```

### 4.3 木目調サイドバー（`.sidebar-wood`）

```css
.sidebar-wood {
  background-color: var(--color-sidebar);
  border-right: 4px solid var(--color-border-outer);
}
```

### 4.4 羊皮紙パネル・カード（`.panel-paper`）

```css
.panel-paper {
  background-color: var(--color-panel);
  border: 2px solid var(--color-border-inner);
  border-radius: 8px;
}
```

### 4.5 外枠（`.frame-wood`）- アプリ全体の外枠

```css
.frame-wood {
  border: 4px solid var(--color-border-outer);
  border-radius: 4px;
  background-color: var(--color-bg);
}
```

### 4.6 ドット絵アバター表示

```css
.avatar-pixel {
  image-rendering: pixelated; /* アンチエイリアスを切る。ドットのくっきり感を保つ */
  image-rendering: -moz-crisp-edges;
}
```

---

## 5. アイコン・絵文字の使い方

モック全画面を通じて、ピクセルアートの絵文字アイコンがUIのアクセントとして多用されている。

- **🌱（苗）**: プロジェクトのアイコン
- **⚙️（歯車）**: 部署（エンジニアリング）・設定
- **📢（メガホン）**: マーケティング部署
- **🎙️（マイク）**: 会議開始ボタン
- **💬（吹き出し）**: 話すボタン
- **✏️（鉛筆）**: 編集ボタン

→ **Noto Emoji** または **Twemoji** の採用を推奨。ブラウザ依存のシステム絵文字は外観が環境で変わるため使わない。

---

## 6. AI実装者への強制ルール

> JulesやAntigravityがUI画面を実装・修正する際は、以下を必ず守ること。

1. カラーコードは本書 §2 の CSS変数（`--color-*`）のみを使用すること。直接ハードコードしない。
2. フォントは本書 §3 の2種類のみを使用すること。`font-sans`（Tailwindデフォルト）は使わない。
3. ボタンは `.btn-primary` / `.btn-secondary` クラスを使い、押し込みシャドウ演出を必ず実装すること。
4. 全体の外枠には `.frame-wood`、パネルには `.panel-paper` を使うこと。
5. アバター画像には必ず `image-rendering: pixelated` を適用すること。
