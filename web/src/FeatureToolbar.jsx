import { FEATURE_META } from './features.js';

// Placement-mode toggle buttons for stamping doors/windows/outlets on the plan.
export function FeatureToolbar({ mode, onToggle, hasRooms }) {
  return (
    <div className="feat-toolbar" role="toolbar" aria-label="부착물 도구">
      {Object.entries(FEATURE_META).map(([kind, m]) => (
        <button key={kind} type="button" className={mode === kind ? 'active' : ''}
          aria-pressed={mode === kind} onClick={() => onToggle(kind)}>
          {m.icon} {m.label}
        </button>
      ))}
      {mode && (
        <span className="feat-toolbar-hint">
          {hasRooms ? '벽을 클릭해 배치 · ESC 취소' : '방을 먼저 추가하세요'}
        </span>
      )}
    </div>
  );
}
