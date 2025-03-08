import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { DB_DIR } from '@app/constants';
import { getImage, getText } from '@app/respond';
import { logger } from '@app/logger';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';
import { OB11Message } from '@napcat/onebot';
import genWordcloud from '@wordcloud/index';

const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const { message_type, user_id, group_id, time } = data;
  const fullSimpleText = getSimpleText(data);
  const sourceTextSplits = fullSimpleText.split('词云');
  const lastDay = dayjs(time * 1000).subtract(1, 'day');

  // 有关键词词云，并且字数小于 10
  if (sourceTextSplits.length > 1 && fullSimpleText.length < 10) {
    // 单人 QQ 号限流，群组请求者 QQ 限流
    let limitKey = `wordcloud_private_${data.user_id}`;
    if (data.message_type === 'group') {
      limitKey = `wordcloud_group_${data.user_id}`;
    }
    const rateLimiter = getRateLimiter(limitKey, 10);
    if (rateLimiter.check()) {
      const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
      const logName = `${message_type}_${logId}_${lastDay.format('YYYYMMDD')}.log`;
      const filePath = path.resolve(DB_DIR, logName);
      let dbFile: string = '';
      try {
        if (fse.existsSync(filePath)) {
          dbFile = fse.readFileSync(filePath, 'utf-8');
        }
      } catch (e) {
        logger.error('llm', 'read db file error', e);
      }

      // 如果没有 DB
      if (!dbFile) {
        await ctx.send([getText('没有找到聊天记录，请以后再试')], {
          quoteSender: true,
        });
        ctx.swap.wordcloud = true;
        return;
      }

      const userLines: string[] = [];
      const dbLines = dbFile.split('\n');
      for (let i = dbLines.length - 1; i >= 0; i--) {
        const dbLine = dbLines[i];
        if (dbLine.trim().length > 0) {
          let dbLineObj: OB11Message & { swap?: Record<string, any> };
          try {
            dbLineObj = JSON.parse(dbLine);
          } catch (e) {
            logger.error('wordcloud', 'parse db line error', e);
            continue;
          }
          // 过滤掉不是当前用户的消息
          if (dbLineObj.user_id !== data.user_id) {
            continue;
          }
          const simpleText = getSimpleText(dbLineObj);
          if (simpleText) {
            // 过滤掉链接
            const httpRegex =
              /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g;
            const wwwRegex =
              /(https?:\/\/|www\.)[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g;
            const cleanedText = simpleText
              .replace(httpRegex, '')
              .replace(wwwRegex, '')
              .trim();
            if (cleanedText) {
              userLines.push(cleanedText);
            }
          }
        }
      }
      const userText = userLines.join('\n');
      if (!userText.trim()) {
        await ctx.send([getText('你的有效聊天记录不足，请以后再试')], {
          quoteSender: true,
        });
        ctx.swap.wordcloud = true;
        return;
      }

      // 构建词云
      try {
        let wcname = `${message_type}`;
        if (message_type === 'group') {
          wcname += `_${group_id}`;
        }
        wcname += `_${user_id}_${lastDay.format('YYYYMMDD')}`;
        const result = await genWordcloud(
          wcname,
          userText.replaceAll('\n', '')
        );
        await ctx.send([getText('你的昨日发言词云'), getImage(result)], {
          quoteSender: true,
        });
      } catch (e: any) {
        if (e === '0' || e === '1') {
          await ctx.send([getText('生成词云失败，请以后再试')], {
            quoteSender: true,
          });
        } else if (e === '2') {
          await ctx.send([getText('你的有效聊天记录不足，请以后再试')], {
            quoteSender: true,
          });
        } else {
          logger.error('wordcloud', 'unexpected error:', e);
        }
      }
    }

    // 不需要其他插件了
    ctx.swap.wordcloud = true;
    return;
  }

  await next();
};

export default middleware;
