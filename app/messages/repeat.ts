import fse from 'fs-extra';
import path from 'path';
import { getText } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { OB11Message, OB11MessageDataType } from '@napcat/onebot';
import { DB_DIR } from '@app/constants';
import { logger } from '@app/logger';

/** 复读模块 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const { message_type, message, group_id, user_id } = data;
  let textOnly = false;
  let thisText = '';
  if (message_type === 'group') {
    if (typeof message === 'string') {
      textOnly = true;
      thisText = message;
    } else if (
      message.length === 1 &&
      message[0].type === OB11MessageDataType.text
    ) {
      textOnly = true;
      thisText = message[0].data.text;
    }
  }

  // 记录最后三条消息
  if (textOnly) {
    const logId = message_type === 'group' ? `${group_id}` : `${user_id}`;
    const jsonName = `repeat_${message_type}_${logId}.json`;
    const filePath = path.resolve(DB_DIR, jsonName);
    let jsonData: string[] = [];
    if (fse.existsSync(filePath)) {
      try {
        jsonData = fse.readJSONSync(filePath, 'utf-8');
      } catch (e) {
        logger.error('repeat', 'read json error', e);
      }
    }
    const lastText = jsonData[0] || '';

    // 满三次复读，少于和超过都不复读
    if (jsonData.length === 2 && jsonData[1] === thisText) {
      jsonData.push(thisText);
      try {
        fse.writeJSONSync(filePath, jsonData);
      } catch (e) {
        logger.error('repeat', 'write json error', e);
      }
      await ctx.send([getText(thisText)]);
      // 不需要其他插件了
      ctx.swap.help = true;
      return;
    }

    // 记录一下消息内容
    else {
      if (lastText === thisText) {
        jsonData.push(thisText);
      } else {
        jsonData = [thisText];
      }
      try {
        fse.writeJSONSync(filePath, jsonData);
      } catch (e) {
        logger.error('repeat', 'write json error', e);
      }
    }
  }

  await next();
};

export default middleware;
