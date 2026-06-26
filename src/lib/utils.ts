import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

//merge conditional class names and dedupe conflicting tailwind utilities
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
