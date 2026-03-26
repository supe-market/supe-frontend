import { FormEvent, useState } from 'react';
import { Alert, Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowRightOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import styles from './SignInPage.module.css';

export function SignInPage() {
  const location = useLocation();
  const { status, login, error } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const next = (location.state as { from?: string } | null)?.from || '/summary';

  if (status === 'authenticated') {
    return <Navigate to={next} replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSubmitting(true);
      await login(identifier, password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.heroPanel}>
        <div className={styles.heroGrid} />
        <div className={styles.heroGlowTop} />
        <div className={styles.heroGlowBottom} />
        <div className={styles.heroInner}>
          <div className={styles.brandLockup}>
            <div className={styles.brandMark} aria-hidden="true">
              <span className={styles.brandMarkAccent} />
              <svg viewBox="0 0 56 68" className={styles.brandShield}>
                <defs>
                  <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4b6bff" />
                    <stop offset="100%" stopColor="#2b46cf" />
                  </linearGradient>
                </defs>
                <path
                  d="M28 1C33.5 7.4 41.3 10.6 50.4 10.8V34C50.4 49.1 41.8 60.1 28 67C14.2 60.1 5.6 49.1 5.6 34V10.8C14.7 10.6 22.5 7.4 28 1Z"
                  fill="url(#shieldGradient)"
                />
                <path
                  d="M31.4 16.4C30.4 14.7 28.5 13.8 25.6 13.8C22.2 13.8 19.6 15.7 19.6 18.6C19.6 21.4 21.7 22.8 26.3 24.2C30.2 25.4 31.4 26.3 31.4 28.2C31.4 30.3 29.5 31.7 26.7 31.7C23.8 31.7 21.9 30.6 20.6 28.1L17.7 29.8C19.2 33.4 22.4 35.1 26.3 35.2V39.2H29.1V35.1C33.4 34.4 36 31.8 36 28.1C36 24.1 33.7 22.1 28.4 20.7C24.9 19.8 24.1 19.2 24.1 17.8C24.1 16.4 25.5 15.4 27.5 15.4C29.4 15.4 30.7 16.1 31.6 17.6L31.4 16.4Z"
                  fill="#ffffff"
                />
              </svg>
            </div>
            <div>
              <div className={styles.brandTitle}>Supe.Market</div>
              <div className={styles.brandSubtitle}>LEADERSHIP CONSOLE</div>
            </div>
          </div>

          <div className={styles.heroCopy}>
            <h1>
              <span>Your next crore is</span>
              <strong>already in your data.</strong>
            </h1>
            <p>It works overnight. You walk in knowing.</p>
            <div className={styles.heroAccentLine} aria-hidden="true" />
          </div>

          <div className={styles.signalCluster} aria-hidden="true">
            <span className={styles.signalLineOne} />
            <span className={styles.signalLineTwo} />
            <span className={styles.signalLineThree} />
            <span className={styles.signalNodeOne} />
            <span className={styles.signalNodeTwo} />
            <span className={styles.signalNodeThree} />
            <span className={styles.signalNodeFour} />
            <span className={styles.signalNodeFive} />
          </div>

          <p className={styles.heroFootnote}>Revenue expansion infrastructure for FMCG</p>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formPanelGlow} />
        <div className={styles.formColumn}>
          <div className={styles.card}>
            <div className={styles.header}>
              <h2>Welcome back</h2>
              <p>Sign in to your leadership console</p>
            </div>

            {status === 'loading' ? (
              <div className={styles.loadingState}>
                <Spin />
              </div>
            ) : (
              <form onSubmit={onSubmit} className={styles.form}>
                {error ? <Alert type="error" message={error} showIcon className={styles.error} /> : null}

                <label className={styles.field}>
                  <span>Email address</span>
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="nsm@supe.market"
                    autoComplete="username"
                    inputMode="email"
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.fieldLabelRow}>
                    <span>Password</span>
                    <span className={styles.forgotText}>Forgot?</span>
                  </span>
                  <div className={styles.passwordField}>
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={passwordVisible ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className={styles.visibilityToggle}
                      onClick={() => setPasswordVisible((current) => !current)}
                      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    >
                      {passwordVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={submitting}
                >
                  <span>{submitting ? 'Signing in...' : 'Sign in'}</span>
                  <ArrowRightOutlined />
                </button>
              </form>
            )}
          </div>

          <p className={styles.termsCopy}>By signing in, you agree to Supe.Market&apos;s Terms of Service.</p>
        </div>
      </section>
    </div>
  );
}
