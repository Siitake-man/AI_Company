import { PromptTemplate } from "@langchain/core/prompts";

export const speakerPromptTemplate = new PromptTemplate({
  template: "You are {role}. Please speak about {topic}.",
  inputVariables: ["role", "topic"],
});
