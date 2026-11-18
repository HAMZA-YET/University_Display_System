import { useState } from 'react';

/** Keep edits local while typing, and follow shared links or browser history. */
export default function useUrlInput(urlValue = '') {
  const [draft, setDraft] = useState({ source: urlValue, value: urlValue });
  if (draft.source !== urlValue) {
    setDraft({ source: urlValue, value: urlValue });
  }
  const value = draft.source === urlValue ? draft.value : urlValue;
  return [value, (next) => setDraft({ source: urlValue, value: next })];
}
