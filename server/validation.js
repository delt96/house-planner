export function validateItemName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Name is required';
  if (name.trim().length > 100) return 'Name is too long';
  return null;
}
