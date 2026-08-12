export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("data")) node.dataset[key.slice(4).toLowerCase()] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}
export function formatPercent(value) { return value == null ? "No results yet" : `${Number(value).toFixed(1)}%`; }

export function formattedText(text) {
  const paragraph = el("p");
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) paragraph.append(el("strong", { text: part.slice(2, -2) }));
    else paragraph.append(document.createTextNode(part));
  }
  return paragraph;
}
