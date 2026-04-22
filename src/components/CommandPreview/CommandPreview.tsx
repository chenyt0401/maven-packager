import {Button, Card, Input, List, Modal, Space, Tag, Typography} from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined
} from '@ant-design/icons'
import {useState} from 'react'
import {api} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {BuildStatus} from '../../types/domain'

const { TextArea } = Input
const { Text, Title } = Typography

const statusText: Record<BuildStatus, string> = {
  IDLE: '未开始',
  RUNNING: '执行中',
  SUCCESS: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
}

const statusColor: Record<BuildStatus, string> = {
  IDLE: 'default',
  RUNNING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'warning',
}

const formatSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${size} B`
}

export function CommandPreview() {
  const buildOptions = useAppStore((state) => state.buildOptions)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const artifacts = useAppStore((state) => state.artifacts)
  const durationMs = useAppStore((state) => state.durationMs)
  const project = useAppStore((state) => state.project)
  const selectedModules = useAppStore((state) => state.selectedModules)
  const setEditableCommand = useAppStore((state) => state.setEditableCommand)
  const refreshCommandPreview = useAppStore((state) => state.refreshCommandPreview)
  const startBuild = useAppStore((state) => state.startBuild)
  const cancelBuild = useAppStore((state) => state.cancelBuild)
  const saveTemplate = useAppStore((state) => state.saveTemplate)
  const [templateName, setTemplateName] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)

  const running = buildStatus === 'RUNNING'
  const durationText = durationMs ? `${(durationMs / 1000).toFixed(1)} 秒` : '暂无'
  const commandReady = Boolean(buildOptions.projectRoot && buildOptions.editableCommand.trim())
  const displayStatus = buildStatus === 'IDLE' && commandReady ? 'READY' : buildStatus
  const statusLabel = displayStatus === 'READY' ? '待执行' : statusText[buildStatus]
  const moduleSummary = selectedModules.length > 0
    ? selectedModules.length === 1
      ? selectedModules[0].artifactId
      : `${selectedModules.length} 个模块`
    : project
      ? '全部项目'
      : '未选择'

  return (
    <Card title="构建摘要" className="panel-card command-preview-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div className="command-status-bar">
          <div>
            <Text type="secondary">当前状态</Text>
            <div>
              <Tag color={displayStatus === 'READY' ? 'blue' : statusColor[buildStatus]} className="status-tag">
                {statusLabel}
              </Tag>
              <Text type="secondary">耗时：{durationText}</Text>
            </div>
            <Text type="secondary">目标：{moduleSummary}</Text>
          </div>
          <div className="command-actions">
            <Button icon={<ReloadOutlined />} onClick={() => void refreshCommandPreview()}>
              重新生成
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={!buildOptions.projectRoot || !buildOptions.editableCommand.trim() || running}
              onClick={() => void startBuild()}
            >
              开始打包
            </Button>
            <Button danger icon={<StopOutlined />} disabled={!running} onClick={() => void cancelBuild()}>
              停止
            </Button>
            <Button
              icon={<CopyOutlined />}
              disabled={!buildOptions.editableCommand.trim()}
              onClick={() => void navigator.clipboard?.writeText(buildOptions.editableCommand)}
            >
              复制命令
            </Button>
            <Button icon={<SaveOutlined />} disabled={!buildOptions.projectRoot} onClick={() => setTemplateOpen(true)}>
              保存模板
            </Button>
          </div>
        </div>
        <div>
          <Title level={5} className="command-editor-title">最终执行命令</Title>
          <Text type="secondary">
            执行前会使用这里的命令；你可以直接编辑。
          </Text>
        </div>
        <TextArea
          className="command-textarea"
          rows={5}
          value={buildOptions.editableCommand}
          onChange={(event) => setEditableCommand(event.target.value)}
        />
        {(buildStatus === 'SUCCESS' || artifacts.length > 0) ? (
          <div className="artifact-section">
            <div className="artifact-section-title">
              <Title level={5} className="command-editor-title">构建产物</Title>
              <Text type="secondary">{artifacts.length > 0 ? `已发现 ${artifacts.length} 个 jar/war` : '未扫描到 jar/war 产物'}</Text>
            </div>
            {artifacts.length > 0 ? (
              <List
                size="small"
                dataSource={artifacts}
                renderItem={(artifact) => (
                  <List.Item
                    actions={[
                      <Button
                        key="open"
                        icon={<FolderOpenOutlined />}
                        size="small"
                        onClick={() => void api.openPathInExplorer(artifact.path)}
                      >
                        定位
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={2} className="artifact-item">
                      <Text strong ellipsis={{ tooltip: artifact.path }}>{artifact.fileName}</Text>
                      <Text type="secondary" className="artifact-meta">
                        {formatSize(artifact.sizeBytes)}
                        {artifact.modulePath ? ` · ${artifact.modulePath}` : ''}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : null}
          </div>
        ) : null}
      </Space>
      <Modal
        title="保存常用模板"
        open={templateOpen}
        okText="保存"
        cancelText="取消"
        onCancel={() => setTemplateOpen(false)}
        onOk={() => {
          if (templateName.trim()) {
            void saveTemplate(templateName.trim())
            setTemplateName('')
            setTemplateOpen(false)
          }
        }}
      >
        <Input
          placeholder="模板名称"
          value={templateName}
          onChange={(event) => setTemplateName(event.target.value)}
        />
      </Modal>
    </Card>
  )
}
