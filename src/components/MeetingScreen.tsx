import { useState, useEffect, useRef } from "react";
import { MeetingMode } from "./MeetingModeModal";
import Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "../lib/promptMerger";
import { getApiKey, PROVIDERS, ProviderType } from "../lib/apiKeyStore";
import { parseApiError, calculateCost } from "../lib/utils";

type MeetingScreenProps = {
  dbInstance: Database | null;
  projectMembers: any[];
  selectedProjectId: number | null;
  projects: any[];
  meetingMode: MeetingMode | null;
  meetingAgenda: string;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting") => void;
  getAvatarPath: (id: string) => string;
  getEmojiForRole: (dept: string, role: string) => string;
  getRoleColor: (role: string, dept: string) => string;
};

export const MeetingScreen = ({
  dbInstance,
  projectMembers,
  selectedProjectId,
  projects,
  meetingMode,
  meetingAgenda,
  setCurrentScreen,
  getAvatarPath,
  getEmojiForRole,
  getRoleColor
}: MeetingScreenProps) => {
  const project = projects.find(p => p.id === selectedProjectId);
  const activeMembers = projectMembers.filter(m => m.is_active_in_meeting !== 0);

  // 状態変数
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeMemberIdx, setActiveMemberIdx] = useState<number>(0);
  const [meetingLogs, setMeetingLogs] = useState<{ id: number; sender: string; role: string; avatar: string; content: string; time: string }[]>([]);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 初期メッセージのセットアップ
  useEffect(() => {
    setMeetingLogs([
      {
        id: 1,
        sender: "システム",
        role: "ファシリテーター",
        avatar: "",
        content: `会議を開始しました。\n進行モード: ${meetingMode === "exploration" ? "💡 探索モード (アイデア発散)" : "🎯 収束モード (決定事項整理)"}\n議題: 「${meetingAgenda}」\n\nAIメンバーがラウンドロビン順に発言を開始します。一時停止やスキップ操作も可能です。`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setActiveMemberIdx(0);
    setIsPaused(false);
    setIsGenerating(false);
  }, [meetingAgenda, meetingMode]);

  // チャットスクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [meetingLogs, isGenerating]);

  // 自動議論進行の主要ループ
  useEffect(() => {
    // ガード句
    if (
      isPaused || 
      isGenerating || 
      isSummarizing || 
      activeMembers.length === 0 || 
      !dbInstance || 
      meetingLogs.length === 0
    ) {
      return;
    }

    let timer: NodeJS.Timeout;

    async function runNextSpeaker() {
      setIsGenerating(true);
      const currentMember = activeMembers[activeMemberIdx];

      try {
        // 1. システムプロンプトの取得 (4層マージ)
        const sysPrompt = await getMergedSystemPrompt(dbInstance as Database, {
          userId: 1,
          projectId: selectedProjectId!,
          memberId: currentMember.id
        });

        // 2. APIキーとモデルの特定
        const modelId = currentMember.ai_model || "gpt-4o";
        let providerType: ProviderType | null = null;
        let apiKey = "";

        if (modelId.includes("gpt")) providerType = PROVIDERS.OPENAI;
        else if (modelId.includes("claude")) providerType = PROVIDERS.ANTHROPIC;
        else if (modelId.includes("gemini")) providerType = PROVIDERS.GEMINI;

        if (providerType) {
          apiKey = await getApiKey(providerType);
        }

        if (!apiKey) {
          // キーがない場合は警告を発言して次のメンバーへ交代
          setMeetingLogs(prev => [
            ...prev,
            {
              id: Date.now(),
              sender: "システム",
              role: "システム",
              avatar: "",
              content: `⚠️ 【${currentMember.name}】が使用するモデルプロバイダー (${providerType}) のAPIキーが設定されていません。設定画面で登録してください。この発言はスキップされます。`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setActiveMemberIdx((prev) => (prev + 1) % activeMembers.length);
          setIsGenerating(false);
          return;
        }

        // 3. 発言履歴の構築 (システムメッセージを除く直近の発言)
        const historyText = meetingLogs
          .filter(log => log.sender !== "システム")
          .map(log => `${log.sender} (${log.role}): ${log.content}`)
          .join("\n\n");

        // 4. ユーザープロンプト（コンテキスト）の構築
        const userPrompt = `
現在の会議議題: 「${meetingAgenda}」
現在の進行モード: ${meetingMode === "exploration" ? "探索モード（自由にアイデアを出し合って広げる）" : "収束モード（ToDoや決定事項、結論の整理にフォーカスする）"}

これまでの議論履歴:
${historyText || "（議論の開始です。最初の発言をお願いします）"}

【指示】
あなたは上記の議題について話し合っています。これまでの議論の流れを踏まえ、あなたの役職・専門領域（${currentMember.role}）の立場から、プロジェクトに貢献する発言を行ってください。
- 1回あたりの発言は簡潔に、日本語で3〜5行程度にまとめてください。
- 前の発言者の意見へのリアクション（賛同、補足、または健全な反論）を必ず含め、対話的な議論にしてください。
- 探索モードなら突飛なアイデアや多角的な視点を、収束モードなら論点の要約や現実的な懸念、次のステップを提案してください。
`;

        // 5. APIコール
        let replyContent = "";
        let pTokens = 0;
        let cTokens = 0;

        if (providerType === PROVIDERS.OPENAI) {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelId,
              messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt }
              ]
            })
          });
          const data = await res.json();
          if (!res.ok) {
            replyContent = `APIリクエストエラー: ${parseApiError(data)}`;
          } else if (data.choices && data.choices[0]) {
            replyContent = data.choices[0].message.content;
            pTokens = data.usage?.prompt_tokens || 0;
            cTokens = data.usage?.completion_tokens || 0;
          }
        } else if (providerType === PROVIDERS.ANTHROPIC) {
          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
              model: modelId,
              system: sysPrompt,
              max_tokens: 1024,
              messages: [{ role: "user", content: userPrompt }]
            })
          });
          const data = await res.json();
          if (!res.ok) {
            replyContent = `APIリクエストエラー: ${parseApiError(data)}`;
          } else if (data.content && data.content[0]) {
            replyContent = data.content[0].text;
            pTokens = data.usage?.input_tokens || 0;
            cTokens = data.usage?.output_tokens || 0;
          }
        } else if (providerType === PROVIDERS.GEMINI) {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: sysPrompt }] },
              contents: [{ role: "user", parts: [{ text: userPrompt }] }]
            })
          });
          const data = await res.json();
          if (!res.ok) {
            replyContent = `APIリクエストエラー: ${parseApiError(data)}`;
          } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]) {
            replyContent = data.candidates[0].content.parts[0].text;
            pTokens = Math.ceil(userPrompt.length / 3);
            cTokens = Math.ceil(replyContent.length / 3);
          }
        }

        // 6. API利用料金のログ挿入
        if (pTokens > 0 || cTokens > 0) {
          const cost = calculateCost(modelId, pTokens, cTokens);
          await dbInstance.execute(
            "INSERT INTO api_usage_logs (member_id, meeting_id, provider, model_id, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [currentMember.id, 999, providerType, modelId, pTokens, cTokens, cost, new Date().toISOString()]
          );
        }

        // 7. 会議ログに追加
        setMeetingLogs(prev => [
          ...prev,
          {
            id: Date.now(),
            sender: currentMember.name,
            role: currentMember.role,
            avatar: currentMember.avatar_id,
            content: replyContent,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

        // 8. 発言インデックスを進める
        setActiveMemberIdx((prev) => (prev + 1) % activeMembers.length);

      } catch (err) {
        console.error("Speaker fetch failed", err);
        setMeetingLogs(prev => [
          ...prev,
          {
            id: Date.now(),
            sender: "システム",
            role: "エラー",
            avatar: "",
            content: `⚠️ 【${currentMember.name}】の通信中にエラーが発生しました: ${String(err)}`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setActiveMemberIdx((prev) => (prev + 1) % activeMembers.length);
      } finally {
        setIsGenerating(false);
      }
    }

    // 2.5秒の思考遅延を入れてループ進行
    timer = setTimeout(() => {
      runNextSpeaker();
    }, 2500);

    return () => clearTimeout(timer);
  }, [isPaused, isGenerating, isSummarizing, activeMemberIdx, dbInstance, activeMembers, meetingLogs]);

  // 会議を締めくくってサマリーを作成する処理 (G8)
  const handleGenerateSummary = async () => {
    if (meetingLogs.length <= 1) {
      alert("十分な議論のログがありません。もう少し議論を進めてください。");
      return;
    }

    if (!confirm("議論を締めくくり、議事録サマリーを自動生成しますか？（会議はここで終了します）")) {
      return;
    }

    setIsSummarizing(true);
    try {
      // 1. APIキーを優先順位で探索 (OpenAI -> Anthropic -> Gemini)
      let providerType: ProviderType | null = null;
      let modelId = "gpt-4o-mini";
      let apiKey = "";

      for (const prov of [PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, PROVIDERS.GEMINI]) {
        const key = await getApiKey(prov as ProviderType);
        if (key) {
          providerType = prov as ProviderType;
          apiKey = key;
          if (prov === PROVIDERS.ANTHROPIC) modelId = "claude-3-5-haiku-20241022";
          else if (prov === PROVIDERS.GEMINI) modelId = "gemini-2.5-flash";
          break;
        }
      }

      if (!apiKey) {
        alert("議事録を作成するためのAPIキーがありません。設定画面で登録してください。");
        setIsSummarizing(false);
        return;
      }

      // 2. ログのテキスト化
      const logsText = meetingLogs
        .filter(log => log.sender !== "システム")
        .map(log => `${log.sender} (${log.role}): ${log.content}`)
        .join("\n\n");

      // 3. サマリー指示プロンプトの作成
      const systemInstruction = `あなたはプロフェッショナルなAIカンパニーのファシリテーター兼議事録作成者です。これまでのAI専門家たちによる会議ログを注意深く読み、客観的で高精度な議論の要約（サマリー）を生成してください。`;
      const userPrompt = `
今回の会議議題: 「${meetingAgenda}」
進行モード: ${meetingMode === "exploration" ? "探索モード" : "収束モード"}

議論ログ:
${logsText}

【指示】
上記の会議内容に基づいて、以下の項目を含む詳細な議事録サマリーを日本語のMarkdown形式で作成してください：
1. **論点・主な対立軸**: どのような議論が行われ、何が問題となったか。
2. **メンバーごとの立場 (PRO/CON)**: 各メンバーが何に賛成し、何に懸念を示したか。
3. **最終決定事項**: 今回の会議で合意された、あるいは方向性として決定した内容。
4. **次のアクション (ToDo)**: 誰が、いつまでに、何を行うか（具体的なToDoの提案）。

出力は、ユーザー（しいたけさん）が後からコピペして利用できる簡潔で構造的なMarkdownのみとしてください（前置きの雑談等は不要です）。
`;

      // 4. APIコール
      let summaryText = "";
      if (providerType === PROVIDERS.OPENAI) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userPrompt }
            ]
          })
        });
        const data = await res.json();
        summaryText = data.choices?.[0]?.message?.content || JSON.stringify(data);
      } else if (providerType === PROVIDERS.ANTHROPIC) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: modelId,
            system: systemInstruction,
            max_tokens: 2000,
            messages: [{ role: "user", content: userPrompt }]
          })
        });
        const data = await res.json();
        summaryText = data.content?.[0]?.text || JSON.stringify(data);
      } else if (providerType === PROVIDERS.GEMINI) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }]
          })
        });
        const data = await res.json();
        summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
      }

      // 5. DBに会議とサマリーの保存 (meetings, meeting_summaries)
      const nowStr = new Date().toISOString();
      const meetRes = await dbInstance!.execute(
        "INSERT INTO meetings (project_id, mode, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?)",
        [selectedProjectId, meetingMode, "終了", nowStr, nowStr]
      );
      const meetingId = meetRes.lastInsertId;

      await dbInstance!.execute(
        "INSERT INTO meeting_summaries (meeting_id, mode, issues, decisions, next_actions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [meetingId, meetingMode || "探索", "論点整理", summaryText, "次回ToDo", nowStr, nowStr]
      );

      // 6. 決定事項からメンバーへの自動学習（member_learningsへ追加）のシミュレート
      // 議論のまとめから、簡易的に決定事項を抽出して全メンバーに覚えさせる
      for (const m of activeMembers) {
        await dbInstance!.execute(
          "INSERT INTO member_learnings (member_id, meeting_id, content, created_at) VALUES (?, ?, ?, ?)",
          [m.id, meetingId, `議題「${meetingAgenda}」の会議で決定: ${meetingMode === "exploration" ? "アイデア展開の合意" : "実行計画の合意"}`, nowStr]
        );
      }

      alert(`📝 議事録サマリーが生成され、データベースに保存されました！\n\n【サマリー概要】\n${summaryText.slice(0, 500)}...`);
      setCurrentScreen("home");

    } catch (err) {
      console.error("Summary creation failed", err);
      alert(`議事録作成に失敗しました: ${String(err)}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleStopMeeting = () => {
    if (confirm("会議を終了してホームに戻りますか？今回の議論内容は破棄されます。")) {
      setCurrentScreen("home");
    }
  };

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '24px', overflow: 'hidden' }}>
      
      {/* 左サイドバー: 参加メンバーと進行ステータス */}
      <div className="w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <div className="panel-paper p-3 text-center mb-2 shrink-0">
          <h2 className="font-title text-xl font-bold">会議ステータス 🎙️</h2>
        </div>

        {/* 進行状況インジケーター */}
        <div className="bg-white/80 border border-[var(--color-border-inner)] rounded-lg p-3 text-xs flex flex-col gap-2 shrink-0 shadow-inner">
          <div className="flex justify-between items-center">
            <span className="font-bold text-[#3d2b1f]">状態:</span>
            <span className={`px-2 py-0.5 rounded font-bold ${
              isPaused ? "bg-amber-100 text-amber-800" : isGenerating ? "bg-blue-100 text-blue-800 animate-pulse" : "bg-green-100 text-green-800"
            }`}>
              {isPaused ? "一時停止中" : isGenerating ? "発言生成中" : "待機中"}
            </span>
          </div>
          <div>
            <span className="font-bold text-[#3d2b1f]">進行モード:</span> {meetingMode === "exploration" ? "💡 探索" : "🎯 収束"}
          </div>
          <div>
            <span className="font-bold text-[#3d2b1f]">発言順:</span> 順次発言
          </div>
          <div className="mt-1 border-t border-gray-200 pt-1 text-[10px] text-gray-400">
            現在の話者: <span className="font-bold text-gray-700">{activeMembers[activeMemberIdx]?.name || "なし"}</span>
          </div>
        </div>

        {/* 参加メンバー一覧 */}
        <div className="flex-1 flex flex-col gap-2" style={{ overflowY: 'auto', minHeight: 0 }}>
          <span className="text-xs font-bold text-[var(--color-text-sub)] px-1">👥 参加予定のメンバー ({activeMembers.length})</span>
          {activeMembers.map((member, idx) => {
            const isActive = idx === activeMemberIdx && !isPaused;
            return (
              <div
                key={member.id}
                className={`bg-white border-2 rounded p-2 flex items-center gap-2 shadow-sm transition-all ${
                  isActive ? "border-[var(--color-accent)] ring-2 ring-[#f59e0b]/20 scale-[1.02]" : "border-[var(--color-border-inner)]"
                }`}
                style={{ borderLeft: `6px solid ${getRoleColor(member.role, member.dept_name)}` }}
              >
                {/* 
                  ★アバター画像サイズ制限バグの修正
                  style属性で直接 '32px' 固定幅と高さを指定し、Tailwindクラス解釈エラーや干渉による巨大化を100%防ぎます。
                */}
                <div 
                  className="rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center overflow-hidden shrink-0 shadow-inner"
                  style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
                >
                  {getAvatarPath(member.avatar_id) ? (
                    <img src={getAvatarPath(member.avatar_id)} alt={member.name} className="w-full h-full object-cover select-none" />
                  ) : (
                    <span className="text-sm">{getEmojiForRole(member.dept_name, member.role)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-[#3d2b1f]">{member.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{member.role}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleStopMeeting}
          className="btn-secondary w-full justify-center shrink-0 py-3 text-red-700 hover:bg-red-50 border-red-200"
        >
          🚪 会議を終了する
        </button>
      </div>

      {/* 右メインエリア: タイムラインと操作パネル */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
        
        {/* 会議の議題アジェンダ表示ヘッダー */}
        <div className="panel-paper p-3 mb-3 bg-[#fdfbeb] border-2 border-[var(--color-border-inner)] shrink-0 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-[#f59e0b] tracking-wider">📌 会議の議題 / AGENDA</span>
          <h3 className="font-bold text-sm text-[#3d2b1f] truncate" title={meetingAgenda}>
            {meetingAgenda}
          </h3>
        </div>

        {/* メッセージログ領域 */}
        <div 
          className="panel-paper flex-1 p-4 mb-4 bg-white/70 shadow-inner" 
          style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}
        >
          {meetingLogs.map((log) => {
            const isSystem = log.sender === "システム";
            return (
              <div 
                key={log.id} 
                className={`flex flex-col p-3 rounded-lg border-2 ${
                  isSystem 
                    ? "bg-[#f5e6c8]/40 border-dashed border-[#c8a96e] text-[#5c4636]" 
                    : "bg-white border-[var(--color-border-inner)]"
                }`}
                style={{
                  alignSelf: isSystem ? "center" : "flex-start",
                  maxWidth: isSystem ? "95%" : "85%",
                  boxShadow: "2px 2px 0px var(--color-border-inner)"
                }}
              >
                {!isSystem && (
                  <div className="flex items-center gap-2 mb-1 border-b border-gray-100 pb-1">
                    <span className="font-bold text-xs text-[#3d2b1f]">{log.sender}</span>
                    <span 
                      className="text-[9px] border px-1.5 py-0.2 rounded font-bold shadow-xs text-gray-700"
                      style={{ backgroundColor: getRoleColor(log.role, log.sender) }}
                    >
                      {log.role}
                    </span>
                  </div>
                )}
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-[#3d2b1f]">{log.content}</p>
                <span className="text-[8px] text-gray-400 self-end mt-1">{log.time}</span>
              </div>
            );
          })}

          {isGenerating && (
            <div 
              className="flex items-center gap-2.5 p-3 rounded-lg border-2 border-[var(--color-border-inner)] bg-white/80 animate-pulse"
              style={{ alignSelf: "flex-start", maxWidth: "80%", boxShadow: "2px 2px 0px var(--color-border-inner)" }}
            >
              <span className="text-xs text-gray-500 font-bold">🤔 {activeMembers[activeMemberIdx]?.name} が発言を構成中...</span>
            </div>
          )}

          {isSummarizing && (
            <div 
              className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-[#f59e0b] bg-[#FEF3C7]/20 my-4"
              style={{ alignSelf: "center", width: "90%" }}
            >
              <span className="text-2xl animate-spin">⏳</span>
              <span className="text-xs font-bold text-[#b45309] mt-2">📖 議論ログを解析し、議事録サマリーを自動生成しています...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* コントロールフッター */}
        <div 
          className="border-t-2 border-[var(--color-border-inner)] bg-[var(--color-panel)] flex justify-between items-center rounded-lg shadow-sm"
          style={{ padding: '12px 20px', flexShrink: 0 }}
        >
          <div className="flex gap-2">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="btn-secondary text-xs py-2 px-4 font-bold"
              disabled={isSummarizing}
            >
              {isPaused ? "▶ 議論を再開" : "⏸ 一時停止"}
            </button>
            <button
              disabled={isPaused || isGenerating || isSummarizing}
              onClick={() => {
                setActiveMemberIdx((prev) => (prev + 1) % activeMembers.length);
              }}
              className="btn-secondary text-xs py-2 px-4 disabled:opacity-50 font-bold"
            >
              ⏭️ 次の話者へ
            </button>
          </div>

          <button
            onClick={handleGenerateSummary}
            disabled={isGenerating || isSummarizing || meetingLogs.length <= 1}
            className="btn-primary text-sm py-2 px-5 rounded-lg shadow-md font-bold disabled:opacity-50"
          >
            {isSummarizing ? "サマリー生成中..." : "📝 会議を締めてサマリー作成"}
          </button>
        </div>

      </div>

    </div>
  );
};
