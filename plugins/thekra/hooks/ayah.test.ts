import { expect, test } from 'claude-code/testing'

import { alignment, append, firstAyahOf, nextAuto, parseSurahList, range, surahOptions, nextSpeed, parseSurah, parseVerse, reference, scrolls, surahNear, words } from './index'

const verse = (text: string, numberInSurah: number) => ({
  number: numberInSurah,
  text,
  numberInSurah,
  surah: { number: 1, name: 'سُورَةُ الفَاتِحَةِ', englishName: 'Al-Faatiha', numberOfAyahs: 7 },
})

test('a whole Uthmani answer is a verse, anything else none', () => {
  const ok = verse('نَصّ', 2)
  expect(parseVerse(JSON.stringify({ code: 200, data: ok }))).toEqual(ok)
  expect(parseVerse(JSON.stringify({ code: 404, data: 'Not found' }))).toBeNull()
  expect(parseVerse(JSON.stringify({ code: 200, data: {} }))).toBeNull()
})

test('ayat run on as one text, each followed by its number', () => {
  const page = append(append([], verse('بِسْمِ ٱللَّهِ', 1), 40), verse('ٱلْحَمْدُ لِلَّهِ', 2), 40)
  expect(page.map(l => l.text)).toEqual(['بِسْمِ ٱللَّهِ\u00a0(1)\u00a0ٱلْحَمْدُ لِلَّهِ\u00a0(2)'])
  expect(page[0].refs.map(r => r.numberInSurah)).toEqual([1, 2])
})

test('appending changes only the last line: earlier lines stay as laid out', () => {
  const text = Array.from({ length: 7 }, () => 'كلمة').join(' ')
  let page = append([], verse(text, 1), 20)
  for (const n of [2, 3, 4]) {
    const before = page.map(l => l.text)
    page = append(page, verse(text, n), 20)
    before.slice(0, -1).forEach((line, i) => expect(page[i].text).toBe(line))
  }
})

test('no line but the last starts or ends with an ayah number', () => {
  let page = append([], verse('كلمة كلمة كلمة', 1), 16)
  for (const n of [2, 3, 4, 5, 6]) page = append(page, verse('كلمة كلمة كلمة', n), 16)
  for (const line of page.slice(0, -1)) {
    expect(line.text.startsWith('(')).toBe(false)
    expect(line.text.endsWith(')')).toBe(false)
  }
})

test('the source line names the surah and the ayat on the page', () => {
  const page = append(append([], verse('أ', 2), 40), verse('ب', 3), 40)
  expect(reference(page)).toBe('سُورَةُ الفَاتِحَةِ 2-3')
  expect(reference(page, 'en')).toBe('Al-Faatiha 2-3')
})

test('the speed button cycles 10, 20 and 30 seconds', () => {
  expect(nextSpeed(10_000)).toBe(20_000)
  expect(nextSpeed(20_000)).toBe(30_000)
  expect(nextSpeed(30_000)).toBe(10_000)
})

test('the auto button cycles working, on and off, and says when the band scrolls', () => {
  expect(nextAuto('work')).toBe('on')
  expect(nextAuto('on')).toBe('off')
  expect(nextAuto('off')).toBe('work')
  expect(scrolls('work', true)).toBe(true)
  expect(scrolls('work', false)).toBe(false)
  expect(scrolls('on', false)).toBe(true)
  expect(scrolls('off', true)).toBe(false)
})

test('the align option picks the side, right when unset', () => {
  expect(alignment('left')).toBe('flex-start')
  expect(alignment('center')).toBe('center')
  expect(alignment('right')).toBe('flex-end')
  expect(alignment(undefined)).toBe('flex-end')
})

