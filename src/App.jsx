import ReactScheduler from './components/ReactScheduler'
import './App.css'

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📅 Timeline Scheduler</h1>
      </header>
      <main className="scheduler-container">
        <ReactScheduler />
      </main>
    </div>
  )
}

export default App
