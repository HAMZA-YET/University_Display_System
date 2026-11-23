import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import Icon from '../ui/Icon';
import { LF_CATEGORIES, lfLabel } from '../../lib/lostFoundLabels';
import { PHOTO_ACCEPT, photoHint, checkPhoto, usePhotoCapabilities } from '../../lib/lostFoundPhotos';

/** Same limits as server/src/modules/lostFound/lostFound.schemas.js. The date is set by the server. */
const schema = z.object({
  type: z.enum(['LOST', 'FOUND'], { error: 'Choose Lost or Found' }),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(1500),
  category: z.string().min(1, 'Choose a category'),
  location: z.string().trim().min(2, 'Location is required').max(120),
  custodyNote: z.string().max(300).optional(),
  privateDetails: z.string().max(1500).optional(),
  contactDetails: z.string().max(200).optional(),
  contactVisibility: z.enum(['ADMIN', 'EVERYONE']),
});

const FIELDS = Object.keys(schema.shape);

function itemToForm(item) {
  if (!item) {
    return {
      type: '',
      title: '',
      description: '',
      category: '',
      location: '',
      custodyNote: '',
      privateDetails: '',
      contactDetails: '',
      contactVisibility: 'ADMIN',
    };
  }
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    category: item.category,
    location: item.location,
    custodyNote: item.custodyNote || '',
    privateDetails: item.privateDetails || '',
    contactDetails: item.contactDetails || '',
    contactVisibility: item.contactVisibility || 'ADMIN',
  };
}

function formToBody(v) {
  const t = (s) => (s && s.trim() ? s.trim() : null);
  return {
    type: v.type,
    title: v.title.trim(),
    description: v.description.trim(),
    category: v.category,
    location: v.location.trim(),
    custodyNote: v.type === 'FOUND' ? t(v.custodyNote) : null,
    privateDetails: v.type === 'LOST' ? t(v.privateDetails) : null,
    contactDetails: t(v.contactDetails),
    contactVisibility: v.contactVisibility,
  };
}

