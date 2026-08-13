export function ErrorBanner({
  message,
  onRetry,
  retryLabel = 'Retry',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="gd-banner error" role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button className="gd-btn gd-btn-secondary gd-btn-sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
