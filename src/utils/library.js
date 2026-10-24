/**
 * Helpers for re-importing a chat that is already saved.
 *
 * A newer export of the same conversation usually gets a different chat id
 * (ids include the first message's time and the title, and exports can be
 * capped or date-ranged), so it's matched by who is in it instead.
 */

function peopleKey(participants) {
  return [...participants].sort().join('\u0000');
}

/**
 * Finds the saved chat a freshly parsed one most likely replaces: the same
 * id, else the same platform and people, else the same platform and title
 * (a group whose members changed).
 *
 * @param {{ id, platform, title, participants }} chat
 * @param {Array<{ id, platform, title, participants }>} saved - Saved chat metadata
 * @returns {object | null} the matching metadata
 */
export function findSavedMatch(chat, saved) {
  const samePlatform = saved.filter((s) => s.platform === chat.platform);
  const people = peopleKey(chat.participants);
  return (
    saved.find((s) => s.id === chat.id) ??
    samePlatform.find((s) => chat.participants.length > 0 && peopleKey(s.participants) === people) ??
    samePlatform.find((s) => chat.title && s.title === chat.title) ??
    null
  );
}

function firstFree(value, existing, withNumber) {
  const taken = new Set(existing);
  if (!taken.has(value)) return value;
  let n = 2;
  while (taken.has(withNumber(n))) n++;
  return withNumber(n);
}

/**
 * An id for saving a chat as a separate copy: `id` itself if unused,
 * otherwise `id-2`, `id-3`, ...
 */
export function copyId(id, existingIds) {
  return firstFree(id, existingIds, (n) => `${id}-${n}`);
}

/** A title the copy can be told apart by: "Alex (2)", "Alex (3)", ... */
export function copyTitle(title, existingTitles) {
  return firstFree(title, existingTitles, (n) => `${title} (${n})`);
}
