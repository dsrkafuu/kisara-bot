import { logger } from '@app/logger';
import { getLoginInfo } from '@app/respond';
import { OnionMiddleware } from '@app/types';
import { OB11BaseMetaEvent } from '@napcat/onebot/event/meta/OB11BaseMetaEvent';
import { OB11LifeCycleEvent } from '@napcat/onebot/event/meta/OB11LifeCycleEvent';

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

    // 初始化 Bot QQ 信息
    await getLoginInfo(ctx);
  }

  await next();
};

export default middleware;
