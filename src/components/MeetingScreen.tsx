import { useState, useEffect, useRef } from "react";
import { MeetingMode } from "./MeetingModeModal";
import { Project, ProjectMember } from "../lib/types";
import Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "../lib/promptMerger";
import { calculateCost } from "../lib/utils";
import { callLLMWithPrompt, callLLMWithFallback, resolveApiKey } from "../lib/llmProvider";
import { buildSpeakerPrompt } from "../lib/langchain/prompts";
import { closeMeetingViaRust, createMeetingViaRust, insertMeetingUsageLogViaRust, MeetingMessageDraft } from "../lib/meetingPersistence";
import { MeetingReviewDraft, parseStructuredMeetingSummary, StructuredMeetingSummary } from "../lib/meetingSummary";
import {
  MAX_SAME_TARGET_INTERRUPTS,
  canInterrupt,
  createMeetingInterruptState,
  getHighlightRemainingMs,
  transitionMeetingInterruptState,
  MeetingInterruptState,
} from "../lib/meetingInterruptState";

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
  const [interruptState, setInterruptState] = useState<MeetingInterruptState>(() =>
    createMeetingInterruptState(Date.now())
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeMemberIdx, setActiveMemberIdx] = useState<number>(0);
  const [meetingLogs, setMeetingLogs] = useState<MeetingLog[]>([]);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [interruptText, setInterruptText] = useState<string>("");
  const [highlightRemainingMs, setHighlightRemainingMs] = useState<number>(0);

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
  const meetingLogsRef = useRef<MeetingLog[]>([]);
  const generationEpochRef = useRef<number>(0);
  const generationInFlightRef = useRef<boolean>(false);
  const summaryLockRef = useRef<boolean>(false);
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPaused = interruptState.phase === "paused";

  const pauseMeeting = () => {
    setInterruptState(prev =>
      transitionMeetingInterruptState(prev, { type: "pause", nowMs: Date.now() })
    );
  };

  const resumeMeeting = () => {
    setInterruptState(prev =>
      transitionMeetingInterruptState(prev, { type: "resume", nowMs: Date.now() })
    );
  };

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
    generationEpochRef.current += 1;
    generationInFlightRef.current = false;
    summaryLockRef.current = false;
    if (summaryTimerRef.current) {
      clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = null;
    }
    setIsGenerating(false);
    setTurnCount(0);
    setTotalPromptTokens(0);
    setTotalCompletionTokens(0);
    setTotalCost(0);
    setMeetingId(null);
    setInterruptState(createMeetingInterruptState(Date.now()));
    setInterruptText("");
    setHighlightRemainingMs(0);
    setBoardState({
      currentIssue: "議論進行中。発言から自動で要点を抽出します...",
      direction: "アジェンダに沿って発散・収束を行います"
    });
  }, [meetingAgenda, meetingMode]);

  useEffect(() => {
    meetingLogsRef.current = meetingLogs;
  }, [meetingLogs]);

  // 会議開始時に親行を作成する。Version 3のFKにより、発言中の
  // api_usage_logsを仮IDへ紐付けることはできないため、実IDが取れるまで
  // 自動発言ループを開始しない。
  useEffect(() => {
    let cancelled = false;
    const meetingDatabase = dbInstance;

    const initializeMeeting = async () => {
      if (!meetingDatabase || selectedProjectId == null || !meetingMode) return;

      try {
        const createdMeetingId = await createMeetingViaRust(
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
          pauseMeeting();
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

  // 10秒の視覚強調と、その後の通常ラウンドロビン引き継ぎを管理する。
  // 一時停止中は状態機械側に残時間を保持させ、タイマーを作らない。
  useEffect(() => {
    if (
      meetingId === null ||
      isSummarizing ||
      interruptState.phase !== "interrupt-window"
    ) {
      setHighlightRemainingMs(
        interruptState.phase === "paused"
          ? getHighlightRemainingMs(interruptState, Date.now())
          : 0
      );
      return;
    }

    let cancelled = false;
    const updateRemaining = () => {
      if (!cancelled) {
        setHighlightRemainingMs(getHighlightRemainingMs(interruptState, Date.now()));
      }
    };
    updateRemaining();
    const tickTimer = setInterval(updateRemaining, 250);
    const remainingMs = getHighlightRemainingMs(interruptState, Date.now());
    const handoffTimer = setTimeout(() => {
      if (cancelled || summaryLockRef.current || turnCount >= maxTurns) return;
      setInterruptState(prev =>
        transitionMeetingInterruptState(prev, { type: "tick", nowMs: Date.now() })
      );
      setActiveMemberIdx(prev => (prev + 1) % activeMembers.length);
    }, Math.max(0, remainingMs));

    return () => {
      cancelled = true;
      clearInterval(tickTimer);
      clearTimeout(handoffTimer);
    };
  }, [
    meetingId,
    isSummarizing,
    interruptState.phase,
    interruptState.updatedAtMs,
    turnCount,
    maxTurns,
    activeMembers.length,
  ]);

  // 自動議論進行の主要ループ。応答中の再入をrefで抑止する。
  useEffect(() => {
    if (
      !dbInstance ||
      meetingId === null ||
      isPaused ||
      isGenerating ||
      isSummarizing ||
      generationInFlightRef.current ||
      activeMembers.length === 0 ||
      meetingLogs.length === 0 ||
      turnCount >= maxTurns ||
      interruptState.phase !== "speaking"
    ) {
      return;
    }

    const meetingDatabase = dbInstance;
    const activeMeetingId = meetingId;
    const epoch = generationEpochRef.current;
    const timer = setTimeout(() => {
      if (generationInFlightRef.current || summaryLockRef.current) return;

      const currentMember = activeMembers[activeMemberIdx];
      if (!currentMember) return;
      generationInFlightRef.current = true;
      setIsGenerating(true);
      const generationState = interruptState;
      const isInterruptResponse =
        generationState.targetMemberId === currentMember.id &&
        generationState.interruptChainCount > 0;
      const previousMemberLog = [...meetingLogsRef.current]
        .reverse()
        .find(log => log.memberId === currentMember.id && log.roundNumber !== null);
      const responseRoundNumber = previousMemberLog?.roundNumber ?? turnCount + 1;

      const runNextSpeaker = async () => {
        setInterruptState(prev =>
          transitionMeetingInterruptState(prev, {
            type: "speech-started",
            targetMemberId: currentMember.id,
            nowMs: Date.now(),
          })
        );

        try {
          const sysPrompt = await getMergedSystemPrompt(meetingDatabase, {
            userId: 1,
            projectId: selectedProjectId!,
            memberId: currentMember.id
          });
          const modelId = currentMember.ai_model || "gpt-4o";
          const { providerType, apiKey } = await resolveApiKey(modelId);

          if (!apiKey) {
            if (epoch !== generationEpochRef.current) return;
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
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
            ]);
            pauseMeeting();
            return;
          }

          const historyText = meetingLogsRef.current
            .filter(log => log.sender !== "システム")
            .map(log => `${log.sender} (${log.role}): ${log.content}`)
            .join("\n\n");
          const basePrompt = await buildSpeakerPrompt({
            agenda: meetingAgenda,
            mode: meetingMode === "exploration"
              ? "探索モード（自由にアイデアを出し合って広げる）"
              : "収束モード（ToDoや決定事項、結論の整理にフォーカスする）",
            history: historyText || "（議論の開始です。最初の発言をお願いします）",
            role: currentMember.role,
          });
          const userPrompt = isInterruptResponse
            ? `${basePrompt}\n\nこれはユーザー割り込みへの応答です。割り込み内容を踏まえ、あなたの立場を補足・修正してください。`
            : basePrompt;
          const result = await callLLMWithPrompt({
            modelId,
            systemPrompt: sysPrompt,
            userPrompt,
            apiKey,
          });
          if (epoch !== generationEpochRef.current) return;
          if (!result.ok) {
            alert(`【${currentMember.name}】から応答を取得できませんでした。\n\n${result.error?.message ?? "AI APIエラー"}`);
            pauseMeeting();
            return;
          }

          let replyContent = result.content;
          const pTokens = result.promptTokens;
          const cTokens = result.completionTokens;
          let parsedIssue = boardState.currentIssue;
          let parsedDirection = boardState.direction;
          if (replyContent) {
            const boardRegex = /\[BOARD\]([\s\S]*?)\[\/BOARD\]/;
            const match = replyContent.match(boardRegex);
            if (match) {
              const boardContent = match[1];
              boardContent.split("|").forEach(part => {
                const pair = part.split(":");
                if (pair.length >= 2) {
                  const key = pair[0].trim();
                  const val = pair.slice(1).join(":").trim();
                  if (key.includes("課題")) parsedIssue = val;
                  else if (key.includes("方針") || key.includes("方向") || key.includes("合意")) parsedDirection = val;
                } else {
                  parsedIssue = boardContent.trim();
                }
              });
              replyContent = replyContent.replace(boardRegex, "").trim();
              setBoardState({ currentIssue: parsedIssue, direction: parsedDirection });
            }
          }

          if (pTokens > 0 || cTokens > 0) {
            const cost = calculateCost(modelId, pTokens, cTokens);
            setTotalPromptTokens(prev => prev + pTokens);
            setTotalCompletionTokens(prev => prev + cTokens);
            setTotalCost(prev => prev + cost);
            await insertMeetingUsageLogViaRust({
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
          if (epoch !== generationEpochRef.current) return;

          const createdAt = new Date().toISOString();
          const nextCount = isInterruptResponse
            ? generationState.interruptChainCount
            : 0;
          setMeetingLogs(prev => [
            ...prev,
            {
              id: Date.now(),
              sender: currentMember.name,
              role: currentMember.role,
              avatar: currentMember.avatar_id,
              content: replyContent,
              memberId: currentMember.id,
              roundNumber: isInterruptResponse ? responseRoundNumber : turnCount + 1,
              messageType: isInterruptResponse ? "割り込みへの応答" : "通常発言",
              interruptChainCount: nextCount,
              createdAt,
              time: new Date(createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            }
          ]);
          setInterruptState(prev =>
            transitionMeetingInterruptState(prev, {
              type: "speech-completed",
              targetMemberId: currentMember.id,
              nowMs: Date.now(),
            })
          );

          if (!isInterruptResponse) {
            setTurnCount(prev => {
              const nextTurnCount = prev + 1;
              if (nextTurnCount >= maxTurns) {
                if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current);
                summaryTimerRef.current = setTimeout(() => {
                  if (summaryLockRef.current || epoch !== generationEpochRef.current) return;
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
                        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      }
                    ];
                  });
                  void handleGenerateSummary(true);
                }, 1000);
              }
              return nextTurnCount;
            });
          }
        } catch (err) {
          if (epoch !== generationEpochRef.current) return;
          console.error("Speaker fetch failed", err instanceof Error ? err.name : "unknown");
          alert(`【${currentMember.name}】の通信中にエラーが発生しました。会議を一時停止しました。`);
          pauseMeeting();
        } finally {
          if (epoch === generationEpochRef.current) {
            generationInFlightRef.current = false;
            setIsGenerating(false);
          }
        }
      };

      void runNextSpeaker();
    }, 2500);

    return () => clearTimeout(timer);
  }, [
    isPaused,
    isGenerating,
    isSummarizing,
    activeMemberIdx,
    dbInstance,
    activeMembers,
    meetingId,
    meetingLogs.length,
    turnCount,
    interruptState.phase,
    interruptState.targetMemberId,
    interruptState.interruptChainCount,
  ]);

  useEffect(() => {
    return () => {
      generationEpochRef.current += 1;
      generationInFlightRef.current = false;
      if (summaryTimerRef.current) {
        clearTimeout(summaryTimerRef.current);
        summaryTimerRef.current = null;
      }
    };
  }, []);

  // 会議を締めくくってレビュー用ドラフトを作成する。
  // 永続化と学習登録はSummaryScreenでユーザーがdecisionを確定した後だけ行う。
  const handleGenerateSummary = async (forceAuto: boolean = false) => {
    if (isSummarizing || summaryLockRef.current) return; // 二重実行を完全にブロッキングする

    const logsSnapshot = meetingLogsRef.current;
    if (logsSnapshot.length <= 1) {
      alert("十分な議論のログがありません。もう少し議論を進めてください。");
      return;
    }

    if (!forceAuto && !confirm("議論を締めくくり、議事録サマリーを自動生成しますか？（会議はここで終了します）")) {
      return;
    }

    summaryLockRef.current = true;
    setIsSummarizing(true);
    pauseMeeting();

    // ログのテキスト化
    const logsText = logsSnapshot
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
      alert(`議事録の作成に失敗しました。すべてのAPIキーでエラーが発生しました。\n\n詳細:\n${fallbackResult.errors.map(error => error.message).join("\n")}`);
      summaryLockRef.current = false;
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
      summaryLockRef.current = false;
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
          await insertMeetingUsageLogViaRust({
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

      const messages: MeetingMessageDraft[] = logsSnapshot
        .filter(log => log.sender !== "システム")
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
      summaryLockRef.current = false;
      setIsSummarizing(false);
    }
  };

  const handleInterruptSubmit = () => {
    const targetMemberId = interruptState.targetMemberId;
    const content = interruptText.trim();
    if (
      !content ||
      targetMemberId === null ||
      isPaused ||
      isGenerating ||
      isSummarizing ||
      !canInterrupt(interruptState, targetMemberId)
    ) {
      return;
    }

    const targetIndex = activeMembers.findIndex(member => member.id === targetMemberId);
    if (targetIndex < 0) return;

    const now = Date.now();
    const interruptChainCount = interruptState.interruptChainCount + 1;
    setActiveMemberIdx(targetIndex);
    setInterruptState(prev =>
      transitionMeetingInterruptState(prev, {
        type: "interrupt-submitted",
        targetMemberId,
        nowMs: now,
      })
    );
    setMeetingLogs(prev => [
      ...prev,
      {
        id: Date.now(),
        sender: "あなた",
        role: "ユーザー",
        avatar: "",
        content,
        memberId: null,
        roundNumber: null,
        messageType: "ユーザー割り込み",
        interruptChainCount,
        createdAt: new Date(now).toISOString(),
        time: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      }
    ]);
    setInterruptText("");
  };

  const handleStopMeeting = async () => {
    if (confirm("会議を終了してホームに戻りますか？今回の議論内容は破棄されます。")) {
      if (dbInstance && meetingId !== null) {
        try {
          await closeMeetingViaRust(meetingId, new Date().toISOString());
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
            const isUserInterrupt = log.messageType === "ユーザー割り込み";
            const isHighlighted =
              log.memberId !== null &&
              log.memberId === interruptState.targetMemberId &&
              highlightRemainingMs > 0;
            return (
              <div
                key={log.id}
                className={`flex flex-col p-3 rounded-lg border-2 ${isSystem
                  ? "bg-[var(--color-panel)]/40 border-dashed border-[var(--color-border-inner)] text-[var(--color-text-sub)]"
                  : isUserInterrupt
                    ? "bg-[var(--color-surface-info)] border-[var(--color-info)]"
                    : "bg-[var(--color-surface)] border-[var(--color-border-inner)]"
                  } ${isHighlighted ? "border-[var(--color-interrupt)] motion-pulse" : ""}`}
                style={{
                  alignSelf: isSystem ? "center" : "flex-start",
                  maxWidth: isSystem ? "95%" : "85%",
                  boxShadow: "2px 2px 0px var(--color-border-inner)"
                }}
              >
                {!isSystem && (
                  <div className="flex items-center gap-2 mb-1 border-b border-[var(--color-border-inner)] pb-1">
                    <span className="font-bold text-xs text-[var(--color-text)]">{log.sender}</span>
                    <span className="text-[9px] border px-1.5 py-1 rounded font-bold shadow-xs text-[var(--color-text-sub)]">
                      {log.role}
                    </span>
                    <span className="text-[8px] text-[var(--color-text-sub)] ml-auto" title={log.createdAt}>
                      {log.memberId === null ? "ユーザー" : `#${log.memberId}`} · {log.roundNumber === null ? "R-" : `R${log.roundNumber}`} · {log.messageType} · 割込 {log.interruptChainCount}
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
          style={{ padding: '12px 20px', flexShrink: 0, gap: '12px', flexWrap: 'wrap' }}
        >
          <div className="flex gap-2 items-center">
            <button
              onClick={() => (isPaused ? resumeMeeting() : pauseMeeting())}
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

          <div className="flex items-center gap-2 min-w-[280px] flex-1" aria-label="割り込み操作">
            <label htmlFor="meeting-interrupt-text" className="sr-only">割り込み内容</label>
            <textarea
              id="meeting-interrupt-text"
              value={interruptText}
              onChange={event => setInterruptText(event.target.value)}
              onKeyDown={event => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  handleInterruptSubmit();
                }
              }}
              placeholder="割り込み内容を入力"
              rows={2}
              className="flex-1 min-w-0 rounded border-2 border-[var(--color-border-inner)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
              disabled={isPaused || isGenerating || isSummarizing || !canInterrupt(interruptState)}
              aria-describedby="meeting-interrupt-status"
            />
            <button
              type="button"
              onClick={handleInterruptSubmit}
              disabled={
                isPaused ||
                isGenerating ||
                isSummarizing ||
                !interruptText.trim() ||
                !canInterrupt(interruptState)
              }
              className="btn-primary text-xs py-2 px-3 disabled:opacity-50 font-bold"
            >
              割り込む
            </button>
            <span id="meeting-interrupt-status" role="status" className="sr-only">
              {interruptState.targetMemberId === null
                ? "割り込み対象はありません"
                : canInterrupt(interruptState)
                  ? `割り込み可能。残り${Math.ceil(highlightRemainingMs / 1000)}秒は強調表示中。連鎖${interruptState.interruptChainCount}/${MAX_SAME_TARGET_INTERRUPTS}`
                  : "このメンバーへの割り込み上限に達しました"}
            </span>
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
