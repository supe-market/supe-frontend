import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Input, Select, Tabs, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import supeApi from '../api';
import styles from '../index.module.scss';
import { supeActRoute, supeAskRoute, supeTargetsRoute } from '../constants';
import type { ActionContext, ActionStatus, ActionTarget, ActionType } from '../actionTypes';

const ACTION_TYPE_OPTIONS: Array<{ label: string; value: ActionType }> = [
  { label: 'Nudge', value: 'nudge' },
  { label: 'Trade Scheme', value: 'scheme' },
  { label: 'Goal Push', value: 'goal_push' },
  { label: 'Collection Drive', value: 'collection' },
  { label: 'Announcement', value: 'announcement' }
];

interface ActionDrawerProps {
  open: boolean;
  onClose: () => void;
  context?: ActionContext | null;
  onCreated?: (action: any) => void;
}

function buildDefaultTitle(context?: ActionContext | null) {
  if (!context) return '';
  if (context.title) return context.title;
  if (context.sourceEntityName) return `Action for ${context.sourceEntityName}`;
  return 'New Action';
}

export function ActionDrawer({ open, onClose, context, onCreated }: ActionDrawerProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('nudge');
  const [status, setStatus] = useState<ActionStatus>('draft');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskInstruction, setTaskInstruction] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');

  useEffect(() => {
    if (!open) return;
    setActionType(context?.actionType || 'nudge');
    setStatus('draft');
    setTitle(buildDefaultTitle(context));
    setNote(context?.note || '');
    setTaskAssignee('');
    setTaskInstruction(context?.title || context?.sourceEntityName ? `Follow up on ${context?.sourceEntityName || context?.title}` : '');
    setTaskDeadline('');
  }, [open, context]);

  const targets = useMemo<ActionTarget[]>(() => context?.targets || [], [context]);
  const audienceType = context?.audienceType || targets[0]?.entityType || null;

  const handleCreateAction = async () => {
    try {
      setCreating(true);
      const response = await supeApi.createAction({
        type: actionType,
        title: title || buildDefaultTitle(context),
        status,
        sourceKind: context?.sourceKind || 'manual',
        sourceKey: context?.sourceKey || null,
        sourceEntityType: context?.sourceEntityType || null,
        sourceEntityId: context?.sourceEntityId || null,
        sourceEntityName: context?.sourceEntityName || null,
        audienceType,
        payload: {
          note,
          context: context || null
        },
        targets
      });
      const action = response?.data?.data;
      message.success('Action created');
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      onCreated?.(action);
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to create action');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateTask = async () => {
    try {
      setTaskSaving(true);
      await supeApi.createTask({
        assignee: taskAssignee,
        instruction: taskInstruction,
        deadline: taskDeadline || null,
        entityType: context?.sourceEntityType || audienceType || null,
        entityId: context?.sourceEntityId || targets[0]?.entityId || null,
        entityName: context?.sourceEntityName || targets[0]?.entityName || null
      });
      message.success('Task created');
      window.dispatchEvent(new CustomEvent('supe-actions-updated'));
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to create task');
    } finally {
      setTaskSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      placement="right"
      onClose={onClose}
      width={520}
      title="Action Composer"
      className={styles.observeActionDrawer}
    >
      <div className={styles.observeActionDrawerIntro}>
        <div className={styles.observeActionDrawerTitle}>{buildDefaultTitle(context) || 'New Action'}</div>
        {context?.sourceEntityName ? (
          <div className={styles.observeActionDrawerMeta}>
            {context.sourceEntityName}
            {context.sourceEntityType ? ` · ${context.sourceEntityType}` : ''}
          </div>
        ) : null}
      </div>

      <Tabs
        items={[
          {
            key: 'action',
            label: 'Action',
            children: (
              <Form layout="vertical">
                <Form.Item label="Action Type">
                  <Select value={actionType} onChange={setActionType} options={ACTION_TYPE_OPTIONS} />
                </Form.Item>
                <Form.Item label="Status">
                  <Select
                    value={status}
                    onChange={setStatus}
                    options={[
                      { label: 'Draft', value: 'draft' },
                      { label: 'Active', value: 'active' }
                    ]}
                  />
                </Form.Item>
                <Form.Item label="Title">
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                </Form.Item>
                <Form.Item label="Notes">
                  <Input.TextArea rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
                </Form.Item>
                {targets.length > 0 ? (
                  <div className={styles.observeActionDrawerTargets}>
                    {targets.map((target) => (
                      <span key={`${target.entityType}:${target.entityId}`} className={styles.observeActionDrawerTarget}>
                        {target.entityName || target.entityId}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className={styles.observeActionDrawerFooter}>
                  <Button onClick={() => navigate(supeTargetsRoute)}>Set targets</Button>
                  <Button onClick={() => navigate(`${supeAskRoute}?q=${encodeURIComponent(context?.askQuery || context?.title || '')}`)}>
                    Ask deeper
                  </Button>
                  <Button type="primary" loading={creating} onClick={handleCreateAction}>
                    Save Action
                  </Button>
                </div>
              </Form>
            )
          },
          {
            key: 'task',
            label: 'Task',
            children: (
              <Form layout="vertical">
                <Form.Item label="Assignee">
                  <Input value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)} />
                </Form.Item>
                <Form.Item label="Instruction">
                  <Input.TextArea rows={3} value={taskInstruction} onChange={(event) => setTaskInstruction(event.target.value)} />
                </Form.Item>
                <Form.Item label="Deadline">
                  <Input type="date" value={taskDeadline} onChange={(event) => setTaskDeadline(event.target.value)} />
                </Form.Item>
                <div className={styles.observeActionDrawerFooter}>
                  <Button onClick={() => navigate(supeActRoute)}>Open Act</Button>
                  <Button type="primary" loading={taskSaving} onClick={handleCreateTask}>
                    Create Task
                  </Button>
                </div>
              </Form>
            )
          }
        ]}
      />
    </Drawer>
  );
}

export default ActionDrawer;
