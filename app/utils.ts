import {
  OB11Message,
  OB11MessageData,
  OB11MessageDataType,
} from '@napcat/onebot';
import logger from './logger';

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
 */
export const getSimpleText = (
  data: Partial<OB11Message>,
  options?: { at?: boolean }
) => {
  const textMessages: OB11MessageData[] = [];
  if (typeof data.message === 'string') {
    textMessages.push({
      type: OB11MessageDataType.text,
      data: { text: data.message },
    });
  } else if (data.message) {
    if (options?.at) {
      textMessages.push(
        ...data.message.filter(
          (message) => message.type === 'text' || message.type === 'at'
        )
      );
    } else {
      textMessages.push(
        ...data.message.filter((message) => message.type === 'text')
      );
    }
  }

  const fullSimpleText = textMessages
    .map((message) => {
      let ret = '';
      if (message.type === 'text') {
        ret = message.data.text || '';
      } else if (message.type === 'at') {
        ret = `@${message.data.qq}`;
      } else {
        ret = '';
      }
      return ret.replaceAll('\n', ' ').trim();
    })
    .filter((text) => !!text)
    .join(' ');
  return fullSimpleText;
};

export const clearifyText = (text?: string | null) => {
  return text?.replace(/\n+/g, '\n').trim() || '';
};
