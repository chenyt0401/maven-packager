import {create} from 'zustand'

export interface UploadProgress {
  taskId: string
  stageKey: string
  percent: number
  uploadedBytes: number
  totalBytes: number
  speedBytesPerSecond?: number
  message: string
}

interface UploadProgressState {
  progressByTaskId: Record<string, UploadProgress>
  updateProgress: (taskId: string, progress: UploadProgress) => void
  clearProgress: (taskId: string) => void
}

export const useUploadProgressStore = create<UploadProgressState>((set) => ({
  progressByTaskId: {},

  updateProgress: (taskId, progress) => {
    set((state) => ({
      progressByTaskId: {
        ...state.progressByTaskId,
        [taskId]: progress,
      },
    }))
  },

  clearProgress: (taskId) => {
    set((state) => {
      const next = {...state.progressByTaskId}
      delete next[taskId]
      return {progressByTaskId: next}
    })
  },
}))
