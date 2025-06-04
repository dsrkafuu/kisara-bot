import { OnionMiddleware } from '@app/types';
import { clearifyText, getRateLimiter, getSimpleText } from '@app/utils';
import { logger } from '@app/logger';
import { requestLLM, visionImage } from '@app/request';
import { getText } from '@app/respond';
import promptConfig from '@config/prompt.json';
import { OB11Message } from '@napcat/onebot';

/** LLM 问答中间件 */
const middleware: OnionMiddleware<OB11Message> = async (data, ctx, next) => {
  const { user_id } = data;

  // 如果不是 at 其他人
  if (!ctx.parsed.at_others) {
    const fullSimpleText = getSimpleText(data);
    const qaSourceTextSplits = fullSimpleText.split('那我问你');
    const rpSourceTextSplits = fullSimpleText.split('锐评一下');
    const tpSourceTextSplits = fullSimpleText.split('描述图片');
    const hasPrompt =
      qaSourceTextSplits.length > 1 ||
      rpSourceTextSplits.length > 1 ||
      tpSourceTextSplits.length > 1;

    // 关闭问答
    if (promptConfig.enable === false) {
      if (hasPrompt) {
        await ctx.send([getText('没钱了，LLM 已暂时关闭')]);
      }
      await next();
      return;
    }

    if (qaSourceTextSplits.length > 1) {
      // 单人 QQ 号限流，群组请求者 QQ 限流
      let limitKey = `prompt_qa_private_${user_id}`;
      if (data.message_type === 'group') {
        limitKey = `prompt_qa_group_${user_id}`;
      }
      const rateLimiter = getRateLimiter(limitKey, 10);

      const inputText = qaSourceTextSplits
        .map((text) => text.trim())
        .join(' ')
        .trim();
      if (inputText) {
        try {
          if (rateLimiter.check()) {
            const systemPrompt = `${promptConfig.qa.join('；')}。`.trim();
            const userPrompt = `${inputText}？`.trim();
            logger.info(
              'prompt',
              `request system prompt:\n${systemPrompt}\nrequest user prompt:\n${userPrompt}`
            );
            const { content, think } = await requestLLM(
              systemPrompt,
              userPrompt
            );
            logger.info(
              'prompt',
              `respond think:\n${think?.replaceAll('\n', ' ')?.trim() || ''}\nrespond content:\n${content?.trim() || ''}`
            );
            await ctx.send(
              [
                getText(
                  clearifyText(content) || '这个问题太难了，换个问题问我吧'
                ),
              ],
              { quoteSender: true }
            );
          }
        } catch (e: any) {
          logger.error('prompt', 'qa error:', e);
          await ctx.send([getText('那我问你出现内部错误，请联系木更一号')]);
        }

        // 不需要其他插件了
        ctx.swap.prompt_qa = true;
        return;
      }
    }

    if (rpSourceTextSplits.length > 1) {
      // 单人 QQ 号限流，群组请求者 QQ 限流
      let limitKey = `prompt_rp_private_${user_id}`;
      if (data.message_type === 'group') {
        limitKey = `prompt_rp_group_${user_id}`;
      }
      const rateLimiter = getRateLimiter(limitKey, 10);

      const inputText = rpSourceTextSplits
        .map((text) => text.trim())
        .join(' ')
        .trim();
      if (inputText) {
        try {
          if (rateLimiter.check()) {
            const systemPrompt = `${promptConfig.rp.join('；')}。`.trim();
            const userPrompt = `锐评一下${inputText}。`;
            logger.info(
              'prompt',
              `request system prompt:\n${systemPrompt}\nrequest user prompt:\n${userPrompt}`
            );
            const { content, think } = await requestLLM(
              systemPrompt,
              userPrompt
            );
            logger.info(
              'prompt',
              `respond think:\n${think?.replaceAll('\n', ' ')?.trim() || ''}\nrespond content:\n${content?.trim() || ''}`
            );
            await ctx.send(
              [
                getText(
                  clearifyText(content) || '这个锐评不了，换个主题问我吧'
                ),
              ],
              { quoteSender: true }
            );
          }
        } catch (e: any) {
          logger.error('prompt', 'rp error:', e);
          await ctx.send([getText('锐评一下出现内部错误，请联系木更一号')]);
        }

        // 不需要其他插件了
        ctx.swap.prompt_rp = true;
        return;
      }
    }

    if (tpSourceTextSplits.length > 1) {
      // 单人 QQ 号限流，群组请求者 QQ 限流
      let limitKey = `prompt_qa_private_${user_id}`;
      if (data.message_type === 'group') {
        limitKey = `prompt_qa_group_${user_id}`;
      }
      const rateLimiter = getRateLimiter(limitKey, 10);

      try {
        if (rateLimiter.check()) {
          const visionRes = await visionImage(data, ctx, 'prompt', false);
          if (visionRes.length) {
            await ctx.send([getText(visionRes.join('\n'))], {
              quoteSender: true,
            });
          } else {
            await ctx.send([getText('我看不懂这张图片哦，换个图片试试吧')]);
          }
        }
      } catch (e: any) {
        logger.error('prompt', 'tp error:', e);
        await ctx.send([getText('描述图片出现内部错误，请联系木更一号')]);
      }

      // 不需要其他插件了
      ctx.swap.prompt_tp = true;
      return;
    }
  }

  await next();
};

export default middleware;
