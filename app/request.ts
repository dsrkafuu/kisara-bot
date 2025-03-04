import OpenAI from 'openai';
import llmConfig from '@config/llm.json';

const openai = new OpenAI({
  baseURL: llmConfig.baseURL,
  apiKey: llmConfig.apiKey,
});

export const requestLLM = async (system: string, prompt: string) => {
  const completion = await openai.chat.completions.create({
    model: llmConfig.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  return completion.choices[0]?.message?.content;
};
