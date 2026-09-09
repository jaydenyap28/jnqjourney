import { Html, Head, Main, NextScript } from 'next/document'

/** Only the new /en routes use Pages Router; Chinese App Router URLs stay in place. */
export default function Document() {
  return <Html lang="en"><Head /><body><Main /><NextScript /></body></Html>
}
