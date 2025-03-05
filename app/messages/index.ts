import { OB11Message } from '@napcat/onebot';
import logger from '@app/logger';
import OnionCenter from '@app/onion';
import { BotContext } from '@app/types';
import db from './db';
import help from './help';
import hzys from './hzys';
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
  // 消息记录
  onion.use(help);
  // 活字印刷
  onion.use(hzys);
  // LLM 问答
  onion.use(prompt);
  // LLM 回复
  onion.use(llm);
  await onion.run(data, ctx);
};

export default handler;
