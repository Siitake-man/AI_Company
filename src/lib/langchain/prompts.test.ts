import { describe, expect, it } from "vitest";

import { buildSpeakerPrompt } from "./prompts";

describe("buildSpeakerPrompt", () => {
  it("会議コンテキストを欠落なくテンプレートへ埋め込む", async () => {
    const prompt = await buildSpeakerPrompt({
      agenda: "新サービスの公開判断",
      mode: "探索モード",
      history: "法務担当: 利用規約の確認が必要です",
      role: "セキュリティエンジニア",
    });

    expect(prompt).toContain("新サービスの公開判断");
    expect(prompt).toContain("探索モード");
    expect(prompt).toContain("法務担当: 利用規約の確認が必要です");
    expect(prompt).toContain("セキュリティエンジニア");
    expect(prompt).toContain("[BOARD]現在の課題: ○○ | 考える方針: ○○[/BOARD]");
    expect(prompt).not.toMatch(/\{(?:agenda|mode|history|role)\}/);
  });
});
