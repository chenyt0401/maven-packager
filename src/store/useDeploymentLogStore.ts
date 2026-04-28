import {create} from 'zustand'
import type {DeploymentLogEvent} from '../types/domain'

const MAX_LOG_LINES = 3000
const FLUSH_INTERVAL_MS = 300

interface DeploymentLogState {
  logsByTaskId: Record<string, string[]>
  bufferByTaskId: Record<string, string[]>
  flushTimerId: ReturnType<typeof setInterval> | null
  appendLog: (event: DeploymentLogEvent) => void
  flushLogs: () => void
  clearLogs: (taskId: string) => void
  startFlushTimer: () => void
  stopFlushTimer: () => void
}

export const useDeploymentLogStore = create<DeploymentLogState>((set, get) => ({
  logsByTaskId: {},
  bufferByTaskId: {},
  flushTimerId: null,

  appendLog: (event) => {
    set((state) => ({
      bufferByTaskId: {
        ...state.bufferByTaskId,
        [event.taskId]: [...(state.bufferByTaskId[event.taskId] ?? []), event.line],
      },
    }))
  },

  flushLogs: () => {
    const {bufferByTaskId} = get()
    const taskIds = Object.keys(bufferByTaskId)
    if (taskIds.length === 0) return

    set((state) => {
      const nextLogs = {...state.logsByTaskId}
      for (const taskId of taskIds) {
        const buffered = bufferByTaskId[taskId]
        if (!buffered || buffered.length === 0) continue
        const existing = nextLogs[taskId] ?? []
        nextLogs[taskId] = [...existing, ...buffered].slice(-MAX_LOG_LINES)
      }
      return {
        logsByTaskId: nextLogs,
        bufferByTaskId: {},
      }
    })
  },

  clearLogs: (taskId) => {
    set((state) => {
      const nextLogs = {...state.logsByTaskId}
      const nextBuffer = {...state.bufferByTaskId}
      delete nextLogs[taskId]
      delete nextBuffer[taskId]
      return {logsByTaskId: nextLogs, bufferByTaskId: nextBuffer}
    })
  },

  startFlushTimer: () => {
    const {flushTimerId} = get()
    if (flushTimerId) return
    const id = setInterval(() => {
      get().flushLogs()
    }, FLUSH_INTERVAL_MS)
    set({flushTimerId: id})
  },

  stopFlushTimer: () => {
    const {flushTimerId} = get()
    if (flushTimerId) {
      clearInterval(flushTimerId)
      get().flushLogs()
      set({flushTimerId: null})
    }
  },
}))
