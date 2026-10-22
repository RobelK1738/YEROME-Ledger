export function Loading({ label = 'Loading…', full = false }) {
  return (
    <div className={full ? 'state state--full' : 'state'} role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="state__text">{label}</p>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, radius, className = '' }) {
  return <span className={`skeleton ${className}`.trim()} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Page-shaped placeholder: header, KPI row and a list, announced once to screen readers. */
export function PageSkeleton({ label = 'Loading…', stats = 4, rows = 5, header = true }) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {header ? (
        <div className="page-skeleton__header">
          <Skeleton width="38%" height={26} />
          <Skeleton width="56%" height={14} />
        </div>
      ) : null}
      {stats ? (
        <div className="stat-grid">
          {Array.from({ length: stats }, (_, index) => (
            <div className="stat" key={index}>
              <Skeleton width="55%" height={12} />
              <Skeleton width="70%" height={26} />
              <Skeleton width="80%" height={11} />
            </div>
          ))}
        </div>
      ) : null}
      {rows ? (
        <div className="card">
          <div className="card__body skeleton-rows">
            {Array.from({ length: rows }, (_, index) => (
              <div className="skeleton-row" key={index}>
                <Skeleton width="28%" height={14} />
                <Skeleton width="18%" height={14} />
                <Skeleton width="14%" height={14} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
