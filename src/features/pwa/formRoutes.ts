/**
 * The routes that hold a form the player may be in the middle of filling in. An update notice with a RESTART button
 * must not appear on them: pressing it would reload the page and lose the unsaved edits. (No dirty-form tracking is
 * needed: the notice simply waits until the player has left the form.)
 *
 *   /quests/new · /quests/:templateId/edit · /weekly/edit
 */
const UNSAVED_FORM_ROUTES: readonly RegExp[] = [/^\/quests\/new\/?$/, /^\/quests\/[^/]+\/edit\/?$/, /^\/weekly\/edit\/?$/]

export function isUnsavedFormRoute(pathname: string): boolean {
  return UNSAVED_FORM_ROUTES.some((route) => route.test(pathname))
}
