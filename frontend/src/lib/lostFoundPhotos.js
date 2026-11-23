import { useEffect, useState } from 'react';
import api from '../api/client';

/** Item photo rules shared by the report form and the photo manager. */
export const MAX_PHOTOS = 3;
export const PHOTO_ACCEPT = 'image/jpeg,image/png';
const MIB = 1024 * 1024;
const FALLBACK = { maxPhotoBytes: 4 * MIB, maxPhotos: MAX_PHOTOS, photosAvailable: false };

export function photoHint(capabilities) {
  if (capabilities.loading) return 'Checking photo upload availability. You can post a report without photos.';
  if (!capabilities.photosAvailable) return 'Photo uploads are unavailable. You can post a report without photos.';
  return `Up to ${capabilities.maxPhotos} JPG/PNG photos, ${capabilities.maxPhotoBytes / MIB} MB each. Photos are public, so do not show names, card numbers or faces.`;
}

export function checkPhoto(file, { maxPhotoBytes = FALLBACK.maxPhotoBytes } = {}) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return 'Only JPG and PNG photos are allowed.';
  if (file.size > maxPhotoBytes) return `The photo is larger than ${maxPhotoBytes / MIB} MB.`;
  return null;
}

export function usePhotoCapabilities() {
  const [capabilities, setCapabilities] = useState({ ...FALLBACK, loading: true });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api.get('/public/lost-found/capabilities', { signal: controller.signal }).then((response) => {
      const value = response.data.data;
      if (!Number.isInteger(value?.maxPhotoBytes) || value.maxPhotoBytes < 1
        || !Number.isInteger(value.maxPhotos) || value.maxPhotos < 1
        || typeof value.photosAvailable !== 'boolean') throw new Error('Photo capabilities are unavailable.');
      if (active) setCapabilities({
        maxPhotoBytes: Math.min(value.maxPhotoBytes, 5 * MIB),
        maxPhotos: Math.min(value.maxPhotos, MAX_PHOTOS),
        photosAvailable: value.photosAvailable,
        loading: false,
      });
    }).catch(() => { if (active) setCapabilities({ ...FALLBACK, loading: false }); });
    return () => { active = false; controller.abort(); };
  }, []);
  return capabilities;
}
