import type { ReactNode } from 'react';

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p style={{ margin: 0 }}>{message}</p>
      {action}
    </div>
  );
}
