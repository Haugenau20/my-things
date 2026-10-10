export function clickSelection(
  current: ReadonlySet<string>,
  id: string,
  checked: boolean,
  anchor: string | undefined,
  visible: string[],
  shift: boolean,
): Set<string> {
  const next = new Set(current);
  const start = anchor === undefined ? -1 : visible.indexOf(anchor);
  const end = visible.indexOf(id);
  const targets =
    shift && start >= 0 && end >= 0
      ? visible.slice(Math.min(start, end), Math.max(start, end) + 1)
      : [id];
  for (const target of targets) {
    if (checked) next.add(target);
    else next.delete(target);
  }
  return next;
}
