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

const requestVision = async (
  url: string | string[],
  simple = true
): Promise<LLMResult> => {
  let prompt = '描述这张图片的内容，要求100字以内。';
  if (Array.isArray(url)) {
    prompt = '描述这张动态图片的内容，要求100字以内。';
  }
  if (simple) {
    prompt = '一句话总结这张图片，要求50字以内。';
    if (Array.isArray(url)) {
      prompt = '一句话总结这张动态图片，要求50字以内。';
    }
  }
  const frameContents: any[] = [];
  if (Array.isArray(url)) {
    for (const u of url) {
      frameContents.push({
        type: 'image_url',
        image_url: { url: u, detail: simple ? 'low' : 'high' },
      });
    }
  } else {
    frameContents.push({
      type: 'image_url',
      image_url: { url, detail: simple ? 'low' : 'high' },
    });
  }
  const completion = await openai.chat.completions.create({
    model: llmConfig.vision,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...frameContents],
      },
    ],
  });
  const message: any = completion.choices[0]?.message;
  await recordUsage(completion.usage, 'vision');
  return { content: message?.content };
};

/**
 * 图像识别，识别成功后会修改这条消息的 summary，返回识别结果
 * @param data 消息体
 * @param ctx Bot 上下文
 * @param caller 调用者信息
 * @param simple 默认开启概括模式，用于聊天记录分析
 */
export const visionImage = async (
  data: OB11Message,
  ctx: BotContext,
  caller: string,
  simple = true
) => {
  // 概括模式，已经识别过的不再处理
  if (simple && ctx.vision) {
    logger.info('request', `${caller} already visioned`);
    return [];
  }

  const retTexts: string[] = [];
  const { message } = data;
  if (typeof message !== 'string') {
    for (const item of message) {
      let needVision =
        item.type === OB11MessageDataType.image &&
        /^https?:\/\//i.test(item.data.url || '');
      // 概括模式，表情不做识别
      if (simple) {
        needVision = needVision && item.data.sub_type === 0;
      }
      if (needVision) {
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
            return [];
          }
          // 复制一份 res 用 base64 检查缓存
          const base64Res = await res.clone().blob();
          const base64Buffer = await base64Res.arrayBuffer();
          const base64Image = Buffer.from(base64Buffer).toString('base64');
          const cacheKey = `${simple ? 'simple' : 'complex'}_${base64Image}`;
          const cachedRes = cache.get(cacheKey);
          if (cachedRes) {
            logger.info(
              'cache',
              `${simple ? 'simple' : 'complex'} lru cache hit`
            );
            const { content } = cachedRes;
            const realContent = clearifyText(content, { allowLF: false });
            if (realContent) {
              retTexts.push(realContent);
              item.data.summary = `[图片：${realContent}]`;
              ctx.vision = true;
              continue;
            }
          }
          // 压缩和处理图片
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          const image = sharp(buffer);
          const { width, height, format, pages = 1 } = await image.metadata();
          // 概括模式，如果有大于 1000px 的图片，按比例缩小
          if (simple && width && height && (width > 1000 || height > 1000)) {
            const ratio = Math.min(1000 / width, 1000 / height);
            const newWidth = Math.floor(width * ratio);
            const newHeight = Math.floor(height * ratio);
            image.resize(newWidth, newHeight, { kernel: 'lanczos3' });
          }
          // 如果不是 gif，转换为 jpeg 用 base64 输出
          let content: string = '';
          if (format !== 'gif') {
            const jpegBuffer = await image.jpeg().toBuffer();
            const jpegImage = jpegBuffer.toString('base64');
            const base64Url = `data:image/jpeg;base64,${jpegImage}`;
            const res = await requestVision(base64Url, simple);
            content = res.content || '';
          }
          // gif 的话，平均抽出 5 帧
          else {
            const numFramesToExtract = 5;
            let frameIndices: number[] = [];
            // 生成均匀分布的帧索引
            if (pages <= numFramesToExtract) {
              // 如果总帧数不足5帧，则全部抽取
              frameIndices = Array.from({ length: pages }, (_, i) => i);
            } else {
              // 计算均匀分布的索引（例如总帧10→索引0,2,4,6,9）
              frameIndices = Array.from(
                { length: numFramesToExtract },
                (_, i) => {
                  return Math.floor(
                    (i * (pages - 1)) / (numFramesToExtract - 1)
                  );
                }
              );
            }
            // 并行处理所有帧的转换
            const base64Promises = frameIndices.map((index) =>
              sharp(buffer, { page: index })
                .jpeg()
                .toBuffer()
                .then((buffer) => buffer.toString('base64'))
            );
            const base64Frames = await Promise.all(base64Promises);
            const imageFrames = base64Frames.map(
              (base64Frame) => `data:image/jpeg;base64,${base64Frame}`
            );
            const res = await requestVision(imageFrames, simple);
            content = res.content || '';
          }
          cache.set(cacheKey, { content });
          const realContent = clearifyText(content, { allowLF: false });
          if (realContent) {
            retTexts.push(realContent);
            item.data.summary = `[图片：${realContent}]`;
            ctx.vision = true;
          }
        } catch (e) {
          logger.error('request', `${caller} vision error`, e);
        }
      }
    }
  }

  return retTexts;
};
