// Firefox omits constructor-provided clipboardData on untrusted synthetic events.
// Define the supplied test data explicitly; production still uses native paste events.
export function browserPaste(el: HTMLElement, data: { plain?: string; html?: string }) {
  const transfer = new DataTransfer(); if (data.plain !== undefined) transfer.setData('text/plain', data.plain); if (data.html !== undefined) transfer.setData('text/html', data.html);
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer });
  Object.defineProperty(event, 'clipboardData', { value: transfer }); el.dispatchEvent(event);
}
