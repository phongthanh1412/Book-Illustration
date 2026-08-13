import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntityCard } from '../EntityCard';

describe('EntityCard', () => {
  it('shows a "not generated yet" placeholder while pending', () => {
    render(<EntityCard kind="character" name="Ratty" prompt="A river-loving water rat" status="pending" imageUrl={null} />);
    expect(screen.getByText('Not generated yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows a spinner and a specific caption while generating', () => {
    render(<EntityCard kind="character" name="Ratty" prompt="..." status="generating" imageUrl={null} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/generating portrait for ratty/i)).toBeInTheDocument();
  });

  it('renders the image once done', () => {
    render(<EntityCard kind="chapter" name="Ch. 1" prompt="..." status="done" imageUrl="/files/x/chapters/0" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/files/x/chapters/0');
    expect(img).toHaveAttribute('alt', expect.stringContaining('Illustration'));
  });
});
