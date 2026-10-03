import type { LifecycleNotice } from '@/app/runtimeContext'

/** The catch-up notice text: each part appears only when it applies. */
export function lifecycleNoticeText(notice: LifecycleNotice): string {
  const parts: string[] = []
  if (notice.daysReconciled > 0) parts.push(`${notice.daysReconciled} days reconciled.`)
  if (notice.weeklyBoardsFinalized > 0) {
    const boards = notice.weeklyBoardsFinalized === 1 ? '1 weekly board' : `${notice.weeklyBoardsFinalized} weekly boards`
    parts.push(`${boards} finalized${notice.weeklyBonusExp > 0 ? ` (+${notice.weeklyBonusExp} EXP)` : ''}.`)
  }
  return parts.join(' ')
}
