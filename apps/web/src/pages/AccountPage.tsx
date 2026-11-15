import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Trash2 } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/Page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingBlock } from '@/components/StatusStates';
import { useSession } from '@/hooks/queries';
import { api } from '@/services/api';
import { formatDate } from '@/lib/utils';
import { Preferences } from '@/components/layout/Preferences';

export default function AccountPage() {
  const session = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<unknown>(null);

  if (session.isLoading)
    return (
      <PageContainer>
        <LoadingBlock />
      </PageContainer>
    );
  if (!session.data?.authenticated)
    return (
      <PageContainer className="max-w-md">
        <p>You are not logged in.</p>
        <Button asChild className="mt-3">
          <Link to="/login">Log in</Link>
        </Button>
      </PageContainer>
    );
  const u = session.data.user!;
  return (
    <PageContainer className="max-w-2xl">
      <PageHeader title="Your account" />
      <Card className="mb-6 p-6" data-testid="display-settings">
        <h2 className="mb-4 text-xl">Display settings</h2>
        <Preferences />
      </Card>
      <Card className="p-6">
        <dl className="space-y-2">
          <div>
            <dt className="text-sm text-ink-muted">Name</dt>
            <dd className="font-semibold">{u.name}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Email</dt>
            <dd className="font-semibold">{u.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Member since</dt>
            <dd className="font-semibold">{formatDate(u.createdAt)}</dd>
          </div>
        </dl>
        <div className="mt-5 flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/saved">Saved farms &amp; plans</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await api.logout();
              await qc.refetchQueries({ queryKey: ['session'] });
              await qc.invalidateQueries();
              navigate('/', { replace: true });
            }}
          >
            <LogOut aria-hidden /> Log out
          </Button>
        </div>
      </Card>
      <Card className="mt-6 border-critical/30 p-6">
        <h2 className="text-xl text-critical">Delete account</h2>
        <p className="mt-1 text-sm text-ink-muted">This permanently deletes your account and all saved farms and plans. It cannot be undone.</p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api.deleteAccount(pw);
              await qc.invalidateQueries();
              navigate('/');
            } catch (err) {
              setError(err);
            }
          }}
        >
          <label className="flex flex-1 flex-col text-sm font-semibold">
            Confirm with your password
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 h-11 rounded-xl border border-forest-900/20 px-3"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </label>
          <Button variant="danger" type="submit" disabled={!pw}>
            <Trash2 aria-hidden /> Delete everything
          </Button>
        </form>
        {error ? <ErrorState className="mt-3" error={error} /> : null}
      </Card>
    </PageContainer>
  );
}
