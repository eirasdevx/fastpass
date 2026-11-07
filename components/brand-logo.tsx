import Image from 'next/image'
import { cn } from '@/lib/utils'

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/fastpass-platform-logo-v2.png"
      alt="FastPass"
      width={2172}
      height={724}
      sizes="(max-width: 639px) 128px, 192px"
      className={cn('h-auto w-32 rounded-lg sm:w-48', className)}
    />
  )
}
