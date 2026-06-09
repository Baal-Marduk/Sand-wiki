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
            No protected game assets (extracted images, sounds, or 3D models) are used.
          </p>
          <p>
            <strong>About the data:</strong> items and recipes are extracted from a playtest build of
            the game files. Display names are derived from internal identifiers, so they may differ
            from the in-game wording. The tech tree, delivery contracts, and loot tables are not
            present in the current game data and aren&apos;t shown here. The game version may read as
            &ldquo;unknown&rdquo; when the build doesn&apos;t record one. Data is refreshed by
            re-running the extractor after each game patch.
          </p>
          <p>Found an error? Reporting and contributions are planned for a future update.</p>
        </div>
      </div>
    </article>
  );
}
