export function won(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('ko-KR') + '원';
}
