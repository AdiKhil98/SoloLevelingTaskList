import { fireEvent, screen, within } from '@testing-library/react'
import { getTemplate, listTemplates, openDatabase } from '@/persistence'

/** Helpers for the quest-management UI tests. Test-only. */

export const titleField = () => screen.getByRole('textbox', { name: 'Title' })

export function fillTitle(title: string) {
  fireEvent.change(titleField(), { target: { value: title } })
}

export function choose(role: 'radio' | 'checkbox', name: string | RegExp) {
  fireEvent.click(screen.getByRole(role, { name }))
}

export function setDate(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

export function submit(name: 'Create Quest' | 'Save Changes') {
  fireEvent.click(screen.getByRole('button', { name }))
}

/** The Quests page, once its list has loaded. */
export async function waitForQuestsPage() {
  const heading = await screen.findByRole('heading', { name: 'QUESTS' })
  await screen.findByRole('group', { name: 'Show quests' })
  return heading
}

/** The rows of the quest list currently shown (active or archived view). */
export function listedQuests() {
  const list = screen.queryByRole('list', { name: /^(Active|Archived) quests$/ })
  // Direct rows only: an open archive confirmation has bullet items of its own.
  return list === null ? [] : within(list).getAllByRole('listitem').filter((item) => item.parentElement === list)
}

/** Reads storage through a second, independent connection to the same fake database. */
export async function readTemplates(factory: IDBFactory) {
  const database = await openDatabase({ factory })
  try {
    return await listTemplates(database)
  } finally {
    database.close()
  }
}

export async function readTemplate(factory: IDBFactory, id: string) {
  const database = await openDatabase({ factory })
  try {
    return await getTemplate(database, id)
  } finally {
    database.close()
  }
}

/**
 * Wraps a fake IndexedDB factory so that, once `state.failWrites` (or
 * `state.failReads`) is set, every read-write (or read-only) transaction on a
 * connection it hands out throws a raw error. Used to prove failed saves and
 * loads leave the screen and the data intact.
 */
export function writeFailingFactory(base: IDBFactory) {
  const state = { failWrites: false, failReads: false }
  const factory = {
    open(name: string, version?: number) {
      const request = base.open(name, version)
      request.addEventListener('success', () => {
        const connection = request.result
        const original = connection.transaction.bind(connection)
        connection.transaction = ((stores: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) => {
          if (state.failWrites && mode === 'readwrite') throw new Error('Raw internal failure: disk exploded')
          if (state.failReads && mode === 'readonly') throw new Error('Raw internal failure: disk exploded')
          return original(stores, mode, options)
        }) as typeof connection.transaction
      })
      return request
    },
  } as unknown as IDBFactory
  return { factory, state }
}
