import OpenAI from 'openai';
import llmConfig from '@config/llm.json';

const openai = new OpenAI({
  baseURL: llmConfig.baseURL,
  apiKey: llmConfig.apiKey,
});

interface LLMResult {
  content?: string | null;
  think?: string | null;
}

export const requestLLM = async (
  system: string,
  prompt: string
): Promise<LLMResult> => {
  const completion = await openai.chat.completions.create({
    model: llmConfig.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  const message: any = completion.choices[0]?.message;
  return {
    content: message?.content,
    think: message?.reasoning_content,
  };
};
