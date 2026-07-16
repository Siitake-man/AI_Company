export const parseApiError = (errorObj: any): string => {
  const errorStr = typeof errorObj === 'string' ? errorObj : JSON.stringify(errorObj);
  const lowerError = errorStr.toLowerCase();

  if (lowerError.includes("insufficient_quota") || lowerError.includes("quota")) {
    return "APIの利用制限（残高不足、またはカード有効期限切れ）に達しています。OpenAI等の開発者プラットフォームの支払い設定をご確認ください。";
  }
  if (lowerError.includes("invalid_api_key") || lowerError.includes("invalid_key") || lowerError.includes("api key not valid")) {
    return "APIキーが無効です。設定画面から正しいAPIキーを入力し直してください。";
  }
  if (lowerError.includes("rate_limit_exceeded") || lowerError.includes("too many requests")) {
    return "リクエストの制限速度を超えました。しばらく時間をおいてから送信してください。";
  }

  let detailMsg = "";
  if (errorObj?.error?.message) {
    detailMsg = errorObj.error.message;
  } else {
    detailMsg = errorStr;
  }
  return `APIリクエストに失敗しました。（詳細: ${detailMsg}）`;
};

export const calculateCost = (modelId: string, promptTokens: number, completionTokens: number): number => {
  let promptCostPerM = 0;
  let completionCostPerM = 0;

  if (modelId.includes("gpt-4o-mini")) { promptCostPerM = 0.150; completionCostPerM = 0.600; }
  else if (modelId.includes("gpt-4o") || modelId.includes("gpt")) { promptCostPerM = 2.50; completionCostPerM = 10.00; }
  else if (modelId.includes("claude-3-5-haiku")) { promptCostPerM = 0.80; completionCostPerM = 4.00; }
  else if (modelId.includes("claude-3-5-sonnet") || modelId.includes("claude")) { promptCostPerM = 3.00; completionCostPerM = 15.00; }
  else if (modelId.includes("gemini-1.5-flash") || modelId.includes("gemini-2.5-flash")) { promptCostPerM = 0.075; completionCostPerM = 0.30; }
  else if (modelId.includes("gemini-1.5-pro") || modelId.includes("gemini-2.5-pro")) { promptCostPerM = 1.25; completionCostPerM = 5.00; }
  else { promptCostPerM = 0.075; completionCostPerM = 0.30; } // default gemini flash rates

  const promptCost = (promptTokens / 1000000) * promptCostPerM;
  const completionCost = (completionTokens / 1000000) * completionCostPerM;

  return promptCost + completionCost;
};
