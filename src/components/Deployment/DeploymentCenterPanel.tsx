import {
    Alert,
    Button,
    Card,
    Checkbox,
    Empty,
    Input,
    List,
    Modal,
    Popconfirm,
    Select,
    Space,
    Steps,
    Tabs,
    Tag,
    Typography,
} from 'antd'
import {DeleteOutlined, PlayCircleOutlined, SaveOutlined, StopOutlined} from '@ant-design/icons'
import {useMemo, useState} from 'react'
import {selectLocalFile} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import {useWorkflowStore} from '../../store/useWorkflowStore'
import type {
    BuildArtifact,
    DeploymentProfile,
    DeploymentStage,
    MavenModule,
    SaveServerProfilePayload,
    ServerProfile,
} from '../../types/domain'

const {Text} = Typography

const flattenModules = (modules: MavenModule[]): MavenModule[] =>
  modules.flatMap((module) => [module, ...flattenModules(module.children ?? [])])

const createServerDraft = (): SaveServerProfilePayload => ({
  name: '',
  host: '',
  port: 22,
  username: '',
  authType: 'private_key',
  password: '',
  privateKeyPath: '',
  group: '',
})

const createDeploymentDraft = (): DeploymentProfile => ({
  id: crypto.randomUUID(),
  name: '',
  moduleId: '',
  localArtifactPattern: '*.jar',
  remoteDeployPath: '',
  stopCommand: '',
  stopCommandEnabled: false,
  startCommand: '',
  startCommandEnabled: false,
  restartCommand: '',
  restartCommandEnabled: false,
  healthCheckUrl: '',
  healthCheckEnabled: false,
})

const deploymentStageStatus = (status: DeploymentStage['status']) => {
  switch (status) {
    case 'success': return 'finish'
    case 'failed': return 'error'
    case 'cancelled': return 'error'
    case 'running': return 'process'
    default: return 'wait'
  }
}

const deploymentTaskFinished = (status?: string) =>
  Boolean(status && ['success', 'failed', 'cancelled'].includes(status))

const deploymentTaskLabel = (status: string) => {
  switch (status) {
    case 'success': return '部署完成'
    case 'failed': return '部署失败'
    case 'cancelled': return '已停止'
    default: return '部署中'
  }
}

const deploymentTaskColor = (status: string) => {
  switch (status) {
    case 'success': return 'green'
    case 'failed': return 'red'
    case 'cancelled': return 'orange'
    default: return 'processing'
  }
}

const defaultDeploymentStages: DeploymentStage[] = [
  {key: 'upload', label: '上传产物', status: 'pending'},
  {key: 'stop', label: '停止旧服务', status: 'pending'},
  {key: 'replace', label: '替换文件', status: 'pending'},
  {key: 'start', label: '启动服务', status: 'pending'},
  {key: 'health', label: '健康检查', status: 'pending'},
]

const deploymentProgressCurrent = (stages: DeploymentStage[]) => {
  const activeIndex = stages.findIndex((stage) => stage.status === 'running')
  if (activeIndex >= 0) {
    return activeIndex
  }
  const pendingIndex = stages.findIndex((stage) => stage.status === 'pending')
  if (pendingIndex >= 0) {
    return pendingIndex
  }
  return Math.max(stages.length - 1, 0)
}

const globToRegex = (pattern: string) =>
  new RegExp(`^${pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')}$`, 'i')

const collectArtifacts = (currentArtifacts: BuildArtifact[], historyArtifacts: BuildArtifact[]) => {
  const all = [...currentArtifacts, ...historyArtifacts]
  const seen = new Set<string>()
  return all.filter((artifact) => {
    if (seen.has(artifact.path)) {
      return false
    }
    seen.add(artifact.path)
    return true
  })
}

const normalizePath = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

