import { WebSocket } from 'ws';
import { OB11Message, OB11MessageData } from '@napcat/onebot';

/** Bot 上下文 */
export interface BotContext {
  /** NapCat 状态 */
  status: boolean;
  /** NapCat 客户端连接 */
  ws: WebSocket;
  /** NapCat 客户端连接和状态 */
  clients: Map<WebSocket, boolean>;
  /** 插件标记数据 */
  swap: Record<string, any>;
  /** 通知 db 当次完成后写入的消息 */
  db: {
    records: OB11Message[];
  };
  /** 发送 QQ 消息 */
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
  data: Record<string, any>;
  message?: string;
}

/** 使用量统计 */
export interface RecordUsage {
  day: string;
  times: number;
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
  reasoning_tokens: number;
}
