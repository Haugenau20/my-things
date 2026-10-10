# PR-09: Phone 3-step capture

Screen **F** (three frames).

## Goal
The fewest possible things on screen. A loop: **shoot → name → saved → shoot**.

## Steps
1. **Shoot**: a full-screen dark view (`#1f2a24`). Top: × (exit to browse) · room pill "Room · **Bedroom ▾**" (bottom-sheet picker, plus "+ New room") · "{n} today". The middle is the camera. Bottom: Library (gallery picker) · shutter (76px ring) · **No photo** (skips to step 2).
   - Implementation note: use `<input type="file" accept="image/*" capture="environment">` triggered by the shutter, or `getUserMedia` for a live preview if it works reliably on iPhone Safari. The implementer chooses and documents it. With the file input, step 1 can be just the room pill + a large "Take photo" button.
2. **Name**: "‹ Retake" · the room (read-only) · photo 1 thumbnail + "+ 2nd photo" · eyebrow "What is it?" · a large Georgia 30px input (autofocus; the keyboard opens) · **Save & next** directly above the keyboard. The keyboard's Return also saves.
3. **Saved**: back on the camera (step 1) with a toast at the top: thumbnail · "✓ {name}" · "Saved to {room} · in review inbox" · **Undo**. It auto-dismisses after about 5s.
   - Undo = move the just-saved item to Trash (recoverable; SPEC DEL-01). Not a hard delete.
   - The toast appears only after server acknowledgement of the record and all photos. While uploading, show a small progress chip on the camera screen; the user may already shoot the next thing (uploads are queued sequentially).

## Rules
- No "Save as reviewed" and no Details on the phone. Everything is saved as `needs_review`.
- The room stays sticky for the session (and persists in localStorage per device).
- Failures: the toast becomes an error state with "Retry"; the existing interrupted-attempt recovery applies. Never report success early.

## Acceptance criteria
- Logging 10 things in one room takes at most 3 taps + typing per thing.
- Leaving and returning keeps the room.
- Photo-free saves work via "No photo".
