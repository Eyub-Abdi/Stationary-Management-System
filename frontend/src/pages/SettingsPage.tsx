import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Icon,
  Input,
  PageHeader,
  Tabs,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useRestoreBackup, useRunLocalBackup } from '@/hooks/useBackup';
import { useSetStartup, useStartupStatus } from '@/hooks/useSystem';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { extractMessage } from '@/lib/api';
import { cn, initials } from '@/lib/utils';

type TabKey = 'preferences' | 'business' | 'backup';

const TAB_STORAGE_KEY = 'settings.activeTab';
const ADMIN_TABS: TabKey[] = ['business', 'backup'];

export default function SettingsPage() {
  const { can } = useAuth();
  const canSettings = can('settings');
  const allowed = (t: string): t is TabKey =>
    ['preferences', 'business', 'backup'].includes(t) && (canSettings || !ADMIN_TABS.includes(t as TabKey));

  const [tab, setTab] = useState<TabKey>(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return saved && allowed(saved) ? saved : 'preferences';
  });

  const selectTab = (v: TabKey) => {
    setTab(v);
    localStorage.setItem(TAB_STORAGE_KEY, v);
  };

  const items = [
    { value: 'preferences' as const, label: 'Preferences', icon: 'tune' },
    ...(canSettings
      ? [
          { value: 'business' as const, label: 'Business', icon: 'storefront' },
          { value: 'backup' as const, label: 'System', icon: 'dns' },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-gutter">
      <PageHeader title="Settings" description="Configure your interface and manage your data." />
      <Tabs value={tab} onChange={(v) => selectTab(v as TabKey)} items={items} />

      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'business' && canSettings && <BusinessTab />}
      {tab === 'backup' && canSettings && <SystemTab />}
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

      <SupportCard />
    </div>
  );
}

function SupportCard() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Support" subtitle="Need help with STMS? Contact the developer" />
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="support_agent" size={22} />
            </span>
            <div>
              <p className="text-body-lg font-semibold text-on-surface">Ayub Abdi</p>
              <p className="text-body-sm text-on-surface-variant">Developer &amp; owner</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <a
              href="mailto:ayubabdiy@gmail.com"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2 text-body-sm text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <Icon name="mail" size={18} className="text-on-surface-variant" /> ayubabdiy@gmail.com
            </a>
            <a
              href="tel:+255657777687"
              className="inline-flex items-center gap-2 rounded-xl border border-outline-variant px-3 py-2 text-body-sm text-on-surface transition-colors hover:bg-surface-container-low"
            >
              <Icon name="call" size={18} className="text-on-surface-variant" /> 0657 777 687
            </a>
          </div>
        </div>
        <p className="mt-4 border-t border-outline-variant pt-3 text-[12px] text-on-surface-variant">
          &copy; {new Date().getFullYear()} STMS — Stationery Management System. Developed by Ayub
          Abdi. All rights reserved.
        </p>
      </CardBody>
    </Card>
  );
}

