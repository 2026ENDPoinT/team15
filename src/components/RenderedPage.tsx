import { memo, type ReactNode } from 'react';

// Render callbacks deliberately change on every app render. Only the page's
// explicit inputs invalidate its tree (rather than toast or animation state).
export const RenderedPage = memo(
  function RenderedPage({
    render,
  }: {
    inputs: readonly unknown[];
    render: () => ReactNode;
  }) {
    return render();
  },
  (previous, next) =>
    previous.inputs.length === next.inputs.length &&
    previous.inputs.every((value, index) =>
      Object.is(value, next.inputs[index]),
    ),
);
