import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';
import { DB_DIR } from './constants';
import { logger } from './logger';
import { RecordUsage } from './types';

/** 获取某个时间点那一天的使用情况 */
export const getRecordUsage = async (
  timestamp: number
): Promise<RecordUsage | null> => {
  const filePath = path.resolve(
    DB_DIR,
    `usage_${dayjs(timestamp).format('YYYYMMDD')}.json`
  );
  if (!fse.existsSync(filePath)) {
    return null;
  }
  try {
    const res = fse.readJSONSync(filePath);
    if (res.times) {
      return { day: dayjs(timestamp).format('YYYY-MM-DD'), ...res };
    } else {
      return null;
    }
  } catch (e: any) {
    logger.error('usage', 'get usage error', e);
    return null;
  }
};

export const recordUsage = async (usage?: any) => {
  if (usage && usage.total_tokens > 0) {
    const newRecord = {
      completion_tokens: usage.completion_tokens || 0,
      prompt_tokens: usage.prompt_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
    };
    const timestamp = Date.now();
    const filePath = path.resolve(
      DB_DIR,
      `usage_${dayjs(timestamp).format('YYYYMMDD')}.json`
    );
    const oldRecord = await getRecordUsage(timestamp);
    try {
      if (!oldRecord) {
        fse.writeJsonSync(filePath, { times: 1, ...newRecord });
      } else {
        const newTimes = oldRecord.times + 1;
        const newCT = oldRecord.completion_tokens + newRecord.completion_tokens;
        const newPT = oldRecord.prompt_tokens + newRecord.prompt_tokens;
        const newTT = oldRecord.total_tokens + newRecord.total_tokens;
        const newRT = oldRecord.reasoning_tokens + newRecord.reasoning_tokens;
        fse.writeJsonSync(filePath, {
          times: newTimes,
          completion_tokens: newCT,
          prompt_tokens: newPT,
          total_tokens: newTT,
          reasoning_tokens: newRT,
        });
      }
    } catch (e: any) {
      logger.error('usage', 'record usage error', e);
    }
  }
};
