# Cloud agent sessions

**Status: experimental fork prototype; not merged into upstream Orca.**
Qoder Cloud Agents is the first target; other vendors test the reusable adapter seam.
UI placement and the launch flow are provisional and need maintainer feedback.
This page records the working model, because a cloud
session breaks the one assumption every current agent path shares: that the
provider is a process on a host Orca can reach.

Qoder Cloud Agents is the first provider. The contract is written so a second
vendor (Codex Cloud, Devin, Claude managed agents, Jules, …) is a new adapter,
not a new feature.

## The gap

Orca knows three execution hosts (`src/shared/execution-host.ts`):

```ts
export type ExecutionHostKind = 'local' | 'ssh' | 'runtime'
```

All three answer the same question: where can we **dial in** to run something? A
cloud agent session answers a different one: where did we **submit** work that we
cannot dial. The consequences, in the order they bite:

| Existing rule                                                                                 | Why a cloud session breaks it                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AgentSessionExecutionLocation` describes "where the provider process runs"                  | There is no process, and no `wslDistro`/`workspaceKind` to describe                                   |
| The structured-session lease keys on the provider root's pid + start time                     | No pid. A lease on a cloud session is a lease on the vendor's session id                               |
| `AgentSessionHandleProvider` is `'claude' \| 'codex'` and refuses unknown values              | A cloud handle is a vendor session id, not a transcript-local id                                       |
| Status arrives as PTY/OSC title or a hook POST                                                | Only an event stream arrives                                                                           |
| Loss of contact means `unverifiable`, never dead (`ssh-execution-boundary.md`)                | Same rule; now the normal state, since the desktop is often closed while the session runs             |

The last row is the good news. **Reuse `live` / `unverifiable` / `exited` verbatim.**
A closed laptop is no more evidence that a cloud turn ended than a dropped SSH
connection is evidence a remote process died.

## Design decision: not an execution host

A cloud session is **not** a fourth `ExecutionHostKind`. Hosts are dialable
endpoints that git, filesystem, PTY and port-forwarding code all assume they can
connect to; `runtime` already covers "another Orca". Putting a non-endpoint into
that union would make every host-scoped reader lie.

Instead: a cloud session is **an agent session whose location is a provider, not a
host**. The seam is `src/shared/cloud-agent-provider.ts`.

## Provider abstraction

Three layers, each of which a vendor adapter implements only as far as the vendor
allows. Capabilities are declared, never assumed; the UI renders only what the
adapter declares.

```ts
// src/shared/cloud-agent-provider.ts  (sketch of the shipped shape)

type CloudAgentProviderId = 'qoder-cloud' | (string & {})

type CloudAgentProviderCapabilities = {
  /** Can list sessions the user already has. Every provider must. */
  listSessions: true
  /** Historical events, paged.  */
  readTranscript: boolean
  /** Push updates (SSE / WS). False ⇒ Orca polls. */
  liveTail: boolean
  /** Start a new session from Orca. */
  createSession: boolean
  /** Send a follow-up message into a running session. */
  sendMessage: boolean
  /** Resolve a pending tool approval from Orca. */
  approveToolCall: boolean
  /** Cancel the active turn. */
  cancelTurn: boolean
  /** Resource kinds a session can be created with; empty when createSession is false. */
  sessionResources: readonly CloudSessionResourceKind[]
  /** Acceptance criteria the vendor can grade (Qoder: Outcomes). */
  outcomes: boolean
  /** Scheduled runs the vendor owns (Qoder: Deployments). */
  schedules: boolean
}

