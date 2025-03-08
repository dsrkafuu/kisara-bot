import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { DB_DIR, TEMP_DIR } from '@app/constants';
import { logger } from '@app/logger';
import { OnionMiddleware } from '@app/types';
import { OB11Message, OB11MessageDataType } from '@napcat/onebot';
import { requestVisionImage } from '@app/request';

const IMAGE_TEMP = path.resolve(TEMP_DIR, './images');
fse.ensureDirSync(IMAGE_TEMP);

/** 打一条 DB 日志 */
const logStdout = (data: OB11Message) => {
  let content = '';
  if (typeof data.message === 'string') {
    if (data.message) {
      content += data.message;
    }
  } else {
    const textArr: string[] = [];
    data.message.forEach((item) => {
      if (item.data.text) {
        textArr.push(item.data.text);
      } else if (item.data.summary) {
        textArr.push(item.data.summary);
      }
    });
    if (textArr.length > 0) {
      content += textArr.join(' ');
    }
  }
  let summary = content.replaceAll('\n', ' ').trim();
  if (summary) {
    if (summary.length > 50) {
      summary = summary.substring(0, 50) + '...';
    }
    const stdout = `(${data.sender.nickname}): ${summary}`;
    logger.info('db', stdout);
  }
};

/** 图像识别 */
const visionImage = async (data: OB11Message) => {
  const { message } = data;
  if (typeof message !== 'string') {
    for (const item of message) {
      // 表情不做识别
      if (
        item.type === OB11MessageDataType.image &&
        item.data.sub_type === 0 &&
        /^https?:\/\//i.test(item.data.url || '')
      ) {
        logger.info('db', `request vision:\n${item.data.url}`);
        try {
          // 下载图片转换为 base64
          const content = await requestVisionImage(item.data.url!);
          logger.info('db', `respond vision: ${content}`);
          if (content) {
            item.data.summary = `[图片：${content}]`;
          }
        } catch (e) {
          logger.error('db', 'request vision error', e);
        }
      }
    }
  }
};

/** 消息记录中间件 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  await next();
  // 消息记录放到其他中间件之后，记录应用的插件信息

  try {
    const { message_type, user_id, group_id, time } = data;
    const dayTime = dayjs(time * 1000);
    await visionImage(data);
    logStdout(data);

    const json = JSON.stringify({ swap: ctx.swap, ...data });
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const logName = `${message_type}_${logId}_${dayTime.format('YYYYMMDD')}.log`;
    const filePath = path.resolve(DB_DIR, logName);
    await fse.appendFile(filePath, `${json}\n`);

    const extraLines = ctx.db.records;
    if (extraLines.length > 0) {
      for (const lineData of extraLines) {
        await visionImage(lineData);
        logStdout(lineData);
        const json = JSON.stringify({ swap: ctx.swap, ...lineData });
        await fse.appendFile(filePath, `${json}\n`);
      }
    }
  } catch (e) {
    logger.error('db', 'message record error', e);
  }
};

export default middleware;
