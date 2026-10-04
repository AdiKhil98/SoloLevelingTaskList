/**
 * Test helper: wraps an IndexedDB factory so that read-write transactions on chosen
 * stores fail like a full disk (`QuotaExceededError`) until the test lets them
 * through again. Reads, and writes to other stores, are untouched, and the wrapper
 * hands out the real connections otherwise, so the app runs against real storage.
 */
export function flakyWrites(base: IDBFactory) {
  const control = { failStores: new Set<string>() }
  const factory = {
    open(name: string, version?: number) {
      const request = base.open(name, version)
      request.addEventListener('success', () => {
        const connection = request.result
        const original = connection.transaction.bind(connection)
        connection.transaction = ((stores: string | string[], mode?: IDBTransactionMode, options?: IDBTransactionOptions) => {
          const names = typeof stores === 'string' ? [stores] : stores
          if (mode === 'readwrite' && names.some((store) => control.failStores.has(store))) {
            throw new DOMException('The disk is full', 'QuotaExceededError')
          }
          return original(stores, mode, options)
        }) as typeof connection.transaction
      })
      return request
    },
  } as unknown as IDBFactory
  return { factory, control }
}
