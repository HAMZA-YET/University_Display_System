import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import DateTimeField from '../ui/DateTimeField';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import AttachmentField from './AttachmentField';
import { draftSchema, submitSchema, correctionSchema, EMPTY_NOTICE } from '../../lib/noticeSchemas';
import { applyServerErrors } from '../../lib/noticeMapping';
import { CATEGORIES, AUDIENCES, VISIBILITIES, VISIBILITY_HELP, humanize } from '../../lib/labels';

const FIELDS = [...Object.keys(EMPTY_NOTICE), 'changeNote'];

/**
 * Notice form shared by the editor (variant "notice") and the correction page
 * (variant "correction"). Validation uses zod with the same rules as the server:
 * "Save draft" needs only a title, "Submit for review" needs every field.
 * Server 400 details are mapped onto the matching fields.
 */
const NoticeForm = forwardRef(function NoticeForm(
  {
    variant = 'notice',
    defaultValues,
    departments = [],
    attachments = [],
    onAttachmentsChange,
    onSaveDraft,
    onSubmitForReview,
    onSubmitCorrection,
    version,
    extraActions,
    eventSection,
  },
  ref
) {
  const mode = useRef({ mode: variant === 'correction' ? 'correction' : 'draft' });
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(null);

  const resolver = (values, context, options) => {
    const schema = context.mode === 'submit' ? submitSchema : context.mode === 'correction' ? correctionSchema : draftSchema;
    return zodResolver(schema)(values, context, options);
  };

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    reset,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: { ...EMPTY_NOTICE, changeNote: '', ...defaultValues }, resolver, context: mode.current, mode: 'onSubmit' });

  useImperativeHandle(ref, () => ({ getValues, reset, isDirty: () => isDirty }), [getValues, reset, isDirty]);

  async function run(kind, handler, values) {
    setFormError(null);
    setBusy(kind);
    try {
      await handler(values);
    } catch (err) {
      if (err && err.code === 'VALIDATION_ERROR') {
        const unmatched = applyServerErrors(err, setError, FIELDS);
        setFormError({ message: err.message, list: unmatched });
      } else if (err) {
        setFormError({ message: err.message, list: [] });
      }
    } finally {
      setBusy(null);
    }
  }

  const submitWith = (kind, handler) => (e) => {
    mode.current.mode = kind === 'draft' ? 'draft' : kind === 'submit' ? 'submit' : 'correction';
    return handleSubmit(
      (values) => run(kind, handler, values),
      (errs) => {
        const count = Object.keys(errs).length;
        setFormError({ message: `Please fix ${count} field${count === 1 ? '' : 's'} before continuing.`, list: [] });
      }
    )(e);
  };

  const err = (name) => (errors[name] ? errors[name].message : undefined);
  const deptOptions = [{ value: 'ALL', label: 'All departments (university-wide)' }, ...departments.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))];
  const isCorrection = variant === 'correction';

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="stack" aria-label={isCorrection ? 'Correction form' : 'Notice form'}>
      <p className="small muted">Fields marked * are required to submit for review. A draft can be saved with only a title.</p>
      {version !== undefined && (
        <p className="small muted" data-testid="version">
          Version {version}
        </p>
      )}

      <fieldset>
        <legend>Content</legend>
        <div className="form-grid">
          <Input className="span-2" label="Title" required error={err('title')} {...register('title')} maxLength={150} />
          <Textarea className="span-2" label="Summary" required rows={3} error={err('summary')} hint="10-300 characters. Shown on notice cards." {...register('summary')} />
          <Textarea className="span-2" label="Body" required rows={10} error={err('body')} hint="Plain text. Leave a blank line between paragraphs." {...register('body')} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Classification</legend>
        <div className="form-grid">
          <Select label="Category" required placeholder="Choose a category" error={err('category')} options={CATEGORIES.map((c) => ({ value: c, label: humanize(c) }))} {...register('category')} />
          <Select label="Department" required placeholder="Choose a department" error={err('department')} options={deptOptions} {...register('department')} />
          <Select label="Audience" required placeholder="Choose an audience" error={err('audience')} options={AUDIENCES.map((a) => ({ value: a, label: humanize(a) }))} {...register('audience')} />
          <Select label="Visibility" required placeholder="Choose visibility" error={err('visibility')} options={VISIBILITIES.map((v) => ({ value: v, label: VISIBILITY_HELP[v] }))} {...register('visibility')} />
          <Input label="Publishing office" required error={err('publishingOffice')} {...register('publishingOffice')} />
          <Input label="Contact email (optional)" type="email" error={err('contactEmail')} {...register('contactEmail')} />
          <DateTimeField
            className="span-2"
            label="Action deadline (optional)"
            error={err('actionDeadline')}
            hint="For example the last day to apply. Shown to readers; it does not hide the notice."
            {...register('actionDeadline')}
          />
        </div>
      </fieldset>

      {!isCorrection && (
        <fieldset>
          <legend>Publication request</legend>
          <div className="form-grid">
            <DateTimeField label="Requested publication start" required error={err('requestedPublicationStart')} hint="Required to submit." {...register('requestedPublicationStart')} />
            <DateTimeField label="Requested publication end (optional)" error={err('requestedPublicationEnd')} {...register('requestedPublicationEnd')} />
          </div>
          <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>
            The reviewer confirms the final publication window, priority and pinning.
          </p>
        </fieldset>
      )}

      {eventSection}

      <fieldset>
        <legend>Attachments</legend>
        <AttachmentField value={attachments} onChange={onAttachmentsChange} />
      </fieldset>

      {isCorrection && (
        <fieldset>
          <legend>Change note</legend>
          <Textarea label="What changed and why" required rows={3} error={err('changeNote')} {...register('changeNote')} />
        </fieldset>
      )}

      {formError && (
        <Alert type="error" title={formError.message}>
          {formError.list.length > 0 && (
            <ul>
              {formError.list.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <div className="form-actions">
        {extraActions}
        {isCorrection ? (
          <Button type="submit" icon="upload" disabled={Boolean(busy)} busy={busy === 'correction'} onClick={submitWith('correction', onSubmitCorrection)}>
            Submit correction for review
          </Button>
        ) : (
          <>
            <Button variant="secondary" type="button" disabled={Boolean(busy)} busy={busy === 'draft'} onClick={submitWith('draft', onSaveDraft)}>
              Save draft
            </Button>
            {onSubmitForReview && (
              <Button type="submit" icon="upload" disabled={Boolean(busy)} busy={busy === 'submit'} onClick={submitWith('submit', onSubmitForReview)}>
                Submit for review
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
});

export default NoticeForm;
