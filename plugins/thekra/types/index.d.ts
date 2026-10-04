export type Verse = {
  number: number
  text: string
  numberInSurah: number
  surah: { number: number; name: string; englishName: string; numberOfAyahs: number }
}

// An ayah with words on a line, enough to name it on the source line.
export type Ref = { number: number; numberInSurah: number; name: string; englishName: string }

export type Line = { text: string; refs: Ref[] }

// One surah of the picker.
export type Surah = { number: number; name: string; englishName: string; numberOfAyahs: number }

export type Language = 'ar' | 'en'

// When the band scrolls by itself: only while Claude works, always, or never.
export type AutoScroll = 'work' | 'on' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'thekra': {
      // The page: lines laid out once and only ever added to, so no word moves.
      lines: Line[]
      // The first line of the window.
      top: number
      // The width the lines were laid out to.
      cols: number
      language: Language
      // Milliseconds between steps of one line when the band scrolls by itself.
      speed: number
      auto: AutoScroll
      // The 114 surahs, for the picker; empty until fetched.
      surahs: Surah[]
    }
  }
}
