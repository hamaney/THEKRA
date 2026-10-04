import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AutoScroll, Language, Line, Ref, Surah, Verse } from '../types'

// Any of the Quran's 6236 ayat, by its number across the whole mushaf. The
// text is always fetched, never written here, so no ayah is ever misquoted.
const AYAT = 6236

const AYAH_API = 'https://api.alquran.cloud/v1/ayah/{n}/{edition}'
// A whole surah per request, so reading on costs one call per surah, far
// under the source's limit of 12 requests a second.
const SURAH_API = 'https://api.alquran.cloud/v1/surah/{n}/{edition}'
const SURAH_LIST_API = 'https://api.alquran.cloud/v1/surah'
// Arabic is the Uthmani text; the translation is Saheeh International.
const EDITIONS: Record<Language, string> = { ar: 'quran-uthmani', en: 'en.sahih' }

// The band is a page of WINDOW lines over continuous text, each ayah followed
// by its number. Lines are laid out once and only appended to, so a word keeps
// its place while the page moves up one line every `speed`: while Claude
// works, always, or never, as the auto button says.
const WINDOW = 4
// Lines kept above the page, so `prev` can go back without refetching.
const KEEP_ABOVE = 12
export const SPEEDS = [10_000, 20_000, 30_000]
export const AUTOS: readonly AutoScroll[] = ['work', 'on', 'off']
const AUTO_LABELS: Record<AutoScroll, string> = { work: 'autoscroll: working', on: 'autoscroll: on', off: 'autoscroll: off' }

const lines = atom({ plugin: 'thekra', key: 'lines' } as const, [])
const top = atom({ plugin: 'thekra', key: 'top' } as const, 0)
const cols = atom({ plugin: 'thekra', key: 'cols' } as const, 0)
const language = atom({ plugin: 'thekra', key: 'language' } as const, 'ar')
const speed = atom({ plugin: 'thekra', key: 'speed' } as const, 20_000)
const auto = atom({ plugin: 'thekra', key: 'auto' } as const, 'work')
const surahs = atom({ plugin: 'thekra', key: 'surahs' } as const, [])

// The page's text width, as last drawn: the border and its padding take four cells.
let columns = 76
let waited = 0
let working = false
const cache = new Map<string, Verse>()

// Text from the network is drawn in a terminal: control characters (escape
// sequences among them) are dropped so the source can never drive it.
const clean = (text: string): string => String(text).replace(/\p{Cc}/gu, '')

// Anything but a whole answer is no ayah: show nothing rather than a guess.
export const parseVerse = (body: string): Verse | null => {
  const payload = JSON.parse(body) as { code?: number; data?: Verse }
  const a = payload.data
  if (payload.code !== 200 || !a?.text) return null
  const surah = { ...a.surah, name: clean(a.surah.name), englishName: clean(a.surah.englishName) }
  return { number: a.number, text: clean(a.text), numberInSurah: a.numberInSurah, surah }
}

// Diacritics and other combining marks take no cell of their own.
const width = (text: string): number => text.replace(/\p{M}/gu, '').length

// A terminal lays a line that starts or ends with an ayah number out left to
// right. So a number is glued with no-break spaces to the word before it and,
// once the next ayah comes, to that ayah's first word, and never meets an edge.
// (Direction marks would fix it too, but a terminal applies them to the whole
// row and moves the page's border.)
const GLUE = '\u00a0'

// The ayah's words, its number glued to the last of them.
export const words = (verse: Verse): string[] => {
  const all = verse.text.split(/\s+/).filter(Boolean)
  const number = `(${verse.numberInSurah})`
  return all.length === 0 ? [number] : [...all.slice(0, -1), `${all[all.length - 1]}${GLUE}${number}`]
}

const refOf = (v: Verse): Ref => ({
  number: v.number,
  numberInSurah: v.numberInSurah,
  name: v.surah.name,
  englishName: v.surah.englishName,
})

