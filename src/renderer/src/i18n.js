export const translations = {
  en: {
    home: '🏠 Home',
    search: 'Search anime...',
    back: '← Back'
  },
  ar: {
    home: '🏠 الرئيسية',
    search: 'البحث عن الأنمي...',
    back: '→ رجوع'
  }
}

export class I18nManager {
  constructor(defaultLang = 'en') {
    this.currentLang = localStorage.getItem('nippon-lang') || defaultLang
    this.applyLanguage()
  }

  toggleLanguage() {
    this.currentLang = this.currentLang === 'en' ? 'ar' : 'en'
    localStorage.setItem('nippon-lang', this.currentLang)
    this.applyLanguage()
  }

  applyLanguage() {
    const t = translations[this.currentLang]

    // Set document direction and language for CSS styling
    document.documentElement.lang = this.currentLang
    document.documentElement.dir = 'ltr'

    // Update text content
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (t[key]) {
        el.textContent = t[key]
      }
    })

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder')
      if (t[key]) {
        el.placeholder = t[key]
      }
    })
  }
}
