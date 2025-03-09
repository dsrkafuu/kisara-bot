import { WebSocket } from 'ws';
import { OB11Message, OB11MessageData } from '@napcat/onebot';

export interface SwapRecord {
  help?: boolean;
  /** LLM 网友 */
  llm?: boolean;
  /** 那我问你 */
  prompt_qa?: boolean;
  /** 锐评一下 */
  prompt_rp?: boolean;
  /** 描述图片 */
  prompt_tp?: boolean;
  /** 活字印刷 */
  hzys?: boolean;
  /** 词云 */
  wordcloud?: boolean;
}

export interface ParsedMessageMeta {
  bot_id?: number;
  at_bot?: boolean;
  at_others?: boolean;
}

/** Bot 上下文 */
export interface BotContext {
  /** NapCat 状态 */
  status: boolean;
  /** NapCat 客户端连接 */
  ws: WebSocket;
  /** NapCat 客户端连接和状态 */
  clients: Map<WebSocket, boolean>;
  /** 消息解析后的基础信息 */
  parsed: ParsedMessageMeta;
  /** 插件标记数据 */
  swap: SwapRecord;
  /** 这条消息是否已经被多模态读图 */
  vision: boolean;
  /** 通知 db 当次完成后需要额外插入的消息 */
  records: OB11Message[];
  /** 发送 QQ 消息 */
  send: (message: OB11MessageData[], options?: RespondOptions) => Promise<void>;
}

/** 中间件 */
export interface OnionMiddleware<D> {
  (event: D, ctx: BotContext, next: () => Promise<void>): Promise<void>;
}

/** 响应选项 */
export interface RespondOptions {
  quoteSender?: boolean;
}

/** 响应回调 */
export interface RespondEcho {
  timestamp: number;
  promise?: Promise<RespondEchoData>;
  resolve?: (value: RespondEchoData) => void;
  reject?: (reason?: any) => void;
}

/** 响应数据 */
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