const normalizeModulePath = (value?: string) => (value ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')

export function DeploymentCenterPanel() {
  const project = useAppStore((state) => state.project)
  const artifacts = useAppStore((state) => state.artifacts)
  const history = useAppStore((state) => state.history)
  const buildOptions = useAppStore((state) => state.buildOptions)
  const buildStatus = useAppStore((state) => state.buildStatus)
  const startPackageBuild = useAppStore((state) => state.startPackageBuild)
  const error = useWorkflowStore((state) => state.error)
  const serverProfiles = useWorkflowStore((state) => state.serverProfiles)
  const deploymentProfiles = useWorkflowStore((state) => state.deploymentProfiles)
  const currentDeploymentTask = useWorkflowStore((state) => state.currentDeploymentTask)
  const saveServerProfile = useWorkflowStore((state) => state.saveServerProfile)
  const deleteServerProfile = useWorkflowStore((state) => state.deleteServerProfile)
  const saveDeploymentProfile = useWorkflowStore((state) => state.saveDeploymentProfile)
  const deleteDeploymentProfile = useWorkflowStore((state) => state.deleteDeploymentProfile)
  const startDeployment = useWorkflowStore((state) => state.startDeployment)
  const cancelDeployment = useWorkflowStore((state) => state.cancelDeployment)
  const [serverDraft, setServerDraft] = useState<SaveServerProfilePayload>(createServerDraft())
  const [deploymentDraft, setDeploymentDraft] = useState<DeploymentProfile>(createDeploymentDraft())
  const [selectedDeploymentProfileId, setSelectedDeploymentProfileId] = useState<string>()
  const [selectedServerId, setSelectedServerId] = useState<string>()
  const [selectedArtifactPath, setSelectedArtifactPath] = useState<string>()

  const projectRoot = project?.rootPath ?? ''
  const modules = useMemo(() => flattenModules(project?.modules ?? []), [project?.modules])
  const moduleById = useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules],
  )
  const artifactPool = useMemo(
    () => {
      const currentProjectRoot = projectRoot ? normalizePath(projectRoot) : ''
      const historyArtifacts = currentProjectRoot
        ? history
            .filter((item) => normalizePath(item.projectRoot) === currentProjectRoot)
            .flatMap((item) => item.artifacts ?? [])
        : []

      return collectArtifacts(artifacts, historyArtifacts)
    },
    [artifacts, history, projectRoot],
  )
  const selectedProfile = deploymentProfiles.find((item) => item.id === selectedDeploymentProfileId)
  const selectedProfileModule = selectedProfile?.moduleId ? moduleById.get(selectedProfile.moduleId) : undefined
  const selectedProfileModuleMissing = Boolean(selectedProfile?.moduleId && !selectedProfileModule)
  const selectedServer = serverProfiles.find((item) => item.id === selectedServerId)
  const deploymentStages = currentDeploymentTask?.stages.length ? currentDeploymentTask.stages : defaultDeploymentStages
  const deploymentRunning = Boolean(currentDeploymentTask && !deploymentTaskFinished(currentDeploymentTask.status))
  const buildRunning = buildStatus === 'RUNNING'
  const packageBuildGoals = buildOptions.goals.some((goal) => ['package', 'install', 'verify', 'deploy'].includes(goal))
    ? buildOptions.goals
    : Array.from(new Set([...(buildOptions.goals.length > 0 ? buildOptions.goals : ['clean']), 'package']))
  const artifactOptions = useMemo(() => {
    const pattern = selectedProfile?.localArtifactPattern?.trim()
    const matcher = pattern ? globToRegex(pattern) : undefined
    const modulePath = selectedProfileModule
      ? normalizeModulePath(selectedProfileModule.relativePath)
      : undefined

    if (selectedProfile?.moduleId && !selectedProfileModule) {
      return []
    }

    return artifactPool
      .filter((artifact) => !matcher || matcher.test(artifact.fileName))
      .filter((artifact) => modulePath === undefined || normalizeModulePath(artifact.modulePath) === modulePath)
      .map((artifact) => ({
        label: `${artifact.fileName}${artifact.modulePath ? ` · ${artifact.modulePath}` : ''}`,
        value: artifact.path,
      }))
  }, [artifactPool, selectedProfile?.localArtifactPattern, selectedProfile?.moduleId, selectedProfileModule])
  const showPackageArtifactHint = Boolean(selectedProfile && !selectedProfileModuleMissing && artifactOptions.length === 0)
  const packageTargetLabel = selectedProfileModule?.artifactId ?? '当前项目'
  const buildOptionSummary = [
    packageBuildGoals.join(' '),
    buildOptions.alsoMake ? '同时构建依赖' : '仅目标模块',
    buildOptions.skipTests ? '跳过测试' : '执行测试',
  ].join('；')

  const openServer = (profile: ServerProfile) => {
    setServerDraft({
      id: profile.id,
      name: profile.name,
      host: profile.host,
      port: profile.port,
      username: profile.username,
      authType: profile.authType,
      password: '',
      privateKeyPath: profile.privateKeyPath,
      group: profile.group,
    })
  }

  const openDeployment = (profile: DeploymentProfile) => {
    setDeploymentDraft(profile)
  }

  const packageDeploymentArtifact = async () => {
    if (!selectedProfile || selectedProfileModuleMissing) {
      return
    }

    await startPackageBuild(selectedProfile.moduleId ? [selectedProfile.moduleId] : [])
  }

  return (
    <Card title="部署中心" className="panel-card" size="small">
      <Space direction="vertical" size={16} style={{width: '100%'}}>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <Tabs
          items={[
            {
              key: 'server',
              label: '服务器管理',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Space wrap>
                    <Input
                      placeholder="名称"
                      value={serverDraft.name}
                      onChange={(event) => setServerDraft((state) => ({...state, name: event.target.value}))}
                    />
                    <Input
                      placeholder="Host"
                      value={serverDraft.host}
                      onChange={(event) => setServerDraft((state) => ({...state, host: event.target.value}))}
                    />
                    <Input
                      placeholder="端口"
                      style={{width: 100}}
                      value={String(serverDraft.port)}
                      onChange={(event) => setServerDraft((state) => ({...state, port: Number(event.target.value) || 22}))}
                    />
                    <Input
                      placeholder="用户名"
                      value={serverDraft.username}
                      onChange={(event) => setServerDraft((state) => ({...state, username: event.target.value}))}
                    />
                  </Space>
                  <Space wrap>
                    <Select
                      value={serverDraft.authType}
                      style={{width: 160}}
                      options={[
                        {label: '私钥认证', value: 'private_key'},
                        {label: '密码认证', value: 'password'},
                      ]}
                      onChange={(value) => setServerDraft((state) => ({...state, authType: value}))}
                    />
                    {serverDraft.authType === 'private_key' ? (
                      <Input
                        placeholder="私钥路径"
                        style={{minWidth: 280}}
                        value={serverDraft.privateKeyPath}
                        onChange={(event) => setServerDraft((state) => ({...state, privateKeyPath: event.target.value}))}
                      />
                    ) : (
                      <Input.Password
                        placeholder="密码（留空则保留原密码）"
                        style={{minWidth: 260}}
                        value={serverDraft.password}
                        onChange={(event) => setServerDraft((state) => ({...state, password: event.target.value}))}
                      />
                    )}
                    <Input
                      placeholder="分组"
                      value={serverDraft.group}
                      onChange={(event) => setServerDraft((state) => ({...state, group: event.target.value}))}
                    />
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      onClick={() => void saveServerProfile(serverDraft)}
                    >
                      保存服务器
                    </Button>
                    <Button onClick={() => setServerDraft(createServerDraft())}>重置</Button>
                  </Space>
                  {serverProfiles.length === 0 ? (
                    <Empty description="暂无服务器配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      bordered
                      dataSource={serverProfiles}
                      renderItem={(profile) => (
                        <List.Item
                          actions={[
                            <Button key="edit" size="small" onClick={() => openServer(profile)}>
                              编辑
                            </Button>,
                            <Popconfirm
                              key="delete"
                              title="删除服务器配置？"
                              okText="删除"
                              cancelText="取消"
                              onConfirm={() => void deleteServerProfile(profile.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <Space direction="vertical" size={2}>
                            <Text strong>{profile.name}</Text>
                            <Text type="secondary">
                              {profile.username}@{profile.host}:{profile.port}
                            </Text>
                            <Space size={8} wrap>
                              <Tag>{profile.authType}</Tag>
                              {profile.passwordConfigured ? <Tag color="gold">已保存密码</Tag> : null}
                              {profile.group ? <Tag>{profile.group}</Tag> : null}
                            </Space>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'profile',
              label: '部署配置',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Input
                    addonBefore="名称"
                    value={deploymentDraft.name}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, name: event.target.value}))}
                  />
                  <Space wrap>
                    <Select
                      placeholder="绑定模块（用于筛选产物）"
                      style={{minWidth: 260}}
                      value={deploymentDraft.moduleId || undefined}
                      options={modules.map((item) => ({
                        label: `${item.artifactId}${item.relativePath ? ` · ${item.relativePath}` : ''}`,
                        value: item.id,
                      }))}
                      onChange={(value) => setDeploymentDraft((state) => ({...state, moduleId: value}))}
                    />
                    <Input
                      placeholder="产物匹配规则，如 *.jar"
                      style={{minWidth: 220}}
                      value={deploymentDraft.localArtifactPattern}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, localArtifactPattern: event.target.value}))}
                    />
                  </Space>
                  <Input
                    addonBefore="远端目录"
                    value={deploymentDraft.remoteDeployPath}
                    onChange={(event) => setDeploymentDraft((state) => ({...state, remoteDeployPath: event.target.value}))}
                  />
                  <Space direction="vertical" size={8} style={{width: '100%'}}>
                    <Checkbox
                      checked={deploymentDraft.stopCommandEnabled}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, stopCommandEnabled: event.target.checked}))}
                    >
                      执行停止命令
                    </Checkbox>
                    <Input
                      disabled={!deploymentDraft.stopCommandEnabled}
                      placeholder="停止命令"
                      value={deploymentDraft.stopCommand}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, stopCommand: event.target.value}))}
                    />
                  </Space>
                  <Space direction="vertical" size={8} style={{width: '100%'}}>
                    <Checkbox
                      checked={deploymentDraft.startCommandEnabled}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, startCommandEnabled: event.target.checked}))}
                    >
                      执行启动命令
                    </Checkbox>
                    <Input
                      disabled={!deploymentDraft.startCommandEnabled}
                      placeholder="启动命令"
                      value={deploymentDraft.startCommand}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, startCommand: event.target.value}))}
                    />
                  </Space>
                  <Space direction="vertical" size={8} style={{width: '100%'}}>
                    <Checkbox
                      checked={deploymentDraft.restartCommandEnabled}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, restartCommandEnabled: event.target.checked}))}
                    >
                      执行重启命令
                    </Checkbox>
                    <Input
                      disabled={!deploymentDraft.restartCommandEnabled}
                      placeholder="重启命令（启用时优先于启动命令）"
                      value={deploymentDraft.restartCommand}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, restartCommand: event.target.value}))}
                    />
                  </Space>
                  <Space direction="vertical" size={8} style={{width: '100%'}}>
                    <Checkbox
                      checked={deploymentDraft.healthCheckEnabled}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, healthCheckEnabled: event.target.checked}))}
                    >
                      执行健康检查
                    </Checkbox>
                    <Input
                      disabled={!deploymentDraft.healthCheckEnabled}
                      placeholder="URL 或远端命令，例如 http://127.0.0.1:8080/actuator/health / uname -r"
                      value={deploymentDraft.healthCheckUrl}
                      onChange={(event) => setDeploymentDraft((state) => ({...state, healthCheckUrl: event.target.value}))}
                    />
                  </Space>
                  <Space wrap>
                    <Button type="primary" icon={<SaveOutlined />} onClick={() => void saveDeploymentProfile(deploymentDraft)}>
                      保存部署配置
                    </Button>
                    <Button onClick={() => setDeploymentDraft(createDeploymentDraft())}>
                      新建配置
                    </Button>
                  </Space>
                  {deploymentProfiles.length === 0 ? (
                    <Empty description="暂无部署配置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      bordered
                      dataSource={deploymentProfiles}
                      renderItem={(profile) => (
                        <List.Item
                          actions={[
                            <Button key="edit" size="small" onClick={() => openDeployment(profile)}>
                              编辑
                            </Button>,
                            <Popconfirm
                              key="delete"
                              title="删除部署配置？"
                              okText="删除"
                              cancelText="取消"
                              onConfirm={() => void deleteDeploymentProfile(profile.id)}
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                            </Popconfirm>,
                          ]}
                        >
                          <Space direction="vertical" size={2}>
                            <Text strong>{profile.name}</Text>
                            <Text type="secondary">
                              模块：{profile.moduleId ? (moduleById.get(profile.moduleId)?.artifactId ?? '当前项目不存在该模块') : '未绑定'}
                            </Text>
                            <Text type="secondary">{profile.remoteDeployPath}</Text>
                            <Text type="secondary">匹配：{profile.localArtifactPattern}</Text>
                          </Space>
                        </List.Item>
                      )}
                    />
                  )}
                </Space>
              ),
            },
            {
              key: 'run',
              label: '一键部署',
              children: (
                <Space direction="vertical" size={16} style={{width: '100%'}}>
                  <Select
                    placeholder="选择部署配置"
                    style={{minWidth: 260}}
                    value={selectedDeploymentProfileId}
                    options={deploymentProfiles.map((item) => ({label: item.name, value: item.id}))}
                    onChange={(value) => {
                      setSelectedDeploymentProfileId(value)
                      setSelectedArtifactPath(undefined)
                    }}
                  />
                  <Select
                    placeholder="选择目标服务器"
                    style={{minWidth: 260}}
                    value={selectedServerId}
                    options={serverProfiles.map((item) => ({
                      label: `${item.name}（${item.username}@${item.host}:${item.port}）`,
                      value: item.id,
                    }))}
                    onChange={setSelectedServerId}
                    notFoundContent="请先在服务器管理中添加服务器"
                  />
                  <Select
                    placeholder="选择构建产物（来自配置绑定模块）"
                    style={{minWidth: 260}}
                    value={selectedArtifactPath}
                    options={artifactOptions}
                    onChange={setSelectedArtifactPath}
                    notFoundContent={
                      selectedProfile
                        ? selectedProfileModuleMissing
                          ? '部署配置绑定的模块不在当前项目中'
                          : '当前项目没有匹配该模块和规则的本地产物'
                        : '先选择部署配置'
                    }
                  />
                  {showPackageArtifactHint ? (
                    <Alert
                      type={buildRunning ? 'info' : 'warning'}
                      showIcon
                      message={buildRunning ? '正在打包产物' : '当前没有可部署产物'}
                      description={(
                        <Space direction="vertical" size={4}>
                          <Text type="secondary">
                            目标：{packageTargetLabel}；匹配规则：{selectedProfile?.localArtifactPattern || '*.jar'}
                          </Text>
                          <Text type="secondary">打包选项：{buildOptionSummary}</Text>
                        </Space>
                      )}
                      action={(
                        <Button
                          type="primary"
                          icon={<PlayCircleOutlined />}
                          loading={buildRunning}
                          disabled={buildRunning || !projectRoot}
                          onClick={() => void packageDeploymentArtifact()}
                        >
                          打包产物
                        </Button>
                      )}
                    />
                  ) : null}
                  <Space wrap>
                    <Button
                      onClick={() => {
                        void selectLocalFile('选择要部署的本地产物').then((path) => {
                          if (path) {
                            setSelectedArtifactPath(path)
                          }
                        })
                      }}
                    >
                      手动选择产物
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      disabled={!selectedDeploymentProfileId || !selectedServerId || !selectedArtifactPath || selectedProfileModuleMissing || deploymentRunning}
                      onClick={() => {
                        Modal.confirm({
                          title: '确认执行部署？',
                          content: `将部署到 ${selectedServer?.name ?? '目标服务器'}（${selectedServer?.host ?? ''}），请确认配置无误。`,
                          okText: '确认部署',
                          cancelText: '取消',
                          onOk: () => startDeployment(selectedDeploymentProfileId!, selectedServerId!, selectedArtifactPath!),
                        })
                      }}
                    >
                      开始部署
                    </Button>
                    <Button
                      danger
                      icon={<StopOutlined />}
                      disabled={!deploymentRunning || !currentDeploymentTask}
                      onClick={() => {
                        if (currentDeploymentTask) {
                          void cancelDeployment(currentDeploymentTask.id)
                        }
                      }}
                    >
                      停止部署
                    </Button>
                  </Space>
                  {selectedProfile ? (
                    <Alert
                      type={selectedProfileModuleMissing ? 'warning' : 'info'}
                      showIcon
                      message={`部署配置：${selectedProfile.name}`}
                      description={`模块：${selectedProfileModule?.artifactId ?? (selectedProfile.moduleId ? '当前项目不存在该模块' : '未绑定')}；目标目录：${selectedProfile.remoteDeployPath}；匹配规则：${selectedProfile.localArtifactPattern}${selectedServer ? `；服务器：${selectedServer.name}` : ''}`}
                    />
                  ) : null}
                  {currentDeploymentTask ? (
                    <div className="pipeline-run-bar">
                      <Space size={8} wrap className="pipeline-run-heading">
                          <Tag color={deploymentTaskColor(currentDeploymentTask.status)}>
                            {deploymentTaskLabel(currentDeploymentTask.status)}
                          </Tag>
                          <Text>{currentDeploymentTask.deploymentProfileName ?? currentDeploymentTask.deploymentProfileId}</Text>
                      </Space>
                      <Text type="secondary" className="path-text">{currentDeploymentTask.artifactPath}</Text>
                      <Steps
                        direction="vertical"
                        size="small"
                        current={deploymentProgressCurrent(deploymentStages)}
                        status={['failed', 'cancelled'].includes(currentDeploymentTask.status) ? 'error' : currentDeploymentTask.status === 'success' ? 'finish' : 'process'}
                        items={deploymentStages.map((stage) => ({
                          title: stage.label,
                          status: deploymentStageStatus(stage.status),
                          description: stage.message,
                        }))}
                      />
                    </div>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
      </Space>
    </Card>
  )
}
