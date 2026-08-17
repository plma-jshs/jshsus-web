import type { AdminDashboardTask } from '@jshsus/types';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  LoaderCircle,
  Smartphone,
  UserRoundSearch,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { api, describeAdminApiError } from '../../shared/api/adminApi';
import './dashboard.css';

const taskIcons: Record<AdminDashboardTask['key'], typeof ClipboardCheck> = {
  activity_pending: ClipboardCheck,
  device_disconnected: Smartphone,
  point_watchlist: UserRoundSearch,
};

export function DashboardPage() {
  const dashboardQuery = useQuery({ queryKey: ['admin-dashboard'], queryFn: api.dashboard });

  if (dashboardQuery.isLoading) {
    return (
      <section className="admin-dashboard admin-dashboard--loading" aria-busy="true">
        <LoaderCircle className="ui-status-state__icon admin-loading-spinner" size={24} aria-hidden="true" />
      </section>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <section className="admin-panel error">
        {describeAdminApiError(dashboardQuery.error, '관리자 대시보드')}
      </section>
    );
  }

  const { tasks, shortcuts } = dashboardQuery.data;
  const taskCount = tasks.reduce((total, task) => total + task.count, 0);

  return (
    <div className="admin-dashboard">
      <section className="admin-dashboard__summary">
        <h2>
          {taskCount > 0
            ? `확인이 필요한 업무가 ${taskCount}건 있어요`
            : '지금 처리할 업무가 없어요'}
        </h2>
      </section>

      {tasks.length > 0 ? (
        <section className="admin-dashboard__section" aria-labelledby="dashboard-tasks-title">
          <h3 id="dashboard-tasks-title">처리할 업무</h3>
          <div className="admin-dashboard__task-list">
            {tasks.map((task) => {
              const Icon = taskIcons[task.key];
              return (
                <Link className="admin-dashboard-task" to={task.href} key={task.key}>
                  <span className={`admin-dashboard-task__icon is-${task.tone}`}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="admin-dashboard-task__copy">
                    <strong>{task.title}</strong>
                    <small>{task.description}</small>
                  </span>
                  <strong className={`admin-dashboard-task__count is-${task.tone}`}>
                    {task.count}
                  </strong>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="admin-dashboard__clear" role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>모든 업무를 확인했습니다.</span>
        </div>
      )}

      {shortcuts.length > 0 ? (
        <section className="admin-dashboard__section" aria-labelledby="dashboard-shortcuts-title">
          <h3 id="dashboard-shortcuts-title">자주 찾는 메뉴</h3>
          <nav className="admin-dashboard__shortcuts" aria-label="자주 찾는 관리자 메뉴">
            {shortcuts.map((shortcut) => (
              <Link to={shortcut.href} key={shortcut.key}>
                <span>{shortcut.label}</span>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>
      ) : null}
    </div>
  );
}
