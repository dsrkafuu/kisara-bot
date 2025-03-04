import { WebSocket } from 'ws';
import { OB11MessageData } from '@napcat/onebot';

/**
 * Bot 上下文
 */
export interface BotContext {
  status: boolean;
  ws: WebSocket;
  clients: Map<WebSocket, boolean>;
  /** 插件标记数据 */
  swap: Record<string, any>;
  send: (message: OB11MessageData[], options?: RespondOptions) => Promise<void>;
}

/**
 * 中间件
 */
export interface OnionMiddleware<D> {
  (event: D, ctx: BotContext, next: () => Promise<void>): Promise<void>;
}

/**
 * 响应选项
 */
export interface RespondOptions {
  quoteSender?: boolean;
}

/**
 * 响应回调
 */
export interface RespondEcho {
  timestamp: number;
  promise?: Promise<RespondEchoData>;
  resolve?: (value: RespondEchoData) => void;
  reject?: (reason?: any) => void;
}

/**
 * 响应数据
 */
export interface RespondEchoData {
  echo: string;
  status: string;
  message?: string;
}
