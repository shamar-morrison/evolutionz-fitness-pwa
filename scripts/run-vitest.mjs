import { spawnSync } from 'node:child_process'

const forwardedArgs = process.argv.slice(2).filter((arg) => arg !== '--watchman=false')
const hasExplicitMode = forwardedArgs.some((arg) =>
  ['--run', '--watch', '--ui'].includes(arg),
)
const vitestArgs = hasExplicitMode ? forwardedArgs : ['--run', ...forwardedArgs]

const result = spawnSync('pnpm', ['exec', 'vitest', ...vitestArgs], {
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
