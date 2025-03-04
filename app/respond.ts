import { nanoid } from 'nanoid';
import {
  OB11Message,
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageRecord,
  OB11MessageText,
} from '@napcat/onebot';
import appConfig from '@config/app.json';
import { BotContext, RespondEcho, RespondOptions } from './types';
import logger from './logger';

export const getText = (text: string): OB11MessageText => {
  return {
    type: OB11MessageDataType.text,
    data: { text },
  };
};

export const getRecord = (filePath: string): OB11MessageRecord => {
  return {
    type: OB11MessageDataType.voice,
    data: { file: `file://${filePath}` },
  };
};

export const echoCenter = new Map<string, RespondEcho>();

export const sendMessage = async (
  data: OB11Message,
  ctx: BotContext,
  message: OB11MessageData[],
  options?: RespondOptions
) => {
  const echo = nanoid();
  const timestamp = Date.now();
  const messageType = data.message_type || 'private';
  const userId = data.user_id;
  const groupId = data.group_id;

  // 注册回调
  const duplicateEcho = echoCenter.get(echo);
  if (duplicateEcho && duplicateEcho.reject) {
    duplicateEcho.reject('echo id duplicate error');
    echoCenter.delete(echo);
  }
  const respondEcho: RespondEcho = {
    timestamp,
  };
  respondEcho.promise = new Promise((resolve, reject) => {
    respondEcho.resolve = resolve;
    respondEcho.reject = reject;
  });
  echoCenter.set(echo, respondEcho);

  // 清理 1 分钟的超时回调
  let cleanCount = 0;
  for (const key of echoCenter.keys()) {
    const value = echoCenter.get(key)!;
    if (timestamp - value.timestamp > 60 * 1000) {
      if (value.reject) value.reject('echo timeout');
      echoCenter.delete(key);
      cleanCount++;
    }
  }
  if (cleanCount > 0) {
    logger.info('respond', `cleaned ${cleanCount} respond echo`);
  }

  // 发送消息
  if (messageType === 'group') {
    const jsonData = JSON.stringify({
      echo,
      action: 'send_group_msg',
      params: { group_id: `${groupId}`, message },
    });
    if (appConfig.respond) {
      ctx.ws.send(jsonData);
    } else {
      logger.debug('respond', 'mock group message', jsonData);
    }
    logger.info('respond', 'send group message', groupId, echo);
  } else if (messageType === 'private') {
    const jsonData = JSON.stringify({
      echo,
      action: 'send_private_msg',
      params: { user_id: `${userId}`, message },
    });
    if (appConfig.respond) {
      ctx.ws.send(jsonData);
    } else {
      logger.debug('respond', 'mock private message', jsonData);
    }
    logger.info('respond', 'send private message', userId, echo);
  }

  // 等待回调
  if (!appConfig.respond) {
    return;
  }
  const res = await respondEcho.promise;
  if (res && res.status === 'failed') {
    logger.warn('respond', 'send message failed', res.message);
  }
};
