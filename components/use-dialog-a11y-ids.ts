'use client';

import { useId } from 'react';

// Astryx Dialog does not auto-wire aria-labelledby/aria-describedby (unlike
// its own AlertDialog, whose manual pattern our destructive confirms
// replicate). This hook centralizes the id pairing.
export function useDialogA11yIds(): { labelId: string; descriptionId: string } {
  const labelId = useId();
  const descriptionId = useId();
  return { labelId, descriptionId };
}
