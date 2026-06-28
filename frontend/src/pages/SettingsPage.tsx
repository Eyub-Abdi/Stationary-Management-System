import { useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Icon,
  Input,
  PageHeader,
  Tabs,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useDownloadBackup, useRestoreBackup } from '@/hooks/useBackup';
import { extractMessage } from '@/lib/api';
import { cn, initials } from '@/lib/utils';

type TabKey = 'preferences' | 'backup';

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<TabKey>('preferences');

  const items = [
    { value: 'preferences' as const, label: 'Preferences', icon: 'tune' },
    ...(isAdmin ? [{ value: 'backup' as const, label: 'Backup & Restore', icon: 'database' }] : []),
  ];

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader title="Settings" description="Configure your interface and manage your data." />
      <Tabs value={tab} onChange={(v) => setTab(v as TabKey)} items={items} />

      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'backup' && isAdmin && <BackupTab />}
    </div>
  );
}

function PreferencesTab() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      <Card>
        <CardHeader title="Appearance" subtitle="Choose your interface theme" />
        <CardBody>
          <div className="grid grid-cols-2 gap-3">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  theme === t ? 'border-secondary bg-secondary-container/30' : 'border-outline-variant hover:bg-surface-container-low',
                )}
              >
                <Icon name={t === 'light' ? 'light_mode' : 'dark_mode'} size={26} className={theme === t ? 'text-secondary' : 'text-on-surface-variant'} />
                <span className="text-body-sm font-semibold capitalize">{t} mode</span>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your Profile" />
        <CardBody>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-h3 font-bold text-on-primary">
              {user ? initials(user.fullName) : '—'}
            </span>
            <div>
              <p className="text-body-lg font-semibold text-on-surface">{user?.fullName}</p>
              <p className="text-body-sm text-on-surface-variant">{user?.email}</p>
              <Badge tone={user?.role === 'ADMIN' ? 'navy' : 'neutral'} className="mt-1">{user?.role}</Badge>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
            <Icon name="info" size={16} className="mr-1" />
            Contact an administrator to change your role or reset your password.
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

const RESTORE_PHRASE = 'RESTORE';

function BackupTab() {
  const toast = useToast();
  const download = useDownloadBackup();
  const restore = useRestoreBackup();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const onBackup = async () => {
    try {
      const name = await download.mutateAsync();
      toast.success('Backup downloaded', `${name} saved to your downloads.`);
    } catch (e) {
      toast.error('Backup failed', extractMessage(e));
    }
  };

  const canRestore = !!file && confirmText.trim().toUpperCase() === RESTORE_PHRASE && !restore.isPending;

  const onRestore = async () => {
    if (!file) return;
    try {
      await restore.mutateAsync(file);
      toast.success('Database restored', 'Reloading with the restored data…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast.error('Restore failed', extractMessage(e));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      {/* Backup */}
      <Card>
        <CardHeader title="Backup" subtitle="Download a full copy of your database" />
        <CardBody>
          <p className="text-body-sm text-on-surface-variant">
            Creates a complete snapshot of all your data — products, sales, purchases, customers,
            cash and more — as a single <span className="font-mono-data">.dump</span> file. Keep it
            somewhere safe (USB drive or cloud); that downloaded file <em>is</em> your backup.
          </p>
          <div className="mt-4">
            <Button icon="download" onClick={onBackup} loading={download.isPending}>
              Download backup
            </Button>
          </div>
          <div className="mt-4 flex gap-2 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
            <Icon name="schedule" size={16} className="mt-0.5 shrink-0" />
            <span>Tip: download a backup at the end of each business day.</span>
          </div>
        </CardBody>
      </Card>

      {/* Restore */}
      <Card className="border border-error/40">
        <CardHeader title="Restore" subtitle="Replace everything with a backup file" />
        <CardBody>
          <div className="flex gap-2 rounded-xl bg-error-container/50 p-3 text-[13px] text-on-error-container">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
            <span>
              This <strong>permanently replaces all current data</strong> with the contents of the
              uploaded backup. Anything recorded since that backup will be lost. Make sure no one
              else is using the system, and download a fresh backup first.
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".dump"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-outline-variant p-3 text-left transition-colors hover:border-secondary"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
              <Icon name="upload_file" size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body-sm font-semibold text-on-surface">
                {file ? file.name : 'Choose a backup file (.dump)'}
              </span>
              <span className="block text-[12px] text-on-surface-variant">
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Click to browse'}
              </span>
            </span>
          </button>

          <label className="mt-4 block text-body-sm text-on-surface-variant">
            Type <span className="font-mono-data font-bold text-error">{RESTORE_PHRASE}</span> to confirm
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={RESTORE_PHRASE}
            className="mt-1"
          />

          <div className="mt-4">
            <Button variant="danger" icon="restore" disabled={!canRestore} loading={restore.isPending} onClick={onRestore}>
              Restore database
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