// Lays the ayah's words after the page's last word. Earlier lines never
// change; only the last one does, and the page never shows it (`grow` keeps
// one line past the window), so no word on screen moves.
export const append = (page: readonly Line[], verse: Verse, cols: number): Line[] => {
  const out = page.map(l => ({ text: l.text, refs: [...l.refs] }))
  const ref = refOf(verse)
  const ws = words(verse)

  // The last line ends with the previous ayah's number: take that word back
  // and glue it to this ayah's first word.
  const tail = out[out.length - 1]
  let carried: Ref[] = []
  if (tail !== undefined && tail.text.endsWith(')')) {
    carried = tail.refs.slice(-1)
    const cut = tail.text.lastIndexOf(' ')
    ws[0] = `${tail.text.slice(cut + 1)}${GLUE}${ws[0]}`
    tail.text = cut < 0 ? '' : tail.text.slice(0, cut)
    if (tail.text === '') out.pop()
  }

  ws.forEach((word, i) => {
    const last = out[out.length - 1]
    if (last !== undefined && width(`${last.text} ${word}`) <= cols) {
      last.text = `${last.text} ${word}`
      if (last.refs[last.refs.length - 1]?.number !== ref.number) last.refs.push(ref)
    } else {
      out.push({ text: word, refs: i === 0 ? [...carried, ref] : [ref] })
    }
  })
  return out
}

// The surah of the newest line, and the range of its ayat on the page.
export const reference = (shown: readonly Line[], lang: Language = 'ar'): string => {
  const refs = shown.flatMap(l => l.refs)
  const last = refs[refs.length - 1]
  return `${lang === 'en' ? last.englishName : last.name} ${range(shown)}`
}

// The ayat of the newest surah on the page, as `from-to`.
export const range = (shown: readonly Line[]): string => {
  const refs = shown.flatMap(l => l.refs)
  const last = refs[refs.length - 1]
  const from = refs.filter(r => r.name === last.name)[0].numberInSurah
  return from === last.numberInSurah ? `${from}` : `${from}-${last.numberInSurah}`
}

// The surah list answer, cleaned like every text from the network.
export const parseSurahList = (body: string): Surah[] => {
  const payload = JSON.parse(body) as { code?: number; data?: Surah[] }
  if (payload.code !== 200 || !Array.isArray(payload.data)) return []
  return payload.data.map(s => ({
    number: s.number,
    name: clean(s.name),
    englishName: clean(s.englishName),
    numberOfAyahs: s.numberOfAyahs,
  }))
}

// A surah's first ayah by its number across the mushaf.
export const firstAyahOf = (list: readonly Surah[], surah: number): number =>
  1 + list.filter(s => s.number < surah).reduce((n, s) => n + s.numberOfAyahs, 0)

export const surahOptions = (list: readonly Surah[], lang: Language) =>
  list.map(s => ({ value: String(s.number), label: `${s.number} ${lang === 'en' ? s.englishName : s.name}` }))

export const nextSpeed = (ms: number): number => SPEEDS[(SPEEDS.indexOf(ms) + 1) % SPEEDS.length]

export const nextAuto = (mode: AutoScroll): AutoScroll => AUTOS[(AUTOS.indexOf(mode) + 1) % AUTOS.length]

export const scrolls = (mode: AutoScroll, isWorking: boolean): boolean =>
  mode === 'on' || (mode === 'work' && isWorking)

// The `align` option (the config menu's picker) as a flex alignment; right by default.
export const alignment = (align: unknown): 'flex-end' | 'center' | 'flex-start' =>
  align === 'left' ? 'flex-start' : align === 'center' ? 'center' : 'flex-end'

type SurahAnswer = {
  code?: number
  data?: Verse['surah'] & { ayahs?: { number: number; text: string; numberInSurah: number }[] }
}

// Every ayah of a surah, from one answer; anything partial adds nothing.
export const parseSurah = (body: string): Verse[] => {
  const payload = JSON.parse(body) as SurahAnswer
  const s = payload.data
  if (payload.code !== 200 || !s?.ayahs || s.ayahs.length !== s.numberOfAyahs) return []
  const surah = { number: s.number, name: clean(s.name), englishName: clean(s.englishName), numberOfAyahs: s.numberOfAyahs }
  return s.ayahs.map(a => ({ number: a.number, text: clean(a.text), numberInSurah: a.numberInSurah, surah }))
}

// Which surah holds ayah `n`, from a neighbour already fetched.
export const surahNear = (n: number, before?: Verse, after?: Verse): number | undefined => {
  if (n === 1) return 1
  if (n === AYAT) return 114
  if (before) return before.numberInSurah === before.surah.numberOfAyahs ? before.surah.number + 1 : before.surah.number
  if (after) return after.numberInSurah === 1 ? after.surah.number - 1 : after.surah.number
  return undefined
}

