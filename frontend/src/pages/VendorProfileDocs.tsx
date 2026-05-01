import { Link } from 'react-router-dom'
import { BookOpen, ArrowRight, ChevronRight, Info, AlertTriangle, Zap, Shield } from 'lucide-react'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 pb-2 border-b border-gray-200 dark:border-white/10">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ name, type, children }: { name: string; type: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
      <div className="w-56 flex-shrink-0">
        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">{name}</code>
        <div className="text-xs text-gray-400 mt-0.5">{type}</div>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{children}</div>
    </div>
  )
}

function DiagramBox({ label, sub, color = 'blue' }: { label: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    green: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    amber: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    purple: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200',
    gray: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300',
    red: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
  }
  return (
    <div className={`border rounded-lg px-3 py-2 text-center ${colors[color]}`}>
      <div className="text-sm font-medium">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
    </div>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 mx-1">
      <ArrowRight className="w-4 h-4 text-gray-400" />
      {label && <span className="text-[10px] text-gray-400">{label}</span>}
    </div>
  )
}

function DownArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 my-1">
      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
      <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-300 dark:border-t-gray-600" />
      {label && <span className="text-[10px] text-gray-400 mt-0.5">{label}</span>}
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-lg p-4 text-xs font-mono text-gray-800 dark:text-gray-200 overflow-x-auto leading-relaxed">
      {children}
    </pre>
  )
}

