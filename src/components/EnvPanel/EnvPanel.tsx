import {Alert, Button, Card, Collapse, Input, Segmented, Space, Tag, Typography} from 'antd'
import {FileSearchOutlined, FolderOpenOutlined, ReloadOutlined} from '@ant-design/icons'
import {buildEnvironmentCenterItems, sourceText, statusColor,} from '../../services/environmentCenterService'
import {selectLocalDirectory, selectLocalFile} from '../../services/tauri-api'
import {useAppStore} from '../../store/useAppStore'
import type {EnvironmentSettings} from '../../types/domain'

const { Text } = Typography

export function EnvPanel() {
  const environment = useAppStore((state) => state.environment)
  const updateEnvironment = useAppStore((state) => state.updateEnvironment)
  const refreshEnvironment = useAppStore((state) => state.refreshEnvironment)

  const javaValue = environment?.javaHome ?? ''
  const mavenValue = environment?.mavenHome ?? environment?.mavenPath ?? ''
  const settingsValue = environment?.settingsXmlPath ?? ''
  const localRepoValue = environment?.localRepoPath ?? ''
  const items = buildEnvironmentCenterItems(environment)
  const currentExecutor = environment?.useMavenWrapper
    ? environment.mavenWrapperPath ?? 'mvnw.cmd'
    : environment?.mavenPath ?? 'mvn.cmd'

  const currentSettings = (patch: Partial<EnvironmentSettings>): EnvironmentSettings => ({
    javaHome: environment?.javaSource === 'manual' ? environment.javaHome : undefined,
    mavenHome: environment?.mavenSource === 'manual' ? environment.mavenHome : undefined,
    settingsXmlPath: environment?.settingsXmlSource === 'manual'
      ? environment.settingsXmlPath
      : undefined,
    localRepoPath: environment?.localRepoSource === 'manual'
      ? environment.localRepoPath
      : undefined,
    useMavenWrapper: environment?.useMavenWrapper ?? false,
    ...patch,
  })

  const saveJavaHome = (javaHome?: string) =>
    updateEnvironment(currentSettings({ javaHome }))

  const saveMavenHome = (mavenHome?: string) =>
    updateEnvironment(currentSettings({ mavenHome }))

  const saveSettingsXml = (settingsXmlPath?: string) =>
    updateEnvironment(currentSettings({ settingsXmlPath }))

  const saveLocalRepo = (localRepoPath?: string) =>
    updateEnvironment(currentSettings({ localRepoPath }))

  return (
    <Card
      title="环境中心"
      className="panel-card env-card"
      size="small"
      extra={
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={() => void refreshEnvironment()}
        >
          刷新
        </Button>
      }
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <div className="env-executor">
          <Text strong>当前执行器</Text>
          <Text className="env-summary-path" title={currentExecutor}>
            {currentExecutor}
          </Text>
        </div>
        <div className="env-summary-grid">
          {items.map((item) => (
            <div className="env-summary-item" key={item.key}>
              <div className="env-summary-main">
                <Text strong className="env-summary-title">
                  {item.title}
                </Text>
                <Space size={4} className="env-summary-tags">
                  <Tag color={statusColor(item.status)}>{item.value}</Tag>
                  <Tag>{sourceText(item.source)}</Tag>
                </Space>
              </div>
              <Text className="env-summary-path" type="secondary" title={item.detail}>
                {item.detail}
              </Text>
            </div>
          ))}

          <div className="env-summary-item env-wrapper-toggle">
            <div className="env-summary-main">
              <Text strong className="env-summary-title">
                执行器切换
              </Text>
              <Segmented
                className="env-executor-toggle"
                size="small"
                value={environment?.useMavenWrapper ? 'wrapper' : 'maven'}
                options={[
                  { label: 'Maven', value: 'maven' },
                  {
                    label: 'mvnw',
                    value: 'wrapper',
                    disabled: !environment?.hasMavenWrapper,
                  },
                ]}
                onChange={(value) =>
                  void updateEnvironment(
                    currentSettings({ useMavenWrapper: value === 'wrapper' }),
                  )
                }
              />
            </div>
            <Text className="env-summary-path" type="secondary">
              {environment?.hasMavenWrapper ? '可在 Maven 与 Wrapper 间切换' : '当前项目不可切换'}
            </Text>
          </div>
        </div>

        <Collapse
          ghost
          size="small"
          className="env-config-collapse"
          items={[
            {
              key: 'manual',
              label: '手动覆盖路径',
              children: (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <div className="env-row">
                    <Input.Group compact>
                      <Input
                        key={`java-${javaValue}`}
                        className="env-path-input env-path-input-single-action"
                        placeholder="选择或粘贴 JDK 目录"
                        defaultValue={javaValue}
                        onBlur={(event) =>
                          void saveJavaHome(event.target.value.trim() || undefined)
                        }
                        onPressEnter={(event) => event.currentTarget.blur()}
                      />
                      <Button
                        icon={<FolderOpenOutlined />}
                        onClick={async () => {
                          const selected = await selectLocalDirectory('选择 JDK 目录')
                          if (selected) {
                            await saveJavaHome(selected)
                          }
                        }}
                      >
                        JDK
                      </Button>
                    </Input.Group>
                  </div>

                  <div className="env-row">
                    <Input.Group compact>
                      <Input
                        key={`maven-${mavenValue}`}
                        className="env-path-input env-path-input-double-action"
                        placeholder="选择或粘贴 Maven 目录 / mvn.cmd"
                        defaultValue={mavenValue}
                        onBlur={(event) =>
                          void saveMavenHome(event.target.value.trim() || undefined)
                        }
                        onPressEnter={(event) => event.currentTarget.blur()}
                      />
                      <Button
                        icon={<FileSearchOutlined />}
                        onClick={async () => {
                          const selected = await selectLocalFile('选择 mvn.cmd')
                          if (selected) {
                            await saveMavenHome(selected)
                          }
                        }}
                      >
                        文件
                      </Button>
                      <Button
                        icon={<FolderOpenOutlined />}
                        onClick={async () => {
                          const selected = await selectLocalDirectory('选择 Maven 目录')
                          if (selected) {
                            await saveMavenHome(selected)
                          }
                        }}
                      >
                        目录
                      </Button>
                    </Input.Group>
                  </div>

                  <div className="env-row">
                    <Input.Group compact>
                      <Input
                        key={`settings-${settingsValue}`}
                        className="env-path-input env-path-input-single-action"
                        placeholder="选择或粘贴 settings.xml"
                        defaultValue={settingsValue}
                        onBlur={(event) =>
                          void saveSettingsXml(event.target.value.trim() || undefined)
                        }
                        onPressEnter={(event) => event.currentTarget.blur()}
                      />
                      <Button
                        icon={<FileSearchOutlined />}
                        onClick={async () => {
                          const selected = await selectLocalFile('选择 settings.xml')
                          if (selected) {
                            await saveSettingsXml(selected)
                          }
                        }}
                      >
                        settings
                      </Button>
                    </Input.Group>
                  </div>

                  <div className="env-row">
                    <Input.Group compact>
                      <Input
                        key={`repo-${localRepoValue}`}
                        className="env-path-input env-path-input-single-action"
                        placeholder="选择或粘贴本地仓库目录"
                        defaultValue={localRepoValue}
                        onBlur={(event) =>
                          void saveLocalRepo(event.target.value.trim() || undefined)
                        }
                        onPressEnter={(event) => event.currentTarget.blur()}
                      />
                      <Button
                        icon={<FolderOpenOutlined />}
                        onClick={async () => {
                          const selected = await selectLocalDirectory('选择本地仓库目录')
                          if (selected) {
                            await saveLocalRepo(selected)
                          }
                        }}
                      >
                        仓库
                      </Button>
                    </Input.Group>
                  </div>
                </Space>
              ),
            },
          ]}
        />

        {environment?.errors.map((error) => (
          <Alert key={error} type="warning" showIcon message={error} />
        ))}
      </Space>
    </Card>
  )
}
