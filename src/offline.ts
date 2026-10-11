export async function setupOffline(onUpdate: (worker: ServiceWorker) => void) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const registration = await navigator.serviceWorker.register('/sw.js');
  if (registration.waiting) onUpdate(registration.waiting);
  registration.addEventListener('updatefound', () => { const worker = registration.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) onUpdate(worker); }); });
}
