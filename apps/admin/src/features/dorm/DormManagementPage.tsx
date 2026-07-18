import { useState } from 'react';
import { SegmentedTabs } from '../../components/ui';
import { DormAssignmentPanel } from './DormAssignmentPanel';
import { useDormData, useRefreshDorm } from './dormData';
import { DormReportsPanel } from './DormReportsPanel';
import { DormRoommateBlocksPanel } from './DormRoommateBlocksPanel';
import { DormRoomPointsPanel } from './DormRoomPointsPanel';
import './dorm.css';

const now = new Date();
const currentYear = now.getFullYear();
type Tab = 'assignments' | 'reports' | 'points' | 'blocks';

const tabs = [
  { value: 'assignments', label: '방 배정·추첨' },
  { value: 'reports', label: '민원' },
  { value: 'points', label: '방 상벌점' },
  { value: 'blocks', label: '블랙리스트' },
] as const;

export function DormManagementPage() {
  const [tab, setTab] = useState<Tab>('assignments');
  const [year, setYear] = useState(currentYear);
  const [semester, setSemester] = useState(now.getMonth() + 1 >= 8 ? 2 : 1);
  const query = { year, semester };
  const { roomsQuery, studentsQuery, assignmentsQuery, reportsQuery, blocksQuery, isError } =
    useDormData(query);
  const refreshDorm = useRefreshDorm();

  return (
    <div className="admin-stack dorm-page">
      <div className="dorm-management-header">
        <SegmentedTabs value={tab} options={tabs} onChange={setTab} ariaLabel="기숙사 관리 메뉴" />
        <div className="dorm-term-controls">
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="연도"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map((option) => (
              <option key={option} value={option}>
                {option}년
              </option>
            ))}
          </select>
          <select
            value={semester}
            onChange={(event) => setSemester(Number(event.target.value))}
            aria-label="학기"
          >
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </select>
        </div>
      </div>

      {isError ? (
        <section className="admin-panel error">기숙사 관리 정보를 불러오지 못했습니다.</section>
      ) : null}

      {tab === 'assignments' ? (
        <DormAssignmentPanel
          key={`${year}-${semester}`}
          year={year}
          semester={semester}
          rooms={roomsQuery.data ?? []}
          assignments={assignmentsQuery.data ?? []}
          loading={roomsQuery.isPending || assignmentsQuery.isPending}
          refresh={refreshDorm}
        />
      ) : null}
      {tab === 'reports' ? (
        <DormReportsPanel
          reports={reportsQuery.data ?? []}
          loading={reportsQuery.isPending}
          refresh={refreshDorm}
        />
      ) : null}
      {tab === 'points' ? (
        <DormRoomPointsPanel key={`${year}-${semester}`} rooms={roomsQuery.data ?? []} />
      ) : null}
      {tab === 'blocks' ? (
        <DormRoommateBlocksPanel
          key={`${year}-${semester}`}
          year={year}
          semester={semester}
          students={studentsQuery.data ?? []}
          blocks={blocksQuery.data ?? []}
          loading={studentsQuery.isPending || blocksQuery.isPending}
          refresh={refreshDorm}
        />
      ) : null}
    </div>
  );
}
