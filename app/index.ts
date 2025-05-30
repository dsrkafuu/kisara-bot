import { WebSocketServer, WebSocket } from 'ws';
import { OB11Message } from '@napcat/onebot';
import { logger } from './logger';
import { echoCenter, sendMessage } from './respond';
import { BotContext } from './types';
import handleMetaEvent from './meta';
import handleMessageEvent from './messages';
import { GROUP_WHITELIST, PRIVATE_WHITELIST } from './constants';

const wss = new WebSocketServer({ host: '127.0.0.1', port: 1145 });
const clients = new Map<WebSocket, boolean>();

wss.on('connection', (ws) => {
  clients.set(ws, false);
  ws.on('message', (message) => {
    try {
      const event = JSON.parse(`${message}`);

      // 发送回调
      if (event.echo && echoCenter.has(event.echo)) {
        const respondEcho = echoCenter.get(event.echo);
        if (respondEcho && respondEcho.resolve) {
          respondEcho.resolve(event);
        }
        return;
      }

      // 收到消息
      const ctx: BotContext = {
        status: clients.get(ws) || false,
        ws,
        clients,
        parsed: {},
        swap: {},
        records: [],
        vision: false,
        send: (...args) => sendMessage(event, ctx, ...args),
      };
      if (event.post_type) {
        // 基本 meta_event 事件
        if (event.post_type === 'meta_event') {
          handleMetaEvent(event, ctx);
        }

        // 普通消息事件
        else if (event.post_type === 'message') {
          // 消息初步解析
          const data = event as OB11Message;
          const { self_id, message_type, message } = data;
          ctx.parsed.bot_id = self_id || 0;
          if (message_type === 'group' && typeof message !== 'string') {
            ctx.parsed.at_bot = message.some((item) => {
              return item.type === 'at' && `${item.data.qq}` === `${self_id}`;
            });
            ctx.parsed.at_others = message.some((item) => {
              return item.type === 'at' && `${item.data.qq}` !== `${self_id}`;
            });
          }

          // 白名单过滤
          if (data.message_type === 'group') {
            if (GROUP_WHITELIST.includes(`${data.group_id}`)) {
              handleMessageEvent(data, ctx);
            } else {
              // logger.info('main', 'group message filtered', data.group_id);
            }
          } else if (data.message_type === 'private') {
            if (PRIVATE_WHITELIST.includes(`${data.user_id}`)) {
              handleMessageEvent(data, ctx);
            } else {
              // logger.info('main', 'private message filtered', data.user_id);
            }
          }
        }
      } else {
        logger.warn('main', 'unknown event', JSON.stringify(event));
      }
    } catch (e) {
      logger.error('main', 'event parse error', e);
    }
  });
});

process.on('SIGINT', () => {
  wss.clients.forEach((ws) => ws.close());
  logger.info('main', 'bot stopped');
  process.exit(0);
});

logger.info('main', 'bot started');
