import { toLocalInput, fromLocalInput } from './time';
import { EMPTY_NOTICE } from './noticeSchemas';

/** API notice (or snapshot) -> form values (strings). */
export function noticeToForm(n) {
  if (!n) return { ...EMPTY_NOTICE };
  return {
    title: n.title || '',
    summary: n.summary || '',
    body: n.body || '',
    category: n.category || '',
    department: n.department || '',
    audience: n.audience || '',
    visibility: n.visibility || '',
    publishingOffice: n.publishingOffice || '',
    contactEmail: n.contactEmail || '',
    actionDeadline: toLocalInput(n.actionDeadline),
    requestedPublicationStart: toLocalInput(n.requestedPublicationStart),
    requestedPublicationEnd: toLocalInput(n.requestedPublicationEnd),
  };
}

const nullIfEmpty = (v) => (v === '' || v === undefined ? null : v);

/** Form values -> API body for create/update. Empty strings become null. */
export function formToNoticeBody(values, attachments) {
  const body = {
    title: values.title.trim(),
    summary: nullIfEmpty(values.summary),
    body: nullIfEmpty(values.body),
    category: nullIfEmpty(values.category),
    department: nullIfEmpty(values.department),
    audience: nullIfEmpty(values.audience),
    visibility: nullIfEmpty(values.visibility),
    publishingOffice: nullIfEmpty(values.publishingOffice),
    contactEmail: nullIfEmpty(values.contactEmail),
    actionDeadline: fromLocalInput(values.actionDeadline),
    requestedPublicationStart: fromLocalInput(values.requestedPublicationStart),
    requestedPublicationEnd: fromLocalInput(values.requestedPublicationEnd),
  };
  if (attachments) body.attachments = attachments.map((a) => ({ fileId: a.fileId }));
  return body;
}

/** Form values -> API body for a correction. */
export function formToCorrectionBody(values, attachments, baseVersion) {
  return {
    title: values.title.trim(),
    summary: values.summary.trim(),
    body: values.body,
    category: values.category,
    department: values.department,
    audience: values.audience,
    visibility: values.visibility,
    publishingOffice: values.publishingOffice.trim(),
    contactEmail: nullIfEmpty(values.contactEmail),
    actionDeadline: fromLocalInput(values.actionDeadline),
    attachments: (attachments || []).map((a) => ({ fileId: a.fileId })),
    changeNote: values.changeNote.trim(),
    baseVersion,
  };
}

/** Maps server 400 details onto react-hook-form fields. Returns unmatched messages. */
export function applyServerErrors(error, setError, knownFields) {
  const unmatched = [];
  (error.details || []).forEach((d) => {
    const field = String(d.field || '').split('.')[0];
    if (knownFields.includes(field)) setError(field, { type: 'server', message: d.message });
    else unmatched.push(d.message);
  });
  return unmatched;
}
