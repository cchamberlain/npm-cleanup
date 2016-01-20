#!/usr/bin/env node

import npmCleanup from './'
import chalk from 'chalk'

let help = false
let dashdash = false
let args = process.argv.slice(2).filter(arg => {
  if (dashdash)
    return !!arg
  else if (arg === '--')
    dashdash = true
  else if (arg.match(/^(-+|\/)(h(elp)?|\?)$/))
    help = true
  else
    return !!arg
})

if (help) {
  // If they didn't ask for help, then this is not a "success"
  var log = help ? console.log : console.error
  log('Usage: npm-cleanup')
  log('')
  log('  Cleans the shit out of node_modules.')
  log('')
  log('Options:')
  log('')
  log('  -h, --help    Display this usage info')
  process.exit(help ? 0 : 1)
} else {
  const dir = args.length > 0 ? args[0] : process.cwd()
  console.log(chalk.red('DIR =>'), dir)
  npmCleanup({ dir })
    .then(results => console.dir(results.aggregator.recursiveDepMap.keys()))
    .catch(err => console.error(chalk.red(err)))
}
