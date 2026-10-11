import { afterEach, expect, it, vi } from 'vitest';
import { saveAttempt, attachFirstPhotos } from '../../src/media/capture';
import * as repository from '../../src/data/capture-repository';
import * as attachments from '../../src/data/photo-attachment-repository';
import * as files from '../../src/media/files';
import type { FirebaseServices } from '../../src/data/firebase';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';

const services = { auth: { currentUser: {} }, db: {}, storage: {} } as FirebaseServices;
const item = {
  ...syntheticInventory().items[0]!,
  recordState: 'draft' as const,
  photos: [],
  coverPhotoId: null,
};
const plan = {
  id: item.id,
  input: { name: item.name, roomId: null, photos: [], reviewStatus: 'needs_review' as const },
  prepared: [],
};
const signal = new AbortController().signal;
afterEach(() => vi.restoreAllMocks());
it('labels capture registration failures and never begins photo uploads', async () => {
  vi.spyOn(repository, 'ensureDraft').mockRejectedValue({
    code: 'permission-denied',
    message: 'private',
  });
  const transfer = vi.spyOn(files, 'ensureFile');
  await expect(saveAttempt(services, 'main', plan, signal, () => {})).rejects.toMatchObject({
    phase: 'registration',
    code: 'permission-denied',
  });
  expect(transfer).not.toHaveBeenCalled();
});
it('labels attachment registration failures', async () => {
  vi.spyOn(attachments, 'ensureFirstPhotos').mockRejectedValue(new Error('private'));
  await expect(
    attachFirstPhotos(services, 'main', item, [], signal, () => {}),
  ).rejects.toMatchObject({ phase: 'registration', code: 'unknown' });
});
it('labels finalization failures and retries the same capture identity', async () => {
  const register = vi.spyOn(repository, 'ensureDraft').mockResolvedValue(item);
  const finish = vi
    .spyOn(repository, 'finishDraft')
    .mockRejectedValueOnce({ code: 'unavailable' })
    .mockResolvedValueOnce({ ...item, recordState: 'ready' });
  await expect(saveAttempt(services, 'main', plan, signal, () => {})).rejects.toMatchObject({
    phase: 'finalization',
    code: 'unavailable',
  });
  await expect(saveAttempt(services, 'main', plan, signal, () => {})).resolves.toMatchObject({
    id: plan.id,
    recordState: 'ready',
  });
  expect(register.mock.calls.map((call) => call[2])).toEqual([plan.id, plan.id]);
  expect(finish).toHaveBeenCalledTimes(2);
});
