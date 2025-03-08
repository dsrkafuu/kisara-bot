import fse from 'fs-extra';
import path from 'path';
import appConfig from '@config/app.json';

export const GROUP_WHITELIST = appConfig.whitelist
  .map((entry) => {
    const [type, id] = entry.split('_');
    if (type === 'group') return type === 'group' ? id : '';
  })
  .filter((id) => !!id);

export const PRIVATE_WHITELIST = appConfig.whitelist
  .map((entry) => {
    const [type, id] = entry.split('_');
    if (type === 'private') return type === 'private' ? id : '';
  })
  .filter((id) => !!id);

export const DB_DIR = path.resolve(process.cwd(), appConfig.db.dbDir);
export const TEMP_DIR = path.resolve(process.cwd(), appConfig.db.tempDir);

fse.ensureDirSync(DB_DIR);
fse.ensureDirSync(TEMP_DIR);

export const MOCK_HEADERS = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6',
  'Cache-Control': 'max-age=0',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
