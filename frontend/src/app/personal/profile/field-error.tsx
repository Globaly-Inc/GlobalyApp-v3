export function FieldError({ message }: Readonly<{ message?: string }>) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
