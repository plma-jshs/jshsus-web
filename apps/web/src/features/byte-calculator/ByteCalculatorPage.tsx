import { useMemo, useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { PageScaffold } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { getByteUsage } from './byte-counter';
import './byte-calculator.css';

export function ByteCalculatorPage() {
  const [content, setContent] = useState('');
  const [limit, setLimit] = useState(1500);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const usage = useMemo(() => getByteUsage(content, limit), [content, limit]);
  const isOver = usage.exceeded > 0;

  const copy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1500);
  };

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('byteCalculator')}
      title="세특 바이트 계산기"
      description="NEIS 기준 바이트 수를 계산합니다."
      width="reading"
      variant="workspace"
    >
      <section className="byte-calculator" aria-label="세특 바이트 계산기">
        <div className="byte-calculator__toolbar">
          <label>
            <span>바이트 제한</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value) || 1)}
            />
          </label>
          <div>
            <button type="button" onClick={() => void copy()} disabled={!content}>
              {copyState === 'copied' ? (
                <Check size={15} aria-hidden="true" />
              ) : (
                <Copy size={15} aria-hidden="true" />
              )}
              {copyState === 'copied' ? '복사됨' : copyState === 'failed' ? '복사 실패' : '복사'}
            </button>
            <button type="button" onClick={() => setContent('')} disabled={!content}>
              <RotateCcw size={15} aria-hidden="true" /> 초기화
            </button>
          </div>
        </div>

        <label className="byte-calculator__field">
          <span className="sr-only">textarea</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={16}
            spellCheck={false}
          />
        </label>

        <div className={`byte-calculator__result${isOver ? ' is-over' : ''}`}>
          <div className="byte-calculator__usage" aria-live="polite">
            <span>
              <strong>{usage.bytes.toLocaleString('ko-KR')}</strong> /{' '}
              {usage.limit.toLocaleString('ko-KR')} Byte
            </span>
            <span>
              {isOver
                ? `${usage.exceeded.toLocaleString('ko-KR')} Byte 초과`
                : `${usage.remaining.toLocaleString('ko-KR')} Byte 남음`}
            </span>
          </div>
          <div
            className="byte-calculator__progress"
            role="progressbar"
            aria-label="바이트 사용량"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={Math.min(usage.bytes, usage.limit)}
          >
            <span style={{ width: `${usage.percentage}%` }} />
          </div>
          <div className="byte-calculator__secondary">
            <span>글자 수 {Array.from(content).length.toLocaleString('ko-KR')}자</span>
            <span>
              줄 수 {(content ? content.split(/\r\n|\r|\n/).length : 0).toLocaleString('ko-KR')}줄
            </span>
          </div>
        </div>
      </section>

      <aside className="byte-calculator__guide" aria-labelledby="byte-rule-title">
        <h2 id="byte-rule-title">계산 기준</h2>
        <ul>
          <li>한글은 한 글자당 3 Byte입니다.</li>
          <li>영문, 숫자, 공백은 한 글자당 1 Byte입니다.</li>
          <li>특수문자는 종류에 따라 UTF-8 기준 1~4 Byte입니다.</li>
          <li>줄바꿈은 2 Byte로 계산합니다.</li>
        </ul>
      </aside>
    </PageScaffold>
  );
}
