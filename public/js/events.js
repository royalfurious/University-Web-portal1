async function refreshEvents() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/events');
    if (!res.ok) return;

    const events = await res.json();
    grid.innerHTML = events
      .map((event) => `
        <article class="card">
          <h4>${event.title}</h4>
          <p>${event.details || ''}</p>
          <small><strong>Date:</strong> ${event.event_date}</small>
        </article>
      `)
      .join('');
  } catch (error) {
    console.error('Event refresh failed:', error);
  }
}

setInterval(refreshEvents, 30000);
