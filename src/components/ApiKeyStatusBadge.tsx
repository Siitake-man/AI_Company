import React from "react";
import { PROVIDERS, ProviderType } from "../lib/apiKeyStore";

interface ApiKeyStatusBadgeProps {
  apiKeysStatus: Record<ProviderType, boolean>;
  onNavigateToSettings?: () => void;
}

export const ApiKeyStatusBadge: React.FC<ApiKeyStatusBadgeProps> = ({
  apiKeysStatus,
  onNavigateToSettings,
}) => {
  const providerBadges = [
    { key: PROVIDERS.OPENAI, label: "OpenAI", active: apiKeysStatus[PROVIDERS.OPENAI] },
    { key: PROVIDERS.ANTHROPIC, label: "Claude", active: apiKeysStatus[PROVIDERS.ANTHROPIC] },
    { key: PROVIDERS.GEMINI, label: "Gemini", active: apiKeysStatus[PROVIDERS.GEMINI] },
  ];

  return (
    <div
      onClick={onNavigateToSettings}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-all duration-200 cursor-pointer border shadow-sm select-none"
      style={{
        backgroundColor: "var(--color-paper, #fbf8f3)",
        borderColor: "var(--color-border, #e5decf)",
        color: "var(--color-ink, #2b2621)",
        fontFamily: "'M PLUS Rounded 1c', sans-serif",
      }}
      title="クリックしてAPIキー設定を開く"
    >
      <span className="font-semibold opacity-75">🔑 API:</span>
      <div className="flex items-center gap-1">
        {providerBadges.map((badge) => (
          <span
            key={badge.key}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
              badge.active
                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                : "bg-amber-50 text-amber-600/70 border border-amber-200 line-through opacity-60"
            }`}
          >
            {badge.label}
          </span>
        ))}
      </div>
    </div>
  );
};
