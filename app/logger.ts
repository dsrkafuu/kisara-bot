import chalk from 'chalk';
import dayjs from 'dayjs';
import fse from 'fs-extra';
import path from 'path';

const now = () => `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}]`;

const logsFolder = path.resolve(process.cwd(), './logs');
if (!fse.existsSync(logsFolder)) {
  fse.mkdirSync(logsFolder);
}

const saveLog = async (prefix: string[], ...args: any[]) => {
  const date = dayjs().format('YYYYMMDD');
  const logPath = path.resolve(logsFolder, `${date}.stdout.log`);
  fse.appendFileSync(logPath, `${prefix.join(' ')} ${args.join(' ')}\n`);
};

const saveError = async (prefix: string[], ...args: any[]) => {
  const date = dayjs().format('YYYYMMDD');
  const logPath = path.resolve(logsFolder, `${date}.stderr.log`);
  fse.appendFileSync(logPath, `${prefix.join(' ')} ${args.join(' ')}\n`);
};

export const logger = {
  info: (module: string, ...args: any[]) => {
    const prefix = [now(), '<info>', `{${module}}`];
    console.info(
      chalk.cyan(prefix[0]),
      chalk.green(prefix[1]),
      chalk.magenta(prefix[2]),
      ...args
    );
    saveLog(prefix, ...args);
  },

  warn: (module: string, ...args: any[]) => {
    const prefix = [now(), '<warn>', `{${module}}`];
    console.warn(
      chalk.cyan(prefix[0]),
      chalk.yellow(prefix[1]),
      chalk.magenta(prefix[2]),
      ...args
    );
    saveLog(prefix, ...args);
  },

  error: (module: string, ...args: any[]) => {
    const prefix = [now(), '<error>', `{${module}}`];
    console.error(
      chalk.cyan(prefix[0]),
      chalk.red(prefix[1]),
      chalk.magenta(prefix[2]),
      ...args
    );
    saveError(prefix, ...args);
  },

  debug: (module: string, ...args: any[]) => {
    if (process.env.NODE_ENV !== 'development') return;
    const prefix = [now(), '<debug>', `{${module}}`];
    console.debug(
      chalk.cyan(prefix[0]),
      chalk.blue(prefix[1]),
      chalk.magenta(prefix[2]),
      ...args
    );
  },
};
