import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { setKioskLocale } from '../i18n/index.js';
import { useCart } from './CartContext.jsx';

export function WelcomeScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { clearSession } = useCart();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  const startOrder = () => {
    // Starting an order clears any previous completed session.
    clearSession();
    navigate('/kiosk/menu');
  };

  return (
    <main className="welcome-screen">
      <div className="welcome-visual" aria-hidden="true">
        <img src="/images/kiosk-welcome-bakery-v1.webp" alt="" width="1600" height="900" />
      </div>
      <section className="welcome-content" aria-labelledby="welcome-title">
        <img
          src="/placeholders/logo.svg"
          alt={t('common.appName')}
          className="welcome-logo"
          width="340"
          height="212"
        />
        <h1 id="welcome-title">{t('welcome.title')}</h1>
        <p className="welcome-subtitle">{t('welcome.subtitle')}</p>

        <div className="language-selector" role="group" aria-label={t('welcome.selectLanguage')}>
          <span className="language-label">{t('welcome.selectLanguage')}</span>
          <button
            type="button"
            className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
            aria-pressed={locale === 'en'}
            onClick={() => setKioskLocale('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`lang-btn ${locale === 'fil' ? 'active' : ''}`}
            aria-pressed={locale === 'fil'}
            onClick={() => setKioskLocale('fil')}
          >
            Filipino
          </button>
        </div>

        <button type="button" className="btn btn-primary welcome-start" onClick={startOrder}>
          {locale === 'fil' ? t('welcome.startOrderFil') : t('welcome.startOrder')}
        </button>

        <div className="welcome-assurance">
          <p>{t('welcome.instructions')}</p>
          <p>{t('welcome.selfServiceHint')}</p>
        </div>
      </section>
    </main>
  );
}
