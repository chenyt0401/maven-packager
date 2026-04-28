import {useEffect} from 'react'
import {App as AntApp, ConfigProvider, theme} from 'antd'
import {AppShell} from './app/AppShell'
import {registerBuildEvents, registerDeploymentEvents} from './services/tauri-api'
import {useAppStore} from './store/useAppStore'
import {useWorkflowStore} from './store/useWorkflowStore'
import {useUploadProgressStore} from './store/useUploadProgressStore'
import {useDeploymentLogStore} from './store/useDeploymentLogStore'
import './App.css'

function App() {
  const initialize = useAppStore((state) => state.initialize)
  const appendBuildLog = useAppStore((state) => state.appendBuildLog)
  const finishBuild = useAppStore((state) => state.finishBuild)
  const project = useAppStore((state) => state.project)
  const initializeWorkflow = useWorkflowStore((state) => state.initialize)
  const loadDependencyGraph = useWorkflowStore((state) => state.loadDependencyGraph)
  const clearDependencyGraph = useWorkflowStore((state) => state.clearDependencyGraph)
  const updateDeploymentTask = useWorkflowStore((state) => state.updateDeploymentTask)
  const finishDeploymentTask = useWorkflowStore((state) => state.finishDeploymentTask)
  const updateProbeStatuses = useWorkflowStore((state) => state.updateProbeStatuses)
  const updateUploadProgress = useUploadProgressStore((state) => state.updateProgress)
  const clearUploadProgress = useUploadProgressStore((state) => state.clearProgress)
  const appendDeploymentLog = useDeploymentLogStore((state) => state.appendLog)
  const startLogFlushTimer = useDeploymentLogStore((state) => state.startFlushTimer)
  const stopLogFlushTimer = useDeploymentLogStore((state) => state.stopFlushTimer)

  useEffect(() => {
    initialize()
    void initializeWorkflow()
    startLogFlushTimer()

    let cleanupBuild: (() => void) | undefined
    let cleanupDeployment: (() => void) | undefined
    let disposed = false

    void registerBuildEvents(appendBuildLog, finishBuild).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupBuild = unlisten
    })
    void registerDeploymentEvents(
      appendDeploymentLog,
      updateDeploymentTask,
      finishDeploymentTask,
      updateProbeStatuses,
      (event) => {
        updateUploadProgress(event.taskId, {
          taskId: event.taskId,
          stageKey: event.stageKey,
          percent: event.percent,
          uploadedBytes: event.uploadedBytes,
          totalBytes: event.totalBytes,
          speedBytesPerSecond: event.speedBytesPerSecond,
          message: event.message,
        })
        if (event.percent >= 100) {
          clearUploadProgress(event.taskId)
        }
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten()
        return
      }
      cleanupDeployment = unlisten
    })

    return () => {
      disposed = true
      cleanupBuild?.()
      cleanupDeployment?.()
      stopLogFlushTimer()
    }
  }, [
    appendBuildLog,
    appendDeploymentLog,
    finishBuild,
    finishDeploymentTask,
    initialize,
    initializeWorkflow,
    startLogFlushTimer,
    stopLogFlushTimer,
    updateDeploymentTask,
    updateProbeStatuses,
    updateUploadProgress,
    clearUploadProgress,
  ])

  useEffect(() => {
    if (project?.rootPath) {
      void loadDependencyGraph(project.rootPath)
    } else {
      clearDependencyGraph()
    }
  }, [clearDependencyGraph, loadDependencyGraph, project?.rootPath])

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorPrimary: '#16a34a',
          fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif',
        },
      }}
    >
      <AntApp>
        <AppShell />
      </AntApp>
    </ConfigProvider>
  )
}

export default App
