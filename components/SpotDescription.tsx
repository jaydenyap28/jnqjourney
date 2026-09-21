import InlineMarkdown from './InlineMarkdown'
import { parseSpotDescription } from '@/lib/spot-description'

const styles = {
  p: 'whitespace-pre-line',
  h2: 'text-2xl font-semibold text-white',
  h3: 'text-xl font-semibold text-white',
  h4: 'text-lg font-semibold text-white',
  blockquote: 'whitespace-pre-line border-l-2 border-amber-300/50 pl-4 text-gray-300',
}

export default function SpotDescription({ children }: { children: string }) {
  return (
    <div className="space-y-5 [overflow-wrap:anywhere] text-lg leading-relaxed text-gray-200">
      {parseSpotDescription(children).map(({ type: Tag, content }, index) => (
        <Tag key={index} className={styles[Tag]}><InlineMarkdown>{content}</InlineMarkdown></Tag>
      ))}
    </div>
  )
}
