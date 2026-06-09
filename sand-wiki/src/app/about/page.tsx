export default function AboutPage() {
  return (
    <article className="py-8 max-w-2xl">
      <div className="card bg-base-200">
        <div className="card-body space-y-4">
          <h1 className="font-display text-2xl font-bold">About this site</h1>
          <p>
            This is an <strong>unofficial</strong>, community-maintained wiki for
            <em> SAND: Raiders of Sophie</em>. It is <strong>not affiliated with, endorsed by, or
            connected to tinyBuild</strong> or the game&apos;s developers.
          </p>
          <p>
            No protected game assets (extracted images, sounds, or 3D models) are used. All data is
            community-contributed for informational purposes.
          </p>
          <p>Found an error? Reporting and contributions are planned for a future update.</p>
        </div>
      </div>
    </article>
  );
}
