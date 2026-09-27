import InlineMarkdown from './InlineMarkdown'
import FallbackImage from './FallbackImage'
import ZoomableImage from './ZoomableImage'
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
      {parseSpotDescription(children).map((block, index) => {
        if (block.type === 'image') {
          return (
            <figure key={index} className="space-y-2">
              <ZoomableImage
                src={block.src}
                alt={block.alt}
                caption={block.caption}
                className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-[0_18px_45px_rgba(0,0,0,0.2)]"
              >
                <FallbackImage
                  src={block.src}
                  alt={block.alt}
                  fill
                  sizes="(max-width: 1024px) 100vw, 760px"
                  className="object-contain transition-transform duration-300 group-hover/zoom:scale-[1.015]"
                />
              </ZoomableImage>
              {block.caption ? <figcaption className="px-2 text-center text-sm leading-6 text-gray-400">{block.caption}</figcaption> : null}
            </figure>
          )
        }

        const Tag = block.type
        return <Tag key={index} className={styles[Tag]}><InlineMarkdown>{block.content}</InlineMarkdown></Tag>
      })}
    </div>
  )
}
