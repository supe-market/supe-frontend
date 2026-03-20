import { FormEvent, useState } from 'react';
import { Alert, Button, Card, Input, Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useAuth } from './AuthContext';
import styles from './SignInPage.module.css';

export function SignInPage() {
  const location = useLocation();
  const { status, login, error } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
      <div className={styles.glow} />
      <Card bordered={false} className={styles.card}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Supe Market</p>
          <h1>Sign in</h1>
          <p>Use the existing auth-service credentials for supe access.</p>
        </div>

        {status === 'loading' ? (
          <div className={styles.loadingState}>
            <Spin />
          </div>
        ) : (
          <form onSubmit={onSubmit} className={styles.form}>
            {error ? <Alert type="error" message={error} showIcon /> : null}
            <label className={styles.field}>
              <span>Email or phone</span>
              <Input
                prefix={<MailOutlined />}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="name@example.com or phone"
                autoComplete="username"
              />
            </label>
            <label className={styles.field}>
              <span>Password</span>
              <Input.Password
                prefix={<LockOutlined />}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </label>
            <Button htmlType="submit" type="primary" loading={submitting} block size="large">
              Continue
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
