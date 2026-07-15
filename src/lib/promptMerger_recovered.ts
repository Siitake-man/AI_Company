import Database from "@tauri-apps/plugin-sql";

/**
 * 4層マージで注入されるデータ構造のインターフェース
 */
export interface PromptMergeParams {
  userId: number;
  projectId: number;
  memberId: number;
}

/**
 * データベースから情報を抽出し、4層マージの最終システムプロンプトを組み立てます。
 * 
 * system_prompt =
 *   ユーザーのコアプロフィール(最外層)
 *   + プロジェクトの価値観・判断軸
 *   + 部署の性質・行動の癖(※思考スタイルの場合は継承しない)
 *   + 個人の役割・専門領域・人格プロンプト(最内層)
 */
export async function getMergedSystemPrompt(
  db: Database,
  params: PromptMergeParams
): Promise<string> {
  const { userId, projectId, memberId } = params;

  // 1. ユーザーのコアプロフィールを取得 (users)
  const userRows = await db.select<{ core_profile: string }[]>(
    "SELECT core_profile FROM users WHERE id = ?",
    [userId]
  );
  const coreProfile = userRows[0]?.core_profile || "";

  // 2. プロジェクトの目的と価値観を取得 (projects)
  const projectRows = await db.select<{ purpose: string; values: string }[]>(
    'SELECT purpose, "values" FROM projects WHERE id = ?',
    [projectId]
  );
  const projectPurpose = projectRows[0]?.purpose || "";
  const projectValues = projectRows[0]?.values || "";

  // 3. メンバー情報、および所属する部署の情報を一括で取得 (members & departments)
  const memberRows = await db.select<{
    member_name: string;
    role: string;
    personality_prompt: string;
    is_thinking_style_member: number;
    department_name: string;
    department_prompt: string;
    is_thinking_style_dept: number;
  }[]>(
    `SELECT 
      m.name AS member_name,
      m.role,
      m.personality_prompt,
      m.is_thinking_style_member,
      d.name AS department_name,
      d.department_prompt,
      d.is_thinking_style AS is_thinking_style_dept
     FROM members m
     JOIN departments d ON m.department_id = d.id
     WHERE m.id = ?`,
    [memberId]
  );

  if (memberRows.length === 0) {
    throw new Error(`Member with ID ${memberId} not found.`);
  }

  const member = memberRows[0];

  // 3.5. メンバーの自動学習履歴を取得 (member_learnings)
  const learningRows = await db.select<{ content: string }[]>(
    "SELECT content FROM member_learnings WHERE member_id = ? ORDER BY id ASC",
    [memberId]
  );

  // 4. システムプロンプトの組み立て
  const sections: string[] = [];

  // --- 第1層: ユーザーコアプロフィール (最外層) ---
  if (coreProfile.trim()) {
    sections.push(
      `# ユーザー（運営者）プロフィール\n${coreProfile.trim()}`
    );
  }

  // --- 第2層: プロジェクトの価値観・判断軸 ---
  if (projectPurpose.trim() || projectValues.trim()) {
    sections.push(
      `# プロジェクト目標と価値観\n` +
      (projectPurpose.trim() ? `- 目的: ${projectPurpose.trim()}\n` : "") +
      (projectValues.trim() ? `- 判断軸・価値観: ${projectValues.trim()}` : "")
    );
  }

  // --- 第3層: 部署の性質・行動の癖 ---
  // ※ 思考スタイル(ドリーマー/悪魔の代弁者等)は、部署の癖を継承しないルール (DESIGN_SPEC.md §3)
  const isThinkingStyle = member.is_thinking_style_member === 1 || member.is_thinking_style_dept === 1;
  if (!isThinkingStyle && member.department_prompt && member.department_prompt.trim()) {
    sections.push(
      `# 所属部署（${member.department_name}）の基本方針\n${member.department_prompt.trim()}`
    );
  }

  // --- 第4層: 個人の役割・専門領域・人格プロンプト (最内層) ---
  const memberHeader = isThinkingStyle 
    ? `# あなたの人格と役割（思考スタイル: ${member.member_name}）`
    : `# あなたの人格と役割（${member.department_name} / ${member.member_name}）`;

  sections.push(
    `${memberHeader}\n` +
    (member.role ? `- 専門領域・役割: ${member.role}\n` : "") +
    `- 行動規範・思考パターン:\n${member.personality_prompt.trim()}`
  );

  // --- 第5層: これまでの決定事項・学習ルール (自動学習履歴) ---
  if (learningRows.length > 0) {
    const learningsText = learningRows
      .map((row, idx) => `${idx + 1}. ${row.content.trim()}`)
      .join("\n");
    sections.push(
      `# これまでの決定事項・学習ルール\n` +
      `あなたは過去の会議や指示から、以下の決定事項やルールを学習しています。これらに厳密に従って思考・発言してください：\n` +
      learningsText
    );
  }

  // 全セクションを改行で結合
  return sections.join("\n\n");
}
