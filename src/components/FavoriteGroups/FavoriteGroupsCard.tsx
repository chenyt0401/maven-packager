import {Button, Card, Empty, Input, List, Modal, Popconfirm, Space, Tooltip, Typography} from 'antd'
import {DeleteOutlined, EditOutlined, PushpinFilled, PushpinOutlined, SaveOutlined} from '@ant-design/icons'
import {useState} from 'react'
import {useAppStore} from '../../store/useAppStore'
import type {BuildTemplate} from '../../types/domain'

const { Text } = Typography

export function FavoriteGroupsCard() {
  const project = useAppStore((state) => state.project)
  const templates = useAppStore((state) => state.templates)
  const applyTemplate = useAppStore((state) => state.applyTemplate)
  const saveTemplate = useAppStore((state) => state.saveTemplate)
  const updateTemplate = useAppStore((state) => state.updateTemplate)
  const deleteTemplate = useAppStore((state) => state.deleteTemplate)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<BuildTemplate>()
  const [name, setName] = useState('')
  const [editingName, setEditingName] = useState('')

  const openEdit = (template: BuildTemplate) => {
    setEditing(template)
    setEditingName(template.name)
  }

  const saveEditing = () => {
    if (!editing || !editingName.trim()) {
      return
    }
    void updateTemplate({ ...editing, name: editingName.trim() })
    setEditing(undefined)
    setEditingName('')
  }

  return (
    <Card
      title="常用组合"
      className="panel-card favorite-groups-card"
      size="small"
      extra={
        <Button
          size="small"
          type="text"
          icon={<SaveOutlined />}
          disabled={!project}
          onClick={() => setSaving(true)}
        />
      }
    >
      {templates.length === 0 ? (
        <Empty description="暂无常用组合" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          size="small"
          dataSource={templates}
          renderItem={(template) => (
            <List.Item
              actions={[
                <Tooltip key="pin" title={template.pinned ? '取消置顶' : '置顶'}>
                  <Button
                    aria-label={template.pinned ? '取消置顶' : '置顶'}
                    icon={template.pinned ? <PushpinFilled /> : <PushpinOutlined />}
                    size="small"
                    type="text"
                    onClick={() => void updateTemplate({ ...template, pinned: !template.pinned })}
                  />
                </Tooltip>,
                <Tooltip key="edit" title="编辑名称">
                  <Button
                    aria-label="编辑常用组合"
                    icon={<EditOutlined />}
                    size="small"
                    type="text"
                    onClick={() => openEdit(template)}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="删除常用组合？"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => void deleteTemplate(template.id)}
                >
                  <Button
                    aria-label="删除常用组合"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                  />
                </Popconfirm>,
                <Button key="apply" size="small" type="primary" onClick={() => applyTemplate(template)}>
                  应用
                </Button>,
              ]}
            >
              <Space className="favorite-item" direction="vertical" size={2}>
                <Text strong ellipsis={{ tooltip: template.name }}>
                  {template.pinned ? <PushpinFilled className="favorite-pin" /> : null}
                  {template.name}
                </Text>
                <Text type="secondary" className="favorite-meta" ellipsis={{ tooltip: template.modulePath || '全部项目' }}>
                  {template.modulePath || '全部项目'}
                </Text>
              </Space>
            </List.Item>
          )}
        />
      )}

      <Modal
        title="保存当前选择为常用组合"
        open={saving}
        okText="保存"
        cancelText="取消"
        onCancel={() => setSaving(false)}
        onOk={() => {
          if (name.trim()) {
            void saveTemplate(name.trim())
            setName('')
            setSaving(false)
          }
        }}
      >
        <Input
          placeholder="例如 网关联调"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Modal>
      <Modal
        title="编辑常用组合"
        open={Boolean(editing)}
        okText="保存"
        cancelText="取消"
        onCancel={() => setEditing(undefined)}
        onOk={saveEditing}
      >
        <Input
          placeholder="组合名称"
          value={editingName}
          onChange={(event) => setEditingName(event.target.value)}
        />
      </Modal>
    </Card>
  )
}
