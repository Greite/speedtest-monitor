import { NextResponse } from 'next/server';
import { z } from 'zod';

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
};

export function apiError(
  code: string,
  message: string,
  status: number,
  fields?: Record<string, string[]>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(fields ? { fields } : {}) } },
    { status },
  );
}

export function apiValidationError(
  err: z.ZodError,
  status = 400,
): NextResponse<ApiErrorBody> {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = [];
    fields[key].push(issue.message);
  }
  return apiError('validation_failed', 'One or more fields are invalid.', status, fields);
}
