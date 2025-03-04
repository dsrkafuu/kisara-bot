import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { OB11Message } from '@napcat/onebot';
import appConfig from '@config/app.json';
import { OnionMiddleware } from '@app/types';
import logger from '@app/logger';

const DB_DIR = path.resolve(process.cwd(), appConfig.db.dbDir);
fse.ensureDirSync(DB_DIR);

/**
 * 消息记录中间件
 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  await next();
  // 消息记录放到其他中间件之后，记录应用的插件信息

  const { message_type, user_id, group_id, time, sender } = data;
  const dayTime = dayjs(time * 1000);
  const { nickname } = sender;

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
    const stdout = `(${nickname}): ${summary}`;
    logger.info('db', stdout);
  }

  try {
    const json = JSON.stringify({ swap: ctx.swap, ...data });
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const logName = `${message_type}_${logId}_${dayTime.format('YYYYMMDD')}.log`;
    const filePath = path.resolve(DB_DIR, logName);
    await fse.appendFile(filePath, `${json}\n`);
  } catch (e) {
    logger.error('db', 'message record error', e);
  }
};

export default middleware;
