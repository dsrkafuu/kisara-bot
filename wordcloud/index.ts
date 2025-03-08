import path from 'path';
import iconv from 'iconv-lite';
import fse from 'fs-extra';
import { spawn } from 'child_process';
import { logger } from '@app/logger';

const OUT_DIR = path.resolve(process.cwd(), './wordcloud/out');

/**
 * 生成词云，返回文件绝对路径
 * @param name 唯一 key
 * @param article 文字内容
 */
const genWordcloud = (name: string, article: string) => {
  const filePath = path.resolve(OUT_DIR, `${name}.png`);
  if (fse.existsSync(filePath)) {
    logger.info('wordcloud', `cache hit: ${filePath}`);
    return Promise.resolve(filePath);
  }

  return new Promise<string>((resolve, reject) => {
    const prog = path.resolve(process.cwd(), './wordcloud/main.py');
    const python = path.resolve(process.cwd(), './venv/Scripts/python.exe');
    const wordcloud = spawn(python, [prog, filePath, article]);
    logger.info('wordcloud', `generate:\n${filePath}\n${article}`);

    wordcloud.stdout.on('data', (data) => {
      logger.info('wordcloud', iconv.decode(data, 'utf-8').trim());
    });
    wordcloud.stderr.on('data', (data) => {
      logger.info('wordcloud', iconv.decode(data, 'utf-8').trim());
    });
    wordcloud.on('close', (code) => {
      if (code === 0 && fse.existsSync(filePath)) {
        resolve(filePath);
      } else {
        reject(`${code}`);
      }
    });
  });
};

export default genWordcloud;
