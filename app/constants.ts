import path from 'path';
import fse from 'fs-extra';
import appConfig from '@config/app.json';

export const DB_DIR = path.resolve(process.cwd(), appConfig.db.dbDir);

fse.ensureDirSync(DB_DIR);
