import dayjs from 'dayjs';
import { getText } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { getRateLimiter, getSimpleText } from '@app/utils';
import { getRecordUsage } from '@app/usage';
import helpConfig from '@config/help.json';
import { OB11Message } from '@napcat/onebot';

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

      helpText += '\n\n以下为固定指令模式示例：';
      helpConfig.features.forEach((feature) => {
        helpText += `\n${feature}`;
      });

      helpText += '\n\nLLM 使用量 (次数|合计|请求|生成|思考)：';
      const y = await getRecordUsage(
        dayjs(data.time * 1000)
          .subtract(1, 'day')
          .valueOf()
      );
      if (!y || !y.times) {
        helpText += '\n昨日 (未使用或统计失败)';
      } else {
        helpText += `\n昨日 (${y.times}|${Math.round(y.total_tokens)}|${Math.round(y.prompt_tokens)}|${Math.round(y.completion_tokens)}|${Math.round(y.reasoning_tokens)})`;
      }
      const t = await getRecordUsage(data.time * 1000);
      if (!t || !t.times) {
        helpText += '\n今日 (未使用或统计失败)';
      } else {
        helpText += `\n今日 (${t.times}|${Math.round(t.total_tokens)}|${Math.round(t.prompt_tokens)}|${Math.round(t.completion_tokens)}|${Math.round(t.reasoning_tokens)})`;
      }

      await ctx.send([getText(helpText)]);
    }

    // 不需要其他插件了
    ctx.swap.help = true;
    return;
  }

  await next();
};

export default middleware;
