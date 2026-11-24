// Only current server-checked notice and own lost-and-found case destinations.
export function noticeDestination(value) {
  if (typeof value !== 'string' || !/^(?:\/notices\/[a-f0-9]{24}|\/items\/my-(?:claims|reports)\/[a-f0-9]{24})$/.test(value)) {
    throw new Error('This notification destination is unavailable.');
  }
  return value;
}
