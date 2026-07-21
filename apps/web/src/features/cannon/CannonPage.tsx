import { useRef, useState } from 'react';
import { Crosshair, RotateCcw, Settings2 } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold } from '../../components/page/PageScaffold';
import './cannon.css';

const defaultStart = 1;
const defaultEnd = 20;

function defaultNumberPool() {
  return Array.from({ length: defaultEnd - defaultStart + 1 }, (_, index) => defaultStart + index);
}

function excludedNumbers(value: string) {
  if (!value.trim()) return [];
  const values = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item));
  return [...new Set(values)];
}

export function CannonPage() {
  const { showToast } = useToast();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [excluded, setExcluded] = useState('');
  const [pool, setPool] = useState<number[] | null>(defaultNumberPool);
  const [current, setCurrent] = useState<number | null>(null);
  const [shotKey, setShotKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const configure = () => {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 999) {
      showToast({ title: '1부터 999까지의 자연수를 입력해 주세요.', tone: 'danger' });
      return;
    }
    if (start > end) {
      showToast({ title: '시작 번호는 끝 번호보다 클 수 없습니다.', tone: 'danger' });
      return;
    }

    const excludedValues = excludedNumbers(excluded);
    if (excludedValues.some((value) => value < start || value > end)) {
      showToast({ title: '예외 번호는 설정한 범위 안에서 입력해 주세요.', tone: 'danger' });
      return;
    }
    const excludedSet = new Set(excludedValues);
    const nextPool = Array.from({ length: end - start + 1 }, (_, index) => start + index).filter(
      (value) => !excludedSet.has(value),
    );
    if (!nextPool.length) {
      showToast({ title: '추첨할 번호가 없습니다.', tone: 'danger' });
      return;
    }

    setPool(nextPool);
    setCurrent(null);
    setSettingsOpen(false);
    showToast({ title: `${nextPool.length}개의 번호를 설정했습니다.`, tone: 'success' });
  };

  const shoot = () => {
    if (pool === null) {
      showToast({ title: '먼저 번호 범위를 설정해 주세요.', tone: 'danger' });
      return;
    }
    if (!pool.length) {
      showToast({ title: '모든 번호를 추첨했습니다.', tone: 'success' });
      return;
    }

    const index = Math.floor(Math.random() * pool.length);
    const selected = pool[index];
    setPool((items) => (items ? items.filter((_, itemIndex) => itemIndex !== index) : items));
    setCurrent(selected);
    setShotKey((value) => value + 1);

    audioRef.current ??= new Audio('/images/cannon-shot.mp3');
    audioRef.current.volume = 0.5;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => undefined);
  };

  const reset = () => {
    setPool(null);
    setCurrent(null);
    setSettingsOpen(true);
  };

  return (
    <PageScaffold
      breadcrumbs={[{ label: '방송·도구' }, { label: '대포' }]}
      title="대포"
      description="대포를 눌러 무작위 추첨을 진행하세요."
      width="wide"
      variant="workspace"
    >
      <section className="cannon-workspace" aria-label="대포 번호 추첨기">
        <div className="cannon-toolbar">
          <button
            className="cannon-toolbar__button"
            type="button"
            onClick={() => setSettingsOpen((open) => !open)}
            aria-expanded={settingsOpen}
            aria-controls="cannon-settings"
          >
            <Settings2 size={17} aria-hidden="true" /> 번호 설정
          </button>
          <div className="cannon-toolbar__status" aria-live="polite">
            <span>남은 번호</span>
            <strong>{pool === null ? '설정 필요' : `${pool.length}개`}</strong>
          </div>
          <button
            className="cannon-toolbar__button"
            type="button"
            onClick={reset}
            disabled={pool === null}
          >
            <RotateCcw size={16} aria-hidden="true" /> 초기화
          </button>
          <button className="cannon-fire" type="button" onClick={shoot}>
            <Crosshair size={18} aria-hidden="true" /> 발사
          </button>
        </div>

        {settingsOpen ? (
          <div className="cannon-settings" id="cannon-settings">
            <div className="cannon-settings__heading">
              <h2>추첨 범위</h2>
              <p>1부터 999까지 설정할 수 있습니다.</p>
            </div>

            <div className="cannon-range">
              <label>
                <span>시작</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={start}
                  onChange={(event) => setStart(Number(event.target.value))}
                />
              </label>
              <span className="cannon-range__separator" aria-hidden="true">
                –
              </span>
              <label>
                <span>끝</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={end}
                  onChange={(event) => setEnd(Number(event.target.value))}
                />
              </label>
            </div>

            <label className="cannon-exclusions">
              <span>예외 번호</span>
              <input
                type="text"
                inputMode="numeric"
                value={excluded}
                onChange={(event) => setExcluded(event.target.value)}
                placeholder="예: 3, 7, 12"
              />
            </label>

            <button className="cannon-configure" type="button" onClick={configure}>
              설정 적용
            </button>
          </div>
        ) : null}

        <button
          className="cannon-scene-trigger"
          type="button"
          onClick={shoot}
          aria-label={'\uB300\uD3EC\uB97C \uB20C\uB7EC \uBC1C\uC0AC'}
          title={'\uB300\uD3EC\uB97C \uB20C\uB7EC \uBC1C\uC0AC'}
        />

        <div className="cannon-result" aria-live="assertive">
          {current === null ? null : (
            <strong
              className={`cannon-ball cannon-ball--digits-${String(current).length}`}
              key={shotKey}
              aria-label={`${current}번`}
            >
              <span className="cannon-ball__number">{current}</span>
              <span className="cannon-ball__bang" aria-hidden="true">
                !
              </span>
              <span className="cannon-ball__shine" aria-hidden="true" />
            </strong>
          )}
        </div>
      </section>
    </PageScaffold>
  );
}
