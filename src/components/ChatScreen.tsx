import { useState, useEffect, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { getMergedSystemPrompt } from "../lib/promptMerger";
import { getApiKey, PROVIDERS, ProviderType } from "../lib/apiKeyStore";
import { parseApiError, calculateCost } from "../lib/utils";
import { callLLMWithHistory, resolveApiKey } from "../lib/llmProvider";
import { renderMarkdown } from "../lib/markdownRenderer";


type ChatScreenProps = {
  dbInstance: Database | null;
  chatMemberId: number | null;
  chatSessionId: number | null;
  setChatSessionId: (id: number | null) => void;
  currentScreen: string;
  setCurrentScreen: (s: string) => void;
  projectMembers: any[];
  projects: any[];
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number) => void;
  getAvatarPath: (id: string) => string;
  getEmojiForRole: (dept: string, role: string) => string;
  getRoleColor: (role: string, dept: string) => string;
  chatMessages: any[];
  setChatMessages: (msgs: any[]) => void;
};

export const ChatScreen = ({
  dbInstance,
  chatMemberId,
  chatSessionId,
  setChatSessionId,
  currentScreen,
  setCurrentScreen,
  projectMembers,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  getAvatarPath,
  getEmojiForRole,
  getRoleColor,
  chatMessages,
  setChatMessages
}: ChatScreenProps) => {
  const [chatInput, setChatInput] = useState("");
  const [isGeneratingReply, setIsGeneratingReply] = useState<boolean>(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // DB Sync Effect for Chat (Session creation and Message loading)
  useEffect(() => {
    if (currentScreen === "chat" && chatMemberId && dbInstance) {
      async function syncChat() {
        try {
          // 1. セッションがあるか確認
          let sessionRows = await dbInstance!.select<{ id: number }[]>(
            "SELECT id FROM chat_sessions WHERE member_id = ? ORDER BY started_at DESC LIMIT 1",
            [chatMemberId]
          );

          let sessionId: number | undefined;
          if (sessionRows.length > 0) {
            sessionId = sessionRows[0].id;
          } else {
            // 2. なければ新規作成
            const res = await dbInstance!.execute(
              "INSERT INTO chat_sessions (member_id, started_at) VALUES (?, ?)",
              [chatMemberId, new Date().toISOString()]
            );
            sessionId = res.lastInsertId;
          }

          // chatSessionId が取得できない場合のフォールバック
          if (!sessionId) {
            const fallbackRows = await dbInstance!.select<{ id: number }[]>(
              "SELECT id FROM chat_sessions WHERE member_id = ? ORDER BY started_at DESC LIMIT 1",
              [chatMemberId]
            );
            if (fallbackRows.length > 0) {
              sessionId = fallbackRows[0].id;
            }
          }

          if (sessionId) {
            setChatSessionId(sessionId);
            // 3. メッセージのロード
            const msgs = await dbInstance!.select<{ id: number, session_id: number, sender: string, content: string, created_at: string }[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [sessionId]);
            const formatted = msgs.map(m => ({
              id: m.id,
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
              created_at: m.created_at
            }));
            setChatMessages(formatted);
          }
        } catch (err) {
          console.error("Chat sync error", err);
        }
      }
      syncChat();
    }
  }, [currentScreen, chatMemberId, dbInstance]);

  // チャット自動スクロール
  useEffect(() => {
    if (currentScreen === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, isGeneratingReply, currentScreen]);

  if (currentScreen !== "chat" || !chatMemberId) return null;

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, gap: '24px', overflow: 'hidden' }}>
      {/* 左サイドバー */}
      <div className="w-64 shrink-0 sidebar-wood rounded-lg flex flex-col p-4 gap-4" style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <div className="panel-paper p-3 text-center mb-2 shrink-0">
          <h2 className="font-title text-xl font-bold">プロジェクト 🌿</h2>
        </div>
        <div className="flex-1 flex flex-col gap-2" style={{ overflowY: 'auto', minHeight: 0 }}>
          {projects.map((proj) => (
            <div key={proj.id} onClick={() => setSelectedProjectId(proj.id)} className={selectedProjectId === proj.id ? "sidebar-item-active" : "sidebar-item"}>
              <div className="flex items-center gap-2">
                <span className="text-xl">🌱</span>
                <span className="truncate">{proj.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右メインエリア */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 0, height: '100%', overflow: 'hidden' }}>
        {/* メインエリアヘッダー */}
        <div className="panel-paper p-4 flex justify-between items-center mb-4 shrink-0">
          <div className="flex items-center gap-3">
            {(() => {
              const m = projectMembers.find(m => m.id === chatMemberId);
              return m ? (
                <>
                  <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0" style={{ width: '40px', height: '40px' }}>
                    {getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt={m.name} className="w-full h-full object-cover" /> : <span>{getEmojiForRole(m.dept_name, m.role)}</span>}
                  </div>
                  <h2 className="font-bold text-lg">{m.name}</h2>
                  <span className="text-[10px] text-[var(--color-text-sub)] border border-[var(--color-border-inner)] px-2 py-0.5 rounded font-bold shadow-sm" style={{ backgroundColor: getRoleColor(m.role, m.dept_name) }}>{m.role}</span>
                </>
              ) : null;
            })()}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary text-[var(--color-danger)] font-bold border-[var(--color-danger)] px-3" onClick={async () => {
              if (window.confirm("これまでのチャット履歴を完全に消去して、会話をリセットしますか？")) {
                if (dbInstance && chatSessionId) {
                  await dbInstance.execute("DELETE FROM chat_messages WHERE session_id = ?", [chatSessionId]);
                  setChatMessages([]);
                  alert("チャット履歴をクリアしました");
                }
              }
            }}>
              🧹 チャット履歴をクリア
            </button>
            <button className="btn-secondary" onClick={() => setCurrentScreen("teamManage")}>← チームに戻る</button>
          </div>
        </div>

        {/* チャットエリア */}
        <div className="panel-paper mb-4 p-4 flex flex-col gap-4 bg-[var(--color-bg)]" style={{ flex: '1 1 0%', overflowY: 'auto', minHeight: 0 }}>
          {chatMessages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-sub)] opacity-70 gap-2 h-full py-10">
              <span className="text-4xl">💬</span>
              <p className="text-sm font-bold">まだメッセージはありません。</p>
              <p className="text-xs">このメンバーに相談してみましょう！</p>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0 mr-2" style={{ width: '30px', height: '30px' }}>
                    {(() => {
                      const m = projectMembers.find(m => m.id === chatMemberId);
                      return m && getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt="AI" className="w-full h-full object-cover" /> : <span>🤖</span>;
                    })()}
                  </div>
                )}
                <div className={`px-4 py-2.5 rounded-2xl max-w-[75%] text-sm ${msg.role === 'user' ? 'bg-[var(--color-bg)] border-2 border-[var(--color-border-inner)] text-[var(--color-text)] rounded-br-sm' : 'bg-white border-2 border-[var(--color-border-inner)] text-[var(--color-text)] rounded-bl-sm shadow-sm'}`}>
                  {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                </div>
              </div>
            ))
          )}

          {isGeneratingReply && (
            <div className="flex justify-start items-center">
              <div className="bg-white/60 rounded flex items-center justify-center border border-[var(--color-border-inner)] avatar-pixel shadow-inner shrink-0 mr-2" style={{ width: '30px', height: '30px' }}>
                {(() => {
                  const m = projectMembers.find(m => m.id === chatMemberId);
                  return m && getAvatarPath(m.avatar_id) ? <img src={getAvatarPath(m.avatar_id)} alt="AI" className="w-full h-full object-cover" /> : <span>🤖</span>;
                })()}
              </div>
              <div className="px-4 py-2 rounded-2xl max-w-[70%] bg-white border-2 border-[var(--color-border-inner)] text-[var(--color-text-sub)] text-sm rounded-bl-sm shadow-sm animate-pulse">
                🤔 考え中...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* 入力フォームフッター */}
        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!chatInput.trim() || !dbInstance || !chatMemberId || !chatSessionId || isGeneratingReply) return;
          const msgText = chatInput;
          setChatInput("");
          setIsGeneratingReply(true);
          try {
            // 1. ユーザーメッセージをDBに保存
            await dbInstance!.execute(
              'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
              [chatSessionId, 'user', msgText, new Date().toISOString()]
            );
            const msgs = await dbInstance!.select<{ id: number, session_id: number, sender: string, content: string, created_at: string }[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
            const formattedMsgs = msgs.map(m => ({
              id: m.id,
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
              created_at: m.created_at
            }));
            setChatMessages(formattedMsgs);

            // 2. プロバイダーのAPIキーとモデルを特定（llmProviderのresolveApiKeyを利用）
            const member = projectMembers.find(m => m.id === chatMemberId);
            const modelId = member?.ai_model || "gpt-4o";
            const { providerType, apiKey } = await resolveApiKey(modelId);

            if (!apiKey) {
              await dbInstance!.execute(
                'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
                [chatSessionId, 'member', 'APIキーが設定されていません。設定画面からAPIキーを登録してください。', new Date().toISOString()]
              );
              const finalMsgs = await dbInstance!.select<{ id: number, session_id: number, sender: string, content: string, created_at: string }[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
              const finalFormatted = finalMsgs.map(m => ({
                id: m.id,
                role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.content,
                created_at: m.created_at
              }));
              setChatMessages(finalFormatted);
              return;
            }

            // 3. システムプロンプトの組み立て
            const projectId = selectedProjectId;
            let sysPrompt = "";
            if (projectId) {
              try {
                sysPrompt = await getMergedSystemPrompt(dbInstance, {
                  userId: 1, // Phase1では1固定
                  projectId,
                  memberId: chatMemberId
                });
              } catch (e) {
                console.error("System prompt merge error:", e);
              }
            }

            // 4. APIコール（llmProviderに統一）
            const result = await callLLMWithHistory({
              modelId,
              systemPrompt: sysPrompt,
              messages: formattedMsgs.map(m => ({ role: m.role, content: m.content })),
              apiKey,
            });
            let replyContent = result.content;
            let pTokens = result.promptTokens;
            let cTokens = result.completionTokens;

            if (pTokens > 0 || cTokens > 0) {
              const cost = calculateCost(modelId, pTokens, cTokens);
              try {
                await dbInstance.execute(
                  'INSERT INTO api_usage_logs (member_id, session_id, meeting_id, provider, model_id, prompt_tokens, completion_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [chatMemberId, chatSessionId, null, providerType, modelId, pTokens, cTokens, cost, new Date().toISOString()]
                );
              } catch (logErr) {
                console.error("Failed to log API usage:", logErr);
              }
            }


            // 5. 返答の保存と画面への反映
            await dbInstance!.execute(
              'INSERT INTO chat_messages (session_id, sender, content, created_at) VALUES (?, ?, ?, ?)',
              [chatSessionId, 'member', replyContent, new Date().toISOString()]
            );

            const finalMsgs = await dbInstance!.select<{ id: number, session_id: number, sender: string, content: string, created_at: string }[]>('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC', [chatSessionId]);
            const finalFormatted = finalMsgs.map(m => ({
              id: m.id,
              role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
              content: m.content,
              created_at: m.created_at
            }));
            setChatMessages(finalFormatted);

          } catch (err) {
            console.error(err);
          } finally {
            setIsGeneratingReply(false);
          }
        }} className="flex gap-2 shrink-0">
          <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} className="input-wood flex-1" placeholder="メッセージを入力..." disabled={isGeneratingReply} />
          <button type="submit" className="btn-primary" disabled={!chatInput.trim() || isGeneratingReply}>📨 {isGeneratingReply ? "送信中..." : "送信"}</button>
        </form>
      </div>
    </div>
  );
}