type CloudSessionResourceKind = 'git-repository' | 'file' | 'memory-store' | 'secret-vault'
```

### Layer 1 — Observe (prototype)

| Concept           | Shared type                        | Qoder mapping                                                                                                                  |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Session row       | `CloudAgentSessionRow`             | `GET /sessions`                                                                                                                 |
| State             | `CloudAgentSessionState`           | `status` **plus the event tail**: `status=running` with a tail of `session.status_idle{requires_action}` is `blocked`, not working |
| Transcript        | `NativeChatMessage[]`              | `GET /sessions/{id}/events` → `decodeQoderCloudTranscript`                                                                       |
| Live tail         | `QoderCloudStreamPush`             | `GET …/events/stream` (SSE, `Last-Event-ID` replay)                                                                             |

State vocabulary is fixed across providers: `working | blocked | idle | ended | unverifiable`.
`blocked` is the one that earns its place in a sidebar: it is the only state that
asks the human for something. Qoder's own `status` field does not surface it — the
event tail does. A second vendor must map to the same five words or stay out of the
sidebar.

### Layer 2 — Act (prototype)

Qoder exposes every action as a POST of an event into the session:

| Action           | Qoder event                        | Orca surface                                                                   |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| approve / deny   | `user.tool_confirmation`           | the amber "Needs approval" row and the drawer banner get Approve / Deny buttons |
| follow-up prompt | `user.message`                     | the drawer gets the same composer native chat uses, gated on `sendMessage`      |
| cancel           | `POST …/cancel`                    | the drawer header                                                               |
| interrupt        | `user.interrupt`                   | same control, when the turn is mid-flight                                       |

Rule: **an action is offered only where the vendor's own semantics make it safe.**
`user.message` returns 409 while a turn is active, so the composer is disabled
unless the tail says `idle`. Approve is offered only when the tail names the
pending `tool_use` id. Nothing is retried blindly: a 409 is shown, not swallowed.

### Layer 3 — Create (prototype)

A cloud session has **no local checkout**: the vendor clones the repository
inside its own sandbox. Selecting Cloud Agent from the workspace composer's
"Run on" picker therefore opens the same dedicated launcher as the **Cloud
sessions** sidebar action; it does not create a local workspace or run setup scripts.
Whether these are the right long-term entry points is still open for discussion.

The prompt-first launcher asks for a provider and, where supported, agent template
and environment. Project attribution is optional. Repository access, memory stores,
vaults and acceptance criteria belong under Advanced options. The current prototype
opens a created conversation in the main content area, with a composer and supported
actions; the earlier drawer layout remains an alternative rather than a settled UX.

The table below is kept because each row is still where a composer field would
have mapped; it is now a reference for what the dialog asks instead:

| Composer field (existing)     | Meaning under a cloud provider                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Project / repo                | Becomes a `git-repository` resource (Qoder: `github_repository` with `url`, `mount_path`, token)               |
| Agent picker (local CLIs)     | Replaced by the vendor's **agent templates** (Qoder: `GET /agents`, pinned `{id, version}`)                     |
| Name                          | Session `title`                                                                                                 |
| First prompt                  | The first `user.message`                                                                                        |
| Setup script                  | Not applicable: the vendor's **environment** (Qoder: `GET /environments`, packages + network policy) replaces it |
| Advanced                      | Vendor extras, each shown only if the capability is declared (below)                                            |

#### What Qoder adds that is worth a control

Observed on the live account, not from docs alone:

- **GitHub repositories as resources.** Clone into the sandbox, `gh` pre-wired with
  the token as `GH_TOKEN`, so "edit → push → PR" is one prompt. The composer already
  knows the repo and Orca already has provider-neutral token stores
  (`src/main/github/`, GitLab, Bitbucket). The adapter asks the user to pick a
  stored token or paste a scoped PAT; **it never reuses Orca's own GitHub login
  silently**, because that token's scope is Orca's, not the task's.
- **Memory stores** (`GET /memory_stores`): a vendor-side persistent filesystem the
  agent reads and writes across sessions (`/data/.qoder/awareness/…`). The live
  account has "customer-profiles" stores with two or three entries each. In the
  composer: a multi-select of existing stores, `read` or `read_write`, with a
  one-line `instructions`. Orca does not try to mirror memory contents; it links.
- **Outcomes** (`user.define_outcome`): a rubric the vendor grades after the turn,
  iterating up to N times. This maps onto something Orca already has a word for —
  the task's acceptance criteria. In the composer: an "Acceptance criteria" textarea
  under Advanced; when set, the first event is `user.define_outcome` instead of
  `user.message`. In the drawer: the `outcome_evaluations[]` verdict renders as a
  settled turn row (`satisfied` / `needs_revision` / `max_iterations_reached`),
  and `span.outcome_evaluation_*` events become reasoning rows. This is the
  mechanism a reviewer will care about: it turns "did the agent finish" into "did
  the agent pass", which is the question Orca's status store cannot answer today.
- **Deployments** (`GET /deployments`): cron-scheduled sessions the vendor owns
  (`0 9 * * 1`, timezone, `upcoming_runs_at`). Orca already has Automations and an
  `external-manager` concept for jobs it observes but does not own (Hermes cron). A
  deployment is exactly that: list it under Automations with the `external`
  badge, show next runs, deep-link to the sessions it spawned via `deployment_id`.
  Creating deployments from Orca is out of scope until Automations' own scheduling
  UX is reused rather than duplicated.
- **Vaults** (`GET /vaults`): named credential bundles mounted into the sandbox.
  Composer: a multi-select of existing vaults by `display_name`. Orca never reads
  vault contents.
- **Environments**: `networking: limited | …`, `allowed_hosts`, package lists. Shown
  read-only next to the environment picker so the user knows the sandbox cannot
  reach the internet before they ask it to fetch a URL.

"Dreaming" is not an API surface on the live account or in the docs we can reach;
it is left out until it has an endpoint.

#### Interaction sketch

```
New workspace
┌──────────────────────────────────────────────────────────┐
│ Project   [ your-org/your-repo ▾ ]                        │
│ Run on    [ ☁ Qoder Cloud · env: qoder-pad-qa-env ▾ ]     │  ← one more entry in the existing picker
│                                                           │
│ Agent     [ code-reviewer v2 ▾ ]   model: ultimate         │  ← vendor templates replace the CLI picker
│ Name      [ Fix refresh-token bug ]                        │
│ Prompt    [ Fix issue #128 … open a PR against main ]      │
│                                                           │
│ ▸ Advanced                                                │
│   Repository access   [ fine-grained PAT ▾ ] Contents RW, PRs RW │
│   Memory stores       [ customer-profiles (rw) ] [+]        │
│   Vaults              [ prod-readonly ] [+]                 │
│   Acceptance criteria [ - PR opened against main          │
│                         - unit tests added for refresh.ts ]│
│                        max iterations [3]                  │
│                                                           │
│   Sandbox network: limited · no package managers           │  ← read-only, from the environment
└──────────────────────────────────────────────────────────┘
                                   [ Start in Qoder Cloud ]
```

The session appears at the top of the sidebar's Cloud sessions group as `working`,
its drawer opens, and the live tail starts. If an outcome was set, the header shows
`evaluating → satisfied` as the vendor grades.

## Status

The Qoder prototype has been exercised against a live account: nine live
headful end-to-end tests cover the sidebar group, the transcript drawer, both
outcome verdicts, signed-URL image previews, an MCP-auth session error, a cron
deployment linked to the session it spawned, the write controls on a blocked
session, and a real create → archive round trip.

The capability object is what keeps the UI honest: a provider that declares
`createSession: false` shows no create control, and one that cannot approve tool
calls shows no Approve button.

## Launching cloud tasks

The sidebar's **New cloud task** action and **New workspace → Run on → Cloud Agent**
open the same prompt-first launcher. Project attribution is optional; choosing a
project prefills a supported HTTPS repository URL, but never creates a local
workspace. Agent and environment selectors appear only when the provider requires
those resources. Repository credentials and provider-specific resources live under
**Advanced options**.

Creation opens the conversation in the main content region, not a sidebar-owned
drawer. Collapsing the sidebar leaves it open. Its project selector can reassign
or clear local project attribution without moving anything at the vendor.

Provider/project-scoped preferences remember only agent and environment IDs;
repository tokens and message drafts are never persisted there. Titles, drafts,
selection and project associations use `(provider, sessionId)` identities. A lost
creation response disables resubmission until the user checks the task list. If a
session was created but its first message failed, Orca opens that session with a
warning and restores the prompt in its composer instead of creating another.

## Adding a second provider

The contract is provider-neutral, the transport routes by provider, and OpenHands
Cloud is a worked example (`src/main/cloud-agents/openhands-adapter.ts`): it
declares the four capabilities it has and the UI hides the rest. What a second
vendor actually has to touch:

| Layer | State | Work for provider #2 |
| --- | --- | --- |
| `src/shared/cloud-agent-provider.ts` | Generic. Descriptor, capability flags, state vocabulary, actions, failures | Add a descriptor to `cloud-agent-provider-registry.ts` |
| `src/shared/cloud-agent-outcome-vocabulary.ts` | Generic. Result words + rubric, vendor-free | Map the vendor's strings onto it inside that vendor's parser |
| `src/shared/cloud-agent-events.ts` | Canonical event vocabulary the renderer decodes | Translate the vendor's wire format into it (see `openhands-mapping.ts`) |
| `src/shared/qoder-cloud-*` | Vendor. Wire parser, outcome projection, notice text | Write the vendor's own; nothing neutral may import it |
| `src/main/qoder-cloud/` | Vendor logic, reached only through `CloudAgentAdapter` | Write the vendor's adapter, register it in `src/main/ipc/cloud-agents.ts` |
| IPC | Generic: `cloudAgent:<op>` for all 16 ops, payload is `{ provider, args }` | Nothing |
| `src/preload/api/cloud-agents-bridge.ts` | Generic: `makeCloudAgentApi(provider)`; `window.api.qoderCloud` is that factory with the first provider baked in | Nothing |
| Renderer | `cloudAgentApi(provider)` in `src/renderer/src/lib/`, threaded from the session row; capability flags drive the footer, the model picker and the automation list | Pass `row.provider` where a new surface holds a row |
| Transcript | Renderer decodes canonical `CloudAgentEvent[]` | Translate vendor events in the adapter; no renderer branch is needed |
| Credentials | Generic: `src/main/cloud-agents/credentials.ts` keys one file pair per provider id; `src/main/qoder-cloud/credential-store.ts` is the Qoder binding | Add a `SPECS` entry (file stem, keychain label, default base URL, env vars) |
| Settings | One card per registered provider: `QoderCloudIntegrationCard` for vendor quirks, `CloudAgentIntegrationCard` for everyone else | Nothing beyond the descriptor |

The fork contains three experimental adapters: **Qoder Cloud**, **OpenHands Cloud** (`openhands-adapter.ts`, mock-verified —
no account was available) and **Claude Managed Agents** (`claude-managed-adapter.ts`, verified
against the live beta `managed-agents-2026-04-01`). Claude is the interesting one because its event
vocabulary is nearly the canonical one, so approvals (`user.tool_confirmation`) and interrupts
(`user.interrupt`) are just events — the adapter needed no new transport.

Two things only the third provider exposed, both fixed:

- A failing provider blanked every other provider's rows in the sidebar. The fan-out now keeps the
  successful pages and drops only the failed one, so one vendor's outage degrades to a warning line.
- Failure copy said "Qoder Cloud is unreachable" for any provider. It now interpolates the label of
  the provider that actually failed (`cloudAgentFailureCopy(failure, providerLabel)`).

Multi-provider rules that follow from the same lesson: a credential that cannot be decrypted is a
`status().credentialError`, never a throw, so one provider's keychain prompt cannot take down the
list.

## Credentials

A PAT/SAT is a user secret and is stored the way `src/main/bitbucket/credential-store.ts`
stores service tokens: metadata plaintext, token sealed with `safeStorage`,
never in `userData` JSON, recipe files, skill content or screenshots. Env vars
(`ORCA_QODER_ACCESS_TOKEN`) win over the stored credential so a relay host needs
no keychain. For local development, `.env.local` (gitignored) is loaded by
`config/scripts/run-electron-vite-dev.mjs` and never overrides an exported variable;
`.env.example` lists every provider variable. Resolution order per provider: env → saved credential → the vendor CLI's own login
(only where a spec sets `vendorCliCredentialFile`, e.g. Anthropic's
`~/.config/anthropic/credentials/default.json` written by `ant auth login`), reported as
`source: 'ant-cli'` and rendered read-only, because deleting a file Orca does not own would log that
CLI out.

## Wire

Observe needs no new stream opcode: rows and events ride existing IPC. If a later
phase adds one, `docs/reference/remote-wire-compatibility.md` applies: a new
opcode is dropped silently by an older peer and must be capability-negotiated.

Because the desktop may be offline while the session runs, status is a
**projection of the last observed events**. A client that has been away renders
`unverifiable` until it re-reads, never the pre-absence status.

## Verification

- State mapping: table-driven tests over captured event fixtures
  (`src/shared/__fixtures__/qoder-cloud/`), one per row, including the parked
  `requires_action` tail that the vendor's own `status` field misreports.
- Live e2e gated on `ORCA_QODER_LIVE_TOKEN`: rows render, the drawer settles, the
  SSE tail reaches `open`.
- Freshness: no reader may turn silence into `exited`.