async function fetchVerse($: EngineInterface, number: number): Promise<Verse | null> {
  const n = ((number - 1 + AYAT) % AYAT) + 1
  const edition = EDITIONS[await read($, language)]
  const known = cache.get(`${edition}:${n}`)
  if (known) return known

  let surah = surahNear(n, cache.get(`${edition}:${n - 1}`), cache.get(`${edition}:${n + 1}`))
  if (surah === undefined) {
    // A jump with no neighbour: one ayah tells its surah.
    const res = await $.http.fetch(AYAH_API.replace('{n}', String(n)).replace('{edition}', edition))
    surah = res.ok ? parseVerse(res.text)?.surah.number : undefined
    if (surah === undefined) return null
  }
  const res = await $.http.fetch(SURAH_API.replace('{n}', String(surah)).replace('{edition}', edition))
  for (const verse of res.ok ? parseSurah(res.text) : []) cache.set(`${edition}:${verse.number}`, verse)
  return cache.get(`${edition}:${n}`) ?? null
}

// Appends ayat until the page has `need` lines and one more, so every line on
// the page is complete before it shows.
async function grow($: EngineInterface, page: Line[], need: number): Promise<Line[]> {
  let out = page
  while (out.length <= need) {
    const lastRefs = out[out.length - 1]?.refs
    const after = lastRefs?.[lastRefs.length - 1]?.number
    if (after === undefined) return out
    const verse = await fetchVerse($, after + 1)
    if (verse === null) return out
    out = append(out, verse, columns)
  }
  return out
}

// A fresh page from ayah `number`: on start, a language switch or a resize.
async function rebuild($: EngineInterface, number: number): Promise<void> {
  const first = await fetchVerse($, number)
  if (first === null) return
  const page = await grow($, append([], first, columns), WINDOW)
  await update($, lines, () => page)
  await update($, top, () => 0)
  await update($, cols, () => columns)
}

async function loadSurahs($: EngineInterface): Promise<void> {
  try {
    if ((await read($, surahs)).length > 0) return
    const res = await $.http.fetch(SURAH_LIST_API)
    const list = res.ok ? parseSurahList(res.text) : []
    if (list.length === 114) await update($, surahs, () => list)
  } catch {
    // Offline: the picker waits for the next session.
  }
}

// Jumps the page to the start of a surah picked in the list.
async function pick($: EngineInterface, value: string): Promise<void> {
  try {
    const list = await read($, surahs)
    if (list.length === 0) return
    await rebuild($, firstAyahOf(list, Number(value)))
  } catch {
    // Offline: keep what is shown.
  }
}

async function start($: EngineInterface): Promise<void> {
  try {
    await rebuild($, 1 + Math.floor(Math.random() * AYAT))
  } catch {
    // Offline: try again at the next turn.
  }
}

// Moves the page one line. Going back past the kept lines lays the earlier
// ayah out on lines of its own above, so the lines below do not move.
// ponytail: a timer step and a button press at the same moment can both apply; last write wins
async function step($: EngineInterface, dir: 1 | -1): Promise<void> {
  try {
    let page = await read($, lines)
    let first = (await read($, top)) + dir
    if (page.length === 0) return start($)
    if ((await read($, cols)) !== columns) {
      return rebuild($, page[Math.min(first, page.length - 1)].refs[0].number)
    }

    if (first < 0) {
      const verse = await fetchVerse($, page[0].refs[0].number - 1)
      if (verse === null) return
      const above = append([], verse, columns)
      page = [...above, ...page]
      first += above.length
    }
    page = await grow($, page, first + WINDOW)
    const drop = Math.max(0, first - KEEP_ABOVE)
    page = page.slice(drop)
    first -= drop

    await update($, lines, () => page)
    await update($, top, () => first)
  } catch {
    // Offline or the source is down: keep what is shown.
  }
}

// Shows the page in the other language, from the ayah at its top.
async function toggle($: EngineInterface): Promise<void> {
  try {
    const page = await read($, lines)
    const at = page[Math.min(await read($, top), page.length - 1)]?.refs[0]?.number
    await update($, language, lang => (lang === 'ar' ? 'en' : 'ar'))
    if (at === undefined) return start($)
    await rebuild($, at)
  } catch {
    // Offline: keep what is shown.
  }
}

