import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { DB_DIR } from '@app/constants';
import { logger } from '@app/logger';
import { requestLLM, visionImage } from '@app/request';
import { getText } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';
import llmConfig from '@config/llm.json';
import { OB11Message } from '@napcat/onebot';

/** 已回复的消息列表，格式：{user_id}_{message_id} */
let respondedSet = new Set<string>();
let respondedInited = false;

/** 从文件获取未回复的消息 ID 列表 */
const getResponded = (): Set<string> => {
  if (respondedInited) {
    return respondedSet;
  }
  respondedInited = true;
  const filePath = path.resolve(DB_DIR, 'llm_responded.json');
  if (fse.existsSync(filePath)) {
    try {
      respondedSet = new Set<string>(fse.readJSONSync(filePath) || []);
    } catch (e: any) {
      logger.error('llm', 'init responded error:', e);
    }
  }
  return respondedSet;
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
    const filePath = path.resolve(DB_DIR, 'llm_responded.json');
    fse.writeJSONSync(filePath, Array.from(messageSet));
  } catch (e: any) {
    logger.error('llm', 'append responded error', e);
  }
};

/** 获取文本形式的消息记录 */
const getMessageLog = (dbLineObj: OB11Message, botQQId?: number) => {
  const simpleText = getSimpleText(dbLineObj, {
    allowAt: true,
    allowImage: true,
  });
  if (simpleText) {
    const timeStr = dayjs(dbLineObj.time * 1000).format('M月D日H时m分');
    let senderStr = dbLineObj.sender.nickname;
    if (`${dbLineObj.sender.user_id}` === `${botQQId}`) {
      senderStr = '你';
    }
    const messageLog = `[${timeStr}]“${senderStr}”说：“${simpleText.replaceAll(`@${botQQId}`, '@你')}”`;
    return {
      messageLog,
      messageId: `${dbLineObj.user_id}_${dbLineObj.message_id}`,
    };
  }
};

/** LLM 网友中间件 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const { message_type, user_id, group_id, time } = data;
  const botQQId = data.self_id;
  const isAtBot = ctx.parsed.at_bot;
  const dayTime = dayjs(time * 1000);

  // 触发概率
  const randTrigger = Math.random() < llmConfig.triggerProb;

  // 当前这句话，先看需不需要多模态读图
  // 默认的识图这个过程在后续 db 插件里，比这里晚
  // 需要的话在这里提前读好，并且告诉 db 不用再读了
  await visionImage(data, ctx, 'llm');
  const thisMessageEntry = getMessageLog(data, botQQId);

  // 命中概率加当前这句话有内容，或直接 at 机器人
  if ((randTrigger && thisMessageEntry) || isAtBot) {
    // 检查 db
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const logName = `${message_type}_${logId}_${dayTime.format('YYYYMMDD')}.log`;
    const filePath = path.resolve(DB_DIR, logName);
    let dbFile: string = '';
    try {
      if (fse.existsSync(filePath)) {
        dbFile = fse.readFileSync(filePath, 'utf-8');
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
            const messageEntry = getMessageLog(dbLineObj, botQQId);
            if (messageEntry) {
              recordLines.push(messageEntry);
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

        // 至少有 5 条未回复的消息记录，除非是直接 at 机器人
        if (notRespondedLines.length > llmConfig.minUnresponded || isAtBot) {
          // 已经回复过的消息记录
          let userPrompt = `这是之前的群聊消息记录：${alreadyRespondedLines.join('。')}。`;
          // 未回复的消息记录
          if (notRespondedLines.length > 0) {
            userPrompt += `这是你未回复的消息记录：${notRespondedLines.map((line) => line.messageLog).join('。')}。`;
            // 如果是自动触发，在未回复里面加上当前这条
            if (!isAtBot && thisMessageEntry) {
              userPrompt += `${thisMessageEntry.messageLog}。`;
            }
          }
          // 如果是 at 机器人，前面的未回复的消息记录也就没有当前这条，让他重点回复当前这条
          if (isAtBot && thisMessageEntry) {
            userPrompt += `这是这次群友指定要你回复的记录：${thisMessageEntry.messageLog}。`;
          }
          userPrompt += `消息记录格式为“群友昵称/你”说：“”，记录中图片内容格式为[图片：内容解释]。`;
          userPrompt += `你要作为${Name}对未回复的群聊消息记录做出符合${Name}角色设定的回复。`;
          userPrompt += `确保回复充分体现${Name}的性格特征和情感反应。`;
          userPrompt += `不要称呼群友昵称，使用你或你们代指群友。`;
          userPrompt += `只提供${Name}的回复内容，回复不需要解释思路、不需要消息记录格式。`;

          // 记录已回复，记得加上当前这条
          const toRecord = notRespondedLines.map((line) => line.messageId);
          if (thisMessageEntry) {
            toRecord.push(thisMessageEntry.messageId);
          }
          appendResponded(respondedMessages, toRecord);

          // 请求 LLM
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
              .map((line) => {
                const trimmedLine = line.trim();
                if (/^["“”].+["“”]$/i.test(trimmedLine)) {
                  return trimmedLine.slice(1, -1);
                }
                return trimmedLine;
              })
              .filter((line) => !!line);
            logger.info(
              'llm',
              `respond think:\n${think?.replaceAll('\n', ' ')?.trim() || ''}\nrespond content:\n${resArr.join('\n')}`
            );

            // 如果超过两句，只取最后两句
            if (resArr.length > llmConfig.maxSentences) {
              resArr = resArr.slice(resArr.length - 2);
            }
            // 发送回复
            await ctx.send([getText(resArr[0])]);
            if (resArr[1]) {
              // 一个字等待 500 毫秒
              const p1Wait = resArr[1].length * llmConfig.waitEveryWord;
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
