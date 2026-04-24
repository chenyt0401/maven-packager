import {FullscreenOutlined} from '@ant-design/icons'
import {Button, Card, Input, Modal, Space, Tag, Tooltip, Typography} from 'antd'
import {useEffect, useRef, useState} from 'react'
import {useWorkflowStore} from '../../store/useWorkflowStore'

const {Text} = Typography

const classifyLine = (line: string) => {
  const lower = line.toLowerCase()
  if (lower.includes('任务链执行完成') || lower.includes('步骤完成') || lower.includes('exit code 0')) {
    return 'success'
  }
  if (lower.includes('[error]') || lower.includes('任务链') && lower.includes('失败') || lower.includes('命令执行失败')) {
    return 'error'
  }
  if (lower.includes('[warning]') || lower.includes('warn')) {
    return 'warn'
  }
  return ''
}

export function TaskPipelineLogPanel() {
  const currentTaskPipelineRun = useWorkflowStore((state) => state.currentTaskPipelineRun)
  const taskPipelineLogsByRunId = useWorkflowStore((state) => state.taskPipelineLogsByRunId)
  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  const runId = currentTaskPipelineRun?.id
  const logs = taskPipelineLogsByRunId[runId ?? ''] ?? []

  useEffect(() => {
    if (autoScroll && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (autoScroll && modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [autoScroll, logs.length])

  const visibleLogs = keyword.trim()
    ? logs.filter((line) => line.toLowerCase().includes(keyword.trim().toLowerCase()))
    : logs

  const isRunning = currentTaskPipelineRun?.status === 'running'

  const renderContent = () =>
    visibleLogs.length === 0 ? (
      <div className="log-empty">
        <Text>暂无任务链日志</Text>
        <Text type="secondary">执行任务链后日志将在此实时展示。</Text>
      </div>
    ) : (
      visibleLogs.map((line, index) => (
        <pre className={`log-line ${classifyLine(line)}`} key={`log-${index}`}>
          {line}
        </pre>
      ))
    )

  if (!currentTaskPipelineRun) {
    return null
  }

  return (
    <Card
      title="任务链日志"
      className="panel-card"
      size="small"
      extra={
        <Space wrap>
          <Tag color={isRunning ? 'processing' : currentTaskPipelineRun.status === 'success' ? 'success' : 'error'}>
            {currentTaskPipelineRun.pipelineName}
            {isRunning
              ? ` · ${currentTaskPipelineRun.steps.filter((s) => s.status === 'success').length}/${currentTaskPipelineRun.steps.length}`
              : ''}
          </Tag>
          <Button
            size="small"
            disabled={logs.length === 0}
            onClick={() => void navigator.clipboard?.writeText(logs.join('\n'))}
          >
            复制
          </Button>
          <Button size="small" type={autoScroll ? 'primary' : 'default'} onClick={() => setAutoScroll((v) => !v)}>
            自动滚动
          </Button>
          <Tooltip title="放大查看">
            <Button
              aria-label="放大查看日志"
              icon={<FullscreenOutlined />}
              size="small"
              onClick={() => setExpanded(true)}
            />
          </Tooltip>
        </Space>
      }
    >
      <Input
        allowClear
        size="small"
        className="log-search"
        placeholder="搜索日志关键词"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />
      <div className="log-panel" ref={panelRef} style={{height: 'min(40vh, 360px)'}}>
        {renderContent()}
      </div>
      <Modal
        title={`任务链日志 · ${currentTaskPipelineRun.pipelineName}`}
        open={expanded}
        footer={null}
        width="88vw"
        onCancel={() => setExpanded(false)}
      >
        <div className="log-panel log-panel-large" ref={modalPanelRef}>
          {renderContent()}
        </div>
      </Modal>
    </Card>
  )
}
