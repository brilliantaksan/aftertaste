type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassDictionary
  | ClassValue[];

function collectClasses(value: ClassValue, classes: string[]): void {
  if (!value) return;
  if (typeof value === "string" || typeof value === "number") {
    classes.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectClasses(entry, classes));
    return;
  }
  Object.entries(value).forEach(([key, active]) => {
    if (active) classes.push(key);
  });
}

export function cn(...values: ClassValue[]): string {
  const classes: string[] = [];
  values.forEach((value) => collectClasses(value, classes));
  return classes.join(" ");
}
