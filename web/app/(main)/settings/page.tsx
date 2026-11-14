'use client';

import { useState } from 'react';
import NotificationToggle from '@/components/NotificationToggle';
import ProfileForm from '@/components/ProfileForm';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-app p-6">
      <div className="mx-auto max-w-md rounded-3xl bg-panel p-8 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold">Settings</h1>
        <ProfileForm
          submitLabel="Save changes"
          onDone={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }}
        />
        {saved && <p className="mt-3 text-center text-sm font-medium text-brand">Saved ✓</p>}
        <NotificationToggle />
      </div>
    </div>
  );
}
