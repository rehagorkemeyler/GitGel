import { describe, expect, it, vi } from 'vitest'
import { lang, setLang, subscribeLang, t } from './i18n'

describe('setLang', () => {
  it('switches the strings in place and tells subscribers, without a reload', () => {
    const start = lang
    const other = start === 'tr' ? 'en' : 'tr'
    const before = t('contact')
    const listener = vi.fn()
    const unsubscribe = subscribeLang(listener)

    setLang(other)
    expect(lang).toBe(other)
    expect(t('contact')).not.toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setLang(start)
    expect(t('contact')).toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
