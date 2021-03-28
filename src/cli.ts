#!/usr/bin/env node

import { program } from 'commander';
import { myHistory, MyHistoryConfig } from '.';
const packageJSON = require('../package.json');
import { v4 as uuid } from 'uuid';
import { join } from 'path';

program.version(packageJSON.version);

program
  .option(
    '--path <path>',
    'The path where the project is located',
    process.cwd()
  )
  .requiredOption('-p, --port <port>', 'The port of your website')
  .option('-h, --host <host>', 'The host of your webiste', '0.0.0.0')
  .option('--protocol <protocol>', 'The protocol your webiste', 'http')
  .option(
    '-c, --command <command>',
    'The command to start your website',
    'npm ci && npm run start'
  )
  .option('-t, --tmp <tmp>', 'Temporary folder', '/tmp/my-history-' + uuid())
  .option(
    '-s, --screenshot <screenshot>',
    'Screenshot directory',
    join(process.cwd(), 'screenshots')
  )
  .option('--last <last>', 'Last amount of commits')
  .option(
    '--filter-commit-msg <filter-commit-message>',
    'Filter commit message'
  )
  .option(
    '--start-index <start-index>',
    'Which index it should start with for the image prefix',
    '0'
  )
  .option('--log-level <log-level>', 'The log level', 'info')
  .option('--every-nth <every-nth>', 'Only check for every nth commit')
  .option('-w, --width <width>', 'Width of the screenshot', '1440')
  .option('-h, --height <height>', 'Height of the screenshot', '1080')
  .option('--from <from>', 'From which SHA to start');

program.parse(process.argv);

myHistory({ ...(program.opts() as MyHistoryConfig) }).catch(console.error);
