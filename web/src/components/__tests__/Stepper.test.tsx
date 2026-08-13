import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stepper } from '../Stepper';

describe('Stepper', () => {
  it('marks earlier steps done, the active one current, and the rest pending', () => {
    render(<Stepper status="PORTRAITS_GENERATED" />);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);

    // Style, Characters, Portraits are done (3 steps completed to reach PORTRAITS_GENERATED)
    expect(items[0]).toHaveClass('done');
    expect(items[1]).toHaveClass('done');
    expect(items[2]).toHaveClass('done');
    // Chapters is the current step
    expect(items[3]).toHaveClass('current');
    expect(items[3]).toHaveAttribute('aria-current', 'step');
    // Illustrations hasn't started
    expect(items[4]).toHaveClass('pending');
  });

  it('shows every step as done once the project is finished', () => {
    render(<Stepper status="DONE" />);
    const items = screen.getAllByRole('listitem');
    items.forEach((item) => expect(item).toHaveClass('done'));
  });

  it('shows Style as current for a freshly created project', () => {
    render(<Stepper status="CREATED" />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveClass('current');
    expect(items.slice(1).every((i) => i.className.includes('pending'))).toBe(true);
  });
});
