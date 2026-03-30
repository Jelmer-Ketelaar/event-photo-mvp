/**
 * Extracts an error message from an unknown error type.
 * Returns the error's message if it's an Error instance, otherwise returns the fallback.
 */
export function toErrorMessage(error: unknown, fallbackMessage: string): string {
  return error instanceof Error ? error.message : fallbackMessage;
}

/**
 * Returns the first non-null error message from a list of potential errors.
 * Useful for displaying the most relevant error from multiple mutation states.
 * 
 * @param fallbackMessage - Default message if error doesn't have a message property
 * @param errors - List of potential error values to check
 * @returns The first error message found, or null if no errors
 */
export function firstErrorMessage(
  fallbackMessage: string,
  ...errors: Array<unknown | null | undefined>
): string | null {
  for (const error of errors) {
    if (error) {
      return toErrorMessage(error, fallbackMessage);
    }
  }

  return null;
}
