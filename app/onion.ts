import { logger } from './logger';
import { BotContext, OnionMiddleware } from './types';

/**
 * 中间件能力
 */
export class OnionCenter<D> {
  private middlewares: OnionMiddleware<D>[] = [];

  private compose() {
    return (data: D, ctx: BotContext) => {
      let index = -1;
      const dispatch = (i: number): Promise<void> => {
        if (i <= index) {
          return Promise.reject(new Error('next() called multiple times'));
        }
        index = i;
        const middleware = this.middlewares[i];
        if (!middleware) {
          return Promise.resolve();
        }
        try {
          return middleware(data, ctx, () => dispatch(i + 1));
        } catch (err) {
          return Promise.reject(err);
        }
      };
      return dispatch(0);
    };
  }

  /** 顺序执行中间件 */
  run = async (data: D, ctx: BotContext) => {
    const composed = this.compose();
    try {
      await composed(data, ctx);
    } catch (e) {
      logger.error('onion', 'middleware error', e);
      throw e;
    }
  };

  /** 添加中间件 */
  use = (...middlewares: OnionMiddleware<D>[]) => {
    this.middlewares = this.middlewares.concat(middlewares);
  };
}
