import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { OB11Message } from '@napcat/onebot';
import llmConfig from '@config/llm.json';
import appConfig from '@config/app.json';
import { OnionMiddleware } from '@app/types';
import logger from '@app/logger';
import { getRateLimiter, getSimpleText } from '@app/utils';
import { requestLLM } from '@app/request';
import { getText } from '@app/respond';

const DB_DIR = path.resolve(process.cwd(), appConfig.db.dbDir);
fse.ensureDirSync(DB_DIR);

const respondedMessages = new Set<string>();

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
          if (Object.keys(swap).length > 0) {
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
      if (recordLines.length >= 5) {
        // 单人 QQ 号限流 10 秒，群组群号限流 120 秒，at 机器人限制 10 秒
        let limitTime = 10;
        let limitKey = `llm_auto_${user_id}`;
        if (message_type === 'group') {
          limitKey = `llm_auto_${group_id}`;
          limitTime = 120;
        }
        if (isAtBot) {
          limitKey = `llm_at_${group_id}`;
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
          for (let i = recordLines.length - 1; i >= 0; i--) {
            const recordLine = recordLines[i];
            if (respondedMessages.has(recordLine.messageId)) {
              alreadyRespondedLines.push(recordLine.messageLog);
            } else {
              notRespondedLines.push(recordLine);
            }
          }
          let userPrompt = `这是之前的群聊消息记录：${alreadyRespondedLines.join('。')}。`;
          if (notRespondedLines.length > 0) {
            userPrompt += `这是你未回复的消息记录：${notRespondedLines.map((line) => line.messageLog).join('。')}。`;
          }
          userPrompt += `消息记录格式为“群友昵称/你”说：“”。`;
          userPrompt += `你要作为${Name}对未回复的群聊消息记录做出符合${Name}角色设定的回复。`;
          userPrompt += `确保回复充分体现${Name}的性格特征和情感反应。`;
          userPrompt += `不要称呼群友昵称，使用你或你们代指群友。`;
          userPrompt += `只提供${Name}的回复内容，回复不需要解释思路、不需要消息记录格式。`;
          notRespondedLines.forEach((line) => {
            respondedMessages.add(line.messageId);
          });
          // 清空 500 条已回复的消息记录
          if (respondedMessages.size >= 1000) {
            let deleteCount = 0;
            for (const messageId of respondedMessages) {
              respondedMessages.delete(messageId);
              deleteCount++;
              if (deleteCount >= 500) break;
            }
          }

          logger.info(
            'llm',
            'request',
            `${systemLines.join('')}\n${userPrompt}`
          );
          const res = await requestLLM(systemLines.join(''), userPrompt);
          if (res) {
            logger.info('llm', 'respond', `${res}`.trim());
            let resArr = res.split('\n').filter((item) => !!item.trim());
            // 最多回复三句
            if (resArr.length > 3) {
              resArr = resArr.slice(resArr.length - 3);
            }
            ctx.send([getText(resArr[0])]);
            if (resArr[1]) {
              const p1Wait = resArr[1].length * 250;
              setTimeout(() => {
                ctx.send([getText(resArr[1])]);
              }, p1Wait);
              if (resArr[2]) {
                const p2Wait = p1Wait + resArr[2].length * 250;
                setTimeout(() => {
                  ctx.send([getText(resArr[2])]);
                }, p2Wait);
              }
            }
          }
        }

        // 不需要其他插件了
        ctx.swap.llm = true;
        return;
      }
    }
  }

  await next();
};

export default middleware;
