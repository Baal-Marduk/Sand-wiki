export interface TechRow {
  slug: string; name: string; prerequisites: string[];
}

export function TechTreeTable({ rows }: { rows: TechRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-zebra">
        <caption className="sr-only">Tech tree nodes and their prerequisites</caption>
        <thead>
          <tr>
            <th scope="col">Technology</th>
            <th scope="col">Requires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <th scope="row" className="font-medium">{r.name}</th>
              <td>{r.prerequisites.length ? r.prerequisites.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
