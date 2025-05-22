export type PlaceholderReplacements = {
  [placeholder: string]: string;
};

export function replacePlaceholders(
  text: string,
  replacements: PlaceholderReplacements,
  throwIfNotFound: boolean = true
): string {
  let result = text;
  Object.keys(replacements).forEach((placeholder) => {
    const replacement = replacements[placeholder];
    result = replacePlaceholder(result, placeholder, replacement, throwIfNotFound);
  });

  return result;
}

export function replacePlaceholder(
  text: string,
  placeholder: string,
  replacement: string,
  throwIfNotFound: boolean = true
): string {
  const re = new RegExp(`\{\{${placeholder}\}\}`, "g");
  const matches = [...text.matchAll(re)];
  if (matches.length === 0 && throwIfNotFound) {
    throw new Error(`No matches found for {{${placeholder}}}`);
  }

  return text.replaceAll(re, replacement);
}

export function toFriendlyUTC(date: Date): string {
  return (
    date
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d+Z$/, "") + " UTC"
  );
}
