export function toSlug(name: string, sep: "-" | "_" = "_") {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`, "g"), "");
}

export function flagFromIso2(iso2: string) {
  if (!/^[A-Za-z]{2}$/.test(iso2)) return "";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
