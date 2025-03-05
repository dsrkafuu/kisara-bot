import path from 'path';
import fse from 'fs-extra';
import dayjs from 'dayjs';
import { OB11Message } from '@napcat/onebot';
import llmConfig from '@config/llm.json';
import logger from '@app/logger';
import { requestLLM } from '@app/request';
import { getText } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';
import { DB_DIR } from '@app/constants';

/** 获取未回复的消息 ID 列表 */
const getResponded = (): Set<string> => {
  const filePath = path.resolve(DB_DIR, 'llm-responded.json');
  if (!fse.existsSync(filePath)) {
    return new Set<string>();
  }
  try {
    return new Set<string>(fse.readJSONSync(filePath) || []);
  } catch (e: any) {
    logger.error('llm', 'get responded error', e);
    return new Set<string>();
  }
};

/** 添加已回复的消息 */
const appendResponded = (messageSet: Set<string>, messageIds: string[]) => {
  messageIds.forEach((messageId) => {
    messageSet.add(messageId);
  });
  // 清空前 500 条已回复的消息记录
  if (messageSet.size >= 1000) {
    let deleteCount = 0;
    for (const messageId of messageSet) {
      messageSet.delete(messageId);
      deleteCount++;
      if (deleteCount >= 500) break;
    }
  }
  try {
    const filePath = path.resolve(DB_DIR, 'llm-responded.json');
    fse.writeJSONSync(filePath, Array.from(messageSet));
  } catch (e: any) {
    logger.error('llm', 'append responded error', e);
  }
};

