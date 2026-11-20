import { noticeDestination } from './noticeDestination.js';
import api from '../../api/client.js';

const value = (request) => request.then((response) => response.data.data);
export const bookmarkStatus = (id, signal) => value(api.get(`/member-tools/bookmarks/${encodeURIComponent(id)}`, { signal }));
export const saveBookmark = (id) => value(api.put(`/member-tools/bookmarks/${encodeURIComponent(id)}`, {}));
export const removeBookmark = (id) => value(api.delete(`/member-tools/bookmarks/${encodeURIComponent(id)}`));
export const addFollow = (kind, target) => value(api.post('/member-tools/follows', { kind, target }));
export const removeFollow = (id) => value(api.delete(`/member-tools/follows/${encodeURIComponent(id)}`));
export const savePreferences = (changes) => value(api.patch('/member-tools/preferences', changes));
export const setNotificationRead = (id, read) => value(api.patch(`/member-tools/inbox/${encodeURIComponent(id)}`, { read }));
export const markAllNotificationsRead = () => value(api.post('/member-tools/inbox/read-all', {}));
export const openNotification = async (id) => {
  const result = await value(api.get(`/member-tools/inbox/${encodeURIComponent(id)}/open`));
  return { href: noticeDestination(result?.href) };
};
