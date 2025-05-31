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

export type FriendlyUTCOptions = {
  showTime: boolean;
  showUTC: boolean;
};

const defaultFriendlyUTCOptions: FriendlyUTCOptions = {
  showTime: true,
  showUTC: true,
};

export function toFriendlyUTC(date: Date, options: Partial<FriendlyUTCOptions> = {}): string {
  const { showTime, showUTC } = { ...defaultFriendlyUTCOptions, ...options };
  let text = date.toISOString();
  if (!showTime) {
    text = text.substring(0, text.indexOf("T"));
  }

  text = text.replace("T", " ").replace(/\.\d+Z$/, "");
  if (showUTC) {
    text = text + " UTC";
  }

  return text;
}
