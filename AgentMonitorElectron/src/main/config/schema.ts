import { z } from 'zod'

export const cliSourceSchema = z.enum(['claude', 'codex'])
export const audioModeSchema = z.enum(['default', 'custom'])

const cliMonitorSchema = z.object({
  enabled: z.boolean().default(true),
  audioMode: audioModeSchema.default('default'),
  customAudioPath: z.string().nullable().default(null)
})

export const appConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultAudio: z.object({
    source: z.enum(['builtin', 'imported']).default('builtin'),
    path: z.string().default('builtin://complete.wav'),
    volume: z.number().min(0).max(1).default(0.7)
  }),
  monitors: z.object({
    claude: cliMonitorSchema.default({
      enabled: true,
      audioMode: 'default',
      customAudioPath: null
    }),
    codex: cliMonitorSchema.default({
      enabled: true,
      audioMode: 'default',
      customAudioPath: null
    })
  }),
  globalPaused: z.boolean().default(false),
  autoStart: z.boolean().default(true),
  closeToTray: z.boolean().default(true)
})

export const turnStoppedEventSchema = z.object({
  version: z.literal(1),
  traceId: z.string().min(8).max(64).optional(),
  source: cliSourceSchema,
  eventType: z.literal('turnStopped'),
  sessionId: z.string().max(256).nullable(),
  turnId: z.string().max(256).nullable(),
  cwd: z.string().max(4096).nullable(),
  timestamp: z.number().int().nonnegative()
})

export const ipcRequestSchema = z.object({
  protocolVersion: z.literal(1),
  token: z.string().min(16).max(512),
  event: turnStoppedEventSchema
})
