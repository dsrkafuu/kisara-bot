import { nanoid, customAlphabet } from 'nanoid';
import appConfig from '@config/app.json';
import {
  OB11Message,
  OB11MessageData,
  OB11MessageDataType,
  OB11MessageRecord,
  OB11MessageReply,
  OB11MessageText,
} from '@napcat/onebot';
import { logger } from './logger';
import { BotContext, RespondEcho, RespondOptions } from './types';
import { getSimpleText } from './utils';

const nanoidNum = customAlphabet('0123456789', 10);
const loginInfo = { user_id: 0, nickname: '' };

export const echoCenter = new Map<string, RespondEcho>();

/** 获取一个用于监听回调的 echo */
export const registerEcho = () => {
  const echo = nanoid();
  const timestamp = Date.now();

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

  return { timestamp, echo, respond: respondEcho };
};

/** 获取一条文本消息 */
export const getText = (text: string): OB11MessageText => {
  return {
    type: OB11MessageDataType.text,
    data: { text },
  };
};

/** 获取一条语音消息 */
export const getRecord = (filePath: string): OB11MessageRecord => {
  return {
    type: OB11MessageDataType.voice,
    data: { file: `file://${filePath}` },
  };
};

/** 获取一条回复消息 */
export const getReply = (messageId: number | string): OB11MessageReply => {
  return {
    type: OB11MessageDataType.reply,
    data: { id: `${messageId}` },
  };
};

/** 发送 QQ 消息 */
export const sendMessage = async (
  data: OB11Message,
  ctx: BotContext,
  message: OB11MessageData[],
  options: RespondOptions = {}
) => {
  const { quoteSender } = options;

  const { timestamp, echo, respond } = registerEcho();
  const messageType = data.message_type || 'private';
  const userId = data.user_id;
  const groupId = data.group_id;
  const messageId = data.message_id;

  // 发送消息
  if (messageType === 'group') {
    const jsonData = JSON.stringify({
      echo,
      action: 'send_group_msg',
      params: {
        group_id: `${groupId}`,
        message: [...(quoteSender ? [getReply(messageId)] : []), ...message],
      },
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
  const res = await respond.promise;
  if (res && res.status === 'failed') {
    logger.warn('respond', 'send message failed', res.message);
  }

  // 记录自己发送的消息
  if (res) {
    const messageId = res.data.message_id || +nanoidNum();
    const dbEntry: OB11Message = {
      time: Math.floor(timestamp / 1000),
      message_id: messageId,
      message_seq: messageId,
      real_id: messageId,
      message_type: messageType,
      self_id: loginInfo.user_id,
      user_id: loginInfo.user_id,
      sender: loginInfo,
      raw_message: getSimpleText({ message }),
      font: 14,
      message_format: 'array',
      message,
      sub_type: 'normal',
      post_type: 'message',
    };
    if (messageType === 'group') {
      dbEntry.group_id = groupId;
    }

    // 通知后面写 db
    ctx.db.records.push(dbEntry);
  }
};

/**
 * 获取 Bot QQ 信息
 * @param ctx Bot 上下文
 */
export const getLoginInfo = async (ctx: BotContext) => {
  if (loginInfo.user_id) {
    return loginInfo;
  }

  const { echo, respond } = registerEcho();

  // 发送消息
  const jsonData = JSON.stringify({
    echo,
    action: 'get_login_info',
    params: {},
  });
  ctx.ws.send(jsonData);

  // 等待回调
  const res = await respond.promise;
  if (res && res.status === 'failed') {
    logger.warn('respond', 'get login info failed', res.message);
  }
  if (res && res.data?.user_id) {
    logger.info('respond', 'login info inited:', JSON.stringify(res.data));
    loginInfo.user_id = res.data.user_id || 0;
    loginInfo.nickname = res.data.nickname || '';
  }
  return loginInfo;
};
