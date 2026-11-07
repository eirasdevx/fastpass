import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** "A1B2C3D4E5F6A7B8" → "A1B2-C3D4-E5F6-A7B8" */
export function formatTicketCode(code: string) {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}
