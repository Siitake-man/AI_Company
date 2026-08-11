import { PromptTemplate } from "@langchain/core/prompts";

export interface SpeakerPromptParams {
  agenda: string;
  mode: string;
  history: string;
  role: string;
}

export const speakerPromptTemplate = new PromptTemplate({
  template: `
現在の会議議題: 「{agenda}」
現在の進行モード: {mode}

これまでの議論履歴:
{history}

【指示】
あなたは上記の議題について話し合っています。これまでの議論の流れを踏まえ、あなたの役職・専門領域（{role}）の立場から、プロジェクトに貢献する発言を行ってください。
- 1回あたりの発言は簡潔に、日本語で3〜5行程度にまとめてください。
- 「山田さんに同意します」「私もそう思います」等の無意味な挨拶や単純な同意は一切省き、前発言への具体的なリスク指摘や、自身の専門性を活かした対立軸・トレードオフの提示など、議論を深く進める中身のある発言をしてください。
- 探索モードなら突飛なアイデアや多角的な視点を、収束モードなら論点の要約や現実的な懸念、次のステップを提案してください。
- 発言の最後に必ず、[BOARD]現在の課題: ○○ | 考える方針: ○○[/BOARD] の形式で、議論を整理するためのメモを1行で出力してください（出力メッセージ本文には表示されません）。
`,
  inputVariables: ["agenda", "mode", "history", "role"],
});

export async function buildSpeakerPrompt(params: SpeakerPromptParams): Promise<string> {
  return speakerPromptTemplate.format({
    agenda: params.agenda,
    mode: params.mode,
    history: params.history,
    role: params.role,
  });
}
