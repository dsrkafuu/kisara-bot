import fse from 'fs-extra';
import * as math from 'mathjs';
import { customAlphabet } from 'nanoid';
import wav from 'node-wav';
import path from 'path';
import pinyin from 'pinyin';
import { logger } from '@app/logger';
import appConfig from '@config/app.json';
import { cleanFiles } from './utils';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

// 全局常量
const TARGET_SR = 44100;
const CHUNK_DURATION = TARGET_SR / 4; // 0.25 秒静音
const DICTIONARY = fse.readJSONSync(
  path.resolve(process.cwd(), appConfig.hzys.dictFile)
);
const YSDD_TABLE = fse.readJSONSync(
  path.resolve(process.cwd(), appConfig.hzys.ysddFile)
);
const SOURCE_DIR = path.resolve(process.cwd(), appConfig.hzys.sourceDir);
const YSDD_DIR = path.resolve(process.cwd(), appConfig.hzys.ysddDir);
const OUT_DIR = path.resolve(process.cwd(), appConfig.hzys.outDir);

/**
 * 文本分割
 */
const segmentText = (
  text: string
): Array<{ segment: string; ysdd: boolean }> => {
  const segments: Array<{ segment: string; ysdd: boolean }> = [];
  let remaining = text.toLowerCase();
  while (remaining.length > 0) {
    const longestMatch = Object.keys(YSDD_TABLE)
      .filter((k) => remaining.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (longestMatch) {
      segments.push({ segment: longestMatch, ysdd: true });
      remaining = remaining.slice(longestMatch.length);
    } else {
      segments.push({ segment: remaining[0], ysdd: false });
      remaining = remaining.slice(1);
    }
  }
  return segments;
};

/**
 * 音频重采样
 */
function resampleAudio(
  input: number[],
  sourceRate: number,
  targetRate: number
) {
  const ratio = sourceRate / targetRate;
  const targetLength = Math.ceil(input.length / ratio);
  const output = new Array<number>(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const prevIndex = Math.floor(srcIndex);
    const nextIndex = Math.min(Math.ceil(srcIndex), input.length - 1);
    const fraction = srcIndex - prevIndex;
    output[i] = input[prevIndex] * (1 - fraction) + input[nextIndex] * fraction;
  }
  return output;
}

/**
 * 加载音频
 */
const loadAudio = (filePath: string) => {
  const buffer = fse.readFileSync(filePath);
  const { sampleRate, channelData } = wav.decode(buffer);
  let wavData: number[];
  // 合并两个声道
  if (channelData.length === 2) {
    wavData = new Array<number>(channelData[0].length);
    for (let i = 0; i < channelData[0].length; i++) {
      wavData[i] = (channelData[0][i] + channelData[1][i]) / 2;
    }
  } else {
    wavData = Array.from(channelData[0]);
  }
  // 重采样
  if (sampleRate !== TARGET_SR) {
    wavData = resampleAudio(wavData, sampleRate, TARGET_SR);
  }
  // 音频均衡化
  const scale =
    0.2 / (Math.sqrt(math.mean(math.dotMultiply(wavData, wavData))) + 1e-8);
  wavData = wavData.map((x) => x * scale);
  return wavData;
};

/**
 * 获取原声大碟音频
 */
const getYSDDAudio = (text: string, missing: Set<string>) => {
  const fileName = YSDD_TABLE[text];
  if (!fileName) {
    missing.add(text);
    return new Array<number>(CHUNK_DURATION).fill(0);
  }
  const filePath = path.resolve(YSDD_DIR, `${fileName}.wav`);
  try {
    return loadAudio(filePath);
  } catch (e) {
    logger.warn('hzys', `ysdd error: ${e}`);
    missing.add(fileName);
    return new Array<number>(CHUNK_DURATION).fill(0);
  }
};

/**
 * 获取原声大碟音频
 */
const getPinyinAudio = (text: string, missing: Set<string>) => {
  const pinyins = pinyin(text, { style: pinyin.STYLE_NORMAL }).flat();
  return pinyins.flatMap((p) => {
    if (/^[0-9a-z]$/i.test(p)) {
      const dictValues: string[] = (DICTIONARY[p] || '').split(' ');
      return dictValues.flatMap((py) => {
        const filePath = path.resolve(SOURCE_DIR, `${py}.wav`);
        try {
          return loadAudio(filePath);
        } catch (e) {
          logger.warn('hzys', `pinyin error: ${e}`);
          missing.add(py);
          return new Array<number>(CHUNK_DURATION).fill(0);
        }
      });
    } else if (/^ $/i.test(p)) {
      return new Array<number>(CHUNK_DURATION).fill(0);
    }
    const filePath = path.resolve(SOURCE_DIR, `${p}.wav`);
    if (!fse.existsSync(filePath)) {
      missing.add(p);
      return new Array<number>(CHUNK_DURATION).fill(0);
    }
    try {
      return loadAudio(filePath);
    } catch (e) {
      logger.warn('hzys', `pinyin error: ${e}`);
      missing.add(p);
      return new Array<number>(CHUNK_DURATION).fill(0);
    }
  });
};

/**
 * 音频生成
 */
const generateAudio = (text: string) => {
  const segments = segmentText(text);
  const audioChunks: number[][] = [];
  const missing = new Set<string>();
  segments.forEach(({ segment, ysdd }) => {
    const audio = ysdd
      ? getYSDDAudio(segment, missing)
      : getPinyinAudio(segment, missing);
    if (audio) {
      audioChunks.push(audio);
    }
  });
  return audioChunks.flat();
};

/**
 * 保存音频
 */
const saveAudio = (data: number[]) => {
  const id = `${Date.now()}_${nanoid()}`;
  const outputPath = path.resolve(OUT_DIR, `${id}.wav`);
  const buffer = wav.encode([data], {
    sampleRate: TARGET_SR,
    float: true,
    bitDepth: 32,
  });
  if (!fse.existsSync(OUT_DIR)) {
    fse.mkdirSync(OUT_DIR);
  }
  fse.writeFileSync(outputPath, buffer);
  return outputPath;
};

/**
 * 活字印刷方法
 */
const hzys = async (text: string): Promise<string> => {
  if (text.length > 200) {
    logger.warn('hzys', `text too long: ${text.length}`);
    throw new Error('401');
  }
  try {
    const audio = generateAudio(text);
    const outputPath = saveAudio(audio);
    logger.info('hzys', 'output:', path.basename(outputPath, '.wav'));
    cleanFiles(OUT_DIR);
    return outputPath;
  } catch (e) {
    logger.error('hzys', e);
    throw new Error('500');
  }
};

export default hzys;
