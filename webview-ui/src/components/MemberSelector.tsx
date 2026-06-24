import React, { useEffect, useState, useMemo } from 'react';
import { Select, Spin, Empty, Avatar, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { GitLabUser } from '../types/gitlab';
import { useGitLabApi } from '../hooks/useGitLabApi';

const { Option } = Select;
const { Text } = Typography;

interface MemberSelectorProps {
  projectId?: number;
  value?: number | number[];
  onChange?: (value: number | number[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export const MemberSelector: React.FC<MemberSelectorProps> = ({
  projectId,
  value,
  onChange,
  placeholder = "选择成员",
  disabled = false,
  multiple = false
}) => {
  const { getProjectMembers, membersState } = useGitLabApi();
  const [searchText, setSearchText] = useState('');
  const [allMembers, setAllMembers] = useState<GitLabUser[]>([]);

  // 当项目ID变化时获取成员列表
  useEffect(() => {
    if (projectId) {
      getProjectMembers(projectId);
    } else {
      setAllMembers([]);
    }
  }, [projectId, getProjectMembers]);

  // 处理成员数据更新
  useEffect(() => {
    if (membersState.data && !membersState.loading) {
      setAllMembers(membersState.data);
    }
  }, [membersState.data, membersState.loading]);

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchText(value);
    if (projectId) {
      getProjectMembers(projectId, value);
    }
  };

  // 选择成员
  const handleChange = (selectedValue: number | number[]) => {
    onChange?.(selectedValue);
  };

  // 过滤成员（客户端二次过滤，以防服务端搜索不够精确）
  const filteredMembers = useMemo(() => {
    if (!allMembers) return [];
    if (!searchText) return allMembers;
    const lowerSearch = searchText.toLowerCase();
    return allMembers.filter(member =>
      member.name.toLowerCase().includes(lowerSearch) ||
      member.username.toLowerCase().includes(lowerSearch)
    );
  }, [allMembers, searchText]);

  const renderMemberOption = (member: GitLabUser) => (
    <Option key={member.id} value={member.id}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Avatar
          size="small"
          src={member.avatar_url}
          icon={<UserOutlined />}
          style={{ marginRight: 8, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {member.name}
          </div>
          <Text
            type="secondary"
            style={{
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block'
            }}
          >
            @{member.username}
          </Text>
        </div>
      </div>
    </Option>
  );

  // 获取选中成员的显示标签
  const tagRender = (props: any) => {
    const { value: tagValue, closable, onClose } = props;
    const member = allMembers?.find(m => m.id === tagValue);
    if (!member) return null;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 4px',
          margin: '2px 4px 2px 0',
          fontSize: '12px',
          backgroundColor: 'var(--vscode-input-background)',
          border: '1px solid var(--vscode-input-border)',
          borderRadius: 4,
          lineHeight: '20px',
        }}
      >
        <Avatar
          size={16}
          src={member.avatar_url}
          icon={<UserOutlined />}
          style={{ marginRight: 4 }}
        />
        {member.name}
        {closable && (
          <span
            onClick={onClose}
            style={{ marginLeft: 4, cursor: 'pointer', opacity: 0.6 }}
          >
            ×
          </span>
        )}
      </span>
    );
  };

  return (
    <Select
      showSearch
      allowClear
      maxTagTextLength={50}
      mode={multiple ? "multiple" : undefined}
      tagRender={multiple ? tagRender : undefined}
      value={value}
      placeholder={placeholder}
      disabled={disabled || !projectId}
      loading={membersState.loading}
      onSearch={handleSearch}
      onChange={handleChange}
      filterOption={false}
      style={{ width: '100%' }}
      notFoundContent={
        membersState.loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin size="small" />
            <div style={{ marginTop: 8 }}>加载成员中...</div>
          </div>
        ) : !projectId ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="请先选择项目"
            style={{ padding: 20 }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="未找到成员"
            style={{ padding: 20 }}
          />
        )
      }
    >
      {filteredMembers.map(renderMemberOption)}
    </Select>
  );
};
