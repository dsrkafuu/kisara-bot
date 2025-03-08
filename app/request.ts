import OpenAI from 'openai';
import llmConfig from '@config/llm.json';
import { MOCK_HEADERS } from './constants';
import { recordUsage } from './usage';

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
  await recordUsage(completion.usage);
  return {
    content: message?.content,
    think: message?.reasoning_content,
  };
};

const requestVision = async (url: string): Promise<LLMResult> => {
  const completion = await openai.chat.completions.create({
    model: llmConfig.vision,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: '一句话总结图片内容，要求50字以内。' },
          {
            type: 'image_url',
            image_url: { url },
          },
        ],
      },
    ],
  });
  const message: any = completion.choices[0]?.message;
  await recordUsage(completion.usage, 'vision');
  return { content: message?.content };
};

/** 图像识别 */
export const requestVisionImage = async (url: string) => {
  // 下载图片转换为 base64
  const res = await fetch(url, {
    method: 'GET',
    headers: MOCK_HEADERS,
  });
  const blob = await res.blob();
  const buffer = await blob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  // 从返回的 content-type 中获取图片格式
  const contentType = res.headers.get('Content-Type');
  const base64Url = `data:${contentType};base64,${base64}`;
  const { content } = await requestVision(base64Url);
  const realContent = content?.replaceAll('\n', ' ')?.trim() || '';
  return realContent || null;
};
