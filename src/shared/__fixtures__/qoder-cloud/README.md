# Qoder Cloud Agents fixtures

These are sanitized, capture-shaped fixtures for the vendor wire format, not
verbatim account exports. Identifiers are synthetic and retain cross-event
references. Private source code, personal deployment prompts, migration metadata,
and browser tracking parameters have been replaced with synthetic examples.

Some harmless multilingual payloads remain to exercise transcript rendering.
Tests assert the event structure, ordering and derived facts rather than relying
on account-specific content. Do not add real repository credentials, signed URLs,
or account identifiers here.

Live E2E cases that require particular sessions read their IDs from
`ORCA_QODER_LIVE_SATISFIED_SESSION_ID`,
`ORCA_QODER_LIVE_ITERATION_LIMIT_SESSION_ID`,
`ORCA_QODER_LIVE_ARTIFACT_SESSION_ID`, and
`ORCA_QODER_LIVE_ERROR_SESSION_ID`. Unconfigured optional cases are skipped.
