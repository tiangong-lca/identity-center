/** Public EditContext projection; never return text, offsets, lengths or hashes. */
export function nativeInputState(expected: string) {
  const context = (document.activeElement as (HTMLElement & {
    editContext?: { text?: unknown; selectionStart?: unknown; selectionEnd?: unknown }
  }) | null)?.editContext
  const text = context?.text
  const start = context?.selectionStart
  const end = context?.selectionEnd
  const available = typeof text === 'string' && typeof start === 'number' && typeof end === 'number'
  const wholeSelection = available && Number.isInteger(start) && Number.isInteger(end) && start !== end &&
    Math.min(start, end) === 0 && Math.max(start, end) === text.length
  return { available, wholeSelection, exact: wholeSelection && text === expected }
}
