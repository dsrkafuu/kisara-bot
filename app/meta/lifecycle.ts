import { OB11BaseMetaEvent } from '@napcat/onebot/event/meta/OB11BaseMetaEvent';
import { OB11LifeCycleEvent } from '@napcat/onebot/event/meta/OB11LifeCycleEvent';
import { OnionMiddleware } from '@app/types';
import logger from '@app/logger';

/**
 * 生命周期中间件
 */
const middleware: OnionMiddleware<OB11BaseMetaEvent> = async (
  data,
  ctx,
  next
) => {
  if (data.meta_event_type !== 'lifecycle') {
    return;
  }

  const lifecycleEvent = data as OB11LifeCycleEvent;
  if (lifecycleEvent.sub_type === 'connect') {
    logger.info('lifecycle', 'napcat connected');
    ctx.clients.set(ctx.ws, true);
  }

  await next();
};

export default middleware;
