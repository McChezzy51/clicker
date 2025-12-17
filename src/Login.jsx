import { useMemo, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { auth } from './firebase'

function normalizeInitials(raw) {
  return (raw ?? '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

export default function Login({ onProfileUpdated }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [initials, setInitials] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const title = useMemo(
    () => (mode === 'signup' ? 'Create account' : 'Sign in'),
    [mode],
  )

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      if (mode === 'signup') {
        const nextInitials = normalizeInitials(initials)
        if (!nextInitials) {
          setError('Please enter your initials (1–4 letters/numbers).')
          return
        }
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        )
        await updateProfile(credential.user, { displayName: nextInitials })
        onProfileUpdated?.()
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(err?.message ?? 'Authentication failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth" aria-label="Login">
      <h2 className="auth__title">{title}</h2>

      <form className="auth__form" onSubmit={onSubmit}>
        {mode === 'signup' ? (
          <label className="auth__label">
            Initials
            <input
              className="auth__input"
              type="text"
              autoComplete="nickname"
              inputMode="text"
              value={initials}
              onChange={(e) => setInitials(e.target.value)}
              required
              maxLength={10}
            />
          </label>
        ) : null}

        <label className="auth__label">
          Email
          <input
            className="auth__input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="auth__label">
          Password
          <input
            className="auth__input"
            type="password"
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        {error ? (
          <p className="auth__error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Working...' : title}
        </button>
      </form>

      <p className="auth__switch">
        {mode === 'signup' ? (
          <>
            Already have an account?{' '}
            <button
              type="button"
              className="auth__link"
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{' '}
            <button
              type="button"
              className="auth__link"
              onClick={() => setMode('signup')}
            >
              Create an account
            </button>
          </>
        )}
      </p>
    </section>
  )
}


