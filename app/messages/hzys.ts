import { OB11Message } from '@napcat/onebot';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';
import hzys from '@hzys/index';
import { getRecord, getText } from '@app/respond';

/**
 * 活字印刷能力中间件
 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const fullSimpleText = getSimpleText(data);
  const sourceTextSplits = fullSimpleText.split('活字印刷');
  if (sourceTextSplits.length > 1) {
    const inputText = sourceTextSplits
      .map((text) => text.trim())
      .join(' ')
      .trim();

    // 单人 QQ 号限流，群组请求者 QQ 限流
    let limitKey = `hzys_private_${data.user_id}`;
    if (data.message_type === 'group') {
      limitKey = `hzys_group_${data.user_id}`;
    }
    const rateLimiter = getRateLimiter(limitKey, 10);
    if (inputText) {
      try {
        if (rateLimiter.check()) {
          const hzysFile = await hzys(inputText);
          await ctx.send([getRecord(hzysFile)]);
        }
      } catch (e: any) {
        if (e.message === '401') {
          await ctx.send([getText('活字印刷字数过长，请缩短后再试')]);
        } else {
          await ctx.send([getText('活字印刷内部错误，请联系木更一号')]);
        }
      }

      // 不需要其他插件了
      ctx.swap.hzys = true;
      return;
    }
  }

  await next();
};

export default middleware;
