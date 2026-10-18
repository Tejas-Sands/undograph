import { useCallback, useEffect, useRef, useState } from 'react'
import {
  runRequestSchema,
  runResultSchema,
  workspaceSnapshotSchema,
  type CorrectionRequest,
  type DocumentCorrection,
  type GeneralWorkspace,
  type RunRequest,
  type WorkspaceSnapshot,
} from '../shared/contracts'
import { ApiError, downloadJson, request } from './api'
import captured from '../fixtures/recorded-walkthrough.json'

export type RecordedStage = 'original' | 'corrected' | 'repaired'
export function useWorkspace(recorded: boolean, simulation = false) {
  const [live, setLive] = useState<WorkspaceSnapshot | null>(null)
  const [examples] = useState<Record<RecordedStage, WorkspaceSnapshot> | null>(() => recorded ? {
    original: workspaceSnapshotSchema.parse(captured.original),
    corrected: workspaceSnapshotSchema.parse(captured.corrected),
    repaired: workspaceSnapshotSchema.parse(captured.repaired),
  } : null)
  const [stage, setStage] = useState<RecordedStage>('original')
  const [loading, setLoading] = useState(!recorded)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const refreshing = useRef<Promise<void> | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(
    (afterMutation = false): Promise<void> => {
      if (recorded || !mounted.current) return Promise.resolve()
      if (refreshing.current && !afterMutation) return refreshing.current
      const previous = refreshing.current ?? Promise.resolve()
      const pending = previous.then(async () => {
        if (!mounted.current) return
        try {
          await request('/api/ready')
          if (!mounted.current) return
          setReady(true)
          try {
            const snapshot = workspaceSnapshotSchema.parse(await request('/api/workspace'))
            setLive(snapshot)
            const name = `undograph:pending:${snapshot.workspace.id}`
            try {
              const saved = JSON.parse(localStorage.getItem(name) ?? 'null') as {
                runId?: string
              } | null
              if (
                saved?.runId &&
                snapshot.runs.some(
                  (run) =>
                    run.id === saved.runId &&
                    ['succeeded', 'failed', 'obsolete'].includes(run.status),
                )
              )
                localStorage.removeItem(name)
            } catch {
              /* Local recovery hints are optional; the graph stays canonical. */
            }
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 404) setLive(null)
            else throw failure
          }
          setError((current) =>
            current &&
            !['NETWORK_UNAVAILABLE', 'INVALID_RESPONSE', 'DATABASE_UNAVAILABLE'].includes(
              current.code,
            )
              ? current
              : null,
          )
        } catch (failure) {
          setReady(false)
          setError(
            failure instanceof ApiError
              ? failure
              : new ApiError(
                  'INVALID_RESPONSE',
                  'The server returned an invalid workspace response.',
                  500,
                ),
          )
        } finally {
          setLoading(false)
        }
      })
      refreshing.current = pending
      void pending.finally(() => {
        if (refreshing.current === pending) refreshing.current = null
      })
      return pending
    },
    [recorded],
  )

  useEffect(() => {
    if (recorded) return
    let active = true
    queueMicrotask(() => {
      if (active) void refresh()
    })
    return () => {
      active = false
    }
  }, [recorded, refresh])

  const activeRun = live?.runs.find((run) => run.id === live.workspace.activeRunId)
  const activeRunId = activeRun?.id
  useEffect(() => {
    if (recorded) return
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const timer = activeRunId ? window.setInterval(onFocus, 2_000) : undefined
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [activeRunId, recorded, refresh])

  async function mutate<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (recorded || !mounted.current || busy || !ready) return
    setBusy(true)
    setError(null)
    try {
      const result = await work()
      if (!mounted.current) return undefined
      await refresh(true)
      return mounted.current ? result : undefined
    } catch (failure) {
      if (!mounted.current) return undefined
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(
              'INVALID_RESPONSE',
              'The response could not be validated. Refresh the workspace before retrying.',
              500,
            ),
      )
      if (failure instanceof ApiError && failure.code === 'DATABASE_UNAVAILABLE') setReady(false)
      if (failure instanceof ApiError && [409, 503].includes(failure.status)) {
        // Refresh canonical state without hiding the mutation's error.
        try {
          setLive(workspaceSnapshotSchema.parse(await request('/api/workspace')))
        } catch {
          /* Keep the last confirmed snapshot visible. */
        }
      }
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const snapshot = recorded ? (examples?.[stage] ?? null) : live
  const pendingName = live ? `undograph:pending:${live.workspace.id}` : ''
  let pending: { key: string; request: RunRequest; runId?: string } | null = null
  try {
    const saved = pendingName
      ? (JSON.parse(localStorage.getItem(pendingName) ?? 'null') as Record<string, unknown> | null)
      : null
    const input = runRequestSchema.safeParse(saved?.request)
    if (typeof saved?.key === 'string' && input.success)
      pending = {
        key: saved.key,
        request: input.data,
        ...(typeof saved.runId === 'string' ? { runId: saved.runId } : {}),
      }
  } catch {
    /* Corrupt local hints do not replace server state. */
  }

  return {
    snapshot,
    activeRun: recorded ? undefined : activeRun,
    loading: loading || (recorded && !examples),
    busy,
    ready: recorded || ready,
    error,
    stage,
    setStage,
    refresh,
    clearError: () => setError(null),
    enter: (scenario?: GeneralWorkspace) =>
      mutate(async () => {
        const next = workspaceSnapshotSchema.parse(await request('/api/workspace', { method: 'POST', body: JSON.stringify({ scenario }) }))
        setLive(next)
        return next
      }),
    startRun: (kind: RunRequest['kind']) =>
      mutate(async () => {
        if (!live) return
        const input: RunRequest = { kind, expectedRevision: live.workspace.revision }
        const saved =
          pending &&
          pending.request.kind === kind &&
          pending.request.expectedRevision === input.expectedRevision
            ? pending
            : { key: crypto.randomUUID(), request: input }
        localStorage.setItem(pendingName, JSON.stringify(saved))
        const result = runResultSchema.parse(
          await request('/api/runs', {
            method: 'POST',
            headers: { 'Idempotency-Key': saved.key },
            body: JSON.stringify(saved.request),
          }),
        )
        if (['succeeded', 'failed', 'obsolete'].includes(result.run.status))
          localStorage.removeItem(pendingName)
        else localStorage.setItem(pendingName, JSON.stringify({ ...saved, runId: result.run.id }))
        return result
      }),
    retryLaunch: () =>
      pending
        ? mutate(async () => {
            const result = runResultSchema.parse(
              await request('/api/runs', {
                method: 'POST',
                headers: { 'Idempotency-Key': pending.key },
                body: JSON.stringify(pending.request),
              }),
            )
            if (['succeeded', 'failed', 'obsolete'].includes(result.run.status))
              localStorage.removeItem(pendingName)
            else
              localStorage.setItem(
                pendingName,
                JSON.stringify({ ...pending, runId: result.run.id }),
              )
            return result
          })
        : Promise.resolve(undefined),
    canRetryLaunch: Boolean(
      pending &&
      activeRun?.status === 'queued' &&
      (!pending.runId || error?.code === 'RUN_LAUNCH_PENDING'),
    ),
    correct: (input: CorrectionRequest | DocumentCorrection) =>
      mutate(() =>
        request(`/api/sources/${encodeURIComponent(input.sourceArtifactId)}/corrections`, {
          method: 'POST',
          body: JSON.stringify({
            expectedRevision: input.expectedRevision,
            ...('text' in input ? { text: input.text } : { returnWindowDays: input.returnWindowDays }),
            reason: input.reason,
          }),
        }),
      ),
    release: (id: string) =>
      mutate(() =>
        request(`/api/artifacts/${encodeURIComponent(id)}/release`, {
          method: 'POST',
          body: JSON.stringify({ expectedRevision: live!.workspace.revision }),
        }),
      ),
    addSession: (label: string) =>
      mutate(() => request('/api/sessions', { method: 'POST', body: JSON.stringify({ label }) })),
    reset: (scenario?: GeneralWorkspace) =>
      mutate(async () => {
        const next = workspaceSnapshotSchema.parse(
          await request('/api/workspace/reset', {
            method: 'POST',
            body: JSON.stringify({ confirmation: 'RESET', scenario }),
          }),
        )
        localStorage.removeItem(pendingName)
        setLive(next)
        return next
      }),
    exportAudit: async () => {
      try {
        downloadJson(
          recorded
            ? { auditVersion: 1, origin: simulation ? 'simulation' : 'recorded', synthetic: true, snapshot }
            : await request('/api/export'),
          'undograph-audit.json',
        )
      } catch (failure) {
        setError(
          failure instanceof ApiError
            ? failure
            : new ApiError('EXPORT_FAILED', 'The audit could not be exported. Please retry.', 500),
        )
      }
    },
  }
}
export type WorkspaceController = ReturnType<typeof useWorkspace>
