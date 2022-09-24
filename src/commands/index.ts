import { program } from 'commander';
import { start } from './start';
program
	.command('start')
	.description('start the tunnel-vision client')
	.option('-t, --target <string>', 'target host')
	.option('-c, --config [string]', 'used config file', `${process.env.HOME}/.tunnelvision`)
	.action(start);

export { program };
if (process.argv[1] === __filename) {
	program.parse();
}
