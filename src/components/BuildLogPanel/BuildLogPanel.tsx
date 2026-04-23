import {CopyOutlined, FullscreenOutlined} from '@ant-design/icons'
import {Button, Card, Empty, Input, List, Modal, Space, Tag, Tooltip, Typography} from 'antd'
import {useEffect, useRef, useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import type {BuildDiagnosis, BuildLogEvent, BuildStatus} from '../../types/domain'

const { Text } = Typography

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: 'BUILDING',
  SUCCESS: 'BUILD SUCCESS',
  FAILED: 'BUILD FAILED',
  CANCELLED: '已停止',
}

const statusColor: Record<BuildStatus, string> = {
  IDLE: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

const diagnosisCategoryText: Record<BuildDiagnosis['category'], string> = {
  jdk_mismatch: 'JDK 版本不匹配',
  maven_missing: 'Maven 不存在',
  wrapper_issue: 'Wrapper 失效',
  settings_missing: 'settings.xml 缺失',
  dependency_download_failed: '依赖下载失败',
  repo_unreachable: '私服不可达',
  profile_invalid: 'profile 不存在',
  module_invalid: '模块路径错误',
  test_failed: '单元测试失败',
  unknown: '未知错误',
}

const classifyLog = (event: BuildLogEvent) => {
  const line = event.line.toLowerCase()
  if (line.includes('build success')) {
    return 'success'
  }
  if (
    line.includes('[error]') ||
    line.includes('build failure') ||
    line.includes('could not resolve dependencies') ||
    line.includes('java_home is not defined correctly') ||
    line.includes('non-resolvable parent pom')
  ) {
    return 'error'
  }
  if (line.includes('[warning]')) {
    return 'warn'
  }
  return ''
}

export function BuildLogPanel() {
  const logs = useAppStore((state) => state.logs)
  const diagnosis = useAppStore((state) => state.diagnosis)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const buildCancelling = useAppStore((state) => state.buildCancelling)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const clearBuildLogs = useAppStore((state) => state.clearBuildLogs)
  const panelRef = useRef<HTMLDivElement>(null)
  const modalPanelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
    if (autoScroll && modalPanelRef.current) {
      modalPanelRef.current.scrollTop = modalPanelRef.current.scrollHeight
    }
  }, [autoScroll, logs])

  const visibleLogs = keyword.trim()
    ? logs.filter((event) => event.line.toLowerCase().includes(keyword.trim().toLowerCase()))
    : logs

  const renderContent = () =>
    visibleLogs.length === 0 ? (
      <div className="log-empty">
        <Text>准备开始构建</Text>
        <Text type="secondary">请选择模块并点击“开始打包”。</Text>
      </div>
    ) : (
      visibleLogs.map((event, index) => (
        <pre className={`log-line ${classifyLog(event)}`} key={`${event.buildId}-${index}`}>
          {event.line}
        </pre>
      ))
    )

  const copyDiagnosis = () => {
    if (!diagnosis) {
      return
    }

    const content = [
      `错误类型：${diagnosisCategoryText[diagnosis.category]}`,
      `摘要：${diagnosis.summary}`,
      '',
      '可能原因：',
      ...diagnosis.possibleCauses.map((item) => `- ${item}`),
      '',
      '建议动作：',
      ...diagnosis.suggestedActions.map((item) => `- ${item}`),
      '',
      '关键日志：',
      ...diagnosis.keywordLines.map((item) => `> ${item}`),
    ].join('\n')
    void navigator.clipboard?.writeText(content)
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card
        title="实时日志"
        className="panel-card"
        size="small"
        extra={
          <Space wrap>
            <Tag color={statusColor[buildStatus]}>{statusText[buildStatus]}</Tag>
            <Button
              size="small"
              disabled={buildStatus !== 'RUNNING' || buildCancelling}
              onClick={() => void cancelBuild()}
            >
              停止
            </Button>
            <Button size="small" onClick={clearBuildLogs}>
              清空
            </Button>
            <Button
              size="small"
              disabled={logs.length === 0}
              onClick={() => void navigator.clipboard?.writeText(logs.map((event) => event.line).join('\n'))}
            >
              复制
            </Button>
            <Button size="small" type={autoScroll ? 'primary' : 'default'} onClick={() => setAutoScroll((value) => !value)}>
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
        <div className="log-panel" ref={panelRef}>
          {renderContent()}
        </div>
        <Modal
          title="实时日志"
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

      <Card
        title="诊断面板"
        className="panel-card diagnosis-card"
        size="small"
        extra={
          <Button
            size="small"
            icon={<CopyOutlined />}
            disabled={!diagnosis}
            onClick={copyDiagnosis}
          >
            复制诊断结果
          </Button>
        }
      >
        {diagnosis ? (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Space size={8} wrap>
              <Tag color="error">{diagnosisCategoryText[diagnosis.category]}</Tag>
              <Text strong>{diagnosis.summary}</Text>
            </Space>
            <div className="diagnosis-grid">
              <div>
                <Text strong>可能原因</Text>
                <List
                  size="small"
                  dataSource={diagnosis.possibleCauses}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
              <div>
                <Text strong>建议动作</Text>
                <List
                  size="small"
                  dataSource={diagnosis.suggestedActions}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </div>
            </div>
            <div>
              <Text strong>高价值关键字行</Text>
              <div className="diagnosis-keyword-lines">
                {diagnosis.keywordLines.slice(0, 6).map((line, index) => (
                  <pre key={`${diagnosis.id}-${index}`}>{line}</pre>
                ))}
              </div>
            </div>
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={buildStatus === 'FAILED' ? '暂无可用诊断' : '构建失败后自动生成诊断'}
          />
        )}
      </Card>
    </Space>
  )
}
