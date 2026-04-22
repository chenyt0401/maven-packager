import {Alert, Button, Card, Input, Select, Space, Typography} from 'antd'
import {DownloadOutlined, FolderOpenOutlined, ReloadOutlined} from '@ant-design/icons'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'

const { Text } = Typography

export function ProjectSelector() {
  const project = useAppStore((state) => state.project)
  const error = useAppStore((state) => state.error)
  const loading = useAppStore((state) => state.loading)
  const gitStatus = useAppStore((state) => state.gitStatus)
  const gitChecking = useAppStore((state) => state.gitChecking)
  const gitPulling = useAppStore((state) => state.gitPulling)
  const gitSwitching = useAppStore((state) => state.gitSwitching)
  const chooseProject = useAppStore((state) => state.chooseProject)
  const parseProjectPath = useAppStore((state) => state.parseProjectPath)
  const fetchGitUpdates = useAppStore((state) => state.fetchGitUpdates)
  const pullGitUpdates = useAppStore((state) => state.pullGitUpdates)
  const switchGitBranch = useAppStore((state) => state.switchGitBranch)
  const [manualPath, setManualPath] = useState('')

  const currentPath = project?.rootPath ?? ''

  return (
    <Card title="项目目录" className="panel-card" size="small">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Button
          type="primary"
          icon={<FolderOpenOutlined />}
          block
          loading={loading}
          onClick={chooseProject}
        >
          选择 Maven 项目
        </Button>
        <Input.Search
          placeholder="也可以粘贴项目根目录"
          enterButton={<ReloadOutlined />}
          value={manualPath}
          onChange={(event) => setManualPath(event.target.value)}
          onSearch={(value) => {
            if (value.trim()) {
              void parseProjectPath(value.trim())
            }
          }}
        />
        {currentPath ? (
          <Text className="path-text" type="secondary">
            {currentPath}
          </Text>
        ) : (
          <Text type="secondary">请选择包含 pom.xml 的父工程目录。</Text>
        )}
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {gitStatus?.isGitRepo ? (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Text type="secondary">
              当前 Git 分支
            </Text>
            <Select
              showSearch
              size="small"
              value={gitStatus.branch}
              placeholder="当前处于 detached HEAD 或无本地分支"
              loading={gitChecking || gitSwitching}
              disabled={gitSwitching || gitStatus.branches.length === 0}
              options={gitStatus.branches.map((branch) => ({
                label: branch.isCurrent ? `${branch.name}（当前）` : branch.name,
                value: branch.name,
              }))}
              onChange={(branchName) => {
                if (branchName !== gitStatus.branch) {
                  void switchGitBranch(branchName)
                }
              }}
            />
            {gitStatus.hasLocalChanges ? (
              <Text type="warning">
                检测到本地未提交改动，切换分支可能失败；建议优先在代码编辑器中切换以便处理冲突。
              </Text>
            ) : null}
          </Space>
        ) : null}
        {gitStatus?.isGitRepo && gitStatus.hasRemoteUpdates ? (
          <Alert
            type="warning"
            showIcon
            message={`远端有 ${gitStatus.behindCount} 个提交尚未拉取`}
            description={
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text>
                  当前分支 {gitStatus.branch ?? '未知'} 跟踪 {gitStatus.upstream ?? '未知'}。
                  建议优先在 VS Code、IDEA 等代码编辑器中执行 Git Pull，这样更容易查看并解决冲突。
                  应用内拉取会使用 git pull --ff-only，遇到冲突或需要合并时会停止。
                </Text>
                {gitStatus.hasLocalChanges ? (
                  <Text type="warning">
                    检测到本地未提交改动，建议先在代码编辑器中确认改动后再拉取。
                  </Text>
                ) : null}
                <Space wrap>
                  <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={gitChecking}
                    onClick={() => void fetchGitUpdates()}
                  >
                    检查远端
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={gitPulling}
                    onClick={() => void pullGitUpdates()}
                  >
                    应用内拉取
                  </Button>
                </Space>
              </Space>
            }
          />
        ) : null}
        {gitStatus?.isGitRepo && !gitStatus.hasRemoteUpdates && gitStatus.message ? (
          <Alert
            type={gitStatus.upstream ? 'success' : 'info'}
            showIcon
            message={gitStatus.message}
            action={
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={gitChecking}
                onClick={() => void fetchGitUpdates()}
              >
                检查远端
              </Button>
            }
          />
        ) : null}
      </Space>
    </Card>
  )
}
