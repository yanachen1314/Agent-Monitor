const { dirname, join } = require('node:path')
const { spawnSync } = require('node:child_process')

const compiler = process.env.AGENT_MONITOR_GCC || 'D:\\Environment\\C-C++\\msys2\\mingw64\\bin\\gcc.exe'
const compilerBin = dirname(compiler)
const source = join(__dirname, '..', 'resources', 'hook', 'AgentMonitorHook.c')
const output = join(__dirname, '..', 'resources', 'hook', 'AgentMonitorHook.exe')
const result = spawnSync(
  compiler,
  [
    '-std=c11',
    '-Os',
    '-s',
    '-static',
    '-D_WIN32_WINNT=0x0601',
    source,
    '-o',
    output
  ],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, PATH: `${compilerBin};${process.env.PATH || ''}` }
  }
)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
