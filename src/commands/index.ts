import { program } from 'commander';
import { start } from './start';
program
	.command('start')
	.description('start the tunnel-vision client')
	.option('-a, --account <string>', 'one of the account defined in config file')
	.option('-c, --config [string]', 'used config file', `${process.env.HOME}/.tunnelvision.yaml`)
	.action(start);

export { program };
if (process.argv[1] === __filename) {
	program.parse();
}
