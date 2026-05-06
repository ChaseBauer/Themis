import { Link } from 'react-router-dom'
import { AlertTriangle, BookOpen, CheckCircle2, Info } from 'lucide-react'

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Callout({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  const Icon = type === 'warning' ? AlertTriangle : Info
  const colors =
    type === 'warning'
      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/50'
      : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-800/50'

  return (
    <div className={`flex gap-3 rounded-lg border p-4 ${colors}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function Field({ name, plain, children }: { name: string; plain: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[190px_1fr] py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
      <div>
        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">{name}</code>
        <div className="text-xs text-gray-400">{plain}</div>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{children}</div>
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

export default function VendorProfileDocs() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <BookOpen className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Vendor Profiles</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Vendor profiles are the device playbooks Themis uses for config pulls, deploys, safe rollback,
        revert to golden, and drift cleanup.
      </p>

      <nav className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-white/10 rounded-lg p-4 mb-10">
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          {[
            ['#mental-model', 'Mental model'],
            ['#matching', 'How matching works'],
            ['#common-edits', 'Common edits'],
            ['#fields', 'Field groups'],
            ['#example', 'Small example'],
            ['#safe-testing', 'Safe testing'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-12">
        <Section id="mental-model" title="Mental Model">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Pull Config', 'How to disable paging and capture the full running config.'],
              ['Deploy Changes', 'How to enter config mode, apply reviewed lines, commit, exit, and save.'],
              ['Safety Rollback', 'How to schedule reload rollback or use commit confirmed.'],
              ['Revert to Golden', 'How to replace the whole running config with a golden config.'],
              ['Drift Cleanup', 'How to strip timestamps, prompts, banners, and syslog noise.'],
              ['Advanced Timing', 'How long Themis waits after slow commands.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {title}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="matching" title="How Matching Works">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Themis checks override profiles first, then built-in profiles. The device OS field wins
              when it exactly matches one of the profile matches. If OS is empty or no OS match exists,
              Themis checks whether the device vendor contains one of the match strings.
            </p>
            <CodeBlock>{`matches = ["ios", "ios-xe", "cisco"]

Device OS "ios"      -> matches exactly
Device OS "ios-xe"   -> matches exactly
Vendor "Cisco Inc."  -> matches because it contains "cisco"`}</CodeBlock>
            <Callout type="info">
              Put OS names first and keep them specific. Use broad vendor names as fallback matches.
            </Callout>
          </div>
        </Section>

        <Section id="common-edits" title="Common Edits">
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Hide noisy drift lines</h3>
              <CodeBlock>{`config_ignore_prefixes = ["!Time:", "## Last commit:"]
config_ignore_contains = [" /kernel: ", "message from syslogd"]`}</CodeBlock>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Make slow config pulls reliable</h3>
              <CodeBlock>{`pull_quiet_ms = 4000
pull_max_ms = 120000`}</CodeBlock>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Use commit confirmed safety</h3>
              <CodeBlock>{`guarded_configure_save = ["commit confirmed {rollback_minutes}"]
guard_confirm_cmds = ["configure", "commit", "exit"]`}</CodeBlock>
            </div>
          </div>
        </Section>

        <Section id="fields" title="Field Groups">
          <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4">
            <Field name="matches" plain="who uses this profile">
              OS values are exact matches. Vendor values are substring matches.
            </Field>
            <Field name="disable_pager, show_config" plain="pull config">
              Prevent paging and print the full running config.
            </Field>
            <Field name="configure_enter, configure_save, configure_exit, save_config" plain="deploy">
              Build the command flow for a normal reviewed change.
            </Field>
            <Field name="error_patterns" plain="deploy failure detection">
              If output contains one of these strings, Themis marks the command failed.
            </Field>
            <Field name="reload_guard_cmd, reload_guard_cancel" plain="reload safety">
              Schedule a rollback reload before deploying, then cancel it after SSH is verified.
            </Field>
            <Field name="guarded_configure_save, guard_confirm_cmds" plain="commit safety">
              Use candidate-config rollback such as Junos commit confirmed.
            </Field>
            <Field name="terminal_replace_cmd, replace_command, scp_paths" plain="revert to golden">
              Replace the whole config using terminal streaming or SCP plus a replace command.
            </Field>
            <Field name="config_ignore_exact, config_ignore_prefixes, config_ignore_contains" plain="drift cleanup">
              Remove non-config lines before saving golden configs and checking drift.
            </Field>
            <Field name="command_responses" plain="interactive prompts">
              Answer prompts like reload confirmations or destination filename prompts.
            </Field>
            <Field name="drain_rules" plain="timing">
              Wait longer after slow commands such as write memory or commit.
            </Field>
          </div>
        </Section>

        <Section id="example" title="Small Example">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
            This is enough for a simple IOS-like device.
          </p>
          <CodeBlock>{`[[vendor_profiles]]
matches = ["acme-os", "acme"]

disable_pager = ["terminal length 0"]
show_config = "show running-config"

configure_enter = ["configure terminal"]
configure_save = []
configure_exit = ["end"]
save_config = ["write memory"]

reload_guard_cmd = "reload in {rollback_minutes}"
reload_guard_cancel = "reload cancel"

error_patterns = ["% invalid input", "error:"]
config_ignore_prefixes = ["!Time:", "! Last configuration change at "]`}</CodeBlock>
        </Section>

        <Section id="safe-testing" title="Safe Testing">
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li>
              Open <Link to="/admin" className="text-blue-600 dark:text-blue-400 hover:underline">Admin, Vendor Profiles</Link>.
            </li>
            <li>Edit a built-in profile to create an override, or add a new profile.</li>
            <li>Start with Pull Config and Drift Cleanup before changing deploy behavior.</li>
            <li>Test against one lab device before applying the same OS profile broadly.</li>
            <li>Use revert to golden only after confirming the profile performs a true full replace for that OS.</li>
          </ol>
          <div className="mt-4">
            <Callout type="warning">
              Profile overrides take effect immediately on the next SSH operation. A bad deploy or
              replace command can break device access, so test changes with a lab device first.
            </Callout>
          </div>
        </Section>
      </div>
    </div>
  )
}
