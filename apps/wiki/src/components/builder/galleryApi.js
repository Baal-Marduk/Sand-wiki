// Publishes a build to the community gallery. Throws on auth/validation errors;
// callers surface e.message via the builder toast.
export async function submitBuild({ name, buildCode, thumbnail }) {
  const res = await fetch('/api/designs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, buildCode, thumbnail }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) throw new Error('sign in with Steam to publish')
  if (!res.ok) throw new Error(data.error || 'publish failed')
  return data // { slug }
}
