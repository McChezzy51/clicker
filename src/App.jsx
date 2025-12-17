import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import Login from './Login.jsx'

function normalizeInitials(raw) {
  return (raw ?? '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function userSnapshot(u) {
  if (!u) return null
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
  }
}

function App() {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [isEditingInitials, setIsEditingInitials] = useState(false)
  const [initialsDraft, setInitialsDraft] = useState('')
  const [initialsError, setInitialsError] = useState('')
  const [isSavingInitials, setIsSavingInitials] = useState(false)

  const [remoteClicks, setRemoteClicks] = useState(0)
  const [pendingDelta, setPendingDelta] = useState(0)
  const [inFlightDelta, setInFlightDelta] = useState(0)
  const [scoreError, setScoreError] = useState('')

  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false)
  const [leaderboardRows, setLeaderboardRows] = useState([])
  const [leaderboardError, setLeaderboardError] = useState('')
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false)

  const isFlushingRef = useRef(false)
  const pendingDeltaRef = useRef(0)

  const displayedClicks = useMemo(() => {
    if (!authReady || !user) return 0
    return Math.max(0, remoteClicks + pendingDelta + inFlightDelta)
  }, [authReady, inFlightDelta, pendingDelta, remoteClicks, user])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(userSnapshot(u))
      setAuthReady(true)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    pendingDeltaRef.current = pendingDelta
  }, [pendingDelta])

  useEffect(() => {
    if (!authReady || !user?.uid) {
      setRemoteClicks(0)
      setPendingDelta(0)
      setInFlightDelta(0)
      setScoreError('')
      return
    }

    let unsubscribe = () => {}
    let cancelled = false

    async function ensureAndSubscribe() {
      setScoreError('')

      const ref = doc(db, 'users', user.uid)
      const nextInitials = normalizeInitials(user.displayName)

      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, {
            initials: nextInitials || null,
            clicks: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          if (!cancelled) setRemoteClicks(0)
        } else if (!cancelled) {
          const data = snap.data()
          setRemoteClicks(Number(data?.clicks ?? 0))

          // Keep initials in sync for leaderboard display.
          if (nextInitials && data?.initials !== nextInitials) {
            await setDoc(
              ref,
              { initials: nextInitials, updatedAt: serverTimestamp() },
              { merge: true },
            )
          }
        }
      } catch (err) {
        if (!cancelled) setScoreError(err?.message ?? 'Failed to load score')
      }

      if (cancelled) return

      unsubscribe = onSnapshot(
        ref,
        (docSnap) => {
          if (!docSnap.exists()) return
          if (docSnap.metadata.hasPendingWrites) return
          const data = docSnap.data()
          setRemoteClicks(Number(data?.clicks ?? 0))
          setInFlightDelta(0)
        },
        (err) => {
          setScoreError(err?.message ?? 'Failed to keep score updated')
        },
      )
    }

    ensureAndSubscribe()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [authReady, user?.displayName, user?.uid])

  const flushPendingClicks = useCallback(
    async (deltaOverride) => {
      const uid = user?.uid
      if (!uid) return

      const requested =
        typeof deltaOverride === 'number' ? deltaOverride : Number(pendingDeltaRef.current)
      const currentPending = Number(pendingDeltaRef.current)
      const delta = Math.min(currentPending, Number(requested))
      if (!Number.isFinite(delta) || delta <= 0) return

      if (isFlushingRef.current) return
      isFlushingRef.current = true

      const initials = normalizeInitials(user?.displayName)
      const ref = doc(db, 'users', uid)

      try {
        // Move pending clicks into "in flight" so the UI doesn't double-count when
        // Firestore emits latency-compensated snapshots for our own write.
        setPendingDelta((d) => Math.max(0, Number(d) - delta))
        setInFlightDelta((f) => Number(f) + delta)

        await setDoc(
          ref,
          {
            clicks: increment(delta),
            initials: initials || null,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch (err) {
        // Put clicks back into pending so the user can retry.
        setPendingDelta((d) => Number(d) + delta)
        setInFlightDelta((f) => Math.max(0, Number(f) - delta))
        setScoreError(err?.message ?? 'Failed to save clicks')
      } finally {
        isFlushingRef.current = false
      }
    },
    [user?.displayName, user?.uid],
  )

  useEffect(() => {
    if (!authReady || !user?.uid) return
    if (pendingDelta <= 0) return

    const delta = pendingDelta
    const timeout = window.setTimeout(() => {
      flushPendingClicks(delta)
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [authReady, flushPendingClicks, pendingDelta, user?.uid])

  useEffect(() => {
    if (!isLeaderboardOpen) return

    setIsLeaderboardLoading(true)
    setLeaderboardError('')

    const q = query(collection(db, 'users'), orderBy('clicks', 'desc'), limit(10))
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            initials: (data?.initials ?? '').toString(),
            clicks: Number(data?.clicks ?? 0),
          }
        })
        setLeaderboardRows(rows)
        setIsLeaderboardLoading(false)
      },
      (err) => {
        setLeaderboardError(err?.message ?? 'Failed to load leaderboard')
        setIsLeaderboardLoading(false)
      },
    )

    return unsubscribe
  }, [isLeaderboardOpen])

  async function onSignOut() {
    setSignOutError('')
    try {
      await flushPendingClicks()
      await signOut(auth)
      setIsEditingInitials(false)
      setInitialsDraft('')
      setInitialsError('')
    } catch (err) {
      setSignOutError(err?.message ?? 'Sign out failed')
    }
  }

  function onStartEditInitials() {
    setInitialsError('')
    setInitialsDraft(user?.displayName ?? '')
    setIsEditingInitials(true)
  }

  function onCancelEditInitials() {
    setInitialsError('')
    setIsEditingInitials(false)
  }

  async function onSaveInitials(e) {
    e.preventDefault()
    setInitialsError('')

    const nextInitials = normalizeInitials(initialsDraft)
    if (!nextInitials) {
      setInitialsError('Please enter initials (1–4 letters/numbers).')
      return
    }

    if (!auth.currentUser) {
      setInitialsError('You are signed out. Please sign in again.')
      return
    }

    setIsSavingInitials(true)
    try {
      await updateProfile(auth.currentUser, { displayName: nextInitials })
      setUser((prev) => (prev ? { ...prev, displayName: nextInitials } : prev))
      await setDoc(
        doc(db, 'users', auth.currentUser.uid),
        { initials: nextInitials, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setIsEditingInitials(false)
    } catch (err) {
      setInitialsError(err?.message ?? 'Failed to update initials')
    } finally {
      setIsSavingInitials(false)
    }
  }

  return (
    <main className="app">
      <div className="topLeft" aria-label="Leaderboard controls">
        <button
          type="button"
          className="topLeft__button"
          onClick={() => setIsLeaderboardOpen((v) => !v)}
          aria-expanded={isLeaderboardOpen}
          aria-controls="leaderboard-panel"
        >
          {isLeaderboardOpen ? 'Close leaderboard' : 'Leaderboard'}
        </button>

        {isLeaderboardOpen ? (
          <section
            id="leaderboard-panel"
            className="leaderboard"
            aria-label="Leaderboard"
          >
            <h2 className="leaderboard__title">Top players</h2>

            {isLeaderboardLoading ? (
              <p className="leaderboard__status">Loading...</p>
            ) : leaderboardError ? (
              <p className="leaderboard__error" role="alert">
                {leaderboardError}
              </p>
            ) : leaderboardRows.length ? (
              <ol className="leaderboard__list">
                {leaderboardRows.map((row, idx) => (
                  <li key={row.id} className="leaderboard__row">
                    <span className="leaderboard__rank">{idx + 1}.</span>
                    <span className="leaderboard__initials">
                      {row.initials || '—'}
                    </span>
                    <span className="leaderboard__clicks">{row.clicks}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="leaderboard__status">No scores yet.</p>
            )}
          </section>
        ) : null}
      </div>

      {authReady && user ? (
        <div className="topCorner" aria-label="Profile controls">
          {isEditingInitials ? (
            <form className="topCorner__form" onSubmit={onSaveInitials}>
              <label className="topCorner__label">
                Initials
                <input
                  className="topCorner__input"
                  type="text"
                  value={initialsDraft}
                  onChange={(e) => setInitialsDraft(e.target.value)}
                  maxLength={10}
                  autoFocus
                />
              </label>

              {initialsError ? (
                <p className="topCorner__error" role="alert">
                  {initialsError}
                </p>
              ) : null}

              <div className="topCorner__row">
                <button type="submit" disabled={isSavingInitials}>
                  {isSavingInitials ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={onCancelEditInitials}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="topCorner__button"
              onClick={onStartEditInitials}
              aria-label="Change your initials"
            >
              Change initials {user.displayName ? `(${user.displayName})` : ''}
            </button>
          )}
        </div>
      ) : null}

      <section className="clicker" aria-label="Clicker game">
        <h1>Clicker</h1>
        <p className="clicker__count">
          Clicks: {displayedClicks}{' '}
          {authReady && user && pendingDelta + inFlightDelta > 0 ? (
            <span className="clicker__saving" aria-label="Saving">
              (saving...)
            </span>
          ) : null}
        </p>
        {scoreError && authReady && user ? (
          <p className="clicker__error" role="alert">
            {scoreError}
          </p>
        ) : null}
        <button
          className="clicker__button"
          type="button"
          onClick={() => setPendingDelta((d) => Number(d) + 1)}
          disabled={!authReady || !user}
          aria-label="Click to increase your click count"
        >
          {authReady && user ? 'Click me' : 'Sign in to play'}
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
          <Login
            onProfileUpdated={() => {
              setUser(userSnapshot(auth.currentUser))
            }}
          />
        )}
      </section>
    </main>
  )
}

export default App
