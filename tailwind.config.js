/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DESIGN_SPEC.mdで定義されたベース色
        'warm-bg': '#fdf6e3',      // 背景色（クリーム）
        'panel-bg': '#f5e6c8',     // パネル背景（ウォームベージュ）
        'wood-border': '#c8a96e',  // ボーダー（木目調）
        'amber-accent': '#f59e0b', // アクセント（アンバー）
        'dark-brown': '#3d2b1f',   // テキスト（ダークブラウン）
        // サブカラー
        'sage-green': '#86efac',
        'lavender': '#c4b5fd',
        'peach': '#fca5a5'
      }
    },
  },
  plugins: [],
}
