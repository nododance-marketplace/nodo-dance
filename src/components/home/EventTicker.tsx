export interface TickerItem {
  id: string
  title: string
  city: string | null
  when: string
}

/** A scrolling strip of real, upcoming community events. Renders nothing without data. */
export function EventTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null

  const track = (hidden: boolean) => (
    <div className="event-ticker-track" aria-hidden={hidden || undefined}>
      {items.map(item => (
        <span key={`${hidden ? 'b' : 'a'}-${item.id}`} className="event-ticker-item">
          <strong>{item.title}</strong>
          <span className="event-ticker-meta">{item.city ?? 'somewhere new'} · {item.when}</span>
        </span>
      ))}
    </div>
  )

  return (
    <section className="event-ticker" aria-label={`Upcoming events: ${items.length} on the floor this week`}>
      <span className="event-ticker-label">
        <span className="live-dot" aria-hidden="true" />
        on the floor
      </span>
      <div className="event-ticker-window">
        <div className="event-ticker-scroll" aria-hidden="true">
          {track(false)}
          {track(true)}
        </div>
      </div>
    </section>
  )
}
