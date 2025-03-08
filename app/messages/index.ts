import { logger } from '@app/logger';
import { OnionCenter } from '@app/onion';
import { BotContext } from '@app/types';
import { OB11Message } from '@napcat/onebot';
import db from './db';
import help from './help';
import hzys from './hzys';
import wordcloud from './wordcloud';
import repeat from './repeat';
import prompt from './prompt';
import llm from './llm';

/**
 * message 事件处理器
 */
const handler = async (data: OB11Message, ctx: BotContext) => {
  if (!ctx.status) {
    logger.warn('message', 'napcat before connected');
  }

  const onion = new OnionCenter<OB11Message>();

  // 消息记录
  onion.use(db);

  // 帮助
  onion.use(help);

  // 活字印刷
  onion.use(hzys);

  // 词云
  onion.use(wordcloud);

  // LLM 问答
  onion.use(prompt);

  // LLM 网友
  onion.use(llm);

  // 复读
  onion.use(repeat);

  await onion.run(data, ctx);
};

export default handler;