function BusinessTab() {
  const toast = useToast();
  const { data: settings, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [businessName, setBusinessName] = useState('');
  const [branchName, setBranchName] = useState('');

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.businessName);
      setBranchName(settings.branchName);
    }
  }, [settings]);

  const dirty =
    !!settings &&
    (businessName.trim() !== settings.businessName || branchName.trim() !== settings.branchName);

  const save = async () => {
    if (!businessName.trim()) {
      toast.error('Name required', 'Enter your business name.');
      return;
    }
    try {
      await update.mutateAsync({ businessName: businessName.trim(), branchName: branchName.trim() });
      toast.success('Saved', 'Your business name has been updated.');
    } catch (e) {
      toast.error('Could not save', extractMessage(e));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-gutter lg:grid-cols-2">
      <Card>
        <CardHeader title="Business identity" subtitle="Your shop name, shown in the sidebar and footer" />
        <CardBody>
          {isLoading ? (
            <p className="text-body-sm text-on-surface-variant">Loading…</p>
          ) : (
            <div className="space-y-4">
              <Field label="Business name" required>
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. KJ Stationery"
                  maxLength={80}
                />
              </Field>
              <Field label="Branch" hint="Optional label shown under the name">
                <Input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="e.g. Main Branch"
                  maxLength={80}
                />
              </Field>
              <Button icon="check" onClick={save} loading={update.isPending} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const RESTORE_PHRASE = 'RESTORE';

function SystemTab() {
  return (
    <div className="flex flex-col gap-gutter">
      <StartupSection />
      <AutoBackupSection />
      <BackupRestoreSection />
    </div>
  );
}

function AutoBackupSection() {
  const toast = useToast();
  const { data: settings, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const runBackup = useRunLocalBackup();
  const [dir, setDir] = useState('');
  const [time, setTime] = useState('22:00');

  useEffect(() => {
    if (settings) {
      setDir(settings.backupDir ?? '');
      setTime(settings.backupTime ?? '22:00');
    }
  }, [settings]);

  const enabled = !!settings?.autoBackupEnabled;
  const lastOk = settings?.lastBackupStatus === 'ok';

  const toggle = async () => {
    try {
      await update.mutateAsync({ autoBackupEnabled: !enabled });
      toast.success(
        !enabled ? 'Automatic backups on' : 'Automatic backups off',
        !enabled ? 'A backup will be saved to disk once a day.' : 'Daily backups are paused.',
      );
    } catch (e) {
      toast.error('Could not change setting', extractMessage(e));
    }
  };

  const saveDir = async () => {
    try {
      await update.mutateAsync({ backupDir: dir.trim() });
      toast.success('Saved', 'Backup folder updated.');
    } catch (e) {
      toast.error('Could not save folder', extractMessage(e));
    }
  };

  const saveTime = async () => {
    try {
      await update.mutateAsync({ backupTime: time });
      toast.success('Saved', `Daily backup will run at ${time}.`);
    } catch (e) {
      toast.error('Could not save time', extractMessage(e));
    }
  };

  const backupNow = async () => {
    try {
      const r = await runBackup.mutateAsync();
      toast.success('Backup saved', `Saved to ${r.dir}`);
    } catch (e) {
      toast.error('Backup failed', extractMessage(e));
    }
  };

  const dirDirty = !!settings && dir.trim() !== (settings.backupDir ?? '');
  const timeDirty = !!settings && time !== (settings.backupTime ?? '22:00');

  return (
    <Card>
      <CardHeader title="Automatic backups" subtitle="Save a daily copy of your data to this computer's disk" />
      <CardBody>
        {isLoading || !settings ? (
          <p className="text-body-sm text-on-surface-variant">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    enabled ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  <Icon name={enabled ? 'cloud_done' : 'cloud_off'} size={20} />
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">
                    {enabled ? `On — daily at ${settings.backupTime}` : 'Off'}
                  </p>
                  <p className="text-[12px] text-on-surface-variant">
                    Saved to <span className="font-mono-data">{settings.effectiveBackupDir}</span>
                  </p>
                </div>
              </div>
              <Button
                variant={enabled ? 'outline' : 'primary'}
                icon={enabled ? 'toggle_off' : 'toggle_on'}
                loading={update.isPending}
                onClick={toggle}
              >
                {enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-on-surface-variant">Last backup:</span>
              {settings.lastBackupAt ? (
                <>
                  <span className="font-medium text-on-surface">
                    {new Date(settings.lastBackupAt).toLocaleString()}
                  </span>
                  <Badge tone={lastOk ? 'success' : 'error'}>{lastOk ? 'OK' : 'Failed'}</Badge>
                </>
              ) : (
                <span className="text-on-surface-variant">Never</span>
              )}
              {!lastOk && settings.lastBackupStatus && (
                <span className="text-error">{settings.lastBackupStatus}</span>
              )}
              <Button
                variant="outline"
                size="sm"
                icon="save"
                className="ml-auto"
                loading={runBackup.isPending}
                onClick={backupNow}
              >
                Back up now
              </Button>
            </div>

            <Field
              label="Backup time"
              hint="When the daily backup runs. If the computer is off then, it backs up as soon as it's next turned on."
            >
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-40 font-mono-data"
                />
                <Button variant="outline" icon="check" onClick={saveTime} loading={update.isPending} disabled={!timeDirty}>
                  Save
                </Button>
              </div>
            </Field>

            <Field label="Backup folder" hint="Leave blank to use the default (drive D on Windows)">
              <div className="flex gap-2">
                <Input
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  placeholder={settings.defaultBackupDir}
                  className="flex-1 font-mono-data"
                />
                <Button variant="outline" icon="check" onClick={saveDir} loading={update.isPending} disabled={!dirDirty}>
                  Save
                </Button>
              </div>
            </Field>

            <div className="flex gap-2 rounded-xl bg-surface-container-low p-3 text-[13px] text-on-surface-variant">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              <span>
                These on-disk backups stay on this computer. For safety against disk failure or theft,
                copy the backup files from that folder to a USB drive or cloud now and then.
              </span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function StartupSection() {
  const toast = useToast();
  const { data: status, isLoading } = useStartupStatus();
  const setStartup = useSetStartup();

  const toggle = async () => {
    if (!status) return;
    try {
      const next = await setStartup.mutateAsync(!status.enabled);
      toast.success(
        next.enabled ? 'Startup enabled' : 'Startup disabled',
        next.enabled
          ? 'STMS will start automatically when this computer boots.'
          : "STMS won't start on boot (it keeps running now; start it manually next time).",
      );
    } catch (e) {
      toast.error('Could not change startup', extractMessage(e));
    }
  };

  const enabled = !!status?.enabled;
  const supported = !!status?.supported;
  const installed = !!status?.installed;

  return (
    <Card className="border border-tertiary/40">
      <CardHeader title="Run on startup" subtitle="Start STMS automatically when this computer turns on" />
      <CardBody>
        {/* Technical warning, as requested. */}
        <div className="mb-4 flex gap-2 rounded-xl border border-outline-variant bg-surface-container-high p-3 text-[13px] text-on-surface-variant">
          <Icon name="engineering" size={18} className="mt-0.5 shrink-0 text-on-surface-variant" />
          <span>
            <strong className="text-on-surface">
              Technical setting — only change this if you know what you're doing.
            </strong>{' '}
            It sets the STMS background service to start (or not) when Windows boots. For a shop till
            this is convenient, but it's meant for whoever set the computer up.
          </span>
        </div>

        {isLoading ? (
          <p className="text-body-sm text-on-surface-variant">Checking status…</p>
        ) : !supported ? (
          <p className="text-body-sm text-on-surface-variant">
            Automatic startup is only available on Windows.
          </p>
        ) : !installed ? (
          <div className="flex gap-2 rounded-xl bg-surface-container-high p-3 text-[13px] text-on-surface-variant">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <span>
              The STMS background service isn't installed yet. On this computer, open a terminal as
              Administrator and run <span className="font-mono-data">npm run service:install</span>{' '}
              once — then this toggle controls whether it starts on boot.
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-surface-container-low p-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg',
                    enabled ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant',
                  )}
                >
                  <Icon name={enabled ? 'power' : 'power_off'} size={20} />
                </span>
                <div>
                  <p className="text-body-sm font-semibold text-on-surface">
                    {enabled ? 'Starts on boot' : 'Manual start'}
                  </p>
                  <p className="text-[12px] text-on-surface-variant">
                    Runs as the <span className="font-mono-data">{status?.serviceName}</span> service,
                    serving <span className="font-mono-data">{status?.url}</span>
                  </p>
                </div>
              </div>
              <Button
                variant={enabled ? 'outline' : 'primary'}
                icon={enabled ? 'toggle_off' : 'toggle_on'}
                loading={setStartup.isPending}
                onClick={toggle}
              >
                {enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>

            {!status?.productionReady && (
              <div className="mt-3 flex gap-2 rounded-xl bg-error-container/40 p-3 text-[13px] text-on-error-container">
                <Icon name="build" size={16} className="mt-0.5 shrink-0" />
                <span>
                  No production build found yet. The service can only serve once the app is built
                  (<span className="font-mono-data">npm run build:all</span>).
                </span>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

function BackupRestoreSection() {
  const toast = useToast();
  const { logout } = useAuth();
  const restore = useRestoreBackup();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const canRestore = !!file && confirmText.trim().toUpperCase() === RESTORE_PHRASE && !restore.isPending;

  const onRestore = async () => {
    if (!file) return;
    try {
      await restore.mutateAsync(file);
      // The signed-in session belongs to the database that was just replaced —
      // the account may not even exist in the backup. Sign out rather than
      // reload into a half-valid session.
      toast.success('Database restored', 'Sign in again to continue.');
      setTimeout(() => logout(), 1500);
    } catch (e) {
      toast.error('Restore failed', extractMessage(e));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-gutter">
      {/* Restore */}
      <Card className="border border-error/40">
        <CardHeader title="Restore" subtitle="Replace everything with a backup file" />
        <CardBody>
          <div className="flex gap-2 rounded-xl bg-error-container/50 p-3 text-[13px] text-on-error-container">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
            <span>
              This <strong>permanently replaces all current data</strong> with the contents of the
              uploaded backup. Anything recorded since that backup will be lost. Make sure no one
              else is using the system, and download a fresh backup first. You will be signed out
              afterwards, since your login belongs to the database being replaced.
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
