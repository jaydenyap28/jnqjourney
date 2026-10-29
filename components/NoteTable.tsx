import InlineMarkdown from '@/components/InlineMarkdown'
import { parseNoteTable } from '@/lib/note-table'

export default function NoteTable({ content }: { content?: string }) {
  const table = parseNoteTable(content)
  if (!table) return <p className="mx-auto max-w-2xl whitespace-pre-wrap break-words text-gray-200">{content}</p>
  return (
    <div role="region" aria-label="攻略对照表，可横向滚动" tabIndex={0} className="mx-auto my-8 max-w-full overflow-x-auto rounded-2xl border border-white/15 focus-visible:outline focus-visible:outline-amber-300">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm leading-7">
        <thead className="bg-amber-300/10 text-amber-100">
          <tr>
            {table.headers.map((cell, index) => (
              <th key={index} scope="col" className="border-b border-white/15 px-4 py-3 font-semibold"><InlineMarkdown>{cell}</InlineMarkdown></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className="border-b border-white/10 last:border-0 even:bg-white/[0.025]">
              {row.map((cell, column) => (
                <td key={column} className="px-4 py-3 align-top text-gray-200"><InlineMarkdown>{cell}</InlineMarkdown></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
