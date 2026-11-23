import { useNavigate, useParams, Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { BackToLostFound } from './LostFoundItem';
import PageHeader from '../../components/layout/PageHeader';
import ItemForm from '../../components/lostFound/ItemForm';
import Alert from '../../components/ui/Alert';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import { createItem, getMyItem, updateMyItem, uploadPhoto } from '../../api/lostFound';

function NewReport() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Report an item" description="Your report is listed as soon as you post it." breadcrumb={<BackToLostFound />} />
      <ItemForm
        allowPhotos
        onSubmit={async (body, files) => {
          const item = await createItem(body);
          let failed = 0;
          for (const file of files) {
            try {
              await uploadPhoto(item.id, file);
            } catch {
              failed += 1;
            }
          }
          const photoNote = files.length
            ? ` ${files.length - failed} photo(s) uploaded.${failed ? ` ${failed} photo(s) could not be uploaded; you can try again from the report page.` : ''}`
            : '';
          navigate(`/items/my-reports/${item.id}`, {
            state: { flash: `Report ${item.reference} posted and listed.${photoNote}` },
          });
        }}
        onCancel={() => navigate('/items')}
      />
    </>
  );
}

function EditReport({ id }) {
  const navigate = useNavigate();
  const result = useApi(() => getMyItem(id), [id]);
  return (
    <DataState {...result} onRetry={result.reload}>
      {(item) => (
        <>
          <PageHeader
            title={`Edit ${item.reference}`}
            breadcrumb={
              <Link to={`/items/my-reports/${item.id}`}>
                <Icon name="chevronLeft" size={14} /> Back to report
              </Link>
            }
          />
          <div className="stack">
            {!['OPEN', 'COLLECTION_APPROVED'].includes(item.status) ? (
              <Alert type="error">This report can no longer be edited.</Alert>
            ) : (
              <ItemForm
                defaultValues={item}
                lockType
                submitLabel="Save changes"
                onSubmit={async (body) => {
                  const rest = { ...body };
                  delete rest.type;
                  await updateMyItem(item.id, rest, item.version);
                  navigate(`/items/my-reports/${item.id}`, { state: { flash: 'Changes saved.' } });
                }}
                onCancel={() => navigate(`/items/my-reports/${item.id}`)}
              />
            )}
          </div>
        </>
      )}
    </DataState>
  );
}

export default function ReportItem() {
  const { id } = useParams();
  return id ? <EditReport id={id} /> : <NewReport />;
}
