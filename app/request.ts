import OpenAI from 'openai';
import sharp from 'sharp';
import llmConfig from '@config/llm.json';
import { OB11Message, OB11MessageDataType } from '@napcat/onebot';
import { MOCK_HEADERS } from './constants';
import { recordUsage } from './usage';
import { logger } from './logger';
import { BotContext } from './types';
import { LRUCache } from 'lru-cache';
import { clearifyText } from './utils';

interface LLMResult {
  content?: string | null;
  think?: string | null;
}

const openai = new OpenAI({
  baseURL: llmConfig.baseURL,
  apiKey: llmConfig.apiKey,
});

const cache = new LRUCache<string, LLMResult>({
  max: 1000, // 缓存最大数量
  ttl: 1000 * 3600 * 24, // 缓存过期时间 24 小时
});

export const requestLLM = async (
  system: string,
  prompt: string
): Promise<LLMResult> => {
  const cacheKey = `${system}_${prompt}`;
  const cachedRes = cache.get(cacheKey);
  if (cachedRes) {
    logger.info('cache', 'lru cache hit for llm');
    return cachedRes;
  }
  const completion = await openai.chat.completions.create({
    model: llmConfig.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  });
  const message: any = completion.choices[0]?.message;
  await recordUsage(completion.usage);
  const res = {
    content: message?.content,
    think: message?.reasoning_content,
  };
  cache.set(cacheKey, res);
  return res;
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
            image_url: { url, detail: 'low' },
          },
        ],
      },
    ],
  });
  const message: any = completion.choices[0]?.message;
  await recordUsage(completion.usage, 'vision');
  return { content: message?.content };
};

/**
 * 图像识别，识别成功后会修改这条消息的 summary
 * @param data 消息体
 * @param ctx Bot 上下文
 * @param caller 调用者信息
 */
export const visionImage = async (
  data: OB11Message,
  ctx: BotContext,
  caller: string
) => {
  // 已经识别过的不再处理
  if (ctx.vision) {
    logger.info('request', `${caller} already visioned`);
    return;
  }

  const { message } = data;
  if (typeof message !== 'string') {
    for (const item of message) {
      // 表情不做识别
      if (
        item.type === OB11MessageDataType.image &&
        item.data.sub_type === 0 &&
        /^https?:\/\//i.test(item.data.url || '')
      ) {
        logger.info('request', `${caller} vision: ${item.data.url}`);
        try {
          const url = item.data.url!;
          // 下载图片转换为 base64
          const res = await fetch(url, {
            method: 'GET',
            headers: MOCK_HEADERS,
          }).catch((err) => {
            return JSON.stringify(err);
          });
          if (typeof res === 'string') {
            logger.info('request', `${caller} image expired: ${res}`);
            return;
          }
          // 复制一份 res 用 base64 检查缓存
          const base64Res = await res.clone().blob();
          const base64Buffer = await base64Res.arrayBuffer();
          const base64Image = Buffer.from(base64Buffer).toString('base64');
          const cacheKey = `${base64Image}`;
          const cachedRes = cache.get(cacheKey);
          if (cachedRes) {
            logger.info('cache', 'lru cache hit for vision');
            const { content } = cachedRes;
            const realContent = clearifyText(content, { allowLF: false });
            if (realContent) {
              item.data.summary = `[图片：${realContent}]`;
              ctx.vision = true;
              continue;
            }
          }
          // 压缩和处理图片
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          const image = sharp(buffer);
          const { width, height } = await image.metadata();
          // 如果有大于 1000px 的图片，按比例缩小
          if (width && height && (width > 1000 || height > 1000)) {
            const ratio = Math.min(1000 / width, 1000 / height);
            const newWidth = Math.floor(width * ratio);
            const newHeight = Math.floor(height * ratio);
            image.resize(newWidth, newHeight, { kernel: 'lanczos3' });
          }
          // 转换为 jpeg 用 base64 输出
          const jpegBuffer = await image.jpeg().toBuffer();
          const jpegImage = jpegBuffer.toString('base64');
          const base64Url = `data:image/jpeg;base64,${jpegImage}`;
          const { content } = await requestVision(base64Url);
          cache.set(cacheKey, { content });
          const realContent = clearifyText(content, { allowLF: false });
          if (realContent) {
            item.data.summary = `[图片：${realContent}]`;
            ctx.vision = true;
          }
        } catch (e) {
          logger.error('request', `${caller} vision error`, e);
        }
      }
    }
  }
};
