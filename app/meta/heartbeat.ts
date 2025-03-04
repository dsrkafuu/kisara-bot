import { OB11BaseMetaEvent } from '@napcat/onebot/event/meta/OB11BaseMetaEvent';
import { OB11HeartbeatEvent } from '@napcat/onebot/event/meta/OB11HeartbeatEvent';
import { OnionMiddleware } from '@app/types';
import logger from '@app/logger';

/**
 * 心跳包监测中间件
 */
const middleware: OnionMiddleware<OB11BaseMetaEvent> = async (
  data,
  ctx,
  next
) => {
  if (data.meta_event_type !== 'heartbeat') {
    return;
  }

  const heartbeatEvent = data as OB11HeartbeatEvent;
  const { online, good } = heartbeatEvent.status;
  if (online && good && !ctx.clients.get(ctx.ws)) {
    logger.warn('heartbeat', 'napcat status changed', true);
    ctx.clients.set(ctx.ws, true);
  } else if ((!online || !good) && ctx.clients.get(ctx.ws)) {
    logger.warn('heartbeat', 'napcat status changed', false);
    ctx.clients.set(ctx.ws, false);
  }

  await next();
};

export default middleware;
