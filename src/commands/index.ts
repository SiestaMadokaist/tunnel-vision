#!/usr/bin/env node
import { program } from 'commander';
import { start } from './start';
program
	.command('start')
	.description('start the tunnel-vision client')
	.option('-t, --target <string>', 'target host')
	.option('-c, --config [string]', 'used config file', '~/.tunnelvision')
	.action(start);
program.parse(process.argv);
