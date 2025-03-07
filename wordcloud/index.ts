import path from 'path';
import iconv from 'iconv-lite';
import { nanoid } from 'nanoid';
import { spawn } from 'child_process';
import { logger } from '@app/logger';

const genWordcloud = (article: string) => {
  return new Promise<string | null>((resolve, reject) => {
    const id = nanoid();
    const prog = path.resolve(process.cwd(), './wordcloud/main.py');
    const python = path.resolve(process.cwd(), './venv/Scripts/python.exe');
    const wordcloud = spawn(python, [prog, id, article]);

    wordcloud.stdout.on('data', (data) => {
      logger.info('wordcloud', iconv.decode(data, 'gbk').trim());
    });
    wordcloud.stderr.on('data', (data) => {
      logger.info('wordcloud', iconv.decode(data, 'gbk').trim());
    });
    wordcloud.on('close', (code) => {
      if (code === 0) resolve(id);
      else reject(null);
    });
  });
};

export default genWordcloud;
