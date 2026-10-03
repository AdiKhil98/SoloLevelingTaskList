import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { defaultQuestFormValues, type QuestFormValues } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { QuestForm, type QuestFormOutcome } from './QuestForm'
import { saveFailureText } from './questMessages'

/** Create a quest. A failed save keeps the form (and everything typed) on screen. */
export function CreateQuestPage() {
  const { snapshot, quests } = useAppRuntime()
  const navigate = useNavigate()
  const today = snapshot.today.dateKey
  const [initial] = useState(() => defaultQuestFormValues(today))

  const handleSubmit = useCallback(
    async (values: QuestFormValues): Promise<QuestFormOutcome> => {
      const result = await quests.create(values)
      switch (result.status) {
        case 'created':
          await navigate('/quests', { state: { notice: 'created' } })
          return { status: 'saved' }
        case 'invalid':
          return { status: 'invalid', errors: result.errors }
        case 'failed':
          console.error('Creating a quest failed', result.cause)
          return { status: 'error', message: saveFailureText(result.reason, 'create') }
      }
    },
    [quests, navigate],
  )

  return <QuestForm mode="create" initial={initial} today={today} onSubmit={handleSubmit} cancelTo="/quests" />
}
