import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { DB_DIR } from '@app/constants';
import { logger } from '@app/logger';
import { OnionMiddleware } from '@app/types';
import { visionImage } from '@app/request';
import { clearifyText } from '@app/utils';
import { OB11Message } from '@napcat/onebot';

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
  const summary = clearifyText(content, { allowLF: false });
  if (summary) {
    const stdout = `(${data.sender.nickname}): ${summary}`;
    logger.info('db', stdout);
  }
};

/** 消息记录中间件 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  // 消息记录放到其他中间件之后，记录应用的插件信息
  await next();

  try {
    const { message_type, user_id, group_id, time } = data;
    await visionImage(data, ctx, 'db_normal');
    logStdout(data);

    const json = JSON.stringify({ swap: ctx.swap, ...data });
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const logName = `${message_type}_${logId}_${dayjs(time * 1000).format('YYYYMMDD')}.log`;
    const filePath = path.resolve(DB_DIR, logName);
    fse.appendFileSync(filePath, `${json}\n`);

    const extraLines = ctx.records;
    if (extraLines.length > 0) {
      for (const lineData of extraLines) {
        await visionImage(lineData, ctx, 'db_record');
        logStdout(lineData);
        const json = JSON.stringify({ swap: ctx.swap, ...lineData });
        fse.appendFileSync(filePath, `${json}\n`);
      }
    }
  } catch (e) {
    logger.error('db', 'record error:', e);
  }
};

export default middleware;
