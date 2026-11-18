import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import NoticeForm from '../../components/notices/NoticeForm';
import Alert from '../../components/ui/Alert';
import { DataState } from '../../components/ui/States';
import useApi from '../../hooks/useApi';
import useDepartments from '../../hooks/useDepartments';
import { getNotice, createRevision } from '../../api/notices';
import { noticeToForm, formToCorrectionBody } from '../../lib/noticeMapping';

/**
 * Correction flow (10.8). The form is prefilled from the APPROVED snapshot.
 * Saving creates a PENDING revision; the public page keeps showing the old
 * approved version until a reviewer approves the correction.
 */
export default function NoticeRevise() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { departments } = useDepartments();
  const result = useApi(() => getNotice(id), [id]);
  const [attachments, setAttachments] = useState(null);

  return (
    <>
      <PageHeader
        title="Create correction"
        breadcrumb={<Link to="/author/notices">My notices</Link>}
        description="Readers keep seeing the current approved version until a reviewer approves your correction."
      />
      <DataState {...result} onRetry={result.reload}>
        {(notice) => {
          if (notice.status !== 'APPROVED' || !notice.approvedRevision) {
            return <Alert type="info" title="Only approved notices can be corrected." />;
          }
          if (notice.pendingRevision) {
            return (
              <Alert type="warning" title="A correction is already waiting for review.">
                Only one pending correction is allowed per notice. Wait for the reviewer decision.
              </Alert>
            );
          }
          const snapshot = notice.approvedRevision.contentSnapshot;
          const files = attachments || snapshot.attachments || [];
          return (
            <NoticeForm
              variant="correction"
              defaultValues={{ ...noticeToForm(snapshot), changeNote: '' }}
              departments={departments}
              attachments={files}
              onAttachmentsChange={setAttachments}
              version={notice.version}
              onSubmitCorrection={async (values) => {
                await createRevision(id, formToCorrectionBody(values, files, notice.version));
                navigate('/author/notices', { state: { flash: 'Your correction was sent for review. The current version stays public until it is approved.' } });
              }}
            />
          );
        }}
      </DataState>
    </>
  );
}
