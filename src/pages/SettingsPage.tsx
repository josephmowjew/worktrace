import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

export function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Profile, reporting defaults, Git author, and appearance preferences.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel className="col-span-1">
          <h2 className="text-lg font-semibold">Profile Settings</h2>
          <div className="mt-5 space-y-4">
            {["Full Name", "Email Address", "Default Manager", "Git Author Email"].map((label) => (
              <label key={label} className="grid gap-2 text-sm font-medium text-slate-300">
                {label}
                <div className="h-11 rounded-xl border border-white/10 bg-white/[0.04]" />
              </label>
            ))}
            <Button variant="primary">Save Changes</Button>
          </div>
        </Panel>

        <Panel className="col-span-2">
          <h2 className="text-lg font-semibold">MVP Preferences</h2>
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
            Settings commands will persist profile, working days, report template, and theme in SQLite.
          </div>
        </Panel>
      </div>
    </div>
  );
}
