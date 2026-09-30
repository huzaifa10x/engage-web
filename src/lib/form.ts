import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError, errorMessage } from './api';

/**
 * Maps a Laravel 422 onto react-hook-form fields. Returns a form-level message for anything
 * that is not a field error (or null when every error landed on a field).
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]): string | null {
    if (error instanceof ApiError && error.code === 'validation_failed') {
        let unmapped: string | null = null;
        for (const [field, messages] of Object.entries(error.fields)) {
            if ((fields as readonly string[]).includes(field)) {
                setError(field as Path<T>, { type: 'server', message: messages[0] });
            } else {
                unmapped ??= messages[0];
            }
        }

        return unmapped;
    }

    return errorMessage(error);
}
