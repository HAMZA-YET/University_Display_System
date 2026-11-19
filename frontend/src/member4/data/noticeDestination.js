// Only the destination returned by the existing notice-open contract is supported.
export function noticeDestination(value) {
  if (typeof value !== 'string' || !/^\/notices\/[a-f0-9]{24}$/.test(value)) {
    throw new Error('This notification destination is unavailable.');
  }
  return value;
}
