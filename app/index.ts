import { WebSocketServer, WebSocket } from 'ws';
import logger from './logger';
import { BotContext } from './types';
import handleMetaEvent from './meta';
import handleMessageEvent from './messages';
import { echoCenter, sendMessage } from './respond';
import appConfig from '@config/app.json';

const GROUP_WHITELIST = appConfig.whitelist
  .map((entry) => {
    const [type, id] = entry.split('_');
    if (type === 'group') return type === 'group' ? id : '';
  })
  .filter((id) => !!id);
const PRIVATE_WHITELIST = appConfig.whitelist
  .map((entry) => {
    const [type, id] = entry.split('_');
    if (type === 'private') return type === 'private' ? id : '';
  })
  .filter((id) => !!id);

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
        send: (...args) => sendMessage(data, ctx, ...args),
      };
      if (data.post_type) {
        if (data.post_type === 'meta_event') {
          handleMetaEvent(data, ctx);
        } else if (data.post_type === 'message') {
          // 白名单过滤
          if (
            data.message_type === 'group' &&
            GROUP_WHITELIST.includes(`${data.group_id}`)
          ) {
            handleMessageEvent(data, ctx);
          } else if (
            data.message_type === 'private' &&
            PRIVATE_WHITELIST.includes(`${data.user_id}`)
          ) {
            handleMessageEvent(data, ctx);
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
