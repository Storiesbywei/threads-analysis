export const TAG_COLORS: Record<string, string> = {
  'reaction': '#d4a04a', 'one-liner': '#a08030', 'tech': '#4db89a', 'media': '#9a6abf',
  'question': '#6d8ec4', 'personal': '#c47a4a', 'philosophy': '#ab6acf', 'daily-life': '#7aa771',
  'political': '#c44040', 'finance': '#4a8ac4', 'shitpost': '#c46a3a', 'food': '#9ec46a',
  'race': '#c44a4a', 'meta-social': '#a89060', 'sex-gender': '#c46aaa', 'language': '#5aaa8a',
  'commentary': '#8a8a5a', 'work': '#5a8aaa', 'creative': '#ba5aaa', 'url-share': '#8aaa5a',
};

export function tagColor(tag: string): string {
  return TAG_COLORS[tag] || '#6e7681';
}

export function tagBg(tag: string): string {
  return tagColor(tag) + '22';
}