/**
 * LLM 网友中间件
 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const { message_type, user_id, group_id, time } = data;
  const dayTime = dayjs(time * 1000);

  const randTrigger = Math.random() < llmConfig.triggerProb;
  const botQQId = data.self_id;
  let isAtBot = false;
  if (typeof data.message !== 'string' && botQQId) {
    isAtBot =
      message_type === 'group' &&
      data.message.some((item) => {
        return item.type === 'at' && `${item.data.qq}` === `${botQQId}`;
      });
  }

  if (randTrigger || isAtBot) {
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const logName = `${message_type}_${logId}_${dayTime.format('YYYYMMDD')}.log`;
    const filePath = path.resolve(DB_DIR, logName);
    let dbFile: string = '';
    try {
      if (fse.existsSync(filePath)) {
        dbFile = await fse.readFile(filePath, 'utf-8');
      }
    } catch (e) {
      logger.error('llm', 'read db file error', e);
    }

    // 从 db 重复拉取今天的最新记录
    if (dbFile) {
      const recordLines: Array<{ messageLog: string; messageId: string }> = [];
      const dbLines = dbFile.split('\n');
      // 记录里还没有当前这条消息，加上当前这条消息
      try {
        dbLines.concat([JSON.stringify(data)]);
      } catch (e) {
        logger.error('llm', 'concat db line error', e);
      }

      for (let i = dbLines.length - 1; i >= 0; i--) {
        const dbLine = dbLines[i];
        if (dbLine.trim().length > 0) {
          let dbLineObj: OB11Message & { swap?: Record<string, any> };
          try {
            dbLineObj = JSON.parse(dbLine);
          } catch (e) {
            logger.error('llm', 'parse db line error', e);
            continue;
          }

          // 排除掉被其他插件处理过的消息
          const swap = dbLineObj.swap || {};
          if (Object.keys(swap).length > 0 && !swap.llm) {
            continue;
          }

          // 构造聊天记录内容
          if (dbLineObj) {
            const simpleText = getSimpleText(dbLineObj, { at: true });
            if (simpleText) {
              const timeStr = dayjs(dbLineObj.time * 1000).format(
                'M月D日H时m分'
              );
              let senderStr = dbLineObj.sender.nickname;
              if (`${dbLineObj.sender.user_id}` === `${botQQId}`) {
                senderStr = '你';
              }
              const messageLog = `[${timeStr}]“${senderStr}”说：“${simpleText.replaceAll(`@${botQQId}`, '@你')}”`;
              recordLines.push({
                messageLog,
                messageId: `${dbLineObj.user_id}_${dbLineObj.message_id}`,
              });
            }
          }
        }

        // 记录最多 20 条
        if (recordLines.length >= 20) {
          break;
        }
      }

      // 记录至少 5 条
      // 单人 QQ 号限流 10 秒，群组群号限流 120 秒，at 机器人限制 10 秒
      let limitTime = 10;
      let limitKey = `llm_auto_private_${user_id}`;
      if (message_type === 'group') {
        limitKey = `llm_auto_group_${group_id}`;
        limitTime = 120;
      }
      if (isAtBot) {
        limitKey = `llm_at_group_${group_id}`;
        limitTime = 10;
      }
      const rateLimiter = getRateLimiter(limitKey, limitTime);

      if (rateLimiter.check()) {
        // 请求 LLM
        const systemLines = [];
        const { Name, Language, Profile, Skills, Background, Rules } =
          llmConfig.role;
        if (Profile) {
          systemLines.push(
            `('Profile', ['你是${Name}', ${Profile.map((item) => `'${item}'`).join(', ')}])`
          );
        }
        if (Skills) {
          systemLines.push(
            `('Skills', [${Skills.map((item) => `'${item}'`).join(', ')}])`
          );
        }
        if (Background) {
          systemLines.push(
            `('Background', [${Background.map((item) => `'${item}'`).join(', ')}])`
          );
        }
        if (Rules) {
          systemLines.push(
            `('Rules', [${Rules.map((item) => `'你必须遵守${item}'`).join(', ')}, '你必须用${Language}与我交谈'])`
          );
        }

        // 过滤已回复的消息记录
        const notRespondedLines: Array<{
          messageLog: string;
          messageId: string;
        }> = [];
        const alreadyRespondedLines: string[] = [];
        const respondedMessages = getResponded();
        for (let i = recordLines.length - 1; i >= 0; i--) {
          const recordLine = recordLines[i];
          if (respondedMessages.has(recordLine.messageId)) {
            alreadyRespondedLines.push(recordLine.messageLog);
          } else {
            notRespondedLines.push(recordLine);
          }
        }

        if (notRespondedLines.length > 5) {
          let userPrompt = `这是之前的群聊消息记录：${alreadyRespondedLines.join('。')}。`;
          if (notRespondedLines.length > 0) {
            userPrompt += `这是你未回复的消息记录：${notRespondedLines.map((line) => line.messageLog).join('。')}。`;
          }
          userPrompt += `消息记录格式为“群友昵称/你”说：“”。`;
          userPrompt += `你要作为${Name}对未回复的群聊消息记录做出符合${Name}角色设定的回复。`;
          userPrompt += `确保回复充分体现${Name}的性格特征和情感反应。`;
          userPrompt += `不要称呼群友昵称，使用你或你们代指群友。`;
          userPrompt += `只提供${Name}的回复内容，回复不需要解释思路、不需要消息记录格式。`;

          // 记录已回复
          appendResponded(
            respondedMessages,
            notRespondedLines.map((line) => line.messageId)
          );
          logger.info(
            'llm',
            `request system prompt:\n${systemLines.join('')}\nrequest user prompt:\n${userPrompt}`
          );
          const { content, think } = await requestLLM(
            systemLines.join(''),
            userPrompt
          );
          if (content) {
            let resArr = content
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => !!line);
            logger.info(
              'llm',
              `respond think:\n${think?.trim() || ''}\nrespond content:\n${resArr.join('\n')}`
            );

            // 如果超过两句，则每 X 句合并成两句
            const resLength = resArr.length;
            if (resLength > 2) {
              const xToOne = Math.ceil(resLength / 2);
              const newResArr: string[] = [];
              let lineIndex = 0;
              while (lineIndex < resLength) {
                newResArr.push(
                  resArr.slice(lineIndex, lineIndex + xToOne).join(' ')
                );
                lineIndex += xToOne;
              }
              resArr = newResArr;
            }

            // 发送回复
            await ctx.send([getText(resArr[0])]);
            if (resArr[1]) {
              // 一个字等待 500 毫秒
              const p1Wait = resArr[1].length * 500;
              await new Promise((resolve) => setTimeout(resolve, p1Wait));
              await ctx.send([getText(resArr[1])]);
            }
          }
        }

        // 未回复记录小于五条
        else {
          logger.info('llm', 'not enough unread:', notRespondedLines.length);
        }
      }

      // 不需要其他插件了
      ctx.swap.llm = true;
      return;
    }
  }

  await next();
};

export default middleware;
