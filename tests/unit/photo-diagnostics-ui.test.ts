import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoDiagnostics } from '../../src/app/PhotoDiagnostics';
import { PhotoOperationFailure } from '../../src/media/capture-errors';
vi.stubGlobal('__APP_BUILD_VERSION__', 'local');
vi.stubGlobal('__APP_ENV__', { VITE_APP_ENV: 'local' });
it('offers explicit diagnostic copy for tracked photo failures only', () => {
  expect(
    renderToStaticMarkup(
      createElement(PhotoDiagnostics, {
        failure: new PhotoOperationFailure('upload', new Error('private')),
      }),
    ),
  ).toContain('Copy diagnostics');
  expect(
    renderToStaticMarkup(createElement(PhotoDiagnostics, { failure: new Error('private') })),
  ).toBe('');
});