/** Photos chosen before the report exists; uploaded right after it is created. */
function PhotoPicker({ files, setFiles }) {
  const inputId = useId();
  const [error, setError] = useState(null);
  const capabilities = usePhotoCapabilities();
  // Preview URLs are created per file list and released when it changes.
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function add(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!capabilities.photosAvailable) return;
    const problems = picked.map((file) => checkPhoto(file, capabilities)).filter(Boolean);
    setError(problems[0] || (files.length + picked.length > capabilities.maxPhotos ? `You can add at most ${capabilities.maxPhotos} photos.` : null));
    setFiles([...files, ...picked.filter((file) => !checkPhoto(file, capabilities))].slice(0, capabilities.maxPhotos));
  }

  return (
    <fieldset>
      <legend>Photos (optional)</legend>
      <div className="lf-thumbs">
        {previews.map((url, i) => (
          <div key={url} className="lf-thumb" style={{ cursor: 'default' }}>
            <img src={url} alt={`Selected photo ${i + 1}`} />
            <button
              type="button"
              className="lf-thumb-remove"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => setFiles(files.filter((_, j) => j !== i))}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
        {capabilities.photosAvailable && files.length < capabilities.maxPhotos && (
          <label className="lf-photo-add" htmlFor={inputId}>
            <input id={inputId} type="file" accept={PHOTO_ACCEPT} multiple onChange={add} />
            <span>+ Add photo</span>
          </label>
        )}
      </div>
      <p className="small muted" style={{ margin: 'var(--space-2) 0 0' }}>
        {photoHint(capabilities)}
      </p>
      {error && (
        <p className="small" role="alert" style={{ color: 'var(--color-danger)', fontWeight: 600, margin: 0 }}>
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Report form for new reports and edits. The date and time are recorded
 * automatically when the report is posted. onSubmit(body, files) may throw an
 * ApiError; 400 details are shown on the matching fields.
 */
export default function ItemForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Post report',
  lockType = false,
  onCancel,
  allowPhotos = false,
}) {
  const [formError, setFormError] = useState(null);
  const [files, setFiles] = useState([]);
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: itemToForm(defaultValues), resolver: zodResolver(schema) });
  const type = useWatch({ control, name: 'type' });
  const visibility = useWatch({ control, name: 'contactVisibility' });

  async function submit(values) {
    setFormError(null);
    try {
      await onSubmit(formToBody(values), files);
    } catch (err) {
      const unmatched = [];
      (err.details || []).forEach((d) => {
        if (FIELDS.includes(d.field)) setError(d.field, { message: d.message });
        else unmatched.push(d.message);
      });
      setFormError({ message: err.message, list: unmatched });
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="stack">
      {formError && (
        <Alert type="error" title="The report was not saved">
          {formError.message}
          {formError.list.length > 0 && (
            <ul>
              {formError.list.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <fieldset>
        <legend>What happened?</legend>
        {lockType ? (
          <p style={{ margin: 0 }}>
            Report type: <strong>{type === 'LOST' ? 'Lost item' : 'Found item'}</strong>{' '}
            <span className="muted small">(cannot be changed; post a new report instead)</span>
          </p>
        ) : (
          <div className="row" role="radiogroup" aria-label="Report type">
            <label className="checkbox">
              <input type="radio" value="LOST" {...register('type')} /> I lost something
            </label>
            <label className="checkbox">
              <input type="radio" value="FOUND" {...register('type')} /> I found something
            </label>
          </div>
        )}
        {errors.type && (
          <span className="small" role="alert" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
            {errors.type.message}
          </span>
        )}
      </fieldset>

      <fieldset>
        <legend>Item details</legend>
        <p className="small muted">Everyone can see this part. The date and time are added automatically when you post.</p>
        <div className="form-grid">
          <Input
            className="span-2"
            label="Title"
            required
            placeholder="For example: Navy folding umbrella"
            error={errors.title?.message}
            {...register('title')}
          />
          <Textarea
            className="span-2"
            label="Description"
            required
            rows={4}
            error={errors.description?.message}
            hint="Colour, size, brand and general appearance."
            {...register('description')}
          />
          <Select
            label="Category"
            required
            placeholder="Choose a category"
            options={LF_CATEGORIES.map((c) => ({ value: c, label: lfLabel(c) }))}
            error={errors.category?.message}
            {...register('category')}
          />
          <Input
            label={type === 'FOUND' ? 'Where did you find it?' : 'Where did you lose it?'}
            required
            placeholder="Building, room or area"
            error={errors.location?.message}
            {...register('location')}
          />
          {type === 'FOUND' && (
            <Input
              className="span-2"
              label="Where is the item now?"
              hint="For example: handed in at Student Services, Room 105."
              error={errors.custodyNote?.message}
              {...register('custodyNote')}
            />
          )}
        </div>
      </fieldset>

      {allowPhotos && <PhotoPicker files={files} setFiles={setFiles} />}

      <fieldset>
        <legend>Contact details</legend>
        <div className="stack">
          <Input
            label="How can people reach you?"
            hint="Optional. For example an email address or phone number."
            error={errors.contactDetails?.message}
            {...register('contactDetails')}
          />
          <div>
            <span className="small" style={{ fontWeight: 600 }}>
              Who can see your contact details?
            </span>
            <div className="row" role="radiogroup" aria-label="Who can see your contact details" style={{ marginTop: 'var(--space-1)' }}>
              <label className="checkbox">
                <input type="radio" value="ADMIN" {...register('contactVisibility')} /> Admin only
              </label>
              <label className="checkbox">
                <input type="radio" value="EVERYONE" {...register('contactVisibility')} /> Everyone
              </label>
            </div>
          </div>
          {visibility === 'EVERYONE' && (
            <Alert type="warning">Everyone can see this. Don&apos;t share personal details you&apos;re not comfortable with.</Alert>
          )}
        </div>
      </fieldset>

      {type === 'LOST' && (
        <div className="lf-private">
          <h3>
            <Icon name="shield" size={18} /> Private details (only you and the admin)
          </h3>
          <Textarea
            label="Identifying details"
            rows={3}
            hint="Marks, engravings or contents that prove the item is yours. Never shown publicly."
            error={errors.privateDetails?.message}
            {...register('privateDetails')}
          />
        </div>
      )}

      <div className="form-actions">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" icon="check" busy={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
