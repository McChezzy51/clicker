import { useState } from 'react'
import './App.css'

function App() {
  const [clicks, setClicks] = useState(0)

  return (
    <main className="clicker">
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
    </main>
  )
}

export default App
