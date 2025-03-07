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

fse.ensureDirSync(DB_DIR);
