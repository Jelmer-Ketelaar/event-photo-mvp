export function toErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error.message : fallbackMessage;
}

export function firstErrorMessage(
  fallbackMessage: string,
  ...errors: Array<unknown | null | undefined>
) {
  for (const error of errors) {
    if (error) {
      return toErrorMessage(error, fallbackMessage);
    }
  }

  return null;
}