async function cycleSpeed($: EngineInterface): Promise<void> {
  waited = 0
  await update($, speed, nextSpeed)
}

async function cycleAuto($: EngineInterface): Promise<void> {
  waited = 0
  await update($, auto, nextAuto)
}

async function tick($: EngineInterface): Promise<void> {
  if (!scrolls(await read($, auto), working)) return
  waited += 1000
  if (waited < (await read($, speed))) return
  waited = 0
  await step($, 1)
}

export const register: Register = (on, options) => {
  const alignItems = alignment(options.align)
  let ticker: { cancel: () => void } | undefined

  // One ticker for the session; each second `tick` decides whether to step.
  on('session.start', async ($, e, next) => {
    if ((await read($, lines)).length === 0) $.clock.after(0, () => start($))
    $.clock.after(0, () => loadSurahs($))
    ticker ??= $.clock.every(1000, () => tick($))

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    working = true
    if ((await read($, lines)).length === 0) $.clock.after(0, () => start($))
    ticker ??= $.clock.every(1000, () => tick($))

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) working = false

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const page = await read($, lines)
    if (e.props.hasSurvey || page.length === 0) {
      return below
    }

    columns = Math.max(20, e.props.bodyColumns - 4)
    const lang = await read($, language)
    const ms = await read($, speed)
    const mode = await read($, auto)
    const shown = page.slice(await read($, top)).slice(0, WINDOW)
    if (shown.length === 0) {
      return below
    }
    const list = await read($, surahs)
    const here = shown[shown.length - 1].refs.at(-1)
    const current = list.find(s => s.name === here?.name)
    const { Box, Button, Select, Text } = $.ui.resolve(e)

    // The oldest line fades and the newest line holding text is bold and
    // brighter: a terminal's Arabic font often has no bold face, and the
    // colour shows on any font. A short page keeps its height.
    // Arabic reads right to left, so there "next" sits on the left. The
    // buttons keep a Latin line of their own: a terminal lays an Arabic line
    // out right to left, so a click on it can land on the wrong button.
    const rows = Array.from({ length: WINDOW }, (_, i) => shown[i]?.text ?? ' ')
    const prev = <Button key="prev" label={lang === 'ar' ? 'prev >' : '< prev'} hotkey="p" onPress={() => step($, -1)} />
    const nxt = <Button key="next" label={lang === 'ar' ? '< next' : 'next >'} hotkey="n" onPress={() => step($, 1)} />

    return (
      <Box flexDirection="column">
        {below}
        <Box
          flexDirection="column"
          alignItems={lang === 'en' ? 'flex-start' : alignItems}
          borderStyle="round"
          borderColor="green"
          borderDimColor
          paddingX={1}
          width="100%"
        >
          {rows.map((text, i) => (
            <Text
              key={`l${i}`}
              color={i === shown.length - 1 ? 'greenBright' : 'green'}
              dimColor={i === 0 && shown.length > 1}
              bold={i === shown.length - 1}
            >
              {text}
            </Text>
          ))}
        </Box>
        <Box flexDirection="row" justifyContent={lang === 'en' ? 'flex-start' : alignItems}>
          {lang === 'ar' ? nxt : prev}
          <Text> </Text>
          {lang === 'ar' ? prev : nxt}
          <Text> </Text>
          <Button key="speed" label={`${ms / 1000}s`} hotkey="s" onPress={() => cycleSpeed($)} />
          <Text> </Text>
          <Button key="auto" label={AUTO_LABELS[mode]} hotkey="a" onPress={() => cycleAuto($)} />
          <Text> </Text>
          <Button key="lang" label={lang === 'ar' ? 'English' : 'العربية'} hotkey="t" onPress={() => toggle($)} />
          <Text>  </Text>
          {current ? (
            <Select
              key="surah"
              options={surahOptions(list, lang)}
              value={String(current.number)}
              onSelect={value => pick($, value)}
            />
          ) : (
            <Text dimColor>{reference(shown, lang)}</Text>
          )}
          {current ? <Text dimColor> {range(shown)}</Text> : null}
        </Box>
      </Box>
    )
  })
}
