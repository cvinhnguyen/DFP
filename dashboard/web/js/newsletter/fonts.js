// The fonts the newsletter offers: the ones every email program has, so the
// email looks the same everywhere and nothing is loaded from Google. The
// first one is the association's own.

export const FONTS = [
  { id: 'helvetica', label: 'Helvetica', stack: 'Helvetica, Arial, sans-serif' },
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Verdana, Segoe, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: 'lucida', label: 'Lucida Sans', stack: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, Times, "Times New Roman", serif' },
  { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier New', stack: '"Courier New", Courier, monospace' },
];

export function fontStack(id) {
  return (FONTS.find((f) => f.id === id) || FONTS[0]).stack;
}
