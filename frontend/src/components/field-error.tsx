export function FieldError({ id, message }: Readonly<{ id?: string; message?: string }>) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null;
}
