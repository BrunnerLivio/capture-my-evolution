import simpleGit from 'simple-git';
import * as copydir from 'copy-dir';
import * as winston from 'winston';
import { exec, ChildProcess, execSync } from 'child_process';
import axios from 'axios';
import * as fs from 'fs';
import * as puppeteer from 'puppeteer';
import { join } from 'path';
import * as fkill from 'fkill';
import * as chalk from 'chalk';

let logger: winston.Logger;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MyHistoryConfig {
  port: string;
  path: string;
  command: string;
  tmp: string;
  screenshot: string;
  width: string;
  height: string;
  host: string;
  protocol: string;
  last: string;
  filterCommitMsg: string;
  everyNth: string;
  startIndex: string;
  logLevel: string;
  from: string;
}

function copyProjectToTmp(path: string, tmpPath: string) {
  return new Promise((resolve, reject) => {
    logger.verbose(`Copy folder ${path} to ${tmpPath}`);
    copydir(
      path,
      tmpPath,
      {
        filter: (_, filepath: string) => {
          if (filepath.includes('node_modules')) {
            return false;
          }
          return true;
        },
      },
      (err) => (err ? reject(err) : resolve(true))
    );
  });
}

async function pingTill(url: string, times: number, currentTimes: number = 0) {
  if (currentTimes === times) {
    return false;
  }
  logger.verbose(`Pinging ${url} for the ${currentTimes}th time`);
  let isAlive: boolean;
  try {
    const { status } = await axios.get(url, { timeout: 400 });
    isAlive = status >= 200 && status <= 299;
  } catch (ex) {
    isAlive = false;
  }
  if (isAlive) {
    return true;
  }
  await wait(2000);
  return await pingTill(url, times, currentTimes + 1);
}

function runCommand(
  url: string,
  command: string,
  path: string
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const process = exec(command, { cwd: path });
    process.stdout.on('data', (data) => {
      logger.verbose(`stdout: ${data}`);
    });

    process.stderr.on('data', (data) => {
      logger.verbose(`stderr: ${data}`);
    });

    process.on('error', (error) => {
      logger.error(error.message);
    });

    process.on('close', () => reject);

    pingTill(url, 50).then((result) => {
      result ? resolve(process) : reject(process);
    });
  });
}

async function takeScreenshot(page: puppeteer.Page, url: string, path: string) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await wait(1000);
  await page.screenshot({
    path,
    fullPage: true,
  });
}

export async function myHistory({
  path,
  port,
  command,
  tmp,
  screenshot,
  width,
  height,
  host,
  protocol,
  last,
  filterCommitMsg,
  everyNth,
  startIndex,
  logLevel,
  from,
}: MyHistoryConfig) {
  logger = winston.createLogger({
    level: logLevel,
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });

  const url = `${protocol}://${host}:${port}`;
  let index = 0;

  if (startIndex && parseInt(startIndex) !== NaN) {
    index = parseInt(startIndex);
  }

  await copyProjectToTmp(path, tmp);

  if (!fs.existsSync(screenshot)) {
    fs.mkdirSync(screenshot);
  }

  logger.verbose('Starting puppeteer');

  const git = simpleGit(tmp);
  let logs = [...(await git.log()).all].reverse();

  if (from) {
    const fromIndex = logs.findIndex((log) => log.hash.startsWith(from));
    if (!fromIndex) {
      throw new Error(`SHA ${from} does not exist!`);
    }
    logger.verbose(`Starting from SHA ${from}`);
    logs = logs.slice(fromIndex, logs.length);
  }

  if (everyNth && parseInt(everyNth) !== NaN) {
    logs = logs.filter((_, i) => (i + 1) % parseInt(everyNth));
  }

  if (filterCommitMsg) {
    const filters = filterCommitMsg.split(',').map((f) => f.toLowerCase());
    logs = logs.filter(
      (log) => !filters.some((f) => log.message.toLowerCase().includes(f))
    );
  }

  if (last && parseInt(last) !== NaN) {
    logs = logs.slice(0, parseInt(last));
  }

  for (const log of logs) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    page.setCacheEnabled(false);

    logger.verbose(`Setting viewport to ${width}x${height}`);
    await page.setViewport({
      width: parseInt(width),
      height: parseInt(height),
    });

    logger.info(
      `Checking out ${log.hash.substr(0, 7)}: ${chalk.blue(log.message)}`
    );
    execSync('git reset --hard', { cwd: tmp });
    await git.checkout(log.hash);

    try {
      const proc = await runCommand(url, command, tmp);

      const filename = `${index}.jpg`;
      logger.info(`Taking screenshot of ${url} and save it to ${filename}`);

      await takeScreenshot(page, url, join(screenshot, filename));

      logger.verbose(`Killing ${proc.pid}`);
      await fkill(`:${port}`);
      logger.verbose(`Killed`);
      index++;
    } catch (proc) {
      logger.info(`Skipping ${log.hash}`);
      try {
        logger.verbose(`Killing ${proc.pid}`);
        await fkill(`:${port}`);
        logger.verbose(`Killed`);
      } catch (ex) {}
    } finally {
      await page.close();
      await browser.close();
    }
  }
}
