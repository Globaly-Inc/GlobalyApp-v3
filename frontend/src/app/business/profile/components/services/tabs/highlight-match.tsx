/** `text` with the first case-insensitive occurrence of `query` wrapped in a <mark>. */
export function HighlightMatch({ text, query }: Readonly<{ text: string; query: string }>) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-primary/20 px-0.5 text-inherit">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}
