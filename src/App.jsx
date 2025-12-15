import { useEffect, useState } from 'react'
import './App.css'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import Login from './Login.jsx'

function App() {
  const [clicks, setClicks] = useState(0)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setAuthReady(true)
    })
    return unsubscribe
  }, [])

  async function onSignOut() {
    setSignOutError('')
    try {
      await signOut(auth)
    } catch (err) {
      setSignOutError(err?.message ?? 'Sign out failed')
    }
  }

  return (
    <main className="app">
      <section className="clicker" aria-label="Clicker game">
        <h1>Clicker</h1>
        <p className="clicker__count">Clicks: {clicks}</p>
        <button
          className="clicker__button"
          type="button"
          onClick={() => setClicks((c) => c + 1)}
          aria-label="Click to increase your click count"
        >
          Click me
        </button>
      </section>

      <section className="authPanel" aria-label="Account">
        <h2 className="authPanel__title">Account</h2>

        {!authReady ? (
          <p className="authPanel__status">Loading...</p>
        ) : user ? (
          <>
            <p className="authPanel__status">
              Signed in as <strong>{user.email ?? 'unknown'}</strong>
            </p>
            {signOutError ? (
              <p className="authPanel__error" role="alert">
                {signOutError}
              </p>
            ) : null}
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <Login />
        )}
      </section>
    </main>
  )
}

export default App
