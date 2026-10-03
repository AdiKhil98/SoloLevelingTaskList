import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { LoadQuestForEditResult, QuestFormValues } from '@/application'
import { useAppRuntime } from '@/app/runtimeContext'
import { QuestForm, type QuestFormOutcome } from './QuestForm'
import { saveFailureText } from './questMessages'

const BACK_LINK =
  'mt-2 inline-flex min-h-11 w-fit items-center rounded-lg border border-border px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

function Unavailable({ heading, children }: { heading: string; children: string }) {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <p className="text-muted">{children}</p>
      <Link to="/quests" className={BACK_LINK}>
        Back to Quests
      </Link>
    </section>
  )
}

/**
 * Edit a quest by its route id. The id is only used to LOAD the stored quest:
 * an unknown or archived id shows a safe message and never turns into a create
 * form, so editing can never accidentally create a new template.
 */
export function EditQuestPage() {
  const { templateId = '' } = useParams()
  const { snapshot, quests } = useAppRuntime()
  const navigate = useNavigate()
  const today = snapshot.today.dateKey

  const [loaded, setLoaded] = useState<{ id: string; result: LoadQuestForEditResult } | null>(null)

  useEffect(() => {
    let cancelled = false
    void quests.loadForEdit(templateId).then((result) => {
      if (!cancelled) setLoaded({ id: templateId, result })
    })
    return () => {
      cancelled = true
    }
  }, [quests, templateId])

  const handleSubmit = useCallback(
    async (values: QuestFormValues): Promise<QuestFormOutcome> => {
      const result = await quests.update(templateId, values)
      switch (result.status) {
        case 'updated':
          await navigate('/quests', { state: { notice: 'updated' } })
          return { status: 'saved' }
        case 'invalid':
          return { status: 'invalid', errors: result.errors }
        case 'not_found':
          return { status: 'error', message: 'That quest no longer exists. Nothing was changed.' }
        case 'archived':
          return { status: 'error', message: 'That quest was archived. Restore it from the Archived list to edit it.' }
        case 'failed':
          console.error('Updating a quest failed', result.cause)
          return { status: 'error', message: saveFailureText(result.reason, 'update') }
      }
    },
    [quests, templateId, navigate],
  )

  if (loaded === null || loaded.id !== templateId) return <p className="text-muted">Loading quest…</p>

  const { result } = loaded
  switch (result.status) {
    case 'not_found':
      return <Unavailable heading="Quest not found">There is no quest at this address.</Unavailable>
    case 'archived':
      return (
        <Unavailable heading="Quest archived">
          {`“${result.title}” is archived. Restore it from the Archived list to edit it.`}
        </Unavailable>
      )
    case 'failed':
      return <Unavailable heading="Quest unavailable">This quest could not be loaded right now.</Unavailable>
    case 'found':
      return (
        <QuestForm
          key={templateId}
          mode="edit"
          initial={result.values}
          today={today}
          onSubmit={handleSubmit}
          cancelTo="/quests"
        />
      )
  }
}