test('a whole surah answer gives every ayah with its surah, a partial one none', () => {
  const data = {
    number: 1,
    name: 'سُورَةُ الفَاتِحَةِ',
    englishName: 'Al-Faatiha',
    numberOfAyahs: 2,
    ayahs: [
      { number: 1, text: 'أ', numberInSurah: 1 },
      { number: 2, text: 'ب', numberInSurah: 2 },
    ],
  }
  const all = parseSurah(JSON.stringify({ code: 200, data }))
  expect(all.map(v => [v.number, v.surah.englishName])).toEqual([
    [1, 'Al-Faatiha'],
    [2, 'Al-Faatiha'],
  ])
  expect(parseSurah(JSON.stringify({ code: 200, data: { ...data, ayahs: data.ayahs.slice(1) } }))).toEqual([])
})

test('the surah of an ayah comes from the ayah before or after it', () => {
  const end = { ...verse('أ', 7), number: 7 }
  const start = { ...verse('ب', 1), number: 8, surah: { ...end.surah, number: 2, numberOfAyahs: 286 } }
  expect(surahNear(8, end)).toBe(2)
  expect(surahNear(6, undefined, end)).toBe(1)
  expect(surahNear(7, undefined, start)).toBe(1)
  expect(surahNear(500)).toBeUndefined()
  expect(surahNear(6236)).toBe(114)
})

test('an ayah number is glued to its last word', () => {
  expect(words(verse('صِرَٰطٌ مُسْتَقِيمٌ', 41))).toEqual(['صِرَٰطٌ', 'مُسْتَقِيمٌ\u00a0(41)'])
})

test('control characters from the source never reach the terminal', () => {
  const evil = { ...verse('نَصّ\u001b]0;pwned\u0007\u001b[2J', 2), surah: { ...verse('', 2).surah, name: 'سورة\u001b[31m' } }
  const parsed = parseVerse(JSON.stringify({ code: 200, data: evil }))
  expect(parsed?.text).toBe('نَصّ]0;pwned[2J')
  expect(parsed?.surah.name).toBe('سورة[31m')
  const surah = parseSurah(
    JSON.stringify({
      code: 200,
      data: { number: 1, name: 'س\u009b', englishName: 'S\u001b', numberOfAyahs: 1, ayahs: [{ number: 1, text: 'أ\u001b[1A', numberInSurah: 1 }] },
    }),
  )
  expect(surah.map(v => [v.text, v.surah.name, v.surah.englishName])).toEqual([['أ[1A', 'س', 'S']])
})

const SURAHS = [
  { number: 1, name: 'سُورَةُ الفَاتِحَةِ', englishName: 'Al-Faatiha', numberOfAyahs: 7 },
  { number: 2, name: 'سُورَةُ البَقَرَةِ', englishName: 'Al-Baqara', numberOfAyahs: 286 },
  { number: 3, name: 'سُورَةُ آلِ عِمۡرَانَ', englishName: 'Aal-i-Imraan', numberOfAyahs: 200 },
]

test('the surah list answer gives every surah, cleaned; a short one none', () => {
  const data = [...SURAHS, { number: 4, name: 'س\u001b', englishName: 'N', numberOfAyahs: 176 }]
  expect(parseSurahList(JSON.stringify({ code: 200, data })).map(s => s.name)).toEqual([
    ...SURAHS.map(s => s.name),
    'س',
  ])
  expect(parseSurahList(JSON.stringify({ code: 500, data: [] }))).toEqual([])
})

test('picking a surah starts at its first ayah, counted across the mushaf', () => {
  expect(firstAyahOf(SURAHS, 1)).toBe(1)
  expect(firstAyahOf(SURAHS, 2)).toBe(8)
  expect(firstAyahOf(SURAHS, 3)).toBe(294)
})

test('the surah picker lists every surah in the page language', () => {
  expect(surahOptions(SURAHS, 'ar')[1]).toEqual({ value: '2', label: '2 سُورَةُ البَقَرَةِ' })
  expect(surahOptions(SURAHS, 'en')[2]).toEqual({ value: '3', label: '3 Aal-i-Imraan' })
})

test('the range names the ayat on the page in the newest surah', () => {
  const page = append(append([], verse('أ', 2), 40), verse('ب', 3), 40)
  expect(range(page)).toBe('2-3')
  expect(range(page.slice(0, 1))).toBe('2-3')
})
