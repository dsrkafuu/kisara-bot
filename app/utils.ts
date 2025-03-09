import {
  OB11Message,
  OB11MessageData,
  OB11MessageDataType,
} from '@napcat/onebot';
import { logger } from './logger';

const rateLimit = new Map<string, number>();

/**
 * 创建消息速率限制器
 * @param key 限制 key，例如 group_0000000
 * @param limit 限制时间，单位秒
 */
export const getRateLimiter = (key: string, limit: number) => {
  if (!rateLimit.has(key)) {
    rateLimit.set(key, 0);
  }
  return {
    check: () => {
      const now = Date.now();
      const lastTime = rateLimit.get(key);
      if (lastTime && now - lastTime < limit * 1000) {
        const remaining = limit * 1000 - (now - lastTime);
        logger.info('utils', 'rate limit hit:', key, `${remaining}ms`);
        return false;
      }
      logger.info('utils', 'rate limit pass:', key);
      rateLimit.set(key, now);
      return true;
    },
  };
};

/**
 * 获取合并后的所有纯文本消息
 * @param data 消息数据
 * @param options 允许的额外消息类型
 */
export const getSimpleText = (
  data: Partial<OB11Message>,
  options: { allowAt?: boolean; allowImage?: boolean } = {}
) => {
  const allowedTypes = [OB11MessageDataType.text];
  if (options.allowAt) {
    allowedTypes.push(OB11MessageDataType.at);
  }
  if (options.allowImage) {
    allowedTypes.push(OB11MessageDataType.image);
  }

  const textMessages: OB11MessageData[] = [];
  if (typeof data.message === 'string') {
    textMessages.push({
      type: OB11MessageDataType.text,
      data: { text: data.message },
    });
  } else if (data.message) {
    textMessages.push(
      ...data.message.filter((message) => {
        return allowedTypes.includes(message.type);
      })
    );
  }

  const fullSimpleText = textMessages
    .map((message) => {
      let ret = '';
      if (message.type === OB11MessageDataType.text) {
        ret = message.data.text || '';
      } else if (message.type === OB11MessageDataType.at) {
        ret = `@${message.data.qq}`;
      } else if (
        message.type === OB11MessageDataType.image &&
        message.data.sub_type === 0
      ) {
        ret = message.data.summary || '';
      } else {
        ret = '';
      }
      return ret.replaceAll('\n', ' ').trim();
    })
    .filter((text) => !!text)
    .join(' ');
  return fullSimpleText;
};

/**
 * 清理消息文本为可输出格式
 * @param text 消息文本
 */
export const clearifyText = (
  text?: string | null,
  options = {
    allowLF: true,
  }
) => {
  if (options.allowLF) {
    return text?.replace(/\n+/g, '\n').trim() || '';
  } else {
    return text?.replace(/\n+/g, ' ').trim() || '';
  }
};
