import OnionCenter from '@app/onion';
import { BotContext } from '@app/types';
import { OB11BaseMetaEvent } from '@napcat/onebot/event/meta/OB11BaseMetaEvent';
import lifecycle from './lifecycle';
import heartbeat from './heartbeat';

/** meta_event 事件处理器 */
const handler = async (data: OB11BaseMetaEvent, ctx: BotContext) => {
  const onion = new OnionCenter<OB11BaseMetaEvent>();

  onion.use(lifecycle);
  onion.use(heartbeat);

  await onion.run(data, ctx);
};

export default handler;
