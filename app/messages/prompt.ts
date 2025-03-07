import { OnionMiddleware } from '@app/types';
import { clearifyText, getRateLimiter, getSimpleText } from '@app/utils';
import { logger } from '@app/logger';
import { requestLLM } from '@app/request';
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
    const trSourceTextSplits = fullSimpleText.split('帮我翻译');

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
              `respond think:\n${think?.trim() || ''}\nrespond content:\n${content?.trim() || ''}`
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
          logger.error('prompt', 'qa error', e);
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
              `respond think:\n${think?.trim() || ''}\nrespond content:\n${content?.trim() || ''}`
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
          logger.error('prompt', 'rp error', e);
          await ctx.send([getText('锐评一下出现内部错误，请联系木更一号')]);
        }

        // 不需要其他插件了
        ctx.swap.prompt_rp = true;
        return;
      }
    }

    if (trSourceTextSplits.length > 1) {
      // 单人 QQ 号限流，群组请求者 QQ 限流
      let limitKey = `prompt_tr_private_${user_id}`;
      if (data.message_type === 'group') {
        limitKey = `prompt_tr_group_${user_id}`;
      }
      const rateLimiter = getRateLimiter(limitKey, 10);

      const inputText = trSourceTextSplits
        .map((text) => text.trim())
        .join(' ')
        .trim();
      if (inputText) {
        try {
          if (rateLimiter.check()) {
            const systemPrompt = `${promptConfig.tr.join('；')}。`.trim();
            const userPrompt = `翻译下面的内容：\n${inputText}`.trim();
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
              `respond think:\n${think?.trim() || ''}\nrespond content:\n${content?.trim() || ''}`
            );
            await ctx.send(
              [
                getText(
                  clearifyText(content) || '这个翻译不了，换个内容问我吧'
                ),
              ],
              { quoteSender: true }
            );
          }
        } catch (e: any) {
          logger.error('prompt', 'tr error', e);
          await ctx.send([getText('翻译出现内部错误，请联系木更一号')]);
        }

        // 不需要其他插件了
        ctx.swap.prompt_tr = true;
        return;
      }
    }
  }

  await next();
};

export default middleware;
