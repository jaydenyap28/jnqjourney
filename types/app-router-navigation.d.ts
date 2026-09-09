import type { ReadonlyURLSearchParams } from 'next/navigation'

/**
 * This repository uses next/navigation only inside the App Router tree.
 * The English Pages Router entry deliberately uses document navigation and
 * window.location after mount; it must not import these App Router hooks.
 * Restore their App Router signatures after Next adds its Pages compatibility
 * overloads. This does not change runtime behavior or Admin implementation.
 */
declare module 'next/navigation' {
  export function useSearchParams(): ReadonlyURLSearchParams
  export function usePathname(): string
  export function useParams<T extends Record<string,string|string[]> = Record<string,string|string[]>>(): T
  export function useSelectedLayoutSegments(): string[]
}
