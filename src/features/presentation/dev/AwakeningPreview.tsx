import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { BUTTON } from '@/components/ui/styles'
import AwakeningFlow from '../../awakening/AwakeningFlow'
import type { AwakeningSaveResult } from '../../awakening/types'

/**
 * DEVELOPMENT ONLY (a section of `/dev/effects`). Plays the real first-launch
 * Awakening screen on SYNTHETIC state: its `save` is a stub that only reports a
 * result back to the screen, so nothing here reads or writes the application,
 * the database, the clock or `localStorage`. The player's real name and
 * Awakening state are never touched (the real flow gets its `save` from the
 * runtime provider; this one cannot reach it). It is part of the lab, so it is
 * removed from production builds together with it.
 */
export function AwakeningPreview() {
  const [run, setRun] = useState<{ readonly id: number; readonly failFirstSave: boolean } | null>(null)
  const [finishedWith, setFinishedWith] = useState<string | null>(null)
  const runs = useRef(0)
  const failedOnce = useRef(false)
  const lastName = useRef<string | null>(null)

  const start = useCallback((failFirstSave: boolean) => {
    runs.current += 1
    failedOnce.current = false
    lastName.current = null
    setFinishedWith(null)
    setRun({ id: runs.current, failFirstSave })
  }, [])

  const save = useCallback(
    async (name: string | null): Promise<AwakeningSaveResult> => {
      if (run?.failFirstSave === true && !failedOnce.current) {
        failedOnce.current = true
        return { status: 'failed' }
      }
      lastName.current = name
      return { status: 'saved', name }
    },
    [run],
  )

  const finish = useCallback(() => {
    setFinishedWith(lastName.current ?? 'PLAYER')
    setRun(null)
  }, [])

  return (
    <section aria-labelledby="lab-awakening" className="flex flex-col gap-2">
      <SectionLabel id="lab-awakening">AWAKENING (FIRST LAUNCH)</SectionLabel>
      <p className="text-sm text-muted">
        Plays the first-launch sequence on synthetic state. It never saves: your real name and Awakening state are not touched.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={() => start(false)}>
          Preview Awakening
        </button>
        <button type="button" className={BUTTON} onClick={() => start(true)}>
          Preview (first save fails)
        </button>
      </div>
      {finishedWith !== null && (
        <p role="status" className="text-sm text-accent-2">
          Preview finished. It would have used the name {finishedWith}. Nothing was stored.
        </p>
      )}
      {run !== null &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Awakening preview (development only)" className="fixed inset-0 z-[60] overflow-y-auto bg-background">
            <button
              type="button"
              onClick={() => setRun(null)}
              className={`${BUTTON} fixed top-[max(0.5rem,env(safe-area-inset-top))] right-3 z-[70]`}
            >
              Exit preview
            </button>
            <AwakeningFlow key={run.id} as="div" save={save} onFinish={finish} />
          </div>,
          document.body,
        )}
    </section>
  )
}