function Callout({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  if (type === 'warning') {
    return (
      <div className="flex gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-4">
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">{children}</div>
      </div>
    )
  }
  return (
    <div className="flex gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg p-4">
      <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{children}</div>
    </div>
  )
}

export default function VendorProfileDocs() {
  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vendor Profiles</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        How Themis learns to talk to every vendor and OS, and how to extend it for new devices.
      </p>

      {/* TOC */}
      <nav className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">On this page</p>
        <ul className="space-y-1.5 text-sm">
          {[
            ['#what', 'What is a Vendor Profile?'],
            ['#resolution', 'How Profiles Are Resolved'],
            ['#deploy-flow', 'Deployment Flow'],
            ['#safe-deploy', 'Safe (Guarded) Deployment'],
            ['#replace', 'Config Replace (Revert-to-Golden)'],
            ['#drift', 'Drift Detection'],
            ['#fields', 'Field Reference (incl. drain_rules)'],
            ['#example', 'Full TOML Example'],
            ['#overrides', 'Adding Custom Overrides'],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <ChevronRight className="w-3 h-3 text-gray-400" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">

        {/* What is a Vendor Profile */}
        <Section id="what" title="What is a Vendor Profile?">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            Every network OS has a different CLI, different commands to enter config mode, different
            commit semantics, different error messages. A <strong className="text-gray-900 dark:text-white">Vendor Profile</strong> is
            a data-driven description of those differences. Themis uses it to drive every SSH
            operation without any hardcoded vendor logic in the application code.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
            Profiles ship built-in for a variety of common network operating systems, and operators
            can add or override them from{' '}
            <Link to="/admin" className="text-blue-600 dark:text-blue-400 hover:underline">
              Admin → Vendor Profiles
            </Link>
            .
          </p>
          <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl p-5">
            <DiagramBox label="Device record" sub="vendor + os fields" color="gray" />
            <Arrow label="resolve()" />
            <DiagramBox label="Vendor Profile" sub="matched by OS first, then vendor" color="blue" />
            <Arrow label="drives" />
            <div className="flex flex-col gap-2">
              <DiagramBox label="Pull config" color="green" />
              <DiagramBox label="Deploy change" color="green" />
              <DiagramBox label="Replace config" color="green" />
              <DiagramBox label="Drift check" color="green" />
            </div>
          </div>
        </Section>

        {/* Resolution */}
        <Section id="resolution" title="How Profiles Are Resolved">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            When Themis needs a profile for a device, it runs the following lookup in order.
            The first match wins.
          </p>
          <div className="flex flex-col items-center mb-6">
            <DiagramBox label={'Device OS field (e.g. "ios")'} color="gray" />
            <DownArrow label="exact match against profile.matches" />
            <DiagramBox label="OS match found → use it" color="green" />
            <DownArrow label="no match, try vendor" />
            <DiagramBox label={'Device Vendor field (e.g. "Cisco Systems")'} color="gray" />
            <DownArrow label="substring match against profile.matches" />
            <DiagramBox label="Vendor match found → use it" color="green" />
            <DownArrow label="still no match" />
            <DiagramBox label="Catch-all / default profile" color="amber" />
          </div>
          <Callout type="info">
            OS matching is <strong>exact</strong> (case-insensitive), so the OS field always takes priority
            and will never accidentally match a profile via vendor substring. Vendor matching is
            substring-based for human-entered strings like "Cisco Systems".
          </Callout>
        </Section>

        {/* Deployment Flow */}
        <Section id="deploy-flow" title="Deployment Flow">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5">
            When a change is deployed, Themis assembles a command sequence from the profile fields and
            sends them over an interactive SSH shell.
          </p>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Command sequence (standard deploy)</p>
            <div className="flex flex-col gap-1 text-sm font-mono">
              {[
                ['disable_pager', 'blue', 'e.g. terminal length 0'],
                ['configure_enter', 'purple', 'e.g. configure terminal'],
                ['... user commands ...', 'gray', 'the lines from the change'],
                ['configure_save', 'green', 'e.g. commit'],
                ['configure_exit', 'gray', 'e.g. end'],
                ['save_config', 'green', 'e.g. write memory (IOS)'],
              ].map(([label, color, hint]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    color === 'blue' ? 'bg-blue-400' :
                    color === 'purple' ? 'bg-purple-400' :
                    color === 'green' ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  <code className="text-gray-800 dark:text-gray-200 w-40">{label as string}</code>
                  <span className="text-gray-400 text-xs">{hint as string}</span>
                </div>
              ))}
            </div>
          </div>
          <Callout type="info">
            Lines that are empty or start with <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">!</code> (IOS comment marker) are
            stripped from the user's commands before sending. Each command's output is scanned against
            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded"> error_patterns</code>, if a match is found, the deploy fails immediately and reports the bad line.
          </Callout>
        </Section>

        {/* Safe Deploy */}
        <Section id="safe-deploy" title="Safe (Guarded) Deployment">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5">
            Safe deploys add an automatic rollback guard so the device reverts if SSH connectivity is
            lost after applying the change. Two guard mechanisms are supported, both fully data-driven.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            {/* Reload guard */}
            <div className="border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Reload Guard</span>
                <span className="text-xs text-gray-400">(reload-based)</span>
              </div>
              <div className="flex flex-col items-start gap-1 text-xs mb-3">
                {[
                  ['reload_guard_cmd', 'Schedule reload in 2 min'],
                  ['... apply changes ...', ''],
                  ['SSH check passes?', ''],
                  ['reload_guard_cancel', 'Cancel the reload'],
                  ['save_config', 'Persist to startup'],
                ].map(([label, hint]) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    <code className="text-gray-800 dark:text-gray-200">{label as string}</code>
                    {hint && <span className="text-gray-400">{hint as string}</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                If SSH check fails, the reload fires automatically and the device reverts to its
                startup config.
              </p>
            </div>

            {/* Commit confirmed */}
            <div className="border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Commit Confirmed</span>
                <span className="text-xs text-gray-400">(candidate-config)</span>
              </div>
              <div className="flex flex-col items-start gap-1 text-xs mb-3">
                {[
                  ['configure_enter', 'Enter config mode'],
                  ['... user commands ...', ''],
                  ['guarded_configure_save', 'commit confirmed 2'],
                  ['SSH check passes?', ''],
                  ['guard_confirm_cmds', 'configure → commit → exit'],
                ].map(([label, hint]) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    <code className="text-gray-800 dark:text-gray-200">{label as string}</code>
                    {hint && <span className="text-gray-400">{hint as string}</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                The device automatically rolls back the candidate config if the session is lost before{' '}
                <code className="font-mono">commit</code> is confirmed, no reload needed.
              </p>
            </div>
          </div>

          <Callout type="warning">
            If neither <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">reload_guard_cmd</code> nor{' '}
            <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">guarded_configure_save</code> is set, Themis still
            delays saving until the post-deploy SSH check passes, but the device won't self-recover
            if connectivity is lost.
          </Callout>
        </Section>

        {/* Config Replace */}
        <Section id="replace" title="Config Replace (Revert-to-Golden)">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5">
            Reverting to a golden config is an atomic full-replace, not a paste. Two methods are tried
            in order of preference.
          </p>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl p-5 mb-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Replace attempt order</p>
            <div className="flex flex-col gap-3">

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Terminal inline <code className="text-xs font-mono text-purple-600 dark:text-purple-400">(terminal_replace_cmd)</code></p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Streams the full config to stdin of a command like <code className="font-mono">load override terminal</code>, terminated with Ctrl-D. No SCP required.</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-xs font-mono text-gray-600 dark:text-gray-300">
                    <DiagramBox label="replace_enter" color="gray" />
                    <Arrow />
                    <DiagramBox label="terminal_replace_cmd" color="purple" />
                    <Arrow label="stream + Ctrl-D" />
                    <DiagramBox label="replace_exit" color="gray" />
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-100 dark:bg-white/5 mx-9" />

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">SCP upload + file replace <code className="text-xs font-mono text-blue-600 dark:text-blue-400">(replace_command)</code></p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Uploads the config via SCP then runs the replace command. Each path in <code className="font-mono">scp_paths</code> is tried in order.</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-xs font-mono text-gray-600 dark:text-gray-300">
                    <DiagramBox label="SCP upload" color="blue" />
                    <Arrow />
                    <DiagramBox label="replace_enter" color="gray" />
                    <Arrow />
                    <DiagramBox label="replace_command" color="blue" />
                    <Arrow />
                    <DiagramBox label="replace_exit" color="gray" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Callout type="info">
            Before uploading, Themis strips lines whose prefix matches{' '}
            <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">drift_ignore_prefixes</code>. These are display-only metadata lines that
            the device parser rejects on load.
          </Callout>
        </Section>

        {/* Drift */}
        <Section id="drift" title="Drift Detection">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-5">
            The drift checker runs periodically, pulls the running config from each device, and compares
            it against the stored golden config. Two mechanisms keep comparisons meaningful.
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <div className="border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Built-in volatile lines</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Always stripped regardless of vendor, common timestamp comments:</p>
              <ul className="text-xs font-mono text-gray-600 dark:text-gray-300 space-y-1">
                <li className="text-gray-400">!Time: Sun Apr 27 ...</li>
                <li className="text-gray-400">! Last configuration change at ...</li>
                <li className="text-gray-400">Building configuration...</li>
                <li className="text-gray-400">Current configuration : 4096 bytes</li>
              </ul>
            </div>
            <div className="border border-gray-200 dark:border-white/10 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Per-OS volatile prefixes</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Lines whose prefix matches any entry in{' '}
                <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">drift_ignore_prefixes</code> are stripped
                before comparison:
              </p>
              <ul className="text-xs font-mono text-gray-600 dark:text-gray-300 space-y-1">
                <li><span className="text-gray-400">## Last commit: ...</span></li>
                <li><span className="text-gray-400 italic">add your own for any OS</span></li>
              </ul>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Drift check cycle</p>
            <div className="flex items-center gap-2 flex-wrap">
              <DiagramBox label="Pull running config" color="gray" />
              <Arrow />
              <DiagramBox label="Normalize both configs" sub="strip volatile lines" color="blue" />
              <Arrow />
              <DiagramBox label="Compare line-by-line" color="blue" />
              <Arrow />
              <div className="flex flex-col gap-2">
                <DiagramBox label="Identical → auto-resolve open drift" color="green" />
                <DiagramBox label="Different → upsert open drift record" color="red" />
              </div>
            </div>
          </div>
        </Section>

        {/* Field Reference */}
        <Section id="fields" title="Field Reference">
          <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-b border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Identification</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="matches" type="string[]">
                Keywords used to select this profile. The OS field is matched by exact equality;
                the vendor field by substring. Example: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">["ios", "cisco"]</code>
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Config Pull</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="disable_pager" type="string[]">
                Commands sent first to prevent the device from paginating output (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">terminal length 0</code>,{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">set cli screen-length 0</code>).
              </Field>
              <Field name="show_config" type="string">
                Command that returns the full running configuration (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">show running-config</code>,{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">show configuration | no-more</code>).
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Standard Deployment</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="configure_enter" type="string[]">
                Commands to enter configuration mode before applying changes (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">configure terminal</code>).
              </Field>
              <Field name="configure_save" type="string[]">
                Commands run inside config mode after all user commands, used for vendors that require
                an explicit commit (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">commit</code>). Leave empty when saving happens automatically on exit.
              </Field>
              <Field name="configure_exit" type="string[]">
                Commands to leave configuration mode (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">end</code>, <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">exit</code>).
              </Field>
              <Field name="save_config" type="string[]">
                Commands to persist config to non-volatile storage after exiting config mode
                (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">write memory</code>, <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">copy running-config startup-config</code>). Empty for vendors
                where commit is the save.
              </Field>
              <Field name="error_patterns" type="string[]">
                Case-insensitive substrings. If any output line contains one of these, the deploy
                halts and reports the error (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">% invalid input</code>, <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">error:</code>).
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Safe (Guarded) Deployment</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="reload_guard_cmd" type="string | null">
                Command to schedule an automatic rollback reload before applying changes. Themis cancels
                it after a successful post-deploy SSH check. Example:{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">reload in 2</code>.
              </Field>
              <Field name="reload_guard_cancel" type="string | null">
                Command to cancel the scheduled reload after the SSH check passes. Example:{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">reload cancel</code>.
              </Field>
              <Field name="guarded_configure_save" type="string[]">
                Replaces <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">configure_save</code> during a safe deploy when the vendor's guard <em>is</em> the
                commit itself. Example: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">["commit confirmed 2"]</code>, the device will
                auto-rollback if SSH is lost within 2 minutes.
              </Field>
              <Field name="guard_confirm_cmds" type="string[]">
                Commands run after a successful post-deploy SSH check to permanently confirm a guarded
                commit. Example: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">["configure", "commit", "exit"]</code>.
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Config Replace (Revert-to-Golden)</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="replace_command" type="string | null">
                SCP-based replace command. Use <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{path}'}</code> as a placeholder for the uploaded file
                path. Example: <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">configure replace {'{path}'} force</code>.
              </Field>
              <Field name="terminal_replace_cmd" type="string | null">
                Inline terminal replace command. Themis streams the full config to its stdin and sends
                Ctrl-D. Tried first, preferred over SCP. Example:{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">load override terminal</code>.
              </Field>
              <Field name="replace_enter" type="string[]">
                Commands sent before <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">replace_command</code> or <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">terminal_replace_cmd</code>. Use this to enter
                config mode if the replace command requires it.
              </Field>
              <Field name="replace_exit" type="string[]">
                Commands sent after a successful replace to activate the loaded config
                (e.g. <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">commit</code>).
              </Field>
              <Field name="scp_paths" type="string[]">
                Ordered list of remote paths to attempt for SCP upload. Use{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{'{filename}'}</code> as a placeholder. First successful upload wins. Example:
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded"> ["flash:/{'{filename}'}","bootflash:/{'{filename}'}"]</code>.
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Config Pull Tuning</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="pull_quiet_ms" type="number (ms) | null">
                How long the SSH output channel must be silent before Themis considers the config pull
                complete. Increase this for devices with very large configs that pause several seconds
                between output chunks. Default is <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">1200</code> ms. Setting this too low causes truncated golden configs and oscillating false drift.
              </Field>
              <Field name="pull_max_ms" type="number (ms) | null">
                Maximum wall-clock time to wait for a config pull regardless of quiet window. Default
                is <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">30000</code> ms. Increase for very large configs that take longer to fully transfer.
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Command Timing</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="drain_rules" type="{ command?, command_starts_with?, drain_ms }[]">
                Per-command drain windows that override the defaults. Each entry specifies how long
                Themis waits for output to settle after sending that command. Use{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">command</code> for exact match or{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">command_starts_with</code> for prefix match.
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono space-y-0.5">
                  <div className="text-gray-500">Built-in fallbacks (when no drain_rule matches):</div>
                  <div className="text-gray-700 dark:text-gray-300">configure_save / save_config commands → <span className="text-amber-600 dark:text-amber-400">3000 ms</span></div>
                  <div className="text-gray-700 dark:text-gray-300">guarded_configure_save commands &nbsp;&nbsp;&nbsp;&nbsp;→ <span className="text-amber-600 dark:text-amber-400">5000 ms</span></div>
                  <div className="text-gray-700 dark:text-gray-300">all other commands &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ <span className="text-gray-500">600 ms</span></div>
                </div>
                <div className="mt-2 text-xs text-gray-500">Example, slow write on this OS:</div>
                <code className="block mt-1 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 whitespace-pre">{`[[vendor_profiles.drain_rules]]
command = "write memory"
drain_ms = 4000`}</code>
              </Field>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 border-y border-gray-200 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Drift Detection</p>
            </div>
            <div className="px-4 divide-y divide-gray-100 dark:divide-white/5">
              <Field name="drift_ignore_prefixes" type="string[]">
                Line prefixes (case-insensitive) stripped before drift comparison <em>and</em> before
                uploading a config for replace. Use this for volatile metadata lines that change on
                every commit but carry no configuration meaning. Example:{' '}
                <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">["## "]</code> to strip last-commit comment lines.
              </Field>
            </div>
          </div>
        </Section>

        {/* Full Example */}
        <Section id="example" title="Full TOML Example">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            A complete profile expressed as a TOML override block, showing all available fields.
            Use this as a template when adding support for a new vendor.
          </p>
          <CodeBlock>{`[[vendor_profiles]]
matches = ["myos", "my vendor"]

# Config pull
disable_pager     = ["set cli screen-length 0"]
show_config       = "show configuration | no-more"

# Standard deployment
# Candidate-config model: changes accumulate until \`commit\`.
configure_enter   = ["configure"]
configure_save    = ["commit"]     # explicit commit required
configure_exit    = ["exit"]
save_config       = []             # commit is the save, no write memory needed

error_patterns    = [
  "error:", "syntax error,", "unknown command.",
  "missing argument.", "invalid value", "commit failed"
]

# Safe guarded deployment
# \`commit confirmed 2\` auto-rolls-back if SSH is lost within 2 minutes.
# After the SSH check passes, guard_confirm_cmds finalizes it permanently.
guarded_configure_save = ["commit confirmed 2"]
guard_confirm_cmds     = ["configure", "commit", "exit"]

# Config replace, revert to golden
# Terminal inline is tried first, no SCP dependency.
terminal_replace_cmd = "load override terminal"
replace_enter        = ["configure"]   # replace command runs in config mode
replace_exit         = ["commit"]      # activate the loaded config

# SCP fallback if terminal replace fails
replace_command = "load override {path}"
scp_paths       = ["/var/tmp/{filename}", "/tmp/{filename}"]

# Config pull tuning
pull_quiet_ms = 4000     # wait 4s of silence before treating pull as complete
pull_max_ms   = 120000   # give up after 2 minutes total

# Command timing, drain_rules
# Override how long Themis waits for output after each command.
# Built-in fallbacks: configure_save/save_config -> 3000ms,
#                     guarded_configure_save     -> 5000ms,
#                     all others                 -> 600ms
# Add rules here for any command that takes longer than the fallback.
[[vendor_profiles.drain_rules]]
command = "write memory"
drain_ms = 4000

[[vendor_profiles.drain_rules]]
command_starts_with = "commit confirmed"
drain_ms = 6000

# Drift detection
# Strip metadata lines that change on every commit but carry no config meaning.
drift_ignore_prefixes = ["## "]`}</CodeBlock>
        </Section>

        {/* Adding Overrides */}
        <Section id="overrides" title="Adding Custom Overrides">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            Operator-defined profiles are checked before built-ins, so you can override any built-in
            or add support for new vendors without changing application code.
          </p>
          <ol className="list-decimal list-inside space-y-3 text-sm text-gray-600 dark:text-gray-300 mb-6">
            <li>
              Go to{' '}
              <Link to="/admin" className="text-blue-600 dark:text-blue-400 hover:underline">
                Admin → Vendor Profiles
              </Link>
              .
            </li>
            <li>
              Click <strong className="text-gray-900 dark:text-white">Edit</strong> and paste a TOML{' '}
              <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">[[vendor_profiles]]</code> block following the template above.
            </li>
            <li>
              Set the device's <strong className="text-gray-900 dark:text-white">OS</strong> field to one of the
              strings in your profile's <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">matches</code> list, OS matching is exact so it will
              always win over any built-in.
            </li>
            <li>Save, profiles take effect immediately on the next SSH operation.</li>
          </ol>
          <Callout type="info">
            Multiple <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">[[vendor_profiles]]</code> blocks can coexist in the same TOML document.
            Each is evaluated independently and the first match for a given device wins.
          </Callout>
        </Section>

      </div>
    </div>
  )
}
