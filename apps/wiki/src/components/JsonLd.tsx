/** Renders a schema.org JSON-LD `<script>` block.
 *  `<` is escaped to `<` so a string field can never close the <script> tag
 *  early (the standard JSON-LD injection guard). Safe to render in Server Components. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
