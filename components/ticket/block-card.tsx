import { renderBlockCard, type BlockCardProps } from '@/lib/tickets/render-html'

/** Plantilla por bloques en la web y al imprimir. Todo el texto va escapado en renderBlockCard. */
export function BlockCard(props: BlockCardProps) {
  return <div dangerouslySetInnerHTML={{ __html: renderBlockCard(props) }} />
}
