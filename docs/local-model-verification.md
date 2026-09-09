# Local model verification — 2026-09-08

Myynd 0.2.9 connects the local engine to authenticated desktop API controls and Preferences. Downloads require an explicit action. Previously enabled, installed models resume on startup; app shutdown stops owned runtimes. Hosted deployments cannot launch these processes.

## Verified on this Mac

- Installed Homebrew llama.cpp 0.4.0, build 10809, commit 5266f24da.
- Downloaded the catalog's pinned Qwen3 4B Instruct Q4_K_M model through `casa.scarica`; the full size and SHA-256 matched.
- Started the real runtime and called `modello.chiedi` with an isolated configuration and no provider credentials. Title generation, Italian translation and schema-based extraction returned `da: 'locale'`. The known project name and deadline matched exactly.
- Warm requests took approximately 0.7, 1.0 and 1.4 seconds respectively. These are smoke-test measurements, not a performance benchmark.
- An 8,192-token output allowance with a short prompt succeeded; a 35,009-token input exceeded the 4,096-token context and returned HTTP 400, without silently truncating the input.
- Exercised Start → Starting → On → Stop → Ready to start through the actual Preferences UI and authenticated API. Confirmed the owned process exited.
- Checked missing runtime, authentication, cross-origin rejection, invalid actions and disk-space handling in isolated accounts.
- Full automated suite: 893 tests, 875 passed, 18 skipped, zero failures. Typecheck and production build passed.

## Fixes covered by regressions

- Concurrent starts share one launch; Stop invalidates pending launches and restarts.
- Shutdown cancels pending work and stops processes across account contexts.
- Insufficient disk space blocks downloads; oversized responses cannot exceed the expected file size.
- Disabled local processing is respected. Feed readiness is evaluated for its job, without unlocking unsupported chat/draft work.
- Truncated local output is rejected instead of accepted as complete, including otherwise parseable JSON.
- Partial downloads are not presented as installed; Preferences refreshes routing status after transitions.

## Limits

Myynd now selects Qwen3 4B Instruct by default on every supported Mac. This avoids silently choosing the 7.48 GB Mistral Nemo 12B model on a 16 GB machine and keeps the download at roughly 2.3 GB. The verified model/account fixtures were removed afterward, so the user's live account still requires the explicit **Download and start** action in Preferences.

The local runtime is installed on this Mac but is not bundled into the distributable. Chat, drafts and other frontier jobs still use the configured provider. Local failures can also fall back to that provider; this is not a strict offline or zero-cost mode. No paid API calls were used for this verification.
