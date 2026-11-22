import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/ui/Button';
import { DataState } from '../../components/ui/States';
import LfCategoryIcon from '../../components/lostFound/LfCategoryIcon';
import { BackToDashboard } from './AdminLfItems';
import useApi from '../../hooks/useApi';
import useQueryParams from '../../hooks/useQueryParams';
import { adminClaimsByItem } from '../../api/lostFound';
import { CLAIM_TABS, lfLabel, postedDate } from '../../lib/lostFoundLabels';

/**
 * Claims Waiting: tabs All | Pending | Approved | Rejected on the same page.
 * Each row is one found item with how many students claimed it.
 */
export default function AdminLfClaims() {
  const [params, setParams] = useQueryParams(['status']);
  const status = CLAIM_TABS.includes(params.status) ? params.status : 'PENDING';
  const result = useApi(() => adminClaimsByItem(status), [status]);
  const tabs = result.data ? result.data.meta.tabs : null;

  return (
    <>
      <PageHeader
        title="Claims"
        description="Open an item to see each student's proof and approve or reject."
        breadcrumb={<BackToDashboard />}
      />
      <div className="stack">
        <div className="tabs" role="tablist" aria-label="Claim status">
          {CLAIM_TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={status === t} onClick={() => setParams({ status: t })}>
              {lfLabel(t)}
              {tabs && <span className="count">({tabs[t]})</span>}
            </button>
          ))}
        </div>
        <DataState
          {...result}
          onRetry={result.reload}
          isEmpty={(d) => !d.data.length}
          emptyTitle={status === 'PENDING' ? 'No claims waiting' : 'No claims here'}
          emptyText="Claims from students appear here."
        >
          {(d) => (
            <div className="lf-claim-groups">
              {d.data.map((g) => (
                <article key={g.item.id} className="lf-claim-group">
                  <div className="lf-claim-group-icon">
                    <LfCategoryIcon category={g.item.category} size={32} />
                  </div>
                  <div className="lf-claim-group-body">
                    <h3>
                      <Link to={`/admin/items/${g.item.id}#claims`}>{g.item.title}</Link>
                    </h3>
                    <div className="small muted">
                      <span className="mono">{g.item.reference}</span> - {g.item.location} - posted {postedDate(g.item.postedAt)}
                    </div>
                    <div className="row" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <span className="lf-claim-total">
                        <strong>{g.counts.total}</strong> student{g.counts.total === 1 ? '' : 's'} claimed
                      </span>
                      {status === 'ALL' && (
                        <>
                          {g.counts.pending > 0 && <span className="badge badge-lfc-PENDING">{g.counts.pending} PENDING</span>}
                          {g.counts.approved > 0 && <span className="badge badge-lfc-APPROVED">{g.counts.approved} APPROVED</span>}
                          {g.counts.rejected > 0 && <span className="badge badge-lfc-REJECTED">{g.counts.rejected} REJECTED</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <Button size="sm" to={`/admin/items/${g.item.id}#claims`}>
                    Review claims
                  </Button>
                </article>
              ))}
            </div>
          )}
        </DataState>
      </div>
    </>
  );
}
