import { useState, useEffect, useRef } from "react";
import { MeetingMode } from "./MeetingModeModal";
import { Project, ProjectMember } from "../lib/types";
import Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "../lib/promptMerger";
import { calculateCost } from "../lib/utils";
import { callLLMWithPrompt, callLLMWithFallback, resolveApiKey } from "../lib/llmProvider";
import { buildSpeakerPrompt } from "../lib/langchain/prompts";
import { closeMeeting, createMeeting, insertMeetingUsageLog, MeetingMessageDraft } from "../lib/meetingPersistence";
import { MeetingReviewDraft, parseStructuredMeetingSummary, StructuredMeetingSummary } from "../lib/meetingSummary";

type MeetingLog = {
  id: number;
  sender: string;
  role: string;
  avatar: string;
  content: string;
  memberId: number | null;
  roundNumber: number | null;
  messageType: string;
  interruptChainCount: number;
  createdAt: string;
  time: string;
};

type MeetingScreenProps = {
  dbInstance: Database | null;
  projectMembers: ProjectMember[];
  selectedProjectId: number | null;
  projects: Project[];
  meetingMode: MeetingMode | null;
  meetingAgenda: string;
  setCurrentScreen: (screen: "home" | "apiKeySetup" | "promptTest" | "settings" | "createProject" | "teamManage" | "chat" | "meeting" | "summary") => void;
  getAvatarPath: (id: string) => string;
  getEmojiForRole: (dept: string, role: string) => string;
  getRoleColor: (role: string, dept: string) => string;
  onSummaryGenerated: (draft: MeetingReviewDraft, promptTokens: number, completionTokens: number, totalCost: number, participantMemberIds: number[], messages: MeetingMessageDraft[]) => void;
  summaryModel: string;
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
  getRoleColor,
  onSummaryGenerated,
  summaryModel
}: MeetingScreenProps) => {
  const project = projects.find(p => p.id === selectedProjectId);
  const activeMembers = projectMembers.filter(m => m.is_active_in_meeting !== 0);

  // 状態変数
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeMemberIdx, setActiveMemberIdx] = useState<number>(0);
  const [meetingLogs, setMeetingLogs] = useState<MeetingLog[]>([]);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

  // 会議中の累積トークン・コスト・ターン数およびホワイトボード状態
  const [totalPromptTokens, setTotalPromptTokens] = useState<number>(0);
  const [totalCompletionTokens, setTotalCompletionTokens] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [turnCount, setTurnCount] = useState<number>(0);
  // SQLite Version 3ではapi_usage_logs.meeting_idがmeetings(id)を参照する。
  // 会議開始時に実IDを確保し、発言中の利用量ログへ伝播させる。
  const [meetingId, setMeetingId] = useState<number | null>(null);
  const maxTurns = activeMembers.length * 3; // 各メンバー最大3ターン
  const [boardState, setBoardState] = useState<{ currentIssue: string; direction: string }>({
    currentIssue: "議論進行中。発言から自動で要点を抽出します...",
    direction: "アジェンダに沿って発散・収束を行います"
  });

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 初期メッセージのセットアップ
  useEffect(() => {
    const createdAt = new Date().toISOString();
    setMeetingLogs([
      {
        id: 1,
        sender: "システム",
        role: "ファシリテーター",
        avatar: "",
        content: `会議を開始しました。\n進行モード: ${meetingMode === "exploration" ? "💡 探索モード (アイデア発散)" : "🎯 収束モード (決定事項整理)"}\n議題: 「${meetingAgenda}」\n\nAIメンバーがラウンドロビン順に発言を開始します。一時停止やスキップ操作も可能です。`,
        memberId: null,
        roundNumber: null,
        messageType: "system",
        interruptChainCount: 0,
        createdAt,
        time: new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setActiveMemberIdx(0);
    setIsPaused(false);
    setIsGenerating(false);
    setTurnCount(0);
    setTotalPromptTokens(0);
    setTotalCompletionTokens(0);
    setTotalCost(0);
    setMeetingId(null);
    setBoardState({
      currentIssue: "議論進行中。発言から自動で要点を抽出します...",
      direction: "アジェンダに沿って発散・収束を行います"
    });
  }, [meetingAgenda, meetingMode]);

  // 会議開始時に親行を作成する。Version 3のFKにより、発言中の
  // api_usage_logsを仮IDへ紐付けることはできないため、実IDが取れるまで
  // 自動発言ループを開始しない。
  useEffect(() => {
    let cancelled = false;
    const meetingDatabase = dbInstance;

    const initializeMeeting = async () => {
      if (!meetingDatabase || selectedProjectId == null || !meetingMode) return;

      try {
        const createdMeetingId = await createMeeting(
          meetingDatabase,
          selectedProjectId,
          meetingMode,
          new Date().toISOString()
        );
        if (!cancelled) setMeetingId(createdMeetingId);
      } catch (err) {
        console.error("Meeting initialization failed", err);
        if (!cancelled) {
          setMeetingLogs(prev => [
            ...prev,
            {
              id: Date.now(),
              sender: "システム",
              role: "エラー",
              avatar: "",
              content: `⚠️ 会議の保存準備に失敗しました。会議を開始できません: ${String(err)}`,
              memberId: null,
              roundNumber: null,
              messageType: "system",
              interruptChainCount: 0,
              createdAt: new Date().toISOString(),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsPaused(true);
        }
      }
    };

    void initializeMeeting();
    return () => {
      cancelled = true;
    };
  }, [dbInstance, selectedProjectId, meetingMode, meetingAgenda]);

  // チャットスクロール
  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    chatEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [meetingLogs, isGenerating]);

  // 自動議論進行の主要ループ
  useEffect(() => {
    if (!dbInstance) return;
    const meetingDatabase = dbInstance;
    if (meetingId === null) return;
    const activeMeetingId: number = meetingId;
    // ガード句 (ターン上限到達時もループ停止)
    if (
      isPaused ||
      isGenerating ||
      isSummarizing ||
      activeMembers.length === 0 ||
      meetingLogs.length === 0 ||
      turnCount >= maxTurns
    ) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    async function runNextSpeaker() {
      setIsGenerating(true);
      const currentMember = activeMembers[activeMemberIdx];

      try {
        // 1. システムプロンプトの取得 (4層マージ)
        const sysPrompt = await getMergedSystemPrompt(meetingDatabase, {
          userId: 1,
          projectId: selectedProjectId!,
          memberId: currentMember.id
        });

        // 2. APIキーとモデルの特定（llmProviderのresolveApiKeyを利用）
        const modelId = currentMember.ai_model || "gpt-4o";
        const { providerType, apiKey } = await resolveApiKey(modelId);

        if (!apiKey) {
          // APIキー未設定時は会議を安全に一時停止し、ユーザーに気づかせる
          setMeetingLogs(prev => [
            ...prev,
            {
              id: Date.now(),
              sender: "システム",
              role: "⚠️ 警告",
              avatar: "",
              content: `🚨 【${currentMember.name}】が使用するモデルのAPIキーが設定されていません（プロバイダー: ${providerType ?? "不明"}）。\n会議を一時停止しました。設定画面でAPIキーを登録してから「議論を再開」ボタンを押してください。`,
              memberId: null,
              roundNumber: null,
              messageType: "system",
              interruptChainCount: 0,
              createdAt: new Date().toISOString(),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsPaused(true);  // スキップではなく一時停止
          setIsGenerating(false);
          return;
        }

        // 3. 発言履歴の構築 (システムメッセージを除く直近の発言)
        const historyText = meetingLogs
          .filter(log => log.sender !== "システム")
          .map(log => `${log.sender} (${log.role}): ${log.content}`)
          .join("\n\n");

        // 4. ユーザープロンプト（コンテキスト）の構築（より深い議論の要求と、ホワイトボードタグ指示の埋め込み）
        const userPrompt = await buildSpeakerPrompt({
          agenda: meetingAgenda,
          mode: meetingMode === "exploration" ? "探索モード（自由にアイデアを出し合って広げる）" : "収束モード（ToDoや決定事項、結論の整理にフォーカスする）",
          history: historyText || "（議論の開始です。最初の発言をお願いします）",
          role: currentMember.role,
        });

        // 5. APIコール（llmProviderに統一）
        const result = await callLLMWithPrompt({
          modelId,
          systemPrompt: sysPrompt,
          userPrompt: userPrompt,
          apiKey,
        });
        let replyContent = result.content;
        let pTokens = result.promptTokens;
        let cTokens = result.completionTokens;

        // BOARDタグのパース
        let parsedIssue = boardState.currentIssue;
        let parsedDirection = boardState.direction;

        if (replyContent) {
          const boardRegex = /\[BOARD\]([\s\S]*?)\[\/BOARD\]/;
          const match = replyContent.match(boardRegex);
          if (match) {
            const boardContent = match[1];
            const parts = boardContent.split("|");
            parts.forEach(part => {
              const pair = part.split(":");
              if (pair.length >= 2) {
                const key = pair[0].trim();
                const val = pair.slice(1).join(":").trim();
                if (key.includes("課題")) {
                  parsedIssue = val;
                } else if (key.includes("方針") || key.includes("方向") || key.includes("合意")) {
                  parsedDirection = val;
                }
              } else {
                parsedIssue = boardContent.trim();
              }
            });
            replyContent = replyContent.replace(boardRegex, "").trim();
            setBoardState({ currentIssue: parsedIssue, direction: parsedDirection });
          }
        }

        // 6. API利用料金のログ挿入 & 累積
        if (pTokens > 0 || cTokens > 0) {
          const cost = calculateCost(modelId, pTokens, cTokens);
          setTotalPromptTokens(prev => prev + pTokens);
          setTotalCompletionTokens(prev => prev + cTokens);
          setTotalCost(prev => prev + cost);

          await insertMeetingUsageLog(meetingDatabase, {
            memberId: currentMember.id,
            meetingId: activeMeetingId,
            provider: providerType,
            modelId,
            promptTokens: pTokens,
            completionTokens: cTokens,
            costUsd: cost,
            createdAt: new Date().toISOString(),
          });
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
            memberId: currentMember.id,
            roundNumber: turnCount + 1,
            messageType: "assistant",
            interruptChainCount: 0,
            createdAt: new Date().toISOString(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);

        // 8. 発言インデックスを進める & ターン数加算
        setActiveMemberIdx((prev) => (prev + 1) % activeMembers.length);
        setTurnCount(prev => {
          const nextCount = prev + 1;
          if (nextCount >= maxTurns) {
            // 即座に一時停止にして、非同期での多重ループ進行を防ぐ
            setIsPaused(true);
            // 最大ターンに達したら自動でサマリー生成へ
            setTimeout(() => {
              setMeetingLogs(prevLogs => {
                const hasSysLog = prevLogs.some(l => l.sender === "システム" && l.content.includes("制限ターン数"));
                if (hasSysLog) return prevLogs;
                return [
                  ...prevLogs,
                  {
                    id: Date.now(),
                    sender: "システム",
                    role: "システム",
                    avatar: "",
                    content: `⏱️ 議論の制限ターン数（最大${maxTurns}ターン）に到達したため、自動的に会議を締めくくります。`,
                    memberId: null,
                    roundNumber: null,
                    messageType: "system",
                    interruptChainCount: 0,
                    createdAt: new Date().toISOString(),
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              });
              handleGenerateSummary(true);
            }, 1000);
          }
          return nextCount;
        });

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
            memberId: currentMember.id,
            roundNumber: turnCount + 1,
            messageType: "error",
            interruptChainCount: 0,
            createdAt: new Date().toISOString(),
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
  }, [isPaused, isGenerating, isSummarizing, activeMemberIdx, dbInstance, activeMembers, meetingId, meetingLogs, turnCount]);

  // 会議を締めくくってレビュー用ドラフトを作成する。
  // 永続化と学習登録はSummaryScreenでユーザーがdecisionを確定した後だけ行う。
  const handleGenerateSummary = async (forceAuto: boolean = false) => {
    if (isSummarizing) return; // 二重実行を完全にブロッキングする

    if (meetingLogs.length <= 1) {
      alert("十分な議論のログがありません。もう少し議論を進めてください。");
      return;
    }

    if (!forceAuto && !confirm("議論を締めくくり、議事録サマリーを自動生成しますか？（会議はここで終了します）")) {
      return;
    }

    setIsSummarizing(true);
    setIsPaused(true);

    // ログのテキスト化
    const logsText = meetingLogs
      .filter(log => log.sender !== "システム")
      .map(log => `${log.sender} (${log.role}): ${log.content}`)
      .join("\n\n");

    const systemInstruction = `あなたはプロフェッショナルなAIカンパニーの議事録作成者です。会議ログを客観的に整理し、指定されたJSONオブジェクトだけを返してください。Markdown、コードフェンス外の説明、decisionsキーは出力しないでください。`;
    const userPrompt = `
今回の会議議題: 「${meetingAgenda}」
進行モード: ${meetingMode === "exploration" ? "探索モード" : "収束モード"}

議論ログ:
${logsText}

【指示】
以下のJSONスキーマに厳密に従ってください。キーはこの7個だけです。
{"issues":["論点"],"proConTable":[{"issue":"論点","member":"メンバー名","stance":"立場","pro":"賛成理由","con":"懸念"}],"facts":["確認できた事実"],"openConcerns":["未解決の懸念"],"aiRecommendation":${meetingMode === "exploration" ? "null" : "\"提言\""},"memberAgreementLevels":[{"member":"メンバー名","level":0,"note":"根拠"}],"nextActions":[{"action":"次のアクション","owner":"担当","due":"期限"}]}
decisionsは生成しないでください。結論・決定事項はユーザーが後から入力します。
`;

    const fallbackResult = await callLLMWithFallback({
      preferredModelId: summaryModel,
      systemPrompt: systemInstruction,
      userPrompt,
    });

    if (!fallbackResult.finalProvider || !fallbackResult.response.content) {
      alert(`議事録の作成に失敗しました。すべてのAPIキーでエラーが発生しました。\n\n詳細:\n${fallbackResult.errors.join("\n")}`);
      setIsSummarizing(false);
      return;
    }

    let structuredSummary: StructuredMeetingSummary;
    try {
      structuredSummary = parseStructuredMeetingSummary(fallbackResult.response.content, {
        mode: meetingMode ?? undefined,
      });
    } catch (err) {
      console.error("Structured summary validation failed", err);
      alert(`議事録のJSON契約に適合しない応答でした。決定事項は保存されていません。\n\n${String(err)}`);
      setIsSummarizing(false);
      return;
    }

    const finalProvider = fallbackResult.finalProvider;
    const finalModelId = fallbackResult.finalModelId;
    const summaryPromptTokens = fallbackResult.response.promptTokens;
    const summaryCompletionTokens = fallbackResult.response.completionTokens;
    const summaryCost = calculateCost(finalModelId, summaryPromptTokens, summaryCompletionTokens);

    try {
      const nowStr = new Date().toISOString();
      if (meetingId === null) {
        throw new Error("会議IDが未確定のため、議事録を保存できません");
      }

      // サマリー生成にかかったコストを最終累積に加算して callback を呼ぶ
      const finalPromptTokens = totalPromptTokens + summaryPromptTokens;
      const finalCompletionTokens = totalCompletionTokens + summaryCompletionTokens;
      const finalCostVal = totalCost + summaryCost;

      // API利用料金 of ログ挿入 (サマリー生成分)
      if (summaryPromptTokens > 0 && finalProvider) {
        const logMemberId = activeMembers[0]?.id;
        if (dbInstance && meetingId !== null && typeof logMemberId === "number" && Number.isInteger(logMemberId) && logMemberId > 0) {
          await insertMeetingUsageLog(dbInstance, {
            memberId: logMemberId,
            meetingId,
            provider: finalProvider,
            modelId: finalModelId,
            promptTokens: summaryPromptTokens,
            completionTokens: summaryCompletionTokens,
            costUsd: summaryCost,
            createdAt: nowStr,
          });
        } else {
          // サマリー生成は特定メンバーに帰属しないため、参加者IDが確定して
          // いない場合は利用ログを保存しない。架空IDでFKを満たしてはいけない。
          console.warn("Summary usage log skipped because no real participant member ID is available");
        }
      }

      const messages: MeetingMessageDraft[] = meetingLogs
        .filter(log => log.sender !== "システム" && log.memberId !== null)
        .map(log => ({
          memberId: log.memberId,
          roundNumber: log.roundNumber,
          messageType: log.messageType,
          content: log.content,
          interruptChainCount: log.interruptChainCount,
          createdAt: log.createdAt,
        }));
      const participantMemberIds = Array.from(new Set(
        activeMembers.map(member => member.id).filter((id): id is number => Number.isInteger(id))
      ));
      const draft: MeetingReviewDraft = {
        meetingId,
        mode: meetingMode ?? "exploration",
        summary: structuredSummary,
        generatedAt: nowStr,
      };

      onSummaryGenerated(
        draft,
        finalPromptTokens,
        finalCompletionTokens,
        finalCostVal,
        participantMemberIds,
        messages
      );

    } catch (err) {
      console.error("Summary database save failed", err);
      alert(`DBへの保存中にエラーが発生しました: ${String(err)}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleStopMeeting = async () => {
    if (confirm("会議を終了してホームに戻りますか？今回の議論内容は破棄されます。")) {
      if (dbInstance && meetingId !== null) {
        try {
          await closeMeeting(dbInstance, meetingId, new Date().toISOString());
        } catch (err) {
          console.error("Meeting close failed", err);
        }
      }
      setCurrentScreen("home");
    }
  };

  return (
    <div className="meeting-layout">

      <details className="meeting-rail" open>
        <summary>参加者と会議ステータス <span aria-hidden="true">⌄</span></summary>

      {/* 左サイドバー: 参加メンバーと進行ステータス */}
      <div className="meeting-sidebar w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4">
        <div className="panel-paper p-3 text-center mb-2 shrink-0">
          <h2 className="font-title text-xl font-bold">会議ステータス 🎙️</h2>
        </div>

        {/* 進行状況インジケーター */}
        <div className="bg-[var(--color-surface)]/80 border border-[var(--color-border-inner)] rounded-lg p-3 text-xs flex flex-col gap-2 shrink-0 shadow-inner">
          <div className="flex justify-between items-center">
            <span className="font-bold text-[var(--color-text)]">状態:</span>
            <span role="status" className={`px-2 py-1 rounded font-bold ${isPaused ? "status-paused" : isGenerating ? "status-running motion-pulse" : "status-idle"
              }`}>
              {isPaused ? "一時停止中" : isGenerating ? "発言生成中" : "待機中"}
            </span>
          </div>
          <div>
            <span className="font-bold text-[var(--color-text)]">進行モード:</span> {meetingMode === "exploration" ? "💡 探索" : "🎯 収束"}
          </div>
          <div>
            <span className="font-bold text-[var(--color-text)]">進行ターン:</span> {turnCount} / {maxTurns}
          </div>
          <div>
            <span className="font-bold text-[var(--color-text)]">推定コスト:</span> ${totalCost.toFixed(5)}
          </div>
          <div className="mt-1 border-t border-[var(--color-border-inner)] pt-1 text-[10px] text-[var(--color-text-sub)]">
            現在の話者: <span className="font-bold text-[var(--color-text)]">{activeMembers[activeMemberIdx]?.name || "なし"}</span>
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
                className={`bg-[var(--color-surface)] border-2 rounded p-2 flex items-center gap-2 shadow-sm transition-all ${isActive ? "border-[var(--color-accent)] ring-2 ring-[var(--color-interrupt)]/20 scale-[1.02]" : "border-[var(--color-border-inner)]"
                  }`}
                style={{ borderLeft: `6px solid ${getRoleColor(member.role, member.dept_name)}` }}
              >
                {/* 
                  ★アバター画像サイズ制限バグの修正
                  style属性で直接 '32px' 固定幅と高さを指定し、Tailwindクラス解釈エラーや干渉による巨大化を100%防ぎます。
                */}
                <div
                  className="rounded-full bg-[var(--color-panel)] border border-[var(--color-border-inner)] flex items-center justify-center overflow-hidden shrink-0 shadow-inner"
                  style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
                >
                  {getAvatarPath(member.avatar_id) ? (
                    <img src={getAvatarPath(member.avatar_id)} alt={member.name} className="w-full h-full object-cover select-none" />
                  ) : (
                    <span className="text-sm">{getEmojiForRole(member.dept_name, member.role)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate text-[var(--color-text)]">{member.name}</p>
                  <p className="text-[9px] text-[var(--color-text-sub)] truncate">{member.role}</p>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleStopMeeting}
          className="btn-secondary w-full justify-center shrink-0 py-3 text-[var(--color-danger-border)] hover:bg-[var(--color-surface-danger)] border-[var(--color-danger-border)]"
        >
          🚪 会議を終了する
        </button>
      </div>
      </details>

      {/* 中央エリア: タイムラインとアジェンダ、操作パネル */}
      <div className="meeting-center" style={{ display: 'flex', flexDirection: 'column' }}>

        {/* 会議の議題アジェンダ表示ヘッダー */}
        <div className="panel-paper p-3 mb-3 bg-[var(--color-surface-soft)] border-2 border-[var(--color-border-inner)] shrink-0 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-[var(--color-interrupt)] tracking-wider">📌 会議の議題 / AGENDA</span>
          <h3 className="font-bold text-sm text-[var(--color-text)] truncate" title={meetingAgenda}>
            {meetingAgenda}
          </h3>
        </div>

        {/* メッセージログ領域 */}
        <div
          className="panel-paper flex-1 p-4 mb-4 bg-[var(--color-surface)]/70 shadow-inner"
          style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}
        >
          {meetingLogs.map((log) => {
            const isSystem = log.sender === "システム";
            return (
              <div
                key={log.id}
                className={`flex flex-col p-3 rounded-lg border-2 ${isSystem
                  ? "bg-[var(--color-panel)]/40 border-dashed border-[var(--color-border-inner)] text-[var(--color-text-sub)]"
                  : "bg-[var(--color-surface)] border-[var(--color-border-inner)]"
                  }`}
                style={{
                  alignSelf: isSystem ? "center" : "flex-start",
                  maxWidth: isSystem ? "95%" : "85%",
                  boxShadow: "2px 2px 0px var(--color-border-inner)"
                }}
              >
                {!isSystem && (
                  <div className="flex items-center gap-2 mb-1 border-b border-[var(--color-border-inner)] pb-1">
                    <span className="font-bold text-xs text-[var(--color-text)]">{log.sender}</span>
                    <span
                      className="text-[9px] border px-1.5 py-1 rounded font-bold shadow-xs text-[var(--color-text-sub)]"
                      style={{ backgroundColor: getRoleColor(log.role, log.sender) }}
                    >
                      {log.role}
                    </span>
                    <span className="text-[8px] text-[var(--color-text-sub)] ml-auto" title={log.createdAt}>
                      #{log.memberId} · R{log.roundNumber} · {log.messageType} · 割込 {log.interruptChainCount}
                    </span>
                  </div>
                )}
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">{log.content}</p>
                <span className="text-[8px] text-[var(--color-text-sub)] self-end mt-1" title={log.createdAt}>{log.time}</span>
              </div>
            );
          })}

          {isGenerating && (
            <div
              className="flex items-center gap-2.5 p-3 rounded-lg border-2 border-[var(--color-border-inner)] bg-[var(--color-surface)]/80 motion-pulse"
              style={{ alignSelf: "flex-start", maxWidth: "80%", boxShadow: "2px 2px 0px var(--color-border-inner)" }}
            >
              <span className="text-xs text-[var(--color-text-sub)] font-bold" role="status">🤔 {activeMembers[activeMemberIdx]?.name} が発言を構成中...</span>
            </div>
          )}

          {isSummarizing && (
            <div
              className="flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed border-[var(--color-interrupt)] bg-[var(--color-bg)]/20 my-4"
              style={{ alignSelf: "center", width: "90%" }}
            >
              <span className="text-2xl motion-spin" aria-hidden="true">⏳</span>
              <span className="text-xs font-bold text-[var(--color-warning)] mt-2" role="status">📖 議論ログを解析し、議事録サマリーを自動生成しています...</span>
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
            onClick={() => handleGenerateSummary(false)}
            disabled={isGenerating || isSummarizing || meetingLogs.length <= 1}
            className="btn-primary text-sm py-2 px-5 rounded-lg shadow-md font-bold disabled:opacity-50"
          >
            {isSummarizing ? "サマリー生成中..." : "📝 会議を締めてサマリー作成"}
          </button>
        </div>

      </div>

      {/* 右サイドバー: リアルタイムホワイトボード */}
      <details className="meeting-board-rail" open>
        <summary>ホワイトボード <span aria-hidden="true">⌄</span></summary>
      <div className="meeting-board w-72 shrink-0 flex flex-col gap-4">
        <div
          className="panel-paper whiteboard-paper flex-1 bg-[var(--color-surface-board)] border-4 border-[var(--color-border-outer)] rounded-xl p-4 flex flex-col gap-4 overflow-hidden"
          style={{ boxShadow: "6px 6px 0px var(--color-border-outer)" }}
        >
          <div className="border-b-[3px] border-double border-[var(--color-border-outer)] pb-2 flex justify-between items-center shrink-0">
            <span className="font-title text-2xl font-bold text-[var(--color-border-outer)] flex items-center gap-1.5">📋 WHITEBOARD</span>
            <span className="text-[9px] status-info border border-[var(--color-info)] px-2 py-1 rounded-full font-bold select-none">REALTIME</span>
          </div>

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto" style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>
            <div className="bg-[var(--color-surface-info)]/70 p-3 rounded-lg border-2 border-[var(--color-info)] shadow-sm flex flex-col gap-1 shrink-0">
              <span className="font-bold text-xs text-[var(--color-text)] flex items-center gap-1">🚨 現在の重要課題:</span>
              <p className="text-xs text-[var(--color-text)] leading-relaxed font-bold whitespace-pre-wrap">{boardState.currentIssue}</p>
            </div>

            <div className="bg-[var(--color-surface-info)]/70 p-3 rounded-lg border-2 border-[var(--color-success)] shadow-sm flex flex-col gap-1 shrink-0">
              <span className="font-bold text-xs text-[var(--color-text)] flex items-center gap-1">💡 考える方針 / 合意方向:</span>
              <p className="text-xs text-[var(--color-text)] leading-relaxed font-bold whitespace-pre-wrap">{boardState.direction}</p>
            </div>

            <div className="border-t border-dashed border-[var(--color-border-inner)] pt-3 mt-auto flex flex-col gap-1.5 shrink-0 bg-[var(--color-surface-warning)]/50 p-2.5 rounded border border-[var(--color-warning)]">
              <span className="text-[10px] font-bold text-[var(--color-text-sub)]">📌 ファシリテーターメモ</span>
              <p className="text-[9.5px] text-[var(--color-text-sub)] leading-relaxed">
                議論の進行に合わせて、AI専門家たちがホワイトボードの内容をリアルタイムに更新・整理します。
              </p>
            </div>
          </div>
        </div>
      </div>
      </details>

    </div>
  );
};
