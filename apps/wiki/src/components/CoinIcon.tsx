/** The in-game currency (Crowns) sprite, used as the unit symbol beside prices.
 *  Decorative: prices always sit in a labeled "Price"/"Value" context, so the coin
 *  is not announced to screen readers. `title` gives a hover hint for sighted users. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/icon_item_coinCrown.png"
      alt=""
      aria-hidden="true"
      title="Crowns"
      loading="lazy"
      decoding="async"
      className={className ?? "inline-block size-4 align-text-bottom"}
    />
  );
}
