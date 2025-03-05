import { OB11Message } from '@napcat/onebot';
import helpConfig from '@config/help.json';
import { getText } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';

/**
 * 活字印刷能力中间件
 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const fullSimpleText = getSimpleText(data);
  const sourceTextSplits = fullSimpleText.split('帮助');

  // 有关键词帮助，并且字数小于 10
  if (sourceTextSplits.length > 1 && fullSimpleText.length < 10) {
    // 单人 QQ 号限流，群组请求者 QQ 限流
    let limitKey = `help_private_${data.user_id}`;
    if (data.message_type === 'group') {
      limitKey = `help_group_${data.user_id}`;
    }
    const rateLimiter = getRateLimiter(limitKey, 300);
    if (rateLimiter.check()) {
      // 回复帮助信息
      let helpText = helpConfig.desc;

      let processData = '';
      processData += `${process.platform}/${process.arch}`;
      processData += ` node/${process.versions.node}`;
      if (process.versions.bun) {
        processData += ` bun/${process.versions.bun}`;
      }
      helpText += `\n${processData}`;

      helpText += '\n以下为固定指令模式示例：';
      helpConfig.features.forEach((feature) => {
        helpText += `\n${feature}`;
      });

      await ctx.send([getText(helpText)]);
    }

    // 不需要其他插件了
    ctx.swap.help = true;
    return;
  }

  await next();
};

export default middleware;
