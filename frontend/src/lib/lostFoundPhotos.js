/** Item photo rules shared by the report form and the photo manager (match the server). */
export const MAX_PHOTOS = 3;
export const PHOTO_ACCEPT = 'image/jpeg,image/png';
const MAX_BYTES = 5 * 1024 * 1024;

export const PHOTO_HINT = 'Up to 3 JPG/PNG photos, 5 MB each. Photos are public, so do not show names, card numbers or faces.';

export function checkPhoto(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return 'Only JPG and PNG photos are allowed.';
  if (file.size > MAX_BYTES) return 'The photo is larger than 5 MB.';
  return null;
}
