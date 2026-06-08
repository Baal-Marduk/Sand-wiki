export interface TechRow {
  slug: string; name: string; prerequisites: string[];
}

export function TechTreeTable({ rows }: { rows: TechRow[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <caption className="sr-only">Tech tree nodes and their prerequisites</caption>
      <thead>
        <tr className="text-left border-b border-neutral-700">
          <th scope="col" className="py-2">Technology</th>
          <th scope="col" className="py-2">Requires</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.slug} className="border-b border-neutral-800">
            <th scope="row" className="py-2 font-medium">{r.name}</th>
            <td className="py-2">{r.prerequisites.length ? r.prerequisites.join(", ") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
