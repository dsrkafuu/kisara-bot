import { WebSocketServer, WebSocket } from 'ws';
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
      const data = JSON.parse(`${message}`);

      // 发送回调
      if (data.echo && echoCenter.has(data.echo)) {
        const respondEcho = echoCenter.get(data.echo);
        if (respondEcho && respondEcho.resolve) {
          respondEcho.resolve(data);
        }
        return;
      }

      // 收到消息
      const ctx: BotContext = {
        status: clients.get(ws) || false,
        ws,
        clients,
        swap: {},
        db: { records: [] },
        send: (...args) => sendMessage(data, ctx, ...args),
      };
      if (data.post_type) {
        if (data.post_type === 'meta_event') {
          handleMetaEvent(data, ctx);
        } else if (data.post_type === 'message') {
          // 白名单过滤
          if (data.message_type === 'group') {
            if (GROUP_WHITELIST.includes(`${data.group_id}`)) {
              handleMessageEvent(data, ctx);
            } else {
              logger.info('main', 'group message filtered', data.group_id);
            }
          } else if (data.message_type === 'private') {
            if (PRIVATE_WHITELIST.includes(`${data.user_id}`)) {
              handleMessageEvent(data, ctx);
            } else {
              logger.info('main', 'private message filtered', data.user_id);
            }
          }
        }
      } else {
        logger.warn('main', 'unknown message', JSON.stringify(data));
      }
    } catch (e) {
      logger.error('main', 'message parse error', e);
    }
  });
});

process.on('SIGINT', () => {
  wss.clients.forEach((ws) => ws.close());
  logger.info('main', 'bot stopped');
  process.exit(0);
});

logger.info('main', 'bot started');
