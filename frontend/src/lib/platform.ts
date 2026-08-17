// Shortcut hints render the Mac glyphs (⌘, ⏎) or their spelled-out Windows /
// Linux equivalents. navigator.platform is deprecated but still the most
// reliable signal in every browser we support, and a wrong guess only costs a
// mislabelled hint.
export function isMac() {
  return navigator.platform.toLowerCase().includes('mac')
}
