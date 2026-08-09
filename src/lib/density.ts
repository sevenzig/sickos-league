/**
 * Component density recipes: gap ≈ 15% of part size, padding ≈ 2× gap.
 * Size variants own the trio — do not mix gap/pad independently in product UI.
 */
export const density = {
  sm: {
    part: 32,
    gap: 'gap-1.5',
    pad: 'p-2',
    padX: 'px-2',
    padY: 'py-2',
    icon: 'h-4 w-4',
    control: 'h-8',
  },
  md: {
    part: 44,
    gap: 'gap-2',
    pad: 'p-3',
    padX: 'px-3',
    padY: 'py-2.5',
    icon: 'h-5 w-5',
    control: 'h-11',
  },
  lg: {
    part: 64,
    gap: 'gap-2.5',
    pad: 'p-5',
    padX: 'px-5',
    padY: 'py-3',
    icon: 'h-8 w-8',
    control: 'h-12',
  },
  xl: {
    part: 96,
    gap: 'gap-4',
    pad: 'p-8',
    padX: 'px-8',
    padY: 'py-4',
    icon: 'h-12 w-12',
    control: 'h-16',
  },
} as const;

export type DensitySize = keyof typeof density;
