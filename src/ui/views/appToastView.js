export function renderAppToast(toast) {
  if (!toast) {
    return "";
  }

  return `
    <div class="app-toast app-toast--${toast.tone ?? "info"}" role="status" aria-live="polite">
      <strong>${toast.title ?? ""}</strong>
      ${toast.message ? `<span>${toast.message}</span>` : ""}
    </div>
  `;
}
