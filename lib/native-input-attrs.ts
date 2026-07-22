import type { InputHTMLAttributes } from 'react';

// Astryx TextInput's typed props extend the generic HTMLAttributes, not
// InputHTMLAttributes, so native input attributes are missing from the type.
// Its ...rest props DO spread onto the real <input> (verified in
// TextInput.js), so passing them works at runtime and in SSR - this Pick
// makes that escape hatch type-safe. Usage:
//   <TextInput {...({ autoComplete: 'email' } satisfies NativeInputAttrs)} />
export type NativeInputAttrs = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'autoComplete' | 'required' | 'minLength' | 'inputMode' | 'pattern'
>;
