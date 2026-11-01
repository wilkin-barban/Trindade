import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/**
 * The lane's own smoke test: it proves jsdom, JSX and the jest-dom matchers are wired before any
 * component test depends on them. It deliberately renders something trivial, so a failure here means
 * the lane broke, never the component under test.
 */
function Smoke() {
  return <p>trindade</p>;
}

describe('the component-test lane', () => {
  it('renders into jsdom and knows the jest-dom matchers', () => {
    render(<Smoke />);

    expect(screen.getByText('trindade')).toBeInTheDocument();
  });
});
