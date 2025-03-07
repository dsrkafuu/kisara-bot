import fs from 'fs';
import path from 'path';
import { logger } from '@app/logger';

/**
 * 清理目录中的过期文件
 * @param dirPath 要清理的目录
 */
export const cleanFiles = async (dirPath: string) => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  let cleanCount = 0;
  if (!fs.existsSync(dirPath)) return;
  fs.readdirSync(dirPath).forEach((file) => {
    const filePath = path.resolve(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.ctimeMs < cutoff) {
      fs.unlinkSync(filePath);
      cleanCount++;
    }
  });
  if (cleanCount > 0) {
    logger.info('hzys', `cleaned ${cleanCount} files`);
  }
};
